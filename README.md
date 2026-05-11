# Eco

Asistente personal para Mac. Voz, archivos y código — 100% local.

```
        ╭───────────────────────────────────────╮
        │                                       │
        │   Eco escucha siempre · vos decís:    │
        │                                       │
        │     «Eco abrir Aditum»                │
        │     «Eco estado»                      │
        │     «Eco siguiente»                   │
        │                                       │
        │   Adentro de una conversación,        │
        │   sin «Eco» adelante = mensaje al     │
        │   agente de Claude.                   │
        │                                       │
        ╰───────────────────────────────────────╯
```

**Qué es**: un orquestador de conversaciones con Claude Code SDK. Cada conversación es una "burbuja" independiente con su propio sessionId, workspace, terminal, archivos modificados y plan. Voz siempre activa con dispatcher por prefijo: `Eco <comando>` controla el sistema, sin `Eco` adelante es input a la burbuja activa.

**Privacidad**: el audio nunca sale de tu máquina. STT y wake word corren locales (faster-whisper + openwakeword). TTS también es local (Piper). Solo dos cosas tocan internet: la API de Claude (cuando la burbuja activa lo necesita) y validación de licencia (a futuro, opcional).

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Vite + React + TS)                                   │
│  · Liquid Glass dark/light · Stage Manager de burbujas          │
│  · Comandos meta «Eco ...» con parser regex local (sin Claude)  │
│  · Web Speech API (dev) → reemplazado por listener Python       │
└────────────┬────────────────────────────────────────────────────┘
             │ WebSocket /ws (Bearer token vía subprotocol)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend Node (Express + ws + Claude Agent SDK)                 │
│  · Bind 127.0.0.1 + auth + origin + Zod + rate limit            │
│  · Tools custom MCP: open_bubble, rename_bubble, close_bubble   │
│  · canUseTool deny por default; allowlist explícita             │
│  · Endpoints: /shell /tts /file/diff /skills /workspaces /voice │
└────────────┬────────────────────────────────────────────────────┘
             │ spawneo del binario claude                  ┌─────────────┐
             ▼                                             │ Piper TTS   │
       Claude Agent SDK ←─────── stdin/stdout ─────────►  │ local       │
                                                           │ (ONNX)      │
┌─────────────────────────────────────────────────────────┴─────────────┐
│  Listener Python (sidecar)                                            │
│  · openwakeword (ONNX local) escucha mic 24/7                         │
│  · faster-whisper transcribe local (es)                               │
│  · POST /voice/transcribed → broadcast WS al frontend                 │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Setup local (dev)

Prerequisitos: **Node 20+**, **Python 3.10+**, **claude CLI** (`@anthropic-ai/claude-code`) autenticado.

```bash
# 1) Instalar deps de frontend + backend
npm install

# 2) Configurar workspaces permitidos
cp backend/.env.example backend/.env
# Editar backend/.env: ECO_WORKSPACES=/Users/sergio/projects/aditum-jh

# 3) Copiar token del backend al frontend (se genera al primer arranque)
cp frontend/.env.example frontend/.env.local
# Después de arrancar el backend, copiar el token de ~/.eco/token a VITE_ECO_TOKEN

# 4) Levantar todo
npm run dev
# Backend: http://127.0.0.1:7000
# Frontend: http://127.0.0.1:5173

# 5) (Opcional) Listener de voz local 100%
npm run listener:setup   # solo la primera vez
npm run listener         # arranca el wake word + STT local
```

---

## Estructura del proyecto

