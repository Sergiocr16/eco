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

  const stack = { marginTop: 8, flexDirection: 'column', alignItems: 'flex-start', gap: 4 } as const;

  if (installed) {
    return (
      <div className="eco-banner eco-banner--ok" style={stack}>
        <span style={{ fontWeight: 500 }}>
          {tr('github.gh_status.installed', { version: version ?? '' })}
        </span>
        <span style={{ color: t.text2 }}>
          {tr('github.gh_status.installed_note')}
        </span>
      </div>
    );
  }

  return (
    <div className="eco-banner eco-banner--warn" style={stack}>
      <span style={{ fontWeight: 500 }}>
        {tr('github.gh_status.missing')}
      </span>
      <span style={{ color: t.text2 }}>
        {tr('github.gh_status.missing_note')}
      </span>
      <code style={{
        fontFamily: t.fontMono, fontSize: 12,
        padding: '2px 9px', borderRadius: 8,
        background: t.raised, color: t.text0,
      }}>brew install gh</code>
    </div>
  );
}
