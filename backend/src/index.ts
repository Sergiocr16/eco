import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { config } from './config.js';
import { attachWebSocket, broadcastServerMessage } from './ws-server.js';
import { extractBearer, getOrCreateToken, tokensMatch } from './auth.js';
import { isPiperAvailable, listVoices, synthesize, TTSRequestSchema } from './tts.js';
import { listSkills } from './skills.js';
import { addWorkspace, readStore as readWorkspaceStore, removeWorkspace } from './workspaces-store.js';
import { runShell, ShellRequestSchema } from './shell.js';
import { fileDiff, DiffRequestSchema } from './file-diff.js';
import { writeApiKey, deleteApiKey, hasApiKey, maskedApiKey, validateApiKey } from './api-key-store.js';
import {
  hasUser, statusInfo, registerUser, verifyPin,
  recoverGetNewPhrase, deleteUser,
} from './user-store.js';
import { createSession, destroySession, getSession } from './sessions.js';
import { isAppError } from './app-error.js';
import { z } from 'zod';

function errResponse(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: code, message });
}

function fromException(res: Response, e: unknown, fallbackCode: string, fallbackMsg: string) {
  if (isAppError(e)) return res.status(e.status).json({ error: e.code, message: e.message });
  const msg = e instanceof Error ? e.message : fallbackMsg;
  return res.status(400).json({ error: fallbackCode, message: msg });
}

const authToken = getOrCreateToken();

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: config.allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Eco-Client'],
    credentials: false,
    maxAge: 600,
  }),
);
app.use(express.json({ limit: '128kb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const host = req.headers.host;
  if (!host) return errResponse(res, 403, 'http.host_required', 'Host header requerido');
  const hostname = host.split(':')[0]?.toLowerCase();
  if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '[::1]') {
    return errResponse(res, 403, 'http.host_forbidden', 'Host no permitido');
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const SESSION_HEADER = 'x-eco-session';
const AUTH_FREE_PATHS = new Set(['/auth/status', '/auth/register', '/auth/login', '/auth/recover']);

const RegisterSchema = z.object({
  username: z.string().min(1).max(80),
  pin: z.string().regex(/^\d{4,8}$/, 'El PIN debe tener entre 4 y 8 dígitos'),
});
const LoginSchema = z.object({ pin: z.string().min(1).max(20) });
const RecoverSchema = z.object({
  recoveryPhrase: z.string().min(20).max(400),
  newPin: z.string().regex(/^\d{4,8}$/),
});

app.get('/auth/status', (_req: Request, res: Response) => {
  res.json(statusInfo());
});

app.post('/auth/register', async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', parsed.error.errors[0]?.message ?? 'Datos inválidos');
  try {
    const result = await registerUser(parsed.data.username, parsed.data.pin);
    const session = createSession(result.username);
    res.json({ ok: true, username: result.username, recoveryPhrase: result.recoveryPhrase, session });
  } catch (e) {
    fromException(res, e, 'auth.register_failed', 'Error al registrar');
  }
});

app.post('/auth/login', async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'auth.pin_required', 'PIN requerido');
  if (!hasUser()) return errResponse(res, 400, 'auth.no_user', 'No hay usuario registrado');
  const ok = await verifyPin(parsed.data.pin);
  if (!ok) return errResponse(res, 401, 'auth.pin_wrong', 'PIN incorrecto');
  const info = statusInfo();
  const session = createSession(info.username ?? 'user');
  res.json({ ok: true, username: info.username, session });
});

app.post('/auth/recover', async (req: Request, res: Response) => {
  const parsed = RecoverSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', parsed.error.errors[0]?.message ?? 'Datos inválidos');
  try {
    const result = await recoverGetNewPhrase(parsed.data.recoveryPhrase, parsed.data.newPin);
    const session = createSession(result.username);
    res.json({
      ok: true,
      username: result.username,
      newRecoveryPhrase: result.newRecoveryPhrase,
      session,
    });
  } catch (e) {
    fromException(res, e, 'auth.recover_failed', 'No se pudo recuperar');
  }
});

