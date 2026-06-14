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

---

<a id="tldr"></a>
## 1. TL;DR

- **Eco** is a local-first macOS Apple Silicon app that orchestrates Claude conversations. Each conversation ("agent" / "bubble") gets its own git worktree, PTY, files, dev server, browser, notes. 100% local except the Anthropic API.
- **Packaged** via Electron 33 + electron-builder 25. `.dmg` arm64 only (~112 MB). Windows/Linux targets removed.
- **User**: Sergio Castro (Florida, USA). Rules in §2 + the global `~/.claude/CLAUDE.md` apply (Obsidian vault, no auto-commits, Spanish UI but English docs).
- **State**: fully standalone. The ONLY voice feature is **terminal dictation** (on-device STT via Swift + Apple Speech in the .dmg, Web Speech in the browser). Everything else voice-related was removed (wake word, voice commands, TTS, voice settings — see the Removed table in §2). Dev servers persist across reloads. Everything bundled.
- **Dev logs flow via WS push** (`dev_log` batched every 80 ms), not polling.
- **Multi-tenant** (admin/member sobre un backend compartido; los users entran por Tailscale). Identidad SIEMPRE de la sesión. Alta por **token de activación** (el admin no fija PINs), habilitar/deshabilitar, estado **server-authoritative cross-device** (doc store por usuario), config de server por workspace (admin), Settings gateado por rol. **Todo el detalle en Appendix D — leelo antes de tocar auth/usuarios/sync/workspace-config.**

**Read in this order to ramp up:**
1. This file (especialmente Appendix D para multi-tenant)
2. `README.md` (product overview)
3. `backend/src/index.ts` (all endpoints)
4. `frontend/src/App.tsx` (command dispatcher + shell setup)
5. `electron/main.cjs` (.dmg lifecycle)

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

> **Regla multi-tenant**: la config compartida (server por workspace, base branches, universo de workspaces, alta/baja de usuarios) la define **solo el admin**; el member la consume. No reintroduzcas edición de esas cosas para members ni storage por-dispositivo para lo que ahora es server-authoritative. La identidad SIEMPRE sale de la sesión (`req.ecoUser`), nunca del cliente.

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
| `npm run dev:backend` / `dev:frontend` / `dev:electron` | Single-service variants. |
| `npm run typecheck` | TS for both workspaces. |
| `npm run check:i18n` / `check:i18n:report` | i18n enforcement (strict / report-only). |
| `npm run test:security` | Backend security test suite. |

All dev scripts hardcode `ECO_PORT=7050` / `ECO_BACKEND_PORT=7050` — do not export manually.

### `frontend/.env.local`

```
VITE_ECO_BACKEND=
VITE_ECO_TOKEN=<optional, copy of ~/.eco/token>
```

`VITE_ECO_BACKEND` must be **empty** so calls go through the Vite proxy. An absolute URL forces cross-origin → fragile with CORS. In Electron this env is ignored (`window.electronAPI.getConfig()` returns the right URL via IPC).

### Versions required

- **Node 20** (`nvm use 20.20.2`). Vite 6 doesn't support 16.
- **`claude` CLI** from `@anthropic-ai/claude-code`, authenticated.
- **Swift 5+** (Xcode CLT) if rebuilding the native CLI.
- **git** (worktrees, branches).

### Backend env vars

| Var | Default | Purpose |
|---|---|---|
| `ECO_WORKSPACES` | (none) | Allowed workspaces (CSV). Also editable from Settings. |
| `ECO_HOST` | `127.0.0.1` | Bind interface — do not change. |
| `ECO_PORT` | `7000` (overridden: 7050 dev, 7100 packaged) | HTTP/WS port. |
| `ECO_ALLOWED_ORIGINS` | (defaults + auto-include own origin) | WS origin whitelist. |
| `ECO_MODEL` | `claude-sonnet-4-5-20250929` | Claude model. |
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

Remote auth: the browser shows **ConnectView** ("Conectar al servidor") and asks for the access token (`~/.eco/token`, share it over a secure channel) → stored in localStorage `eco.token` → `useAuth` detects the missing-bearer state (`!window.electronAPI && !ecoToken()`) → reload → normal PIN login. Idle sessions renew silently (`/auth/session` + bearer); the renewal check in `api.ts` reads the error code from `data.error` (not `data.code`).

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

