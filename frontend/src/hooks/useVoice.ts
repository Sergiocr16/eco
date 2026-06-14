import { useCallback, useEffect, useRef, useState } from 'react';
import { translate, loadLang } from '@/lib/i18n';

declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
  interface SpeechRecognitionEventMap {
    audioend: Event;
    audiostart: Event;
    end: Event;
    error: SpeechRecognitionErrorEvent;
    nomatch: SpeechRecognitionEvent;
    result: SpeechRecognitionEvent;
    soundend: Event;
    soundstart: Event;
    speechend: Event;
    speechstart: Event;
    start: Event;
  }
  interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
    onend: ((this: SpeechRecognition, ev: Event) => void) | null;
    onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }
  const SpeechRecognition: { new (): SpeechRecognition };
  interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }
  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }
  interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
  }
  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }
  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
  }
}

export type VoiceState = 'unsupported' | 'off' | 'listening';

export type VoiceHookResult = {
  state: VoiceState;
  interimText: string;
  isSupported: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
};

type Options = {
  language?: string;
  /** Se llama con cada frase final del reconocedor (dictado a la terminal). */
  onPhrase: (text: string) => void;
  /** Modo dictado: tolera pausas más largas y frases más largas para no cortar a mitad de oración. */
  isLongForm?: () => boolean;
};

const MIN_PHRASE_CHARS = 2;