```
eco/
├── README.md                  ← este archivo
├── package.json               ← workspace root + scripts paralelos
│
├── backend/                   ← Node + Express + Claude SDK
│   ├── src/
│   │   ├── index.ts           ← arranca HTTP + WS
│   │   ├── config.ts          ← env vars + workspace whitelist
│   │   ├── auth.ts            ← Bearer token persistido ~/.eco/token
│   │   ├── security.ts        ← bash blacklist + env allowlist
│   │   ├── ws-server.ts       ← WebSocket con verifyClient + broadcast
│   │   ├── protocol.ts        ← tipos Zod de mensajes WS
│   │   ├── agent.ts           ← wrapper del Claude Agent SDK
│   │   ├── agent-tools.ts     ← MCP tools custom (open_bubble, etc.)
│   │   ├── shell.ts           ← endpoint /shell para terminal interactiva
│   │   ├── tts.ts             ← endpoint /tts con Piper local
│   │   ├── skills.ts          ← /skills lista capabilities de Claude
│   │   ├── file-diff.ts       ← /file/diff (git o plain)
│   │   └── workspaces-store.ts ← /workspaces CRUD
│   ├── tests/                 ← suite de seguridad y sanity
│   ├── piper/                 ← Piper TTS bin + voces neurales (gitignored)
│   └── .env.example
│
├── frontend/                  ← Vite + React + TS
│   ├── src/
│   │   ├── App.tsx            ← orquestador, dispatcher Eco
│   │   ├── design/            ← tokens, theme, primitives, icons, logo
│   │   ├── components/        ← AppSidebar, CommandFeedback, etc.
│   │   ├── screens/           ← Dashboard, AgentDetail, Settings, ...
│   │   ├── hooks/             ← useBubbles, useEcoSocket, useVoice, ...
│   │   └── lib/               ← types, api, cn, meta-commands
│   ├── public/brand/          ← logo SVG + paleta oficial
│   └── .env.example
│
└── listener/                  ← Python sidecar (wake word + STT)
    ├── main.py                ← pipeline mic → wake → whisper → POST
    ├── requirements.txt
    ├── setup.sh               ← venv + deps + modelos en 1 comando
    └── README.md
```

---

## Comandos disponibles

### Desarrollo

| Comando | Descripción |
|---|---|
| `npm run dev` | Backend + frontend en paralelo |
| `npm run dev:backend` | Solo backend (puerto 7000) |
| `npm run dev:frontend` | Solo Vite (puerto 5173) |
| `npm run typecheck` | TS de ambos workspaces |
| `npm run test:security` | Suite de tests de seguridad del backend |
| `npm run listener:setup` | Crea venv + instala deps + baja modelos |
| `npm run listener` | Arranca el sidecar Python |

### Comandos de voz/texto en la app (prefijo `Eco`)

| Comando | Acción |
|---|---|
| `Eco abrir <nombre>` | Si existe, foco; sino crea |
| `Eco renombrar <nombre>` | Renombra la burbuja activa |
| `Eco cerrar` | Cierra la burbuja activa |
| `Eco ir <nombre>` | Fuzzy match → focus |
| `Eco siguiente` / `Eco anterior` | Navega entre burbujas |
| `Eco dashboard` / `Eco atrás` | Volver al inicio |
| `Eco ajustes` / `Eco archivos` / `Eco historial` | Navegar a esas secciones |
| `Eco estado` | Overlay con todas las burbujas + actividad |
| `Eco pausar` / `Eco continuar` | Toggle pausa de la activa |
| `Eco silencio` / `Eco hablar` | Toggle TTS |
| `Eco oscuro` / `Eco claro` / `Eco sistema` | Cambia tema |
| `Eco ayuda` | Lista todos los comandos |

Dentro de una burbuja, **sin** prefijo `Eco`, el texto se manda al agente como prompt.

---

## Variables de configuración

### Backend (`backend/.env`)

| Variable | Default | Descripción |
|---|---|---|
| `ECO_WORKSPACES` | `~/projects/eco-test` | Workspaces autorizados (CSV). El usuario también puede agregar más desde Ajustes |
| `ECO_HOST` | `127.0.0.1` | Bind interface (no cambiar) |
| `ECO_PORT` | `7000` | Puerto HTTP/WS |
| `ECO_ALLOWED_ORIGINS` | `tauri://localhost,...` | Orígenes WS permitidos |
| `ECO_MODEL` | `claude-sonnet-4-5-20250929` | Modelo de Claude |
| `ECO_SKILL_SOURCES` | `user,project` | Skills de Claude a cargar |
| `ECO_RATE_LIMIT` | `10` | Prompts/minuto |
| `ECO_PROMPT_TIMEOUT_MS` | `600000` | Timeout absoluto de prompt |
| `CLAUDE_CLI_PATH` | `~/.local/bin/claude` | Ruta del binario Claude |
| `ANTHROPIC_API_KEY` | (opcional) | Solo si no usás `claude login` |

