import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';

// Aviso global del auto-update. Aparece apenas electron-updater detecta una
// versión nueva (con el progreso de descarga) y, cuando terminó de bajar,
// ofrece "Reiniciar para actualizar". Complementa los toasts nativos que
// dispara el main process. Solo en la app empaquetada de Windows (donde el
// updater está habilitado).
export function UpdateBanner() {
  const t = useTokens();
  const tr = useT();
  const [phase, setPhase] = useState<'hidden' | 'downloading' | 'ready'>('hidden');
  const [version, setVersion] = useState('');
  const [percent, setPercent] = useState(0);
  const [installing, setInstalling] = useState(false);
  const dismissedVersion = useRef('');

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateReady) return;
    const offs: Array<() => void> = [];
    if (api.onUpdateAvailable) {
      offs.push(api.onUpdateAvailable((p) => {
        const v = p.version ?? '';
        if (v && v === dismissedVersion.current) return;
        setVersion(v); setPercent(0); setPhase('downloading');
      }));
    }
    if (api.onUpdateProgress) {
      offs.push(api.onUpdateProgress((p) => { setPercent(p.percent); }));
    }
    offs.push(api.onUpdateReady((p) => {
      const v = p.version ?? '';
      if (v && v === dismissedVersion.current) return;
      setVersion(v); setPhase('ready');
    }));
    return () => { for (const off of offs) { try { off(); } catch { /* noop */ } } };
  }, []);

  if (phase === 'hidden') return null;
  const ready = phase === 'ready';

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
        {ready
          ? (version
            ? tr('update.banner.title').replace('{version}', version)
            : tr('update.banner.title_noversion'))
          : tr('update.banner.downloading').replace('{version}', version || '…').replace('{percent}', String(percent))}
      </span>
      {ready && (
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
      )}
      <button
        type="button"
        onClick={() => { dismissedVersion.current = version; setPhase('hidden'); }}
        aria-label={tr('update.banner.dismiss')}
        style={{
          width: 24, height: 24, borderRadius: 6, border: 0,
          background: 'transparent', color: t.text3, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
    </div>
  );
}
