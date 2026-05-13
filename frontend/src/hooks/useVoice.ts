import { useCallback, useEffect, useRef, useState } from 'react';
import { translate, loadLang } from '@/lib/i18n';
import { stripWakePrefix } from '@/lib/meta-commands';

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
  /** Se llama con cada frase final del reconocedor. El consumidor decide si es comando meta o input a la burbuja. */
  onPhrase: (text: string) => void;
  /** Se llama cuando el interim detecta el wake prefix "Eco/Hey Eco/..." — feedback temprano antes del final. */
  onWakeDetected?: () => void;
};

const MIN_PHRASE_CHARS = 2;

export function useVoice({ language = 'es-419', onPhrase, onWakeDetected }: Options): VoiceHookResult {
  const [state, setState] = useState<VoiceState>('off');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wantedRef = useRef(false);
  const onPhraseRef = useRef(onPhrase);
  useEffect(() => { onPhraseRef.current = onPhrase; }, [onPhrase]);
  const onWakeDetectedRef = useRef(onWakeDetected);
  useEffect(() => { onWakeDetectedRef.current = onWakeDetected; }, [onWakeDetected]);
  // Para no disparar el wake repetido durante el mismo interim
  const wakeFiredRef = useRef(false);

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
      const trimmedInterim = interim.trim();
      setInterimText(trimmedInterim);

      // Feedback temprano: dispara una sola vez por ciclo cuando el interim arranca con el wake prefix.
      if (trimmedInterim && !wakeFiredRef.current) {
        if (stripWakePrefix(trimmedInterim).isMeta) {
          wakeFiredRef.current = true;
          try { onWakeDetectedRef.current?.(); } catch (e) { console.error('onWakeDetected error', e); }
        }
      }

      for (const phrase of finals) {
        try { onPhraseRef.current(phrase); } catch (e) { console.error('onPhrase error', e); }
      }

      if (finals.length > 0) {
        setInterimText('');
        wakeFiredRef.current = false;
      }
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

  // Loop principal: captura PCM continuo a 16kHz, junta windows de 4s,
  // encodea WAV y manda. AudioContext con destination conectado a un
  // ScriptProcessor → buffer Float32. Sí, ScriptProcessor está deprecated;
  // funciona en Electron Chromium y es 10x más simple que AudioWorklet
  // (que requiere un módulo separado servido por http).
  async function electronCaptureLoop(stream: MediaStream): Promise<void> {
    const targetRate = 16000;
    const windowSec = 4;
    const targetSamples = targetRate * windowSec;
    // Algunos navegadores (Electron Chromium) no soportan AudioContext con
    // sampleRate forzado; capturamos al rate nativo y resampleamos manual.
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const nativeRate = ctx.sampleRate;
    const source = ctx.createMediaStreamSource(stream);
    const bufSize = 4096;
    // ScriptProcessor: deprecated pero universal y suficiente.
    const proc = ctx.createScriptProcessor(bufSize, 1, 1);

    let acc: number[] = [];
    proc.onaudioprocess = (ev) => {
      const ch = ev.inputBuffer.getChannelData(0);
      // Resample on-the-fly nativeRate → 16kHz (decimación lineal simple).
      const ratio = nativeRate / targetRate;
      for (let i = 0; i < ch.length / ratio; i++) {
        const src = i * ratio;
        const lo = Math.floor(src);
        const hi = Math.min(ch.length - 1, lo + 1);
        const frac = src - lo;
        acc.push(ch[lo]! * (1 - frac) + ch[hi]! * frac);
      }

      while (acc.length >= targetSamples) {
        const chunk = new Float32Array(acc.slice(0, targetSamples));
        acc = acc.slice(targetSamples);
        const blob = encodeWav(chunk, targetRate);
        void sendChunkForTranscription(blob);
      }
    };

    source.connect(proc);
    // ScriptProcessor necesita estar conectado a destination para que dispare
    // onaudioprocess. Si lo mandamos a un GainNode con gain=0, lo silenciamos
    // (no se escucha la captura por las bocinas).
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    proc.connect(silentGain);
    silentGain.connect(ctx.destination);

    // Espera hasta que nos pidan parar.
    while (electronLoopRef.current && wantedRef.current) {
      await new Promise((r) => setTimeout(r, 250));
    }

    // Cleanup
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
