import { useCallback, useEffect, useState } from 'react';

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

export function useProfile(): UseProfileResult {
  const [photo, setPhoto] = useState<string | null>(() => readPhoto());
  const [username, setUsername] = useState<string | null>(() => readUsername());

  useEffect(() => {
    const sync = () => {
      setPhoto(readPhoto());
      setUsername(readUsername());
    };
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const setPhotoFromFile = useCallback(async (file: File) => {
    const dataUrl = await resizeToDataUrl(file);
    try {
      window.localStorage.setItem(PHOTO_KEY, dataUrl);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
      setPhoto(dataUrl);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'storage_failed');
    }
  }, []);

  const clearPhoto = useCallback(() => {
    try {
      window.localStorage.removeItem(PHOTO_KEY);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
      setPhoto(null);
    } catch { /* noop */ }
  }, []);

  return {
    photo,
    username,
    initial: computeInitial(username),
    setPhotoFromFile,
    clearPhoto,
  };
}
