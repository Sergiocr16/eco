import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn, Glass } from '@/design/primitives';
import {
  IconUser, IconShield, IconKey, IconCheck, IconArrowL,
} from '@/design/icons';
import { EcoMark } from '@/design/EcoMark';
import type { AuthState, useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useT } from '@/hooks/useI18n';

type AuthHook = ReturnType<typeof useAuth>;

type Props = {
  authState: AuthState;
  authActions: AuthHook;
};

type View = 'register' | 'login' | 'recover' | 'show_recovery';

export function AuthScreen({ authState, authActions }: Props) {
  const t = useTokens();
  const tr = useT();
  const [view, setView] = useState<View>(authState.status === 'no_user' ? 'register' : 'login');
  const [recoveryToShow, setRecoveryToShow] = useState<string | null>(null);

  useEffect(() => {
    if (authState.status === 'no_user') setView('register');
    if (authState.status === 'needs_login') setView((v) => v === 'recover' ? 'recover' : 'login');
  }, [authState.status]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: t.windowBg, color: t.text0,
      overflow: 'hidden',
    }}>
      {/* Orbes animados de fondo */}
      <DriftingOrbs/>

      <div style={{
        position: 'relative', zIndex: 2,
        width: 'min(380px, calc(100vw - 48px))',
        padding: '24px 4px',
      }}>
        {/* Logo grande centrado */}
        <div style={{
          display: 'flex', justifyContent: 'center', marginBottom: 26,
        }}>
          <EcoMark size={64}/>
        </div>

        <div style={{ position: 'relative' }}>
          {recoveryToShow ? (
            <ShowRecoveryView
              phrase={recoveryToShow}
              onConfirm={() => {
                setRecoveryToShow(null);
                void authActions.refresh();
              }}
              isReset={view === 'recover'}
            />
          ) : view === 'register' ? (
            <RegisterView
              authActions={authActions}
              onSuccess={(phrase) => { setRecoveryToShow(phrase); setView('show_recovery'); }}
            />
          ) : view === 'login' ? (
            <LoginView
              username={authState.username ?? tr('auth.your_account')}
              authActions={authActions}
              onRecover={() => setView('recover')}
            />
          ) : (
            <RecoverView
              authActions={authActions}
              onBack={() => setView('login')}
              onSuccess={(phrase) => { setRecoveryToShow(phrase); }}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute', bottom: 18, left: 0, right: 0,
        textAlign: 'center', zIndex: 2,
        color: t.text3, fontSize: 11, fontFamily: t.fontMono,
      }}>
        {tr('auth.local_tagline')}
      </div>
    </div>
  );
}

function DriftingOrbs() {
  const t = useTokens();
  return (
    <>
      <style>{`
        @keyframes eco-orb-1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,-20px) scale(1.08); } }
        @keyframes eco-orb-2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-30px,30px) scale(1.05); } }
        @keyframes eco-orb-3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,40px) scale(1.1); } }
      `}</style>
      <div style={{
        position: 'absolute', top: '10%', left: '15%',
        width: 420, height: 420, borderRadius: '50%',
        background: `radial-gradient(circle, ${t.accentFaint} 0%, transparent 60%)`,
        filter: 'blur(40px)',
        animation: 'eco-orb-1 14s ease-in-out infinite',
        pointerEvents: 'none', zIndex: 1,
      }}/>
      <div style={{
        position: 'absolute', bottom: '8%', left: '30%',
        width: 320, height: 320, borderRadius: '50%',
        background: `radial-gradient(circle, color-mix(in oklch, ${t.accent} 10%, transparent) 0%, transparent 60%)`,
        filter: 'blur(50px)',
        animation: 'eco-orb-2 18s ease-in-out infinite',
        pointerEvents: 'none', zIndex: 1,
      }}/>
      <div style={{
        position: 'absolute', top: '20%', right: '8%',
        width: 360, height: 360, borderRadius: '50%',
        background: `radial-gradient(circle, color-mix(in oklch, ${t.accent} 8%, transparent) 0%, transparent 65%)`,
        filter: 'blur(50px)',
        animation: 'eco-orb-3 22s ease-in-out infinite',
        pointerEvents: 'none', zIndex: 1,
      }}/>
    </>
  );
}

// ─────────────────────────── Register

