// Tests de las Security Rules contra el emulador de Firestore.
// Correr con:  npm run test:rules   (usa firebase emulators:exec)
//
// Cubre los invariantes que el plan marca como riesgo #1: un member no ve datos
// ajenos, el admin ve global, auditLog es append-only, y un usuario no puede
// auto-promoverse a admin.

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'eco-rules-test';
let passed = 0;

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// Siembra users/{uid} (rol) saltándose las reglas.
async function seedUser(uid, role) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), {
      role,
      email: `${uid}@test.com`,
      displayName: uid,
      disabled: false,
    });
  });
}

async function seedBubble(bubbleId, ownerId) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'bubbles', bubbleId), {
      ownerId,
      title: 't',
      workspace: '/w',
      status: 'idle',
      archived: false,
      updatedAt: Date.now(),
    });
  });
}

await env.clearFirestore();
await seedUser('alice', 'member');
await seedUser('bob', 'member');
await seedUser('boss', 'admin');
await seedBubble('b-alice', 'alice');

const alice = env.authenticatedContext('alice').firestore();
const bob = env.authenticatedContext('bob').firestore();
const boss = env.authenticatedContext('boss').firestore();
const anon = env.unauthenticatedContext().firestore();

await test('owner lee su propia bubble', async () => {
  await assertSucceeds(getDoc(doc(alice, 'bubbles', 'b-alice')));
});

await test('member NO lee bubble ajena', async () => {
  await assertFails(getDoc(doc(bob, 'bubbles', 'b-alice')));
});

await test('admin lee bubble ajena (control en la nube)', async () => {
  await assertSucceeds(getDoc(doc(boss, 'bubbles', 'b-alice')));
});

await test('anonimo NO lee nada', async () => {
  await assertFails(getDoc(doc(anon, 'bubbles', 'b-alice')));
});

await test('owner crea bubble con su ownerId', async () => {
  await assertSucceeds(
    setDoc(doc(alice, 'bubbles', 'b-new'), {
      ownerId: 'alice', title: 't', workspace: '/w', status: 'idle', archived: false, updatedAt: Date.now(),
    }),
  );
});

await test('member NO crea bubble con ownerId ajeno', async () => {
  await assertFails(
    setDoc(doc(bob, 'bubbles', 'b-spoof'), {
      ownerId: 'alice', title: 't', workspace: '/w', status: 'idle', archived: false, updatedAt: Date.now(),
    }),
  );
});

await test('usuario NO puede auto-promoverse a admin', async () => {
  await assertFails(updateDoc(doc(alice, 'users', 'alice'), { role: 'admin' }));
});

await test('usuario edita su perfil sin tocar role', async () => {
  await assertSucceeds(updateDoc(doc(alice, 'users', 'alice'), { displayName: 'Alice A' }));
});

await test('admin promueve a otro usuario', async () => {
  await assertSucceeds(updateDoc(doc(boss, 'users', 'bob'), { role: 'admin' }));
  // revertir para no contaminar tests siguientes
  await assertSucceeds(updateDoc(doc(boss, 'users', 'bob'), { role: 'member' }));
});

await test('owner crea evento de auditLog', async () => {
  await assertSucceeds(
    setDoc(doc(alice, 'auditLog', 'e1'), { ownerId: 'alice', actorName: 'alice', type: 'auth.login', ts: Date.now() }),
  );
});

await test('auditLog es append-only (no update ni delete)', async () => {
  await assertFails(updateDoc(doc(alice, 'auditLog', 'e1'), { type: 'x' }));
  await assertFails(deleteDoc(doc(alice, 'auditLog', 'e1')));
});

await test('member NO lee auditLog; admin sí', async () => {
  await assertFails(getDoc(doc(alice, 'auditLog', 'e1')));
  await assertSucceeds(getDoc(doc(boss, 'auditLog', 'e1')));
});

await test('mensajes heredan ownership de la bubble', async () => {
  await assertSucceeds(
    setDoc(doc(alice, 'bubbles', 'b-alice', 'messages', 'm1'), { role: 'user', content: 'hi', createdAt: Date.now(), seq: 1 }),
  );
  await assertFails(
    setDoc(doc(bob, 'bubbles', 'b-alice', 'messages', 'm2'), { role: 'user', content: 'x', createdAt: Date.now(), seq: 2 }),
  );
  await assertSucceeds(getDoc(doc(boss, 'bubbles', 'b-alice', 'messages', 'm1')));
});

await test('workspaceConfig: solo el dueño escribe, admin lee', async () => {
  await assertSucceeds(
    setDoc(doc(alice, 'workspaceConfig', 'alice', 'machines', 'mac1'), { hello: 1 }),
  );
  await assertFails(
    setDoc(doc(bob, 'workspaceConfig', 'alice', 'machines', 'mac1'), { hello: 2 }),
  );
  await assertSucceeds(getDoc(doc(boss, 'workspaceConfig', 'alice', 'machines', 'mac1')));
});

await env.cleanup();
console.log(`\n${passed} tests OK`);
assert.ok(passed >= 14);
