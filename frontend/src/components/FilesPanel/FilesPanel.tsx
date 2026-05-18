import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { apiFetch } from '@/lib/api';
import { emit, on as ecoOn } from '@/lib/eco-bus';
import { writeToBubblePty } from '@/lib/pty-bridge';
import { ecoToken } from '@/lib/eco-config';
import { useGitChanges } from '@/hooks/useGitChanges';
import { ResizableSplit } from '@/components/GitPanel/ResizableSplit';
import { translateBackendError } from '@/lib/backend-errors';
import { FileTree } from './FileTree';
import { FileEditor } from './FileEditor';
import { QuickOpen } from './QuickOpen';
import { GlobalSearch } from './GlobalSearch';
import type { TreeEntry, OpenFile } from './types';

type Props = {
  bubbleId: string;
  workspace: string;
};

const STORAGE = {
  openTabs: (id: string) => `eco.files.openTabs.${id}`,
  activeFile: (id: string) => `eco.files.activeFile.${id}`,
  expanded: (id: string) => `eco.files.expanded.${id}`,
  splitter: (id: string) => `eco.files.splitter.${id}`,
};

const TOP_LEVEL_DEPTH = 1;
const LAZY_DEPTH = 1;
const FILE_SIZE_HARD_CAP = 512 * 1024;

