import { vh } from '@/lib/ui-zoom';
import { useEffect, useMemo, useState } from 'react';
import { useTokens, useTheme } from '@/design/theme';
import { ACCENT_HUES, THEME_VARIANTS } from '@/design/tokens';
import { Btn, Card, Chip, IconTile } from '@/design/primitives';
import { useIsPhone } from '@/hooks/useMediaQuery';
import { SAFE_TOP, SAFE_BOTTOM } from '@/lib/platform';
import { useI18n, useT } from '@/hooks/useI18n';
import { useApiKey } from '@/hooks/useApiKey';
import { useGithubCredentials } from '@/hooks/useGithubCredentials';
import { GithubTokenHelp } from '@/components/GithubTokenHelp';
import { GhStatusBanner } from '@/components/GhStatusBanner';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useDefaultWorkspace } from '@/hooks/useDefaultWorkspace';
import { useObsidian, pickVaultFolder } from '@/hooks/useObsidian';
import { apiFetch } from '@/lib/api';
import { EcoGlyph } from '@/design/EcoMark';
import type { JSX } from 'react';
import {
  IconBolt, IconCheck, IconFolder, IconGithub, IconGlobe, IconKey, IconLayers,
  IconShield, type IconProps,
} from '@/design/icons';

const ONBOARDED_KEY = 'eco.onboarded';

export function hasOnboarded(): boolean {
  try { return window.localStorage.getItem(ONBOARDED_KEY) === '1'; } catch { return false; }
}

export function markOnboarded() {
  try { window.localStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* noop */ }
}

type ClaudeAuth = {
  cliInstalled: boolean;
  cliLoggedIn: boolean;
  hasApiKey: boolean;
  effectiveMethod: 'cli' | 'apikey' | 'none';
} | null;

type StepId = 'welcome' | 'language' | 'appearance' | 'claude' | 'github' | 'folder' | 'obsidian' | 'done';

