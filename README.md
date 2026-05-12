# Eco

Asistente personal para Mac. Voz, archivos y código — 100% local.

```
        ╭───────────────────────────────────────╮
        │                                       │
        │   Eco escucha siempre · vos decís:    │
        │                                       │
        │     «Hey Eco abrí Aditum»             │
        │     «Hey Eco terminal»                │
        │     «Hey Eco al final»                │
        │     «Hey Eco repetí»                  │
        │                                       │
        │   Adentro de una conversación,        │
        │   sin «Eco» adelante = mensaje al     │
        │   agente de Claude.                   │
        │                                       │
        ╰───────────────────────────────────────╯
```

**Qué es**: un orquestador de conversaciones con Claude Code SDK. Cada
conversación es una "burbuja" independiente con su propio sessionId,
workspace, terminal, archivos modificados y plan. Voz siempre activa con
dispatcher por prefijo: `Eco <comando>` ejecuta acción del sistema (parser
regex local, sin tokens de Claude); sin `Eco` adelante el texto va al
agente de la burbuja activa.

**Privacidad**: el audio nunca sale de tu máquina. STT y wake word corren
locales (faster-whisper + openwakeword). TTS también es local (Piper).
Solo dos cosas tocan internet: la API de Claude (cuando la burbuja activa
lo necesita) y validación de la API key al guardarla.

**Idiomas**: la UI es bilingüe español ⇄ inglés. Detecta automáticamente
el idioma del sistema y se cambia desde Ajustes → General. Los errores
del backend viajan con un código estable y se traducen del lado del
frontend (resistente a desfase entre versiones).

**Auth local**: PIN de 4-8 dígitos + frase de recuperación BIP39 de 12
palabras. La cuenta vive en `~/.eco/user.json` con argon2id y chmod 600.
Sin servidor externo, sin Firebase.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Vite + React + TS + Tailwind v4)                     │
│  · Liquid Glass dark/light · Stage Manager de burbujas          │
│  · Comandos meta «Eco ...» con parser regex local (sin Claude)  │
│  · Wake feedback: beep + pulso + timeout 3s                     │
│  · Web Speech API (dev) → listener Python en empaquetado        │
│  · i18n custom · errores backend traducibles por código         │
└────────────┬────────────────────────────────────────────────────┘
             │ WebSocket /ws (Bearer token vía subprotocol)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend Node (Express + ws + Claude Agent SDK)                 │
│  · Bind 127.0.0.1 + auth + origin + Zod + rate limit            │
│  · AppError tipado (code + message) → cliente traduce           │
│  · Tools custom MCP: open_bubble, rename_bubble, close_bubble   │
│  · canUseTool deny por default; allowlist explícita             │
│  · Endpoints: /shell /tts /file/diff /skills /workspaces /voice │
│  · Auth: /auth/register /login /recover (PIN + BIP39)           │
└────────────┬────────────────────────────────────────────────────┘
             │ spawneo del binario claude                  ┌─────────────┐
             ▼                                             │ Piper TTS   │
       Claude Agent SDK ←─────── stdin/stdout ─────────►  │ local       │
                                                           │ (ONNX)      │
┌─────────────────────────────────────────────────────────┴─────────────┐
│  Listener Python (sidecar)                                            │
│  · openwakeword (ONNX local) escucha mic 24/7                         │
│  · Wake word custom "Hey Eco" (training pipeline incluido)            │
│  · faster-whisper (medium · 30-40% más preciso con initial_prompt)    │
│  · POST /voice/transcribed → broadcast WS al frontend                 │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Setup local (dev)

Prerequisitos: **Node 20+**, **Python 3.10+**, **claude CLI** (`@anthropic-ai/claude-code`) autenticado.

