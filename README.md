# Eco

Local-first personal assistant for **macOS Apple Silicon and Windows x64**. Parallel Claude agents, terminal, files, code, git, and an embedded browser — 100% local. Distributed as a native `.dmg` (~112 MB) on macOS and an NSIS `.exe` (~96 MB) on Windows, via Electron 33.

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
        │   Optional: dictate to the terminal   │
        │   with the "Hablar a la terminal"     │
        │   button (on-device STT).             │
        │                                       │
        └───────────────────────────────────────┘
```

> **For agents working in this repo, the operational truth lives in [CLAUDE.md](./CLAUDE.md)** — rules, file maps, gotchas, endpoints, env vars, debug recipes. This README is the human-facing intro.

## Table of contents

1. [What is Eco](#what-is-eco)
2. [Highlights](#highlights)
3. [Requirements](#requirements)
4. [Install + first run](#install)
5. [Build the .dmg](#build)
6. [Project structure](#structure)
7. [Feature tour](#tour)
8. [Terminal dictation](#voice)
9. [Skills](#skills)
10. [Privacy & security](#privacy)
11. [Tech stack](#stack)
12. [Roadmap](#roadmap)
13. [License & credits](#license)

---

<a id="what-is-eco"></a>
## 1. What is Eco

Eco is a Claude Code SDK orchestrator. Each conversation is a self-contained **"bubble"** with its own session, isolated git **worktree**, real terminal (PTY), file editor, dev server with auto-port, embedded Chromium browser with its own partition, and Claude-summarized notes. The only voice feature is **terminal dictation**: press "Hablar a la terminal" inside a bubble to dictate text into the PTY (on-device STT, you review before running).

When you work on a git repo, each bubble auto-creates a worktree at `~/.eco/worktrees/<bubbleId>` on its own `eco/<short>` branch (base branch chosen at creation, with per-workspace favourites). Two bubbles on the same repo never collide — separate dev server ports (race-free auto-assignment), isolated browser session, separate terminal. Closing the bubble wipes the worktree; the branch survives in the parent repo for review or merge.

Switching between bubbles A → B → A reloads nothing — each open bubble keeps its panel tree alive (webview, PTY, chat, files, notes, server). Cleanup only fires on explicit close.

---

<a id="highlights"></a>
## 2. Highlights

- **Bubbles + worktrees** — every conversation gets an isolated git worktree, PTY, and dev server. Branch lives in the parent repo after close.
- **Terminal dictation** — optional "Hablar a la terminal" button dictates into the PTY. On-device STT in the packaged .app (Apple Speech), Web Speech in the browser. The mic only runs while you're dictating. (No wake word, no voice commands, no TTS — those were removed.)
- **Cursor-style review** — agent edits freely; you review diffs after with amber/green dots, accept/revert by hunk or by file. Opt-in toggle.
- **Diff viewer with merge view** — full file shown side-by-side with diffs highlighted (powered by `@codemirror/merge`), sync scroll, collapse unchanged regions on/off, per-chunk navigation + Accept/Reject in review mode.
- **FilesPanel** — mini-VS-Code per bubble: lazy gitignore-aware tree, CodeMirror 6 editor, `Cmd+P` Quick Open, `Cmd+Shift+F` global search, save with conflict detection, image preview, **"↗ IDE" button** to open the current file at the exact line in VSCode / IntelliJ / WebStorm / Cursor (configurable). Eco has no built-in debugger — set breakpoints in the external IDE.
- **NotesPanel + summarizer** — markdown notes per bubble. One click runs Claude (`claude -p`) on the recent messages + last 60 KB of the PTY buffer and produces a 3-section summary (what we were doing / where we left off / next steps).
- **Archiving** — kill the running processes, keep the worktree and branch. Restore or permanently delete from the Archived screen.
- **GitHub PAT** — store a Personal Access Token once, validated against GitHub; auto-injected as `GH_TOKEN` + git author env into every spawned process.
- **Dual dev server** — frontend + backend in parallel with auto-port. Eco assigns ports via `PORT` / `SERVER_PORT` / `JAVA_TOOL_OPTIONS=-Dserver.port=…` / `API_PORT` / `BACKEND_URL` env vars covering most frameworks. Backend boots first, frontend follows.
- **Browser per agent** — real Chromium `<webview>` with persisted cookies (per-bubble partition), DevTools, persisted zoom and URL.
- **Git tab** — GitHub Desktop-style layout: top bar with branch dropdown + sync, sub-tabs Changes / History / PRs. Cherry-pick, revert, hard-reset with safety prompt, op-in-progress banner with Continue/Abort.
- **Obsidian integration** — save the current conversation as a `.md` note in your vault.
- **Onboarding wizard** — 8-step setup on first run (language, theme, Claude auth, GitHub, workspace, Obsidian).
- **Bilingual** — Spanish ⇄ English UI. Detects system language; switch from Settings. Backend errors come with stable codes; the frontend translates.
- **Multi-user (admin / member)** — one shared backend, per-user storage. The admin creates users with a **one-time activation code** (no admin-set PINs); the user sets their own PIN. Per-user GitHub identity, per-user workspace grants, enable/disable, PIN reset via a fresh code. argon2id in `~/.eco/users/<id>/user.json` (chmod 600). The owner admin keeps a BIP39 recovery phrase.
- **Cross-device state** — each user's bubbles, conversations, categories, notes, review state and theme live on the host (server-authoritative doc store) and sync live across their devices over WebSocket. Log in from any machine and find your work.
- **Remote team access (Tailscale)** — `npm run serve:web` exposes Eco to the tailnet over HTTPS (`tailscale serve`); members connect from a browser (even an iPad) with a shared access token + their PIN. Dev-server previews are exposed per-port over the tailnet too.
- **Admin console** — manage users (create / role / workspaces / reset code / enable-disable) and watch who's working on which bubble (team graph: Eco → user → workspace → bubbles). Server commands + favorite base branches are defined **by the admin per workspace**; members only start/stop.
- **Themes** — 19 themes + accent hues, including AMOLED. `glassEffect` helper for Liquid Glass styling.

---

<a id="requirements"></a>
## 3. Requirements

- **macOS Apple Silicon** (arm64) **or Windows x64**. macOS Intel is not packaged.
- **Node 20** (`nvm use 20.20.2` works).
- **`claude` CLI** from `@anthropic-ai/claude-code`, authenticated (`claude login` or an API key saved from Settings). On Windows, the native installer's `claude.exe` is auto-resolved; otherwise set `CLAUDE_CLI_PATH` to a real `.exe`.
- **git**.
- **`gh` (GitHub CLI)** — required for the **PRs sub-tab** of the Git panel. Without `gh` installed, the Branches/History sub-tabs work fine but `PRs` shows `pr.gh_missing`. Install with `brew install gh` (macOS) or `winget install GitHub.cli` (Windows). The GitHub PAT you save in Settings is injected as `GH_TOKEN` into `gh` calls — it does NOT replace the `gh` binary itself.
- Optional (macOS only): **Xcode Command Line Tools** if you need to rebuild the Swift dictation CLI (`eco-stt`). **Terminal dictation is macOS-only** — the button is hidden on Windows.

---

<a id="install"></a>
## 4. Install + first run

```bash
# 1) Install workspace deps (frontend + backend)
npm install

