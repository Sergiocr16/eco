import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
import { IconCheck, IconX, IconResume, IconCopy } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { fetchCommit, type LogEntry } from '@/hooks/useGitLog';
import { useBranches } from '@/hooks/useBranches';
import { ShaPill, SubpanelLoading, formatRelTime } from './shared';

type Props = {
  workspace: string;
  bubbleId: string;
  // Commit summary que ya tenemos de la lista (para mostrar mientras carga
  // el detalle completo).
  summary: LogEntry;
};

export function CommitDetailPanel({ workspace, bubbleId, summary }: Props) {
  const t = useTokens();
  const { data: branchesData } = useBranches(workspace, bubbleId);
  const [loading, setLoading] = useState(true);
  const [diff, setDiff] = useState<string>('');
  const [stat, setStat] = useState<string>('');
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showCherryMenu, setShowCherryMenu] = useState(false);
  const [showResetMenu, setShowResetMenu] = useState(false);
  const [resetConfirm, setResetConfirm] = useState<{ mode: 'soft' | 'mixed' | 'hard'; lostCommits?: number; lostSubjects?: string[]; phrase: string } | null>(null);
  // Confirmación previa al cherry-pick: { targetBranch } cuando el user
  // eligió rama pero aún no confirmó el "Sí, aplicar".
  const [cherryConfirm, setCherryConfirm] = useState<{ branch: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setDiff(''); setStat(''); setTruncated(false);
    setActionMsg(null); setShowCherryMenu(false); setCherryConfirm(null); setShowResetMenu(false); setResetConfirm(null);
    void fetchCommit(workspace, bubbleId, summary.sha).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setDiff(r.diff);
        setStat(r.stat);
        setTruncated(r.truncated);
      } else {
        setError(r.error);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [workspace, bubbleId, summary.sha]);

  useEffect(() => {
    if (!actionMsg) return;
    const id = setTimeout(() => setActionMsg(null), 3000);
    return () => clearTimeout(id);
  }, [actionMsg]);

  async function postAction(path: string, body: object, label: string) {
    setBusyAction(label); setActionMsg(null);
    try {
      const r = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, ...body }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        const conflictMsg = d.conflict ? ` (${d.conflict.files.length} archivos en conflicto)` : '';
        setActionMsg({ kind: 'err', text: (d.error || `HTTP ${r.status}`) + conflictMsg });
        return { ok: false, data: d };
      }
      setActionMsg({ kind: 'ok', text: d.message || 'OK' });
      ecoEmit('eco:git_refresh', { bubbleId });
      return { ok: true, data: d };
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
      return { ok: false, data: null };
    } finally {
      setBusyAction(null);
    }
  }

  // Paso 1: el user elige rama destino → mostramos la pantalla de confirmación.
  // No tocamos git todavía. Esto evita cherry-picks accidentales por click.
  function pickCherryTarget(targetBranch: string) {
    setShowCherryMenu(false);
    setCherryConfirm({ branch: targetBranch });
  }

  // Paso 2: el user confirma → hacemos checkout (si hace falta) + cherry-pick.
  async function runCherryPick(targetBranch: string) {
    setCherryConfirm(null);
    const currentBranch = branchesData?.current;
    // Si el destino es distinto a la rama actual, hacemos checkout primero.
    // El usuario queda en la rama destino tras el cherry-pick (es la
    // interpretación más útil — si elegiste otra rama, querés trabajar ahí).
    if (currentBranch && targetBranch !== currentBranch) {
      setBusyAction('cherry'); setActionMsg(null);
      try {
        const r = await apiFetch('/git/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace, bubbleId, branch: targetBranch }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) {
          // Si hay cambios sin commitear, el backend devuelve checkout.dirty_working_tree.
          const hint = d.code === 'checkout.dirty_working_tree'
            ? ' — commiteá o descartá tus cambios antes'
            : '';
          setActionMsg({ kind: 'err', text: `No se pudo cambiar a «${targetBranch}»: ${d.error || `HTTP ${r.status}`}${hint}` });
          setBusyAction(null);
          return;
        }
        ecoEmit('eco:git_refresh', { bubbleId });
      } catch (e) {
        setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
        setBusyAction(null);
        return;
      }
    }
    await postAction('/git/cherry-pick', { shas: [summary.sha] }, 'cherry');
  }
  async function revert() {
    await postAction('/git/revert', { sha: summary.sha }, 'revert');
  }
  async function reset(mode: 'soft' | 'mixed' | 'hard', force = false) {
    setShowResetMenu(false);
    const result = await postAction('/git/reset', { ref: summary.sha, mode, force }, 'reset');
    if (!result.ok && mode === 'hard' && result.data?.code === 'reset.would_lose_commits') {
      // Pre-check disparó protección; mostramos confirm.
      setResetConfirm({
        mode: 'hard',
        lostCommits: result.data.lostCommits,
        lostSubjects: result.data.lostSubjects ?? [],
        phrase: '',
      });
    }
  }
  function copySha() {
    try { void navigator.clipboard.writeText(summary.sha); setActionMsg({ kind: 'ok', text: 'SHA copiado' }); } catch { /* noop */ }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      {/* Header con meta + acciones */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${t.glassBorder}`,
        background: t.bg1,
        display: 'flex', flexDirection: 'column', gap: 10,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <ShaPill sha={summary.sha} abbrev={summary.abbrev}/>
          <div style={{
            fontFamily: t.fontSans, fontSize: 14, fontWeight: 600, color: t.text0,
            flex: '1 1 auto', minWidth: 0,
          }}>{summary.subject}</div>
        </div>
        <div style={{ fontSize: 11, color: t.text2 }}>
          {summary.author} · {formatRelTime(summary.date)}
          {summary.parents.length > 1 && <span style={{ marginLeft: 8, color: t.accent }}>· merge de {summary.parents.length} padres</span>}
        </div>
        {summary.body && (
          <pre style={{
            margin: 0, padding: '6px 8px', borderRadius: 6,
            background: t.bg2, color: t.text1,
            fontFamily: t.fontMono, fontSize: 11.5, lineHeight: 1.5,
            whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto',
          }}>{summary.body}</pre>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Btn kind="primary" size="sm" icon={IconCheck} onClick={() => setShowCherryMenu((v) => !v)} disabled={!!busyAction}>
              {busyAction === 'cherry' ? '…' : 'Cherry-pick a…'}
            </Btn>
            {showCherryMenu && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                minWidth: 220, maxWidth: 320, maxHeight: 340, overflow: 'auto',
                padding: 4, borderRadius: 8,
                background: t.bg1, border: `1px solid ${t.glassBorder}`,
                boxShadow: `0 8px 24px ${t.glassBorder}`,
                zIndex: 10,
              }}>
                <div style={{
                  padding: '6px 10px', fontSize: 10.5, color: t.text3,
                  textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
                }}>Aplicar este commit a:</div>
                {(branchesData?.branches ?? [])
                  .filter((b) => !b.isRemote)
                  .map((b) => (
                    <button key={b.name} type="button"
                      onClick={() => pickCherryTarget(b.name)}
                      style={{
                        width: '100%', padding: '8px 10px', textAlign: 'left',
                        border: 0, background: 'transparent', borderRadius: 6,
                        color: t.text1,
                        fontFamily: t.fontMono, fontSize: 12, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = t.bg2; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {b.name}
                      </span>
                      {b.isCurrent && (
                        <span style={{
                          fontSize: 9.5, fontWeight: 700, color: t.accent,
                          padding: '1px 5px', borderRadius: 3,
                          background: t.accentFaint,
                        }}>ACTUAL</span>
                      )}
                    </button>
                  ))}
                {(!branchesData?.branches || branchesData.branches.filter((b) => !b.isRemote).length === 0) && (
                  <div style={{ padding: '8px 10px', fontSize: 11, color: t.text3 }}>
                    Sin ramas locales disponibles.
                  </div>
                )}
              </div>
            )}
          </div>
          <Btn kind="ghost" size="sm" icon={IconX} onClick={() => void revert()} disabled={!!busyAction}>
            {busyAction === 'revert' ? '…' : 'Revert'}
          </Btn>
          <div style={{ position: 'relative' }}>
            <Btn kind="ghost" size="sm" icon={IconResume} onClick={() => setShowResetMenu((v) => !v)} disabled={!!busyAction}>
              Reset to here
            </Btn>
            {showResetMenu && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                minWidth: 200, padding: 4, borderRadius: 8,
                background: t.bg1, border: `1px solid ${t.glassBorder}`,
                boxShadow: `0 8px 24px ${t.glassBorder}`,
                zIndex: 10,
              }}>
                {(['soft', 'mixed', 'hard'] as const).map((m) => (
                  <button key={m} type="button"
                    onClick={() => void reset(m)}
                    style={{
                      width: '100%', padding: '8px 10px', textAlign: 'left',
                      border: 0, background: 'transparent', borderRadius: 6,
                      color: m === 'hard' ? t.err : t.text1,
                      fontFamily: t.fontSans, fontSize: 12, cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = t.bg2; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ fontWeight: 500 }}>--{m}</div>
                    <div style={{ fontSize: 10.5, color: t.text3, marginTop: 1 }}>
                      {m === 'soft' && 'Mueve HEAD. Working tree e index intactos.'}
                      {m === 'mixed' && 'Mueve HEAD + resetea index. Working tree intacto.'}
                      {m === 'hard' && 'Mueve HEAD + resetea TODO. Destructivo.'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Btn kind="ghost" size="sm" icon={IconCopy} onClick={copySha}>SHA</Btn>
        </div>

        {actionMsg && (
          <div style={{
            padding: '6px 8px', borderRadius: 6,
            background: `color-mix(in oklch, ${actionMsg.kind === 'ok' ? t.ok : t.err} 12%, transparent)`,
            color: actionMsg.kind === 'ok' ? t.ok : t.err,
            fontFamily: t.fontMono, fontSize: 11,
          }}>{actionMsg.text}</div>
        )}
      </div>

      {/* Confirm modal de cherry-pick */}
      {cherryConfirm && (
        <CherryPickConfirm
          targetBranch={cherryConfirm.branch}
          currentBranch={branchesData?.current ?? null}
          commitAbbrev={summary.abbrev}
          commitSubject={summary.subject}
          onCancel={() => setCherryConfirm(null)}
          onConfirm={() => void runCherryPick(cherryConfirm.branch)}
        />
      )}

      {/* Confirm modal de reset hard */}
      {resetConfirm && (
        <ResetHardConfirm
          info={resetConfirm}
          onChange={(phrase) => setResetConfirm((r) => r ? { ...r, phrase } : r)}
          onCancel={() => setResetConfirm(null)}
          onConfirm={() => { setResetConfirm(null); void reset('hard', true); }}
        />
      )}

      {/* Diff */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading && <SubpanelLoading label="Cargando diff…"/>}
        {error && (
          <div style={{ padding: 20, color: t.err, fontFamily: t.fontMono, fontSize: 12 }}>
            {error}
          </div>
        )}
        {!loading && !error && (
          <>
            {stat && (
              <pre style={{
                margin: 0, padding: '12px 20px',
                background: t.bg1, borderBottom: `1px solid ${t.glassBorder}`,
                color: t.text2, fontFamily: t.fontMono, fontSize: 11.5,
                whiteSpace: 'pre-wrap',
              }}>{stat}</pre>
            )}
            <DiffRender diff={diff}/>
            {truncated && (
              <div style={{ padding: 16, textAlign: 'center', color: t.warn, fontSize: 12 }}>
                Diff truncado a 512 KB
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CherryPickConfirm({
  targetBranch, currentBranch, commitAbbrev, commitSubject, onCancel, onConfirm,
}: {
  targetBranch: string;
  currentBranch: string | null;
  commitAbbrev: string;
  commitSubject: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTokens();
  const isSwitching = !!currentBranch && currentBranch !== targetBranch;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 480, maxWidth: '92vw', padding: 20, borderRadius: 12,
        background: t.bg1, border: `1px solid ${t.accent}`,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text0 }}>
          Aplicar cherry-pick
        </div>
        <div style={{ fontSize: 12.5, color: t.text1, lineHeight: 1.55 }}>
          Vas a aplicar el commit{' '}
          <code style={{
            fontFamily: t.fontMono, padding: '1px 6px', borderRadius: 4,
            background: t.bg3, color: t.text0,
          }}>{commitAbbrev}</code>
          {' '}— <em>{commitSubject}</em> — sobre la rama{' '}
          <code style={{
            fontFamily: t.fontMono, padding: '1px 6px', borderRadius: 4,
            background: t.accentFaint, color: t.accent, fontWeight: 600,
          }}>{targetBranch}</code>.
        </div>
        {isSwitching && (
          <div style={{
            fontSize: 11.5, color: t.warn,
            padding: '8px 10px', borderRadius: 6,
            background: `color-mix(in oklch, ${t.warn} 10%, transparent)`,
            border: `1px solid color-mix(in oklch, ${t.warn} 40%, transparent)`,
            lineHeight: 1.5,
          }}>
            Estás en <code style={{ fontFamily: t.fontMono }}>{currentBranch}</code>.
            Eco va a hacer checkout a <code style={{ fontFamily: t.fontMono }}>{targetBranch}</code> antes de aplicar el commit, y vas a quedar parado ahí.
            Si tenés cambios sin commitear el checkout va a fallar.
          </div>
        )}
        <div style={{ fontSize: 11, color: t.text3 }}>
          Si el commit conflicta vas a ver el banner rojo arriba con opciones para resolver/abortar.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn kind="ghost" size="sm" onClick={onCancel}>Cancelar</Btn>
          <button type="button"
            onClick={onConfirm}
            style={{
              height: 28, padding: '0 14px', borderRadius: 7, border: 0,
              background: t.accent, color: t.accentOn,
              fontFamily: t.fontSans, fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
            }}>Sí, aplicar</button>
        </div>
      </div>
    </div>
  );
}

function ResetHardConfirm({
  info, onChange, onCancel, onConfirm,
}: {
  info: { mode: 'soft' | 'mixed' | 'hard'; lostCommits?: number; lostSubjects?: string[]; phrase: string };
  onChange: (phrase: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTokens();
  const enabled = info.phrase.trim() === 'HARD RESET';
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 460, maxWidth: '90vw', padding: 20, borderRadius: 12,
        background: t.bg1, border: `1px solid ${t.err}`,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.err }}>
          Reset --hard destructivo
        </div>
        <div style={{ fontSize: 12, color: t.text1, lineHeight: 1.5 }}>
          Vas a perder <strong>{info.lostCommits}</strong> commit{info.lostCommits === 1 ? '' : 's'}:
        </div>
        {info.lostSubjects && info.lostSubjects.length > 0 && (
          <ul style={{
            margin: 0, padding: '0 0 0 18px',
            color: t.text2, fontSize: 11.5, lineHeight: 1.6,
          }}>
            {info.lostSubjects.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        )}
        <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.5 }}>
          Tip: podés recuperar con <code style={{ fontFamily: t.fontMono }}>git reflog</code> dentro de los próximos 90 días.
        </div>
        <div style={{ fontSize: 11.5, color: t.text1 }}>
          Para confirmar, escribí <code style={{
            fontFamily: t.fontMono, padding: '2px 6px', borderRadius: 4,
            background: t.bg3, color: t.text0,
          }}>HARD RESET</code>:
        </div>
        <input
          value={info.phrase}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          style={{
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            borderRadius: 6, padding: '8px 10px',
            fontFamily: t.fontMono, fontSize: 13, color: t.text0, outline: 'none',
          }}/>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn kind="ghost" size="sm" onClick={onCancel}>Cancelar</Btn>
          <button type="button"
            onClick={onConfirm}
            disabled={!enabled}
            style={{
              height: 28, padding: '0 14px', borderRadius: 7, border: 0,
              background: enabled ? t.err : t.bg3,
              color: enabled ? '#fff' : t.text3,
              fontFamily: t.fontSans, fontSize: 12, fontWeight: 700,
              cursor: enabled ? 'pointer' : 'not-allowed',
            }}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

// Mini-renderer de unified diff. Sin highlight sintáctico — solo colores
// por tipo de línea. Para inspección rápida del commit alcanza.
function DiffRender({ diff }: { diff: string }) {
  const t = useTokens();
  if (!diff.trim()) {
    return (
      <div style={{ padding: 20, color: t.text2, fontSize: 12 }}>
        Sin cambios en el diff (commit vacío o solo metadata).
      </div>
    );
  }
  const lines = diff.split('\n');
  return (
    <pre style={{
      margin: 0, padding: '8px 0',
      background: t.bg0,
      fontFamily: t.fontMono, fontSize: 11.5, lineHeight: 1.55,
    }}>
      {lines.map((line, i) => {
        let color = t.text1;
        let bg = 'transparent';
        if (line.startsWith('diff --git') || line.startsWith('index ')) {
          color = t.text3;
        } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
          color = t.text2;
        } else if (line.startsWith('@@')) {
          color = t.accent;
          bg = `color-mix(in oklch, ${t.accent} 8%, transparent)`;
        } else if (line.startsWith('+')) {
          color = t.ok;
          bg = `color-mix(in oklch, ${t.ok} 8%, transparent)`;
        } else if (line.startsWith('-')) {
          color = t.err;
          bg = `color-mix(in oklch, ${t.err} 8%, transparent)`;
        }
        return (
          <div key={i} style={{
            padding: '0 20px',
            color, background: bg,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>{line || ' '}</div>
        );
      })}
    </pre>
  );
}