```bash
# 1) Instalar deps de frontend + backend
npm install

# 2) Configurar workspaces permitidos (también editables desde Ajustes después)
cp backend/.env.example backend/.env
# Editar backend/.env: ECO_WORKSPACES=/Users/sergio/projects/aditum-jh

# 3) Copiar token del backend al frontend (se genera al primer arranque)
cp frontend/.env.example frontend/.env.local
# Después de arrancar el backend, copiar el token de ~/.eco/token a VITE_ECO_TOKEN

# 4) Levantar todo
npm run dev
# Backend: http://127.0.0.1:7000
# Frontend: http://127.0.0.1:5173

# 5) Primera vez: crear cuenta local (PIN + frase de recuperación)
# La app te lleva a un wizard al primer arranque.

# 6) (Opcional) Listener de voz local 100%
npm run listener:setup   # solo la primera vez
npm run listener         # arranca el wake word + STT local

# 7) (Opcional) Entrenar wake word "Hey Eco" custom (~20-35 min, una vez)
cd listener
source .venv/bin/activate
pip install -r training/requirements-train.txt
python training/train_wake.py --negatives-dir ~/Music/ -v
# → genera listener/models/hey_eco.onnx
# El listener lo detecta y usa automático en el próximo arranque
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
│   │   ├── index.ts           ← arranca HTTP + WS + middlewares de auth
│   │   ├── config.ts          ← env vars + workspace whitelist
│   │   ├── auth.ts            ← Bearer token persistido ~/.eco/token
│   │   ├── user-store.ts      ← PIN + BIP39 (argon2id, ~/.eco/user.json)
│   │   ├── sessions.ts        ← Sesiones in-memory 1h TTL
│   │   ├── api-key-store.ts   ← Anthropic API key (~/.eco/api-key)
│   │   ├── app-error.ts       ← AppError con códigos traducibles
│   │   ├── security.ts        ← bash blacklist + env allowlist
│   │   ├── ws-server.ts       ← WebSocket con verifyClient + broadcast
│   │   ├── protocol.ts        ← tipos Zod de mensajes WS
│   │   ├── agent.ts           ← wrapper del Claude Agent SDK
│   │   ├── agent-tools.ts     ← MCP tools custom (open_bubble, etc.)
│   │   ├── shell.ts           ← /shell para terminal interactiva
│   │   ├── tts.ts             ← /tts con Piper local
│   │   ├── skills.ts          ← /skills lista capabilities de Claude
│   │   ├── file-diff.ts       ← /file/diff (git o plain)
│   │   └── workspaces-store.ts ← /workspaces CRUD (códigos de error)
│   ├── tests/                 ← suite de seguridad (16 tests)
│   ├── piper/                 ← Piper TTS bin + voces neurales (gitignored)
│   └── .env.example
│
├── frontend/                  ← Vite + React + TS
│   ├── src/
│   │   ├── App.tsx            ← orquestador, dispatcher Eco, wake feedback
│   │   ├── main.tsx
│   │   ├── design/            ← tokens, theme, primitives, icons, logo
│   │   ├── components/        ← AppSidebar, CommandFeedback, StatusOverlay,
│   │   │                       WorkspacePicker, DiffViewer
│   │   ├── screens/           ← Dashboard, AgentDetail, Settings,
│   │   │                       AuthScreen, FileExplorer
│   │   ├── hooks/             ← useBubbles, useEcoSocket, useVoice,
│   │   │                       useTTS, useAuth, useApiKey, useI18n,
│   │   │                       useWorkspaces, useDefaultWorkspace,
│   │   │                       useQuickSuggestions
│   │   └── lib/               ← types, api, meta-commands, i18n,
│   │                            backend-errors, eco-bus, wake-beep
│   ├── public/brand/          ← logo SVG + paleta oficial
│   └── .env.example
│
└── listener/                  ← Python sidecar (wake word + STT)
    ├── main.py                ← pipeline mic → wake → whisper → POST
    ├── requirements.txt
    ├── setup.sh               ← venv + deps + modelos en 1 comando
    ├── models/                ← ONNX wake word (gitignored)
    ├── training/              ← pipeline para wake word custom "Hey Eco"
    │   ├── train_wake.py      ← 10k muestras sintéticas → MLP → ONNX
    │   ├── requirements-train.txt
    │   └── README.md          ← instrucciones paso-a-paso
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

Aceptados: `Eco`, `Hey Eco`, `Oye Eco`. Después del prefijo, podés mezclar
sinónimos en español (el dispatcher tiene ~120 alias).

**Navegación entre pantallas**

| Comando | Acción |
|---|---|
| `Eco dashboard` / `Eco inicio` / `Eco atrás` | Volver al inicio |
| `Eco ajustes` / `Eco archivos` / `Eco historial` | Cambiar de sección |
| `Eco estado` | Overlay con todas las burbujas + actividad |
| `Eco ayuda` | Lista todos los comandos |

**Burbujas**

| Comando | Acción |
|---|---|
| `Eco abrir <nombre>` | Si existe, foco; sino crea |
| `Eco renombrar <nombre>` | Renombra la burbuja activa |
| `Eco cerrar` | Cierra la burbuja activa |
| `Eco ir <nombre>` | Fuzzy match → focus |
| `Eco siguiente` / `Eco anterior` | Navega entre burbujas |
| `Eco pausar` / `Eco continuar` | Toggle pausa de la activa |

**Dentro de una burbuja**

| Comando | Acción |
|---|---|
| `Eco chat` / `Eco terminal` / `Eco archivos` / `Eco plan` | Cambia de pestaña |
| `Eco scroll abajo` / `Eco arriba` / `Eco al final` / `Eco al inicio` | Scroll del panel activo |
| `Eco repetir` / `Eco releer` | Re-lee el último mensaje del agente |
| `Eco sí` / `Eco no` / `Eco acepta` / `Eco cancela` | Responde a diálogos de confirmación |

**Voz y apariencia**

| Comando | Acción |
|---|---|
| `Eco silencio` / `Eco hablar` | Toggle TTS |
| `Eco rápido` / `Eco lento` / `Eco normal` | Velocidad de voz |
| `Eco fuerte` / `Eco bajo` | Volumen de voz |
| `Eco oscuro` / `Eco claro` / `Eco sistema` | Cambia tema |

Dentro de una burbuja, **sin** prefijo `Eco`, el texto se manda al agente
como prompt. Al detectar un prefijo de wake, Eco emite un beep sutil + pulso
visual + abre una ventana de 3 segundos para que completes el comando.

---

## Variables de configuración

### Backend (`backend/.env`)

| Variable | Default | Descripción |
|---|---|---|
| `ECO_WORKSPACES` | `~/projects/eco-test` | Workspaces autorizados (CSV). Editables también desde Ajustes |
| `ECO_HOST` | `127.0.0.1` | Bind interface (no cambiar) |
| `ECO_PORT` | `7000` | Puerto HTTP/WS |
| `ECO_ALLOWED_ORIGINS` | `tauri://localhost,...` | Orígenes WS permitidos |
| `ECO_MODEL` | `claude-sonnet-4-5-20250929` | Modelo de Claude |
| `ECO_SKILL_SOURCES` | `user,project` | Skills de Claude a cargar |
| `ECO_RATE_LIMIT` | `10` | Prompts/minuto |
| `ECO_PROMPT_TIMEOUT_MS` | `600000` | Timeout absoluto de prompt |
| `CLAUDE_CLI_PATH` | `~/.local/bin/claude` | Ruta del binario Claude |
| `ANTHROPIC_API_KEY` | (opcional) | Solo si no usás `claude login` ni guardás la key en `~/.eco/api-key` |

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
| `ECO_WAKE_MODEL` | auto (`hey_eco` si existe, sino `hey_jarvis_v0.1`) | Modelo de wake word |
| `ECO_WAKE_THRESHOLD` | `0.5` | Score mínimo (0–1) |
| `ECO_WHISPER_MODEL` | `medium` | `tiny` / `base` / `small` / `medium` / `large-v3` |
| `ECO_LANG` | `es` | Idioma |
| `ECO_INITIAL_PROMPT` | (vocabulario Eco + Aditum) | Texto que sesga la transcripción al dominio. Vacío = neutro |

