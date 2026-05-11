import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { config } from './config.js';
import { attachWebSocket } from './ws-server.js';
import { extractBearer, getOrCreateToken, tokensMatch } from './auth.js';

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
  const expectedA = `127.0.0.1:${config.port}`;
  const expectedB = `localhost:${config.port}`;
  if (host !== expectedA && host !== expectedB) {
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
  });
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