# 2) Configure allowed workspaces (also editable from Settings)
cp backend/.env.example backend/.env
# Edit backend/.env → ECO_WORKSPACES=/path/to/your/repo

# 3) Frontend env: VITE_ECO_BACKEND empty so calls use the Vite proxy
echo 'VITE_ECO_BACKEND=' > frontend/.env.local

# 4a) Web mode (backend + Vite, open localhost:5173 in your browser)
npm run web

# 4b) App mode (Electron window + hot-reload + DevTools)
npm run dev:app

# 5) First run → register a local account (PIN + recovery phrase + optional photo).
#    The recovery phrase is shown BEFORE you enter the app; copy it to a safe place.
```

> **macOS AirPlay Receiver owns port 7000.** Eco's dev backend uses `:7050`. To free 7000, turn off AirPlay Receiver in *Settings → General → AirDrop & Handoff*. Override at any time with `ECO_PORT=<n>`.

For env vars, see [CLAUDE.md §3](./CLAUDE.md#env).

---

<a id="build"></a>
## 5. Build the installer

**macOS** (`.dmg`):

```bash
npm run dmg
# → release/Eco-0.1.0-arm64.dmg     (~112 MB)
# → release/mac-arm64/Eco.app       (~296 MB installed)
```

The `.dmg` is unsigned (`identity: null`) — fine for personal use. To distribute, add Apple Developer ID code signing + notarization. If you modified the Swift dictation CLI (`eco-stt`), run `./electron/native/build.sh` first.

**Windows** (NSIS `.exe`), from a Windows machine with PowerShell:

```powershell
npm run dist:win
# → release/Eco Setup 1.0.0.exe      (NSIS, ~96 MB, per-user, unsigned)
# → release/win-unpacked/Eco.exe     (portable — runs without installing)
```

The installer is unsigned, so Windows SmartScreen shows "Windows protected your PC" → click *More info → Run anyway*. If a previous install is half-broken, uninstall it from Settings → Apps first, or just run the portable `win-unpacked\Eco.exe`. Mac and Windows cannot be cross-built — build each on its own OS.

The build config (`electron/electron-builder.config.cjs`) filters native prebuilds (node-pty, ripgrep) per target, and the OS-dependent backend lives in `backend/src/platform.ts`. For the full Windows reference (build, prepare scripts, icon generation, gotchas) see [CLAUDE.md Appendix E](./CLAUDE.md#windows); for the macOS reinstall recipe see [CLAUDE.md Appendix B](./CLAUDE.md#debug).

---

<a id="structure"></a>
## 6. Project structure

```
eco/
├── README.md                ← this file
├── CLAUDE.md                ← operational manual (rules, gotchas, endpoints, debug)
├── package.json             ← workspace root + parallel scripts
│
├── backend/                 ← Node + Express + Claude SDK + node-pty (OS seam: src/platform.ts)
├── frontend/                ← Vite + React + TS + Motion + Tailwind v4
├── electron/                ← Electron 33 wrapper + electron-builder.config.cjs (mac/win) + Swift dictation CLI (eco-stt, macOS)
├── scripts/                 ← check-i18n.mjs and other tooling
└── release/                 ← electron-builder output (gitignored)
```

For the per-feature file map (which file does what, which hook drives which UI), see [CLAUDE.md §4](./CLAUDE.md#filemap).

---

<a id="tour"></a>
## 7. Feature tour

### Bubbles + worktrees

Every conversation is a bubble. When you create one in a git workspace, a worktree is checked out at `~/.eco/worktrees/<bubbleId>` on its own branch `eco/<short>`. The agent edits there. Two bubbles on the same repo never collide. On close, the worktree is removed (with a confirmation modal if it's dirty); the branch survives in the parent repo.

### Terminal (PTY)

Real `zsh` PTY per bubble (via `node-pty`), with `claude` auto-launched on open (configurable). Survives leaving the bubble — reconnect with a 128 KB replay buffer. The "Hablar a la terminal" button lets you dictate text into the terminal (you review before running).

### FilesPanel

A mini-VS-Code inside the bubble's worktree: lazy gitignore-aware tree, CodeMirror 6 editor, dirty indicator, `Cmd+S` save with conflict detection (`expectedMtime`), `Cmd+F` find-in-file, `Cmd+P` Quick Open, `Cmd+Shift+F` global search via ripgrep, inline image preview. Files with unstaged changes show an amber dot in the tree; ancestor folders get a dimmed dot. A "Send to Claude" floating button lets you push selected code + path into the agent's terminal.

### NotesPanel

Markdown notes per bubble with debounced autosave. The "Summarize" button runs Claude (`claude -p`) over the recent messages and the last 60 KB of the PTY buffer (90 s timeout) and writes back a 3-section summary: what we were doing / where we left off / next steps. Useful before a `/clear` or when handing off.

### Git tab

GitHub Desktop-style layout. The top bar carries the current branch dropdown (searchable, Local/Remote), a sync button that adapts to the state (`Publish` / `Push` / `Pull` / `Sync` / `Fetch`), and a `⋯` menu for merge, rename, view PRs. Three sub-tabs:

- **Changes** — file list with amber/green dots from `git status --porcelain`; inline diff per file; sticky Commit-with-AI box at the bottom. Cursor-style review (opt-in setting) adds per-hunk accept / revert.
- **History** — paginated log; cherry-pick to another branch, revert, reset to here (hard requires typing `HARD RESET`), copy SHA.
- **PRs** — list with checkout; `CurrentPrBanner` on the right rail when the branch has an open PR. **Requires `gh` (GitHub CLI) installed** (`brew install gh`); the GitHub PAT alone is not enough.

A floating `GitBusyToast` appears while a git op is in flight. An `OpInProgressBanner` detects cherry-pick / merge / revert in progress and offers Continue / Abort / "Resolve in Changes".

### Dev server per bubble

The **Server** tab manages gulp / Vite / Spring Boot / etc. inside the worktree. Single or dual mode (frontend + backend in parallel, persisted per bubble). Each slot receives a free random port injected as env vars (`PORT`, `SERVER_PORT`, `JAVA_TOOL_OPTIONS=-Dserver.port=…`, `API_PORT`, `BACKEND_URL`, etc.) covering most frameworks. In dual, backend boots first; frontend follows when backend reports `running`. Sessions persist to disk (`~/.eco/dev-sessions.json`) and re-adopt across backend reloads via pgid.

> **Rule for commands**: do NOT hardcode ports. Use the env vars Eco injects.

### Browser per bubble

Real Chromium `<webview>` (Electron) or `<iframe>` (web dev). Per-bubble cookies via partition; persisted URL + zoom. DevTools available via right-click → Inspect. Auto-navigates to the dev server URL when it goes `running`.

### Terminal dictation

The only voice feature. Inside a bubble, the "Hablar a la terminal" button turns the mic on; what you say is transcribed and accumulated in a bar above the panels. "Enviar a terminal" writes it into the main PTY **without pressing Enter**, so you review before running. The mic only runs while you're dictating. In the `.dmg`, STT runs **on-device** through Apple Speech via a tiny Swift CLI (`eco-stt`) — audio never leaves the Mac. In browser dev it uses the Web Speech API.

### Archiving

When a bubble is no longer active but you don't want to lose its state, archive it. Eco kills the PTY and dev servers but **keeps the worktree and branch alive**. Restore from the Archived screen at any time; the bubble reappears with its tree intact. Permanent delete is a separate action and removes the worktree.

### Dashboard

Three views: **Grid** (Liquid Glass cards), **Kanban** (by state: Active / Waiting / Inactive / Shell open / Done / Error), **Graph** (nodes floating around the Eco hub with data particles when an agent is running/thinking/executing). The right rail shows recent agents, active folders, and quick stats.

**Admin "all users" mode**: an admin sees a **My agents / All users** toggle (members don't). In "All users" the three views switch to the whole team's agents — Grid groups them by owner, Kanban tags each card with its owner, Graph clusters by user — each showing status, workspace and live indicators so the admin can tell who is working on what. Other users' agents are read-only (no navigation into someone else's worktree).

### Dock (opt-in)

macOS-style dock of bubbles in the left sidebar with single-target hover magnification and an accent bar on the side when there's activity.

### Onboarding

First launch shows an 8-step wizard: welcome, language, appearance (theme + accent), Claude auth (CLI or API key), GitHub PAT (optional), workspace folder, Obsidian vault (optional), done. Skippable per step. The `eco.onboarded` flag prevents re-showing.

### Multi-user & remote team access

The first registered user is the **admin owner** (keeps a BIP39 recovery phrase). The admin creates the rest from **Admin → Users** with just a name + role — Eco mints a **one-time activation code**. The new user opens Eco, pastes the code in "Activate account", and sets **their own PIN**; the admin never sees or sets PINs. Reset = generate a new code. Users can be enabled/disabled. Each user gets per-user GitHub identity and workspace grants; the admin sets the dev-server command(s) and favorite base branches **per workspace**, and members only start/stop.

Run `npm run serve:web` to expose Eco to your **Tailscale** tailnet over HTTPS. A teammate (laptop or iPad) opens the share URL, enters the shared access token, then logs in with their user + PIN. Their bubbles, conversations, categories, notes, review state and theme are **server-authoritative** and sync live across all their devices — start on the Mac, continue on the iPad. (Logical, trusted-team isolation — see CLAUDE.md Appendix D.)

**Admin console** (`Admin`) has three tabs: **Users** (create/enable/disable, roles, workspace grants, activation codes), **Activity** (who is working on what right now, live PTY/dev indicators), and **Audit log** ("Bitácora") — an append-only record of session and agent events (login / account activation / logout, and agent created / archived / deleted), filterable by user and type, so the admin can see who did what and in which folder. The log lives in `~/.eco/audit-log.jsonl` and never stores PINs, tokens or message text.

---

<a id="voice"></a>
## 8. Terminal dictation

The only voice feature left in Eco. Voice commands, the wake word, and TTS were removed.

1. Open a bubble.
2. Press **"Hablar a la terminal"** in the header. macOS asks for Microphone + Speech Recognition the first time (in the `.dmg`).
3. Speak. The transcription accumulates in the **DictationBar** above the panels.
4. **"Enviar a terminal"** writes the text into the main PTY (no Enter — you review before running). **"Limpiar"** clears the buffer, **"Cancelar"** stops dictation.

In the `.dmg`, STT runs on-device via Apple Speech (`eco-stt`); in browser dev it uses the Web Speech API. The mic is off until you press the button.

Implementation: `frontend/src/hooks/useVoice.ts` (capture) → `App.tsx:startTerminalDictation` / `sendDictationToTerminal` → `lib/pty-bridge.ts:writeToBubblePty`.

---

<a id="skills"></a>
## 9. Skills

Eco scans for Claude skills, commands, and sub-agents at:

- `~/.claude/{skills,commands,agents}/` (user-level)
- `<workspace>/.claude/{skills,commands,agents}/` (project-level — wins over user)
- `~/.claude/plugins/marketplaces/<m>/plugins/<p>/{skills,commands,agents}`
- `~/.claude/plugins/cache/<m>/<p>/<version>/{skills,commands,agents}` (active plugins)

The **Skills** picker next to the Plan tab shows the count and lets you click a skill to send `/<name>` to the agent.

---

<a id="privacy"></a>
## 10. Privacy & security

- **Audio never leaves your machine.** Terminal dictation STT is on-device (Apple Speech in the `.dmg`, Web Speech in browser dev). The mic only runs while you're actively dictating.
- **All state on disk is `chmod 600`**: `~/.eco/token`, `~/.eco/users/<id>/{user.json,github.json,docs/*}`, `~/.eco/api-key`, `~/.eco/workspace-config.json`, `~/.eco/dev-sessions.<port>.json`.
- **No telemetry.** The only external calls are the Anthropic API (when the active agent needs it) and a one-shot validation when you save your API key or a GitHub PAT.
- **Local auth**: PIN (argon2id) per user. Members activate via a one-time code and set their own PIN — the admin never sees PINs. The owner admin keeps a BIP39 recovery phrase. No external auth server.
- **Bind 127.0.0.1 only.** Host check, origin whitelist, `X-Eco-Client: 1` required header, in-memory session token TTL 1 h, per-user refresh token. Remote access only through Tailscale Serve (never Funnel; never `0.0.0.0`).
- **Trusted-team isolation**: multi-user separation is **logical, at the app layer**. All spawns run as the same OS user and share the Claude CLI — fine for a trusted team, not hardened sandboxing. See CLAUDE.md Appendix D.
- **Filesystem boundary**: `realpathSync` + workspace whitelist + path-traversal check on every endpoint that touches files.
- **Git op safety**: SHA / branch / tag names validated against shell metacharacters; reset hard pre-checks lost commits and requires `force: true`.

Run the security suite with `npm run test:security`.

---

<a id="stack"></a>
## 11. Tech stack

| Layer | Technology |
|---|---|
| Packaging | Electron 33 + electron-builder 25 — macOS arm64 `.dmg` (~112 MB) + Windows x64 NSIS `.exe` (~96 MB); JS build config with per-target prebuild filters |
| Frontend | Vite 6, React 18, TS 5, Tailwind v4, Motion 11, Radix UI |
| Embedded browser | Chromium `<webview>` with UA Chrome 131 + persisted partition |
| Terminal | xterm.js + addon-fit + addon-web-links + node-pty (real PTY) |
| Terminal dictation | Swift CLI (`eco-stt`) + Apple `SFSpeechRecognizer` on-device · PCM capture via Web Audio API → WAV PCM16 (.dmg) · Web Speech API (browser) |
| Editor | CodeMirror 6 with lazy `@codemirror/language-data` packs |
| Backend | Node 20, Express 4, ws, node-pty, Zod, @node-rs/argon2, bip39, Claude Agent SDK |
| i18n | Custom TS dictionary, bilingual ES/EN, no external lib |
| Theme | Light / dark / system / AMOLED with `oklch()` + accents + `glassEffect` helper |

---

<a id="roadmap"></a>
## 12. Roadmap

### Done

- Claude Agent SDK integration with auto-mode (`acceptEdits`)
- Security hardening (16 automated tests)
- Liquid Glass redesign (dark / light / AMOLED, multiple accents, `glassEffect` helper)
- Multi-agent Stage Manager with local persistence
- Per-agent git worktrees with auto-recovery on conflict
- Skills / commands / agents discovery (user + project + plugins/cache)
- Persistent PTY (128 KB replay buffer) + auto-launch of `claude`
- "Agent" sub-tab read-only with all `Bash` calls the agent ran
- Branch picker (list / checkout / pull / fetch / rename) + Commit with AI (preview editable)
- Side-by-side diff (GitHub style) + search
- Cursor-style post-edit review (opt-in setting)
- **Terminal dictation** — "Hablar a la terminal" button → on-device STT (Swift CLI `eco-stt` + Apple `SFSpeechRecognizer` in the `.dmg`, Web Speech in browser) → review → write to PTY. Audio never leaves the Mac. (Wake word, voice commands and TTS were removed.)
- Local auth with PIN + BIP39 phrase, lock screen, delete user, profile photo
- Anthropic API key local storage with validation
- Bilingual ES/EN end-to-end (UI + backend error codes)
- User MCP servers (`mcp__*`) auto-enabled
- Dashboard with Grid / Kanban / Graph views, animations, satellite pulses
- macOS-style dock with single-target hover magnification (opt-in)
- Per-agent browser (`BrowserPanel`) with DevTools, persisted zoom, persistent webview
- Per-agent dev server (`ServerPanel`) with dual mode, auto-port, workspace presets, on-disk persistence + pgid re-adopt
- **Bundle compaction** — `.dmg` 148 → 112 MB; installed app 401 → 296 MB; `backend/node_modules` 165 → 50 MB (multi-arch filters, arm64-only, dead-dep removal)
- **Live dev logs via WS push** (`dev_log` batched every 80 ms) — no more polling
- Animations paused when window hidden (`document.visibilityState`); polling pauses too
- Coalesced WS streaming (`requestAnimationFrame` flush, max 60 setState/s)
- Memory caps on every unbounded buffer (messages, server logs, devLog, xterm scrollback)
- Atomic bubble close: PTY + dev servers + `forgetSession` + worktree + localStorage `eco.*.${bubbleId}` cleanup
- **FilesPanel** with lazy gitignore-aware tree, CodeMirror 6, Quick Open, global search, conflict detection, image preview, deep-link from Git Changes
- **NotesPanel** with Claude `claude -p` summarizer (3-section markdown, 90 s timeout)
- **Archiving** of bubbles (keeps worktree + branch, kills PTY/servers)
- **GitHub PAT** support with validation + masked storage + env injection (`GH_TOKEN`, `GIT_AUTHOR_*`)
- **GitBusyToast** + improved file change detection (`gitCapture` helper)
- **OnboardingWizard** — 8-step setup on first run
- **Multi-tenant** — admin/member roles, per-user storage, per-user GitHub identity + workspace grants, admin console + team graph
- **User activation by one-time code** — admin creates users without a PIN; the user sets their own PIN via a claim token; enable/disable; PIN reset = new code; admin never handles PINs
- **Server-authoritative cross-device state** — per-user doc store (bubbles+messages, categories, notes, review, theme) synced live over WebSocket; log in anywhere and find your work
- **Server mode (remote web via Tailscale)** — `npm run serve:web` serves the built app over HTTPS on the tailnet; dev-server previews exposed per-port; thin clients (browser/iPad) connect with token + PIN
- **Admin-defined server config + base branches per workspace** — set once by the admin in Settings → Folders; the ServerPanel becomes start/stop-only for everyone
- **Role-gated Settings** — host/device options (Claude & API, Folders, Integrations, Backup, menu bar, clean worktrees) are admin-only
- **Windows x64 packaging** — NSIS `.exe` installer + portable build. OS-dependent backend primitives (shell, ports, process-kill) abstracted in `backend/src/platform.ts`; electron-builder JS config filters native prebuilds per target; single-instance lock + always-show-window hardening. Terminal dictation stays macOS-only (Apple Speech). See CLAUDE.md Appendix E.

### Pending

- Code signing (Apple notarization for the `.dmg` / Authenticode for the `.exe`) for distributable installers
- Windows terminal dictation (would need a Windows STT helper to replace the macOS-only `eco-stt`)
- Linux packaging (an AppImage target exists in the build config but is untested)
- Long-form chat history with pagination / lazy load (today: 100 messages per bubble in localStorage, 300 in memory)
- Auto-update via `electron-updater` + S3/GitHub Releases
- License gating with Paddle / LemonSqueezy (when it goes to sale)
- (Optional) Automatic compaction of inactive bubbles >30 days at boot, or a manual "Clean inactive bubbles" button in Settings

---

<a id="license"></a>
## 13. License & credits

Private — not for distribution.

Initial design bundle generated at [claude.ai/design](https://claude.ai/design). Logo and brand assets in `frontend/public/brand/`. Interactive terminal via [node-pty](https://github.com/microsoft/node-pty) + [xterm.js](https://xtermjs.org/). Editor via [CodeMirror 6](https://codemirror.net/).
