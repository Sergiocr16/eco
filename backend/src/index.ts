import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { existsSync as fsExistsSync, existsSync, writeFileSync, unlinkSync, statSync, mkdirSync, createReadStream } from 'node:fs';
import { join as pathJoin } from 'node:path';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { config, isAllowedWorkspace } from './config.js';
import { attachWebSocket, broadcastServerMessage } from './ws-server.js';
import { attachPtyServer, killBubblePty, killBubbleTerminal } from './pty-server.js';
import { getWorktree, removeWorktree, ensureWorktree, pruneCleanWorktrees } from './worktree-manager.js';
import * as gitOps from './git-ops.js';
import * as gitHistory from './git-history.js';
import * as gitAdv from './git-ops-advanced.js';
import * as devServer from './dev-server.js';
import * as obsidian from './obsidian.js';
import { getClaudeAuthStatus } from './claude-auth.js';
import { extractBearer, getOrCreateToken, tokensMatch } from './auth.js';
import { isPiperAvailable, listVoices, synthesize, TTSRequestSchema } from './tts.js';
import { isMacSayAvailable, listMacSayVoices, synthesizeMacSay } from './tts-macsay.js';
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
import { resolveSafePath } from './fs-paths.js';
import { listTree } from './fs-tree.js';
import { searchInWorkspace } from './fs-search.js';
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
app.use(helmet({
  contentSecurityPolicy: false,
  // CORP/COOP por default son `same-origin` en helmet. En dev el frontend
  // vive en :5173 y el backend en :7000 (mismos host, distintos puertos =
  // distintos orígenes) — el browser rechaza la respuesta antes de leerla
  // aunque CORS sí pase. Permitimos cross-origin acá; la seguridad real
  // viene del CORS allowlist + Bearer token + host check, no de CORP.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
  // helmet pone X-Frame-Options: SAMEORIGIN por default, que bloquearía iframes
  // cross-origin contra respuestas del backend (frontend dev en :5174 vs backend
  // :7000). Como el backend no sirve contenido sensible navegable, apagar el
  // header global es seguro.
  frameguard: false,
}));
app.use(
  cors({
    // En empaquetado Electron, el renderer carga desde el mismo origen
    // (http://127.0.0.1:7000) así que CORS no se activa. Igual mantenemos
    // la whitelist explícita por si alguien hace cross-origin.
    origin: config.allowedOrigins,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Eco-Client', 'X-Eco-Session'],
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

// Static del frontend cuando corre adentro de Electron empaquetado. Lo
// montamos ANTES de los middlewares de auth para que sirva el index.html y
// los assets (que GET sin headers especiales) sin pasar por la guardia de
// X-Eco-Client. Index automático para `/`.
const frontendDistEarly = process.env.ECO_FRONTEND_DIST;
if (frontendDistEarly && fsExistsSync(frontendDistEarly)) {
  console.log(`[static] sirviendo frontend desde ${frontendDistEarly}`);
  app.use(express.static(frontendDistEarly, { maxAge: '1h', index: 'index.html' }));
}

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

app.get('/info', async (_req, res) => {
  const macSayVoices = isMacSayAvailable() ? await listMacSayVoices() : [];
  res.json({
    workspaces: config.workspaces,
    model: config.model,
    tts: {
      piperAvailable: isPiperAvailable(),
      voices: isPiperAvailable() ? listVoices() : [],
      macSayAvailable: isMacSayAvailable(),
      macSayVoices,
    },
  });
});

app.get('/tts/voices', async (_req, res) => {
  const piper = isPiperAvailable() ? listVoices() : [];
  const macsay = isMacSayAvailable() ? await listMacSayVoices() : [];
  // Mantenemos `voices` por compat con clientes viejos (era el array de Piper).
  res.json({ voices: piper, piper, macsay });
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

// Estado completo de autenticación: CLI logueado + API key + cuál usa el SDK.
app.get('/config/claude-auth', (_req: Request, res: Response) => {
  res.json(getClaudeAuthStatus());
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

// Transcripción on-device para Electron empaquetado en macOS. El renderer
// captura audio con MediaRecorder, lo postea como blob binario acá, y el
// backend spawneando el CLI Swift (`eco-stt`) usa Apple Speech framework.
// Funciona offline, no requiere Python.
app.post('/voice/transcribe-blob',
  express.raw({ type: ['audio/*'], limit: '10mb' }),
  async (req: Request, res: Response) => {
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return errResponse(res, 400, 'http.invalid_body', 'Body vacío o no binario');
    }
    if (process.platform !== 'darwin') {
      return errResponse(res, 501, 'voice.unsupported_platform', 'Transcripción nativa solo en macOS');
    }
    // El binario vive en process.resourcesPath/bin (empaquetado) o relativo
    // al backend (dev). Probamos en ambos lugares.
    // process.resourcesPath solo existe en Electron-empaquetado; en Node puro
    // queda undefined. Hacemos cast defensivo a string|undefined.
    const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
    // __dirname no existe en módulos ESM — derivamos del import.meta.url.
    const moduleDir = path.dirname(new URL(import.meta.url).pathname);
    const candidatePaths = [
      // Empaquetado: extraResources puso bin/eco-stt en Resources/
      resourcesPath ? path.join(resourcesPath, 'bin', 'eco-stt') : '',
      // Dev: el binario vive en electron/build/bin
      path.resolve(moduleDir, '..', '..', 'electron', 'build', 'bin', 'eco-stt'),
    ].filter(Boolean);
    let binPath = '';
    for (const p of candidatePaths) {
      if (existsSync(p)) { binPath = p; break; }
    }
    if (!binPath) {
      return errResponse(res, 500, 'voice.cli_missing', 'eco-stt binary no encontrado');
    }

    // Detectamos extensión del content-type — AVFoundation auto-detecta el
    // formato real del contenido pero igual escribir con extensión correcta
    // ayuda al decoder.
    const ct = String(req.headers['content-type'] || 'audio/wav').toLowerCase();
    const ext = ct.includes('wav') ? '.wav'
      : ct.includes('webm') ? '.webm'
      : ct.includes('mp4') || ct.includes('m4a') ? '.m4a'
      : ct.includes('ogg') ? '.ogg'
      : '.wav';
    const tmpFile = path.join(
      tmpdir(),
      `eco-stt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`,
    );
    try {
      writeFileSync(tmpFile, req.body);
      const locale = typeof req.query.locale === 'string' ? req.query.locale : 'es-MX';
      // Validamos locale para que sea seguro pasar como arg (sin shell, pero
      // por defensa en profundidad).
      if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
        return errResponse(res, 400, 'http.invalid_body', 'Locale inválido');
      }
      const { spawn } = await import('node:child_process');
      const proc = spawn(binPath, [tmpFile, locale], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      });
      const outChunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      proc.stdout.on('data', (c: Buffer) => outChunks.push(c));
      proc.stderr.on('data', (c: Buffer) => errChunks.push(c));
      const exitCode = await new Promise<number>((resolve) => {
        proc.on('close', (code) => resolve(code ?? -1));
        proc.on('error', () => resolve(-1));
      });
      const text = Buffer.concat(outChunks).toString('utf-8').trim();
      if (exitCode !== 0) {
        const errText = Buffer.concat(errChunks).toString('utf-8').slice(0, 400);
        return errResponse(res, 500, 'voice.transcribe_failed', errText || `exit ${exitCode}`);
      }
      res.json({ ok: true, text });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'transcribe failed';
      return errResponse(res, 500, 'voice.transcribe_failed', msg);
    } finally {
      try { unlinkSync(tmpFile); } catch { /* noop */ }
    }
  },
);

// Cache + in-flight dedup para `/file/changes`. El Dashboard pollea TODAS
// las burbujas y la FilesPanel pollea LA activa, así que pollers concurrentes
// suelen pegar al mismo key — sin esto, spawneamos N veces git status para
// el mismo worktree en cada tick.
type FileChangesPayload = {
  workspace: string;
  files: { path: string; change: 'created' | 'modified' | 'deleted' | 'renamed'; unstaged: boolean }[];
  git: boolean;
};
const fileChangesCache = new Map<string, { result: FileChangesPayload; ts: number }>();
const fileChangesInFlight = new Map<string, Promise<FileChangesPayload>>();
const FILE_CHANGES_CACHE_MS = 300;

function computeFileChanges(effective: string): Promise<FileChangesPayload> {
  return new Promise<FileChangesPayload>((resolve) => {
    import('node:child_process').then(({ spawn }) => {
      const proc = spawn('git', ['-C', effective, 'status', '--porcelain=v1', '--untracked-files=all'], {
        timeout: 5000,
      });
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) return resolve({ workspace: effective, files: [], git: false });
        const files: FileChangesPayload['files'] = [];
        for (const line of out.split('\n')) {
          if (!line) continue;
          const xy = line.slice(0, 2);
          const workCh = xy[1];
          const path = line.slice(3).trim();
          if (!path) continue;
          let change: FileChangesPayload['files'][number]['change'];
          if (xy === '??' || xy.includes('A')) change = 'created';
          else if (xy.includes('D')) change = 'deleted';
          else if (xy.includes('R')) change = 'renamed';
          else change = 'modified';
          const unstaged = xy === '??' || (workCh !== undefined && workCh !== ' ');
          const finalPath = path.includes(' -> ') ? path.split(' -> ').pop()! : path;
          files.push({ path: finalPath, change, unstaged });
        }
        resolve({ workspace: effective, files, git: true });
      });
      proc.on('error', () => resolve({ workspace: effective, files: [], git: false }));
    });
  });
}

app.get('/file/changes', async (req: Request, res: Response) => {
  const workspace = typeof req.query.workspace === 'string' ? req.query.workspace : '';
  const bubbleId = typeof req.query.bubbleId === 'string' ? req.query.bubbleId : '';
  if (!workspace) return res.json({ workspace: '', files: [], git: false });
  if (!isAllowedWorkspace(workspace)) {
    return errResponse(res, 403, 'http.workspace_forbidden', 'Workspace no permitido');
  }
  const effective = bubbleId ? ensureWorktree(bubbleId, workspace) : workspace;
  const key = effective;
  const now = Date.now();
  // Cache hot: si tenemos resultado fresco, lo devolvemos sin tocar git.
  const cached = fileChangesCache.get(key);
  if (cached && now - cached.ts < FILE_CHANGES_CACHE_MS) {
    return res.json(cached.result);
  }
  // Dedup in-flight: si ya hay una request corriendo para esta key, esperamos
  // su resultado en lugar de spawnear otro git.
  let pending = fileChangesInFlight.get(key);
  if (!pending) {
    pending = computeFileChanges(effective).then((result) => {
      fileChangesCache.set(key, { result, ts: Date.now() });
      fileChangesInFlight.delete(key);
      return result;
    });
    fileChangesInFlight.set(key, pending);
  }
  try {
    const result = await pending;
    res.json(result);
  } catch {
    res.json({ workspace: effective, files: [], git: false });
  }
});

function invalidateFileChanges(dir: string) {
  fileChangesCache.delete(dir);
}

app.post('/file/discard', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const path = typeof req.body?.path === 'string' ? req.body.path : '';
  if (!path) return errResponse(res, 400, 'http.invalid_body', 'path requerido');
  const result = gitOps.discardFile(dir, path);
  invalidateFileChanges(dir);
  res.json(result);
});

