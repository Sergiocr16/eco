import { useEffect, useRef, useState } from 'react';
import { Btn, IconBtn } from '@/design/primitives';
import { IconX } from '@/design/icons';
import { useT } from '@/hooks/useI18n';

// Aviso global del auto-update. Aparece apenas electron-updater detecta una
// versión nueva (con el progreso de descarga) y, cuando terminó de bajar,
// ofrece "Reiniciar para actualizar". Complementa los toasts nativos que
// dispara el main process. Solo en la app empaquetada de Windows (donde el
// updater está habilitado).
export function UpdateBanner() {
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
    // Centrado con márgenes automáticos: la animación de .eco-menu usa
    // transform y pisaría un translateX(-50%).
    <div className="eco-menu eco-hstack" role="status" style={{
      position: 'fixed', top: 0, left: 0, right: 0, margin: '8px auto 0',
      width: 'fit-content', maxWidth: 'calc(100% - 24px)', minWidth: 0, zIndex: 9998,
      gap: 12, padding: '8px 8px 8px 16px',
    }}>
      <span className="eco-grow">
        {ready
          ? (version
            ? tr('update.banner.title').replace('{version}', version)
            : tr('update.banner.title_noversion'))
          : tr('update.banner.downloading').replace('{version}', version || '…').replace('{percent}', String(percent))}
      </span>
      {ready && (
        <Btn
          kind="primary"
          size="sm"
          disabled={installing}
          onClick={() => {
            setInstalling(true);
            void window.electronAPI?.installAndRestart?.();
          }}>
          {tr('update.banner.restart')}
        </Btn>
      )}
      <IconBtn icon={IconX} size={28} title={tr('update.banner.dismiss')}
        onClick={() => { dismissedVersion.current = version; setPhase('hidden'); }}/>
    </div>
  );
}
