import { cssZoom } from '@/lib/ui-zoom';
import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { useTokens, useTheme } from '@/design/theme';
import { isLightTheme } from '@/design/tokens';
import { useT } from '@/hooks/useI18n';
import { IconX, IconArrowUpRight, IconFileText } from '@/design/icons';
import { cx } from '@/design/primitives';
import { isMobileNow } from '@/hooks/useMediaQuery';
import { apiFetch } from '@/lib/api';
import { baseExtensions, type SelectionInfo } from './cm-extensions';
import { FileTypeIcon } from './file-icon';
import { loadLang } from './lang-loader';
import { openInIde, resolveAbsPath, getExternalIde, ideDisplayLabel } from '@/lib/ide-uri';
import type { OpenFile } from './types';

type Props = {
  file: OpenFile | null;
  openFiles: OpenFile[];
  bubbleId: string;
  workspace: string;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onContentChange: (path: string, content: string) => void;
  onSendToClaude: (args: {
    relPath: string;
    startLine: number;
    endLine: number;
    selectedText: string;
    langTag: string;
  }) => void;
  onSave: (path: string) => void;
  pendingGoto?: { path: string; line: number; column: number } | null;
  onGotoConsumed?: () => void;
  onRevealDir?: (dirPath: string) => void;
  onFindUsages?: (word: string) => void;
};

