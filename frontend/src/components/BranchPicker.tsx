import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useTokens } from '@/design/theme';
import { Glass } from '@/design/primitives';
import { IconBranch, IconSearch, IconX, IconCheck, IconResume, IconEdit } from '@/design/icons';
import { apiFetch } from '@/lib/api';

type BranchInfo = {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  lastCommit?: { sha: string; subject: string; author: string; relTime: string };
};

type BranchListResult = {
  current: string | null;
  detached: boolean;
  branches: BranchInfo[];
  worktree: string;
};

type Props = {
  workspace: string;
  bubbleId: string;
};

export function BranchPicker({ workspace, bubbleId }: Props) {
  const t = useTokens();
  const [data, setData] = useState<BranchListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'local' | 'remote'>('local');
  const [busyBranch, setBusyBranch] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'fetch' | 'pull' | null>(null);
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  // Cuando el backend devuelve checkout.dirty_working_tree, abrimos este diálogo
  // para preguntar al usuario qué hacer con los cambios locales.
  const [dirtyPrompt, setDirtyPrompt] = useState<{
    branch: string;
    create: boolean;
    files: string[];
  } | null>(null);

  const refresh = async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspace, bubbleId });
      const r = await apiFetch(`/git/branches?${params}`);
      if (r.ok) {
        const d = await r.json() as BranchListResult;
        setData(d);
      } else {
        setActionMsg({ kind: 'err', text: `HTTP ${r.status}` });
      }
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, bubbleId]);

  useEffect(() => {
    if (!expanded) return;
    const iv = setInterval(() => void refresh(), 12_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  async function doRename() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setActionMsg(null);
    try {
      const r = await apiFetch('/git/rename-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, bubbleId, newName: trimmed }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setActionMsg({ kind: 'ok', text: d.message || 'Rama renombrada' });
        setRenaming(false); setNewName('');
        await refresh();
      } else {
        setActionMsg({ kind: 'err', text: d.error || 'Rename falló' });
      }
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
  }

  async function run(action: 'checkout' | 'pull' | 'fetch', branch?: string, create = false, mode: 'plain' | 'carry' | 'discard' = 'plain') {
    if (action === 'checkout' && !branch) return;
    setActionMsg(null);
    if (action === 'checkout' && branch) setBusyBranch(branch);
    else setBusyAction(action as 'fetch' | 'pull');
    try {
      const body: Record<string, unknown> = { workspace, bubbleId };
      if (action === 'checkout') { body.branch = branch; body.create = create; body.mode = mode; }
      const r = await apiFetch(`/git/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setActionMsg({ kind: 'ok', text: d.message || 'OK' });
        await refresh();
      } else if (action === 'checkout' && d.code === 'checkout.dirty_working_tree' && branch) {
        // No mostramos el error: abrimos el diálogo para que el user decida.
        setDirtyPrompt({
          branch,
          create,
          files: Array.isArray(d.files) ? d.files : [],
        });
      } else {
        setActionMsg({ kind: 'err', text: d.error || `Error en ${action}` });
      }
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusyBranch(null);
      setBusyAction(null);
    }
  }

  const filtered = useMemo(() => {
    const list = data?.branches ?? [];
    const wantRemote = tab === 'remote';
    const base = list.filter((b) => b.isRemote === wantRemote);
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((b) =>
      b.name.toLowerCase().includes(q) ||
      (b.lastCommit?.subject ?? '').toLowerCase().includes(q),
    );
  }, [data, tab, query]);

  const currentBranch = data?.current ?? null;
  const currentInfo = data?.branches.find((b) => b.isCurrent);
  const noRepo = !!data && data.branches.length === 0 && !data.current;

  return (
    <Glass radius={10} style={{ padding: 8 }}>
      {/* Header compacto */}
      {renaming && !noRepo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6,
            background: t.accentFaint, color: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <IconBranch size={11}/>
          </div>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="nuevo-nombre-rama"
            style={{
              flex: 1, minWidth: 0,
              background: t.bg2, border: `1px solid ${t.accent}`,
              borderRadius: 6, padding: '4px 7px',
              fontFamily: t.fontMono, fontSize: 11, color: t.text0,
              outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doRename();
              if (e.key === 'Escape') { setRenaming(false); setNewName(''); }
            }}
          />
          <button type="button" onClick={() => void doRename()}
            title="Guardar (Enter)"
            style={{
              width: 22, height: 22, border: 0, borderRadius: 5, padding: 0,
              background: t.accent, color: t.accentOn, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <IconCheck size={11}/>
          </button>
          <button type="button" onClick={() => { setRenaming(false); setNewName(''); }}
            title="Cancelar (Esc)"
            style={{
              width: 22, height: 22, border: 0, borderRadius: 5, padding: 0,
              background: t.bg3, color: t.text2, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <IconX size={11}/>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            disabled={noRepo}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              padding: '2px 0', border: 0, background: 'transparent',
              cursor: noRepo ? 'default' : 'pointer',
              color: t.text0, textAlign: 'left', minWidth: 0,
            }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              background: t.accentFaint, color: t.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <IconBranch size={11}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: t.fontMono, fontSize: 11.5, color: t.text0, fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                lineHeight: 1.3,
              }}>
                {loading && !data ? '…' : (currentBranch ?? (noRepo ? 'sin git' : '—'))}
              </div>
              {(currentInfo || (data && data.branches.length > 0)) && (
                <div style={{
                  fontSize: 10, color: t.text3, marginTop: 0, display: 'flex', gap: 6, alignItems: 'center',
                }}>
                  {currentInfo?.ahead != null && currentInfo.ahead > 0 && (
                    <span style={{ color: t.ok, fontFamily: t.fontMono }}>↑{currentInfo.ahead}</span>
                  )}
                  {currentInfo?.behind != null && currentInfo.behind > 0 && (
                    <span style={{ color: t.warn, fontFamily: t.fontMono }}>↓{currentInfo.behind}</span>
                  )}
                  <span>{data!.branches.length} branches</span>
                </div>
              )}
            </div>
            {!noRepo && (
              <span style={{
                color: t.text3, fontSize: 10, fontFamily: t.fontMono,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 16, height: 16,
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 160ms ease',
              }}>›</span>
            )}
          </button>
          {!noRepo && currentBranch && (
            <button
              type="button"
              onClick={() => { setNewName(currentBranch); setRenaming(true); }}
              title="Renombrar rama actual"
              style={{
                width: 22, height: 22, border: 0, borderRadius: 5, padding: 0,
                background: 'transparent', color: t.text3, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
              <IconEdit size={11}/>
            </button>
          )}
        </div>
      )}

      {/* Acciones Fetch / Pull en un toolbar compacto */}
      {!noRepo && (
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <ToolbarBtn icon={IconResume} loading={busyAction === 'fetch'} onClick={() => void run('fetch')}>
            Fetch
          </ToolbarBtn>
          <ToolbarBtn primary loading={busyAction === 'pull'} onClick={() => void run('pull')}>
            Pull
          </ToolbarBtn>
        </div>
      )}

      {/* Mensaje de acción */}
      <AnimatePresence>
        {actionMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.16 }}
            style={{
              overflow: 'hidden',
            }}>
            <div style={{
              padding: '5px 7px',
              borderRadius: 6,
              background: actionMsg.kind === 'ok'
                ? `color-mix(in oklch, ${t.ok} 14%, transparent)`
                : `color-mix(in oklch, ${t.err} 14%, transparent)`,
              color: actionMsg.kind === 'ok' ? t.ok : t.err,
              fontFamily: t.fontMono, fontSize: 10.5,
              display: 'flex', alignItems: 'flex-start', gap: 5,
              maxHeight: 90, overflow: 'auto',
              wordBreak: 'break-word',
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>
                {actionMsg.kind === 'ok' ? <IconCheck size={9}/> : '!'}
              </span>
              <span style={{ flex: 1, whiteSpace: 'pre-wrap', minWidth: 0 }}>{actionMsg.text}</span>
              <button type="button" onClick={() => setActionMsg(null)}
                style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                <IconX size={9}/>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panel expandido */}
      <AnimatePresence initial={false}>
        {expanded && !noRepo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}>
            <div style={{
              marginTop: 8,
              borderTop: `1px solid ${t.glassBorder}`,
              paddingTop: 8,
            }}>
              {/* Búsqueda */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 7px', borderRadius: 6,
                background: t.bg2, border: `1px solid ${t.glassBorder}`,
                marginBottom: 6,
              }}>
                <IconSearch size={9}/>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  style={{
                    flex: 1, minWidth: 0,
                    background: 'transparent', border: 0, outline: 'none',
                    fontFamily: t.fontMono, fontSize: 11, color: t.text0,
                  }}
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')}
                    style={{ background: 'transparent', border: 0, color: t.text3, cursor: 'pointer', padding: 0 }}>
                    <IconX size={9}/>
                  </button>
                )}
              </div>
              {/* Tabs local / remoto */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                <SubTab active={tab === 'local'} onClick={() => setTab('local')}>
                  Local {data ? `· ${data.branches.filter((b) => !b.isRemote).length}` : ''}
                </SubTab>
                <SubTab active={tab === 'remote'} onClick={() => setTab('remote')}>
                  Remoto {data ? `· ${data.branches.filter((b) => b.isRemote).length}` : ''}
                </SubTab>
              </div>
              {/* Lista */}
              <div style={{
                maxHeight: 220, overflow: 'auto',
                display: 'flex', flexDirection: 'column', gap: 1,
                margin: '0 -2px',
              }}>
                {loading && !data ? (
                  <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: t.text3 }}>Cargando…</div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: t.text3 }}>
                    {query ? 'Sin coincidencias' : (tab === 'local' ? 'Sin branches locales' : 'Sin branches remotas')}
                  </div>
                ) : (
                  filtered.map((b) => (
                    <BranchRow
                      key={b.name}
                      branch={b}
                      busy={busyBranch === b.name}
                      onClick={() => void run('checkout', b.name)}
                    />
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diálogo de conflicto: cambios sin commitear bloquean el checkout. */}
      <AnimatePresence>
        {dirtyPrompt && (
          <DirtyChangesDialog
            branch={dirtyPrompt.branch}
            files={dirtyPrompt.files}
            onCancel={() => setDirtyPrompt(null)}
            onCarry={async () => {
              const p = dirtyPrompt;
              setDirtyPrompt(null);
              await run('checkout', p.branch, p.create, 'carry');
            }}
            onDiscard={async () => {
              const p = dirtyPrompt;
              setDirtyPrompt(null);
              await run('checkout', p.branch, p.create, 'discard');
            }}
          />
        )}
      </AnimatePresence>
    </Glass>
  );
}

function DirtyChangesDialog({
  branch, files, onCancel, onCarry, onDiscard,
}: {
  branch: string;
  files: string[];
  onCancel: () => void;
  onCarry: () => void;
  onDiscard: () => void;
}) {
  const t = useTokens();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Portal a <body> para esquivar contenedores con transform/filter que
  // capturarían el position:fixed y lo posicionarían respecto a ellos en
  // lugar del viewport.
  return createPortal((
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onCancel}>
      <motion.div
        initial={{ scale: 0.96, y: 6 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 6 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          background: t.bg1,
          border: `1px solid ${t.glassBorder}`,
          borderRadius: 16,
          padding: 20,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        }}>
          <span style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: `color-mix(in oklch, ${t.warn} 16%, transparent)`,
            color: t.warn,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 600,
          }}>!</span>
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: 0, fontSize: 15, fontWeight: 600, color: t.text0, letterSpacing: -0.2,
            }}>Cambios sin commitear</h3>
            <div style={{ fontSize: 12, color: t.text2, marginTop: 2 }}>
              No podés saltar a <code style={{ fontFamily: t.fontMono, color: t.text1 }}>{branch}</code> sin decidir qué hacer con los cambios actuales.
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div style={{
            marginTop: 6, marginBottom: 14,
            padding: '8px 10px', borderRadius: 8,
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            maxHeight: 140, overflowY: 'auto',
          }}>
            <div style={{
              fontSize: 10, color: t.text3, textTransform: 'uppercase',
              letterSpacing: 0.5, fontWeight: 600, marginBottom: 6,
            }}>{files.length} {files.length === 1 ? 'archivo' : 'archivos'} con cambios</div>
            {files.map((f) => (
              <div key={f} style={{
                fontFamily: t.fontMono, fontSize: 11.5, color: t.text1,
                padding: '2px 0',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{f}</div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {/* Opción: llevar */}
          <button type="button" onClick={onCarry}
            style={{
              padding: '12px 14px', borderRadius: 10, textAlign: 'left',
              background: t.bg2, color: t.text0,
              border: `1px solid ${t.accent}`,
              cursor: 'pointer',
              transition: 'background 140ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = t.bg3; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = t.bg2; }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.accent }}>
              Llevar los cambios a {branch}
            </div>
            <div style={{ fontSize: 11.5, color: t.text2, marginTop: 2, lineHeight: 1.4 }}>
              Stash → checkout → pop. Si hay conflictos en la otra rama, los resolvés vos.
            </div>
          </button>

          {/* Opción: descartar (con doble confirmación) */}
          <button type="button"
            onClick={() => {
              if (confirmDiscard) { onDiscard(); return; }
              setConfirmDiscard(true);
            }}
            style={{
              padding: '12px 14px', borderRadius: 10, textAlign: 'left',
              background: confirmDiscard ? `color-mix(in oklch, ${t.err} 14%, transparent)` : t.bg2,
              color: t.text0,
              border: `1px solid ${confirmDiscard ? t.err : t.glassBorder}`,
              cursor: 'pointer',
              transition: 'background 140ms, border-color 140ms',
            }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: confirmDiscard ? t.err : t.text1 }}>
              {confirmDiscard ? '¿Seguro? Click otra vez para descartar' : `Descartar y cambiar a ${branch}`}
            </div>
            <div style={{ fontSize: 11.5, color: t.text2, marginTop: 2, lineHeight: 1.4 }}>
              {confirmDiscard
                ? 'Esto es irreversible. Tus cambios se perderán.'
                : 'Tirar los cambios sin commitear y saltar a la otra rama.'}
            </div>
          </button>
        </div>

        <button type="button" onClick={onCancel}
          style={{
            width: '100%', padding: '9px 14px', borderRadius: 9,
            background: 'transparent', color: t.text2,
            border: `1px solid ${t.glassBorder}`,
            fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer',
          }}>Cancelar</button>
      </motion.div>
    </motion.div>
  ), document.body);
}

function ToolbarBtn({
  icon: Icon, primary, loading, onClick, children,
}: {
  icon?: (p: { size?: number }) => JSX.Element;
  primary?: boolean;
  loading?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const t = useTokens();
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        height: 26, padding: '0 8px', border: 0, borderRadius: 6,
        background: primary
          ? (h ? t.accent : t.accentDim)
          : (h ? t.bg3 : t.bg2),
        color: primary ? t.accentOn : t.text1,
        cursor: loading ? 'wait' : 'pointer',
        fontFamily: t.fontSans, fontSize: 11, fontWeight: 500,
        opacity: loading ? 0.6 : 1,
        transition: 'background 140ms',
      }}>
      {Icon && !loading && <Icon size={10}/>}
      {loading && <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: 'currentColor',
        animation: 'eco-shimmer 0.9s ease-in-out infinite',
      }}/>}
      <span>{children}</span>
    </button>
  );
}

function SubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '3px 7px', borderRadius: 5, border: 0, cursor: 'pointer',
        background: active ? t.bg3 : 'transparent',
        color: active ? t.accent : t.text2,
        fontFamily: t.fontSans, fontSize: 10, fontWeight: 500,
      }}>{children}</button>
  );
}

function BranchRow({
  branch, busy, onClick,
}: {
  branch: BranchInfo;
  busy: boolean;
  onClick: () => void;
}) {
  const t = useTokens();
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={branch.isCurrent || busy}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 6px', border: 0, borderRadius: 6,
        background: branch.isCurrent
          ? `color-mix(in oklch, ${t.accent} 14%, transparent)`
          : h ? t.bg3 : 'transparent',
        color: t.text1,
        cursor: (branch.isCurrent || busy) ? 'default' : 'pointer',
        textAlign: 'left',
        opacity: busy ? 0.6 : 1,
        minHeight: 26,
      }}>
      <div style={{
        width: 14, height: 14, flexShrink: 0,
        color: branch.isCurrent ? t.accent : t.text3,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {branch.isCurrent ? <IconCheck size={11}/> : <IconBranch size={10}/>}
      </div>
      <span style={{
        flex: 1, minWidth: 0,
        fontFamily: t.fontMono, fontSize: 11, color: t.text0, fontWeight: 500,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{branch.name}</span>
      {branch.ahead != null && branch.ahead > 0 && (
        <span style={{ fontFamily: t.fontMono, fontSize: 9, color: t.ok, flexShrink: 0 }}>↑{branch.ahead}</span>
      )}
      {branch.behind != null && branch.behind > 0 && (
        <span style={{ fontFamily: t.fontMono, fontSize: 9, color: t.warn, flexShrink: 0 }}>↓{branch.behind}</span>
      )}
    </button>
  );
}
