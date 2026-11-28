// Consola de admin (solo rol admin). Lee Firestore directo (gateado por Rules):
//  - Usuarios: cambiar rol y habilitar/deshabilitar. (El alta es self-service
//    por Firebase Auth; no hay creación/claim/workspaces/borrado acá.)
//  - Actividad: quién trabaja en qué (usuario → sus bubbles), desde la nube.
//  - Bitácora: eventos (auditLog en Firestore).
// Gated en el sidebar por rol.

import { useEffect, useState } from 'react';
import { Btn, Card, Chip, IconBtn, PageHeader, Segmented } from '@/design/primitives';
import { IconCheck, IconX } from '@/design/icons';
import { useT } from '@/hooks/useI18n';
import { useAdmin, type AdminUser, type Role, AUDIT_EVENT_TYPES } from '@/hooks/useAdmin';
import { useFormatRelTime } from '@/components/GitPanel/shared';

type AdminTab = 'users' | 'activity' | 'audit';
const ADMIN_TABS: AdminTab[] = ['users', 'activity', 'audit'];
const ADMIN_TAB_KEY: Record<AdminTab, string> = {
  users: 'admin.tab.users', activity: 'admin.tab.activity', audit: 'admin.tab.audit',
};

export function AdminScreen({ currentUserId }: { currentUserId: string | null }) {
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
    <div className="eco-page eco-page--scroll">
      <PageHeader
        eyebrow={tr('nav.admin')}
        title={tr('admin.title')}
        sub={tr('admin.sub')}
        actions={(
          <Segmented
            value={tab}
            onChange={setTab}
            options={ADMIN_TABS.map((id) => ({ id, label: tr(ADMIN_TAB_KEY[id]) }))}
          />
        )}
      />

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
  const tr = useT();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(`${email}\n${password}`); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* noop */ }
  }
  return (
    <div className="eco-scrim" style={{ zIndex: 1000 }}>
      <div className="eco-dialog" role="dialog" aria-modal="true" aria-label={tr('admin.newuser.done.title')}>
        <div className="eco-dialog__head">
          <span className="eco-dialog__tile"><IconCheck size={20}/></span>
          <h2 className="eco-dialog__title">{tr('admin.newuser.done.title')}</h2>
          <IconBtn icon={IconX} size={32} title={tr('common.close')} onClick={onClose}/>
        </div>
        <p className="eco-dialog__body">{tr('admin.newuser.done.sub')}</p>
        <div className="eco-dialog__section">
          <div className="eco-card eco-card--sm eco-mono" style={{ fontSize: 13, lineHeight: 1.7, overflowWrap: 'anywhere' }}>
            <div>{email}</div>
            <div>{password}</div>
          </div>
        </div>
        <div className="eco-dialog__foot">
          <div className="eco-dialog__actions">
            <button type="button" className="eco-btn eco-btn--lg eco-btn--outline" onClick={copy}>
              {copied ? tr('admin.newuser.done.copied') : tr('admin.newuser.done.copy')}
            </button>
            <button type="button" className="eco-btn eco-btn--lg eco-btn--primary" onClick={onClose}>
              {tr('admin.newuser.done.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ admin, currentUserId }: { admin: ReturnType<typeof useAdmin>; currentUserId: string | null }) {
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

  return (
    <>
      {creds && <CredsDialog email={creds.email} password={creds.password} onClose={() => setCreds(null)}/>}

      <Card variant="stack">
        <h3 className="eco-h3">{tr('admin.newuser.title')}</h3>
        <div className="eco-hstack eco-hstack--wrap">
          <input className="eco-field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr('admin.newuser.email')}
            style={{ flex: '1 1 200px', width: 'auto' }}/>
          <input className="eco-field" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('admin.newuser.name')}
            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} style={{ flex: '1 1 160px', width: 'auto' }}/>
          <Btn kind="primary" size="lg" onClick={create} disabled={busy}>{busy ? tr('admin.newuser.creating') : tr('admin.newuser.btn')}</Btn>
        </div>
        {error && <div className="eco-banner eco-banner--err">{error}</div>}
      </Card>

      <Card variant="list">
        {admin.users.map((u) => (
          <UserRow key={u.id} user={u} admin={admin} isSelf={u.id === currentUserId}/>
        ))}
        {admin.users.length === 0 && (
          <div className="eco-empty">{admin.loading ? tr('common.loading') : tr('admin.empty')}</div>
        )}
      </Card>
    </>
  );
}

