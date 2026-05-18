import { useTokens } from '@/design/theme';
import { FileTypeIcon } from './file-icon';
import type { TreeEntry } from './types';

type Props = {
  entry: TreeEntry;
  depth: number;
  childrenByParent: Map<string, TreeEntry[]>;
  expandedDirs: Set<string>;
  activeFilePath: string | null;
  dirtyPaths: Set<string>;
  dirtyAncestors: Set<string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
};

export function FileTreeNode({
  entry, depth, childrenByParent, expandedDirs, activeFilePath, dirtyPaths, dirtyAncestors, onToggleDir, onOpenFile,
}: Props) {
  const t = useTokens();
  const isExpanded = expandedDirs.has(entry.path);
  const isActive = entry.type === 'file' && activeFilePath === entry.path;
  const isDir = entry.type === 'dir';
  const isDirty = entry.type === 'file' && dirtyPaths.has(entry.path);
  const hasDirtyDescendant = isDir && dirtyAncestors.has(entry.path);
  const childList = isDir ? (childrenByParent.get(entry.path) ?? []) : [];
  // El icono abierto solo se muestra cuando el dir está expandido Y realmente
  // tiene hijos visibles. Si el localStorage trajo el dir como expandido pero
  // sus children todavía no están cargados, lo mostramos cerrado para no
  // mentir visualmente.
  const showAsOpen = isExpanded && childList.length > 0;

  // 12px de indent por nivel. El chevron ocupa otros 12px solo en dirs;
  // los archivos usan ese espacio como padding fantasma para alinear sus
  // iconos con los de los dirs hermanos.
  const indent = depth * 12 + 6;

  return (
    <div>
      <button
        type="button"
        data-tree-path={entry.path}
        onClick={() => isDir ? onToggleDir(entry.path) : onOpenFile(entry.path)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          width: '100%', textAlign: 'left',
          padding: `3px 8px 3px ${indent}px`,
          background: isActive
            ? `color-mix(in oklch, ${t.accent} 18%, transparent)`
            : 'transparent',
          border: 0,
          color: isDirty ? t.warn : (isActive ? t.text0 : (hasDirtyDescendant ? t.text0 : t.text1)),
          fontWeight: isDirty ? 600 : (hasDirtyDescendant ? 500 : 400),
          fontFamily: t.fontSans,
          fontSize: 13,
          cursor: 'pointer',
          borderRadius: 0,
        }}
        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = t.bg3; }}
        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
        title={entry.path}
      >
        <span style={{
          width: 12, height: 12, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: t.text3, transition: 'transform 120ms',
          transform: isDir && showAsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          {isDir ? (
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4l4 4-4 4"/>
            </svg>
          ) : null}
        </span>
        {isDir ? (
          <FolderGlyph open={showAsOpen} color={t.accent}/>
        ) : (
          <FileTypeIcon path={entry.path} size={14}/>
        )}
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1,
        }}>{entry.name}</span>
        {(isDirty || hasDirtyDescendant) && (
          <span
            aria-hidden
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: t.warn,
              flexShrink: 0, marginLeft: 4,
              opacity: hasDirtyDescendant && !isDirty ? 0.55 : 1,
            }}
          />
        )}
      </button>
      {isDir && isExpanded && childList.length > 0 && (
        <div>
          {childList.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
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
      )}
    </div>
  );
}

// Carpeta dibujada con dos paths para diferenciar visualmente abierta vs
// cerrada a tamaños chicos (14px). Cerrada = silueta plena (con fill suave
// del accent). Abierta = "boca" abierta tipo manila folder.
function FolderGlyph({ open, color }: { open: boolean; color: string }) {
  if (open) {
    // Tab arriba a la izquierda + cuerpo trapezoidal abierto (forma de "U").
    return (
      <svg width={14} height={14} viewBox="0 0 16 16" style={{ flexShrink: 0, display: 'block' }}>
        <path
          d="M2 4.5a1 1 0 011-1h3.4l1.2 1.2H13a1 1 0 011 1V7H2V4.5z"
          fill={`color-mix(in oklch, ${color} 40%, transparent)`}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
        <path
          d="M2 7h12l-1.6 5a1.2 1.2 0 01-1.15.85H4.75A1.2 1.2 0 013.6 12L2 7z"
          fill={`color-mix(in oklch, ${color} 22%, transparent)`}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // Cerrada: rectángulo sólido con tab a la izquierda y label-line sutil.
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" style={{ flexShrink: 0, display: 'block' }}>
      <path
        d="M2 4.5a1 1 0 011-1h3.4l1.2 1.2H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4.5z"
        fill={`color-mix(in oklch, ${color} 35%, transparent)`}
        stroke={color}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <path d="M2 6.5h12" stroke={color} strokeWidth={0.7} strokeOpacity={0.5}/>
    </svg>
  );
}
