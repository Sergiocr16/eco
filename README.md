# Eco

Local-first personal assistant for macOS Apple Silicon. Voice, files, code, git, and an embedded browser — 100% local. Distributed as a native `.dmg` (~112 MB) via Electron 33.

```
        ┌───────────────────────────────────────┐
        │                                       │
        │   Eco is always listening:            │
        │                                       │
        │     "Hey Eco abrí Aditum"             │
        │     "Hey Eco terminal"                │
        │     "Hey Eco al final"                │
        │     "Hey Eco repetí"                  │
        │                                       │
        │   Inside a conversation,              │
        │   no "Eco" prefix = message to the    │
        │   Claude agent.                       │
        │                                       │
        │   In the Shell tab, what you say      │
        │   is typed directly into the          │
        │   terminal.                           │
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
8. [Voice commands cheatsheet](#voice)
9. [Skills](#skills)
10. [Privacy & security](#privacy)
11. [Tech stack](#stack)
12. [Roadmap](#roadmap)
13. [License & credits](#license)

---

<a id="what-is-eco"></a>
## 1. What is Eco

Eco is a Claude Code SDK orchestrator. Each conversation is a self-contained **"bubble"** with its own session, isolated git **worktree**, real terminal (PTY), file editor, dev server with auto-port, embedded Chromium browser with its own partition, and Claude-summarized notes. Voice is always on with a dispatcher by prefix — `Eco <command>` runs a system action; without the prefix the text goes to the active agent (or to the PTY if you're on the Shell tab).

When you work on a git repo, each bubble auto-creates a worktree at `~/.eco/worktrees/<bubbleId>` on its own `eco/<short>` branch (base branch chosen at creation, with per-workspace favourites). Two bubbles on the same repo never collide — separate dev server ports (race-free auto-assignment), isolated browser session, separate terminal. Closing the bubble wipes the worktree; the branch survives in the parent repo for review or merge.

Switching between bubbles A → B → A reloads nothing — each open bubble keeps its panel tree alive (webview, PTY, chat, files, notes, server). Cleanup only fires on explicit close.

---

<a id="highlights"></a>
## 2. Highlights

- **Bubbles + worktrees** — every conversation gets an isolated git worktree, PTY, and dev server. Branch lives in the parent repo after close.
- **Voice always on** — wake-prefix dispatcher tolerant to fillers, conjugations, free word order. On-device STT in the packaged .app (Apple Speech), Web Speech in the browser.
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
- **Onboarding wizard** — 9-step setup on first run (language, theme, Claude auth, GitHub, workspace, Obsidian, voice).
- **Bilingual** — Spanish ⇄ English UI. Detects system language; switch from Settings. Backend errors come with stable codes; the frontend translates.
- **Multi-user (admin / member)** — one shared backend, per-user storage. The admin creates users with a **one-time activation code** (no admin-set PINs); the user sets their own PIN. Per-user GitHub identity, per-user workspace grants, enable/disable, PIN reset via a fresh code. argon2id in `~/.eco/users/<id>/user.json` (chmod 600). The owner admin keeps a BIP39 recovery phrase.
- **Cross-device state** — each user's bubbles, conversations, categories, notes, review state and theme live on the host (server-authoritative doc store) and sync live across their devices over WebSocket. Log in from any machine and find your work.
- **Remote team access (Tailscale)** — `npm run serve:web` exposes Eco to the tailnet over HTTPS (`tailscale serve`); members connect from a browser (even an iPad) with a shared access token + their PIN. Dev-server previews are exposed per-port over the tailnet too.
- **Admin console** — manage users (create / role / workspaces / reset code / enable-disable) and watch who's working on which bubble (team graph: Eco → user → workspace → bubbles). Server commands + favorite base branches are defined **by the admin per workspace**; members only start/stop.
- **Themes** — 19 themes + accent hues, including AMOLED. `glassEffect` helper for Liquid Glass styling.

---

<a id="requirements"></a>
## 3. Requirements

- **macOS Apple Silicon** (arm64). x64 is not packaged.
- **Node 20** (`nvm use 20.20.2` works).
- **`claude` CLI** from `@anthropic-ai/claude-code`, authenticated (`claude login` or an API key saved from Settings).
- **git**.
- **`gh` (GitHub CLI)** — required for the **PRs sub-tab** of the Git panel. Without `gh` installed, the Branches/History sub-tabs work fine but `PRs` shows `pr.gh_missing`. Install with `brew install gh`. The GitHub PAT you save in Settings is injected as `GH_TOKEN` into `gh` calls — it does NOT replace the `gh` binary itself.
- Optional: **Python 3.10+** if you want the browser-dev wake-word listener. Not needed for the packaged .app.
- Optional: **Xcode Command Line Tools** if you need to rebuild the Swift voice CLI.

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

# 6) (Optional, dev only) Python wake-word listener for browser dev.
#    Not needed in the .dmg — voice goes through Apple Speech on-device there.
npm run listener:setup    # first time only
npm run listener
```

