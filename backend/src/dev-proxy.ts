// Proxy local por dev server para las previews por la tailnet.
//
// `tailscale serve` habla h2 con el navegador pero, apuntado a http://, abre
// una conexión TCP nueva al dev server por cada request en vuelo (su Transport
// usa MaxIdleConnsPerHost=2). Un index con ~1500 <script> genera ~250 connects
// simultáneos y macOS corta todo lo que pase de kern.ipc.somaxconn (128) con
// RST → Tailscale devuelve 502 al azar. Apuntado a https+insecure:// negocia
// h2 por ALPN y multiplexa todo en UNA conexión hacia este proxy, que reenvía
// al dev server con un pool acotado (MAX_UPSTREAM_SOCKETS) y cola interna.
//
// Las conexiones HTTP/1.1 (WebSockets: Go nunca usa h2 para un upgrade) caen
// en allowHTTP1 y el evento 'upgrade' hace un túnel TCP al dev server.

import http from 'node:http';
import http2 from 'node:http2';
import net, { type AddressInfo } from 'node:net';
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Duplex } from 'node:stream';

const MAX_UPSTREAM_SOCKETS = 32;
const ECO_DIR = join(homedir(), '.eco');
const CERT_PATH = join(ECO_DIR, 'dev-proxy-cert.pem');
const KEY_PATH = join(ECO_DIR, 'dev-proxy-key.pem');
const CERT_DAYS = 3650;
const RENEW_BEFORE_MS = 30 * 86_400_000;

// Hop-by-hop: no viajan de un salto al otro, y en h2 son ilegales (Node tira
// ERR_HTTP2_INVALID_CONNECTION_HEADERS si una respuesta las lleva).
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding',
  'upgrade', 'te', 'trailer', 'http2-settings',
]);

export type DevProxy = { port: number; close: () => void };

// ─── Cert self-signed ─────────────────────────────────────────────────────
// Tailscale no lo verifica (https+insecure), pero Go igual lo PARSEA, así que
// tiene que ser un X.509 bien formado. Se arma a mano en DER para no sumar una
// dependencia ni depender de `openssl` (no existe en Windows).

function derLen(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function der(tag: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), derLen(body.length), body]);
}
const seq = (...p: Buffer[]) => der(0x30, ...p);
function oid(dotted: string): Buffer {
  const [a, b, ...rest] = dotted.split('.').map(Number);
  const out = [40 * a + b];
  for (const n of rest) {
    const chunk = [n & 0x7f];
    for (let v = n >> 7; v > 0; v >>= 7) chunk.unshift(0x80 | (v & 0x7f));
    out.push(...chunk);
  }
  return der(0x06, Buffer.from(out));
}
function utcTime(d: Date): Buffer {
  const s = d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
  return der(0x17, Buffer.from(s, 'ascii'));
}

function buildSelfSigned(): { keyPem: string; certPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const ecdsaSha256 = seq(oid('1.2.840.10045.4.3.2'));
  const name = seq(der(0x31, seq(oid('2.5.4.3'), der(0x0c, Buffer.from('localhost')))));
  const serial = randomBytes(16);
  serial[0] &= 0x7f; // INTEGER positivo
  const now = Date.now();
  const san = seq(seq(
    oid('2.5.29.17'),
    der(0x04, seq(der(0x82, Buffer.from('localhost')), der(0x87, Buffer.from([127, 0, 0, 1])))),
  ));
  const tbs = seq(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, serial),
    ecdsaSha256,
    name,
    seq(utcTime(new Date(now - 86_400_000)), utcTime(new Date(now + CERT_DAYS * 86_400_000))),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, san),
  );
  const sig = sign('sha256', tbs, privateKey);
  const cert = seq(tbs, ecdsaSha256, der(0x03, Buffer.concat([Buffer.from([0]), sig])));
  const b64 = cert.toString('base64').replace(/.{1,64}/g, '$&\n');
  return {
    keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    certPem: `-----BEGIN CERTIFICATE-----\n${b64}-----END CERTIFICATE-----\n`,
  };
}

let cached: { key: string; cert: string } | null = null;

function loadOrCreateCert(): { key: string; cert: string } {
  if (cached && Date.parse(new X509Certificate(cached.cert).validTo) - Date.now() > RENEW_BEFORE_MS) return cached;
  try {
    if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) {
      const cert = readFileSync(CERT_PATH, 'utf8');
      const key = readFileSync(KEY_PATH, 'utf8');
      const x = new X509Certificate(cert);
      const matches = createPublicKey(createPrivateKey(key)).export({ type: 'spki', format: 'der' })
        .equals(x.publicKey.export({ type: 'spki', format: 'der' }));
      if (matches && Date.parse(x.validTo) - Date.now() > RENEW_BEFORE_MS) {
        cached = { key, cert };
        return cached;
      }
    }
  } catch { /* ilegible o corrupto: se regenera */ }
  const { keyPem, certPem } = buildSelfSigned();
  mkdirSync(ECO_DIR, { recursive: true });
  writeFileSync(KEY_PATH, keyPem);
  writeFileSync(CERT_PATH, certPem);
  try { chmodSync(KEY_PATH, 0o600); chmodSync(CERT_PATH, 0o600); } catch { /* NTFS */ }
  cached = { key: keyPem, cert: certPem };
  return cached;
}

