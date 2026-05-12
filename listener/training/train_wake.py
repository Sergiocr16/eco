"""
Entrena un modelo custom de wake word "Hey Eco" usando openwakeword.

Pipeline:
  1. Genera ~10.000 muestras positivas "Hey Eco" usando piper-tts con varias voces.
  2. Carga un conjunto de muestras negativas (audios random de ~1 hora,
     idealmente del dataset "common_voice" o cualquier audio sin la wake word).
  3. Aplica augmentation (noise + reverb + pitch shift) — manejado por openwakeword.
  4. Entrena un classifier MLP y exporta a ONNX.

Salida:
  listener/models/hey_eco.onnx

Después, configura el listener con:
  ECO_WAKE_MODEL=hey_eco python main.py

Uso:
  cd listener
  source .venv/bin/activate
  pip install -r training/requirements-train.txt
  python training/train_wake.py --negatives-dir ~/audio-noise/ -v

El dataset de negatives debe ser ~30-60 min de audio WAV/MP3 sin "Hey Eco".
Sugerido: descargar muestras random de https://commonvoice.mozilla.org/es/datasets
o usar audio de podcasts / TV / música.

Si querés saltarte ese paso, --skip-augmentation usa solo el dataset de
voces sintéticas; precisión menor pero suficiente para pruebas.

Tiempo estimado:
  * Generación TTS:        5-10 min en Mac M-series
  * Augmentation:          2-5 min
  * Training:              10-20 min
  Total:                   ~20-35 min la primera vez.
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

LOG = logging.getLogger("train-wake")

WAKE_PHRASES = [
    # Variantes que queremos que el modelo aprenda como positivas.
    # Más variantes = mejor robustez a acentos / velocidades / tonos.
    "Hey Eco", "Hey, Eco", "hey eco", "HEY ECO",
    "Oye Eco", "Oye, Eco",
    "Eco", "ECO", "Eco,",
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Entrena wake word 'Hey Eco' con openwakeword.")
    p.add_argument("--samples-per-phrase", type=int, default=1200,
                   help="Muestras TTS por variante de frase (default 1200 → ~10k total).")
    p.add_argument("--negatives-dir", type=str, default=None,
                   help="Directorio con audios negativos (WAV/MP3, ~30-60 min total).")
    p.add_argument("--output-model", type=str,
                   default=str(Path(__file__).parent.parent / "models" / "hey_eco.onnx"))
    p.add_argument("--workdir", type=str, default=None,
                   help="Directorio temporal para artefactos. Default: tmp del sistema.")
    p.add_argument("--skip-augmentation", action="store_true",
                   help="Saltea data augmentation (más rápido, menos robusto).")
    p.add_argument("--verbose", "-v", action="store_true")
    return p.parse_args()


def ensure_deps() -> None:
    """Verifica que las deps de training estén instaladas."""
    missing: list[str] = []
    for mod in ("piper", "openwakeword", "torch", "numpy", "scipy"):
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)
    if missing:
        LOG.error("Faltan dependencias de training: %s", ", ".join(missing))
        LOG.error("Instalá con: pip install -r training/requirements-train.txt")
        sys.exit(2)


def generate_positives(workdir: Path, samples_per_phrase: int) -> Path:
    """Usa piper-tts para generar muestras de cada variante."""
    from openwakeword.utils import generate_positive_samples_via_piper  # type: ignore[import-untyped]

    out = workdir / "positives"
    out.mkdir(parents=True, exist_ok=True)
    LOG.info("Generando %d muestras × %d frases con piper TTS…",
             samples_per_phrase, len(WAKE_PHRASES))

    # piper voices para español + algunas en inglés (acentos diversos)
    voice_ids = [
        "es_ES-mls_10246-low", "es_ES-davefx-medium",
        "es_MX-claude-high", "es_AR-daniela-high",
        "en_US-amy-medium", "en_US-libritts-high",
    ]

    generate_positive_samples_via_piper(
        phrases=WAKE_PHRASES,
        n_samples_per_phrase=samples_per_phrase,
        voices=voice_ids,
        output_dir=str(out),
        sample_rate=16000,
    )
    LOG.info("Positivas generadas en %s", out)
    return out


def prepare_negatives(workdir: Path, src_dir: str | None) -> Path:
    """Convierte negativos a WAV 16k mono."""
    out = workdir / "negatives"
    out.mkdir(parents=True, exist_ok=True)
    if not src_dir:
        LOG.warning("Sin --negatives-dir. Saltando negativos custom; openwakeword "
                    "usará su pool por defecto.")
        return out

    src = Path(src_dir).expanduser()
    if not src.is_dir():
        LOG.error("Directorio de negativos no existe: %s", src)
        sys.exit(2)

    LOG.info("Procesando audio negativo desde %s …", src)
    n = 0
    for audio in src.rglob("*"):
        if audio.suffix.lower() not in {".wav", ".mp3", ".m4a", ".flac", ".ogg"}:
            continue
        target = out / f"neg_{n:05d}.wav"
        try:
            subprocess.run([
                "ffmpeg", "-y", "-loglevel", "error",
                "-i", str(audio),
                "-ar", "16000", "-ac", "1",
                str(target),
            ], check=True)
            n += 1
        except subprocess.CalledProcessError:
            LOG.debug("Skipping %s", audio)
    LOG.info("%d negativos convertidos.", n)
    return out


def train(workdir: Path, positives: Path, negatives: Path,
          output_path: Path, skip_augmentation: bool) -> None:
    """Entrena el modelo con openwakeword."""
    from openwakeword.train import train_model  # type: ignore[import-untyped]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    LOG.info("Iniciando training (esto tarda 10-20 min)…")
    train_model(
        positive_clips_dir=str(positives),
        negative_clips_dir=str(negatives) if negatives.iterdir() else None,
        output_path=str(output_path),
        augmentation_enabled=not skip_augmentation,
        target_phrase="hey eco",
        epochs=40,
        batch_size=128,
    )
    LOG.info("Modelo guardado en %s", output_path)


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s · %(message)s",
        datefmt="%H:%M:%S",
    )

    ensure_deps()

    workdir = Path(args.workdir) if args.workdir else Path(tempfile.mkdtemp(prefix="eco-train-"))
    LOG.info("Workdir: %s", workdir)

    try:
        positives = generate_positives(workdir, args.samples_per_phrase)
        negatives = prepare_negatives(workdir, args.negatives_dir)
        train(workdir, positives, negatives, Path(args.output_model), args.skip_augmentation)
        LOG.info("✅ Listo. Configurá el listener con:")
        LOG.info("    ECO_WAKE_MODEL=hey_eco python main.py")
    finally:
        if not args.workdir:
            LOG.info("Limpiando workdir temporal…")
            shutil.rmtree(workdir, ignore_errors=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