function RegisterView({
  authActions, onSuccess,
}: {
  authActions: AuthHook;
  onSuccess: (recoveryPhrase: string) => void;
}) {
  const t = useTokens();
  const tr = useT();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!username.trim()) return setError(tr('auth.err.name_empty'));
    if (!/^\d{4,8}$/.test(pin)) return setError(tr('auth.err.pin_format'));
    if (pin !== pin2) return setError(tr('auth.err.pin_mismatch'));
    setBusy(true);
    const r = await authActions.register({ username: username.trim(), pin });
    setBusy(false);
    if (r.ok) onSuccess(r.recoveryPhrase);
    else setError(r.error);
  }

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: t.text0, letterSpacing: -0.4, textAlign: 'center' }}>
        {tr('auth.welcome.title')}
      </h1>
      <p style={{ margin: '6px 0 22px', color: t.text2, fontSize: 12.5, textAlign: 'center', lineHeight: 1.5 }}>
        {tr('auth.welcome.sub')}
      </p>

      <FieldGroup>
        <FormInput
          icon={IconUser}
          value={username}
          onChange={setUsername}
          placeholder={tr('auth.field.username')}
          autoFocus
        />
        <PinSegmented
          label={tr('auth.field.pin')}
          value={pin}
          onChange={setPin}
          length={8}
        />
        <PinSegmented
          label={tr('auth.field.pin_repeat')}
          value={pin2}
          onChange={setPin2}
          length={8}
          onEnter={submit}
        />
      </FieldGroup>

      {error && <FormError>{error}</FormError>}

      <Btn kind="primary" size="lg" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
        {busy ? tr('auth.btn.create_loading') : tr('auth.btn.create')}
      </Btn>

      <FooterNote>
        <IconShield size={11} style={{ marginRight: 4 }}/>
        {tr('auth.footer.recovery_hint')}
      </FooterNote>
    </>
  );
}

// ─────────────────────────── Login

function LoginView({
  username, authActions, onRecover,
}: {
  username: string;
  authActions: AuthHook;
  onRecover: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!pin) return;
    setBusy(true);
    const r = await authActions.login({ pin });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setPin('');
    }
  }

  // Avatar: foto de perfil del usuario si existe, sino inicial.
  const { photo } = useProfile();
  const initial = (username || 'E').trim().charAt(0).toUpperCase();

  return (
    <>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        marginBottom: 16,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: photo ? t.bg2 : t.accentFaint,
          color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, fontWeight: 600, fontFamily: t.fontSans,
          marginBottom: 12,
          border: `2px solid ${t.accent}`,
          overflow: 'hidden',
          boxShadow: `0 6px 24px color-mix(in oklch, ${t.accent} 18%, transparent)`,
        }}>
          {photo
            ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            : initial}
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: t.text0, letterSpacing: -0.4 }}>
          {tr('auth.greeting', { name: username })}
        </h1>
        <p style={{ margin: '4px 0 0', color: t.text2, fontSize: 12.5, lineHeight: 1.5, textAlign: 'center' }}>
          {tr('auth.login.sub')}
        </p>
      </div>

      <PinSegmented
        value={pin}
        onChange={setPin}
        length={8}
        autoFocus
        onEnter={submit}
        label={tr('auth.field.pin_simple')}
      />

      {error && <FormError>{error}</FormError>}

      <Btn kind="primary" size="lg" onClick={submit} disabled={busy || pin.length < 4} style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}>
        {busy ? tr('auth.btn.enter_loading') : tr('auth.btn.enter')}
      </Btn>

      <button
        type="button"
        onClick={onRecover}
        style={{
          marginTop: 16, background: 'transparent', border: 0, color: t.text2,
          fontFamily: t.fontSans, fontSize: 12, cursor: 'pointer',
          display: 'block', marginInline: 'auto',
        }}>
        {tr('auth.forgot_pin')}
      </button>
    </>
  );
}

// ─────────────────────────── Recover

