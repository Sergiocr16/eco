import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { on as ecoOn } from '@/lib/eco-bus';
import { FileTreeNode } from './FileTreeNode';
import type { TreeEntry } from './types';

type Props = {
  entries: TreeEntry[];
  expandedDirs: Set<string>;
  activeFilePath: string | null;
  dirtyPaths: Set<string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  // Contenedor scrolleable (lo provee FilesPanel) para virtualizar las filas.
  scrollRef: RefObject<HTMLDivElement | null>;
};

const ROW_HEIGHT = 24;

type Row = { entry: TreeEntry; depth: number };

// Aplana el árbol expandido a una lista lineal de filas visibles y la virtualiza
// (solo se montan las filas en viewport). Antes la recursión de componentes
// renderizaba TODOS los nodos visibles → lag con miles de archivos.
export function FileTree({ entries, expandedDirs, activeFilePath, dirtyPaths, onToggleDir, onOpenFile, scrollRef }: Props) {
  const childrenByParent = useMemo(() => buildChildrenMap(entries), [entries]);

  // Propagamos dirty hacia arriba: si un archivo está dirty, sus dirs ancestros
  // se marcan (punto sutil) para saber que hay cambios "adentro" sin expandir.
  const dirtyAncestors = useMemo(() => {
    const out = new Set<string>();
    for (const p of dirtyPaths) {
      const segs = p.split('/');
      for (let i = 1; i < segs.length; i++) out.add(segs.slice(0, i).join('/'));
    }
    return out;
  }, [dirtyPaths]);

  // Pre-order de lo expandido → filas planas { entry, depth }.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const walk = (parent: string, depth: number) => {
      const children = childrenByParent.get(parent) ?? [];
      for (const e of children) {
        out.push({ entry: e, depth });
        if (e.type === 'dir' && expandedDirs.has(e.path)) walk(e.path, depth + 1);
      }
    };
    walk('', 0);
    return out;
  }, [childrenByParent, expandedDirs]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
    getItemKey: (i) => rows[i].entry.path,
  });

  // Scroll-to-path por evento (reemplaza el querySelector+scrollIntoView que ya
  // no funciona con virtualización: los nodos fuera de viewport no están en el
  // DOM). Los reveals (abrir archivo, breadcrumb) emiten `eco:files:reveal_path`.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    return ecoOn('eco:files:reveal_path', ({ path }) => {
      const idx = rowsRef.current.findIndex((r) => r.entry.path === path);
      if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' });
    });
  }, [virtualizer]);

  return (
    <div role="tree" style={{ userSelect: 'none', position: 'relative', width: '100%', height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((vi) => {
        const row = rows[vi.index];
        if (!row) return null;
        const e = row.entry;
        const isDir = e.type === 'dir';
        const isExpanded = isDir && expandedDirs.has(e.path);
        const hasChildren = isDir && (childrenByParent.get(e.path)?.length ?? 0) > 0;
        return (
          <div
            key={vi.key}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: ROW_HEIGHT, transform: `translateY(${vi.start}px)` }}
          >
            <FileTreeNode
              entry={e}
              depth={row.depth}
              isExpanded={isExpanded}
              hasChildren={hasChildren}
              isActive={e.type === 'file' && activeFilePath === e.path}
              isDirty={e.type === 'file' && dirtyPaths.has(e.path)}
              hasDirtyDescendant={isDir && dirtyAncestors.has(e.path)}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          </div>
        );
      })}
    </div>
  );
}

function buildChildrenMap(entries: TreeEntry[]): Map<string, TreeEntry[]> {
  const map = new Map<string, TreeEntry[]>();
  for (const e of entries) {
    const parent = parentOf(e.path);
    const arr = map.get(parent) ?? [];
    arr.push(e);
    map.set(parent, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }
  return map;
}

function parentOf(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}
