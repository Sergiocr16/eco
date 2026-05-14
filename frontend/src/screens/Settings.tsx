import { useEffect, useState, type ReactNode } from 'react';
import { useTheme, useTokens } from '@/design/theme';
import { ACCENT_HUES, THEME_VARIANTS } from '@/design/tokens';
import {
  Glass, Btn, StatusDot, SectionLabel, Toggle, fieldStyle,
} from '@/design/primitives';
import {
  IconSettings, IconKey, IconMic, IconFolder, IconShield, IconLayers,
  IconInfo, IconCheck, IconCpu, IconTerminal, IconWave, IconGlobe, IconAlert,
  IconCommand, IconBolt, IconLock, IconTrash, IconPlus, IconBranch, type IconProps,
} from '@/design/icons';
import { EcoMark } from '@/design/EcoMark';
import { useTTS, type UnifiedVoice } from '@/hooks/useTTS';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useQuickSuggestions } from '@/hooks/useQuickSuggestions';
import { useDefaultWorkspace } from '@/hooks/useDefaultWorkspace';
import { apiFetch } from '@/lib/api';
import { useApiKey } from '@/hooks/useApiKey';
import { useObsidian, pickVaultFolder } from '@/hooks/useObsidian';
import { useCategories, CATEGORY_PALETTE } from '@/hooks/useCategories';
import { useI18n, useT } from '@/hooks/useI18n';

type Section = 'general' | 'claude' | 'voice' | 'folders' | 'security' | 'appearance' | 'integrations' | 'about';

export function Settings() {
  const t = useTokens();
  const tr = useT();
  const [sec, setSec] = useState<Section>('general');
  const sections: { id: Section; label: string; icon: (p: IconProps) => JSX.Element }[] = [
    { id: 'general', label: tr('settings.section.general'), icon: IconSettings },
    { id: 'claude', label: tr('settings.section.claude'), icon: IconKey },
    { id: 'voice', label: tr('settings.section.voice'), icon: IconMic },
    { id: 'folders', label: tr('settings.section.folders'), icon: IconFolder },
    { id: 'security', label: tr('settings.section.security'), icon: IconShield },
    { id: 'appearance', label: tr('settings.section.appearance'), icon: IconLayers },
    { id: 'integrations', label: tr('settings.section.integrations'), icon: IconBolt },
    { id: 'about', label: tr('settings.section.about'), icon: IconInfo },
  ];
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{
        width: 220, flexShrink: 0, padding: '20px 12px',
        borderRight: `1px solid ${t.glassBorder}`,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        <div style={{
          padding: '8px 12px 12px', fontSize: 15, fontWeight: 600,
          color: t.text0, letterSpacing: -0.2,
        }}>{tr('settings.title')}</div>
        {sections.map((s) => (
          <button
            key={s.id} type="button"
            onClick={() => setSec(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 8, border: 0,
              background: sec === s.id ? t.bg3 : 'transparent',
              color: sec === s.id ? t.text0 : t.text1,
              fontFamily: t.fontSans, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', textAlign: 'left',
            }}>
            <s.icon size={14}/>
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {sec === 'general' && <SectionGeneral/>}
        {sec === 'claude' && <SectionClaude/>}
        {sec === 'voice' && <SectionVoice/>}
        {sec === 'folders' && <SectionFolders/>}
        {sec === 'security' && <SectionSecurity/>}
        {sec === 'appearance' && <SectionAppearance/>}
        {sec === 'integrations' && <SectionIntegrations/>}
        {sec === 'about' && <SectionAbout/>}
      </div>
    </div>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  const t = useTokens();
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: t.text0, letterSpacing: -0.4 }}>{title}</h2>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: t.text2 }}>{sub}</p>
    </div>
  );
}