export function OnboardingWizard({ username, onClose }: { username: string | null; onClose: () => void }) {
  const tr = useT();
  const isPhone = useIsPhone();
  const [step, setStep] = useState<StepId>('welcome');

  const order: StepId[] = ['welcome', 'language', 'appearance', 'claude', 'github', 'folder', 'obsidian', 'done'];
  const idx = order.indexOf(step);

  function next() {
    const n = order[idx + 1];
    if (n) setStep(n);
  }
  function back() {
    const p = order[idx - 1];
    if (p) setStep(p);
  }

  function finish() {
    markOnboarded();
    onClose();
  }

  return (
    <div className="eco-app" style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: isPhone ? `calc(12px + ${SAFE_TOP}) 12px calc(12px + ${SAFE_BOTTOM})` : 24,
    }}>
      <div className="eco-pane" style={{
        width: '100%', maxWidth: 640,
        maxHeight: isPhone ? '100%' : `calc(${vh(100)} - 48px)`,
        background: 'var(--sheet)', borderRadius: isPhone ? 24 : 28,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div className="eco-hstack" style={{ padding: isPhone ? '18px 18px 0' : '22px 28px 0' }}>
          <EcoGlyph size={26}/>
          <span className="eco-grow" style={{ fontSize: 16, fontWeight: 600 }}>eco</span>
          <span className="eco-num">{idx + 1} / {order.length}</span>
        </div>

        {/* Progreso por pasos */}
        <div style={{ display: 'flex', gap: 6, padding: isPhone ? '14px 18px 0' : '14px 28px 0' }}>
          {order.map((s, i) => (
            <span key={s} style={{
              height: 4, flex: 1, borderRadius: 2,
              background: i <= idx ? 'var(--ac)' : 'var(--card)',
              transition: 'background-color 200ms ease',
            }}/>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: isPhone ? '20px 18px' : '26px 28px' }}>
          {step === 'welcome'    && <StepWelcome username={username}/>}
          {step === 'language'   && <StepLanguage/>}
          {step === 'appearance' && <StepAppearance/>}
          {step === 'claude'     && <StepClaude/>}
          {step === 'github'     && <StepGithub onContinue={next}/>}
          {step === 'folder'     && <StepFolder/>}
          {step === 'obsidian'   && <StepObsidian/>}
          {step === 'done'       && <StepDone/>}
        </div>

        <div className="eco-hstack eco-hstack--wrap" style={{
          padding: isPhone ? '12px 18px 14px' : '14px 28px 18px', borderTop: '1px solid var(--line)',
        }}>
          {idx > 0 && step !== 'done' && (
            <Btn kind="ghost" onClick={back}>{tr('onboarding.back')}</Btn>
          )}
          <div className="eco-spacer"/>
          {step !== 'done' && step !== 'welcome' && (
            <Btn kind="ghost" onClick={finish}>{tr('onboarding.skip')}</Btn>
          )}
          {step !== 'done' ? (
            <Btn kind="primary" onClick={next}>
              {step === 'welcome' ? tr('onboarding.start') : tr('onboarding.next')}
            </Btn>
          ) : (
            <Btn kind="primary" onClick={finish}>{tr('onboarding.finish')}</Btn>
          )}
        </div>
      </div>
    </div>
  );
}

function StepWelcome({ username }: { username: string | null }) {
  const tr = useT();
  return (
    <div style={{ textAlign: 'center', padding: '12px 4px 6px' }}>
      <div style={{ display: 'inline-flex', marginBottom: 18 }}>
        <EcoGlyph size={64}/>
      </div>
      <h2 className="eco-title eco-title--md">
        {username
          ? tr('onboarding.welcome.title_named').replace('{name}', username)
          : tr('onboarding.welcome.title')}
      </h2>
      <p className="eco-muted" style={{ margin: '12px auto 0', maxWidth: 420, lineHeight: 1.6 }}>
        {tr('onboarding.welcome.body')}
      </p>
      <div className="eco-hstack eco-hstack--wrap" style={{ justifyContent: 'center', marginTop: 24 }}>
        {[
          { icon: IconBolt,   label: tr('onboarding.welcome.tag.fast') },
          { icon: IconShield, label: tr('onboarding.welcome.tag.private') },
        ].map((tag, i) => (
          <Chip key={i}><tag.icon size={12}/> {tag.label}</Chip>
        ))}
      </div>
    </div>
  );
}

// Tarjeta seleccionable (idioma, tema): el anillo de acento marca la elegida.
function choiceStyle(selected: boolean): React.CSSProperties {
  return {
    border: 0, background: 'var(--card)', color: 'var(--tx)', font: 'inherit',
    cursor: 'pointer', textAlign: 'left', borderRadius: 16,
    boxShadow: selected ? '0 0 0 2px var(--ac)' : 'none',
  };
}

function StepLanguage() {
  const tr = useT();
  const { lang, setLang } = useI18n();
  const options: { id: 'es' | 'en'; label: string }[] = [
    { id: 'es', label: 'Español' },
    { id: 'en', label: 'English' },
  ];
  return (
    <StepShell
      icon={IconGlobe}
      title={tr('onboarding.language.title')}
      sub={tr('onboarding.language.sub')}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
        {options.map((o) => {
          const selected = lang === o.id;
          return (
            <button key={o.id} type="button" onClick={() => setLang(o.id)} aria-pressed={selected}
              className="eco-hstack" style={{ ...choiceStyle(selected), padding: '14px 16px' }}>
              <IconTile icon={IconGlobe}/>
              <span className="eco-label eco-grow">{o.label}</span>
              {selected && <IconCheck size={14} strokeWidth={2.4}/>}
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

function StepAppearance() {
  const t = useTokens();
  const tr = useT();
  const { mode, setMode, accentHue, setAccentHue } = useTheme();
  const byId = new Map(THEME_VARIANTS.map((v) => [v.id, v.preview]));
  const light = byId.get('light')!;
  const dark = byId.get('dark')!;
  // Mismas tres opciones y vista previa que Settings → Apariencia.
  const modes = [
    { id: 'light' as const,  label: tr('onboarding.appearance.light'),  bg: light.bg, ink: light.ink, mute: light.mute },
    { id: 'dark' as const,   label: tr('onboarding.appearance.dark'),   bg: dark.bg,  ink: dark.ink,  mute: dark.mute },
    { id: 'system' as const, label: tr('onboarding.appearance.system'), bg: `linear-gradient(105deg, ${light.bg} 50%, ${dark.bg} 50%)`, ink: light.ink, mute: dark.mute },
  ];
  return (
    <StepShell
      icon={IconLayers}
      title={tr('onboarding.appearance.title')}
      sub={tr('onboarding.appearance.sub')}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, marginBottom: 24 }}>
        {modes.map((m) => {
          const selected = mode === m.id;
          return (
            <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={selected}
              style={{ ...choiceStyle(selected), display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
              <div style={{
                height: 64, borderRadius: 11, background: m.bg, border: `1px solid ${t.line2}`,
                display: 'flex', alignItems: 'flex-end', gap: 5, padding: 10,
              }}>
                <span style={{ width: '38%', height: 6, borderRadius: 3, background: m.ink }}/>
                <span style={{ width: '22%', height: 6, borderRadius: 3, background: m.mute }}/>
              </div>
              <div className="eco-hstack" style={{ gap: 8, padding: '0 4px 2px' }}>
                <span className="eco-label eco-grow">{m.label}</span>
                {selected && <IconCheck size={14} strokeWidth={2.4}/>}
              </div>
            </button>
          );
        })}
      </div>
      <div className="eco-eyebrow" style={{ marginBottom: 10 }}>{tr('onboarding.appearance.accent')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 6 }}>
        {ACCENT_HUES.map((a) => {
          const selected = accentHue === a.hue;
          return (
            <button key={a.hue} type="button" onClick={() => setAccentHue(a.hue)}
              title={a.name} aria-label={a.name} aria-pressed={selected}
              style={{
                height: 44, padding: 0, border: 0, borderRadius: 14, cursor: 'pointer',
                background: selected ? 'var(--card)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <span style={{
                width: 26, height: 26, borderRadius: '50%',
                background: `oklch(0.72 0.13 ${a.hue})`,
                boxShadow: selected ? `0 0 0 2px ${t.card}, 0 0 0 4px ${t.text0}` : 'none',
              }}/>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

function StepClaude() {
  const tr = useT();
  const apiKey = useApiKey();
  const [status, setStatus] = useState<ClaudeAuth>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch('/config/claude-auth').then(async (r) => {
      try {
        const data = await r.json();
        setStatus(data);
      } catch { /* noop */ }
    });
  }, [apiKey.hasKey]);

  async function saveKey() {
    if (!keyInput.trim()) return;
    setSaving(true); setErr(null);
    const r = await apiKey.save(keyInput.trim());
    setSaving(false);
    if (!r.ok) setErr(r.error);
    else setKeyInput('');
  }

  const cliOk = status?.cliLoggedIn;
  const hasKey = apiKey.hasKey;

  return (
    <StepShell
      icon={IconKey}
      title={tr('onboarding.claude.title')}
      sub={tr('onboarding.claude.sub')}
    >
      {/* CLI status */}
      <div className="eco-card eco-card--sm eco-hstack" style={{ gap: 12, marginBottom: 12 }}>
        <IconTile icon={IconCheck} accent={!!cliOk} style={cliOk ? undefined : { color: 'var(--tx3)' }}/>
        <div className="eco-grow">
          <div className="eco-label">
            {cliOk ? tr('onboarding.claude.cli.ok') : tr('onboarding.claude.cli.no')}
          </div>
          <div className="eco-sub">
            {cliOk
              ? tr('onboarding.claude.cli.ok_body')
              : status?.cliInstalled
                ? tr('onboarding.claude.cli.installed_no_login')
                : tr('onboarding.claude.cli.missing')}
          </div>
        </div>
      </div>

      {/* API key fallback */}
      {!cliOk && (
        <div className="eco-card eco-card--sm eco-card--stack" style={{ gap: 8 }}>
          <div className="eco-label">{tr('onboarding.claude.apikey.title')}</div>
          <div className="eco-sub">{tr('onboarding.claude.apikey.sub')}</div>
          {hasKey ? (
            <div className="eco-inset eco-hstack">
              <span className="eco-tile--accent" style={{ display: 'inline-flex' }}><IconCheck size={14}/></span>
              <span className="eco-mono eco-muted eco-grow eco-truncate" style={{ fontSize: 12.5 }}>
                {apiKey.masked || '****'}
              </span>
              <Btn kind="ghost" size="sm" onClick={() => void apiKey.remove()}>
                {tr('onboarding.claude.apikey.replace')}
              </Btn>
            </div>
          ) : (
            <div className="eco-hstack eco-hstack--wrap" style={{ gap: 8 }}>
              <input
                className="eco-field eco-field--sm eco-field--mono"
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                style={{ flex: '1 1 200px', width: 'auto' }}
              />
              <Btn kind="solid" onClick={() => void saveKey()} disabled={saving || !keyInput.trim()}>
                {saving ? '…' : tr('onboarding.claude.apikey.save')}
              </Btn>
            </div>
          )}
          {err && <div className="eco-banner eco-banner--err">{err}</div>}
        </div>
      )}
    </StepShell>
  );
}

function StepGithub({ onContinue }: { onContinue: () => void }) {
  const tr = useT();
  const gh = useGithubCredentials();
  const [pat, setPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [email, setEmail] = useState('');
  const [needEmail, setNeedEmail] = useState(false);
  const [loginHint, setLoginHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    if (!pat.trim()) return;
    setSaving(true);
    setError(null);
    const r = await gh.save({ pat: pat.trim(), email: email.trim() || undefined });
    setSaving(false);
    if (r.ok) {
      onContinue();
    } else if (r.needEmail) {
      setNeedEmail(true);
      setLoginHint(r.loginHint ?? null);
    } else {
      setError(r.error);
    }
  }

  return (
    <StepShell
      icon={IconGithub}
      title={tr('onboarding.github.title')}
      sub={tr('onboarding.github.sub')}
    >
      <p className="eco-muted" style={{ margin: 0, lineHeight: 1.6, maxWidth: 560 }}>
        {tr('onboarding.github.body')}
      </p>

      {gh.hasCredentials ? (
        <div className="eco-vstack" style={{ marginTop: 16, gap: 8 }}>
          <div className="eco-banner eco-banner--ok">
            <IconCheck size={14}/>
            {tr('settings.github.connected_as', { username: gh.username ?? '' })}
          </div>
          <GhStatusBanner/>
        </div>
      ) : (
        <div className="eco-vstack" style={{ marginTop: 16, gap: 10, maxWidth: 540 }}>
          <div className="eco-hstack eco-hstack--wrap" style={{ gap: 8 }}>
            <input
              className="eco-field eco-field--on-sheet eco-field--mono"
              type={showPat ? 'text' : 'password'}
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder={tr('settings.github.pat_placeholder')}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              style={{ flex: '1 1 200px', width: 'auto' }}
            />
            <Btn kind="soft" size="lg" onClick={() => setShowPat((v) => !v)}>
              {showPat ? tr('settings.github.pat_hide') : tr('settings.github.pat_show')}
            </Btn>
          </div>

          <div className="eco-sub">{tr('settings.github.recommended_scopes')}</div>
          <GithubTokenHelp/>
          <GhStatusBanner/>

          {needEmail && (
            <>
              <input
                className="eco-field eco-field--on-sheet eco-field--mono"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tr('settings.github.email_placeholder')}
              />
              <div className="eco-banner eco-banner--warn">
                {tr('settings.github.email_required_note')}
                {loginHint && (
                  <span className="eco-muted">
                    ({tr('settings.github.connected_as', { username: loginHint })})
                  </span>
                )}
              </div>
            </>
          )}

          {error && <div className="eco-banner eco-banner--err">{error}</div>}

          <div className="eco-hstack eco-hstack--wrap" style={{ gap: 8, marginTop: 4 }}>
            <Btn kind="solid" onClick={() => void onSave()} disabled={saving || !pat.trim()}>
              {saving ? tr('settings.github.validating') : tr('onboarding.github.continue')}
            </Btn>
            <Btn kind="soft" onClick={onContinue}>{tr('onboarding.github.skip')}</Btn>
          </div>
        </div>
      )}
    </StepShell>
  );
}

function StepFolder() {
  const tr = useT();
  const ws = useWorkspaces();
  const def = useDefaultWorkspace();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasPicker = typeof window !== 'undefined' && !!window.electronAPI?.pickFolder;

  async function pick() {
    if (!window.electronAPI?.pickFolder) return;
    setErr(null); setBusy(true);
    try {
      const r = await window.electronAPI.pickFolder({ title: tr('onboarding.folder.pick_title') });
      if (r.canceled || !r.path) { setBusy(false); return; }
      const added = await ws.add(r.path);
      if (!added.ok) { setErr(added.error); setBusy(false); return; }
      if (!def.value) def.set(r.path);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    }
    setBusy(false);
  }

  return (
    <StepShell
      icon={IconFolder}
      title={tr('onboarding.folder.title')}
      sub={tr('onboarding.folder.sub')}
    >
      {ws.list.workspaces.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="eco-eyebrow" style={{ marginBottom: 8 }}>{tr('onboarding.folder.current')}</div>
          <Card variant="list">
            {ws.list.workspaces.map((w) => (
              <div key={w} className="eco-row eco-row--tight" style={{ flexWrap: 'nowrap' }}>
                <IconFolder size={15}/>
                <code className="eco-mono eco-muted eco-truncate eco-grow" style={{ fontSize: 12.5 }}>{w}</code>
                {def.value === w && <Chip tone="accent">{tr('onboarding.folder.default')}</Chip>}
              </div>
            ))}
          </Card>
        </div>
      )}
      {hasPicker ? (
        <Btn kind="solid" size="lg" icon={IconFolder} className="eco-btn--block" onClick={() => void pick()} disabled={busy}>
          {busy ? '…' : tr('onboarding.folder.pick')}
        </Btn>
      ) : (
        <div className="eco-banner">{tr('onboarding.folder.web_note')}</div>
      )}
      {err && <div className="eco-banner eco-banner--err" style={{ marginTop: 8 }}>{err}</div>}
    </StepShell>
  );
}

function StepObsidian() {
  const tr = useT();
  const { status, vaults, save, refresh } = useObsidian();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasPicker = typeof window !== 'undefined' && !!window.electronAPI?.pickFolder;
  const isLinked = status.configured && status.enabled && status.vaultExists;

  async function connectVault(path: string) {
    setErr(null); setBusy(true);
    const ok = await save(true, path);
    setBusy(false);
    if (!ok) setErr(tr('onboarding.obsidian.error'));
    else void refresh();
  }

  async function pickCustom() {
    const p = await pickVaultFolder();
    if (!p) return;
    await connectVault(p);
  }

  async function disconnect() {
    setBusy(true);
    await save(false, status.vaultPath);
    setBusy(false);
    void refresh();
  }

  return (
    <StepShell
      icon={IconLayers}
      title={tr('onboarding.obsidian.title')}
      sub={tr('onboarding.obsidian.sub')}
    >
      {isLinked ? (
        <div className="eco-card eco-card--sm eco-card--stack" style={{ gap: 10, marginBottom: 12 }}>
          <div className="eco-hstack eco-hstack--wrap" style={{ gap: 12 }}>
            <IconTile icon={IconCheck} accent/>
            <div className="eco-grow" style={{ flexBasis: 180 }}>
              <div className="eco-label">{tr('onboarding.obsidian.connected')}</div>
              <code className="eco-mono eco-sub eco-truncate" style={{ display: 'block' }}>{status.vaultPath}</code>
            </div>
            <Btn kind="raised" size="sm" onClick={() => void disconnect()} disabled={busy}>
              {tr('onboarding.obsidian.disconnect')}
            </Btn>
          </div>
          {status.hasParaStructure && (
            <div className="eco-sub eco-hstack" style={{ gap: 6 }}>
              <IconCheck size={12}/>
              {tr('onboarding.obsidian.para_detected').replace('{n}', String(status.noteCount))}
            </div>
          )}
        </div>
      ) : (
        <>
          {vaults.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="eco-eyebrow" style={{ marginBottom: 8 }}>{tr('onboarding.obsidian.detected')}</div>
              <Card variant="list">
                {vaults.map((v) => (
                  <button key={v.id} type="button"
                    onClick={() => void connectVault(v.path)}
                    disabled={busy}
                    className="eco-row eco-row--tight"
                    style={{
                      width: '100%', flexWrap: 'nowrap', background: 'transparent', color: 'inherit', font: 'inherit',
                      borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: 'left',
                      cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                    }}>
                    <IconTile icon={IconLayers}/>
                    <div className="eco-grow">
                      <div className="eco-hstack" style={{ gap: 8 }}>
                        <span className="eco-label eco-truncate">{v.name}</span>
                        {v.open && <Chip tone="accent">{tr('onboarding.obsidian.open')}</Chip>}
                      </div>
                      <code className="eco-mono eco-sub eco-truncate" style={{ display: 'block' }}>{v.path}</code>
                    </div>
                  </button>
                ))}
              </Card>
            </div>
          )}
          {hasPicker ? (
            <Btn kind="soft" size="lg" className="eco-btn--block" onClick={() => void pickCustom()} disabled={busy}>
              {vaults.length > 0 ? tr('onboarding.obsidian.pick_other') : tr('onboarding.obsidian.pick')}
            </Btn>
          ) : vaults.length === 0 && (
            <div className="eco-banner">{tr('onboarding.obsidian.none')}</div>
          )}
        </>
      )}
      {err && <div className="eco-banner eco-banner--err" style={{ marginTop: 8 }}>{err}</div>}
      <div className="eco-sub" style={{ marginTop: 16 }}>{tr('onboarding.obsidian.note')}</div>
    </StepShell>
  );
}

function StepDone() {
  const tr = useT();
  const tips = useMemo(() => [
    tr('onboarding.done.tip.dashboard'),
    tr('onboarding.done.tip.support'),
  ], [tr]);
  return (
    <div style={{ textAlign: 'center', padding: '12px 4px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--ac-soft)', color: 'var(--ac)', marginBottom: 18,
      }}>
        <IconCheck size={28}/>
      </div>
      <h2 className="eco-title eco-title--md">{tr('onboarding.done.title')}</h2>
      <p className="eco-muted" style={{ margin: '10px auto 22px', maxWidth: 400, lineHeight: 1.6 }}>
        {tr('onboarding.done.body')}
      </p>
      <Card variant="list" style={{ maxWidth: 420, margin: '0 auto', textAlign: 'left' }}>
        {tips.map((tip, i) => (
          <div key={i} className="eco-row eco-row--tight" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <IconTile size="sm">{i + 1}</IconTile>
            <span className="eco-muted eco-grow" style={{ lineHeight: 1.5, paddingTop: 5 }}>{tip}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function StepShell({
  icon: Icon, title, sub, children,
}: {
  icon: (p: IconProps) => JSX.Element;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="eco-hstack" style={{ gap: 12, marginBottom: 18 }}>
        <IconTile icon={Icon} accent style={{ background: 'var(--card)' }}/>
        <div className="eco-grow">
          <h3 className="eco-h2">{title}</h3>
          <div className="eco-sub">{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}
