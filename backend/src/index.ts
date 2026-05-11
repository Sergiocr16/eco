import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { config } from './config.js';
import { attachWebSocket } from './ws-server.js';
import { extractBearer, getOrCreateToken, tokensMatch } from './auth.js';
import { isPiperAvailable, listVoices, synthesize, TTSRequestSchema } from './tts.js';
import { listSkills } from './skills.js';

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
