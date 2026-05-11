import { useCallback, useEffect, useRef, useState } from 'react';

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

export type VoiceState = 'unsupported' | 'off' | 'watching' | 'capturing';

export type VoiceHookResult = {
  state: VoiceState;
  transcript: string;
  isSupported: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
};

const WAKE_WORD_VARIANTS = /\b(?:eco+|ech+o+|h[eé]ctor|ekko)\b/i;
const SILENCE_BEFORE_COMMIT_MS = 1500;

type Options = {
  language?: string;
  onCommand: (text: string) => void;
};

export function useVoice({ language = 'es-419', onCommand }: Options): VoiceHookResult {
  const [state, setState] = useState<VoiceState>('off');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wantedRef = useRef(false);
  const stateRef = useRef<VoiceState>('off');
  const isCapturingRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommandRef = useRef(onCommand);
  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);

  const Ctor =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : undefined;

  const isSupported = !!Ctor;

  useEffect(() => {
    if (!isSupported) setState('unsupported');
  }, [isSupported]);

  const setS = (s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  };

  const buildRecognition = useCallback((): SpeechRecognition | null => {
    if (!Ctor) return null;
    const r = new Ctor();
    r.lang = language;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    let lastCommittedText = '';

    const scheduleCommit = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        const text = lastCommittedText.trim();
        lastCommittedText = '';
        isCapturingRef.current = false;
        setTranscript('');
        setS('watching');
        // reiniciar reconocimiento para vaciar event.results
        try { r.stop(); } catch { /* race */ }
        if (text) onCommandRef.current(text);
      }, SILENCE_BEFORE_COMMIT_MS);
    };

    r.onresult = (event) => {
      // Reconstruimos el texto completo de la sesión actual desde event.results
      let full = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const alt = result[0];
        if (!alt) continue;
        full += alt.transcript;
      }
      full = full.trim();
      if (!full) return;
      setError(null);

      const hasWake = WAKE_WORD_VARIANTS.test(full);
      const afterWake = full.replace(WAKE_WORD_VARIANTS, '').trim();

      if (!isCapturingRef.current) {
        if (hasWake) {
          isCapturingRef.current = true;
          setS('capturing');
          lastCommittedText = afterWake;
          setTranscript(afterWake);
          scheduleCommit();
        }
        return;
      }

      // Capturando: texto = todo lo dicho menos el wake word (si aún aparece)
      const value = hasWake ? afterWake : full;
      lastCommittedText = value;
      setTranscript(value);
      scheduleCommit();
    };

    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Permiso de micrófono denegado');
        wantedRef.current = false;
        setS('off');
        return;
      }
      if (e.error === 'audio-capture') {
        setError('No se encontró micrófono');
        wantedRef.current = false;
        setS('off');
        return;
      }
      setError(e.error || 'Error de reconocimiento');
    };

    r.onend = () => {
      if (wantedRef.current) {
        try { r.start(); } catch { /* race con onstart */ }
      } else {
        setS('off');
      }
    };

    return r;
  }, [Ctor, language]);

  const start = useCallback(() => {
    if (!isSupported) return;
    setError(null);
    wantedRef.current = true;
    if (!recognitionRef.current) {
      recognitionRef.current = buildRecognition();
    }
    try {
      recognitionRef.current?.start();
      setS('watching');
    } catch {
      // already started — ignore
    }
  }, [buildRecognition, isSupported]);

  const stop = useCallback(() => {
    wantedRef.current = false;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    isCapturingRef.current = false;
    setTranscript('');
    try { recognitionRef.current?.abort(); } catch { /* noop */ }
    recognitionRef.current = null;
    setS('off');
  }, []);

  useEffect(() => {
    return () => {
      wantedRef.current = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try { recognitionRef.current?.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    };
  }, []);

  return { state, transcript, isSupported, error, start, stop };
}
