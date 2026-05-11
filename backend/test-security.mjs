import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const TOKEN = readFileSync(`${homedir()}/.eco/token`, 'utf-8').trim();
const URL = 'ws://127.0.0.1:7000/ws';
const AUTH_HEADER = { Authorization: `Bearer ${TOKEN}` };
const ALLOWED_ORIGIN = 'http://localhost:5173';

let pass = 0, fail = 0;
const log = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`, detail); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}`, detail); }
};

function once(ws, evt) {
  return new Promise((resolve) => ws.once(evt, (...a) => resolve(a)));
}

async function expectClose(ws, expectedCode) {
  const [code] = await once(ws, 'unexpected-response').catch(() => [null]);
  return null;
}

async function connect(opts = {}) {
  const headers = opts.skipAuth ? {} : AUTH_HEADER;
  const origin = opts.origin === undefined ? ALLOWED_ORIGIN : opts.origin;
  if (origin) headers.Origin = origin;
  const ws = new WebSocket(URL, { headers });
  ws.on('error', () => {});
  return ws;
}

async function test(name, fn) {
  try { await fn(); }
  catch (e) { log(name, false, '— ' + e.message); }
}

console.log('\n🔒 Tests de seguridad del backend Eco\n');

// 1. Conexión sin token
await test('Sin token → 401', async () => {
  const ws = await connect({ skipAuth: true });
  const result = await new Promise((res) => {
    ws.once('unexpected-response', (_req, r) => res(r.statusCode));
    ws.once('open', () => res('opened'));
    setTimeout(() => res('timeout'), 2000);
  });
  try { ws.close(); } catch {}
  log('Sin token → 401', result === 401, `recibido: ${result}`);
});

// 2. Conexión con token malo
await test('Token inválido → 401', async () => {
  const ws = new WebSocket(URL, { headers: { Authorization: 'Bearer xxxinvalidoxxx', Origin: ALLOWED_ORIGIN } });
  ws.on('error', () => {});
  const result = await new Promise((res) => {
    ws.once('unexpected-response', (_req, r) => res(r.statusCode));
    ws.once('open', () => res('opened'));
    setTimeout(() => res('timeout'), 2000);
  });
  try { ws.close(); } catch {}
  log('Token inválido → 401', result === 401, `recibido: ${result}`);
});

// 3. Origin no permitido
await test('Origin no permitido → 403', async () => {
  const ws = await connect({ origin: 'https://evil.com' });
  const result = await new Promise((res) => {
    ws.once('unexpected-response', (_req, r) => res(r.statusCode));
    ws.once('open', () => res('opened'));
    setTimeout(() => res('timeout'), 2000);
  });
  try { ws.close(); } catch {}
  log('Origin no permitido → 403', result === 403, `recibido: ${result}`);
});

// 4. Mensaje fuera de esquema
await test('Mensaje fuera de esquema → invalid_message', async () => {
  const ws = await connect();
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'prompt', badField: 42 }));
  const [raw] = await once(ws, 'message');
  const msg = JSON.parse(raw.toString());
  ws.close();
  log('Esquema inválido → invalid_message', msg.type === 'error' && msg.code === 'invalid_message', JSON.stringify(msg));
});

// 5. JSON inválido
await test('JSON corrupto → invalid_json', async () => {
  const ws = await connect();
  await once(ws, 'open');
  ws.send('xxx no es json');
  const [raw] = await once(ws, 'message');
  const msg = JSON.parse(raw.toString());
  ws.close();
  log('JSON corrupto → invalid_json', msg.type === 'error' && msg.code === 'invalid_json', JSON.stringify(msg));
});

// 6. Workspace fuera del whitelist
await test('Workspace fuera del whitelist → rechazado', async () => {
  const ws = await connect();
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'prompt', text: 'hola', workspace: '/etc' }));
  // Esperar mensaje de error (puede haber sdk_messages antes en algunas implementaciones, aquí debería fallar inmediato)
  let denied = false;
  const timeout = setTimeout(() => ws.close(), 5000);
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'error' && /no permitido|Workspace/.test(msg.message)) {
      denied = true;
      clearTimeout(timeout);
      ws.close();
    }
  });
  await new Promise((res) => ws.on('close', res));
  log('Workspace fuera whitelist → bloqueado', denied);
});

// 7. Conexión válida (sanity check)
await test('Conexión válida + ping prompt corto', async () => {
  const ws = await connect();
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'prompt', text: 'Responde solo: pong. Nada más.' }));
  let done = false;
  const timeout = setTimeout(() => ws.close(), 60000);
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'done') { done = true; clearTimeout(timeout); ws.close(); }
    if (msg.type === 'error') { clearTimeout(timeout); ws.close(); }
  });
  await new Promise((res) => ws.on('close', res));
  log('Conexión válida + done', done);
});

console.log(`\n\x1b[1mResumen:\x1b[0m ${pass} OK, ${fail} fallaron\n`);
process.exit(fail > 0 ? 1 : 0);