---

## Seguridad

Auditoría inicial pasada · 16 tests automatizados verdes. Capas:

| Capa | Control |
|---|---|
| Red | Bind 127.0.0.1 + Host check (anti DNS rebinding) + cap 12 conexiones |
| Auth backend | Bearer token 32B `~/.eco/token` chmod 600 · `timingSafeEqual` |
| Auth usuario | PIN argon2id + frase BIP39 12 palabras (`~/.eco/user.json` chmod 600) |
| Sesión | In-memory 1h TTL · header `X-Eco-Session` |
| CSRF | Origin whitelist + header `X-Eco-Client: 1` requerido |
| Input | Zod schemas + max 50KB/prompt + rate limit |
| Filesystem | `realpathSync` + workspace whitelist + path traversal check |
| Tools Claude | allowlist explícita (`tools: [...]`) + `canUseTool` deny por default |
| Bash | bloqueado en Claude · habilitado solo en `/shell` con blacklist de patrones peligrosos + sandbox por workspace |
| Subproceso | env allowlist (no filtra `AWS_*`, `GITHUB_TOKEN`, etc.) |
| Errores | sanitizados antes de enviar al cliente · códigos estables traducibles |

Correr suite:

```bash
npm run test:security
```

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | Vite 6, React 18, TypeScript 5, Tailwind v4 (CSS-first), Motion 11, Radix UI |
| i18n | Diccionario custom (TS), bilingüe ES/EN, sin lib externa |
| Backend | Node 20, Express 4, ws, Zod, @node-rs/argon2, bip39, Claude Agent SDK |
| Voz STT | openwakeword (ONNX local) + faster-whisper (CTranslate2, `medium` por default) |
| Voz TTS | Piper TTS (ONNX local) — voces `es_ES-davefx-medium`, `es_MX-claude-high`, etc. |
| Tema | Light / dark / system con CSS `oklch()` + 5 acentos configurables |
| Beep | WebAudio API (osciladores in-process, sin assets) |

