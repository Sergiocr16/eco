import { useEffect, useMemo, useRef, useState } from 'react';
import { useTokens, useTheme } from '@/design/theme';
import { isLightTheme } from '@/design/tokens';
import { IconX, IconDiff, IconSearch, IconCheck, IconTrash } from '@/design/icons';
import { apiFetch } from '@/lib/api';
import { useT } from '@/hooks/useI18n';
import { translateBackendError } from '@/lib/backend-errors';
import { useReviewState, isReviewModeEnabled } from '@/hooks/useReviewState';
import { emit as ecoEmit } from '@/lib/eco-bus';
import { MergeView } from '@codemirror/merge';
import { EditorState, Compartment, StateField } from '@codemirror/state';
import { EditorView, lineNumbers, Decoration, WidgetType, type DecorationSet } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { buildEcoCmExtension } from './FilesPanel/cm-theme';
import { loadLang } from './FilesPanel/lang-loader';

type DiffResult = {
  mode: 'git' | 'created' | 'plain' | 'not_found';
  diff: string;
  hasChanges: boolean;
  message?: string;
  // Cuando el request lleva withFullContent:true, el backend incluye el
  // contenido completo de antes/después para que la merge view pueda
  // renderear el archivo entero con highlights, no solo los hunks.
  before?: string;
  after?: string;
};

type PaneProps = {
  path: string;
  workspace: string;
  bubbleId?: string;
  // Opcional: si se pasa, muestra botón cerrar en el header (modo modal).
  onClose?: () => void;
  // Opcional: lista para navegar (sidebar de FilesPanel o flechas).
  pathList?: string[];
  onChangePath?: (newPath: string) => void;
  // Si true, no muestra el header con path (lo provee el contenedor padre).
  hideHeader?: boolean;
};

/**
 * `DiffPane` renderiza inline (sin overlay modal). Lo usa el FilesPanel
 * en su split layout y el `DiffViewer` (modal wrapper) más abajo.
 */
