// Consola de admin (solo rol admin). Dos vistas:
//  - Usuarios: crear miembros, cambiar rol, asignar workspaces, reset PIN, borrar.
//  - Actividad: quién trabaja en qué (usuario → sus bubbles + estado vivo).
// Gated en el sidebar por rol y en el backend por requireAdmin.

import { useEffect, useState } from 'react';
import { useTokens } from '@/design/theme';
import { Btn } from '@/design/primitives';
import { useT } from '@/hooks/useI18n';
import { useAdmin, type AdminUser, type Role } from '@/hooks/useAdmin';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { IconShield, IconTrash, IconCheck, IconKey } from '@/design/icons';

export function AdminScreen({ currentUserId }: { currentUserId: string | null }) {
  const t = useTokens();
  const tr = useT();
  const admin = useAdmin();
  const [tab, setTab] = useState<'users' | 'activity'>('users');

  useEffect(() => { void admin.refreshUsers(); }, [admin.refreshUsers]);
  useEffect(() => {
    if (tab !== 'activity') return;
    void admin.refreshOverview();
    const iv = setInterval(() => { void admin.refreshOverview(); }, 5000);
    return () => clearInterval(iv);
  }, [tab, admin.refreshOverview]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <IconShield size={20}/>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: t.text0, letterSpacing: -0.5 }}>
          {tr('admin.title')}
        </h1>
      </div>
      <p style={{ margin: '0 0 20px', color: t.text2, fontSize: 13 }}>{tr('admin.sub')}</p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {(['users', 'activity'] as const).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{
            padding: '7px 14px', borderRadius: 9, border: `1px solid ${tab === id ? t.accent : t.glassBorder}`,
            background: tab === id ? t.accentFaint : 'transparent', color: tab === id ? t.accent : t.text1,
            fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: t.fontSans,
          }}>{tr(id === 'users' ? 'admin.tab.users' : 'admin.tab.activity')}</button>
        ))}
      </div>

      {tab === 'users'
        ? <UsersTab admin={admin} currentUserId={currentUserId}/>
        : <ActivityTab admin={admin}/>}
    </div>
  );
}

function RecoveryDialog({ phrase, onClose }: { phrase: string; onClose: () => void }) {
  const t = useTokens();
  const tr = useT();
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(440px, calc(100vw - 48px))', background: t.bg2, border: `1px solid ${t.glassBorder}`, borderRadius: 16, padding: 24 }}>
        <h3 style={{ margin: '0 0 8px', color: t.text0, fontSize: 16 }}>{tr('admin.recovery.title')}</h3>
        <p style={{ margin: '0 0 14px', color: t.text2, fontSize: 12.5, lineHeight: 1.5 }}>{tr('admin.recovery.sub')}</p>
        <div style={{ padding: 14, borderRadius: 10, background: t.bg3, border: `1px solid ${t.glassBorder}`, fontFamily: t.fontMono, fontSize: 13, color: t.text0, lineHeight: 1.7, wordSpacing: 4 }}>
          {phrase}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Btn kind="primary" size="sm" onClick={onClose}>{tr('admin.recovery.done')}</Btn>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ admin, currentUserId }: { admin: ReturnType<typeof useAdmin>; currentUserId: string | null }) {
  const t = useTokens();
  const tr = useT();
  const ws = useWorkspaces();
  const universe = ws.list.workspaces;
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (!newName.trim() || !/^\d{4,8}$/.test(newPin)) { setError(tr('admin.err.name_pin')); return; }
    setBusy(true);
    const r = await admin.createMember(newName.trim(), newPin, 'member');
    setBusy(false);
    if (r.ok) { setNewName(''); setNewPin(''); setRecovery(r.data.recoveryPhrase); }
    else setError(r.error);
  }

  const inputStyle = {
    padding: '8px 11px', borderRadius: 9, border: `1px solid ${t.glassBorder}`,
    background: t.bg2, color: t.text0, fontSize: 13, fontFamily: t.fontSans, outline: 'none',
  } as const;

  return (
    <>
      {recovery && <RecoveryDialog phrase={recovery} onClose={() => setRecovery(null)}/>}

      {/* Crear miembro */}
      <div style={{ border: `1px solid ${t.glassBorder}`, borderRadius: 14, padding: 18, marginBottom: 22, background: t.bg2 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: t.text0 }}>{tr('admin.create.title')}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={tr('admin.create.username')} style={{ ...inputStyle, flex: '1 1 180px' }}/>
          <input value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder={tr('admin.create.pin')} inputMode="numeric" style={{ ...inputStyle, width: 120 }}/>
          <Btn kind="primary" size="sm" onClick={create} disabled={busy}>{tr('admin.create.btn')}</Btn>
        </div>
        {error && <div style={{ marginTop: 10, color: t.err, fontSize: 12.5 }}>{error}</div>}
      </div>

      {/* Lista de usuarios */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {admin.users.map((u) => (
          <UserRow key={u.id} user={u} universe={universe} admin={admin} isSelf={u.id === currentUserId} onRecovery={setRecovery}/>
        ))}
        {admin.users.length === 0 && (
          <div style={{ color: t.text2, fontSize: 13, padding: 16 }}>{admin.loading ? tr('common.loading') : tr('admin.empty')}</div>
        )}
      </div>
    </>
  );
}