---

## Roadmap

**Hecho ✓**:

- Backend funcional con Claude Agent SDK
- Hardening de seguridad (16 tests)
- Frontend rediseñado (bundle Anthropic Design, Liquid Glass)
- Multi-burbuja Stage Manager con persistencia local
- Skills/commands/agents de Claude descubiertos automático con autocomplete `/`
- Terminal interactiva por burbuja
- Diff viewer real (git o plain)
- Voz "siempre escuchando" con dispatcher por prefijo
- TTS local con Piper (con rate/volume ajustable por voz)
- Wake word local con openwakeword + Whisper
- Pipeline de training para wake word custom "Hey Eco"
- Workspaces editables desde UI + brand assets
- Auth local con PIN + frase BIP39 (sin servidor externo)
- API key de Anthropic almacenada local con validación
- i18n bilingüe ES/EN end-to-end (UI + errores del backend con códigos)
- Comandos de navegación expandidos (scroll, tabs, sí/no, repetir, ajustes TTS)
- Feedback de wake prefix (beep + pulso + timeout 3s)
- Whisper `medium` por default + `initial_prompt` con vocabulario del producto

**Pendiente**:

- Empaquetar como `.app` de macOS con Tauri (sidecars: Node + Piper + Python listener + claude CLI)
- Push-to-talk con Whisper en Chrome (workaround para no depender de Google Speech)
- SQLite local para chat history de larga duración (hoy es localStorage)
- Build para Windows multi-OS (Tauri targets)
- License gating con Paddle/LemonSqueezy (cuando vaya a venderse)

---

## Licencia

Privada — no distribuir.

## Créditos

Bundle de diseño inicial generado en [claude.ai/design](https://claude.ai/design).
Logo y brand assets en `frontend/public/brand/`.
Wake word training basado en [openwakeword](https://github.com/dscripka/openWakeWord) +
[piper-tts](https://github.com/rhasspy/piper).
