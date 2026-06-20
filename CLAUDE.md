# CLAUDE.md — Eco

Operations manual for any agent working in this repo. Source of truth for rules, file maps, gotchas, and decisions. If something here conflicts with `README.md`, this file wins. The README is the human-facing intro; this file is the operational truth.

## Table of contents

1. [TL;DR](#tldr)
2. [Hard rules](#rules)
3. [Environment](#env)
4. [File map by feature](#filemap)
5. [Processes & storage](#storage)
6. [WebSocket protocol](#ws)
7. [Voice pipeline (terminal dictation only)](#voice)
8. [ServerPanel — dev server per agent](#serverpanel)
9. [BrowserPanel — webview per agent](#browserpanel)
10. [Git tab — changes, history, PRs, review](#gittab)
11. [FilesPanel — tree + editor](#filespanel)
12. [NotesPanel — notes + summarizer](#notespanel)
13. [Archiving](#archiving)
13b. [Backup & Restore](#backup)
14. [GitHub PAT](#githubpat)
15. [Auth, workspaces, worktrees, onboarding](#auth)
16. [Voice/text meta-commands — REMOVED](#metacommands)
17. [Conventions](#conventions)
18. [Pre-flight checklist](#preflight)
19. [Build & .dmg packaging](#build)
20. [Appendix A: Common errors → fixes](#errors)
21. [Appendix B: Debug commands + reading order](#debug)
22. [Appendix C: External MCP server](#mcp-appendix)
23. [Appendix D: Multi-tenant](#multitenant)
24. [Appendix E: Windows & cross-platform packaging](#windows)

---

<a id="tldr"></a>
## 1. TL;DR

- **Eco** is a **cross-platform** desktop app (macOS Apple Silicon + Windows x64 + Linux x64 experimental) that orchestrates Claude conversations. Each conversation ("agent" / "bubble") gets its own git worktree, PTY, files, dev server, browser, notes. **Local-first compute** (worktrees/PTY/dev-servers/git/files never leave the host) but **cloud identity + state**: login via **Firebase Auth**, multi-tenant app state in **Firestore** (gated by `firestore.rules`). External calls: Anthropic API + Firebase (Auth + Firestore).
- **Packaged** via Electron 33 + electron-builder 25. macOS → `.dmg` arm64 (~112 MB). Windows → NSIS `.exe` x64 (~96 MB). The OS-dependent backend primitives (shell, ports, process-kill) live in `backend/src/platform.ts`; the build config is `electron/electron-builder.config.cjs` (conditional native prebuilds per target). **Full Windows + packaging detail in Appendix E — read it before touching spawn/shell/port/kill code, the electron-builder config, or the prepare scripts.**
- **User**: Sergio Castro (Florida, USA). Rules in §2 + the global `~/.claude/CLAUDE.md` apply (Obsidian vault, no auto-commits, Spanish UI but English docs).
- **Voice**: the ONLY voice feature is **terminal dictation** (on-device STT via Swift + Apple Speech in the .dmg, Web Speech in the browser, macOS-only). Everything else voice-related was removed (wake word, voice commands, TTS, voice settings — see the Removed table in §2). Dev servers persist across reloads.
- **Dev logs flow via WS push** (`dev_log` batched every 80 ms), not polling.
- **Multi-tenant = Firebase Auth + Firestore.** Login es **Firebase Auth** (email/password); el ID token viaja como `Authorization: Bearer <jwt>` (HTTP) y subprotocolo WS `eco.idtoken.<jwt>`. El backend local **verifica el ID token stateless** (JWKS de Google, `firebase-auth.ts`) y **NO autoriza** — `requireAdmin` solo exige que haya `req.ecoUser`. La **autorización real son las Firestore Security Rules** (`firestore.rules`); el **estado de la app vive en Firestore** (users/role, bubbles+messages, categories, notes, review, prefs, auditLog). El backend local hace solo **cómputo** (worktrees/PTY/git/dev-servers/files/voz/backup). El PIN local es un **lock** de dispositivo (SHA-256), no auth de cuenta. **Todo el detalle en Appendix D — leelo antes de tocar auth/usuarios/sync/workspace-config.** El modelo local anterior (PIN/argon2id/BIP39/sessions/doc-store) quedó **inerte** (ver §2 Removed/Legacy).

**Read in this order to ramp up:**
1. This file (especialmente Appendix D para multi-tenant)
2. `README.md` (product overview)
3. `backend/src/firebase-auth.ts` + `frontend/src/lib/firebase.ts` (auth: verificación + cliente)
4. `firestore.rules` (la frontera de autorización)
5. `backend/src/index.ts` (all endpoints)
6. `frontend/src/App.tsx` (command dispatcher + shell setup)
7. `electron/main.cjs` (.dmg lifecycle)

---

<a id="rules"></a>
## 2. Hard rules

### NEVER

| Rule | Reason |
|---|---|
| **No auto-commit or auto-push.** Leave changes in the working tree. Sergio decides when. | User chooses commit boundaries; agent commits create noise. |
| **No emojis in code or UI** unless Sergio asks. | Personal style preference, enforced. |
| **No speculative features.** Do X if Sergio asked for X — not Y "for later". | Half-finished features rot. |
| **Do not reintroduce anything in the Removed table below.** | Each item was deleted for a reason; the residue is to clean, not recover. |
| **No skipping git hooks** (`--no-verify`, `--no-gpg-sign`) unless explicitly asked. | Hooks exist for a reason. |
| **No model downgrades to save cost.** Sergio chooses the model. | |
| **No 0.0.0.0 binds, no external hostnames.** Always 127.0.0.1. | Local-first invariant. |
| **Never clear the renderer cache** (`~/Library/Application Support/Eco/*`) unless Sergio explicitly asks. Reinstalling the `.app` does NOT require it. | Wiping it logs the user out (`eco.session`) and drops browser URLs / active tabs. |

### ALWAYS

| Rule | Why |
|---|---|
| **`npm run typecheck` must pass** before any rebuild or commit (both workspaces if you touched both). | TS strict mode is the contract. |
| **`npm run check:i18n` must pass.** Every user-facing string goes through `useT`/`translate`. No exceptions. | Bilingual UI must stay coherent. See §17. |
| **Communication in Spanish.** UI text, chat messages. (Docs are English.) | User preference. |
| **User-facing errors in Spanish.** Backend returns stable `code` + `message`; frontend translates via `translateBackendError`. | |
| **Persist important state to disk** (`~/.eco/*.json` chmod 600) when it must survive a backend reload. | tsx-watch + .app reload would lose memory-only state. |
| **Validate input at the boundary.** Zod schemas for POST, regex/whitelist for any arg that hits `spawn` or path joins. | |
| **Cross-platform: never hardcode the shell, the path separator, `lsof`, `process.kill(-pgid)`, or POSIX paths.** Route OS-dependent ops through `backend/src/platform.ts` (`defaultShell`/`shellRun`/`shRun`/`pidsOnPort`/`killTree`/`killPid`/`detachForGroup`/`resolveClaudeCli`) and use `path.delimiter`. | Eco ships on macOS AND Windows. See Appendix E. |
| **In ESM use `fileURLToPath(import.meta.url)`, never `new URL(import.meta.url).pathname`.** The latter yields `/C:/…` on Windows and leaves `%20` for spaces. | Breaks path resolution on Windows (and on Mac paths with spaces). |
| **`chmodSync` to 0o600 must be in try/catch.** It's a no-op on NTFS and security relies on the FS, not POSIX mode bits. | Windows has no POSIX perms. |
| **After touching packaging or the prepare scripts, build BOTH targets** (`npm run dist:mac` on a Mac, `npm run dist:win` on Windows) — they can't be cross-built. | NSIS/dmg, node-pty + ripgrep prebuilds, and code-signing are host-specific. |

**Removed items — do NOT restore:**

| Item | Replaced by | Why removed |
|---|---|---|
| `screens/BrowserScreen.tsx` (global multi-tab browser) | `BrowserPanel` per agent | Per-agent webview is simpler and isolates cookies. |
| `backend/src/browser-proxy.ts` + `/proxy/site` | `<webview>` real (ignores XFO/CSP) | Proxy hack no longer needed in Electron. |
| Skill `/dev-up` + skill mode in ServerPanel | Direct bash mode (`/dev/start` with explicit command) | Less indirection. |
| `/dev/up`, `/dev/down` | `/dev/start`, `/dev/stop`, `/dev/restart` | Renamed for clarity. |
| `MediaRecorder` for audio capture in .dmg | PCM + manual WAV PCM16 encode | AVFoundation can't decode webm/opus. |
| `better-sqlite3` + `@types/better-sqlite3` | None (was dead dep, −13 MB) | Chat persists in localStorage. |
| Win/Linux electron targets, `arch: ["x64"]` | arm64-darwin only | macOS-only product. |
| `setInterval` polling of `/dev/logs` | WS push (`eco:dev_log` batched 80 ms) | Cuts ~80 req/min per server. |
| Auto-open of `webContents.openDevTools` in dev | Opt-in via `ECO_DEVTOOLS=1` or `Cmd+Opt+I` | DevTools always-on consumed 50–80 MB. |
| `components/ToolPermissionDialog.tsx` + `confirmEdits` setting + `tool_permission_request/response` WS messages | Cursor-style post-edit review (`eco.agent.review_mode`) | Modal-per-edit was invasive; review-after is calmer. |
| `backend/src/user-store.ts` (single-user) | `users-store.ts` (multi-tenant) | Eco es multi-usuario; identidad sale de la sesión. |
| Admin-set PIN: `POST /admin/users {pin}`, `/admin/users/:id/reset-pin`, `resetPin` | Token de activación: `createMember`(sin pin), `/auth/claim`, `/admin/users/:id/issue-claim` | El admin nunca ve ni fija PINs. |
| BIP39/`recoveryHash` para members | Reseteo por token del admin | Solo el admin dueño conserva frase. |
| localStorage `eco.dev.workspace_defaults.*`, `eco.worktree.favorites.*`, `eco.dev.cmd.*`, `eco.dev.dual.*` | `~/.eco/workspace-config.json` (admin define por workspace) | Server config server-authoritative; ServerPanel solo-consumo. |
| `CommandSlot`/`PresetMenu`/`Toggle` editables + `useDevPresets` en ServerPanel | Resumen read-only + Settings → Folders | El member no edita comandos de server. |
| Borrar la propia cuenta (`DELETE /auth/user` desde UI, `destroyUser`, DestroyDialog) | Solo lock / cerrar sesión | Decisión: nadie borra datos desde la UI. |
| "History" en el sidebar (`AppSidebar`) | — | No se usa; pantalla sigue existiendo pero oculta del menú. |
| Voice commands / meta-commands (`lib/meta-commands.ts`, `handleMetaAction`, wake word `stripWakePrefix`, `CommandFeedback`, `StatusOverlay`) | Nada — solo queda el dictado a la terminal | Liberar recursos; el mic siempre-encendido + parser de comandos ya no se usa. |
| TTS completo (`useTTS.ts`, `backend/tts.ts`, `backend/tts-macsay.ts`, endpoints `POST /tts` + `GET /tts/voices`, `Settings:SectionVoice`) | Nada | Respuestas habladas removidas. |
| Mic siempre-encendido + autostart (`eco.voice.autostart*`, `handleMicToggle`, botón mic en chat/Dashboard, `ListeningWave`, `CommandBar`) | Solo el botón "Hablar a la terminal" enciende el mic | El loop de mic/VAD en continuo gastaba CPU. |
| `lib/voice-router.ts` (target chat/pty live) + `registerPtyWriter` en RealTerminal | Botón "Hablar a la terminal" → buffer → `writeToBubblePty` | El dictado a la terminal es autocontenido vía `pty-bridge`. |
| `listener/` (sidecar Python: openWakeWord + faster-whisper) + scripts `npm run listener*` | Nada | El dictado usa Apple Speech (.dmg) / Web Speech (browser), sin Python. |
| `POST /voice/transcribed` + mensaje WS `voice_transcribed` | Nada | Solo lo usaba el listener Python. |
| Paso "Voice" del OnboardingWizard | Nada | No hay preferencia de voz que configurar. |

If you spot any of these in live code, it's residue to clean.

**Legacy/inert — do NOT use as the live path (code still present, dormant):**

| Item | Live replacement | Status |
|---|---|---|
| Local auth: PIN (argon2id) + BIP39 recovery + activation tokens (`users-store.ts`, `/auth/{register,login,recover,claim}`) | **Firebase Auth** (email/password) → ID token; verified by `backend/src/firebase-auth.ts` (JWKS, `jose`) | Inert. Endpoints exist but are not the auth path. Don't reintroduce PIN as account auth. |
| Sessions (`sessions.ts`, `X-Eco-Session` / `X-Eco-Refresh`, `/auth/session`) | Stateless ID-token verification per request/connection | Inert. No session is minted on the Firebase path. |
| Per-user doc store (`user-docs.ts`, `GET/PUT/DELETE /user/doc(s)`, WS `doc_updated`/`doc_deleted`, `broadcastToUser`) | **Firestore** collections (frontend client SDK, `firestore.rules`) | Legacy. Used only for a one-time migration (`ensureMigrated` in `lib/user-sync.ts`). |
| Local PIN as identity | Local PIN = device **lock** only (`lib/lock-pin.ts`, SHA-256, `LockScreen.tsx`) over a live Firebase session | Repurposed — not account auth. |

> **Regla multi-tenant (Firebase)**: la identidad SALE SIEMPRE del **ID token de Firebase verificado** (`req.ecoUser.id` = uid; subprotocolo WS `eco.idtoken.<jwt>`), nunca de un userId del cliente. La **autorización vive en `firestore.rules`** (owner-based + rol admin en `users/{uid}.role`), NO en el backend local — `requireAdmin` solo exige sesión válida porque la máquina sirve a una persona. El **estado de la app es Firestore**; no reintroduzcas el doc-store local ni PIN/argon2/BIP39 como auth. La config de server por workspace y las base branches las define el **admin** (sigue server-side vía `/workspace-config`); el member la consume.

---

<a id="env"></a>
## 3. Environment

### Ports by mode

| Mode | Backend | Vite | Renderer origin |
|---|---|---|---|
| `npm run web` | `127.0.0.1:7050` | `127.0.0.1:5173` | `localhost:5173` (real browser) |
| `npm run dev:app` | `127.0.0.1:7050` | `127.0.0.1:5173` | Electron loadURL → Vite |
| Packaged `.dmg` | `127.0.0.1:7100` | served by backend | same origin as backend |
| `npm run serve:web` (server mode) | `127.0.0.1:7200` | served by backend | `https://<machine>.ts.net` via Tailscale Serve (or local `127.0.0.1:7200`) |

> **WHY 7050 in dev**: macOS Control Center owns `:7000` (AirPlay Receiver). To free 7000, *Settings → General → AirDrop & Handoff → AirPlay Receiver = off*.
> **WHY 7100 in .app**: coexists with `npm run dev` running in parallel without conflict.

Override: `ECO_PORT=<n>` for backend/electron; `ECO_BACKEND_PORT=<n>` for Vite proxy in `vite.config.ts`.

### Scripts (root `package.json`)

| Script | Purpose |
|---|---|
| `npm run web` | Backend + Vite. Open `http://localhost:5173` in a real browser. |
| `npm run dev:app` | Backend + Vite + Electron window with hot-reload + DevTools. |
| `npm run dmg` | Build `.dmg` for Mac (alias `dist:mac`). |
| `npm run dist:win` / `dist:linux` | NSIS `.exe` (x64) / AppImage (x64, experimental). |
| `npm run dev:backend` / `dev:frontend` / `dev:electron` | Single-service variants. `dev:backend` exports `ECO_FIREBASE_PROJECT_ID=aditum-eco`. |
| `npm run typecheck` | TS for both workspaces. |
| `npm run check:i18n` / `check:i18n:report` | i18n enforcement (strict / report-only). |
| `npm run test:security` | Backend security test suite. |
| `npm run bootstrap:admin <email>` | One-time: promote a Firebase user to admin (`scripts/bootstrap-admin.mjs`, needs `GOOGLE_APPLICATION_CREDENTIALS` / service-account). Writes `users/<uid>.role=admin` in Firestore. |
| `npm run test:rules` | Firestore Security Rules tests against the emulator (`scripts/firestore-rules.test.mjs`). |

All dev scripts hardcode `ECO_PORT=7050` / `ECO_BACKEND_PORT=7050` — do not export manually.

### `frontend/.env.local`

```
VITE_ECO_BACKEND=
VITE_ECO_TOKEN=<optional, copy of ~/.eco/token>
# Firebase web config (Auth + Firestore). PUBLIC, not a secret — real security is firestore.rules.
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

`VITE_ECO_BACKEND` must be **empty** so calls go through the Vite proxy. An absolute URL forces cross-origin → fragile with CORS. In Electron this env is ignored (`window.electronAPI.getConfig()` returns the right URL via IPC). The `VITE_FIREBASE_*` block is read by `frontend/src/lib/firebase.ts:readConfig()`; if `apiKey`/`projectId`/`appId` are missing, `firebaseConfigured()` returns false and login can't proceed.

### Versions required

- **Node 20** (`nvm use 20.20.2`). Vite 6 doesn't support 16.
- **`claude` CLI** from `@anthropic-ai/claude-code`, authenticated.
- **Swift 5+** (Xcode CLT) if rebuilding the native CLI.
- **git** (worktrees, branches).
- **A Firebase project** (Auth email/password + Firestore). Default project id `aditum-eco` (`.firebaserc`). Emulators in `firebase.json` (auth `:9099`, firestore `:8085`) for `npm run test:rules`.

### Backend env vars

| Var | Default | Purpose |
|---|---|---|
| `ECO_WORKSPACES` | (none) | Allowed workspaces (CSV). Also editable from Settings. |
| `ECO_HOST` | `127.0.0.1` | Bind interface — do not change. |
| `ECO_PORT` | `7000` (overridden: 7050 dev, 7100 packaged) | HTTP/WS port. |
| `ECO_ALLOWED_ORIGINS` | (defaults + auto-include own origin) | WS origin whitelist. |
| `ECO_MODEL` | `claude-sonnet-4-5-20250929` | Claude model. |
| `ECO_FIREBASE_PROJECT_ID` | (none; dev script sets `aditum-eco`) | Firebase project id used to verify ID tokens (`firebase-auth.ts`; falls back to `FIREBASE_PROJECT_ID`/`GCLOUD_PROJECT`). Without it, `verifyFirebaseIdToken` returns null → every request 401s. |
| `ECO_RATE_LIMIT` | `10` | Prompts per minute. |
| `ECO_PROMPT_TIMEOUT_MS` | `600000` | Absolute prompt timeout. |
| `ECO_PTY_AUTOCLAUDE` | `1` | Auto-launch `claude` in each new PTY. |
| `CLAUDE_CLI_PATH` | `~/.local/bin/claude` | Claude binary path. |
| `ECO_DEVTOOLS` | (empty) | `1` to auto-open Electron DevTools. |
| `ECO_FRONTEND_DIST` | (empty) | Path to `frontend/dist` — when set and existing, the backend serves the static frontend (`index.html` = `Cache-Control: no-cache`, hashed assets = immutable) + SPA fallback. Packaged .app and server mode. |
| `ECO_EXTRA_HOSTS` | (empty) | CSV of extra hostnames accepted by the host check (`config.hostAllowed`, HTTP + both WS). Server mode sets the `.ts.net` name here. |
| `ECO_PUBLIC_HOST` | (empty) | Public tailnet hostname (`<machine>.ts.net`). When set, dev-server URLs become `https://<host>:<port>` and each port is exposed via `tailscale serve`. |
| `ECO_TAILSCALE_BIN` | auto | Tailscale CLI path override. macOS bundles it at `/Applications/Tailscale.app/Contents/MacOS/Tailscale` (not in PATH); the backend auto-detects. |

### Server mode (remote web via Tailscale)

`npm run serve:web` (script `scripts/eco-server.mjs`) runs Eco as a web server for the fase-0 thin-client experiment: backend on `127.0.0.1:7200` serving the built frontend, exposed to the tailnet as `https://<machine>.ts.net` via `tailscale serve` (HTTPS = secure context → mic/Web Speech work in remote Chrome). The script derives the hostname from `tailscale status --json`, builds missing dists (`--rebuild` to force), sets `ECO_ALLOWED_ORIGINS`/`ECO_EXTRA_HOSTS`, and prints the share URL. The backend keeps binding 127.0.0.1 — Tailscale Serve is the only ingress.

Remote auth: a remote browser logs in with **Firebase Auth** (email/password) like any client; the Firebase ID token is sent as Bearer/WS subprotocol and the local backend (behind Tailscale Serve) verifies it. The legacy ConnectView/`eco.token` bearer + PIN flow is inert. (Historical note: the old single-tenant fase-0 server used a shared `~/.eco/token` + PIN.)

#### Dev-server previews over the tailnet

The hard part of the whole feature, after many iterations. The final model, in `dev-server.ts` + `backend/src/tailscale.ts`:

- **`urlFor(port)`**: in server mode returns `https://<publicHost>:<port>`, else `http://127.0.0.1:<port>`.
- **Dev servers bind 127.0.0.1** in server mode (`HOST=127.0.0.1` env; Spring also gets `-Dserver.address=127.0.0.1`). This is the load-bearing detail: if a server binds `0.0.0.0` it grabs `100.x:<port>` (the tailnet IP) and `tailscale serve` can't use that port → `EADDRINUSE`.
- **`syncServe(s)`** (called from `broadcastStatus`, tracked by `servedPorts`) runs `tailscale serve --bg --https=<port> http://127.0.0.1:<port>` → the dev server is reachable at `https://<host>:<port>` (HTTPS, so the HTTPS BrowserPanel embeds it without mixed-content). Cleaned on stop/forget. The tailscale calls are async/non-blocking with a 12 s timeout.
- **Spring `-Dserver.forward-headers-strategy=framework`**: without it the app sees the proxied request as HTTP and 302-downgrades its redirects → `ERR_TOO_MANY_REDIRECTS`. With it, Spring honors `X-Forwarded-Proto`.
- **`SmartBrowserView` mixed-content fallback**: if a dev URL is `http://` and the app is HTTPS (a server that insists on binding `0.0.0.0`, e.g. JHipster's gulp/browser-sync which ignores `HOST`), the iframe is blocked by the browser → it renders an "Abrir en pestaña nueva" overlay instead (top-level nav is not mixed-content).

> **Known limit**: gulp/browser-sync ignores `HOST=127.0.0.1` and binds `0.0.0.0`, so it can't be exposed via `tailscale serve` (port conflict). For JHipster that's fine — the Spring backend serves the built frontend from `src/main/webapp` at `/`, so previewing the **backend** shows the whole app (sans gulp live-reload). Not worth the complexity to make gulp work remotely.

Accepted caveats (fase 0, NOT multi-tenant): single shared identity (token + PIN del dueño); **the token alone already grants API access** (`POST /auth/session` mints a session from the bearer without PIN — the PIN gate is UI-level for remote clients); bubbles live in each browser's localStorage (remote client has its OWN list); `/bubbles/sync` is last-writer-wins across clients; first load of a new dev port is slow (Tailscale provisions the HTTPS cert); `tailscale serve reset` clears stale mappings; never use Funnel (tailnet-only).

> The .app (7100), server mode (7200) and dev (7050) can now run in parallel: the dev-sessions state file is namespaced by backend port (`~/.eco/dev-sessions.<port>.json`), so each backend re-adopts only its own spawned processes and never clobbers the others (this used to leave orphan Spring Boot/gulp processes holding ports). The legacy `dev-sessions.json` is intentionally NOT migrated (a still-running old .app may hold it live); it dies out once every backend runs the namespaced build.

---

<a id="filemap"></a>
## 4. File map by feature

If you're touching X, the key files are:

### Terminal dictation (the ONLY voice feature)
The "Hablar a la terminal" button in the bubble header turns the mic on, accumulates the dictated text in a buffer (shown in `DictationBar`), and "Enviar a terminal" writes it to the main PTY (no Enter — the user reviews before running). Self-contained: no wake word, no chat routing, no meta-commands.
- `electron/native/eco-stt.swift` — Swift CLI using `SFSpeechRecognizer` (on-device)
- `electron/native/build.sh` — compiles to universal arm64+x64 binary
- `electron/build/bin/eco-stt` — build output (bundled in .app)
- `electron/main.cjs:setPermissionRequestHandler` — grants mic/audioCapture (load-bearing — keep)
- `electron/package.json:mac.extendInfo` — `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription` (keep)
- `frontend/src/hooks/useVoice.ts` — STT capture engine (Web Speech in browser, PCM+WAV+POST in .dmg). `onPhrase` only; no wake detection.
- `backend/src/index.ts` `/voice/transcribe-blob` — endpoint that spawns eco-stt
- `frontend/src/lib/pty-bridge.ts:writeToBubblePty` — writes the dictation buffer to the bubble's PTY
- `frontend/src/App.tsx` — `startTerminalDictation` / `sendDictationToTerminal` / `cancelTerminalDictation`; `frontend/src/screens/AgentDetail.tsx:DictationBar` + the dictate button

### Dev server per agent
- `backend/src/dev-server.ts` — session manager, spawn/kill, persistence, `scheduleLogFlush`, `forgetSession`, `urlFor`/`syncServe` (server-mode tailnet exposure). Env injected per spawn: `HOST=127.0.0.1`, `-Dserver.port`/`-Dspring.devtools.restart.enabled=false` (always) + `-Dserver.address=127.0.0.1`/`-Dserver.forward-headers-strategy=framework` + Vite allowed-hosts (server mode only).
- `backend/src/tailscale.ts` — `serveOn`/`serveOff`/`tailscaleBin` (async, non-blocking `tailscale serve` wrappers). Only used in server mode.
- `frontend/src/components/ServerPanel.tsx` — UI (single/dual, workspace presets, xterm logs, `eco:dev_log` listener)
- `frontend/src/hooks/useDevPresets.ts` — global presets
- `frontend/src/hooks/useWorkspaceServerDefaults.ts` — per-workspace presets
- `backend/src/index.ts` `/dev/{start,stop,restart,status,logs,active}`, `/bubble/close`, `/pty/kill`

### Server mode (remote web)
- `scripts/eco-server.mjs` — `npm run serve:web` launcher (derives `.ts.net` host, builds dists, `tailscale serve --https=443`, sets env). See §3.
- `backend/src/config.ts:hostAllowed` — shared host check (replaces the 3 hardcoded copies in `index.ts`/`ws-server.ts`/`pty-server.ts`); `extraHosts`, `publicHost`.
- `backend/src/index.ts` — static serving with split cache headers (`index.html` no-cache, hashed assets immutable); `POST /bubble/send`.
- `frontend/src/screens/AuthScreen.tsx:ConnectView` + `frontend/src/lib/eco-config.ts:readStoredToken/writeStoredToken` (key `eco.token`) + `useAuth` `needs_token` state.

### Categories (multi)
- `frontend/src/hooks/useCategories.ts` — store + subscribers for `eco.categories` (id, name, color). Read sync via `getCategoryById`.
- Bubble field is `categoryIds: string[]` (was single `categoryId` — auto-migrated in `useBubbles.loadStored`). Setter: `toggleBubbleCategory(id, catId)` (add/remove; `undefined` clears all).
- Chips: header in `AgentDetail.tsx`, cards in `Dashboard.tsx`. Dots: ring on the dock icon (`BubbleDock.tsx`, conic-gradient arcs), and on the node border in the graph (`Dashboard.tsx`, first category tints the node).

### Bubble cleanup
- `backend/src/index.ts:closeBubbleResources(bubbleId)` — kills PTY + dev servers (all 3 roles) + `forgetSession` + `removeWorktree`
- `backend/src/index.ts` endpoints `POST /bubble/close` (semantic) and `POST /pty/kill` (alias)
- `backend/src/dev-server.ts:forgetSession(bubbleId)` — wipes Map entries + disk
- `frontend/src/hooks/useBubbles.ts:removeBubble` — fires `/bubble/close`, clears `eco.*.${bubbleId}` keys

### Browser per agent
- `frontend/src/components/BrowserPanel.tsx` — UI + DevTools + persisted zoom
- `frontend/src/components/SmartBrowserView.tsx` — `<webview>` (Electron) / `<iframe>` (web) wrapper

### Auth (Firebase — ver Appendix D)
- `backend/src/firebase-auth.ts` — **verificación stateless del ID token** contra el JWKS de Google (`jose`, `createRemoteJWKSet`); valida issuer `securetoken.google.com/<pid>` + audience `<pid>`; devuelve `{uid, email}`. Project id de `ECO_FIREBASE_PROJECT_ID`.
- `backend/src/index.ts` (middleware ~280-320) — setea `req.ecoUser = {id: uid, role: 'member', username: email}` desde el Bearer (Firebase) o el token de máquina (MCP). `requireAdmin` = solo exige `req.ecoUser` (la autorización real es Firestore). `/auth/*` legacy inertes.
- `frontend/src/lib/firebase.ts` — cliente Firebase: `getEcoAuth`/`getDb` (Firestore con offline persistence), `currentIdToken` (Bearer + WS `eco.idtoken.<jwt>`), `createUserAsAdmin` (alta sin desloguear al admin, instancia secundaria in-memory), `firebaseConfigured`.
- `frontend/src/hooks/useAuth.ts` — login/signOut con Firebase Auth + estado de lock (`unlocked|locked|setup`).
- `frontend/src/lib/lock-pin.ts` + `frontend/src/screens/LockScreen.tsx` — PIN de **lock** local (SHA-256, salteado con uid) sobre una sesión Firebase viva; NO es auth de cuenta.
- `frontend/src/screens/AuthScreen.tsx` — login/reset (email/password). `frontend/src/components/AccountMenu.tsx` — avatar + lock + cerrar sesión.
- `firestore.rules` — **la frontera de autorización** (owner-based + rol admin en `users/{uid}.role`). Ver Appendix D.
- **Legacy/inerte (dormido):** `backend/src/{users-store,sessions,auth}.ts`, `request-context.ts`, `frontend/src/lib/auth-role.ts`. `auth.ts` sigue vivo solo para el **token de máquina** (`~/.eco/token`) de procesos MCP stdio.

### Multi-tenant: Firestore + workspace config + admin (ver Appendix D)
- `frontend/src/lib/firestore-model.ts` — tipos de los docs Firestore (`BubbleDoc`, `MessageDoc`, `NoteDoc`, `PrefsDoc`, …).
- `frontend/src/lib/user-sync.ts` — hidratación + sync a **Firestore** (bubbles+mensajes, categorías, notas, review, prefs). `ensureMigrated` sube el doc-store local (`GET /user/docs`) a Firestore **una sola vez**; después todo es Firestore.
- `frontend/src/screens/AdminScreen.tsx` + `hooks/useAdmin.ts` — consola admin **directo contra Firestore**: tabs Usuarios (crear vía `createUserAsAdmin`+doc, rol via `updateDoc users/{uid}.role`, disable via `users/{uid}.disabled`, reset via `sendPasswordResetEmail`), Actividad (lee `bubbles`), Bitácora (lee `auditLog`).
- `backend/src/workspace-config.ts` + `frontend/src/lib/workspace-config.ts` — config por workspace (admin define server+baseBranches). **Sigue local** vía `GET/POST /workspace-config` (no migrado a Firestore).
- **auditLog**: colección Firestore append-only (`firestore.rules`: owner crea, nadie edita/borra, admin lee). El backend `audit-log.ts` (`~/.eco/audit-log.jsonl`) es legacy.
- **Legacy/inerte:** `backend/src/user-docs.ts` (`/user/doc(s)`) + `ws-server.ts:broadcastToUser` (`doc_updated`/`doc_deleted`) — solo para la migración one-time.

### Workspaces + worktrees
- `backend/src/worktree-manager.ts` — create/remove/prune
- `backend/src/git-ops.ts` — branches, checkout, pull, commit-with-AI, **Cursor-style review** (`acceptFile`, `acceptHunk`, `revertHunk`, `discardFile`, `readFileContents`)
- `backend/src/file-diff.ts` — `/file/diff` with `vsIndex` param (working tree vs index | HEAD)
- `frontend/src/components/BranchPicker.tsx` — UI with dirty-changes dialog
- `frontend/src/components/CommitWithAI.tsx` — `claude -p` suggests → preview → commit (clears `review.clearAll()` on success)

### Cursor-style review (post-edit)
- `frontend/src/hooks/useReviewState.ts` — `Map<bubbleId, {[path]: acceptedAt: timestamp}>` persisted to localStorage. Auto-migrates old boolean format.
- `frontend/src/components/DiffViewer.tsx` — exports `DiffPane` (inline, no overlay) + `DiffViewer` (modal wrapper). Toolbar review + "New / All" toggle (`vsIndex` true/false) + per-hunk buttons.
- `frontend/src/components/GitPanel/ChangesView.tsx` — file list with amber/green dots driven by `git status --porcelain` (`unstaged` field), pending banner with "Accept all", inline expandable diff per file. Includes `CommitWithAI`.
- `frontend/src/hooks/useGitChanges.ts` — global cache per (workspace, bubbleId) that survives unmount; snapshot + background revalidate. Polling 4 s + listens to `eco:git_refresh`.
- Setting: `eco.agent.review_mode` (default OFF, opt-in in Settings → General).
- Endpoints: `POST /file/{accept,accept-hunk,revert-hunk,discard,contents}`.

### Git tab (GitHub Desktop-style layout)
- `frontend/src/components/GitPanel/GitPanel.tsx` — tab container. Vertical layout: `GitTopBar` → sub-nav (Changes | History | PRs) → `OpInProgressBanner` → content. Active sub-tab persisted in `eco.git.subtab.<bubbleId>` (default `changes`); auto-migrates legacy `branches` → `changes`.
- `frontend/src/components/GitPanel/GitTopBar.tsx` — top bar. Three blocks: (1) **Branch chip + dropdown** searchable with Local/Remote tabs; (2) **Sync button** (`Publish`/`Push`/`Pull`/`Sync`/`Fetch` depending on state); (3) **"⋯" menu** with Merge, Rename, View PRs, Use branch name as agent name.
- `frontend/src/components/GitPanel/ChangesView.tsx` — master/detail: compact file list left (~300 px) + sticky `CommitWithAI` at bottom; persistent diff right.
- `frontend/src/components/GitPanel/HistoryView.tsx` + `CommitDetailPanel.tsx` — paginated log + per-commit Cherry-pick / Revert / Reset (hard requires typing `HARD RESET`) / Copy SHA.
- `frontend/src/components/GitPanel/PRsView.tsx` — `PullRequestsList` in wide layout.
- `frontend/src/components/GitPanel/OpInProgressBanner.tsx` — detects cherry-pick/merge/revert via `useGitOpStatus`; Continue/Abort/"Resolve in Changes".
- `frontend/src/components/GitMiniDock.tsx` — compact right-sidebar shortcut in non-Git tabs: branch chip + ahead/behind + quick commit + push + `CurrentPrBanner`.
- `frontend/src/components/GitBusyToast.tsx` — floating toast for in-flight git ops; listens to `eco:git_busy { bubbleId, busy, kind, label }`; clears on matching `kind` end.
- Hooks: `useGitLog`, `useGitOpStatus` (with `peekOpStatus` sync getter for Dashboard), `useBranches`.
- Backend: `backend/src/git-history.ts` (log/show), `git-ops-advanced.ts` (cherry-pick/merge/revert/reset/abort/continue/opStatus). Endpoints: `GET /git/{log,show,op-status}`, `POST /git/{cherry-pick,merge,revert,reset,abort,continue}`.
- Validation: SHA via hex 4–40; branch/tag name without shell metacharacters. Reset hard pre-checks lost commits with `rev-list --count` → `code: 'reset.would_lose_commits'` if > 0, proceeds only with `force: true`.
- Op-in-progress detection: `git rev-parse --git-dir` resolves the real `.git` path (in worktrees it's a file, not a dir), then `existsSync(CHERRY_PICK_HEAD|MERGE_HEAD|REVERT_HEAD)`.

### FilesPanel
- `frontend/src/components/FilesPanel/{FilesPanel,FileEditor,FileTree,FileTreeNode,QuickOpen,GlobalSearch}.tsx`
- `frontend/src/components/FilesPanel/{cm-extensions,cm-theme,bracket-colors,lang-loader,file-icon}.ts(x)` — editor extensions, fixed IDE syntax palette, rainbow brackets, lazy lang packs, file-type icons.
- `backend/src/fs-{tree,search,paths}.ts` — `fs-search.ts` resolves the bundled ripgrep via `platform.ts:resolveRipgrepPath()` and supports `wholeWord` (`--word-regexp`).
- Tree virtualized with `@tanstack/react-virtual`; indent guides via `@replit/codemirror-indentation-markers`.
- Find usages (Cmd/Ctrl+click, Shift+F12) reuses Global Search with whole-word; scroll-to-path via `eco:files:reveal_path` (eco-bus). Editor: CodeMirror 6.

### NotesPanel
- `frontend/src/components/NotesPanel/{NotesPanel,NotesList,NoteEditor}.tsx`
- `backend/src/notes-summary.ts`

### Archiving
- `frontend/src/screens/ArchivedScreen.tsx`
- `frontend/src/hooks/useBubbles.ts` (archived/archivedAt flags)
- `backend/src/index.ts` `POST /bubble/archive`

### GitHub PAT
- `backend/src/github-credentials-store.ts` (`~/.eco/github.json` chmod 600)
- `backend/src/github-runtime.ts` (env injection)
- `frontend/src/hooks/useGithubCredentials.ts`
- `backend/src/index.ts` `GET/POST/DELETE /config/github`

### Claude SDK
- `backend/src/agent.ts` — Claude Agent SDK wrapper
- `backend/src/agent-tools.ts` — own MCP tools (open_bubble, rename_bubble, close_bubble)
- `backend/src/ws-server.ts` — `/ws` with snapshot providers
- `frontend/src/hooks/useEcoSocket.ts` — WS client with reconnect backoff

### PTY (real terminal)
- `backend/src/pty-server.ts` — `/ws/pty`, persistent sessions with 128 KB replay
- `frontend/src/components/RealTerminal.tsx` — xterm.js wired

### Obsidian
- `backend/src/obsidian.ts` — save-session, vault detection
- `backend/src/index.ts` `/integrations/obsidian/save-session`

### MCP Server (Claude Code)
- `mcp-server/` — paquete standalone que se bundlea en el .dmg (ver §C)
- `backend/src/mcp-config.ts` — resolve path + install/uninstall vía `claude mcp`
- `backend/src/index.ts` `GET/POST/DELETE /config/mcp`
- `frontend/src/hooks/useMcpConfig.ts`
- `frontend/src/screens/Settings.tsx` `McpCard` (en `SectionIntegrations`)
- `electron/scripts/prepare-mcp.cjs` — build pre-empaquetado (tsc + prune dev deps)

### Dashboard
- `frontend/src/screens/Dashboard.tsx` — grid + kanban + graph views, satellite pulses. **Toggle admin "Mis agentes / Todos los usuarios"** (`eco.dashboard.scope`, solo admin): en modo "todos" las 3 vistas usan `teamBubbles` (de `useTeamBubbles`, `components/AdminGraph.tsx`) — grilla agrupada por dueño, kanban con badge de dueño, graph en `groupMode="owner"`; agentes ajenos read-only y clic inerte. Tarjetas ajenas usan `lastMsgPreview`+`categoryIds` (no tienen `messages`).
- `frontend/src/components/AdminGraph.tsx` — `useTeamBubbles(ownBubbles, userId, enabled)`: combina bubbles propias (reales) + ajenas sintetizadas de `/admin/overview` (poll 5 s), con `ownerNames`.

---

<a id="storage"></a>
## 5. Processes & storage

### Processes in the packaged .app

```
Eco.app (electron main, main.cjs)
 ├─ Eco Helper (GPU)
 ├─ Eco Helper (Renderer)        ← loads frontend/dist via http://127.0.0.1:7100/
 └─ Eco backend/dist/index.js    ← Node backend (Electron binary as Node via ELECTRON_RUN_AS_NODE=1)
     ├─ spawn claude  (one per agent, when there's a prompt)
     ├─ spawn zsh PTY (one per agent)
     └─ spawn dev-server bash (one or two per agent in dual mode)
```

Backend lives in `Resources/backend/dist/`. Frontend static bundle in `Resources/frontend/dist/`. Swift CLI in `Resources/bin/eco-stt`.

### Disk state (chmod 600)

> **El estado de la app NO vive en disco** — vive en **Firestore** (users/role, bubbles+messages, categories, notes, review, prefs, auditLog). El backend local solo persiste lo operativo/de cómputo + credenciales:

| Path | Contents |
|---|---|
| `~/.eco/token` | 32 B token de máquina (solo para procesos MCP stdio; ver Appendix C/D) |
| `~/.eco/users/<uid>/github.json` | GitHub PAT por usuario (indexado por uid de Firebase) |
| `~/.eco/workspace-config.json` | Config por workspace (admin): `{ [ws]: { server, baseBranches } }` |
| `~/.eco/api-key` | Optional Anthropic API key (global, compartida) |
| `~/.eco/dev-sessions.<port>.json` | `[{bubbleId, role, pgid, port, command, ...}]` — namespaced by backend port (7050/7100/7200) so parallel backends don't clobber each other. |
| `~/.eco/obsidian.json` | `{vaultPath, enabled}` |
| `~/.eco/backup.json` | `{enabled, folder?, retention, lastBackup?, lastError?}` — config del auto-backup (cada 2h, retención 30) |
| `~/.eco/worktrees/<bubbleId>` | Per-agent git worktree |
| **legacy** `~/.eco/users/index.json` + `~/.eco/users/<id>/user.json` | Registro de usuarios local argon2id/BIP39 — **inerte** (solo fallback PIN / migración). |
| **legacy** `~/.eco/users/<id>/docs/<key>.json` | Doc-store local — **legacy**; la autoridad es Firestore. Solo se lee en la migración one-time (`ensureMigrated`). |
| **legacy** `~/.eco/audit-log.jsonl` (+ `.1.jsonl`) | Bitácora local append-only — **legacy**; la auditoría viva es la colección `auditLog` de Firestore (la lee el admin). |

**Firebase config (en el repo, no en `~/.eco`):** `firestore.rules` (autorización), `firestore.indexes.json` (índices compuestos: bubbles, categories, auditLog), `firebase.json` (emuladores), `.firebaserc` (project id `aditum-eco`).

### Frontend localStorage

All keys use prefix `eco.`. Maintain this prefix when adding new keys:

```
eco.lock.pin.<uid>                       ← hash SHA-256 del PIN de lock por usuario (lib/lock-pin.ts)
eco.lockedUser                           ← uid/email recordado por el lock screen (pide solo PIN)
eco.onboarded                            ← '1' once the wizard finished
# Firebase maneja la sesión (ID token en IndexedDB del SDK); NO hay eco.session/eco.token/eco.refresh.
eco.detail.tab.<bubbleId>                ← last active tab (chat|terminal|git|plan|browser|server|files|notes). 'files' legacy maps to 'git' on read.
eco.git.subtab.<bubbleId>                ← Git sub-tab (changes|history|prs); legacy 'branches' auto-migrates to 'changes'.
eco.git.splitter.{changes,history}.<bubbleId>  ← left column width
eco.terminals.<bubbleId>                 ← extra terminals (no Claude) [{id,label}]
eco.terminals.active.<bubbleId>          ← active terminal id in Shell tab
eco.browser.url.<bubbleId>               ← BrowserPanel URL
eco.browser.zoom.<bubbleId>              ← zoom (0.25..3)
eco.dev.config_collapsed.<bubbleId>      ← '1' collapsed (default true)
eco.dev.min.<role>.<bubbleId>            ← '1' minimized in dual
eco.dev.logheight.<bubbleId>.<role>      ← log pane height in px
eco.dev.restartmode.<bubbleId>           ← 'both'|'frontend'|'backend' for global restart in dual
eco.dev.presets                          ← user-defined global presets
eco.dev.presets.hidden                   ← built-ins hidden by user
eco.remote.<bubbleId>                    ← slug if remote control active
eco.skills.favorites                     ← Skills favorites
eco.skills.fav_collapsed                 ← '1' if Skills favorites collapsed
eco.bubbles.v1                           ← bubble state CACHE (autoridad = Firestore `bubbles/*` + subcol `messages`); se reemplaza al loguear
eco.categories                           ← categories CACHE (autoridad = Firestore `categories/<uid>`)
eco.graph.{spread_nodes,spread_ws,scale,ws_offsets,agent_offsets,fullscreen}  ← graph view tuning
eco.files.openTabs.<bubbleId>            ← FilesPanel: open file tabs
eco.files.activeFile.<bubbleId>          ← active file
eco.files.expanded.<bubbleId>            ← expanded dirs
eco.files.splitter.<bubbleId>            ← tree/editor splitter
eco.notes.splitter.<bubbleId>            ← NotesPanel list/editor splitter
eco.notes.preview.<bubbleId>             ← preview mode toggle
eco.review.accepted.<bubbleId>           ← {[path]: acceptedAt timestamp}
eco.agent.review_mode                    ← '1' to enable Cursor-style review
```

### Self-origin allowlist

The backend auto-adds its own `http://127.0.0.1:<port>` and `http://localhost:<port>` to `allowedOrigins`. The packaged .app's renderer loads from the same origin as the backend, so CORS never engages.

### Memory caps

These were tuned in 2026-05-12/13 after observing renderer growth to 1–2 GB with 5 active bubbles. Do NOT loosen without a very strong reason — you'll re-introduce the leaks.

| Structure | Cap | File | Why |
|---|---|---|---|
| `bubble.messages` in memory | **300** msgs | `useBubbles.ts:appendMessage` | Renderer doesn't accumulate history forever. |
| `bubble.messages` in localStorage | **100** msgs | `useBubbles.ts:persist` | Quota ~5–10 MB. |
| `toolCall.output` in localStorage | **10 KB** + marker | `useBubbles.ts:thinMessageForStorage` | A single Read tool can be megabytes. |
| `serverLogs` (BrowserPanel) | **200 KB** | `BrowserPanel.tsx:SERVER_LOGS_MAX` | Noisy frameworks generate MBs. |
| `devLog` (DevTools console) | **200** entries | `BrowserPanel.tsx:DEVLOG_MAX` | Grows infinite otherwise. |
| xterm `scrollback` (Server) | **10 000** lines | `ServerPanel.tsx:TerminalLogs` | xterm is the ONLY log buffer (no React string copy — the old `slot.logs` cap is gone). Raised from 1 500 (2026-06): big stack traces pushed the original error out before the user could read it. Memory only while the Server tab is mounted. |
| xterm `scrollback` (Shell) | **2 000** lines | `RealTerminal.tsx` | |
| `s.output` ring buffer | **1 MB** (`BUFFER_MAX`) | `dev-server.ts` | Replayed via `GET /dev/logs` on panel remount; **freed on stop**. NOT persisted to disk (`persistSessions` skips `output`). Raised from 64 KB (2026-06) so large errors survive a tab switch. |
| PTY ring buffer | **128 KB** (`RING_BUFFER_MAX`) | `pty-server.ts` | Replay on reconnect. |
| `globalPromptTimestamps` | **1000** | `ws-server.ts` | Defensive cap. |
| `RAW_MAX_SIZE` (file/raw) | **5 MB** | `index.ts` | Inline image preview / raw read. |
| `AUDIT_MAX_BYTES` (audit log) | **5 MB** | `audit-log.ts` | Bitácora append-only; al superarlo rota a `.1.jsonl` (una generación, sin historia infinita). |
| File diff bytes | **512 KB** | `file-diff.ts`, `git-history.ts` | UI can't render bigger diffs usefully. |
| FS tree entries per scan | **5000** | `fs-tree.ts:MAX_ENTRIES` | Lazy-loaded; cap protects huge repos. |
| Notes summarizer context | **30 msgs**, **2 KB**/msg, **60 KB** PTY | `notes-summary.ts` | Keep prompt under Claude limits. |
| Notes summarizer timeout | **90 s** | `notes-summary.ts` | Long enough for Sonnet, short enough to fail loud. |

**Cap-on-append pattern** — always slice on concat, never use a separate truncate effect (race conditions with setState):

```ts
setSlots((prev) => ({
  ...prev,
  [role]: { ...prev[role], logs: (prev[role].logs + e.chunk).slice(-LOGS_MAX) },
}));
```

**Pause animations when hidden**: `App.tsx` toggles `eco-hidden` class on `<body>` reacting to `visibilitychange`. CSS in `index.css` applies `animation-play-state: paused !important` to the whole tree. Don't add a second pause mechanism for new costly animations — rely on this global toggle. Exception: animations that should keep running while the user IS looking (file-upload spinner, etc.) don't need a pause carve-out — they only animate during foreground anyway.

**Cleanup at bubble close — what leaks if it breaks**:

If `removeBubble` (`useBubbles.ts`) skips either step (`POST /bubble/close` OR localStorage prefix cleanup):

- **In memory**: `sessions` Map + ring buffers + PTY handles in dev-server.ts stay alive.
- **On disk**: entries in `~/.eco/dev-sessions.json` accumulate; worktrees in `~/.eco/worktrees/<bubbleId>` are not removed.
- **In localStorage**: orphan keys with the closed bubble's id (`eco.detail.tab.<id>`, `eco.browser.url.<id>`, `eco.dev.cmd.<id>.*`, `eco.files.*.<id>`, `eco.notes.*.<id>`, `eco.review.accepted.<id>`, etc.) pile up forever.

If you add a new `eco.*.${bubbleId}` key, add its prefix to the cleanup list in `useBubbles.removeBubble`.

---

<a id="ws"></a>
## 6. WebSocket protocol

### `/ws` (Claude SDK + dev status)

Auth via subprotocol: **`eco.idtoken.<jwt>`** (Firebase ID token). `verifyClient` (`ws-server.ts`) verifica el token con `verifyFirebaseIdToken`, rechaza con 401 si falla, y deja el uid en `req.ecoUid` (la identidad de la conexión). El viejo `eco.token.<bearer>`/`eco.session.<id>` es legacy.

**Client → server** (`ClientMessageSchema` in `backend/src/protocol.ts`):
- `{type:'prompt', bubbleId, workspace, text, resumeSessionId?}` — send prompt
- `{type:'interrupt'}` — cancel stream + tool in flight

**Server → client**:
- `{type:'sdk_message', message}` — passthrough from Claude Agent SDK
- `{type:'session_started', sessionId}` — first SDK response
- `{type:'done'}` — agent finished this turn
- `{type:'error', code, message}` — typed error
- `{type:'pty_status', bubbleId, running}` — PTY open/closed
- `{type:'dev_status', bubbleId, role, status, port, url, command, exitCode, skill?}` — dev server state change
- `{type:'dev_log', bubbleId, role, chunk}` — dev server stdout/stderr batched every 80 ms
- `{type:'client_action', action}` — own MCP tool asking the client to act
- **legacy** `{type:'doc_updated', key, value, updatedAt}` / `{type:'doc_deleted', key}` — push del doc-store local a otros dispositivos (`broadcastToUser`). Reemplazado por la sincronización directa de Firestore; solo sobrevive para la migración one-time.

### `/ws/pty` (interactive terminal)

Auth same (`eco.idtoken.<jwt>`). Subprotocol with `bubbleId` + `workspace` query.

- Client → server: `{type:'data', data}` (input), `{type:'resize', cols, rows}`
- Server → client: `{type:'data', data}`, `{type:'snapshot', data}` (128 KB replay on reconnect), `{type:'closed', exitCode}`

### Snapshot providers

`ws-server.ts:registerSnapshotProvider(fn)` — any module can register a provider that runs on a new WS connection and replays events so the new client starts in sync. `dev-server.ts` uses this to replay `dev_status` for every live session.

---

<a id="voice"></a>
## 7. Voice pipeline (terminal dictation only)

This is the ONLY voice feature. The mic runs ONLY while dictation is active (the "Hablar a la terminal" button → `startTerminalDictation` → `voice.start()`). There is no wake word, no always-on listening, no chat routing and no voice commands — `useVoice` just calls `onPhrase`, which appends to the dictation buffer.

### Browser mode (`npm run web` in Chrome/Safari)

- `window.SpeechRecognition` (Web Speech API). Chrome supplies the Google API key.
- `useVoice` starts a `SpeechRecognition` with `continuous=true, interimResults=true` for the duration of the dictation.

### .dmg mode

Web Speech doesn't work (Chromium-Electron has no Google API key → start/end loop). Explicitly disabled via `isElectron` check.

**Own pipeline in .dmg:**

1. `getUserMedia({audio:true})` — macOS asks for **Microphone** and **Speech Recognition** on first run (2 prompts).
2. `AudioContext` + `MediaStreamAudioSourceNode` + `ScriptProcessor` (bufSize 4096) → captures Float32 PCM at native rate.
3. Resample native → 16 kHz mono. If `nativeRate ≥ 32k`, 3-tap anti-alias before decimation.
4. **Adaptive VAD** per 50 ms frame (800 samples). States `idle | recording`:
   - `idle`: RMS → smoothed EMA noise floor (`noiseFloor = 0.95·prev + 0.05·rms`). 300 ms pre-roll buffer. Trigger when `rms > max(0.01, noiseFloor·3)` → switch to `recording` and prepend the pre-roll.
   - `recording`: accumulate; count consecutive silent frames; close phrase after **700 ms** silence or at the **8 s** cap; drop phrases <400 ms.
5. On phrase close: trim trailing 700 ms (silence), `encodeWav()` → WAV PCM16 mono 16 kHz, POST.
6. `apiFetch('/voice/transcribe-blob', { body: blob, headers: 'Content-Type': 'audio/wav' })`.
7. Backend writes `/tmp/eco-stt-<uniq>.wav`, spawns `eco-stt /tmp/... es-MX`.
8. Swift CLI: `SFSpeechURLRecognitionRequest`, `requiresOnDeviceRecognition = true`, `recognitionTask` callback that stops `CFRunLoop`.
9. stdout → backend → `{ok:true, text}` → renderer → `onPhraseRef.current(text)`.

Effective latency: ~700 ms after you stop talking. Pre-roll catches the attack of the phrase; adaptive noise floor handles noisy rooms without calibration. Dictation uses the long-form VAD tolerance (`isLongForm` always true).

### Gotchas

- **`MediaRecorder` is NOT viable.** Chromium 130 emits webm/opus (or unstable audio/mp4). macOS `AVFoundation` can't decode webm/opus. We use **raw PCM + manual WAV** instead. If anyone suggests MediaRecorder again, say no.
- **`CFRunLoop` is required in the Swift CLI.** `SFSpeechRecognizer.recognitionTask` delivers callbacks that need an active run loop. `DispatchSemaphore.wait()` blocks the loop → callbacks never fire → silent timeout. Correct pattern:
  ```swift
  while !done && Date() < deadline {
    CFRunLoopRunInMode(.defaultMode, 0.5, true)
  }
  ```
- **`__dirname` doesn't exist in ESM.** Backend is ESM. For module path:
  ```ts
  const moduleDir = path.dirname(new URL(import.meta.url).pathname);
  ```
- **`setPermissionRequestHandler` in main.cjs unblocks the macOS prompt.** Without it, Chromium auto-rejects `getUserMedia`. We grant `media`, `audioCapture`, `videoCapture`, `microphone`, `clipboard-read`, `clipboard-sanitized-write`.
- **`NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription`** in `mac.extendInfo` of `electron/package.json`. Without them, macOS terminates the process when asking permission.
- **Apple Speech works without code-signing.** `hardenedRuntime: false` + `identity: null` is fine for personal use. To distribute, sign + notarize.

### Reset permissions when debugging

```bash
tccutil reset Microphone com.aditum.eco
tccutil reset SpeechRecognition com.aditum.eco
```

Then relaunch Eco.app — next `getUserMedia` re-prompts.

### Rebuild the Swift CLI

```bash
./electron/native/build.sh
```

Output: `electron/build/bin/eco-stt` (universal arm64+x64, ~150 KB). Run this whenever you modify `eco-stt.swift`, BEFORE `npm run dmg`.

---

<a id="serverpanel"></a>
## 8. ServerPanel — dev server per agent

**Server** tab in each conversation. Manages gulp/vite/spring-boot/etc. inside the agent's worktree.

> **Multi-tenant: el panel es solo-consumo.** Los comandos y el modo single/dual los
> define el **admin por workspace** en Settings → Folders (server-authoritative, ver
> Appendix D → "Config de server por workspace"). El ServerPanel de cada burbuja
> muestra el comando **read-only** y solo deja **Iniciar / Detener / Reiniciar** — el
> member no edita comandos. Si el workspace no tiene server configurado, muestra
> "pedile al admin". `dual` y los comandos vienen de `useWorkspaceServerDefaults`
> (que ahora lee del store de `lib/workspace-config.ts`, no de localStorage).

### Single vs dual

- **Single** (default): one `main` slot. One-process projects.
- **Dual**: `frontend` + `backend` slots in parallel. Full-stack. Lo define la config del workspace (admin), no un toggle por bubble.

### Auto-port

Each slot gets a free random port via `net.createServer().listen(0)` at start (`startDevServer`). Injected as env vars covering most frameworks:

**Backend slot:**
```
PORT, SERVER_PORT, HTTP_PORT
JAVA_TOOL_OPTIONS=-Dserver.port=<port>
VITE_PORT, NEXT_PUBLIC_PORT
BROWSER_SYNC_PORT, GULP_PORT, WEBPACK_DEV_SERVER_PORT
```

**Frontend slot (dual)** — all of the above for its own port **plus** the backend URL:
```
API_PORT, BACKEND_PORT, BACKEND_URL
VITE_API_PORT, NEXT_PUBLIC_API_PORT
```

**Rule for the user**: commands MUST NOT hardcode ports.

```bash
# OK — Eco supplies server.port via JAVA_TOOL_OPTIONS or SERVER_PORT
./mvnw spring-boot:run
gulp serve

# BAD — hardcodes; Eco can't override
./mvnw spring-boot:run -Dserver.port=8081
API_PORT=8080 gulp serve
```

### Start order in dual

`runAllAction('up')` in `ServerPanel.tsx`:
1. Start backend slot.
2. `waitForRoleRunning('backend', 90_000)` — wait for `dev_status: running`.
3. Then start frontend slot.

Avoids ECONNREFUSED of the frontend proxy while the backend is still binding. `down` and `restart` run in parallel.

### Config por workspace (server-authoritative)

`useWorkspaceServerDefaults(workspace)` ahora lee del store server-side (`lib/workspace-config.ts` → `GET /workspace-config`), NO de localStorage. La define el **admin** en Settings → Folders (`WorkspaceServerConfigField`): single/dual + comando(s), guardado vía `POST /workspace-config` (`requireAdmin`). Todas las burbujas de ese workspace heredan esos comandos. Ver Appendix D.

### Persistence + re-adopt

Each status change writes `~/.eco/dev-sessions.json` (via `persistSessions()` in `broadcastStatus`). On backend boot, `restoreSessions()`:
1. Read the JSON.
2. For each session, `process.kill(pgid, 0)` (signal 0 = no-op, only tests).
3. If alive → re-adopt with status `running`, print `[server re-adopted from previous session — old logs unavailable]`.
4. If dead → discard.

> **Known limitation**: the old log buffer is lost. Can't re-attach stdout of a detached process already running. User can stop/restart anyway.

### Endpoints

```
POST  /dev/start    {workspace, bubbleId, command, role}
POST  /dev/stop     {bubbleId, role}
POST  /dev/restart  {bubbleId, role}
GET   /dev/status?bubbleId=<id>&role=<role>
GET   /dev/logs?bubbleId=<id>&role=<role>     (ring buffer 64 KB)
GET   /dev/active                              (ALL live sessions)
```

`/dev/active` is used by `Dashboard.tsx` on mount to seed the "server active" indicator on each node.

### "Ready" detection

`READY_RE` in `dev-server.ts:244` matches patterns indicating bind: `Local: https?://...`, `listening on`, `ready in N`, `Started Server on port`, `[Browsersync] Access URLs|Running|...`, `Finished 'serve'|'default'|'watch'` (gulp), etc. If a new framework doesn't match, add the pattern.

### Port conflict + auto-repair

If the output contains `EADDRINUSE` (`PORT_CONFLICT_RE`), the backend retries up to 2 times (`MAX_RETRIES`), asking Claude (`repairPortHardcode`) to patch the config to use `process.env.PORT`.

> **Spring Boot DevTools false conflict** (`-Dspring.devtools.restart.enabled=false`, always injected): DevTools does an in-process restart (`restartedMain` thread) that re-binds the port before releasing the old one → "Port X is already in use" that is NOT a real conflict. Without the flag, `PORT_CONFLICT_RE` matched it, killed the process (`SIGTERM`, exit 143) and looped into `repairPortHardcode` — which also corrupted the JVM's MySQL/Liquibase connection. Under Eco the DevTools live-reload adds nothing (restart is manual from the panel).

---

<a id="browserpanel"></a>
## 9. BrowserPanel — webview per agent

**Browser** tab in each conversation. **One per agent** — the global browser was removed.

### Persistent webview

`SmartBrowserView` creates the `<webview>` **ONCE** on mount (`useEffect` deps `[useWebview]` WITHOUT src). When src changes, it navigates via `setAttribute('src', newUrl)` on the existing webview. No destroy+recreate → no flicker.

### Trap we already hit

If you pass inline callbacks as props, React re-creates them every render → if you include them in the webview's useEffect deps → infinite unmount/mount → constant reload.

**Fix**: store callbacks in a `cbRef` updated in its own useEffect, do NOT include them in the webview-creation effect's deps.

```tsx
const cbRef = useRef({ onTitleChange, onNavigate, onLoadFail, onLoadSuccess });
useEffect(() => {
  cbRef.current = { onTitleChange, onNavigate, onLoadFail, onLoadSuccess };
}, [onTitleChange, onNavigate, onLoadFail, onLoadSuccess]);

useEffect(() => {
  // ... create webview, use cbRef.current.onTitleChange?.(...)
}, [useWebview]);   // do NOT include callbacks here
```

### Auto-navigation when a dev server starts

`BrowserPanel.tsx` listens to `eco:dev_status`. When `status==='running' && url && lastAutoNavRef.current !== url`, it navigates. `lastAutoNavRef` resets only on `stopped` or `error` — without this, repeated pushes with the same URL would reload.

> **ServerPanel does NOT emit `eco:browser_navigate`** from its `dev_status` listener — that caused reload loops. It DOES emit on explicit user click of the URL pill or "open in Eco" button.

### Persisted zoom

`eco.browser.zoom.<bubbleId>` (0.25..3). The write is **inline** in `setZoom` (wraps `setZoomState`), NOT via useEffect — avoids HMR/unmount timing.

---

<a id="gittab"></a>
## 10. Git tab — changes, history, PRs, review

See §4 "Git tab" for the full file list. Highlights:

- **Top bar** owns the current branch and ahead/behind. The legacy "Branches" sub-tab is gone — switching lives in the dropdown.
- **Changes**: amber/green dots from `git status --porcelain` (the `unstaged` field is absolute truth, NOT `acceptedAt` from localStorage). Inline diff per file (no modal). The diff renders with **`@codemirror/merge` MergeView** (split-view side-by-side, sync scroll, full file with diffs highlighted) when the backend returns `before`/`after` (default — `withFullContent: true` in `/file/diff`); falls back to the legacy custom hunk-table renderer if not. Header toggle "Vista compacta / Archivo completo" switches `collapseUnchanged: { margin: 3, minSize: 4 }` on/off. Per-chunk navigation toolbar (◀ Chunk X/Y ▶) + Accept/Reject buttons in review mode hit `/file/accept-hunk` / `/file/revert-hunk`. Sticky `CommitWithAI` at the bottom.
- **History**: paginated log + per-commit cherry-pick / revert / reset (hard requires typing `HARD RESET`).
- **PRs**: list + checkout. `CurrentPrBanner` appears in `GitMiniDock` when the branch has an open PR. **Requires `gh` (GitHub CLI) installed** on the host (`brew install gh`); without it, every PR endpoint returns `code: 'pr.gh_missing'`. The GitHub PAT (§14) is injected as `GH_TOKEN` so `gh` authenticates without `gh auth login`, but it does NOT replace the `gh` binary.
- **GitMiniDock** (right rail in non-Git tabs): branch chip + ahead/behind + quick commit + push + `CurrentPrBanner`.
- **GitBusyToast**: floating toast for in-flight ops; listens to `eco:git_busy { bubbleId, busy, kind, label }`; clears only when matching `kind` ends (FIFO if two ops overlap).

### Cursor-style review

Setting `eco.agent.review_mode` (opt-in, default OFF) switches to "agent edits freely → user reviews after":

- Agent never paused; `permissionMode` stays `acceptEdits` with only workspace-bounds gate.
- Persistent banner: `N pending changes — [Accept all]`.
- Amber dot on files with unstaged changes; green dot on accepted.
- Inline diff per file with per-hunk Accept/Revert.
- "New / All" toggle switches scope (working tree vs index | HEAD).
- Auto-invalidation: if the agent edits an accepted file again, `useReviewState` checks `bubble.messages` for `createdAt > acceptedAt` and demotes back to pending.
- `CommitWithAI` calls `review.clearAll()` on success.

State persists per bubble in `eco.review.accepted.<bubbleId>` as `{[path]: timestamp}`. Auto-migrates from the old boolean format.

> **WHY `git apply --cached` not a parallel staging area**: git already has a perfect staging area — the index. Accepting a hunk = `git apply --cached <patch>` against the index, without touching the working tree. `git diff` (no args) shows working-tree-vs-index → only unaccepted changes remain visible. On commit, `git add -A && git commit -F -` picks everything up. No parallel store, no sync logic, no scope creep. The only localStorage carried is `acceptedAt: timestamp` per path to detect agent re-edits.

> **WHY `discardFile` has 3 branches**: after review a file can be in 3 states:
> 1. **Tracked + modified vs HEAD**: `git checkout HEAD -- <path>`.
> 2. **Staged-but-new**: not in HEAD → `git rm -f -- <path>` (drops from index + fs).
> 3. **Untracked pure**: `unlinkSync` directly.
> Detection: `git cat-file -e HEAD:<path>` (HEAD) and `git ls-files --error-unmatch -- <path>` (index).

> **WHY the amber/green dot reads `git status --porcelain` and not just `acceptedAt`**: localStorage can lie — if `git add` failed or the agent edited again without the effect noticing, local would say "accepted" but git would still have unstaged changes. `accepted ∧ ¬hasUnstaged` closes the gap.

---

<a id="filespanel"></a>
## 11. FilesPanel — tree + editor

**Files** tab in each conversation. Mini-VS-Code inside the agent's worktree. Resizable split: tree left, tabbed editor right.

- **Lazy gitignore-aware tree**: backend uses `git ls-files --cached --others --exclude-standard` (fast, respects `.gitignore`) or a manual walker with `EXCLUDED_DIRS` if not a git repo. Cap **5000** entries per bubble (`MAX_ENTRIES` in `fs-tree.ts`). Expands on-demand on dir click. Toolbar: Expand all / Collapse all / Refresh.
  - **Virtualized**: `FileTree.tsx` flattens the expanded tree to a linear `{entry, depth}[]` row list and renders it with `@tanstack/react-virtual` (only viewport rows mount). `FileTreeNode.tsx` is a flat `React.memo` row (no recursion) — fluid with thousands of files. Because off-viewport nodes aren't in the DOM, scroll-to-path goes through the `eco:files:reveal_path` eco-bus event → `virtualizer.scrollToIndex` (not `querySelector`+`scrollIntoView`). File-type icons via `file-icon.tsx:FileTypeIcon`.
- **CodeMirror 6 editor**: ~138 KB gzip (+1.5 MB in .dmg, vs ~15 MB for Monaco). Eager syntax highlighting for TS/JS/JSON/CSS/HTML/MD; the rest lazy via `@codemirror/language-data`. Neutral background (pure black/white) so contrast holds across themes.
  - **IDE-style syntax**: `cm-theme.ts` ships a **fixed multi-color palette** (VSCode Dark+/Light+: `PALETTE_DARK`/`PALETTE_LIGHT`) — keywords violet, strings green, numbers orange, functions yellow, types teal — **independent of the theme accent** (the accent only tints the editor "chrome": cursor, selection, active line, brackets). Do NOT revert this to the old accent-tinted monochrome highlight.
  - **Indent guides** via `@replit/codemirror-indentation-markers` (colors from the accent). **Bracket-pair colorization** (rainbow brackets) via `bracket-colors.ts` — a `ViewPlugin` decorating brackets by nesting depth (classes `.eco-bracket-d0..d5`, palette `BRACKET_COLORS_DARK/LIGHT` in `cm-theme.ts`). Best-effort char-scan (doesn't skip strings/comments), viewport-only with a 150 KB seed cap.
  - **Breadcrumb** above the editor (`Breadcrumb` in `FileEditor.tsx`): segmented clickable path; folder segments call `onRevealDir` → `revealDir` in FilesPanel; last segment shows the file-type icon. Tabs also show the file-type icon.
- **Explicit save** with `Cmd+S` + dirty indicator. `POST /file/save` takes `expectedMtime` to detect conflicts. On conflict, the UI opens a Reload / Overwrite dialog.
- **Unstaged changes visible from the tree**: combines editor dirty + git status. Files in either state show amber; ancestor folders show a dimmed dot. On commit, dots clear.
- **Find-in-file** (`Cmd+F`, CodeMirror native) + **Quick Open** (`Cmd+P`, fuzzy filter over cached tree, `maxDepth=6` on first open; matched chars highlighted, file-type icons, recently-opened boost via `recentPaths`) + **Global Search** (`Cmd+Shift+F`, ripgrep with `grep -rn` POSIX fallback, 8 s timeout, 500 hits cap, 200 ms debounce, match highlighted in preview, click navigates to line/column).
- **Find usages** (textual, NOT semantic — there is no LSP): **Cmd/Ctrl+click** on a symbol, or **Shift+F12** with the cursor on it, grabs the word under cursor (`view.state.wordAt`) and opens Global Search seeded with that word + **whole-word** on (`onFindUsages` in FilesPanel → `searchSeed` → `GlobalSearch` `seed` prop). Whole-word uses ripgrep `--word-regexp` (`-w` for grep) — see the `wholeWord` flag on `/fs/search`. Finds the literal word everywhere (incl. comments/strings/homonyms); good for unique names, noisy for generic ones. Wired in `cm-extensions.ts` (`triggerFindUsages` + `domEventHandlers` mousedown + `Shift-F12` keymap).
- **Send to Claude**: text-selection floating button → switches to Terminal and types the snippet (path + fenced code) to the agent's PTY without trailing newline.
- **Image preview**: PNG/JPG/GIF/WEBP/SVG/ICO/BMP rendered inline via `GET /file/raw` (extension whitelist + **`RAW_MAX_SIZE` 5 MB** cap).
- **Deep-link from Git → Changes**: each row has "Open in Files" → switches tab, expands ancestors, scrolls, opens.
- **Open in IDE**: button "↗ VSCode/IntelliJ/Cursor/WebStorm" in the tabs toolbar opens the active file in the configured external IDE at the exact line of the cursor, via URI scheme (`vscode://file/<abs>:<line>:<col>`, `cursor://file/...`, `idea://open?file=...&line=...`). Setting at Settings → General → Editor externo (`auto` | `vscode` | `cursor` | `intellij` | `webstorm` | `none`). Helper in `frontend/src/lib/ide-uri.ts`. Bridge: `electronAPI.openExternal(url)` → `ipcMain.handle('eco:open-external')` → `shell.openExternal`. Browser fallback uses `window.open(uri, '_blank')` so the OS protocol handler triggers.

### Debugger: por qué NO

Eco does **NOT** ship a functional debugger (breakpoints, step-over, variable inspection). Rationale:

- A real debugger requires implementing the **Debug Adapter Protocol (DAP)** client (frontend), a server-side adapter relay (backend), and per-language debug adapters (Node `--inspect`, Java JDWP, Python debugpy, etc.).
- Plus a full debug UI: gutter breakpoints, scopes/variables panel, call stack panel, watch expressions, debug controls (continue / step-in / step-out / step-over / pause / restart).
- Estimated cost: **2000+ LOC** sustained + permanent maintenance per language adapter we want to support. Out of scope for Eco's roadmap.

**Functional alternative shipped**: the **"↗ IDE" button** in the FileEditor opens the active file in VSCode / IntelliJ / WebStorm / Cursor at the exact line, via URI scheme. The user sets real breakpoints in the external IDE — which already has a mature debugger for every language. This is a one-click bridge, not a half-baked in-house debugger.

If you ever consider re-evaluating, the integration points to know:
- `backend/src/dev-server.ts` spawns dev servers with `spawn()` — no `--inspect` / `-agentlib:jdwp` flags injected today. Would need a per-bubble setting + dynamic env vars.
- `backend/src/pty-server.ts` is unrelated (it's the interactive shell, not the runtime).
- `frontend/src/components/FilesPanel/cm-extensions.ts` is where a `gutterBreakpoints` extension would live if we ever add visual breakpoints.

### Endpoints

```
POST /fs/tree       {workspace, bubbleId, path, maxDepth}
POST /fs/search     {workspace, bubbleId, query, regex?, caseSensitive?, wholeWord?, includePattern?, maxResults?}
POST /file/contents {workspace, bubbleId, path}     (cap 512 KB)
POST /file/save     {workspace, bubbleId, path, content, expectedMtime}
GET  /file/raw      ?workspace&bubbleId&path        (5 MB cap, whitelist)
```

### Security

`resolveSafePath` in `fs-paths.ts` does `realpathSync` + workspace whitelist + path-traversal check on every endpoint that touches the filesystem. Symlink escapes blocked.

> **WHY relative paths in the tree**: `useGitChanges` returns absolute worktree paths. FilesPanel normalizes to worktree-relative so tree lookups match. The `gitCapture` helper guarantees this normalization for every git status / diff call. See §17.

---

<a id="notespanel"></a>
## 12. NotesPanel — notes + summarizer

**Notes** tab in each conversation. Per-bubble markdown notes with split list / editor view. Debounced autosave (400 ms) + sync flush on unmount.

- Each note has `createdAt` / `updatedAt`. Persisted in localStorage (bodies inline via `loadNotes()`).
- "Summarize" button: `POST /notes/summarize` → spawns `claude -p` with last 30 messages (each capped at 2 KB) + last 60 KB of the PTY ring buffer. ANSI stripped. **Timeout 90 s.** Output is a 3-section markdown: what we were doing / where we left off / next steps.

### Caps (`backend/src/notes-summary.ts`)

```
MAX_MESSAGES     = 30
MAX_TEXT_PER_MSG = 2000   // bytes
MAX_PTY_BUFFER   = 60_000 // bytes
TIMEOUT_MS       = 90_000
```

### Endpoint

```
POST /notes/summarize  {bubbleId, bubbleTitle, workspace, messages: SlimMessage[]}
```

### localStorage

```
eco.notes.splitter.<bubbleId>
eco.notes.preview.<bubbleId>
```

Plus note bodies stored inline per bubble.

> **WHY PTY direct from the ring buffer**: avoids round-tripping kilobytes through HTTP. The summarizer sees exactly what the user saw — including command output, exit codes, errors — without the frontend serializing it all.

> **WHY `claude -p` and not the SDK**: `claude -p` is a one-shot CLI invocation. The summary call shouldn't share session state with the agent (no context pollution, no risk of triggering tools). CLI is the cleanest isolation.

---

<a id="archiving"></a>
## 13. Archiving

Bubbles can be **archived** instead of deleted. Archiving:

- Sets `archived: true` and `archivedAt: <ISO timestamp>` on the bubble.
- Calls `closeBubbleResources(bubbleId, { keepWorktree: true })` — kills PTY + dev servers (all 3 roles) + `forgetSession` on the Map.
- **Keeps the worktree** at `~/.eco/worktrees/<bubbleId>` and the `eco/<short>` branch in the parent repo.

Restore: unarchive from `ArchivedScreen` → flip the flag, the bubble reappears in the Dashboard with its worktree intact.

Permanent delete: separate action in `ArchivedScreen`, also removes the worktree.

### Endpoint

```
POST /bubble/archive  {bubbleId}
```

### Files

- `frontend/src/screens/ArchivedScreen.tsx` — list + search (title/workspace) + unarchive / delete actions
- `frontend/src/hooks/useBubbles.ts` — `archived` / `archivedAt` flags, sort by `archivedAt` desc
- `backend/src/index.ts` `closeBubbleResources` with `keepWorktree` option

> **WHY keep the worktree**: archived ≠ deleted. The `eco/<short>` branch stays alive for later review or merge; restoring an archived bubble can resume mid-task without re-cloning state.

---

<a id="backup"></a>
## Backup & Restore

Settings → **Backup** (solo admin) permite exportar e importar el estado **local** de Eco a un `.zip`. Auto-backup **cada 2h, retención 30** configurable.

> **Nota (post-migración a Firestore):** el estado de la app (bubbles+mensajes, categorías, notas, review, prefs) **ya NO vive en `~/.eco/users/<id>/docs/`** — vive en **Firestore** y se respalda/exporta desde ahí. Lo que sigue describe el formato del zip que aún captura los archivos locales (token, api-key, workspace-config, github por usuario, worktrees); las referencias a `docs/<key>.json` con "bubbles+mensajes" son **legacy** (solo relevantes para restaurar un backup viejo, pre-Firestore).

### Qué se incluye en el .zip

```
eco-backup-YYYY-MM-DD-HHMM.zip
├── version.txt          ← "1"
├── metadata.json        ← localStorage (claves eco.* del navegador) + eco snapshot:
│                            archivos planos ~/.eco/*.json + api-key
│                            + users/** : index.json, <id>/user.json, <id>/github.json,
│                              y <id>/docs/<key>.json  ← bubbles+mensajes, categorías, notas, review
└── worktrees/<bubbleId>/
    ├── HEAD.txt         ← "branch\nsha"
    └── diff.patch       ← `git diff HEAD --binary` (vacío si limpio)
```

> **Multi-tenant**: el snapshot recorre un nivel de subcarpeta para capturar `users/<id>/docs/` — ahí vive el contenido real de cada usuario (estado cross-device). Sin eso, el backup quedaba **vacío de bubbles** (era un bug). `restoreEcoState` acepta rutas `<id>/docs/<key>.json` (3 segmentos) y el schema de `/backup/restore` acepta `eco.users` como objeto anidado.

**NO se incluye**: `~/.eco/token` (regenerable, security risk si el zip se filtra), archivos untracked de worktrees, `~/.claude/projects/*` (sesiones del CLI de Claude, viven fuera de Eco).

### Endpoints

```
POST /backup/snapshot    {bubbleIds?} → {eco, worktrees}
POST /backup/restore     {eco?, worktrees?} → {eco: {restored, errors}, worktrees: [{bubbleId, ok, warning?}]}
GET  /backup/config       → {enabled, folder?, retention, lastBackup?, lastError?}
POST /backup/config       → guarda + devuelve el config completo
DELETE /backup/config     → resetea a default disabled
```

### Files

- `backend/src/backup.ts` — `snapshotEcoState`, `restoreEcoState`, `collectWorktreeStates`, `applyWorktreeStates`, `readBackupConfig`/`writeBackupConfig`.
- `frontend/src/lib/backup.ts` — `collectLocalStorage`/`restoreLocalStorage`, `buildBackupZip`/`parseBackupZip` (fflate), `backupFilename`, `getElectronBackupAPI`, `u8ToBase64`/`base64ToU8`.
- `frontend/src/screens/Settings.tsx` `SectionBackup` — UI con cards: manual (export/import), auto-daily (toggle + folder picker + retention), info.
- `frontend/src/hooks/useBackupScheduler.ts` — montado en `App.tsx:Shell`. Cada 1h chequea config; si `enabled && now-lastBackup > 24h && !document.hidden`, dispara backup. Borra los más viejos según `retention`. Pausa con visibilitychange.
- `electron/main.cjs` + `electron/preload.cjs` — IPC handlers `eco:save-dialog`, `eco:open-dialog`, `eco:write-binary`, `eco:read-binary`, `eco:list-dir`, `eco:delete-file`. Allowlist bloquea `/System`, `/Library`, `/usr`, `/bin`, `/sbin`, `/etc`, `/private/etc`, `/private/var`, `~/.eco`.

### Restore flow

1. Frontend lee el zip vía `parseBackupZip` y muestra modal de confirmación (lista cantidades de claves localStorage / archivos eco / worktrees).
2. Si confirma: `POST /backup/restore` con `eco` + `worktrees`. Backend escribe los `~/.eco/*` (chmod 0o600) y aplica `git apply` por worktree (con `--check` previo para detectar conflicts — warnings por worktree que falló).
3. Renderer hace `restoreLocalStorage(metadata.localStorage)` (limpia eco.* excepto `eco.session`, escribe los del backup).
4. `window.location.reload()` para que todos los componentes lean state fresco.

### Retención rolling

Default 7. Configurable 7/14/30/90. El scheduler lista archivos del folder con `BACKUP_FILE_REGEX = /^eco-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/`, ordena descendente por mtime, borra todos los pasados el N.

> **WHY ZIP y no JSON puro**: el diff binario de worktrees (con `--binary`) puede ser grande. Comprimirlo en zip baja típicamente 10x. Además fflate trae una API más limpia que el manejo manual de Base64 que requeriría JSON.

> **WHY no incluimos el token**: si el zip se filtra (lo subís a Drive, te lo mandás por email), un atacante con acceso al zip + tu IP del backend podría auth. El user.json tiene PIN argon2id que sí es seguro de backupear.

---

<a id="githubpat"></a>
## 14. GitHub PAT

Personal Access Token stored locally for the agent's spawned processes (gh CLI, git push over HTTPS, PR listing).

> **The PAT is NOT a substitute for the `gh` CLI binary.** The PAT becomes `GH_TOKEN` in the env of every spawn, which lets `gh` (if installed) authenticate without `gh auth login`. If `gh` is not installed at all (`pr.gh_missing`), no PAT will fix it — install `gh` first (`brew install gh`).

### Storage

`~/.eco/github.json` (chmod 600) — `{pat, username, email, validatedAt}`. Validated **once** on save against `api.github.com/user`. Accepted prefixes: `ghp_`, `github_pat_`, `gho_`, `ghu_`, `ghs_`, `ghr_`.

### Env injection

`github-runtime.ts` injects into every spawned Claude / PTY / dev server:

```
GH_TOKEN, GITHUB_TOKEN
GIT_AUTHOR_NAME,  GIT_AUTHOR_EMAIL
GIT_COMMITTER_NAME, GIT_COMMITTER_EMAIL
```

### Endpoints

```
GET    /config/github   → {hasToken, username, email, maskedPat, validatedAt}
POST   /config/github   → validates + saves, may return {needEmail: true} if GitHub hides email
DELETE /config/github   → wipes ~/.eco/github.json
```

The frontend never sees the raw token after save — `maskedPat` is prefix + last 4.

### Hook

`useGithubCredentials` (status, username, email, maskedPat, validatedAt, error). Consumed by `Settings.tsx` (GitHub section) and `OnboardingWizard.tsx` (`StepGithub`).

> **WHY no re-validation per request**: PATs don't rotate often. Re-validating on every call would burn GitHub rate limit and add latency. The user can re-validate manually from Settings.

---

<a id="auth"></a>
## 15. Auth, workspaces, worktrees, onboarding

### Auth

> **Multi-tenant = Firebase Auth + Firestore**: el modelo completo (verificación del ID token,
> roles en Firestore, alta in-app, deshabilitar, bootstrap del primer admin) está en **Appendix D**.
> Resumen acá:

- **Identidad = Firebase Auth** (email/password). El frontend (`lib/firebase.ts`, `useAuth.ts`) obtiene el ID token y lo manda como `Authorization: Bearer <jwt>` (HTTP) y subprotocolo WS `eco.idtoken.<jwt>`.
- El backend **verifica el ID token stateless** (`firebase-auth.ts`, JWKS de Google, `jose`) → `req.ecoUser.id = uid`. NO autoriza: `requireAdmin` solo exige sesión válida; la autorización real son las **Firestore Security Rules**.
- **Rol** (`admin`/`member`) vive en Firestore `users/{uid}.role` (no es custom claim). El **primer admin** se promueve una vez con `npm run bootstrap:admin <email>` (firebase-admin). El admin da de alta a los demás **in-app** (`createUserAsAdmin` + doc Firestore); nadie se auto-promueve.
- **Lock screen**: el PIN local (`lib/lock-pin.ts`, SHA-256 por uid) bloquea/desbloquea una sesión Firebase viva en el dispositivo — es conveniencia, NO auth de cuenta. `eco.lockedUser` recuerda al último usuario.
- **Deshabilitar/habilitar** desde la consola admin (`users/{uid}.disabled` en Firestore). Reset de contraseña = `sendPasswordResetEmail` de Firebase.
- **Token de máquina** `~/.eco/token` sobrevive solo para procesos **MCP stdio** (allowlist chico; ver Appendix C/D).
- **Legacy/inerte:** PIN/argon2id/BIP39, sessions (`X-Eco-Session`/`X-Eco-Refresh`), `/auth/{register,login,claim,recover,session}` — código dormido, no es el camino vivo.

### Workspaces

Configured via `ECO_WORKSPACES` env or Settings → Folders. **The workspace must be a git repo** for worktree creation. Pointing at a parent directory (e.g. `~/Documents/GitHub` containing many repos) means Eco can't create a worktree and the agent's commands will fail.

> `frontend/src/hooks/useWorkspaces.ts` is a **module-level store + subscribers** (like `useCategories`), not per-instance. Adding a folder in Settings refreshes the list everywhere at once — including the "create agent" picker — with no app restart. Before this, each `useWorkspaces()` call fetched once on mount, so a new folder only showed after a relaunch.

### Worktrees

Each agent with a git workspace gets:
```
~/.eco/worktrees/<bubbleId>  ← worktree on branch eco/<short>
```

The Claude agent, PTY, `git status` polling, and `git diff` operate inside the worktree. Two agents on the same repo are isolated.

On bubble close: PTY dies, worktree is removed (`git worktree remove --force`), **the `eco/<short>` branch stays alive** in the parent repo to merge or review.

List orphan branches: `git -C <repo> branch | grep eco/`

### OnboardingWizard

`frontend/src/screens/OnboardingWizard.tsx` — modal with 8 linear steps:

1. Welcome
2. Language
3. Appearance (theme + accent)
4. Claude auth (CLI or API key)
5. GitHub (PAT optional)
6. Workspace folder
7. Obsidian vault (optional)
8. Done

Back/Next nav, each step optional. `eco.onboarded=1` flag prevents re-showing. Obsidian vault auto-detected when possible. (The old Voice step was removed along with the rest of the voice features.)

---

<a id="metacommands"></a>
## 16. Voice/text meta-commands — REMOVED

The whole meta-command system (wake word + `Eco …` navigation/agent/tab/server/confirm/obsidian voice commands, `meta-commands.ts`, `handleMetaAction`, `parseMetaCommand`, `CommandFeedback`, the `StatusOverlay` "estado/ayuda" overlay) was **removed**. Do NOT reintroduce it (see the Removed table in §2). There is no wake word and no typed-command parser. The only voice that remains is **terminal dictation** — see §7.

---

<a id="conventions"></a>
## 17. Conventions

### TypeScript

- **Strict mode always.** `tsc --noEmit` must pass before any build/PR.
- **No `any`** except `as unknown as ...` for intentional narrowing at boundaries.
- **Discriminated unions** preferred over `enum`.
- **Zod at boundaries** (POST body, query params).

### Modules

- **Backend ESM**: derive module paths with `fileURLToPath(import.meta.url)` (NOT `new URL(import.meta.url).pathname` — breaks on Windows); `.js` extensions in relative imports.
- **Frontend Vite ESM**: alias `@/...` for `src/`.
- **Electron CJS**: `main.cjs` and `preload.cjs` (the main process requires CJS).

### Errors

- `AppError` or `errResponse(res, status, code, message)` with a stable `code`.
- Frontend translates via `translateBackendError` in `backend-errors.ts`.
- Never leak stack traces to the client.

### React

- Hooks `useXxx` named consistently. One per feature.
- Inline JSX callbacks → `useCallback` only if passed to children that have them in deps.
- Callbacks that MUST NOT re-trigger effect remounts → store in refs (`onPhraseRef`, `cbRef`).
- Cross-component comms: **eco-bus** (`lib/eco-bus.ts` with `on`/`emit`) instead of prop drilling. Listeners that fire more events on receipt MUST guard against duplicates (last-url ref).

### Comments

- **No WHAT comments.** Identifiers say the WHAT.
- **Non-obvious WHY only**: workarounds, gotchas, decisions that would surprise a reader.
- **No task/PR/user references** in comments (those live in commits/PRs).
- **No multi-paragraph docstrings.** 1–2 lines max.
- **Keep comments fresh** or delete them.

### Security

- `realpathSync` + workspace whitelist + path-traversal check on every endpoint that touches the filesystem.
- Bash blacklist in `security.ts`. Spawned processes (PTY/dev-server/git/`claude -p`) inherit the **full user environment** via `buildSafeEnv` (passthrough + denylist of the `ECO_` prefix), so any installed toolchain (`JAVA_HOME`, NVM, pyenv, GOROOT, …) works in the terminals — an interactive PTY already grants a full shell, so an env allowlist added no real security and broke libraries. Only `PATH` is rewritten (augmented) and `extras` (git identity, API key) override last.
- Claude tools via explicit allowlist; MCP `mcp__*` permitted as configured by the user.
- Header `X-Eco-Client: 1` required. Minimal CSRF defense.
- Origin whitelist with auto-include of own origin.
- Rate limit per endpoint where applicable (`ECO_RATE_LIMIT`).

### `gitCapture` helper

`backend/src/index.ts:gitCapture(cwd, args, timeoutMs = 5000)` — wraps `git -C <cwd> <args>` with timeout + graceful error handling. Returns `{ok, out}`. Treats exit 0 OR 1 as `ok` (the 1 case covers `check-ignore` with no match — not an error). Use this instead of bare `spawn('git')` for any read-only git query in worktrees. Avoids PTY hangs in slow/big repos.

### i18n

Rule: any user-facing string MUST live in `frontend/src/lib/i18n.ts` (both `es` and `en`) and be consumed via `useT()`. No exceptions.

| Counts | Doesn't count |
|---|---|
| JSX text, `placeholder`, `title`, `aria-label`, `alt`, toasts, confirms, alerts, tooltips, fallback error messages | `console.*`, internal backend logs, IDs, paths, URLs, MIME types, event names, CSS class names, technical codes used as labels (`OPEN`, `MERGED`, `HARD RESET`) |

- Namespaces by feature: `git.*`, `commit.*`, `push.*`, `prs.*`, `branch.*`, `dock.*`, `browser.*`, `server.*`, `settings.*`, `dash.*`, `detail.*`, `time.*`, `common.*`, etc.
- Sub-keys: `.title`, `.sub`, `.label`, `.placeholder`, `.btn`, `.btn.*`, `.err.*`, `.confirm.*`, `.loading`, `.tooltip`. Kebab-case.
- Interpolation with `{{var}}`: `tr('git.commit.count', { count: 5 })`.
- Pluralization: separate keys `_one` / `_many` (and `_zero` when applicable).
- Reuse via `common.*` for cross-feature strings.

Workflow when adding a component:

1. Plan keys, add to `i18n.ts` per namespace.
2. `import { useT } from '@/hooks/useI18n'`, `const tr = useT()`.
3. Every visible string through `tr('namespace.key')`.
4. Run `npm run check:i18n` before commit.

For lang-sensitive strings outside React components (e.g. `formatRelTime`), follow the pattern in `frontend/src/components/GitPanel/shared.tsx`: pure fn taking explicit `lang` + `useFormatRelTime()` hook returning the wrapper with the active lang.

Enforcement: `scripts/check-i18n.mjs` regexes `frontend/src/**/*.{ts,tsx}`, exits 1 on hardcoded Spanish in JSX or known UI attributes. Allowlist: `scripts/.i18n-allowlist` — `path:fragment` per line for escape hatches. Files currently on the allowlist as visible tech-debt (not bugs — clean them gradually): `App.tsx`, `DiffViewer`, `PullRequestsList`, `SkillsPicker`, `GitPanel/ResizableSplit`. ~600+ keys already in `i18n.ts` across `auth.*`, `nav.*`, `dashboard.*`, `settings.*`, `server.*`, `browser.*`, `git.*`, `prs.*`, `commit.*`, `branch.*`, `discard.*`, `dock.*`, `time.*`, etc.

Backend errors: backend returns `{ok:false, code:'STABLE_CODE', message:'…'}`, frontend `translateBackendError(code)` in `backend-errors.ts`. New `AppError` → add `code` to the `berr.*` dictionary in `i18n.ts` with both languages.

---

<a id="preflight"></a>
## 18. Pre-flight checklist (PR gate)

If any fails, the PR is not ready.

1. `cd frontend && npx tsc --noEmit` → 0 errors
2. `cd backend && npx tsc --noEmit` → 0 errors
3. `npm run check:i18n` → 0 hits
4. `npm run web` boots; frontend loads; login works
5. Terminal dictation in browser (Web Speech): open a bubble → "Hablar a la terminal" → speak → text appears in the `DictationBar` → "Enviar a terminal" → text lands in the PTY (not executed)
6. ServerPanel single: `echo hola` → starts → idle (echo exits) → no crash
7. ServerPanel dual: toggle on, valid commands → backend boots first, frontend follows with correct `API_PORT`
8. Browser panel: navigate to `localhost:7100/health` → JSON → switch tab → return → no reload
9. `npm run dmg` produces `.dmg` without errors; bundle contains `Resources/bin/eco-stt` and `Resources/mcp-server/dist/index.js`
10. Installed .app launches; login works; terminal dictation works (with macOS Mic + Speech Recognition prompts first time). The mic does NOT start on its own — only when "Hablar a la terminal" is pressed.
11. Dev server persistence: with a server running, kill backend → `~/.eco/dev-sessions.json` has the entry → relaunch backend → server appears as running
12. Git tab: in a worktree-bubble, open Git → cycle the 3 sub-tabs (Changes/History/PRs) with no console errors. Cherry-pick a commit → green. Trigger cherry-pick with conflict → `OpInProgressBanner` appears → Abort → state clean. Reset hard requires typing `HARD RESET`. PRs sub-tab requires `gh` installed (`which gh` from terminal); without it, `pr.gh_missing` is the expected error.
13. Language toggle: Settings → EN; cycle Dashboard / AgentDetail / Git / Server / Browser — no Spanish leftover. Back to ES — no English leftover.

---

<a id="build"></a>
## 19. Build & packaging

> **macOS** below. For the **Windows NSIS `.exe`** build (`npm run dist:win`), the
> electron-builder JS config, the native-prebuild filtering per target, the
> `prepare-backend` hoisted-install fix, and every Windows gotcha (claude CLI
> resolution, `buildSafeEnv` env keys, single-instance lock, the `icon.ico`
> generator, install/SmartScreen notes), see **Appendix E**. Both share
> `npm run build:all`; only the final `electron-builder` target differs.

### Auto-update (electron-updater → GitHub Releases)

The packaged app self-updates against the **public** repo `Sergiocr16/eco` via `electron-updater` (config: `publish` block in `electron-builder.config.cjs`). Wired in `electron/main.cjs` (`setupAutoUpdater`, IPC `eco:check-updates` / `eco:install-update`, gate `UPDATES_ENABLED = app.isPackaged && process.platform === 'win32'`), `electron/preload.cjs` (bridge), `frontend/.../UpdateBanner.tsx` + `Settings.tsx:UpdatesRow`. Public repo → no runtime token needed to download.

- **Windows only** for now. **macOS auto-update is inert**: electron-updater requires a signed + notarized app (`identity:null` today). To enable later: Developer ID cert + `afterSign` with `@electron/notarize`, then flip `UPDATES_ENABLED` to include darwin (the `zip` mac target is already in the config).
- **Release flow — automated (preferred)**: the GitHub Actions workflow `.github/workflows/release-win.yml` (runner `windows-latest`) builds + publishes on a **tag push `v*`** or manual dispatch. To cut a release: bump the version in `electron/package.json` (keep root `package.json` in sync), commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`. CI runs `npm run release:win` with `GH_TOKEN=${{ secrets.GITHUB_TOKEN }}` → uploads `Eco Setup <v>.exe` + `latest.yml` to the GitHub Release `vX.Y.Z`. The tag version MUST match `electron/package.json` (the updater compares `app.getVersion()` against `latest.yml`).
- **Release flow — manual (local, on a Windows machine)**: `export GH_TOKEN=<PAT with repo scope>`, then `npm run release:win`.
- **Behavior**: on launch (8 s delay) + every 6 h it checks, auto-downloads, then shows a native notification + the `UpdateBanner` ("Restart to update"). Manual check from Settings → Acerca de.

> **PROCESS — suggest a Windows release after shipping changes**: whenever a change lands that should reach users (a version bump, a merge to `main`, or any edit to the packaged app — `electron/main.cjs`, `preload.cjs`, `backend/`, `frontend/`), **remind Sergio of the Windows release steps** so the update actually ships through auto-update: bump `electron/package.json` (+ root), commit, `git tag vX.Y.Z && git push origin vX.Y.Z` → the `release-win` workflow publishes it. Do NOT bump/tag/push automatically (no auto-commit rule) — just surface the suggestion. Until a release is cut and published, installed Windows apps stay on the old version. (macOS still ships by hand — auto-update there is inert until signing.)
- **Bundling gotcha**: `electron-updater` is a **prod** dependency of `electron/package.json` so it lands in `app.asar`. Verify after a build: `npx asar list release/win-unpacked/resources/app.asar | grep electron-updater` (else the main process throws `Cannot find module` at boot). Running `npm install` at root prunes the standalone `backend/node_modules` — re-run `npm run build:all` before packaging.

### Clean build for the .dmg

```bash
# 1) Node 20
source ~/.nvm/nvm.sh && nvm use 20.20.2

# 2) If you touched the Swift CLI, rebuild it
./electron/native/build.sh

# 3) If a previous build left the DMG volume mounted, detach it
hdiutil detach -force "/Volumes/Eco 1.0.0" 2>/dev/null || true

# 4) Clean build of the .dmg
pkill -9 -f "Eco" 2>/dev/null
rm -rf release frontend/dist backend/dist
npm run dmg
# Expected output:
#   release/Eco-1.0.0-arm64.dmg    (~112 MB)
#   release/mac-arm64/Eco.app      (~296 MB installed)
```

> Step 3 (`hdiutil detach`) bites repeatedly — DMG volumes left mounted from a previous build block the next `electron-builder` run with a cryptic error.

### Bundle filters (electron/package.json)

`build.extraResources.filter` aggressively excludes everything not needed at runtime:

| Filter | Saves |
|---|---|
| Multi-arch binaries — only `arm64-darwin` keeps `ripgrep` (from `@anthropic-ai/claude-agent-sdk/vendor/ripgrep/`) and `node-pty` prebuilds | −43 MB ripgrep, −59 MB node-pty (arm64-linux, x64-darwin, x64-linux, x64-win32 dropped) |
| `bip39/src/wordlists/` except `english.json` | −300 KB |
| `typescript/`, `esbuild/`, `tsx/`, `@types/`, tests, docs, CHANGELOGs | several MB |

Plus:

- `mac.target.arch = ["arm64"]` — only Apple Silicon.
- `mac.electronLanguages = ["en", "es"]` — discards 54 `.lproj` packs from the Electron Framework.
- `icon.icns` regenerated with `iconutil` from a clean PNG (892 KB → 321 KB).

> **If you add a new heavy dep**: check if it ships prebuilds or vendor binaries for archs we don't use (linux, win32, x64-darwin). Filter them explicitly here. Otherwise the .dmg re-bloats silently.

### Reinstall the .app — INFALLIBLE recipe

Every step is load-bearing. Skipping order = you see the old version and blame the build.

```bash
# 1) KILL all previous instances. `open` on an already-running .app only brings it to the front.
pkill -9 -f "Eco.app" 2>/dev/null
sleep 1

# 2) DELETE the installed .app before copying. ditto over an existing .app can mix old + new files.
rm -rf /Applications/Eco.app

# 3) Copy the new one
ditto release/mac-arm64/Eco.app /Applications/Eco.app

# 4) Strip macOS quarantine
xattr -dr com.apple.quarantine /Applications/Eco.app

# 5) Launch
open /Applications/Eco.app

# 6) If user still sees the old bundle → renderer cache (see Appendix B)
```

`ditto` preserves perms + xattrs better than `cp -R`.

### Verify a build

```bash
# Swift CLI present
ls release/mac-arm64/Eco.app/Contents/Resources/bin/eco-stt

# BOTH macOS permission strings in Info.plist
/usr/libexec/PlistBuddy -c "Print :NSMicrophoneUsageDescription" \
  release/mac-arm64/Eco.app/Contents/Info.plist
/usr/libexec/PlistBuddy -c "Print :NSSpeechRecognitionUsageDescription" \
  release/mac-arm64/Eco.app/Contents/Info.plist

# main.cjs has the permission handler
strings release/mac-arm64/Eco.app/Contents/Resources/app.asar | grep -i setPermissionRequestHandler

# Frontend bundle hash (changes on every real build)
ls release/mac-arm64/Eco.app/Contents/Resources/frontend/dist/assets/App-*.js

# Verify a specific change made it into the bundle (minifier renames vars; grep literal strings)
grep -c '"<unique-string-from-your-change>"' \
  /Applications/Eco.app/Contents/Resources/frontend/dist/assets/App-*.js
# >= 1 means the bundle is correct; if app still shows old behavior → renderer cache
```

> If a rebuild produces the SAME bundle hash (`App-XXXX.js` unchanged), Vite's content-addressed output didn't see a real change — your edit didn't reach the build, or it was reverted.

---

<a id="errors"></a>
## Appendix A: Common errors → fixes

| Symptom | Root cause | Fix |
|---|---|---|
| `failed to fetch` on login (browser) | `.env.local` with stale absolute URL or wrong port | `VITE_ECO_BACKEND=` empty, restart Vite |
| `ECONNREFUSED 127.0.0.1:7050` in Vite proxy logs | Backend down | Relaunch `ECO_PORT=7050 npm --workspace backend run dev` |
| `Port 7000 in use` (dev) | AirPlay Receiver (ControlCenter) | Turn off in Settings, or use `:7050` (default) |
| .app boots but can't reach backend | Another Eco backend dev listening on 7100 | `pkill -9 -f Eco`, `lsof` check, relaunch |
| Mic doesn't activate in .dmg | (a) macOS permissions not granted / (b) `setPermissionRequestHandler` missing / (c) `NSMicrophoneUsageDescription` missing | Verify all 3. `tccutil reset Microphone com.aditum.eco` to re-prompt. |
| Listening animation but no transcription | (a) Backend crash in endpoint (check log) / (b) AVFoundation can't decode the format | Check `[voice/transcribe-blob]` log. If CT is webm → switch to WAV PCM. |
| `__dirname is not defined` in backend | Backend is ESM | `path.dirname(new URL(import.meta.url).pathname)` |
| `Transcription timeout` in eco-stt | CLI has no active CFRunLoop | `CFRunLoopRunInMode(.defaultMode, 0.5, true)` in a loop |
| BrowserPanel reloads every N seconds | `<webview>` recreated by parent re-render with inline callbacks in deps | Move callbacks to `cbRef`, remove from deps |
| ServerPanel: status `starting` forever | `READY_RE` doesn't match the framework's output | Add the pattern to the regex in `dev-server.ts:244` |
| Dev servers lost on close/recompile | Missing persistence | Already implemented via `~/.eco/dev-sessions.json` + pgid re-adopt |
| Dashboard doesn't show active servers | Snapshot arrives before Dashboard subscribes | Initial seed via `GET /dev/active` (already implemented) |
| `Cannot find module 'browser-sync-client/...'` | User project's `node_modules` broken (NOT Eco) | `cd <project>; npm install` |
| BranchPicker dirty dialog in the wrong place | `position:fixed` trapped by transform ancestor | `createPortal(node, document.body)` |
| `./mvnw: No such file` on server start | Bubble points at workspace PARENT (folder of repos), not a repo | Change the bubble's workspace to the right repo |
| FilesPanel `/file/save` 409 conflict | Agent or external editor mutated file under us | Reload / Overwrite dialog (already wired) |
| GitHub PR list empty despite PAT saved | Token lacks `repo` scope | Re-create PAT with `repo` + re-save |

---

<a id="debug"></a>
## Appendix B: Debug commands + reading order

### Debug commands

```bash
# Eco processes
ps aux | grep -i "Eco" | grep -v grep

# Ports held by Eco
lsof -nP -iTCP -sTCP:LISTEN | grep -E "Eco|7050|7100|5173"

# Token alive?
cat ~/.eco/token | head -c 30

# Persisted dev sessions
cat ~/.eco/dev-sessions.json | jq

# .app backend responding?
curl -s http://127.0.0.1:7100/health

# Dev backend?
curl -s http://127.0.0.1:7050/health

# Authed endpoint test
TOKEN=$(cat ~/.eco/token) curl -s \
  -H "Authorization: Bearer $TOKEN" -H "X-Eco-Client: 1" \
  http://127.0.0.1:7050/info | jq

# Installed .app Info.plist
/usr/libexec/PlistBuddy -c "Print :NSMicrophoneUsageDescription" \
  /Applications/Eco.app/Contents/Info.plist

# Reset macOS mic + speech perms
tccutil reset Microphone com.aditum.eco
tccutil reset SpeechRecognition com.aditum.eco

# List active worktrees
ls -ltd ~/.eco/worktrees/*/

# Orphan eco/ branches in a repo
git -C <repo> branch | grep eco/

# Launch installed .app from terminal to see logs
/Applications/Eco.app/Contents/MacOS/Eco > /tmp/eco-app.log 2>&1 &
tail -f /tmp/eco-app.log

# Verify a build (minifier renames vars; grep literal strings)
grep -c '"<unique-string-from-your-change>"' \
  /Applications/Eco.app/Contents/Resources/frontend/dist/assets/App-*.js
# >= 1 means the bundle is correct; if app still shows old behavior → renderer cache
```

### Renderer cache reset (rare)

WARNING: wipes login session (`eco.session`), browser URLs, active tabs, etc. Does NOT touch `~/.eco/user.json` or `~/.eco/dev-sessions.json`. **Never run this unless Sergio explicitly asks** (see §2 — a normal reinstall does not need it).

```bash
rm -rf "$HOME/Library/Application Support/Eco/Cache" \
       "$HOME/Library/Application Support/Eco/Code Cache" \
       "$HOME/Library/Application Support/Eco/GPUCache" \
       "$HOME/Library/Application Support/Eco/DawnGraphiteCache" \
       "$HOME/Library/Application Support/Eco/DawnWebGPUCache" \
       "$HOME/Library/Application Support/Eco/Service Worker" \
       "$HOME/Library/Application Support/Eco/Local Storage" \
       "$HOME/Library/Application Support/Eco/Session Storage"
open /Applications/Eco.app
```

### Recommended reading order in the repo

To understand features without flailing:

- **Persistent PTY**: `backend/src/pty-server.ts` (ring buffer + reattach)
- **Own MCP tools**: `backend/src/agent-tools.ts` + `agent.ts`
- **Commit with AI**: `backend/src/git-ops.ts:commitSuggest` (calls `claude -p`)
- **Terminal dictation**: `frontend/src/hooks/useVoice.ts` (STT capture) + `App.tsx:startTerminalDictation` + `pty-bridge.ts:writeToBubblePty`
- **WS reconnect**: `frontend/src/hooks/useEcoSocket.ts` — backoff + activeBubbleId tracking
- **Worktree manager**: `backend/src/worktree-manager.ts` — prune cron + auto-recovery on conflicts
- **Dashboard graph**: `Dashboard.tsx` ~1190–1500 — SVG animations, particles, satellite pulses
- **Theme system**: `frontend/src/design/tokens.ts` and `theme.tsx` — accents + themes, `glassEffect` helper
- **FilesPanel security**: `backend/src/fs-paths.ts:resolveSafePath` — single chokepoint for path validation
- **Notes summarizer**: `backend/src/notes-summary.ts` — slimming + claude-p spawn + 3-section prompt

<a id="mcp-appendix"></a>
## Appendix C: External MCP server (Claude Code)

Paquete standalone en `mcp-server/` que expone tools MCP por stdio para
que Claude Code (u otro cliente MCP) pueda crear bubbles en Eco desde
cualquier terminal o sesión.

### Tools v1

- `create_bubble({ title, workspace?, base_branch?, initial_prompt? })` —
  Crea una bubble en Eco. Si viene `initial_prompt`, el backend spawnea el
  PTY de la bubble + `claude` CLI server-side y tipea el prompt en el
  terminal (no en el chat SDK). Si `workspace` se omite, el server detecta
  el cwd con el que arrancó y busca un workspace permitido que lo contenga.
- `list_bubbles()` — Lista las bubbles activas (id, título, workspace,
  status). Requiere que el frontend haya sincronizado al menos una vez.
- `send_to_bubble({ bubble_id, text })` — Envía un prompt al agente Claude
  de una bubble existente: el backend lo tipea en el PTY de la bubble vía
  `injectPromptToBubble` (mismo camino que `initial_prompt`; si el PTY no
  estaba corriendo lo spawnea). Fire-and-forget — no devuelve la respuesta
  del agente. El workspace sale del snapshot sincronizado, no del caller.
  Rechaza bubbles archivadas (`bubble.archived`) e ids desconocidos
  (`bubble.not_found`).

### Setup desde Eco (recomendado)

Settings → Integraciones → **MCP Server (Claude Code)** → botón **Instalar**.
Eco resuelve el path del binario, corre `claude mcp add eco -s user --
node <path>` y muestra el estado. También expone "Copiar comando" si
preferís pegarlo manualmente.

### Setup manual

```bash
cd mcp-server
npm install
npm run build
claude mcp add eco -s user -- node /Users/sergiocastro/Documents/GitHub/aditum-analisis-descalces-contables/eco/mcp-server/dist/index.js
```

Reiniciá Claude Code. Las tools quedan disponibles como
`mcp__eco__create_bubble` y `mcp__eco__list_bubbles`.

### Files (Eco-side)

- `mcp-server/src/index.ts` — server stdio, registra tools
- `mcp-server/src/tools.ts` — `create_bubble` y `list_bubbles`
- `mcp-server/src/client.ts` — cliente HTTP al backend de Eco (token desde
  `~/.eco/token`)
- `mcp-server/src/workspace.ts` — autodetect de workspace permitido por cwd
- `backend/src/mcp-config.ts` — detect path + install/uninstall delegado
  al binario `claude` (lee `claude mcp get eco` para status). NO parsea
  `~/.claude.json` directamente.
- `backend/src/pty-server.ts` `ensureBubblePty` + `injectPromptToBubble`
  — spawn server-side del PTY + escritura del prompt cuando claude CLI
  cold-startea (~5 s desde spawn; texto y Enter en writes separados con
  gap 250 ms — sin el gap, claude CLI a veces trata el `\r` como newline
  multilínea estilo paste y no submitea).
- `backend/src/index.ts` `/bubble/create`, `/bubbles`, `/bubbles/sync`,
  `/config/mcp` (GET/POST/DELETE)
- `frontend/src/screens/Settings.tsx` `McpCard` — UI de instalación
- `frontend/src/hooks/useMcpConfig.ts` — hook que envuelve `/config/mcp`
- `electron/scripts/prepare-mcp.cjs` — pre-build del .dmg (compila TS,
  poda dev deps, deja `mcp-server/{dist,node_modules,package.json}` listos
  para que electron-builder los copie como extraResources)
- `electron/package.json` — entries de `mcp-server/*` en `extraResources`

### Endpoints HTTP que consume

- `POST /bubble/create` — Crea la bubble. Requiere Eco abierto (al menos un
  WS conectado al `/ws`); devuelve `409 eco.no_clients` si no. Si vino
  `initialPrompt` y `workspace`, llama a `injectPromptToBubble` en lugar de
  broadcastear un `inject_prompt` por WS (el frontend no participa).
- `POST /bubble/send` — Inyecta un prompt al PTY de una bubble existente
  (tool `send_to_bubble`). Valida el id contra el snapshot de `/bubbles`.
- `GET /bubbles` — Lee snapshot que el frontend sincroniza periódicamente.
- `POST /bubbles/sync` — Solo lo llama el frontend (debounce 800ms) para
  mantener el snapshot actualizado.
- `GET/POST/DELETE /config/mcp` — Status / install / uninstall consumidos
  por Settings.

### Bundling en el .dmg

`prepare-mcp.cjs` corre como parte de `build:all` (antes de
electron-builder). Hace `npm install` + `tsc` + `npm prune --omit=dev` en
`mcp-server/`. Después electron-builder copia `mcp-server/dist`,
`mcp-server/node_modules` y `package.json` como extraResources. Path final
en el bundle: `Eco.app/Contents/Resources/mcp-server/dist/index.js`.

`resolveBinaryPath()` en `backend/src/mcp-config.ts` usa el offset
`../../mcp-server/dist/index.js` desde el módulo backend — funciona igual
en dev (repo) y packaged (Resources/) porque la estructura es la misma.

### Decisiones que parecen raras

#### "¿Por qué la creación pasa por el frontend si el backend recibió el POST?"
Porque las bubbles viven en `localStorage` del frontend (autoridad). El
backend no tiene un registry de bubbles — solo de worktrees y dev sessions.
Para crear una bubble "visualmente" hay que avisarle al frontend; el camino
es `client_action: open_bubble` por WS, que ya existía para el tool MCP
interno (`agent-tools.ts`). El endpoint nuevo reusa ese mismo path.

#### "¿Por qué `initialPrompt` se ejecuta server-side y no por WS al frontend?"
Probamos primero el path por WS (`inject_prompt` → frontend abre PTY ephemeral
con `writeToBubblePty` → tipea el texto). Tres problemas: (1) si el user creó
varias bubbles desde MCP en batch, cada `inject_prompt` quería hacerle un
`switch_tab` y le robaba el foco; (2) el frontend tenía que estar montado
con el `AgentDetail` para que el listener de `eco:switch_tab` escuchara —
nunca lo estaba al instante; (3) el cold-start de `claude` CLI (~3-4 s)
desincronizaba con cualquier `firstStartDelay` del frontend. Server-side
resuelve todo: el backend tiene el control total del timing y no tiene que
coordinar con el render lifecycle. El user descubre la conversación ya en
marcha cuando entra a la bubble — sin foco robado, sin tabs cambiando.

#### "¿Por qué `~/.eco/bubbles-index.json` y no consultar al frontend on-demand?"
Long-poll WS request/response del frontend para `list_bubbles` agrega
mucha complejidad para v1. El push periódico desde el frontend (8 KB cada
~800 ms cuando algo cambia) es trivial, sobrevive reinicios del backend,
y el caller MCP siempre obtiene una respuesta inmediata sin esperar al
frontend.

#### "¿Por qué texto y Enter en `pty.write` separados con 250 ms de gap?"
Si los mandamos juntos (`text\r` en un solo chunk), claude CLI a veces
interpreta el `\r` como newline dentro de un input multilínea estilo paste
y no submitea. Dos writes con gap → primer write = "typing", segundo =
"Enter discreto" → submit confiable.

#### "¿Por qué `claude mcp get eco` y no parsear `~/.claude.json`?"
El formato de `~/.claude.json` es interno de Claude Code y puede cambiar
entre versiones; además contiene config sensible no relacionada al MCP.
Delegar a la CLI usa un contrato estable (exit 0 = registrado).

<a id="multitenant"></a>
## Appendix D: Multi-tenant (Firebase Auth + Firestore)

> **Estado:** mergeado a `main`. Eco es **multi-tenant sobre un único backend local**
> (una Mac corriendo el server; los usuarios remotos entran por Tailscale). La
> **identidad es Firebase Auth** y el **estado de la app vive en Firestore**
> (gobernado por `firestore.rules`). El backend local solo hace **cómputo**
> (worktrees/PTY/git/dev-servers/files/voz/backup) y verifica el ID token; **no
> autoriza**. El CLI de Claude es **compartido** (una sola auth/billing). Aislamiento
> **lógico** (Firestore rules + equipo de confianza), NO sandbox del SO.
>
> El modelo local anterior (PIN/argon2id/BIP39, sessions, doc-store por archivo)
> quedó **inerte** — el código sigue presente pero no es el camino vivo.

### Invariante central
La identidad SALE SIEMPRE del **ID token de Firebase verificado**, NUNCA del cliente:
- HTTP: `X-Eco-Client:1` → `Authorization: Bearer <Firebase ID token>` → el middleware (`index.ts`) lo verifica con `verifyFirebaseIdToken` (`firebase-auth.ts`, JWKS de Google) y setea `req.ecoUser = { id: uid, role: 'member', username: email }`. (El `role` SIEMPRE es `'member'` acá; el rol real lo enforce Firestore.)
- WS (`/ws`, `/ws/pty`): subprotocolo `eco.idtoken.<jwt>` → `verifyClient` verifica el token y deja el uid en `req.ecoUid`.
- Token de máquina (`~/.eco/token`): SOLO para procesos MCP stdio en un allowlist chico (`/bubble/create`, `/bubble/send`, `/bubbles`, `/workspaces`); el dueño se resuelve al "machine user" (último login Firebase, `setMachineUser`/`getMachineUser`).
- Los handlers/spawns usan `req.ecoUser.id` (uid) o `bubble.ownerId`. Un userId/ownerId mandado por el cliente se ignora.

### Modelo de datos — Firestore (autoridad del estado de la app)
El frontend habla **directo con Firestore** (client SDK, `frontend/src/lib/firebase.ts:getDb`, offline persistence en IndexedDB). El backend local NO toca Firestore. Colecciones (ver `firestore.rules` + `firestore.indexes.json`):
- `users/{uid}` — perfil + **`role: admin|member`** + `disabled` + `email`/`displayName`. El rol lo escribe solo un admin; nadie se auto-promueve (regla `update`).
- `prefs/{uid}` — tema/idioma (un doc por usuario).
- `bubbles/{bubbleId}` (+ subcolección `messages/{msgId}`) — metadata del agente + mensajes. Lleva `ownerId`. Borrado lógico (`deleted:true`); `allow delete: if false` (un agente nunca se elimina del todo).
- `categories/{uid}`, `notes/{noteId}`, `review/{reviewId}` — owner-based (`ownerId == uid`).
- `workspaceConfig/{uid}/…` — por usuario/máquina (existe la colección, pero hoy la config de server la sirve el backend local; ver abajo).
- `auditLog/{eventId}` — **append-only** (owner crea, nadie edita/borra, admin lee). Reemplaza la bitácora local.
- Tipos en `frontend/src/lib/firestore-model.ts`. Índices compuestos: `bubbles(ownerId, updatedAt desc)`, `categories(ownerId, order)`, `auditLog(ownerId, ts desc)`.
- **Security Rules** (`firestore.rules`) son la frontera: owner-based (`ownsExisting`/`ownsIncoming`), admin global read (`isAdmin()` lee `users/{uid}.role`), auditLog append-only, no auto-promoción. Probar con `npm run test:rules` (emulador, `scripts/firestore-rules.test.mjs`, 14 casos).

### Qué queda en el backend local (NO en Firestore)
- API key de Claude (`~/.eco/api-key`, global compartida), GitHub PAT por usuario (`~/.eco/users/<uid>/github.json`), worktrees, `dev-sessions.<port>.json`, `workspace-config.json` (servido vía `/workspace-config`), config de Obsidian/backup, token de máquina.
- **Legacy/inerte:** `users-store.ts`/`user.json`, `sessions.ts`, `user-docs.ts`/`docs/*.json`, `audit-log.jsonl`, `request-context.ts`, `bubbles-index.ts` summary. El doc-store local solo se lee en la **migración one-time** `ensureMigrated` (`lib/user-sync.ts`): si hay datos locales (`GET /user/docs`) y Firestore está vacío, los sube una vez; después todo es Firestore.

### Auth — Firebase (el admin da de alta in-app; nadie fija PINs)
- **Login** = email + password (Firebase Auth, `AuthScreen`/`useAuth`). El ID token va como Bearer + subprotocolo WS.
- **Primer admin**: se registra en la app y luego se promueve UNA vez con `npm run bootstrap:admin <email>` (`scripts/bootstrap-admin.mjs`, firebase-admin SDK escribe `users/{uid}.role=admin`; bypassa las rules porque aún no hay admin). Chicken-and-egg resuelto una sola vez.
- **Alta de usuarios**: el admin, desde la consola, llama `createUserAsAdmin(email, password)` (`lib/firebase.ts`) — usa una **instancia secundaria de Firebase in-memory** para crear la cuenta SIN desloguear al admin — y escribe `users/{uid}` con `role:'member'`. Promueve/degrada con `updateDoc(users/{uid}, {role})`.
- **Reset de contraseña** = `sendPasswordResetEmail` (Firebase). **Deshabilitar** = `updateDoc(users/{uid}, {disabled:true})` (las rules y el frontend lo respetan).
- **Lock screen**: PIN local de dispositivo (`lib/lock-pin.ts`, SHA-256 salteado con uid) que bloquea/desbloquea una sesión Firebase viva. NO es auth de cuenta. Estados en `useAuth`: `unlocked|locked|setup`.

### Per-user git identity + workspace ACL
- Cada usuario maneja su PAT desde Settings → GitHub. Los spawns (PTY/agente) inyectan `githubEnvOverrides(ownerId)` → commits/push con la identidad del dueño de la bubble (`ownerId` = uid de Firebase).
- `config.ts:isAllowedWorkspace(target, userId?)` + `workspacesForUser(userId?)`: gate de workspaces. El universo global (`ECO_WORKSPACES`/`workspaces-store`) lo gestiona el admin.

### Config de server + base branches por workspace (admin define, member consume)
- `backend/src/workspace-config.ts` + `frontend/src/lib/workspace-config.ts` (store-singleton + `useWorkspaceConfig`/`saveWorkspaceConfig`). `GET /workspace-config` (sesión, filtrado a workspaces visibles), `POST /workspace-config` (`requireAdmin`).
- El **admin** define el/los comando(s) de dev server (single/dual) y las base branches favoritas **en Settings → Folders** por workspace. El **ServerPanel de cada burbuja es solo-consumo**: muestra el comando read-only y solo Iniciar/Detener/Reiniciar (el member no edita nada). El diálogo de nuevo agente lee las base branches del server config. Reemplazó el viejo localStorage `eco.dev.workspace_defaults.*` / `eco.worktree.favorites.*`.

### Gating de Settings por rol
- Solo admin: secciones **Claude & API**, **Folders**, **Integraciones** (Obsidian + MCP server, recursos del anfitrión), **Backup**; y en **General** los toggles "Barra de menú" y la acción "Limpiar worktrees" (cosas de host/dispositivo). (La sección **Voice** y los toggles de "Escuchar al iniciar" se eliminaron junto con la voz.) El member ve General (review/notify/dock/carpeta/atajo/idioma/IDE/sugerencias), GitHub, Seguridad, Apariencia, Acerca de. **History** está oculto del menú lateral para todos.

### Consola de admin
- `frontend/src/screens/AdminScreen.tsx` (gated en `AppSidebar` por rol admin de Firestore). Habla **directo con Firestore** vía `hooks/useAdmin.ts`. Tres tabs:
  - **Usuarios**: crear con **email + nombre** (`createUserAsAdmin` → cuenta Firebase + doc `users/{uid}`); cambiar rol (`updateDoc role`); habilitar/deshabilitar (`updateDoc disabled`); reset de contraseña (`sendPasswordResetEmail`). **Sin inputs de PIN** en ningún lado.
  - **Actividad**: usuario → sus bubbles con dot de estado (lee las colecciones `users`+`bubbles` de Firestore).
  - **Bitácora** (`AuditTab`): eventos de la colección `auditLog` de Firestore, filtrables por usuario y tipo, con actor + acción + workspace + tiempo relativo (`useFormatRelTime`).
  - Hook: `useAdmin.ts` (`refreshUsers`/`refreshOverview`/`refreshAudit`, `setRole`/`setDisabled`/`createUser`/`sendReset`).

### Dashboard global del admin (vista "todos los usuarios")
- El admin tiene un toggle **"Mis agentes / Todos los usuarios"** en el Dashboard (`eco.dashboard.scope`, oculto para members). En "todos", las 3 vistas (grilla/kanban/graph) muestran los agentes de TODO el equipo vía `useTeamBubbles` (propias reales + ajenas leídas de la colección `bubbles` de Firestore): grilla **agrupada por dueño**, kanban con **badge de dueño**, graph en `groupMode="owner"`. Los agentes ajenos son **read-only** y el clic es **inerte** (el admin no abre worktrees ajenos). Ver `Dashboard.tsx` y `AdminGraph.tsx` en el file-map (§4).

### Backup
- `backup.ts` captura los archivos planos de `~/.eco` (token, api-key, workspace-config, github por usuario, etc.) + el estado de worktrees. El **estado de la app (bubbles/mensajes/categorías/notas/review/prefs) ya NO está en `~/.eco`** — vive en Firestore, que tiene su propia durabilidad/export; el backup local cubre lo operativo + credenciales. Solo admin (cada 2h, retención 30). Migración histórica de un backup viejo a Firestore: `scripts/restore-backup-to-firestore.mjs` (one-time, firebase-admin).

### Caveat de aislamiento
Todos los spawns corren como el MISMO usuario del SO y comparten el CLI de Claude. La separación por usuario es **lógica** (Firestore rules para el estado; checks de endpoint para el cómputo), pero alguien con acceso al SO puede leer worktrees/credenciales de otros bajo `~/.eco`. Aceptable para equipo de confianza; NO es aislamiento endurecido.

### Hardening pendiente (diferido — defense-in-depth bajo aislamiento lógico)
- **Backend local sin authz fina**: `requireAdmin` solo exige sesión válida; los endpoints de cómputo (`/dev/*`, `/file/*`, `/git/*`) confían en `isAllowedWorkspace` + bounds de worktree, no en el rol. La autorización del estado la cubre Firestore, pero el cómputo no distingue admin/member más allá del workspace gate.
- **Filtrado de broadcasts por usuario**: `dev_status`/`pty_status`/`dev_log`/`client_action` se emiten a todos los clientes WS (un usuario ve el estado/logs de dev-servers y PTYs de otros). La respuesta del agente (`sdk_message`) SÍ va por-conexión.
- **Namespacing de worktree/localStorage por usuario**: `~/.eco/worktrees/<bubbleId>` es plano y `eco.bubbles.v1` es global por navegador. No hacer login de dos usuarios distintos en el MISMO navegador.
- **Token MCP por usuario**: el MCP server atribuye al "machine user" (último login) cuando entra con el token de máquina. Falta un token MCP por usuario.

---

<a id="windows"></a>
## Appendix E: Windows & cross-platform packaging

Eco runs and packages on **macOS (arm64 `.dmg`)** AND **Windows (x64 NSIS `.exe`)**. The Firebase/Auth/data layer is platform-agnostic and untouched by the port. Everything OS-dependent is funneled through a small set of seams so the rest of the code stays platform-blind.

### The platform seam — `backend/src/platform.ts`

The single home for OS-dependent primitives. **Never inline a shell, `lsof`, `process.kill(-pgid)`, or a `:` path separator anywhere else — call these.**

| Export | POSIX | Windows |
|---|---|---|
| `IS_WIN` | `false` | `true` |
| `defaultShell()` | `$SHELL` → `/bin/zsh`/`/bin/bash` | `%ComSpec%` (cmd.exe) / PowerShell |
| `shellRun(cmd)` | `/bin/bash -c <cmd>` | `cmd.exe /d /s /c <cmd>` (con `normalizeWinCommand`) |
| `shRun(cmd)` | `sh -c <cmd>` | `cmd.exe /d /s /c <cmd>` (con `normalizeWinCommand`) |
| `detachForGroup` | `true` (spawn `detached` → process group) | `false` (no process groups) |
| `pidsOnPort(port)` | `lsof -ti :<port> -sTCP:LISTEN` | parse `netstat -ano` LISTENING rows |
| `killTree(pid, sig)` | `process.kill(-pgid, sig)` (group) | `taskkill /PID <pid> /T /F` (tree) |
| `killPid(pid, sig)` | `process.kill(pid, sig)` | `taskkill /PID <pid> /F` |
| `resolveClaudeCli()` | `~/.local/bin/claude` | `$CLAUDE_CLI_PATH` → `~/.local/bin/claude.exe` → `where claude` (prefers `.exe`) |
| `resolveRipgrepPath()` | bundled `vendor/ripgrep/arm64-darwin/rg` → PATH `rg` | `$ECO_RIPGREP`/`$RG_BIN` → bundled `vendor/ripgrep/x64-win32/rg.exe` → PATH | 

Wired into: `pty-server.ts` (`defaultShell`), `dev-server.ts` (spawn via `shellRun`+`detachForGroup`, ports via `pidsOnPort`, kill via `killTree`/`killPid`, PATH joined with `path.delimiter`), `shell.ts` (`shRun`), `config.ts` (`claudeCliPath = resolveClaudeCli()`), `fs-search.ts` (`resolveRipgrepPath()`).

> **Why prefer a real `claude.exe` over the npm `.cmd` shim**: spawning a `.cmd` on Windows needs `shell:true`, which re-parses args — several call sites (`git-ops`, `notes-summary`) pass the prompt as argv, so a shim would break quoting / invite injection. With a real `.exe` no shell is needed and args stay safe. If a user only has the `.cmd` shim, set `CLAUDE_CLI_PATH` to a real exe.

### Other cross-platform code changes

- **`platform.ts:normalizeWinCommand`** (applied inside `shellRun`/`shRun` on Windows) — cmd.exe doesn't understand the POSIX `./script` prefix (it parses `.` as a command → "'.' no se reconoce…"), so a workspace dev-server command like `./mvnw spring-boot:run` failed. The helper rewrites a leading `./`/`../` (at command start or after a space/`&&`/`|`/`;`/`(`) to backslash form — URLs (`http://`, preceded by `:`) and slashes inside other args are left untouched. Keeps the per-workspace server command cross-platform (set once, runs on both OSes).
- **`config.ts:isAllowedWorkspace` + `git-ops.ts` worktree-conflict cleanup** — the `~/.eco/worktrees` root was built as `` `${homedir()}/.eco/worktrees` `` (hardcoded `/`), so on Windows it mixed separators (`C:\Users\x/.eco/worktrees`) and never `startsWith`-matched the native-separator realpath → every bubble's Files/`/fs/tree` returned `http.workspace_forbidden` ("no autorizado"). Now built with `resolve(homedir(), '.eco', 'worktrees')`; the git-ops path (git emits `/` even on Windows) normalizes both sides to `path.sep` before comparing.
- **`security.ts:buildSafeEnv`** — **passthrough + denylist**, not an allowlist: spawned children inherit ALL of `process.env` minus the `ECO_` prefix, so installed toolchains (`JAVA_HOME`, etc.) just work on both OSes (this replaced the old per-OS key allowlist, which silently broke `mvnw`/`gradlew` with "JAVA_HOME not found" and any non-listed tool). `PATH` is split/joined with `path.delimiter` and augmented with `EXTRA_PATH_DIRS`: Homebrew + `~/.local/bin` on POSIX, `%APPDATA%\npm` (npm global) + `%USERPROFILE%\.local\bin` (claude) on Windows — so `claude`/`gh`/`mvn` resolve when the app is launched from the OS launcher with a minimal PATH. The Windows-critical keys (`SystemRoot`, `PATHEXT`, `ComSpec`, …) now flow through automatically as part of the full passthrough.
- **`mcp-config.ts` + `index.ts`** — module paths via `fileURLToPath(import.meta.url)` (the old `new URL(...).pathname` returns `/C:/…` on Windows and breaks `path.resolve`; it also leaves `%20` for spaces, so this is a latent fix on macOS too).
- **`fs-search.ts`** — uses **`platform.ts:resolveRipgrepPath()`** to spawn the **bundled** ripgrep by absolute path (`vendor/ripgrep/<arch>-<plat>/rg[.exe]`), NOT a bare `rg` on PATH. This is the Windows fix: the packaged `rg.exe` is in `node_modules`, not on PATH, so the old `spawn('rg')` failed and fell back to `grep` (absent on Windows → search silently dead). Now ripgrep works on both OSes without a global install; the `grep` fallback is POSIX-only, and on Windows-without-ripgrep the endpoint returns `search.no_engine` instead of spawning a missing binary.
- **`auth.ts`** — `chmodSync` calls wrapped in try/catch (no-op on NTFS).
- **Voice (`useVoice.ts`)** — terminal dictation STT is **macOS-only** (the Swift `eco-stt` + Apple Speech). `isSupported` is forced `false` on non-darwin Electron via `ecoPlatform()` so `AgentDetail` hides the "Hablar a la terminal" button. The `/voice/transcribe-blob` endpoint already 501s off-darwin. To add Windows dictation you'd need a Windows STT helper (System.Speech / Windows.Media.SpeechRecognition) + re-enable the gate.
- **`getTopInset()` (`frontend/lib/platform.ts`)** — returns 36px **only on macOS** (traffic-light inset for `titleBarStyle: hiddenInset`). On Windows/Linux it returns 0 — the native frame already owns the top, so reserving 36px left an empty strip ("border") that looked wrong, especially maximized/fullscreen.

### `electron/main.cjs` (shared lifecycle)

- Already branches `process.platform === 'darwin'` for the traffic-light titlebar and the hide-on-close behavior (Win/Linux quit on window close via `window-all-closed` → `killBackend`).
- Passes `ECO_FIREBASE_PROJECT_ID` to the backend.
- **Single-instance lock** (`app.requestSingleInstanceLock()`): a 2nd launch focuses the existing window and quits instead of spawning a parallel instance. Without it, double-clicking an app whose window was hidden spawned zombie instances that piled up and made the NSIS installer refuse to run ("Eco cannot be closed"). The `whenReady` body early-returns when the lock isn't held.
- **`createWindow` always shows the window**: `ready-to-show` is registered BEFORE `loadURL`, and `loadURL` is wrapped in try/catch with a fallback `show()`. Previously a `loadURL` rejection (e.g. backend didn't boot) skipped the `ready-to-show` registration → a `show:false` window stayed invisible forever ("nothing opens").

### Build config — `electron/electron-builder.config.cjs`

The build config moved from the `build` block in `electron/package.json` to a **JS config file** so the native-prebuild filters can be **conditional on the build target** — impossible in static JSON. It detects the target from `process.argv` (`--win`/`--mac`/`--linux`, else `process.platform`) and keeps only that platform's prebuilds:

- **node-pty** `prebuilds/<os-arch>/` — keep `darwin-arm64` (mac) / `win32-x64` (win); exclude the rest + `src`/`scripts`/`tools`/`build`/`deps` + `*.pdb`.
- **ripgrep** (`@anthropic-ai/claude-agent-sdk/vendor/ripgrep/<arch>/`) — keep `arm64-darwin` (mac) / `x64-win32` (win); exclude the rest.
- **`eco-stt`** (mac-only Swift binary) is added to `extraResources` only for the mac target.

The mac `dmg`/`win` `nsis`/`linux` `AppImage` blocks coexist; only the relevant one runs per target. `electron/package.json` `build:*` scripts all pass `--config electron-builder.config.cjs`. **The mac build is byte-for-byte equivalent to the old inline config** (same dmg arm64, icon.icns, both `NS*UsageDescription`, eco-stt, prebuild filters).

### Prepare scripts (`electron/scripts/`)

- **`prepare-backend.cjs`** — installs `backend/node_modules` (prod only) for `extraResources`. **Uses npm's default hoisted strategy, NOT `--install-strategy=nested`.** The nested strategy + Windows file-locking (EPERM on cleanup) left an INCOMPLETE tree (missing shared transitive deps like `function-bind`) → the packaged backend crashed at boot with `MODULE_NOT_FOUND`, so its HTTP server never bound and the window never loaded. Hoisted flattens everything into `backend/node_modules` with no holes. Adds `shell: true` on Windows (npm is `npm.cmd`).
- **`prepare-mcp.cjs`** — same `shell: true` on Windows for `npm`/`npx`.
- The `chmod +x` of node-pty `spawn-helper` only targets darwin/linux prebuilds (no-op on Windows; the win32-x64 prebuild ships `pty.node` + `conpty/*.dll` + `winpty.dll`, no chmod needed).

> **Gotcha**: running `npm install` (or `npm i <pkg> --no-save`) at the repo ROOT prunes the standalone `backend/node_modules` that `prepare-backend` created (it's not in the root lockfile). Always re-run `npm run build:all` (or `prepare-backend`) before packaging if you touched root deps.

### App icon for Windows (`electron/build/`)

`win.icon` points to a pre-generated **`icon.ico`** (16/32/48/256, Lanczos). Do NOT let electron-builder auto-convert the PNG — its downscale feathered the rounded corners. The source `icon-opaque.png` is the macOS-style squircle on a **white opaque** background; on Windows that showed as **white corners**. `electron/scripts/make-win-icon.cjs` flood-fills transparency from the 4 corners (NOT a global luminance threshold — the teal ring is light too but lives inside, walled off by the dark body) and packs the `.ico`. Regenerate with `npm install png-to-ico pngjs --no-save && node electron/scripts/make-win-icon.cjs`. Both `icon-opaque.png` (source) and the generated `icon.png` (transparent) + `icon.ico` are committed; `png-to-ico`/`pngjs`/`sharp` are NOT package.json deps (one-time asset tooling).

### Windows build & install

```powershell
# Full installer (build:all = backend tsc + frontend vite + prepare-backend + prepare-mcp, then electron-builder)
npm run dist:win
#   → release/Eco Setup 1.0.0.exe        (NSIS, ~96 MB, per-user, unsigned)
#   → release/win-unpacked/Eco.exe       (portable — runs without installing)

# Iterate without the installer (just the app folder):
npm run build:all
npm --workspace electron run build:win-dir   # → release/win-unpacked/
```

- **Unsigned** → Windows SmartScreen shows "Windows protected your PC" → *More info → Run anyway*. Required every time until code-signed.
- **Install location**: NSIS is `perMachine: false` (per-user, `%LOCALAPPDATA%\Programs\Eco`, no UAC). If the user picks `C:\Program Files\Eco` they trigger elevation; a half-broken per-machine install there can make a later per-user installer false-positive "Eco cannot be closed". Uninstall via Settings → Apps first, or just use the portable `win-unpacked\Eco.exe`.
- **Kill all instances**: `taskkill /IM Eco.exe /F /T` (an elevated instance needs an elevated shell to kill).
- **Disk paths**: `homedir()` → `C:\Users\<user>\.eco` (works as-is). `dev-sessions.<port>.json` is namespaced by port. chmod-600 is a no-op on NTFS.

### Verification done on a real Windows machine

Backend boots via `ELECTRON_RUN_AS_NODE` and serves `/health` 200; MCP auto-registers (`claude mcp get eco` → Connected); node-pty opens `cmd.exe` and round-trips output; `pidsOnPort` + `taskkill /T /F` free a held port with no orphans; the NSIS installer builds; the app launches with a visible window. PTY/`taskkill`/ports CANNOT be validated from macOS — test on Windows.