// Review estilo Cursor: revertir UN solo hunk del unified diff.
app.post('/file/revert-hunk', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const path = typeof req.body?.path === 'string' ? req.body.path : '';
  const hunkText = typeof req.body?.hunkText === 'string' ? req.body.hunkText : '';
  if (!path) return errResponse(res, 400, 'http.invalid_body', 'path requerido');
  if (!hunkText) return errResponse(res, 400, 'http.invalid_body', 'hunkText requerido');
  // Cap defensivo: un hunk razonable no debería pasar de 100 KB.
  if (hunkText.length > 100_000) return errResponse(res, 400, 'http.invalid_body', 'hunk demasiado grande');
  const result = gitOps.revertHunk(dir, path, hunkText);
  invalidateFileChanges(dir);
  res.json(result);
});

// Aceptar UN hunk (git apply --cached). Lo staged-ea → desaparece del diff
// unstaged hasta que el agente vuelva a tocar el archivo.
app.post('/file/accept-hunk', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const path = typeof req.body?.path === 'string' ? req.body.path : '';
  const hunkText = typeof req.body?.hunkText === 'string' ? req.body.hunkText : '';
  if (!path) return errResponse(res, 400, 'http.invalid_body', 'path requerido');
  if (!hunkText) return errResponse(res, 400, 'http.invalid_body', 'hunkText requerido');
  if (hunkText.length > 100_000) return errResponse(res, 400, 'http.invalid_body', 'hunk demasiado grande');
  const result = gitOps.acceptHunk(dir, path, hunkText);
  invalidateFileChanges(dir);
  res.json(result);
});

