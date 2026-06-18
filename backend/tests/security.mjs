// Security test suite for the Eco backend (Firebase auth model).
//
// Negative/structural checks run WITHOUT a login (host check, origin check,
// X-Eco-Client gate, WS rejection without a valid Firebase ID token, etc.).
//
// Positive/integration checks (a WS that actually opens, message-schema and
// workspace-whitelist enforcement, prompt-injection defense, /dev/skill input
// validation) need a real Firebase ID token. The suite obtains one via the
// Firebase Auth REST API when these env vars are set, otherwise it SKIPS them:
//   ECO_TEST_EMAIL, ECO_TEST_PASSWORD
//   VITE_FIREBASE_API_KEY (or ECO_FIREBASE_API_KEY)  — public web API key
//
// Port: ECO_PORT (default 7050, the dev backend). NOTE: :7000 is AirPlay on macOS.

import WebSocket from 'ws';

const HOST = '127.0.0.1';
const PORT = Number(process.env.ECO_PORT ?? 7050);
const WS_URL = `ws://${HOST}:${PORT}/ws`;
const HTTP_URL = `http://${HOST}:${PORT}`;
const ALLOWED_ORIGIN = 'http://localhost:5173';
const API_KEY = process.env.VITE_FIREBASE_API_KEY ?? process.env.ECO_FIREBASE_API_KEY ?? '';

let pass = 0, fail = 0, skip = 0;
const log = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`, detail); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}`, detail); }
};
const skipped = (name, why) => { skip++; console.log(`  \x1b[33m∼\x1b[0m ${name} — skipped (${why})`); };

function once(ws, evt) {
  return new Promise((resolve) => ws.once(evt, (...a) => resolve(a)));
}

// Obtain a Firebase ID token for the positive tests, or null if not configured.
async function getIdToken() {
  const email = process.env.ECO_TEST_EMAIL;
  const password = process.env.ECO_TEST_PASSWORD;
  if (!email || !password || !API_KEY) return null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const d = await r.json();
    return typeof d.idToken === 'string' ? d.idToken : null;
  } catch { return null; }
}

// WS connect. `idToken` → sent as the `eco.idtoken.<jwt>` subprotocol (the model
// the backend expects); omit to test rejection.
function connectWs(opts = {}) {
  const headers = {};
  if (opts.origin !== null) headers.Origin = opts.origin ?? ALLOWED_ORIGIN;
  if (opts.fakeHost) headers.Host = opts.fakeHost;
  const protocols = opts.idToken ? [`eco.idtoken.${opts.idToken}`] : [];
  const ws = new WebSocket(WS_URL, protocols, { headers });
  ws.on('error', () => {});
  return ws;
}

function waitConnectStatus(ws) {
  return new Promise((res) => {
    ws.once('unexpected-response', (_req, r) => res(r.statusCode));
    ws.once('open', () => res('opened'));
    setTimeout(() => res('timeout'), 3000);
  });
}

async function test(name, fn) {
  try { await fn(); }
  catch (e) { log(name, false, '— ' + e.message); }
}

console.log('\n🔒 Security tests — Eco backend (Firebase auth)\n');
console.log(`   target: ${HTTP_URL}\n`);

const idToken = await getIdToken();
if (!idToken) {
  console.log('   (no ECO_TEST_EMAIL/PASSWORD + API key → integration tests will be skipped)\n');
}

// === HTTP — negative / structural (no login needed) ===

await test('GET /health no auth → 200', async () => {
  const r = await fetch(`${HTTP_URL}/health`);
  log('GET /health no auth → 200', r.status === 200, `got ${r.status}`);
});

await test('GET /info no token → 401', async () => {
  const r = await fetch(`${HTTP_URL}/info`, { headers: { 'X-Eco-Client': '1' } });
  log('GET /info no token → 401', r.status === 401, `got ${r.status}`);
});

await test('GET /info no X-Eco-Client → 400', async () => {
  const r = await fetch(`${HTTP_URL}/info`, { headers: { Authorization: 'Bearer whatever' } });
  log('GET /info no X-Eco-Client → 400', r.status === 400, `got ${r.status}`);
});

await test('GET /info bad token → 401', async () => {
  const r = await fetch(`${HTTP_URL}/info`, { headers: { Authorization: 'Bearer not-a-jwt', 'X-Eco-Client': '1' } });
  log('GET /info bad token → 401', r.status === 401, `got ${r.status}`);
});

