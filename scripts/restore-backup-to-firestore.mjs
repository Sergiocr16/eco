#!/usr/bin/env node
// Restaura selectivamente los datos de un backup viejo de Eco a Firestore.
// One-time, con Admin SDK (NO se distribuye). Crea las cuentas Firebase de los
// usuarios indicados (si no existen) y sube sus docs del doc-store
// (bubbles/categorías/notas/review/prefs) a Firestore bajo su uid.
//
// Uso:
//   node scripts/restore-backup-to-firestore.mjs <backup.zip> <service-account.json>
//
// El mapeo old-id → email está embebido abajo (específico de este restore).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const zip = process.argv[2];
const credPath = process.argv[3] || process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!zip || !credPath) {
  console.error('Uso: node scripts/restore-backup-to-firestore.mjs <backup.zip> <service-account.json>');
  process.exit(1);
}

// old hex id (del backup) → cuenta Firebase destino.
const MAP = {
  '0300595a57285ad1': { email: 'sergio@aditumcr.com', username: 'sergio' },
  'd161c4cbcc3551d2': { email: 'feysmar@aditumcr.com', username: 'feysmar' },
};

function tempPassword() {
  return `Eco-${Math.random().toString(36).slice(2, 10)}9`;
}

// (colección, docId) para una key del doc-store, dado el uid destino.
function locate(key, uid) {
  if (key === 'prefs') return { col: 'prefs', id: uid };
  if (key === 'categories') return { col: 'categories', id: uid };
  if (key.startsWith('bubble:')) return { col: 'bubbles', id: key.slice('bubble:'.length) };
  if (key.startsWith('notes:')) return { col: 'notes', id: key.slice('notes:'.length) };
  if (key.startsWith('review:')) return { col: 'review', id: key.slice('review:'.length) };
  return null;
}

const metaRaw = execFileSync('unzip', ['-p', zip, 'metadata.json'], { maxBuffer: 256 * 1024 * 1024 });
const meta = JSON.parse(metaRaw.toString('utf8'));
const ecoUsers = meta.eco?.users ?? {};

const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

async function ensureUser(email, username) {
  try {
    const u = await auth.getUserByEmail(email);
    console.log(`  usuario ya existe: ${email} (uid ${u.uid})`);
    return { uid: u.uid, created: false, password: null };
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    const password = tempPassword();
    const u = await auth.createUser({ email, password, displayName: username });
    console.log(`  usuario creado: ${email} (uid ${u.uid})`);
    return { uid: u.uid, created: true, password };
  }
}

const summary = [];

for (const [oldId, target] of Object.entries(MAP)) {
  console.log(`\n=== ${target.username} (${oldId}) → ${target.email} ===`);
  const { uid, created, password } = await ensureUser(target.email, target.username);

  // Doc de perfil (rol member).
  await db.collection('users').doc(uid).set({
    role: 'member', email: target.email, displayName: target.username, disabled: false,
  }, { merge: true });

  // Subir todos los docs de ese old id.
  const prefix = `${oldId}/docs/`;
  let ok = 0, skip = 0, fail = 0;
  for (const [path, content] of Object.entries(ecoUsers)) {
    if (!path.startsWith(prefix) || !path.endsWith('.json')) continue;
    let parsed;
    try { parsed = JSON.parse(typeof content === 'string' ? content : JSON.stringify(content)); }
    catch { skip++; continue; }
    const key = parsed?.key;
    if (typeof key !== 'string' || typeof parsed.updatedAt !== 'number') { skip++; continue; }
    const loc = locate(key, uid);
    if (!loc) { skip++; continue; }
    try {
      await db.collection(loc.col).doc(loc.id).set({
        ownerId: uid, key, value: parsed.value ?? null, updatedAt: parsed.updatedAt,
      });
      ok++;
    } catch (e) {
      fail++;
      console.warn(`    ! fallo ${key}: ${e.message?.slice(0, 120)}`);
    }
  }
  console.log(`  docs subidos: ${ok} | saltados: ${skip} | fallidos: ${fail}`);
  summary.push({ email: target.email, uid, created, password, ok, fail });
}

console.log('\n=== RESUMEN ===');
for (const s of summary) {
  console.log(`${s.email}  uid=${s.uid}  docs=${s.ok}${s.fail ? ` (fallidos ${s.fail})` : ''}`);
  if (s.created) console.log(`   contraseña temporal: ${s.password}`);
}
process.exit(0);
