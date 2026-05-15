import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { IconBranch } from '@/design/icons';
import { useBranches } from '@/hooks/useBranches';
import { useGitOpStatus } from '@/hooks/useGitOpStatus';

type Props = {
  workspace: string;
  bubbleId: string;
  baseBranch?: string | null;
  // Abre el tab Git (todas las acciones reales — commit, push, fetch,
  // historial, etc. — viven ahí adentro).
  onGoToGit: () => void;
};

const OP_LABEL = {
  'cherry-pick': 'Cherry-pick en conflicto',
  merge: 'Merge en conflicto',
  revert: 'Revert en conflicto',
} as const;

// Mini-dock simplificado: solo rama actual, worktree info y un botón para
// abrir el tab Git completo. Todas las acciones (commit, push, fetch,
// branch picker, etc.) viven en el tab Git — el mini-dock es un atajo
// visible desde otros tabs (chat, terminal) sin duplicar funcionalidad.
export function GitMiniDock({ workspace, bubbleId, baseBranch, onGoToGit }: Props) {
  const t = useTokens();
  const { data: branchesData } = useBranches(workspace, bubbleId);
  const op = useGitOpStatus(workspace, bubbleId);
  const [hover, setHover] = useState(false);

  const branchName = branchesData?.current ?? '—';
  const detached = branchesData?.detached ?? false;

  // El card entero es clickeable: abre el tab Git. Usamos un div con role
  // button + onKeyDown para mantener accesibilidad (Enter/Space activan).
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onGoToGit}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGoToGit(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Click para abrir el tab Git"
      style={{ cursor: 'pointer' }}>
      <div style={{
        padding: 10, borderRadius: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
        // Estado base: lo que antes era hover. El hover solo agrega un
        // borde acento sutil para indicar que es clickeable.
        background: t.bg2,
        border: hover ? `1px solid ${t.accent}` : '1px solid transparent',
        transition: 'border-color 120ms',
      }}>
        {/* Rama actual */}
        <div
          title={op.inProgress ? OP_LABEL[op.inProgress] : (detached ? `HEAD detached @ ${branchName}` : `Rama actual: ${branchName}`)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 8,
            background: t.bg3,
            ...(op.inProgress ? { border: `1px solid ${t.err}` } : {}),
            color: t.text0,
          }}>
          <IconBranch size={12}/>
          <code style={{
            fontFamily: t.fontMono, fontSize: 11.5,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            flex: 1, minWidth: 0,
          }}>{detached ? `(detached) ${branchName}` : branchName}</code>
          {op.inProgress && (
            <span style={{
              padding: '1px 5px', borderRadius: 4,
              background: t.err, color: '#fff',
              fontSize: 9.5, fontWeight: 700,
            }}>!</span>
          )}
        </div>

        {/* baseBranch (de dónde salió el worktree) */}
        {baseBranch && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 7,
            background: t.bg3,
            fontSize: 10.5, color: t.text3,
          }}
          title={`El worktree de esta burbuja salió de la rama "${baseBranch}" del repo padre.`}>
            <span>worktree de</span>
            <code style={{
              fontFamily: t.fontMono, fontSize: 10.5, color: t.text2,
              padding: '0 4px', borderRadius: 3,
              background: t.bg2,
            }}>{baseBranch}</code>
          </div>
        )}
      </div>
    </div>
  );
}
