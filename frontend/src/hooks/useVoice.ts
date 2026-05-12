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

  // Web Speech API en Electron empaquetado entra en un loop "start→end→start"
  // porque Chromium-Electron no incluye la API key de Google Speech. En ese
  // caso marcamos no-soportado y el usuario tiene que correr el listener
  // Python aparte (POST /voice/transcribed hace el broadcast vía WS).
  //
  // Múltiples checks para asegurarnos: UA, window.electronAPI (expuesto por
  // el preload), o un global setado por main.tsx. Cualquiera bastaba pero
  // así somos defensivos.
  const isElectron =
    typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
    || (typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined');
  const Ctor =
    !isElectron && typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : undefined;
  if (isElectron) {
    console.log('[useVoice] electron detected, mic disabled. UA:', typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a');
  }

  const isSupported = !!Ctor;

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

  const start = useCallback(() => {
    if (!isSupported) return;
    setError(null);
    wantedRef.current = true;
    if (!recognitionRef.current) {
      recognitionRef.current = buildRecognition();
    }
    try {
      recognitionRef.current?.start();
      setState('listening');
    } catch { /* already started */ }
  }, [buildRecognition, isSupported]);

  const stop = useCallback(() => {
    wantedRef.current = false;
    setInterimText('');
    try { recognitionRef.current?.abort(); } catch { /* noop */ }
    recognitionRef.current = null;
    setState('off');
  }, []);

  useEffect(() => {
    return () => {
      wantedRef.current = false;
      try { recognitionRef.current?.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    };
  }, []);

  return { state, interimText, isSupported, error, start, stop };
}