function RecoverView({
  authActions, onBack, onSuccess,
}: {
  authActions: AuthHook;
  onBack: () => void;
  onSuccess: (newPhrase: string) => void;
}) {
  const t = useTokens();
  const tr = useT();
  const [phrase, setPhrase] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (phrase.trim().split(/\s+/).length !== 12) return setError(tr('auth.err.phrase_length'));
    if (!/^\d{4,8}$/.test(newPin)) return setError(tr('auth.err.pin_format'));
    setBusy(true);
    const r = await authActions.recover({ recoveryPhrase: phrase, newPin });
    setBusy(false);
    if (r.ok) onSuccess(r.newRecoveryPhrase);
    else setError(r.error);
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        style={{
          position: 'absolute', top: -6, left: -6,
          width: 32, height: 32, borderRadius: 8, border: 0,
          background: t.bg3, color: t.text1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title={tr('auth.back')}
      >
        <IconArrowL size={14}/>
      </button>

      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: t.text0, letterSpacing: -0.4, textAlign: 'center' }}>
        {tr('auth.recover.title')}
      </h1>
      <p style={{ margin: '6px 0 22px', color: t.text2, fontSize: 12.5, lineHeight: 1.5, textAlign: 'center' }}>
        {tr('auth.recover.sub')}
      </p>

      <FieldGroup>
        <Glass radius={14} style={{ padding: 0 }}>
          <textarea
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={tr('auth.phrase_placeholder')}
            rows={3}
            spellCheck={false}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'transparent', border: 0, outline: 'none', resize: 'none',
              fontFamily: t.fontMono, fontSize: 13, color: t.text0,
              padding: 14, lineHeight: 1.6,
            }}
          />
        </Glass>
        <PinSegmented
          value={newPin}
          onChange={setNewPin}
          length={8}
          onEnter={submit}
          label={tr('auth.field.pin_new')}
        />
      </FieldGroup>

      {error && <FormError>{error}</FormError>}

      <Btn kind="primary" size="lg" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
        {busy ? tr('auth.btn.recover_loading') : tr('auth.btn.recover')}
      </Btn>
    </>
  );
}

// ─────────────────────────── Recovery phrase display

function ShowRecoveryView({
  phrase, onConfirm, isReset,
}: {
  phrase: string;
  onConfirm: () => void;
  isReset: boolean;
}) {
  const t = useTokens();
  const tr = useT();
  const [confirmed, setConfirmed] = useState(false);
  const words = phrase.split(/\s+/);
  const copyRef = useRef<HTMLButtonElement>(null);

  async function copy() {
    try { await navigator.clipboard.writeText(phrase); } catch { /* noop */ }
    if (copyRef.current) {
      const old = copyRef.current.innerText;
      copyRef.current.innerText = tr('auth.recovery.copied');
      setTimeout(() => { if (copyRef.current) copyRef.current.innerText = old; }, 1200);
    }
  }

  return (
    <>
      <div style={{
        width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
        background: t.accentFaint, color: t.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <IconKey size={24}/>
      </div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: t.text0, letterSpacing: -0.4, textAlign: 'center' }}>
        {isReset ? tr('auth.recovery.title.reset') : tr('auth.recovery.title.new')}
      </h1>
      <p style={{ margin: '8px 0 18px', color: t.text2, fontSize: 13, lineHeight: 1.5, textAlign: 'center' }}>
        {tr('auth.recovery.warning')}{' '}
        <strong style={{ color: t.warn }}>{tr('auth.recovery.no_again')}</strong>
      </p>

      <Glass radius={16} style={{ padding: 14, marginBottom: 14 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
        }}>
          {words.map((w, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 10px', background: t.bg2, borderRadius: 8,
              fontFamily: t.fontMono, fontSize: 13, color: t.text0,
            }}>
              <span style={{ color: t.text3, fontSize: 10, minWidth: 16 }}>{i + 1}</span>
              {w}
            </div>
          ))}
        </div>
      </Glass>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          ref={copyRef}
          type="button"
          onClick={copy}
          style={{
            flex: 1, height: 36, borderRadius: 10, border: `1px solid ${t.glassBorder}`,
            background: t.bg3, color: t.text1, fontSize: 13, fontFamily: t.fontSans,
            cursor: 'pointer',
          }}>
          {tr('auth.recovery.copy')}
        </button>
      </div>

      <label style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 10,
        background: confirmed ? t.accentFaint : t.bg2,
        border: `1px solid ${confirmed ? t.accentDim : t.glassBorder}`,
        cursor: 'pointer', fontSize: 12.5, color: t.text1,
        textAlign: 'left', marginBottom: 12,
      }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          style={{ accentColor: t.accent }}
        />
        {tr('auth.recovery.confirmed')}
      </label>

      <Btn
        kind="primary"
        size="lg"
        onClick={onConfirm}
        disabled={!confirmed}
        style={{ width: '100%', justifyContent: 'center' }}
        icon={IconCheck}
      >
        {tr('auth.btn.enter_eco')}
      </Btn>
    </>
  );
}

