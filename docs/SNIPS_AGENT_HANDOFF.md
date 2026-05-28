# Snips Agent Handoff

## Current Repo State

Snips v0.2.0 is a working macOS snippet expander: Electron app + native Swift helper. Snippet CRUD works. System-wide text expansion works (Unicode typing injection, not clipboard-based). Search palette works. Stats tracking with charts works. TextExpander CSV import works. Settings and permission management work.

Architecturally, it's an early prototype: monolithic renderer (1345 lines of vanilla JS), no TypeScript, no tests, no CLI, no export, no AI integration. It needs phased hardening.

## What To Do First

1. **SN-001** — Add ESLint + Prettier config (low risk, immediate value)
2. **SN-002** — Add Electron security hardening (CSP, sandbox)
3. **SN-003** — Split `renderer.js` into modules (unblocks all UI work)
4. **SN-009** — Add test infrastructure (unblocks all testing)
5. **SN-010** — Add snippet validation on save (data integrity)

These five tasks establish the safety net needed for all subsequent work.

## What Not To Do Yet

- **Do not build Strata integration yet.** Prerequisites (export, CLI, stable API) are not in place.
- **Do not add AI write behavior before preview/history/revert exists.** SN-042 and SN-043 must come first.
- **Do not rewrite the whole app.** Refactor incrementally via the checklist. Each task is small and independently reviewable.
- **Do not introduce direct DB coupling with Strata.** Use HTTP API or CLI bridges only.
- **Do not add invasive keylogging behavior.** The existing CGEventTap approach is sufficient. Do not broaden key capture scope.
- **Do not silently overwrite or delete snippets.** Always require confirmation for destructive operations.
- **Do not remove the existing category/snippet/stat functionality.** The app works today. Preserve all current features.
- **Do not add Windows/Linux support in this pass.** The Swift helper is macOS-only. Cross-platform expansion is a separate major project.
- **Do not add npm dependencies unless necessary.** Keep the app lightweight.

## Architecture Rules To Preserve

- **Local-first.** All data stays on the user's machine. No cloud sync by default.
- **Snips works independently.** No dependency on Strata or any other app.
- **Snippets may contain sensitive personal/work text.** Treat all snippet data as potentially sensitive.
- **Clipboard behavior must be privacy-aware.** The `[[clipboard]]` macro reads clipboard — users must be informed.
- **Agent workflows should go through CLI/API surfaces.** Do not give agents direct DB access.
- **AI should draft and suggest before modifying.** Preview → confirm → apply → record → (optionally) revert.
- **Destructive operations require confirmation.** Delete, reset stats, import overwrite — all need explicit confirmation.
- **Expansion is macOS-only for now.** Do not attempt to port the Swift helper. If cross-platform is needed, design a new expansion layer.

## Recommended Work Loop

1. Pick one checklist item (start with SN-001).
2. Read the current files involved.
3. Make the smallest safe change.
4. Add or update tests.
5. Run `npm run lint` and `npm run test`.
6. Update the checklist status (Todo → In Progress → Done).
7. Commit with a message referencing the task ID (e.g., `feat: SN-001 add ESLint + Prettier config`).
8. Report changed files and test results.

## First Implementation Slice

**Best first slice: Foundation cleanup (SN-001 through SN-009)**

This establishes:
- Code quality tools (lint, format)
- Security hardening
- Module structure
- Type documentation
- Error handling
- Loading states
- Empty states
- Test infrastructure

Estimated effort: 8-12 focused sessions for an agent familiar with Electron and vanilla JS.

After this slice, the codebase is ready for feature work (snippet integrity, UX polish, CLI, AI).

## Files to Avoid Editing (Unless a Checklist Task Requires It)

- `helper/Sources/SnipsHelper/main.swift` — The Swift helper works. Only touch it for security fixes or specific checklist tasks (e.g., SN-025 clipboard warning integration).
- `shared/contracts.json` — Stable contract. Only change if adding new helper commands.
- `app/src/main/preload.js` / `preload-fill.js` — Stable bridge. Only change if adding new IPC channels.
- `app/package.json` build config — Works for packaging. Only change for checklist tasks (e.g., adding `bin` for CLI).

## Key Repo Paths

| Path | Purpose |
|---|---|
| `app/src/main/main.js` | Electron main process, windows, tray, helper lifecycle, IPC |
| `app/src/main/db.js` | SQLite data layer (better-sqlite3) |
| `app/src/main/helper-bridge.js` | TCP/HTTP bridge to Swift helper |
| `app/src/main/template-renderer.js` | Template macro rendering |
| `app/src/main/preload.js` | Renderer IPC bridge (contextBridge) |
| `app/src/main/preload-fill.js` | Fill window IPC bridge |
| `app/src/renderer/renderer.js` | Main UI (state, rendering, events, all logic) |
| `app/src/renderer/palette.js` | Quick search palette UI |
| `app/src/renderer/fill.js` | Fill-in fields popup UI |
| `app/src/renderer/index.html` | Main window HTML |
| `app/src/renderer/palette.html` | Palette window HTML |
| `app/src/renderer/fill.html` | Fill window HTML |
| `app/src/renderer/styles.css` | Main window styles |
| `app/src/renderer/palette.css` | Palette window styles |
| `app/src/renderer/fill.css` | Fill window styles |
| `helper/Sources/SnipsHelper/main.swift` | Swift native helper (key capture, expansion) |
| `shared/contracts.json` | Helper/app message contract |
| `scripts/` | Build/package helper scripts |
| `docs/` | Documentation (created by this audit) |

## Data Locations

- **SQLite DB:** `~/Library/Application Support/Snips/data/snips.db`
- **Settings:** Stored in `settings` table within the SQLite DB
- **Helper binary:** `~/Library/Application Support/Snips/helper/SnipsHelper.app/Contents/MacOS/SnipsHelper`
- **LaunchAgent:** `~/Library/LaunchAgents/com.snips.helper.plist`
- **Exported data:** User-chosen location via save dialog