export function DiffPane({ path, workspace, bubbleId, onClose, pathList, onChangePath, hideHeader }: PaneProps) {
  const t = useTokens();
  const tr = useT();
  const review = useReviewState(bubbleId);
  const reviewMode = isReviewModeEnabled();
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Scope del diff:
  //  - 'unstaged' = working tree vs index. Muestra SOLO lo nuevo desde la
  //    última aceptación (default cuando reviewMode está ON).
  //  - 'all'      = working tree vs HEAD. Muestra TODOS los cambios desde
  //    el último commit (incluye lo que ya fue staged/aceptado).
  // El user lo alterna con el toggle "Nuevos / Todos los cambios" en el header.
  const [diffScope, setDiffScope] = useState<'unstaged' | 'all'>(reviewMode ? 'unstaged' : 'all');
  // Vista compacta = solo regiones cambiadas + 3 líneas de contexto (collapse
  // del resto). Vista completa = archivo entero expandido. Default compacto.
  const [compactMode, setCompactMode] = useState(true);
  // Hunks aceptados localmente (solo visual feedback — no toca el archivo).
  // El user "acepta" para marcar revisado; rechazar sí revierte el cambio.
  const [acceptedHunks, setAcceptedHunks] = useState<Set<number>>(new Set());
  // Reload trigger del diff tras revertir un hunk (cambia el bust).
  const [reloadBust, setReloadBust] = useState(0);
  // Mensaje transitorio tras una acción.
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setQuery('');
    setAcceptedHunks(new Set());
    setActionMsg(null);
    setDiffScope(reviewMode ? 'unstaged' : 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    if (!actionMsg) return;
    const id = setTimeout(() => setActionMsg(null), 2200);
    return () => clearTimeout(id);
  }, [actionMsg]);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    apiFetch('/file/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path, workspace,
        ...(bubbleId ? { bubbleId } : {}),
        // 'unstaged' = working tree vs index (lo nuevo desde aceptar).
        // 'all'      = working tree vs HEAD (todo desde el último commit).
        ...(diffScope === 'unstaged' ? { vsIndex: true } : {}),
        // Pedimos siempre el contenido completo de antes/después para la
        // merge view; si el backend no lo manda (versión vieja), el render
        // cae al renderer custom de hunks (fallback compat).
        withFullContent: true,
      }),
    })
      .then(async (r) => {
        if (cancelled) return;
        const data = await r.json().catch(() => ({}));
        if (!r.ok) setError(translateBackendError(data, `HTTP ${r.status}`));
        else setResult(data as DiffResult);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, workspace, bubbleId, reloadBust, diffScope]);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ─── Acciones del modo Cursor ────────────────────────────────────────────
  async function rejectHunkAt(hunkIndex: number, hunkRawText: string) {
    if (!path) return;
    setActionMsg(null);
    try {
      const r = await apiFetch('/file/revert-hunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, workspace, hunkText: hunkRawText, ...(bubbleId ? { bubbleId } : {}) }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        setActionMsg({ kind: 'ok', text: 'Hunk revertido' });
        // El archivo ya no tiene ese hunk — recargamos el diff. Los índices
        // de los demás hunks pueden haber cambiado: limpiamos accepted local.
        setAcceptedHunks(new Set());
        setReloadBust((n) => n + 1);
        if (bubbleId) ecoEmit('eco:git_refresh', { bubbleId });
      } else {
        setActionMsg({ kind: 'err', text: data.error || `Error HTTP ${r.status}` });
      }
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
    void hunkIndex;
  }

  // Count total de hunks en el diff actual — usado para auto-aceptar el
  // archivo cuando todos sus hunks fueron aceptados (UX cursor-like).
  const totalHunks = useMemo(() => {
    if (!result?.diff) return 0;
    const matches = result.diff.match(/^@@\s/gm);
    return matches ? matches.length : 0;
  }, [result?.diff]);

  async function acceptHunkAt(hunkIndex: number, hunkRawText: string) {
    if (!path) return;
    setActionMsg(null);
    try {
      const r = await apiFetch('/file/accept-hunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, workspace, hunkText: hunkRawText, ...(bubbleId ? { bubbleId } : {}) }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        setActionMsg({ kind: 'ok', text: 'Hunk aceptado' });
        // El hunk pasó al index → no aparece más en el diff unstaged.
        // Recargamos para que el user vea solo lo que queda por revisar.
        setAcceptedHunks(new Set());
        setReloadBust((n) => n + 1);
        // Si era el último, marcamos el archivo como aceptado completo.
        if (totalHunks > 0 && acceptedHunks.size + 1 >= totalHunks) {
          review.accept(path);
        }
        if (bubbleId) ecoEmit('eco:git_refresh', { bubbleId });
      } else {
        setActionMsg({ kind: 'err', text: data.error || `Error HTTP ${r.status}` });
      }
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
    void hunkIndex;
  }

  async function discardFileAll() {
    if (!path) return;
    setActionMsg(null);
    try {
      const r = await apiFetch('/file/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, workspace, ...(bubbleId ? { bubbleId } : {}) }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        // El archivo volvió al estado previo a los cambios. Lo desmarcamos
        // como aceptado. Si estamos en modal, lo cerramos; si estamos
        // inline (FilesPanel split), avanzamos al siguiente del pathList.
        review.unaccept(path);
        if (bubbleId) ecoEmit('eco:git_refresh', { bubbleId });
        if (onClose) {
          onClose();
        } else if (pathList && onChangePath) {
          const idx = pathList.indexOf(path);
          const next = pathList[idx + 1] ?? pathList[idx - 1];
          if (next) onChangePath(next);
        }
      } else {
        setActionMsg({ kind: 'err', text: data.error || `Error HTTP ${r.status}` });
      }
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
  }

  async function acceptFileAll() {
    if (!path) return;
    setActionMsg(null);
    try {
      // git add → todo el archivo pasa al index. Si el agente vuelve a
      // editar, los cambios nuevos aparecerán unstaged y se podrán
      // revisar como deltas incrementales.
      const r = await apiFetch('/file/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, workspace, ...(bubbleId ? { bubbleId } : {}) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        setActionMsg({ kind: 'err', text: data.error || `Error HTTP ${r.status}` });
        return;
      }
      review.accept(path);
      setAcceptedHunks(new Set());
      setReloadBust((n) => n + 1);
      setActionMsg({ kind: 'ok', text: 'Archivo aceptado — staged en el index' });
      if (bubbleId) ecoEmit('eco:git_refresh', { bubbleId });
    } catch (e) {
      setActionMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
      return;
    }
    // Auto-avanzar al siguiente pendiente si hay navegación habilitada.
    if (pathList && onChangePath) {
      const nextPath = findNextPending(path);
      if (nextPath) onChangePath(nextPath);
    }
  }

  // Devuelve el próximo path en la lista que NO esté aceptado (o null si
  // todos los siguientes ya están aceptados / no hay siguiente).
  function findNextPending(from: string): string | null {
    if (!pathList) return null;
    const idx = pathList.indexOf(from);
    if (idx < 0) return null;
    for (let i = idx + 1; i < pathList.length; i++) {
      if (!review.isAccepted(pathList[i]!)) return pathList[i]!;
    }
    // No hay pendientes después; intentamos antes (loop hacia atrás).
    for (let i = 0; i < idx; i++) {
      if (!review.isAccepted(pathList[i]!)) return pathList[i]!;
    }
    return null;
  }

  function navigate(dir: 'prev' | 'next') {
    if (!pathList || !path || !onChangePath) return;
    const idx = pathList.indexOf(path);
    if (idx < 0) return;
    const nextIdx = dir === 'next'
      ? Math.min(pathList.length - 1, idx + 1)
      : Math.max(0, idx - 1);
    if (nextIdx === idx) return;
    onChangePath(pathList[nextIdx]!);
  }

  // Keyboard shortcuts cuando hay navegación: ← / → para anterior/siguiente.
  useEffect(() => {
    if (!open || !pathList || !onChangePath) return;
    function onKey(e: KeyboardEvent) {
      // No interferir con inputs/textareas.
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) {
        navigate('next');
      } else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) {
        navigate('prev');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pathList, path, onChangePath]);

  const fileAccepted = path ? review.isAccepted(path) : false;
  // Navegación entre archivos: solo se usa internamente por findNextPending
  // tras aceptar un archivo (auto-advance al siguiente pendiente).
  void pathList; void onChangePath;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      background: t.windowBg,
      overflow: 'hidden',
    }}>
      {!hideHeader && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', borderBottom: `1px solid ${t.glassBorder}`,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: t.accentFaint, color: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconDiff size={13}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: t.fontMono, fontSize: 12.5, color: t.text0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{path}</div>
            <div style={{ fontSize: 11, color: t.text2, marginTop: 1 }}>
              {result?.mode === 'git' ? tr('diff.git') :
                result?.mode === 'created' ? tr('diff.created') :
                result?.mode === 'plain' ? tr('diff.plain') :
                result?.mode === 'not_found' ? tr('diff.not_found') :
                loading ? tr('diff.loading') : ''}
            </div>
          </div>
          {/* Toggle Nuevos / Todos — visible solo en review mode, porque
              sino "nuevo" y "todo" son lo mismo (no hay nada aceptado). */}
          {reviewMode && (
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
              borderRadius: 7, padding: 2,
            }}>
              {(['unstaged', 'all'] as const).map((s) => (
                <button key={s} type="button"
                  onClick={() => setDiffScope(s)}
                  title={s === 'unstaged'
                    ? 'Solo cambios sin aceptar (working tree vs index)'
                    : 'Todos los cambios desde el último commit (vs HEAD)'}
                  style={{
                    padding: '4px 10px', borderRadius: 5, border: 0,
                    background: diffScope === s ? t.accent : 'transparent',
                    color: diffScope === s ? t.accentOn : t.text2,
                    fontSize: 11, fontWeight: 600,
                    fontFamily: t.fontSans, cursor: 'pointer',
                  }}>
                  {s === 'unstaged' ? 'Nuevos' : 'Todos'}
                </button>
              ))}
            </div>
          )}

          {/* Toggle Compacto / Archivo completo — visible solo cuando el
              backend devolvió before/after (merge view disponible). */}
          {result?.before !== undefined && result?.after !== undefined && (
            <button type="button"
              onClick={() => setCompactMode(!compactMode)}
              title={compactMode
                ? 'Mostrar el archivo completo expandido'
                : 'Solo regiones cambiadas con 3 líneas de contexto'}
              style={{
                padding: '5px 10px', borderRadius: 7,
                background: t.bg2, color: t.text1,
                border: `1px solid ${t.glassBorder}`,
                fontSize: 11, fontWeight: 600,
                fontFamily: t.fontSans, cursor: 'pointer',
              }}>
              {compactMode ? 'Archivo completo' : 'Vista compacta'}
            </button>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 8,
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            color: t.text2,
          }}>
            <IconSearch size={12}/>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('diff.search')}
              spellCheck={false}
              autoCorrect="off"
              style={{
                background: 'transparent', border: 0, outline: 'none',
                fontFamily: t.fontMono, fontSize: 12, color: t.text0,
                width: 180,
              }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')}
                style={{ background: 'transparent', border: 0, color: t.text3, cursor: 'pointer', padding: 0 }}>
                <IconX size={12}/>
              </button>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 8, border: 0,
                background: 'transparent', color: t.text2, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <IconX size={14}/>
            </button>
          )}
        </div>
      )}

      {/* Toolbar de review estilo Cursor — solo cuando el setting
          "Revisar cambios estilo Cursor" está activo Y hay diff git real. */}
        {reviewMode && result?.mode === 'git' && result.hasChanges && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 18px',
            background: t.bg1,
            borderBottom: `1px solid ${t.glassBorder}`,
          }}>
            {fileAccepted && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 999,
                background: `color-mix(in oklch, ${t.ok} 18%, transparent)`,
                color: t.ok,
                fontSize: 10.5, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: 0.4,
              }}>
                <IconCheck size={9}/> Revisado
              </span>
            )}
            <span style={{ flex: 1 }}/>
            <button type="button" onClick={() => void discardFileAll()}
              title="Descartar todos los cambios del archivo (git checkout HEAD)"
              style={{
                padding: '6px 12px', borderRadius: 7,
                background: 'transparent', color: t.err,
                border: `1px solid ${t.err}`,
                fontSize: 11.5, cursor: 'pointer', fontFamily: t.fontSans, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              <IconTrash size={10}/> Descartar archivo
            </button>
            <button type="button" onClick={acceptFileAll}
              disabled={fileAccepted}
              title="Marcar el archivo como revisado (no toca el filesystem)"
              style={{
                padding: '6px 14px', borderRadius: 7,
                background: fileAccepted ? t.bg3 : t.ok, color: fileAccepted ? t.text3 : '#fff',
                border: 0,
                fontSize: 11.5, fontWeight: 600,
                cursor: fileAccepted ? 'default' : 'pointer',
                fontFamily: t.fontSans,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              <IconCheck size={10}/> {fileAccepted ? 'Revisado' : 'Aceptar archivo'}
            </button>
          </div>
        )}

        {/* Mensaje transitorio de acción */}
        {actionMsg && (
          <div style={{
            padding: '6px 18px',
            fontSize: 11.5, fontFamily: t.fontMono,
            color: actionMsg.kind === 'ok' ? t.ok : t.err,
            background: actionMsg.kind === 'ok'
              ? `color-mix(in oklch, ${t.ok} 10%, transparent)`
              : `color-mix(in oklch, ${t.err} 10%, transparent)`,
            borderBottom: `1px solid ${t.glassBorder}`,
          }}>{actionMsg.text}</div>
        )}

        <div style={{
          flex: 1, minHeight: 0, overflow: 'auto', padding: 0,
          display: 'flex', flexDirection: 'column',
          background: t.bg0,
        }}>
          {loading && (
            <div style={{ padding: 24, fontSize: 13, color: t.text2 }}>{tr('diff.loading')}</div>
          )}
          {error && (
            <div style={{ padding: 24, fontSize: 13, color: t.err }}>{error}</div>
          )}
          {result && !result.hasChanges && !error && (
            <div style={{ padding: 24, fontSize: 13, color: t.text2 }}>
              {result.message || tr('diff.no_changes')}
            </div>
          )}
          {result?.hasChanges && (
            // Merge view nueva cuando el backend devolvió before/after.
            // Fallback al renderer custom (hunks-only) si no.
            result.before !== undefined && result.after !== undefined ? (
              <DiffMergeView
                before={result.before}
                after={result.after}
                diff={result.diff}
                path={path}
                compactMode={compactMode}
                reviewMode={reviewMode}
                onAcceptHunk={acceptHunkAt}
                onRejectHunk={rejectHunkAt}
              />
            ) : (
              <DiffRender
                diff={result.diff} mode={result.mode} query={query}
                reviewMode={reviewMode}
                acceptedHunks={acceptedHunks}
                onAcceptHunk={acceptHunkAt}
                onRejectHunk={rejectHunkAt}
              />
            )
          )}
        </div>
    </div>
  );
}

