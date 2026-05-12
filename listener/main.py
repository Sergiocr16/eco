"""
Eco listener — wake word + STT local 100%.

Flujo:
  1. Mic streaming a 16kHz mono → openwakeword detecta wake word.
  2. Al detectar, graba el siguiente fragmento hasta silencio (VAD).
  3. Transcribe con faster-whisper local en español.
  4. POST el texto al backend en /voice/transcribed.

No envía audio a ningún servicio externo. Solo el texto final viaja
al backend local (que ya corre detrás del token Bearer).

Configurable via env vars:
  ECO_BACKEND        — URL del backend Eco (default http://127.0.0.1:7000)
  ECO_TOKEN_FILE     — ruta al archivo del token (default ~/.eco/token)
  ECO_WAKE_MODEL     — nombre del wake word model (default hey_jarvis_v0.1)
  ECO_WAKE_THRESHOLD — score mínimo 0..1 para disparar (default 0.5)
  ECO_WHISPER_MODEL  — tamaño del modelo whisper (tiny|base|small|medium|large-v3, default medium)
  ECO_LANG           — idioma de transcripción (default es)
  ECO_MIC_DEVICE     — nombre/índice del mic (default: sistema)
  ECO_INITIAL_PROMPT — texto que sesga al transcriptor al vocabulario del producto.
                       Whisper usa este contexto para preferir palabras del dominio
                       (ej. "Eco", "burbuja", "workspace") sobre homófonos.
"""

from __future__ import annotations

import argparse
import logging
import os
import queue
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    import sounddevice as sd  # noqa: F401

import numpy as np
import requests
from openwakeword.model import Model as WakeWordModel
from faster_whisper import WhisperModel

try:
    import sounddevice as sd  # type: ignore[import-untyped]
except OSError as _audio_err:  # PortAudio no instalado
    sd = None  # type: ignore[assignment]
    _AUDIO_IMPORT_ERROR: Optional[str] = str(_audio_err)
else:
    _AUDIO_IMPORT_ERROR = None


# ─────────────────────────── config

SAMPLE_RATE = 16_000  # openwakeword y whisper usan 16 kHz
CHUNK_SAMPLES = 1280  # 80 ms a 16 kHz — chunk típico de openwakeword
PRE_BUFFER_SECONDS = 0.6  # audio anterior al wake para no perder inicio del comando
POST_SILENCE_SECONDS = 1.4  # silencio que cierra la grabación del comando
MAX_COMMAND_SECONDS = 12.0  # tope absoluto de un comando

DEFAULT_BACKEND = os.environ.get("ECO_BACKEND", "http://127.0.0.1:7000")
DEFAULT_TOKEN_FILE = os.environ.get("ECO_TOKEN_FILE", str(Path.home() / ".eco" / "token"))
DEFAULT_WAKE_MODEL = os.environ.get("ECO_WAKE_MODEL", "hey_jarvis_v0.1")
DEFAULT_WAKE_THRESHOLD = float(os.environ.get("ECO_WAKE_THRESHOLD", "0.5"))
DEFAULT_WHISPER_SIZE = os.environ.get("ECO_WHISPER_MODEL", "medium")
DEFAULT_LANG = os.environ.get("ECO_LANG", "es")
DEFAULT_MIC = os.environ.get("ECO_MIC_DEVICE")

# Sesgo léxico para mejorar transcripción del vocabulario del producto.
# Whisper usa este texto como contexto previo y se inclina a transcribir
# estas palabras correctamente (en lugar de homófonos).
DEFAULT_INITIAL_PROMPT = os.environ.get(
    "ECO_INITIAL_PROMPT",
    (
        "Eco, Hey Eco, dashboard, ajustes, burbuja, conversación, terminal, "
        "archivos, plan, scroll, abrir, cerrar, renombrar, anterior, siguiente, "
        "workspace, refactor, commit, branch, deploy, Aditum, AngularJS, "
        "Spring Boot, JHipster, MySQL, Liquibase, JWT, controlador, repositorio."
    ),
)

log = logging.getLogger("eco-listener")


# ─────────────────────────── audio capture