export function useVoice({ language = 'es-419', onPhrase, isLongForm }: Options): VoiceHookResult {
  const [state, setState] = useState<VoiceState>('off');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wantedRef = useRef(false);
  const onPhraseRef = useRef(onPhrase);
  useEffect(() => { onPhraseRef.current = onPhrase; }, [onPhrase]);
  const isLongFormRef = useRef(isLongForm);
  useEffect(() => { isLongFormRef.current = isLongForm; }, [isLongForm]);

  // En Electron empaquetado, Web Speech API no funciona (sin API key de
  // Google Speech). Usamos un pipeline propio: MediaRecorder captura chunks
  // de 4s, POST a /voice/transcribe-blob, el backend invoca el CLI Swift
  // `eco-stt` que usa Apple Speech framework on-device.
  //
  // En web puro (dev en navegador), usamos Web Speech API estándar.
  const isElectron =
    typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
    || (typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined');
  const Ctor =
    !isElectron && typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : undefined;

  // En Electron, el "soporte" depende de que el browser tenga getUserMedia
  // (siempre lo tiene en Chromium). El backend valida que el CLI Swift exista.
  const hasGetUserMedia =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const isSupported = isElectron ? hasGetUserMedia : !!Ctor;

  useEffect(() => {
    if (!isSupported) setState('unsupported');
  }, [isSupported]);

  const buildRecognition = useCallback((): SpeechRecognition | null => {
    if (!Ctor) return null;
    const r = new Ctor();
    r.lang = language;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      let interim = '';
      const finals: string[] = [];

      // Iteramos solo desde event.resultIndex (resultados nuevos)
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) {
          const t = alt.transcript.trim();
          if (t.length >= MIN_PHRASE_CHARS) finals.push(t);
        } else {
          interim += alt.transcript;
        }
      }

      setError(null);
      setInterimText(interim.trim());

      for (const phrase of finals) {
        try { onPhraseRef.current(phrase); } catch (e) { console.error('onPhrase error', e); }
      }

      if (finals.length > 0) setInterimText('');
    };

    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError(translate('voice.err.permission', loadLang()));
        wantedRef.current = false;
        setState('off');
        return;
      }
      if (e.error === 'audio-capture') {
        setError(translate('voice.err.no_mic', loadLang()));
        wantedRef.current = false;
        setState('off');
        return;
      }
      setError(e.error || translate('voice.err.recognition', loadLang()));
    };

    r.onend = () => {
      if (wantedRef.current) {
        try { r.start(); } catch { /* race */ }
      } else {
        setState('off');
      }
    };

    return r;
  }, [Ctor, language]);

  // ───────────────────────── Electron: WAV PCM + eco-stt ──────────────────
  // MediaRecorder en Chromium produce webm/opus, que AVFoundation NO sabe
  // decodificar. En su lugar capturamos PCM crudo vía Web Audio API y lo
  // encodeamos como WAV PCM16 mono 16kHz — formato perfecto para
  // SFSpeechRecognizer y trivial de generar en JS.
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const electronLoopRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  function encodeWav(samples: Float32Array, sampleRate: number): Blob {
    // Header WAV PCM16 mono. Tamaño total = 44 (header) + 2 * samples.length.
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);                 // PCM chunk size
    view.setUint16(20, 1, true);                  // PCM format
    view.setUint16(22, 1, true);                  // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);     // byte rate
    view.setUint16(32, 2, true);                  // block align
    view.setUint16(34, 16, true);                 // bits/sample
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    // Float32 [-1,1] → Int16
    let off = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]!));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function sendChunkForTranscription(blob: Blob): Promise<void> {
    if (!blob || blob.size < 4000) return; // muy corto = silencio
    try {
      const { apiFetch } = await import('@/lib/api');
      const localeShort = (language || 'es-MX').replace('_', '-');
      const apiLocale = /^[a-z]{2}(-[A-Z]{2})?$/.test(localeShort) ? localeShort : 'es-MX';
      const r = await apiFetch(`/voice/transcribe-blob?locale=${encodeURIComponent(apiLocale)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: blob,
      });
      const data = await r.json().catch(() => null) as { ok?: boolean; text?: string } | null;
      if (!data?.ok) return;
      const text = (data.text || '').trim();
      if (text.length < MIN_PHRASE_CHARS) return;
      try { onPhraseRef.current(text); } catch (e) { console.error('onPhrase error', e); }
    } catch { /* silently ignore — UI no se rompe por un chunk perdido */ }
  }

  // Loop principal: VAD adaptativo a 16kHz mono. En vez de chunks fijos de 4s
  // (que sumaban latencia + cortaban palabras en el borde), detectamos inicio
  // y fin de frase por energía RMS comparada con el ruido ambiental.
  //
  // Pipeline por frame (~50ms = 800 samples a 16kHz):
  //   1. Resampleo nativeRate → 16k (con media móvil 3-tap si nativeRate alto)
  //   2. RMS del frame
  //   3. En 'idle': mantenemos pre-roll de 300ms + EMA del noise floor.
  //      Si RMS > umbral (3x noise floor, mínimo 0.01) → 'recording' y
  //      prependemos el pre-roll.
  //   4. En 'recording': acumulamos. Si hay 700ms continuos de silencio o
  //      pasamos 8s → cerramos la frase, mandamos al backend, volvemos a idle.
  async function electronCaptureLoop(stream: MediaStream): Promise<void> {
    const TARGET_RATE = 16000;
    const FRAME_SAMPLES = 800;                    // 50ms a 16kHz
    const PRE_ROLL_SAMPLES = TARGET_RATE * 0.3;   // 300ms
    const MIN_RECORDING_SAMPLES = TARGET_RATE * 0.4; // descartar <400ms (ruido suelto)
    // Cierre de frase y tope de duración dependen del modo. En dictado
    // (long-form) toleramos pausas naturales (~1.1s) y oraciones largas (15s)
    // para no cortar a mitad. En wake-word mantenemos baja latencia (700ms / 8s).
    const SILENCE_FRAMES_DEFAULT = 14;            // 14 * 50ms = 700ms
    const SILENCE_FRAMES_LONG = 22;               // ~1.1s
    const MAX_SAMPLES_DEFAULT = TARGET_RATE * 8;  // 8s
    const MAX_SAMPLES_LONG = TARGET_RATE * 15;    // 15s
    const NOISE_FLOOR_INIT = 0.005;
    const ABSOLUTE_MIN_THRESHOLD = 0.01;
    const TRIGGER_MULT = 3;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const nativeRate = ctx.sampleRate;
    const source = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);

    // Estado del VAD. Usamos un wrapper object porque TS hace control-flow
    // narrowing de variables `let` y, como las mutaciones a `vad.state` viven
    // dentro de un callback del ScriptProcessor, perdería el narrowing al
    // leerlo después del while loop. Con un campo de objeto no narrowea.
    type VadState = 'idle' | 'recording';
    const vad: { state: VadState } = { state: 'idle' };
    let noiseFloor = NOISE_FLOOR_INIT;
    let preRoll: number[] = [];
    let recBuf: number[] = [];
    let silenceFrames = 0;
    let frameAcc: number[] = []; // samples ya resampleados pero <800

    // Resampleo: si nativeRate es muy alto (44.1k, 48k), un filtro 3-tap
    // simple antes de decimar reduce aliasing notable. Para nativeRate cercano
    // a 16k (raro pero posible) saltamos el filtro.
    const ratio = nativeRate / TARGET_RATE;
    const needsAntiAlias = ratio >= 2;

    function processFrame(frame: number[]) {
      // RMS del frame (energía).
      let sumSq = 0;
      for (let i = 0; i < frame.length; i++) {
        const s = frame[i]!;
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / frame.length);

      // Cuando estamos en idle, actualizamos el noise floor con EMA suave —
      // así el VAD se adapta a ambientes ruidosos (aire acondicionado, fan, etc.)
      // sin necesidad de calibración manual.
      if (vad.state === 'idle') {
        noiseFloor = noiseFloor * 0.95 + rms * 0.05;
      }
      const threshold = Math.max(ABSOLUTE_MIN_THRESHOLD, noiseFloor * TRIGGER_MULT);

      if (vad.state === 'idle') {
        // Pre-roll: mantenemos los últimos 300ms para no perder el ataque
        // de "Eco" cuando dispara el trigger.
        preRoll.push(...frame);
        if (preRoll.length > PRE_ROLL_SAMPLES) {
          preRoll = preRoll.slice(-PRE_ROLL_SAMPLES);
        }
        if (rms > threshold) {
          vad.state = 'recording';
          recBuf = preRoll.concat(frame);
          preRoll = [];
          silenceFrames = 0;
        }
        return;
      }

      // recording
      const longForm = (() => { try { return isLongFormRef.current?.() ?? false; } catch { return false; } })();
      const silenceEnd = longForm ? SILENCE_FRAMES_LONG : SILENCE_FRAMES_DEFAULT;
      const maxSamples = longForm ? MAX_SAMPLES_LONG : MAX_SAMPLES_DEFAULT;
      recBuf.push(...frame);
      if (rms < threshold) silenceFrames++;
      else silenceFrames = 0;

      const tooLong = recBuf.length >= maxSamples;
      const endOfPhrase = silenceFrames >= silenceEnd;

      if (endOfPhrase || tooLong) {
        // Cortamos el silencio final (no aporta al STT).
        const trimmed = endOfPhrase
          ? recBuf.slice(0, Math.max(MIN_RECORDING_SAMPLES, recBuf.length - silenceEnd * FRAME_SAMPLES))
          : recBuf;
        if (trimmed.length >= MIN_RECORDING_SAMPLES) {
          const chunk = new Float32Array(trimmed);
          const blob = encodeWav(chunk, TARGET_RATE);
          void sendChunkForTranscription(blob);
        }
        // Reset
        vad.state = 'idle';
        recBuf = [];
        silenceFrames = 0;
        preRoll = [];
      }
    }

    proc.onaudioprocess = (ev) => {
      const ch = ev.inputBuffer.getChannelData(0);

      // Resampleo nativeRate → 16k con anti-alias simple (media móvil 3-tap)
      // cuando hace falta. Eso suaviza altos antes de decimar.
      const outLen = Math.floor(ch.length / ratio);
      for (let i = 0; i < outLen; i++) {
        const src = i * ratio;
        const lo = Math.floor(src);
        const hi = Math.min(ch.length - 1, lo + 1);
        const frac = src - lo;
        let s = ch[lo]! * (1 - frac) + ch[hi]! * frac;
        if (needsAntiAlias) {
          // Promedio con vecinos para atenuar alias > 8kHz.
          const a = ch[Math.max(0, lo - 1)] ?? s;
          const b = ch[Math.min(ch.length - 1, lo + 1)] ?? s;
          s = (a + 2 * s + b) * 0.25;
        }
        frameAcc.push(s);
      }

      while (frameAcc.length >= FRAME_SAMPLES) {
        const frame = frameAcc.splice(0, FRAME_SAMPLES);
        processFrame(frame);
      }
    };

    source.connect(proc);
    // ScriptProcessor necesita destination para disparar onaudioprocess.
    // Lo mandamos a un GainNode con gain=0 (silencioso, no rebota por bocinas).
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    proc.connect(silentGain);
    silentGain.connect(ctx.destination);

    while (electronLoopRef.current && wantedRef.current) {
      await new Promise((r) => setTimeout(r, 250));
    }

    // Si quedó una grabación abierta al detener, mandala (mejor algo que perderlo).
    if (vad.state === 'recording' && recBuf.length >= MIN_RECORDING_SAMPLES) {
      try {
        const chunk = new Float32Array(recBuf);
        void sendChunkForTranscription(encodeWav(chunk, TARGET_RATE));
      } catch { /* noop */ }
    }

    try { proc.disconnect(); } catch { /* noop */ }
    try { source.disconnect(); } catch { /* noop */ }
    try { silentGain.disconnect(); } catch { /* noop */ }
    try { await ctx.close(); } catch { /* noop */ }
    audioCtxRef.current = null;
  }

  const start = useCallback(() => {
    if (!isSupported) return;
    setError(null);
    wantedRef.current = true;

    if (isElectron) {
      // Modo Electron: pedir mic + arrancar loop de captura PCM.
      if (electronLoopRef.current) return;
      electronLoopRef.current = true;
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          if (!wantedRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            electronLoopRef.current = false;
            return;
          }
          mediaStreamRef.current = stream;
          setState('listening');
          void electronCaptureLoop(stream);
        })
        .catch((e: unknown) => {
          const name = (e as { name?: string }).name ?? '';
          if (name === 'NotAllowedError' || name === 'SecurityError') {
            setError(translate('voice.err.permission', loadLang()));
          } else if (name === 'NotFoundError') {
            setError(translate('voice.err.no_mic', loadLang()));
          } else {
            setError(translate('voice.err.recognition', loadLang()));
          }
          electronLoopRef.current = false;
          wantedRef.current = false;
          setState('off');
        });
      return;
    }

    // Modo Web Speech (browser puro)
    if (!recognitionRef.current) {
      recognitionRef.current = buildRecognition();
    }
    try {
      recognitionRef.current?.start();
      setState('listening');
    } catch { /* already started */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildRecognition, isSupported, isElectron, language]);

  const stop = useCallback(() => {
    wantedRef.current = false;
    setInterimText('');
    // Electron path
    electronLoopRef.current = false;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { /* noop */ });
      audioCtxRef.current = null;
    }
    // Web Speech path
    try { recognitionRef.current?.abort(); } catch { /* noop */ }
    recognitionRef.current = null;
    setState('off');
  }, []);

  useEffect(() => {
    return () => {
      wantedRef.current = false;
      electronLoopRef.current = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      try { recognitionRef.current?.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    };
  }, []);

  return { state, interimText, isSupported, error, start, stop };
}