// ─── DiffViewer (modal wrapper de DiffPane) ────────────────────────────────
// Mantiene compatibilidad con cualquier llamada existente que use modal:
// envuelve DiffPane con overlay + container con tamaño tipo modal.

type ModalProps = {
  open: boolean;
  path: string | null;
  workspace: string;
  bubbleId?: string;
  onClose: () => void;
  pathList?: string[];
  onChangePath?: (newPath: string) => void;
};

export function DiffViewer({ open, path, workspace, bubbleId, onClose, pathList, onChangePath }: ModalProps) {
  const t = useTokens();
  if (!open || !path) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 160,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1200px, 96vw)', height: '90vh',
          background: t.windowBg, border: `1px solid ${t.glassBorderHi}`,
          borderRadius: 18, boxShadow: t.shadowLg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
        <DiffPane
          path={path}
          workspace={workspace}
          bubbleId={bubbleId}
          onClose={onClose}
          pathList={pathList}
          onChangePath={onChangePath}
        />
      </div>
    </div>
  );
}

// ─── Merge view (archivo completo, scroll sincronizado) ──────────────────
// Renderea el archivo entero usando @codemirror/merge.MergeView (split view).
// Cuando `compactMode` está activo, las regiones sin cambios se colapsan
// dejando 3 líneas de contexto alrededor de cada chunk. Cuando está OFF,
// muestra el archivo completo expandido.
//
// Sync scroll, line numbers, syntax highlighting y theme son del shared
// cm-theme / cm-extensions del FilesPanel — la vista de diff y el editor
// se ven idénticos (consistencia visual).
//
// Read-only en ambos lados: este componente solo visualiza. Para Accept/
// Reject por hunk, ver Fase 4 (toolbar arriba del merge view).