### Auth (multi-tenant — ver Appendix D)
- `backend/src/users-store.ts` — colección de usuarios argon2id (`~/.eco/users/<id>/user.json`); `createMember`(sin pin)→claimToken, `claimAccount`, `issueClaim`, `setDisabled`, `verifyPin`, `recover` (solo admin dueño), `userStatus`, refresh tokens, `migrateLegacyUserIfNeeded`.
- `backend/src/auth.ts` — Bearer token compartido (`~/.eco/token`)
- `backend/src/sessions.ts` — Session TTL 1 h, `X-Eco-Session` + refresh por usuario (`X-Eco-Refresh`)
- `backend/src/request-context.ts` — AsyncLocalStorage con el userId del request
- `frontend/src/hooks/useAuth.ts` — register/login/**claim**/recover/lock/signOut (sin destroy)
- `frontend/src/lib/auth-role.ts` — rol como singleton (`useIsAdmin`) sin prop-drilling
- `frontend/src/screens/AuthScreen.tsx` — views register/login/recover/show_recovery/**claim** (ClaimView) + ConnectView
- `frontend/src/components/AccountMenu.tsx` — avatar + lock + **cerrar sesión** (sin borrar usuario)
- `backend/src/index.ts` — `/auth/{register,login,claim,recover,session,me,logout}`, `/admin/users*` (ver Appendix D)

### Multi-tenant: cross-device + workspace config + admin (ver Appendix D)
- `backend/src/user-docs.ts` — doc store por usuario (`~/.eco/users/<id>/docs/<key>.json`, LWW). `GET/PUT/DELETE /user/doc(s)`.
- `backend/src/ws-server.ts:broadcastToUser` — push WS `doc_updated`/`doc_deleted` a los otros dispositivos del user.
- `frontend/src/lib/user-sync.ts` + `lib/prefs-sync.ts` — clientes de sync (bubbles/categorías/notas/review/tema).
- `backend/src/workspace-config.ts` + `frontend/src/lib/workspace-config.ts` — config por workspace (admin define server+baseBranches). `GET/POST /workspace-config`.
- `frontend/src/screens/AdminScreen.tsx` + `hooks/useAdmin.ts` — consola admin (alta por código, rol, workspaces, reset-code, habilitar/deshabilitar).

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
- `frontend/src/components/FilesPanel/{FilesPanel,FileEditor,FileTree,QuickOpen}.tsx`
- `backend/src/fs-{tree,search,paths}.ts`
- Editor: CodeMirror 6.

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
- `frontend/src/screens/Dashboard.tsx` — grid + kanban + graph views, satellite pulses

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

| Path | Contents |
|---|---|
| `~/.eco/token` | 32 B bearer token (gate de transporte, compartido) |
| `~/.eco/users/index.json` | Índice de usuarios `[{id, username, role, status, disabled}]` |
| `~/.eco/users/<id>/user.json` | `{username, role, pinHash, recoveryHash, refreshHash, claimHash, claimExpiresAt?, disabled?, workspaceGrants[], …}` argon2id. **Multi-tenant** (ver Appendix D). El legacy `~/.eco/user.json` solo existe como respaldo post-migración. |
| `~/.eco/users/<id>/github.json` | GitHub PAT por usuario |
| `~/.eco/users/<id>/docs/<key>.json` | Doc store cross-device por usuario (`bubble:<id>`, `categories`, `notes:<id>`, `review:<id>`, `prefs`). Autoridad del estado del usuario. |
| `~/.eco/workspace-config.json` | Config por workspace (admin): `{ [ws]: { server, baseBranches } }` |
| `~/.eco/api-key` | Optional Anthropic API key (global, compartida) |
| `~/.eco/dev-sessions.<port>.json` | `[{bubbleId, role, pgid, port, command, ...}]` — namespaced by backend port (7050/7100/7200) so parallel backends don't clobber each other. |
| `~/.eco/obsidian.json` | `{vaultPath, enabled}` |
| `~/.eco/backup.json` | `{enabled, folder?, retention, lastBackup?, lastError?}` — config del auto-backup (cada 2h, retención 30) |
| `~/.eco/audit-log.jsonl` (+ `.1.jsonl`) | Bitácora append-only de eventos de sesión y agentes (`{ts, actorId, actorName, type, workspace?, bubbleId?, meta?}`). Solo la lee el admin vía `GET /admin/audit`. Rota a `.1.jsonl` al pasar `AUDIT_MAX_BYTES` (una generación). NO incluye PINs/tokens/texto de mensajes. |
| `~/.eco/worktrees/<bubbleId>` | Per-agent git worktree |

### Frontend localStorage

All keys use prefix `eco.`. Maintain this prefix when adding new keys:

```
eco.session                              ← session token (X-Eco-Session)
eco.token                                ← bearer token pasted in ConnectView (server mode remote clients only)
eco.refresh                              ← per-user refresh token (X-Eco-Refresh)
eco.lockedUser                           ← username recordado por el lock screen (pide solo PIN)
eco.onboarded                            ← '1' once the wizard finished
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
eco.bubbles.v1                           ← bubble state CACHE (autoridad = docs server `bubble:*`); se reemplaza al loguear
eco.categories                           ← categories CACHE (autoridad = doc server `categories`)
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

Auth via subprotocol: `eco.token.<bearer>`.

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
- `{type:'doc_updated', key, value, updatedAt}` / `{type:'doc_deleted', key}` — push del doc store cross-device a los OTROS dispositivos del MISMO usuario (`broadcastToUser`). Ver Appendix D.

### `/ws/pty` (interactive terminal)

Auth same. Subprotocol with `bubbleId` + `workspace` query.

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
- **CodeMirror 6 editor**: ~138 KB gzip (+1.5 MB in .dmg, vs ~15 MB for Monaco). Eager syntax highlighting for TS/JS/JSON/CSS/HTML/MD; the rest lazy via `@codemirror/language-data`. Theme derived from Eco design tokens with neutral background (pure black/white) so contrast holds across themes.
- **Explicit save** with `Cmd+S` + dirty indicator. `POST /file/save` takes `expectedMtime` to detect conflicts. On conflict, the UI opens a Reload / Overwrite dialog.
- **Unstaged changes visible from the tree**: combines editor dirty + git status. Files in either state show amber; ancestor folders show a dimmed dot. On commit, dots clear.
- **Find-in-file** (`Cmd+F`, CodeMirror native) + **Quick Open** (`Cmd+P`, fuzzy filter over cached tree, `maxDepth=6` on first open) + **Global Search** (`Cmd+Shift+F`, ripgrep with `grep -rn` fallback, 8 s timeout, 500 hits cap, click navigates to line/column).
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
POST /fs/search     {workspace, bubbleId, query}
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

Settings → **Backup** (solo admin — respalda a TODOS los usuarios) permite exportar e importar todo el estado de Eco a un `.zip`. Auto-backup **cada 2h, retención 30** configurable.

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

> **Multi-tenant**: el modelo completo (roles, alta por token de activación, deshabilitar,
> recuperación) está en **Appendix D**. Resumen acá:

- **Multi-usuario** en `~/.eco/users/<id>/user.json` (argon2id). PIN 4–8 dígitos.
- El **primer usuario** = admin dueño, registrado en `RegisterView` (muestra la **frase BIP39** antes de entrar). Es el único con frase de auto-recuperación.
- A los demás los crea el **admin** sin PIN → **token de activación**; el usuario define su PIN en `ClaimView` ("Activar cuenta"). Reseteo = token nuevo. **Members sin frase BIP39**.
- 32 B in-memory session token, TTL 1 h, header `X-Eco-Session`. **Refresh token por usuario** (`X-Eco-Refresh`).
- 32 B persistent bearer token in `~/.eco/token` (gate de transporte, compartido), validado via `timingSafeEqual`.
- **Lock screen**: recuerda al último usuario en `eco.lockedUser` y pide solo el PIN; "Cerrar sesión" lo olvida. **No hay borrar-usuario** en `AccountMenu` (ni admin ni member).
- **Deshabilitar/habilitar** usuarios desde la consola admin; un `disabled` no entra (mensaje genérico) y se cae de la sesión al instante.

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

- **Backend ESM**: `import.meta.url` instead of `__dirname`; `.js` extensions in relative imports.
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
- Bash blacklist + env allowlist in `security.ts`.
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
## 19. Build & .dmg packaging

### Clean build for the .dmg

```bash
# 1) Node 20
source ~/.nvm/nvm.sh && nvm use 20.20.2

# 2) If you touched the Swift CLI, rebuild it
./electron/native/build.sh

# 3) If a previous build left the DMG volume mounted, detach it
hdiutil detach -force "/Volumes/Eco 0.1.0" 2>/dev/null || true

# 4) Clean build of the .dmg
pkill -9 -f "Eco" 2>/dev/null
rm -rf release frontend/dist backend/dist
npm run dmg
# Expected output:
#   release/Eco-0.1.0-arm64.dmg    (~112 MB)
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

## Appendix D: Multi-tenant (rol admin + per-user)

> **Estado:** mergeado a `main`. Convierte Eco de single-user a **multi-tenant sobre
> un único backend compartido** (una Mac corriendo el server; los usuarios entran por
> Tailscale). El CLI de Claude es **compartido** (una sola auth/billing). Aislamiento
> **lógico a nivel app** (equipo de confianza). Incluye: alta por **token de
> activación** (el admin no fija PINs), habilitar/deshabilitar usuarios, estado
> **server-authoritative cross-device** (doc store por usuario), config de server +
> base branches **por workspace definida por el admin**, y gating de Settings por rol.

### Invariante central
La identidad SALE SIEMPRE de la sesión, NUNCA del cliente:
- HTTP: `X-Eco-Client:1` → `Authorization: Bearer <token compartido>` (gate de transporte, NO identidad) → `X-Eco-Session: <id>` → el middleware setea `req.ecoUser = { id, role, username }`.
- WS (`/ws`, `/ws/pty`): subprotocolos `eco.token.<bearer>` (transporte) + `eco.session.<sessionId>` → el backend resuelve el userId dueño de la conexión.
- Los handlers/spawns usan `req.ecoUser.id` o `bubble.ownerId`. Un userId/ownerId mandado por el cliente se ignora.
- `request-context.ts` (AsyncLocalStorage) lleva el userId del request HTTP en curso → `githubEnvOverrides()`/`isAllowedWorkspace()` resuelven el usuario sin threadear userId por todos lados.

### Modelo de datos (por usuario)
- `~/.eco/users/<userId>/user.json` = `{ id, username, role: admin|member, pinHash, recoveryHash, refreshHash, claimHash, claimExpiresAt?, disabled?, workspaceGrants[], … }` (argon2id + BIP39). Índice en `~/.eco/users/index.json` (lleva `status` + `disabled`). Módulo: `backend/src/users-store.ts`.
  - `pinHash:''` = **pending** (creado pero sin activar). `claimHash` = argon2 del secreto del token de activación vigente (null una vez activado). `claimExpiresAt` = epoch ms (TTL 7d). `disabled` ausente = false. Estado derivado: `userStatus()` → `pending | active | disabled`.
- `~/.eco/users/<userId>/github.json` — PAT por usuario (`github-credentials-store.ts` toma userId; fallback al primer admin para procesos sin sesión).
- `~/.eco/users/<userId>/docs/<key>.json` — **doc store cross-device** (`backend/src/user-docs.ts`): cada "store" del frontend es un doc `{ key, value, updatedAt }`, LWW por doc. Keys: `bubble:<id>` (bubble + mensajes, uno por archivo), `categories`, `notes:<id>`, `review:<id>`, `prefs` (tema/idioma). ES la autoridad del estado del usuario — el localStorage es solo cache de primer paint. El `:` se mapea a `__` en el nombre de archivo (`safeKey`).
- `~/.eco/workspace-config.json` — config **por workspace definida por el admin** (`backend/src/workspace-config.ts`): `{ [wsPath]: { server:{dual,main,frontend,backend}, baseBranches } }`. La leen todos (filtrada a sus workspaces visibles), la escribe solo el admin.
- Bubbles: `bubbles-index.ts` mantiene un summary por usuario con `ownerId` (para admin/overview/MCP). El contenido autoritativo vive en los docs `bubble:*`.
- Sesiones (`sessions.ts`): llevan `userId` + `role`. Renovación vía **refresh token por usuario** (`X-Eco-Refresh`), NO el bearer compartido. Un usuario `disabled` se cae del middleware de sesión al instante (lee `user.json`).
- API key de Claude: global (`~/.eco/api-key`) — compartida por decisión.

### Auth — alta por token de activación (el admin NUNCA ve ni fija PINs)
- **Primer usuario** = admin dueño (`/auth/register` solo si no hay usuarios). Es el ÚNICO con **frase BIP39** (auto-recuperación). `createBootstrapAdmin`.
- **Alta de usuarios**: el admin crea con **nombre + rol** (sin PIN) → `createMember` devuelve un **token de activación** de un solo uso (`<userId>.<secret>`, argon2 at rest, TTL 7d). El admin lo comparte; el usuario lo pega en la vista **"Activar cuenta"** (`POST /auth/claim {claimToken, pin}`, bearer-exempt) y define **su propio PIN** → `claimAccount` setea `pinHash`, limpia `claimHash`, mintea sesión+refresh.
- **Reseteo de PIN** = el admin emite un token nuevo (`issueClaim`), NO fija PIN. El PIN viejo sigue válido hasta que se complete la re-activación (evita lockout). Los **members no tienen frase BIP39** — se resetean siempre por token.
- **Habilitar/deshabilitar**: `setDisabled` + `disabled` flag. Deshabilitado rechazado en login (vía `verifyPin`, mensaje **genérico** anti-enumeración), en `/auth/session` (refresh) y en el middleware de sesión vivo (se cae al instante, no espera el TTL de 1h). Al deshabilitar se corta el `refreshHash`.
- Login = **usuario + PIN** (`/auth/login`). Lock screen recuerda al último user en `eco.lockedUser` y pide solo el PIN; "Cerrar sesión" lo olvida. **No hay opción de borrar la propia cuenta** para nadie.
- Migración one-time al boot: `~/.eco/user.json` viejo → primer admin; `~/.eco/github.json` → su carpeta (`migrateLegacyUserIfNeeded`). Usuarios legacy quedan `active` sin migración (defaults defensivos: `claimHash:null`, `disabled:false`).
- Endpoints admin tras `requireAdmin`: `GET /admin/users` (incluye `status`+`disabled`), `POST /admin/users {username, role?}` → `{ claimToken }`, `DELETE /admin/users/:id`, `POST /admin/users/:id/{role,workspaces}`, `POST /admin/users/:id/issue-claim` → `{ claimToken }`, `POST /admin/users/:id/disabled {disabled}` (no podés deshabilitarte a vos mismo), `GET /admin/overview`.
- Frontend: `useAuth.claim`; `AuthScreen` view `claim` (ClaimView), link "¿Tenés un código de activación?" en login y "¿No tenés frase? Pedile al admin un código" en RecoverView. Rol del usuario como singleton sin prop-drilling: `frontend/src/lib/auth-role.ts` (`useIsAdmin`).

### Per-user git identity + workspace ACL (F1)
- Cada usuario maneja su PAT desde Settings → GitHub (web incluida). Los spawns (PTY/agente) inyectan `githubEnvOverrides(ownerId)` → commits/push con la identidad del dueño de la bubble.
- `config.ts:isAllowedWorkspace(target, userId?)` + `workspacesForUser(userId?)`: admin = todos; member = `workspaceGrants`; sin userId = legacy global. El universo global (`ECO_WORKSPACES`/`workspaces-store`) lo gestiona solo el admin.

### Estado server-authoritative cross-device (doc store)
- Al loguear, el frontend hidrata TODO su estado del servidor (`GET /user/docs`) y **reemplaza** el localStorage (no mergea — evita estado viejo o de otro usuario). Cada cambio sube por `PUT /user/doc {key,value,updatedAt}` (debounced), que además hace **push WS** (`doc_updated`/`doc_deleted`) a los OTROS dispositivos del mismo usuario (`broadcastToUser` en `ws-server.ts`). `DELETE /user/doc` borra. LWW por doc (`updatedAt`).
- Frontend: `lib/user-sync.ts` (genérico), `lib/prefs-sync.ts` (tema/idioma), y los hooks `useBubbles`/`useCategories`/`useReviewState` + `NotesPanel/types` hidratan y guardan su doc. `App.tsx` hidrata todo en el effect on `userId`. Las prefs de UI por-bubble (anchos, tab activa, zoom, terminales) quedan **locales al dispositivo**.

### Config de server + base branches por workspace (admin define, member consume)
- `backend/src/workspace-config.ts` + `frontend/src/lib/workspace-config.ts` (store-singleton + `useWorkspaceConfig`/`saveWorkspaceConfig`). `GET /workspace-config` (sesión, filtrado a workspaces visibles), `POST /workspace-config` (`requireAdmin`).
- El **admin** define el/los comando(s) de dev server (single/dual) y las base branches favoritas **en Settings → Folders** por workspace. El **ServerPanel de cada burbuja es solo-consumo**: muestra el comando read-only y solo Iniciar/Detener/Reiniciar (el member no edita nada). El diálogo de nuevo agente lee las base branches del server config. Reemplazó el viejo localStorage `eco.dev.workspace_defaults.*` / `eco.worktree.favorites.*`.

### Gating de Settings por rol
- Solo admin: secciones **Claude & API**, **Folders**, **Integraciones** (Obsidian + MCP server, recursos del anfitrión), **Backup**; y en **General** los toggles "Barra de menú" y la acción "Limpiar worktrees" (cosas de host/dispositivo). (La sección **Voice** y los toggles de "Escuchar al iniciar" se eliminaron junto con la voz.) El member ve General (review/notify/dock/carpeta/atajo/idioma/IDE/sugerencias), GitHub, Seguridad, Apariencia, Acerca de. **History** está oculto del menú lateral para todos.

### Consola de admin
- `frontend/src/screens/AdminScreen.tsx` (gated en `AppSidebar` por `role==='admin'`): Usuarios (crear con nombre+rol → diálogo con código copiable; rol; workspaces; generar código de reseteo; habilitar/deshabilitar; borrar; badge pending/disabled) + Actividad (usuario → bubbles con dot de estado + badges PTY/DEV, `GET /admin/overview`). Hook: `useAdmin.ts`. **Sin inputs de PIN** en ningún lado.

### Backup
- `backup.ts` captura `~/.eco/users/**` **incluyendo la subcarpeta `docs/` por usuario** (ahí viven bubbles+mensajes, categorías, notas, review en el modelo cross-device) además de los archivos planos. `restoreEcoState` acepta rutas de 3 niveles (`<id>/docs/<key>.json`) y el schema de `/backup/restore` acepta `eco.users` como objeto anidado (`z.union([z.string(), z.record(z.string())])`). El objeto `eco` del snapshot es opaco para el frontend. Solo admin (cada 2h, retención 30).

### Caveat de aislamiento
Todos los spawns corren como el MISMO usuario del SO y comparten el CLI de Claude. Eco separa por usuario en la capa de la app, pero alguien con acceso al SO puede leer worktrees/credenciales de otros bajo `~/.eco`. Aceptable para equipo de confianza; NO es aislamiento endurecido.

### Hardening pendiente (diferido — defense-in-depth bajo aislamiento lógico)
- **Filtrado de broadcasts por usuario**: `dev_status`/`pty_status`/`dev_log`/`client_action` se emiten a todos los clientes WS (un usuario ve el estado/logs de dev-servers y PTYs de otros). La respuesta del agente (`sdk_message`) SÍ va por-conexión (no se filtra mal).
- **Namespacing de localStorage de bubbles por usuario** (`eco.bubbles.v1.<userId>`): hoy es global por navegador. Irrelevante en el modelo una-máquina-por-persona, pero si dos usuarios distintos entran en el MISMO navegador, el `/bubbles/sync` re-asignaría ownership. No hacer login de otro usuario en un navegador con bubbles de otro.
- **Namespacing de directorios de worktree por usuario**: hoy `~/.eco/worktrees/<bubbleId>` (plano). No causa colisiones (bubbleIds son únicos globalmente) y la ownership la imponen los checks de endpoint; queda como hardening.
- **Token MCP por usuario**: el MCP server (`/bubble/create|send`, `/bubbles`) atribuye al primer admin cuando no hay sesión. Falta un token MCP por usuario (`X-Eco-Mcp`).
- **Ownership fino en endpoints FS** (`/fs/tree`, `/file/*`): hoy gateados por `isAllowedWorkspace` (per-usuario vía ALS) + early-return incondicional de worktrees.
