import { useEffect, useMemo, useState } from 'react';
import { useTokens, useTheme } from '@/design/theme';
import { ACCENT_HUES } from '@/design/tokens';
import { useI18n, useT } from '@/hooks/useI18n';
import { useApiKey } from '@/hooks/useApiKey';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useDefaultWorkspace } from '@/hooks/useDefaultWorkspace';
import { useObsidian, pickVaultFolder } from '@/hooks/useObsidian';
import { apiFetch } from '@/lib/api';
import { EcoMark } from '@/design/EcoMark';
import {
  IconBolt, IconCheck, IconFolder, IconGlobe, IconKey, IconLayers,
  IconMic, IconShield, type IconProps,
} from '@/design/icons';

const ONBOARDED_KEY = 'eco.onboarded';
const VOICE_AUTOSTART_KEY = 'eco.voice.autostart';

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

type StepId = 'welcome' | 'language' | 'appearance' | 'claude' | 'folder' | 'obsidian' | 'voice' | 'done';

export function OnboardingWizard({ username, onClose }: { username: string | null; onClose: () => void }) {
  const t = useTokens();
  const tr = useT();
  const [step, setStep] = useState<StepId>('welcome');

  const order: StepId[] = ['welcome', 'language', 'appearance', 'claude', 'folder', 'obsidian', 'voice', 'done'];
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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 640,
        maxHeight: 'calc(100vh - 48px)',
        background: t.bg1,
        border: `1px solid ${t.glassBorder}`,
        borderRadius: 18,
        boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Progress dots */}
        <div style={{
          display: 'flex', gap: 6, padding: '16px 22px 0',
        }}>
          {order.map((s, i) => (
            <span key={s} style={{
              height: 3, flex: 1, borderRadius: 2,
              background: i <= idx ? t.accent : t.bg3,
              transition: 'background 200ms ease',
            }}/>
          ))}
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflow: 'auto',
          padding: '24px 32px',
        }}>
          {step === 'welcome'    && <StepWelcome username={username}/>}
          {step === 'language'   && <StepLanguage/>}
          {step === 'appearance' && <StepAppearance/>}
          {step === 'claude'     && <StepClaude/>}
          {step === 'folder'     && <StepFolder/>}
          {step === 'obsidian'   && <StepObsidian/>}
          {step === 'voice'      && <StepVoice/>}
          {step === 'done'       && <StepDone/>}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 22px',
          borderTop: `1px solid ${t.glassBorder}`,
          background: t.bg2,
        }}>
          {idx > 0 && step !== 'done' && (
            <button type="button" onClick={back} style={btnGhost(t)}>
              {tr('onboarding.back')}
            </button>
          )}
          <div style={{ flex: 1 }}/>
          {step !== 'done' && step !== 'welcome' && (
            <button type="button" onClick={finish} style={btnGhost(t)}>
              {tr('onboarding.skip')}
            </button>
          )}
          {step !== 'done' ? (
            <button type="button" onClick={next} style={btnPrimary(t)}>
              {step === 'welcome' ? tr('onboarding.start') : tr('onboarding.next')}
            </button>
          ) : (
            <button type="button" onClick={finish} style={btnPrimary(t)}>
              {tr('onboarding.finish')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepWelcome({ username }: { username: string | null }) {
  const t = useTokens();
  const tr = useT();
  return (
    <div style={{ textAlign: 'center', padding: '8px 8px 6px' }}>
      <div style={{ display: 'inline-flex', marginBottom: 16 }}>
        <EcoMark size={72}/>
      </div>
      <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: t.text0, letterSpacing: -0.5 }}>
        {username
          ? tr('onboarding.welcome.title_named').replace('{name}', username)
          : tr('onboarding.welcome.title')}
      </h2>
      <p style={{
        margin: '10px auto 0', maxWidth: 420,
        fontSize: 13.5, color: t.text2, lineHeight: 1.6,
      }}>
        {tr('onboarding.welcome.body')}
      </p>
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 10,
        marginTop: 22, flexWrap: 'wrap',
      }}>
        {[
          { icon: IconBolt,   label: tr('onboarding.welcome.tag.fast') },
          { icon: IconShield, label: tr('onboarding.welcome.tag.private') },
          { icon: IconMic,    label: tr('onboarding.welcome.tag.voice') },
        ].map((tag, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 999,
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            color: t.text1, fontSize: 12,
          }}>
            <tag.icon size={12}/> {tag.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepLanguage() {
  const t = useTokens();
  const tr = useT();
  const { lang, setLang } = useI18n();
  const options: { id: 'es' | 'en'; label: string; flag: string }[] = [
    { id: 'es', label: 'Español', flag: '🇪🇸' },
    { id: 'en', label: 'English', flag: '🇺🇸' },
  ];
  return (
    <StepShell
      icon={IconGlobe}
      title={tr('onboarding.language.title')}
      sub={tr('onboarding.language.sub')}
    >
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
      }}>
        {options.map((o) => {
          const selected = lang === o.id;
          return (
            <button key={o.id} type="button" onClick={() => setLang(o.id)}
              style={{
                padding: '18px 14px', borderRadius: 12,
                background: selected ? t.accentFaint : t.bg2,
                border: `1px solid ${selected ? t.accent : t.glassBorder}`,
                color: t.text0, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                transition: 'all 140ms ease',
              }}>
              <span style={{ fontSize: 26 }}>{o.flag}</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{o.label}</span>
              {selected && (
                <span style={{ color: t.accent, display: 'inline-flex' }}>
                  <IconCheck size={14}/>
                </span>
              )}
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
  const modes: { id: 'dark' | 'light' | 'system'; label: string }[] = [
    { id: 'dark',   label: tr('onboarding.appearance.dark') },
    { id: 'light',  label: tr('onboarding.appearance.light') },
    { id: 'system', label: tr('onboarding.appearance.system') },
  ];
  return (
    <StepShell
      icon={IconLayers}
      title={tr('onboarding.appearance.title')}
      sub={tr('onboarding.appearance.sub')}
    >
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        marginBottom: 22,
      }}>
        {modes.map((m) => {
          const selected = mode === m.id;
          return (
            <button key={m.id} type="button" onClick={() => setMode(m.id)}
              style={{
                padding: '12px 10px', borderRadius: 10,
                background: selected ? t.accentFaint : t.bg2,
                border: `1px solid ${selected ? t.accent : t.glassBorder}`,
                color: t.text0, cursor: 'pointer',
                fontSize: 13, fontWeight: 500,
              }}>
              {m.label}
            </button>
          );
        })}
      </div>
      <div style={{
        fontSize: 10.5, color: t.text2, textTransform: 'uppercase',
        letterSpacing: 0.5, fontWeight: 600, marginBottom: 10,
      }}>{tr('onboarding.appearance.accent')}</div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8,
      }}>
        {ACCENT_HUES.slice(0, 16).map((a) => {
          const selected = accentHue === a.hue;
          return (
            <button key={a.hue} type="button" onClick={() => setAccentHue(a.hue)}
              title={a.name}
              style={{
                padding: 6, borderRadius: 8, background: 'transparent',
                border: `1px solid ${selected ? t.accent : 'transparent'}`,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <span style={{
                width: 26, height: 26, borderRadius: '50%',
                background: `oklch(70% 0.13 ${a.hue})`,
                boxShadow: selected
                  ? `0 0 0 2px ${t.bg1}, 0 0 0 4px oklch(74% 0.13 ${a.hue})`
                  : '0 1px 3px rgba(0,0,0,0.2)',
              }}/>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

function StepClaude() {
  const t = useTokens();
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
      <div style={{
        padding: 14, borderRadius: 12,
        background: cliOk ? t.accentFaint : t.bg2,
        border: `1px solid ${cliOk ? t.accent : t.glassBorder}`,
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 8,
            background: cliOk ? t.accent : t.bg3,
            color: cliOk ? t.accentOn : t.text3,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconCheck size={14}/>
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text0 }}>
              {cliOk ? tr('onboarding.claude.cli.ok') : tr('onboarding.claude.cli.no')}
            </div>
            <div style={{ fontSize: 11.5, color: t.text2, marginTop: 2 }}>
              {cliOk
                ? tr('onboarding.claude.cli.ok_body')
                : status?.cliInstalled
                  ? tr('onboarding.claude.cli.installed_no_login')
                  : tr('onboarding.claude.cli.missing')}
            </div>
          </div>
        </div>
      </div>

      {/* API key fallback */}
      {!cliOk && (
        <div style={{
          padding: 14, borderRadius: 12,
          background: t.bg2,
          border: `1px solid ${hasKey ? t.accent : t.glassBorder}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text0, marginBottom: 4 }}>
            {tr('onboarding.claude.apikey.title')}
          </div>
          <div style={{ fontSize: 11.5, color: t.text2, marginBottom: 10, lineHeight: 1.5 }}>
            {tr('onboarding.claude.apikey.sub')}
          </div>
          {hasKey ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 8,
              background: t.accentFaint,
            }}>
              <span style={{ color: t.accent, display: 'inline-flex' }}><IconCheck size={14}/></span>
              <span style={{ fontFamily: t.fontMono, fontSize: 12, color: t.text1, flex: 1 }}>
                {apiKey.masked || '****'}
              </span>
              <button type="button" onClick={() => void apiKey.remove()}
                style={{ ...btnGhost(t), padding: '4px 10px', fontSize: 11 }}>
                {tr('onboarding.claude.apikey.replace')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8,
                  border: `1px solid ${t.glassBorder}`, background: t.bg1,
                  color: t.text0, fontFamily: t.fontMono, fontSize: 12,
                  outline: 'none',
                }}
              />
              <button type="button" onClick={() => void saveKey()}
                disabled={saving || !keyInput.trim()}
                style={{
                  ...btnPrimary(t),
                  opacity: saving || !keyInput.trim() ? 0.5 : 1,
                  cursor: saving || !keyInput.trim() ? 'default' : 'pointer',
                }}>
                {saving ? '…' : tr('onboarding.claude.apikey.save')}
              </button>
            </div>
          )}
          {err && (
            <div style={{ marginTop: 8, fontSize: 11, color: t.err }}>{err}</div>
          )}
        </div>
      )}
    </StepShell>
  );
}

function StepFolder() {
  const t = useTokens();
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
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10.5, color: t.text2, textTransform: 'uppercase',
            letterSpacing: 0.5, fontWeight: 600, marginBottom: 8,
          }}>{tr('onboarding.folder.current')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ws.list.workspaces.map((w) => (
              <div key={w} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8,
                background: t.bg2, border: `1px solid ${t.glassBorder}`,
              }}>
                <IconFolder size={13}/>
                <code style={{
                  flex: 1, minWidth: 0, fontFamily: t.fontMono, fontSize: 11.5, color: t.text1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{w}</code>
                {def.value === w && (
                  <span style={{
                    fontSize: 9.5, color: t.accent, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: 0.4,
                  }}>{tr('onboarding.folder.default')}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {hasPicker ? (
        <button type="button" onClick={() => void pick()} disabled={busy}
          style={{
            ...btnPrimary(t), width: '100%', padding: '12px',
            opacity: busy ? 0.6 : 1,
          }}>
          {busy ? '…' : tr('onboarding.folder.pick')}
        </button>
      ) : (
        <div style={{
          padding: 12, borderRadius: 10,
          background: t.bg2, border: `1px solid ${t.glassBorder}`,
          fontSize: 12, color: t.text2,
        }}>
          {tr('onboarding.folder.web_note')}
        </div>
      )}
      {err && (
        <div style={{ marginTop: 8, fontSize: 11, color: t.err }}>{err}</div>
      )}
    </StepShell>
  );
}

function StepObsidian() {
  const t = useTokens();
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
        <div style={{
          padding: 14, borderRadius: 12,
          background: t.accentFaint,
          border: `1px solid ${t.accent}`,
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8,
              background: t.accent, color: t.accentOn,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconCheck size={14}/>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text0 }}>
                {tr('onboarding.obsidian.connected')}
              </div>
              <code style={{
                display: 'block', fontFamily: t.fontMono, fontSize: 11.5, color: t.text2,
                marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{status.vaultPath}</code>
            </div>
            <button type="button" onClick={() => void disconnect()} disabled={busy}
              style={{
                padding: '6px 12px', borderRadius: 8,
                border: `1px solid ${t.glassBorder}`,
                background: 'transparent', color: t.text1,
                fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
              }}>
              {tr('onboarding.obsidian.disconnect')}
            </button>
          </div>
          {status.hasParaStructure && (
            <div style={{
              marginTop: 10, fontSize: 11, color: t.text2,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <IconCheck size={11}/>
              {tr('onboarding.obsidian.para_detected').replace('{n}', String(status.noteCount))}
            </div>
          )}
        </div>
      ) : (
        <>
          {vaults.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 10.5, color: t.text2, textTransform: 'uppercase',
                letterSpacing: 0.5, fontWeight: 600, marginBottom: 8,
              }}>{tr('onboarding.obsidian.detected')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {vaults.map((v) => (
                  <button key={v.id} type="button"
                    onClick={() => void connectVault(v.path)}
                    disabled={busy}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 9,
                      background: t.bg2, border: `1px solid ${t.glassBorder}`,
                      color: t.text0, cursor: busy ? 'default' : 'pointer',
                      textAlign: 'left', width: '100%',
                      opacity: busy ? 0.6 : 1,
                    }}>
                    <IconLayers size={14}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {v.name}
                        {v.open && (
                          <span style={{
                            marginLeft: 8, fontSize: 9.5, color: t.accent,
                            textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
                          }}>{tr('onboarding.obsidian.open')}</span>
                        )}
                      </div>
                      <code style={{
                        display: 'block', fontFamily: t.fontMono, fontSize: 10.5,
                        color: t.text3, marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{v.path}</code>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {hasPicker ? (
            <button type="button" onClick={() => void pickCustom()} disabled={busy}
              style={{
                ...btnGhost(t), width: '100%', padding: '12px',
                opacity: busy ? 0.6 : 1,
              }}>
              {vaults.length > 0 ? tr('onboarding.obsidian.pick_other') : tr('onboarding.obsidian.pick')}
            </button>
          ) : vaults.length === 0 && (
            <div style={{
              padding: 12, borderRadius: 10,
              background: t.bg2, border: `1px solid ${t.glassBorder}`,
              fontSize: 12, color: t.text2,
            }}>
              {tr('onboarding.obsidian.none')}
            </div>
          )}
        </>
      )}
      {err && (
        <div style={{ marginTop: 8, fontSize: 11, color: t.err }}>{err}</div>
      )}
      <div style={{
        marginTop: 14, fontSize: 11, color: t.text3, lineHeight: 1.5,
      }}>
        {tr('onboarding.obsidian.note')}
      </div>
    </StepShell>
  );
}

function StepVoice() {
  const t = useTokens();
  const tr = useT();
  const [autostart, setAutostartState] = useState<boolean>(() => {
    try { return window.localStorage.getItem(VOICE_AUTOSTART_KEY) !== '0'; } catch { return true; }
  });
  function toggle(v: boolean) {
    setAutostartState(v);
    try { window.localStorage.setItem(VOICE_AUTOSTART_KEY, v ? '1' : '0'); } catch { /* noop */ }
  }
  return (
    <StepShell
      icon={IconMic}
      title={tr('onboarding.voice.title')}
      sub={tr('onboarding.voice.sub')}
    >
      <div style={{
        padding: 16, borderRadius: 12,
        background: t.bg2, border: `1px solid ${t.glassBorder}`,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{
          width: 38, height: 38, borderRadius: 10,
          background: autostart ? t.accentFaint : t.bg3,
          color: autostart ? t.accent : t.text3,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconMic size={18}/>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text0 }}>
            {tr('onboarding.voice.autostart.title')}
          </div>
          <div style={{ fontSize: 11.5, color: t.text2, marginTop: 2, lineHeight: 1.45 }}>
            {tr('onboarding.voice.autostart.body')}
          </div>
        </div>
        <button type="button" onClick={() => toggle(!autostart)}
          style={{
            width: 44, height: 26, borderRadius: 999, border: 0,
            background: autostart ? t.accent : t.bg3,
            position: 'relative', cursor: 'pointer',
            transition: 'background 140ms ease',
          }}>
          <span style={{
            position: 'absolute', top: 3, left: autostart ? 21 : 3,
            width: 20, height: 20, borderRadius: '50%',
            background: '#fff',
            transition: 'left 140ms ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}/>
        </button>
      </div>
      <div style={{
        marginTop: 12, fontSize: 11, color: t.text3, lineHeight: 1.5,
      }}>
        {tr('onboarding.voice.note')}
      </div>
    </StepShell>
  );
}

function StepDone() {
  const t = useTokens();
  const tr = useT();
  const tips = useMemo(() => [
    tr('onboarding.done.tip.dashboard'),
    tr('onboarding.done.tip.voice'),
    tr('onboarding.done.tip.support'),
  ], [tr]);
  return (
    <div style={{ textAlign: 'center', padding: '12px 8px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 72, height: 72, borderRadius: '50%',
        background: t.accentFaint, color: t.accent, marginBottom: 18,
      }}>
        <IconCheck size={32}/>
      </div>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: t.text0, letterSpacing: -0.4 }}>
        {tr('onboarding.done.title')}
      </h2>
      <p style={{
        margin: '8px auto 22px', maxWidth: 400,
        fontSize: 13, color: t.text2, lineHeight: 1.6,
      }}>
        {tr('onboarding.done.body')}
      </p>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 360, margin: '0 auto', textAlign: 'left',
      }}>
        {tips.map((tip, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 14px', borderRadius: 10,
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              background: t.accent, color: t.accentOn,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600,
            }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 12.5, color: t.text1, lineHeight: 1.5 }}>{tip}</span>
          </div>
        ))}
      </div>
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
  const t = useTokens();
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
      }}>
        <span style={{
          width: 36, height: 36, borderRadius: 10,
          background: t.accentFaint, color: t.accent,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18}/>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: t.text0, letterSpacing: -0.3 }}>{title}</h3>
          <div style={{ fontSize: 12, color: t.text2, marginTop: 2, lineHeight: 1.5 }}>{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function btnPrimary(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    padding: '8px 18px', borderRadius: 9, border: 0,
    background: t.accent, color: t.accentOn,
    fontFamily: t.fontSans, fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  };
}

function btnGhost(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 9,
    border: `1px solid ${t.glassBorder}`,
    background: 'transparent', color: t.text1,
    fontFamily: t.fontSans, fontSize: 13, fontWeight: 500,
    cursor: 'pointer',
  };
}