type MergeViewProps = {
  before: string;
  after: string;
  diff: string;
  path: string;
  compactMode: boolean;
  reviewMode: boolean;
  onAcceptHunk?: (hunkIndex: number, hunkRawText: string) => void;
  onRejectHunk?: (hunkIndex: number, hunkRawText: string) => void;
};

// Theme estilo GitHub Desktop para el MergeView. Reemplaza el subrayado por
// gradiente de @codemirror/merge con fondos sólidos verde/rojo, pone fondo
// gris oscuro (no negro), y deja que el host scrollee (editor height auto).
// Como EditorView.theme tiene mayor precedencia que el baseTheme del merge,
// estos overrides ganan.
function githubDiffTheme(isLight: boolean) {
  const dark = !isLight;
  const bg = dark ? '#24292e' : '#ffffff';
  const gutterBg = dark ? '#1c2024' : '#f6f8fa';
  const gutterFg = dark ? '#768390' : '#8c959f';
  // Fondo de línea a opacidad total (verde/rojo sólido). En oscuro usamos los
  // verdes/rojos de GitHub que dejan legible el texto claro encima.
  const addLine = dark ? '#1b5e2a' : '#aceebb';
  const addGutter = dark ? '#238636' : '#6fdd8b';
  const delLine = dark ? '#6e2329' : '#ffc8c2';
  const delGutter = dark ? '#b62324' : '#ff9a91';
  return EditorView.theme({
    // Scroll: editor crece a su contenido, host (overflow:auto) scrollea.
    '&': { height: 'auto', backgroundColor: bg },
    '.cm-scroller': { overflow: 'visible', backgroundColor: bg },
    '.cm-content': { backgroundColor: bg },
    '.cm-gutters': { backgroundColor: gutterBg, color: gutterFg, border: 'none' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    // Fondos de línea: verde (después / lado b) y rojo (antes / lado a).
    '&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine, .cm-insertedLine': {
      backgroundColor: addLine,
    },
    '&.cm-merge-a .cm-changedLine, .cm-deletedChunk, .cm-deletedLine': {
      backgroundColor: delLine,
    },
    // Estilo GitHub Desktop: se tinta la LÍNEA entera, no las palabras. Por
    // eso anulamos el resaltado por-palabra (gradiente/box que se veía como
    // un parche gris encima del texto). El texto queda intacto.
    '&.cm-merge-b .cm-changedText': { background: 'transparent', backgroundImage: 'none' },
    '&.cm-merge-a .cm-changedText, .cm-deletedChunk .cm-deletedText': {
      background: 'transparent', backgroundImage: 'none',
    },
    '&.cm-merge-b .cm-deletedText': { background: 'transparent' },
    '.cm-insertedLine, .cm-deletedLine, .cm-deletedLine del': { textDecoration: 'none' },
    // Marcadores del gutter en las líneas cambiadas (números con tinte).
    '&.cm-merge-b .cm-changedLineGutter': { backgroundColor: addGutter },
    '&.cm-merge-a .cm-changedLineGutter, .cm-deletedLineGutter': { backgroundColor: delGutter },
  }, { dark });
}

// Datos frescos para los widgets de acción por chunk. Vive en un ref para que
// los botones (creados una vez al montar el MergeView) siempre usen los
// callbacks/hunks actuales sin recrear el editor.
type HunkCbs = {
  reviewMode: boolean;
  accept?: (i: number, raw: string) => void;
  reject?: (i: number, raw: string) => void;
  hunks: DiffHunk[];
  t: ReturnType<typeof useTokens>;
};

// Block widget que se inserta encima de cada chunk en el lado B (after) con
// botones Aceptar/Rechazar mapeados a /file/{accept,revert}-hunk del backend.
class HunkActionsWidget extends WidgetType {
  constructor(readonly idx: number, readonly get: () => HunkCbs) { super(); }
  eq(o: HunkActionsWidget) { return o.idx === this.idx; }
  ignoreEvent() { return true; }
  toDOM() {
    const c = this.get();
    const t = c.t;
    const wrap = document.createElement('div');
    wrap.style.cssText = `display:flex;gap:6px;justify-content:flex-end;align-items:center;padding:3px 10px;background:${t.bg1};border-top:1px solid ${t.glassBorder};font-family:${t.fontSans};`;
    const mk = (label: string, kind: 'accept' | 'reject') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      const color = kind === 'accept' ? t.ok : t.err;
      b.style.cssText = kind === 'accept'
        ? `padding:2px 10px;border-radius:6px;background:${t.ok};color:#fff;border:0;font-size:10.5px;font-weight:600;cursor:pointer;font-family:${t.fontSans};`
        : `padding:2px 10px;border-radius:6px;background:transparent;color:${color};border:1px solid color-mix(in oklch, ${color} 50%, transparent);font-size:10.5px;font-weight:600;cursor:pointer;font-family:${t.fontSans};`;
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const cc = this.get();
        const h = cc.hunks[this.idx];
        if (!h) return;
        if (kind === 'accept') cc.accept?.(this.idx, h.rawText);
        else cc.reject?.(this.idx, h.rawText);
      });
      return b;
    };
    if (c.reject) wrap.appendChild(mk('Rechazar', 'reject'));
    if (c.accept) wrap.appendChild(mk('Aceptar', 'accept'));
    return wrap;
  }
}

