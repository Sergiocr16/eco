import { useState } from 'react';
import { IconCheck, IconExt } from '@/design/icons';
import { useT } from '@/hooks/useI18n';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,read:org&description=Eco';

// Detalle expandible con los pasos para crear un Personal Access Token en
// GitHub + los scopes a marcar. Usado en Settings → GitHub y en el step
// de GitHub del Onboarding.
export function GithubTokenHelp() {
  const tr = useT();
  const [open, setOpen] = useState(false);

  function openTokenPage() {
    try { window.open(TOKEN_URL, '_blank', 'noopener,noreferrer'); } catch { /* noop */ }
  }

  return (
    <div className="eco-vstack" style={{ gap: 10, alignItems: 'flex-start' }}>
      <button
        type="button"
        className="eco-btn eco-btn--outline eco-btn--xs"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? tr('settings.github.hide_help') : tr('settings.github.how_to_create')}
      </button>

      {open && (
        <div className="eco-inset eco-vstack" style={{ gap: 12, alignSelf: 'stretch', alignItems: 'flex-start' }}>
          <div className="eco-muted">{tr('settings.github.help_intro')}</div>

          <ol className="eco-vstack" style={{ paddingLeft: 20, margin: 0, gap: 8, alignSelf: 'stretch' }}>
            <li>{tr('settings.github.help_step1')}</li>
            <li>{tr('settings.github.help_step2')}</li>
            <li>{tr('settings.github.help_step3')}</li>
            <li>
              <div className="eco-label" style={{ marginBottom: 6 }}>
                {tr('settings.github.help_scopes_title')}
              </div>
              <ul className="eco-vstack" style={{ paddingLeft: 0, margin: 0, listStyle: 'none', gap: 6 }}>
                <ScopeRow scope="repo" required note={tr('settings.github.help_scope_repo')}/>
                <ScopeRow scope="read:org" required note={tr('settings.github.help_scope_read_org')}/>
                <ScopeRow scope="workflow" note={tr('settings.github.help_scope_workflow')}/>
              </ul>
            </li>
            <li>{tr('settings.github.help_step4')}</li>
          </ol>

          <button type="button" className="eco-btn eco-btn--soft eco-btn--xs" onClick={openTokenPage}>
            <IconExt size={13}/>
            {tr('settings.github.open_github')}
          </button>
        </div>
      )}
    </div>
  );
}

function ScopeRow({ scope, note, required }: { scope: string; note: string; required?: boolean }) {
  return (
    <li className="eco-hstack" style={{ alignItems: 'flex-start', gap: 8 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, flex: 'none', marginTop: 2, borderRadius: 5,
        background: required ? 'var(--ac)' : 'transparent',
        border: `1.5px solid ${required ? 'var(--ac)' : 'var(--tx3)'}`,
        color: 'var(--ac-tx)',
      }}>
        {required && <IconCheck size={11} strokeWidth={3}/>}
      </span>
      <div className="eco-grow">
        <code className="eco-chip eco-chip--on-card eco-mono" style={{ fontSize: 12, marginRight: 6 }}>{scope}</code>
        <span className="eco-muted">{note}</span>
      </div>
    </li>
  );
}