export function FilesPanel({ bubbleId, workspace }: Props) {
  const t = useTokens();
  const tr = useT();

  // Árbol cargado por niveles. Cada vez que se expande un dir, hacemos fetch
  // con maxDepth 1 y mergeamos los hijos. Para Quick Open (más adelante) se
  // pide una vez maxDepth 6 y se cachea.
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [loadedDirs, setLoadedDirs] = useState<Set<string>>(() => new Set(['']));
  const [treeLoading, setTreeLoading] = useState<boolean>(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState<boolean>(false);
  // Path absoluto del workdir efectivo (el worktree de la bubble o el workspace
  // plano). Lo necesitamos para normalizar paths que vengan absolutos desde
  // fuentes externas (ej. useGitChanges devuelve paths con prefijo absoluto).
  const treeRootRef = useRef<string>('');

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => loadExpanded(bubbleId));
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(() => loadActive(bubbleId));

  // Persistencia liviana — escribir en cada cambio relevante.
  useEffect(() => {
    try { localStorage.setItem(STORAGE.expanded(bubbleId), JSON.stringify([...expandedDirs])); } catch { /* noop */ }
  }, [expandedDirs, bubbleId]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE.openTabs(bubbleId), JSON.stringify(openFiles.map((f) => f.path)));
    } catch { /* noop */ }
  }, [openFiles, bubbleId]);
  useEffect(() => {
    try {
      if (activeFilePath) localStorage.setItem(STORAGE.activeFile(bubbleId), activeFilePath);
      else localStorage.removeItem(STORAGE.activeFile(bubbleId));
    } catch { /* noop */ }
  }, [activeFilePath, bubbleId]);

  // Carga inicial del tree raíz.
  const loadDir = useCallback(async (relPath: string) => {
    try {
      const r = await apiFetch('/fs/tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bubbleId, workspace, path: relPath, maxDepth: LAZY_DEPTH }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        setTreeError(translateBackendError(body, tr('files.err.read_failed')));
        return;
      }
      const data = await r.json() as { ok: boolean; root?: string; entries: TreeEntry[]; truncated: boolean };
      if (data.root) treeRootRef.current = data.root;
      setEntries((prev) => mergeEntries(prev, data.entries));
      if (data.truncated) setTruncated(true);
      setLoadedDirs((prev) => { const next = new Set(prev); next.add(relPath); return next; });
    } catch {
      setTreeError(tr('files.err.read_failed'));
    }
  }, [bubbleId, workspace, tr]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTreeLoading(true);
      setTreeError(null);
      try {
        const r = await apiFetch('/fs/tree', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bubbleId, workspace, path: '', maxDepth: TOP_LEVEL_DEPTH }),
        });
        if (cancelled) return;
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          setTreeError(translateBackendError(body, tr('files.err.read_failed')));
          setTreeLoading(false);
          return;
        }
        const data = await r.json() as { ok: boolean; root?: string; entries: TreeEntry[]; truncated: boolean };
        if (data.root) treeRootRef.current = data.root;
        setEntries(data.entries);
        setTruncated(!!data.truncated);
        setLoadedDirs(new Set(['']));
        setTreeLoading(false);
      } catch {
        if (!cancelled) {
          setTreeError(tr('files.err.read_failed'));
          setTreeLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [bubbleId, workspace, tr]);

  // Cargar contenido de los openFiles persistidos al volver al tab.
  const openFilesInitRef = useRef(false);
  useEffect(() => {
    if (openFilesInitRef.current) return;
    openFilesInitRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE.openTabs(bubbleId));
      const paths = raw ? JSON.parse(raw) as unknown : null;
      if (!Array.isArray(paths) || paths.length === 0) return;
      const valid = paths.filter((p): p is string => typeof p === 'string' && p.length > 0);
      // Cargar cada uno (en serie para no spamear).
      (async () => {
        const loaded: OpenFile[] = [];
        for (const p of valid) {
          const f = await fetchFileContents({ bubbleId, workspace, path: p });
          if (f) loaded.push(f);
        }
        if (loaded.length) setOpenFiles(loaded);
      })();
    } catch { /* noop */ }
  }, [bubbleId, workspace]);

  const onToggleDir = useCallback(async (relPath: string) => {
    const wasLoaded = loadedDirs.has(relPath);
    const wasExpanded = expandedDirs.has(relPath);
    // Caso especial: carpeta marcada como expandida (típicamente persistida de
    // una sesión anterior) pero sin children cargados — el click "abre" en
    // vez de "colapsar". Sin esto, el primer click colapsa visualmente y
    // hay que dar un segundo click para que aparezcan los archivos.
    if (wasExpanded && !wasLoaded) {
      await loadDir(relPath);
      return;
    }
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });
    if (!wasLoaded) await loadDir(relPath);
  }, [loadedDirs, expandedDirs, loadDir]);

  const onOpenFile = useCallback(async (relPath: string): Promise<void> => {
    // Normalización: si viene un path absoluto (ej. de useGitChanges que
    // prefijea el workdir absoluto), lo convertimos a relativo al treeRoot.
    // Los endpoints backend esperan paths relativos al workdir efectivo.
    const root = treeRootRef.current;
    if (relPath.startsWith('/') && root && relPath.startsWith(root + '/')) {
      relPath = relPath.slice(root.length + 1);
    }

    // 1. Expandir todos los dirs ancestros del path para que el archivo
    //    sea visible en el árbol (cuando el open viene de un deep-link
    //    desde fuera, el path puede estar dentro de carpetas colapsadas).
    //    También cargamos los dirs intermedios si todavía no están loaded.
    const segs = relPath.split('/');
    const ancestors: string[] = [];
    for (let i = 1; i < segs.length; i++) ancestors.push(segs.slice(0, i).join('/'));
    if (ancestors.length > 0) {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        for (const a of ancestors) next.add(a);
        return next;
      });
      // Cargar los dirs intermedios que falten — en serie, son pocos.
      for (const a of ancestors) {
        if (!loadedDirs.has(a)) await loadDir(a);
      }
    }

    // 2. Cargar contenido del archivo (o reactivar si ya estaba abierto).
    const existing = openFiles.find((f) => f.path === relPath);
    if (!existing) {
      const f = await fetchFileContents({ bubbleId, workspace, path: relPath });
      if (!f) return;
      setOpenFiles((prev) => [...prev, f]);
    }
    setActiveFilePath(relPath);

    // 3. Scrollear el nodo al viewport del tree. Doble rAF para esperar a
    //    que React renderice los hijos recién expandidos.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector<HTMLButtonElement>(`[data-tree-path="${cssEscape(relPath)}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }));
  }, [openFiles, bubbleId, workspace, loadedDirs, loadDir]);

  // Listener para deep-links externos (ej. desde el tab Git → Cambios). El
  // emisor manda eco:switch_tab → 'files' + eco:files:open_path con el path.
  // Filtramos por bubbleId para que no reaccionen otras burbujas montadas.
  useEffect(() => {
    return ecoOn('eco:files:open_path', (d) => {
      if (d.bubbleId !== bubbleId) return;
      void onOpenFileRef.current?.(d.path);
    });
  }, [bubbleId]);
  // Ref para tener la versión actual de onOpenFile dentro del listener sin
  // re-suscribirse en cada render.
  const onOpenFileRef = useRef<((p: string) => Promise<void>) | null>(null);
  useEffect(() => { onOpenFileRef.current = onOpenFile; }, [onOpenFile]);

  const onCloseFile = useCallback((relPath: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f.path !== relPath);
      // Si cerramos el activo, activar el siguiente disponible.
      if (activeFilePath === relPath) {
        const idx = prev.findIndex((f) => f.path === relPath);
        const fallback = next[idx] ?? next[idx - 1] ?? null;
        setActiveFilePath(fallback ? fallback.path : null);
      }
      return next;
    });
  }, [activeFilePath]);

  const onContentChange = useCallback((relPath: string, content: string) => {
    setOpenFiles((prev) => prev.map((f) => f.path === relPath ? { ...f, content } : f));
  }, []);

  // Diálogo de conflict stale (otro proceso editó el archivo por debajo).
  const [staleConflict, setStaleConflict] = useState<{ path: string; currentMtime: number } | null>(null);

  // Quick Open (Cmd+P): cache del tree completo lazy (maxDepth 6).
  const [quickOpen, setQuickOpen] = useState(false);
  const [fullTreeEntries, setFullTreeEntries] = useState<TreeEntry[] | null>(null);
  const fullTreeLoadingRef = useRef(false);
  const ensureFullTree = useCallback(async () => {
    if (fullTreeEntries || fullTreeLoadingRef.current) return;
    fullTreeLoadingRef.current = true;
    try {
      const r = await apiFetch('/fs/tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bubbleId, workspace, path: '', maxDepth: 6 }),
      });
      if (!r.ok) return;
      const data = await r.json() as { ok: boolean; entries: TreeEntry[] };
      setFullTreeEntries(data.entries);
    } catch { /* noop */ }
    finally { fullTreeLoadingRef.current = false; }
  }, [fullTreeEntries, bubbleId, workspace]);

  // Toggle del panel izquierdo: árbol (Explorer) vs búsqueda global.
  const [leftView, setLeftView] = useState<'tree' | 'search'>('tree');

  // Goto pending — cuando el GlobalSearch pide abrir un archivo en una
  // línea/columna, el FileEditor lo aplica una vez que cargó el archivo.
  const [pendingGoto, setPendingGoto] = useState<{ path: string; line: number; column: number } | null>(null);
  const onPickSearchResult = useCallback(async (relPath: string, line: number, column: number) => {
    setPendingGoto({ path: relPath, line, column });
    await onOpenFile(relPath);
  }, [onOpenFile]);

  // Keyboard shortcuts: Cmd+P (Quick Open) y Cmd+Shift+F (Global Search).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if ((e.key === 'p' || e.key === 'P') && !e.shiftKey) {
        e.preventDefault();
        ensureFullTree();
        setQuickOpen(true);
      } else if ((e.key === 'f' || e.key === 'F') && e.shiftKey) {
        e.preventDefault();
        setLeftView('search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ensureFullTree]);

  const saveFile = useCallback(async (relPath: string, opts?: { force?: boolean }) => {
    const f = openFiles.find((x) => x.path === relPath);
    if (!f || f.binary || f.truncated) return;
    try {
      const body: Record<string, unknown> = {
        bubbleId, workspace, path: relPath, content: f.content,
      };
      if (!opts?.force && f.mtime > 0) body.expectedMtime = f.mtime;
      const r = await apiFetch('/file/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.status === 409) {
        const data = await r.json() as { currentMtime?: number };
        setStaleConflict({ path: relPath, currentMtime: data.currentMtime ?? 0 });
        return;
      }
      if (!r.ok) return;
      const data = await r.json() as { ok: boolean; mtime?: number };
      if (!data.ok) return;
      // Update mtime + reset originalContent para apagar el dirty badge.
      setOpenFiles((prev) => prev.map((x) => x.path === relPath
        ? { ...x, originalContent: x.content, mtime: data.mtime ?? x.mtime }
        : x));
    } catch { /* silencioso — el dirty badge sigue visible */ }
  }, [openFiles, bubbleId, workspace]);

  const handleStaleReload = useCallback(async () => {
    if (!staleConflict) return;
    const fresh = await fetchFileContents({ bubbleId, workspace, path: staleConflict.path });
    if (fresh) {
      setOpenFiles((prev) => prev.map((x) => x.path === staleConflict.path ? fresh : x));
    }
    setStaleConflict(null);
  }, [staleConflict, bubbleId, workspace]);

  const handleStaleOverwrite = useCallback(async () => {
    if (!staleConflict) return;
    await saveFile(staleConflict.path, { force: true });
    setStaleConflict(null);
  }, [staleConflict, saveFile]);

  // Expand all: pedimos el fullTree (maxDepth 6) si no está cacheado y
  // expandimos todos los dirs. Collapse all: vacía el set y reseteamos las
  // entries cargadas al nivel raíz para no quedar con datos huérfanos.
  const handleExpandAll = useCallback(async () => {
    if (!fullTreeEntries) await ensureFullTree();
    const source = (fullTreeLoadingRef.current ? entries : (fullTreeEntries ?? entries));
    const allDirs = new Set<string>(['']);
    for (const e of source) if (e.type === 'dir') allDirs.add(e.path);
    setExpandedDirs(allDirs);
    if (fullTreeEntries) setEntries(fullTreeEntries);
  }, [fullTreeEntries, ensureFullTree, entries]);

  const handleCollapseAll = useCallback(() => {
    setExpandedDirs(new Set());
  }, []);

  // "Enviar a Claude": escribe el snippet en el PTY del agente (la pestaña
  // Terminal donde corre el CLI de claude). Sin newline final para que quede
  // como input esperando — el user agrega su pregunta y presiona Enter.
  const onSendToClaude = useCallback(async (args: {
    relPath: string;
    startLine: number;
    endLine: number;
    selectedText: string;
    langTag: string;
  }) => {
    const range = args.startLine === args.endLine
      ? `${args.relPath}:${args.startLine}`
      : `${args.relPath}:${args.startLine}-${args.endLine}`;
    // Sin trailing \n para que el Claude CLI no auto-submitee. El user
    // puede escribir su pregunta a continuación y mandar.
    const snippet = `> ${range}\n\`\`\`${args.langTag}\n${args.selectedText}\n\`\`\`\n`;
    emit('eco:switch_tab', { tab: 'terminal', bubbleId });
    const token = ecoToken();
    if (!token) return;
    await writeToBubblePty({ bubbleId, workspace, text: snippet, token });
  }, [bubbleId, workspace]);

  const activeFile = useMemo(
    () => openFiles.find((f) => f.path === activeFilePath) ?? null,
    [openFiles, activeFilePath],
  );

  // Paths con cambios sin commit — combinamos dos fuentes:
  //  1. Editor "dirty" (content !== originalContent, no salvado aún).
  //  2. Git status del worktree (modified/added/untracked sin commit todavía).
  // Ambas se muestran con el mismo color warn; el árbol también marca dirs
  // ancestros con un dot atenuado. Apenas el user commitea, git status las
  // limpia y el dot desaparece automáticamente.
  const gitChangesResult = useGitChanges(workspace, bubbleId, 6000);
  const dirtyPaths = useMemo(() => {
    const s = new Set<string>();
    for (const f of openFiles) {
      if (f.content !== f.originalContent) s.add(f.path);
    }
    for (const g of gitChangesResult.files) {
      if (g.change !== 'deleted') s.add(g.path);
    }
    return s;
  }, [openFiles, gitChangesResult.files]);

  return (
    <ResizableSplit
      storageKey={STORAGE.splitter(bubbleId)}
      defaultLeft={280}
      minLeft={180}
      maxLeftPercent={0.5}
      left={(
        <div style={{
          display: 'flex', flexDirection: 'column', height: '100%',
          background: t.glassBg, color: t.text1, fontFamily: t.fontSans,
        }}>
          <div style={{
            display: 'flex', borderBottom: `1px solid ${t.glassBorder}`,
          }}>
            <LeftViewTab
              active={leftView === 'tree'}
              label={tr('files.tree.collapsed_label')}
              onClick={() => setLeftView('tree')}
            />
            <LeftViewTab
              active={leftView === 'search'}
              label={tr('files.tree.toggle_search')}
              onClick={() => setLeftView('search')}
            />
          </div>
          {leftView === 'tree' ? (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 2,
                padding: '4px 6px', borderBottom: `1px solid ${t.glassBorder}`,
              }}>
                <span style={{ flex: 1 }}/>
                <TreeToolbarBtn
                  title={tr('files.tree.expand_all')}
                  onClick={handleExpandAll}
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6l4-3 4 3M4 10l4 3 4-3"/>
                  </svg>
                </TreeToolbarBtn>
                <TreeToolbarBtn
                  title={tr('files.tree.collapse_all')}
                  onClick={handleCollapseAll}
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4l4 3 4-3M4 12l4-3 4 3"/>
                  </svg>
                </TreeToolbarBtn>
                <TreeToolbarBtn
                  title={tr('files.tree.refresh')}
                  onClick={() => loadDir('')}
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 8a5 5 0 11-1.46-3.54M13 3v3h-3"/>
                  </svg>
                </TreeToolbarBtn>
              </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
              {treeLoading ? (
                <div style={{ padding: 12, color: t.text2, fontSize: 13 }}>{tr('files.tree.loading')}</div>
              ) : treeError ? (
                <div style={{ padding: 12, color: t.err, fontSize: 13 }}>{treeError}</div>
              ) : entries.length === 0 ? (
                <div style={{ padding: 12, color: t.text2, fontSize: 13 }}>{tr('files.tree.empty')}</div>
              ) : (
                <FileTree
                  entries={entries}
                  expandedDirs={expandedDirs}
                  activeFilePath={activeFilePath}
                  dirtyPaths={dirtyPaths}
                  onToggleDir={onToggleDir}
                  onOpenFile={onOpenFile}
                />
              )}
              {truncated && (
                <div style={{
                  padding: '8px 12px', margin: 8, fontSize: 11, color: t.warn,
                  background: `color-mix(in oklch, ${t.warn} 12%, transparent)`,
                  border: `1px solid ${t.warn}`, borderRadius: t.r2,
                }}>
                  {tr('files.tree.truncated')}
                </div>
              )}
            </div>
            </>
          ) : (
            <GlobalSearch
              bubbleId={bubbleId}
              workspace={workspace}
              onPick={onPickSearchResult}
            />
          )}
        </div>
      )}
      right={(
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, position: 'relative' }}>
          <FileEditor
            file={activeFile}
            openFiles={openFiles}
            bubbleId={bubbleId}
            workspace={workspace}
            onActivate={setActiveFilePath}
            onClose={onCloseFile}
            onContentChange={onContentChange}
            onSendToClaude={onSendToClaude}
            onSave={saveFile}
            pendingGoto={pendingGoto}
            onGotoConsumed={() => setPendingGoto(null)}
          />
          {staleConflict && (
            <StaleConflictDialog
              path={staleConflict.path}
              onReload={handleStaleReload}
              onOverwrite={handleStaleOverwrite}
              onCancel={() => setStaleConflict(null)}
            />
          )}
          <QuickOpen
            open={quickOpen}
            entries={fullTreeEntries ?? entries}
            onClose={() => setQuickOpen(false)}
            onPick={(p) => { onOpenFile(p); setQuickOpen(false); }}
          />
        </div>
      )}
    />
  );
}

