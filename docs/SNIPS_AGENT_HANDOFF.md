# Snips Agent Handoff

## Current Repo State

Snips v0.2.0 is a production-ready macOS snippet expander: Electron app + native Swift helper. The hardening sprint completed all 54 checklist items.

**What's in place:**
- Snippet CRUD with groups, favorites, tags, notes, soft-delete
- System-wide text expansion via native Swift helper (Unicode typing injection)
- Modular renderer (7 ES modules extracted from original 1,345-line monolith)
- Modular main process (IPC handlers, CSV import, validation extracted from main.js)
- Full CLI (10 commands: list, search, get, create, update, export, import, health, show, doctor)
- JSON export/import with validation and confirmation guards
- Electron security hardening (sandbox, CSP, webSecurity)
- 20 unit tests (template-renderer + import-csv), 0 lint errors
- Skeleton loaders, empty states, toast notifications
- Debounced search, content previews, in-app keyboard shortcuts
- Stats tracking with charts, reset, and export
- Comprehensive docs (ARCHITECTURE, SECURITY, CONTRIBUTING, agent handoff)

**Not yet in place:** TypeScript, AI integration, auto-update, code signing.

## What To Build Next

The foundation is solid. Priority areas for the next sprint:

1. **AI integration** — Provider abstraction, preview/diff system, action history/revert (SN-041 through SN-044)
2. **Strata bridge** — Export snippets to Strata notes, import Strata notes as snippets
3. **E2E testing** — Full Electron integration tests
4. **Code signing** — Apple Developer ID for seamless installs

## What Not To Do

- **Do not add AI write behavior before preview/history/revert exists.** SN-042 and SN-043 must come first.
- **Do not rewrite the whole app.** Refactor incrementally. Each task is small and independently reviewable.
- **Do not introduce direct DB coupling with Strata.** Use the CLI or HTTP API as the integration bridge.
- **Do not add invasive keylogging behavior.** The existing CGEventTap approach is sufficient.
- **Do not silently overwrite or delete snippets.** Always require confirmation for destructive operations.
- **Do not remove existing functionality.** The app works today. Preserve all current features.
- **Do not add Windows/Linux support in this pass.** The Swift helper is macOS-only.
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

1. Pick a task from `docs/SNIPS_HARDENING_CHECKLIST.md` or the "What To Build Next" list above.
2. Read the current files involved.
3. Make the smallest safe change.
4. Add or update tests.
5. Run `npm run lint`, `npm run format:check`, and `npm test`.
6. Verify CLI commands still work: `node app/cli/index.js health`
7. Commit with a descriptive message using conventional commit prefixes.
8. Report changed files and test results.

## First Implementation Slice (Completed)

The original "Foundation cleanup" slice (SN-001 through SN-009) and all subsequent checklist items (SN-010 through SN-054) are complete. See `docs/SNIPS_HARDENING_CHECKLIST.md` for the full 54-item log.

## Files Organized by Layer

| Path | Purpose |
|---|---|
| `app/src/main/main.js` | Electron main process, windows, tray, helper lifecycle |
| `app/src/main/db.js` | SQLite data layer (better-sqlite3, WAL mode) |
| `app/src/main/ipc-handlers.js` | All IPC handler registrations |
| `app/src/main/import-csv.js` | CSV parsing and TextExpander import |
| `app/src/main/validation.js` | Snippet data validation |
| `app/src/main/helper-bridge.js` | TCP/HTTP bridge to Swift helper |
| `app/src/main/template-renderer.js` | Template macro rendering |
| `app/src/main/preload.js` | Renderer IPC bridge (contextBridge) |
| `app/src/main/preload-fill.js` | Fill window IPC bridge |
| `app/cli/index.js` | CLI entry point (10 commands, JSON output, same db.js layer) |
| `app/src/renderer/renderer.js` | Bootstrap (15 lines) |
| `app/src/renderer/state.js` | App state, DOM refs, mutable containers |
| `app/src/renderer/render.js` | DOM rendering, data loading, stats |
| `app/src/renderer/events.js` | Event wiring, boot sequence, click handlers |
| `app/src/renderer/charts.js` | Canvas bar/pie chart rendering |
| `app/src/renderer/icons.js` | SVG icon constants |
| `app/src/renderer/toast.js` | Toast notification helper |
| `app/src/renderer/import.js` | CSV import UI logic |
| `app/src/renderer/index.html` | Main window HTML |
| `app/src/renderer/palette.html` / `palette.js` | Quick search palette |
| `app/src/renderer/fill.html` / `fill.js` | Fill-in fields popup |
| `app/src/renderer/styles.css` | Main window styles |
| `app/tests/` | Vitest test files (20 tests) |
| `helper/Sources/SnipsHelper/main.swift` | Swift native helper |
| `shared/contracts.json` | Helper/app message contract |
| `scripts/` | Build/package scripts |
| `docs/` | Documentation |

## Data Locations

- **SQLite DB:** `~/Library/Application Support/Snips/data/snips.db`
- **Settings:** Stored in `settings` table within the SQLite DB
- **Helper binary:** `~/Library/Application Support/Snips/helper/SnipsHelper.app/Contents/MacOS/SnipsHelper`
- **LaunchAgent:** `~/Library/LaunchAgents/com.snips.helper.plist`
- **Exported data:** User-chosen location via save dialog