// ─────────────────────────── pieces

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>{children}</div>;
}

function FormInput({
  icon: Icon, value, onChange, placeholder, type = 'text',
  inputMode, autoFocus, onEnter,
}: {
  icon: (p: { size?: number }) => JSX.Element;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: 'text' | 'password';
  inputMode?: 'numeric' | 'text';
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const t = useTokens();
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: 4,
      borderRadius: 14,
      background: t.bg2,
      border: `1px solid ${focused ? t.accent : t.glassBorder}`,
      transition: 'border-color 140ms',
    }}>
      <div style={{ padding: '0 10px', color: focused ? t.accent : t.text2 }}>
        <Icon size={16}/>
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={inputMode}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
        style={{
          flex: 1, background: 'transparent', border: 0, outline: 'none',
          fontFamily: t.fontSans, fontSize: 13.5, color: t.text0,
          padding: '12px 6px',
        }}
      />
    </div>
  );
}

// PIN input — un solo campo limpio, grande, centrado. Sin cuadritos.
// Muestra los dígitos como dots con tracking generoso para que se sienta tipo PIN.
function PinSegmented({
  value, onChange, length = 8, autoFocus, onEnter, label,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
  onEnter?: () => void;
  onComplete?: () => void;
  label?: string;
}) {
  const t = useTokens();
  const tr = useT();
  const [focused, setFocused] = useState(false);

  // Renderizamos los dots como contenido visual (tracking ancho) y mantenemos
  // el input nativo como type=password para que cuente como password manager
  // / autofill, pero con la fuente del display custom.
  return (
    <div>
      {label && (
        <div style={{
          fontSize: 11, color: t.text2, marginBottom: 8,
          textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
          textAlign: 'center',
        }}>{label}</div>
      )}
      <div style={{
        position: 'relative',
        borderRadius: 14,
        background: t.bg2,
        border: `1px solid ${focused ? t.accent : t.glassBorder}`,
        transition: 'border-color 140ms, box-shadow 140ms',
        boxShadow: focused ? `0 0 0 4px color-mix(in oklch, ${t.accent} 12%, transparent)` : 'none',
        overflow: 'hidden',
      }}>
        {/* Display de progreso — dots accent renderizados como divs, uno por dígito tipeado. */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10,
          pointerEvents: 'none',
        }}>
          {value.length === 0 && !focused && (
            <span style={{ color: t.text3, fontSize: 13, fontFamily: t.fontSans }}>
              {tr('auth.field.pin_simple')}
            </span>
          )}
          {Array.from({ length: value.length }, (_, i) => (
            <span key={i} style={{
              width: 12, height: 12, borderRadius: '50%',
              background: t.accent,
              boxShadow: `0 1px 4px color-mix(in oklch, ${t.accent} 50%, transparent)`,
            }}/>
          ))}
          {focused && value.length < length && (
            <span style={{
              width: 2, height: 22, background: t.accent,
              animation: 'eco-pulse 1.1s ease-in-out infinite',
              borderRadius: 1,
            }}/>
          )}
        </div>
        <input
          type="password"
          value={value}
          autoFocus={autoFocus}
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={length}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, length);
            onChange(v);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
          style={{
            width: '100%', boxSizing: 'border-box',
            height: 58, padding: 0,
            border: 0, outline: 'none', background: 'transparent',
            color: 'transparent', caretColor: 'transparent',
            textAlign: 'center',
            // Ocultamos el contenido del input pero seguimos capturando los keystrokes.
            fontSize: 1,
            cursor: 'text',
          }}
        />
      </div>
    </div>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return (
    <div style={{
      marginTop: -2, marginBottom: 8, fontSize: 12, color: t.err,
      padding: '8px 12px', textAlign: 'left',
      background: `color-mix(in oklch, ${t.err} 8%, transparent)`,
      border: `1px solid color-mix(in oklch, ${t.err} 30%, transparent)`,
      borderRadius: 8,
    }}>{children}</div>
  );
}

function FooterNote({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return (
    <div style={{
      marginTop: 14, display: 'flex', alignItems: 'center', gap: 6,
      color: t.text2, fontSize: 11.5, justifyContent: 'center', textAlign: 'center',
      lineHeight: 1.5,
    }}>{children}</div>
  );
}
