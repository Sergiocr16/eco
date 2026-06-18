import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { useTokens, useTheme } from '@/design/theme';
import { isLightTheme } from '@/design/tokens';
import { useT } from '@/hooks/useI18n';
import { IconX } from '@/design/icons';
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
        display: 'flex', alignItems: 'center', borderBottom: `1px solid ${t.glassBorder}`,
        overflow: 'auto', flexShrink: 0, minHeight: 36, background: t.bg1,
      }}>
        <div style={{ display: 'flex', overflow: 'auto', minWidth: 0, flex: 1 }}>
        {openFiles.map((f) => {
          const isActive = activeFile && f.path === activeFile.path;
          const isDirty = f.content !== f.originalContent;
          return (
            <div
              key={f.path}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 10px',
                borderRight: `1px solid ${t.glassBorder}`,
                background: isActive ? t.bg2 : 'transparent',
                color: isActive ? t.text0 : t.text2,
                fontFamily: t.fontSans, fontSize: 12,
                cursor: 'pointer',
                flexShrink: 0,
              }}
              onClick={() => onActivate(f.path)}
              title={f.path}
            >
              <FileTypeIcon path={f.path} size={13}/>
              <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.path.split('/').pop()}
              </span>
              {isDirty && (
                <span style={{ color: t.warn, fontSize: 14, lineHeight: 1 }} title={tr('files.editor.dirty')}>·</span>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(f.path); }}
                style={{
                  background: 'transparent', border: 0, padding: 0, marginLeft: 2,
                  color: t.text2, cursor: 'pointer', display: 'flex', alignItems: 'center',
                }}
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
              style={{
                margin: '0 8px',
                padding: '4px 10px', borderRadius: 6,
                background: 'transparent', color: t.text1,
                border: `1px solid ${t.glassBorder}`,
                fontSize: 11, fontWeight: 600,
                fontFamily: t.fontSans, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
              ↗ {ideDisplayLabel(ide)}
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
          <div style={{
            padding: '8px 12px', background: `color-mix(in oklch, ${t.warn} 12%, transparent)`,
            color: t.warn, fontSize: 12, fontFamily: t.fontSans,
            borderBottom: `1px solid ${t.warn}`,
          }}>
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
          <div style={{ padding: 24, color: t.text2, fontFamily: t.fontSans, fontSize: 13 }}>
            {tr('files.editor.binary')}
          </div>
        )}
        {!hasOpenFiles && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: t.text2, fontFamily: t.fontSans, fontSize: 13, padding: 24, textAlign: 'center',
          }}>
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
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
            borderTop: `1px solid ${t.glassBorder}`, background: t.glassBg,
            fontFamily: t.fontSans, fontSize: 11, color: t.text2, flexShrink: 0,
          }}>
            <span>{activeFile.path}</span>
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
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 2,
      padding: '3px 10px', minHeight: 24, overflow: 'auto', flexShrink: 0,
      borderBottom: `1px solid ${t.glassBorder}`, background: t.bg1,
      fontFamily: t.fontSans, fontSize: 11, color: t.text2,
    }}>
      {segs.map((seg, i) => {
        const isLast = i === segs.length - 1;
        const dirPath = segs.slice(0, i + 1).join('/');
        return (
          <span key={dirPath} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {i > 0 && <span style={{ color: t.text3, padding: '0 1px' }}>›</span>}
            {isLast && <FileTypeIcon path={path} size={12}/>}
            {isLast ? (
              <span style={{ color: t.text1, fontWeight: 600 }}>{seg}</span>
            ) : (
              <button
                type="button"
                onClick={() => onRevealDir?.(dirPath)}
                style={{
                  background: 'transparent', border: 0, padding: '1px 3px', borderRadius: 4,
                  color: t.text2, cursor: onRevealDir ? 'pointer' : 'default',
                  fontFamily: t.fontSans, fontSize: 11,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = t.text0; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = t.text2; }}
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
  // Posicionar relativo al host: usamos absolute con coords convertidas.
  const left = Math.min(Math.max(coords.left - hostRect.left + 8, 8), hostRect.width - 160);
  const top = Math.max(coords.top - hostRect.top - 32, 6);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute',
        left, top,
        padding: '5px 10px', borderRadius: t.r2,
        background: t.accent, color: t.accentOn,
        border: 0, cursor: 'pointer',
        fontFamily: t.fontSans, fontSize: 12, fontWeight: 600,
        boxShadow: t.shadowMd,
        zIndex: 20,
      }}
    >
      {label}
    </button>
  );
}

function ImagePreview({ bubbleId, workspace, path }: { bubbleId: string; workspace: string; path: string }) {
  const t = useTokens();
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
    return <div style={{ padding: 24, color: t.err, fontFamily: t.fontSans, fontSize: 13 }}>{err}</div>;
  }
  if (!src) {
    return <div style={{ padding: 24, color: t.text2, fontFamily: t.fontSans, fontSize: 13 }}>{tr('files.tree.loading')}</div>;
  }
  return (
    <div style={{
      flex: 1, minHeight: 0, overflow: 'auto', padding: 16,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: t.bg1,
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
