import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';
import { useGhStatus } from '@/hooks/useGhStatus';

// Banner informativo que se muestra cerca del input de GitHub PAT
// (Onboarding y Settings) explicando que el PAT NO reemplaza al binario
// `gh`. Estados:
//   - loading: no renderiza nada (evita flash).
//   - installed: badge verde "gh detectado · vX".
//   - missing:   banner amarillo con el comando de instalación.
export function GhStatusBanner() {
  const t = useTokens();
  const tr = useT();
  const { loading, installed, version } = useGhStatus();

  if (loading || installed === null) return null;

  const baseStyle = {
    marginTop: 8,
    padding: '8px 12px',
    borderRadius: 8,
    fontFamily: t.fontSans,
    fontSize: 12,
    lineHeight: 1.5,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  };

  if (installed) {
    return (
      <div style={{
        ...baseStyle,
        background: `color-mix(in oklch, ${t.ok} 8%, transparent)`,
        border: `1px solid color-mix(in oklch, ${t.ok} 30%, ${t.glassBorder})`,
        color: t.text1,
      }}>
        <span style={{ color: t.ok, fontWeight: 600 }}>
          {tr('github.gh_status.installed', { version: version ?? '' })}
        </span>
        <span style={{ color: t.text3, fontSize: 11.5 }}>
          {tr('github.gh_status.installed_note')}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      ...baseStyle,
      background: `color-mix(in oklch, ${t.warn} 10%, transparent)`,
      border: `1px solid color-mix(in oklch, ${t.warn} 30%, ${t.glassBorder})`,
      color: t.text1,
    }}>
      <span style={{ color: t.warn, fontWeight: 600 }}>
        {tr('github.gh_status.missing')}
      </span>
      <span style={{ color: t.text2, fontSize: 11.5 }}>
        {tr('github.gh_status.missing_note')}
      </span>
      <code style={{
        fontFamily: t.fontMono, fontSize: 12,
        padding: '4px 8px', borderRadius: 4,
        background: t.bg1, color: t.text0,
        alignSelf: 'flex-start',
      }}>brew install gh</code>
    </div>
  );
}