// Aceptar archivo entero (git add). Idem efecto: queda staged.
app.post('/file/accept', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const path = typeof req.body?.path === 'string' ? req.body.path : '';
  if (!path) return errResponse(res, 400, 'http.invalid_body', 'path requerido');
  const result = gitOps.acceptFile(dir, path);
  invalidateFileChanges(dir);
  res.json(result);
});

// Contenido completo del archivo — útil para mostrar el archivo entero
// con highlight de las líneas modificadas, además del diff puro.
app.post('/file/contents', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const path = typeof req.body?.path === 'string' ? req.body.path : '';
  if (!path) return errResponse(res, 400, 'http.invalid_body', 'path requerido');
  res.json(gitOps.readFileContents(dir, path));
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

// ─── Filesystem (tab Archivos) ─────────────────────────────────────────────
// /fs/tree, /file/save, /fs/search, /file/raw. Usan resolveSafePath para
// validar paths. Los endpoints /file/* viejos siguen con su validación
// inline en git-ops.ts — no se tocan acá.

const FsTreeSchema = z.object({
  bubbleId: z.string().min(1).max(128).optional(),
  workspace: z.string().min(1).max(4096),
  path: z.string().max(4096).optional().default(''),
  maxDepth: z.number().int().min(1).max(6).optional().default(3),
  includeHidden: z.boolean().optional().default(false),
});
app.post('/fs/tree', (req: Request, res: Response) => {
  const parsed = FsTreeSchema.safeParse(req.body);
  if (!parsed.success) {
    return errResponse(res, 400, 'http.invalid_body', parsed.error.errors[0]?.message ?? 'Cuerpo inválido');
  }
  const { workspace, bubbleId, path: subPath, maxDepth, includeHidden } = parsed.data;
  if (!isAllowedWorkspace(workspace)) {
    return errResponse(res, 403, 'http.workspace_forbidden', 'Workspace no permitido');
  }
  const workdir = bubbleId ? ensureWorktree(bubbleId, workspace) : workspace;
  const safe = resolveSafePath(workdir, subPath);
  if (!safe.ok) return errResponse(res, 400, safe.code, safe.error);
  const result = listTree({ workdir, subPath: safe.rel, maxDepth, includeHidden });
  res.json(result);
});

const FileSaveSchema = z.object({
  bubbleId: z.string().min(1).max(128).optional(),
  workspace: z.string().min(1).max(4096),
  path: z.string().min(1).max(4096),
  content: z.string().max(2 * 1024 * 1024),  // 2MB hard cap
  expectedMtime: z.number().optional(),
});
app.post('/file/save', (req: Request, res: Response) => {
  const parsed = FileSaveSchema.safeParse(req.body);
  if (!parsed.success) {
    return errResponse(res, 400, 'http.invalid_body', parsed.error.errors[0]?.message ?? 'Cuerpo inválido');
  }
  const { workspace, bubbleId, path: relPath, content, expectedMtime } = parsed.data;
  if (!isAllowedWorkspace(workspace)) {
    return errResponse(res, 403, 'http.workspace_forbidden', 'Workspace no permitido');
  }
  const workdir = bubbleId ? ensureWorktree(bubbleId, workspace) : workspace;
  const safe = resolveSafePath(workdir, relPath);
  if (!safe.ok) return errResponse(res, 400, safe.code, safe.error);
  // Optimistic concurrency: si viene expectedMtime y el archivo existe con
  // mtime distinto, alguien (agente, editor externo) lo modificó por debajo.
  // Devolvemos berr.fs.stale para que el frontend ofrezca Recargar/Sobrescribir.
  let currentMtime: number | null = null;
  if (fsExistsSync(safe.abs)) {
    try { currentMtime = statSync(safe.abs).mtimeMs; } catch { currentMtime = null; }
    if (typeof expectedMtime === 'number' && currentMtime !== null && currentMtime !== expectedMtime) {
      return res.status(409).json({ error: 'fs.stale', message: 'El archivo cambió fuera del editor', currentMtime });
    }
  }
  try {
    mkdirSync(path.dirname(safe.abs), { recursive: true });
    writeFileSync(safe.abs, content, 'utf8');
    const stat = statSync(safe.abs);
    invalidateFileChanges(workdir);
    res.json({ ok: true, mtime: stat.mtimeMs, bytes: Buffer.byteLength(content, 'utf8') });
  } catch (e) {
    return fromException(res, e, 'fs.write_failed', 'No se pudo guardar el archivo');
  }
});

const FsSearchSchema = z.object({
  bubbleId: z.string().min(1).max(128).optional(),
  workspace: z.string().min(1).max(4096),
  query: z.string().min(1).max(500),
  regex: z.boolean().optional().default(false),
  caseSensitive: z.boolean().optional().default(false),
  includePattern: z.string().max(200).optional(),
  maxResults: z.number().int().min(1).max(2000).optional().default(500),
});
app.post('/fs/search', async (req: Request, res: Response) => {
  const parsed = FsSearchSchema.safeParse(req.body);
  if (!parsed.success) {
    return errResponse(res, 400, 'http.invalid_body', parsed.error.errors[0]?.message ?? 'Cuerpo inválido');
  }
  const { workspace, bubbleId, query, regex, caseSensitive, includePattern, maxResults } = parsed.data;
  if (!isAllowedWorkspace(workspace)) {
    return errResponse(res, 403, 'http.workspace_forbidden', 'Workspace no permitido');
  }
  const workdir = bubbleId ? ensureWorktree(bubbleId, workspace) : workspace;
  // Validar que el workdir existe (resolveSafePath con relPath='' lo cubre).
  const safe = resolveSafePath(workdir, '');
  if (!safe.ok) return errResponse(res, 400, safe.code, safe.error);
  const result = await searchInWorkspace({
    workdir: safe.abs,
    query,
    regex,
    caseSensitive,
    includePattern,
    maxResults,
  });
  if (!result.ok) {
    const status = result.code === 'search.timeout' ? 504 : 500;
    return res.status(status).json({ error: result.code, message: result.error });
  }
  res.json(result);
});

// Sirve archivos binarios (imágenes principalmente) para preview en la tab
// Archivos. Validación: extensión en whitelist + size cap + auth normal.
const RAW_ALLOWED_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
};
const RAW_MAX_SIZE = 5 * 1024 * 1024;
app.get('/file/raw', (req: Request, res: Response) => {
  const workspace = typeof req.query.workspace === 'string' ? req.query.workspace : '';
  const bubbleId = typeof req.query.bubbleId === 'string' ? req.query.bubbleId : '';
  const relPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!workspace || !relPath) {
    return errResponse(res, 400, 'http.invalid_body', 'workspace y path requeridos');
  }
  if (!isAllowedWorkspace(workspace)) {
    return errResponse(res, 403, 'http.workspace_forbidden', 'Workspace no permitido');
  }
  const workdir = bubbleId ? ensureWorktree(bubbleId, workspace) : workspace;
  const safe = resolveSafePath(workdir, relPath);
  if (!safe.ok) return errResponse(res, 400, safe.code, safe.error);
  const ext = path.extname(safe.abs).toLowerCase();
  const mime = RAW_ALLOWED_EXT[ext];
  if (!mime) {
    return errResponse(res, 415, 'fs.unsupported_media', 'Tipo de archivo no soportado');
  }
  if (!fsExistsSync(safe.abs)) {
    return errResponse(res, 404, 'fs.not_found', 'Archivo no encontrado');
  }
  let size: number;
  try { size = statSync(safe.abs).size; } catch { return errResponse(res, 404, 'fs.not_found', 'Archivo no encontrado'); }
  if (size > RAW_MAX_SIZE) {
    return errResponse(res, 413, 'fs.too_large', 'Archivo demasiado grande');
  }
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', String(size));
  res.setHeader('Cache-Control', 'private, max-age=60');
  const stream = createReadStream(safe.abs);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
});