export function FileEditor({
  file, openFiles, bubbleId, workspace, onActivate, onClose, onContentChange, onSendToClaude, onSave,
  pendingGoto, onGotoConsumed, onRevealDir, onFindUsages,
}: Props) {
  const t = useTokens();
  const { effectiveMode } = useTheme();
  const isLight = isLightTheme(effectiveMode);
  const tr = useT();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartmentRef = useRef<Compartment>(new Compartment());
  const themeCompartmentRef = useRef<Compartment>(new Compartment());
  // Mantener callbacks frescos sin re-crear el editor en cada render.
  const cbRef = useRef({ onContentChange, onSendToClaude, onSave, file, onFindUsages });
  useEffect(() => { cbRef.current = { onContentChange, onSendToClaude, onSave, file, onFindUsages }; }, [onContentChange, onSendToClaude, onSave, file, onFindUsages]);

  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [hostRect, setHostRect] = useState<DOMRect | null>(null);

  const activeFile = file;
  const isImage = activeFile ? isImagePath(activeFile.path) : false;
  const editable = !!activeFile && !activeFile.binary && !activeFile.truncated && !isImage;

  // ─── Mount del EditorView una sola vez por host ──────────────────────────
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          langCompartmentRef.current.of([]),
          themeCompartmentRef.current.of(baseExtensions({
            readOnly: true,
            tokens: t,
            isLight,
            onSave: () => {
            const f = cbRef.current.file;
            if (f) cbRef.current.onSave(f.path);
          },
            onChange: (doc) => {
              const f = cbRef.current.file;
              if (f && !f.binary && !f.truncated) cbRef.current.onContentChange(f.path, doc);
            },
            onSelectionChange: (sel) => {
              setSelection(sel.empty ? null : sel);
            },
            onFindUsages: (word) => cbRef.current.onFindUsages?.(word),
          })),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Sincronizar doc cuando cambia el archivo activo ─────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!activeFile) {
      // No hay archivo seleccionado — limpiamos el editor.
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: '' },
        effects: langCompartmentRef.current.reconfigure([]),
      });
      return;
    }
    const current = view.state.doc.toString();
    if (current !== activeFile.content) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: activeFile.content },
      });
    }
    // Recompute readonly: setState reemplaza extensions, así que reconfiguramos
    // la base completa usando el compartment de theme (que aloja todas las
    // extensiones base).
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(baseExtensions({
        readOnly: !editable,
        tokens: t,
        isLight,
        onSave: () => {
          const f = cbRef.current.file;
          if (f) cbRef.current.onSave(f.path);
        },
        onChange: (doc) => {
          const f = cbRef.current.file;
          if (f && !f.binary && !f.truncated) cbRef.current.onContentChange(f.path, doc);
        },
        onSelectionChange: (sel) => {
          setSelection(sel.empty ? null : sel);
        },
        onFindUsages: (word) => cbRef.current.onFindUsages?.(word),
      })),
    });
    // Cargar lang pack para este archivo. Async — al volver, reconfiguramos.
    let cancelled = false;
    (async () => {
      const lang = await loadLang(activeFile.path);
      if (cancelled || !viewRef.current) return;
      viewRef.current.dispatch({
        effects: langCompartmentRef.current.reconfigure(lang ?? []),
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile?.path, editable, t, isLight]);

  // ─── Pending goto (Global Search → línea/columna) ────────────────────────
  useEffect(() => {
    if (!pendingGoto || !activeFile || pendingGoto.path !== activeFile.path) return;
    const view = viewRef.current;
    if (!view) return;
    // Esperar al próximo paint para que el doc esté actualizado y CM tenga
    // las líneas calculadas. queueMicrotask es suficiente porque el dispatch
    // del nuevo doc ya ocurrió en el effect anterior.
    queueMicrotask(() => {
      try {
        const doc = view.state.doc;
        const lineNum = Math.min(Math.max(1, pendingGoto.line), doc.lines);
        const line = doc.line(lineNum);
        const col = Math.min(Math.max(0, pendingGoto.column - 1), line.length);
        const pos = line.from + col;
        view.dispatch({
          selection: { anchor: pos, head: pos },
          scrollIntoView: true,
          effects: EditorView.scrollIntoView(pos, { y: 'center' }),
        });
        view.focus();
      } catch { /* noop */ }
      onGotoConsumed?.();
    });
  }, [pendingGoto, activeFile, onGotoConsumed]);

  // ─── Tracking del rect del host para posicionar el floating button ───────
  useEffect(() => {
    if (!hostRef.current) return;
    const obs = new ResizeObserver(() => {
      if (hostRef.current) setHostRect(hostRef.current.getBoundingClientRect());
    });
    obs.observe(hostRef.current);
    setHostRect(hostRef.current.getBoundingClientRect());
    return () => obs.disconnect();
  }, []);

  const hasOpenFiles = openFiles.length > 0;

  // Renderizamos SIEMPRE el host del EditorView (escondido cuando no hay
  // archivos abiertos) para que CM se monte en el primer paint. Sin esto,
  // el mount useEffect corría con hostRef === null en el render inicial
  // (placeholder "ningún archivo") y el editor nunca se creaba aunque
  // después el user abriera un archivo.
  return (
    <>
      {/* Tabs de archivos abiertos — solo si hay alguno */}
      {hasOpenFiles && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${t.line}`,
        flexShrink: 0, padding: isMobileNow() ? '6px 8px' : '10px 12px 10px 14px',
      }}>
        <div className="eco-noscrollbar" style={{ display: 'flex', gap: 4, overflow: 'auto', minWidth: 0, flex: 1 }}>
        {openFiles.map((f) => {
          const isActive = activeFile && f.path === activeFile.path;
          const isDirty = f.content !== f.originalContent;
          return (
            <div
              key={f.path}
              role="tab"
              aria-selected={!!isActive}
              className={cx('eco-subtab', isActive && 'is-on')}
              style={{ gap: 8, height: 32, padding: '0 6px 0 12px', borderRadius: 16 }}
              onClick={() => onActivate(f.path)}
              title={f.path}
            >
              <FileTypeIcon path={f.path} size={13}/>
              <span className="eco-truncate" style={{ maxWidth: 200 }}>
                {f.path.split('/').pop()}
              </span>
              {isDirty && (
                <span className="eco-dot eco-dot--warn" title={tr('files.editor.dirty')}/>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(f.path); }}
                className="eco-iconbtn"
                style={{ width: 22, height: 22 }}
                aria-label={tr('files.editor.close_tab')}
                title={tr('files.editor.close_tab')}
              >
                <IconX size={12}/>
              </button>
            </div>
          );
        })}
        </div>
        {/* Open in IDE — abre el archivo activo en VSCode/IntelliJ/Cursor
            (configurable en Settings → Editor externo) en la línea exacta
            del cursor. Útil cuando necesitás breakpoints reales: Eco no
            tiene debugger, el IDE externo sí. */}
        {activeFile && (() => {
          const ide = getExternalIde();
          if (ide === 'none') return null;
          return (
            <button
              type="button"
              onClick={async () => {
                const view = viewRef.current;
                const f = activeFile;
                if (!f) return;
                const pos = view?.state.selection.main.head ?? 0;
                const lineInfo = view?.state.doc.lineAt(pos);
                const line = lineInfo?.number ?? 1;
                const col = lineInfo ? (pos - lineInfo.from + 1) : 1;
                const abs = resolveAbsPath(workspace, f.path);
                const result = await openInIde(abs, line, col);
                if (!result.ok) {
                  cbRef.current = cbRef.current; // noop — preserva ref
                  // Toast simple via alert si no hay sistema de toast; reemplazable.
                  console.warn('[FileEditor] openInIde falló', result);
                }
              }}
              title={`Abrir en ${ideDisplayLabel(ide)} en la línea actual`}
              className="eco-btn eco-btn--xs eco-btn--outline">
              <IconArrowUpRight size={13}/>{ideDisplayLabel(ide)}
            </button>
          );
        })()}
      </div>
      )}
      {/* Breadcrumb de ruta del archivo activo — segmentos clickables */}
      {activeFile && !isImage && (
        <Breadcrumb path={activeFile.path} onRevealDir={onRevealDir}/>
      )}
      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {activeFile?.truncated && (
          <div className="eco-banner eco-banner--warn" style={{ margin: '8px 12px 0', flexShrink: 0 }}>
            {tr('files.editor.truncated_banner')}
          </div>
        )}
        {/* El host del EditorView vive SIEMPRE montado para que CM no se
            recree al toggle entre archivos. Si es imagen o binario,
            superpongo un overlay encima. */}
        <div
          ref={hostRef}
          style={{
            flex: 1, minHeight: 0, overflow: 'hidden',
            display: activeFile && !isImage && !activeFile.binary ? 'block' : 'none',
          }}
        />
        {activeFile && isImage && (
          <ImagePreview bubbleId={bubbleId} workspace={workspace} path={activeFile.path}/>
        )}
        {activeFile && !isImage && activeFile.binary && (
          <div className="eco-empty">
            {tr('files.editor.binary')}
          </div>
        )}
        {!hasOpenFiles && (
          <div className="eco-empty" style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, padding: 24,
          }}>
            <div className="eco-tile eco-tile--lg"><IconFileText size={20}/></div>
            {tr('files.editor.no_file')}
          </div>
        )}

        {/* Floating Enviar a Claude — posicionado cerca del cursor head */}
        {activeFile && !isImage && !activeFile.binary && selection && hostRect && selection.coords && (
          <FloatingSendButton
            coords={selection.coords}
            hostRect={hostRect}
            label={tr('files.editor.send_to_claude')}
            onClick={() => {
              const f = activeFile;
              onSendToClaude({
                relPath: f.path,
                startLine: selection.startLine,
                endLine: selection.endLine,
                selectedText: selection.text,
                langTag: langTagFromPath(f.path),
              });
            }}
          />
        )}

        {/* Status bar */}
        {activeFile && !isImage && !activeFile.binary && (
          <div className="eco-num" style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px',
            borderTop: `1px solid ${t.line}`, flexShrink: 0,
          }}>
            <span className="eco-truncate">{activeFile.path}</span>
            <span style={{ flex: 1 }}/>
            {selection && !selection.empty && (
              <span>{tr('files.editor.send_to_claude')}: L{selection.startLine}–{selection.endLine}</span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// Breadcrumb de la ruta del archivo activo. Las carpetas son clickables (revelan
// en el árbol); el último segmento es el archivo con su icono por tipo.
function Breadcrumb({ path, onRevealDir }: { path: string; onRevealDir?: (dir: string) => void }) {
  const t = useTokens();
  const segs = path.split('/').filter(Boolean);
  return (
    <div className="eco-noscrollbar" style={{
      display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 2,
      padding: '7px 16px', overflow: 'auto', flexShrink: 0,
      borderBottom: `1px solid ${t.line}`,
      fontSize: 12.5, color: t.text3,
    }}>
      {segs.map((seg, i) => {
        const isLast = i === segs.length - 1;
        const dirPath = segs.slice(0, i + 1).join('/');
        return (
          <span key={dirPath} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {i > 0 && <span style={{ color: t.text3, padding: '0 1px' }}>›</span>}
            {isLast && <FileTypeIcon path={path} size={12}/>}
            {isLast ? (
              <span style={{ color: t.text0, fontWeight: 500, marginLeft: 3 }}>{seg}</span>
            ) : (
              <button
                type="button"
                onClick={() => onRevealDir?.(dirPath)}
                className="eco-subtab"
                style={{ padding: '1px 5px', borderRadius: 6, cursor: onRevealDir ? 'pointer' : 'default' }}
              >
                {seg}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

function FloatingSendButton({ coords, hostRect, label, onClick }: {
  coords: { left: number; top: number; bottom: number };
  hostRect: DOMRect;
  label: string;
  onClick: () => void;
}) {
  const t = useTokens();
  // Posicionar relativo al host: usamos absolute con coords convertidas. Las
  // dos medidas vienen en px visuales; el botón se ubica en px CSS del host.
  const z = cssZoom();
  const left = Math.min(Math.max((coords.left - hostRect.left) / z + 8, 8), hostRect.width / z - 160);
  const top = Math.max((coords.top - hostRect.top) / z - 32, 6);
  return (
    <button
      type="button"
      onClick={onClick}
      className="eco-btn eco-btn--xs eco-btn--primary"
      style={{ position: 'absolute', left, top, boxShadow: t.shadowMd, zIndex: 20 }}
    >
      {label}
    </button>
  );
}

function ImagePreview({ bubbleId, workspace, path }: { bubbleId: string; workspace: string; path: string }) {
  const tr = useT();
  // Para que el browser muestre la imagen sin reimplementar la auth, generamos
  // un blob URL desde un fetch autenticado.
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let revoke: string | null = null;
    (async () => {
      try {
        const r = await apiFetch(`/file/raw?bubbleId=${encodeURIComponent(bubbleId)}&workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`);
        if (!r.ok) { setErr(tr('files.err.read_failed')); return; }
        const blob = await r.blob();
        if (cancelled) return;
        const obj = URL.createObjectURL(blob);
        revoke = obj;
        setSrc(obj);
      } catch {
        if (!cancelled) setErr(tr('files.err.read_failed'));
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [bubbleId, workspace, path, tr]);
  if (err) {
    return <div className="eco-banner eco-banner--err" style={{ margin: 16 }}>{err}</div>;
  }
  if (!src) {
    return <div className="eco-empty">{tr('files.tree.loading')}</div>;
  }
  return (
    <div style={{
      flex: 1, minHeight: 0, overflow: 'auto', padding: 16,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <img
        src={src}
        alt={path}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}

function isImagePath(p: string): boolean {
  const lower = p.toLowerCase();
  return /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp)$/.test(lower);
}

function langTagFromPath(p: string): string {
  const ext = p.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', json: 'json',
    css: 'css', html: 'html', md: 'md', py: 'py', rs: 'rust',
    go: 'go', java: 'java', rb: 'ruby', sh: 'bash', sql: 'sql',
    yml: 'yaml', yaml: 'yaml', toml: 'toml', xml: 'xml',
  };
  return map[ext] ?? '';
}
