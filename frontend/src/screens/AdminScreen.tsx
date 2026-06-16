// Consola de admin (solo rol admin). Lee Firestore directo (gateado por Rules):
//  - Usuarios: cambiar rol y habilitar/deshabilitar. (El alta es self-service
//    por Firebase Auth; no hay creación/claim/workspaces/borrado acá.)
//  - Actividad: quién trabaja en qué (usuario → sus bubbles), desde la nube.
//  - Bitácora: eventos (auditLog en Firestore).
// Gated en el sidebar por rol.

import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
import { useT } from '@/hooks/useI18n';
import { useAdmin, type AdminUser, type Role, AUDIT_EVENT_TYPES } from '@/hooks/useAdmin';
import { useFormatRelTime } from '@/components/GitPanel/shared';
import { IconShield } from '@/design/icons';

type AdminTab = 'users' | 'activity' | 'audit';
const ADMIN_TABS: AdminTab[] = ['users', 'activity', 'audit'];
const ADMIN_TAB_KEY: Record<AdminTab, string> = {
  users: 'admin.tab.users', activity: 'admin.tab.activity', audit: 'admin.tab.audit',
};

export function AdminScreen({ currentUserId }: { currentUserId: string | null }) {
  const t = useTokens();
  const tr = useT();
  const admin = useAdmin();
  const [tab, setTab] = useState<AdminTab>('users');

  useEffect(() => { void admin.refreshUsers(); }, [admin.refreshUsers]);
  useEffect(() => {
    if (tab !== 'activity') return;
    void admin.refreshOverview();
    const iv = setInterval(() => { void admin.refreshOverview(); }, 5000);
    return () => clearInterval(iv);
  }, [tab, admin.refreshOverview]);
  useEffect(() => {
    if (tab !== 'audit') return;
    void admin.refreshUsers();
    void admin.refreshAudit();
  }, [tab, admin.refreshUsers, admin.refreshAudit]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '28px 32px 80px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <IconShield size={20}/>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: t.text0, letterSpacing: -0.5 }}>
          {tr('admin.title')}
        </h1>
      </div>
      <p style={{ margin: '0 0 20px', color: t.text2, fontSize: 13 }}>{tr('admin.sub')}</p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {ADMIN_TABS.map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{
            padding: '7px 14px', borderRadius: 9, border: `1px solid ${tab === id ? t.accent : t.glassBorder}`,
            background: tab === id ? t.accentFaint : 'transparent', color: tab === id ? t.accent : t.text1,
            fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: t.fontSans,
          }}>{tr(ADMIN_TAB_KEY[id])}</button>
        ))}
      </div>

      {tab === 'users'
        ? <UsersTab admin={admin} currentUserId={currentUserId}/>
        : tab === 'activity'
          ? <ActivityTab admin={admin}/>
          : <AuditTab admin={admin}/>}
    </div>
  );
}

function genTempPassword(): string {
  // Contraseña temporal legible: aleatoria + sufijo que garantiza longitud/variedad.
  const r = Math.random().toString(36).slice(2, 10);
  return `Eco-${r}9`;
}