function Row({ icon: Icon, title, desc, control, danger }: {
  icon?: (p: IconProps) => JSX.Element; title: string; desc?: string; control?: ReactNode; danger?: boolean;
}) {
  const t = useTokens();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 0', borderBottom: `1px solid ${t.glassBorder}`,
    }}>
      {Icon && (
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: t.bg3, color: danger ? t.err : t.text1,
          border: `1px solid ${t.glassBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon size={15}/></div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: danger ? t.err : t.text0, fontWeight: 500 }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: t.text2, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>}
      </div>
      <div>{control}</div>
    </div>
  );
}

function SectionGeneral() {
  const t = useTokens();
  const tr = useT();
  const def = useDefaultWorkspace();
  const ws = useWorkspaces();
  return (
    <div style={{ maxWidth: 720 }}>
      <Header title={tr('settings.general.title')} sub={tr('settings.general.sub')}/>
      <GeneralToggleRow icon={IconBolt} title={tr('settings.general.listen_on_boot')} storageKey="eco.voice.autostart" defaultOn/>
      <GeneralToggleRow
        icon={IconMic}
        title={tr('settings.general.listen_on_conversation')}
        desc={tr('settings.general.listen_on_conversation_desc')}
        storageKey="eco.voice.autostart_per_conversation"
      />
      <GeneralToggleRow
        icon={IconShield}
        title={tr('settings.general.review_mode')}
        desc={tr('settings.general.review_mode_desc')}
        storageKey="eco.agent.review_mode"
      />
      <GeneralToggleRow
        icon={IconBolt}
        title={tr('settings.general.notify_on_finish')}
        desc={tr('settings.general.notify_on_finish_desc')}
        storageKey="eco.notify.on_finish"
      />
      <GeneralToggleRow icon={IconLayers} title={tr('settings.general.menubar')} storageKey="eco.menubar" defaultOn/>
      <GeneralToggleRow
        icon={IconCommand}
        title={tr('settings.general.dock')}
        desc={tr('settings.general.dock_desc')}
        storageKey="eco.dock.enabled"
        broadcastEvent="eco:dock-pref-change"
        defaultOn
      />
      <Row
        icon={IconFolder}
        title={tr('settings.general.default_folder')}
        desc={tr('settings.general.default_folder_desc')}
        control={
          <select value={def.value} onChange={(e) => def.set(e.target.value)}
            style={{ ...fieldStyle(t), width: 220 }}>
            <option value="">{tr('settings.general.ask_each_time')}</option>
            {ws.list.workspaces.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        }/>
      <Row icon={IconCommand} title={tr('settings.general.shortcut')} desc={tr('settings.general.shortcut_desc')}
        control={<KbdRow keys={['⌥', '⇧', 'E']}/>}/>
      <LanguageRow/>
      <WorktreesCleanRow/>

      <div style={{ marginTop: 24 }}>
        <SuggestionsEditor/>
      </div>
    </div>
  );
}

function WorktreesCleanRow() {
  const t = useTokens();
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ removed: number; kept: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function prune() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await apiFetch('/worktrees/prune', { method: 'POST' });
      const data = await r.json().catch(() => ({} as { removed?: string[]; kept?: string[] }));
      if (!r.ok) {
        setErr(typeof data?.message === 'string' ? data.message : `HTTP ${r.status}`);
      } else {
        setResult({
          removed: Array.isArray(data?.removed) ? data.removed.length : 0,
          kept: Array.isArray(data?.kept) ? data.kept.length : 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Row
      icon={IconTrash}
      title={tr('settings.general.worktrees_clean')}
      desc={result
        ? tr('settings.general.worktrees_result')
          .replace('{removed}', String(result.removed))
          .replace('{kept}', String(result.kept))
        : err
          ? err
          : tr('settings.general.worktrees_clean_desc')}
      control={
        <button type="button" onClick={() => void prune()} disabled={busy}
          style={{
            padding: '6px 14px', borderRadius: 8,
            border: `1px solid ${t.glassBorder}`,
            background: t.bg2, color: t.text0,
            fontFamily: t.fontSans, fontSize: 12.5, fontWeight: 500,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}>
          {busy ? tr('settings.general.worktrees_cleaning') : tr('settings.general.worktrees_run')}
        </button>
      }/>
  );
}

function LanguageRow() {
  const t = useTokens();
  const { lang, setLang } = useI18n();
  const tr = useT();
  return (
    <Row icon={IconGlobe} title={tr('settings.general.app_language')}
      control={
        <select value={lang} onChange={(e) => setLang(e.target.value as 'es' | 'en')}
          style={{ ...fieldStyle(t), width: 180 }}>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      }/>
  );
}

function SuggestionsEditor() {
  const t = useTokens();
  const tr = useT();
  const s = useQuickSuggestions();
  const [draft, setDraft] = useState('');

  function handleAdd() {
    const v = draft.trim();
    if (!v) return;
    s.add(v);
    setDraft('');
  }

  return (
    <div>
      <SectionLabel
        count={s.suggestions.length}
        action={
          <button
            type="button"
            onClick={s.reset}
            style={{
              fontSize: 11, color: t.text2, background: 'transparent',
              border: 0, cursor: 'pointer', fontFamily: t.fontSans,
            }}>{tr('settings.suggestions.reset')}</button>
        }>
        {tr('settings.suggestions.title')}
      </SectionLabel>
      <p style={{ fontSize: 12, color: t.text2, marginTop: -4, marginBottom: 12, lineHeight: 1.5 }}>
        {tr('settings.suggestions.sub')}
      </p>

      <Glass radius={12} style={{ padding: 6, marginBottom: 12, display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder={tr('settings.suggestions.add_placeholder')}
          style={{
            flex: 1, background: 'transparent', border: 0, outline: 'none',
            fontFamily: t.fontSans, fontSize: 13.5, color: t.text0, padding: '8px 10px',
          }}
        />
        <Btn kind="primary" size="sm" onClick={handleAdd} disabled={!draft.trim()}>
          {tr('settings.folders.add_btn')}
        </Btn>
      </Glass>

      {s.suggestions.length === 0 ? (
        <div style={{ fontSize: 12.5, color: t.text2, padding: '12px 4px' }}>
          {tr('settings.suggestions.empty')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {s.suggestions.map((sug, i) => (
            <div key={`${sug}-${i}`} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 10,
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
            }}>
              <span style={{
                flex: 1, fontFamily: t.fontSans, fontSize: 13, color: t.text0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{sug}</span>
              <button
                type="button"
                onClick={() => s.remove(i)}
                style={{
                  width: 28, height: 28, borderRadius: 8, border: 0,
                  background: 'transparent', color: t.text2, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title={tr('common.delete')}
              >
                <IconTrash size={12}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionClaude() {
  const tr = useT();
  return (
    <div style={{ maxWidth: 720 }}>
      <Header title={tr('settings.claude.title')} sub={tr('settings.claude.sub')}/>
      <ClaudeAuthStatusCard/>
      <ApiKeyEditor/>
      <ModelInfoRow/>
    </div>
  );
}

function ModelInfoRow() {
  const t = useTokens();
  const tr = useT();
  const [model, setModel] = useState<string>('claude-sonnet-4-5');
  useEffect(() => {
    let cancel = false;
    void apiFetch('/info').then(async (r) => {
      if (cancel || !r.ok) return;
      const data = await r.json().catch(() => null);
      if (data?.model) setModel(data.model);
    });
    return () => { cancel = true; };
  }, []);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 0', borderBottom: `1px solid ${t.glassBorder}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: t.bg3, color: t.accent,
        border: `1px solid ${t.glassBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <IconCpu size={15}/>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, color: t.text0, fontWeight: 500, marginBottom: 3 }}>
          {tr('settings.claude.model_info.title')}
        </div>
        <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.5 }}>
          {tr('settings.claude.model_info.desc')}
        </div>
      </div>
      <code style={{
        fontFamily: t.fontMono, fontSize: 11.5, color: t.text0,
        padding: '5px 10px', borderRadius: 6,
        background: t.bg2, border: `1px solid ${t.glassBorder}`,
      }}>{model}</code>
    </div>
  );
}

type ClaudeAuthStatus = {
  cliInstalled: boolean;
  cliPath: string;
  cliVersion: string | null;
  cliLoggedIn: boolean;
  cliLoginHint: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  effectiveMethod: 'cli' | 'apikey' | 'none';
};

function ClaudeAuthStatusCard() {
  const t = useTokens();
  const tr = useT();
  const [status, setStatus] = useState<ClaudeAuthStatus | null>(null);

  useEffect(() => {
    let cancel = false;
    const fetch = () => {
      // No pollear cuando la ventana no está visible — el focus event ya
      // dispara fetch al volver al frente.
      if (document.visibilityState !== 'visible') return;
      void apiFetch('/config/claude-auth').then(async (r) => {
        if (cancel || !r.ok) return;
        const data = await r.json().catch(() => null);
        if (data) setStatus(data as ClaudeAuthStatus);
      });
    };
    fetch();
    // Refrescamos cuando vuelve el foco — útil si el user corre `claude login`
    // en una terminal aparte y vuelve a Eco.
    const onFocus = () => fetch();
    window.addEventListener('focus', onFocus);
    // Intervalo más relajado (30s); con el listener de focus el user igual ve
    // el estado fresco apenas vuelve a Eco.
    const iv = window.setInterval(fetch, 30_000);
    return () => {
      cancel = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(iv);
    };
  }, []);

  if (!status) return null;

  const method = status.effectiveMethod;
  const headerColor = method === 'none' ? t.warn : t.ok;
  const headerText =
    method === 'cli' ? tr('settings.claude.auth.using_cli')
    : method === 'apikey' ? tr('settings.claude.auth.using_apikey')
    : tr('settings.claude.auth.using_none');

  return (
    <Glass radius={12} style={{ padding: 14, marginBottom: 16 }}>
      {/* Header: cuál método está activo AHORA */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
        paddingBottom: 12, borderBottom: `1px solid ${t.glassBorder}`,
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: headerColor,
          boxShadow: `0 0 8px ${headerColor}`,
        }}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text0 }}>
            {headerText}
          </div>
          <div style={{ fontSize: 11.5, color: t.text2, marginTop: 2 }}>
            {tr('settings.claude.auth.priority_hint')}
          </div>
        </div>
      </div>

      {/* Opción A: CLI */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: status.cliLoggedIn ? t.accentFaint : t.bg2,
          color: status.cliLoggedIn ? t.accent : t.text3,
          border: `1px solid ${status.cliLoggedIn ? t.accent : t.glassBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconTerminal size={15}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: t.text0 }}>
              {tr('settings.claude.auth.cli_title')}
            </span>
            {method === 'cli' && (
              <span style={{
                padding: '1px 7px', borderRadius: 999,
                background: t.accentFaint, color: t.accent,
                fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}>{tr('settings.claude.auth.active')}</span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.5, marginBottom: 4 }}>
            {tr('settings.claude.auth.cli_desc')}
          </div>
          <div style={{ fontSize: 10.5, color: t.text3, fontFamily: t.fontMono }}>
            {status.cliInstalled
              ? `${tr('settings.claude.auth.cli_installed')} ${status.cliVersion ?? ''}`
              : tr('settings.claude.auth.cli_not_installed')}
            {' · '}
            {status.cliLoggedIn
              ? `${tr('settings.claude.auth.cli_loggedin')} (${status.cliLoginHint})`
              : tr('settings.claude.auth.cli_notloggedin')}
          </div>
          {!status.cliLoggedIn && status.cliInstalled && (
            <div style={{
              marginTop: 8, padding: '6px 10px', borderRadius: 6,
              background: t.bg2, fontSize: 11, color: t.text1,
              fontFamily: t.fontMono,
            }}>
              <span style={{ color: t.text3 }}>$ </span>claude login
            </div>
          )}
        </div>
      </div>

      {/* Separador "o" */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 14, fontSize: 10, color: t.text3,
        textTransform: 'uppercase', fontWeight: 500, letterSpacing: 1,
      }}>
        <div style={{ flex: 1, height: 1, background: t.glassBorder }}/>
        {tr('settings.claude.auth.or')}
        <div style={{ flex: 1, height: 1, background: t.glassBorder }}/>
      </div>

      {/* Opción B: API key */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: status.apiKeyConfigured ? t.accentFaint : t.bg2,
          color: status.apiKeyConfigured ? t.accent : t.text3,
          border: `1px solid ${status.apiKeyConfigured ? t.accent : t.glassBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconKey size={15}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: t.text0 }}>
              {tr('settings.claude.auth.apikey_title')}
            </span>
            {method === 'apikey' && (
              <span style={{
                padding: '1px 7px', borderRadius: 999,
                background: t.accentFaint, color: t.accent,
                fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}>{tr('settings.claude.auth.active')}</span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.5 }}>
            {tr('settings.claude.auth.apikey_desc')}
          </div>
        </div>
      </div>
    </Glass>
  );
}

function ApiKeyEditor() {
  const t = useTokens();
  const tr = useT();
  const apiKey = useApiKey();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    const v = draft.trim();
    if (!v) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    const r = await apiKey.save(v);
    setBusy(false);
    if (r.ok) {
      setDraft('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } else {
      setError(r.error);
    }
  }

  async function handleDelete() {
    setBusy(true);
    await apiKey.remove();
    setBusy(false);
  }

  return (
    <div style={{
      padding: '14px 0', borderBottom: `1px solid ${t.glassBorder}`,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: t.bg3, color: t.accent,
          border: `1px solid ${t.glassBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconKey size={15}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, color: t.text0, fontWeight: 500 }}>
            {tr('settings.claude.apikey.title')}
          </div>
          <div style={{ fontSize: 12, color: t.text2, marginTop: 3, lineHeight: 1.5 }}>
            {tr('settings.claude.apikey.desc')}
          </div>
        </div>
        {apiKey.hasKey && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999,
            background: `color-mix(in oklch, ${t.ok} 14%, transparent)`,
            color: t.ok, fontSize: 11, fontWeight: 500,
            border: `1px solid color-mix(in oklch, ${t.ok} 30%, transparent)`,
          }}>
            <IconCheck size={11}/> {tr('settings.claude.apikey.saved')} · {apiKey.masked}
          </span>
        )}
      </div>

      <Glass radius={12} style={{ padding: 8, display: 'flex', gap: 8 }}>
        <input
          type="password"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="sk-ant-api03-..."
          style={{
            flex: 1, background: 'transparent', border: 0, outline: 'none',
            fontFamily: t.fontMono, fontSize: 12.5, color: t.text0, padding: '6px 10px',
          }}
        />
        <Btn kind="primary" size="sm" onClick={handleSave} disabled={busy || !draft.trim()} icon={IconCheck}>
          {busy ? tr('settings.claude.apikey.validating') : apiKey.hasKey ? tr('settings.claude.apikey.replace_btn') : tr('settings.claude.apikey.save_btn')}
        </Btn>
        {apiKey.hasKey && (
          <Btn kind="danger" size="sm" onClick={handleDelete} disabled={busy} icon={IconTrash}>{tr('settings.claude.apikey.remove_btn')}</Btn>
        )}
      </Glass>

      {error && (
        <div style={{ fontSize: 11.5, color: t.err, paddingLeft: 4 }}>{error}</div>
      )}
      {success && (
        <div style={{ fontSize: 11.5, color: t.ok, paddingLeft: 4 }}>
          {tr('settings.claude.apikey.success')}
        </div>
      )}
    </div>
  );
}

function SectionVoice() {
  const t = useTokens();
  const tr = useT();
  const tts = useTTS();

  // Auto-seleccionar la mejor voz española al cargar si no hay una elegida.
  // Orden de preferencia: macsay Premium (Apple neural, suena casi humano) >
  // macsay normal > Piper claude (MX alta) > Piper davefx (ES) > cualquier
  // Piper español > cualquier voz en español del sistema.
  useEffect(() => {
    if (tts.selectedVoiceURI) return;
    if (tts.voices.length === 0) return;
    const isEs = (id: string, lang: string) => /^es/i.test(lang) || /^es/i.test(id.split(':')[1] ?? '');
    const candidates = [
      tts.voices.find((v) => v.kind === 'macsay' && v.premium && isEs(v.id, v.language)),
      tts.voices.find((v) => v.kind === 'macsay' && isEs(v.id, v.language)),
      tts.voices.find((v) => /es_MX-claude/i.test(v.id) && v.kind === 'piper'),
      tts.voices.find((v) => /es_ES-davefx/i.test(v.id) && v.kind === 'piper'),
      tts.voices.find((v) => v.kind === 'piper' && /^es/i.test(v.language)),
      tts.voices.find((v) => /^es/i.test(v.language)),
    ];
    const pick = candidates.find(Boolean);
    if (pick) tts.selectVoice(pick.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tts.voices]);

  const currentVoice = tts.voices.find((v) => v.id === tts.selectedVoiceURI);

  function testVoice() {
    const wasEnabled = tts.enabled;
    if (!wasEnabled) tts.setEnabled(true);
    setTimeout(() => tts.speak('Hola, soy Eco. Estoy listo para ayudarte.'), 30);
    setTimeout(() => { if (!wasEnabled) tts.setEnabled(false); }, 4500);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Header title={tr('settings.voice.title')} sub={tr('settings.voice.sub')}/>

      {/* Toggle principal: activar respuestas habladas */}
      <Row icon={IconCommand} title={tr('settings.voice.speak_replies')}
        desc={tr('settings.voice.speak_replies_desc')}
        control={<Toggle on={tts.enabled} onChange={tts.setEnabled}/>}/>

      {/* Selector de voz */}
      <Glass radius={12} style={{ padding: 14, marginTop: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: t.accentFaint, color: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconWave size={18}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: t.text0, fontWeight: 500 }}>
              {tr('settings.voice.voice_label')}
            </div>
            <div style={{ fontSize: 11.5, color: t.text2, marginTop: 2 }}>
              {currentVoice
                ? voiceMetaLine(currentVoice)
                : tr('settings.voice.loading')}
            </div>
          </div>
          <Btn kind="secondary" size="sm" onClick={testVoice} disabled={!currentVoice}>
            {tr('settings.voice.test_btn')}
          </Btn>
        </div>

        {tts.voices.length > 0 && (
          <VoiceSelect
            voices={tts.voices}
            selected={tts.selectedVoiceURI}
            onSelect={tts.selectVoice}
          />
        )}

        <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: t.bg2, fontSize: 11, color: t.text3, lineHeight: 1.5 }}>
          {tr('settings.voice.intent_hint')}
        </div>
      </Glass>

      {/* Velocidad */}
      <Row icon={IconBolt} title={tr('settings.voice.rate')}
        desc={tr('settings.voice.rate_desc')}
        control={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 200 }}>
            <input type="range" min="0.7" max="1.5" step="0.05"
              value={tts.rate} onChange={(e) => tts.setRate(Number(e.target.value))}
              style={{ flex: 1, accentColor: t.accent }}
            />
            <code style={{ fontFamily: t.fontMono, fontSize: 11, color: t.text1, width: 40, textAlign: 'right' }}>
              {tts.rate.toFixed(2)}×
            </code>
          </div>
        }/>

      {/* Volumen */}
      <Row icon={IconWave} title={tr('settings.voice.volume')}
        desc={tr('settings.voice.volume_desc')}
        control={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 200 }}>
            <input type="range" min="0" max="1" step="0.05"
              value={tts.volume} onChange={(e) => tts.setVolume(Number(e.target.value))}
              style={{ flex: 1, accentColor: t.accent }}
            />
            <code style={{ fontFamily: t.fontMono, fontSize: 11, color: t.text1, width: 40, textAlign: 'right' }}>
              {Math.round(tts.volume * 100)}%
            </code>
          </div>
        }/>
    </div>
  );
}

