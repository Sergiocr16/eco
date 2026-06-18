import { useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
import { IconArrowL } from '@/design/icons';
import { useT } from '@/hooks/useI18n';
import { useProfile } from '@/hooks/useProfile';
import { DriftingOrbs } from './AuthScreen';

type Props = {
  mode: 'locked' | 'setup';
  username: string | null;
  onUnlock: (pin: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCreate: (pin: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onSkip: () => void;
  onSignOut: () => void;
};

const PIN_RE = /^\d{4,8}$/;

export function LockScreen({ mode, username, onUnlock, onCreate, onSkip, onSignOut }: Props) {
  const t = useTokens();
  const tr = useT();
  const profile = useProfile();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setErr(null);
    if (mode === 'setup') {
      if (!PIN_RE.test(pin)) { setErr(tr('lock.setup.short')); return; }
      if (pin !== confirm) { setErr(tr('lock.setup.mismatch')); return; }
      setBusy(true);
      const r = await onCreate(pin);
      if (!r.ok) { setErr(r.error); setBusy(false); }
    } else {
      if (!pin) return;
      setBusy(true);
      const r = await onUnlock(pin);
      if (!r.ok) { setErr(r.error); setPin(''); setBusy(false); }
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1, background: t.windowBg, color: t.text0, overflow: 'hidden' }}>
      <DriftingOrbs/>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 2, width: 'min(340px, calc(100vw - 48px))',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* Avatar del usuario (foto o inicial) */}
        <div style={{
          width: 84, height: 84, borderRadius: '50%', overflow: 'hidden',
          background: profile.photo ? t.bg2 : t.accent, color: t.accentOn,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 600, fontSize: 34, marginBottom: 16,
          boxShadow: `0 0 60px 10px color-mix(in oklch, ${t.accent} 22%, transparent)`,
          border: `1px solid ${t.glassBorder}`,
        }}>
          {profile.photo
            ? <img src={profile.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            : profile.initial}
        </div>

        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3, marginBottom: 2 }}>
          {username ?? '—'}
        </div>
        <div style={{ fontSize: 12.5, color: t.text2, marginBottom: 22, textAlign: 'center', lineHeight: 1.5 }}>
          {mode === 'setup' ? tr('lock.setup.sub') : tr('lock.sub')}
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PinDots value={pin} onChange={setPin} autoFocus placeholder={mode === 'setup' ? tr('lock.setup.pin') : tr('lock.pin')} onEnter={submit}/>
          {mode === 'setup' && (
            <PinDots value={confirm} onChange={setConfirm} placeholder={tr('lock.setup.confirm')} onEnter={submit}/>
          )}
        </div>

        {err && (
          <div style={{
            marginTop: 14, fontSize: 12, color: t.err, padding: '8px 12px', width: '100%', textAlign: 'center',
            background: `color-mix(in oklch, ${t.err} 8%, transparent)`,
            border: `1px solid color-mix(in oklch, ${t.err} 30%, transparent)`, borderRadius: 8,
          }}>{err}</div>
        )}

        <Btn kind="primary" size="lg" onClick={submit} disabled={busy} style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
          {mode === 'setup'
            ? (busy ? tr('lock.setup.creating') : tr('lock.setup.create'))
            : (busy ? tr('lock.unlock_loading') : tr('lock.unlock'))}
        </Btn>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 16 }}>
          {mode === 'setup' && <button onClick={onSkip} style={linkBtn(t)}>{tr('lock.setup.skip')}</button>}
          <button onClick={onSignOut} style={linkBtn(t)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconArrowL size={12}/> {tr('lock.signout')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// PIN estilo "dots": muestra un punto por dígito tipeado, centrado, con un input
// password oculto que captura los keystrokes. Igual que el lock viejo.
function PinDots({ value, onChange, placeholder, autoFocus, onEnter }: {
  value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; onEnter?: () => void;
}) {
  const t = useTokens();
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      position: 'relative', borderRadius: 14, background: t.bg2,
      border: `1px solid ${focused ? t.accent : t.glassBorder}`,
      transition: 'border-color 140ms', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 10, pointerEvents: 'none',
      }}>
        {value.length === 0
          ? <span style={{ color: t.text3, fontSize: 13, fontWeight: 400 }}>{placeholder}</span>
          : Array.from({ length: value.length }, (_, i) => (
            <span key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: t.accent }}/>
          ))}
      </div>
      <input
        type="password" inputMode="numeric" autoComplete="off" value={value} autoFocus={autoFocus} maxLength={8}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
        style={{
          width: '100%', boxSizing: 'border-box', height: 56, padding: 0,
          border: 0, outline: 'none', background: 'transparent',
          color: 'transparent', caretColor: 'transparent', textAlign: 'center',
          fontSize: 1, cursor: 'text',
        }}
      />
    </div>
  );
}

function linkBtn(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return { background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: t.text2, fontFamily: t.fontSans, fontSize: 11.5 };
}
