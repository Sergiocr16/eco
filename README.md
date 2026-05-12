# Eco

Asistente personal para Mac. Voz, archivos, código y git — 100% local.

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
        │   En la pestaña Shell, lo que digas   │
        │   se tipea directo en el terminal.    │
        │                                       │
        ╰───────────────────────────────────────╯
```

**Qué es**: un orquestador de conversaciones con Claude Code SDK. Cada
conversación es una "agente" independiente con su propio sessionId, un
**worktree git aislado**, terminal real con PTY, archivos modificados,
plan, y branches del repo. Voz siempre activa con dispatcher por prefijo:
`Eco <comando>` ejecuta acción del sistema (parser local tolerante a
sinónimos y rellenos); sin `Eco` adelante el texto va al agente de la
agente activa, o al PTY si estás en la pestaña Shell.

**Aislamiento por agente**: cuando trabajás sobre un repo git, cada
agente crea automáticamente su propio `git worktree` en
`~/.eco/worktrees/<bubbleId>` sobre una rama `eco/<short>`. Dos agentes
tocando el mismo repo nunca se pisan. La rama queda viva al cerrar la
agente para que puedas mergear o revisar.

**Privacidad**: el audio nunca sale de tu máquina. STT y wake word corren
locales (faster-whisper + openwakeword). TTS también es local (Piper).
Solo dos cosas tocan internet: la API de Claude (cuando la agente activa
lo necesita) y validación de la API key al guardarla.

**Idiomas**: la UI es bilingüe español ⇄ inglés. Detecta automáticamente
el idioma del sistema y se cambia desde Ajustes → General. Los errores
del backend viajan con un código estable y se traducen del lado del
frontend (resistente a desfase entre versiones).

**Auth local**: PIN de 4-8 dígitos + frase de recuperación BIP39 de 12
palabras + opcional foto de perfil. La cuenta vive en `~/.eco/user.json`
con argon2id y chmod 600. Sin servidor externo, sin Firebase. Bloquear /
cerrar sesión / eliminar usuario desde el menú de cuenta.

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Frontend (Vite + React + TS + Tailwind v4 + Motion 11)                 │
│  · Liquid Glass dark/light/AMOLED · 12 acentos · Dock macOS opt-in      │
│  · Comandos meta «Eco …» con parser tolerante (rellenos + sinónimos)    │
│  · Wake feedback: ListeningWave en el rail del Dashboard                │
│  · Web Speech API (dev) → listener Python en empaquetado                │
│  · Picker de Skills + Picker de Branches en cada agente                 │
│  · xterm.js en la pestaña Shell — PTY real con reattach                 │
│  · Commit con AI con preview editable                                   │
│  · Dashboard: grid · kanban · graph view con partículas hacia Eco       │
│  · Navegador global multi-pestaña (nav principal) + por-agente          │
│  · Dev server por agente vía skill `/dev-up` (puerto único, auto-retry) │
└──────────────┬───────────────────────────────────────────────────────────┘
               │  WebSocket /ws       (Claude SDK streaming)
               │  WebSocket /ws/pty   (PTY interactivo por agente)
               │  HTTP /git/* /file/* /skills /shell /tts /pty/kill /auth/*
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Backend Node (Express + ws + node-pty + Claude Agent SDK)              │
│  · Bind 127.0.0.1 + auth + origin + Zod + rate limit                    │
│  · AppError tipado (code + message) → cliente traduce                   │
│  · Tools MCP propias: open_bubble, rename_bubble, close_bubble          │
│  · Tools MCP del usuario: mcp__* (Notion, Obsidian, Pencil, Vercel, …)  │
│  · permissionMode: 'acceptEdits' (auto-mode) · Bash habilitado          │
│  · Worktree manager: una rama eco/<id> por agente con cleanup          │
│  · /git/branches /git/checkout /git/pull /git/fetch                     │
│  · /git/rename-branch /git/commit-suggest (vía claude -p) /git/commit   │
│  · PTY: spawn por agente, ring buffer 128KB, broadcast pty_status      │
│  · Snapshot WS al conectar (PTYs corriendo, status, etc.)               │
│  · Dev server por agente (`dev-server.ts`) — `/dev/up|down|restart`     │
│  · Browser proxy (`/proxy/site`) — strip de X-Frame-Options/CSP         │
└──────────────┬───────────────────────────────────────────────────────────┘
               │  spawn claude · spawn zsh PTY    ┌─────────────────────────┐
               ▼                                  │ Piper TTS local (ONNX)  │
       Claude Agent SDK ←── stdin/stdout ───►    └─────────────────────────┘
                              │
                              ▼
                     git worktree por agente
                     (~/.eco/worktrees/<id>)

┌──────────────────────────────────────────────────────────────────────────┐
│  Listener Python (sidecar)                                              │
│  · openwakeword (ONNX local) escucha mic 24/7                           │
│  · Wake word custom "Hey Eco" (training pipeline incluido)              │
│  · faster-whisper (medium · 30-40% más preciso con initial_prompt)      │
│  · POST /voice/transcribed → broadcast WS al frontend                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Setup local (dev)

Prerequisitos: **Node 20+**, **Python 3.10+**, **claude CLI** (`@anthropic-ai/claude-code`) autenticado, **git**.

```bash
# 1) Instalar deps de frontend + backend
npm install
# Si node-pty pierde el bit ejecutable del spawn-helper (raro pero pasa):
chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper

