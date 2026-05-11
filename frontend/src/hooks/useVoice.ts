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
const SILENCE_BEFORE_COMMIT_MS = 1400;

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
  const captureRef = useRef<string>('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommandRef = useRef(onCommand);
  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);

  const Ctor =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : undefined;

  const isSupported = !!Ctor;

  useEffect(() => {
    if (!isSupported) {
      setState('unsupported');
    }
  }, [isSupported]);

  const setS = (s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  };

  const commit = useCallback(() => {
    const text = captureRef.current.trim();
    captureRef.current = '';
    setTranscript('');
    if (text) onCommandRef.current(text);
    setS('watching');
  }, []);

  const scheduleCommit = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(commit, SILENCE_BEFORE_COMMIT_MS);
  }, [commit]);

  const buildRecognition = useCallback(() => {
    if (!Ctor) return null;
    const r = new Ctor();
    r.lang = language;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        const text = result[0]!.transcript;
        if (result.isFinal) {
          processChunk(text, true);
        } else {
          interim += text;
        }
      }
      if (interim) processChunk(interim, false);
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

    function processChunk(raw: string, isFinal: boolean) {
      const text = raw.trim();
      if (!text) return;
      setError(null);

      if (stateRef.current === 'watching') {
        if (WAKE_WORD_VARIANTS.test(text)) {
          const afterWake = text.replace(WAKE_WORD_VARIANTS, '').trim();
          captureRef.current = afterWake;
          setTranscript(afterWake);
          setS('capturing');
          if (isFinal || afterWake) scheduleCommit();
        }
        return;
      }

      if (stateRef.current === 'capturing') {
        captureRef.current = isFinal
          ? (captureRef.current + ' ' + text).trim()
          : text;
        setTranscript(captureRef.current);
        scheduleCommit();
      }
    }
  }, [Ctor, language, scheduleCommit]);

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
    captureRef.current = '';
    setTranscript('');
    try {
      recognitionRef.current?.stop();
    } catch { /* noop */ }
    setS('off');
  }, []);

  useEffect(() => {
    return () => {
      wantedRef.current = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try { recognitionRef.current?.abort(); } catch { /* noop */ }
    };
  }, []);

  return { state, transcript, isSupported, error, start, stop };
}
