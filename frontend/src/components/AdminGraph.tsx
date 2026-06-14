// Grafo de equipo (solo admin) para la vista "grafo" del Dashboard: nodo Eco
// central → un nodo por usuario → sus bubbles colgando, con estado vivo
// (status + PTY/DEV). Datos de GET /admin/overview (poll cada 5 s). Es una
// vista de solo-lectura: el admin no puede abrir bubbles de otros (viven en el
// localStorage de cada quien), así que los nodos no son clickeables.

import { useEffect, useMemo } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { useAdmin } from '@/hooks/useAdmin';

const VB = 1000; // viewBox cuadrado; el SVG escala al contenedor.

function statusColorFor(s: string, t: ReturnType<typeof useTokens>): string {
  if (s === 'running' || s === 'thinking' || s === 'executing') return t.ok;
  if (s === 'error') return t.err;
  if (s === 'waiting') return t.warn;
  return t.text3;
}

export function AdminGraph() {
  const t = useTokens();
  const tr = useT();
  const admin = useAdmin();

  useEffect(() => {
    void admin.refreshOverview();
    const iv = setInterval(() => { void admin.refreshOverview(); }, 5000);
    return () => clearInterval(iv);
  }, [admin.refreshOverview]);

  // Solo usuarios con bubbles activas (no archivadas). Si ninguno tiene, igual
  // mostramos el nodo de usuario para dar contexto.
  const users = useMemo(
    () => admin.overview.map((u) => ({ ...u, bubbles: u.bubbles.filter((b) => !b.archived) })),
    [admin.overview],
  );

  const cx = VB / 2;
  const cy = VB / 2;
  const userR = users.length <= 1 ? 0 : Math.min(330, 150 + users.length * 18);
  const bubbleR = 96;

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <svg viewBox={`0 0 ${VB} ${VB}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block' }}>
        {/* Aristas Eco → usuario y usuario → bubble */}
        {users.map((u, i) => {
          const a = (i / Math.max(1, users.length)) * Math.PI * 2 - Math.PI / 2;
          const ux = cx + Math.cos(a) * userR;
          const uy = cy + Math.sin(a) * userR;
          return (
            <g key={`edges-${u.id}`}>
              <line x1={cx} y1={cy} x2={ux} y2={uy} stroke={t.glassBorder} strokeWidth={1.5}/>
              {u.bubbles.map((b, j) => {
                const ba = (j / Math.max(1, u.bubbles.length)) * Math.PI * 2 - Math.PI / 2;
                const bx = ux + Math.cos(ba) * bubbleR;
                const by = uy + Math.sin(ba) * bubbleR;
                return <line key={`e-${b.id}`} x1={ux} y1={uy} x2={bx} y2={by} stroke={t.glassBorder} strokeWidth={1}/>;
              })}
            </g>
          );
        })}

        {/* Nodo central Eco */}
        <circle cx={cx} cy={cy} r={30} fill={t.accentFaint} stroke={t.accent} strokeWidth={2}/>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={15} fontWeight={700} fill={t.accent} fontFamily={t.fontSans}>eco</text>

        {/* Nodos de usuario + sus bubbles */}
        {users.map((u, i) => {
          const a = (i / Math.max(1, users.length)) * Math.PI * 2 - Math.PI / 2;
          const ux = cx + Math.cos(a) * userR;
          const uy = cy + Math.sin(a) * userR;
          return (
            <g key={`u-${u.id}`}>
              {u.bubbles.map((b, j) => {
                const ba = (j / Math.max(1, u.bubbles.length)) * Math.PI * 2 - Math.PI / 2;
                const bx = ux + Math.cos(ba) * bubbleR;
                const by = uy + Math.sin(ba) * bubbleR;
                const col = statusColorFor(b.status, t);
                return (
                  <g key={`b-${b.id}`}>
                    <title>{`${b.title} · ${b.status}${b.ptyRunning ? ' · PTY' : ''}${b.devActive ? ' · DEV' : ''}`}</title>
                    <circle cx={bx} cy={by} r={11} fill={t.bg3} stroke={col} strokeWidth={2}/>
                    {(b.ptyRunning || b.devActive) && (
                      <circle cx={bx + 9} cy={by - 9} r={4} fill={b.devActive ? t.ok : t.accent}/>
                    )}
                    <text x={bx} y={by + 26} textAnchor="middle" fontSize={11} fill={t.text2} fontFamily={t.fontSans}>
                      {b.title.length > 16 ? b.title.slice(0, 15) + '…' : b.title}
                    </text>
                  </g>
                );
              })}
              {/* Nodo de usuario por encima de sus bubbles */}
              <circle cx={ux} cy={uy} r={22} fill={t.accentFaint} stroke={t.accent} strokeWidth={1.5}/>
              <text x={ux} y={uy + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill={t.accent} fontFamily={t.fontSans}>
                {u.username.charAt(0).toUpperCase()}
              </text>
              <text x={ux} y={uy - 30} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={t.text0} fontFamily={t.fontSans}>
                {u.username}
                <tspan fill={t.text3} fontWeight={400}>{`  ·  ${tr('admin.activity.count', { n: u.bubbles.length })}`}</tspan>
              </text>
            </g>
          );
        })}
      </svg>

      {users.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.text2, fontSize: 13 }}>
          {tr('admin.activity.loading')}
        </div>
      )}
    </div>
  );
}
