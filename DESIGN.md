# DESIGN.md — Eco v2

Visual standard of the Eco frontend. Source design: `Eco Dashboard v2`. If a screen is not covered here, derive it from these rules, not from the old glass UI.

## 1. Principles

- Flat surfaces. No glass, no `backdrop-filter`, no gradients, no glow. Depth comes from four surface tones, not from shadows. Shadows are only for floating layers (menus, dialogs, dock, tooltips).
- Two themes only: `light` and `dark` (+ `system`). One accent per theme (terracotta); the user may override it with one of 14 hues.
- Pills and rounded cards. Controls are fully rounded; cards use radius 22.
- Classes first. The look lives in `frontend/src/design/eco.css`. Inline `style` is only for dynamic values (splitter widths, category color, measured positions).
- The Dashboard graph (`GraphView`) is frozen: it renders inside `LegacyGraphTheme` with the old tokens and is never restyled.
- Presentation only. Redesign work never changes hooks, endpoints, bus events, localStorage keys or behavior, and never drops an action that existed.

## 2. Tokens

CSS variables are written on `<html>` by `ThemeProvider` (`design/theme.tsx`). `useTokens()` returns the same values for JS consumers (xterm, CodeMirror, SVG).

| Variable | Token (`t.`) | Light | Dark | Use |
|---|---|---|---|---|
| `--bg` | `bg` | `#eeebe3` | `#151412` | Window background, sidebar, menus, dock |
| `--sheet` | `sheet` | `#fbfaf7` | `#1e1d1b` | The rounded content sheet |
| `--card` | `card` | `#f3f1ea` | `#272623` | Cards and soft controls on the sheet |
| `--raised` | `raised` | `#ffffff` | `#32302d` | Elements on a card (tiles, active segment, chips on card) |
| `--hover` | `hover` | `#e8e5db` | `#383633` | Hover state |
| `--line` | `line` | `#e2ded2` | `#35332f` | Row separators |
| `--line2` | `line2` | `#c9c4b5` | `#4d4a45` | Borders of floating layers, dashed outlines |
| `--tx` / `--tx2` / `--tx3` | `text0` / `text1`,`text2` / `text3` | `#1f1e1c` / `#55534c` / `#716e65` | `#f3f1ea` / `#bdbab0` / `#8f8c83` | Text, secondary, faint |
| `--ac` | `accent` | `#b5532f` | `#d98562` | Accent (primary button, progress, active marks) |
| `--ac-tx` | — | `#fff` | `#1c1b19` | Text on accent |
| `--ac-soft` / `--ac-line` | `accentSoft` / `accentLine` | mix | mix | Tinted background / outline |
| `--ok` `--warn` `--err` `--info` | `ok` `warn` `err` `info` | `#2f7a45` `#8f5f0a` `#b23f3f` `#2f62a6` | `#86bd92` `#e0b05c` `#e07f7a` `#86aee0` | Status |

Surface nesting: `bg` → `sheet` → `card` → `raised`. A control sitting on a card uses the `--on-card` / `--raised` variant so it stays visible.

Legacy keys (`bg0..bg4`, `glassBg`, `glassBorder`, `chromeBg`, …) still exist on the `Tokens` type mapped to the new surfaces so unmigrated code compiles. Do not use them in new code; replace them when you touch a file: `glassBorder` → `line`, `bg2`/`bg3` → `card`/`raised`, `bg1` (menus) → `bg`.

Sizes: `--r-card` 22, `--r-sheet` 24, `--r-tile` 11, `--r-item`, `--r-menu` 18; heights `--h-lg` 44, `--h-md` 36, `--h-sm` 32, `--h-xs` 28.

## 3. Typography

- Sans: Hanken Grotesk Variable, 13.5px / 1.4, weights 400 / 500 / 600. Mono: Geist Mono Variable for data (paths, ids, counts, branches, code).
- Both fonts are bundled (`@fontsource-variable/*`), never loaded from a CDN.
- Never use uppercase: no `text-transform: uppercase`, no all-caps strings, no wide tracking. Labels are written in sentence case (first letter capitalized) in `lib/i18n.ts`.

