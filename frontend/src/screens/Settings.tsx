import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { lockOnStartEnabled, setLockOnStart } from '@/lib/lock-pin';
import { useTheme, useTokens } from '@/design/theme';
import { terminalBg, terminalFg } from '@/lib/terminal-theme';
import { ACCENT_HUES, THEME_VARIANTS, isLightTheme } from '@/design/tokens';
import { Btn, IconBtn, StatusDot, Toggle, Card, PageHeader, Segmented, IconTile, cx } from '@/design/primitives';
import {
  IconSettings, IconKey, IconFolder, IconFolderOpen, IconShield, IconLayers,
  IconInfo, IconCheck, IconCpu, IconTerminal, IconGlobe, IconAlert,
  IconCommand, IconBolt, IconLock, IconTrash, IconPlus, IconMinus, IconX, IconBranch, IconGithub, IconSearch, IconFile, IconExt, IconEdit, IconChevR, type IconProps,
} from '@/design/icons';
import { EcoMark } from '@/design/EcoMark';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useQuickSuggestions } from '@/hooks/useQuickSuggestions';
import { useDefaultWorkspace } from '@/hooks/useDefaultWorkspace';
import { apiFetch } from '@/lib/api';
import { useApiKey, type KeyProvider } from '@/hooks/useApiKey';
import { useCliAuth, type CliProvider } from '@/hooks/useCliAuth';
import { useGithubCredentials } from '@/hooks/useGithubCredentials';
import { GithubTokenHelp } from '@/components/GithubTokenHelp';
import { GhStatusBanner } from '@/components/GhStatusBanner';
import { useObsidian, pickVaultFolder } from '@/hooks/useObsidian';
import { useMcpConfig } from '@/hooks/useMcpConfig';
import { useTailnet } from '@/hooks/useTailnet';
import { useNoSleep } from '@/hooks/useNoSleep';
import { useCategories, CATEGORY_PALETTE } from '@/hooks/useCategories';
import { useWorkspaceConfig, saveWorkspaceConfig } from '@/lib/workspace-config';
import { useIsAdmin } from '@/lib/auth-role';
import { useI18n, useT } from '@/hooks/useI18n';
import { getExternalIde, setExternalIde, ideDisplayLabel, type ExternalIde } from '@/lib/ide-uri';
import { getElectronBackupAPI, u8ToBase64 } from '@/lib/backup';
import { useIsPhone, isPhoneNow, isMobileNow } from '@/hooks/useMediaQuery';
import { cssZoom, hasNativeZoom, setUiZoom, useUiZoom, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/lib/ui-zoom';
import { isStandalone } from '@/lib/platform';
import type { JSX } from 'react';
import {
  TERM_FONT_FAMILIES, TERM_FONT_MAX, TERM_FONT_MIN, isFontInstalled,
  setTermFontFamily, setTermFontSize, termFontStack, useTermPrefs,
} from '@/lib/terminal-prefs';

// Nombre visible del tema de Claude Code que acompaña a cada apariencia.
const CLAUDE_THEME_NAMES = { light: 'GitHub Light', dark: 'Graphite' } as const;

// Campo de dato monoespaciado (comando, variable, ruta): esquina de 12 en vez
// de píldora, para que un valor largo no parezca un botón.
const BOX_FIELD: CSSProperties = { borderRadius: 12 };
// Ancho de los selects al final de una fila; en el teléfono ocupan la línea.
function selectWidth(desktop: number): CSSProperties {
  return { width: isPhoneNow() ? '100%' : desktop };
}

type Section = 'general' | 'agents' | 'github' | 'security' | 'appearance' | 'integrations' | 'about';

export function Settings({ role: _role = null }: { role?: 'admin' | 'member' | null }) {
  const tr = useT();
  const [sec, setSec] = useState<Section>('general');
  // Modelo local: cada usuario corre su propio Eco, así que todas las secciones
  // (Agentes & API, Integraciones) son locales de su máquina y visibles para
  // todos. El backup se removió (el estado vive en Firestore).
  const sections: { id: Section; label: string; icon: (p: IconProps) => JSX.Element; title: string; sub?: string }[] = [
    { id: 'general', label: tr('settings.section.general'), icon: IconSettings,
      title: tr('settings.general.title'), sub: tr('settings.general.sub') },
    { id: 'agents', label: tr('settings.section.agents'), icon: IconKey,
      title: tr('settings.agents.title'), sub: tr('settings.agents.sub') },
    { id: 'github', label: tr('settings.section.github'), icon: IconGithub,
      title: tr('settings.github.title'), sub: tr('settings.github.sub') },
    { id: 'security', label: tr('settings.section.security'), icon: IconShield,
      title: tr('settings.security.title'), sub: tr('settings.security.sub') },
    { id: 'appearance', label: tr('settings.section.appearance'), icon: IconLayers,
      title: tr('settings.appearance.title'), sub: tr('settings.appearance.sub') },
    { id: 'integrations', label: tr('settings.section.integrations'), icon: IconBolt,
      title: tr('settings.integrations.title'), sub: tr('settings.integrations.sub') },
    { id: 'about', label: tr('settings.section.about'), icon: IconInfo,
      title: tr('settings.section.about') },
  ];
  const active = sections.find((s) => s.id === sec) ?? sections[0]!;
  return (
    <div className="eco-page eco-page--scroll">
      <PageHeader eyebrow={tr('settings.title')} title={active.title} sub={active.sub}/>
      <div className="eco-split">
        <Card as="nav" variant="nav" className="eco-split__nav">
          {sections.map((s) => (
            <button key={s.id} type="button" onClick={() => setSec(s.id)}
              aria-current={sec === s.id ? 'page' : undefined}
              className={cx('eco-nav-item', sec === s.id && 'is-on')}>
              <s.icon size={15}/>
              <span className="eco-truncate">{s.label}</span>
            </button>
          ))}
        </Card>
        <div key={sec} className="eco-split__body eco-pane">
          {sec === 'general' && <SectionGeneral/>}
          {sec === 'agents' && <SectionAgents/>}
          {sec === 'github' && <SectionGithub/>}
          {sec === 'security' && <SectionSecurity/>}
          {sec === 'appearance' && <SectionAppearance/>}
          {sec === 'integrations' && <SectionIntegrations/>}
          {sec === 'about' && <SectionAbout/>}
        </div>
      </div>
    </div>
  );
}

// Fila de ajuste: mosaico + título/descripción + control. `wide` manda el
// control a su propia línea en el teléfono (selects e inputs no caben al lado
// del texto en 350px); toggles y botones quedan en la misma fila.
function Row({ icon: Icon, title, desc, control, danger, first, wide }: {
  icon?: (p: IconProps) => JSX.Element; title: string; desc?: string; control?: ReactNode;
  danger?: boolean; first?: boolean; wide?: boolean;
}) {
  const errStyle = danger ? { color: 'var(--err)' } : undefined;
  return (
    <div className={cx('eco-row', first && 'eco-row--first')}>
      {Icon && <IconTile icon={Icon} style={errStyle}/>}
      <div className="eco-row__main">
        <div className="eco-row__title" style={errStyle}>{title}</div>
        {desc && <div className="eco-row__desc">{desc}</div>}
      </div>
      {control && (
        <div className="eco-row__end" style={wide && isPhoneNow() ? { flexBasis: '100%' } : undefined}>
          {control}
        </div>
      )}
    </div>
  );
}

function SectionGeneral() {
  const tr = useT();
  const def = useDefaultWorkspace();
  const ws = useWorkspaces();
  // Menubar y limpieza de worktrees son cosas de host/dispositivo → solo admin.
  // El member ve las prefs por-usuario (review, notify, dock, etc.).
  const isAdmin = useIsAdmin();
  return (
    <>
      <Card variant="list">
        <GeneralToggleRow
          icon={IconShield}
          title={tr('settings.general.review_mode')}
          desc={tr('settings.general.review_mode_desc')}
          storageKey="eco.agent.review_mode"
        />
        {isAdmin && <GeneralToggleRow icon={IconLayers} title={tr('settings.general.menubar')} storageKey="eco.menubar" defaultOn/>}
        <NoSleepRow/>
        <Row
          icon={IconFolder}
          title={tr('settings.general.default_folder')}
          desc={tr('settings.general.default_folder_desc')}
          wide
          control={
            <select value={def.value} onChange={(e) => def.set(e.target.value)}
              className="eco-field eco-field--sm" style={selectWidth(220)}>
              <option value="">{tr('settings.general.ask_each_time')}</option>
              {ws.list.workspaces.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          }/>
        <LanguageRow/>
        <ExternalIdeRow/>
        {isAdmin && <WorktreesCleanRow/>}
      </Card>
      <SuggestionsEditor/>
    </>
  );
}

// Solo macOS: `supported` lo decide el backend por `process.platform`, no el
// renderer, para que un cliente remoto (celular vía Tailscale) contra un
// backend Mac lo siga viendo — el toggle afecta a la máquina anfitriona.
function NoSleepRow() {
  const tr = useT();
  const { status, saving, setEnabled } = useNoSleep();
  if (!status.supported) return null;
  return (
    <Row
      icon={IconBolt}
      title={tr('settings.general.nosleep')}
      desc={status.error
        ? (status.error === 'cancelled'
          ? tr('settings.general.nosleep_cancelled')
          : tr('settings.general.nosleep_err').replace('{detail}', status.error))
        : tr('settings.general.nosleep_desc')}
      control={
        <Toggle on={status.enabled} disabled={saving} onChange={(v) => { void setEnabled(v); }}/>
      }/>
  );
}

function WorktreesCleanRow() {
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
        <Btn kind="raised" onClick={() => void prune()} disabled={busy}>
          {busy ? tr('settings.general.worktrees_cleaning') : tr('settings.general.worktrees_run')}
        </Btn>
      }/>
  );
}

function ExternalIdeRow() {
  const tr = useT();
  const [ide, setIde] = useState<ExternalIde>(getExternalIde());
  function onChange(next: ExternalIde) {
    setIde(next);
    setExternalIde(next);
  }
  const options: ExternalIde[] = ['auto', 'vscode', 'cursor', 'intellij', 'webstorm', 'none'];
  return (
    <Row
      icon={IconCommand}
      title={tr('settings.general.external_ide')}
      desc={tr('settings.general.external_ide_desc')}
      wide
      control={
        <select value={ide} onChange={(e) => onChange(e.target.value as ExternalIde)}
          className="eco-field eco-field--sm" style={selectWidth(220)}>
          {options.map((o) => (
            <option key={o} value={o}>{ideDisplayLabel(o)}</option>
          ))}
        </select>
      }/>
  );
}

function LanguageRow() {
  const { lang, setLang } = useI18n();
  const tr = useT();
  return (
    <Row icon={IconGlobe} title={tr('settings.general.app_language')} wide
      control={
        <select value={lang} onChange={(e) => setLang(e.target.value as 'es' | 'en')}
          className="eco-field eco-field--sm" style={selectWidth(180)}>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      }/>
  );
}