# 2) Configurar workspaces permitidos (también editables desde Ajustes)
cp backend/.env.example backend/.env
# Editar backend/.env: ECO_WORKSPACES=/Users/sergio/projects/aditum-jh

# 3) Token del backend al frontend (se genera al primer arranque)
cp frontend/.env.example frontend/.env.local
# Después de arrancar el backend, copiar el token de ~/.eco/token a VITE_ECO_TOKEN

# 4) Levantar todo
npm run dev
# Backend: http://127.0.0.1:7000
# Frontend: http://127.0.0.1:5174 (cae a 5174 si 5173 está ocupado)

# 5) Primera vez: crear cuenta local (PIN + frase de recuperación + foto opcional)
# La AuthScreen te muestra la frase ANTES de entrar a la app.

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
├── backend/                   ← Node + Express + Claude SDK + node-pty
│   ├── src/
│   │   ├── index.ts           ← HTTP + WS + middlewares de auth · monta /git, /pty, /auth, …
│   │   ├── config.ts          ← env vars + workspace whitelist
│   │   ├── auth.ts            ← Bearer token persistido ~/.eco/token
│   │   ├── user-store.ts      ← PIN + BIP39 (argon2id, ~/.eco/user.json)
│   │   ├── sessions.ts        ← Sesiones in-memory 1h TTL
│   │   ├── api-key-store.ts   ← Anthropic API key (~/.eco/api-key)
│   │   ├── app-error.ts       ← AppError con códigos traducibles
│   │   ├── security.ts        ← bash blacklist + env allowlist
│   │   ├── ws-server.ts       ← /ws con noServer + snapshot providers
│   │   ├── pty-server.ts      ← /ws/pty: sesión por bubbleId, ring buffer, reattach
│   │   ├── worktree-manager.ts ← `git worktree add/remove` por agente
│   │   ├── git-ops.ts         ← list/checkout/pull/fetch/rename + commit-suggest (claude -p)
│   │   ├── protocol.ts        ← tipos Zod de mensajes WS
│   │   ├── agent.ts           ← wrapper del Claude Agent SDK · permissionMode acceptEdits
│   │   ├── agent-tools.ts     ← MCP tools propias (open_bubble, etc.)
│   │   ├── shell.ts           ← /shell legacy (one-shot, ya no se usa por default)
│   │   ├── tts.ts             ← /tts con Piper local
│   │   ├── skills.ts          ← scan ~/.claude + workspace + plugins/cache/<m>/<p>/<v>/…
│   │   ├── file-diff.ts       ← /file/diff (resuelve worktree por bubbleId)
│   │   ├── dev-server.ts      ← skill-driven dev server por agente (claude -p)
│   │   ├── browser-proxy.ts   ← /proxy/site — strip XFO/CSP + inject base + click bridge
│   │   └── workspaces-store.ts
│   ├── tests/                 ← suite de seguridad
│   ├── piper/                 ← Piper TTS bin + voces neurales (gitignored)
│   └── .env.example
│
├── frontend/                  ← Vite + React + TS + Motion
│   ├── src/
│   │   ├── App.tsx            ← AuthGate + Shell + dispatcher Eco + wake feedback
│   │   ├── main.tsx
│   │   ├── design/            ← tokens, theme, primitives, icons, logo
│   │   ├── components/
│   │   │   ├── AppSidebar.tsx       ← nav + AccountMenu + BubbleDock (opt-in)
│   │   │   ├── BubbleDock.tsx       ← dock estilo macOS con magnificación
│   │   │   ├── AccountMenu.tsx      ← avatar (foto/initial), bloquear, eliminar usuario
│   │   │   ├── RealTerminal.tsx     ← xterm.js conectado a /ws/pty
│   │   │   ├── BranchPicker.tsx     ← branches + pull/fetch + rename
│   │   │   ├── SkillsPicker.tsx     ← lista SKILL.md/agents/commands del workspace
│   │   │   ├── DiffViewer.tsx       ← side-by-side estilo GitHub + buscador
│   │   │   ├── BrowserPanel.tsx     ← iframe por-agente + dev server + DevTools
│   │   │   ├── CommitWithAI.tsx     ← suggest → preview editable → commit (no push)
│   │   │   ├── CommandFeedback.tsx, StatusOverlay.tsx, WorkspacePicker.tsx
│   │   ├── screens/
│   │   │   ├── Dashboard.tsx        ← grid + graph + kanban view + DashboardRail
│   │   │   ├── AgentDetail.tsx      ← chat + terminal + files + plan + browser + sidebar (Git)
│   │   │   ├── BrowserScreen.tsx    ← navegador global multi-pestaña con persistencia
│   │   │   ├── Settings.tsx         ← General · Apariencia (12 acentos + AMOLED) · Dock
│   │   │   ├── AuthScreen.tsx       ← register / login / recover con frase pre-auth
│   │   │   └── FileExplorer.tsx
│   │   ├── hooks/
│   │   │   ├── useBubbles.ts        ← + bubble.ptyOpen + setBubblePtyOpen
│   │   │   ├── useEcoSocket.ts      ← + pty_status handler + snapshot
│   │   │   ├── useGitChanges.ts     ← polling de `git status --porcelain`
│   │   │   ├── useProfile.ts        ← foto + username en localStorage
│   │   │   ├── useSkills.ts, useVoice.ts, useTTS.ts, useAuth.ts, useI18n.ts,
│   │   │   │  useApiKey.ts, useWorkspaces.ts, useDefaultWorkspace.ts,
│   │   │   │  useQuickSuggestions.ts
│   │   └── lib/
│   │       ├── voice-router.ts      ← target='pty'|'chat' + writer registrado por RealTerminal
│   │       ├── meta-commands.ts     ← parser tolerante (LEADING_FILLERS + scan)
│   │       ├── platform.ts          ← detectRuntime() · web/electron/tauri/capacitor-ios
│   │       └── types, api, i18n, backend-errors, eco-bus, wake-beep
│   ├── public/brand/                ← logo SVG + paleta oficial
│   └── .env.example
│
└── listener/                  ← Python sidecar (wake word + STT)
    ├── main.py                ← pipeline mic → wake → whisper → POST
    ├── requirements.txt
    ├── setup.sh
    ├── models/                ← ONNX wake word (gitignored)
    ├── training/              ← pipeline para "Hey Eco" custom
    └── README.md