// ─── Proxy ────────────────────────────────────────────────────────────────

type AnyReq = http.IncomingMessage | http2.Http2ServerRequest;
// Solo la parte común de las dos respuestas (la unión no es invocable en TS).
type AnyRes = {
  writeHead(status: number, headers: http.OutgoingHttpHeaders): unknown;
  end(body?: string): unknown;
  destroy(err?: Error): unknown;
  on(ev: 'close', fn: () => void): unknown;
  readonly headersSent: boolean;
  readonly writableFinished: boolean;
};

function upstreamHeaders(req: AnyReq): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined || k.startsWith(':') || HOP_BY_HOP.has(k)) continue;
    out[k] = v;
  }
  const authority = req.headers[':authority'];
  if (typeof authority === 'string' && authority) out.host = authority;
  return out;
}

function downstreamHeaders(res: http.IncomingMessage): http.OutgoingHttpHeaders {
  const listed = new Set(
    String(res.headers.connection ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(res.headers)) {
    if (v === undefined || HOP_BY_HOP.has(k) || listed.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function startDevProxy(targetPort: number, log: (line: string) => void): Promise<DevProxy> {
  const { key, cert } = loadOrCreateCert();
  const agent = new http.Agent({ keepAlive: true, maxSockets: MAX_UPSTREAM_SOCKETS });

  // Una ráfaga contra un dev server caído daría cientos de líneas idénticas.
  let lastLogAt = 0;
  let suppressed = 0;
  const logError = (msg: string) => {
    const now = Date.now();
    if (now - lastLogAt < 2000) { suppressed += 1; return; }
    const extra = suppressed > 0 ? ` (+${suppressed} similares)` : '';
    suppressed = 0;
    lastLogAt = now;
    log(`[eco proxy] ${msg}${extra}\n`);
  };

  const onRequest = (req: AnyReq, res: AnyRes) => {
    const up = http.request({
      host: '127.0.0.1',
      port: targetPort,
      method: req.method,
      path: req.url,
      headers: upstreamHeaders(req),
      agent,
    });
    up.on('response', (upRes) => {
      try {
        res.writeHead(upRes.statusCode ?? 502, downstreamHeaders(upRes));
      } catch (e) {
        upRes.resume();
        res.destroy(e as Error);
        return;
      }
      upRes.pipe(res as unknown as NodeJS.WritableStream);
    });
    up.on('error', (e) => {
      logError(`${req.method} ${req.url} → 127.0.0.1:${targetPort}: ${e.message}`);
      if (!res.headersSent) {
        try {
          res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
          res.end(`Eco: el dev server en 127.0.0.1:${targetPort} no respondió (${e.message}).\n`);
          return;
        } catch { /* stream ya cerrado */ }
      }
      res.destroy();
    });
    // Cliente que se va (recarga, navegación): liberar el socket del pool.
    res.on('close', () => { if (!res.writableFinished) up.destroy(); });
    (req as NodeJS.ReadableStream).pipe(up);
  };

  const server = http2.createSecureServer(
    {
      key,
      cert,
      allowHTTP1: true,
      // Cientos de streams en vuelo con el default (10 MB) disparan
      // ENHANCE_YOUR_CALM y Node cierra la sesión entera.
      maxSessionMemory: 128,
      settings: { maxConcurrentStreams: 1000 },
    },
    onRequest as unknown as (req: http2.Http2ServerRequest, res: http2.Http2ServerResponse) => void,
  );
  server.setTimeout(0);

  server.on('upgrade', (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const upstream = net.connect(targetPort, '127.0.0.1', () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      upstream.write(lines.join('\r\n') + '\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', (e) => {
      logError(`upgrade ${req.url} → 127.0.0.1:${targetPort}: ${e.message}`);
      socket.destroy();
    });
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
    upstream.on('close', () => socket.destroy());
  });

  const sockets = new Set<net.Socket>();
  server.on('connection', (s: net.Socket) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  server.on('error', (e) => logError(`servidor: ${e.message}`));

  return {
    port: (server.address() as AddressInfo).port,
    close: () => {
      server.close();
      for (const s of sockets) s.destroy();
      agent.destroy();
    },
  };
}