function SuggestionsEditor() {
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
    <Card variant="stack">
      <div className="eco-hstack" style={{ alignItems: 'baseline' }}>
        <span className="eco-h3">{tr('settings.suggestions.title')}</span>
        <span className="eco-num eco-grow">{s.suggestions.length}</span>
        <button type="button" className="eco-btn eco-btn--ghost eco-btn--xs" onClick={s.reset}>
          {tr('settings.suggestions.reset')}
        </button>
      </div>
      <div className="eco-sub">{tr('settings.suggestions.sub')}</div>

      <div className="eco-inputbar eco-inputbar--action">
        <input
          className="eco-input-bare"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder={tr('settings.suggestions.add_placeholder')}
        />
        <Btn kind="primary" className="eco-btn--sm" onClick={handleAdd} disabled={!draft.trim()}>
          {tr('settings.folders.add_btn')}
        </Btn>
      </div>

      {s.suggestions.length === 0 ? (
        <div className="eco-empty">{tr('settings.suggestions.empty')}</div>
      ) : (
        <div>
          {s.suggestions.map((sug, i) => (
            <div key={`${sug}-${i}`} className="eco-row eco-row--tight" style={{ flexWrap: 'nowrap' }}>
              <span className="eco-grow eco-truncate">{sug}</span>
              <IconBtn icon={IconTrash} size={28} className="eco-iconbtn--danger"
                title={tr('common.delete')} onClick={() => s.remove(i)}/>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Cada proveedor tiene el mismo par de caminos de auth (sesión del CLI o API
// key), así que las tarjetas son genéricas y este map las parametriza.
const AGENT_PROVIDERS = {
  claude: {
    keyProvider: 'anthropic',
    keyPlaceholder: 'sk-ant-api03-...',
    loginCmd: 'claude login',
    installCmd: 'npm i -g @anthropic-ai/claude-code',
    i18n: 'settings.claude',
  },
  codex: {
    keyProvider: 'openai',
    keyPlaceholder: 'sk-proj-...',
    loginCmd: 'codex login',
    installCmd: 'npm i -g @openai/codex',
    i18n: 'settings.codex',
  },
} as const satisfies Record<CliProvider, {
  keyProvider: KeyProvider;
  keyPlaceholder: string;
  loginCmd: string;
  installCmd: string;
  i18n: string;
}>;

const PROVIDER_STORAGE_KEY = 'eco.settings.agent_provider';

function SectionAgents() {
  const tr = useT();
  const [provider, setProvider] = useState<CliProvider>(() => {
    try { return localStorage.getItem(PROVIDER_STORAGE_KEY) === 'codex' ? 'codex' : 'claude'; }
    catch { return 'claude'; }
  });

  useEffect(() => {
    try { localStorage.setItem(PROVIDER_STORAGE_KEY, provider); } catch { /* noop */ }
  }, [provider]);

  const cfg = AGENT_PROVIDERS[provider];

  return (
    <>
      <div className="eco-hstack">
        <Segmented<CliProvider>
          size="md" value={provider} onChange={setProvider}
          options={(['claude', 'codex'] as const).map((p) => ({ id: p, label: tr(`settings.agents.provider.${p}`) }))}/>
      </div>

      <CliAuthStatusCard key={provider} provider={provider} cfg={cfg}/>
      <Card variant="list">
        <ApiKeyEditor key={`key-${provider}`} provider={provider} cfg={cfg}/>
        {/* ECO_MODEL gobierna el SDK del tab Chat, que es Claude-only. */}
        {provider === 'claude' && <ModelInfoRow/>}
      </Card>
    </>
  );
}

function ModelInfoRow() {
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
    <Row
      icon={IconCpu}
      title={tr('settings.claude.model_info.title')}
      desc={tr('settings.claude.model_info.desc')}
      control={<code className="eco-chip eco-chip--on-card eco-mono">{model}</code>}/>
  );
}

type ProviderCfg = typeof AGENT_PROVIDERS[CliProvider];

function CliAuthStatusCard({ provider, cfg }: { provider: CliProvider; cfg: ProviderCfg }) {
  const tr = useT();
  const { status, refresh } = useCliAuth(provider);

  useEffect(() => {
    const poll = () => {
      // No pollear cuando la ventana no está visible — el focus event ya
      // dispara fetch al volver al frente.
      if (document.visibilityState !== 'visible') return;
      void refresh();
    };
    // Refrescamos cuando vuelve el foco — útil si el user corre `claude login`
    // en una terminal aparte y vuelve a Eco.
    window.addEventListener('focus', poll);
    // Intervalo más relajado (30s); con el listener de focus el user igual ve
    // el estado fresco apenas vuelve a Eco.
    const iv = window.setInterval(poll, 30_000);
    return () => {
      window.removeEventListener('focus', poll);
      window.clearInterval(iv);
    };
  }, [refresh]);

  if (!status) return null;

  const method = status.effectiveMethod;
  const headerText =
    method === 'cli' ? tr(`${cfg.i18n}.auth.using_cli`)
    : method === 'apikey' ? tr(`${cfg.i18n}.auth.using_apikey`)
    : tr(`${cfg.i18n}.auth.using_none`);
  const activeChip = <span className="eco-chip eco-chip--ok">{tr(`${cfg.i18n}.auth.active`)}</span>;
  const okStyle = { color: 'var(--ok)' };

  return (
    <Card variant="list">
      {/* Cuál método está activo ahora */}
      <div className="eco-row eco-row--tight" style={{ flexWrap: 'nowrap' }}>
        <span className={cx('eco-dot eco-dot--lg', method === 'none' ? 'eco-dot--warn' : 'eco-dot--ok')}/>
        <div className="eco-row__main">
          <div className="eco-row__title">{headerText}</div>
          <div className="eco-row__desc">{tr(`${cfg.i18n}.auth.priority_hint`)}</div>
        </div>
      </div>

      {/* Opción A: CLI */}
      <div className="eco-row" style={{ alignItems: 'flex-start' }}>
        <IconTile icon={IconTerminal} style={status.cliLoggedIn ? okStyle : undefined}/>
        <div className="eco-row__main">
          <div className="eco-hstack eco-hstack--wrap eco-row__title" style={{ gap: 8 }}>
            {tr(`${cfg.i18n}.auth.cli_title`)}
            {method === 'cli' && activeChip}
          </div>
          <div className="eco-row__desc">{tr(`${cfg.i18n}.auth.cli_desc`)}</div>
          <div className="eco-num" style={{ marginTop: 4 }}>
            {status.cliInstalled
              ? `${tr(`${cfg.i18n}.auth.cli_installed`)} ${status.cliVersion ?? ''}`
              : tr(`${cfg.i18n}.auth.cli_not_installed`)}
            {' · '}
            {status.cliLoggedIn
              ? `${tr(`${cfg.i18n}.auth.cli_loggedin`)} (${status.cliLoginHint})`
              : tr(`${cfg.i18n}.auth.cli_notloggedin`)}
          </div>
          <CommandHint cmd={status.cliInstalled ? (status.cliLoggedIn ? null : cfg.loginCmd) : cfg.installCmd}/>
        </div>
      </div>

      <div className="eco-hstack eco-sub" style={{ gap: 12 }}>
        <hr className="eco-divider eco-grow"/>
        {tr(`${cfg.i18n}.auth.or`)}
        <hr className="eco-divider eco-grow"/>
      </div>

      {/* Opción B: API key */}
      <div className="eco-row eco-row--first" style={{ alignItems: 'flex-start' }}>
        <IconTile icon={IconKey} style={status.apiKeyConfigured ? okStyle : undefined}/>
        <div className="eco-row__main">
          <div className="eco-hstack eco-hstack--wrap eco-row__title" style={{ gap: 8 }}>
            {tr(`${cfg.i18n}.auth.apikey_title`)}
            {method === 'apikey' && activeChip}
          </div>
          <div className="eco-row__desc">{tr(`${cfg.i18n}.auth.apikey_desc`)}</div>
        </div>
      </div>
    </Card>
  );
}

function CommandHint({ cmd }: { cmd: string | null }) {
  if (!cmd) return null;
  return (
    <div className="eco-inset eco-mono" style={{ marginTop: 8, padding: '6px 12px', fontSize: 12, ...BOX_FIELD }}>
      <span className="eco-faint">$ </span>{cmd}
    </div>
  );
}

function ApiKeyEditor({ provider, cfg }: { provider: CliProvider; cfg: ProviderCfg }) {
  const tr = useT();
  const apiKey = useApiKey(cfg.keyProvider);
  // Guardar/borrar la key cambia `effectiveMethod` de la tarjeta de arriba.
  const { refresh: refreshAuth } = useCliAuth(provider);
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
      void refreshAuth();
      setTimeout(() => setSuccess(false), 2500);
    } else {
      setError(r.error);
    }
  }

  async function handleDelete() {
    setBusy(true);
    await apiKey.remove();
    void refreshAuth();
    setBusy(false);
  }

  return (
    <>
      <Row
        icon={IconKey}
        first
        title={tr(`${cfg.i18n}.apikey.title`)}
        desc={tr(`${cfg.i18n}.apikey.desc`)}
        control={apiKey.hasKey ? (
          <span className="eco-chip eco-chip--ok">
            <IconCheck size={12}/> {tr(`${cfg.i18n}.apikey.saved`)} · {apiKey.masked}
          </span>
        ) : undefined}/>

      <div className="eco-vstack" style={{ gap: 8, paddingBottom: 16 }}>
        <div className="eco-hstack eco-hstack--wrap">
          <div className="eco-inputbar eco-inputbar--action eco-grow" style={{ flexBasis: 240 }}>
            <input
              type="password"
              className="eco-input-bare eco-mono"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder={cfg.keyPlaceholder}
            />
            <Btn kind="primary" className="eco-btn--sm" onClick={handleSave} disabled={busy || !draft.trim()} icon={IconCheck}>
              {busy ? tr(`${cfg.i18n}.apikey.validating`) : apiKey.hasKey ? tr(`${cfg.i18n}.apikey.replace_btn`) : tr(`${cfg.i18n}.apikey.save_btn`)}
            </Btn>
          </div>
          {apiKey.hasKey && (
            <Btn kind="danger" onClick={handleDelete} disabled={busy} icon={IconTrash}>{tr(`${cfg.i18n}.apikey.remove_btn`)}</Btn>
          )}
        </div>
        {error && <div className="eco-banner eco-banner--err">{error}</div>}
        {success && <div className="eco-banner eco-banner--ok">{tr(`${cfg.i18n}.apikey.success`)}</div>}
      </div>
    </>
  );
}

function SectionGithub() {
  const tr = useT();
  const gh = useGithubCredentials();
  const [pat, setPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [email, setEmail] = useState('');
  const [needEmail, setNeedEmail] = useState(false);
  const [loginHint, setLoginHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);

  const showForm = editing || (!gh.loading && !gh.hasCredentials);

  async function onSave() {
    if (!pat.trim()) return;
    setSaving(true);
    setError(null);
    const r = await gh.save({ pat: pat.trim(), email: email.trim() || undefined });
    setSaving(false);
    if (r.ok) {
      setPat(''); setEmail(''); setNeedEmail(false); setLoginHint(null); setEditing(false);
    } else if (r.needEmail) {
      setNeedEmail(true);
      setLoginHint(r.loginHint ?? null);
    } else {
      setError(r.error);
    }
  }

  return (
    <>
      <div className="eco-muted" style={{ maxWidth: 640, textWrap: 'pretty' }}>
        {tr('settings.github.explain')}
      </div>

      {!gh.loading && gh.hasCredentials && !editing ? (
        <Card variant="stack">
          <div className="eco-hstack eco-hstack--wrap" style={{ alignItems: 'flex-start', gap: '10px 16px' }}>
            <IconTile icon={IconGithub} style={{ color: 'var(--ok)' }}/>
            <div className="eco-row__main">
              <div className="eco-label">{tr('settings.github.connected_as', { username: gh.username ?? '' })}</div>
              <div className="eco-muted">{tr('settings.github.commit_email', { email: gh.email ?? '' })}</div>
              {gh.maskedPat && (
                <div className="eco-num" style={{ marginTop: 4 }}>
                  {tr('settings.github.token_label', { masked: gh.maskedPat })}
                </div>
              )}
              {gh.validatedAt && (
                <div className="eco-sub">
                  {tr('settings.github.validated_at', { date: new Date(gh.validatedAt).toLocaleString() })}
                </div>
              )}
            </div>
            <div className="eco-row__end">
              <Btn kind="raised"
                onClick={() => { setEditing(true); setPat(''); setEmail(''); setError(null); setNeedEmail(false); }}>
                {tr('settings.github.change')}
              </Btn>
              <Btn kind="danger" onClick={() => setRemoveConfirm(true)}>
                {tr('settings.github.remove')}
              </Btn>
            </div>
          </div>
          <GhStatusBanner/>
        </Card>
      ) : null}

      {showForm && (
        <Card variant="stack">
          <div>
            <label className="eco-field-label" style={{ display: 'block', marginBottom: 6 }}>
              {tr('settings.github.pat_label')}
            </label>
            <div className="eco-hstack" style={{ gap: 8 }}>
              <input
                type={showPat ? 'text' : 'password'}
                className="eco-field eco-field--mono eco-grow"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder={tr('settings.github.pat_placeholder')}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
              <Btn kind="raised" size="lg" onClick={() => setShowPat((v) => !v)}>
                {showPat ? tr('settings.github.pat_hide') : tr('settings.github.pat_show')}
              </Btn>
            </div>
            <div className="eco-sub" style={{ marginTop: 8 }}>
              {tr('settings.github.recommended_scopes')}
            </div>
            <div style={{ marginTop: 8 }}>
              <GithubTokenHelp/>
            </div>
            <GhStatusBanner/>
          </div>

          {(needEmail || email) && (
            <div>
              <label className="eco-field-label" style={{ display: 'block', marginBottom: 6 }}>
                {tr('settings.github.email_label')}
              </label>
              <input
                type="email"
                className="eco-field eco-field--mono"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tr('settings.github.email_placeholder')}
              />
              {needEmail && (
                <div className="eco-sub" style={{ marginTop: 6, color: 'var(--warn)' }}>
                  {tr('settings.github.email_required_note')}
                  {loginHint && (
                    <span className="eco-muted" style={{ marginLeft: 6 }}>
                      ({tr('settings.github.connected_as', { username: loginHint })})
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <div className="eco-banner eco-banner--err">{error}</div>}

          <div className="eco-hstack eco-hstack--wrap" style={{ gap: 8 }}>
            <Btn kind="primary" onClick={() => void onSave()} disabled={saving || !pat.trim()}>
              {saving ? tr('settings.github.validating') : tr('settings.github.validate_save')}
            </Btn>
            {editing && (
              <Btn kind="ghost"
                onClick={() => { setEditing(false); setPat(''); setEmail(''); setError(null); setNeedEmail(false); }}>
                {tr('common.cancel')}
              </Btn>
            )}
          </div>
        </Card>
      )}

      {removeConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="eco-scrim"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setRemoveConfirm(false); }}
        >
          <div className="eco-dialog eco-dialog--sm eco-dialog--danger">
            <div className="eco-dialog__head">
              <span className="eco-dialog__tile eco-dialog__tile--danger"><IconTrash size={18}/></span>
              <h2 className="eco-dialog__title">{tr('settings.github.remove_confirm_title')}</h2>
              <IconBtn icon={IconX} title={tr('common.close')} onClick={() => setRemoveConfirm(false)}/>
            </div>
            <p className="eco-dialog__body">{tr('settings.github.remove_confirm_body')}</p>
            <div className="eco-dialog__foot">
              <div className="eco-dialog__actions">
                <button type="button" className="eco-btn eco-btn--lg eco-btn--outline"
                  onClick={() => setRemoveConfirm(false)}>{tr('common.cancel')}</button>
                <button
                  type="button"
                  className="eco-btn eco-btn--lg eco-btn--danger-solid"
                  onClick={async () => { await gh.remove(); setRemoveConfirm(false); setEditing(false); }}
                >{tr('settings.github.remove')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function FoldersManager() {
  const tr = useT();
  const ws = useWorkspaces();
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const filtered = q ? ws.list.workspaces.filter((p) => p.toLowerCase().includes(q)) : ws.list.workspaces;
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set(folderOpenCache));
  function toggleFolder(p: string, force?: boolean) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      const open = force ?? !next.has(p);
      if (open) next.add(p); else next.delete(p);
      folderOpenCache = next;
      return next;
    });
  }

  async function handleAdd(pathOverride?: string) {
    const v = (pathOverride ?? draft).trim();
    if (!v) return;
    setAdding(true);
    setAddError(null);
    const result = await ws.add(v);
    setAdding(false);
    if (result.ok) {
      setDraft('');
      toggleFolder(v, true);
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
  const showSearch = ws.list.workspaces.length > 4;

  return (
    <div className="eco-page eco-page--scroll">
      <PageHeader
        eyebrow={tr('settings.section.folders')}
        title={tr('settings.folders.title')}
        sub={tr('settings.folders.sub')}
        actions={hasNativePicker ? (
          <Btn kind="primary" size="lg" icon={IconFolderOpen} onClick={() => void pickFolder()} disabled={adding}>
            {adding ? tr('settings.folders.adding') : tr('settings.folders.pick_native')}
          </Btn>
        ) : undefined}/>

      {/* Ruta manual: en el teléfono el botón baja a su propia línea. */}
      <Card variant="stack" style={{ gap: 10 }}>
        <div className="eco-hstack eco-hstack--wrap">
          <div className="eco-inputbar eco-grow" style={{ flexBasis: 240 }}>
            <IconFolder size={15}/>
            <input
              data-folder-input
              className="eco-input-bare eco-mono"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setAddError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
              placeholder={tr('settings.folders.add_placeholder')}
            />
          </div>
          <Btn kind={hasNativePicker ? 'solid' : 'primary'} size="lg" icon={IconPlus}
            onClick={() => void handleAdd()} disabled={adding || !draft.trim()}
            style={isPhoneNow() ? { flexBasis: '100%' } : undefined}>
            {adding ? tr('settings.folders.adding') : tr('settings.folders.add_btn')}
          </Btn>
        </div>
        {addError && (
          <div className="eco-banner eco-banner--err eco-mono" style={{ wordBreak: 'break-word' }}>{addError}</div>
        )}
        <div className="eco-sub">{tr('settings.folders.hint')}</div>
      </Card>

      <Card variant="list">
        {showSearch && (
          <div className="eco-hstack eco-faint" style={{ height: 48 }}>
            <IconSearch size={15}/>
            <input
              className="eco-input-bare"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('settings.folders.search')}
            />
          </div>
        )}
        {ws.loading ? (
          <div className="eco-empty">{tr('common.loading')}</div>
        ) : ws.list.workspaces.length === 0 ? (
          <div className="eco-empty">{tr('settings.folders.empty')}</div>
        ) : filtered.length === 0 ? (
          <div className="eco-empty">{tr('settings.folders.no_match')}</div>
        ) : (
          filtered.map((p, i) => (
            <FolderCard key={p} workspace={p} open={openSet.has(p)} divided={showSearch || i > 0}
              onToggle={() => toggleFolder(p)} onRemove={() => ws.remove(p)}/>
          ))
        )}
      </Card>
      {ws.error && <div className="eco-banner eco-banner--err">{ws.error}</div>}
    </div>
  );
}

// Cada workspace arranca colapsado: su cuerpo trae un editor completo
// (comandos, variables de entorno, ramas) y con tres o cuatro carpetas la
// pantalla era un muro. Lo abierto se recuerda mientras dure la sesión (cache
// de módulo) para que cambiar de sección no lo cierre.
let folderOpenCache = new Set<string>();

function FolderCard({ workspace, open, divided, onToggle, onRemove }: {
  workspace: string;
  open: boolean;
  /** Línea de separación con el elemento de arriba. */
  divided: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const tr = useT();
  const isPhone = useIsPhone();
  const cfg = useWorkspaceConfig(workspace);
  const summary = cfg.server.dual
    ? tr('settings.folders.summary_dual')
    : (cfg.server.main.trim() || tr('settings.folders.summary_no_server'));
  return (
    <div style={divided ? { borderTop: '1px solid var(--line)' } : undefined}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        title={open ? tr('settings.folders.collapse') : tr('settings.folders.expand')}
        className="eco-row eco-row--first eco-row--tight eco-row--click"
        style={{ flexWrap: 'nowrap', gap: isPhone ? 10 : 14 }}>
        <span className="eco-faint" style={{
          flex: 'none', display: 'flex',
          transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 140ms',
        }}><IconChevR size={14}/></span>
        <IconTile icon={IconFolder} accent/>
        <div className="eco-grow">
          {/* En el teléfono un path largo con ellipsis deja ver solo el
              principio, que es la parte que menos identifica la carpeta.
              Cortado por el final (rtl) se lee el nombre real. */}
          <div className="eco-mono eco-truncate" title={workspace}
            style={{ fontSize: 13, ...(isPhone ? { direction: 'rtl', textAlign: 'left' } : null) }}>
            {workspace}
          </div>
          {!open && <div className="eco-sub eco-truncate">{summary}</div>}
        </div>
        <IconBtn icon={IconTrash} className="eco-iconbtn--danger"
          title={tr('settings.claude.apikey.remove_btn')}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}/>
      </div>
      {open && (
        <div className="eco-pane" style={{ margin: isPhone ? '0 0 16px' : '0 0 16px 28px' }}>
          <WorkspaceServerConfigField workspace={workspace}/>
        </div>
      )}
    </div>
  );
}

// Branches base favoritos de un workspace (CSV). Server-authoritative: lo
// define el admin y lo lee el diálogo de nuevo agente para TODOS.
function WorktreeFavoritesField({ workspace }: { workspace: string }) {
  const tr = useT();
  const config = useWorkspaceConfig(workspace);
  const [draft, setDraft] = useState(config.baseBranches);
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(() => { setDraft(config.baseBranches); }, [config.baseBranches]);

  async function commit() {
    if (draft.trim() === config.baseBranches) return;
    const ok = await saveWorkspaceConfig(workspace, { baseBranches: draft.trim() });
    if (ok) { setSavedFlash(true); window.setTimeout(() => setSavedFlash(false), 1200); }
  }

  return (
    <div className="eco-vstack eco-pane">
      <div className="eco-hstack eco-field-label" style={{ gap: 8 }}>
        <IconBranch size={13}/>
        <span>{tr('settings.bases.label')}</span>
        {savedFlash && <span style={{ color: 'var(--ok)' }}>{tr('settings.bases.saved')}</span>}
      </div>
      <input
        className="eco-field eco-field--sm eco-field--mono"
        style={BOX_FIELD}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder={tr('settings.bases.placeholder')}
        spellCheck={false}
        autoCorrect="off"
      />
      <div className="eco-sub">{tr('settings.bases.hint')}</div>
    </div>
  );
}

// Editor de la config de dev server por workspace (admin). Define single/dual,
// el/los comando(s) y las variables de entorno. El ServerPanel de cada burbuja
// la consume read-only: el member solo inicia/detiene.
type EnvRow = { k: string; v: string };
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Espejo de los caps del backend (workspace-config.ts:normalizeEnv) para
// avisar acá en vez de fallar silencioso en el POST.
const ENV_MAX_VARS = 50;
const ENV_MAX_VALUE = 4000;

// Formato dotenv: KEY=VALOR por línea, # comenta, prefijo `export` opcional,
// comillas simples/dobles envolventes se quitan. En valores sin comillas,
// ` #` inicia comentario inline (un valor con # debe ir entre comillas).
function parseDotenv(text: string): { env: Record<string, string>; skipped: number } {
  const env: Record<string, string> = {};
  let skipped = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || m[1].startsWith('ECO_')) { skipped++; continue; }
    let value = m[2].trim();
    const quoted = value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trimEnd();
    }
    env[m[1]] = value;
  }
  return { env, skipped };
}

// Inversa de parseDotenv: comilla los valores que el parser malinterpretaría
// (# de comentario inline, espacios en los bordes, comillas envolventes).
function serializeDotenv(rows: EnvRow[]): string {
  return rows
    .filter((r) => r.k.trim())
    .map((r) => {
      const v = r.v;
      const needsQuotes = v.includes('#') || v !== v.trim() || /^["']/.test(v);
      return `${r.k.trim()}=${needsQuotes ? `"${v}"` : v}`;
    })
    .join('\n') + '\n';
}

// Merge del import sobre el draft: claves existentes se actualizan en su fila,
// las nuevas se agregan al final respetando el cap de 50.
function mergeImportedEnv(
  rows: EnvRow[], env: Record<string, string>,
): { rows: EnvRow[]; dropped: number } {
  const next = rows.map((r) => {
    const k = r.k.trim();
    return k && k in env ? { k, v: env[k] } : r;
  });
  const existing = new Set(next.map((r) => r.k.trim()).filter(Boolean));
  let dropped = 0;
  for (const [k, v] of Object.entries(env)) {
    if (existing.has(k)) continue;
    if (existing.size >= ENV_MAX_VARS) { dropped++; continue; }
    next.push({ k, v });
    existing.add(k);
  }
  return { rows: next, dropped };
}

function envToRows(env: Record<string, string>): EnvRow[] {
  return Object.entries(env).map(([k, v]) => ({ k, v }));
}
function rowsToEnv(rows: EnvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.k.trim();
    if (k) out[k] = r.v;
  }
  return out;
}

type WorkspaceTab = 'server' | 'env' | 'branches';

function WorkspaceServerConfigField({ workspace }: { workspace: string }) {
  const tr = useT();
  const config = useWorkspaceConfig(workspace);
  const srv = config.server;
  const [tab, setTab] = useState<WorkspaceTab>('server');
  const [dual, setDual] = useState(srv.dual);
  const [main, setMain] = useState(srv.main);
  const [front, setFront] = useState(srv.frontend);
  const [back, setBack] = useState(srv.backend);
  const [envRows, setEnvRows] = useState<EnvRow[]>(() => envToRows(srv.env));
  const [savedFlash, setSavedFlash] = useState(false);
  // srv.env es un objeto nuevo en cada hidratación — comparamos por JSON para
  // no resetear el draft en cada render.
  const srvEnvJson = JSON.stringify(srv.env);
  useEffect(() => {
    setDual(srv.dual); setMain(srv.main); setFront(srv.frontend); setBack(srv.backend);
    setEnvRows(envToRows(srv.env));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srv.dual, srv.main, srv.frontend, srv.backend, srvEnvJson]);

  const fileRef = useRef<HTMLInputElement>(null);
  const importTimer = useRef(0);
  const [importMsg, setImportMsg] = useState<{ ok: number; skipped: number } | null>(null);

  const envInvalid = envRows.some((r) => r.k.trim() !== '' && !ENV_KEY_RE.test(r.k.trim()));
  const envTooLong = envRows.some((r) => r.v.length > ENV_MAX_VALUE);
  const envDirty = JSON.stringify(rowsToEnv(envRows)) !== srvEnvJson;
  const dirty = dual !== srv.dual || main !== srv.main || front !== srv.frontend
    || back !== srv.backend || envDirty;

  async function commit() {
    if (envInvalid || envTooLong) return;
    const ok = await saveWorkspaceConfig(workspace, {
      server: { dual, main, frontend: front, backend: back, env: rowsToEnv(envRows) },
    });
    if (ok) { setSavedFlash(true); window.setTimeout(() => setSavedFlash(false), 1200); }
  }

  function setRow(i: number, patch: Partial<EnvRow>) {
    setEnvRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setEnvRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function importEnvFile(file: File) {
    const text = await file.text();
    const { env, skipped } = parseDotenv(text);
    const { rows, dropped } = mergeImportedEnv(envRows, env);
    const ok = Object.keys(env).length - dropped;
    if (ok > 0) setEnvRows(rows);
    setImportMsg({ ok, skipped: skipped + dropped });
    window.clearTimeout(importTimer.current);
    importTimer.current = window.setTimeout(() => setImportMsg(null), 8000);
  }
  useEffect(() => () => window.clearTimeout(importTimer.current), []);

  // Exporta el draft actual (incluye ediciones sin guardar): save-dialog nativo
  // en Electron, download de blob en browser.
  async function exportEnvFile() {
    const rows = envRows.filter((r) => r.k.trim());
    if (rows.length === 0) return;
    const wsName = workspace.split(/[\\/]/).filter(Boolean).pop() || 'workspace';
    const filename = `${wsName}.env`;
    const text = `${tr('settings.srv.env.export_header', { ws: workspace })}\n${serializeDotenv(rows)}`;
    const api = getElectronBackupAPI();
    if (api?.saveDialog && api.writeBinaryFile) {
      const r = await api.saveDialog({
        title: tr('settings.srv.env.export'),
        defaultPath: filename,
        filters: [{ name: '.env', extensions: ['env'] }],
      });
      if (r.canceled || !r.path) return;
      await api.writeBinaryFile({ path: r.path, base64: u8ToBase64(new TextEncoder().encode(text)) });
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const cmdClass = 'eco-field eco-field--sm eco-field--mono';
  const envCount = envRows.filter((r) => r.k.trim()).length;
  const branchCount = config.baseBranches.split(',').filter((b) => b.trim()).length;
  const phone = isPhoneNow();

  return (
    <div className="eco-vstack" style={{ gap: 14 }}>
      <div className="eco-hstack eco-hstack--wrap">
        <Segmented<WorkspaceTab>
          onCard size="md" value={tab} onChange={setTab}
          style={{ maxWidth: '100%', overflowX: 'auto' }}
          options={[
            { id: 'server', label: tr('settings.srv.tab.server'), icon: IconCpu },
            { id: 'env', label: tr('settings.srv.tab.env'), icon: IconFile, count: envCount || undefined },
            { id: 'branches', label: tr('settings.srv.tab.branches'), icon: IconBranch, count: branchCount || undefined },
          ]}/>
        {savedFlash && <span className="eco-sub" style={{ color: 'var(--ok)' }}>{tr('settings.bases.saved')}</span>}
        <div className="eco-spacer"/>
        <Btn kind="primary" onClick={() => void commit()} disabled={!dirty || envInvalid || envTooLong}>
          {tr('common.save')}
        </Btn>
      </div>

      {tab === 'server' && (
        <div className="eco-vstack eco-pane">
          <label className="eco-hstack" style={{ gap: 12, cursor: 'pointer' }}>
            <Toggle on={dual} onChange={setDual}/>
            <span>{tr('settings.srv.dual')}</span>
          </label>
          {!dual ? (
            <input value={main} onChange={(e) => setMain(e.target.value)}
              placeholder="npm run dev -- --port $PORT"
              spellCheck={false} autoCorrect="off" className={cmdClass} style={BOX_FIELD}/>
          ) : (
            <div className="eco-hstack eco-hstack--wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
              <label className="eco-vstack eco-grow" style={{ gap: 6, flexBasis: 280 }}>
                <span className="eco-field-label">{tr('settings.srv.frontend')}</span>
                <input value={front} onChange={(e) => setFront(e.target.value)}
                  placeholder="frontend: npm run dev -- --port $PORT"
                  spellCheck={false} autoCorrect="off" className={cmdClass} style={BOX_FIELD}/>
              </label>
              <label className="eco-vstack eco-grow" style={{ gap: 6, flexBasis: 280 }}>
                <span className="eco-field-label">{tr('settings.srv.backend')}</span>
                <input value={back} onChange={(e) => setBack(e.target.value)}
                  placeholder="backend: PORT=$PORT node server.js"
                  spellCheck={false} autoCorrect="off" className={cmdClass} style={BOX_FIELD}/>
              </label>
            </div>
          )}
          <div className="eco-sub">{tr('settings.srv.hint')}</div>
        </div>
      )}

      {tab === 'env' && (
        <div className="eco-vstack eco-pane">
          {/* Agregar / Importar / Exportar: en el teléfono envuelven. */}
          <div className="eco-hstack eco-hstack--wrap" style={{ gap: 8 }}>
            <Btn kind="raised" size="sm" icon={IconPlus}
              onClick={() => setEnvRows((rows) => [...rows, { k: '', v: '' }])}>
              {tr('settings.srv.env.add')}
            </Btn>
            <Btn kind="raised" size="sm" icon={IconFile}
              title={tr('settings.srv.env.import_tip')}
              onClick={() => fileRef.current?.click()}>
              {tr('settings.srv.env.import')}
            </Btn>
            <Btn kind="raised" size="sm" icon={IconExt}
              title={tr('settings.srv.env.export_tip')}
              disabled={!envRows.some((r) => r.k.trim())}
              onClick={() => void exportEnvFile()}>
              {tr('settings.srv.env.export')}
            </Btn>
            <input ref={fileRef} type="file" style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importEnvFile(f);
                e.target.value = '';
              }}/>
          </div>
          {envRows.length > 0 && (
            <div style={{
              display: 'grid', gap: 8,
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
            }}>
              {envRows.map((row, i) => {
                const badKey = row.k.trim() !== '' && !ENV_KEY_RE.test(row.k.trim());
                return (
                  // Clave + valor + borrar piden ~340px. En el teléfono la
                  // clave toma la línea entera y el valor baja.
                  <div key={i} className="eco-hstack eco-raised eco-mono" style={{
                    gap: phone ? '4px 8px' : 8, minHeight: 44, padding: phone ? '8px 6px 8px 14px' : '0 6px 0 14px',
                    fontSize: 12.5, minWidth: 0, ...BOX_FIELD,
                    border: `1px solid ${badKey ? 'var(--err)' : 'transparent'}`,
                    ...(phone ? { flexWrap: 'wrap' } : null),
                  }}>
                    <input value={row.k} onChange={(e) => setRow(i, { k: e.target.value })}
                      placeholder={tr('settings.srv.env.key_ph')}
                      spellCheck={false} autoCorrect="off" autoCapitalize="off"
                      className="eco-input-bare"
                      style={{ flex: phone ? '1 1 100%' : '1 1 45%', fontWeight: 500 }}/>
                    <input value={row.v} onChange={(e) => setRow(i, { v: e.target.value })}
                      placeholder={tr('settings.srv.env.value_ph')}
                      spellCheck={false} autoCorrect="off" autoCapitalize="off"
                      className="eco-input-bare eco-muted"
                      style={{ flex: '1 1 55%' }}/>
                    <IconBtn icon={IconTrash} size={28} className="eco-iconbtn--danger"
                      title={tr('settings.srv.env.remove')} onClick={() => removeRow(i)}/>
                  </div>
                );
              })}
            </div>
          )}
          {importMsg && (
            <div className="eco-sub" style={{ color: importMsg.ok > 0 ? 'var(--ok)' : 'var(--warn)' }}>
              {importMsg.ok > 0
                ? tr('settings.srv.env.import_ok', { n: importMsg.ok })
                : tr('settings.srv.env.import_empty')}
              {importMsg.skipped > 0 && ` ${tr('settings.srv.env.import_skipped', { n: importMsg.skipped })}`}
            </div>
          )}
          {envInvalid && (
            <div className="eco-sub" style={{ color: 'var(--err)' }}>{tr('settings.srv.env.invalid')}</div>
          )}
          {envTooLong && (
            <div className="eco-sub" style={{ color: 'var(--err)' }}>{tr('settings.srv.env.too_long')}</div>
          )}
          <div className="eco-sub">{tr('settings.srv.env.hint')}</div>
          <div>
            <div className="eco-sub" style={{ marginBottom: 6 }}>{tr('settings.srv.env.format_label')}</div>
            <div className="eco-inset eco-mono eco-muted" style={{
              fontSize: 12, whiteSpace: 'pre', overflowX: 'auto', lineHeight: 1.7, ...BOX_FIELD,
            }}>
              {tr('settings.srv.env.format_example')}
            </div>
          </div>
        </div>
      )}

      {tab === 'branches' && <WorktreeFavoritesField workspace={workspace}/>}
    </div>
  );
}

function SectionSecurity() {
  const tr = useT();
  const [lockMinutes, setLockMinutes] = useState<string>(() => {
    try { return window.localStorage.getItem('eco.security.lockAfterMin') ?? '15'; } catch { return '15'; }
  });

  function saveLock(v: string) {
    setLockMinutes(v);
    try {
      window.localStorage.setItem('eco.security.lockAfterMin', v);
      window.dispatchEvent(new CustomEvent('eco:security-pref-change'));
    } catch { /* noop */ }
  }

  const [lockOnStart, setLockOnStartState] = useState<boolean>(lockOnStartEnabled);
  function saveLockOnStart(v: boolean) {
    setLockOnStartState(v);
    setLockOnStart(v);
  }

  function lockNow() {
    // Lock con PIN (no cierra la sesión de Firebase). App escucha el evento.
    window.dispatchEvent(new CustomEvent('eco:lock-now'));
  }

  return (
    <Card variant="list">
      <Row icon={IconLock} title={tr('settings.security.lock_on_start')}
        desc={tr('settings.security.lock_on_start_desc')}
        control={<Toggle on={lockOnStart} onChange={saveLockOnStart}/>}/>

      {/* Bloqueo por inactividad — guardado en localStorage, App.tsx lee la
          preferencia y dispara `auth.lock` cuando se cumple el tiempo. */}
      <Row icon={IconLock} title={tr('settings.security.lock_inactivity')}
        desc={tr('settings.security.lock_inactivity_desc')}
        wide
        control={
          <select value={lockMinutes} onChange={(e) => saveLock(e.target.value)}
            className="eco-field eco-field--sm" style={selectWidth(160)}>
            <option value="never">{tr('settings.security.never')}</option>
            <option value="5">{tr('settings.security.minutes', { n: 5 })}</option>
            <option value="15">{tr('settings.security.minutes', { n: 15 })}</option>
            <option value="30">{tr('settings.security.minutes', { n: 30 })}</option>
            <option value="60">{tr('settings.security.one_hour')}</option>
          </select>
        }/>

      {/* Bloquear pantalla ahora — lock con PIN (no cierra sesión). */}
      <Row icon={IconShield} title={tr('settings.security.lock_now')}
        desc={tr('settings.security.lock_now_desc')}
        control={
          <Btn kind="raised" icon={IconLock} onClick={lockNow}>
            {tr('settings.security.lock_now_btn')}
          </Btn>
        }/>
    </Card>
  );
}

function SectionAppearance() {
  const t = useTokens();
  const tr = useT();
  const { mode, setMode, accentHue, setAccentHue } = useTheme();

  const byId = new Map(THEME_VARIANTS.map((v) => [v.id, v.preview]));
  const light = byId.get('light')!;
  const dark = byId.get('dark')!;
  const themes = [
    { id: 'light' as const,  label: tr('settings.appearance.theme.light'),  bg: light.bg, ink: light.ink, mute: light.mute, claude: CLAUDE_THEME_NAMES.light },
    { id: 'dark' as const,   label: tr('settings.appearance.theme.dark'),   bg: dark.bg,  ink: dark.ink,  mute: dark.mute,  claude: CLAUDE_THEME_NAMES.dark },
    // Vista previa partida: mitad claro, mitad oscuro (muestra de color, no decoración).
    { id: 'system' as const, label: tr('settings.appearance.theme.system'), bg: `linear-gradient(105deg, ${light.bg} 50%, ${dark.bg} 50%)`, ink: light.ink, mute: dark.mute, claude: '' },
  ];

  return (
    <>
      <Card variant="stack">
        <div className="eco-eyebrow">{tr('settings.appearance.theme')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
          {themes.map((m) => {
            const on = mode === m.id;
            return (
              <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={on}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 10, padding: 10,
                  borderRadius: 16, border: 0, background: t.raised, cursor: 'pointer',
                  textAlign: 'left', font: 'inherit', color: t.text0,
                  outline: on ? `2px solid ${t.accent}` : 'none',
                }}>
                <div style={{
                  height: 72, borderRadius: 11, background: m.bg, border: `1px solid ${t.line2}`,
                  display: 'flex', alignItems: 'flex-end', gap: 5, padding: 10,
                }}>
                  <span style={{ width: '38%', height: 6, borderRadius: 3, background: m.ink }}/>
                  <span style={{ width: '22%', height: 6, borderRadius: 3, background: m.mute }}/>
                </div>
                <div className="eco-hstack" style={{ gap: 8, padding: '0 4px 2px' }}>
                  <span className="eco-label eco-grow">{m.label}</span>
                  {m.claude && <span className="eco-num">{m.claude}</span>}
                  {on && <IconCheck size={14} strokeWidth={2.4}/>}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card variant="stack">
        <div className="eco-hstack" style={{ alignItems: 'baseline' }}>
          <span className="eco-eyebrow eco-grow">{tr('settings.appearance.accent.override')}</span>
          <button type="button" className="eco-btn eco-btn--ghost eco-btn--xs" onClick={() => setAccentHue(null)}>
            {tr('settings.appearance.accent.reset')}
          </button>
        </div>
        <div className="eco-sub">{tr('settings.appearance.accent.override_desc')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 6 }}>
          {ACCENT_HUES.map((a) => {
            const selected = accentHue === a.hue;
            return (
              <button key={a.hue} type="button" onClick={() => setAccentHue(a.hue)} title={a.name} aria-pressed={selected}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                  padding: '10px 4px 8px', borderRadius: 14, border: 0, cursor: 'pointer', font: 'inherit',
                  background: selected ? t.raised : 'transparent', color: selected ? t.text0 : t.text1,
                }}>
                <span style={{
                  width: 30, height: 30, borderRadius: '50%', background: `oklch(0.72 0.13 ${a.hue})`,
                  outline: selected ? `2px solid ${t.text0}` : 'none', outlineOffset: 2,
                }}/>
                <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{a.name}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card variant="list" style={{ paddingTop: 14 }}>
        <div className="eco-eyebrow">{tr('settings.appearance.zoom')}</div>
        <UiZoomRow/>
      </Card>

      <Card variant="list" style={{ paddingTop: 14, paddingBottom: 18 }}>
        <div className="eco-eyebrow">{tr('settings.appearance.terminal')}</div>
        <TerminalFontRows/>
      </Card>

      <Card variant="stack">
        <div className="eco-eyebrow">{tr('settings.categories.label')}</div>
        <div className="eco-sub">{tr('settings.categories.desc')}</div>
        <CategoryManager/>
      </Card>
    </>
  );
}

// Editor de categorías: alta arriba y una celda por categoría con su color,
// nombre editable y borrar. Persiste vía useCategories (sincronizado a
// Firestore).
function CategoryManager() {
  const tr = useT();
  const { categories, add, update, remove } = useCategories();
  const [draftName, setDraftName] = useState('');
  const nextColor = CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length]!;
  const submit = () => {
    if (!draftName.trim()) return;
    add(draftName.trim(), nextColor);
    setDraftName('');
  };

  return (
    <>
      <div className="eco-inputbar eco-inputbar--action">
        <span className="eco-dot eco-dot--lg" style={{ background: nextColor }}/>
        <input
          className="eco-input-bare"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={tr('settings.categories.new_placeholder')}
        />
        <Btn kind="primary" className="eco-btn--sm" disabled={!draftName.trim()} onClick={submit}>
          {tr('common.add')}
        </Btn>
      </div>

      {categories.length === 0 ? (
        <div className="eco-empty">{tr('settings.categories.empty')}</div>
      ) : (
        <div style={{
          display: 'grid', gap: 6,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))',
        }}>
          {categories.map((c) => (
            <CategoryCard key={c.id} name={c.name} color={c.color}
              onName={(name) => update(c.id, { name })}
              onColor={(color) => update(c.id, { color })}
              onRemove={() => remove(c.id)}/>
          ))}
        </div>
      )}
    </>
  );
}

// Celda de una categoría: el punto de color es el selector — clic → popover
// con la paleta y un color personalizado (color picker nativo). El nombre se
// edita al lado.
function CategoryCard({ name, color, onName, onColor, onRemove }: {
  name: string; color: string;
  onName: (name: string) => void; onColor: (color: string) => void; onRemove: () => void;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={rootRef} className="eco-hstack eco-raised" style={{
      position: 'relative', gap: 4, minHeight: 40, padding: '0 6px 0 6px', minWidth: 0, ...BOX_FIELD,
    }}>
      <button
        type="button"
        className={cx('eco-iconbtn eco-iconbtn--xs', open && 'is-on')}
        onClick={() => setOpen((o) => !o)}
        title={tr('settings.categories.pick_color')}
        aria-label={tr('settings.categories.pick_color')}>
        <span className="eco-dot eco-dot--lg" style={{ background: color, width: 10, height: 10 }}/>
      </button>
      <input
        className="eco-input-bare"
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder={tr('settings.categories.name_placeholder')}
      />
      <IconBtn icon={IconTrash} size={28} className="eco-iconbtn--danger"
        title={tr('settings.categories.delete_tooltip')} onClick={onRemove}/>

      {open && (
        <div role="dialog" aria-label={tr('settings.categories.pick_color')} className="eco-menu" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          padding: 12, width: 208, minWidth: 0,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
            {CATEGORY_PALETTE.map((col) => {
              const on = color.toLowerCase() === col.toLowerCase();
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => { onColor(col); setOpen(false); }}
                  title={col}
                  aria-label={col}
                  style={{
                    width: 18, height: 18, borderRadius: '50%', padding: 0, cursor: 'pointer',
                    background: col, border: 0,
                    outline: on ? '2px solid var(--tx)' : 'none', outlineOffset: 1,
                  }}
                />
              );
            })}
          </div>
          <div className="eco-menu__sep" style={{ margin: '10px 0' }}/>
          <label className="eco-hstack eco-sub" style={{ gap: 8, cursor: 'pointer' }}>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#888888'}
              onChange={(e) => onColor(e.target.value)}
              style={{ width: 22, height: 22, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}
            />
            <span className="eco-grow">{tr('settings.categories.custom_color')}</span>
            <span className="eco-num">{color}</span>
          </label>
        </div>
      )}
    </div>
  );
}

// Stepper −/valor/+ con reset opcional.
function Stepper({ value, onDec, onInc, decDisabled, incDisabled, decTitle, incTitle, onReset, resetLabel }: {
  value: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled?: boolean;
  incDisabled?: boolean;
  decTitle?: string;
  incTitle?: string;
  onReset?: () => void;
  resetLabel?: string;
}) {
  return (
    <div className="eco-hstack">
      <div className="eco-stepper">
        <IconBtn icon={IconMinus} size={28} onClick={onDec} disabled={!!decDisabled} title={decTitle}/>
        <span className="eco-mono" style={{ minWidth: 54, textAlign: 'center', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        <IconBtn icon={IconPlus} size={28} onClick={onInc} disabled={!!incDisabled} title={incTitle}/>
      </div>
      {onReset && resetLabel && (
        <button type="button" className="eco-btn eco-btn--ghost eco-btn--xs" onClick={onReset}>{resetLabel}</button>
      )}
    </div>
  );
}

function UiZoomRow() {
  const tr = useT();
  const zoom = useUiZoom();
  return (
    <Row icon={IconSearch} first
      title={tr('settings.appearance.zoom.title')}
      desc={hasNativeZoom() ? tr('settings.appearance.zoom.desc_shortcut') : tr('settings.appearance.zoom.desc')}
      control={
        <Stepper
          value={`${Math.round(zoom * 100)}%`}
          onDec={() => setUiZoom(zoom - ZOOM_STEP)}
          onInc={() => setUiZoom(zoom + ZOOM_STEP)}
          decDisabled={zoom <= ZOOM_MIN}
          incDisabled={zoom >= ZOOM_MAX}
          decTitle={tr('menu.zoom_out')}
          incTitle={tr('menu.zoom_in')}
          onReset={zoom !== ZOOM_DEFAULT ? () => setUiZoom(ZOOM_DEFAULT) : undefined}
          resetLabel={tr('settings.appearance.zoom.reset')}
        />
      }/>
  );
}

function TerminalFontRows() {
  const { t, effectiveMode } = useTheme();
  const isLight = isLightTheme(effectiveMode);
  const tr = useT();
  const prefs = useTermPrefs();
  // Medición por canvas una vez por montaje: barata, pero no gratis.
  const installed = useMemo(
    () => new Map(TERM_FONT_FAMILIES.map((f) => [f.id, f.family ? isFontInstalled(f.family) : true])),
    [],
  );
  return (
    <>
      <Row icon={IconTerminal}
        title={tr('settings.appearance.terminal.font_size')}
        desc={tr('settings.appearance.terminal.font_size_desc')}
        control={
          <Stepper
            value={`${prefs.fontSize} px`}
            onDec={() => setTermFontSize(prefs.fontSize - 1)}
            onInc={() => setTermFontSize(prefs.fontSize + 1)}
            decDisabled={prefs.fontSize <= TERM_FONT_MIN}
            incDisabled={prefs.fontSize >= TERM_FONT_MAX}
            decTitle={tr('settings.appearance.terminal.font_size.smaller')}
            incTitle={tr('settings.appearance.terminal.font_size.bigger')}
            onReset={prefs.fontSizeStored != null ? () => setTermFontSize(null) : undefined}
            resetLabel={tr('settings.appearance.zoom.reset')}
          />
        }/>
      <Row icon={IconEdit}
        title={tr('settings.appearance.terminal.font_family')}
        desc={tr('settings.appearance.terminal.font_family_desc')}
        wide
        control={
          <select value={prefs.fontFamilyId} onChange={(e) => setTermFontFamily(e.target.value)}
            className="eco-field eco-field--sm" style={selectWidth(220)}>
            {TERM_FONT_FAMILIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.family ?? tr('settings.appearance.terminal.font.system')}
                {installed.get(f.id) ? '' : ` — ${tr('settings.appearance.terminal.font.not_installed')}`}
              </option>
            ))}
          </select>
        }/>
      {/* Muestra con los colores reales del terminal: fuente y tamaño se ven
          acá antes de abrir una burbuja. */}
      <div style={{
        padding: '14px 18px', borderRadius: 14,
        background: terminalBg(t, isLight), color: terminalFg(t, isLight),
        fontFamily: termFontStack(prefs.fontFamilyId), fontSize: prefs.fontSize, lineHeight: 1.25,
        whiteSpace: 'pre', overflowX: 'auto',
      }}>
        {'$ claude --resume\n0O 1lI |  {} [] ()  ~/.eco/worktrees'}
      </div>
    </>
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
    <>
      <section className="eco-vstack">
        <div className="eco-eyebrow">{tr('settings.obsidian.label')}</div>
        <Card variant="stack">
          <div className="eco-hstack" style={{ alignItems: 'flex-start', gap: 14 }}>
            <IconTile icon={IconLayers} size="lg" accent/>
            <div className="eco-grow">
              <div className="eco-h3">{tr('settings.integrations.obsidian.title')}</div>
              <div className="eco-sub">{tr('settings.integrations.obsidian.desc')}</div>
            </div>
          </div>

          <div className="eco-inset eco-vstack" style={{ gap: 6 }}>
            <div className="eco-hstack eco-muted" style={{ gap: 8 }}>
              <StatusDot color={validVault ? t.ok : (obs.vaultPath ? t.warn : t.text3)}/>
              <span className="eco-grow">
                {!obs.vaultPath ? 'Sin configurar — elegí un vault abajo.'
                  : !obs.vaultExists ? 'El path configurado no existe en disco.'
                  : !obs.hasParaStructure ? `Vault detectado · ${obs.noteCount} notas · estructura PARA se creará al guardar.`
                  : `Vault listo · ${obs.noteCount} notas · estructura PARA detectada.`}
              </span>
            </div>
            {obs.vaultPath && (
              <div className="eco-num" style={{ paddingLeft: 16, wordBreak: 'break-all' }}>
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
            <div className="eco-inset eco-hstack eco-hstack--wrap eco-sub">
              <div className="eco-grow" style={{ flexBasis: 220 }}>
                No se detectaron vaults de Obsidian instalados. Asegurate de tener Obsidian abierto al menos una vez,
                o pegá el path manualmente abajo.
              </div>
              <Btn kind="soft" size="sm" onClick={() => void refresh()}>
                Refrescar
              </Btn>
            </div>
          )}
          {vaults.length > 0 && (
            <div className="eco-vstack" style={{ gap: 6 }}>
              <div className="eco-hstack">
                <label className="eco-field-label eco-grow">
                  {tr('settings.integrations.obsidian.detected_label')}
                </label>
                <button type="button" className="eco-btn eco-btn--ghost eco-btn--xs" onClick={() => void refresh()}
                  title={tr('settings.obsidian.refresh_tooltip')}>
                  {tr('settings.obsidian.refresh_btn')}
                </button>
              </div>
              <div className="eco-optlist" style={{ background: 'transparent', padding: 0 }}>
                {vaults.map((v) => {
                  const selected = v.path === vaultDraft;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVaultDraft(v.path)}
                      className={cx('eco-option', selected && 'is-on')}>
                      <span className="eco-option__tile">{v.name.charAt(0).toLocaleUpperCase()}</span>
                      <span className="eco-option__text">
                        <span className="eco-option__title">
                          {v.name}
                          {v.open && (
                            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ok)' }}>
                              · {tr('settings.integrations.obsidian.vault_open')}
                            </span>
                          )}
                        </span>
                        <span className="eco-option__sub">{v.path}</span>
                      </span>
                      {selected && <IconCheck size={15} className="eco-option__check"/>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="eco-vstack" style={{ gap: 6 }}>
            <label className="eco-field-label">
              {tr('settings.integrations.obsidian.vault_label')}
            </label>
            <div className="eco-hstack eco-hstack--wrap" style={{ gap: 8 }}>
              <input
                className="eco-field eco-field--sm eco-field--mono eco-grow"
                style={{ flexBasis: 220, ...BOX_FIELD }}
                value={vaultDraft}
                onChange={(e) => setVaultDraft(e.target.value)}
                placeholder="/Users/.../Documents/Obsidian/Aditum-KB"
                spellCheck={false}
                autoCorrect="off"
              />
              {hasElectron && (
                <Btn kind="raised" onClick={() => void pickFolder()}>
                  {tr('settings.integrations.obsidian.pick_folder')}
                </Btn>
              )}
            </div>
          </div>

          {/* Modo de guardado: built-in vs custom command. */}
          <div className="eco-vstack" style={{ gap: 6 }}>
            <label className="eco-field-label">{tr('settings.obsidian.mode_label')}</label>
            <div className="eco-optlist" style={{ background: 'transparent', padding: 0 }}>
              <ModeRow
                active={mode === 'builtin'}
                title={tr('settings.obsidian.mode_builtin_title')}
                desc={tr('settings.obsidian.mode_builtin_desc')}
                onClick={() => setMode('builtin')}
              />
              <ModeRow
                active={mode === 'custom'}
                title={tr('settings.obsidian.mode_custom_title')}
                desc={tr('settings.obsidian.mode_custom_desc')}
                onClick={() => setMode('custom')}
              />
            </div>
            {mode === 'custom' && (
              <div className="eco-vstack" style={{ gap: 6, marginTop: 6 }}>
                <label className="eco-field-label">
                  Comando
                </label>
                <input
                  className="eco-field eco-field--sm eco-field--mono"
                  style={BOX_FIELD}
                  value={commandDraft}
                  onChange={(e) => setCommandDraft(e.target.value)}
                  placeholder='claude -p "/kb"'
                  spellCheck={false}
                  autoCorrect="off"
                />
                <div className="eco-sub">
                  Se ejecuta con shell habilitado, cwd = workspace de la burbuja, y el markdown de la sesión se pipea por stdin.
                </div>
              </div>
            )}
          </div>

          <div className="eco-hstack eco-hstack--wrap">
            <div className="eco-hstack eco-grow" style={{ gap: 10, flexBasis: 200 }}>
              <Toggle
                on={obs.enabled && (mode === 'custom' ? !!commandDraft.trim() : validVault)}
                onChange={(v) => { if (mode === 'custom' ? !!commandDraft.trim() : (validVault || !v)) void persist(v, obs.vaultPath); }}
                disabled={mode === 'custom' ? !commandDraft.trim() : !validVault}
              />
              <span className="eco-muted">
                {tr('settings.integrations.obsidian.enabled_label')}
              </span>
            </div>
            <Btn
              kind="primary"
              onClick={() => void persist(obs.enabled, vaultDraft, mode, commandDraft)}
              disabled={busy || (vaultDraft === obs.vaultPath && mode === obs.mode && commandDraft === obs.customCommand)}>
              {busy ? '...' : tr('common.save')}
            </Btn>
          </div>

          {msg && (
            <div className={cx('eco-banner', msg.ok ? 'eco-banner--ok' : 'eco-banner--err')}>{msg.text}</div>
          )}

          <div className="eco-sub">
            <strong className="eco-muted">{tr('settings.integrations.obsidian.howto')}</strong>{' '}
            {tr('settings.integrations.obsidian.howto_desc')}
          </div>
        </Card>
      </section>

      <section className="eco-vstack">
        <div className="eco-eyebrow">{tr('settings.tailnet.label')}</div>
        <TailnetCard/>
      </section>

      <section className="eco-vstack">
        <div className="eco-eyebrow">{tr('settings.mcp.label')}</div>
        <McpCard/>
      </section>
    </>
  );
}

// Acceso remoto por Tailscale. Reemplaza al `npm run serve:web` manual: si el
// toggle queda activado, cada vez que abrís Eco el backend se vuelve a
// publicar solo en https://<maquina>.ts.net.
function TailnetCard() {
  const tr = useT();
  const { status, saving, setEnabled } = useTailnet();
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    if (!status.url) return;
    try {
      await navigator.clipboard.writeText(status.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* noop */ }
  }

  return (
    <Card variant="stack">
      <div className="eco-hstack" style={{ alignItems: 'flex-start', gap: 14 }}>
        <IconTile icon={IconGlobe} size="lg" accent/>
        <div className="eco-grow">
          <div className="eco-h3">{tr('settings.tailnet.title')}</div>
          <div className="eco-sub">{tr('settings.tailnet.desc')}</div>
        </div>
        <Toggle on={status.enabled} disabled={saving} onChange={(v) => { void setEnabled(v); }}/>
      </div>

      {status.enabled && status.active && status.url && (
        <div className="eco-inset eco-hstack" style={{ gap: 10 }}>
          <span className="eco-dot eco-dot--lg eco-dot--ok"/>
          <code className="eco-mono eco-grow eco-truncate" style={{ fontSize: 12.5 }}>{status.url}</code>
          <Btn size="sm" kind="soft" onClick={() => { void copyUrl(); }}>
            {copied ? tr('common.copied') : tr('common.copy')}
          </Btn>
        </div>
      )}

      {status.enabled && !status.active && (
        <div className="eco-banner eco-banner--warn" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          {tr('settings.tailnet.unavailable')}
          {/* El motivo crudo del backend: "Tailscale en estado X", "timeout
              ejecutando <bin>", etc. Sin esto cualquier fallo se ve igual y
              no hay por dónde empezar a mirar. */}
          {status.error && (
            <div className="eco-mono eco-muted" style={{ fontSize: 12, wordBreak: 'break-word' }}>{status.error}</div>
          )}
        </div>
      )}

      {/* Requisitos. Van siempre visibles: son cosas que se configuran FUERA
          de Eco (en la app de Tailscale y en la consola de la tailnet), así
          que si falta alguna no hay nada acá que lo delate. */}
      <div className="eco-inset">
        <div className="eco-label" style={{ marginBottom: 8 }}>{tr('settings.tailnet.reqs.title')}</div>
        <ul className="eco-vstack eco-sub" style={{ margin: 0, paddingLeft: 18, gap: 6 }}>
          <li>{tr('settings.tailnet.reqs.app')}</li>
          <li>{tr('settings.tailnet.reqs.magicdns')}</li>
          <li>{tr('settings.tailnet.reqs.serve')}</li>
          <li>{tr('settings.tailnet.reqs.device')}</li>
          <li>{tr('settings.tailnet.reqs.slow')}</li>
        </ul>
      </div>

      <div className="eco-sub">{tr('settings.tailnet.hint')}</div>
    </Card>
  );
}

function McpCard() {
  const t = useTokens();
  const tr = useT();
  const mcp = useMcpConfig();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const installCommand = mcp.binaryPath
    ? `claude mcp add eco -s user -- node ${mcp.binaryPath}`
    : '';

  async function handleInstall() {
    setBusy(true);
    setMsg(null);
    const r = await mcp.install();
    setBusy(false);
    setMsg(r.ok
      ? { ok: true, text: tr('settings.mcp.msg.installed') }
      : { ok: false, text: r.error });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleUninstall() {
    setBusy(true);
    setMsg(null);
    const r = await mcp.uninstall();
    setBusy(false);
    setMsg(r.ok
      ? { ok: true, text: tr('settings.mcp.msg.uninstalled') }
      : { ok: false, text: r.error });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleCopy() {
    if (!installCommand) return;
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  }

  const statusColor =
    !mcp.binaryAvailable ? t.err
    : !mcp.claudeAvailable ? t.warn
    : mcp.installed ? t.ok
    : t.text3;
  const statusText =
    !mcp.binaryAvailable ? tr('settings.mcp.status.binary_missing')
    : !mcp.claudeAvailable ? tr('settings.mcp.status.claude_missing')
    : mcp.installed ? tr('settings.mcp.status.installed', { scope: mcp.scope ?? 'user' })
    : tr('settings.mcp.status.not_installed');

  return (
    <Card variant="stack">
      <div className="eco-hstack" style={{ alignItems: 'flex-start', gap: 14 }}>
        <IconTile icon={IconTerminal} size="lg" accent/>
        <div className="eco-grow">
          <div className="eco-h3">{tr('settings.mcp.title')}</div>
          <div className="eco-sub">{tr('settings.mcp.desc')}</div>
        </div>
      </div>

      <div className="eco-inset eco-vstack" style={{ gap: 6 }}>
        <div className="eco-hstack eco-muted" style={{ gap: 8 }}>
          <StatusDot color={statusColor}/>
          <span className="eco-grow">{mcp.loading ? tr('common.loading') : statusText}</span>
        </div>
        {mcp.binaryPath && (
          <div className="eco-num" style={{ paddingLeft: 16, wordBreak: 'break-all' }}>
            {mcp.binaryPath}
          </div>
        )}
      </div>

      {mcp.error && <div className="eco-banner eco-banner--err">{mcp.error}</div>}

      <div className="eco-hstack eco-hstack--wrap" style={{ gap: 8 }}>
        {mcp.installed ? (
          <Btn kind="raised" onClick={() => void handleUninstall()} disabled={busy || mcp.loading}>
            {tr('settings.mcp.btn.uninstall')}
          </Btn>
        ) : (
          <Btn
            kind="primary"
            onClick={() => void handleInstall()}
            disabled={busy || mcp.loading || !mcp.binaryAvailable || !mcp.claudeAvailable}>
            {tr('settings.mcp.btn.install')}
          </Btn>
        )}
        <Btn kind="raised" onClick={() => void mcp.refresh()} disabled={busy || mcp.loading}>
          {tr('settings.mcp.btn.refresh')}
        </Btn>
        {installCommand && (
          <Btn kind="raised" onClick={() => void handleCopy()}>
            {copied ? tr('settings.mcp.btn.copied') : tr('settings.mcp.btn.copy_cmd')}
          </Btn>
        )}
      </div>

      {msg && (
        <div className={cx('eco-banner', msg.ok ? 'eco-banner--ok' : 'eco-banner--err')}>{msg.text}</div>
      )}

      <div className="eco-sub">
        <strong className="eco-muted">{tr('settings.mcp.howto')}</strong>{' '}
        {tr('settings.mcp.howto_desc')}
      </div>
    </Card>
  );
}

function ModeRow({ active, title, desc, onClick }: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cx('eco-option', active && 'is-on')}>
      <span className="eco-option__text">
        <span className="eco-option__title">{title}</span>
        <span className="eco-sub">{desc}</span>
      </span>
      {active && <IconCheck size={15} className="eco-option__check"/>}
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

function UpdatesRow() {
  const tr = useT();
  const [supported, setSupported] = useState<boolean>(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uptodate' | 'available' | 'ready' | 'error'>('idle');
  const [version, setVersion] = useState<string>('');
  const [percent, setPercent] = useState<number>(0);
  const [errMsg, setErrMsg] = useState<string>('');

  useEffect(() => {
    const api = window.electronAPI;
    if (api?.getConfig) {
      void api.getConfig().then((cfg) => setSupported(!!cfg.updatesSupported)).catch(() => { /* noop */ });
    }
    const offs: Array<() => void> = [];
    if (api?.onUpdateAvailable) offs.push(api.onUpdateAvailable((p) => { setStatus('available'); setVersion(p.version ?? ''); }));
    if (api?.onUpdateProgress) offs.push(api.onUpdateProgress((p) => { setStatus('available'); setPercent(p.percent); }));
    if (api?.onUpdateReady) offs.push(api.onUpdateReady((p) => { setStatus('ready'); setVersion(p.version ?? ''); }));
    if (api?.onUpdateError) offs.push(api.onUpdateError((p) => { setStatus('error'); setErrMsg(p.message); setChecking(false); }));
    return () => { for (const off of offs) { try { off(); } catch { /* noop */ } } };
  }, []);

  async function check() {
    const api = window.electronAPI;
    if (!api?.checkForUpdates) return;
    setChecking(true); setStatus('idle'); setErrMsg('');
    try {
      const r = await api.checkForUpdates();
      if (r.error) { setStatus('error'); setErrMsg(r.error); }
      else if (r.available) { setStatus('available'); setVersion(r.version ?? ''); }
      else { setStatus('uptodate'); }
    } catch (e) {
      setStatus('error'); setErrMsg(e instanceof Error ? e.message : 'error');
    } finally {
      setChecking(false);
    }
  }

  async function install() {
    const api = window.electronAPI;
    if (api?.installAndRestart) await api.installAndRestart();
  }

  const desc = !supported
    ? tr('settings.about.updates.only_windows')
    : checking
      ? tr('settings.about.updates.checking')
      : status === 'uptodate'
        ? tr('settings.about.updates.up_to_date')
        : status === 'available'
          ? (percent > 0
              ? tr('settings.about.updates.progress').replace('{percent}', String(percent))
              : tr('settings.about.updates.available').replace('{version}', version))
          : status === 'ready'
            ? tr('settings.about.updates.ready').replace('{version}', version)
            : status === 'error'
              ? `${tr('settings.about.updates.error')}: ${errMsg}`
              : tr('settings.about.updates.desc');

  return (
    <Row
      icon={IconBolt}
      title={tr('settings.about.updates.title')}
      desc={desc}
      control={
        status === 'ready' ? (
          <Btn kind="solid" onClick={() => void install()}>
            {tr('settings.about.updates.install_restart')}
          </Btn>
        ) : (
          <Btn kind="raised" onClick={() => void check()} disabled={!supported || checking}>
            {tr('settings.about.updates.check')}
          </Btn>
        )
      }/>
  );
}

// Diagnóstico de viewport, solo táctil. En iOS 27 la app instalada recibe un
// web view más chico que la pantalla (bug de WebKit 301994) y desde una
// captura no se distingue qué franja pinta Eco y cuál el sistema.
function ViewportDiagnostics() {
  const tr = useT();
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const measure = () => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;width:1px;visibility:hidden;pointer-events:none;'
        + 'top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px)';
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const vv = window.visualViewport;
      setLines([
        `screen ${screen.width}x${screen.height}`,
        `inner ${window.innerWidth}x${window.innerHeight}`,
        `visual ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} @${Math.round(vv.offsetTop)}` : '-'}`,
        `html ${Math.round(document.documentElement.getBoundingClientRect().height)}`,
        `env top ${cs.top} / bottom ${cs.bottom}`,
        `standalone ${String(isStandalone())} · zoom ${cssZoom()}`,
        `orientation ${screen.orientation?.type ?? '-'}`,
      ]);
      probe.remove();
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  if (!isMobileNow()) return null;
  return (
    <Card variant="stack" style={{ gap: 6 }}>
      <div className="eco-label">{tr('settings.about.viewport.title')}</div>
      <div className="eco-sub">{tr('settings.about.viewport.desc')}</div>
      <pre className="eco-mono eco-muted" style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
        {lines.join('\n')}
      </pre>
    </Card>
  );
}

function SectionAbout() {
  const tr = useT();
  const [version, setVersion] = useState<string>('1.0.0');
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
        setVersion(cfg.appVersion ?? '1.0.0');
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
      render: () => <p className="eco-muted" style={{ margin: 0, lineHeight: 1.7, fontSize: 14 }}>{tr('settings.about.what.body')}</p> },
    { id: 'quickstart', group: 'start',     icon: IconBolt,     title: tr('settings.about.quickstart.title'),
      keywords: 'inicio rápido empezar primer paso instalar setup claude cli api key wake word listener',
      render: () => <QuickStartList/> },
    { id: 'tutorials',  group: 'start',     icon: IconCommand,  title: tr('settings.about.tutorials.title'),
      keywords: 'tutorial guía paso a paso agente dev server commit voz',
      render: () => <TutorialsList/> },
    { id: 'features',   group: 'reference', icon: IconLayers,   title: tr('settings.about.features.title'),
      keywords: 'características features qué incluye agentes terminal navegador obsidian',
      render: () => <FeatureGrid/> },
    { id: 'shortcuts',  group: 'reference', icon: IconKey,      title: tr('settings.about.shortcuts.title'),
      keywords: 'atajos keyboard shortcuts teclado cmd shift ctrl',
      render: () => <ShortcutsList/> },
    { id: 'slash',      group: 'reference', icon: IconTerminal, title: tr('settings.about.slash.title'),
      keywords: 'slash commands /dev-up /remote-control /kb skills',
      render: () => <SlashCommandsList/> },
    { id: 'mobile',     group: 'reference', icon: IconGlobe,    title: tr('settings.about.mobile.title'),
      keywords: 'mobile móvil celular iphone ipad tablet pwa instalar tailscale tailnet remoto terminal teclas',
      render: () => <MobileList/> },
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
  const phone = isPhoneNow();

  return (
    <>
      <ViewportDiagnostics/>
      <Card variant="list">
        <div className="eco-row" style={{ gap: '14px 18px' }}>
          <EcoMark size={46}/>
          <div className="eco-row__main">
            <div style={{ fontSize: 22, letterSpacing: '-.02em' }}>Eco</div>
            <div className="eco-muted" style={{ textWrap: 'pretty' }}>{tr('settings.about.tagline')}</div>
            <div className="eco-hstack eco-hstack--wrap" style={{ gap: 6, marginTop: 8 }}>
              <Chip mono>v{version}</Chip>
              <Chip mono>{platform || 'web'}</Chip>
              <Chip tone={isPackaged ? 'ok' : 'warn'}>
                {isPackaged ? tr('settings.about.packaged') : tr('settings.about.dev')}
              </Chip>
            </div>
            <div className="eco-muted" style={{ marginTop: 8, fontSize: 12.5 }}>
              <span style={{ color: 'var(--tx)' }}>Sergio Castro</span> · {tr('settings.about.credits.role')}
            </div>
          </div>
          <div className="eco-inputbar eco-inputbar--sm"
            style={phone ? { flexBasis: '100%' } : { flex: '0 1 280px', minWidth: 180 }}>
            <IconSearch size={14}/>
            <input
              type="text"
              className="eco-input-bare"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr('settings.about.search.placeholder')}
            />
            {q && (
              <IconBtn icon={IconX} size={24} title={tr('settings.security.clear.btn')} onClick={() => setQ('')}/>
            )}
          </div>
        </div>
        <UpdatesRow/>
      </Card>

      <div className="eco-split">
        {/* Índice: en el teléfono la clase lo acuesta como tira horizontal,
            así que rótulos e ítems van como hijos directos. */}
        <Card as="aside" variant="nav" className="eco-split__nav"
          style={phone ? undefined : { position: 'sticky', top: 0 }}>
          {isSearching && (
            <div className="eco-num" style={{ flex: 'none', padding: '8px 12px' }}>
              {filtered.length === 0
                ? tr('settings.about.search.empty')
                : `${filtered.length} ${filtered.length === 1 ? tr('settings.about.search.one') : tr('settings.about.search.many')}`}
            </div>
          )}
          {groups.flatMap((g) => {
            const items = filtered.filter((s) => s.group === g.id);
            if (items.length === 0) return [];
            return [
              <div key={`g-${g.id}`} className="eco-eyebrow"
                style={{ flex: 'none', alignSelf: phone ? 'center' : undefined, padding: phone ? '0 8px' : '10px 12px 4px', whiteSpace: 'nowrap' }}>
                {g.label}
              </div>,
              ...items.map((s) => {
                const isActive = !!activeSection && s.id === activeSection.id;
                return (
                  <button key={s.id} type="button" onClick={() => setActiveId(s.id)}
                    className={cx('eco-nav-item eco-nav-item--sm', isActive && 'is-on')}>
                    <s.icon size={14}/>
                    <span className="eco-truncate">{s.title}</span>
                  </button>
                );
              }),
            ];
          })}
        </Card>

        <Card as="section" className="eco-split__body" style={{ gap: 14 }}>
          {activeSection ? (
            <>
              <div className="eco-hstack" style={{ gap: 12 }}>
                <IconTile icon={activeSection.icon} accent/>
                <h3 className="eco-h2">{activeSection.title}</h3>
              </div>
              <div>{activeSection.render()}</div>
            </>
          ) : (
            <div className="eco-empty">{tr('settings.about.search.empty')}</div>
          )}
        </Card>
      </div>
    </>
  );
}

function Chip({ children, mono, tone }: { children: ReactNode; mono?: boolean; tone?: 'ok' | 'warn' }) {
  return (
    <span className={cx('eco-chip', tone ? `eco-chip--${tone}` : 'eco-chip--on-card', mono && 'eco-mono')}
      style={{ fontSize: 12 }}>{children}</span>
  );
}

// Bloque pregunta/respuesta de la ayuda: título + texto, separado por línea.
function HelpItem({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="eco-row eco-row--tight" style={{ display: 'block' }}>
      <div className="eco-label">{title}</div>
      <div className="eco-muted" style={{ marginTop: 2, textWrap: 'pretty' }}>{children}</div>
    </div>
  );
}

function FeatureGrid() {
  const tr = useT();
  const features = [
    { icon: IconCommand,  title: tr('settings.about.feat.agents.title'),  body: tr('settings.about.feat.agents.body') },
    { icon: IconTerminal, title: tr('settings.about.feat.terminal.title'), body: tr('settings.about.feat.terminal.body') },
    { icon: IconGlobe,    title: tr('settings.about.feat.browser.title'),  body: tr('settings.about.feat.browser.body') },
    { icon: IconCpu,      title: tr('settings.about.feat.server.title'),   body: tr('settings.about.feat.server.body') },
    { icon: IconGithub,   title: tr('settings.about.feat.git.title'),      body: tr('settings.about.feat.git.body') },
    { icon: IconBranch,   title: tr('settings.about.feat.prs.title'),      body: tr('settings.about.feat.prs.body') },
    { icon: IconCheck,    title: tr('settings.about.feat.review.title'),   body: tr('settings.about.feat.review.body') },
    { icon: IconLayers,   title: tr('settings.about.feat.obsidian.title'), body: tr('settings.about.feat.obsidian.body') },
    { icon: IconBolt,     title: tr('settings.about.feat.skills.title'),   body: tr('settings.about.feat.skills.body') },
    { icon: IconSettings, title: tr('settings.about.feat.themes.title'),   body: tr('settings.about.feat.themes.body') },
    { icon: IconTrash,    title: tr('settings.about.feat.cleanup.title'),  body: tr('settings.about.feat.cleanup.body') },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 10 }}>
      {features.map((f, i) => (
        <div key={i} className="eco-inset">
          <div className="eco-hstack" style={{ gap: 8, marginBottom: 6 }}>
            <IconTile icon={f.icon} size="sm" accent onRaised/>
            <span className="eco-label">{f.title}</span>
          </div>
          <p className="eco-sub" style={{ margin: 0 }}>{f.body}</p>
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
  ];
  return (
    <div>
      {tutorials.map((t, i) => (
        <Tutorial key={i} title={t.title} steps={t.steps}/>
      ))}
    </div>
  );
}

function Tutorial({ title, steps }: { title: string; steps: string[] }) {
  return (
    <HelpItem title={title}>
      <ol className="eco-vstack" style={{ margin: '4px 0 0', paddingLeft: 22, gap: 4 }}>
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </HelpItem>
  );
}

function ShortcutsList() {
  const tr = useT();
  const rows = [
    { keys: ['⌘', 'R'],   action: tr('settings.about.sc.reload') },
    { keys: ['⌘', '⌥', 'I'], action: tr('settings.about.sc.devtools') },
    { keys: ['⌘', ','],   action: tr('settings.about.sc.settings') },
    { keys: ['Esc'],      action: tr('settings.about.sc.close_modal') },
  ];
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className="eco-row eco-row--tight" style={{ flexWrap: 'nowrap' }}>
          <div className="eco-hstack" style={{ gap: 4, minWidth: 84 }}>
            {r.keys.map((k) => <span key={k} className="eco-kbd">{k}</span>)}
          </div>
          <span className="eco-muted eco-grow">{r.action}</span>
        </div>
      ))}
    </div>
  );
}

function PrivacyList() {
  const tr = useT();
  const rows = [
    { label: tr('settings.about.priv.auth.label'),     desc: tr('settings.about.priv.auth.desc'),     local: true },
    { label: tr('settings.about.priv.workspace.label'), desc: tr('settings.about.priv.workspace.desc'), local: true },
    { label: tr('settings.about.priv.history.label'),  desc: tr('settings.about.priv.history.desc'),  local: true },
    { label: tr('settings.about.priv.claude.label'),   desc: tr('settings.about.priv.claude.desc'),   local: false },
  ];
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className="eco-row eco-row--tight">
          <span className={cx('eco-dot eco-dot--lg', r.local ? 'eco-dot--ok' : 'eco-dot--warn')}/>
          <div className="eco-row__main">
            <div className="eco-row__title">{r.label}</div>
            <div className="eco-row__desc">{r.desc}</div>
          </div>
          <Chip tone={r.local ? 'ok' : 'warn'} mono>
            {r.local ? tr('settings.about.priv.local') : tr('settings.about.priv.cloud')}
          </Chip>
        </div>
      ))}
    </div>
  );
}

// Par etiqueta + dato monoespaciado de las listas de referencia. En el
// teléfono la etiqueta fija no entra al lado del texto: se apilan.
function RefRow({ label, children, labelWidth, mono }: {
  label: ReactNode; children: ReactNode; labelWidth: number; mono?: 'label' | 'value';
}) {
  const phone = isPhoneNow();
  return (
    <div className="eco-row eco-row--tight" style={{ flexWrap: 'nowrap', alignItems: 'baseline', ...(phone ? { flexDirection: 'column', gap: 2 } : null) }}>
      <span className={mono === 'label' ? 'eco-mono eco-truncate' : 'eco-muted'}
        style={{ flex: 'none', fontSize: 12.5, ...(phone ? { maxWidth: '100%' } : { width: labelWidth }) }}>{label}</span>
      <span className={mono === 'value' ? 'eco-mono eco-grow' : 'eco-sub eco-grow'}
        style={mono === 'value' ? { fontSize: 12 } : undefined}>{children}</span>
    </div>
  );
}

function StackList() {
  const rows = [
    { layer: 'Empaquetado', tech: 'Electron 33 + electron-builder 25' },
    { layer: 'Frontend',    tech: 'Vite 6 · React 18 · TS 5 · Tailwind v4 · Motion 11' },
    { layer: 'Navegador',   tech: '<webview> Chromium (UA Chrome 131)' },
    { layer: 'Terminal',    tech: 'xterm.js + node-pty (PTY real)' },
    { layer: 'Dictado',     tech: 'Apple Speech (.dmg) · Web Speech API (browser)' },
    { layer: 'Backend',     tech: 'Node 20 · Express · ws · Zod · argon2id · Claude Agent SDK' },
    { layer: 'Auth local',  tech: 'PIN argon2id + frase BIP39 (~/.eco/user.json)' },
  ];
  return (
    <div>
      {rows.map((r) => (
        <RefRow key={r.layer} label={r.layer} labelWidth={110} mono="value">{r.tech}</RefRow>
      ))}
    </div>
  );
}

function QuickStartList() {
  const tr = useT();
  const steps = [
    { num: 1, title: tr('settings.about.qs.s1.t'), body: tr('settings.about.qs.s1.b') },
    { num: 2, title: tr('settings.about.qs.s2.t'), body: tr('settings.about.qs.s2.b') },
    { num: 3, title: tr('settings.about.qs.s3.t'), body: tr('settings.about.qs.s3.b') },
  ];
  return (
    <div>
      {steps.map((s) => (
        <div key={s.num} className="eco-row eco-row--tight" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <IconTile size="sm" accent>{s.num}</IconTile>
          <div className="eco-grow">
            <div className="eco-label">{s.title}</div>
            <div className="eco-muted" style={{ marginTop: 2, textWrap: 'pretty' }}>{s.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SlashCommandsList() {
  const tr = useT();
  const cmds = [
    { cmd: '/dev-up up | down | restart', desc: tr('settings.about.slash.devup') },
    { cmd: '/remote-control <nombre>', desc: tr('settings.about.slash.remote') },
    { cmd: '/<skill-personal>', desc: tr('settings.about.slash.custom') },
    { cmd: '/<kb>', desc: tr('settings.about.slash.kb') },
  ];
  return (
    <div>
      <div className="eco-muted" style={{ marginBottom: 6 }}>{tr('settings.about.slash.intro')}</div>
      {cmds.map((it) => (
        <div key={it.cmd} className="eco-row eco-row--tight" style={{ alignItems: 'baseline' }}>
          <code className="eco-chip eco-chip--on-card eco-mono" style={{ fontSize: 12 }}>{it.cmd}</code>
          <span className="eco-sub eco-grow" style={{ flexBasis: 220 }}>{it.desc}</span>
        </div>
      ))}
    </div>
  );
}

function FaqList() {
  const tr = useT();
  const items = [
    { q: tr('settings.about.faq.cost.q'),    a: tr('settings.about.faq.cost.a') },
    { q: tr('settings.about.faq.cli.q'),     a: tr('settings.about.faq.cli.a') },
    { q: tr('settings.about.faq.offline.q'), a: tr('settings.about.faq.offline.a') },
    { q: tr('settings.about.faq.windows.q'), a: tr('settings.about.faq.windows.a') },
    { q: tr('settings.about.faq.commit.q'),  a: tr('settings.about.faq.commit.a') },
    { q: tr('settings.about.faq.worktree.q'),a: tr('settings.about.faq.worktree.a') },
    { q: tr('settings.about.faq.data.q'),    a: tr('settings.about.faq.data.a') },
  ];
  return (
    <div>
      {items.map((it, i) => <HelpItem key={i} title={it.q}>{it.a}</HelpItem>)}
    </div>
  );
}

function TroubleshootingList() {
  const tr = useT();
  const items = [
    { p: tr('settings.about.tr.term.p'),    s: tr('settings.about.tr.term.s') },
    { p: tr('settings.about.tr.server.p'),  s: tr('settings.about.tr.server.s') },
    { p: tr('settings.about.tr.browser.p'), s: tr('settings.about.tr.browser.s') },
    { p: tr('settings.about.tr.claude.p'),  s: tr('settings.about.tr.claude.s') },
    { p: tr('settings.about.tr.worktree.p'),s: tr('settings.about.tr.worktree.s') },
    { p: tr('settings.about.tr.port.p'),    s: tr('settings.about.tr.port.s') },
  ];
  return (
    <div>
      {items.map((it, i) => <HelpItem key={i} title={it.p}>{it.s}</HelpItem>)}
    </div>
  );
}

function NetworkList() {
  const tr = useT();
  const rows = [
    { src: 'Eco',         dst: 'api.anthropic.com', kind: 'cloud', desc: tr('settings.about.net.anthropic') },
    { src: 'Eco backend', dst: '127.0.0.1:7100',    kind: 'local', desc: tr('settings.about.net.backend') },
    { src: 'Frontend',    dst: 'backend (mismo proceso)', kind: 'local', desc: tr('settings.about.net.frontend') },
    { src: 'Webview',     dst: 'cualquier URL que abras', kind: 'cloud', desc: tr('settings.about.net.webview') },
    { src: 'Obsidian',    dst: 'filesystem local', kind: 'local', desc: tr('settings.about.net.obsidian') },
    { src: 'Tailscale',   dst: '<maquina>.ts.net:443', kind: 'local', desc: tr('settings.about.net.tailnet') },
  ];
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className="eco-row eco-row--tight" style={{ gap: '4px 10px' }}>
          <div className="eco-hstack eco-mono" style={{ gap: 8, fontSize: 12, flex: '1 1 260px', minWidth: 0 }}>
            <span style={{ flex: 'none' }}>{r.src}</span>
            <span className="eco-faint">→</span>
            <span className="eco-muted eco-truncate">{r.dst}</span>
            <Chip tone={r.kind === 'local' ? 'ok' : 'warn'} mono>{r.kind}</Chip>
          </div>
          <span className="eco-sub" style={{ flex: '1 1 220px', minWidth: 0 }}>{r.desc}</span>
        </div>
      ))}
    </div>
  );
}

// Cómo usar Eco desde el celular o una tablet. Es la parte que más preguntas
// genera porque depende de cosas que se configuran fuera de la app.
function MobileList() {
  const tr = useT();
  const steps = [
    { k: '1', d: tr('settings.about.mobile.step.toggle') },
    { k: '2', d: tr('settings.about.mobile.step.open') },
    { k: '3', d: tr('settings.about.mobile.step.install') },
  ];
  const notes = [
    tr('settings.about.mobile.note.login'),
    tr('settings.about.mobile.note.landscape'),
    tr('settings.about.mobile.note.keys'),
    tr('settings.about.mobile.note.tablet'),
  ];
  return (
    <div className="eco-vstack" style={{ gap: 16 }}>
      <div>
        {steps.map((s) => (
          <div key={s.k} className="eco-row eco-row--tight" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <IconTile size="sm" accent>{s.k}</IconTile>
            <span className="eco-muted eco-grow" style={{ lineHeight: 1.6 }}>{s.d}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="eco-label" style={{ marginBottom: 6 }}>{tr('settings.about.mobile.notes.title')}</div>
        <ul className="eco-vstack eco-sub" style={{ margin: 0, paddingLeft: 18, gap: 6 }}>
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      </div>
    </div>
  );
}

function FilesList() {
  const tr = useT();
  const rows = [
    { path: '~/.eco/user.json',   desc: tr('settings.about.files.user') },
    { path: '~/.eco/token',       desc: tr('settings.about.files.token') },
    { path: '~/.eco/api-key',     desc: tr('settings.about.files.apikey') },
    { path: '~/.eco/obsidian.json', desc: tr('settings.about.files.obsidian') },
    { path: '~/.eco/tailnet.json', desc: tr('settings.about.files.tailnet') },
    { path: '~/.eco/workspace-config.json', desc: tr('settings.about.files.wsconfig') },
    { path: '~/.eco/worktrees/<bubble-id>', desc: tr('settings.about.files.worktrees') },
    { path: 'localStorage (browser)', desc: tr('settings.about.files.localstorage') },
  ];
  return (
    <div>
      {rows.map((r, i) => (
        <RefRow key={i} label={r.path} labelWidth={210} mono="label">{r.desc}</RefRow>
      ))}
    </div>
  );
}

function DevList() {
  const tr = useT();
  const envs = [
    { k: 'ECO_HOST',       d: tr('settings.about.dev.env.host') },
    { k: 'ECO_PORT',       d: tr('settings.about.dev.env.port') },
    { k: 'ECO_WORKSPACES', d: tr('settings.about.dev.env.workspaces') },
    { k: 'ECO_MODEL',      d: tr('settings.about.dev.env.model') },
    { k: 'ECO_PTY_AUTOCLAUDE', d: tr('settings.about.dev.env.autoclaude') },
    { k: 'CLAUDE_CLI_PATH', d: tr('settings.about.dev.env.clipath') },
    { k: 'ECO_FIREBASE_PROJECT_ID', d: tr('settings.about.dev.env.firebase') },
    { k: 'ECO_TAILSCALE_BIN', d: tr('settings.about.dev.env.tsbin') },
  ];
  const scripts = [
    { k: 'npm run dev',       d: tr('settings.about.dev.scripts.dev') },
    { k: 'npm run dev:app',   d: tr('settings.about.dev.scripts.devapp') },
    { k: 'npm run dist:mac',  d: tr('settings.about.dev.scripts.distmac') },
    { k: 'npm run typecheck', d: tr('settings.about.dev.scripts.typecheck') },
    { k: 'npm run check:i18n', d: tr('settings.about.dev.scripts.i18n') },
    { k: 'npm run serve:web',  d: tr('settings.about.dev.scripts.serveweb') },
  ];
  return (
    <div className="eco-vstack" style={{ gap: 16 }}>
      <div>
        <div className="eco-label" style={{ marginBottom: 2 }}>{tr('settings.about.dev.env.title')}</div>
        {envs.map((e) => <RefRow key={e.k} label={e.k} labelWidth={200} mono="label">{e.d}</RefRow>)}
      </div>
      <div>
        <div className="eco-label" style={{ marginBottom: 2 }}>{tr('settings.about.dev.scripts.title')}</div>
        {scripts.map((s) => <RefRow key={s.k} label={s.k} labelWidth={200} mono="label">{s.d}</RefRow>)}
      </div>
    </div>
  );
}

function SupportList() {
  const tr = useT();
  return (
    <div>
      <p className="eco-muted" style={{ margin: '0 0 6px', lineHeight: 1.6 }}>{tr('settings.about.support.intro')}</p>
      <HelpItem title={tr('settings.about.support.bug.t')}>{tr('settings.about.support.bug.b')}</HelpItem>
      <HelpItem title={tr('settings.about.support.logs.t')}>
        {tr('settings.about.support.logs.b')}{' '}
        <code className="eco-chip eco-chip--on-card eco-mono" style={{ fontSize: 12 }}>
          /Applications/Eco.app/Contents/MacOS/Eco
        </code>
      </HelpItem>
      <HelpItem title={tr('settings.about.support.reset.t')}>{tr('settings.about.support.reset.b')}</HelpItem>
    </div>
  );
}

function CreditsBody() {
  const tr = useT();
  return (
    <div className="eco-vstack" style={{ gap: 18 }}>
      {/* Autor */}
      <div className="eco-inset eco-hstack" style={{ gap: 14, padding: 16 }}>
        <IconTile size="lg" accent onRaised>S</IconTile>
        <div className="eco-grow">
          <div className="eco-h3">Sergio Castro</div>
          <div className="eco-sub">{tr('settings.about.credits.role')}</div>
          <div className="eco-hstack eco-hstack--wrap" style={{ gap: 6, marginTop: 8 }}>
            <span className="eco-chip eco-mono" style={{ fontSize: 12 }}>
              <span className="eco-dot eco-dot--ok"/>
              Aditum
            </span>
            <span className="eco-chip eco-mono" style={{ fontSize: 12 }}>Florida, USA</span>
          </div>
        </div>
      </div>

      {/* Meta del proyecto */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <MetaCell label={tr('settings.about.credits.year')} value="2026"/>
        <MetaCell label={tr('settings.about.credits.license')} value="Privado"/>
        <MetaCell label={tr('settings.about.credits.platform')} value="macOS · arm64"/>
        <MetaCell label={tr('settings.about.credits.lang')} value="TypeScript"/>
      </div>

      {/* Agradecimientos */}
      <div>
        <div className="eco-label" style={{ marginBottom: 6 }}>{tr('settings.about.credits.thanks_to')}</div>
        <p className="eco-muted" style={{ margin: 0, lineHeight: 1.6 }}>
          {tr('settings.about.credits.thanks_body')}
        </p>
      </div>

      <hr className="eco-divider"/>
      <div className="eco-hstack eco-hstack--wrap eco-num" style={{ justifyContent: 'space-between' }}>
        <span>© 2026 Sergio Castro · Eco</span>
        <span>{tr('settings.about.credits.made_with')}</span>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="eco-inset">
      <div className="eco-eyebrow eco-eyebrow--sm" style={{ marginBottom: 4 }}>{label}</div>
      <div className="eco-mono" style={{ fontSize: 12.5, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

// ──────────── helpers

function GeneralToggleRow({ icon, title, desc, storageKey, defaultOn, broadcastEvent, first }: {
  icon: (p: IconProps) => JSX.Element; title: string; desc?: string;
  storageKey: string; defaultOn?: boolean;
  // Si se provee, dispara un CustomEvent con ese nombre tras guardar — útil
  // para que componentes en la misma pestaña reaccionen (el evento 'storage'
  // del navegador no se dispara en la pestaña que escribió).
  broadcastEvent?: string;
  first?: boolean;
}) {
  const [on, setOn] = useState(() => {
    if (typeof window === 'undefined') return defaultOn ?? false;
    const v = window.localStorage.getItem(storageKey);
    if (v == null) return defaultOn ?? false;
    return v === '1';
  });
  return (
    <Row icon={icon} title={title} desc={desc} first={first} control={
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
