import { useMemo } from 'react';
import { FileTreeNode } from './FileTreeNode';
import type { TreeEntry } from './types';

type Props = {
  entries: TreeEntry[];
  expandedDirs: Set<string>;
  activeFilePath: string | null;
  dirtyPaths: Set<string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
};

// Construye una estructura de árbol agrupando entries planas por parent path
// y ordenando dirs primero. Renderiza recursivo desde root.
export function FileTree({ entries, expandedDirs, activeFilePath, dirtyPaths, onToggleDir, onOpenFile }: Props) {
  const childrenByParent = useMemo(() => buildChildrenMap(entries), [entries]);
  const rootChildren = childrenByParent.get('') ?? [];
  // Propagamos dirty hacia arriba: si un archivo está dirty, sus dirs
  // ancestros también se marcan (con un punto/color sutil) para que el user
  // sepa que hay cambios "adentro" sin tener que expandir todo.
  const dirtyAncestors = useMemo(() => {
    const out = new Set<string>();
    for (const p of dirtyPaths) {
      const segs = p.split('/');
      for (let i = 1; i < segs.length; i++) {
        out.add(segs.slice(0, i).join('/'));
      }
    }
    return out;
  }, [dirtyPaths]);
  return (
    <div role="tree" style={{ userSelect: 'none' }}>
      {rootChildren.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          childrenByParent={childrenByParent}
          expandedDirs={expandedDirs}
          activeFilePath={activeFilePath}
          dirtyPaths={dirtyPaths}
          dirtyAncestors={dirtyAncestors}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
        />
      ))}
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
