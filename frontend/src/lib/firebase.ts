// Inicialización del Firebase client SDK (Auth + Firestore). Firestore es la
// fuente de verdad del estado multi-tenant (users, bubbles, mensajes, etc.);
// el backend local NO toca Firestore — solo verifica el ID token. Ver el plan
// de migración. La config web de Firebase es PÚBLICA (no es secreta): la
// seguridad real son las Security Rules en firestore.rules.

import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth, initializeAuth, inMemoryPersistence, createUserWithEmailAndPassword, signOut,
  type Auth,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function readConfig(): FirebaseConfig | null {
  const env = import.meta.env;
  const cfg: FirebaseConfig = {
    apiKey: (env.VITE_FIREBASE_API_KEY as string) ?? '',
    authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string) ?? '',
    projectId: (env.VITE_FIREBASE_PROJECT_ID as string) ?? '',
    storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET as string) ?? '',
    messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) ?? '',
    appId: (env.VITE_FIREBASE_APP_ID as string) ?? '',
  };
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) return null;
  return cfg;
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function ensureApp(): FirebaseApp {
  if (app) return app;
  const cfg = readConfig();
  if (!cfg) {
    throw new Error(
      'Firebase no está configurado: faltan las VITE_FIREBASE_* en el build. Ver frontend/.env.example',
    );
  }
  app = initializeApp(cfg);
  // Offline persistence: sirve el primer paint desde IndexedDB y encola writes
  // sin red. persistentMultipleTabManager soporta varias ventanas (la app abre
  // ventanas satélite "solo bubble").
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // Los objetos Bubble/Message tienen campos opcionales que llegan como
    // undefined; sin esto Firestore tira "Unsupported field value: undefined"
    // y la escritura falla (las bubbles no persistían).
    ignoreUndefinedProperties: true,
  });
  authInstance = getAuth(app);
  return app;
}

export function firebaseConfigured(): boolean {
  return readConfig() !== null;
}

export function firebaseProjectId(): string {
  return readConfig()?.projectId ?? '';
}

export function getEcoAuth(): Auth {
  ensureApp();
  return authInstance!;
}

export function getDb(): Firestore {
  ensureApp();
  return dbInstance!;
}

// Crea un usuario de Firebase Auth SIN tocar la sesión del admin que lo crea.
// Truco: una instancia SECUNDARIA de Firebase (auth in-memory) hace el
// createUser; se cierra al toque. Permite que el admin dé de alta gente desde la
// app sin Admin SDK ni Cloud Functions (la sesión primaria queda intacta).
export async function createUserAsAdmin(email: string, password: string): Promise<{ uid: string }> {
  const cfg = readConfig();
  if (!cfg) throw new Error('Firebase no está configurado');
  const secondary = initializeApp(cfg, `eco-admin-create-${Date.now()}`);
  try {
    const secAuth = initializeAuth(secondary, { persistence: inMemoryPersistence });
    const cred = await createUserWithEmailAndPassword(secAuth, email.trim(), password);
    const uid = cred.user.uid;
    try { await signOut(secAuth); } catch { /* noop */ }
    return { uid };
  } finally {
    try { await deleteApp(secondary); } catch { /* noop */ }
  }
}

// ID token del usuario logueado (o null si no hay sesión / Firebase no
// configurado). El SDK lo cachea y lo refresca solo; getIdToken() devuelve uno
// fresco. Se manda como Bearer a cada request del backend local y como
// subprotocolo WS (eco.idtoken.<jwt>).
export async function currentIdToken(): Promise<string | null> {
  if (!firebaseConfigured()) return null;
  const user = getEcoAuth().currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}