// Etiqueta de meta para mostrar bajo el nombre de la voz: idioma + tipo +
// flag Premium si aplica.
function voiceMetaLine(v: UnifiedVoice): string {
  const parts: string[] = [v.language];
  if (v.kind === 'macsay') parts.push(v.premium ? 'Apple · Premium' : 'Apple');
  else if (v.kind === 'piper') parts.push('neural local');
  else parts.push('sistema');
  return parts.filter(Boolean).join(' · ');
}

// Selector de voz. Agrupamos por backend para que el usuario entienda qué
// está eligiendo. macsay arriba (es lo que recomendamos), luego Piper, luego
// las del navegador como fallback.
function VoiceSelect({
  voices, selected, onSelect,
}: {
  voices: UnifiedVoice[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTokens();
  const macsay = voices.filter((v) => v.kind === 'macsay');
  const piper = voices.filter((v) => v.kind === 'piper');
  const browser = voices.filter((v) => v.kind === 'browser');

  const labelStyle = { color: t.text2, fontWeight: 600 } as const;

  return (
    <select
      value={selected ?? ''}
      onChange={(e) => onSelect(e.target.value)}
      style={{
        marginTop: 12, width: '100%',
        padding: '8px 32px 8px 12px',
        borderRadius: 8,
        border: `1px solid ${t.glassBorder}`,
        background: t.bg2,
        color: t.text0,
        fontSize: 13,
        fontFamily: t.fontSans,
        cursor: 'pointer',
      }}
    >
      {macsay.length > 0 && (
        <optgroup label="Apple (macOS) — recomendado" style={labelStyle}>
          {macsay.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.language}{v.premium ? ' ✦' : ''}
            </option>
          ))}
        </optgroup>
      )}
      {piper.length > 0 && (
        <optgroup label="Piper (neural local)" style={labelStyle}>
          {piper.map((v) => (
            <option key={v.id} value={v.id}>{v.name} · {v.language}</option>
          ))}
        </optgroup>
      )}
      {browser.length > 0 && (
        <optgroup label="Sistema / navegador" style={labelStyle}>
          {browser.map((v) => (
            <option key={v.id} value={v.id}>{v.name} · {v.language}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}


function SectionFolders() {
  const t = useTokens();
  const tr = useT();
  const ws = useWorkspaces();
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleAdd(pathOverride?: string) {
    const v = (pathOverride ?? draft).trim();
    if (!v) return;
    setAdding(true);
    setAddError(null);
    const result = await ws.add(v);
    setAdding(false);
    if (result.ok) {
      setDraft('');
    } else {
      setAddError(result.error);
    }
  }

  // Folder picker nativo (Electron). Si está disponible, lo usamos —
  // si no, cae al input manual.
  async function pickFolder() {
    const api = (window as unknown as { electronAPI?: { pickFolder?: (opts: { title: string }) => Promise<{ canceled: boolean; path: string }> } }).electronAPI;
    if (!api?.pickFolder) {
      // En web puro no hay picker — enfocamos el input para que el user pegue/escriba
      const input = document.querySelector<HTMLInputElement>('input[data-folder-input]');
      input?.focus();
      return;
    }
    try {
      const r = await api.pickFolder({ title: 'Elegir carpeta para Eco' });
      if (r.canceled || !r.path) return;
      // Auto-agrega directamente — el user ya confirmó al elegir.
      await handleAdd(r.path);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Error abriendo Finder');
    }
  }

  const hasNativePicker = typeof window !== 'undefined' && !!window.electronAPI?.pickFolder;

  return (
    <div style={{ maxWidth: 720 }}>
      <Header title={tr('settings.folders.title')} sub={tr('settings.folders.sub')}/>

      <Glass radius={14} style={{ padding: 12, marginBottom: 18 }}>
        {/* Botón principal: elegir con Finder. Más prominente. */}
        {hasNativePicker && (
          <Btn
            kind="primary"
            size="md"
            icon={IconFolder}
            onClick={() => void pickFolder()}
            disabled={adding}
            style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}>
            {adding ? tr('settings.folders.adding') : tr('settings.folders.pick_native')}
          </Btn>
        )}
        {/* Input manual + botón "Agregar" debajo, para casos avanzados */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ color: t.text2 }}><IconFolder size={16}/></div>
          <input
            data-folder-input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setAddError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
            placeholder={tr('settings.folders.add_placeholder')}
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 'none',
              fontFamily: t.fontMono, fontSize: 13, color: t.text0, padding: '8px 4px',
            }}
          />
          <Btn kind={hasNativePicker ? 'ghost' : 'primary'} size="sm" icon={IconPlus} onClick={() => void handleAdd()} disabled={adding || !draft.trim()}>
            {adding ? tr('settings.folders.adding') : tr('settings.folders.add_btn')}
          </Btn>
        </div>
        {addError && (
          <div style={{
            marginTop: 8, padding: '6px 10px', borderRadius: 6,
            background: t.bg2, fontSize: 11.5, color: t.err,
            fontFamily: t.fontMono, lineHeight: 1.4,
            wordBreak: 'break-word',
          }}>{addError}</div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: t.text3, lineHeight: 1.5 }}>
          {tr('settings.folders.hint')}
        </div>
      </Glass>

      {ws.loading ? (
        <div style={{ fontSize: 13, color: t.text2 }}>{tr('common.loading')}</div>
      ) : ws.list.workspaces.length === 0 ? (
        <div style={{ fontSize: 13, color: t.text2, padding: 24, textAlign: 'center' }}>
          {tr('settings.folders.empty')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ws.list.workspaces.map((p) => {
            const fromEnv = ws.list.fromEnv.includes(p);
            return (
              <Glass key={p} radius={12} style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ color: t.accent }}><IconFolder size={18}/></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: t.fontMono, fontSize: 13, color: t.text0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{p}</div>
                    <div style={{ marginTop: 3, fontSize: 11, color: t.text2 }}>
                      {fromEnv ? tr('settings.folders.from_env') : tr('settings.folders.from_app')}
                    </div>
                  </div>
                  {fromEnv ? (
                    <div style={{
                      fontSize: 10.5, padding: '4px 8px', borderRadius: 999,
                      background: t.bg3, color: t.text2,
                      fontFamily: t.fontMono, letterSpacing: 0.4, textTransform: 'uppercase',
                    }}>env</div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => ws.remove(p)}
                      title={tr('settings.claude.apikey.remove_btn')}
                      style={{
                        width: 30, height: 30, borderRadius: 8, border: 0,
                        background: 'transparent', color: t.text2, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      <IconTrash size={14}/>
                    </button>
                  )}
                </div>
                <WorktreeFavoritesField workspace={p}/>
              </Glass>
            );
          })}
        </div>
      )}
      {ws.error && (
        <div style={{ marginTop: 14, fontSize: 12, color: t.err }}>{ws.error}</div>
      )}
    </div>
  );
}

