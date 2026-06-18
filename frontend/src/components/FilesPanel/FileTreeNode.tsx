import { memo } from 'react';
import { useTokens } from '@/design/theme';
import { FileTypeIcon } from './file-icon';
import type { TreeEntry } from './types';

type Props = {
  entry: TreeEntry;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isActive: boolean;
  isDirty: boolean;
  hasDirtyDescendant: boolean;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
};

// Fila plana del árbol (sin recursión: la jerarquía la arma FileTree aplanando
// + virtualizando). Memoizada para que solo re-renderice cuando cambian SUS
// props primitivas, no en cada cambio global del árbol.
export const FileTreeNode = memo(function FileTreeNode({
  entry, depth, isExpanded, hasChildren, isActive, isDirty, hasDirtyDescendant, onToggleDir, onOpenFile,
}: Props) {
  const t = useTokens();
  const isDir = entry.type === 'dir';
  // El icono abierto solo cuando el dir está expandido Y tiene hijos cargados:
  // si localStorage lo trajo expandido pero sin children aún, lo mostramos
  // cerrado para no mentir visualmente.
  const showAsOpen = isExpanded && hasChildren;
  const indent = depth * 12 + 6;

  return (
    <button
      type="button"
      data-tree-path={entry.path}
      onClick={() => isDir ? onToggleDir(entry.path) : onOpenFile(entry.path)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        width: '100%', height: '100%', textAlign: 'left', boxSizing: 'border-box',
        padding: `0 8px 0 ${indent}px`,
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
  );
});

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