// ─── Git ops por burbuja (operan dentro del worktree de la burbuja) ────────
function effectiveWorkspaceFromReq(req: Request, res: Response): string | null {
  const workspace = (typeof req.body?.workspace === 'string' ? req.body.workspace : null)
    ?? (typeof req.query.workspace === 'string' ? req.query.workspace : null);
  const bubbleId = (typeof req.body?.bubbleId === 'string' ? req.body.bubbleId : null)
    ?? (typeof req.query.bubbleId === 'string' ? req.query.bubbleId : null);
  if (!workspace) {
    errResponse(res, 400, 'http.invalid_body', 'workspace requerido');
    return null;
  }
  if (!isAllowedWorkspace(workspace)) {
    errResponse(res, 403, 'http.workspace_forbidden', 'Workspace no permitido');
    return null;
  }
  return bubbleId ? ensureWorktree(bubbleId, workspace) : workspace;
}

app.get('/git/branches', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  res.json(gitOps.listBranches(dir));
});

// Crear el worktree de una burbuja con un baseBranch opcional. Idempotente:
// si ya existe el worktree para ese bubbleId, no toca nada. Usado por la
// UI cuando crea una burbuja con workspace git, para que el user pueda
// elegir desde qué rama parte el worktree (típicamente "main" o feature
// branches favoritos configurados por workspace).
const WorktreeCreateSchema = z.object({
  bubbleId: z.string().min(1).max(128),
  workspace: z.string().min(1).max(4096),
  baseBranch: z.string().min(1).max(256).optional(),
});
app.post('/worktree/create', (req: Request, res: Response) => {
  const parsed = WorktreeCreateSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  const { bubbleId, workspace, baseBranch } = parsed.data;
  if (!isAllowedWorkspace(workspace)) {
    return errResponse(res, 403, 'http.workspace_forbidden', 'Workspace no permitido');
  }
  const path = ensureWorktree(bubbleId, workspace, baseBranch);
  res.json({ ok: true, path, baseBranch: baseBranch ?? null });
});