function DiffMergeView({
  before, after, diff, path, compactMode, reviewMode,
  onAcceptHunk, onRejectHunk,
}: MergeViewProps) {
  const t = useTokens();
  const { effectiveMode } = useTheme();
  const isLight = isLightTheme(effectiveMode);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MergeView | null>(null);
  const langCompartmentA = useRef(new Compartment());
  const langCompartmentB = useRef(new Compartment());
  // Index del chunk activo (para el toolbar de navegación + per-hunk action).
  const [activeChunk, setActiveChunk] = useState(0);
  // Parseo de hunks del unified diff: index aquí matchea con index del Chunk
  // que devuelve getChunks(view) — mismo orden, misma cantidad (los dos
  // vienen del mismo diff git).
  const hunks = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const totalChunks = hunks.length;

  // Datos frescos para los block widgets de Aceptar/Rechazar por chunk.
  // Se actualiza en cada render para que los botones (creados al montar el
  // editor) usen siempre los callbacks/hunks/tokens actuales.
  const cbsRef = useRef<HunkCbs>({ reviewMode, accept: onAcceptHunk, reject: onRejectHunk, hunks, t });
  useEffect(() => {
    cbsRef.current = { reviewMode, accept: onAcceptHunk, reject: onRejectHunk, hunks, t };
  });

  // Mount/unmount del MergeView. Lo recreamos cuando cambia el archivo
  // (different path o before/after totalmente distintos) — el contenido
  // chico no justifica diffing incremental.
  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;

    // Decoraciones: un block widget con botones Aceptar/Rechazar encima de
    // cada hunk en el lado B. Posicionamos por el `+C` del header del hunk
    // (línea de inicio en el archivo nuevo), NO por getChunks() — getChunks
    // llega async/vacío y dejaba la barra sin botones. El doc B = `after` es
    // el archivo completo, así que la línea del header mapea 1:1.
    function buildHunkDecos(state: EditorState): DecorationSet {
      const cbs = cbsRef.current;
      if (!cbs.accept && !cbs.reject) return Decoration.none;
      const ranges = cbs.hunks
        .map((h, i) => {
          const m = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)/.exec(h.header);
          const newStart = m ? Math.max(1, Number(m[1])) : 1;
          if (newStart > state.doc.lines) return null;
          const line = state.doc.line(newStart);
          return Decoration.widget({
            widget: new HunkActionsWidget(i, () => cbsRef.current),
            block: true, side: -1,
          }).range(line.from);
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (ranges.length === 0) return Decoration.none;
      return Decoration.set(ranges, true);
    }
    const hunkActionsField = StateField.define<DecorationSet>({
      create: (state) => buildHunkDecos(state),
      update: (_deco, tr) => buildHunkDecos(tr.state),
      provide: (f) => EditorView.decorations.from(f),
    });

    const sharedExtensions = [
      lineNumbers(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      buildEcoCmExtension(t, isLight),
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
      // Look estilo GitHub Desktop para el diff: fondo gris (no negro puro),
      // líneas agregadas en verde / eliminadas en rojo de FONDO (no subrayado),
      // y palabras cambiadas con fondo sólido. También arregla el scroll: el
      // editor crece a su contenido (height auto, scroller visible) y el
      // contenedor host hace el scroll.
      githubDiffTheme(isLight),
    ];

    const mv = new MergeView({
      parent: host,
      a: {
        doc: before,
        extensions: [
          ...sharedExtensions,
          langCompartmentA.current.of([]),
        ],
      },
      b: {
        doc: after,
        extensions: [
          ...sharedExtensions,
          langCompartmentB.current.of([]),
          // Botones Aceptar/Rechazar por chunk (block widgets).
          hunkActionsField,
        ],
      },
      collapseUnchanged: compactMode ? { margin: 3, minSize: 4 } : undefined,
      highlightChanges: true,
      gutter: true,
      orientation: 'a-b',
      // revertControls: 'a-to-b' agrega flechas para revertir chunk por chunk
      // del lado del editor. Lo dejamos OFF — usamos nuestros propios botones
      // Accept/Reject que mapean a /file/accept-hunk y /file/revert-hunk del
      // backend (que manejan el index correctamente).
      revertControls: undefined,
    });
    viewRef.current = mv;

    // El .cm-mergeView trae overflow-y:auto propio que competía con el scroll
    // del host. Lo desactivamos para que el host (acotado, overflow:auto) sea
    // el único scroller — un bloque alto que se desplaza completo. El fondo
    // gris lo seteamos inline para que gane sobre cualquier stylesheet del
    // theme base (evita el negro puro).
    mv.dom.style.overflowY = 'visible';
    // El theme de FilesPanel (compartido) pinta .cm-editor/.cm-content de negro
    // puro y a veces gana en el cascade. Forzamos el gris inline en los nodos
    // reales del merge — el inline gana sobre cualquier stylesheet. Los fondos
    // verde/rojo de línea son más específicos (van en .cm-changedLine), así que
    // no se pisan. setTimeout 0 para que el DOM del MergeView ya exista.
    const codeBg = isLight ? '#ffffff' : '#24292e';
    const gutBg = isLight ? '#f6f8fa' : '#1c2024';
    mv.dom.style.background = codeBg;
    setTimeout(() => {
      mv.dom.querySelectorAll<HTMLElement>('.cm-editor, .cm-scroller, .cm-content').forEach((el) => {
        el.style.background = codeBg;
      });
      mv.dom.querySelectorAll<HTMLElement>('.cm-gutters').forEach((el) => {
        el.style.background = gutBg;
      });
    }, 0);

    // Carga lazy del language pack (sintaxis para el path). Si no soporta el
    // tipo de archivo, queda en texto plano (ok).
    void loadLang(path).then((lang) => {
      if (lang && viewRef.current === mv) {
        mv.a.dispatch({ effects: langCompartmentA.current.reconfigure(lang) });
        mv.b.dispatch({ effects: langCompartmentB.current.reconfigure(lang) });
      }
    });

    return () => {
      try { mv.destroy(); } catch { /* noop */ }
      if (viewRef.current === mv) viewRef.current = null;
    };
    // Recreamos cuando cambia el archivo o el contenido — pesado pero simple.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before, after, path, compactMode, isLight]);

  // Navegación entre cambios: scroll determinístico a la línea de inicio del
  // hunk en el lado B (del header `+C`). No usamos los commands de merge
  // porque dependían de getChunks (que llegaba vacío).
  function goToChunk(idx: number) {
    const view = viewRef.current?.b;
    if (!view) return;
    const h = hunks[idx];
    if (!h) return;
    const m = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)/.exec(h.header);
    const newStart = m ? Math.max(1, Number(m[1])) : 1;
    const lineNo = Math.min(newStart, view.state.doc.lines);
    const pos = view.state.doc.line(lineNo).from;
    // El scroller es el host (overflow:auto), no el editor (overflow:visible),
    // así que scrolleamos el nodo DOM de la línea, que arrastra al ancestro
    // scrollable. scrollIntoView de CM no sirve acá (el editor no scrollea).
    const dn = view.domAtPos(pos).node;
    const el = (dn.nodeType === 3 ? dn.parentElement : dn) as HTMLElement | null;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setActiveChunk(idx);
  }
  function nextChunk() { goToChunk(Math.min(activeChunk + 1, totalChunks - 1)); }
  function prevChunk() { goToChunk(Math.max(activeChunk - 1, 0)); }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      {/* Toolbar de navegación entre chunks. Aceptar/Rechazar viven por chunk
          (block widgets dentro del editor B), no acá. */}
      {totalChunks > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          background: t.bg1,
          borderBottom: `1px solid ${t.glassBorder}`,
          fontSize: 11.5, fontFamily: t.fontSans,
        }}>
          <button type="button" onClick={prevChunk}
            title="Cambio anterior"
            style={navBtnStyle(t)}>◀</button>
          <span style={{ color: t.text2, fontFamily: t.fontMono, minWidth: 70, textAlign: 'center' }}>
            Cambio {activeChunk + 1} / {totalChunks}
          </span>
          <button type="button" onClick={nextChunk}
            title="Cambio siguiente"
            style={navBtnStyle(t)}>▶</button>
        </div>
      )}
      <div ref={hostRef} style={{
        flex: 1, minHeight: 0, overflow: 'auto',
        background: isLight ? '#ffffff' : '#24292e',
      }}/>
    </div>
  );
}

function navBtnStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    padding: '3px 8px', borderRadius: 6,
    background: 'transparent', color: t.text1,
    border: `1px solid ${t.glassBorder}`,
    fontSize: 11, cursor: 'pointer', fontFamily: t.fontSans,
  };
}

// ─── Parser de unified diff a hunks con líneas izquierda/derecha ───────────
type DiffSide = 'context' | 'added' | 'deleted';
type DiffRow = {
  oldNum: number | null;
  newNum: number | null;
  oldText: string | null;
  newText: string | null;
  side: DiffSide;
};
// `rawText` preserva las líneas crudas del hunk EXACTAMENTE como vinieron
// en el unified diff (incluyendo `@@`, prefijos `+`/`-`/` `, y `\ No newline`).
// Se manda al backend `POST /file/revert-hunk` para `git apply -R`.
type DiffHunk = { header: string; rows: DiffRow[]; rawText: string };

function parseUnifiedDiff(diff: string): DiffHunk[] {
  const lines = diff.split('\n');
  const hunks: DiffHunk[] = [];
  let cur: { header: string; oldStart: number; newStart: number; rows: DiffRow[]; rawLines: string[] } | null = null;
  let oldN = 0, newN = 0;
  const pendingDel: { num: number; text: string }[] = [];
  const flushPendingDel = () => {
    for (const d of pendingDel) {
      cur!.rows.push({ oldNum: d.num, newNum: null, oldText: d.text, newText: null, side: 'deleted' });
    }
    pendingDel.length = 0;
  };
  const flushHunk = () => {
    if (!cur) return;
    flushPendingDel();
    // `diff.split('\n')` puede dejar líneas vacías al final (artifact del
    // trailing newline). Eso rompe `git apply` con "patch does not apply"
    // porque el count del header @@ -A,B +C,D @@ no coincide con las líneas
    // reales del hunk. Limpiamos.
    while (cur.rawLines.length > 0 && cur.rawLines[cur.rawLines.length - 1] === '') {
      cur.rawLines.pop();
    }
    hunks.push({ header: cur.header, rows: cur.rows, rawText: cur.rawLines.join('\n') + '\n' });
  };

  for (const raw of lines) {
    if (raw.startsWith('diff --git') || raw.startsWith('index ') || raw.startsWith('new file') ||
        raw.startsWith('deleted file') || raw.startsWith('--- ') || raw.startsWith('+++ ') ||
        raw.startsWith('similarity ') || raw.startsWith('rename ')) {
      continue;
    }
    if (raw.startsWith('@@')) {
      flushHunk();
      // formato: @@ -A,B +C,D @@ ...
      const m = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(raw);
      const oldStart = m ? Number(m[1]) : 1;
      const newStart = m ? Number(m[2]) : 1;
      oldN = oldStart; newN = newStart;
      cur = { header: raw, oldStart, newStart, rows: [], rawLines: [raw] };
      continue;
    }
    if (!cur) continue;
    // Skip de líneas completamente vacías (artifact del split('\n') con
    // trailing newline). No son parte del hunk y rompen el conteo del header.
    if (raw === '') continue;
    // Acumulamos la línea cruda al patch del hunk antes del parsing tipado.
    cur.rawLines.push(raw);
    if (raw.startsWith('+')) {
      // Si tenemos una deleción "espejo" en cola, las pareamos en una sola fila.
      const pair = pendingDel.shift();
      cur.rows.push({
        oldNum: pair?.num ?? null,
        newNum: newN,
        oldText: pair?.text ?? null,
        newText: raw.slice(1),
        side: pair ? 'added' /* modificada */ : 'added',
      });
      // Si fue una mod par, marcamos ambos como modificación (re-uso 'added' visualmente).
      newN += 1;
    } else if (raw.startsWith('-')) {
      pendingDel.push({ num: oldN, text: raw.slice(1) });
      oldN += 1;
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file" — parte del hunk, ya quedó en rawLines.
      continue;
    } else {
      flushPendingDel();
      const text = raw.startsWith(' ') ? raw.slice(1) : raw;
      cur.rows.push({ oldNum: oldN, newNum: newN, oldText: text, newText: text, side: 'context' });
      oldN += 1; newN += 1;
    }
  }
  flushHunk();
  return hunks;
}

