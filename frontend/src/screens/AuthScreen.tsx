import { useState } from 'react';
import { Btn } from '@/design/primitives';
import { EcoGlyph } from '@/design/EcoMark';
import {
  IconUser, IconKey, IconCheck, IconArrowL,
} from '@/design/icons';
import type { AuthState, useAuth } from '@/hooks/useAuth';
import { useT } from '@/hooks/useI18n';
import { getTopInset, SAFE_TOP, SAFE_BOTTOM } from '@/lib/platform';
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
  const [view, setView] = useState<View>('login');

  return (
    <div className="eco-app" style={{
      position: 'fixed', inset: 0, zIndex: 1, background: 'var(--bg)', overflow: 'auto',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: `calc(${getTopInset() + 24}px + ${SAFE_TOP}) 24px calc(24px + ${SAFE_BOTTOM})`,
    }}>
      <div className="eco-hstack" style={{ alignSelf: 'flex-start' }}>
        <EcoGlyph size={30}/>
        <span style={{ fontSize: 16, fontWeight: 600 }}>eco</span>
      </div>

      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {view === 'reset' ? (
            <ResetView authActions={authActions} onBack={() => setView('login')} />
          ) : (
            <LoginView authActions={authActions} onReset={() => setView('reset')} />
          )}
          {authState.error && view === 'login' ? <FormError>{authState.error}</FormError> : null}
        </div>
      </div>

      {/* eco · version — abajo a la derecha, discreto */}
      <div className="eco-num eco-hstack" style={{ alignSelf: 'flex-end', gap: 6, pointerEvents: 'none' }}>
        <span className="eco-muted">eco</span>
        <span>v1.0.0</span>
      </div>
    </div>
  );
}

// ─────────────────────────── Vistas (email + contraseña)

function AuthCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="eco-pane" style={{ padding: '32px 28px 20px', borderRadius: 28, background: 'var(--sheet)' }}>
      <h1 className="eco-title eco-title--md">{title}</h1>
      {sub && <p className="eco-muted" style={{ margin: '8px 0 22px', lineHeight: 1.5 }}>{sub}</p>}
      {!sub && <div style={{ height: 18 }} />}
      {children}
    </div>
  );
}

function LoginView({ authActions, onReset }: {
  authActions: AuthHook; onReset: () => void;
}) {
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
      <Btn kind="primary" size="lg" onClick={submit} disabled={busy} className="eco-btn--block">
        {busy ? tr('auth.btn.enter_loading') : tr('auth.btn.enter')}
      </Btn>
      <FooterNote>
        <Btn kind="ghost" size="sm" onClick={onReset}>{tr('auth.login.forgot')}</Btn>
      </FooterNote>
    </AuthCard>
  );
}

function ResetView({ authActions, onBack }: { authActions: AuthHook; onBack: () => void }) {
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
        <div className="eco-banner eco-banner--ok">
          <IconCheck size={16} /> {tr('auth.reset.sent')}
        </div>
      ) : (
        <>
          <FieldGroup>
            <FormInput icon={IconUser} value={email} onChange={setEmail} placeholder={tr('auth.field.email')} autoFocus onEnter={submit} />
          </FieldGroup>
          {err && <FormError>{err}</FormError>}
          <Btn kind="primary" size="lg" onClick={submit} disabled={busy} className="eco-btn--block">
            {busy ? tr('auth.reset.btn_loading') : tr('auth.reset.btn')}
          </Btn>
        </>
      )}
      <FooterNote>
        <Btn kind="ghost" size="sm" icon={IconArrowL} onClick={onBack}>{tr('auth.back')}</Btn>
      </FooterNote>
    </AuthCard>
  );
}

// ─────────────────────────── Helpers de form

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="eco-vstack" style={{ gap: 8, marginBottom: 12 }}>{children}</div>;
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
  return (
    <label className="eco-inputbar eco-inputbar--on-sheet">
      <Icon size={16}/>
      <input
        className="eco-input-bare"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
      />
    </label>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  return <div className="eco-banner eco-banner--err" style={{ margin: '4px 0 12px' }}>{children}</div>;
}

function FooterNote({ children }: { children: React.ReactNode }) {
  return <div className="eco-hstack" style={{ justifyContent: 'center', marginTop: 10 }}>{children}</div>;
}