| Class | Spec | Use |
|---|---|---|
| `.eco-eyebrow` | 12px, `tx3`, sentence case | Label above a title, section headers, KPI labels (`--sm` 11.5px) |
| `.eco-title` | 42px / 1.05, weight 400, tracking -.035em (28px on phones) | Page title. `--md` = 28px |
| `.eco-h2` / `.eco-h3` | 18px / 16px, weight 500 | Section title, card title |
| `.eco-label` | weight 500 | Row title |
| `.eco-sub` | 12.5px `tx3` | Row description |
| `.eco-muted` / `.eco-faint` | `tx2` / `tx3` | |
| `.eco-mono`, `.eco-num` | Geist Mono; `num` = 11.5px `tx3` | Data |
| `.eco-stat` | 36px numeral | KPI |

## 4. Class catalog (`design/eco.css`)

Layout: `.eco-hstack` (`--wrap`), `.eco-vstack`, `.eco-grow`, `.eco-spacer`, `.eco-truncate`, `.eco-noscrollbar`.

Page:
- `.eco-sheet` — the rounded content container (set by `App.tsx`).
- `.eco-page` (`--scroll`) — page padding + vertical gap 18. Every full screen starts with it.
- `.eco-page-head` + `__main`, `__sub`, `__actions` — eyebrow + title on the left, actions on the right. Use the `PageHeader` primitive.
- `.eco-split` + `__nav`, `__body` — page with a side nav card (Settings, Changes). On phones the nav becomes a horizontal scroll strip.
- `.eco-pane` — entrance animation for a swapped pane.

Surfaces:
- `.eco-card` — radius 22, padding 18px 22px, bg `card`. Variants: `--list` (rows separated by lines), `--nav` (padding 6, holds `.eco-nav-item`), `--flush` (no padding), `--stack` (vertical gap), `--click` (hover), `--sm`.
- `.eco-raised`, `.eco-inset`, `.eco-divider`.
- `.eco-row` (`--first`, `--tight`, `--click`) + `__main`, `__title`, `__desc`, `__end` — a settings-style row: tile, title + description, control at the end. Rows inside `.eco-card--list` get a 1px top line.
- `.eco-tile` (`--sm`, `--lg`, `--on-raised`, `--accent`) — 36px icon square, radius 11. `.eco-avatar`.

Buttons:
- `.eco-btn` — pill, height 36. Sizes `--xs` 28, `--sm` 32, `--lg` 44, `--block`. Kinds: `--primary` (accent, main action of the page, one per view), `--solid` (inverted `tx`), `--soft` (bg `card`, default secondary on the sheet), `--raised` (secondary on a card), `--secondary` (bg `hover`), `--ghost`, `--outline`, `--dashed`, `--danger`, `--danger-solid`.
- `.eco-iconbtn` (`.is-on`, `--xs`, `--md`, `--lg`, `--soft`, `--raised`, `--danger`) — round icon button.
- `.eco-edge-btn` — the round toggle on the sheet edge.

Selection:
- `.eco-seg` + `.eco-seg__item.is-on` — segmented control (bg `card`, active `raised`). `--on-card`, `--sm`, `--md`, `--icons`.
- `.eco-tabs` + `.eco-tab` — first-level tabs; the active one is inverted (`.is-on`: bg `tx`, text `sheet`).
- `.eco-subtab` (`.is-on`, `--add` dashed) — second-level tabs inside a card (Claude | Codex | Shell, Git sub-nav).
- `.eco-nav-item` (`.is-on`, `--sm`, `--icon`) — vertical nav entry (sidebar, Settings nav).

