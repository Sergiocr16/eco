import { vw } from '@/lib/ui-zoom';
import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
import {
  IconUser, IconKey, IconCheck, IconArrowL,
} from '@/design/icons';
import type { AuthState, useAuth } from '@/hooks/useAuth';
import { useT } from '@/hooks/useI18n';
import type { JSX } from 'react';

type AuthHook = ReturnType<typeof useAuth>;

type Props = {
  authState: AuthState;
  authActions: AuthHook;
};

// Auto-registro cerrado: solo login + recuperar contraseña. El alta la hace el
// admin desde la consola (Opción B).
type View = 'login' | 'reset';

export function AuthScreen({ authState, authActions }: Props) {
  const t = useTokens();
  const [view, setView] = useState<View>('login');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1,
      background: t.windowBg, backgroundImage: t.windowBgImage, color: t.text0,
      overflow: 'hidden',
    }}>
      {/* Orbes animados de fondo */}


      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2,
        width: `min(380px, calc(${vw(100)} - 48px))`,
        padding: '24px 4px',
      }}>
        <div style={{ position: 'relative' }}>
          {view === 'reset' ? (
            <ResetView authActions={authActions} onBack={() => setView('login')} />
          ) : (
            <LoginView authActions={authActions} onReset={() => setView('reset')} />
          )}
          {authState.error && view === 'login' ? <FormError>{authState.error}</FormError> : null}
        </div>
      </div>

      {/* eco · version — abajo a la derecha, discreto */}
      <div style={{
        position: 'absolute', bottom: 14, right: 18,
        zIndex: 2,
        color: t.text3, fontSize: 11, fontFamily: t.fontMono,
        pointerEvents: 'none',
        display: 'flex', alignItems: 'baseline', gap: 6,
      }}>
        <span style={{ color: t.text2, fontWeight: 500 }}>eco</span>
        <span>v1.0.0</span>
      </div>
    </div>
  );
}

// ─────────────────────────── Vistas (email + contraseña)

function AuthCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <div style={{
      position: 'relative', zIndex: 2,
      background: t.bg1,
      border: `1px solid ${t.glassBorder}`,
      borderRadius: 16,
      padding: '28px 24px',
    }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: t.text0, letterSpacing: -0.3 }}>{title}</h1>
      {sub && <p style={{ margin: '6px 0 20px', fontSize: 13, color: t.text2, lineHeight: 1.5 }}>{sub}</p>}
      {!sub && <div style={{ height: 14 }} />}
      {children}
    </div>
  );
}

function linkStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
    color: t.accent, fontFamily: t.fontSans, fontSize: 12,
  };
}

function LoginView({ authActions, onReset }: {
  authActions: AuthHook; onReset: () => void;
}) {
  const t = useTokens();
  const tr = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    const r = await authActions.login({ email, password });
    if (!r.ok) { setErr(r.error); setBusy(false); }
    // si ok, onAuthStateChanged re-renderiza el árbol — no hace falta limpiar busy
  };

  return (
    <AuthCard title={tr('auth.login.title')} sub={tr('auth.login.sub')}>
      <FieldGroup>
        <FormInput icon={IconUser} value={email} onChange={setEmail} placeholder={tr('auth.field.email')} autoFocus onEnter={submit} />
        <FormInput icon={IconKey} value={password} onChange={setPassword} placeholder={tr('auth.field.password')} type="password" onEnter={submit} />
      </FieldGroup>
      {err && <FormError>{err}</FormError>}
      <Btn kind="primary" size="lg" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
        {busy ? tr('auth.btn.enter_loading') : tr('auth.btn.enter')}
      </Btn>
      <FooterNote>
        <button onClick={onReset} style={linkStyle(t)}>{tr('auth.login.forgot')}</button>
      </FooterNote>
    </AuthCard>
  );
}

function ResetView({ authActions, onBack }: { authActions: AuthHook; onBack: () => void }) {
  const t = useTokens();
  const tr = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    const r = await authActions.resetPassword(email);
    setBusy(false);
    if (r.ok) setSent(true); else setErr(r.error);
  };

  return (
    <AuthCard title={tr('auth.reset.title')} sub={tr('auth.reset.sub')}>
      {sent ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.text1, fontSize: 13, margin: '4px 0 16px' }}>
          <IconCheck size={16} /> {tr('auth.reset.sent')}
        </div>
      ) : (
        <>
          <FieldGroup>
            <FormInput icon={IconUser} value={email} onChange={setEmail} placeholder={tr('auth.field.email')} autoFocus onEnter={submit} />
          </FieldGroup>
          {err && <FormError>{err}</FormError>}
          <Btn kind="primary" size="lg" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? tr('auth.reset.btn_loading') : tr('auth.reset.btn')}
          </Btn>
        </>
      )}
      <FooterNote>
        <button onClick={onBack} style={linkStyle(t)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconArrowL size={12} /> {tr('auth.back')}</span>
        </button>
      </FooterNote>
    </AuthCard>
  );
}

// ─────────────────────────── Helpers de form

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>{children}</div>;
}

function FormInput({
  icon: Icon, value, onChange, placeholder, type = 'text', autoFocus, onEnter,
}: {
  icon: (p: { size?: number }) => JSX.Element;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: 'text' | 'password';
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const t = useTokens();
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: 4,
      borderRadius: 16,
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
        style={{
          flex: 1, background: 'transparent', border: 0, outline: 'none',
          fontFamily: t.fontSans, fontSize: 14, color: t.text0,
          padding: '12px 6px',
        }}
      />
    </div>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return (
    <div style={{
      marginTop: 12, marginBottom: 8, fontSize: 12, color: t.err,
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
      marginTop: 16, display: 'flex', alignItems: 'center', gap: 6,
      color: t.text2, fontSize: 12, justifyContent: 'center', textAlign: 'center',
      lineHeight: 1.5,
    }}>{children}</div>
  );
}