function TreeToolbarBtn({ title, onClick, children }: {
  title: string; onClick: () => void; children: ReactNode;
}) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, padding: 0,
        background: 'transparent', border: 0, color: t.text2,
        cursor: 'pointer', borderRadius: t.r2,
        transition: 'background 120ms, color 120ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = t.bg3; e.currentTarget.style.color = t.text0; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.text2; }}
    >
      {children}
    </button>
  );
}

function LeftViewTab({ active, label, onClick }: {
  active: boolean; label: string; onClick: () => void;
}) {
  const t = useTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 10px',
        background: active ? t.bg2 : 'transparent',
        color: active ? t.text0 : t.text2,
        border: 0,
        borderBottom: `2px solid ${active ? t.accent : 'transparent'}`,
        cursor: 'pointer',
        fontFamily: t.fontSans, fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}
    >
      {label}
    </button>
  );
}

function StaleConflictDialog({ path, onReload, onOverwrite, onCancel }: {
  path: string;
  onReload: () => void;
  onOverwrite: () => void;
  onCancel: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
      }}
    >
      <div style={{
        maxWidth: 420, width: '90%', padding: 18,
        background: t.windowBg, border: `1px solid ${t.glassBorder}`,
        borderRadius: t.r3, color: t.text0, fontFamily: t.fontSans,
        boxShadow: t.shadowLg,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          {tr('files.editor.stale_title')}
        </div>
        <div style={{ fontSize: 13, color: t.text1, marginBottom: 8 }}>
          {tr('files.editor.stale_body')}
        </div>
        <div style={{ fontSize: 12, color: t.text2, fontFamily: t.fontMono, marginBottom: 14, wordBreak: 'break-all' }}>
          {path}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '6px 12px', borderRadius: t.r2,
              background: 'transparent', color: t.text1, border: `1px solid ${t.glassBorder}`,
              cursor: 'pointer', fontSize: 13, fontFamily: t.fontSans,
            }}
          >
            {tr('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            style={{
              padding: '6px 12px', borderRadius: t.r2,
              background: 'transparent', color: t.warn, border: `1px solid ${t.warn}`,
              cursor: 'pointer', fontSize: 13, fontFamily: t.fontSans,
            }}
          >
            {tr('files.editor.stale_overwrite')}
          </button>
          <button
            type="button"
            onClick={onReload}
            style={{
              padding: '6px 12px', borderRadius: t.r2,
              background: t.accent, color: t.accentOn, border: 0,
              cursor: 'pointer', fontSize: 13, fontFamily: t.fontSans, fontWeight: 600,
            }}
          >
            {tr('files.editor.stale_reload')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

function mergeEntries(prev: TreeEntry[], next: TreeEntry[]): TreeEntry[] {
  const map = new Map<string, TreeEntry>();
  for (const e of prev) map.set(e.path, e);
  for (const e of next) map.set(e.path, e);
  return [...map.values()].sort(compareEntries);
}

function compareEntries(a: TreeEntry, b: TreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' });
}

// Escape para uso en selectores [attr="..."] — los paths pueden tener
// caracteres que rompen el selector. Si CSS.escape está disponible (browsers
// modernos), lo usamos; sino fallback a un escape manual de "\\" y comillas.
function cssEscape(s: string): string {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  if (w.CSS?.escape) return w.CSS.escape(s);
  return s.replace(/(["\\])/g, '\\$1');
}

function loadExpanded(bubbleId: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE.expanded(bubbleId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((s): s is string => typeof s === 'string'));
  } catch { return new Set(); }
}

function loadActive(bubbleId: string): string | null {
  try {
    return localStorage.getItem(STORAGE.activeFile(bubbleId));
  } catch { return null; }
}

type ContentsResponse = {
  ok?: boolean;
  content?: string;
  size?: number;
  truncated?: boolean;
  binary?: boolean;
  mtime?: number;
  error?: string;
};

async function fetchFileContents(args: {
  bubbleId: string; workspace: string; path: string;
}): Promise<OpenFile | null> {
  try {
    const r = await apiFetch('/file/contents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bubbleId: args.bubbleId, workspace: args.workspace, path: args.path }),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as ContentsResponse;
    if (data.error || data.ok === false) return null;
    return {
      path: args.path,
      content: data.content ?? '',
      originalContent: data.content ?? '',
      mtime: typeof data.mtime === 'number' ? data.mtime : 0,
      truncated: !!data.truncated,
      binary: !!data.binary,
      size: data.size ?? 0,
    };
  } catch {
    return null;
  }
}

export { FILE_SIZE_HARD_CAP };
