import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'eco.tts.enabled';

export type TTSHook = {
  enabled: boolean;
  speaking: boolean;
  isSupported: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoiceURI: string | null;
  setEnabled: (v: boolean) => void;
  selectVoice: (uri: string) => void;
  speak: (text: string) => void;
  cancel: () => void;
};

function pickDefaultSpanishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const isEs = (v: SpeechSynthesisVoice) => v.lang?.toLowerCase().startsWith('es');
  const isLocal = (v: SpeechSynthesisVoice) => v.localService === true;
  const score = (v: SpeechSynthesisVoice) => {
    let s = 0;
    if (isEs(v)) s += 100;
    if (isLocal(v)) s += 50;
    if (/m[oó]nica|paulina|jorge|enhanced|premium|siri/i.test(v.name)) s += 30;
    if (v.default) s += 5;
    return s;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function useTTS(): TTSHook {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage?.getItem(STORAGE_KEY) === '1';
  });
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!isSupported) return;
    const sync = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      setSelectedVoiceURI((current) => {
        if (current && v.some((x) => x.voiceURI === current)) return current;
        const pick = pickDefaultSpanishVoice(v);
        return pick?.voiceURI ?? null;
      });
    };
    sync();
    window.speechSynthesis.addEventListener('voiceschanged', sync);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', sync);
  }, [isSupported]);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try { window.localStorage?.setItem(STORAGE_KEY, v ? '1' : '0'); } catch { /* noop */ }
    if (!v && isSupported) window.speechSynthesis.cancel();
  }, [isSupported]);

  const selectVoice = useCallback((uri: string) => {
    setSelectedVoiceURI(uri);
  }, []);

  const cancel = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [isSupported]);

  const speak = useCallback((text: string) => {
    if (!isSupported || !enabled || !text.trim()) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    else { u.lang = 'es-419'; }
    u.rate = 1.02;
    u.pitch = 1.0;
    u.volume = 1.0;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    utteranceRef.current = u;
    synth.speak(u);
  }, [enabled, isSupported, selectedVoiceURI, voices]);

  useEffect(() => () => { if (isSupported) window.speechSynthesis.cancel(); }, [isSupported]);

  return {
    enabled,
    speaking,
    isSupported,
    voices,
    selectedVoiceURI,
    setEnabled,
    selectVoice,
    speak,
    cancel,
  };
}
