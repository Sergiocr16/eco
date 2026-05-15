import { useTokens } from '@/design/theme';
import { PullRequestsList } from '@/components/PullRequestsList';

type Props = { workspace: string; bubbleId: string };

export function PRsView({ workspace, bubbleId }: Props) {
  const t = useTokens();
  return (
    <div style={{
      flex: 1, overflow: 'auto', padding: '20px 24px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 12, color: t.text2 }}>
        Pull requests abiertos del repositorio (via gh CLI). Click para hacer
        checkout y revisar localmente.
      </div>
      <PullRequestsList workspace={workspace} bubbleId={bubbleId}/>
    </div>
  );
}