```

---

## Comandos disponibles

### Desarrollo

| Comando | Descripción |
|---|---|
| `npm run dev` | Backend + frontend en paralelo |
| `npm run dev:backend` | Solo backend (puerto 7000) |
| `npm run dev:frontend` | Solo Vite (puerto 5173 / 5174 fallback) |
| `npm run typecheck` | TS de ambos workspaces |
| `npm run test:security` | Suite de tests de seguridad del backend |
| `npm run listener:setup` | Crea venv + instala deps + baja modelos |
| `npm run listener` | Arranca el sidecar Python |

### Comandos de voz/texto en la app (prefijo `Eco`)

El parser tolera relleno discursivo, conjugaciones y orden libre dentro
de cada frase:

- **Leading fillers**: `me`, `te`, `por favor`, `porfa`, `necesito`,
  `quiero`, `podes`, `ahora`, `ya`, `che`, etc. se saltean.
- **Match de keyword**: si el primer token no es un alias, escanea todos
  los tokens hasta encontrar uno (ej: «che ayudame y **abrí** Aditum»).
- **~200 alias** incluyen variantes como `entrar/entrame`, `abrime`,
  `creame`, `lanzá`, `matar`, `pasame`, etc.

**Navegación**

| Comando | Acción |
|---|---|
| `Eco dashboard` / `Eco inicio` / `Eco atrás` | Volver al inicio |
| `Eco ajustes` / `Eco archivos` / `Eco historial` | Cambiar de sección |
| `Eco navegador` / `Eco internet` / `Eco web` | Abre la pantalla de navegador global |
| `Eco estado` | Overlay con todas las agentes + actividad |
| `Eco ayuda` | Lista todos los comandos |

**Agentes**

| Comando | Acción |
|---|---|
| `Eco abrir <nombre>` · `Eco entrame en <nombre>` | Si existe, foco; sino crea |
| `Eco renombrar <nombre>` / `Eco ponele <nombre>` | Renombra la agente activa |
| `Eco cerrar` / `Eco matá esto` | Cierra la agente activa (confirma si está corriendo) |
| `Eco ir <nombre>` / `Eco pasame a <nombre>` | Fuzzy match → focus |
| `Eco siguiente` / `Eco anterior` | Navega entre agentes |
| `Eco pausar` / `Eco continuar` | Toggle pausa de la activa |

**Dentro de una agente**

| Comando | Acción |
|---|---|
| `Eco chat` / `Eco terminal` / `Eco archivos` / `Eco plan` / `Eco navegador` | Cambia de pestaña |
| `Eco scroll abajo` / `Eco arriba` / `Eco al final` | Scroll del panel activo |
| `Eco repetir` / `Eco releer` | Re-lee el último mensaje del agente |
| `Eco sí` / `Eco no` / `Eco acepta` / `Eco cancela` | Responde a diálogos de confirmación |

**Voz y apariencia**

| Comando | Acción |
|---|---|
| `Eco silencio` / `Eco hablar` | Toggle TTS |
| `Eco rápido` / `Eco lento` / `Eco normal` | Velocidad de voz |
| `Eco fuerte` / `Eco bajo` | Volumen de voz |
| `Eco oscuro` / `Eco claro` / `Eco sistema` | Cambia tema |

**Ruteo de voz dentro de una agente**:

- Sin prefijo `Eco`, en pestaña **Chat** → mensaje al agente como prompt.
- Sin prefijo `Eco`, en pestaña **Terminal → Shell** → se tipea al PTY
  con `\n` (como si lo hubieras hablado al shell).
- Con prefijo `Eco` → comando meta global, no importa la pestaña.

Al detectar el wake prefix, el rail del Dashboard muestra un
**ListeningWave** animado (sin beep — solo visual).

---

## Agentes, terminales y worktrees

### Worktree por agente

Cuando una agente tiene workspace que es un repo git, al primer
prompt / shell / abrir Files tab, el backend crea automáticamente:

```
~/.eco/worktrees/<bubbleId>   ← worktree (checkout)
                              ← sobre rama eco/<short>
