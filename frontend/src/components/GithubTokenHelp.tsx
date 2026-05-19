import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { useT } from '@/hooks/useI18n';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,read:org&description=Eco';

// Detalle expandible con los pasos para crear un Personal Access Token en
// GitHub + los scopes a marcar. Usado en Settings → GitHub y en el step
// de GitHub del Onboarding.
export function GithubTokenHelp() {
  const t = useTokens();
  const tr = useT();
  const [open, setOpen] = useState(false);

  function openTokenPage() {
    try { window.open(TOKEN_URL, '_blank', 'noopener,noreferrer'); } catch { /* noop */ }
  }

  return (
    <div style={{ fontSize: 12, color: t.text2, fontFamily: t.fontSans, lineHeight: 1.55 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent', border: 0, padding: 0,
          color: t.accent, fontFamily: t.fontSans, fontSize: 12,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        {open ? tr('settings.github.hide_help') : tr('settings.github.how_to_create')}
      </button>

      {open && (
        <div style={{
          marginTop: 10, padding: 14, borderRadius: 10,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
          color: t.text1, fontSize: 12.5,
        }}>
          <div style={{ color: t.text2, marginBottom: 10 }}>
            {tr('settings.github.help_intro')}
          </div>

          <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>{tr('settings.github.help_step1')}</li>
            <li>{tr('settings.github.help_step2')}</li>
            <li>{tr('settings.github.help_step3')}</li>
            <li>
              <div style={{ fontWeight: 600, color: t.text0, marginBottom: 6 }}>
                {tr('settings.github.help_scopes_title')}
              </div>
              <ul style={{ paddingLeft: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <ScopeRow scope="repo" required note={tr('settings.github.help_scope_repo')}/>
                <ScopeRow scope="read:org" required note={tr('settings.github.help_scope_read_org')}/>
                <ScopeRow scope="workflow" note={tr('settings.github.help_scope_workflow')}/>
              </ul>
            </li>
            <li>{tr('settings.github.help_step4')}</li>
          </ol>

          <button
            type="button"
            onClick={openTokenPage}
            style={{
              marginTop: 12,
              padding: '6px 12px', borderRadius: 6, border: `1px solid ${t.accent}`,
              background: 'transparent', color: t.accent,
              fontFamily: t.fontSans, fontSize: 12, cursor: 'pointer', fontWeight: 500,
            }}
          >{tr('settings.github.open_github')}</button>
        </div>
      )}
    </div>
  );
}

function ScopeRow({ scope, note, required }: { scope: string; note: string; required?: boolean }) {
  const t = useTokens();
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, flexShrink: 0, marginTop: 2,
        borderRadius: 3, background: required ? t.accent : 'transparent',
        border: `1.5px solid ${required ? t.accent : t.text3}`,
        color: t.accentOn, fontSize: 9, fontWeight: 700, lineHeight: 1,
      }}>
        {required ? '✓' : ''}
      </span>
      <div style={{ flex: 1 }}>
        <code style={{
          padding: '1px 6px', borderRadius: 4,
          background: t.bg3, color: t.text0,
          fontFamily: t.fontMono, fontSize: 11.5,
          marginRight: 6,
        }}>{scope}</code>
        <span style={{ color: t.text2 }}>{note}</span>
      </div>
    </li>
  );
}