app.post('/git/checkout', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const branch = typeof req.body?.branch === 'string' ? req.body.branch : '';
  const create = req.body?.create === true;
  const rawMode = typeof req.body?.mode === 'string' ? req.body.mode : 'plain';
  const mode: gitOps.CheckoutMode = (rawMode === 'carry' || rawMode === 'discard') ? rawMode : 'plain';
  if (!branch) return errResponse(res, 400, 'http.invalid_body', 'branch requerido');
  res.json(gitOps.checkoutBranch(dir, branch, create, mode));
});

app.post('/git/pull', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  res.json(gitOps.pull(dir));
});

app.post('/git/fetch', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  res.json(gitOps.fetch(dir));
});

app.post('/git/push', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  res.json(gitOps.push(dir));
});

app.post('/git/rename-branch', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const newName = typeof req.body?.newName === 'string' ? req.body.newName : '';
  if (!newName) return errResponse(res, 400, 'http.invalid_body', 'newName requerido');
  res.json(gitOps.renameBranch(dir, newName));
});

app.post('/git/commit-suggest', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const context = typeof req.body?.context === 'string' ? req.body.context : '';
  res.json(gitOps.suggestCommitMessage(dir, context));
});

app.post('/git/commit', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const message = typeof req.body?.message === 'string' ? req.body.message : '';
  if (!message) return errResponse(res, 400, 'http.invalid_body', 'message requerido');
  res.json(gitOps.commitWithMessage(dir, message));
});

// Pull requests del repo (vía gh CLI). El user hace click en uno y se le
// ofrece checkoutear esa rama en el worktree del agente para revisar.
app.get('/git/prs', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  res.json(gitOps.listPullRequests(dir));
});

app.post('/git/pr/checkout', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const num = Number(req.body?.number);
  if (!Number.isFinite(num) || num < 1) return errResponse(res, 400, 'http.invalid_body', 'number requerido');
  res.json(gitOps.checkoutPullRequest(dir, num));
});

// Detalle completo de un PR: descripción + comentarios + reviews + commits.
// Usado por la sub-pestaña PRs del tab Git cuando el user clickea "Ver detalle".
app.get('/git/pr/details', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const num = Number(req.query.number);
  if (!Number.isFinite(num) || num < 1) return errResponse(res, 400, 'http.invalid_body', 'number requerido');
  res.json(gitOps.pullRequestDetails(dir, num));
});

// PR asociado a la rama actual del worktree (si lo hay). Lo consume el
// banner del chat para mostrar "estás en el PR #N" + acciones merge/close.
app.get('/git/pr/current', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  res.json(gitOps.currentPullRequest(dir));
});

app.post('/git/pr/merge', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const num = Number(req.body?.number);
  if (!Number.isFinite(num) || num < 1) return errResponse(res, 400, 'http.invalid_body', 'number requerido');
  const rawMethod = typeof req.body?.method === 'string' ? req.body.method : 'merge';
  const method: 'merge' | 'squash' | 'rebase' =
    rawMethod === 'squash' || rawMethod === 'rebase' ? rawMethod : 'merge';
  res.json(gitOps.mergePullRequest(dir, num, method));
});

app.post('/git/pr/close', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const num = Number(req.body?.number);
  if (!Number.isFinite(num) || num < 1) return errResponse(res, 400, 'http.invalid_body', 'number requerido');
  const comment = typeof req.body?.comment === 'string' ? req.body.comment : undefined;
  res.json(gitOps.closePullRequest(dir, num, comment));
});

