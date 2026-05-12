import { useEffect, useState, type ReactNode } from 'react';
import { useTheme, useTokens } from '@/design/theme';
import { ACCENT_HUES, THEME_VARIANTS } from '@/design/tokens';
import {
  Glass, Btn, StatusDot, SectionLabel, Toggle, fieldStyle,
} from '@/design/primitives';
import {
  IconSettings, IconKey, IconMic, IconFolder, IconShield, IconLayers,
  IconInfo, IconCheck, IconCpu, IconTerminal, IconWave, IconGlobe,
  IconCommand, IconBolt, IconLock, IconTrash, IconPlus, type IconProps,
} from '@/design/icons';
import { EcoMark } from '@/design/EcoMark';
import { useTTS } from '@/hooks/useTTS';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useQuickSuggestions } from '@/hooks/useQuickSuggestions';
import { useDefaultWorkspace } from '@/hooks/useDefaultWorkspace';
import { apiFetch } from '@/lib/api';
import { useApiKey } from '@/hooks/useApiKey';
import { useObsidian, pickVaultFolder } from '@/hooks/useObsidian';
import { useI18n, useT } from '@/hooks/useI18n';

type Section = 'general' | 'claude' | 'voice' | 'folders' | 'security' | 'appearance' | 'integrations' | 'about';

export function Settings() {
  const t = useTokens();
  const tr = useT();
  const [sec, setSec] = useState<Section>('voice');
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

      <div style={{ marginTop: 24 }}>
        <SuggestionsEditor/>
      </div>
    </div>
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
    const iv = window.setInterval(fetch, 8000);
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

  // Auto-seleccionar la mejor voz masculina española al cargar si no hay
  // una elegida. Priorizamos voces Piper (locales, neurales) sobre las del
  // sistema. Orden: claude (MX, alta calidad) > davefx (ES) > cualquier Piper es.
  useEffect(() => {
    if (tts.selectedVoiceURI) return;
    if (tts.voices.length === 0) return;
    const candidates = [
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

      {/* Voz actual (auto-elegida, masculina natural) */}
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
                ? `${currentVoice.name} · ${currentVoice.language}${currentVoice.kind === 'piper' ? ' · neural local' : ''}`
                : tr('settings.voice.loading')}
            </div>
          </div>
          <Btn kind="secondary" size="sm" onClick={testVoice} disabled={!currentVoice}>
            {tr('settings.voice.test_btn')}
          </Btn>
        </div>
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
              <Glass key={p} radius={12} style={{
                padding: 14, display: 'flex', alignItems: 'center', gap: 12,
              }}>
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
    </div>
  );
}

function SectionIntegrations() {
  const t = useTokens();
  const tr = useT();
  const { status: obs, vaults, save: saveObs, refresh } = useObsidian();
  const [vaultDraft, setVaultDraft] = useState(obs.vaultPath);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { setVaultDraft(obs.vaultPath); }, [obs.vaultPath]);

  async function persist(enabled: boolean, vault: string) {
    setBusy(true);
    setMsg(null);
    const ok = await saveObs(enabled, vault);
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

            {/* Vaults detectados en Obsidian. Mostramos solo si hay más de cero,
                y resaltamos el seleccionado. */}
            {vaults.length > 0 && (
              <>
                <label style={{ display: 'block', fontSize: 11, color: t.text2, marginBottom: 4 }}>
                  {tr('settings.integrations.obsidian.detected_label')}
                </label>
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Toggle
                  on={obs.enabled && validVault}
                  onChange={(v) => { if (validVault || !v) void persist(v, obs.vaultPath); }}
                  disabled={!validVault}
                />
                <span style={{ fontSize: 12.5, color: t.text1 }}>
                  {tr('settings.integrations.obsidian.enabled_label')}
                </span>
              </div>
              <div style={{ flex: 1 }}/>
              <Btn
                kind="primary" size="sm"
                onClick={() => void persist(obs.enabled, vaultDraft)}
                disabled={busy || vaultDraft === obs.vaultPath}>
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

function SectionAbout() {
  const t = useTokens();
  const tr = useT();
  return (
    <div style={{ maxWidth: 720, textAlign: 'center', padding: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <EcoMark size={80}/>
      </div>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: t.text0, letterSpacing: -0.4 }}>Eco</h2>
      <p style={{ margin: '6px 0 0', fontSize: 13, color: t.text2 }}>
        {tr('settings.about.tagline')}
      </p>
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
