import { useState } from 'react';
import { Btn } from '@/design/primitives';
import { EcoGlyph } from '@/design/EcoMark';
import { IconArrowL, IconLock } from '@/design/icons';
import { getTopInset, SAFE_TOP, SAFE_BOTTOM } from '@/lib/platform';
import { useT } from '@/hooks/useI18n';
import { useProfile } from '@/hooks/useProfile';

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
        <div className="eco-pane" style={{
          width: '100%', maxWidth: 360, padding: '32px 28px 24px', borderRadius: 28,
          background: 'var(--sheet)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          {/* Avatar del usuario (foto o inicial) con la marca de bloqueo */}
          <div style={{ position: 'relative', width: 72, height: 72, marginBottom: 10 }}>
            <div className="eco-avatar" style={{ width: 72, height: 72, fontSize: 22 }}>
              {profile.photo
                ? <img src={profile.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                : profile.initial}
            </div>
            <div className="eco-muted" style={{
              position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: '50%',
              background: 'var(--card)', border: '2px solid var(--sheet)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconLock size={12}/>
            </div>
          </div>

          <div className="eco-h2 eco-truncate" style={{ maxWidth: '100%' }}>{username ?? '—'}</div>
          <div className="eco-muted" style={{ marginBottom: 14, textAlign: 'center' }}>
            {mode === 'setup' ? tr('lock.setup.sub') : tr('lock.sub')}
          </div>

          <div className="eco-vstack" style={{ width: '100%', gap: 8 }}>
            <PinField value={pin} onChange={setPin} autoFocus placeholder={mode === 'setup' ? tr('lock.setup.pin') : tr('lock.pin')} onEnter={submit}/>
            {mode === 'setup' && (
              <PinField value={confirm} onChange={setConfirm} placeholder={tr('lock.setup.confirm')} onEnter={submit}/>
            )}
          </div>

          {err && (
            <div className="eco-banner eco-banner--err" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>{err}</div>
          )}

          <Btn kind="primary" size="lg" onClick={submit} disabled={busy} className="eco-btn--block" style={{ marginTop: 8 }}>
            {mode === 'setup'
              ? (busy ? tr('lock.setup.creating') : tr('lock.setup.create'))
              : (busy ? tr('lock.unlock_loading') : tr('lock.unlock'))}
          </Btn>

          <div className="eco-hstack eco-hstack--wrap" style={{ justifyContent: 'center', gap: 4, marginTop: 8 }}>
            {mode === 'setup' && <Btn kind="ghost" size="sm" onClick={onSkip}>{tr('lock.setup.skip')}</Btn>}
            <Btn kind="ghost" size="sm" icon={IconArrowL} onClick={onSignOut}>{tr('lock.signout')}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// Campo de PIN: solo dígitos (máx. 8), centrado y con los puntos espaciados.
function PinField({ value, onChange, placeholder, autoFocus, onEnter }: {
  value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; onEnter?: () => void;
}) {
  return (
    <input
      className="eco-field eco-field--on-sheet"
      type="password" inputMode="numeric" autoComplete="off" value={value} autoFocus={autoFocus} maxLength={8}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
      onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
      // El espaciado solo con dígitos: aplicado al placeholder lo deja ilegible.
      style={{ height: 48, textAlign: 'center', ...(value ? { fontSize: 18, letterSpacing: '.4em' } : {}) }}
    />
  );
}