```

El agente Claude, el PTY de la pestaña Shell, el polling de `git
status`, y el `git diff` operan dentro del worktree. Dos agentes sobre
el mismo repo trabajan aisladas.

**Al cerrar la agente** (manualmente o por meta-command):
- Si la agente está thinking / executing / running / con PTY abierto,
  aparece un modal pidiendo confirmación.
- Al confirmar: PTY se mata, worktree se borra (`git worktree remove
  --force`), **la rama `eco/<short>` queda viva** en el repo padre para
  que puedas mergear o revisar.

Branches huérfanas: `git -C <repo> branch | grep eco/` para listarlas.

### Terminal real (PTY)

La pestaña **Terminal** tiene tres sub-vistas:

| Sub-tab | Qué hace |
|---|---|
| **Shell** | PTY real (zsh) por agente. Por default lanza `claude` al iniciar (configurable con `ECO_PTY_AUTOCLAUDE=0`). Sobrevive si salís de la agente: la conexión se reanuda con replay del últimos 128KB de output. La voz se rutea acá si estás en este sub-tab. |
| **Agente** | Read-only. Muestra todos los `Bash` que ejecutó el agente Claude en esta agente, con su comando, output, y estado. |
| **Comandos** | Legacy: terminal simulado one-shot vía `/shell`. Sigue ahí por compatibilidad. |

### Pestaña Files con diff side-by-side

- El badge de "Archivos modificados" merg-ea cambios del agente (vía
  `Write`/`Edit`/`MultiEdit`) **con** cambios detectados por `git status
  --porcelain` cada 4s → captura ediciones de Bash, del PTY, o de otras
  herramientas externas.
- Click en un archivo → modal **DiffViewer** estilo GitHub: split de 4
  columnas (lineNo viejo · texto viejo · lineNo nuevo · texto nuevo),
  hunks con header azul, adds verde / dels rojo / contexto neutral.
- **Búsqueda** en el diff: filtra hunks y resalta matches con `<mark>`.

### Branch picker + Commit con AI

En el sidebar derecho de cada agente (sección **Git**, debajo de
"Próxima acción"):

- **BranchPicker**: muestra rama actual + ↑ahead/↓behind. Botones
  Fetch/Pull. Botón ✎ para renombrar la rama (útil para cambiar
  `eco/<short>` a algo descriptivo). Click → expande: buscador, tabs
  Local/Remoto, lista con SHA + subject + ↑↓. Checkout de remoto
  trackea local automáticamente con `git checkout -t`.
- **Commit con AI**: input opcional de contexto → "Generar mensaje" →
  backend corre `claude -p` con `git status` + `git diff` + `git log
  --oneline -10` y pide SOLO el mensaje del commit → preview editable
  en textarea → "Hacer commit" ejecuta `git add -A && git commit -F -`
  (mensaje vía stdin). Botón "Regenerar" repite la sugerencia. No hace
  push.

---

## Dashboard

Tres vistas con toggle (`IconGrid` · `IconColumns` · `IconGraph`):

- **Grid**: cards estilo Liquid Glass (blur + saturate + inset
  highlight), entrada en cascada (stagger 30ms), `whileHover translateY
  -1` para lift sutil, `AnimatePresence layout` para tweens en
  reordenamientos.
- **Kanban**: columnas por estado (Activos, En espera, Inactivos, Con
  shell abierto, Terminados, Con error) con `KanbanCard` glass-effect
  intensity:`subtle` y border accent cuando el agente está corriendo.
- **Graph**: nodos flotando (`motion.g animate y:[…]` con fase
  desfasada por índice), respiración del radio cuando están activos,
  **partículas de datos** que viajan desde el hub Eco al nodo en loop
  cuando está running/thinking/executing, líneas con `stroke-dasharray`
  animado por keyframe `eco-flow`.
- **DashboardRail** (lado derecho): incluye `ListeningWave` arriba del
  card "Claude CLI" — barras animadas estilo waveform cuando hay wake
  prefix detectado.

`glassEffect(t, { intensity, hovered })` en `design/primitives.tsx`
combina `backdrop-filter blur(18–32px) saturate(140–180%)`, background
semi-transparente con tinte del tema y un inset highlight de 1px arriba
que simula el catch-light estilo Apple — disponible para usar como
spread en cualquier card de la app.

---

## Navegador interno

Eco tiene **dos** navegadores:

### Navegador global (nav principal · `BrowserScreen.tsx`)

Pestañas múltiples con persistencia. Click en el ícono globo del
sidebar izquierdo:

- Cada tab guarda `{id, url, title, proxied}` en
  `localStorage` (`eco.browser.tabs` + `eco.browser.active`). Al cerrar
  y reabrir Eco recuperás todo.
- **URL bar** con back / reload / abrir-en-sistema. Acepta URL o
  búsqueda libre (cae a Google si no parece URL).
- **Iframes ocultos** al cambiar de tab (no destruidos) → preservan
  scroll, cookies y estado de la página.
- **Watchdog** de 6s: si el iframe no dispara `load`, asume que el
  sitio bloqueó embedding (X-Frame-Options/CSP) y muestra banner.
- **Pill de runtime** (`◆ full` vs `○ web`) detecta si corremos en
  Electron/Tauri (donde `<webview>` ignora XFO) o en web puro.

### Modo proxy (`/proxy/site?url=…` · `browser-proxy.ts`)

Fallback para sitios que bloquean iframe. Botón "Probar modo proxy"
aparece en el banner de error. El backend:

1. Hace `fetch` del HTML con user-agent realista.
2. Strip de headers `X-Frame-Options`, `Content-Security-Policy`,
   `Content-Security-Policy-Report-Only`, `Permissions-Policy`.
3. Inyecta `<base href="…">` para que recursos relativos vayan al
   sitio original.
4. Inyecta un **script puente** que intercepta `click` en `<a>` y
   `submit` en `<form method=GET>` y los envía como `postMessage
   {kind:'eco-browser:nav', url}` al padre — `BrowserScreen` escucha y
   sigue navegando dentro del proxy, manteniendo encadenada la
   navegación en lugar de "saltarse" al sitio original.

**Limitaciones honestas**: sitios JS-pesados (Google, banks, Notion)
detectan que están en iframe/proxy y siguen rompiendo. Para esos, el
botón "Abrir en sistema" usa `window.open()`.

### Por-agente (`BrowserPanel.tsx`)

Pestaña adicional dentro de `AgentDetail` con iframe + dev server
controls (start/stop/restart) + DevTools panel (consola, elementos,
logs del server) + skill picker para elegir cómo levantar el dev
server. URL persistida en `localStorage` (`eco.browser.url.<bubbleId>`).
`KeepAliveBrowser` wrapper preserva el iframe state al salir y volver.

### Plataforma

`lib/platform.ts` exporta `detectRuntime()` (web · electron · tauri ·
capacitor-ios · capacitor-android) y `canEmbedArbitrarySites()`. Cuando
Eco se empaquete como Electron, basta con cambiar `<iframe>` por
`<webview>` cuando `canEmbedArbitrarySites()` sea true para obtener
navegación full Chromium sin restricciones de iframe.

---

## Dev server por agente

Cuando un agente quiere previsualizar su trabajo en el navegador, usa
la skill `/dev-up up|down|restart|status`:

- `dev-server.ts` invoca `claude -p` con el prompt de la skill (filename
  matching: `~/.claude/skills/dev-up/SKILL.md` o equivalente del repo).
- La skill responde con `<cmd>...</cmd>` que el backend extrae y
  ejecuta dentro del worktree del agente.
- **Auto-port**: si el puerto está ocupado, el backend reintenta hasta
  2 veces pidiendo a Claude que parche la config para leer
  `process.env.PORT`.
- **URL scoring**: el output del comando se escanea por URLs con
  keywords (`gulp`, `browser-sync`, `vite`, `frontend`) y puertos
  típicos (9000, 5173, 3000) para detectar cuál es la URL frontend.
- **Symlinks de install**: el worktree comparte `node_modules`,
  `vendor`, `.venv` del repo padre vía symlinks para que `gulp`/`vite`
  ejecuten sin reinstalar.
- Endpoints: `POST /dev/up` · `POST /dev/down` · `POST /dev/restart` ·
  `GET /dev/status` · `GET /dev/logs?bubbleId=<id>`.

---

## Dock estilo macOS (opt-in)

Activable desde **Ajustes → General → "Dock de agentes"** (default ON).

Vive en el `AppSidebar` izquierdo (64px wide), debajo de los ítems de
navegación. Cada agente se renderiza como un ícono rounded-square 36px:

- Avatar con el color accent de la agente + inicial del título.
- **Magnificación on hover** (single-target, no afecta vecinos):
  `whileHover scale: 1.45` con `transformOrigin: left center` para que
  crezca hacia el canvas y no contra el borde.
- Status dot top-right cuando está running/thinking/executing (pulsa)
  o cuando tiene un PTY abierto.
- Dot accent al costado derecho cuando hay actividad — "conectado a
  Eco".
- Tooltip a la derecha con título + estado.

`overflow: visible` global para que el zoom no genere scrollbar parásita.

---

## Auth, cuenta y foto de perfil

### Flujo de registro

1. **AuthScreen** muestra `RegisterView` si no hay usuario en
   `~/.eco/user.json`.
2. El usuario ingresa username + PIN.
3. Backend genera frase BIP39 de 12 palabras, escribe `user.json` con
   `pinHash` y `recoveryHash` (argon2id), responde con la frase y un
   session token.
4. **Importante**: el frontend **no transiciona a "authenticated"** acá.
   Muestra la frase en `ShowRecoveryView` con un checkbox "Guardé la
   frase". Recién al confirmar dispara `refresh()` y entrás a la app.
5. Si refrescás la página antes de confirmar, el token ya está en
   localStorage y la próxima vez entrás directo (pero la frase ya la viste).

### Menú de cuenta

Click en el avatar abajo a la izquierda del `AppSidebar`:

- Avatar muestra la **foto de perfil** si la subiste, o la **inicial**
  del username.
- Popover con tres opciones:
  - **Cambiar foto** (`+` arriba del avatar grande) — abre file picker.
    Se redimensiona a 128×128 JPEG con canvas (~5-8KB) y se guarda en
    `localStorage`. Botón `×` para quitarla.
  - **Bloquear pantalla** — invalida sesión local y server, vuelve al
    `LoginView` pidiendo PIN. El username y la foto quedan.
  - **Cerrar sesión y eliminar usuario** — abre modal de confirmación
    con PIN. Si valida, `DELETE /auth/user` borra `~/.eco/user.json`.
    Permite empezar desde cero con otra cuenta.

---

## Skills picker

Botón al lado de la pestaña **Plan** en cada agente. Muestra count de
skills disponibles.

El scanner del backend ahora incluye:

- `~/.claude/skills/` (user-level SKILL.md)
- `~/.claude/commands/` (user-level slash commands, ej: `kb.md`,
  `save-session.md`)
- `~/.claude/agents/` (user-level sub-agents)
- `<workspace>/.claude/{skills,commands,agents}/` (project-level —
  prioridad sobre user)
- `~/.claude/plugins/marketplaces/<m>/plugins/<p>/{skills,commands,agents}`
- `~/.claude/plugins/cache/<m>/<p>/<version>/{skills,commands,agents}`
  (es donde Claude Code expande los plugins activos)

Click en una skill → manda `/<name>` al chat (Claude lo resuelve como
slash command).

---

## Variables de configuración

### Backend (`backend/.env`)

| Variable | Default | Descripción |
|---|---|---|
| `ECO_WORKSPACES` | `~/projects/eco-test` | Workspaces autorizados (CSV). Editables desde Ajustes |
| `ECO_HOST` | `127.0.0.1` | Bind interface (no cambiar) |
| `ECO_PORT` | `7000` | Puerto HTTP/WS |
| `ECO_ALLOWED_ORIGINS` | `tauri://localhost,…` | Orígenes WS permitidos |
| `ECO_MODEL` | `claude-sonnet-4-5-20250929` | Modelo de Claude |
| `ECO_SKILL_SOURCES` | `user,project` | Skills de Claude a cargar |
| `ECO_RATE_LIMIT` | `10` | Prompts/minuto |
| `ECO_PROMPT_TIMEOUT_MS` | `600000` | Timeout absoluto de prompt |
| `ECO_PTY_AUTOCLAUDE` | `1` | Auto-launch de `claude` en cada PTY nuevo. `0` para desactivar |
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
| `ECO_INITIAL_PROMPT` | (vocabulario Eco + Aditum) | Texto que sesga la transcripción al dominio |

