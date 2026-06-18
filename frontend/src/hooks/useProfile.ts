import { useCallback, useEffect, useState } from 'react';
import { subscribePrefs, updatePrefs, getPrefs } from '@/lib/prefs-sync';

// Cache local de primer paint. La AUTORIDAD de la foto es el doc `prefs` en
// Firestore (sincroniza cross-device); este localStorage solo evita el
// parpadeo inicial antes de hidratar.
const PHOTO_KEY = 'eco.profile.photo';
const USERNAME_KEY = 'eco.profile.username';

// Evento custom para sincronizar entre componentes en la misma pestaña
// (el evento 'storage' del browser solo se dispara en OTRAS pestañas).
const CHANGE_EVENT = 'eco:profile-change';

export type UseProfileResult = {
  photo: string | null;
  username: string | null;
  initial: string;
  setPhotoFromFile: (file: File) => Promise<void>;
  clearPhoto: () => void;
};

function readPhoto(): string | null {
  try { return window.localStorage.getItem(PHOTO_KEY); } catch { return null; }
}

function readUsername(): string | null {
  try { return window.localStorage.getItem(USERNAME_KEY); } catch { return null; }
}

export function writeProfileUsername(username: string | null) {
  try {
    if (username) window.localStorage.setItem(USERNAME_KEY, username);
    else window.localStorage.removeItem(USERNAME_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch { /* noop */ }
}

function computeInitial(username: string | null): string {
  if (!username) return '?';
  const trimmed = username.trim();
  if (!trimmed) return '?';
  return trimmed[0]!.toUpperCase();
}

// Redimensiona y comprime una imagen a JPEG ~128x128 para mantenerla chiquita
// en localStorage (típicamente < 8KB).
async function resizeToDataUrl(file: File, size = 128): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error('read_failed'));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('image_load_failed'));
    i.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  // Cover: recorta al cuadrado manteniendo la cara centrada.
  const min = Math.min(img.width, img.height);
  const sx = (img.width - min) / 2;
  const sy = (img.height - min) / 2;
  ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function cachePhoto(dataUrl: string | null) {
  try {
    if (dataUrl) window.localStorage.setItem(PHOTO_KEY, dataUrl);
    else window.localStorage.removeItem(PHOTO_KEY);
  } catch { /* noop */ }
}

export function useProfile(): UseProfileResult {
  const [photo, setPhoto] = useState<string | null>(() => getPrefs().photo ?? readPhoto());
  const [username, setUsername] = useState<string | null>(() => readUsername());

  useEffect(() => {
    const sync = () => setUsername(readUsername());
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    // La foto sigue al doc prefs (Firestore) → cross-device.
    const unsub = subscribePrefs((p) => {
      const next = p.photo ?? null;
      cachePhoto(next);
      setPhoto(next);
    });
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
      unsub();
    };
  }, []);

  const setPhotoFromFile = useCallback(async (file: File) => {
    const dataUrl = await resizeToDataUrl(file);
    cachePhoto(dataUrl);
    setPhoto(dataUrl);
    updatePrefs({ photo: dataUrl });  // sube a Firestore (cross-device)
  }, []);

  const clearPhoto = useCallback(() => {
    cachePhoto(null);
    setPhoto(null);
    updatePrefs({ photo: null });
  }, []);

  return {
    photo,
    username,
    initial: computeInitial(username),
    setPhotoFromFile,
    clearPhoto,
  };
}
