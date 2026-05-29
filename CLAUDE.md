# CLAUDE.md — Eco

Operations manual for any agent working in this repo. Source of truth for rules, file maps, gotchas, and decisions. If something here conflicts with `README.md`, this file wins. The README is the human-facing intro; this file is the operational truth.

## Table of contents

1. [TL;DR](#tldr)
2. [Hard rules](#rules)
3. [Environment](#env)
4. [File map by feature](#filemap)
5. [Processes & storage](#storage)
6. [WebSocket protocol](#ws)
7. [Voice pipeline](#voice)
8. [ServerPanel — dev server per agent](#serverpanel)
9. [BrowserPanel — webview per agent](#browserpanel)
10. [Git tab — changes, history, PRs, review](#gittab)
11. [FilesPanel — tree + editor](#filespanel)
12. [NotesPanel — notes + summarizer](#notespanel)
13. [Archiving](#archiving)
13b. [Backup & Restore](#backup)
14. [GitHub PAT](#githubpat)
15. [Auth, workspaces, worktrees, onboarding](#auth)
16. [Voice/text meta-commands](#metacommands)
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
- **State**: fully standalone. Voice on-device via Swift + Apple Speech (no Python required). Dev servers persist across reloads. Everything bundled.
- **Dev logs flow via WS push** (`dev_log` batched every 80 ms), not polling.

**Read in this order to ramp up:**
1. This file
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

If you spot any of these in live code, it's residue to clean.

---

<a id="env"></a>
## 3. Environment

### Ports by mode

| Mode | Backend | Vite | Renderer origin |
|---|---|---|---|
| `npm run web` | `127.0.0.1:7050` | `127.0.0.1:5173` | `localhost:5173` (real browser) |
| `npm run dev:app` | `127.0.0.1:7050` | `127.0.0.1:5173` | Electron loadURL → Vite |
| Packaged `.dmg` | `127.0.0.1:7100` | served by backend | same origin as backend |

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
| `npm run listener:setup` / `npm run listener` | Python sidecar (wake word + Whisper, optional in dev, not needed in .dmg). |

All dev scripts hardcode `ECO_PORT=7050` / `ECO_BACKEND_PORT=7050` — do not export manually.

### `frontend/.env.local`

```
VITE_ECO_BACKEND=
VITE_ECO_TOKEN=<optional, copy of ~/.eco/token>
```

`VITE_ECO_BACKEND` must be **empty** so calls go through the Vite proxy. An absolute URL forces cross-origin → fragile with CORS. In Electron this env is ignored (`window.electronAPI.getConfig()` returns the right URL via IPC).

### Versions required

- **Node 20** (`nvm use 20.20.2`). Vite 6 doesn't support 16.
- **Python 3.10+** (only if using the Python listener; optional).
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

---

<a id="filemap"></a>
## 4. File map by feature

If you're touching X, the key files are:

### Voice STT (.dmg)
- `electron/native/eco-stt.swift` — Swift CLI using `SFSpeechRecognizer`
- `electron/native/build.sh` — compiles to universal arm64+x64 binary
- `electron/build/bin/eco-stt` — build output (bundled in .app)
- `electron/main.cjs:setPermissionRequestHandler` — grants mic/audioCapture
- `electron/package.json:mac.extendInfo` — `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`
- `frontend/src/hooks/useVoice.ts` — dual pipeline (Web Speech in browser, PCM+WAV+POST in .dmg)
- `backend/src/index.ts` `/voice/transcribe-blob` — endpoint that spawns eco-stt

### Voice STT (browser dev, optional)
- `listener/main.py` — wake → Whisper pipeline
- `listener/training/` — custom "Hey Eco" training
- `backend/src/index.ts` `/voice/transcribed` — receives transcriptions

### Voice TTS
- `backend/src/tts.ts` — Piper (ONNX local)
- `backend/src/tts-macsay.ts` — macOS `say` with Premium/Enhanced voices
- `frontend/src/hooks/useTTS.ts` — unifies both + browser fallback
- `frontend/src/screens/Settings.tsx:SectionVoice` — voice selector

### Dev server per agent
- `backend/src/dev-server.ts` — session manager, spawn/kill, persistence, `scheduleLogFlush`, `forgetSession`
- `frontend/src/components/ServerPanel.tsx` — UI (single/dual, workspace presets, xterm logs, `eco:dev_log` listener)
- `frontend/src/hooks/useDevPresets.ts` — global presets
- `frontend/src/hooks/useWorkspaceServerDefaults.ts` — per-workspace presets
- `backend/src/index.ts` `/dev/{start,stop,restart,status,logs,active}`, `/bubble/close`, `/pty/kill`

### Bubble cleanup
- `backend/src/index.ts:closeBubbleResources(bubbleId)` — kills PTY + dev servers (all 3 roles) + `forgetSession` + `removeWorktree`
- `backend/src/index.ts` endpoints `POST /bubble/close` (semantic) and `POST /pty/kill` (alias)
- `backend/src/dev-server.ts:forgetSession(bubbleId)` — wipes Map entries + disk
- `frontend/src/hooks/useBubbles.ts:removeBubble` — fires `/bubble/close`, clears `eco.*.${bubbleId}` keys

### Browser per agent
- `frontend/src/components/BrowserPanel.tsx` — UI + DevTools + persisted zoom
- `frontend/src/components/SmartBrowserView.tsx` — `<webview>` (Electron) / `<iframe>` (web) wrapper

### Auth
- `backend/src/user-store.ts` — argon2id + BIP39 + `~/.eco/user.json`
- `backend/src/auth.ts` — Bearer token + in-memory sessions
- `backend/src/sessions.ts` — Session TTL 1 h, `X-Eco-Session` header
- `frontend/src/hooks/useAuth.ts` — register/login/recover/lock/destroy
- `frontend/src/screens/AuthScreen.tsx` — view switcher (register/login/show_recovery/recover)
- `frontend/src/components/AccountMenu.tsx` — avatar + lock + destroy

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

### Meta commands ("Eco …")
- `frontend/src/lib/meta-commands.ts` — tolerant parser with `LEADING_FILLERS` and aliases
- `frontend/src/App.tsx:handleMetaAction` — dispatches each `MetaAction`

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
| `~/.eco/token` | 32 B bearer token |
| `~/.eco/user.json` | `{username, pinHash, recoveryHash, photo?}` argon2id |
| `~/.eco/api-key` | Optional Anthropic API key |
| `~/.eco/github.json` | GitHub PAT + cached username/email |
| `~/.eco/dev-sessions.json` | `[{bubbleId, role, pgid, port, command, ...}]` |
| `~/.eco/obsidian.json` | `{vaultPath, enabled}` |
| `~/.eco/backup.json` | `{enabled, folder?, retention, lastBackup?, lastError?}` — config del auto-backup diario |
| `~/.eco/worktrees/<bubbleId>` | Per-agent git worktree |

### Frontend localStorage

All keys use prefix `eco.`. Maintain this prefix when adding new keys:

```
eco.session                              ← session token (X-Eco-Session)
eco.onboarded                            ← '1' once the wizard finished
eco.voice.autostart                      ← '0' to disable auto-listen
eco.tts.enabled / voice / rate / volume
eco.detail.tab.<bubbleId>                ← last active tab (chat|terminal|git|plan|browser|server|files|notes). 'files' legacy maps to 'git' on read.
eco.git.subtab.<bubbleId>                ← Git sub-tab (changes|history|prs); legacy 'branches' auto-migrates to 'changes'.
eco.git.splitter.{changes,history}.<bubbleId>  ← left column width
eco.terminals.<bubbleId>                 ← extra terminals (no Claude) [{id,label}]
eco.terminals.active.<bubbleId>          ← active terminal id in Shell tab
eco.browser.url.<bubbleId>               ← BrowserPanel URL
eco.browser.zoom.<bubbleId>              ← zoom (0.25..3)
eco.dev.dual.<bubbleId>                  ← '1' if dual mode
eco.dev.dual.<bubbleId>.touched          ← '1' once user toggled (controls fallback to workspace preset)
eco.dev.cmd.<bubbleId>.<role>            ← per-slot command (role: main|frontend|backend)
eco.dev.workspace_defaults.<wsPath>      ← workspace preset {dual, main, frontend, backend}
eco.dev.config_collapsed.<bubbleId>      ← '1' collapsed (default true)
eco.dev.min.<role>.<bubbleId>            ← '1' minimized in dual
eco.dev.logheight.<bubbleId>.<role>      ← log pane height in px
eco.dev.restartmode.<bubbleId>           ← 'both'|'frontend'|'backend' for global restart in dual
eco.dev.presets                          ← user-defined global presets
eco.dev.presets.hidden                   ← built-ins hidden by user
eco.remote.<bubbleId>                    ← slug if remote control active
eco.skills.favorites                     ← Skills favorites
eco.skills.fav_collapsed                 ← '1' if Skills favorites collapsed
eco.bubbles                              ← global bubble state (id, title, workspace, messages, archived, …)
eco.categories                           ← configurable categories (id, name, color)
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
| `slot.logs` (ServerPanel) | **200 KB** | `ServerPanel.tsx:LOGS_MAX` | Same. |
| `devLog` (DevTools console) | **200** entries | `BrowserPanel.tsx:DEVLOG_MAX` | Grows infinite otherwise. |
| xterm `scrollback` (Server) | **3 000** lines | `ServerPanel.tsx` | 10 000 was overkill × N instances. |
| xterm `scrollback` (Shell) | **2 000** lines | `RealTerminal.tsx` | |
| `s.output` ring buffer | **64 KB** (`BUFFER_MAX`) | `dev-server.ts` | Capped + **freed on stop** (~line 640). |
| PTY ring buffer | **128 KB** (`RING_BUFFER_MAX`) | `pty-server.ts` | Replay on reconnect. |
| `globalPromptTimestamps` | **1000** | `ws-server.ts` | Defensive cap. |
| `RAW_MAX_SIZE` (file/raw) | **5 MB** | `index.ts` | Inline image preview / raw read. |
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
- `{type:'voice_transcribed', text, ts}` — broadcast when the listener posts
- `{type:'pty_status', bubbleId, running}` — PTY open/closed
- `{type:'dev_status', bubbleId, role, status, port, url, command, exitCode, skill?}` — dev server state change
- `{type:'dev_log', bubbleId, role, chunk}` — dev server stdout/stderr batched every 80 ms
- `{type:'client_action', action}` — own MCP tool asking the client to act

### `/ws/pty` (interactive terminal)

Auth same. Subprotocol with `bubbleId` + `workspace` query.

- Client → server: `{type:'data', data}` (input), `{type:'resize', cols, rows}`
- Server → client: `{type:'data', data}`, `{type:'snapshot', data}` (128 KB replay on reconnect), `{type:'closed', exitCode}`

### Snapshot providers

`ws-server.ts:registerSnapshotProvider(fn)` — any module can register a provider that runs on a new WS connection and replays events so the new client starts in sync. `dev-server.ts` uses this to replay `dev_status` for every live session.

---

<a id="voice"></a>
## 7. Voice pipeline

### Browser mode (`npm run web` in Chrome/Safari)

- `window.SpeechRecognition` (Web Speech API). Chrome supplies the Google API key.
- `useVoice` starts a `SpeechRecognition` with `continuous=true, interimResults=true`.
- Wake word detected in interim text via `stripWakePrefix` (`meta-commands.ts`). The invocation prefix is **mandatory** — `Eco` alone doesn't wake (too common in Spanish "el eco del valle"). Accepted: `hey|oye|oi|hola|ok|okey|okay|che|epa` + `eco|ekko|jarvis|héctor` (regex `h[eé]ctor` matches both accented and unaccented).

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

Effective latency: ~700 ms after you stop talking. Pre-roll catches the attack of the wake; adaptive noise floor handles noisy rooms without calibration.

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

### Single vs dual

- **Single** (default): one `main` slot. One-process projects.
- **Dual** (`eco.dev.dual.<bubbleId>=1`): `frontend` + `backend` slots in parallel. Full-stack.

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

### Workspace preset

`useWorkspaceServerDefaults(workspace)` reads/writes `eco.dev.workspace_defaults.<workspacePath> = {dual, main, frontend, backend}`. "Save as project default" button. New conversations in that workspace inherit the commands.

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
- **Voice command**: `Eco archivos` opens this tab (aliases `explorador`, `arbol`, `files`).

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

Settings → **Backup** permite exportar e importar todo el estado de Eco (agentes, configs, cambios sin commitear por worktree) a un archivo `.zip`. También hay auto-backup diario configurable.

### Qué se incluye en el .zip

```
eco-backup-YYYY-MM-DD-HHMM.zip
├── version.txt          ← "1"
├── metadata.json        ← localStorage (todas las claves eco.*) + ~/.eco/*.json + api-key
└── worktrees/<bubbleId>/
    ├── HEAD.txt         ← "branch\nsha"
    └── diff.patch       ← `git diff HEAD --binary` (vacío si limpio)
```

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

- PIN 4–8 digits + BIP39 12-word recovery phrase → argon2id in `~/.eco/user.json`.
- 32 B in-memory session token, TTL 1 h, header `X-Eco-Session`.
- 32 B persistent bearer token in `~/.eco/token`, validated via `timingSafeEqual` on every request.
- `RegisterView` shows the recovery phrase BEFORE transitioning to `authenticated` — user must confirm.
- Lock screen + delete-user from `AccountMenu`.

### Workspaces

Configured via `ECO_WORKSPACES` env or Settings → Folders. **The workspace must be a git repo** for worktree creation. Pointing at a parent directory (e.g. `~/Documents/GitHub` containing many repos) means Eco can't create a worktree and the agent's commands will fail.

### Worktrees

Each agent with a git workspace gets:
```
~/.eco/worktrees/<bubbleId>  ← worktree on branch eco/<short>
```

The Claude agent, PTY, `git status` polling, and `git diff` operate inside the worktree. Two agents on the same repo are isolated.

On bubble close: PTY dies, worktree is removed (`git worktree remove --force`), **the `eco/<short>` branch stays alive** in the parent repo to merge or review.

List orphan branches: `git -C <repo> branch | grep eco/`

### OnboardingWizard

`frontend/src/screens/OnboardingWizard.tsx` — modal with 9 linear steps:

1. Welcome
2. Language
3. Appearance (theme + accent)
4. Claude auth (CLI or API key)
5. GitHub (PAT optional)
6. Workspace folder
7. Obsidian vault (optional)
8. Voice (autostart toggle)
9. Done

Back/Next nav, each step optional. `eco.onboarded=1` flag prevents re-showing. `eco.voice.autostart=0` persists the voice-off choice. Obsidian vault auto-detected when possible.

---

<a id="metacommands"></a>
## 16. Voice/text meta-commands

Parser: `frontend/src/lib/meta-commands.ts`. Tolerates discourse filler (`me`, `por favor`, `necesito`, `che`, …), synonyms, conjugations, free word order.

### Wake prefix

A wake word + `Eco` (or `Jarvis`/`Ekko`/`Héctor`). `Eco` alone doesn't wake — too short, false positives in natural Spanish. The regex matches `h[eé]ctor` so both `Hector` and `Héctor` work. Accepted:

- `Hey Eco …` · `Oye Eco …` · `Hola Eco …`
- `Ok Eco …` · `Okey Eco …` · `Okay Eco …`
- `Che Eco …` · `Epa Eco …` · `Oi Eco …`

### Navigation

| Command | Action |
|---|---|
| `Eco dashboard` / `Eco inicio` / `Eco atras` | Back to home |
| `Eco ajustes` / `Eco archivos` / `Eco historial` | Switch section |
| `Eco estado` | Overlay with all agents |
| `Eco ayuda` | Command list |

### Agents

`Eco abrir <name>`, `Eco renombrar <name>`, `Eco cerrar`, `Eco ir <name>`, `Eco siguiente/anterior`, `Eco pausar/continuar`.

### Inside a conversation

| Command | Action |
|---|---|
| `Eco chat/terminal/git/plan/navegador/archivos/notas` | Switch tab |
| `Eco historial/prs/cambios` | Git sub-tab. `Eco ramas` opens Git (branches live in the top-bar dropdown). |
| `Eco scroll abajo/arriba/al final` | Scroll active pane |
| `Eco repetir` | Re-read last message (TTS) |
| `Eco si/no/acepta/cancela` | Confirmation dialogs |
| `Eco iniciar/detener/reiniciar servidor` | Server actions (respects dual mode) |
| `Eco activar/desactivar remote control` | Claude remote control |
| `Eco guardar en obsidian` | Save the conversation as a .md note |

### Voice routing inside a conversation

- No wake, in **Chat** → prompt to the agent.
- No wake, in **Terminal → Shell** → typed to the PTY with `\n`.
- With wake (`Hey Eco …`) → meta command, tab-independent.

Implementation: `App.tsx:handleMetaAction` dispatches each `MetaAction`. To add a command: new `MetaAction` kind + alias in `ALIASES` + case in `handleMetaAction` + i18n keys under `cmd.*`.

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
5. Voice in browser (Web Speech): click → listening animation → say "Eco terminal" → tab switches
6. ServerPanel single: `echo hola` → starts → idle (echo exits) → no crash
7. ServerPanel dual: toggle on, valid commands → backend boots first, frontend follows with correct `API_PORT`
8. Browser panel: navigate to `localhost:7100/health` → JSON → switch tab → return → no reload
9. `npm run dmg` produces `.dmg` without errors; bundle contains `Resources/bin/eco-stt` and `Resources/mcp-server/dist/index.js`
10. Installed .app launches; login works; voice works (with macOS Mic + Speech Recognition prompts first time)
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
- **Voice parser**: `frontend/src/lib/meta-commands.ts` — especially `ALIASES` and `parseMetaCommand`
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