---

## Endpoints del backend

```
GET   /health                   ← liveness
GET   /info                     ← workspaces + modelo + voces TTS

POST  /auth/register            ← PIN + username → frase BIP39
POST  /auth/login               ← PIN → session
POST  /auth/recover             ← frase + nuevo PIN → nueva frase
POST  /auth/logout              ← destruye session
DELETE /auth/user               ← elimina usuario (PIN required)
GET   /auth/status              ← hasUser + username

GET   /info /workspaces /skills /tts/voices
POST  /workspaces /shell /tts /file/diff /voice/transcribed
GET   /file/changes             ← git status --porcelain
DELETE /workspaces /config/api-key
GET   /config/api-key

GET   /git/branches             ← list + ahead/behind por bubbleId
POST  /git/checkout             ← {branch, create?}
POST  /git/pull                 ← ff-only
POST  /git/fetch                ← --all --prune
POST  /git/rename-branch        ← git branch -m
POST  /git/commit-suggest       ← claude -p sugiere mensaje
POST  /git/commit               ← git add -A && git commit -F -

POST  /pty/kill                 ← mata PTY + worktree de la agente

POST  /dev/up                   ← skill-driven dev server up por bubbleId
POST  /dev/down                 ← detiene dev server + mata procesos hijos
POST  /dev/restart              ← reinicia (puerto distinto si era conflicto)
GET   /dev/status               ← {running, url, port, lastError?}
GET   /dev/logs                 ← stdout + stderr del último run

GET   /proxy/site?url=...       ← fetch + strip XFO/CSP + inject base + bridge

WS    /ws                       ← Claude SDK stream (Bearer via subprotocol)
WS    /ws/pty                   ← PTY interactivo (Bearer via subprotocol)
```