Data:
- `.eco-chip` (`--on-card`, `--accent`, `--ok`, `--warn`, `--err`, `--btn`) — small status / category pill, usually with `.eco-dot`.
- `.eco-chip--lg` (36px, 12.5px) + `.eco-ctxchips` (wrapping row) + `.eco-meter` (44x5 progress bar) — the agent detail's collapsed context panel: branch, PR, context %, skills. Every chip reopens the panel (`ContextChips` in `screens/AgentDetail.tsx`).
- `.eco-count` — mono count next to a title.
- `.eco-dot` (`--lg`, `--ok`, `--warn`, `--err`, `--info`, `--accent`), `.eco-spinner`, `.eco-kbd`, `.eco-progress`.

Forms:
- `.eco-field` (`--on-sheet`, `--sm`, `--mono`) — input / select / textarea. `.eco-field-label`.
- `.eco-inputbar` (`--on-sheet`, `--action`, `--sm`) + `.eco-input-bare` — pill with an icon, a bare input and an optional trailing button (search, add path).
- `.eco-toggle.is-on`, `.eco-stepper`.

Floating:
- `.eco-menu` + `__item` (`--danger`), `__sep`, `__label` — popover menu: bg `bg`, border `line2`, radius 18.
- Dialogs (every popup, confirm and picker uses this anatomy; becomes a bottom sheet on phones):
  - `.eco-scrim` — dim veil with a 10px backdrop blur (the only blur in the app).
  - `.eco-dialog` (`--sm` 420, default 480, `--lg` 640, `--danger` red border) — `sheet` surface, radius 28, padding 24, 1px `line` border, sections 18px apart.
  - `.eco-dialog__head` — `.eco-dialog__tile` (42px, accent-soft with accent icon; `--danger`) + `h2.eco-dialog__title` (19px/500) + close `IconBtn` (X) on the right.
  - `.eco-dialog__section` — a `.eco-field-label` above its control. Fields inside a dialog are `card` with radius 14.
  - `.eco-dialog__body` — explanatory paragraph in `tx2`.
  - `.eco-dialog__foot` — `.eco-dialog__hint` (keyboard hint, hidden on phones) on the left, `.eco-dialog__actions` on the right: cancel = `eco-btn--lg eco-btn--outline`, confirm = `eco-btn--lg eco-btn--primary` (or `--danger-solid`).
  - `.eco-optlist` (+ `__search`, `__scroll`) with `.eco-option` rows (`__tile`, `__text` > `__title` + mono `__sub`, `__check`); selected = `is-on` (accent border, soft accent fill, solid accent tile).
  - `.eco-choice` (`--mono`, `--dashed`, `is-on`) — selectable pill inside a dialog.
  - Legacy JS-positioned dialogs use `scrimStyle(t)` + `dialogSurface(t)`, which carry the same veil and radius.
  - Reference implementation: `NameAgentDialog` in `screens/Dashboard.tsx`.
- `.eco-banner` (`--warn`, `--err`, `--ok`, `--accent`), `.eco-empty` (empty state).

Shell: `.eco-sidebar` (`--mini`), `.eco-agent-row`, `.eco-tilegroup`, `.eco-agent-tile`, `.eco-bottomnav`.

If a pattern appears in two places and has no class, add a class to `eco.css` and list it here instead of repeating inline styles.

## 5. Primitives (`design/primitives.tsx`)

Thin wrappers over the classes. Prefer them to raw markup.

| Primitive | Notes |
|---|---|
| `PageHeader {eyebrow, title, sub, after, actions}` | Top of every screen. `after` = chips beside the title. |
| `Card {variant}` | `default` / `list` / `nav` / `flush` / `stack`. |
| `Row {icon \| tile, title, desc, first, tight, onClick}` | Children are the trailing control. |
| `IconTile {icon, size, accent, onRaised}` | |
| `Btn {kind, size, icon}` | kinds as in §4; sizes `sm` (28) / `md` (36) / `lg` (44). |
| `IconBtn {icon, size, active}` | |
| `Segmented {options, value, onChange, size, onCard, iconsOnly}` | |
| `Chip {dot, tone, onCard, spin}`, `Pill`, `StatusDot`, `Kbd` | |
| `Toggle`, `FormField`, `fieldStyle(t)` | |
| `AgentGlyph`, `bubbleLetter` | Agent tile with its letters. |
| `PopoverMenu`, `AgentOptionsMenu` (`components/AgentOptionsMenu.tsx`) | Portal popover that follows the UI zoom. |
| `scrimStyle`, `dialogSurface`, `menuSurface` | For code that still builds dialogs inline. |

