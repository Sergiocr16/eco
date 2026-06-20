import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';

// Aviso global cuando electron-updater terminó de descargar una versión nueva.
// Complementa la notificación nativa (que dispara el main process): un banner
// persistente con botón "Reiniciar para actualizar". Solo aparece en la app
// empaquetada de Windows (donde el updater está habilitado).
export function UpdateBanner() {
  const t = useTokens();
  const tr = useT();
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState('');
  const [installing, setInstalling] = useState(false);
  const lastVersion = useRef('');

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateReady) return;
    const off = api.onUpdateReady((p) => {
      const v = p.version ?? '';
      if (v && v === lastVersion.current) return;
      lastVersion.current = v;
      setVersion(v);
      setReady(true);
    });
    return () => { try { off(); } catch { /* noop */ } };
  }, []);

  if (!ready) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
      marginTop: 8, zIndex: 9998,
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '10px 14px', borderRadius: 12,
      background: t.bg2, color: t.text0,
      border: `1px solid ${t.glassBorder}`,
      boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
      fontFamily: t.fontSans, fontSize: 13,
    }}>
      <span>
        {version
          ? tr('update.banner.title').replace('{version}', version)
          : tr('update.banner.title_noversion')}
      </span>
      <button
        type="button"
        disabled={installing}
        onClick={() => {
          setInstalling(true);
          void window.electronAPI?.installAndRestart?.();
        }}
        style={{
          padding: '6px 14px', borderRadius: 8,
          border: `1px solid ${t.ok}`, background: 'transparent', color: t.ok,
          fontFamily: t.fontSans, fontSize: 12.5, fontWeight: 600,
          cursor: installing ? 'wait' : 'pointer', opacity: installing ? 0.6 : 1,
        }}>
        {tr('update.banner.restart')}
      </button>
      <button
        type="button"
        onClick={() => setReady(false)}
        aria-label={tr('update.banner.dismiss')}
        style={{
          width: 24, height: 24, borderRadius: 6, border: 0,
          background: 'transparent', color: t.text3, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
    </div>
  );
}