// ─── Git history (log + show) ─────────────────────────────────────────────
app.get('/git/log', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const branch = typeof req.query.branch === 'string' ? req.query.branch : undefined;
  const pathFilter = typeof req.query.path === 'string' ? req.query.path : undefined;
  const limitRaw = Number(req.query.limit);
  const skipRaw = Number(req.query.skip);
  const all = req.query.all === '1' || req.query.all === 'true';
  res.json(gitHistory.gitLog(dir, {
    branch,
    path: pathFilter,
    limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    skip: Number.isFinite(skipRaw) ? skipRaw : undefined,
    all,
  }));
});

app.get('/git/show', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const sha = typeof req.query.sha === 'string' ? req.query.sha : '';
  if (!sha) return errResponse(res, 400, 'http.invalid_body', 'sha requerido');
  res.json(gitHistory.gitShow(dir, sha));
});

// ─── Git ops avanzadas (cherry-pick, merge, revert, reset, abort/continue) ─
const CherryPickSchema = z.object({
  workspace: z.string().min(1).max(4096),
  bubbleId: z.string().max(128).optional(),
  shas: z.array(z.string().min(4).max(40)).min(1).max(50),
});
app.post('/git/cherry-pick', (req: Request, res: Response) => {
  const parsed = CherryPickSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const result = gitAdv.cherryPick(dir, parsed.data.shas);
  invalidateFileChanges(dir);
  res.json(result);
});

const MergeSchema = z.object({
  workspace: z.string().min(1).max(4096),
  bubbleId: z.string().max(128).optional(),
  source: z.string().min(1).max(256),
  noFf: z.boolean().optional(),
  squash: z.boolean().optional(),
  message: z.string().max(500).optional(),
});
app.post('/git/merge', (req: Request, res: Response) => {
  const parsed = MergeSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const { source, noFf, squash, message } = parsed.data;
  const result = gitAdv.mergeBranch(dir, source, { noFf, squash, message });
  invalidateFileChanges(dir);
  res.json(result);
});

const RevertSchema = z.object({
  workspace: z.string().min(1).max(4096),
  bubbleId: z.string().max(128).optional(),
  sha: z.string().min(4).max(40),
});
app.post('/git/revert', (req: Request, res: Response) => {
  const parsed = RevertSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const result = gitAdv.revertCommit(dir, parsed.data.sha);
  invalidateFileChanges(dir);
  res.json(result);
});

const ResetSchema = z.object({
  workspace: z.string().min(1).max(4096),
  bubbleId: z.string().max(128).optional(),
  ref: z.string().min(1).max(256),
  mode: z.enum(['soft', 'mixed', 'hard']),
  force: z.boolean().optional(),
});
app.post('/git/reset', (req: Request, res: Response) => {
  const parsed = ResetSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const { ref, mode, force } = parsed.data;
  const result = gitAdv.resetTo(dir, ref, mode, !!force);
  invalidateFileChanges(dir);
  res.json(result);
});

const OpSchema = z.object({
  workspace: z.string().min(1).max(4096),
  bubbleId: z.string().max(128).optional(),
  op: z.enum(['cherry-pick', 'merge', 'revert']),
});
app.post('/git/abort', (req: Request, res: Response) => {
  const parsed = OpSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const result = gitAdv.abortOp(dir, parsed.data.op);
  invalidateFileChanges(dir);
  res.json(result);
});

app.post('/git/continue', (req: Request, res: Response) => {
  const parsed = OpSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const result = gitAdv.continueOp(dir, parsed.data.op);
  invalidateFileChanges(dir);
  res.json(result);
});

app.get('/git/op-status', (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  res.json(gitAdv.opStatus(dir));
});

// ─── Worktrees mantenimiento ──────────────────────────────────────────────
// Llama pruneCleanWorktrees() bajo demanda — devuelve qué se removió/conservó.
// Para usar desde la UI cuando el usuario pide "limpiar worktrees".
app.post('/worktrees/prune', (_req: Request, res: Response) => {
  try {
    const r = pruneCleanWorktrees();
    res.json({ removed: r.removed, kept: r.kept });
  } catch (e) {
    errResponse(res, 500, 'worktree.prune_failed', e instanceof Error ? e.message : 'prune failed');
  }
});

// ─── Dev server por agente ────────────────────────────────────────────────
function parseRole(raw: unknown): devServer.ServerRole {
  return (raw === 'frontend' || raw === 'backend') ? raw : 'main';
}

app.post('/dev/start', async (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const bubbleId = typeof req.body?.bubbleId === 'string' ? req.body.bubbleId : '';
  if (!bubbleId) return errResponse(res, 400, 'http.invalid_body', 'bubbleId requerido');
  const command = typeof req.body?.command === 'string' ? req.body.command : undefined;
  const role = parseRole(req.body?.role);
  const result = await devServer.startDevServer(bubbleId, dir, command, role);
  res.json(result);
});

app.post('/dev/stop', async (req: Request, res: Response) => {
  const bubbleId = typeof req.body?.bubbleId === 'string' ? req.body.bubbleId : '';
  if (!bubbleId) return errResponse(res, 400, 'http.invalid_body', 'bubbleId requerido');
  const role = parseRole(req.body?.role);
  res.json(await devServer.stopDevServer(bubbleId, role));
});

