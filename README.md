# Eco

Local-first desktop app for orchestrating parallel Claude agents on **macOS Apple Silicon**, **Windows x64**, and **Linux** (experimental). Each conversation is an isolated "bubble" with its own git worktree, real terminal, file editor, dev server, and embedded browser. Your code and compute stay on your machine; identity and conversation state sync through Firebase. Distributed as a native `.dmg` (~112 MB) on macOS and an NSIS `.exe` (~96 MB) on Windows, built with Electron 33.

```
        ┌───────────────────────────────────────┐
        │                                       │
        │   Each conversation is a "bubble":    │
        │                                       │
        │     · isolated git worktree           │
        │     · real terminal (PTY)             │
        │     · file editor + dev server        │
        │     · embedded browser                │
        │                                       │
        │   Heavy work runs locally — your      │
        │   files never leave the machine.      │
        │   Identity + agent state sync via      │
        │   Firebase (Auth + Firestore).        │
        │                                       │
        └───────────────────────────────────────┘
```

> **For agents working in this repo, the operational truth lives in [CLAUDE.md](./CLAUDE.md)** — rules, file maps, gotchas, endpoints, env vars, debug recipes. This README is the human-facing intro.

## Table of contents

1. [What is Eco](#what-is-eco)
2. [Architecture at a glance](#architecture)
3. [Highlights](#highlights)
4. [Requirements](#requirements)
5. [Configuration](#configuration)
6. [Install + first run](#install)
7. [Build the installer](#build)
8. [Project structure](#structure)
9. [Feature tour](#tour)
10. [Terminal dictation](#voice)
11. [Skills](#skills)
12. [Privacy & security](#privacy)
13. [Tech stack](#stack)
14. [Roadmap](#roadmap)
15. [License & credits](#license)

---

<a id="what-is-eco"></a>
## 1. What is Eco

Eco is a Claude Agent SDK orchestrator. Each conversation is a self-contained **"bubble"** with its own session, isolated git **worktree**, real terminal (PTY), file editor, dev server with auto-port, embedded Chromium browser with its own partition, and Claude-summarized notes.

When you work on a git repo, each bubble auto-creates a worktree at `~/.eco/worktrees/<bubbleId>` on its own `eco/<short>` branch (base branch chosen at creation, with per-workspace favourites). Two bubbles on the same repo never collide — separate dev server ports (race-free auto-assignment), isolated browser session, separate terminal. Closing the bubble wipes the worktree; the branch survives in the parent repo for review or merge.

Switching between bubbles A → B → A reloads nothing — each open bubble keeps its panel tree alive (webview, PTY, chat, files, notes, server). Cleanup only fires on explicit close.

Eco is **multi-user**: one machine runs the local backend, and team members sign in with their own Firebase account. Each user's agents, conversations and preferences sync across their devices and are isolated from everyone else's by Firestore Security Rules.

---

<a id="architecture"></a>
## 2. Architecture at a glance

Eco runs on two planes. The **local plane** does all the heavy lifting and never sends your code anywhere; the **cloud plane** holds only identity and the metadata of your conversations so the experience is multi-user and cross-device.

```
   ┌──────────────────────── CLOUD (Firebase) ────────────────────────┐
   │  Firebase Auth (email + password) ── issues ID token (JWT)        │
   │  Firestore  ── source of truth for multi-tenant app state:        │
   │     users/role · bubbles + messages · categories · notes ·        │
   │     review · prefs · auditLog   ── gated by firestore.rules       │
   └───────────────────────────────┬──────────────────────────────────┘
                  ID token (Bearer) │  client SDK (rules-gated)
                                    │
   ┌──────────────────────── LOCAL (127.0.0.1) ───────────────────────┐
   │  Frontend (Electron / browser, React + Vite)                      │
   │  Backend (Node + Express + ws)                                    │
   │   · verifies the Firebase ID token statelessly (JWKS, no authz)   │
   │   · git worktrees · PTYs · dev servers · file ops · git ops       │
   │   · voice transcription · notes summarizer · backup               │
   │  Disk: ~/.eco (worktrees, dev sessions, GitHub PAT, API key)      │
   └───────────────────────────────────────────────────────────────────┘
```

- **Identity is cloud.** You log in with Firebase Auth. The frontend attaches the resulting ID token to every request to the local backend (`Authorization: Bearer <jwt>`) and to WebSocket connections (subprotocol `eco.idtoken.<jwt>`).
- **Authorization is Firestore.** The local backend verifies the ID token against Google's public keys (stateless, no service account) but does **not** make authorization decisions — it serves a single machine. Who can read or write which document is enforced entirely by `firestore.rules`.
- **State is cloud, compute is local.** Your bubbles, messages, categories, notes, review state and preferences live in Firestore and sync live across your devices. Your **code, files, terminals, dev servers and git operations are local** — they run in the backend on `127.0.0.1` and never leave the host.
- **The only external calls** are the Anthropic API (when an agent needs it) and Firebase (Auth + Firestore).

---

<a id="highlights"></a>
## 3. Highlights

- **Bubbles + worktrees** — every conversation gets an isolated git worktree, PTY, and dev server. Branch lives in the parent repo after close.
- **Multi-user via Firebase** — sign in with email + password. The admin creates teammates in-app; Firestore Security Rules isolate each user's data. Roles (admin/member) live in Firestore, not in the client.
- **Cross-device state** — bubbles, conversations, categories, notes, review state and theme live in Firestore and sync live across your devices. Log in from any machine and find your work, with offline persistence for the first paint.
- **Local PIN lock** — an optional quick-unlock PIN that locks/unlocks an existing Firebase session on the device (it is a convenience lock, not account auth).
- **Terminal dictation** — optional "Hablar a la terminal" button dictates into the PTY. On-device STT in the packaged macOS app (Apple Speech), Web Speech in the browser. The mic only runs while you're dictating.
- **Cursor-style review** — agent edits freely; you review diffs after with amber/green dots, accept/revert by hunk or by file. Opt-in toggle.
- **Diff viewer with merge view** — full file shown side-by-side with diffs highlighted (`@codemirror/merge`), sync scroll, collapse unchanged regions on/off, per-chunk navigation + Accept/Reject in review mode.
- **FilesPanel** — mini-VS-Code per bubble: lazy gitignore-aware tree (**virtualized** for large repos), CodeMirror 6 editor with a **fixed multi-color IDE syntax palette**, indent guides, rainbow bracket pairs, a clickable path breadcrumb, and file-type icons. `Cmd+P` Quick Open (fuzzy, match-highlighted), `Cmd+Shift+F` global search (ripgrep, match-highlighted), **find usages** (Cmd/Ctrl+click or Shift+F12 — textual whole-word search of the symbol), save with conflict detection, image preview, and an **"↗ IDE" button** to open the current file at the exact line in VSCode / IntelliJ / WebStorm / Cursor. Eco has no built-in debugger or LSP — set breakpoints in the external IDE; find-usages is textual, not semantic.
- **NotesPanel + summarizer** — markdown notes per bubble. One click runs Claude (`claude -p`) on the recent messages + last 60 KB of the PTY buffer and produces a 3-section summary (what we were doing / where we left off / next steps).
- **Dual dev server** — frontend + backend in parallel with auto-port. Eco assigns ports via `PORT` / `SERVER_PORT` / `JAVA_TOOL_OPTIONS=-Dserver.port=…` / `API_PORT` / `BACKEND_URL` env vars covering most frameworks. Backend boots first, frontend follows.
- **Browser per agent** — real Chromium `<webview>` with persisted cookies (per-bubble partition), DevTools, persisted zoom and URL.
- **Git tab** — GitHub Desktop-style layout: branch dropdown + sync, sub-tabs Changes / History / PRs. Cherry-pick, revert, hard-reset with safety prompt, op-in-progress banner with Continue/Abort.
- **Solo-bubble window** — pop a single bubble into its own window (handy on a second monitor) while the rest of the app stays put.
- **Archiving** — kill the running processes, keep the worktree and branch. Restore or permanently delete from the Archived screen.
- **GitHub PAT** — store a Personal Access Token once, validated against GitHub; auto-injected as `GH_TOKEN` + git author env into every spawned process.
- **Remote team access (Tailscale)** — `npm run serve:web` exposes Eco to the tailnet over HTTPS (`tailscale serve`); teammates connect from a browser (even an iPad). Dev-server previews are exposed per-port over the tailnet too.
- **Admin console** — manage users (create / role / enable-disable / password reset) and watch who is working on which bubble, plus an append-only audit log. Server commands + favorite base branches are defined **by the admin per workspace**; members only start/stop.
- **Obsidian integration** — save the current conversation as a `.md` note in your vault.
- **Onboarding wizard** — multi-step setup on first run (language, theme, Claude auth, GitHub, workspace, Obsidian).
- **Bilingual** — Spanish ⇄ English UI. Detects system language; switch from Settings. Backend errors come with stable codes; the frontend translates.
- **Themes** — 14 curated themes (9 dark + 5 light) plus "follow system", each with a signature accent hue. `glassEffect` helper for Liquid Glass styling.

---

<a id="requirements"></a>
## 4. Requirements

- **macOS Apple Silicon** (arm64), **Windows x64**, or **Linux x64** (AppImage target is experimental/untested). macOS Intel is not packaged.
- **Node 20** (`nvm use 20.20.2` works). Vite 6 doesn't support Node 16.
- **`claude` CLI** from `@anthropic-ai/claude-code`, authenticated (`claude login` or an API key saved from Settings). On Windows, the native installer's `claude.exe` is auto-resolved; otherwise set `CLAUDE_CLI_PATH` to a real `.exe`.
- **A Firebase project** (Auth with Email/Password enabled + Firestore). The default project id used by the dev scripts is `aditum-eco`. The web config values go into `frontend/.env.local`; the backend only needs the project id to verify ID tokens. See [Configuration](#configuration).
- **git** (worktrees, branches).
- **`gh` (GitHub CLI)** — required for the **PRs sub-tab** of the Git panel. Without `gh`, the Changes/History sub-tabs work fine but `PRs` shows `pr.gh_missing`. Install with `brew install gh` (macOS) or `winget install GitHub.cli` (Windows). The GitHub PAT you save in Settings is injected as `GH_TOKEN` — it does NOT replace the `gh` binary.
- Optional (macOS only): **Xcode Command Line Tools** to rebuild the Swift dictation CLI (`eco-stt`). **Terminal dictation is macOS-only** — the button is hidden elsewhere.

---

<a id="configuration"></a>
## 5. Configuration

Eco reads configuration from two `.env` files. Copy the provided examples and fill them in.

### Frontend — `frontend/.env.local`

```bash
# Local backend wiring
VITE_ECO_BACKEND=          # leave EMPTY so calls go through the Vite proxy
VITE_ECO_TOKEN=            # optional: copy of ~/.eco/token (web dev only)

# Firebase web config (Auth + Firestore). This config is PUBLIC, not a secret —
# real security is enforced by firestore.rules. Copy the values from the Firebase
# console → Project settings → your web app.
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

`VITE_ECO_BACKEND` must be **empty** so calls use the Vite proxy (an absolute URL forces cross-origin → fragile CORS). In Electron this is ignored — the right backend URL arrives over IPC.

### Backend — `backend/.env`

```bash
ECO_WORKSPACES=/path/to/your/repo      # comma-separated; also editable from Settings
ECO_HOST=127.0.0.1                     # bind interface — never change
ECO_PORT=7000                          # overridden to 7050 (dev) / 7100 (packaged)
ECO_MODEL=claude-sonnet-4-5-20250929
ECO_RATE_LIMIT=10                      # prompts per minute
# CLAUDE_CLI_PATH=/Users/you/.local/bin/claude   # optional; autodetected
ECO_FIREBASE_PROJECT_ID=aditum-eco     # used to verify Firebase ID tokens
```

The `dev:backend` script already exports `ECO_PORT=7050` and `ECO_FIREBASE_PROJECT_ID=aditum-eco`, so for local dev you usually only need `ECO_WORKSPACES`. For the full env-var reference, see [CLAUDE.md §3](./CLAUDE.md#env).

### Firestore (optional, for rules work)

`firebase.json` configures the local emulators (Auth `:9099`, Firestore `:8085`). Run the Security Rules tests with `npm run test:rules` (executes `scripts/firestore-rules.test.mjs` against the emulator). The rules themselves live in `firestore.rules` and the composite indexes in `firestore.indexes.json`.

---

<a id="install"></a>
## 6. Install + first run

```bash
# 1) Install workspace deps (frontend + backend + electron)
npm install

# 2) Configure the two .env files (see "Configuration" above)
cp backend/.env.example backend/.env            # edit ECO_WORKSPACES
cp frontend/.env.example frontend/.env.local    # fill in VITE_FIREBASE_*

# 3a) Web mode — backend + Vite, open localhost:5173 in your browser
npm run web

# 3b) App mode — Electron window + hot-reload + DevTools
npm run dev:app

# 4) Register the first account in the app (email + password). Then promote it to
#    admin once, from a machine with a Firebase service account:
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
  npm run bootstrap:admin you@example.com
```

The first admin needs the one-time `bootstrap:admin` step because the admin role is a Firestore field and nobody can promote themselves (enforced by the rules). After that, the admin creates and manages everyone else from the in-app **Admin** console.

> **macOS AirPlay Receiver owns port 7000.** Eco's dev backend uses `:7050`. To free 7000, turn off AirPlay Receiver in *Settings → General → AirDrop & Handoff*. Override at any time with `ECO_PORT=<n>`.

---

<a id="build"></a>
## 7. Build the installer

Mac, Windows and Linux **cannot be cross-built** — build each on its own OS. All three share `npm run build:all` (backend tsc + frontend vite + prepare-backend + prepare-mcp); only the final electron-builder target differs.

**macOS** (`.dmg`):

```bash
npm run dmg                       # alias for dist:mac
# → release/Eco-1.0.0-arm64.dmg   (~112 MB)
# → release/mac-arm64/Eco.app     (~296 MB installed)
```

The `.dmg` is unsigned (`identity: null`) — fine for personal use. To distribute, add Apple Developer ID code signing + notarization. If you modified the Swift dictation CLI (`eco-stt`), run `./electron/native/build.sh` first.

**Windows** (NSIS `.exe`), from a Windows machine with PowerShell:

```powershell
npm run dist:win
# → release/Eco Setup 1.0.0.exe   (NSIS, ~96 MB, per-user, unsigned)
# → release/win-unpacked/Eco.exe  (portable — runs without installing)
```

The installer is unsigned, so Windows SmartScreen shows "Windows protected your PC" → click *More info → Run anyway*.

**Linux** (AppImage, experimental/untested):

```bash
npm run dist:linux
# → release/Eco-1.0.0.AppImage (x64)
```

The build config (`electron/electron-builder.config.cjs`) filters native prebuilds (node-pty, ripgrep) per target, and the OS-dependent backend lives in `backend/src/platform.ts`. For the full Windows reference (build, prepare scripts, icon generation, gotchas) see [CLAUDE.md Appendix E](./CLAUDE.md#windows); for the macOS reinstall recipe see [CLAUDE.md Appendix B](./CLAUDE.md#debug).

---

<a id="structure"></a>
## 8. Project structure

```
eco/
├── README.md                  ← this file
├── CLAUDE.md                  ← operational manual (rules, gotchas, endpoints, debug)
├── package.json               ← workspace root + parallel scripts
│
├── backend/                   ← Node + Express + Claude SDK + node-pty (OS seam: src/platform.ts)
├── frontend/                  ← Vite + React + TS + Motion + Tailwind v4 (Firebase client SDK)
├── electron/                  ← Electron 33 wrapper + electron-builder.config.cjs + Swift dictation CLI (eco-stt, macOS)
├── mcp-server/                ← standalone MCP stdio server (create/list bubbles from Claude Code)
│
├── firestore.rules            ← Firestore Security Rules (the authorization boundary)
├── firestore.indexes.json     ← composite indexes (bubbles, categories, auditLog)
├── firebase.json              ← Firestore + emulator config (auth:9099, firestore:8085)
├── .firebaserc                ← Firebase project id (aditum-eco)
│
├── scripts/                   ← check-i18n · eco-server (Tailscale) · bootstrap-admin ·
│                                firestore-rules.test · restore-backup-to-firestore
└── release/                   ← electron-builder output (gitignored)
```

For the per-feature file map (which file does what, which hook drives which UI), see [CLAUDE.md §4](./CLAUDE.md#filemap).

---

<a id="tour"></a>
## 9. Feature tour

### Bubbles + worktrees

Every conversation is a bubble. When you create one in a git workspace, a worktree is checked out at `~/.eco/worktrees/<bubbleId>` on its own branch `eco/<short>`. The agent edits there. Two bubbles on the same repo never collide. On close, the worktree is removed (with a confirmation modal if it's dirty); the branch survives in the parent repo.

### Terminal (PTY)

Real shell PTY per bubble (via `node-pty`), with `claude` auto-launched on open (configurable). Survives leaving the bubble — reconnect with a 128 KB replay buffer. The "Hablar a la terminal" button lets you dictate text into the terminal (you review before running).

### FilesPanel

A mini-VS-Code inside the bubble's worktree: lazy gitignore-aware tree, CodeMirror 6 editor, dirty indicator, `Cmd+S` save with conflict detection (`expectedMtime`), `Cmd+F` find-in-file, `Cmd+P` Quick Open, `Cmd+Shift+F` global search via ripgrep, inline image preview. Files with unstaged changes show an amber dot in the tree. A "Send to Claude" floating button pushes selected code + path into the agent's terminal.

### NotesPanel

Markdown notes per bubble with debounced autosave. The "Summarize" button runs Claude (`claude -p`) over the recent messages and the last 60 KB of the PTY buffer (90 s timeout) and writes back a 3-section summary: what we were doing / where we left off / next steps. Useful before a `/clear` or when handing off.

### Git tab

GitHub Desktop-style layout. The top bar carries the current branch dropdown (searchable, Local/Remote), a sync button that adapts to the state (`Publish` / `Push` / `Pull` / `Sync` / `Fetch`), and a `⋯` menu for merge, rename, view PRs. Three sub-tabs:

- **Changes** — file list with amber/green dots from `git status --porcelain`; inline diff per file; sticky Commit-with-AI box at the bottom. Cursor-style review (opt-in setting) adds per-hunk accept / revert.
- **History** — paginated log; cherry-pick to another branch, revert, reset to here (hard requires typing `HARD RESET`), copy SHA.
- **PRs** — list with checkout; `CurrentPrBanner` on the right rail when the branch has an open PR. **Requires `gh` installed**; the GitHub PAT alone is not enough.

A floating `GitBusyToast` appears while a git op is in flight. An `OpInProgressBanner` detects cherry-pick / merge / revert in progress and offers Continue / Abort / "Resolve in Changes".

### Dev server per bubble

The **Server** tab manages gulp / Vite / Spring Boot / etc. inside the worktree. Single or dual mode (frontend + backend in parallel, defined by the admin per workspace). Each slot receives a free random port injected as env vars (`PORT`, `SERVER_PORT`, `JAVA_TOOL_OPTIONS=-Dserver.port=…`, `API_PORT`, `BACKEND_URL`, etc.) covering most frameworks. In dual, backend boots first; frontend follows when backend reports `running`. Sessions persist to disk (`~/.eco/dev-sessions.<port>.json`) and re-adopt across backend reloads via pgid.

> **Rule for commands**: do NOT hardcode ports. Use the env vars Eco injects.

### Browser per bubble

Real Chromium `<webview>` (Electron) or `<iframe>` (web dev). Per-bubble cookies via partition; persisted URL + zoom. DevTools available via right-click → Inspect. Auto-navigates to the dev server URL when it goes `running`.

### Solo-bubble window

Pop a single bubble into its own window — useful on a second monitor or to keep one agent visible while you work elsewhere in the app. Firebase offline persistence supports multiple windows, so each window stays in sync.

### Archiving

When a bubble is no longer active but you don't want to lose its state, archive it. Eco kills the PTY and dev servers but **keeps the worktree and branch alive**. Restore from the Archived screen at any time; the bubble reappears with its tree intact. Permanent delete is a separate action and removes the worktree.

### Dashboard

Three views: **Grid** (Liquid Glass cards), **Kanban** (by state: Active / Waiting / Inactive / Shell open / Done / Error), **Graph** (nodes floating around the Eco hub with data particles when an agent is running/thinking/executing). The right rail shows recent agents, active folders, and quick stats.

**Admin "all users" mode**: an admin sees a **My agents / All users** toggle (members don't). In "All users" the three views switch to the whole team's agents — Grid groups them by owner, Kanban tags each card with its owner, Graph clusters by user. Other users' agents are read-only.

### Multi-user & remote team access

The first registered user becomes the **admin owner** after the one-time `bootstrap:admin` promotion. From the in-app **Admin** console, the admin creates teammates with an email + display name (Eco creates their Firebase account in the background and writes their `users/<uid>` doc with `role: member`), promotes/demotes roles, disables accounts, and triggers Firebase password-reset emails. Members never see anyone else's data — isolation is enforced by `firestore.rules`.

Run `npm run serve:web` to expose Eco to your **Tailscale** tailnet over HTTPS. A teammate (laptop or iPad) opens the share URL and logs in with their Firebase account. Their bubbles, conversations, categories, notes, review state and theme are **server-authoritative in Firestore** and sync live across all their devices — start on the Mac, continue on the iPad. (Logical, trusted-team isolation — see [CLAUDE.md Appendix D](./CLAUDE.md#multitenant).)

The **Admin** console has three tabs: **Users** (create / enable-disable, roles, password reset), **Activity** (who is working on what right now, live PTY/dev indicators), and **Audit log** — an append-only record of session and agent events (login / logout, agent created / archived / deleted), filterable by user and type. The audit log is an append-only Firestore collection that never stores PINs, tokens or message text.

### Onboarding

First launch shows a multi-step wizard: welcome, language, appearance (theme + accent), Claude auth (CLI or API key), GitHub PAT (optional), workspace folder, Obsidian vault (optional), done. Skippable per step. The `eco.onboarded` flag prevents re-showing.

---

<a id="voice"></a>
## 10. Terminal dictation

The only voice feature in Eco. Voice commands, the wake word, and TTS were removed.

1. Open a bubble.
2. Press **"Hablar a la terminal"** in the header. macOS asks for Microphone + Speech Recognition the first time (in the `.dmg`).
3. Speak. The transcription accumulates in the **DictationBar** above the panels.
4. **"Enviar a terminal"** writes the text into the main PTY (no Enter — you review before running). **"Limpiar"** clears the buffer, **"Cancelar"** stops dictation.

In the `.dmg`, STT runs on-device via Apple Speech (`eco-stt`), so audio never leaves the Mac; in browser dev it uses the Web Speech API. The mic is off until you press the button. **Terminal dictation is macOS-only** — the button is hidden on Windows and Linux.

Implementation: `frontend/src/hooks/useVoice.ts` (capture) → `App.tsx:startTerminalDictation` / `sendDictationToTerminal` → `lib/pty-bridge.ts:writeToBubblePty`.

---

<a id="skills"></a>
## 11. Skills

Eco scans for Claude skills, commands, and sub-agents at:

- `~/.claude/{skills,commands,agents}/` (user-level)
- `<workspace>/.claude/{skills,commands,agents}/` (project-level — wins over user)
- `~/.claude/plugins/marketplaces/<m>/plugins/<p>/{skills,commands,agents}`
- `~/.claude/plugins/cache/<m>/<p>/<version>/{skills,commands,agents}` (active plugins)

The **Skills** picker next to the Plan tab shows the count and lets you click a skill to send `/<name>` to the agent.

Eco also ships an **MCP server** (`mcp-server/`) that lets Claude Code create and list bubbles from any terminal. Install it from Settings → Integrations, or with `claude mcp add eco -- node <path>/mcp-server/dist/index.js`. See [CLAUDE.md Appendix C](./CLAUDE.md#mcp-appendix).

---

<a id="privacy"></a>
## 12. Privacy & security

- **Your code never leaves your machine.** Worktrees, terminals, dev servers, file edits and git operations run in the local backend on `127.0.0.1`. The cloud only holds identity and conversation metadata.
- **Audio never leaves your machine.** Terminal dictation STT is on-device (Apple Speech in the `.dmg`, Web Speech in browser dev). The mic only runs while you're actively dictating.
- **Identity via Firebase Auth.** Login is email + password. The frontend sends the Firebase **ID token** as a Bearer header to the local backend and as the `eco.idtoken.<jwt>` WebSocket subprotocol. The backend verifies it **statelessly** against Google's public JWKS (no service account) and never trusts a client-supplied user id.
- **Authorization lives in Firestore Security Rules** (`firestore.rules`): each document carries an `ownerId`; members read/write only their own data; admins (role stored in `users/<uid>.role`, never a self-set field) get global read; the audit log is append-only. The local backend deliberately makes no authorization decisions — it serves one machine.
- **Local PIN lock** is a convenience layer (SHA-256, device-local) that locks/unlocks an existing Firebase session. It is not account authentication.
- **All operational state on disk is `chmod 600`**: `~/.eco/token`, `~/.eco/users/<id>/github.json`, `~/.eco/api-key`, `~/.eco/workspace-config.json`, `~/.eco/dev-sessions.<port>.json`. (`chmod` is a no-op on NTFS; security there relies on the filesystem.)
- **Bind 127.0.0.1 only.** Host check, origin whitelist, `X-Eco-Client: 1` required header. Remote access only through Tailscale Serve (never Funnel; never `0.0.0.0`).
- **Trusted-team isolation**: multi-user separation is **logical, at the app + Firestore-rules layer**. All local spawns run as the same OS user and share the Claude CLI — fine for a trusted team, not hardened sandboxing. See [CLAUDE.md Appendix D](./CLAUDE.md#multitenant).
- **Filesystem boundary**: `realpathSync` + workspace whitelist + path-traversal check on every endpoint that touches files.
- **Git op safety**: SHA / branch / tag names validated against shell metacharacters; reset hard pre-checks lost commits and requires `force: true`.

Run the backend security suite with `npm run test:security` and the Firestore rules tests with `npm run test:rules`.

---

<a id="stack"></a>
## 13. Tech stack

| Layer | Technology |
|---|---|
| Packaging | Electron 33.4.11 + electron-builder 25.1.8 — macOS arm64 `.dmg` + Windows x64 NSIS `.exe` + Linux x64 AppImage (experimental); JS build config with per-target prebuild filters |
| Frontend | Vite 6, React 18.3, TypeScript 5.7, Tailwind v4, Motion 11.18, Radix UI, Lucide, Sonner |
| Identity & cloud state | Firebase 11 (Auth email/password + Firestore client SDK with offline persistence); `firestore.rules` as the authorization boundary |
| Embedded browser | Chromium `<webview>` with a persisted per-bubble partition |
| Terminal | xterm.js 6 + addon-fit + addon-web-links + node-pty (real PTY) |
| Terminal dictation | Swift CLI (`eco-stt`) + Apple `SFSpeechRecognizer` on-device · PCM capture via Web Audio API → WAV PCM16 (.dmg) · Web Speech API (browser) |
| Editor | CodeMirror 6 with lazy `@codemirror/language-data` packs + `@codemirror/merge` diff view |
| Backend | Node 20, Express 4, ws 8, node-pty 1.1, Zod 3, helmet 8, `jose` 5 (Firebase ID-token verification), Claude Agent SDK |
| i18n | Custom TS dictionary, bilingual ES/EN, no external lib |
| Theme | 14 themes (9 dark + 5 light) + system, `oklch()` accents + `glassEffect` helper |

> `@node-rs/argon2` and `bip39` remain in the backend but power only the dormant local-PIN auth path; the live identity path is Firebase. See [CLAUDE.md Appendix D](./CLAUDE.md#multitenant).

---

<a id="roadmap"></a>
## 14. Roadmap

### Done

- Claude Agent SDK integration with auto-mode (`acceptEdits`)
- **Firebase Auth + Firestore migration** — identity via Firebase email/password; multi-tenant state (users/role, bubbles + messages, categories, notes, review, prefs, audit log) in Firestore, gated by Security Rules; the local backend verifies the ID token statelessly and handles compute only
- Per-agent git worktrees with auto-recovery on conflict
- Skills / commands / agents discovery (user + project + plugins/cache) + standalone MCP server
- Persistent PTY (128 KB replay buffer) + auto-launch of `claude`
- Branch picker (list / checkout / pull / fetch / rename) + Commit with AI (preview editable)
- Git tab (Changes / History / PRs) with cherry-pick, revert, hard-reset guard, op-in-progress banner
- Side-by-side merge-view diff + Cursor-style post-edit review (opt-in)
- **Terminal dictation** — on-device STT (Swift CLI `eco-stt` + Apple Speech in the `.dmg`, Web Speech in browser); audio never leaves the Mac
- **FilesPanel** with lazy gitignore-aware tree, CodeMirror 6, Quick Open, global search, conflict detection, image preview, "↗ IDE" deep-link
- **NotesPanel** with Claude `claude -p` summarizer (3-section markdown, 90 s timeout)
- **Archiving** of bubbles (keeps worktree + branch, kills PTY/servers)
- **Solo-bubble window** (single bubble in its own window, multi-window Firestore sync)
- **GitHub PAT** support with validation + masked storage + env injection (`GH_TOKEN`, `GIT_AUTHOR_*`)
- Per-agent **browser** + per-agent **dev server** (dual mode, auto-port, on-disk persistence + pgid re-adopt)
- **Live dev logs via WS push** (`dev_log` batched every 80 ms) — no polling
- Memory caps on every unbounded buffer (messages, server logs, devLog, xterm scrollback); animations paused when hidden
- Bilingual ES/EN end-to-end (UI + backend error codes); 14 curated themes
- Dashboard with Grid / Kanban / Graph views + admin "all users" mode
- **Admin console** — create / role / enable-disable / password reset (Firebase), team activity, append-only audit log (Firestore)
- **Admin-defined server config + base branches per workspace** — set once by the admin; the ServerPanel is start/stop-only for members
- **Server mode (remote web via Tailscale)** — `npm run serve:web` serves the built app over HTTPS on the tailnet; dev-server previews exposed per-port
- **Windows x64 packaging** — NSIS `.exe` installer + portable build; OS-dependent backend primitives abstracted in `backend/src/platform.ts`; per-target prebuild filters. See [CLAUDE.md Appendix E](./CLAUDE.md#windows)
- Linux AppImage build target (experimental)

### Pending

- Complete the migration so Firestore is the sole source of truth, deprecating the local doc-store fallback
- Code signing (Apple notarization for the `.dmg` / Authenticode for the `.exe`) for distributable installers
- Windows terminal dictation (would need a Windows STT helper to replace the macOS-only `eco-stt`)
- Linux packaging hardening (the AppImage target is currently untested)
- Long-form chat history with pagination / lazy load
- Auto-update via `electron-updater` + S3/GitHub Releases

---

<a id="license"></a>
## 15. License & credits

Private — not for distribution.

Initial design bundle generated at [claude.ai/design](https://claude.ai/design). Logo and brand assets in `frontend/public/brand/`. Interactive terminal via [node-pty](https://github.com/microsoft/node-pty) + [xterm.js](https://xtermjs.org/). Editor via [CodeMirror 6](https://codemirror.net/). Identity & sync via [Firebase](https://firebase.google.com/).