function CredsDialog({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const t = useTokens();
  const tr = useT();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(`${email}\n${password}`); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* noop */ }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(460px, calc(100vw - 48px))', background: t.bg2, border: `1px solid ${t.glassBorder}`, borderRadius: 16, padding: 24 }}>
        <h3 style={{ margin: '0 0 8px', color: t.text0, fontSize: 16 }}>{tr('admin.newuser.done.title')}</h3>
        <p style={{ margin: '0 0 14px', color: t.text2, fontSize: 12.5, lineHeight: 1.5 }}>{tr('admin.newuser.done.sub')}</p>
        <div style={{ padding: 14, borderRadius: 10, background: t.bg3, border: `1px solid ${t.glassBorder}`, fontFamily: t.fontMono, fontSize: 13, color: t.text0, lineHeight: 1.7 }}>
          <div>{email}</div>
          <div>{password}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn kind="secondary" size="sm" onClick={copy}>{copied ? tr('admin.newuser.done.copied') : tr('admin.newuser.done.copy')}</Btn>
          <Btn kind="primary" size="sm" onClick={onClose}>{tr('admin.newuser.done.close')}</Btn>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ admin, currentUserId }: { admin: ReturnType<typeof useAdmin>; currentUserId: string | null }) {
  const t = useTokens();
  const tr = useT();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);

  async function create() {
    setError(null);
    if (!email.trim()) { setError(tr('admin.newuser.email')); return; }
    setBusy(true);
    const password = genTempPassword();
    const r = await admin.createUser(email.trim(), name.trim(), password);
    setBusy(false);
    if (r.ok) { setCreds({ email: email.trim(), password }); setEmail(''); setName(''); }
    else setError(r.error);
  }

  const inputStyle = {
    padding: '8px 11px', borderRadius: 9, border: `1px solid ${t.glassBorder}`,
    background: t.bg2, color: t.text0, fontSize: 13, fontFamily: t.fontSans, outline: 'none',
  } as const;

  return (
    <>
      {creds && <CredsDialog email={creds.email} password={creds.password} onClose={() => setCreds(null)}/>}

      <div style={{ border: `1px solid ${t.glassBorder}`, borderRadius: 14, padding: 18, marginBottom: 22, background: t.bg2 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: t.text0 }}>{tr('admin.newuser.title')}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr('admin.newuser.email')}
            style={{ ...inputStyle, flex: '1 1 200px' }}/>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('admin.newuser.name')}
            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} style={{ ...inputStyle, flex: '1 1 160px' }}/>
          <Btn kind="primary" size="sm" onClick={create} disabled={busy}>{busy ? tr('admin.newuser.creating') : tr('admin.newuser.btn')}</Btn>
        </div>
        {error && <div style={{ marginTop: 10, color: t.err, fontSize: 12.5 }}>{error}</div>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {admin.users.map((u) => (
          <UserRow key={u.id} user={u} admin={admin} isSelf={u.id === currentUserId}/>
        ))}
        {admin.users.length === 0 && (
          <div style={{ color: t.text2, fontSize: 13, padding: 16 }}>{admin.loading ? tr('common.loading') : tr('admin.empty')}</div>
        )}
      </div>
    </>
  );
}

