import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
import {
  IconUser, IconKey, IconCheck, IconArrowL,
} from '@/design/icons';
import type { AuthState, useAuth } from '@/hooks/useAuth';
import { useT } from '@/hooks/useI18n';

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
      background: t.windowBg, color: t.text0,
      overflow: 'hidden',
    }}>
      {/* Orbes animados de fondo */}
      <DriftingOrbs/>


      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2,
        width: 'min(380px, calc(100vw - 48px))',
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
        color: t.text3, fontSize: 10.5, fontFamily: t.fontMono,
        pointerEvents: 'none',
        display: 'flex', alignItems: 'baseline', gap: 6,
      }}>
        <span style={{ color: t.text2, fontWeight: 500 }}>eco</span>
        <span>v1.0.0</span>
      </div>
    </div>
  );
}

export function DriftingOrbs() {
  const t = useTokens();
  return (
    <>
      <style>{`
        @keyframes aurora-a {
          0%   { transform: translate(0, 0)   rotate(0deg)  scale(1); }
          25%  { transform: translate(8%, -6%) rotate(20deg) scale(1.1); }
          50%  { transform: translate(-5%, 10%) rotate(-15deg) scale(0.95); }
          75%  { transform: translate(12%, 4%) rotate(10deg) scale(1.05); }
          100% { transform: translate(0, 0)   rotate(0deg)  scale(1); }
        }
        @keyframes aurora-b {
          0%,100% { transform: translate(0, 0)   rotate(0deg)  scale(1); }
          33%  { transform: translate(-12%, 8%) rotate(-20deg) scale(1.08); }
          66%  { transform: translate(6%, -10%) rotate(15deg)  scale(0.92); }
        }
        @keyframes aurora-c {
          0%,100% { transform: translate(0, 0)   rotate(0deg)  scale(1); }
          50%   { transform: translate(8%, 12%) rotate(-10deg) scale(1.12); }
        }
        @keyframes aurora-shape-drift {
          0%,100% { transform: translate(0,0) rotate(0deg); opacity: 0.18; }
          50%   { transform: translate(20px, -30px) rotate(180deg); opacity: 0.32; }
        }
        @keyframes aurora-shape-pulse {
          0%,100% { transform: scale(1); opacity: 0.12; }
          50%   { transform: scale(1.15); opacity: 0.22; }
        }
        /* Scan line — barre la pantalla verticalmente con un haz de luz */
        @keyframes aurora-scan {
          0%   { transform: translateY(-30%); opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(130%); opacity: 0; }
        }
        /* Radar sweep — rota desde un punto */
        @keyframes aurora-radar {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        /* Grid breathe — pulso del patrón de grilla */
        @keyframes aurora-grid {
          0%,100% { opacity: 0.05; }
          50%   { opacity: 0.12; }
        }
        /* Glitch — desfase sutil ocasional */
        @keyframes aurora-glitch {
          0%, 92%, 100% { opacity: 0; transform: translateX(0); }
          93% { opacity: 0.5; transform: translateX(-2px); }
          94% { opacity: 0.4; transform: translateX(3px); }
          95% { opacity: 0; transform: translateX(0); }
        }
        /* HUD brackets — escala/respira en los corners */
        @keyframes aurora-hud {
          0%,100% { opacity: 0.4; transform: scale(1); }
          50%   { opacity: 0.7; transform: scale(1.03); }
        }
        /* Pulso del halo accent del form */
        @keyframes aurora-halo {
          0%,100% { box-shadow: 0 0 80px 20px color-mix(in oklch, var(--eco-accent) 14%, transparent); }
          50%   { box-shadow: 0 0 120px 30px color-mix(in oklch, var(--eco-accent) 22%, transparent); }
        }
        /* Twinkle de partículas */
        @keyframes aurora-twinkle {
          0%,100% { opacity: 0.2; transform: scale(1); }
          50%   { opacity: 0.9; transform: scale(1.4); }
        }
      `}</style>

      {/* Aurora wave 1 — accent del tema (mint/eco). animationDelay negativo
          arranca la animación a mitad de ciclo: el usuario nunca ve el
          "estado inicial" estático esperando que la animación arranque. */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-10%',
        width: '70%', height: '70%',
        background: `radial-gradient(ellipse at center,
          color-mix(in oklch, ${t.accent} 26%, transparent) 0%,
          color-mix(in oklch, ${t.accent} 10%, transparent) 40%,
          transparent 70%)`,
        filter: 'blur(60px)',
        animation: 'aurora-a 18s ease-in-out infinite',
        animationDelay: '-5s',
        pointerEvents: 'none', zIndex: 1,
        mixBlendMode: 'screen',
      }}/>

      {/* Aurora wave 2 — púrpura/violeta */}
      <div style={{
        position: 'absolute', bottom: '-10%', right: '-15%',
        width: '75%', height: '75%',
        background: `radial-gradient(ellipse at center,
          oklch(70% 0.18 290 / 0.22) 0%,
          oklch(70% 0.18 290 / 0.08) 40%,
          transparent 70%)`,
        filter: 'blur(70px)',
        animation: 'aurora-b 22s ease-in-out infinite',
        animationDelay: '-11s',
        pointerEvents: 'none', zIndex: 1,
        mixBlendMode: 'screen',
      }}/>

      {/* Aurora wave 3 — cian eléctrico */}
      <div style={{
        position: 'absolute', top: '30%', left: '40%',
        width: '60%', height: '60%',
        background: `radial-gradient(ellipse at center,
          oklch(78% 0.15 220 / 0.18) 0%,
          oklch(78% 0.15 220 / 0.06) 40%,
          transparent 70%)`,
        filter: 'blur(65px)',
        animation: 'aurora-c 26s ease-in-out infinite',
        animationDelay: '-8s',
        pointerEvents: 'none', zIndex: 1,
        mixBlendMode: 'screen',
      }}/>

      {/* Cyber grid — patrón de grilla técnica que respira sutil */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(to right, color-mix(in oklch, ${t.accent} 30%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in oklch, ${t.accent} 30%, transparent) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        animation: 'aurora-grid 8s ease-in-out infinite',
        animationDelay: '-4s',
        maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        pointerEvents: 'none', zIndex: 1,
      }}/>

      {/* Scan line — barrido horizontal lento con haz accent */}
      <div style={{
        position: 'absolute', inset: '0 0 auto 0',
        height: 220, top: 0,
        background: `linear-gradient(to bottom,
          transparent 0%,
          color-mix(in oklch, ${t.accent} 8%, transparent) 50%,
          transparent 100%)`,
        filter: 'blur(20px)',
        animation: 'aurora-scan 10s ease-in-out infinite',
        animationDelay: '-3s',
        pointerEvents: 'none', zIndex: 1,
        mixBlendMode: 'screen',
      }}/>

      {/* Radar sweep desde la esquina superior derecha */}
      <div style={{
        position: 'absolute', top: '-30%', right: '-30%',
        width: '80vmin', height: '80vmin',
        background: `conic-gradient(from 0deg,
          transparent 0deg,
          color-mix(in oklch, ${t.accent} 10%, transparent) 30deg,
          transparent 60deg,
          transparent 360deg)`,
        animation: 'aurora-radar 18s linear infinite',
        animationDelay: '-7s',
        pointerEvents: 'none', zIndex: 1,
        opacity: 0.7,
        mixBlendMode: 'screen',
      }}/>


      {/* Shapes geométricos sutiles — círculos outline drifting */}
      <svg style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 1,
      }}>
        <defs>
          <linearGradient id="aurora-ring-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"  stopColor="oklch(82% 0.14 170)" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="oklch(68% 0.13 158)" stopOpacity="0.2"/>
          </linearGradient>
          <linearGradient id="aurora-ring-b" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"  stopColor="oklch(72% 0.16 290)" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="oklch(78% 0.15 220)" stopOpacity="0.15"/>
          </linearGradient>
        </defs>
        {/* Ring grande arriba-derecha */}
        <g style={{ transformOrigin: '78% 22%', animation: 'aurora-shape-drift 24s ease-in-out infinite' }}>
          <circle cx="78%" cy="22%" r="180" fill="none" stroke="url(#aurora-ring-a)" strokeWidth="1"/>
          <circle cx="78%" cy="22%" r="120" fill="none" stroke="url(#aurora-ring-a)" strokeWidth="1" strokeDasharray="4 8"/>
        </g>
        {/* Ring chico abajo-izquierda */}
        <g style={{ transformOrigin: '18% 78%', animation: 'aurora-shape-drift 30s ease-in-out infinite reverse' }}>
          <circle cx="18%" cy="78%" r="140" fill="none" stroke="url(#aurora-ring-b)" strokeWidth="1"/>
          <circle cx="18%" cy="78%" r="80" fill="none" stroke="url(#aurora-ring-b)" strokeWidth="1" strokeDasharray="2 10"/>
        </g>
        {/* Triangle/diamond pulsante centro-derecha */}
        <g style={{ transformOrigin: '88% 55%', animation: 'aurora-shape-pulse 12s ease-in-out infinite' }}>
          <polygon points="88%,45% 95%,55% 88%,65% 81%,55%"
            fill="none" stroke="url(#aurora-ring-a)" strokeWidth="1"/>
        </g>
        {/* Dots flotando — partículas tipo estrellas con twinkle */}
        {[
          { cx: '12%', cy: '15%', r: 2,   delay: 0,   color: t.accent },
          { cx: '30%', cy: '85%', r: 1.5, delay: 2.1, color: 'oklch(78% 0.15 220)' },
          { cx: '52%', cy: '12%', r: 2.5, delay: 4,   color: t.accent },
          { cx: '68%', cy: '88%', r: 1.5, delay: 1.3, color: 'oklch(72% 0.16 290)' },
          { cx: '90%', cy: '8%',  r: 2,   delay: 3.2, color: t.accent },
          { cx: '8%',  cy: '50%', r: 1.5, delay: 5,   color: 'oklch(78% 0.15 220)' },
          { cx: '38%', cy: '38%', r: 1,   delay: 6.4, color: t.accent },
          { cx: '62%', cy: '62%', r: 1.5, delay: 0.8, color: 'oklch(72% 0.16 290)' },
          { cx: '82%', cy: '38%', r: 1,   delay: 2.8, color: t.accent },
          { cx: '20%', cy: '32%', r: 1.5, delay: 4.5, color: 'oklch(78% 0.15 220)' },
          { cx: '76%', cy: '72%', r: 2,   delay: 3.7, color: t.accent },
          { cx: '44%', cy: '76%', r: 1,   delay: 1.9, color: 'oklch(72% 0.16 290)' },
        ].map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={p.r}
            fill={p.color}
            style={{
              filter: `drop-shadow(0 0 4px ${p.color})`,
              opacity: 0.5,
              animation: `aurora-twinkle ${5 + (i % 4)}s ease-in-out infinite`,
              animationDelay: `${p.delay}s`,
            }}/>
        ))}

        {/* Líneas que cruzan, tipo "data flow" — appearing/disappearing */}
        {[
          { x1: '0%', y1: '25%', x2: '40%', y2: '20%', dur: 14, delay: 0 },
          { x1: '100%', y1: '60%', x2: '60%', y2: '70%', dur: 16, delay: 3 },
          { x1: '20%', y1: '95%', x2: '50%', y2: '85%', dur: 18, delay: 6 },
        ].map((l, i) => (
          <line key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="url(#aurora-ring-a)" strokeWidth="1" strokeDasharray="2 4"
            style={{
              opacity: 0.3,
              animation: `aurora-shape-pulse ${l.dur}s ease-in-out infinite`,
              animationDelay: `${l.delay}s`,
            }}/>
        ))}
      </svg>

      {/* Grain sutil para textura — patrón SVG noise repeating */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        opacity: 0.04,
        pointerEvents: 'none', zIndex: 1,
        mixBlendMode: 'overlay',
      }}/>
    </>
  );
}

// ─────────────────────────── Vistas (email + contraseña)

function AuthCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <div style={{
      position: 'relative', zIndex: 2,
      background: t.glassBg,
      border: `1px solid ${t.glassBorder}`,
      borderRadius: 20,
      padding: '28px 24px',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      animation: 'aurora-halo 6s ease-in-out infinite',
    }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: t.text0, letterSpacing: -0.3 }}>{title}</h1>
      {sub && <p style={{ margin: '6px 0 18px', fontSize: 13, color: t.text2, lineHeight: 1.5 }}>{sub}</p>}
      {!sub && <div style={{ height: 14 }} />}
      {children}
    </div>
  );
}

function linkStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
    color: t.accent, fontFamily: t.fontSans, fontSize: 11.5,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.text1, fontSize: 13, margin: '4px 0 14px' }}>
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
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>{children}</div>;
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
      marginTop: 14, display: 'flex', alignItems: 'center', gap: 6,
      color: t.text2, fontSize: 11.5, justifyContent: 'center', textAlign: 'center',
      lineHeight: 1.5,
    }}>{children}</div>
  );
}

