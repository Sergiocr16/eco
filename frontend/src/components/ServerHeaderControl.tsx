import { useTokens } from '@/design/theme';
import { IconCpu, IconPlay, IconResume, IconStop } from '@/design/icons';
import { IconBtn } from '@/design/primitives';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { useDevServerControl } from '@/hooks/useDevServers';
import { useT } from '@/hooks/useI18n';

// Encender y apagar el dev server desde el header de la bubble. No se dibuja
// si el workspace no tiene server configurado.
export function ServerHeaderControl({ bubbleId, workspace }: { bubbleId: string; workspace: string }) {
  const t = useTokens();
  const tr = useT();
  const { configured, status, busy, error, run } = useDevServerControl(bubbleId, workspace);
  if (!configured) return null;

  const shown = error ? 'error' : busy === 'start' || busy === 'restart' ? 'starting' : status;
  const color = shown === 'running' ? t.ok : shown === 'starting' ? t.warn : shown === 'error' ? t.err : t.text3;
  const live = status === 'running' || status === 'starting';
  const label = tr(`detail.server.state.${shown}`);

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
      height: 'var(--h-lg)', padding: '0 6px', borderRadius: 999,
      background: t.card,
    }}>
      {/* Solo el ícono: el color dice el estado y el texto queda en el tooltip. */}
      <IconBtn icon={IconCpu} size={32} title={error ?? `${label} · ${tr('detail.server.open_tab')}`}
        style={{ color: shown === 'stopped' ? t.text2 : color }}
        onClick={() => ecoEmit('eco:switch_tab', { tab: 'server', bubbleId })}/>
      {live || status === 'error' ? (
        <>
          <IconBtn icon={IconResume} size={32} title={tr('detail.server.restart')}
            onClick={() => { if (!busy) void run('restart'); }}/>
          <IconBtn icon={IconStop} size={32} title={tr('detail.server.stop')} style={{ color: t.err }}
            onClick={() => { if (!busy) void run('stop'); }}/>
        </>
      ) : (
        <IconBtn icon={IconPlay} size={32} title={tr('detail.server.start')} style={{ color: t.ok }}
          onClick={() => { if (!busy) void run('start'); }}/>
      )}
    </div>
  );
}