function UserRow({ user, admin, isSelf }: {
  user: AdminUser; admin: ReturnType<typeof useAdmin>; isSelf: boolean;
}) {
  const t = useTokens();
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const isAdmin = user.role === 'admin';

  async function toggleRole() {
    setBusy(true);
    await admin.setRole(user.id, (isAdmin ? 'member' : 'admin') as Role);
    setBusy(false);
  }
  async function toggleDisabled() {
    setBusy(true);
    await admin.setDisabled(user.id, !user.disabled);
    setBusy(false);
  }
  async function sendReset() {
    if (!user.email) return;
    setBusy(true);
    const r = await admin.sendReset(user.email);
    setBusy(false);
    if (r.ok) { setResetSent(true); setTimeout(() => setResetSent(false), 2500); }
  }

  return (
    <div style={{ border: `1px solid ${t.glassBorder}`, borderRadius: 14, background: t.bg2, opacity: user.disabled ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', flexWrap: 'wrap' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: t.accentFaint, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
          {user.username.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ color: t.text0, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
            {user.username}{isSelf && <span style={{ color: t.text3, fontWeight: 400 }}> · {tr('admin.you')}</span>}
            {user.disabled && (
              <span style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 999, color: t.err, background: `color-mix(in oklch, ${t.err} 16%, transparent)` }}>
                {tr('admin.status.disabled')}
              </span>
            )}
          </div>
          <div style={{ color: t.text2, fontSize: 11.5 }}>
            {isAdmin ? tr('admin.role.admin') : tr('admin.role.member')}{user.email ? ` · ${user.email}` : ''}
          </div>
        </div>
        <Btn kind="secondary" size="sm" onClick={toggleRole} disabled={isSelf || busy}>
          {isAdmin ? tr('admin.role.make_member') : tr('admin.role.make_admin')}
        </Btn>
        {user.email && (
          <Btn kind="secondary" size="sm" onClick={sendReset} disabled={busy}>
            {resetSent ? tr('admin.reset.sent') : tr('admin.reset.send')}
          </Btn>
        )}
        {!isSelf && (
          <Btn kind="secondary" size="sm" onClick={toggleDisabled} disabled={busy}>
            {user.disabled ? tr('admin.enable') : tr('admin.disable')}
          </Btn>
        )}
      </div>
    </div>
  );
}

function ActivityTab({ admin }: { admin: ReturnType<typeof useAdmin> }) {
  const t = useTokens();
  const tr = useT();
  const statusColor = (s: string) =>
    s === 'running' || s === 'thinking' || s === 'executing' ? t.ok
      : s === 'error' ? t.err : s === 'waiting' ? t.warn : t.text3;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {admin.overview.map((u) => {
        const active = u.bubbles.filter((b) => !b.archived);
        return (
          <div key={u.id} style={{ border: `1px solid ${t.glassBorder}`, borderRadius: 14, background: t.bg2, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: t.accentFaint, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>
                {u.username.charAt(0).toUpperCase()}
              </div>
              <div style={{ color: t.text0, fontSize: 14, fontWeight: 600 }}>{u.username}</div>
              <div style={{ color: t.text2, fontSize: 11.5 }}>{u.role === 'admin' ? tr('admin.role.admin') : tr('admin.role.member')}</div>
              <div style={{ flex: 1 }}/>
              <div style={{ color: t.text3, fontSize: 11.5 }}>{tr('admin.activity.count', { n: active.length })}</div>
            </div>
            {active.length === 0 ? (
              <div style={{ color: t.text3, fontSize: 12.5 }}>{tr('admin.activity.idle')}</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {active.map((b) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 999, border: `1px solid ${t.glassBorder}`, background: t.bg3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(b.status) }}/>
                    <span style={{ color: t.text0, fontSize: 12.5, fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {admin.overview.length === 0 && <div style={{ color: t.text2, fontSize: 13, padding: 16 }}>{tr('admin.activity.loading')}</div>}
    </div>
  );
}

// Bitácora: eventos de sesión y agentes, filtrables por usuario y por tipo.
function AuditTab({ admin }: { admin: ReturnType<typeof useAdmin> }) {
  const t = useTokens();
  const tr = useT();
  const relTime = useFormatRelTime();
  const [userId, setUserId] = useState('');
  const [type, setType] = useState('');

  useEffect(() => {
    void admin.refreshAudit({
      userId: userId || undefined,
      type: (type || undefined) as typeof AUDIT_EVENT_TYPES[number] | undefined,
    });
  }, [userId, type, admin.refreshAudit]);

  const nameOf = (id: string | null): string => {
    if (!id) return tr('admin.audit.unknown_user');
    return admin.users.find((u) => u.id === id)?.username ?? tr('admin.audit.unknown_user');
  };
  const wsName = (ws?: string): string => (ws ? (ws.split('/').filter(Boolean).pop() ?? ws) : '');

  const selectStyle = {
    padding: '6px 10px', borderRadius: 9, border: `1px solid ${t.glassBorder}`,
    background: t.bg2, color: t.text0, fontSize: 12.5, fontFamily: t.fontSans, cursor: 'pointer',
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.text2, fontSize: 12 }}>
          {tr('admin.audit.filter.user')}
          <select value={userId} onChange={(e) => setUserId(e.target.value)} style={selectStyle}>
            <option value="">{tr('admin.audit.filter.all')}</option>
            {admin.users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.text2, fontSize: 12 }}>
          {tr('admin.audit.filter.type')}
          <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
            <option value="">{tr('admin.audit.filter.all')}</option>
            {AUDIT_EVENT_TYPES.map((ty) => <option key={ty} value={ty}>{tr(`admin.audit.type.${ty}`)}</option>)}
          </select>
        </label>
      </div>

      {admin.audit.length === 0 ? (
        <div style={{ color: t.text2, fontSize: 13, padding: 16 }}>{tr('admin.audit.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {admin.audit.map((ev, i) => (
            <div key={`${ev.ts}-${i}`} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 10,
              border: `1px solid ${t.glassBorder}`, background: t.bg2,
            }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: t.accentFaint, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
                {nameOf(ev.actorId).charAt(0).toUpperCase()}
              </div>
              <span style={{ color: t.text0, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{nameOf(ev.actorId)}</span>
              <span style={{ color: t.text1, fontSize: 12.5 }}>{tr(`admin.audit.type.${ev.type}`)}</span>
              {ev.workspace && (
                <span style={{ color: t.text3, fontSize: 11, fontFamily: t.fontMono, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wsName(ev.workspace)}</span>
              )}
              <div style={{ flex: 1 }}/>
              <span style={{ color: t.text3, fontSize: 11.5, flexShrink: 0 }}>{relTime(new Date(ev.ts).toISOString())}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
