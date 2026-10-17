// Verificación del Firebase ID token en el backend local, SIN service-account.
// El frontend autentica con Firebase Auth y manda el ID token (JWT) en
// `Authorization: Bearer <idToken>`. Acá lo verificamos contra las claves
// públicas de Google con `jose`. De ahí sale el uid (campo `sub`).
//
// El backend NO es la frontera de autorización (eso son las Security Rules de
// Firestore): solo necesita el uid para taggear worktrees, ownerId y la
// identidad de los spawns. El rol admin/member es un asunto del frontend.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

// Firebase ID-token claims we read beyond the standard JWT ones.
interface FirebaseTokenPayload extends JWTPayload {
  email?: string;
}

// JWKS de Firebase (formato JWK). jose cachea las claves y respeta el
// Cache-Control de Google; rota solas.
const JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
);

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

// Cache largo a propósito: con el default (10 min) cada verificación volvía a
// pedir el JWKS, y recién despierta la máquina no hay red → 401 en todos los
// requests y upgrades hasta que volvía. jose igual refetchea ante un `kid`
// desconocido (rotación de claves de Google), respetando el cooldown.
const JWKS_OPTIONS = {
  cacheMaxAge: 24 * 60 * 60 * 1000,
  cooldownDuration: 30_000,
  timeoutDuration: 5_000,
};

// Tokens ya verificados, hasta su `exp`. Una reconexión o un request con el
// mismo token no vuelve a tocar JWKS ni hacer crypto, y pasa aunque Google no
// responda. El vencimiento se sigue respetando localmente.
const VERIFIED_MAX = 256;
const verifiedTokens = new Map<string, VerifiedUser & { exp: number }>();

function fromCache(token: string): VerifiedUser | null {
  const hit = verifiedTokens.get(token);
  if (!hit) return null;
  if (hit.exp * 1000 <= Date.now()) {
    verifiedTokens.delete(token);
    return null;
  }
  return { uid: hit.uid, email: hit.email };
}

function remember(token: string, user: VerifiedUser, exp: number): void {
  if (verifiedTokens.size >= VERIFIED_MAX) {
    const now = Date.now();
    for (const [k, v] of verifiedTokens) {
      if (v.exp * 1000 <= now) verifiedTokens.delete(k);
    }
    if (verifiedTokens.size >= VERIFIED_MAX) {
      const oldest = verifiedTokens.keys().next().value;
      if (oldest !== undefined) verifiedTokens.delete(oldest);
    }
  }
  verifiedTokens.set(token, { ...user, exp });
}

function projectId(): string {
  return (
    process.env.ECO_FIREBASE_PROJECT_ID ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    ''
  ).trim();
}

export function firebaseAuthConfigured(): boolean {
  return projectId().length > 0;
}

export type VerifiedUser = { uid: string; email?: string };

/**
 * Verifica un Firebase ID token. Devuelve el uid si es válido, o null si el
 * token es inválido/expirado o falta configuración. Nunca lanza.
 */
export async function verifyFirebaseIdToken(token: string | null | undefined): Promise<VerifiedUser | null> {
  if (!token) return null;
  const pid = projectId();
  if (!pid) return null;
  const cached = fromCache(token);
  if (cached) return cached;
  if (!jwks) jwks = createRemoteJWKSet(JWKS_URL, JWKS_OPTIONS);
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${pid}`,
      audience: pid,
    });
    const p = payload as FirebaseTokenPayload;
    const uid = typeof p.sub === 'string' ? p.sub : null;
    if (!uid) return null;
    const email = typeof p.email === 'string' ? p.email : undefined;
    const user: VerifiedUser = { uid, email };
    if (typeof p.exp === 'number') remember(token, user, p.exp);
    return user;
  } catch {
    return null;
  }
}