### Frontend (`frontend/.env.local`)

| Variable | Default | Descripción |
|---|---|---|
| `VITE_ECO_TOKEN` | (requerido) | Bearer token, copiar de `~/.eco/token` |
| `VITE_ECO_BACKEND` | (vacío = relativo) | URL del backend; relativo usa Vite proxy |

### Listener (`listener/`, env vars)

| Variable | Default | Descripción |
|---|---|---|
| `ECO_BACKEND` | `http://127.0.0.1:7000` | URL del backend |
| `ECO_TOKEN_FILE` | `~/.eco/token` | Archivo del Bearer token |
| `ECO_WAKE_MODEL` | `hey_jarvis_v0.1` | Modelo de wake word |
| `ECO_WAKE_THRESHOLD` | `0.5` | Score mínimo (0–1) |
| `ECO_WHISPER_MODEL` | `base` | `tiny` / `base` / `small` / `medium` |
| `ECO_LANG` | `es` | Idioma |

---

## Seguridad

Auditoría inicial pasada · 16 tests automatizados verdes. Capas:

| Capa | Control |
|---|---|
| Red | Bind 127.0.0.1 + Host check (anti DNS rebinding) + cap 12 conexiones |
| Auth | Bearer token 32B `~/.eco/token` chmod 600 · `timingSafeEqual` |
| CSRF | Origin whitelist + header `X-Eco-Client: 1` requerido |
| Input | Zod schemas + max 50KB/prompt + rate limit |
| Filesystem | `realpathSync` + workspace whitelist + path traversal check |
| Tools Claude | allowlist explícita (`tools: [...]`) + `canUseTool` deny por default |
| Bash | bloqueado en Claude · habilitado solo en `/shell` con blacklist de patrones peligrosos + sandbox por workspace |
| Subproceso | env allowlist (no filtra `AWS_*`, `GITHUB_TOKEN`, etc.) |
| Errores | sanitizados antes de enviar al cliente |

Correr suite:

```bash
npm run test:security
```

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | Vite 6, React 18, TypeScript 5, Tailwind v4 (CSS-first), Motion 11, Radix UI |
| Backend | Node 20, Express 4, ws, Zod, better-sqlite3 (futuro), Claude Agent SDK |
| Voz STT | openwakeword (ONNX local) + faster-whisper (CTranslate2) |
| Voz TTS | Piper TTS (ONNX local) — voces `es_ES-davefx-medium`, `es_ES-sharvard-medium`, `es_MX-claude-high` |
| Tema | Light / dark / system con CSS `oklch()` + 5 acentos configurables |

---

## Roadmap

Hecho ✓:
- Backend funcional con Claude Agent SDK
- Hardening de seguridad (16 tests)
- Frontend rediseñado (bundle Anthropic Design)
- Multi-burbuja Stage Manager con persistencia local
- Skills/commands/agents de Claude descubiertos automático con autocomplete `/`
- Terminal interactiva por burbuja
- Diff viewer real (git o plain)
- Voz "siempre escuchando" con dispatcher por prefijo
- TTS local con Piper
- Wake word local con openwakeword + Whisper
- Workspaces editables + brand assets

Pendiente:
- Empaquetar como `.app` de macOS con Tauri (sidecars: Node + Piper + Python listener + claude CLI)
- Entrenar wake word custom `Eco` (hoy usa `hey jarvis` pre-entrenado)
- Push-to-talk con Whisper en Chrome (workaround para no depender de Google Speech)
- SQLite local para chat history de larga duración (hoy es localStorage)
- Selector de cuenta de Claude / API key management desde UI
- License gating con Paddle/LemonSqueezy (cuando vaya a venderse)

---

## Licencia

Privada — no distribuir.

## Créditos

Bundle de diseño inicial generado en [claude.ai/design](https://claude.ai/design).
Logo y brand assets en `frontend/public/brand/`.