// Editor inline para los branches base favoritos de un workspace. Se guarda
// en localStorage `eco.worktree.favorites.<workspace>` como CSV. El picker
// del NameAgentDialog lee desde acá.
function WorktreeFavoritesField({ workspace }: { workspace: string }) {
  const t = useTokens();
  const key = `eco.worktree.favorites.${workspace}`;
  const [draft, setDraft] = useState<string>(() => {
    try { return window.localStorage.getItem(key) ?? ''; } catch { return ''; }
  });
  const [savedFlash, setSavedFlash] = useState(false);

  function save(v: string) {
    setDraft(v);
    try {
      if (v.trim()) window.localStorage.setItem(key, v.trim());
      else window.localStorage.removeItem(key);
    } catch { /* noop */ }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  }

  return (
    <div style={{
      marginTop: 10, paddingTop: 10,
      borderTop: `1px dashed ${t.glassBorder}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11, color: t.text2, marginBottom: 6,
      }}>
        <IconBranch size={11}/>
        <span>Branches base favoritos (separados por coma)</span>
        {savedFlash && <span style={{ color: t.ok, fontSize: 10.5 }}>· guardado</span>}
      </div>
      <input
        value={draft}
        onChange={(e) => save(e.target.value)}
        placeholder="main, develop, staging"
        spellCheck={false}
        autoCorrect="off"
        style={{
          width: '100%', boxSizing: 'border-box',
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
          borderRadius: 8, padding: '7px 10px',
          fontFamily: t.fontMono, fontSize: 12, color: t.text0,
          outline: 'none',
        }}
      />
      <div style={{ marginTop: 4, fontSize: 10.5, color: t.text3, lineHeight: 1.5 }}>
        Al crear una burbuja con este workspace, podés elegir desde qué rama base
        crear el worktree. Si está vacío, se usa el HEAD del repo padre.
      </div>
    </div>
  );
}

function SectionSecurity() {
  const t = useTokens();
  const tr = useT();
  const [lockMinutes, setLockMinutes] = useState<string>(() => {
    try { return window.localStorage.getItem('eco.security.lockAfterMin') ?? '15'; } catch { return '15'; }
  });
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  function saveLock(v: string) {
    setLockMinutes(v);
    try {
      window.localStorage.setItem('eco.security.lockAfterMin', v);
      window.dispatchEvent(new CustomEvent('eco:security-pref-change'));
    } catch { /* noop */ }
  }

  async function lockNow() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      window.localStorage.removeItem('eco.session');
      window.location.reload();
    } catch { /* noop */ }
  }

  async function clearAllLocal() {
    // Confirm doble — esto es destructivo.
    const confirm1 = window.confirm(tr('settings.security.clear.confirm1'));
    if (!confirm1) return;
    const confirm2 = window.confirm(tr('settings.security.clear.confirm2'));
    if (!confirm2) return;
    setClearing(true);
    try {
      // Borra localStorage (excepto el token de auth para que la app siga
      // accediendo al backend para confirmar).
      const token = window.localStorage.getItem('eco.session');
      window.localStorage.clear();
      if (token) window.localStorage.setItem('eco.session', token);
      setClearMsg(tr('settings.security.clear.done'));
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setClearMsg(e instanceof Error ? e.message : 'Error');
      setClearing(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Header title={tr('settings.security.title')} sub={tr('settings.security.sub')}/>

      {/* Bloqueo por inactividad — guardado en localStorage, App.tsx lee la
          preferencia y dispara `auth.lock` cuando se cumple el tiempo. */}
      <Row icon={IconLock} title={tr('settings.security.lock_inactivity')}
        desc={tr('settings.security.lock_inactivity_desc')}
        control={
          <select value={lockMinutes} onChange={(e) => saveLock(e.target.value)}
            style={{ ...fieldStyle(t), width: 160 }}>
            <option value="never">{tr('settings.security.never')}</option>
            <option value="5">{tr('settings.security.minutes', { n: 5 })}</option>
            <option value="15">{tr('settings.security.minutes', { n: 15 })}</option>
            <option value="30">{tr('settings.security.minutes', { n: 30 })}</option>
            <option value="60">{tr('settings.security.one_hour')}</option>
          </select>
        }/>

      {/* Bloquear pantalla ahora — fuerza logout local + reload. */}
      <Row icon={IconShield} title={tr('settings.security.lock_now')}
        desc={tr('settings.security.lock_now_desc')}
        control={
          <Btn kind="secondary" size="sm" icon={IconLock} onClick={() => void lockNow()}>
            {tr('settings.security.lock_now_btn')}
          </Btn>
        }/>

      {/* Limpiar datos locales — borra localStorage (foto de perfil,
          preferencias, historial de bubbles cacheado, etc.). NO toca el
          archivo del usuario ni los worktrees. */}
      <Row icon={IconTrash} title={tr('settings.security.clear.title')} danger
        desc={tr('settings.security.clear.desc')}
        control={
          <Btn kind="danger" size="sm" disabled={clearing} onClick={() => void clearAllLocal()}>
            {clearing ? '...' : tr('settings.security.clear.btn')}
          </Btn>
        }/>
      {clearMsg && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 8,
          background: t.bg2, fontSize: 11.5, color: t.ok,
          fontFamily: t.fontMono,
        }}>{clearMsg}</div>
      )}
    </div>
  );
}

function SectionAppearance() {
  const t = useTokens();
  const tr = useT();
  const { mode, setMode, accentHue, setAccentHue } = useTheme();

  // Grupo 1: modos generales (dark/light/system) — comportamiento adaptable.
  const basicModes = [
    { id: 'system' as const, label: tr('settings.appearance.theme.system'), preview: 'linear-gradient(135deg, #0a0a0c 50%, #fbfbfd 50%)' },
    { id: 'dark' as const,   label: tr('settings.appearance.theme.dark'),   preview: '#0a0a0c' },
    { id: 'light' as const,  label: tr('settings.appearance.theme.light'),  preview: '#fbfbfd' },
  ];

  // Grupo 2: temas con color characteristic — paletas curadas.
  const curatedThemes = THEME_VARIANTS.filter((v) => v.id !== 'dark' && v.id !== 'light');

  return (
    <div style={{ maxWidth: 760 }}>
      <Header title={tr('settings.appearance.title')} sub={tr('settings.appearance.sub')}/>

      <SectionLabel>{tr('settings.appearance.theme')}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        {basicModes.map((m) => (
          <button key={m.id} type="button" onClick={() => setMode(m.id)} style={{
            padding: 14, border: `1px solid ${mode === m.id ? t.accentDim : t.glassBorder}`,
            borderRadius: 14, background: mode === m.id ? t.accentFaint : t.bg2,
            cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              height: 56, borderRadius: 8, marginBottom: 10,
              background: m.preview, border: `1px solid ${t.glassBorder}`,
            }}/>
            <div style={{
              fontSize: 13, color: mode === m.id ? t.accent : t.text0, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>{mode === m.id && <IconCheck size={12} strokeWidth={3}/>}{m.label}</div>
          </button>
        ))}
      </div>

      <SectionLabel>{tr('settings.appearance.theme.curated')}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 22 }}>
        {curatedThemes.map((v) => {
          const selected = mode === v.id;
          return (
            <button key={v.id} type="button" onClick={() => setMode(v.id)} style={{
              padding: 8, border: `1px solid ${selected ? t.accentDim : t.glassBorder}`,
              borderRadius: 12, background: selected ? t.accentFaint : t.bg2,
              cursor: 'pointer', textAlign: 'left',
              transition: 'all 140ms',
            }}>
              <div style={{
                height: 44, borderRadius: 6, marginBottom: 6,
                background: v.preview, border: `1px solid ${t.glassBorder}`,
                position: 'relative',
              }}>
                {/* Mini accent dot para preview de cómo se ve el accent encima del fondo */}
                <span style={{
                  position: 'absolute', bottom: 5, right: 5,
                  width: 8, height: 8, borderRadius: '50%',
                  background: `oklch(76% 0.13 ${accentHue})`,
                  boxShadow: `0 0 4px oklch(76% 0.13 ${accentHue})`,
                }}/>
              </div>
              <div style={{
                fontSize: 11.5, color: selected ? t.accent : t.text1, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 4,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {selected && <IconCheck size={10} strokeWidth={3}/>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</span>
              </div>
            </button>
          );
        })}
      </div>

      <SectionLabel>{tr('settings.appearance.accent')}</SectionLabel>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10,
        marginBottom: 22,
      }}>
        {ACCENT_HUES.map((a) => {
          const selected = accentHue === a.hue;
          return (
            <button key={a.hue} type="button" onClick={() => setAccentHue(a.hue)}
              title={a.name}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '8px 4px', borderRadius: 10,
                background: selected ? t.accentFaint : 'transparent',
                border: `1px solid ${selected ? t.accentDim : 'transparent'}`,
                cursor: 'pointer',
                transition: 'background 140ms, border-color 140ms',
              }}>
              <span style={{
                width: 32, height: 32, borderRadius: '50%',
                background: `oklch(70% 0.13 ${a.hue})`,
                border: `2px solid ${selected ? `oklch(78% 0.14 ${a.hue})` : 'transparent'}`,
                boxShadow: selected
                  ? `0 0 0 2px ${t.bg1}, 0 0 0 4px oklch(74% 0.13 ${a.hue})`
                  : `0 1px 3px rgba(0,0,0,0.2)`,
              }}/>
              <span style={{
                fontSize: 10.5, color: selected ? t.accent : t.text2,
                fontFamily: t.fontSans, fontWeight: 500,
                textAlign: 'center', whiteSpace: 'nowrap',
              }}>{a.name.replace(' (Eco)', '')}</span>
            </button>
          );
        })}
      </div>

      <SectionLabel>Categorías de agentes</SectionLabel>
      <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.5, marginBottom: 10 }}>
        Etiquetá tus agentes con categorías. El color de la categoría tiñe el
        nodo del agente en la vista de grafo del Dashboard.
      </div>
      <CategoryManager/>
    </div>
  );
}

// Editor de categorías — lista con nombre + color picker + borrar, y un
// botón para agregar. Persiste vía useCategories (localStorage compartido).
function CategoryManager() {
  const t = useTokens();
  const { categories, add, update, remove } = useCategories();
  const [draftName, setDraftName] = useState('');

  return (
    <div style={{ marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {categories.length === 0 && (
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: t.bg2, border: `1px dashed ${t.glassBorder}`,
          fontSize: 11.5, color: t.text2,
        }}>
          Sin categorías. Agregá una abajo (ej. «Producción», «Bugs», «Spike»).
        </div>
      )}
      {categories.map((c) => (
        <div key={c.id} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 10,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
        }}>
          {/* Swatches de color — envuelven en varias filas con paleta amplia. */}
          <div style={{
            display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0,
            maxWidth: 198,
          }}>
            {CATEGORY_PALETTE.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => update(c.id, { color: col })}
                title={col}
                style={{
                  width: 15, height: 15, borderRadius: '50%',
                  background: col, cursor: 'pointer', padding: 0,
                  border: c.color === col ? `2px solid ${t.text0}` : `2px solid transparent`,
                  boxShadow: c.color === col ? `0 0 0 1px ${col}` : 'none',
                }}
              />
            ))}
          </div>
          <input
            value={c.name}
            onChange={(e) => update(c.id, { name: e.target.value })}
            placeholder="Nombre de la categoría"
            style={{
              flex: 1, minWidth: 0, boxSizing: 'border-box',
              background: t.bg3, border: `1px solid ${t.glassBorder}`,
              borderRadius: 8, padding: '5px 9px',
              fontFamily: t.fontSans, fontSize: 12.5, color: t.text0,
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={() => remove(c.id)}
            title="Eliminar categoría"
            style={{
              width: 26, height: 26, borderRadius: 7, border: 0,
              background: 'transparent', color: t.text3, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = t.err; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = t.text3; }}>
            <IconTrash size={13}/>
          </button>
        </div>
      ))}
      {/* Fila para agregar */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draftName.trim()) {
              add(draftName.trim(), CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length]!);
              setDraftName('');
            }
          }}
          placeholder="Nueva categoría…"
          style={{
            flex: 1, boxSizing: 'border-box',
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            borderRadius: 8, padding: '7px 10px',
            fontFamily: t.fontSans, fontSize: 12.5, color: t.text0,
            outline: 'none',
          }}
        />
        <Btn
          kind="primary" size="sm"
          disabled={!draftName.trim()}
          onClick={() => {
            add(draftName.trim(), CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length]!);
            setDraftName('');
          }}>
          Agregar
        </Btn>
      </div>
    </div>
  );
}

function SectionIntegrations() {
  const t = useTokens();
  const tr = useT();
  const { status: obs, vaults, save: saveObs, refresh } = useObsidian();
  const [vaultDraft, setVaultDraft] = useState(obs.vaultPath);
  const [mode, setMode] = useState<'builtin' | 'custom'>(obs.mode);
  const [commandDraft, setCommandDraft] = useState(obs.customCommand);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { setVaultDraft(obs.vaultPath); }, [obs.vaultPath]);
  useEffect(() => { setMode(obs.mode); }, [obs.mode]);
  useEffect(() => { setCommandDraft(obs.customCommand); }, [obs.customCommand]);

  async function persist(enabled: boolean, vault: string, nextMode = mode, nextCmd = commandDraft) {
    setBusy(true);
    setMsg(null);
    const ok = await saveObs(enabled, vault, nextMode, nextCmd);
    if (!ok) setMsg({ ok: false, text: 'No se pudo guardar' });
    else { await refresh(); setMsg({ ok: true, text: 'Guardado' }); }
    setBusy(false);
    setTimeout(() => setMsg(null), 3000);
  }

  async function pickFolder() {
    const picked = await pickVaultFolder();
    if (picked) setVaultDraft(picked);
  }

  const validVault = obs.vaultExists && !!obs.vaultPath;
  const hasElectron = typeof window !== 'undefined' && !!window.electronAPI?.pickFolder;

  return (
    <div style={{ maxWidth: 720 }}>
      <Header title={tr('settings.integrations.title')} sub={tr('settings.integrations.sub')}/>

      <SectionLabel>Obsidian</SectionLabel>
      <Glass radius={14} style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: t.accentFaint, color: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconLayers size={20}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: t.text0, marginBottom: 4 }}>
              {tr('settings.integrations.obsidian.title')}
            </div>
            <div style={{ fontSize: 12.5, color: t.text2, lineHeight: 1.5, marginBottom: 12 }}>
              {tr('settings.integrations.obsidian.desc')}
            </div>

            <div style={{
              padding: 10, marginBottom: 12, borderRadius: 10,
              background: t.bg2, fontSize: 11.5, color: t.text2,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusDot color={validVault ? t.ok : (obs.vaultPath ? t.warn : t.text3)}/>
                <span style={{ flex: 1 }}>
                  {!obs.vaultPath ? 'Sin configurar — elegí un vault abajo.'
                    : !obs.vaultExists ? 'El path configurado no existe en disco.'
                    : !obs.hasParaStructure ? `Vault detectado · ${obs.noteCount} notas · estructura PARA se creará al guardar.`
                    : `Vault listo · ${obs.noteCount} notas · estructura PARA detectada.`}
                </span>
              </div>
              {obs.vaultPath && (
                <div style={{
                  fontFamily: t.fontMono, fontSize: 10.5, color: t.text3,
                  paddingLeft: 16, wordBreak: 'break-all',
                }}>
                  {obs.enabled && validVault ? '✓ activo: ' : ''}{obs.vaultPath}
                </div>
              )}
            </div>

            {/* Vaults detectados en Obsidian. Si la lista vino vacía,
                mostramos un placeholder + botón Refrescar — útil cuando el
                user instaló Obsidian o configuró un vault después de abrir
                Eco, o si el detector falló en la primera carga (race con
                session/backend warmup). */}
            {vaults.length === 0 && (
              <div style={{
                marginBottom: 12, padding: 10, borderRadius: 10,
                background: t.bg2, border: `1px dashed ${t.glassBorder}`,
                fontSize: 11, color: t.text2, lineHeight: 1.5,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ flex: 1 }}>
                  No se detectaron vaults de Obsidian instalados. Asegurate de tener Obsidian abierto al menos una vez,
                  o pegá el path manualmente abajo.
                </div>
                <Btn kind="ghost" size="sm" onClick={() => void refresh()}>
                  Refrescar
                </Btn>
              </div>
            )}
            {vaults.length > 0 && (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 4,
                }}>
                  <label style={{ fontSize: 11, color: t.text2 }}>
                    {tr('settings.integrations.obsidian.detected_label')}
                  </label>
                  <button type="button" onClick={() => void refresh()}
                    style={{
                      border: 0, background: 'transparent', cursor: 'pointer',
                      color: t.text3, fontSize: 10.5, padding: '2px 6px',
                    }}
                    title="Volver a detectar vaults">
                    ↻ Refrescar
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                  {vaults.map((v) => {
                    const selected = v.path === vaultDraft;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVaultDraft(v.path)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 10px', borderRadius: 8,
                          border: `1px solid ${selected ? t.accent : t.glassBorder}`,
                          background: selected ? t.accentFaint : t.bg2,
                          color: t.text0,
                          cursor: 'pointer', textAlign: 'left',
                          transition: 'all 140ms',
                        }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                          background: selected ? t.accent : t.bg3,
                          color: selected ? t.accentOn : t.text1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: t.fontSans, fontSize: 13, fontWeight: 600,
                        }}>{v.name.charAt(0).toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: t.text0 }}>
                            {v.name}
                            {v.open && (
                              <span style={{ marginLeft: 8, fontSize: 9.5, color: t.ok, fontWeight: 500 }}>
                                · {tr('settings.integrations.obsidian.vault_open')}
                              </span>
                            )}
                          </div>
                          <div style={{
                            fontFamily: t.fontMono, fontSize: 10.5, color: t.text3,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{v.path}</div>
                        </div>
                        {selected && <IconCheck size={14} style={{ color: t.accent }}/>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <label style={{ display: 'block', fontSize: 11, color: t.text2, marginBottom: 4 }}>
              {tr('settings.integrations.obsidian.vault_label')}
            </label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input
                value={vaultDraft}
                onChange={(e) => setVaultDraft(e.target.value)}
                placeholder="/Users/.../Documents/Obsidian/Aditum-KB"
                spellCheck={false}
                autoCorrect="off"
                style={{ ...fieldStyle(t), flex: 1 }}
              />
              {hasElectron && (
                <Btn kind="ghost" size="sm" onClick={() => void pickFolder()}>
                  {tr('settings.integrations.obsidian.pick_folder')}
                </Btn>
              )}
            </div>

            {/* Modo de guardado: built-in vs custom command. */}
            <div style={{
              marginTop: 14, padding: 10, borderRadius: 10,
              border: `1px solid ${t.glassBorder}`, background: t.bg2,
            }}>
              <label style={{ display: 'block', fontSize: 11, color: t.text2, marginBottom: 8 }}>
                Modo de guardado
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ModeRow
                  active={mode === 'builtin'}
                  title="Built-in (PARA-lite)"
                  desc="Eco escribe la sesión directo al vault en 10 - Projects/<repo>/Sessions/."
                  onClick={() => setMode('builtin')}
                  t={t}
                />
                <ModeRow
                  active={mode === 'custom'}
                  title="Comando custom"
                  desc="Eco ejecuta tu comando con la sesión por stdin. Útil para usar tu skill global (ej: claude -p &quot;/kb&quot;)."
                  onClick={() => setMode('custom')}
                  t={t}
                />
              </div>
              {mode === 'custom' && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ display: 'block', fontSize: 11, color: t.text2, marginBottom: 4 }}>
                    Comando
                  </label>
                  <input
                    value={commandDraft}
                    onChange={(e) => setCommandDraft(e.target.value)}
                    placeholder='claude -p "/kb"'
                    spellCheck={false}
                    autoCorrect="off"
                    style={{ ...fieldStyle(t), width: '100%', fontFamily: t.fontMono, fontSize: 12 }}
                  />
                  <div style={{ fontSize: 10.5, color: t.text3, marginTop: 4, lineHeight: 1.5 }}>
                    Se ejecuta con shell habilitado, cwd = workspace de la burbuja, y el markdown de la sesión se pipea por stdin.
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Toggle
                  on={obs.enabled && (mode === 'custom' ? !!commandDraft.trim() : validVault)}
                  onChange={(v) => { if (mode === 'custom' ? !!commandDraft.trim() : (validVault || !v)) void persist(v, obs.vaultPath); }}
                  disabled={mode === 'custom' ? !commandDraft.trim() : !validVault}
                />
                <span style={{ fontSize: 12.5, color: t.text1 }}>
                  {tr('settings.integrations.obsidian.enabled_label')}
                </span>
              </div>
              <div style={{ flex: 1 }}/>
              <Btn
                kind="primary" size="sm"
                onClick={() => void persist(obs.enabled, vaultDraft, mode, commandDraft)}
                disabled={busy || (vaultDraft === obs.vaultPath && mode === obs.mode && commandDraft === obs.customCommand)}>
                {busy ? '...' : tr('common.save')}
              </Btn>
            </div>

            {msg && (
              <div style={{
                marginTop: 10, fontSize: 11.5,
                color: msg.ok ? t.ok : t.err,
              }}>{msg.text}</div>
            )}

            <div style={{ marginTop: 14, padding: 10, borderRadius: 8, background: t.bg2, fontSize: 11, color: t.text3, lineHeight: 1.5 }}>
              <strong style={{ color: t.text2 }}>{tr('settings.integrations.obsidian.howto')}</strong>{' '}
              {tr('settings.integrations.obsidian.howto_desc')}
            </div>
          </div>
        </div>
      </Glass>
    </div>
  );
}

function ModeRow({ active, title, desc, onClick, t }: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
  t: ReturnType<typeof useTokens>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '8px 10px', borderRadius: 8,
        border: `1px solid ${active ? t.accent : t.glassBorder}`,
        background: active ? t.accentFaint : t.bg3,
        color: t.text0, cursor: 'pointer', textAlign: 'left',
        transition: 'all 140ms',
      }}>
      <span style={{
        flexShrink: 0, marginTop: 2,
        width: 14, height: 14, borderRadius: '50%',
        border: `2px solid ${active ? t.accent : t.text3}`,
        background: active ? t.accent : 'transparent',
        boxShadow: active ? `inset 0 0 0 2px ${t.bg3}` : 'none',
      }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: t.text0 }}>{title}</div>
        <div style={{ fontSize: 11, color: t.text2, marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
      </div>
    </button>
  );
}

type AboutSectionDef = {
  id: string;
  title: string;
  group: 'start' | 'reference' | 'help' | 'tech';
  icon: (p: IconProps) => JSX.Element;
  keywords: string;
  render: () => ReactNode;
};

function SectionAbout() {
  const t = useTokens();
  const tr = useT();
  const [version, setVersion] = useState<string>('0.1.0');
  const [platform, setPlatform] = useState<string>('');
  const [isPackaged, setIsPackaged] = useState<boolean>(false);
  const [activeId, setActiveId] = useState<string>(() => {
    try { return localStorage.getItem('eco.about.active') || 'what'; } catch { return 'what'; }
  });
  const [q, setQ] = useState<string>('');

  useEffect(() => {
    const api = window.electronAPI;
    if (api?.getConfig) {
      void api.getConfig().then((cfg) => {
        setVersion(cfg.appVersion ?? '0.1.0');
        setPlatform(cfg.platform ?? '');
        setIsPackaged(cfg.isPackaged ?? false);
      }).catch(() => { /* noop */ });
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('eco.about.active', activeId); } catch { /* noop */ }
  }, [activeId]);

  const sections: AboutSectionDef[] = [
    { id: 'what',       group: 'start',     icon: IconInfo,     title: tr('settings.about.what.title'),
      keywords: 'overview qué hace eco descripción introducción',
      render: () => <p style={{ margin: 0, lineHeight: 1.7, fontSize: 13.5, color: t.text1 }}>{tr('settings.about.what.body')}</p> },
    { id: 'quickstart', group: 'start',     icon: IconBolt,     title: tr('settings.about.quickstart.title'),
      keywords: 'inicio rápido empezar primer paso instalar setup claude cli api key wake word listener',
      render: () => <QuickStartList/> },
    { id: 'tutorials',  group: 'start',     icon: IconCommand,  title: tr('settings.about.tutorials.title'),
      keywords: 'tutorial guía paso a paso agente dev server commit voz',
      render: () => <TutorialsList/> },
    { id: 'features',   group: 'reference', icon: IconLayers,   title: tr('settings.about.features.title'),
      keywords: 'características features qué incluye agentes terminal navegador obsidian',
      render: () => <FeatureGrid/> },
    { id: 'voice',      group: 'reference', icon: IconMic,      title: tr('settings.about.voice.title'),
      keywords: 'voz comandos hey eco wake word listener micrófono whisper piper',
      render: () => <VoiceCommandsList/> },
    { id: 'shortcuts',  group: 'reference', icon: IconKey,      title: tr('settings.about.shortcuts.title'),
      keywords: 'atajos keyboard shortcuts teclado cmd shift ctrl',
      render: () => <ShortcutsList/> },
    { id: 'slash',      group: 'reference', icon: IconTerminal, title: tr('settings.about.slash.title'),
      keywords: 'slash commands /dev-up /remote-control /kb skills',
      render: () => <SlashCommandsList/> },
    { id: 'faq',        group: 'help',      icon: IconInfo,     title: tr('settings.about.faq.title'),
      keywords: 'faq preguntas frecuentes costo precio offline windows linux commit push worktree datos micrófono',
      render: () => <FaqList/> },
    { id: 'trouble',    group: 'help',      icon: IconAlert,    title: tr('settings.about.trouble.title'),
      keywords: 'troubleshooting solución problemas error terminal puerto servidor navegador 401 voz reset',
      render: () => <TroubleshootingList/> },
    { id: 'support',    group: 'help',      icon: IconShield,   title: tr('settings.about.support.title'),
      keywords: 'soporte support bug reporte logs reset diagnóstico contacto',
      render: () => <SupportList/> },
    { id: 'privacy',    group: 'tech',      icon: IconShield,   title: tr('settings.about.privacy.title'),
      keywords: 'privacidad datos local cloud anthropic audio whisper piper auth pin frase',
      render: () => <PrivacyList/> },
    { id: 'network',    group: 'tech',      icon: IconGlobe,    title: tr('settings.about.network.title'),
      keywords: 'red network conexiones backend webview anthropic obsidian whisper piper loopback',
      render: () => <NetworkList/> },
    { id: 'files',      group: 'tech',      icon: IconFolder,   title: tr('settings.about.files.title'),
      keywords: 'archivos rutas paths .eco api-key obsidian worktrees localstorage user.json token',
      render: () => <FilesList/> },
    { id: 'dev',        group: 'tech',      icon: IconTerminal, title: tr('settings.about.dev.title'),
      keywords: 'developer dev mode env variables ECO_HOST ECO_PORT scripts npm typecheck',
      render: () => <DevList/> },
    { id: 'stack',      group: 'tech',      icon: IconCpu,      title: tr('settings.about.stack.title'),
      keywords: 'stack técnico tecnologías electron vite react xterm whisper piper node',
      render: () => <StackList/> },
    { id: 'credits',    group: 'tech',      icon: IconInfo,     title: tr('settings.about.credits.title'),
      keywords: 'créditos credits autor sergio aditum',
      render: () => <CreditsBody/> },
  ];

  const query = q.trim().toLowerCase();
  const isSearching = query.length > 0;
  const filtered = !isSearching ? sections : sections.filter((s) =>
    s.title.toLowerCase().includes(query) || s.keywords.toLowerCase().includes(query)
  );

  const activeSection = !isSearching
    ? (sections.find((s) => s.id === activeId) ?? sections[0])
    : (filtered.find((s) => s.id === activeId) ?? filtered[0]);

  const groups: { id: AboutSectionDef['group']; label: string }[] = [
    { id: 'start',     label: tr('settings.about.group.start') },
    { id: 'reference', label: tr('settings.about.group.reference') },
    { id: 'help',      label: tr('settings.about.group.help') },
    { id: 'tech',      label: tr('settings.about.group.tech') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hero */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 18,
        padding: '6px 4px 20px',
        borderBottom: `1px solid ${t.glassBorder}`,
      }}>
        <EcoMark size={56}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: t.text0, letterSpacing: -0.5 }}>Eco</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: t.text2, lineHeight: 1.5 }}>
            {tr('settings.about.tagline')}
          </p>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Chip mono>v{version}</Chip>
            <Chip mono>{platform || 'web'}</Chip>
            <Chip color={isPackaged ? t.ok : t.warn}>
              {isPackaged ? tr('settings.about.packaged') : tr('settings.about.dev')}
            </Chip>
          </div>
        </div>
        {/* Search */}
        <div style={{
          position: 'relative', width: 280, flexShrink: 0,
        }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: t.text3, display: 'inline-flex',
          }}>
            <IconCommand size={14}/>
          </span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr('settings.about.search.placeholder')}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '9px 12px 9px 34px',
              borderRadius: 9, border: `1px solid ${t.glassBorder}`,
              background: t.bg2, color: t.text0,
              fontFamily: t.fontSans, fontSize: 12.5,
              outline: 'none',
            }}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Clear"
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                width: 22, height: 22, borderRadius: 6, border: 0,
                background: 'transparent', color: t.text3,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >×</button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Inner sidebar */}
        <aside style={{
          width: 240, flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 2,
          position: 'sticky', top: 0,
        }}>
          {isSearching && (
            <div style={{
              padding: '6px 12px 10px',
              fontSize: 11, color: t.text2,
              fontFamily: t.fontMono,
            }}>
              {filtered.length === 0
                ? tr('settings.about.search.empty')
                : `${filtered.length} ${filtered.length === 1 ? tr('settings.about.search.one') : tr('settings.about.search.many')}`}
            </div>
          )}
          {groups.map((g) => {
            const items = filtered.filter((s) => s.group === g.id);
            if (items.length === 0) return null;
            return (
              <div key={g.id} style={{ marginBottom: 8 }}>
                <div style={{
                  fontSize: 10, color: t.text3, textTransform: 'uppercase',
                  letterSpacing: 0.6, fontWeight: 600,
                  padding: '6px 12px',
                }}>{g.label}</div>
                {items.map((s) => {
                  const isActive = activeSection && s.id === activeSection.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveId(s.id)}
                      style={{
                        width: '100%',
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8, border: 0,
                        background: isActive ? t.bg3 : 'transparent',
                        color: isActive ? t.text0 : t.text1,
                        fontFamily: t.fontSans, fontSize: 12.5, fontWeight: 500,
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'background 120ms ease',
                      }}
                      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = t.bg2; }}
                      onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      <s.icon size={14}/>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </aside>

        {/* Content */}
        <main style={{
          flex: 1, minWidth: 0,
          background: t.bg2,
          border: `1px solid ${t.glassBorder}`,
          borderRadius: 14,
          padding: '22px 26px',
        }}>
          {activeSection ? (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 14, paddingBottom: 12,
                borderBottom: `1px solid ${t.glassBorder}`,
              }}>
                <span style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: t.accentFaint, color: t.accent,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <activeSection.icon size={16}/>
                </span>
                <h3 style={{
                  margin: 0, fontSize: 17, fontWeight: 600, color: t.text0,
                  letterSpacing: -0.3,
                }}>{activeSection.title}</h3>
              </div>
              <div style={{ color: t.text1, fontSize: 12.5, lineHeight: 1.55 }}>
                {activeSection.render()}
              </div>
            </>
          ) : (
            <div style={{
              padding: 40, textAlign: 'center',
              color: t.text2, fontSize: 13,
            }}>
              {tr('settings.about.search.empty')}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Chip({ children, mono, color }: { children: ReactNode; mono?: boolean; color?: string }) {
  const t = useTokens();
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 999,
      background: color ? `color-mix(in oklch, ${color} 14%, transparent)` : t.bg3,
      color: color ?? t.text1,
      border: `1px solid ${color ? `color-mix(in oklch, ${color} 32%, transparent)` : t.glassBorder}`,
      fontFamily: mono ? t.fontMono : t.fontSans,
      fontSize: 10.5, fontWeight: 500,
    }}>{children}</span>
  );
}

function FeatureGrid() {
  const t = useTokens();
  const tr = useT();
  const features = [
    { icon: IconCommand,  title: tr('settings.about.feat.agents.title'),  body: tr('settings.about.feat.agents.body') },
    { icon: IconTerminal, title: tr('settings.about.feat.terminal.title'), body: tr('settings.about.feat.terminal.body') },
    { icon: IconGlobe,    title: tr('settings.about.feat.browser.title'),  body: tr('settings.about.feat.browser.body') },
    { icon: IconCpu,      title: tr('settings.about.feat.server.title'),   body: tr('settings.about.feat.server.body') },
    { icon: IconFolder,   title: tr('settings.about.feat.git.title'),      body: tr('settings.about.feat.git.body') },
    { icon: IconCheck,    title: tr('settings.about.feat.review.title'),   body: tr('settings.about.feat.review.body') },
    { icon: IconMic,      title: tr('settings.about.feat.voice.title'),    body: tr('settings.about.feat.voice.body') },
    { icon: IconLayers,   title: tr('settings.about.feat.obsidian.title'), body: tr('settings.about.feat.obsidian.body') },
    { icon: IconBolt,     title: tr('settings.about.feat.skills.title'),   body: tr('settings.about.feat.skills.body') },
    { icon: IconSettings, title: tr('settings.about.feat.themes.title'),   body: tr('settings.about.feat.themes.body') },
    { icon: IconTrash,    title: tr('settings.about.feat.cleanup.title'),  body: tr('settings.about.feat.cleanup.body') },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 10, marginTop: 6,
    }}>
      {features.map((f, i) => (
        <div key={i} style={{
          padding: 12, borderRadius: 10,
          background: t.bg1, border: `1px solid ${t.glassBorder}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 7,
              background: t.accentFaint, color: t.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><f.icon size={13}/></span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: t.text0 }}>{f.title}</span>
          </div>
          <p style={{ margin: 0, fontSize: 11.5, color: t.text2, lineHeight: 1.5 }}>{f.body}</p>
        </div>
      ))}
    </div>
  );
}

