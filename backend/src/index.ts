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
import { z } from 'zod';

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
  if (!host) return res.status(403).json({ error: 'Host header requerido' });
  const hostname = host.split(':')[0]?.toLowerCase();
  if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '[::1]') {
    return res.status(403).json({ error: 'Host no permitido' });
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.headers['x-eco-client'] !== '1') {
    return res.status(400).json({ error: 'Header X-Eco-Client requerido' });
  }
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const token = extractBearer(req.headers.authorization);
  if (!tokensMatch(authToken, token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
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
  if (!isPiperAvailable()) return res.status(503).json({ error: 'Piper no instalado' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Cuerpo inválido' });
  const result = addWorkspace(parsed.data.path);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true, path: result.path, workspaces: config.workspaces });
});

app.delete('/workspaces', (req: Request, res: Response) => {
  const parsed = AddWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Cuerpo inválido' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Cuerpo inválido' });
  try {
    if (parsed.data.validate !== false) {
      const result = await validateApiKey(parsed.data.key);
      if (!result.ok) return res.status(400).json({ error: result.error ?? 'Key inválida' });
    }
    writeApiKey(parsed.data.key);
    res.json({ ok: true, masked: maskedApiKey() });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Error guardando key' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Cuerpo inválido' });
  const text = parsed.data.text.trim();
  if (!text) return res.status(400).json({ error: 'Texto vacío' });
  broadcastServerMessage({ type: 'voice_transcribed', text, ts: Date.now() });
  res.json({ ok: true });
});

app.post('/file/diff', async (req: Request, res: Response) => {
  const parsed = DiffRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Cuerpo inválido' });
  try {
    const result = await fileDiff(parsed.data);
    res.json(result);
  } catch (err) {
    const status = (err as { httpStatus?: number }).httpStatus ?? 500;
    const message = err instanceof Error ? err.message : 'Error';
    res.status(status).json({ error: message });
  }
});

const shellConcurrency = { active: 0, max: 3 };

app.post('/shell', async (req: Request, res: Response) => {
  const parsed = ShellRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Cuerpo inválido' });
  if (shellConcurrency.active >= shellConcurrency.max) {
    return res.status(429).json({ error: 'Demasiados comandos concurrentes' });
  }
  shellConcurrency.active += 1;
  try {
    const result = await runShell(parsed.data);
    res.json(result);
  } catch (err) {
    const status = (err as { httpStatus?: number }).httpStatus ?? 500;
    const message = err instanceof Error ? err.message : 'Error de shell';
    res.status(status).json({ error: message });
  } finally {
    shellConcurrency.active -= 1;
  }
});

const ttsConcurrency = { active: 0, max: 2 };

app.post('/tts', async (req: Request, res: Response) => {
  if (!isPiperAvailable()) return res.status(503).json({ error: 'Piper no instalado' });
  const parsed = TTSRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Cuerpo inválido' });
  if (ttsConcurrency.active >= ttsConcurrency.max) {
    return res.status(429).json({ error: 'Demasiadas síntesis concurrentes' });
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
    const safe = err instanceof Error && /timeout/i.test(err.message) ? 'TTS timeout' : 'Error de síntesis';
    console.error('[tts] error:', err instanceof Error ? err.message : err);
    if (!res.headersSent) res.status(500).json({ error: safe });
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
