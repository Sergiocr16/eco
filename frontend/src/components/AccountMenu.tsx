import { useEffect, useRef, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
import { IconLock, IconKey } from '@/design/icons';
import { useT } from '@/hooks/useI18n';
import { useProfile } from '@/hooks/useProfile';

type Props = {
  username: string | null;
  onLock: () => void;
  onDestroyUser: (pin: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

function initial(username: string | null): string {
  if (!username) return '?';
  const trimmed = username.trim();
  if (!trimmed) return '?';
  return trimmed[0]!.toUpperCase();
}

export function AccountMenu({ username, onLock, onDestroyUser }: Props) {
  const t = useTokens();
  const tr = useT();
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const [destroyOpen, setDestroyOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: MouseEvent) => {
      if (!anchorRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (anchorRef.current.contains(e.target)) return;
      const pop = document.getElementById('eco-account-popover');
      if (pop && pop.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  function handleLock() {
    setOpen(false);
    onLock();
  }

  function handleDestroyClick() {
    setOpen(false);
    setDestroyOpen(true);
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        title={tr('nav.account')}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 36, height: 36, borderRadius: '50%', border: 0, cursor: 'pointer',
          background: open ? t.accentFaint : t.bg3,
          color: open ? t.accent : t.text0, fontWeight: 600, fontSize: 14,
          letterSpacing: -0.3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 140ms, color 140ms',
          padding: 0, overflow: 'hidden',
          outline: open ? `2px solid ${t.accent}` : 'none',
          outlineOffset: 1,
        }}>
        {profile.photo ? (
          <img
            src={profile.photo}
            alt={username ?? ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : initial(username)}
      </button>

      {open && (
        <div
          id="eco-account-popover"
          style={{
            position: 'fixed', left: 70, bottom: 16, zIndex: 200,
            width: 240,
            background: t.glassBg,
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: `1px solid ${t.glassBorderHi}`,
            borderRadius: 14,
            boxShadow: t.shadowLg,
            padding: 8,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
          <div style={{
            padding: '10px 12px 12px',
            borderBottom: `1px solid ${t.glassBorder}`,
            marginBottom: 4,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <ProfilePhotoControl/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: t.text3, fontFamily: t.fontMono, marginBottom: 2 }}>
                {tr('account.signed_in_as')}
              </div>
              <div style={{
                fontSize: 13.5, color: t.text0, fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {username ?? '—'}
              </div>
            </div>
          </div>

          <MenuItem
            icon={IconLock}
            label={tr('account.lock')}
            sub={tr('account.lock.sub')}
            onClick={handleLock}
          />
          <MenuItem
            icon={IconKey}
            label={tr('account.destroy')}
            sub={tr('account.destroy.sub')}
            danger
            onClick={handleDestroyClick}
          />
        </div>
      )}

      <DestroyDialog
        open={destroyOpen}
        onClose={() => setDestroyOpen(false)}
        onConfirm={onDestroyUser}
      />
    </>
  );
}

function MenuItem({
  icon: Icon, label, sub, onClick, danger,
}: {
  icon: (p: { size?: number }) => JSX.Element;
  label: string;
  sub?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const t = useTokens();
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', border: 0, borderRadius: 8,
        background: h ? (danger ? `color-mix(in oklch, ${t.err} 14%, transparent)` : t.bg3) : 'transparent',
        color: danger ? t.err : t.text1,
        cursor: 'pointer', textAlign: 'left',
        fontFamily: t.fontSans, fontSize: 13,
        transition: 'background 120ms',
      }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: danger ? `color-mix(in oklch, ${t.err} 16%, transparent)` : t.bg2,
        color: danger ? t.err : t.text1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={14}/>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        {sub && (
          <span style={{ fontSize: 11, color: t.text3, fontWeight: 400 }}>{sub}</span>
        )}
      </div>
    </button>
  );
}

function DestroyDialog({
  open, onClose, onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (pin: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const t = useTokens();
  const tr = useT();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPin(''); setError(null); setBusy(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit() {
    if (!/^\d{4,8}$/.test(pin)) { setError(tr('auth.err.pin_format')); return; }
    setBusy(true); setError(null);
    const r = await onConfirm(pin);
    setBusy(false);
    if (!r.ok) { setError(r.error); setPin(''); }
    // Si ok: el cambio de auth state desmonta toda la UI; este modal se va con ella.
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 220,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          background: t.windowBg, border: `1px solid ${t.glassBorderHi}`,
          borderRadius: 18, boxShadow: t.shadowLg,
          padding: 24,
        }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `color-mix(in oklch, ${t.err} 14%, transparent)`,
          color: t.err,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 14,
        }}>
          <IconKey size={20}/>
        </div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: t.text0, letterSpacing: -0.3 }}>
          {tr('account.destroy.title')}
        </h2>
        <p style={{ margin: '6px 0 18px', fontSize: 13, color: t.text2, lineHeight: 1.5 }}>
          {tr('account.destroy.warning')}
        </p>

        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={tr('account.destroy.pin_placeholder')}
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            background: t.bg2, border: `1px solid ${t.glassBorder}`,
            borderRadius: 10, padding: '12px 14px',
            fontFamily: t.fontMono, fontSize: 14, color: t.text0,
            outline: 'none',
            letterSpacing: 4,
          }}
        />

        {error && (
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 8,
            background: `color-mix(in oklch, ${t.err} 12%, transparent)`,
            color: t.err, fontSize: 12.5,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <Btn kind="ghost" onClick={onClose} disabled={busy}>
            {tr('account.destroy.cancel')}
          </Btn>
          <Btn
            kind="danger"
            onClick={submit}
            disabled={busy || pin.length < 4}>
            {busy ? tr('account.destroy.loading') : tr('account.destroy.confirm')}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function ProfilePhotoControl() {
  const t = useTokens();
  const tr = useT();
  const profile = useProfile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr(tr('account.photo.err_type')); return; }
    setErr(null); setBusy(true);
    try { await profile.setPhotoFromFile(file); }
    catch { setErr(tr('account.photo.err_save')); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={tr('account.photo.change')}
        style={{
          width: 44, height: 44, borderRadius: '50%', border: 0, cursor: 'pointer',
          padding: 0, overflow: 'hidden',
          background: profile.photo ? t.bg2 : t.accent,
          color: t.accentOn, fontWeight: 600, fontSize: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        {profile.photo ? (
          <img src={profile.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        ) : (profile.initial)}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => { void pick(e.target.files?.[0]); e.currentTarget.value = ''; }}
        style={{ display: 'none' }}
      />
      <div style={{
        position: 'absolute', bottom: -2, right: -2,
        display: 'flex', gap: 2,
      }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          title={tr('account.photo.change')}
          style={{
            width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${t.windowBg}`,
            background: t.accent, color: t.accentOn,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0,
          }}>+</button>
        {profile.photo && (
          <button
            type="button"
            onClick={() => profile.clearPhoto()}
            disabled={busy}
            title={tr('account.photo.remove')}
            style={{
              width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${t.windowBg}`,
              background: t.bg3, color: t.text1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0,
            }}>×</button>
        )}
      </div>
      {err && (
        <div style={{
          position: 'absolute', top: 48, left: -8,
          padding: '4px 8px', borderRadius: 6,
          background: `color-mix(in oklch, ${t.err} 16%, ${t.bg2})`,
          color: t.err, fontSize: 10.5, whiteSpace: 'nowrap',
        }}>{err}</div>
      )}
    </div>
  );
}
