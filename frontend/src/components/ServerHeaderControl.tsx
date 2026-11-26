import { useTokens } from '@/design/theme';
import { IconCpu, IconGlobe, IconPlay, IconResume, IconStop } from '@/design/icons';
import { IconBtn } from '@/design/primitives';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { useDevServerControl } from '@/hooks/useDevServers';
import { useT } from '@/hooks/useI18n';

// Encender y apagar el dev server desde el header de la bubble. No se dibuja
// si el workspace no tiene server configurado.
export function ServerHeaderControl({ bubbleId, workspace }: { bubbleId: string; workspace: string }) {
  const t = useTokens();
  const tr = useT();
  const { configured, status, roles, busy, error, run } = useDevServerControl(bubbleId, workspace);
  if (!configured) return null;

  const shown = error ? 'error' : busy === 'start' || busy === 'restart' ? 'starting' : status;
  const color = shown === 'running' ? t.ok : shown === 'starting' ? t.warn : shown === 'error' ? t.err : t.text3;
  const live = status === 'running' || status === 'starting';
  // Con frontend activo se abre el frontend; si no, lo que haya corriendo.
  const pageUrl = (['frontend', 'main', 'backend'] as const)
    .map((r) => roles[r]).find((r) => r?.status === 'running' && r.url)?.url;
  const openPage = () => {
    if (!pageUrl) return;
    ecoEmit('eco:switch_tab', { tab: 'browser', bubbleId });
    window.setTimeout(() => ecoEmit('eco:browser_navigate', { bubbleId, url: pageUrl }), 120);
  };

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
      height: 32, padding: '0 4px 0 0', borderRadius: 10,
      border: `1px solid ${t.glassBorder}`, background: t.glassBg,
    }}>
      <button
        type="button"
        onClick={() => ecoEmit('eco:switch_tab', { tab: 'server', bubbleId })}
        title={error ?? tr('detail.server.open_tab')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: '100%', padding: '0 6px 0 10px',
          background: 'transparent', border: 0, cursor: 'pointer',
          color: t.text1, fontFamily: t.fontSans, fontSize: 12, whiteSpace: 'nowrap',
        }}>
        <IconCpu size={14}/>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }}/>
        {tr(`detail.server.state.${shown}`)}
      </button>
      {live || status === 'error' ? (
        <>
          {pageUrl && (
            <IconBtn icon={IconGlobe} size={26} title={tr('server.action.open_browser')} onClick={openPage}/>
          )}
          <IconBtn icon={IconResume} size={26} title={tr('detail.server.restart')}
            onClick={() => { if (!busy) void run('restart'); }}/>
          <IconBtn icon={IconStop} size={26} title={tr('detail.server.stop')} style={{ color: t.err }}
            onClick={() => { if (!busy) void run('stop'); }}/>
        </>
      ) : (
        <IconBtn icon={IconPlay} size={26} title={tr('detail.server.start')} style={{ color: t.ok }}
          onClick={() => { if (!busy) void run('start'); }}/>
      )}
    </div>
  );
}