app.post('/auth/logout', (req: Request, res: Response) => {
  const session = req.headers[SESSION_HEADER] as string | undefined;
  destroySession(session);
  res.json({ ok: true });
});

app.delete('/auth/user', async (req: Request, res: Response) => {
  // Acción destructiva: requiere PIN para confirmar
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'auth.pin_required_delete', 'PIN requerido para borrar usuario');
  const ok = await verifyPin(parsed.data.pin);
  if (!ok) return errResponse(res, 401, 'auth.pin_wrong', 'PIN incorrecto');
  deleteUser();
  res.json({ ok: true });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.headers['x-eco-client'] !== '1') {
    return errResponse(res, 400, 'http.client_header_required', 'Header X-Eco-Client requerido');
  }
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const token = extractBearer(req.headers.authorization);
  if (!tokensMatch(authToken, token)) {
    return errResponse(res, 401, 'http.unauthorized', 'No autorizado');
  }
  next();
});

// Session check: si hay usuario registrado, requiere session válida en TODOS los endpoints
// excepto los de /auth/* y /health (este último ya pasó arriba).
app.use((req: Request, res: Response, next: NextFunction) => {
  if (AUTH_FREE_PATHS.has(req.path)) return next();
  if (!hasUser()) return next(); // sin user registrado, no se requiere sesión todavía
  const sessionId = req.headers[SESSION_HEADER] as string | undefined;
  const session = getSession(sessionId);
  if (!session) return errResponse(res, 401, 'auth.session_invalid', 'Sesión inválida o expirada');
  next();
});

app.get('/info', (_req, res) => {
  res.json({
    workspaces: config.workspaces,
    model: config.model,
    tts: {
      piperAvailable: isPiperAvailable(),
      voices: isPiperAvailable() ? listVoices() : [],
    },
  });
});

app.get('/tts/voices', (_req, res) => {
  if (!isPiperAvailable()) return errResponse(res, 503, 'tts.piper_unavailable', 'Piper no instalado');
  res.json({ voices: listVoices() });
});

app.get('/skills', (req: Request, res: Response) => {
  const workspace = typeof req.query.workspace === 'string' ? req.query.workspace : undefined;
  res.json({ skills: listSkills(workspace), sources: config.skillSources });
});

const AddWorkspaceSchema = z.object({ path: z.string().min(1).max(4096) });