> **macOS AirPlay Receiver owns port 7000.** Eco's dev backend uses `:7050`. To free 7000, turn off AirPlay Receiver in *Settings → General → AirDrop & Handoff*. Override at any time with `ECO_PORT=<n>`.

For env vars, see [CLAUDE.md §3](./CLAUDE.md#env).

---

<a id="build"></a>
## 5. Build the .dmg

```bash
npm run dmg
# → release/Eco-0.1.0-arm64.dmg     (~112 MB)
# → release/mac-arm64/Eco.app       (~296 MB installed)
```

The `.dmg` is unsigned (`identity: null`) — fine for personal use. To distribute, add Apple Developer ID code signing + notarization.

If you modified the Swift voice CLI, run `./electron/native/build.sh` first.

For the full reinstall recipe (kill running app, delete previous install, copy with `ditto`, strip quarantine, optional cache wipe), see [CLAUDE.md Appendix B](./CLAUDE.md#debug).

---

<a id="structure"></a>
## 6. Project structure

```
eco/
├── README.md                ← this file
├── CLAUDE.md                ← operational manual (rules, gotchas, endpoints, debug)
├── package.json             ← workspace root + parallel scripts
│
├── backend/                 ← Node + Express + Claude SDK + node-pty
├── frontend/                ← Vite + React + TS + Motion + Tailwind v4
├── electron/                ← Electron 33 wrapper + Swift voice CLI
├── listener/                ← Python sidecar (optional, browser-dev wake word)
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

Real `zsh` PTY per bubble (via `node-pty`), with `claude` auto-launched on open (configurable). Survives leaving the bubble — reconnect with a 128 KB replay buffer. On the Shell sub-tab, voice without a wake prefix is typed directly into the terminal.

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

### Voice

Always on. The wake prefix is mandatory (`Eco` alone is too common in natural Spanish), but tolerant: `Hey Eco`, `Oye Eco`, `Hola Eco`, `Ok Eco`, `Che Eco`, etc. Parser accepts fillers, conjugations, and free word order. In the `.dmg`, voice runs **on-device** through Apple Speech via a tiny Swift CLI — audio never leaves the Mac. In browser dev, it uses Web Speech API; the Python listener with wake word + Whisper is also available as an option.

### Archiving

When a bubble is no longer active but you don't want to lose its state, archive it. Eco kills the PTY and dev servers but **keeps the worktree and branch alive**. Restore from the Archived screen at any time; the bubble reappears with its tree intact. Permanent delete is a separate action and removes the worktree.

### Dashboard

Three views: **Grid** (Liquid Glass cards), **Kanban** (by state: Active / Waiting / Inactive / Shell open / Done / Error), **Graph** (nodes floating around the Eco hub with data particles when an agent is running/thinking/executing). The right rail shows the listening waveform, the connected Claude CLI, and quick stats.

### Dock (opt-in)

macOS-style dock of bubbles in the left sidebar with single-target hover magnification and an accent bar on the side when there's activity.

### Onboarding

First launch shows a 9-step wizard: welcome, language, appearance (theme + accent), Claude auth (CLI or API key), GitHub PAT (optional), workspace folder, Obsidian vault (optional), voice autostart, done. Skippable per step. The `eco.onboarded` flag prevents re-showing.

### Multi-user & remote team access

The first registered user is the **admin owner** (keeps a BIP39 recovery phrase). The admin creates the rest from **Admin → Users** with just a name + role — Eco mints a **one-time activation code**. The new user opens Eco, pastes the code in "Activate account", and sets **their own PIN**; the admin never sees or sets PINs. Reset = generate a new code. Users can be enabled/disabled. Each user gets per-user GitHub identity and workspace grants; the admin sets the dev-server command(s) and favorite base branches **per workspace**, and members only start/stop.

Run `npm run serve:web` to expose Eco to your **Tailscale** tailnet over HTTPS. A teammate (laptop or iPad) opens the share URL, enters the shared access token, then logs in with their user + PIN. Their bubbles, conversations, categories, notes, review state and theme are **server-authoritative** and sync live across all their devices — start on the Mac, continue on the iPad. (Logical, trusted-team isolation — see CLAUDE.md Appendix D.)

---

<a id="voice"></a>
## 8. Voice commands cheatsheet

Wake prefix is mandatory. Accepted: `Hey | Oye | Hola | Ok | Okey | Okay | Che | Epa | Oi` + `Eco | Jarvis | Ekko | Hector`.

| Domain | Sample commands |
|---|---|
| Navigation | `Eco dashboard`, `Eco inicio`, `Eco atras`, `Eco ajustes`, `Eco archivos`, `Eco historial`, `Eco estado`, `Eco ayuda` |
| Agents | `Eco abrir <name>`, `Eco renombrar <name>`, `Eco cerrar`, `Eco ir <name>`, `Eco siguiente`, `Eco anterior`, `Eco pausar`, `Eco continuar` |
| Tabs | `Eco chat`, `Eco terminal`, `Eco git`, `Eco plan`, `Eco navegador`, `Eco archivos`, `Eco notas` |
| Git sub-tabs | `Eco cambios`, `Eco historial`, `Eco prs` |
| Scrolling | `Eco scroll abajo`, `Eco scroll arriba`, `Eco al final` |
| Dialogs | `Eco si`, `Eco no`, `Eco acepta`, `Eco cancela` |
| Server | `Eco iniciar servidor`, `Eco detener servidor`, `Eco reiniciar servidor` |
| Misc | `Eco repetir`, `Eco silencio`, `Eco hablar`, `Eco rapido`, `Eco lento`, `Eco oscuro`, `Eco claro`, `Eco guardar en obsidian` |

The full alias table and parser rules live in `frontend/src/lib/meta-commands.ts`.

### Voice routing inside a bubble

- No wake, in **Chat** → message to the agent.
- No wake, in **Terminal → Shell** → typed straight to the PTY with `\n`.
- With wake (`Hey Eco …`) → meta command, tab-independent.

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

- **Audio never leaves your machine.** STT is on-device (Apple Speech in the `.dmg`, or `openwakeword` + `faster-whisper` locally in browser dev). TTS is Piper or `macOS say` — both local.
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
| Packaging | Electron 33 + electron-builder 25 (mac arm64 only, ~112 MB DMG) |
| Frontend | Vite 6, React 18, TS 5, Tailwind v4, Motion 11, Radix UI |
| Embedded browser | Chromium `<webview>` with UA Chrome 131 + persisted partition |
| Terminal | xterm.js + addon-fit + addon-web-links + node-pty (real PTY) |
| Voice STT (.dmg) | Swift CLI + Apple `SFSpeechRecognizer` on-device · PCM capture via Web Audio API → WAV PCM16 |
| Voice STT (dev, optional) | openwakeword (ONNX local) + faster-whisper (CTranslate2, `medium`) — Python sidecar |
| Voice TTS | Piper (ONNX local) + macOS `say` with Premium/Enhanced voices |
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
- Always-on voice with tolerant dispatcher; voice → PTY in Shell tab; TTS with rate/volume
- Local wake word with openwakeword + Whisper + custom "Hey Eco" training pipeline (browser dev)
- **Native voice in the `.dmg`** — Swift CLI `eco-stt` + Apple `SFSpeechRecognizer` on-device. Audio never leaves the Mac.
- Local auth with PIN + BIP39 phrase, lock screen, delete user, profile photo
- Anthropic API key local storage with validation
- Bilingual ES/EN end-to-end (UI + backend error codes)
- User MCP servers (`mcp__*`) auto-enabled
- Dashboard with Grid / Kanban / Graph views, animations, satellite pulses
- macOS-style dock with single-target hover magnification (opt-in)
- Per-agent browser (`BrowserPanel`) with DevTools, persisted zoom, persistent webview
- Per-agent dev server (`ServerPanel`) with dual mode, auto-port, workspace presets, on-disk persistence + pgid re-adopt
- TTS dual backend: Piper (offline) + macOS `say` with Premium/Enhanced voices
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
- **OnboardingWizard** — 9-step setup on first run
- **Multi-tenant** — admin/member roles, per-user storage, per-user GitHub identity + workspace grants, admin console + team graph
- **User activation by one-time code** — admin creates users without a PIN; the user sets their own PIN via a claim token; enable/disable; PIN reset = new code; admin never handles PINs
- **Server-authoritative cross-device state** — per-user doc store (bubbles+messages, categories, notes, review, theme) synced live over WebSocket; log in anywhere and find your work
- **Server mode (remote web via Tailscale)** — `npm run serve:web` serves the built app over HTTPS on the tailnet; dev-server previews exposed per-port; thin clients (browser/iPad) connect with token + PIN
- **Admin-defined server config + base branches per workspace** — set once by the admin in Settings → Folders; the ServerPanel becomes start/stop-only for everyone
- **Role-gated Settings** — host/device options (Claude & API, Voice, Folders, Backup, listen-on-boot, menu bar, clean worktrees) are admin-only

### Pending

- Code signing + Apple notarization for distributable `.dmg`
- Wake-word detection inside the `.dmg` (today Apple Speech transcribes everything and the JS parser detects the prefix — works but isn't the most efficient)
- Windows / Linux packaging (currently arm64-darwin only; would require porting `eco-stt` Swift to an alternative per OS)
- Long-form chat history with pagination / lazy load (today: 100 messages per bubble in localStorage, 300 in memory)
- Auto-update via `electron-updater` + S3/GitHub Releases
- License gating with Paddle / LemonSqueezy (when it goes to sale)
- (Optional) Automatic compaction of inactive bubbles >30 days at boot, or a manual "Clean inactive bubbles" button in Settings

---

<a id="license"></a>
## 13. License & credits

Private — not for distribution.

Initial design bundle generated at [claude.ai/design](https://claude.ai/design). Logo and brand assets in `frontend/public/brand/`. Wake-word training based on [openwakeword](https://github.com/dscripka/openWakeWord) + [piper-tts](https://github.com/rhasspy/piper). Interactive terminal via [node-pty](https://github.com/microsoft/node-pty) + [xterm.js](https://xtermjs.org/). Editor via [CodeMirror 6](https://codemirror.net/).
