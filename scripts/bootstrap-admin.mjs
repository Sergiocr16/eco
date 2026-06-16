#!/usr/bin/env node
// Bootstrap del PRIMER admin de Eco. Corre LOCAL en la máquina del dueño con
// una service-account de Firebase; NUNCA se empaqueta en la app distribuida.
//
// Hace falta porque setear el rol requiere privilegio: las Security Rules dejan
// que un admin escriba el role de otros, pero el primer admin no existe todavía.
// Una vez que hay un admin, los demás se promueven desde la consola admin
// (write a users/{uid}.role, permitido por las Rules).
//
// Uso:
//   GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json \
//     node scripts/bootstrap-admin.mjs admin@aditumcr.com
//
//   o bien:  node scripts/bootstrap-admin.mjs admin@aditumcr.com ./service-account.json
//
// El usuario debe haberse registrado antes en la app (email/password) para que
// exista en Firebase Auth.

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const email = process.argv[2];
const credArg = process.argv[3];

if (!email) {
  console.error('Falta el email. Uso: node scripts/bootstrap-admin.mjs <email> [service-account.json]');
  process.exit(1);
}

const credPath = credArg || process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('Falta la service-account: pasala como 2º argumento o seteá GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
} catch (e) {
  console.error(`No pude leer la service-account en ${credPath}: ${e.message}`);
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db = getFirestore();

try {
  const user = await auth.getUserByEmail(email);
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  await ref.set(
    {
      role: 'admin',
      email: user.email ?? email,
      displayName: user.displayName ?? (user.email ?? email).split('@')[0],
      disabled: false,
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  console.log(`OK: ${email} (uid ${user.uid}) es admin.`);
  process.exit(0);
} catch (e) {
  if (e.code === 'auth/user-not-found') {
    console.error(`No existe un usuario con email ${email}. Registralo primero en la app.`);
  } else {
    console.error(`Error: ${e.message}`);
  }
  process.exit(1);
}
