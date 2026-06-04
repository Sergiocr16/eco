import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn, Glass } from '@/design/primitives';
import {
  IconUser, IconShield, IconKey, IconCheck, IconArrowL,
} from '@/design/icons';
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
        marginBottom: 30,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: photo ? t.bg2 : t.accentFaint,
          color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 600, fontFamily: t.fontSans,
          marginBottom: 26,
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
        <p style={{ margin: '6px 0 0', color: t.text2, fontSize: 12.5, lineHeight: 1.5, textAlign: 'center' }}>
          {tr('auth.login.sub')}
        </p>
      </div>

      <PinSegmented
        value={pin}
        onChange={setPin}
        length={8}
        autoFocus
        onEnter={submit}
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
        transition: 'border-color 140ms',
        overflow: 'hidden',
      }}>
        {/* Display de progreso — dots accent renderizados como divs, uno por
            dígito tipeado. Sin cursor pulsante ni halo de focus, solo dots. */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10,
          pointerEvents: 'none',
        }}>
          {value.length === 0 && (
            <span style={{
              color: t.text3, fontSize: 13, fontFamily: t.fontSans,
              fontWeight: 400, letterSpacing: 0.2,
            }}>
              {tr('auth.field.pin_simple')}
            </span>
          )}
          {Array.from({ length: value.length }, (_, i) => (
            <span key={i} style={{
              width: 11, height: 11, borderRadius: '50%',
              background: t.accent,
            }}/>
          ))}
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
