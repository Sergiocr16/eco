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
  if (!jwks) jwks = createRemoteJWKSet(JWKS_URL);
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${pid}`,
      audience: pid,
    });
    const p = payload as FirebaseTokenPayload;
    const uid = typeof p.sub === 'string' ? p.sub : null;
    if (!uid) return null;
    const email = typeof p.email === 'string' ? p.email : undefined;
    return { uid, email };
  } catch {
    return null;
  }
}
