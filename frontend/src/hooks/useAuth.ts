import { useCallback, useEffect, useRef, useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
} from 'firebase/auth';
import { onSnapshot, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getEcoAuth, firebaseConfigured } from '@/lib/firebase';
import { refs } from '@/lib/firestore-model';
import { hasLockPin, setLockPin, verifyLockPin, clearLockPin } from '@/lib/lock-pin';
import { writeProfileUsername } from './useProfile';

// 'unlocked' = app visible; 'locked' = pide PIN (sesión Firebase viva);
// 'setup' = pide crear PIN (post-login, primera vez).
export type LockState = 'unlocked' | 'locked' | 'setup';

// Distingue login fresco (email/contraseña) de una sesión persistida que se
// re-hidrata al abrir la app: el login fresco entra directo; la sesión
// persistida con PIN configurado arranca bloqueada.
let justLoggedIn = false;

export type AuthStatus = 'loading' | 'no_config' | 'needs_login' | 'authenticated';
export type Role = 'admin' | 'member';

export type AuthState = {
  status: AuthStatus;
  username: string | null; // displayName o email
  userId: string | null;   // uid de Firebase
  role: Role | null;
  error: string | null;
};

export type LoginPayload = { email: string; password: string };
export type RegisterPayload = { email: string; password: string; displayName?: string };
export type AuthResult = { ok: true } | { ok: false; error: string };

// Traducción de los códigos de error de Firebase Auth a mensajes en español.
function translateAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email': return 'Email inválido.';
    case 'auth/missing-password': return 'Ingresá tu contraseña.';
    case 'auth/weak-password': return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/email-already-in-use': return 'Ese email ya está registrado.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Email o contraseña incorrectos.';
    case 'auth/too-many-requests': return 'Demasiados intentos. Probá más tarde.';
    case 'auth/network-request-failed': return 'Sin conexión con el servidor de autenticación.';
    default: return e instanceof Error ? e.message : 'Error de autenticación.';
  }
}

const displayNameOf = (u: User): string => u.displayName || u.email || u.uid;

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => ({
    status: firebaseConfigured() ? 'loading' : 'no_config',
    username: null, userId: null, role: null, error: null,
  }));
  const [lockState, setLockState] = useState<LockState>('unlocked');
  // Suscripción al doc users/{uid} (rol). Se limpia al cambiar de usuario.
  const roleUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!firebaseConfigured()) return;
    const auth = getEcoAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      roleUnsubRef.current?.();
      roleUnsubRef.current = null;
      if (!user) {
        setState({ status: 'needs_login', username: null, userId: null, role: null, error: null });
        setLockState('unlocked');
        return;
      }
      // Login fresco entra directo; sesión persistida con PIN arranca bloqueada;
      // sin PIN tras login fresco se ofrece crearlo una vez.
      setLockState(hasLockPin(user.uid)
        ? (justLoggedIn ? 'unlocked' : 'locked')
        : (justLoggedIn ? 'setup' : 'unlocked'));
      justLoggedIn = false;
      setState({ status: 'authenticated', username: displayNameOf(user), userId: user.uid, role: null, error: null });
      // Suscripción en vivo al rol/estado: promover/deshabilitar desde la consola
      // admin se refleja al instante (el plan: control en la nube sin claims).
      roleUnsubRef.current = onSnapshot(refs.user(user.uid), (snap) => {
        const data = snap.data();
        if (data?.disabled) {
          void fbSignOut(auth);
          setState({ status: 'needs_login', username: null, userId: null, role: null, error: 'Tu cuenta fue deshabilitada.' });
          return;
        }
        setState((s) => s.userId === user.uid ? { ...s, role: (data?.role as Role) ?? 'member' } : s);
      }, () => { /* sin acceso al doc → rol member por defecto */ });
    });
    return () => { unsub(); roleUnsubRef.current?.(); };
  }, []);

  useEffect(() => { writeProfileUsername(state.username); }, [state.username]);

  const login = useCallback(async ({ email, password }: LoginPayload): Promise<AuthResult> => {
    try {
      justLoggedIn = true;
      await signInWithEmailAndPassword(getEcoAuth(), email.trim(), password);
      return { ok: true };
    } catch (e) {
      justLoggedIn = false;
      return { ok: false, error: translateAuthError(e) };
    }
  }, []);

  const register = useCallback(async ({ email, password, displayName }: RegisterPayload): Promise<AuthResult> => {
    try {
      const cred = await createUserWithEmailAndPassword(getEcoAuth(), email.trim(), password);
      const name = (displayName ?? '').trim();
      if (name) { try { await updateProfile(cred.user, { displayName: name }); } catch { /* noop */ } }
      // Crea el doc users/{uid} (rol member). Las Rules solo permiten auto-crearlo
      // con role 'member'; el primer admin se promueve con scripts/bootstrap-admin.
      const ref = refs.user(cred.user.uid);
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        await setDoc(ref, {
          role: 'member',
          email: cred.user.email ?? email.trim(),
          displayName: name || (cred.user.email ?? email.trim()).split('@')[0],
          disabled: false,
          createdAt: serverTimestamp() as unknown as number,
        });
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: translateAuthError(e) };
    }
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    try {
      await sendPasswordResetEmail(getEcoAuth(), email.trim());
      return { ok: true };
    } catch (e) {
      return { ok: false, error: translateAuthError(e) };
    }
  }, []);

  const signOut = useCallback(async () => {
    const uid = getEcoAuth().currentUser?.uid;
    if (uid) clearLockPin(uid);
    try { await fbSignOut(getEcoAuth()); } catch { /* noop */ }
  }, []);

  // Bloquear: NO cierra la sesión de Firebase — solo gatea la UI con el PIN
  // local. Si no hay PIN configurado, ofrece crearlo.
  const lock = useCallback(() => {
    const uid = getEcoAuth().currentUser?.uid;
    if (!uid) return;
    setLockState(hasLockPin(uid) ? 'locked' : 'setup');
  }, []);

  const unlock = useCallback(async (pin: string): Promise<AuthResult> => {
    const uid = getEcoAuth().currentUser?.uid;
    if (!uid) return { ok: false, error: 'Sesión no iniciada' };
    if (await verifyLockPin(uid, pin)) { setLockState('unlocked'); return { ok: true }; }
    return { ok: false, error: 'PIN incorrecto' };
  }, []);

  const createPin = useCallback(async (pin: string): Promise<AuthResult> => {
    const uid = getEcoAuth().currentUser?.uid;
    if (!uid) return { ok: false, error: 'Sesión no iniciada' };
    await setLockPin(uid, pin);
    setLockState('unlocked');
    return { ok: true };
  }, []);

  const skipPinSetup = useCallback(() => { setLockState('unlocked'); }, []);

  // Cambiar la contraseña de Firebase. Re-autentica con la actual (Firebase lo
  // exige para operaciones sensibles) y luego actualiza.
  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<AuthResult> => {
    const user = getEcoAuth().currentUser;
    if (!user || !user.email) return { ok: false, error: 'Sesión no iniciada' };
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      const msg = (code === 'auth/invalid-credential' || code === 'auth/wrong-password')
        ? 'La contraseña actual es incorrecta.'
        : code === 'auth/weak-password' ? 'La nueva contraseña debe tener al menos 6 caracteres.'
        : translateAuthError(e);
      return { ok: false, error: msg };
    }
  }, []);

  return { state, lockState, login, register, resetPassword, signOut, lock, unlock, createPin, skipPinSetup, changePassword };
}
