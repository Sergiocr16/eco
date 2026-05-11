import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn, Glass } from '@/design/primitives';
import { IconLock, IconUser, IconShield, IconKey, IconCheck, IconArrowL } from '@/design/icons';
import { EcoMark } from '@/design/EcoMark';
import type { AuthState, useAuth } from '@/hooks/useAuth';

type AuthHook = ReturnType<typeof useAuth>;

type Props = {
  authState: AuthState;
  authActions: AuthHook;
};

type View = 'register' | 'login' | 'recover' | 'show_recovery';

export function AuthScreen({ authState, authActions }: Props) {
  const t = useTokens();
  const [view, setView] = useState<View>(authState.status === 'no_user' ? 'register' : 'login');
  const [recoveryToShow, setRecoveryToShow] = useState<string | null>(null);

  // Reset view cuando status cambia
  useEffect(() => {
    if (authState.status === 'no_user') setView('register');
    if (authState.status === 'needs_login') setView((v) => v === 'recover' ? 'recover' : 'login');
  }, [authState.status]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: t.windowBg, color: t.text0,
    }}>
      {/* Decorativos */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(60% 40% at 50% 30%, ${t.accentFaint}, transparent 70%),
          radial-gradient(40% 30% at 80% 80%, color-mix(in oklch, ${t.accent} 8%, transparent), transparent 70%)
        `,
      }}/>

      <div style={{
        position: 'relative', width: 'min(440px, 100%)', padding: 32, textAlign: 'center',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <EcoMark size={68}/>
        </div>

        {recoveryToShow ? (
          <ShowRecoveryView
            phrase={recoveryToShow}
            onConfirm={() => setRecoveryToShow(null)}
            isReset={view === 'recover'}
          />
        ) : view === 'register' ? (
          <RegisterView
            authActions={authActions}
            onSuccess={(phrase) => { setRecoveryToShow(phrase); setView('show_recovery'); }}
          />
        ) : view === 'login' ? (
          <LoginView
            username={authState.username ?? 'tu cuenta'}
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

      <div style={{
        position: 'absolute', bottom: 18, left: 0, right: 0, textAlign: 'center',
        color: t.text3, fontSize: 11, fontFamily: t.fontMono,
      }}>
        Eco · v0.1 · todo local en tu Mac
      </div>
    </div>
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
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!username.trim()) return setError('Poné un nombre');
    if (!/^\d{4,8}$/.test(pin)) return setError('PIN: 4 a 8 dígitos');
    if (pin !== pin2) return setError('Los PIN no coinciden');
    setBusy(true);
    const r = await authActions.register({ username: username.trim(), pin });
    setBusy(false);
    if (r.ok) onSuccess(r.recoveryPhrase);
    else setError(r.error);
  }

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: t.text0, letterSpacing: -0.5 }}>
        Bienvenido a Eco
      </h1>
      <p style={{ margin: '6px 0 24px', color: t.text2, fontSize: 13 }}>
        Creá tu cuenta local. El PIN se queda en este Mac.
      </p>

      <FieldGroup>
        <FormInput
          icon={IconUser}
          value={username}
          onChange={setUsername}
          placeholder="Tu nombre"
          autoFocus
        />
        <FormInput
          icon={IconLock}
          type="password"
          value={pin}
          onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))}
          placeholder="PIN (4-8 dígitos)"
          inputMode="numeric"
        />
        <FormInput
          icon={IconLock}
          type="password"
          value={pin2}
          onChange={(v) => setPin2(v.replace(/\D/g, '').slice(0, 8))}
          placeholder="Repetí el PIN"
          inputMode="numeric"
          onEnter={submit}
        />
      </FieldGroup>

      {error && <FormError>{error}</FormError>}

      <Btn kind="primary" size="lg" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
        {busy ? 'Creando…' : 'Crear cuenta'}
      </Btn>

      <FooterNote>
        <IconShield size={11} style={{ marginRight: 4 }}/>
        Vas a recibir una frase de 12 palabras para recuperar el PIN si lo olvidás.
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

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: t.text0, letterSpacing: -0.5 }}>
        Hola, {username}
      </h1>
      <p style={{ margin: '6px 0 24px', color: t.text2, fontSize: 13 }}>
        Ingresá tu PIN para abrir Eco
      </p>

      <FieldGroup>
        <FormInput
          icon={IconLock}
          type="password"
          value={pin}
          onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))}
          placeholder="PIN"
          inputMode="numeric"
          autoFocus
          onEnter={submit}
        />
      </FieldGroup>

      {error && <FormError>{error}</FormError>}

      <Btn kind="primary" size="lg" onClick={submit} disabled={busy || !pin} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
        {busy ? 'Verificando…' : 'Entrar'}
      </Btn>

      <button
        type="button"
        onClick={onRecover}
        style={{
          marginTop: 14, background: 'transparent', border: 0, color: t.text2,
          fontFamily: t.fontSans, fontSize: 12, cursor: 'pointer',
        }}>
        ¿Olvidaste el PIN? Recuperar con tu frase
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
  const [phrase, setPhrase] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (phrase.trim().split(/\s+/).length !== 12) return setError('La frase tiene que ser de 12 palabras');
    if (!/^\d{4,8}$/.test(newPin)) return setError('PIN: 4 a 8 dígitos');
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
          position: 'absolute', top: 24, left: 24,
          width: 32, height: 32, borderRadius: 8, border: 0,
          background: t.bg3, color: t.text1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Volver"
      >
        <IconArrowL size={14}/>
      </button>

      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: t.text0, letterSpacing: -0.5 }}>
        Recuperar acceso
      </h1>
      <p style={{ margin: '6px 0 24px', color: t.text2, fontSize: 13, lineHeight: 1.5 }}>
        Pegá tu frase de 12 palabras y elegí un nuevo PIN. Se te dará una frase nueva.
      </p>

      <FieldGroup>
        <Glass radius={14} style={{ padding: 0 }}>
          <textarea
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="palabra1 palabra2 palabra3 …"
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
        <FormInput
          icon={IconLock}
          type="password"
          value={newPin}
          onChange={(v) => setNewPin(v.replace(/\D/g, '').slice(0, 8))}
          placeholder="Nuevo PIN (4-8 dígitos)"
          inputMode="numeric"
          onEnter={submit}
        />
      </FieldGroup>

      {error && <FormError>{error}</FormError>}

      <Btn kind="primary" size="lg" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
        {busy ? 'Validando…' : 'Recuperar'}
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
  const [confirmed, setConfirmed] = useState(false);
  const words = phrase.split(/\s+/);
  const copyRef = useRef<HTMLButtonElement>(null);

  async function copy() {
    try { await navigator.clipboard.writeText(phrase); } catch { /* noop */ }
    if (copyRef.current) {
      const old = copyRef.current.innerText;
      copyRef.current.innerText = '✓ Copiado';
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
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: t.text0, letterSpacing: -0.4 }}>
        {isReset ? 'Nueva frase de recuperación' : 'Guardá tu frase de recuperación'}
      </h1>
      <p style={{ margin: '8px 0 20px', color: t.text2, fontSize: 13, lineHeight: 1.5 }}>
        Si olvidás el PIN, esta frase es la única forma de recuperar acceso.
        <br/>Anotala en papel o guardala en un gestor seguro.
        <strong style={{ color: t.warn }}> No se mostrará de nuevo.</strong>
      </p>

      <Glass radius={16} style={{ padding: 16, marginBottom: 16 }}>
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

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          ref={copyRef}
          type="button"
          onClick={copy}
          style={{
            flex: 1, height: 36, borderRadius: 10, border: `1px solid ${t.glassBorder}`,
            background: t.bg3, color: t.text1, fontSize: 13, fontFamily: t.fontSans,
            cursor: 'pointer',
          }}>
          Copiar al portapapeles
        </button>
      </div>

      <label style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 10,
        background: confirmed ? t.accentFaint : t.bg2,
        border: `1px solid ${confirmed ? t.accentDim : t.glassBorder}`,
        cursor: 'pointer', fontSize: 12.5, color: t.text1,
        textAlign: 'left', marginBottom: 14,
      }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          style={{ accentColor: t.accent }}
        />
        Guardé la frase en un lugar seguro
      </label>

      <Btn
        kind="primary"
        size="lg"
        onClick={onConfirm}
        disabled={!confirmed}
        style={{ width: '100%', justifyContent: 'center' }}
        icon={IconCheck}
      >
        Entrar a Eco
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
  return (
    <Glass radius={14} style={{ padding: 4, display: 'flex', alignItems: 'center' }}>
      <div style={{ padding: '0 10px', color: t.text2 }}>
        <Icon size={16}/>
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={inputMode}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
        style={{
          flex: 1, background: 'transparent', border: 0, outline: 'none',
          fontFamily: t.fontSans, fontSize: 13.5, color: t.text0,
          padding: '12px 6px',
        }}
      />
    </Glass>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return (
    <div style={{
      marginTop: -4, marginBottom: 8, fontSize: 12, color: t.err,
      padding: '6px 8px', textAlign: 'left',
    }}>{children}</div>
  );
}

function FooterNote({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return (
    <div style={{
      marginTop: 16, display: 'flex', alignItems: 'center', gap: 6,
      color: t.text2, fontSize: 12, justifyContent: 'center', textAlign: 'center',
    }}>{children}</div>
  );
}
