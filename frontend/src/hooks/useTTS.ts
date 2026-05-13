import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

const STORAGE_ENABLED = 'eco.tts.enabled';
const STORAGE_VOICE = 'eco.tts.voice';
const STORAGE_RATE = 'eco.tts.rate';
const STORAGE_VOLUME = 'eco.tts.volume';

export type UnifiedVoice = {
  id: string;
  name: string;
  language: string;
  kind: 'piper' | 'browser' | 'macsay';
  premium: boolean;
};

export type TTSHook = {
  enabled: boolean;
  speaking: boolean;
  isSupported: boolean;
  piperAvailable: boolean;
  voices: UnifiedVoice[];
  selectedVoiceURI: string | null;
  rate: number;
  volume: number;
  setEnabled: (v: boolean) => void;
  selectVoice: (uri: string) => void;
  setRate: (r: number) => void;
  setVolume: (v: number) => void;
  speak: (text: string) => void;
  cancel: () => void;
};

type PiperVoice = {
  id: string;
  name: string;
  language: string;
  quality: string;
  bytes: number;
};

type MacSayVoice = {
  id: string;
  name: string;
  language: string;
  premium: boolean;
};

const PREMIUM_HINT = /\(?(premium|enhanced|neural|siri)\)?/i;

function loadEnabled(): boolean {
  try { return window.localStorage.getItem(STORAGE_ENABLED) === '1'; } catch { return false; }
}
function loadVoice(): string | null {
  try { return window.localStorage.getItem(STORAGE_VOICE); } catch { return null; }
}
function loadRate(): number {
  try {
    const v = Number(window.localStorage.getItem(STORAGE_RATE));
    return Number.isFinite(v) && v >= 0.5 && v <= 2 ? v : 1;
  } catch { return 1; }
}
function loadVolume(): number {
  try {
    const v = Number(window.localStorage.getItem(STORAGE_VOLUME));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
  } catch { return 1; }
}

async function fetchVoices(): Promise<{ piper: PiperVoice[]; macsay: MacSayVoice[] }> {
  try {
    const res = await apiFetch('/tts/voices');
    if (!res.ok) return { piper: [], macsay: [] };
    const data = await res.json();
    return {
      piper: Array.isArray(data.piper) ? data.piper : (Array.isArray(data.voices) ? data.voices : []),
      macsay: Array.isArray(data.macsay) ? data.macsay : [],
    };
  } catch {
    return { piper: [], macsay: [] };
  }
}