function UserRow({ user, universe, admin, isSelf, onRecovery }: {
  user: AdminUser; universe: string[]; admin: ReturnType<typeof useAdmin>; isSelf: boolean; onRecovery: (p: string) => void;
}) {
  const t = useTokens();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [grants, setGrants] = useState<string[]>(user.workspaceGrants);
  const [savingGrants, setSavingGrants] = useState(false);
  const [pin, setPin] = useState('');

  useEffect(() => { setGrants(user.workspaceGrants); }, [user.workspaceGrants]);

  const isAdmin = user.role === 'admin';
  const wsLabel = (p: string) => p.split('/').filter(Boolean).pop() || p;

  async function toggleRole() {
    await admin.setRole(user.id, isAdmin ? 'member' : 'admin' as Role);
  }
  async function saveGrants() {
    setSavingGrants(true);
    await admin.setWorkspaces(user.id, grants);
    setSavingGrants(false);
  }
  async function doReset() {
    if (!/^\d{4,8}$/.test(pin)) return;
    const r = await admin.resetPin(user.id, pin);
    setPin('');
    if (r.ok) onRecovery(r.data.recoveryPhrase);
  }

  return (
    <div style={{ border: `1px solid ${t.glassBorder}`, borderRadius: 14, background: t.bg2, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: t.accentFaint, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
          {user.username.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: t.text0, fontSize: 14, fontWeight: 500 }}>{user.username}{isSelf && <span style={{ color: t.text3, fontWeight: 400 }}> · {tr('admin.you')}</span>}</div>
          <div style={{ color: t.text2, fontSize: 11.5 }}>{isAdmin ? tr('admin.role.admin') : tr('admin.role.member')} · {tr('admin.grants_count', { n: user.workspaceGrants.length })}</div>
        </div>
        <Btn kind="ghost" size="sm" onClick={() => setOpen((o) => !o)}>{open ? tr('admin.close') : tr('admin.manage')}</Btn>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${t.glassBorder}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Rol */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: t.text1, fontSize: 13 }}>{tr('admin.role.label')}</span>
            <Btn kind="secondary" size="sm" onClick={toggleRole} disabled={isSelf}>
              {isAdmin ? tr('admin.role.make_member') : tr('admin.role.make_admin')}
            </Btn>
          </div>

          {/* Workspaces */}
          <div>
            <div style={{ color: t.text1, fontSize: 13, marginBottom: 8 }}>{tr('admin.workspaces.label')}</div>
            {isAdmin ? (
              <div style={{ color: t.text2, fontSize: 12.5 }}>{tr('admin.workspaces.admin_all')}</div>
            ) : universe.length === 0 ? (
              <div style={{ color: t.text2, fontSize: 12.5 }}>{tr('admin.workspaces.none_configured')}</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {universe.map((wsp) => {
                    const checked = grants.includes(wsp);
                    return (
                      <label key={wsp} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: t.text1 }}>
                        <input type="checkbox" checked={checked} onChange={(e) => {
                          setGrants((g) => e.target.checked ? [...g, wsp] : g.filter((x) => x !== wsp));
                        }}/>
                        <span style={{ fontWeight: 500 }}>{wsLabel(wsp)}</span>
                        <span style={{ color: t.text3, fontFamily: t.fontMono, fontSize: 11 }}>{wsp}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10 }}>
                  <Btn kind="primary" size="sm" icon={IconCheck} onClick={saveGrants} disabled={savingGrants}>{tr('admin.workspaces.save')}</Btn>
                </div>
              </>
            )}
          </div>

          {/* Reset PIN + borrar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${t.glassBorder}`, paddingTop: 14 }}>
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder={tr('admin.reset.pin')} inputMode="numeric"
              style={{ padding: '7px 10px', borderRadius: 9, border: `1px solid ${t.glassBorder}`, background: t.bg3, color: t.text0, fontSize: 13, width: 130, outline: 'none' }}/>
            <Btn kind="secondary" size="sm" icon={IconKey} onClick={doReset}>{tr('admin.reset.btn')}</Btn>
            <div style={{ flex: 1 }}/>
            {!isSelf && (
              <Btn kind="danger" size="sm" icon={IconTrash} onClick={() => { void admin.deleteUser(user.id); }}>{tr('admin.delete')}</Btn>
            )}
          </div>
        </div>
      )}
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
                    {b.ptyRunning && <span title="PTY" style={{ color: t.accent, fontSize: 10, fontFamily: t.fontMono }}>PTY</span>}
                    {b.devActive && <span title="dev server" style={{ color: t.ok, fontSize: 10, fontFamily: t.fontMono }}>DEV</span>}
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