app.get('/workspaces', (_req: Request, res: Response) => {
  res.json({
    workspaces: config.workspaces,
    fromEnv: (process.env.ECO_WORKSPACES ?? process.env.ECO_WORKSPACE ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    editable: readWorkspaceStore(),
  });
});

app.post('/workspaces', (req: Request, res: Response) => {
  const parsed = AddWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  const result = addWorkspace(parsed.data.path);
  if (!result.ok) return res.status(400).json({ error: result.errorCode ?? 'wsp.add_failed', message: result.error });
  res.json({ ok: true, path: result.path, workspaces: config.workspaces });
});

app.delete('/workspaces', (req: Request, res: Response) => {
  const parsed = AddWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  removeWorkspace(parsed.data.path);
  res.json({ ok: true, workspaces: config.workspaces });
});

const ApiKeyRequestSchema = z.object({
  key: z.string().min(8).max(400),
  validate: z.boolean().optional(),
});

app.get('/config/api-key', (_req: Request, res: Response) => {
  res.json({ hasKey: hasApiKey(), masked: maskedApiKey() });
});

app.post('/config/api-key', async (req: Request, res: Response) => {
  const parsed = ApiKeyRequestSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  try {
    if (parsed.data.validate !== false) {
      const result = await validateApiKey(parsed.data.key);
      if (!result.ok) return errResponse(res, 400, 'apikey.invalid', result.error ?? 'Key inválida');
    }
    writeApiKey(parsed.data.key);
    res.json({ ok: true, masked: maskedApiKey() });
  } catch (e) {
    fromException(res, e, 'apikey.save_failed', 'Error guardando key');
  }
});

app.delete('/config/api-key', (_req: Request, res: Response) => {
  deleteApiKey();
  res.json({ ok: true });
});

const VoiceTranscribedSchema = z.object({
  text: z.string().min(1).max(4000),
});

app.post('/voice/transcribed', (req: Request, res: Response) => {
  const parsed = VoiceTranscribedSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  const text = parsed.data.text.trim();
  if (!text) return errResponse(res, 400, 'voice.empty_text', 'Texto vacío');
  broadcastServerMessage({ type: 'voice_transcribed', text, ts: Date.now() });
  res.json({ ok: true });
});

app.post('/file/diff', async (req: Request, res: Response) => {
  const parsed = DiffRequestSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  try {
    const result = await fileDiff(parsed.data);
    res.json(result);
  } catch (err) {
    const status = (err as { httpStatus?: number }).httpStatus ?? 500;
    const message = err instanceof Error ? err.message : 'Error';
    res.status(status).json({ error: 'file.diff_failed', message });
  }
});

const shellConcurrency = { active: 0, max: 3 };

app.post('/shell', async (req: Request, res: Response) => {
  const parsed = ShellRequestSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  if (shellConcurrency.active >= shellConcurrency.max) {
    return errResponse(res, 429, 'shell.too_concurrent', 'Demasiados comandos concurrentes');
  }
  shellConcurrency.active += 1;
  try {
    const result = await runShell(parsed.data);
    res.json(result);
  } catch (err) {
    const status = (err as { httpStatus?: number }).httpStatus ?? 500;
    const message = err instanceof Error ? err.message : 'Error de shell';
    res.status(status).json({ error: 'shell.failed', message });
  } finally {
    shellConcurrency.active -= 1;
  }
});

const ttsConcurrency = { active: 0, max: 2 };

app.post('/tts', async (req: Request, res: Response) => {
  if (!isPiperAvailable()) return errResponse(res, 503, 'tts.piper_unavailable', 'Piper no instalado');
  const parsed = TTSRequestSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  if (ttsConcurrency.active >= ttsConcurrency.max) {
    return errResponse(res, 429, 'tts.too_concurrent', 'Demasiadas síntesis concurrentes');
  }
  ttsConcurrency.active += 1;
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const wav = await synthesize(parsed.data, controller.signal);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', wav.length.toString());
    res.setHeader('Cache-Control', 'no-store');
    res.end(wav);
  } catch (err) {
    const isTimeout = err instanceof Error && /timeout/i.test(err.message);
    const code = isTimeout ? 'tts.timeout' : 'tts.synth_failed';
    const message = isTimeout ? 'TTS timeout' : 'Error de síntesis';
    console.error('[tts] error:', err instanceof Error ? err.message : err);
    if (!res.headersSent) res.status(500).json({ error: code, message });
  } finally {
    ttsConcurrency.active -= 1;
  }
});

const server = createServer(app);
attachWebSocket(server, authToken);

server.listen(config.port, config.host, () => {
  console.log(`\n🟢 Eco backend listo`);
  console.log(`   HTTP:      http://${config.host}:${config.port}`);
  console.log(`   WebSocket: ws://${config.host}:${config.port}/ws`);
  console.log(`   Workspaces: ${config.workspaces.join(', ')}`);
  console.log(`   Modelo:    ${config.model}`);
  console.log(`   Orígenes:  ${config.allowedOrigins.join(', ')}`);
  console.log(`   Conexiones máx: ${config.maxOpenConnections}`);
  console.log(`   Auth:      Bearer ${authToken.slice(0, 8)}…  (archivo: ~/.eco/token)\n`);
});