function UserRow({ user, admin, isSelf }: {
  user: AdminUser; admin: ReturnType<typeof useAdmin>; isSelf: boolean;
}) {
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
    <div className="eco-row" style={user.disabled ? { opacity: 0.6 } : undefined}>
      <div className="eco-avatar">{user.username.charAt(0).toUpperCase()}</div>
      <div className="eco-row__main">
        <div className="eco-row__title eco-hstack eco-hstack--wrap" style={{ gap: '4px 8px' }}>
          <span className="eco-truncate">{user.username}</span>
          {isSelf && <span className="eco-faint" style={{ fontWeight: 400 }}>· {tr('admin.you')}</span>}
          {user.disabled && <Chip tone="err">{tr('admin.status.disabled')}</Chip>}
        </div>
        <div className="eco-row__desc" style={{ overflowWrap: 'anywhere' }}>
          {isAdmin ? tr('admin.role.admin') : tr('admin.role.member')}{user.email ? ` · ${user.email}` : ''}
        </div>
      </div>
      <div className="eco-row__end" style={{ flexWrap: 'wrap', flex: '0 1 auto' }}>
        <Btn kind="raised" size="sm" onClick={toggleRole} disabled={isSelf || busy}>
          {isAdmin ? tr('admin.role.make_member') : tr('admin.role.make_admin')}
        </Btn>
        {user.email && (
          <Btn kind="raised" size="sm" onClick={sendReset} disabled={busy}>
            {resetSent ? tr('admin.reset.sent') : tr('admin.reset.send')}
          </Btn>
        )}
        {!isSelf && (
          <Btn kind={user.disabled ? 'raised' : 'danger'} size="sm" onClick={toggleDisabled} disabled={busy}>
            {user.disabled ? tr('admin.enable') : tr('admin.disable')}
          </Btn>
        )}
      </div>
    </div>
  );
}

function ActivityTab({ admin }: { admin: ReturnType<typeof useAdmin> }) {
  const tr = useT();
  const statusColor = (s: string) =>
    s === 'running' || s === 'thinking' || s === 'executing' ? 'var(--ok)'
      : s === 'error' ? 'var(--err)' : s === 'waiting' ? 'var(--warn)' : 'var(--tx3)';

  return (
    <div className="eco-vstack" style={{ gap: 18 }}>
      {admin.overview.map((u) => {
        const active = u.bubbles.filter((b) => !b.archived);
        return (
          <Card key={u.id} variant="stack">
            <div className="eco-hstack eco-hstack--wrap">
              <div className="eco-avatar">{u.username.charAt(0).toUpperCase()}</div>
              <span className="eco-label eco-truncate">{u.username}</span>
              <span className="eco-sub">{u.role === 'admin' ? tr('admin.role.admin') : tr('admin.role.member')}</span>
              <div className="eco-spacer"/>
              <span className="eco-num">{tr('admin.activity.count', { n: active.length })}</span>
            </div>
            {active.length === 0 ? (
              <div className="eco-sub">{tr('admin.activity.idle')}</div>
            ) : (
              <div className="eco-hstack eco-hstack--wrap" style={{ gap: 8 }}>
                {active.map((b) => (
                  <Chip key={b.id} onCard dot={statusColor(b.status)}>
                    <span className="eco-truncate" style={{ maxWidth: 220 }}>{b.title}</span>
                  </Chip>
                ))}
              </div>
            )}
          </Card>
        );
      })}
      {admin.overview.length === 0 && <div className="eco-empty">{tr('admin.activity.loading')}</div>}
    </div>
  );
}

// Bitácora: eventos de sesión y agentes, filtrables por usuario y por tipo.
function AuditTab({ admin }: { admin: ReturnType<typeof useAdmin> }) {
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

  return (
    <div className="eco-vstack" style={{ gap: 18 }}>
      <div className="eco-hstack eco-hstack--wrap" style={{ gap: '10px 16px' }}>
        <label className="eco-hstack eco-field-label" style={{ gap: 8 }}>
          {tr('admin.audit.filter.user')}
          <select className="eco-field eco-field--sm eco-field--on-sheet" value={userId} onChange={(e) => setUserId(e.target.value)}
            style={{ width: 'auto', maxWidth: 220 }}>
            <option value="">{tr('admin.audit.filter.all')}</option>
            {admin.users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
          </select>
        </label>
        <label className="eco-hstack eco-field-label" style={{ gap: 8 }}>
          {tr('admin.audit.filter.type')}
          <select className="eco-field eco-field--sm eco-field--on-sheet" value={type} onChange={(e) => setType(e.target.value)}
            style={{ width: 'auto', maxWidth: 220 }}>
            <option value="">{tr('admin.audit.filter.all')}</option>
            {AUDIT_EVENT_TYPES.map((ty) => <option key={ty} value={ty}>{tr(`admin.audit.type.${ty}`)}</option>)}
          </select>
        </label>
      </div>

      <Card variant="list">
        {admin.audit.length === 0 ? (
          <div className="eco-empty">{tr('admin.audit.empty')}</div>
        ) : admin.audit.map((ev, i) => (
          <div key={`${ev.ts}-${i}`} className="eco-row eco-row--tight">
            <div className="eco-avatar">{nameOf(ev.actorId).charAt(0).toUpperCase()}</div>
            <div className="eco-row__main">
              <div className="eco-hstack eco-hstack--wrap" style={{ gap: '2px 8px' }}>
                <span className="eco-label">{nameOf(ev.actorId)}</span>
                <span className="eco-muted">{tr(`admin.audit.type.${ev.type}`)}</span>
              </div>
              {ev.workspace && <div className="eco-num eco-truncate">{wsName(ev.workspace)}</div>}
            </div>
            <span className="eco-num">{relTime(new Date(ev.ts).toISOString())}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