app.post('/dev/restart', async (req: Request, res: Response) => {
  const bubbleId = typeof req.body?.bubbleId === 'string' ? req.body.bubbleId : '';
  if (!bubbleId) return errResponse(res, 400, 'http.invalid_body', 'bubbleId requerido');
  const role = parseRole(req.body?.role);
  const result = await devServer.restartDevServer(bubbleId, role);
  res.json(result);
});

// Lista TODAS las sessions activas (cualquier bubble, cualquier role). Pensado
// para que el Dashboard pinte los nodos correctamente al montar.
app.get('/dev/active', (_req: Request, res: Response) => {
  res.json({ sessions: devServer.devListActive() });
});

app.get('/dev/status', (req: Request, res: Response) => {
  const bubbleId = typeof req.query.bubbleId === 'string' ? req.query.bubbleId : '';
  if (!bubbleId) return errResponse(res, 400, 'http.invalid_body', 'bubbleId requerido');
  const role = parseRole(req.query.role);
  const s = devServer.devStatus(bubbleId, role);
  if (!s) return res.json({ status: 'idle', port: 0, url: '', command: '', exitCode: null, role });
  res.json({
    status: s.status, port: s.port, url: s.url, command: s.command,
    exitCode: s.exitCode, startedAt: s.startedAt, exitedAt: s.exitedAt,
    role: s.role,
  });
});

app.post('/dev/skill', async (req: Request, res: Response) => {
  const dir = effectiveWorkspaceFromReq(req, res);
  if (!dir) return;
  const bubbleId = typeof req.body?.bubbleId === 'string' ? req.body.bubbleId : '';
  const skill = typeof req.body?.skill === 'string' ? req.body.skill : '';
  const action = typeof req.body?.action === 'string' ? req.body.action : '';
  if (!bubbleId || !skill) return errResponse(res, 400, 'http.invalid_body', 'bubbleId y skill requeridos');
  if (!['up', 'down', 'restart', 'status'].includes(action)) {
    return errResponse(res, 400, 'http.invalid_body', 'action debe ser up|down|restart|status');
  }
  const result = await devServer.runSkillAction(bubbleId, dir, skill, action as 'up' | 'down' | 'restart' | 'status');
  res.json(result);
});

app.get('/dev/logs', (req: Request, res: Response) => {
  const bubbleId = typeof req.query.bubbleId === 'string' ? req.query.bubbleId : '';
  if (!bubbleId) return errResponse(res, 400, 'http.invalid_body', 'bubbleId requerido');
  const role = parseRole(req.query.role);
  res.type('text/plain').send(devServer.devLogs(bubbleId, role));
});

// ─────────────────────────── Obsidian
app.get('/integrations/obsidian/status', (_req: Request, res: Response) => {
  res.json(obsidian.status());
});

app.get('/integrations/obsidian/vaults', (_req: Request, res: Response) => {
  // Lista los vaults que Obsidian tiene registrados en su config local.
  res.json({ vaults: obsidian.detectInstalledVaults() });
});

const ObsidianConfigSchema = z.object({
  enabled: z.boolean(),
  vaultPath: z.string(),
  mode: z.enum(['builtin', 'custom']).optional(),
  customCommand: z.string().max(2000).optional(),
});
app.post('/integrations/obsidian/config', (req: Request, res: Response) => {
  const parsed = ObsidianConfigSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  obsidian.saveConfig({
    enabled: parsed.data.enabled,
    vaultPath: parsed.data.vaultPath,
    mode: parsed.data.mode ?? 'builtin',
    customCommand: parsed.data.customCommand ?? '',
  });
  res.json({ ok: true, status: obsidian.status() });
});

app.get('/integrations/obsidian/context', (req: Request, res: Response) => {
  const workspace = typeof req.query.workspace === 'string' ? req.query.workspace : '';
  res.json({ markdown: obsidian.loadProjectContext(workspace) });
});

const SaveSessionSchema = z.object({
  bubbleId: z.string(),
  title: z.string(),
  workspace: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    text: z.string(),
    createdAt: z.number(),
  })).max(2000),
});
app.post('/integrations/obsidian/save-session', (req: Request, res: Response) => {
  const parsed = SaveSessionSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', parsed.error.errors[0]?.message ?? 'Datos inválidos');
  const r = obsidian.saveSession(parsed.data);
  if (!r.ok) return errResponse(res, 400, 'obsidian.save_failed', r.error);
  res.json({ ok: true, path: r.path });
});

async function closeBubbleResources(bubbleId: string) {
  const killed = killBubblePty(bubbleId);
  // Matamos también el dev server del agente si existe (cleanup completo de
  // process group + verificación de puerto) en los 3 roles posibles.
  await Promise.all([
    devServer.stopDevServer(bubbleId, 'main'),
    devServer.stopDevServer(bubbleId, 'frontend'),
    devServer.stopDevServer(bubbleId, 'backend'),
  ]);
  // Borrar las entries del `sessions` Map de dev-server — sin esto, las
  // sesiones detenidas siguen en RAM (64 KB ring buffer cada una) y en disco
  // (~/.eco/dev-sessions.json), creciendo con cada bubble cerrada.
  const forgotten = devServer.forgetSession(bubbleId);
  // El worktree de la burbuja también se libera; la rama eco/<id> queda
  // viva en el repo padre para que el usuario pueda mergear si quiere.
  const worktreeRemoved = removeWorktree(bubbleId);
  return { killed, worktreeRemoved, forgotten };
}

