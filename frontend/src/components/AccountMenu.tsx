import { vw, cssZoom } from '@/lib/ui-zoom';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTokens } from '@/design/theme';
import { IconLock, IconArrowR, IconKey } from '@/design/icons';
import { Btn } from '@/design/primitives';
import { useT } from '@/hooks/useI18n';
import { useProfile } from '@/hooks/useProfile';
import { useIsPhone } from '@/hooks/useMediaQuery';
import type { JSX } from 'react';

type AuthActionResult = { ok: true } | { ok: false; error: string };

type Props = {
  username: string | null;
  onLock: () => void;
  onSignOut: () => void;
  onChangePassword: (current: string, next: string) => Promise<AuthActionResult>;
  /** `row`: avatar + nombre (barra lateral expandida). */
  variant?: 'avatar' | 'row';
};

function initial(username: string | null): string {
  if (!username) return '?';
  const trimmed = username.trim();
  if (!trimmed) return '?';
  return trimmed[0]!.toUpperCase();
}

export function AccountMenu({ username, onLock, onSignOut, onChangePassword, variant = 'avatar' }: Props) {
  const t = useTokens();
  const tr = useT();
  const profile = useProfile();
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // pointerdown y no mousedown: en iOS el mousedown sintético para taps es
    // inconsistente, así que el menú quedaba sin forma de cerrarse en el
    // teléfono (tampoco hay Escape). pointerdown cubre mouse y touch igual.
    const onDown = (e: PointerEvent) => {
      if (!anchorRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (anchorRef.current.contains(e.target)) return;
      const pop = document.getElementById('eco-account-popover');
      if (pop && pop.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  function handleLock() {
    setOpen(false);
    onLock();
  }

  function handleSignOut() {
    setOpen(false);
    onSignOut();
  }

  const avatar = (
    <span className="eco-avatar" style={open ? { borderColor: t.accent } : undefined}>
      {profile.photo ? (
        <img src={profile.photo} alt={username ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
      ) : initial(username)}
    </span>
  );
  // El menú se abre hacia arriba desde el ancla, alineado a su borde izquierdo
  // (a la derecha en el teléfono, donde el avatar vive al final de la barra).
  const r = open ? anchorRef.current?.getBoundingClientRect() : null;
  const z = cssZoom();
  const popPos: CSSProperties = r
    ? (isPhone
      ? { right: 8, bottom: (window.innerHeight - r.top) / z + 8 }
      : { left: Math.max(8, r.left / z), bottom: (window.innerHeight - r.top) / z + 8 })
    : { left: 8, bottom: 8 };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        title={tr('nav.account')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={variant === 'row' ? 'eco-nav-item' : undefined}
        style={variant === 'row'
          ? { height: 44, padding: '0 8px', gap: 10, color: t.text0, fontWeight: 500 }
          : { border: 0, padding: 0, background: 'transparent', cursor: 'pointer', borderRadius: '50%', display: 'flex' }}>
        {avatar}
        {variant === 'row' && <span className="eco-truncate">{username ?? '—'}</span>}
      </button>

      {open && (
        <div
          id="eco-account-popover"
          className="eco-menu"
          style={{
            position: 'fixed', zIndex: 200, ...popPos,
            width: `min(260px, calc(${vw(100)} - 16px))`,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
          <div className="eco-hstack" style={{ gap: 12, padding: '8px 8px 12px' }}>
            <ProfilePhotoControl/>
            <div className="eco-grow">
              <div className="eco-sub">{tr('account.signed_in_as')}</div>
              <div className="eco-label eco-truncate">{username ?? '—'}</div>
            </div>
          </div>
          <div className="eco-menu__sep" style={{ marginTop: 0 }}/>

          <MenuItem
            icon={IconLock}
            label={tr('account.lock')}
            sub={tr('account.lock.sub')}
            onClick={handleLock}
          />
          <MenuItem
            icon={IconKey}
            label={tr('account.password')}
            sub={tr('account.password.sub')}
            onClick={() => { setOpen(false); setPwOpen(true); }}
          />
          <MenuItem
            icon={IconArrowR}
            label={tr('account.signout')}
            sub={tr('account.signout.sub')}
            onClick={handleSignOut}
          />
        </div>
      )}

      {pwOpen && <ChangePasswordDialog onChangePassword={onChangePassword} onClose={() => setPwOpen(false)}/>}
    </>
  );
}

function ChangePasswordDialog({ onChangePassword, onClose }: {
  onChangePassword: (current: string, next: string) => Promise<AuthActionResult>;
  onClose: () => void;
}) {
  const tr = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (busy) return;
    setErr(null);
    if (next.length < 6) { setErr(tr('account.password.err_short')); return; }
    if (next !== confirm) { setErr(tr('account.password.err_mismatch')); return; }
    setBusy(true);
    const r = await onChangePassword(current, next);
    setBusy(false);
    if (r.ok) setDone(true); else setErr(r.error);
  }

  const input = (value: string, set: (v: string) => void, placeholder: string, autoFocus = false) => (
    <input
      type="password" value={value} autoFocus={autoFocus}
      onChange={(e) => set(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
      placeholder={placeholder}
      className="eco-field eco-field--on-sheet"
    />
  );

  return (
    <div className="eco-scrim" style={{ zIndex: 1000 }}>
      <div className="eco-dialog" style={{ maxWidth: 400 }}>
        <h3 className="eco-h2" style={{ marginBottom: 16 }}>{tr('account.password')}</h3>
        {done ? (
          <>
            <p className="eco-muted" style={{ margin: 0 }}>{tr('account.password.done')}</p>
            <div className="eco-dialog__actions">
              <Btn kind="primary" onClick={onClose}>{tr('account.password.close')}</Btn>
            </div>
          </>
        ) : (
          <>
            <div className="eco-vstack" style={{ gap: 10 }}>
              {input(current, setCurrent, tr('account.password.current'), true)}
              {input(next, setNext, tr('account.password.new'))}
              {input(confirm, setConfirm, tr('account.password.confirm'))}
            </div>
            {err && <div className="eco-banner eco-banner--err" style={{ marginTop: 12 }}>{err}</div>}
            <div className="eco-dialog__actions">
              <Btn kind="soft" onClick={onClose}>{tr('account.password.cancel')}</Btn>
              <Btn kind="primary" onClick={submit} disabled={busy}>{busy ? tr('account.password.saving') : tr('account.password.save')}</Btn>
            </div>
          </>
        )}
      </div>
    </div>
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
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className={`eco-menu__item${danger ? ' eco-menu__item--danger' : ''}`}
      style={{ height: 'auto', padding: '8px 10px' }}>
      <Icon size={15}/>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span>{label}</span>
        {sub && <span className="eco-sub">{sub}</span>}
      </span>
    </button>
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
          background: t.raised, boxShadow: `inset 0 0 0 1px ${t.line2}`,
          color: t.text0, fontWeight: 600, fontSize: 16,
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
            width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${t.bg}`,
            background: t.text0, color: t.bg,
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
              width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${t.bg}`,
              background: t.hover, color: t.text0,
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
          color: t.err, fontSize: 11, whiteSpace: 'nowrap',
        }}>{err}</div>
      )}
    </div>
  );
}