async function fetchTTS(text: string, voice: string, backend: 'piper' | 'macsay'): Promise<Blob | null> {
  try {
    const res = await apiFetch('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, backend }),
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export function useTTS(): TTSHook {
  const browserSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const [enabled, setEnabledState] = useState<boolean>(loadEnabled);
  const [speaking, setSpeaking] = useState(false);
  const [piperVoices, setPiperVoices] = useState<PiperVoice[]>([]);
  const [macSayVoices, setMacSayVoices] = useState<MacSayVoice[]>([]);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(loadVoice);
  const [rate, setRateState] = useState<number>(loadRate);
  const [volume, setVolumeState] = useState<number>(loadVolume);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reqIdRef = useRef(0);

  // Carga voces de Piper + macOS say desde el backend
  useEffect(() => {
    fetchVoices().then((v) => {
      setPiperVoices(v.piper);
      setMacSayVoices(v.macsay);
    });
  }, []);

  // Subscribe to browser voices
  useEffect(() => {
    if (!browserSupported) return;
    const sync = () => setBrowserVoices(window.speechSynthesis.getVoices());
    sync();
    window.speechSynthesis.addEventListener('voiceschanged', sync);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', sync);
  }, [browserSupported]);

  const voices: UnifiedVoice[] = [
    ...macSayVoices.map((v) => ({
      id: `macsay:${v.id}`,
      name: v.name,
      language: v.language,
      kind: 'macsay' as const,
      premium: v.premium,
    })),
    ...piperVoices.map((v) => ({
      id: `piper:${v.id}`,
      name: v.name,
      language: v.language,
      kind: 'piper' as const,
      premium: true,
    })),
    ...browserVoices.map((v) => ({
      id: `browser:${v.voiceURI}`,
      name: v.name.replace(PREMIUM_HINT, '').trim(),
      language: v.lang,
      kind: 'browser' as const,
      premium: PREMIUM_HINT.test(v.name),
    })),
  ];

  // Default: priorizamos macsay Premium en español (suena mucho mejor),
  // luego macsay normal, después piper, después browser.
  useEffect(() => {
    if (selectedVoiceURI) {
      const stillExists = voices.some((v) => v.id === selectedVoiceURI);
      if (stillExists) return;
    }
    const isEs = (v: UnifiedVoice) => v.language?.toLowerCase().startsWith('es');
    const sortByScore = (a: UnifiedVoice, b: UnifiedVoice) => {
      let sA = 0, sB = 0;
      if (a.kind === 'macsay') sA += 300;
      if (b.kind === 'macsay') sB += 300;
      if (a.kind === 'piper') sA += 200;
      if (b.kind === 'piper') sB += 200;
      if (isEs(a)) sA += 100;
      if (isEs(b)) sB += 100;
      if (a.premium) sA += 50;
      if (b.premium) sB += 50;
      return sB - sA;
    };
    const sorted = [...voices].sort(sortByScore);
    const pick = sorted[0];
    if (pick) {
      setSelectedVoiceURI(pick.id);
      try { window.localStorage.setItem(STORAGE_VOICE, pick.id); } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices.length]);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try { window.localStorage.setItem(STORAGE_ENABLED, v ? '1' : '0'); } catch { /* noop */ }
    if (!v) {
      audioRef.current?.pause();
      audioRef.current = null;
      if (browserSupported) window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [browserSupported]);

  const selectVoice = useCallback((id: string) => {
    setSelectedVoiceURI(id);
    try { window.localStorage.setItem(STORAGE_VOICE, id); } catch { /* noop */ }
  }, []);

  const setRate = useCallback((r: number) => {
    const clamped = Math.min(2, Math.max(0.5, r));
    setRateState(clamped);
    try { window.localStorage.setItem(STORAGE_RATE, String(clamped)); } catch { /* noop */ }
    if (audioRef.current) audioRef.current.playbackRate = clamped;
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    try { window.localStorage.setItem(STORAGE_VOLUME, String(clamped)); } catch { /* noop */ }
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const cancel = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (browserSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [browserSupported]);

  const speak = useCallback(async (text: string) => {
    if (!enabled || !text.trim() || !selectedVoiceURI) return;

    const myReq = ++reqIdRef.current;
    cancel();

    const [kind, raw] = selectedVoiceURI.split(/:(.+)/, 2);
    if ((kind === 'piper' || kind === 'macsay') && raw) {
      setSpeaking(true);
      const blob = await fetchTTS(text, raw, kind);
      if (myReq !== reqIdRef.current) return; // user cambió mientras esperaba
      if (!blob) {
        setSpeaking(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = rate;
      audio.volume = volume;
      audioRef.current = audio;
      audio.onended = () => {
        if (myReq === reqIdRef.current) setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        if (myReq === reqIdRef.current) setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.play().catch(() => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      });
      return;
    }

    if (kind === 'browser' && raw && browserSupported) {
      const synth = window.speechSynthesis;
      const voice = browserVoices.find((v) => v.voiceURI === raw);
      const u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      else { u.lang = 'es-419'; }
      u.rate = rate * 1.02;
      u.volume = volume;
      u.onstart = () => { if (myReq === reqIdRef.current) setSpeaking(true); };
      u.onend = () => { if (myReq === reqIdRef.current) setSpeaking(false); };
      u.onerror = () => { if (myReq === reqIdRef.current) setSpeaking(false); };
      synth.speak(u);
    }
  }, [browserSupported, browserVoices, cancel, enabled, selectedVoiceURI, rate, volume]);

  useEffect(() => () => { cancel(); }, [cancel]);

  return {
    enabled,
    speaking,
    isSupported: browserSupported || piperVoices.length > 0,
    piperAvailable: piperVoices.length > 0,
    voices,
    selectedVoiceURI,
    rate,
    volume,
    setEnabled,
    selectVoice,
    setRate,
    setVolume,
    speak,
    cancel,
  };
}