function TutorialsList() {
  const tr = useT();
  const tutorials = [
    {
      title: tr('settings.about.tut.first_agent.title'),
      steps: [
        tr('settings.about.tut.first_agent.s1'),
        tr('settings.about.tut.first_agent.s2'),
        tr('settings.about.tut.first_agent.s3'),
        tr('settings.about.tut.first_agent.s4'),
      ],
    },
    {
      title: tr('settings.about.tut.dev_server.title'),
      steps: [
        tr('settings.about.tut.dev_server.s1'),
        tr('settings.about.tut.dev_server.s2'),
        tr('settings.about.tut.dev_server.s3'),
      ],
    },
    {
      title: tr('settings.about.tut.commit.title'),
      steps: [
        tr('settings.about.tut.commit.s1'),
        tr('settings.about.tut.commit.s2'),
        tr('settings.about.tut.commit.s3'),
      ],
    },
    {
      title: tr('settings.about.tut.voice.title'),
      steps: [
        tr('settings.about.tut.voice.s1'),
        tr('settings.about.tut.voice.s2'),
      ],
    },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
      {tutorials.map((t, i) => (
        <Tutorial key={i} title={t.title} steps={t.steps}/>
      ))}
    </div>
  );
}

function Tutorial({ title, steps }: { title: string; steps: string[] }) {
  const t = useTokens();
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text0, marginBottom: 6 }}>{title}</div>
      <ol style={{
        margin: 0, paddingLeft: 24,
        display: 'flex', flexDirection: 'column', gap: 4,
        fontSize: 12, color: t.text1, lineHeight: 1.55,
      }}>
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </div>
  );
}