await test('Host evil.com → 403 (DNS rebinding)', async () => {
  const { connect } = await import('node:net');
  const req = 'GET /health HTTP/1.1\r\nHost: evil.com\r\nConnection: close\r\n\r\n';
  const status = await new Promise((res) => {
    const sock = connect(PORT, HOST, () => sock.write(req));
    let buf = '';
    sock.on('data', (d) => { buf += d.toString('utf-8'); });
    sock.on('end', () => { const m = /^HTTP\/1\.\d (\d{3})/.exec(buf); res(m ? Number(m[1]) : 0); });
    sock.on('error', () => res(0));
    setTimeout(() => { sock.destroy(); res(0); }, 3000);
  });
  log('Host evil.com → 403', status === 403, `got ${status}`);
});

// === WebSocket — negative (no valid ID token) ===

await test('WS no token → 401', async () => {
  const ws = connectWs();
  const r = await waitConnectStatus(ws);
  try { ws.close(); } catch {}
  log('WS no token → 401', r === 401, `got ${r}`);
});

await test('WS invalid token → 401', async () => {
  const ws = connectWs({ idToken: 'xxxinvalidoxxx' });
  const r = await waitConnectStatus(ws);
  try { ws.close(); } catch {}
  log('WS invalid token → 401', r === 401, `got ${r}`);
});

await test('WS bad origin → 403', async () => {
  const ws = connectWs({ origin: 'https://evil.com', idToken });
  const r = await waitConnectStatus(ws);
  try { ws.close(); } catch {}
  log('WS bad origin → 403', r === 403, `got ${r}`);
});

await test('WS fake Host → 403 (DNS rebinding)', async () => {
  const ws = connectWs({ fakeHost: 'evil.com', idToken });
  const r = await waitConnectStatus(ws);
  try { ws.close(); } catch {}
  log('WS fake Host → 403', r === 403, `got ${r}`);
});

// === Integration — require a valid ID token ===

if (!idToken) {
  skipped('WS valid connection', 'no test creds');
  skipped('WS corrupt JSON → invalid_json', 'no test creds');
  skipped('WS invalid schema → invalid_message', 'no test creds');
  skipped('Workspace /etc → blocked', 'no test creds');
  skipped('POST /dev/skill injection → 400', 'no test creds');
} else {
  await test('WS valid connection → opened', async () => {
    const ws = connectWs({ idToken });
    const r = await waitConnectStatus(ws);
    try { ws.close(); } catch {}
    log('WS valid connection → opened', r === 'opened', `got ${r}`);
  });

  await test('WS corrupt JSON → invalid_json', async () => {
    const ws = connectWs({ idToken });
    await once(ws, 'open');
    ws.send('xxx');
    const [raw] = await once(ws, 'message');
    const msg = JSON.parse(raw.toString());
    ws.close();
    log('WS corrupt JSON → invalid_json', msg.type === 'error' && msg.code === 'invalid_json');
  });

  await test('WS invalid schema → invalid_message', async () => {
    const ws = connectWs({ idToken });
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'prompt' }));
    const [raw] = await once(ws, 'message');
    const msg = JSON.parse(raw.toString());
    ws.close();
    log('WS invalid schema → invalid_message', msg.type === 'error' && msg.code === 'invalid_message');
  });

  await test('Workspace outside whitelist (/etc) → blocked', async () => {
    const ws = connectWs({ idToken });
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'prompt', text: 'hola', workspace: '/etc' }));
    let denied = false;
    await new Promise((res) => {
      ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'error') { denied = true; ws.close(); }
      });
      ws.on('close', res);
      setTimeout(() => { ws.close(); res(); }, 5000);
    });
    log('Workspace /etc → blocked', denied);
  });

  await test('POST /dev/skill injection → 400', async () => {
    const r = await fetch(`${HTTP_URL}/dev/skill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Eco-Client': '1', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ workspace: process.cwd(), bubbleId: 'b_test', skill: 'x; rm -rf /', action: 'status' }),
    });
    log('POST /dev/skill injection → 400', r.status === 400, `got ${r.status}`);
  });
}

console.log(`\n\x1b[1mSummary:\x1b[0m ${pass} OK, ${fail} failed, ${skip} skipped\n`);
process.exit(fail > 0 ? 1 : 0);