class AudioStream:
    """Captura audio mono 16kHz en un buffer thread-safe."""

    def __init__(self, sample_rate: int = SAMPLE_RATE, device: Optional[str] = None) -> None:
        if sd is None:
            raise RuntimeError(
                f"sounddevice no disponible: {_AUDIO_IMPORT_ERROR}. "
                "En Linux instalá libportaudio2 (sudo apt install libportaudio2). "
                "En macOS viene incluido."
            )
        self.sample_rate = sample_rate
        self.device = device
        self.queue: queue.Queue[np.ndarray] = queue.Queue(maxsize=200)
        self._stream = None  # type: ignore[assignment]

    def _callback(self, indata: np.ndarray, frames: int, time_info, status) -> None:
        if status:
            log.debug("sounddevice status: %s", status)
        # Mono int16
        mono = indata[:, 0] if indata.ndim > 1 else indata
        try:
            self.queue.put_nowait(mono.copy())
        except queue.Full:
            # Caída controlada si el consumidor se atrasa
            try:
                self.queue.get_nowait()
            except queue.Empty:
                pass
            self.queue.put_nowait(mono.copy())

    def start(self) -> None:
        device = self.device
        if device is not None and device.isdigit():
            device = int(device)
        self._stream = sd.InputStream(
            samplerate=self.sample_rate,
            blocksize=CHUNK_SAMPLES,
            channels=1,
            dtype="int16",
            device=device,
            callback=self._callback,
        )
        self._stream.start()
        log.info("Mic activo · %d Hz · device=%s", self.sample_rate, device or "default")

    def stop(self) -> None:
        if self._stream:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def read(self, timeout: float = 0.5) -> Optional[np.ndarray]:
        try:
            return self.queue.get(timeout=timeout)
        except queue.Empty:
            return None


# ─────────────────────────── token


def read_token(path: str) -> Optional[str]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            t = f.read().strip()
            return t or None
    except FileNotFoundError:
        log.warning("Token no encontrado en %s", path)
        return None
    except Exception as e:
        log.error("Error leyendo token: %s", e)
        return None


# ─────────────────────────── posting