function DiffRender({
  diff, mode, query,
  reviewMode = false,
  acceptedHunks,
  onAcceptHunk,
  onRejectHunk,
}: {
  diff: string;
  mode: DiffResult['mode'];
  query: string;
  reviewMode?: boolean;
  acceptedHunks?: Set<number>;
  onAcceptHunk?: (hunkIndex: number, hunkRawText: string) => void;
  onRejectHunk?: (hunkIndex: number, hunkRawText: string) => void;
}) {
  const t = useTokens();
  const q = query.trim().toLowerCase();

  if (mode === 'plain') {
    return (
      <pre style={{
        margin: 0, padding: '14px 18px',
        fontFamily: t.fontMono, fontSize: 12, lineHeight: 1.6,
        color: t.text1, whiteSpace: 'pre',
        overflow: 'auto',
      }}>{highlightInPre(diff, q, t)}</pre>
    );
  }

  const allHunks = useMemo(() => parseUnifiedDiff(diff), [diff]);
  // Filtrar: dejamos hunks que tienen al menos una fila con match, pero
  // preservamos el índice ORIGINAL para correlar con el patch raw.
  type Indexed = DiffHunk & { origIndex: number };
  const visibleHunks: Indexed[] = useMemo(() => {
    const withIndex: Indexed[] = allHunks.map((h, i) => ({ ...h, origIndex: i }));
    if (!q) return withIndex;
    return withIndex
      .map((h) => ({
        ...h,
        rows: h.rows.filter((r) =>
          (r.oldText ?? '').toLowerCase().includes(q) ||
          (r.newText ?? '').toLowerCase().includes(q)
        ),
      }))
      .filter((h) => h.rows.length > 0);
  }, [allHunks, q]);

  if (q && visibleHunks.length === 0) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: t.text2 }}>
        No hay coincidencias para «{query}».
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {visibleHunks.map((h, i) => {
        const accepted = acceptedHunks?.has(h.origIndex) === true;
        return (
          <div key={h.origIndex} style={{ marginBottom: i === visibleHunks.length - 1 ? 0 : 8 }}>
            <div style={{
              padding: '6px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
              background: accepted
                ? `color-mix(in oklch, ${t.ok} 10%, transparent)`
                : `color-mix(in oklch, oklch(70% 0.14 240) 8%, transparent)`,
              color: accepted ? t.ok : 'oklch(70% 0.14 240)',
              fontFamily: t.fontMono, fontSize: 11.5,
              borderTop: `1px solid ${t.glassBorder}`,
              borderBottom: `1px solid ${t.glassBorder}`,
            }}>
              {accepted && <IconCheck size={11}/>}
              <span style={{
                flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{h.header}</span>
              {reviewMode && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button type="button"
                    onClick={() => onRejectHunk?.(h.origIndex, h.rawText)}
                    title="Revertir este cambio (git apply -R)"
                    style={{
                      padding: '3px 8px', borderRadius: 5,
                      background: 'transparent', color: t.err,
                      border: `1px solid color-mix(in oklch, ${t.err} 50%, transparent)`,
                      fontSize: 10.5, cursor: 'pointer', fontFamily: t.fontSans, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}>
                    <IconX size={9}/> Rechazar
                  </button>
                  <button type="button"
                    onClick={() => onAcceptHunk?.(h.origIndex, h.rawText)}
                    disabled={accepted}
                    title="Marcar este cambio como revisado"
                    style={{
                      padding: '3px 10px', borderRadius: 5,
                      background: accepted ? t.bg3 : t.ok, color: accepted ? t.text3 : '#fff',
                      border: 0,
                      fontSize: 10.5, fontWeight: 600,
                      cursor: accepted ? 'default' : 'pointer',
                      fontFamily: t.fontSans,
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}>
                    <IconCheck size={9}/> {accepted ? 'OK' : 'Aceptar'}
                  </button>
                </div>
              )}
            </div>
            <table style={{
              width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed',
              fontFamily: t.fontMono, fontSize: 12, lineHeight: 1.55,
            }}>
              <colgroup>
                <col style={{ width: 44 }}/>
                <col/>
                <col style={{ width: 44 }}/>
                <col/>
              </colgroup>
              <tbody>
                {h.rows.map((r, j) => <DiffRowView key={j} row={r} query={q}/>)}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// Resalta los matches en celdas split.
function highlightMatch(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) { out.push(text.slice(i)); break; }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <mark key={idx} style={{
        background: 'oklch(85% 0.18 90 / 0.55)',
        color: 'inherit', padding: 0, borderRadius: 2,
      }}>{text.slice(idx, idx + q.length)}</mark>
    );
    i = idx + q.length;
  }
  return out;
}

function highlightInPre(text: string, q: string, t: ReturnType<typeof useTokens>): React.ReactNode {
  if (!q) return text;
  // Para el modo plain devolvemos los fragments.
  void t;
  return highlightMatch(text, q);
}

function DiffRowView({ row, query }: { row: DiffRow; query: string }) {
  const t = useTokens();
  const leftHas = row.oldText !== null;
  const rightHas = row.newText !== null;
  // Una fila pareada con texto a ambos lados que difieren = modificación.
  const isMod = leftHas && rightHas && row.oldText !== row.newText;
  const leftKind: DiffSide = leftHas && (row.side === 'deleted' || isMod) ? 'deleted' : 'context';
  const rightKind: DiffSide = rightHas && (row.side === 'added' || isMod) ? 'added' : 'context';

  const cellStyle = (kind: DiffSide): React.CSSProperties => {
    const bg = kind === 'added'
      ? `color-mix(in oklch, ${t.ok} 12%, transparent)`
      : kind === 'deleted'
        ? `color-mix(in oklch, ${t.err} 12%, transparent)`
        : 'transparent';
    const fg = kind === 'added' ? t.ok
      : kind === 'deleted' ? t.err
      : t.text1;
    return {
      padding: '0 10px',
      whiteSpace: 'pre',
      background: bg, color: fg,
      borderRight: `1px solid ${t.glassBorder}`,
      verticalAlign: 'top',
      overflow: 'hidden', textOverflow: 'ellipsis',
    };
  };
  const numStyle = (kind: DiffSide): React.CSSProperties => {
    const bg = kind === 'added'
      ? `color-mix(in oklch, ${t.ok} 18%, transparent)`
      : kind === 'deleted'
        ? `color-mix(in oklch, ${t.err} 18%, transparent)`
        : `color-mix(in oklch, ${t.text0} 4%, transparent)`;
    return {
      width: 44, padding: '0 6px', textAlign: 'right',
      color: t.text3, background: bg,
      borderRight: `1px solid ${t.glassBorder}`,
      userSelect: 'none', verticalAlign: 'top',
      fontVariantNumeric: 'tabular-nums',
    };
  };

  return (
    <tr>
      <td style={numStyle(leftKind)}>{row.oldNum ?? ''}</td>
      <td style={cellStyle(leftKind)}>
        {leftHas ? (
          <span style={{ display: 'inline-block', width: 14, color: t.text3 }}>
            {leftKind === 'deleted' ? '−' : ' '}
          </span>
        ) : null}
        <span>{leftHas ? highlightMatch(row.oldText ?? '', query) : ''}</span>
      </td>
      <td style={numStyle(rightKind)}>{row.newNum ?? ''}</td>
      <td style={cellStyle(rightKind)}>
        {rightHas ? (
          <span style={{ display: 'inline-block', width: 14, color: t.text3 }}>
            {rightKind === 'added' ? '+' : ' '}
          </span>
        ) : null}
        <span>{rightHas ? highlightMatch(row.newText ?? '', query) : ''}</span>
      </td>
    </tr>
  );
}