Todos los endpoints requieren `Authorization: Bearer <token>` y
`X-Eco-Client: 1`. Los endpoints `/auth/*` no requieren `X-Eco-Session`;
el resto sí (cuando hay usuario registrado).

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
| Tools Claude | allowlist explícita · MCP `mcp__*` permitidos (lo que el usuario configuró) |
| Bash | habilitado en el agente con `permissionMode: 'acceptEdits'` · sigue habiendo blacklist de patrones peligrosos |
| Subproceso | env allowlist (no filtra `AWS_*`, `GITHUB_TOKEN`, etc.) |
| Errores | sanitizados antes de enviar al cliente · códigos estables traducibles |
| Git ops | nombres de rama validados con regex anti-injection |

Correr suite:

```bash
npm run test:security
```

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | Vite 6, React 18, TS 5, Tailwind v4, Motion 11, Radix UI |
| Terminal | xterm.js + addon-fit + addon-web-links |
| Voz STT | openwakeword (ONNX local) + faster-whisper (CTranslate2, `medium`) |
| Voz TTS | Piper TTS (ONNX local) — voces `es_ES-davefx-medium`, `es_MX-claude-high`, etc. |
| Backend | Node 20, Express 4, ws, node-pty, Zod, @node-rs/argon2, bip39, Claude Agent SDK |
| Tema | Light / dark / system / **AMOLED** con `oklch()` + **12 acentos** + glassEffect helper |
| i18n | Diccionario custom (TS), bilingüe ES/EN, sin lib externa |

