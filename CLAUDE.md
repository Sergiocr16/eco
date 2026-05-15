# CLAUDE.md — Eco

Guía operativa para que cualquier agente que abra el repo pueda tomar el proyecto, entender el contexto y empujar cambios sin romper invariantes ni redescubrir gotchas. Es la fuente de verdad operativa; si entra en conflicto con `README.md`, gana este archivo.

## Tabla de contenidos

1. [Lo primero que tenés que saber](#lo-primero)
2. [Reglas no negociables](#reglas)
3. [Puertos, scripts y entorno](#entorno)
4. [Mapa de archivos por feature](#mapa)
5. [Capas y storage](#capas)
6. [Voice pipeline (los 2 modos)](#voz)
7. [ServerPanel (dev server por agente)](#serverpanel)
8. [BrowserPanel (webview por agente)](#browserpanel)
9. [Comandos de voz/texto](#comandos)
10. [Auth, workspaces, worktrees](#auth-workspaces)
11. [Protocolo WebSocket](#ws)
12. [Convenciones de código](#convenciones)
13. [Errores comunes y root causes](#errores)
14. [Build, empaquetado, reinstall](#build)
15. [Decisiones que parecen raras (por qué son así)](#decisiones)
16. [Cosas removidas que NO hay que restaurar](#removido)
17. [Caps de memoria que NO hay que aflojar](#memcaps)
18. [Pre-flight antes de cualquier PR](#preflight)

---

<a id="lo-primero"></a>
## 1. Lo primero que tenés que saber

- **Eco es una app local-first para macOS Apple Silicon** que orquesta conversaciones con Claude. Cada conversación ("agente"/"burbuja") tiene su propio worktree git, PTY, archivos, dev server, plan, navegador. 100% local salvo la API de Anthropic.
- **Empaquetado vía Electron 33 + electron-builder 25**. Distribución: `.dmg` mac **arm64 únicamente** (~112 MB). Windows/Linux targets fueron removidos del `electron/package.json`; si hace falta restaurarlos, ver sección [Build](#build).
- **El user es Sergio Castro** (Florida, USA). Aplican las reglas de la sección 2 y las reglas globales de `~/.claude/CLAUDE.md` (vault Obsidian, sin commits automáticos, español por defecto).
- **El estado de la app es ahora 100% standalone**: voz on-device con Swift+Apple Speech (no requiere Python), dev servers persisten al reload, todo bundleado.
- **Logs de dev server fluyen por WS push** (`dev_log` batcheado cada 80 ms), no por polling. Ver sección [Protocolo WebSocket](#ws).

Leé en este orden para arrancar a trabajar:
1. Este archivo
2. `README.md` (overview conceptual)
3. `backend/src/index.ts` (todos los endpoints)
4. `frontend/src/App.tsx` (dispatcher de comandos + setup del shell)
5. `electron/main.cjs` (lifecycle del .dmg)

---

<a id="reglas"></a>
## 2. Reglas no negociables

### NEVER

- **No commitear ni pushear automáticamente.** Editás archivos, dejás los cambios en el working tree, Sergio decide cuándo. Si te insiste, confirmá explícitamente antes.
- **No usar emojis en código o UI** salvo que Sergio lo pida.
- **No agregar features especulativas.** Si Sergio pidió X, hacé X y no Y "para más adelante".
- **No reintroducir nada de la lista de [Removido](#removido)** (navegador global, `/proxy/site`, skill `/dev-up`, etc.). Si lo ves en el código, es residuo a limpiar.
- **No skippear hooks de git** (`--no-verify`, `--no-gpg-sign`) salvo pedido explícito.
- **No "downgradear" modelos de Claude para ahorrar costo.** Sergio elige el modelo.

### ALWAYS

- **`npm run typecheck` debe pasar.** Antes de cualquier rebuild o commit. Si tocás backend y frontend, ambos.
- **Comunicación en español.** UI, comments útiles, mensajes en chat.
- **Idioma de los logs/errores del usuario en español.** Backend traduce con códigos estables (`AppError` con `code` + `message`).
- **Persistir state importante a disco** (`~/.eco/*.json` chmod 600) si tiene que sobrevivir reload del backend.
- **Validar input en el boundary.** Zod schemas para POST, regex/whitelist para arg que va a `spawn` o path joins.
- **Bind 127.0.0.1.** Nunca 0.0.0.0 ni hostnames externos.

---

<a id="entorno"></a>
## 3. Puertos, scripts y entorno

### Puertos por modo

| Modo | Backend | Vite | Origen del renderer |
|---|---|---|---|
| `npm run web` | `127.0.0.1:7050` | `127.0.0.1:5173` | `localhost:5173` (browser real) |
| `npm run dev:app` | `127.0.0.1:7050` | `127.0.0.1:5173` | Electron loadURL → Vite |
| `.dmg` empaquetado | `127.0.0.1:7100` | servido por backend | mismo origen del backend |

**Por qué 7050 en dev**: macOS Control Center ocupa `:7000` (AirPlay Receiver). Para volver a 7000, *Ajustes → General → AirDrop y Handoff → Receptor de AirPlay = off*.

**Por qué 7100 en .app**: para coexistir con `npm run dev` corriendo en paralelo sin chocar.

Override: `ECO_PORT=<n>` para backend/electron, `ECO_BACKEND_PORT=<n>` para el proxy de Vite (`vite.config.ts`).

### Scripts (root `package.json`)

| Script | Qué hace |
|---|---|
| `npm run web` | backend + Vite. Abrís `http://localhost:5173` en un browser real |
| `npm run dev:app` | backend + Vite + ventana Electron con hot-reload + DevTools |
| `npm run dmg` | empaqueta `.dmg` para Mac (alias `dist:mac`) |
| `npm run dev` | alias de `web` |
| `npm run dev:backend` | solo backend (`:7050`) |
| `npm run dev:frontend` | solo Vite (`:5173`) |
| `npm run dev:electron` | solo Electron (espera Vite up) |
| `npm run typecheck` | TS de ambos workspaces |
| `npm run test:security` | suite de tests de seguridad del backend |
| `npm run listener` | Python sidecar (wake word + Whisper, **opcional**, no requerido en .dmg) |

Todos los scripts dev ya tienen `ECO_PORT=7050` / `ECO_BACKEND_PORT=7050` hardcoded — no exportes env manualmente.

### `frontend/.env.local`

```
VITE_ECO_BACKEND=
VITE_ECO_TOKEN=<opcional, copia de ~/.eco/token>
```

`VITE_ECO_BACKEND` debe estar **vacío** para que las llamadas pasen por el proxy de Vite. URL absoluta hace cross-origin → frágil con CORS. En Electron este env se ignora (`window.electronAPI.getConfig()` devuelve la URL correcta via IPC).

### Versiones requeridas

- **Node 20** (`nvm use 20.20.2`). Vite 6 no soporta 16.
- **Python 3.10+** (solo si usás el listener Python, opcional).
- **`claude` CLI** de `@anthropic-ai/claude-code` autenticado.
- **Swift 5+** (incluido en Xcode CLT) si vas a recompilar el CLI nativo.
- **git** (worktrees, branches).

---

<a id="mapa"></a>
## 4. Mapa de archivos por feature

Si vas a tocar X, los archivos clave son:

### Voz STT (.dmg)
- `electron/native/eco-stt.swift` — CLI Swift que usa `SFSpeechRecognizer`
- `electron/native/build.sh` — compila a binario universal arm64+x64
- `electron/build/bin/eco-stt` — output del build (bundleado al .app)
- `electron/main.cjs:setPermissionRequestHandler` — concede mic/audioCapture en Electron
- `electron/package.json:mac.extendInfo` — `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`
- `frontend/src/hooks/useVoice.ts` — pipeline dual (Web Speech para navegador, PCM+WAV+POST para .dmg)
- `backend/src/index.ts` `/voice/transcribe-blob` — endpoint que spawnea eco-stt

### Voz STT (dev navegador opcional)
- `listener/main.py` — pipeline wake → Whisper
- `listener/training/` — training del wake word custom "Hey Eco"
- `backend/src/index.ts` `/voice/transcribed` — recibe transcripciones del listener

### Voz TTS
- `backend/src/tts.ts` — Piper (ONNX local)
- `backend/src/tts-macsay.ts` — macOS `say` con voces Premium/Enhanced
- `frontend/src/hooks/useTTS.ts` — unifica ambos backends + browser fallback
- `frontend/src/screens/Settings.tsx:SectionVoice` — UI selector de voz

### Dev server por agente
- `backend/src/dev-server.ts` — manager de sessions, spawn, kill, persistencia, batching de logs (`scheduleLogFlush`), `forgetSession(bubbleId)`
- `frontend/src/components/ServerPanel.tsx` — UI (single/dual, preset workspace, logs xterm.js, listener WS `eco:dev_log`)
- `frontend/src/hooks/useDevPresets.ts` — presets globales
- `frontend/src/hooks/useWorkspaceServerDefaults.ts` — presets por workspace
- `backend/src/index.ts` `/dev/start|stop|restart|status|logs|active` — endpoints, + `/bubble/close` y `/pty/kill` (cleanup completo)

### Cleanup atómico de burbuja
- `backend/src/index.ts:closeBubbleResources(bubbleId)` — helper que mata PTY + dev servers de 3 roles + `forgetSession` + `removeWorktree`
- `backend/src/index.ts` endpoints `POST /bubble/close` (semántico) y `POST /pty/kill` (alias, same handler)
- `backend/src/dev-server.ts:forgetSession(bubbleId)` — borra entries del Map `sessions` y `logBuffers`, persiste a disco
- `frontend/src/hooks/useBubbles.ts:removeBubble` — dispara `/bubble/close` y limpia keys `eco.*.${bubbleId}` de localStorage

### Navegador por agente
- `frontend/src/components/BrowserPanel.tsx` — UI + DevTools panel + zoom persistido
- `frontend/src/components/SmartBrowserView.tsx` — wrapper `<webview>` (Electron) / `<iframe>` (web)

### Auth
- `backend/src/user-store.ts` — argon2id + BIP39 + `~/.eco/user.json`
- `backend/src/auth.ts` — Bearer token + sessions in-memory
- `backend/src/sessions.ts` — Session TTL 1h, header `X-Eco-Session`
- `frontend/src/hooks/useAuth.ts` — register/login/recover/lock/destroy
- `frontend/src/screens/AuthScreen.tsx` — UI + view switcher (register/login/show_recovery/recover)
- `frontend/src/components/AccountMenu.tsx` — avatar + lock + destroy

### Workspaces + worktrees
- `backend/src/worktree-manager.ts` — crear/borrar/prune
- `backend/src/git-ops.ts` — branches, checkout, pull, commit con AI, **review estilo Cursor** (`acceptFile`, `acceptHunk`, `revertHunk`, `discardFile`, `readFileContents`)
- `backend/src/file-diff.ts` — `/file/diff` con param `vsIndex` (working tree vs index | HEAD)
- `frontend/src/components/BranchPicker.tsx` — UI con dirty-changes dialog
- `frontend/src/components/CommitWithAI.tsx` — `claude -p` sugiere → preview → commit (limpia `review.clearAll()` al success)

### Review de cambios estilo Cursor (post-edit)
- `frontend/src/hooks/useReviewState.ts` — Map<bubbleId, { [path]: acceptedAt: timestamp }> persistido en localStorage. Migración automática del formato boolean viejo.
- `frontend/src/components/DiffViewer.tsx` — exporta `DiffPane` (inline, sin overlay) + `DiffViewer` (modal wrapper que reusa DiffPane). El DiffPane tiene toolbar review + toggle "Nuevos / Todos" (`vsIndex` true/false) + botones por hunk.
- `frontend/src/screens/AgentDetail.tsx:FilesPanel` — lista de archivos con dots ámbar/verde basados en `git status --porcelain` (campo `unstaged`), banner de pendientes con "Aceptar todos", diff inline desplegable por archivo (sin modal).
- `frontend/src/hooks/useGitChanges.ts` — cache global por (workspace, bubbleId) que sobrevive al unmount; arranca con snapshot + revalida en background. Polling 4s + escucha `eco:git_refresh`.
- Setting: `eco.agent.review_mode` (default OFF, opt-in en Settings → General).
- Endpoints: `POST /file/accept | accept-hunk | revert-hunk | discard | contents`. Ver sección [Endpoints](#ws) abajo.

### Claude SDK
- `backend/src/agent.ts` — wrapper del Claude Agent SDK
- `backend/src/agent-tools.ts` — MCP tools propias (open_bubble, rename_bubble, close_bubble)
- `backend/src/ws-server.ts` — `/ws` con snapshot providers
- `frontend/src/hooks/useEcoSocket.ts` — WS client con reconnect backoff

### PTY (terminal real)
- `backend/src/pty-server.ts` — `/ws/pty`, sessions persistentes con replay 128KB
- `frontend/src/components/RealTerminal.tsx` — xterm.js conectado

### Comandos meta ("Eco …")
- `frontend/src/lib/meta-commands.ts` — parser tolerante con LEADING_FILLERS y aliases
- `frontend/src/App.tsx:handleMetaAction` — despacha cada `MetaAction`

### Obsidian
- `backend/src/obsidian.ts` — save-session, detectar vaults instalados
- `backend/src/index.ts` `/integrations/obsidian/save-session`

### Dashboard
- `frontend/src/screens/Dashboard.tsx` — grid + kanban + graph views, satélites con pulso

---

<a id="capas"></a>
## 5. Capas y storage

### Procesos en el .app empaquetado

```
Eco.app (electron main, main.cjs)
 ├─ Eco Helper (GPU)
 ├─ Eco Helper (Renderer)        ← carga frontend/dist via http://127.0.0.1:7100/
 └─ /Applications/Eco.app/Contents/MacOS/Eco backend/dist/index.js   ← backend Node
     ├─ spawn claude  (uno por agente cuando hay prompt)
     ├─ spawn zsh PTY (uno por agente)
     └─ spawn dev-server bash (uno o dos por agente, dual mode)
```

`main.cjs` spawnea el backend con `ELECTRON_RUN_AS_NODE=1` para reusar el binario Electron como Node puro. Backend en `Resources/backend/dist/`. Frontend bundle estático en `Resources/frontend/dist/`. CLI Swift en `Resources/bin/eco-stt`.

### Estado en disco (chmod 600)

| Path | Contenido |
|---|---|
| `~/.eco/token` | Bearer token 32B |
| `~/.eco/user.json` | `{username, pinHash, recoveryHash, photo?}` argon2id |
| `~/.eco/api-key` | Anthropic API key opcional |
| `~/.eco/dev-sessions.json` | `[{bubbleId, role, pgid, port, command, ...}]` |
| `~/.eco/obsidian.json` | `{vaultPath, enabled}` |
| `~/.eco/worktrees/<bubbleId>` | Worktree git por agente |

### localStorage del frontend

Todas las claves usan prefijo `eco.`. Si agregás nuevas, mantenelo y agregá a este listado:

```
eco.session                              ← session token (X-Eco-Session header)
eco.voice.autostart                      ← '0' para deshabilitar auto-listen
eco.tts.enabled / voice / rate / volume
eco.detail.tab.<bubbleId>                ← última tab activa
eco.terminals.<bubbleId>                 ← terminales extra (sin Claude) [{id,label}]
eco.terminals.active.<bubbleId>          ← id del terminal activo en la pestaña Shell
eco.browser.url.<bubbleId>               ← URL del BrowserPanel
eco.browser.zoom.<bubbleId>              ← zoom (0.25..3)
eco.dev.dual.<bubbleId>                  ← '1' si está en dual mode
eco.dev.dual.<bubbleId>.touched          ← '1' una vez que el user tocó el toggle (controla fallback al preset workspace)
eco.dev.cmd.<bubbleId>.<role>            ← comando del slot (role: main|frontend|backend)
eco.dev.workspace_defaults.<wsPath>      ← preset por workspace {dual, main, frontend, backend}
eco.dev.config_collapsed.<bubbleId>      ← '1' colapsado (default true)
eco.dev.min.<role>.<bubbleId>            ← '1' minimizado en dual
eco.dev.logheight.<bubbleId>.<role>      ← alto en px del pane de logs (redimensionable)
eco.dev.restartmode.<bubbleId>           ← 'both'|'frontend'|'backend': qué reinicia el botón global en dual
eco.dev.presets                          ← presets globales user
eco.dev.presets.hidden                   ← built-ins ocultados
eco.remote.<bubbleId>                    ← slug si remote control activo
eco.skills.favorites                     ← favoritos del SkillsCard
eco.skills.fav_collapsed                 ← '1' si la lista de favoritos del SkillsCard está colapsada
eco.bubbles                              ← state global de burbujas (id, title, workspace, messages, …)
eco.categories                           ← categorías configurables (id, name, color)
eco.graph.spread_nodes                   ← separación agentes↔carpeta en la vista de nodos
eco.graph.spread_ws                      ← separación carpetas↔Eco en la vista de nodos
eco.graph.scale                          ← zoom visual de la vista de nodos
eco.graph.ws_offsets                     ← offsets manuales {dx,dy} por nodo de workspace arrastrado
eco.graph.agent_offsets                  ← offsets manuales {dx,dy} por nodo de agente arrastrado
eco.graph.fullscreen                     ← '1' si la vista de nodos quedó en pantalla completa
```

### Auto-allowlist de orígenes (backend)

El backend agrega su propio `http://127.0.0.1:<port>` y `http://localhost:<port>` a `allowedOrigins` automáticamente — el renderer del .app empaquetado carga desde el mismo origen del backend, así CORS no se activa.

---

<a id="voz"></a>
## 6. Voice pipeline (los 2 modos)

### Modo navegador (`npm run web` en Chrome/Safari)

- `window.SpeechRecognition` (Web Speech API) — Chrome provee la API key de Google.
- `useVoice` arranca un `SpeechRecognition` con `continuous=true, interimResults=true`.
- Wake word: detectado en el interim text con regex en `stripWakePrefix` (`meta-commands.ts`). El prefijo de invocación es **obligatorio** — `Eco` solo no despierta porque aparece naturalmente en español ("el eco del valle"). Aceptados: `hey|oye|oi|hola|ok|okey|okay|che|epa` + `eco|ekko|jarvis|héctor`.

### Modo .dmg empaquetado

Web Speech NO funciona (Chromium-Electron no tiene API key de Google → loop start/end). Está deshabilitado explícitamente en `useVoice.ts` con `isElectron` check.

**Pipeline propio en `.dmg`** (en orden):

1. `getUserMedia({ audio: true })` — macOS pide **Mic** y **Speech Recognition** la primera vez (2 prompts).
2. `AudioContext` + `MediaStreamAudioSourceNode` + `ScriptProcessor` (bufSize 4096) → captura PCM Float32 al sample rate nativo.
3. Resampleo nativeRate → 16kHz mono. Si `nativeRate ≥ 32k`, anti-alias 3-tap (media móvil con vecinos) antes de decimar.
4. **VAD adaptativo** por frames de 50ms (800 samples). Estado `idle | recording`:
   - `idle`: RMS del frame entra a EMA suave (`noiseFloor = 0.95·prev + 0.05·rms`). Pre-roll buffer de 300ms (últimos samples). Trigger cuando `rms > max(0.01, noiseFloor·3)` → cambia a `recording` y prepende el pre-roll.
   - `recording`: acumula. Cuenta frames de silencio consecutivos. Cierra la frase a los **700ms continuos de silencio** o al tope de **8s**. Descarta frases <400ms.
5. Al cerrar la frase: trim de los últimos 700ms (silencio), `encodeWav()` → WAV PCM16 mono 16kHz, POST al backend.
6. `apiFetch('/voice/transcribe-blob', { body: blob, headers: 'Content-Type': 'audio/wav' })`.
7. Backend escribe `/tmp/eco-stt-<uniq>.wav`, spawnea `eco-stt /tmp/... es-MX`.
8. Swift CLI:
   - `SFSpeechURLRecognitionRequest`
   - `requiresOnDeviceRecognition = true` (sin internet)
   - `recognitionTask(with: request) { result, error in ... }` con callback que para el `CFRunLoop`.
9. Stdout → backend → response `{ok: true, text}` → renderer → `onPhraseRef.current(text)`.

Latencia efectiva: ~700ms después de que terminás de hablar (vs los 4s fijos del esquema anterior). El pre-roll evita perder el ataque del wake ("Hey") y el noise floor adaptativo soporta ambientes ruidosos (AC, ventilador) sin calibración manual.

### Gotchas que te van a morder

- **`MediaRecorder` NO sirve para esto.** Chromium 130 sólo emite webm/opus (y a veces audio/mp4 inestable). `AVFoundation` de macOS no decodifica webm/opus. **Por eso usamos PCM crudo + WAV manual.** Si ves alguien intentar volver a MediaRecorder, decile que no.
- **CFRunLoop es obligatorio en el CLI Swift.** `SFSpeechRecognizer.recognitionTask` entrega callbacks que requieren un run loop activo. `DispatchSemaphore.wait()` bloquea el run loop → callbacks nunca llegan → timeout silencioso. El patrón correcto:
  ```swift
  while !done && Date() < deadline {
    CFRunLoopRunInMode(.defaultMode, 0.5, true)
  }
  ```
- **`__dirname` no existe en ESM.** El backend es ESM (`"type": "module"` indirecto + `import.meta.url`). Para path del módulo:
  ```ts
  const moduleDir = path.dirname(new URL(import.meta.url).pathname);
  ```
- **`setPermissionRequestHandler` en main.cjs es lo que destraba el prompt nativo.** Sin esto Chromium auto-rechaza `getUserMedia`. Concedemos `media`, `audioCapture`, `videoCapture`, `microphone`, `clipboard-read`, `clipboard-sanitized-write`.
- **`NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription`** van en `mac.extendInfo` del `electron/package.json`. Sin ellas, macOS termina el proceso al pedir permiso.
- **Apple Speech sigue funcionando aunque el .app no esté signed.** `hardenedRuntime: false` + `identity: null` está OK para uso personal de Sergio. Para distribuir a otros, code-sign + notarization.

### Reset de permisos para debugging

```bash
tccutil reset Microphone com.aditum.eco
tccutil reset SpeechRecognition com.aditum.eco
```

Después relanzá Eco.app — la próxima `getUserMedia` muestra el prompt fresh.

### Recompilar el CLI Swift

```bash
./electron/native/build.sh
```

Output: `electron/build/bin/eco-stt` (universal arm64+x64, ~150KB). El `dmg` lo bundlea desde ahí vía `extraResources` en `electron/package.json`. Corré esto siempre que modifiques `eco-stt.swift`, ANTES de `npm run dmg`.

---

<a id="serverpanel"></a>
## 7. ServerPanel (dev server por agente)

Pestaña **Server** en cada conversación. Maneja procesos como gulp/vite/spring-boot/etc. dentro del worktree del agente.

### Single vs dual

- **Single** (default): un slot llamado `main`. Para proyectos con un solo proceso de dev.
- **Dual** (`eco.dev.dual.<bubbleId>=1`): slots `frontend` y `backend`, paralelos. Para full-stack (Vite+Express, gulp+Spring, etc.).

### Auto-port (el feature crítico)

Cada slot recibe un puerto libre random via `net.createServer().listen(0)` al arrancar (`startDevServer`). Inyectado como env vars cubriendo casi todos los frameworks comunes:

**Backend slot recibe** (en `spawnSession`):
```
PORT, SERVER_PORT, HTTP_PORT
JAVA_TOOL_OPTIONS=-Dserver.port=<port>
VITE_PORT, NEXT_PUBLIC_PORT
BROWSER_SYNC_PORT, GULP_PORT, WEBPACK_DEV_SERVER_PORT
```

**Frontend slot (en dual)** recibe todo lo anterior para su propio puerto **+** la URL del backend:
```
API_PORT, BACKEND_PORT, BACKEND_URL
VITE_API_PORT, NEXT_PUBLIC_API_PORT
```

**Regla para el user**: los comandos NO deben hardcodear puertos.

```bash
# ✅ Eco asigna server.port via JAVA_TOOL_OPTIONS o SERVER_PORT
./mvnw spring-boot:run
gulp serve

# ❌ Hardcodea, Eco no puede sobreescribir
./mvnw spring-boot:run -Dserver.port=8081
API_PORT=8080 gulp serve
```

### Orden de arranque en dual

`runAllAction('up')` en `ServerPanel.tsx`:
1. Lanza el backend slot.
2. `waitForRoleRunning('backend', 90_000)` — espera evento `dev_status: running` para ese rol.
3. Recién entonces lanza el frontend slot.

Evita ECONNREFUSED del proxy frontend mientras el backend tarda en bindear. `down` y `restart` corren en paralelo (no hay dependencia para apagar).

### Preset por workspace

`useWorkspaceServerDefaults(workspace)` lee/escribe `eco.dev.workspace_defaults.<workspacePath> = {dual, main, frontend, backend}`. Botón "Guardar como default del proyecto" en la sección Configuración. Conversaciones nuevas en ese workspace heredan los comandos automáticamente.

### Persistencia + re-adopt

Cada cambio de status escribe `~/.eco/dev-sessions.json` (vía `persistSessions()` dentro de `broadcastStatus`). Al boot del backend, `restoreSessions()`:
1. Lee el JSON.
2. Para cada session probe `process.kill(pgid, 0)` (señal 0 = no manda nada, solo testea).
3. Si vive → re-adopta con status `running`, mensaje `[server re-adoptado de sesión previa — logs viejos no disponibles]`.
4. Si muerto → descarta.

**Limitación conocida y aceptada**: el log buffer viejo se pierde. No podemos re-attachar stdout de un proceso detached ya corriendo. El user puede stop/restart sin problema.

### Endpoints

```
POST  /dev/start    {workspace, bubbleId, command, role}
POST  /dev/stop     {bubbleId, role}
POST  /dev/restart  {bubbleId, role}
GET   /dev/status?bubbleId=<id>&role=<role>
GET   /dev/logs?bubbleId=<id>&role=<role>     (ring buffer 64KB)
GET   /dev/active                              (TODAS las sessions vivas)
```

`/dev/active` lo usa `Dashboard.tsx` al montar para sembrar el indicador "server activo" en cada nodo. Sin esto, eventos `dev_status` que llegaron antes del mount se pierden.

### Detección de "ready"

`READY_RE` en `dev-server.ts:244` matchea patrones de log que indican que el server bindeó:
- `Local: https?://...`
- `listening on`
- `ready in N`
- `Started Server on port`
- `[Browsersync] Access URLs|Running|Serving files|...`
- `Finished 'serve'|'default'|'watch'` (gulp)
- ...etc

Si un framework nuevo no matchea, agregalo al regex.

### Conflicto de puerto + auto-reparación

Si el output contiene `EADDRINUSE`/`address already in use`/etc. (`PORT_CONFLICT_RE`), el backend reintenta hasta 2 veces (`MAX_RETRIES`) pidiéndole a Claude (`repairPortHardcode`) que parche la config para usar `process.env.PORT`.

---

<a id="browserpanel"></a>
## 8. BrowserPanel (webview por agente)

Pestaña **Browser** en cada conversación. **Hay solo uno por agente** — eliminamos el navegador global.

### Webview persistente

`SmartBrowserView` crea el `<webview>` **UNA SOLA VEZ** al montar (`useEffect` deps `[useWebview]` SIN src). Cuando cambia src, navega vía `setAttribute('src', newUrl)` en el webview existente. Sin destruir y recrear → sin reload visible → sin parpadeo.

### Trampa que ya pisamos

Si pasás callbacks inline como props (`onLoadFail={() => setLoadFailed(true)}`), React los re-crea en cada render → si los ponés en deps del useEffect del webview → ciclo infinito de unmount/mount → reload constante.

**Solución implementada**: guardarlos en `cbRef` que se actualiza en su propio useEffect, y NO incluirlos en las deps del useEffect que crea el webview.

```tsx
const cbRef = useRef({ onTitleChange, onNavigate, onLoadFail, onLoadSuccess });
useEffect(() => {
  cbRef.current = { onTitleChange, onNavigate, onLoadFail, onLoadSuccess };
}, [onTitleChange, onNavigate, onLoadFail, onLoadSuccess]);

useEffect(() => {
  // ... crear webview, usar cbRef.current.onTitleChange?.(...)
}, [useWebview]);   // ← NO incluir callbacks acá
```

### Auto-navegación cuando arranca un dev server

`BrowserPanel.tsx` escucha `eco:dev_status`. Cuando `status==='running' && url && lastAutoNavRef.current !== url`, navega al url. `lastAutoNavRef` resetea solo cuando llega `stopped` o `error` — sin esto repushes con misma URL recargarían el webview.

**ServerPanel NO emite `eco:browser_navigate` automáticamente** desde su listener de dev_status — eso causaba reload loops (cada push de WS reseteaba el webview). Sí lo emite cuando el user clickea explícitamente el pill de URL o el botón "🌐 abrir en Eco".

### Zoom persistido

`eco.browser.zoom.<bubbleId>` (0.25..3). La escritura es **inline** en `setZoom` (wrap de `setZoomState`), NO via useEffect — evita timing raro con HMR/unmount.

---

<a id="comandos"></a>
## 9. Comandos de voz/texto

Parser: `frontend/src/lib/meta-commands.ts`. Tolera relleno discursivo (`me`, `por favor`, `necesito`, `che`, …), sinónimos, conjugaciones, orden libre.

### Navegación

| Comando | Acción |
|---|---|
| `Eco dashboard` / `Eco inicio` / `Eco atrás` | Volver al inicio |
| `Eco ajustes` / `Eco archivos` / `Eco historial` | Cambiar de sección |
| `Eco estado` | Overlay con todas las agentes |
| `Eco ayuda` | Lista de comandos |

### Agentes

`Eco abrir <nombre>`, `Eco renombrar <nombre>`, `Eco cerrar`, `Eco ir <nombre>`, `Eco siguiente/anterior`, `Eco pausar/continuar`.

### Dentro de una conversación

| Comando | Acción |
|---|---|
| `Eco chat/terminal/archivos/plan/navegador` | Cambia tab |
| `Eco scroll abajo/arriba/al final` | Scroll del panel activo |
| `Eco repetir` | Re-lee el último mensaje (TTS) |
| `Eco sí/no/acepta/cancela` | Diálogos de confirmación |
| `Eco iniciar/detener/reiniciar servidor` | Server actions (respeta dual mode) |
| `Eco activar/desactivar remote control` | Claude remote control |
| `Eco guardar en obsidian` | Guarda la conversación como nota .md |

Implementación: `App.tsx:handleMetaAction` despacha cada `MetaAction`. Agregar comando nuevo = nuevo `MetaAction` kind + alias en `ALIASES` + case en `handleMetaAction` + i18n keys en `cmd.*`.

---

<a id="auth-workspaces"></a>
## 10. Auth, workspaces, worktrees

### Auth

- PIN 4-8 dígitos + frase BIP39 12 palabras → argon2id en `~/.eco/user.json`.
- Session token 32B in-memory, TTL 1h, header `X-Eco-Session`.
- Bearer token 32B persistente en `~/.eco/token`, validado con `timingSafeEqual` en cada request.
- `RegisterView` muestra la frase ANTES de transicionar a `authenticated` — el user tiene que confirmar.
- Lock screen + delete-user desde el `AccountMenu`.

### Workspaces

Configurados en `ECO_WORKSPACES` env o desde Ajustes → Carpetas. **El workspace debe ser un repo git** para que se cree worktree. Si apuntás a una carpeta padre (ej. `~/Documents/GitHub` que contiene muchos repos), Eco no podrá crear worktree y los comandos del agente fallarán.

### Worktrees

Cada agente con workspace git crea automáticamente:
```
~/.eco/worktrees/<bubbleId>  ← worktree sobre rama eco/<short>
```

El agente Claude, el PTY, el polling de `git status`, y `git diff` operan dentro del worktree. Dos agentes sobre el mismo repo trabajan aisladas.

Al cerrar la agente: PTY muere, worktree se borra (`git worktree remove --force`), **la rama `eco/<short>` queda viva** en el repo padre para mergear/revisar.

Listar ramas huérfanas: `git -C <repo> branch | grep eco/`

---

<a id="ws"></a>
## 11. Protocolo WebSocket

### `/ws` (Claude SDK + dev status)

Auth via subprotocol: `eco.token.<bearer>`.

**Cliente → servidor** (`ClientMessageSchema` en `backend/src/protocol.ts`):
- `{type: 'prompt', bubbleId, workspace, text, resumeSessionId?}` — manda prompt al agente
- `{type: 'interrupt'}` — corta el stream + cancela tool en curso

**Servidor → cliente**:
- `{type: 'sdk_message', message}` — pasa-a-través del Claude Agent SDK
- `{type: 'session_started', sessionId}` — primera respuesta del SDK
- `{type: 'done'}` — agente terminó este turn
- `{type: 'error', code, message}` — error tipado
- `{type: 'voice_transcribed', text, ts}` — broadcast cuando el listener postea
- `{type: 'pty_status', bubbleId, running}` — PTY abierto/cerrado
- `{type: 'dev_status', bubbleId, role, status, port, url, command, exitCode, skill?}` — dev server cambió estado
- `{type: 'client_action', action}` — la MCP tool `open_bubble`/`rename_bubble`/`close_bubble` pide al cliente que actúe

### `/ws/pty` (terminal interactivo)

Auth idem. Subprotocol con `bubbleId` y `workspace` como query.

**Cliente → servidor**:
- `{type: 'data', data: '...'}` — input al PTY
- `{type: 'resize', cols, rows}` — geometría

**Servidor → cliente**:
- `{type: 'data', data: '...'}` — output del PTY
- `{type: 'snapshot', data: '...'}` — replay 128KB del ring buffer al reconectar
- `{type: 'closed', exitCode}` — proceso terminó

### Snapshot providers

`ws-server.ts:registerSnapshotProvider(fn)` — cualquier módulo puede registrar un provider que se ejecuta al conectar un nuevo WS y replica eventos para que el cliente nuevo arranque sincronizado. `dev-server.ts` lo usa para replicar dev_status de cada session viva.

---

<a id="convenciones"></a>
## 12. Convenciones de código

### TypeScript

- **Strict mode siempre.** `tsc --noEmit` debe pasar antes de cualquier build/PR.
- **Sin `any`** salvo `as unknown as ...` para narrowing intencional en boundaries.
- **Tipos por kind** (discriminated unions) preferidos sobre `enum`.
- **Zod en boundaries** (POST body, query params).

### Módulos

- **Backend ESM**: `import.meta.url` en lugar de `__dirname`, extensiones `.js` en imports relativos.
- **Frontend Vite ESM**: alias `@/...` para `src/`.
- **Electron CJS**: `main.cjs` y `preload.cjs` son CommonJS (Electron lo requiere para el main process).

### Errores

- `AppError` o `errResponse(res, status, code, message)` con `code` estable.
- Frontend traduce con `translateBackendError` en `backend-errors.ts`.
- Nunca leakar stacktraces al cliente.

### React

- Hooks `useXxx` con prefijo consistente. Uno por feature.
- Callbacks inline en JSX van a `useCallback` solo si se pasan a hijos que los tienen en deps.
- Para callbacks que NO deben disparar re-mount de efectos, ponerlos en refs (`onPhraseRef`, `cbRef`).
- Comunicación cross-componente: **eco-bus** (`lib/eco-bus.ts` con `on`/`emit`) en vez de prop-drilling. Los listeners SIEMPRE deben tener guard contra duplicados (último-url ref) si su acción tiene side effects que disparan más events.

### Comentarios

- **No comentar el WHAT**. Los identificadores ya lo dicen.
- **Comentar el WHY no-obvio**: workarounds, gotchas, decisiones que sorprenderían al lector.
- **No referenciar tareas/PRs/usuarios** en comentarios — eso vive en commits/PRs.
- **No docstrings multi-párrafo**. Máximo 1-2 líneas.
- **Mantené comentarios al día** o borralos.

### Seguridad

- `realpathSync` + workspace whitelist + path traversal check en cada endpoint que toca filesystem.
- Bash blacklist + env allowlist en `security.ts`.
- Tools de Claude por allowlist explícita; MCP `mcp__*` se permite todo lo configurado por el user.
- Header `X-Eco-Client: 1` requerido. Anti CSRF mínimo.
- Origin whitelist con auto-inclusión del propio backend.
- Rate limit por endpoint donde aplica (`ECO_RATE_LIMIT`).

---

<a id="errores"></a>
## 13. Errores comunes y root causes

| Síntoma | Root cause | Fix |
|---|---|---|
| `failed to fetch` en login (browser) | `.env.local` con URL absoluta vieja o puerto incorrecto | `VITE_ECO_BACKEND=` vacío, reiniciar Vite |
| `ECONNREFUSED 127.0.0.1:7050` en proxy logs de Vite | Backend caído | Relanzar `ECO_PORT=7050 npm --workspace backend run dev` |
| `Port 7000 in use` (dev) | AirPlay Receiver (ControlCenter) | Apagar en Ajustes, o usar :7050 (es el default ahora) |
| .app arranca pero no conecta al backend | Otro Eco backend dev escuchando 7100 | `pkill -9 -f Eco`, lsof check, relanzar |
| Mic no se activa en .dmg | (a) Permisos macOS no concedidos / (b) `setPermissionRequestHandler` falta / (c) `NSMicrophoneUsageDescription` falta | Verificar los 3. `tccutil reset Microphone com.aditum.eco` para forzar prompt nuevo |
| Listening animation aparece pero no transcribe | (a) Backend crash en endpoint (revisar log), (b) AVFoundation no decodifica el formato del audio | Verificar `[voice/transcribe-blob]` en log. Si CT es webm → cambiar a WAV PCM |
| `__dirname is not defined` en backend | Backend es ESM | `path.dirname(new URL(import.meta.url).pathname)` |
| `Transcription timeout` en eco-stt | El CLI no tiene CFRunLoop activo | `CFRunLoopRunInMode(.defaultMode, 0.5, true)` en loop |
| BrowserPanel se recarga cada N segundos | `<webview>` se recrea por re-render del padre con callbacks inline en deps | Mover callbacks a `cbRef`, sacar de deps |
| ServerPanel: status `iniciando` forever | `READY_RE` no matchea output del framework | Agregar pattern al regex en `dev-server.ts:244` |
| Dev servers se pierden al cerrar/recompilar | Falta persistencia | Ya implementado vía `~/.eco/dev-sessions.json` + re-adopt por pgid |
| Dashboard no muestra servers activos | Snapshot llega antes que Dashboard suscriba | Seed inicial con `GET /dev/active` (ya implementado) |
| `Cannot find module 'browser-sync-client/...'` | node_modules del proyecto user roto (NO Eco) | `cd <proyecto>; npm install` |
| BranchPicker dirty dialog en mal lugar | `position:fixed` atrapado por transform ancestor | `createPortal(node, document.body)` |
| `./mvnw: No such file` al iniciar server | Bubble apunta a workspace padre (carpeta de repos), no a un repo | Cambiar workspace del bubble al repo correcto |

---

<a id="build"></a>
## 14. Build, empaquetado, reinstall

### Build limpio para .dmg

```bash
# 1) Node 20
source ~/.nvm/nvm.sh && nvm use 20.20.2

# 2) Si tocaste el Swift, recompilar el CLI nativo
./electron/native/build.sh

# 3) Si una build previa dejó montado el volumen del DMG, desmontalo
hdiutil detach -force "/Volumes/Eco 0.1.0" 2>/dev/null || true

# 4) Build limpio del .dmg
pkill -9 -f "Eco" 2>/dev/null
rm -rf release frontend/dist backend/dist
npm run dmg
# Output esperado:
#   release/Eco-0.1.0-arm64.dmg    (~112 MB)
#   release/mac-arm64/Eco.app      (~296 MB instalado)
```

### Filtros del bundle

`electron/package.json/build.extraResources.filter` excluye binarios
multi-arch (sólo `arm64-darwin`), wordlists de `bip39` salvo
`english.json`, `typescript`/`esbuild`/`tsx`/`@types`, tests, docs,
CHANGELOGs. Si agregás una nueva dep grande, revisá si trae
prebuilds o vendor binarios para arquitecturas que no usamos —
filtralos explícitamente acá. El target es `["arm64"]` solamente;
`mac.electronLanguages = ["en", "es"]` descarta 54 packs `.lproj`
de Electron Framework.

### Reinstalar el .app — RECETA INFALIBLE

**Este es el flow obligatorio cuando rebuildés un .dmg y querés ver los cambios reflejados.** Cada paso es load-bearing. Si lo salteás en orden, vas a ver la versión vieja y vas a frustrar al user.

```bash
# 1) MATAR todas las instancias previas. `open` sobre una ya corriendo solo
#    la trae al frente — NO recarga el bundle. Si saltás este paso, vas a
#    pensar que el .dmg no se actualizó.
pkill -9 -f "Eco.app" 2>/dev/null
sleep 1

# 2) BORRAR la .app instalada antes de copiar la nueva. ditto sobre una
#    .app existente puede dejar files viejos mezclados con los nuevos.
rm -rf /Applications/Eco.app

# 3) Copiar la nueva.
ditto release/mac-arm64/Eco.app /Applications/Eco.app

# 4) Quitar el flag de quarantine de macOS.
xattr -dr com.apple.quarantine /Applications/Eco.app

# 5) Lanzar.
open /Applications/Eco.app

# 6) Si el user dice que sigue viendo el bundle viejo, es cache del
#    renderer de Chromium. Limpiarlo (esto desloguea al user):
rm -rf "$HOME/Library/Application Support/Eco/Cache" \
       "$HOME/Library/Application Support/Eco/Code Cache" \
       "$HOME/Library/Application Support/Eco/GPUCache" \
       "$HOME/Library/Application Support/Eco/DawnGraphiteCache" \
       "$HOME/Library/Application Support/Eco/DawnWebGPUCache" \
       "$HOME/Library/Application Support/Eco/Service Worker"
open /Applications/Eco.app
```

`ditto` preserva permisos y xattrs mejor que `cp -R`. `xattr -dr com.apple.quarantine` evita que macOS marque la .app como descargada de internet.

**Verificación rápida** de que el bundle instalado tiene tu cambio (cuando el user reporta "no se actualizó"):

```bash
# El minifier renombra variables — buscá strings literales únicos a tu cambio.
grep -c '"<string-único-de-tu-cambio>"' /Applications/Eco.app/Contents/Resources/frontend/dist/assets/App-*.js
```

Si la cuenta es ≥ 1, el bundle es el correcto y el problema es cache del renderer — usar el paso 6.

### Lanzar desde terminal para ver logs

```bash
/Applications/Eco.app/Contents/MacOS/Eco > /tmp/eco-app.log 2>&1 &
tail -f /tmp/eco-app.log
```

`console.log` del backend + logs del renderer (vía preload IPC `eco:renderer-log`) van ahí. `electronAPI.log` desde el frontend → main process console.

### Limpiar cache del renderer (raro)

```bash
rm -rf "$HOME/Library/Application Support/Eco/Cache" \
       "$HOME/Library/Application Support/Eco/Code Cache" \
       "$HOME/Library/Application Support/Eco/GPUCache" \
       "$HOME/Library/Application Support/Eco/Local Storage" \
       "$HOME/Library/Application Support/Eco/Session Storage"
```

⚠️ Esto borra la sesión de login (`eco.session`), URLs de los browser panels, tabs activas, etc. **NO** afecta `~/.eco/user.json` ni `~/.eco/dev-sessions.json`.

### Verificar bundle de un build

```bash
# CLI Swift presente
ls release/mac-arm64/Eco.app/Contents/Resources/bin/eco-stt

# Info.plist tiene los permisos
/usr/libexec/PlistBuddy -c "Print :NSMicrophoneUsageDescription" \
  release/mac-arm64/Eco.app/Contents/Info.plist
/usr/libexec/PlistBuddy -c "Print :NSSpeechRecognitionUsageDescription" \
  release/mac-arm64/Eco.app/Contents/Info.plist

# main.cjs tiene el permission handler
strings release/mac-arm64/Eco.app/Contents/Resources/app.asar | grep -i setPermissionRequestHandler

# Hash del bundle del frontend (cambia con cada build real)
ls release/mac-arm64/Eco.app/Contents/Resources/frontend/dist/assets/App-*.js
```

---

<a id="decisiones"></a>
## 15. Decisiones que parecen raras (por qué son así)

### "¿Por qué el backend está en 7100 cuando empaqueta?"
Para coexistir con `npm run dev` corriendo en paralelo en la misma máquina. Dev usa 7050 (no 7000 por AirPlay), prod usa 7100. Sin conflictos.

### "¿Por qué `setPermissionRequestHandler` y no dejar que Electron use el default?"
Sin el handler, Chromium auto-rechaza `getUserMedia` antes de que macOS pueda mostrar el prompt nativo. Ningún prompt = ninguna autorización posible = mic muerto. El handler concede a Chromium para que llegue a macOS donde el user decide.

### "¿Por qué encodear WAV en JS en vez de usar MediaRecorder?"
`MediaRecorder` en Chromium 130 emite webm/opus (o audio/mp4 inestable). `AVFoundation`/`SFSpeechRecognizer` no decodifica webm. WAV PCM16 es trivial de generar en JS y SFSpeechRecognizer lo carga nativo. Pipeline confiable.

### "¿Por qué `CFRunLoopRunInMode` en lugar de `DispatchSemaphore` en el CLI Swift?"
`SFSpeechRecognizer.recognitionTask` entrega callbacks en threads internos que requieren un run loop activo en el thread principal. `DispatchSemaphore.wait()` bloquea el run loop → callbacks nunca se ejecutan → timeout silencioso. `CFRunLoopRunInMode` mantiene el run loop activo mientras espera.

### "¿Por qué el webview NO se recrea en cambio de URL?"
Cada recreación parpadea + pierde state interno + dispara eventos de did-fail-load/did-finish-load. Si el padre re-renderiza por cualquier motivo (poll de dev logs, dev_status push, etc.), el webview se destruía. Mantener el mismo webview y solo cambiar `src` es 10x más estable.

### "¿Por qué dev_status NO emite browser_navigate automáticamente desde ServerPanel?"
ServerPanel recibe push del WS cada vez que cambia status. Si emitía `eco:browser_navigate` por cada push de `running`, el BrowserPanel recreaba el webview cada N segundos en loop. La auto-navegación inicial vive en el listener de `dev_status` del BrowserPanel con guard `lastAutoNavRef`.

### "¿Por qué persistir las dev sessions a disco?"
En dev con `tsx watch`, cualquier file change reinicia el backend. Las sessions vivían solo en memoria → al perder el backend perdíamos el handle a los servers (que sobrevivían huérfanos por `detached: true`). Persistir + re-adopt por pgid resuelve esto. Bonus: sobrevive cerrar y reabrir el .app empaquetado.

### "¿Por qué un rebuild del frontend a veces parece no aplicar?"
Hash del bundle (`App-XXX.js`) cambia con cada build real. Si re-build saca el MISMO hash, el contenido no cambió (Vite content-addressed). Si `App-*.js` no cambia tras editar, hay algo cacheado o el cambio no compilú.

### "¿Por qué el TTS tiene 3 backends?"
- **Piper** (Eco original): offline, ONNX, robusto, voces medias.
- **macOS `say`** (agregado): voces Premium/Enhanced del sistema, calidad casi-humana, sin descargar nada (las voces están en macOS).
- **Browser SpeechSynthesis**: fallback para dev navegador, depende del SO.

El user elige cuál en Settings → Voz.

### "¿Por qué el review estilo Cursor usa `git apply --cached` y no edita un staging area aparte?"
Porque git YA tiene un staging area perfecto: el index. Al "aceptar" un hunk hacemos `git apply --cached <patch>` que aplica al index sin tocar el working tree. El `git diff` (sin args) muestra working tree vs index → solo los cambios sin aceptar quedan visibles. Cuando aceptás todo, `git add <path>` stagea el archivo entero. Al commitear, `git add -A && git commit -F -` recoge todo (incluyendo cualquier resto unstaged). Sin store paralelo, sin sincronización, sin scope creep. Lo único que vive en localStorage es `acceptedAt: timestamp` por path para detectar invalidación cuando el agente vuelve a editar.

### "¿Por qué `discardFile` tiene 3 ramas (HEAD / index / unlink) y no solo `git checkout HEAD --`?"
Porque después del review estilo Cursor un archivo puede estar en 3 estados:
1. **Tracked + modified vs HEAD**: existe en HEAD, fue cambiado. `git checkout HEAD -- <path>` lo restaura. (Caso clásico.)
2. **Staged pero nuevo**: el agente lo creó, el user lo aceptó (`git add`), nunca se commiteó. NO existe en HEAD → `git checkout HEAD --` falla con "pathspec did not match". Usamos `git rm -f -- <path>` que saca del index Y borra del fs.
3. **Untracked puro**: nunca se aceptó, no está en index ni HEAD. `unlinkSync` directo.

Detección: `git cat-file -e HEAD:<path>` (en HEAD) y `git ls-files --error-unmatch -- <path>` (en index).

### "¿Por qué el dot ámbar/verde mira `git status --porcelain` (campo `unstaged`) y no solo el `acceptedAt` del localStorage?"
Porque el localStorage puede mentir: si el git add falló o el agente editó después sin que el effect lo detectara, el local diría "aceptado" pero git tendría cambios unstaged. Hacer dot = `accepted local && !hasUnstaged` cierra ese gap — la verdad absoluta de "este archivo tiene cambios sin stagear" la tiene git, no nosotros.

---

<a id="removido"></a>
## 16. Cosas removidas que NO hay que restaurar

Si encontrás referencias en código vivo, son residuos que tenés que limpiar — no funcionalidad a recuperar.

- **`screens/BrowserScreen.tsx`** (navegador global multi-tab). Solo existe el por-agente.
- **`backend/src/browser-proxy.ts` + endpoint `/proxy/site`**. Se usaba para evadir XFO/CSP en el navegador global. El por-agente usa `<webview>` real que ignora esos headers.
- **Skill `/dev-up`** y modo "skill de Claude" en ServerPanel. Solo modo bash directo (`/dev/start` con comando explícito).
- **Endpoints `/dev/up`/`/dev/down`** (versión vieja). Ahora son `/dev/start`/`/dev/stop`/`/dev/restart`.
- **`MediaRecorder` para captura de audio en .dmg**. Reemplazado por PCM crudo + WAV manual.
- **`better-sqlite3` + `@types/better-sqlite3`** del backend. Era dep muerta (13 MB de prebuilds nativos + sources C). No usar — el chat persiste en localStorage.
- **Targets `win` / `linux` y `arch: ["x64"]`** del `electron/package.json`. Solo `arm64-darwin`. Si necesitás cross-platform, restaurá explícitamente con conciencia del trade-off de tamaño y de la ausencia de `eco-stt` Swift en otras plataformas.
- **Polling `setInterval` de `/dev/logs`** cada 1.5 s en `ServerPanel`/`BrowserPanel`. Los logs llegan por WS (`eco:dev_log`). Si alguien re-introduce polling, es regresión.
- **Auto-open de `webContents.openDevTools` en dev**. Hoy es opt-in via `ECO_DEVTOOLS=1` o `Cmd+Opt+I`. Abrirlo siempre consume ~50-80 MB del helper.
- **`components/ToolPermissionDialog.tsx`** (modal bloqueante de confirmación de Write/Edit). Setting viejo `eco.agent.confirm_edits` + protocolo WS `tool_permission_request`/`tool_permission_response`. Reemplazado por el **review post-edit estilo Cursor** (`eco.agent.review_mode`): el agente edita libremente al worktree, el user revisa después en la pestaña Archivos con diff inline + aceptar/rechazar por hunk. El modal pausaba el SDK por cada edit, era invasivo. Si encontrás referencias a `confirmEdits` / `respondToolPermission` / `requestPermission`, es residuo a borrar.

---

<a id="memcaps"></a>
## 17. Caps de memoria que NO hay que aflojar

Optimización completada en 2026-05-12/13. Si alguien sube estos números sin razón muy fuerte, está re-introduciendo los leaks que escalaban a 1-2 GB con 5 burbujas activas.

### Caps activos

| Estructura | Cap | Archivo | Por qué |
|---|---|---|---|
| `bubble.messages` en memoria | **300** msgs | `frontend/src/hooks/useBubbles.ts:appendMessage` | Renderer no acumula histórico ilimitado |
| `bubble.messages` en localStorage | **100** msgs | `useBubbles.ts:persist` | Quota localStorage ~5-10 MB |
| `toolCall.output` en localStorage | **10 KB** + marker | `useBubbles.ts:thinMessageForStorage` | Read tool con file completo podía ser MBs cada uno |
| `serverLogs` (BrowserPanel) | **200 KB** | `BrowserPanel.tsx:SERVER_LOGS_MAX` | Frameworks ruidosos generan MBs |
| `slot.logs` (ServerPanel) | **200 KB** | `ServerPanel.tsx:LOGS_MAX` | Idem |
| `devLog` (DevTools console) | **200** entries | `BrowserPanel.tsx:DEVLOG_MAX` | Sin esto crece infinito con cada eval |
| xterm `scrollback` (Server) | **3 000** líneas | `ServerPanel.tsx` | 10000 era excesivo × N instancias |
| xterm `scrollback` (Shell) | **2 000** líneas | `RealTerminal.tsx` | Idem |
| `s.output` ring buffer | **64 KB** (`BUFFER_MAX`) | `dev-server.ts` | Ring buffer ya capped, **liberar al stop** (línea ~640) |
| PTY ring buffer | **128 KB** (`RING_BUFFER_MAX`) | `pty-server.ts` | Replay al reconectar |
| `globalPromptTimestamps` | **1000** | `ws-server.ts` | Defensa anti-leak teórico |

### Patrón de cap-on-append

Para cualquier `state` que crece por chunk/append (logs, mensajes, etc.), usá `.slice(-MAX)` al concatenar:

```ts
setSlots((prev) => ({
  ...prev,
  [role]: { ...prev[role], logs: (prev[role].logs + e.chunk).slice(-LOGS_MAX) },
}));
```

NO uses un useEffect aparte para truncar — corrés race conditions con setState concurrentes.

### Cleanup obligatorio en cierre de burbuja

`removeBubble` (`useBubbles.ts`) **debe**:

1. Llamar `POST /bubble/close` con el `bubbleId` → backend hace cleanup atómico de PTY + dev servers + worktree + sessions Map.
2. Limpiar las keys `eco.*.${bubbleId}` de localStorage. Lista de prefijos en el código; si agregás una key nueva con bubbleId en el suffix, sumá su prefijo al array.

Si rompés cualquiera de los dos, los recursos quedan colgados:
- En memoria: `sessions` Map del dev-server, ring buffers, PTY handles.
- En disco: entries en `~/.eco/dev-sessions.json`, worktrees en `~/.eco/worktrees/`.
- En localStorage: keys huérfanas acumulando sin propósito.

### Pausa de animaciones cuando hidden

`App.tsx` toggle clase `eco-hidden` en `<body>` reaccionando a `visibilitychange`. La regla CSS en `index.css` aplica `animation-play-state: paused !important` a todo el árbol. Sin esto, aurora + partículas + shimmer siguen renderizando con la ventana minimizada.

Si vas a agregar una animación nueva que sea costosa (SVG `<animate>`, `motion.div` con loop infinito, etc.), confiá en este toggle global — no necesitas otro mecanismo de pausa. Para animaciones que NO deberían pausarse (ej. spinner de "subiendo archivo"), no aplicaría el cap igual porque solo activan cuando el user está mirando.

---

<a id="preflight"></a>
## 18. Pre-flight antes de cualquier PR

Tests rápidos de smoke. Si alguno falla, el PR no está listo.

1. **`cd frontend && npx tsc --noEmit`** → 0 errores
2. **`cd backend && npx tsc --noEmit`** → 0 errores
3. **`npm run web`** arranca, frontend carga, login funciona
4. **Voz en navegador** (Web Speech): click hablar → animation listening → decí "Eco terminal" → cambia tab
5. **ServerPanel single mode**: en una conversación, comando `echo hola` → arranca → status idle (porque echo termina) → no crash
6. **ServerPanel dual mode**: activar toggle, comandos válidos → backend arranca primero, frontend después con `API_PORT` correcto
7. **Browser panel**: navegar a `localhost:7100/health` → JSON → cambiar tab → volver → no se recargó
8. **`npm run dmg`** produce `.dmg` sin errores; bundle contiene `Resources/bin/eco-stt`
9. **.app instalada** arranca, login funciona, voz funciona (con prompts macOS de Mic + Speech Recognition la primera vez)
10. **Persistencia dev server**: con un server corriendo, matar el backend → `~/.eco/dev-sessions.json` tiene la entrada → relanzar backend → server aparece como running

Si pasa los 10, sigue al siguiente paso (commit/push si Sergio lo autoriza).

---

## Apéndice A: comandos de debug que vas a usar seguro

```bash
# Estado de procesos Eco
ps aux | grep -i "Eco" | grep -v grep

# Puertos abiertos por Eco
lsof -nP -iTCP -sTCP:LISTEN | grep -E "Eco|7050|7100|5173"

# Verificar token vivo
cat ~/.eco/token | head -c 30

# Sessions de dev server persistidas
cat ~/.eco/dev-sessions.json | jq

# Backend del .app respondiendo
curl -s http://127.0.0.1:7100/health

# Backend en dev
curl -s http://127.0.0.1:7050/health

# Test endpoint con auth completa
TOKEN=$(cat ~/.eco/token) curl -s \
  -H "Authorization: Bearer $TOKEN" -H "X-Eco-Client: 1" \
  http://127.0.0.1:7050/info | jq

# Verificar Info.plist del .app instalada
/usr/libexec/PlistBuddy -c "Print :NSMicrophoneUsageDescription" \
  /Applications/Eco.app/Contents/Info.plist

# Reset permisos macOS para mic + speech
tccutil reset Microphone com.aditum.eco
tccutil reset SpeechRecognition com.aditum.eco

# Listar worktrees activos
ls -ltd ~/.eco/worktrees/*/

# Ramas eco/ huérfanas en un repo
git -C <repo> branch | grep eco/
```

## Apéndice B: lectura recomendada del repo

Para entender features sin ir a ciegas:

- **PTY persistente**: `backend/src/pty-server.ts` (ring buffer + reattach)
- **MCP tools propias**: `backend/src/agent-tools.ts` + `agent.ts`
- **Commit con AI**: `backend/src/git-ops.ts:commitSuggest` (llama `claude -p`)
- **Voice parser**: `frontend/src/lib/meta-commands.ts` — particularmente `ALIASES` y `parseMetaCommand`
- **WS reconnect**: `frontend/src/hooks/useEcoSocket.ts` — backoff + activeBubbleId tracking
- **Worktree manager**: `backend/src/worktree-manager.ts` — incluye prune cron + auto-recovery de conflictos
- **Dashboard graph**: `Dashboard.tsx` líneas ~1190-1500 — SVG animations, partículas, satellite pulses
- **Theme system**: `frontend/src/design/tokens.ts` y `theme.tsx` — 14 acentos + 19 themes, glassEffect helper