Icons: `design/icons.tsx` is the only import point (lucide adapters, size 16, stroke 1.75). Icons take the text color of their container.

## 6. Page patterns

- Screen = `<div className="eco-page eco-page--scroll">` → `PageHeader` → content.
- Settings-like content = `Card variant="list"` holding `Row`s. One card per topic, with an `.eco-eyebrow` or `.eco-h3` above when it needs a name.
- Lists of items (archived agents, files, users) = one `Card variant="list"`, each item a `.eco-row` with a tile, title + mono path, and actions at the end as `Btn kind="raised" size="sm"` (destructive: `kind="danger"`).
- Side nav = `.eco-split` with a `Card variant="nav"` of `.eco-nav-item`.
- Toolbars inside a panel card = a row of `.eco-subtab` / `.eco-iconbtn` with padding `12px 16px 8px`, no bottom border.
- Agent detail = header (eyebrow `Agents / repo · ID`, title, chips, action pills) → `.eco-tabs` → panels as cards (radius 22, bg `card`) → context panel on the right.
- Status colors only mean status. Category colors appear as a dot or a thin border, never as a filled background.

## 6b. Agent hub position

The list of agents lives in exactly one place, chosen in Settings → General (`eco.dock.enabled`, event `eco:dock-pref-change`):

- Bottom (`'1'`, default): the floating dock (`BubbleDock`) shows the agents; the sidebar shows only navigation.
- Left (`'0'`): the sidebar shows the agents (search + list grouped by project when expanded, tiles grouped by project when compact, 78px); the dock is not rendered.

The sidebar's compact/expanded state is the round toggle on the sheet edge (`eco.sidebar.collapsed`). Phones show neither: agents are reached from Overview.

## 7. Mobile

- `.eco-row`: on phones `.eco-row__main` has a 150px basis, so a toggle stays on the title line and wider controls (select, segmented, button) drop to a second line.

Two independent signals (`hooks/useMediaQuery.ts`): `isMobile` = touch sizing (44pt targets, 16px inputs); `isPhone` = layout collapse. Tablets are touch but keep the desktop layout with the sidebar collapsed to 78px.

- Phone: no sidebar or dock; bottom nav (`.eco-bottomnav`), hidden inside the agent detail. The sheet fills the screen (no margin, no outer radius).
- Titles drop to 28px, cards to padding 16, `.eco-split__nav` becomes a horizontal strip, dialogs become bottom sheets, action groups wrap under the title.
- Agent detail on phones: one compact header row, icon-only tabs, one panel at a time, context panel as a full-screen sheet.
- Inputs are 16px on touch (iOS zooms below that). Safe-area and iOS workarounds from `CLAUDE.md` Appendix F stay untouched.
- CSS handles hover, focus and breakpoints; use `useIsPhone()` only when the structure changes.

## 8. Don'ts

- No `backdrop-filter`, translucent backgrounds, gradients, glows or `boxShadow` on in-flow elements.
- No hardcoded hex colors in components (the terminal theme and the frozen graph are the exceptions).
- No new theme ids, no per-theme branches other than light/dark.
- No inline copies of an existing class; no `onMouseEnter` handlers to fake hover.
- No emojis, no user-facing string outside `lib/i18n.ts`.
- No uppercase text anywhere (see §3).
- Do not touch `GraphView`, `SatellitesLocal` or `design/legacy-graph-tokens.ts`.