---

## Roadmap

**Hecho ✓**:

- Backend funcional con Claude Agent SDK + auto-mode (`acceptEdits`)
- Hardening de seguridad (16 tests)
- Frontend rediseñado (Liquid Glass con inset highlight, dark/light/AMOLED, 12 acentos, `glassEffect` helper)
- Multi-agente Stage Manager con persistencia local
- **Worktrees git por agente** — aislamiento automático sobre cualquier repo
- Skills/commands/agents de Claude descubiertos automático (user + project + plugins/cache)
- **Terminal real con PTY** (node-pty + xterm.js) por agente
- **PTY persistente** — sobrevive a salir de la agente, reattach con replay buffer 128KB
- **Auto-launch de `claude`** en cada PTY nuevo
- **Pestaña Agente** read-only con todos los Bash que ejecutó el agente
- **Diff side-by-side estilo GitHub** + buscador
- **Detección de cambios vía `git status`** (no solo tool calls del agente)
- **BranchPicker** completo: list/checkout/pull/fetch/rename
- **Commit con AI** con preview editable (`claude -p` → preview → confirm)
- **Stop button** para interrumpir al agente en pleno trabajo
- **Confirmación al cerrar agente** si está ocupada
- Voz "siempre escuchando" con dispatcher tolerante a sinónimos + rellenos
- **Voz → PTY**: en pestaña Shell, lo que decís se tipea al terminal
- TTS local con Piper (con rate/volume ajustable por voz)
- Wake word local con openwakeword + Whisper · pipeline de training "Hey Eco"
- Workspaces editables desde UI + brand assets
- **Auth local** con PIN + frase BIP39 mostrada PRE-autenticación
- **Foto de perfil** subible (canvas → 128px JPEG → localStorage)
- **Lock screen + delete user** desde el menú de cuenta
- API key de Anthropic almacenada local con validación
- i18n bilingüe ES/EN end-to-end (UI + errores del backend con códigos)
- **MCP del usuario** (`mcp__*` — Notion, Obsidian, Vercel, etc.) habilitados automático
- Comandos de navegación expandidos (scroll, tabs, sí/no, repetir, ajustes TTS)
- **ListeningWave** en el rail (reemplaza el beep + pulso anteriores)
- **Dock estilo macOS** opt-in en el sidebar izq con magnificación single-target + label corto + barra accent
- **Animaciones en Dashboard**: grid stagger, graph view con nodos flotando + partículas de datos
- **Kanban view** en el Dashboard (Activos / En espera / Inactivos / Con shell / Terminados / Con error)
- **Navegador global** en el nav principal con multi-tab persistido en `localStorage`
- **Browser proxy** (`/proxy/site`) con strip de XFO/CSP + click bridge para navegación encadenada
- **Detección de runtime** (`lib/platform.ts`) — listo para `<webview>` cuando se empaquete Electron/Tauri
- **Navegador por-agente** (`BrowserPanel`) con DevTools, zoom y skill picker
- **Dev server por agente** vía skill `/dev-up` con auto-puerto, symlinks de install, URL scoring
- Whisper `medium` por default + `initial_prompt` con vocabulario del producto

**Pendiente**:

- Empaquetar como `.app` de macOS con Tauri (sidecars: Node + Piper + Python + claude CLI)
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
Terminal interactivo vía [node-pty](https://github.com/microsoft/node-pty) +
[xterm.js](https://xtermjs.org/).