function ShortcutsList() {
  const t = useTokens();
  const tr = useT();
  const rows = [
    { keys: ['⌘', 'R'],   action: tr('settings.about.sc.reload') },
    { keys: ['⌘', '⌥', 'I'], action: tr('settings.about.sc.devtools') },
    { keys: ['⌘', ','],   action: tr('settings.about.sc.settings') },
    { keys: ['Esc'],      action: tr('settings.about.sc.close_modal') },
    { keys: ['Eco', '+ comando'], action: tr('settings.about.sc.voice_command') },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {r.keys.map((k) => (
              <span key={k} style={{
                minWidth: 26, height: 24, padding: '0 6px', borderRadius: 6,
                background: t.bg3, border: `1px solid ${t.glassBorder}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: t.fontMono, fontSize: 11, color: t.text1,
              }}>{k}</span>
            ))}
          </div>
          <span style={{ fontSize: 12, color: t.text2 }}>{r.action}</span>
        </div>
      ))}
    </div>
  );
}

function PrivacyList() {
  const t = useTokens();
  const tr = useT();
  const rows = [
    { label: tr('settings.about.priv.audio.label'),    desc: tr('settings.about.priv.audio.desc'),    local: true },
    { label: tr('settings.about.priv.tts.label'),      desc: tr('settings.about.priv.tts.desc'),      local: true },
    { label: tr('settings.about.priv.auth.label'),     desc: tr('settings.about.priv.auth.desc'),     local: true },
    { label: tr('settings.about.priv.workspace.label'), desc: tr('settings.about.priv.workspace.desc'), local: true },
    { label: tr('settings.about.priv.history.label'),  desc: tr('settings.about.priv.history.desc'),  local: true },
    { label: tr('settings.about.priv.claude.label'),   desc: tr('settings.about.priv.claude.desc'),   local: false },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', marginTop: 4, flexShrink: 0,
            background: r.local ? t.ok : t.warn,
            boxShadow: `0 0 6px ${r.local ? t.ok : t.warn}`,
          }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: t.text0 }}>{r.label}</div>
            <div style={{ fontSize: 11.5, color: t.text2, marginTop: 2 }}>{r.desc}</div>
          </div>
          <Chip color={r.local ? t.ok : t.warn} mono>
            {r.local ? tr('settings.about.priv.local') : tr('settings.about.priv.cloud')}
          </Chip>
        </div>
      ))}
    </div>
  );
}

function StackList() {
  const t = useTokens();
  const rows = [
    { layer: 'Empaquetado', tech: 'Electron 33 + electron-builder 25' },
    { layer: 'Frontend',    tech: 'Vite 6 · React 18 · TS 5 · Tailwind v4 · Motion 11' },
    { layer: 'Navegador',   tech: '<webview> Chromium (UA Chrome 131)' },
    { layer: 'Terminal',    tech: 'xterm.js + node-pty (PTY real)' },
    { layer: 'Voz STT',     tech: 'openwakeword (ONNX) + faster-whisper' },
    { layer: 'Voz TTS',     tech: 'Piper TTS (ONNX local)' },
    { layer: 'Backend',     tech: 'Node 20 · Express · ws · Zod · argon2id · Claude Agent SDK' },
    { layer: 'Auth local',  tech: 'PIN argon2id + frase BIP39 (~/.eco/user.json)' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      {rows.map((r) => (
        <div key={r.layer} style={{
          display: 'flex', gap: 14, padding: '6px 0',
          borderBottom: `1px solid ${t.glassBorder}`,
        }}>
          <span style={{ width: 110, fontSize: 11.5, color: t.text2, fontWeight: 500, flexShrink: 0 }}>{r.layer}</span>
          <span style={{ flex: 1, fontFamily: t.fontMono, fontSize: 11, color: t.text1 }}>{r.tech}</span>
        </div>
      ))}
    </div>
  );
}

function QuickStartList() {
  const t = useTokens();
  const tr = useT();
  const steps = [
    { num: 1, title: tr('settings.about.qs.s1.t'), body: tr('settings.about.qs.s1.b') },
    { num: 2, title: tr('settings.about.qs.s2.t'), body: tr('settings.about.qs.s2.b') },
    { num: 3, title: tr('settings.about.qs.s3.t'), body: tr('settings.about.qs.s3.b') },
    { num: 4, title: tr('settings.about.qs.s4.t'), body: tr('settings.about.qs.s4.b') },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
      {steps.map((s) => (
        <div key={s.num} style={{ display: 'flex', gap: 10 }}>
          <span style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
            background: t.accent, color: t.accentOn,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: t.fontSans, fontSize: 12, fontWeight: 600,
          }}>{s.num}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text0 }}>{s.title}</div>
            <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.55, marginTop: 2 }}>{s.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function VoiceCommandsList() {
  const t = useTokens();
  const tr = useT();
  const groups = [
    {
      label: tr('settings.about.voice.nav'),
      items: [
        { cmd: 'Eco inicio / dashboard', desc: tr('settings.about.voice.nav.home') },
        { cmd: 'Eco ajustes', desc: tr('settings.about.voice.nav.settings') },
        { cmd: 'Eco archivos / historial / navegador', desc: tr('settings.about.voice.nav.tabs') },
        { cmd: 'Eco estado', desc: tr('settings.about.voice.nav.status') },
        { cmd: 'Eco ayuda', desc: tr('settings.about.voice.nav.help') },
      ],
    },
    {
      label: tr('settings.about.voice.agents'),
      items: [
        { cmd: 'Eco abrir <nombre>', desc: tr('settings.about.voice.agents.open') },
        { cmd: 'Eco renombrar <nombre>', desc: tr('settings.about.voice.agents.rename') },
        { cmd: 'Eco cerrar', desc: tr('settings.about.voice.agents.close') },
        { cmd: 'Eco siguiente / anterior', desc: tr('settings.about.voice.agents.nav') },
        { cmd: 'Eco pausar / continuar', desc: tr('settings.about.voice.agents.pause') },
      ],
    },
    {
      label: tr('settings.about.voice.inside'),
      items: [
        { cmd: 'Eco chat / terminal / archivos / plan / servidor', desc: tr('settings.about.voice.inside.tabs') },
        { cmd: 'Eco arriba / abajo / al final', desc: tr('settings.about.voice.inside.scroll') },
        { cmd: 'Eco repetir / releer', desc: tr('settings.about.voice.inside.repeat') },
        { cmd: 'Eco sí / no / acepta / cancela', desc: tr('settings.about.voice.inside.confirm') },
      ],
    },
    {
      label: tr('settings.about.voice.appearance'),
      items: [
        { cmd: 'Eco silencio / hablar', desc: tr('settings.about.voice.appearance.tts') },
        { cmd: 'Eco rápido / lento / normal', desc: tr('settings.about.voice.appearance.rate') },
        { cmd: 'Eco oscuro / claro / sistema', desc: tr('settings.about.voice.appearance.theme') },
      ],
    },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
      {groups.map((g) => (
        <div key={g.label}>
          <div style={{ fontSize: 10.5, color: t.text2, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>{g.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {g.items.map((it) => (
              <div key={it.cmd} style={{ display: 'flex', gap: 10, padding: '5px 0' }}>
                <code style={{
                  flexShrink: 0, fontFamily: t.fontMono, fontSize: 11, color: t.accent,
                  padding: '2px 8px', borderRadius: 5, background: t.bg3,
                  alignSelf: 'flex-start', whiteSpace: 'nowrap',
                }}>{it.cmd}</code>
                <span style={{ flex: 1, fontSize: 11.5, color: t.text2, lineHeight: 1.45 }}>{it.desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SlashCommandsList() {
  const t = useTokens();
  const tr = useT();
  const cmds = [
    { cmd: '/dev-up up | down | restart', desc: tr('settings.about.slash.devup') },
    { cmd: '/remote-control <nombre>', desc: tr('settings.about.slash.remote') },
    { cmd: '/<skill-personal>', desc: tr('settings.about.slash.custom') },
    { cmd: '/<kb>', desc: tr('settings.about.slash.kb') },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
      <div style={{ fontSize: 11.5, color: t.text2, marginBottom: 6 }}>
        {tr('settings.about.slash.intro')}
      </div>
      {cmds.map((it) => (
        <div key={it.cmd} style={{ display: 'flex', gap: 10 }}>
          <code style={{
            flexShrink: 0, fontFamily: t.fontMono, fontSize: 11, color: t.accent,
            padding: '2px 8px', borderRadius: 5, background: t.bg3,
            alignSelf: 'flex-start', whiteSpace: 'nowrap',
          }}>{it.cmd}</code>
          <span style={{ flex: 1, fontSize: 11.5, color: t.text2, lineHeight: 1.5 }}>{it.desc}</span>
        </div>
      ))}
    </div>
  );
}

function FaqList() {
  const t = useTokens();
  const tr = useT();
  const items = [
    { q: tr('settings.about.faq.cost.q'),    a: tr('settings.about.faq.cost.a') },
    { q: tr('settings.about.faq.cli.q'),     a: tr('settings.about.faq.cli.a') },
    { q: tr('settings.about.faq.offline.q'), a: tr('settings.about.faq.offline.a') },
    { q: tr('settings.about.faq.windows.q'), a: tr('settings.about.faq.windows.a') },
    { q: tr('settings.about.faq.commit.q'),  a: tr('settings.about.faq.commit.a') },
    { q: tr('settings.about.faq.worktree.q'),a: tr('settings.about.faq.worktree.a') },
    { q: tr('settings.about.faq.data.q'),    a: tr('settings.about.faq.data.a') },
    { q: tr('settings.about.faq.voice.q'),   a: tr('settings.about.faq.voice.a') },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
      {items.map((it, i) => (
        <div key={i}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text0, marginBottom: 4 }}>{it.q}</div>
          <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.55 }}>{it.a}</div>
        </div>
      ))}
    </div>
  );
}

function TroubleshootingList() {
  const t = useTokens();
  const tr = useT();
  const items = [
    { p: tr('settings.about.tr.term.p'),    s: tr('settings.about.tr.term.s') },
    { p: tr('settings.about.tr.server.p'),  s: tr('settings.about.tr.server.s') },
    { p: tr('settings.about.tr.browser.p'), s: tr('settings.about.tr.browser.s') },
    { p: tr('settings.about.tr.claude.p'),  s: tr('settings.about.tr.claude.s') },
    { p: tr('settings.about.tr.worktree.p'),s: tr('settings.about.tr.worktree.s') },
    { p: tr('settings.about.tr.port.p'),    s: tr('settings.about.tr.port.s') },
    { p: tr('settings.about.tr.voice.p'),   s: tr('settings.about.tr.voice.s') },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 8,
          background: t.bg1, border: `1px solid ${t.glassBorder}`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: t.warn, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconAlert size={11}/> {it.p}
          </div>
          <div style={{ fontSize: 11.5, color: t.text1, lineHeight: 1.5 }}>{it.s}</div>
        </div>
      ))}
    </div>
  );
}

function NetworkList() {
  const t = useTokens();
  const tr = useT();
  const rows = [
    { src: 'Eco',         dst: 'api.anthropic.com', kind: 'cloud', desc: tr('settings.about.net.anthropic') },
    { src: 'Eco backend', dst: '127.0.0.1:7100',    kind: 'local', desc: tr('settings.about.net.backend') },
    { src: 'Frontend',    dst: 'backend (mismo proceso)', kind: 'local', desc: tr('settings.about.net.frontend') },
    { src: 'Webview',     dst: 'cualquier URL que abras', kind: 'cloud', desc: tr('settings.about.net.webview') },
    { src: 'Whisper STT', dst: 'modelo local (ONNX)', kind: 'local', desc: tr('settings.about.net.whisper') },
    { src: 'Piper TTS',   dst: 'modelo local (ONNX)', kind: 'local', desc: tr('settings.about.net.piper') },
    { src: 'Obsidian',    dst: 'filesystem local', kind: 'local', desc: tr('settings.about.net.obsidian') },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', borderRadius: 6,
          background: t.bg1, border: `1px solid ${t.glassBorder}`,
        }}>
          <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.text1, width: 90, flexShrink: 0 }}>{r.src}</span>
          <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.text3 }}>→</span>
          <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.accent, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.dst}</span>
          <span style={{
            fontSize: 9.5, padding: '2px 7px', borderRadius: 999,
            background: r.kind === 'local' ? `color-mix(in oklch, ${t.ok} 14%, transparent)` : `color-mix(in oklch, ${t.warn} 14%, transparent)`,
            color: r.kind === 'local' ? t.ok : t.warn,
            fontFamily: t.fontMono, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4,
          }}>{r.kind}</span>
          <span style={{ fontSize: 11, color: t.text2, flex: 2, minWidth: 0 }}>{r.desc}</span>
        </div>
      ))}
    </div>
  );
}

function FilesList() {
  const t = useTokens();
  const tr = useT();
  const rows = [
    { path: '~/.eco/user.json',   desc: tr('settings.about.files.user') },
    { path: '~/.eco/token',       desc: tr('settings.about.files.token') },
    { path: '~/.eco/api-key',     desc: tr('settings.about.files.apikey') },
    { path: '~/.eco/obsidian.json', desc: tr('settings.about.files.obsidian') },
    { path: '~/.eco/worktrees/<bubble-id>', desc: tr('settings.about.files.worktrees') },
    { path: 'localStorage (browser)', desc: tr('settings.about.files.localstorage') },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'flex', gap: 12, padding: '7px 10px', borderRadius: 6,
          background: t.bg1, border: `1px solid ${t.glassBorder}`,
        }}>
          <code style={{
            fontFamily: t.fontMono, fontSize: 11, color: t.text1,
            width: 200, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{r.path}</code>
          <span style={{ flex: 1, fontSize: 11.5, color: t.text2, lineHeight: 1.5 }}>{r.desc}</span>
        </div>
      ))}
    </div>
  );
}

function DevList() {
  const t = useTokens();
  const tr = useT();
  const envs = [
    { k: 'ECO_HOST',       d: tr('settings.about.dev.env.host') },
    { k: 'ECO_PORT',       d: tr('settings.about.dev.env.port') },
    { k: 'ECO_WORKSPACES', d: tr('settings.about.dev.env.workspaces') },
    { k: 'ECO_MODEL',      d: tr('settings.about.dev.env.model') },
    { k: 'ECO_PTY_AUTOCLAUDE', d: tr('settings.about.dev.env.autoclaude') },
    { k: 'CLAUDE_CLI_PATH', d: tr('settings.about.dev.env.clipath') },
  ];
  const scripts = [
    { k: 'npm run dev',       d: tr('settings.about.dev.scripts.dev') },
    { k: 'npm run dev:app',   d: tr('settings.about.dev.scripts.devapp') },
    { k: 'npm run dist:mac',  d: tr('settings.about.dev.scripts.distmac') },
    { k: 'npm run typecheck', d: tr('settings.about.dev.scripts.typecheck') },
    { k: 'npm run listener',  d: tr('settings.about.dev.scripts.listener') },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
      <div>
        <div style={{ fontSize: 10.5, color: t.text2, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>{tr('settings.about.dev.env.title')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {envs.map((e) => (
            <div key={e.k} style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
              <code style={{ fontFamily: t.fontMono, fontSize: 11, color: t.accent, width: 170, flexShrink: 0 }}>{e.k}</code>
              <span style={{ flex: 1, fontSize: 11.5, color: t.text2 }}>{e.d}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10.5, color: t.text2, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>{tr('settings.about.dev.scripts.title')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {scripts.map((s) => (
            <div key={s.k} style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
              <code style={{ fontFamily: t.fontMono, fontSize: 11, color: t.accent, width: 170, flexShrink: 0 }}>{s.k}</code>
              <span style={{ flex: 1, fontSize: 11.5, color: t.text2 }}>{s.d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SupportList() {
  const t = useTokens();
  const tr = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
      <p style={{ margin: 0, fontSize: 12, color: t.text2, lineHeight: 1.6 }}>{tr('settings.about.support.intro')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ padding: 10, borderRadius: 8, background: t.bg1, border: `1px solid ${t.glassBorder}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: t.text0, marginBottom: 4 }}>{tr('settings.about.support.bug.t')}</div>
          <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.55 }}>{tr('settings.about.support.bug.b')}</div>
        </div>
        <div style={{ padding: 10, borderRadius: 8, background: t.bg1, border: `1px solid ${t.glassBorder}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: t.text0, marginBottom: 4 }}>{tr('settings.about.support.logs.t')}</div>
          <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.55 }}>
            {tr('settings.about.support.logs.b')}{' '}
            <code style={{ fontFamily: t.fontMono, fontSize: 10.5, padding: '1px 5px', borderRadius: 4, background: t.bg3 }}>
              /Applications/Eco.app/Contents/MacOS/Eco
            </code>
          </div>
        </div>
        <div style={{ padding: 10, borderRadius: 8, background: t.bg1, border: `1px solid ${t.glassBorder}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: t.text0, marginBottom: 4 }}>{tr('settings.about.support.reset.t')}</div>
          <div style={{ fontSize: 11.5, color: t.text2, lineHeight: 1.55 }}>{tr('settings.about.support.reset.b')}</div>
        </div>
      </div>
    </div>
  );
}

function CreditsBody() {
  const t = useTokens();
  const tr = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 4 }}>
      {/* Card principal — autor */}
      <div style={{
        display: 'flex', gap: 14, alignItems: 'center',
        padding: 16, borderRadius: 14,
        background: t.bg1, border: `1px solid ${t.glassBorder}`,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
          background: t.accentFaint, color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 600, fontFamily: t.fontSans,
          border: `1px solid ${t.accent}`,
        }}>S</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.text0, letterSpacing: -0.2 }}>
            Sergio Castro
          </div>
          <div style={{ fontSize: 12, color: t.text2, marginTop: 2, lineHeight: 1.45 }}>
            {tr('settings.about.credits.role')}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 9px', borderRadius: 999,
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
              fontFamily: t.fontMono, fontSize: 10.5, color: t.text1,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.ok }}/>
              Aditum
            </span>
            <span style={{
              padding: '3px 9px', borderRadius: 999,
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
              fontFamily: t.fontMono, fontSize: 10.5, color: t.text2,
            }}>Florida, USA</span>
          </div>
        </div>
      </div>

      {/* Meta del proyecto */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10,
      }}>
        <MetaCell label={tr('settings.about.credits.year')} value="2026"/>
        <MetaCell label={tr('settings.about.credits.license')} value="Privado"/>
        <MetaCell label={tr('settings.about.credits.platform')} value="macOS · arm64"/>
        <MetaCell label={tr('settings.about.credits.lang')} value="TypeScript"/>
      </div>

      {/* Agradecimientos */}
      <div>
        <div style={{
          fontSize: 10.5, color: t.text2, textTransform: 'uppercase',
          letterSpacing: 0.6, fontWeight: 600, marginBottom: 8,
        }}>{tr('settings.about.credits.thanks_to')}</div>
        <p style={{
          margin: 0, fontSize: 12, color: t.text2, lineHeight: 1.6,
        }}>
          {tr('settings.about.credits.thanks_body')}
        </p>
      </div>

      {/* Línea final */}
      <div style={{
        paddingTop: 12, borderTop: `1px solid ${t.glassBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: t.text3, fontFamily: t.fontMono }}>
          © 2026 Sergio Castro · Eco
        </span>
        <span style={{ fontSize: 11, color: t.text3, fontFamily: t.fontMono }}>
          {tr('settings.about.credits.made_with')}
        </span>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  const t = useTokens();
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10,
      background: t.bg2, border: `1px solid ${t.glassBorder}`,
    }}>
      <div style={{
        fontSize: 9.5, color: t.text3, textTransform: 'uppercase',
        letterSpacing: 0.5, fontWeight: 600, marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontFamily: t.fontMono, fontSize: 12, color: t.text0, fontWeight: 500,
      }}>{value}</div>
    </div>
  );
}

// ──────────── helpers

function GeneralToggleRow({ icon, title, desc, storageKey, defaultOn, broadcastEvent }: {
  icon: (p: IconProps) => JSX.Element; title: string; desc?: string;
  storageKey: string; defaultOn?: boolean;
  // Si se provee, dispara un CustomEvent con ese nombre tras guardar — útil
  // para que componentes en la misma pestaña reaccionen (el evento 'storage'
  // del navegador no se dispara en la pestaña que escribió).
  broadcastEvent?: string;
}) {
  const [on, setOn] = useState(() => {
    if (typeof window === 'undefined') return defaultOn ?? false;
    const v = window.localStorage.getItem(storageKey);
    if (v == null) return defaultOn ?? false;
    return v === '1';
  });
  return (
    <Row icon={icon} title={title} desc={desc} control={
      <Toggle on={on} onChange={(v) => {
        setOn(v);
        try {
          window.localStorage.setItem(storageKey, v ? '1' : '0');
          if (broadcastEvent) window.dispatchEvent(new CustomEvent(broadcastEvent));
        } catch { /* noop */ }
      }}/>
    }/>
  );
}

function KbdRow({ keys }: { keys: string[] }) {
  const t = useTokens();
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {keys.map((k) => (
        <span key={k} style={{
          width: 28, height: 28, borderRadius: 8,
          background: t.bg3, border: `1px solid ${t.glassBorder}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: t.fontMono, fontSize: 12, color: t.text1,
        }}>{k}</span>
      ))}
    </div>
  );
}

// Use StatusDot to keep imports clean even if section doesn't yet render it
void StatusDot; void Glass;