app.post('/pty/kill', async (req: Request, res: Response) => {
  const bubbleId = typeof req.body?.bubbleId === 'string' ? req.body.bubbleId : '';
  if (!bubbleId) return errResponse(res, 400, 'http.invalid_body', 'bubbleId requerido');
  const r = await closeBubbleResources(bubbleId);
  res.json({ ok: true, ...r });
});

// Cierra UN terminal específico de una burbuja (pestaña extra abierta por el
// user). NO toca dev servers ni worktree — solo mata ese PTY.
app.post('/pty/kill-terminal', (req: Request, res: Response) => {
  const bubbleId = typeof req.body?.bubbleId === 'string' ? req.body.bubbleId : '';
  const ptyId = typeof req.body?.ptyId === 'string' ? req.body.ptyId : '';
  if (!bubbleId || !ptyId) return errResponse(res, 400, 'http.invalid_body', 'bubbleId y ptyId requeridos');
  const killed = killBubbleTerminal(bubbleId, ptyId);
  res.json({ ok: true, killed });
});

// Alias semánticamente más claro de /pty/kill: el frontend lo llama al cerrar
// una burbuja para liberar PTY + dev servers + worktree + sessions Map.
app.post('/bubble/close', async (req: Request, res: Response) => {
  const bubbleId = typeof req.body?.bubbleId === 'string' ? req.body.bubbleId : '';
  if (!bubbleId) return errResponse(res, 400, 'http.invalid_body', 'bubbleId requerido');
  const r = await closeBubbleResources(bubbleId);
  res.json({ ok: true, ...r });
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
  const parsed = TTSRequestSchema.safeParse(req.body);
  if (!parsed.success) return errResponse(res, 400, 'http.invalid_body', 'Cuerpo inválido');
  const backend = parsed.data.backend ?? 'piper';
  if (backend === 'piper' && !isPiperAvailable()) {
    return errResponse(res, 503, 'tts.piper_unavailable', 'Piper no instalado');
  }
  if (backend === 'macsay' && !isMacSayAvailable()) {
    return errResponse(res, 503, 'tts.macsay_unavailable', 'macOS say no disponible');
  }
  if (ttsConcurrency.active >= ttsConcurrency.max) {
    return errResponse(res, 429, 'tts.too_concurrent', 'Demasiadas síntesis concurrentes');
  }
  ttsConcurrency.active += 1;
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const wav = backend === 'macsay'
      ? await synthesizeMacSay(parsed.data.text, parsed.data.voice ?? '', controller.signal)
      : await synthesize(parsed.data, controller.signal);
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

// SPA fallback final — si llegaste hasta acá sin matchear ningún API route,
// servimos el index.html (deep linking del navegador interno de Eco).
if (frontendDistEarly && fsExistsSync(frontendDistEarly)) {
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/ws')) return next();
    // Ya tiene auth pasada acá, así que es safe servir el shell.
    res.sendFile(pathJoin(frontendDistEarly, 'index.html'));
  });
}

const server = createServer(app);
attachWebSocket(server, authToken);
attachPtyServer(server, authToken);

server.listen(config.port, config.host, () => {
  console.log(`\n🟢 Eco backend listo`);
  console.log(`   HTTP:      http://${config.host}:${config.port}`);
  console.log(`   WebSocket: ws://${config.host}:${config.port}/ws`);
  console.log(`   Workspaces: ${config.workspaces.join(', ')}`);
  console.log(`   Modelo:    ${config.model}`);
  console.log(`   Orígenes:  ${config.allowedOrigins.join(', ')}`);
  console.log(`   Conexiones máx: ${config.maxOpenConnections}`);
  console.log(`   Auth:      Bearer ${authToken.slice(0, 8)}…  (archivo: ~/.eco/token)\n`);

  // GC de worktrees: limpia los que no tienen cambios al startup.
  try {
    const r = pruneCleanWorktrees();
    if (r.removed.length > 0) {
      console.log(`   Worktrees limpios eliminados al startup: ${r.removed.length} (${r.removed.slice(0, 3).join(', ')}${r.removed.length > 3 ? '…' : ''})`);
    }
  } catch (e) {
    console.error('[worktree-prune] error en startup:', e);
  }
});

// GC periódico cada 15 min mientras corre.
const PRUNE_INTERVAL_MS = 15 * 60 * 1000;
const pruneTimer = setInterval(() => {
  try {
    const r = pruneCleanWorktrees();
    if (r.removed.length > 0) {
      console.log(`[worktree-prune] eliminados ${r.removed.length}: ${r.removed.join(', ')}`);
    }
  } catch (e) {
    console.error('[worktree-prune] error:', e);
  }
}, PRUNE_INTERVAL_MS);
pruneTimer.unref();

// GC al cerrar gracefully (Ctrl-C, kill TERM).
function shutdown(signal: string) {
  console.log(`\n[eco] recibí ${signal}, limpiando worktrees sin cambios…`);
  try {
    const r = pruneCleanWorktrees();
    if (r.removed.length > 0) {
      console.log(`[eco] worktrees eliminados: ${r.removed.length}`);
    }
  } catch { /* noop */ }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