def post_transcript(backend: str, token: str, text: str) -> bool:
    url = f"{backend.rstrip('/')}/voice/transcribed"
    try:
        r = requests.post(
            url,
            json={"text": text},
            headers={
                "Authorization": f"Bearer {token}",
                "X-Eco-Client": "1",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        if r.status_code >= 400:
            log.warning("Backend rechazó transcript (%s): %s", r.status_code, r.text[:200])
            return False
        return True
    except Exception as e:
        log.error("Falla POST a backend: %s", e)
        return False


# ─────────────────────────── wake → record → STT


class SpeechCapture:
    """Captura silencio-terminado luego de un wake-up, usando energía RMS."""

    def __init__(
        self,
        max_seconds: float = MAX_COMMAND_SECONDS,
        silence_seconds: float = POST_SILENCE_SECONDS,
    ) -> None:
        self.max_samples = int(max_seconds * SAMPLE_RATE)
        self.silence_samples = int(silence_seconds * SAMPLE_RATE)
        # Umbral adaptivo: arranca alto, se ajusta a base con primer fragmento
        self.silence_rms = 700  # int16 RMS

    def collect(self, audio: AudioStream, pre_buffer: deque[np.ndarray]) -> np.ndarray:
        # Empezamos con el pre-buffer (incluye el wake word)
        collected: list[np.ndarray] = list(pre_buffer)
        total = sum(len(c) for c in collected)
        silence_count = 0
        start = time.time()
        log.info("🎙️ Capturando comando…")

        while total < self.max_samples and (time.time() - start) < (self.max_samples / SAMPLE_RATE):
            chunk = audio.read(timeout=0.5)
            if chunk is None:
                continue
            collected.append(chunk)
            total += len(chunk)

            rms = int(np.sqrt(np.mean(chunk.astype(np.int32) ** 2)))
            if rms < self.silence_rms:
                silence_count += len(chunk)
                if silence_count >= self.silence_samples and total > int(0.4 * SAMPLE_RATE):
                    break
            else:
                silence_count = 0

        return np.concatenate(collected) if collected else np.array([], dtype=np.int16)


# ─────────────────────────── main loop


def run(args: argparse.Namespace) -> int:
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s · %(message)s",
        datefmt="%H:%M:%S",
    )

    # Token
    token = args.token or read_token(args.token_file)
    if not token:
        log.error("No hay token. Asegurate que el backend de Eco haya creado %s.", args.token_file)
        return 2

    log.info("Wake word: %s · threshold %.2f · whisper %s · idioma %s",
             args.wake_model, args.wake_threshold, args.whisper_model, args.lang)
    log.info("Backend: %s", args.backend)

    # Whisper
    log.info("Cargando whisper-%s (puede tardar al primer uso)…", args.whisper_model)
    whisper = WhisperModel(
        args.whisper_model,
        device="cpu",
        compute_type="int8",  # ARM64 friendly
    )
    log.info("Whisper listo")

    # Wake word
    wake = WakeWordModel(wakeword_models=[args.wake_model], inference_framework="onnx")
    label = next(iter(wake.models.keys()))
    log.info("Wake word model cargado: %s", label)

    # Audio
    audio = AudioStream(device=args.mic)
    audio.start()
    capture = SpeechCapture()

    pre_buffer_max = int((PRE_BUFFER_SECONDS * SAMPLE_RATE) / CHUNK_SAMPLES)
    pre_buffer: deque[np.ndarray] = deque(maxlen=pre_buffer_max)

    armed = True
    last_trigger = 0.0
    cooldown = 1.0

    try:
        while True:
            chunk = audio.read()
            if chunk is None:
                continue
            pre_buffer.append(chunk)

            # openwakeword espera float32 [-1,1] o int16; pasamos int16
            scores = wake.predict(chunk)
            score = scores.get(label, 0.0)

            now = time.time()
            if armed and score >= args.wake_threshold and (now - last_trigger) > cooldown:
                last_trigger = now
                log.info("🟢 Wake word detectado (score=%.2f)", score)

                # Captura el comando
                command = capture.collect(audio, pre_buffer)
                pre_buffer.clear()

                if len(command) < SAMPLE_RATE * 0.4:
                    log.info("Comando muy corto, ignorado.")
                    wake.reset()
                    continue

                # Transcribe
                audio_f32 = command.astype(np.float32) / 32768.0
                log.info("✂️  Transcribiendo %d ms…", int(len(command) / SAMPLE_RATE * 1000))
                segments, info = whisper.transcribe(
                    audio_f32,
                    language=args.lang,
                    beam_size=5,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=400),
                    initial_prompt=args.initial_prompt or None,
                    temperature=0.0,
                    condition_on_previous_text=False,
                )
                text = " ".join(s.text.strip() for s in segments).strip()
                if text:
                    log.info("📝 «%s»", text)
                    post_transcript(args.backend, token, text)
                else:
                    log.info("Sin texto detectado.")
                wake.reset()
    except KeyboardInterrupt:
        log.info("Detenido por el usuario.")
    finally:
        audio.stop()
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Eco listener — wake word + STT 100% local")
    p.add_argument("--backend", default=DEFAULT_BACKEND)
    p.add_argument("--token-file", default=DEFAULT_TOKEN_FILE)
    p.add_argument("--token", default=None, help="Pasa el token directamente (alternativa a --token-file)")
    p.add_argument("--wake-model", default=DEFAULT_WAKE_MODEL)
    p.add_argument("--wake-threshold", type=float, default=DEFAULT_WAKE_THRESHOLD)
    p.add_argument("--whisper-model", default=DEFAULT_WHISPER_SIZE,
                   help="tiny | base | small | medium | large-v3 (más grande = mejor calidad pero más lento)")
    p.add_argument("--lang", default=DEFAULT_LANG)
    p.add_argument("--mic", default=DEFAULT_MIC)
    p.add_argument("--initial-prompt", default=DEFAULT_INITIAL_PROMPT,
                   help="Texto de contexto que sesga al transcriptor hacia el vocabulario del producto. "
                        "Pasar cadena vacía para deshabilitar.")
    p.add_argument("--verbose", "-v", action="store_true")
    args = p.parse_args()
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
