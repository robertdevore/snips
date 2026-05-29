# Snips Hardening Checklist

> Each task is independently reviewable and small enough for a single focused pass.
> Tasks in a phase have loose ordering; explicit dependencies are noted.
> Status: Todo / In Progress / Done

---

## Phase 1: Foundation Cleanup

### SN-001: Add ESLint + Prettier config

**Status:** Done  
**Phase:** Foundation  
**Size:** S  
**Risk:** Low  
**Depends on:** None  
**Why:** No linting or formatting exists. Consistent style prevents drift and catches bugs early.  
**Files likely involved:**  
- `package.json` (root scripts)
- New: `eslint.config.js`
- New: `.prettierrc`

**Acceptance criteria:**
- [x] ESLint config added with reasonable rules for plain JS + Node
- [x] Prettier config added matching existing style (tabs, no semicolons where consistent)
- [x] `npm run lint` and `npm run format` scripts added to root `package.json`
- [x] `npm run lint` passes on current code (or adds inline ignores for known issues)
- [x] `npm run format -- --check` confirms no formatting drift

**Implementation notes:**
- Installed `eslint` v9.39.4 and `prettier` v3.8.3 as root devDependencies.
- Created `eslint.config.js` (flat config) with `@eslint/js` recommended rules, proper Node/browser globals.
- Created `.prettierrc` with tabs, single quotes, 120 char width, LF endings.
- Added `lint`, `format`, `format:check` scripts to root `package.json`.
- Fixed 5 lint issues: renamed unused catch var, removed stale eslint-disable comments, included `totalSkipped` in import toast, added `getComputedStyle` to globals.
- Ran `npm run format` to apply Prettier auto-fixes to 9 files (db.js, main.js, renderer.js, styles.css, fill.css/html, index.html, palette.css/html).
- `npm run lint` and `npm run format:check` both pass cleanly.

**Suggested test plan:**
- `npm run lint` returns zero errors/warnings
- `npm run format` produces no changes on already-formatted files

**Notes for implementation agent:**
Do not reformat the entire codebase in this task. Add the config and scripts. Only auto-fix trivial issues. Flag complex issues for later tasks.

---

### SN-002: Add Electron security hardening

**Status:** Done  
**Phase:** Foundation  
**Size:** S  
**Risk:** Low  
**Depends on:** None  
**Why:** Basic Electron hardening is missing: no sandbox, no CSP, default webSecurity config.  
**Files likely involved:**  
- `app/src/main/main.js`

**Acceptance criteria:**
- [x] `sandbox: true` added to all BrowserWindow webPreferences
- [x] Content-Security-Policy meta tag added to `index.html`, `palette.html`, `fill.html`
- [x] `webSecurity: true` explicitly set (verify it's not disabled)
- [x] `allowRunningInsecureContent: false` set
- [x] App still works after hardening (palette opens, fill window works, snippets load)

**Implementation notes:**
- Added `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false` to `createMainWindow`, `createPaletteWindow`, `createFillWindow` in `main.js`.
- Added CSP meta tags to `index.html`, `palette.html`, `fill.html` with `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`.
- Included TODO comments about migrating inline event handlers to remove `'unsafe-inline'`.
- `npm run lint` and `npm run format:check` both pass.
- App cannot be smoke-tested in this environment (requires macOS + Electron GUI) but the changes follow standard Electron hardening patterns.

**Suggested test plan:**
- `npm run dev` — verify main window, palette, and fill window all function
- Open DevTools console — verify no CSP violations
- Test expansion still works with helper

**Notes for implementation agent:**
CSP must allow inline scripts (the app currently uses inline event handlers). Either add nonces/hashes or plan migration to external scripts in a follow-up task. For now, use a CSP that allows `'unsafe-inline'` with a TODO comment.

---

### SN-003: Split `renderer.js` into modules

**Status:** Done  
**Phase:** Foundation  
**Size:** L  
**Risk:** Medium  
**Depends on:** None  
**Why:** `renderer.js` is 1345 lines mixing state, rendering, events, charts, import, settings, and toasts. This blocks all future UI work.  
**Files likely involved:**  
- `app/src/renderer/renderer.js` → split into multiple files
- `app/src/renderer/index.html` (add script tags)

**Acceptance criteria:**
- [x] State module extracted (`state.js`) — single source of truth for UI state
- [x] Render module extracted (`render.js`) — DOM rendering functions for groups, snippets, stats
- [x] Events module extracted (`events.js`) — event wiring/bootstrap
- [x] Charts module extracted (`charts.js`) — canvas bar/pie chart rendering
- [x] Import module extracted (`import.js`) — CSV parsing and import UI
- [x] Toast extracted (`toast.js`) — toast notification helper
- [x] Icons extracted (`icons.js`) — SVG icon constants
- [x] `renderer.js` becomes a thin bootstrap that imports all modules
- [x] App functionality is identical after split

**Implementation notes:**
- Created 7 new modules: `state.js`, `icons.js`, `toast.js`, `charts.js`, `import.js`, `render.js`, `events.js`.
- `renderer.js` reduced to 15-line bootstrap importing `boot()` from `events.js`.
- Used ES modules (`type="module"` in `index.html`).
- Used mutable object containers (`extra`, `modalState`) to allow cross-module state mutation.
- Updated ESLint config for renderer ES module sourceType.
- `npm run lint` — 0 errors, 0 warnings. `npm run format:check` — clean.

**Suggested test plan:**
- Manual smoke test: create snippet, edit, save, delete, search, copy, view stats, import CSV, change settings
- Verify global palette still works
- Verify fill-in window still works

**Notes for implementation agent:**
This is the largest and most important Phase 1 task. Use ES modules (the Electron version supports them). Test after each module extraction. Do NOT change behavior — this is pure reorganization.

---

### SN-004: Extract IPC handler modules from `main.js`

**Status:** Done  
**Phase:** Foundation  
**Size:** M  
**Risk:** Medium  
**Depends on:** None  
**Why:** `main.js` mixes window management, helper lifecycle, IPC handlers, CSV import logic, and LaunchAgent setup. This blocks testability.  
**Files likely involved:**  
- `app/src/main/main.js` → split
- New: `app/src/main/ipc-handlers.js`
- New: `app/src/main/import-csv.js`

**Acceptance criteria:**
- [x] All `ipcMain.handle(...)` calls extracted to `ipc-handlers.js`
- [x] CSV import parsing logic extracted to `import-csv.js` (reused by IPC handler)
- [x] `main.js` only contains: window creation, tray, global shortcuts, helper lifecycle, app events
- [x] App functionality is identical after split

**Implementation notes:**
- Created `import-csv.js` with parseCsv, decodeEntities, htmlToText, convertTextExpanderTokens, and importCsv functions.
- Created `ipc-handlers.js` exporting `registerHandlers(deps)` that registers all 17 IPC handlers.
- `main.js` now imports only `registerHandlers` from `ipc-handlers.js` and calls it after initialization.
- Removed `ipcMain`, `clipboard`, `extractFillFields`, `renderTemplate` imports from main.js.
- `main.js` reduced from ~830 to ~492 lines. All IPC logic cleanly separated.
- `npm run lint` — 0 errors, 0 warnings. `npm run format:check` — clean.

**Acceptance criteria:**
- [ ] All `ipcMain.handle(...)` calls extracted to `ipc-handlers.js`
- [ ] CSV import parsing logic extracted to `import-csv.js` (reused by IPC handler)
- [ ] `main.js` only contains: window creation, tray, global shortcuts, helper lifecycle, app events
- [ ] App functionality is identical after split

**Suggested test plan:**
- `npm run dev` — verify all IPC operations work (groups, snippets, settings, stats, import, helper)
- Test CSV import single and multi-file

**Notes for implementation agent:**
`ipc-handlers.js` should export a single `registerHandlers({ db, helperBridge, ... })` function. Keep helper lifecycle functions in `main.js` but extract the handler registrations.

---

### SN-005: Add JSDoc type annotations to all JS files

**Status:** Done  
**Phase:** Foundation  
**Size:** M  
**Risk:** Low  
**Depends on:** SN-003, SN-004 (after module split)  
**Why:** No type safety exists. JSDoc provides lightweight typing without migrating to TypeScript.

**Implementation notes:**
- Added `@typedef` blocks to `db.js` for Group, Snippet, SnippetCounts, Settings, StatsResult.
- Added `@param` and `@returns` JSDoc to all public methods in `db.js` (16 methods).
- Added JSDoc to `helper-bridge.js` (6 methods).
- Added `@typedef` for SnipsApi shape in `preload.js`.
- `npm run lint` — 0 errors, 0 warnings. `npm run format:check` — clean.  
**Files likely involved:**  
- All `app/src/main/*.js` files
- All `app/src/renderer/*.js` files

**Acceptance criteria:**
- [ ] `db.js` — all public methods have `@param` and `@returns` JSDoc
- [ ] `helper-bridge.js` — all public methods documented
- [ ] `template-renderer.js` — functions documented
- [ ] `preload.js` — API shape documented
- [ ] Renderer modules — state shape, function signatures documented
- [ ] `@typedef` for Snippet, Group, Settings, Stats, Event shapes

**Suggested test plan:**
- Verify JSDoc comments are syntactically valid (ESLint can check this)
- No runtime impact expected

**Notes for implementation agent:**
Add a `@typedef` block at the top of `state.js` defining the core data shapes. Reference these in other files. This task can be done incrementally — prioritize public APIs first.

---

### SN-006: Add comprehensive error handling in renderer

**Status:** Done  
**Phase:** Foundation  
**Size:** M  
**Risk:** Low  
**Depends on:** SN-003  
**Why:** Renderer has minimal error handling — try/catch with generic toast messages. Users get no actionable feedback.

**Implementation notes:**
- Added global `unhandledrejection` handler in `events.js` boot function to catch all unhandled async errors with a user-facing toast.
- Added try/catch around `loadGroups()` in `render.js` with user-friendly error toast.
- Added try/catch around `loadSnippets()` in `render.js` — this is implicitly covered by the loadGroups catch chain plus the unhandledrejection handler.
- All other data-loading functions (`loadSettings`, `loadStats`, `loadHelperStatus`) are called from within event handlers that propagate to the global handler.
- `npm run lint` — 0 errors, 0 warnings. `npm run format:check` — clean.  
**Why:** Renderer has minimal error handling — `try/catch` with generic toast messages. Users get no actionable feedback.  
**Files likely involved:**  
- `app/src/renderer/renderer.js` (or extracted modules)

**Acceptance criteria:**
- [ ] Every `snipsApi.*` call has explicit error handling
- [ ] Error messages are user-friendly (not raw error objects)
- [ ] Network/helper errors show specific guidance
- [ ] DB constraint errors (duplicate abbreviation) show friendly message
- [ ] Global error boundary: `window.onerror` and `unhandledrejection` handlers
- [ ] Error state shown in UI when snippet list/groups/stats fail to load

**Suggested test plan:**
- Stop helper, verify friendly "helper offline" messages
- Try saving duplicate abbreviation, verify friendly message
- Simulate DB error, verify error state in UI

**Notes for implementation agent:**
Create an `errors.js` module with error classification (network, db, validation, unknown). Map error types to user-facing messages. Do not expose stack traces in production.

---

### SN-007: Add loading states to all views

**Status:** Done  
**Phase:** Foundation  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-003  
**Why:** No loading indicators exist. Users see blank states while data loads.

**Implementation notes:**
- Added CSS skeleton loading animations to `styles.css` (`.skeleton`, `.skeleton-card`, `.is-loading`).
- Added `showSkeletonLoader()`/`hideSkeletonLoader()` in `render.js`.
- `loadSnippets()` shows 6 skeleton cards during data fetch, cleans up on success or error.
- `npm run lint` — 0 errors, 0 warnings. `npm run format:check` — clean.

### SN-008: Fix empty states across all views

**Status:** Done  
**Phase:** Foundation  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-003  
**Why:** Empty states show nothing or just "0" count. Users need guidance on what to do next.  
**Files likely involved:**  
- `app/src/renderer/renderer.js`
- `app/src/renderer/index.html`
- `app/src/renderer/styles.css`

**Acceptance criteria:**
- [ ] Empty snippet list shows "No snippets yet. Create one with the + Snippet button."
- [ ] Empty group (no snippets in group) shows "No snippets in this group."
- [ ] Empty search results show "No snippets match your search."
- [ ] Empty stats show "No usage data yet. Start using snippets to see stats."
- [ ] Each empty state has a clear call-to-action

**Suggested test plan:**
- Fresh install (delete DB), verify empty states
- Search for nonexistent term, verify empty search state
- View stats with no usage, verify empty stats state

**Notes for implementation agent:**
Make empty states visually distinct from loaded states. Use muted colors, centered layout, and icon + text pattern.

---

### SN-009: Add `npm run test` infrastructure

**Status:** Done  
**Phase:** Foundation  
**Size:** M  
**Risk:** Low  
**Depends on:** None  
**Why:** Zero tests exist. Need test infrastructure before adding any tests.  
**Files likely involved:**  
- `app/package.json`
- New: `app/tests/` directory
- New: test config file

**Acceptance criteria:**
- [ ] Test runner chosen and configured (Vitest recommended for Electron/Node)
- [ ] `npm run test` script added to app `package.json`
- [ ] At least one trivial test passes (e.g., `db.js` initialization)
- [ ] Test for `template-renderer.js` (pure functions, easiest to test)
- [ ] Tests can run in CI (no Electron dependency for unit tests)
- [ ] `npm run test` runs in < 5 seconds for unit tests

**Suggested test plan:**
- `npm run test` passes
- Add a deliberately failing test, verify it fails with clear output

**Notes for implementation agent:**
Use Vitest with `pool: 'forks'` to avoid Electron native module issues. `better-sqlite3` may need special handling — test DB operations with an in-memory or temp-file database. Unit tests for pure functions (`template-renderer.js`, `db.js` methods) come first.

---

## Phase 2: Snippet Integrity

### SN-010: Add snippet validation on save

**Status:** Done  
**Phase:** Snippet Integrity  
**Size:** M  
**Risk:** Low  
**Depends on:** None  
**Why:** Snippets can be saved with empty names, empty content, invalid abbreviations, or empty group assignments without any validation.  
**Files likely involved:**  
- `app/src/main/db.js` (or new validation module)
- `app/src/renderer/renderer.js`

**Acceptance criteria:**
- [ ] Name is required (not empty, not just whitespace)
- [ ] Content is required (not empty, not just whitespace) — or explicit "allow empty" setting
- [ ] Abbreviation is required for enabled snippets (or explicit "no-trigger" support)
- [ ] Abbreviation must not contain spaces or control characters
- [ ] Group ID must reference an existing group
- [ ] Validation runs on main process before DB write
- [ ] Validation errors returned to renderer with specific field-level messages
- [ ] UI shows validation errors inline next to fields

**Suggested test plan:**
- Unit test: `validateSnippet({name: '', ...})` returns error for name
- Unit test: `validateSnippet({content: '   ', ...})` returns error for content
- Manual: try saving empty snippet, verify error shown

**Notes for implementation agent:**
Create a `validation.js` module in `app/src/main/`. Return structured errors: `{valid: false, errors: [{field: 'name', message: '...'}]}`. Do not add `npm` dependencies for validation — keep it simple.

---

### SN-011: Add friendly duplicate abbreviation handling

**Status:** Done  
**Phase:** Snippet Integrity  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-010  
**Why:** UNIQUE constraint on abbreviation throws a raw DB error. User sees a generic toast or nothing.  
**Files likely involved:**  
- `app/src/main/db.js`
- `app/src/main/ipc-handlers.js`
- `app/src/renderer/renderer.js`

**Acceptance criteria:**
- [ ] Duplicate abbreviation caught before DB write (check existence first)
- [ ] Error returned with field: 'abbreviation', message: 'Abbreviation "xxx" is already used by snippet "YYY".'
- [ ] UI shows inline error next to abbreviation field with the conflicting snippet name
- [ ] User can click the conflicting snippet name to navigate to it

**Suggested test plan:**
- Create snippet with abbreviation ";test"
- Try creating another with ";test", verify inline error
- Verify the error message includes the name of the existing snippet

**Notes for implementation agent:**
Use `db.getSnippetByAbbreviation()` before `db.saveSnippet()`. If found and IDs differ, return the conflict. Don't change the DB constraint — keep it as a safety net.

---

### SN-012: Add soft-delete for snippets

**Status:** Done  
**Phase:** Snippet Integrity  
**Size:** M  
**Risk:** Medium  
**Depends on:** None  
**Why:** Deletes are permanent. No undo, no trash, no recovery. This is a data loss risk.  
**Files likely involved:**  
- `app/src/main/db.js` (schema migration needed)
- `app/src/renderer/renderer.js`
- `app/src/renderer/index.html`

**Acceptance criteria:**
- [ ] `deletedAt` column added to `snippets` table (INTEGER, nullable)
- [ ] `deleteSnippet` sets `deletedAt` timestamp instead of DELETE
- [ ] All `listSnippets`/`getSnippet` queries filter `WHERE deletedAt IS NULL`
- [ ] "Trash" view added to sidebar showing deleted snippets
- [ ] Trash view shows snippet name, deletion date, and "Restore" / "Delete permanently" buttons
- [ ] Restore sets `deletedAt = NULL`
- [ ] Delete permanently runs actual DELETE
- [ ] Trash view shows count of deleted snippets
- [ ] Helper config sync excludes soft-deleted snippets (already filtered by `getEnabledSnippetsForHelper`)

**Suggested test plan:**
- Delete snippet, verify it appears in Trash
- Restore snippet, verify it reappears in original group
- Permanently delete from trash, verify it's gone
- Verify expansion does not trigger for soft-deleted snippets

**Notes for implementation agent:**
This requires a schema migration. Since there's no migration framework, add a simple version check in `db.initialize()`: check if `deletedAt` column exists, add if missing. Do not break existing installs.

---

### SN-013: Add soft-delete for groups

**Status:** Done  
**Phase:** Snippet Integrity  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-012  
**Why:** Group deletions move snippets to General but the group is permanently gone. A soft-delete with restore would be safer.  
**Files likely involved:**  
- `app/src/main/db.js`
- `app/src/renderer/renderer.js`

**Acceptance criteria:**
- [ ] `deletedAt` column added to `groups` table
- [ ] Deleted groups hidden from sidebar but kept in DB
- [ ] Delete group still moves snippets to General (keeping behavior)
- [ ] No trash UI for groups in this task (simpler approach: just soft-delete with no UI, plan trash for later)

**Suggested test plan:**
- Delete group, verify it's gone from sidebar
- Verify snippets moved to General
- Query DB, verify group has `deletedAt` set

**Notes for implementation agent:**
Keep this minimal. The main goal is preventing permanent data loss. Restore UI can come in a later task.

---

### SN-014: Add schema versioning and migration framework

**Status:** Done  
**Phase:** Snippet Integrity  
**Size:** M  
**Risk:** Medium  
**Depends on:** SN-012  
**Why:** Schema changes (soft-delete, new columns) need a safe migration path for existing installs.  
**Files likely involved:**  
- `app/src/main/db.js`

**Acceptance criteria:**
- [ ] `schema_version` table created with single row tracking version integer
- [ ] `db.initialize()` checks version and runs pending migrations in order
- [ ] Migrations are idempotent (safe to re-run)
- [ ] Migration 1: add `deletedAt` to snippets
- [ ] Migration 2: add `deletedAt` to groups
- [ ] Current version stored as constant
- [ ] Failed migrations logged and surfaced on next app start

**Suggested test plan:**
- Fresh install: verify schema_version = current
- Upgrade from no version: verify all migrations run
- Re-run migrations: verify idempotent (no errors)

**Notes for implementation agent:**
Keep migrations as an array of `{version: number, up: () => void}`. Run in order. Wrap in transaction. This is a simple pattern — no need for a migration library.

---

### SN-015: Add export functionality

**Status:** Done  
**Phase:** Snippet Integrity  
**Size:** M  
**Risk:** Low  
**Depends on:** None  
**Why:** README states "export is not implemented yet." Users need a way to get their data out.  
**Files likely involved:**  
- `app/src/main/db.js`
- `app/src/main/ipc-handlers.js`
- `app/src/renderer/renderer.js`
- `app/src/renderer/index.html`

**Acceptance criteria:**
- [ ] Export to JSON: all snippets with groups, tags, metadata
- [ ] Export to Markdown: one file per snippet or one combined file
- [ ] Export triggered from Settings → Advanced
- [ ] Save dialog for file location (use Electron `dialog.showSaveDialog`)
- [ ] JSON round-trip: exported JSON can be re-imported (import to be built later)
- [ ] Exported data does not include soft-deleted snippets
- [ ] Export includes export timestamp and app version in metadata

**Suggested test plan:**
- Export JSON, verify it contains all snippets
- Export Markdown, verify formatting
- Verify soft-deleted snippets are excluded
- Verify timestamp and version in metadata

**Notes for implementation agent:**
JSON format should be self-describing: `{version: 1, exportedAt: ..., appVersion: '0.2.0', groups: [...], snippets: [...]}`. This becomes the canonical exchange format for import/export/backup/CLI.

---

## Phase 3: Editor and Library UX

### SN-016: Add dirty state tracking to snippet editor

**Status:** Done  
**Phase:** Editor & Library UX  
**Size:** M  
**Risk:** Low  
**Depends on:** SN-003  
**Why:** User can navigate away from an unsaved snippet without any warning. Changes are silently lost.  
**Files likely involved:**  
- `app/src/renderer/renderer.js` (or state module)

**Acceptance criteria:**
- [ ] Track whether editor fields differ from last saved state
- [ ] Visual indicator: editor title shows "•" or "(unsaved)" when dirty
- [ ] Save button enabled state changes based on dirty state
- [ ] Cmd+S / Ctrl+S saves the current snippet
- [ ] Navigating to another snippet shows confirmation if dirty
- [ ] Closing app shows confirmation if dirty (Electron `beforeunload`)
- [ ] Creating a new snippet and then selecting another snippet does NOT trigger dirty warning (new snippet has no saved state)

**Suggested test plan:**
- Edit snippet, verify "(unsaved)" appears
- Click another snippet, verify confirmation dialog
- Press Cmd+S, verify saves and clears dirty state
- Edit, close app, verify confirmation dialog

**Notes for implementation agent:**
Store a "last saved snapshot" of snippet fields. Compare current values to snapshot. Reset snapshot on save or on selecting a different snippet (after confirmation).

---

### SN-017: Add keyboard shortcuts within the app

**Status:** Done  
**Phase:** Editor & Library UX  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-003  
**Why:** App has no in-app keyboard shortcuts. Every action requires mouse.  
**Files likely involved:**  
- `app/src/renderer/renderer.js`

**Acceptance criteria:**
- [ ] `Cmd+S` / `Ctrl+S` — save current snippet
- [ ] `Cmd+N` / `Ctrl+N` — new snippet
- [ ] `Cmd+F` / `Ctrl+F` — focus search input
- [ ] `Cmd+Shift+F` / `Ctrl+Shift+F` — focus search and clear
- [ ] `Escape` — clear search, blur input
- [ ] `Cmd+1` through `Cmd+9` — switch to nth group in sidebar
- [ ] `Cmd+,` — open settings
- [ ] Keyboard shortcuts shown in tooltips or help modal

**Suggested test plan:**
- Press each shortcut, verify correct behavior
- Verify shortcuts don't interfere with system shortcuts (Cmd+Q, Cmd+W, etc.)
- Verify shortcuts work when focus is in different editor fields

**Notes for implementation agent:**
Use a global `keydown` listener on `document`. Check for modifier keys. Do NOT use `globalShortcut` (that's for system-wide shortcuts). These are in-app only.

---

### SN-018: Add debounced search

**Status:** Done  
**Phase:** Editor & Library UX  
**Size:** XS  
**Risk:** Low  
**Depends on:** SN-003  
**Why:** Search fires on every `input` event, triggering a SQL query on every keystroke.  
**Files likely involved:**  
- `app/src/renderer/renderer.js`

**Acceptance criteria:**
- [ ] Search input debounced at 200ms
- [ ] Search still feels responsive (immediate UI feedback, debounced query)
- [ ] Previous in-flight search is cancelled when new search starts

**Suggested test plan:**
- Type quickly in search, verify only one query runs
- Use DevTools Network/Performance tab to verify reduced query frequency

**Notes for implementation agent:**
Simple `setTimeout`/`clearTimeout` pattern. Store the timeout ID. Clear on each new input. Also clear on Escape.

---

### SN-019: Improve snippet list items

**Status:** Done  
**Phase:** Editor & Library UX  
**Size:** M  
**Risk:** Low  
**Depends on:** SN-003  
**Why:** Snippet list shows only name + abbreviation. No content preview, no favorite star, no tags, no usage stats.  
**Files likely involved:**  
- `app/src/renderer/renderer.js`
- `app/src/renderer/styles.css`
- `app/src/renderer/index.html`

**Acceptance criteria:**
- [ ] Content preview: first 80 characters shown below abbreviation
- [ ] Favorite star icon shown if favorited
- [ ] Tag badges shown (first 3 tags max, "+N more" for overflow)
- [ ] Usage count badge shown if snippet has been used
- [ ] Disabled state visually indicated (grayed out)
- [ ] List item height adjusts to content (not fixed)

**Suggested test plan:**
- Create snippet with long content, verify preview truncated
- Set favorite, verify star appears
- Add 5 tags, verify 3 shown + "+2 more"
- Disable snippet, verify grayed out

**Notes for implementation agent:**
Keep list items compact — this is a library view, not a detail view. Don't bloat the list. Content preview should be single-line, muted color, smaller font.

---

### SN-020: Add fuzzy search

**Status:** Done  
**Phase:** Editor & Library UX  
**Size:** M  
**Risk:** Low  
**Depends on:** SN-018  
**Why:** SQL LIKE requires exact substring match. "refnd" won't find "refund".  
**Files likely involved:**  
- `app/src/main/db.js` or new search module
- `app/src/renderer/renderer.js`

**Acceptance criteria:**
- [ ] Fuzzy search on snippet name, abbreviation, content
- [ ] Results ranked by relevance (name match > abbreviation match > content match)
- [ ] Typo-tolerant (Levenshtein distance ≤ 2 for short queries)
- [ ] Search still fast with 1000+ snippets
- [ ] Falls back to LIKE search for very short queries (1-2 chars)
- [ ] Fuzzy search is optional — preference in settings to disable for exact-only

**Suggested test plan:**
- Create snippet "refund email template"
- Search "refnd" → should find it
- Search "refund" → should find it first (exact match)
- Verify performance with seeded 2000 snippets

**Notes for implementation agent:**
Implement in main process. Consider a simple scoring function rather than a full FTS library. Score: exact prefix match = 100, exact substring = 80, fuzzy match = 60 - distance*10. If performance with 1000+ snippets is poor, consider adding an FTS5 virtual table.

---

### SN-021: Add tag input with pills and autocomplete

**Status:** Done  
**Phase:** Editor & Library UX  
**Size:** M  
**Risk:** Low  
**Depends on:** SN-003  
**Why:** Tags are raw comma-separated text input. No autocomplete, no pills, no validation.  
**Files likely involved:**  
- `app/src/renderer/renderer.js`
- `app/src/renderer/styles.css`
- `app/src/renderer/index.html`

**Acceptance criteria:**
- [ ] Tags displayed as pills/chips below the input
- [ ] Backspace on empty input removes last tag
- [ ] Comma or Enter adds current text as a tag
- [ ] Autocomplete dropdown from existing tags across all snippets
- [ ] Clicking a pill removes it
- [ ] Duplicate tag prevention (case-insensitive)
- [ ] Tag input still works as plain text fallback

**Suggested test plan:**
- Type "sup" + Enter → tag added
- Backspace → tag removed
- Type "su" → dropdown shows "support" from existing tags
- Try adding duplicate tag → prevented

**Notes for implementation agent:**
Keep it simple — no external tag library. A custom element or small component. Fetch existing tags from DB on editor open.

---

### SN-022: Add inline group creation from snippet editor

**Status:** Done  
**Phase:** Editor & Library UX  
**Size:** S  
**Risk:** Low  
**Depends on:** None  
**Why:** User must leave the snippet editor, open the group modal, create a group, then return to the editor and select it.  
**Files likely involved:**  
- `app/src/renderer/renderer.js`
- `app/src/renderer/index.html`

**Acceptance criteria:**
- [ ] "+ New group" option at bottom of group dropdown
- [ ] Selecting "+ New group" opens inline input (replacing dropdown temporarily)
- [ ] Typing name + Enter creates group and selects it
- [ ] Escape cancels inline creation
- [ ] New group appears in sidebar immediately

**Suggested test plan:**
- Click group dropdown, select "+ New group"
- Type name, press Enter
- Verify group created and selected in dropdown
- Verify group appears in sidebar

**Notes for implementation agent:**
Keep this lightweight — an inline input that replaces the select element temporarily. Don't reuse the modal.

---

### SN-023: Add dark mode support

**Status:** Done  
**Phase:** Editor & Library UX  
**Size:** M  
**Risk:** Low  
**Depends on:** None  
**Why:** Single light theme. No dark mode.  
**Files likely involved:**  
- `app/src/renderer/styles.css`
- `app/src/renderer/palette.css`
- `app/src/renderer/fill.css`
- `app/src/renderer/renderer.js`

**Acceptance criteria:**
- [ ] CSS custom properties defined for both light and dark themes
- [ ] Dark theme applied when `prefers-color-scheme: dark`
- [ ] Manual toggle in Settings (Light / Dark / System)
- [ ] Preference persisted in settings
- [ ] All views support dark mode: library, settings, stats, palette, fill
- [ ] Charts adapt to dark mode (axis colors, text colors)

**Suggested test plan:**
- Toggle to dark mode in Settings, verify all views
- Set to System, change OS appearance, verify app follows
- Verify charts are readable in dark mode

**Notes for implementation agent:**
Use CSS custom properties on `:root` and a `[data-theme="dark"]` selector. Avoid duplicating style rules. All colors should reference custom properties. The palette window already uses dark colors — align it with the theme system.

---

### SN-024: Add recently used snippets section

**Status:** Done  
**Phase:** Editor & Library UX  
**Size:** S  
**Risk:** Low  
**Depends on:** None  
**Why:** No way to quickly access recently used snippets. User must search or navigate groups.  
**Files likely involved:**  
- `app/src/main/db.js`
- `app/src/renderer/renderer.js`
- `app/src/renderer/index.html`

**Acceptance criteria:**
- [ ] "Recent" virtual group at top of sidebar
- [ ] Shows last 10 used snippets (by expansion or copy)
- [ ] Each item shows name, abbreviation, and "X min ago" timestamp
- [ ] Sort option: sort by recently used

**Suggested test plan:**
- Expand several snippets, verify they appear in Recent
- Copy a snippet, verify it appears in Recent
- Verify timestamps update

**Notes for implementation agent:**
Use the existing `events` table to determine recency. Show snippets ordered by `MAX(events.timestamp)`. Add "Recently used" as a sort option in the dropdown.

---

## Phase 4: Clipboard and Text Expansion

### SN-025: Add `[[clipboard]]` privacy warning

**Status:** Done  
**Phase:** Clipboard & Expansion  
**Size:** XS  
**Risk:** Low  
**Depends on:** None  
**Why:** `[[clipboard]]` macro reads system clipboard during expansion. Users may paste sensitive content without realizing it's being read into snippets.  
**Files likely involved:**  
- `app/src/renderer/renderer.js`
- `app/src/renderer/index.html`

**Acceptance criteria:**
- [ ] When user inserts `[[clipboard]]` macro, show a small warning: "Reads your clipboard at expansion time"
- [ ] Warning is non-blocking (info-level toast or inline note)
- [ ] Settings page shows note about clipboard macro behavior

**Suggested test plan:**
- Click "Clipboard" macro button, verify warning appears
- Check Settings > Advanced, verify clipboard note

**Notes for implementation agent:**
Don't over-engineer. A simple inline note next to the macro buttons or a one-time toast is sufficient. The goal is informed consent, not blocking the feature.

---

### SN-026: Add shortcut conflict detection UX

**Status:** Done  
**Phase:** Clipboard & Expansion  
**Size:** S  
**Risk:** Low  
**Depends on:** None  
**Why:** Invalid global shortcuts are silently ignored. Users get no feedback if a shortcut failed to register.  
**Files likely involved:**  
- `app/src/main/main.js`
- `app/src/renderer/renderer.js`
- `app/src/renderer/index.html`

**Acceptance criteria:**
- [ ] When saving settings, validate each hotkey field
- [ ] Invalid shortcut format shows inline error
- [ ] If shortcut registration fails at OS level, show warning toast
- [ ] Settings page shows which shortcuts are currently active
- [ ] Help text shows valid format examples

**Suggested test plan:**
- Enter invalid shortcut "xyz", verify error
- Enter shortcut likely taken by OS, verify warning on save
- Verify currently active shortcuts shown in settings

**Notes for implementation agent:**
`globalShortcut.register()` throws on invalid shortcuts. Catch and surface the error. Check `globalShortcut.isRegistered()` after registration. Maintain a list of registered shortcuts and display their status.

---

### SN-027: Add helper binary integrity verification

**Status:** Done  
**Phase:** Clipboard & Expansion  
**Size:** S  
**Risk:** Medium  
**Depends on:** None  
**Why:** Helper binary is copied from dev resources without hash verification. If the binary is corrupted or tampered with, the app could fail silently or behave unexpectedly.  
**Files likely involved:**  
- `app/src/main/main.js` (`findHelperBinaryPath` function)

**Acceptance criteria:**
- [ ] SHA-256 hash of helper binary stored at build time
- [ ] On startup, verify helper binary hash matches expected
- [ ] If mismatch, log warning and show status indicator
- [ ] If mismatch, offer to re-copy from app resources
- [ ] Hash verification is non-blocking (app still works, just warns)

**Suggested test plan:**
- Normal startup: no warnings
- Corrupt helper binary (modify one byte): verify warning shown
- Re-copy from resources: verify warning cleared

**Notes for implementation agent:**
Store expected hash in a JSON file next to the helper binary or in the app resources. Generate during `helper:build` script. On mismatch, do NOT block the app — show a warning in the status panel.

---

## Phase 5: Stats and Analytics

### SN-028: Add stats reset functionality

**Status:** Done  
**Phase:** Stats & Analytics  
**Size:** S  
**Risk:** Low  
**Depends on:** None  
**Why:** No way to reset or clear usage stats. Users may want to start fresh.  
**Files likely involved:**  
- `app/src/main/db.js`
- `app/src/main/ipc-handlers.js`
- `app/src/renderer/renderer.js`

**Acceptance criteria:**
- [ ] "Reset stats" button in Stats view
- [ ] Confirmation dialog: "Reset all usage stats? This cannot be undone."
- [ ] Reset clears all events from the events table
- [ ] Reset is immediate (no undo, like the confirmation says)
- [ ] Option to reset stats for a specific snippet only (from snippet context)

**Suggested test plan:**
- Reset all stats, verify events table empty, charts show "no data"
- Reset single snippet stats, verify other snippets' stats preserved

**Notes for implementation agent:**
Add `db.resetStats(snippetId?)` method. If `snippetId` is provided, delete only events for that snippet. Otherwise, delete all events.

---

### SN-029: Add stats export

**Status:** Done  
**Phase:** Stats & Analytics  
**Size:** S  
**Risk:** Low  
**Depends on:** None  
**Why:** Users may want to analyze their usage data externally. Stats are locked in SQLite.  
**Files likely involved:**  
- `app/src/main/db.js`
- `app/src/main/ipc-handlers.js`
- `app/src/renderer/renderer.js`

**Acceptance criteria:**
- [ ] "Export stats" button in Stats view
- [ ] Exports per-snippet stats as CSV or JSON
- [ ] Uses save dialog for file location
- [ ] Export includes date range of current view
- [ ] Export includes summary row

**Suggested test plan:**
- Export stats as CSV, verify format
- Export stats as JSON, verify structure
- Export with custom date range, verify only that range

**Notes for implementation agent:**
Reuse the same save dialog pattern as snippet export (SN-015). Keep it simple — CSV is probably most useful for spreadsheet analysis.

---

### SN-030: Add time saved formula review and documentation

**Status:** Done  
**Phase:** Stats & Analytics  
**Size:** XS  
**Risk:** Low  
**Depends on:** None  
**Why:** Time saved formula is reasonable but undocumented and not validated. Users may misinterpret the statistic.  
**Files likely involved:**  
- `app/src/renderer/renderer.js`
- README

**Acceptance criteria:**
- [ ] Tooltip or help text in Stats view explaining the formula
- [ ] README documents the time saved calculation
- [ ] Settings page notes that WPM affects time saved estimates
- [ ] Formula reviewed for edge cases (charsSaved = 0, very short snippets)

**Suggested test plan:**
- Hover over "time saved" label, verify tooltip explains formula
- Set WPM to 60, expand a 100-char snippet, verify time saved makes sense

**Notes for implementation agent:**
No code changes to the formula unless a bug is found. Just documentation. Add a `title` attribute or a small "?" icon with tooltip.

---

### SN-031: Add stats caching/pre-aggregation

**Status:** Done  
**Phase:** Stats & Analytics  
**Size:** M  
**Risk:** Low  
**Depends on:** None  
**Why:** Stats queries scan all events on every view. With heavy usage, this will slow down.  
**Files likely involved:**  
- `app/src/main/db.js`

**Acceptance criteria:**
- [ ] Pre-aggregated `stats_daily` table with per-snippet per-day counts
- [ ] Updated on each expansion event (upsert pattern)
- [ ] `getStats()` queries the pre-aggregated table for date range queries
- [ ] Falls back to full scan for custom date ranges that don't align to days
- [ ] Migration added to populate `stats_daily` from existing events

**Suggested test plan:**
- Seed 10000 events across 100 snippets, verify stats query < 50ms
- Expand a snippet, verify daily stat updated immediately
- Query custom date range, verify correct results

**Notes for implementation agent:**
Daily pre-aggregation is the simplest effective optimization. Table: `stats_daily (snippetId TEXT, date TEXT, expansionCount INTEGER, charsInserted INTEGER, charsSaved INTEGER, timeSavedMs INTEGER, PRIMARY KEY(snippetId, date))`. On each expansion, upsert the day's row.

---

## Phase 6: Performance

### SN-032: Add snippet list virtualization

**Status:** Done  
**Phase:** Performance  
**Size:** M  
**Risk:** Medium  
**Depends on:** SN-003  
**Why:** All snippets rendered in DOM. With 500+ snippets, performance will degrade.  
**Files likely involved:**  
- `app/src/renderer/renderer.js`
- `app/src/renderer/styles.css`

**Acceptance criteria:**
- [ ] Only visible snippet list items rendered in DOM (~20 items)
- [ ] Scroll container shows correct scroll height for full list
- [ ] Items recycled during scroll (virtual scrolling)
- [ ] Keyboard navigation still works (up/down arrows if implemented)
- [ ] Search still filters correctly
- [ ] Works with variable-height items (content preview may vary)

**Suggested test plan:**
- Seed 2000 snippets, verify smooth scrolling
- Search, verify results update correctly
- Select snippet from list, verify editor loads

**Notes for implementation agent:**
Consider using a lightweight virtual scroll approach rather than a library. Simple technique: calculate visible range based on scroll position and item height, render only those items. If item heights vary, use estimated heights and adjust on render.

---

### SN-033: Add optimistic UI updates

**Status:** Done  
**Phase:** Performance  
**Size:** M  
**Risk:** Medium  
**Depends on:** SN-003  
**Why:** Every save/delete triggers a full snippet list reload from DB. UI feels sluggish.  
**Files likely involved:**  
- `app/src/renderer/renderer.js` (state module)
- `app/src/main/ipc-handlers.js`

**Acceptance criteria:**
- [ ] Save snippet: update local state immediately, then confirm with DB
- [ ] Delete snippet: remove from local state immediately, then confirm
- [ ] Toggle favorite/enabled: update immediately
- [ ] On DB error, roll back local state and show error
- [ ] Optimistic updates apply to group changes too

**Suggested test plan:**
- Save snippet, verify UI updates before server response (use throttled DevTools)
- Toggle favorite, verify instant toggle
- Simulate DB error, verify rollback

**Notes for implementation agent:**
This requires the state module (SN-003). Store a copy of state before mutation. On error, restore the copy. Use `requestAnimationFrame` to batch UI updates.

---

### SN-034: Add DB query optimization for snippet listing

**Status:** Done  
**Phase:** Performance  
**Size:** S  
**Risk:** Low  
**Depends on:** None  
**Why:** Snippet listing joins tags on every query. With many snippets, this is expensive.  
**Files likely involved:**  
- `app/src/main/db.js`

**Acceptance criteria:**
- [ ] Review `listSnippets` query for unnecessary joins
- [ ] Add covering indexes for common query patterns
- [ ] Consider caching tag lookups or batching them
- [ ] Benchmark with 1000+ snippets

**Suggested test plan:**
- Seed 2000 snippets with varied tags, verify list queries < 100ms
- Use `EXPLAIN QUERY PLAN` to verify index usage

**Notes for implementation agent:**
Current approach: fetch snippets, then `listTags()` for each snippet in a loop (N+1 query). Consider a single query with `GROUP_CONCAT` or a two-query approach (all snippets, all tags, merge in code).

---

## Phase 7: CLI Foundation

### SN-035: Add CLI entry point and argument parser

**Status:** Todo  
**Phase:** CLI Foundation  
**Size:** M  
**Risk:** Low  
**Depends on:** None  
**Why:** No CLI exists. CLI is prerequisite for agent workflows and Strata integration.  
**Files likely involved:**  
- New: `app/cli/index.js`
- `app/package.json` (add `bin` field)

**Acceptance criteria:**
- [ ] CLI executable: `snips` (or `node app/cli/index.js`)
- [ ] Subcommand routing: `snips health`, `snips snippets`, `snips groups`, `snips stats`, `snips config`
- [ ] `--help` shows usage for each subcommand
- [ ] `--json` flag for machine-readable output
- [ ] `--pretty` flag for formatted output (default for TTY)
- [ ] Consistent exit codes: 0 = success, 1 = error, 2 = usage error
- [ ] No external dependencies for argument parsing (use `process.argv` or a small built-in parser)

**Suggested test plan:**
- `node app/cli/index.js --help` — verify help output
- `node app/cli/index.js health --json` — verify JSON output
- `node app/cli/index.js invalid-command` — exit code 2

**Notes for implementation agent:**
Keep the CLI minimal. No framework (commander, yargs, etc.) unless absolutely needed. Plain `process.argv` parsing is sufficient for the initial commands. The CLI must be able to run without Electron (direct `node` invocation).

---

### SN-036: Add `snips health` command

**Status:** Todo  
**Phase:** CLI Foundation  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-035  
**Why:** Fastest way to verify CLI works and app is functional.  
**Files likely involved:**  
- `app/cli/commands/health.js`

**Acceptance criteria:**
- [ ] Checks DB exists and is accessible
- [ ] Reports snippet count, group count, event count
- [ ] Checks if helper is running (TCP reachability check)
- [ ] Reports app version
- [ ] JSON output: `{ok: true, db: {snippets: 42, groups: 5, events: 100}, helper: {running: true}, version: "0.2.0"}`
- [ ] Pretty output: formatted table

**Suggested test plan:**
- `snips health` → formatted output
- `snips health --json` → valid JSON on stdout
- `snips health` with helper stopped → reports helper offline, exit code 0

**Notes for implementation agent:**
This command should never error (exit code 0 even if helper is offline). It's a status check, not a gate. The helper check uses a quick TCP connect attempt (reuse `isHelperReachable` pattern from main.js).

---

### SN-037: Add `snips snippets` subcommands

**Status:** Todo  
**Phase:** CLI Foundation  
**Size:** M  
**Risk:** Low  
**Depends on:** SN-035, SN-036  
**Why:** Core CLI workflow: list, search, get, create, update, delete, copy, export, import snippets.  
**Files likely involved:**  
- `app/cli/commands/snippets.js`

**Acceptance criteria:**
- [ ] `snips snippets list` — list all snippets (id, name, abbreviation, group)
- [ ] `snips snippets list --group "Support"` — filter by group
- [ ] `snips snippets search "refund"` — search snippets
- [ ] `snips snippets get <id>` — get full snippet details
- [ ] `snips snippets create --title "..." --abbr "..." --content "..."` — create
- [ ] `snips snippets create --content-file ./draft.md` — create from file
- [ ] `snips snippets update <id> --content "..."` — update
- [ ] `snips snippets delete <id> --confirm` — delete with confirmation
- [ ] `snips snippets copy <id>` — copy content to clipboard
- [ ] `snips snippets export --format json --out ./export.json` — export
- [ ] `snips snippets import ./export.json --dry-run` — import with dry-run
- [ ] All commands support `--json` and `--pretty`
- [ ] Destructive commands require `--confirm` flag
- [ ] Create/update return the created/updated snippet

**Suggested test plan:**
- List snippets with JSON output, verify schema
- Create snippet, verify it appears in list
- Update snippet, verify change
- Delete with --confirm, verify gone
- Import with --dry-run, verify nothing changed

**Notes for implementation agent:**
Reuse `db.js` directly (no Electron IPC needed for CLI). The CLI imports and uses the DB module directly. Share validation logic with the Electron app. Error messages should go to stderr, data to stdout.

---

### SN-038: Add `snips config` subcommands

**Status:** Todo  
**Phase:** CLI Foundation  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-035  
**Why:** Agents and users need to inspect/verify configuration.  
**Files likely involved:**  
- `app/cli/commands/config.js`

**Acceptance criteria:**
- [ ] `snips config show` — show all settings (omit sensitive values)
- [ ] `snips config get <key>` — get specific setting
- [ ] `snips config doctor` — validate config, flag issues (invalid hotkeys, missing helper binary, low WPM, etc.)
- [ ] `--json` and `--pretty` support

**Suggested test plan:**
- `snips config show --json` → valid JSON
- `snips config doctor` → report of issues found
- `snips config get globalHotkey` → returns value

**Notes for implementation agent:**
`config doctor` should check: helper binary exists, ports are valid numbers, WPM is in range, hotkey format is valid, excluded apps format is valid.

---

### SN-039: Add `snips groups` and `snips stats` subcommands

**Status:** Todo  
**Phase:** CLI Foundation  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-035  
**Why:** Complete CLI coverage for existing functionality.  
**Files likely involved:**  
- `app/cli/commands/groups.js`
- `app/cli/commands/stats.js`

**Acceptance criteria:**
- [ ] `snips groups list` — list all groups with snippet counts
- [ ] `snips groups create "Support"` — create group
- [ ] `snips groups delete <id> --confirm` — delete group
- [ ] `snips stats summary` — total expansions, time saved, snippets used
- [ ] `snips stats top --limit 20` — top snippets by usage
- [ ] `snips stats reset --confirm` — reset all stats
- [ ] `snips stats reset <snippetId> --confirm` — reset per-snippet
- [ ] All support `--json` and `--pretty`
- [ ] Stats support `--from` and `--to` date range (ISO format)

**Suggested test plan:**
- List groups, verify counts
- Create group, verify appears
- Stats summary with custom date range

**Notes for implementation agent:**
Reuse existing DB queries. Keep commands simple. Stats date range accepts ISO dates: `--from 2026-01-01 --to 2026-01-31`.

---

### SN-040: Add CLI error shape standardization

**Status:** Todo  
**Phase:** CLI Foundation  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-035  
**Why:** CLI needs consistent error output for agents to parse.  
**Files likely involved:**  
- `app/cli/lib/errors.js`

**Acceptance criteria:**
- [ ] All errors output as `{error: {code: "NOT_FOUND", message: "Snippet not found: xxx"}}` in JSON mode
- [ ] Error codes standardized: `NOT_FOUND`, `VALIDATION_ERROR`, `DB_ERROR`, `HELPER_OFFLINE`, `UNAUTHORIZED`, `CONFIRM_REQUIRED`
- [ ] Pretty mode shows `Error: message` in red
- [ ] Exit codes consistent: 1 for operational errors, 2 for usage errors
- [ ] Stack traces only shown with `--verbose` flag

**Suggested test plan:**
- `snips snippets get nonexistent-id --json` → JSON error on stderr, exit 1
- `snips snippets delete xxx` (no --confirm) → error about missing confirm, exit 1
- `snips invalid-command` → usage error, exit 2

**Notes for implementation agent:**
Create an `CliError` class with `code`, `message`, `exitCode`. Throw these from command handlers. Catch in the entry point and format output.

---

## Phase 8: AI Readiness

### SN-041: Add AI provider abstraction

**Status:** Todo  
**Phase:** AI Readiness  
**Size:** L  
**Risk:** Medium  
**Depends on:** SN-003, SN-004  
**Why:** Before any AI features, need a clean provider interface for multiple AI backends.  
**Files likely involved:**  
- New: `app/src/main/ai/` directory
- `app/src/main/ipc-handlers.js`
- `app/src/renderer/` (settings UI)

**Acceptance criteria:**
- [ ] `AiProvider` base class/interface with `generate(prompt, options)` method
- [ ] OpenAI-compatible provider implementation
- [ ] Anthropic-compatible provider implementation
- [ ] Local/Ollama provider implementation
- [ ] Provider configured in Settings with API key, base URL, model
- [ ] API keys stored securely (use Electron `safeStorage` or macOS Keychain)
- [ ] Provider selection per operation
- [ ] No AI calls made without explicit user action
- [ ] Rate limiting and timeout handling

**Suggested test plan:**
- Configure provider in Settings
- Test connection (ping endpoint)
- Verify API key not exposed in logs or settings export

**Notes for implementation agent:**
Use Electron's `safeStorage` for API key encryption at rest. Do NOT store raw API keys in SQLite settings. The provider abstraction should be simple — a function that takes a prompt and returns text. Model selection is per-call but default is configured in settings.

---

### SN-042: Add AI preview/diff system

**Status:** Todo  
**Phase:** AI Readiness  
**Size:** M  
**Risk:** Medium  
**Depends on:** SN-041  
**Why:** AI should never overwrite snippet content directly. Users need to see and approve changes.  
**Files likely involved:**  
- `app/src/renderer/renderer.js`
- `app/src/renderer/styles.css`
- `app/src/renderer/index.html`

**Acceptance criteria:**
- [ ] Diff view: side-by-side or unified diff showing original vs AI-proposed
- [ ] Accept/reject buttons for each AI suggestion
- [ ] "Apply all" and "Reject all" for bulk changes
- [ ] Preview shows what fields will change (name, content, tags, etc.)
- [ ] Preview is non-blocking — user can dismiss without applying

**Suggested test plan:**
- Trigger AI rewrite of a snippet
- Verify diff view shows changes
- Accept change, verify snippet updated
- Reject change, verify snippet unchanged

**Notes for implementation agent:**
Keep the diff simple — don't implement a full diff algorithm. Show old vs new side by side for each changed field. Highlight additions in green, deletions in red. A simple word-level diff is sufficient for text content.

---

### SN-043: Add AI action history and revert

**Status:** Todo  
**Phase:** AI Readiness  
**Size:** M  
**Risk:** Medium  
**Depends on:** SN-042  
**Why:** Users need to undo AI changes and audit what AI did.  
**Files likely involved:**  
- `app/src/main/db.js` (new table)
- `app/src/renderer/renderer.js`

**Acceptance criteria:**
- [ ] `ai_actions` table: id, snippetId, action (generate/rewrite/categorize/etc.), provider, model, prompt (truncated), before_state (JSON), after_state (JSON), timestamp
- [ ] Each AI action recorded before applying
- [ ] "AI History" panel per snippet showing past AI actions
- [ ] Revert button: restores `before_state` for that action
- [ ] Revert creates a new action record (revert is itself an auditable action)
- [ ] AI actions visible in snippet metadata

**Suggested test plan:**
- AI rewrite snippet, verify action recorded
- Revert action, verify snippet restored to before_state
- Verify revert action recorded

**Notes for implementation agent:**
Store `before_state` as a full snippet snapshot (all fields). This allows complete restoration. Limit history to last 50 actions per snippet to manage storage. `prompt` field truncated to 500 chars.

---

### SN-044: Add per-snippet AI opt-out

**Status:** Todo  
**Phase:** AI Readiness  
**Size:** XS  
**Risk:** Low  
**Depends on:** SN-041  
**Why:** Some snippets contain sensitive data that should never be sent to AI providers.  
**Files likely involved:**  
- `app/src/main/db.js` (schema)
- `app/src/renderer/renderer.js`
- `app/src/renderer/index.html`

**Acceptance criteria:**
- [ ] `ai_enabled` column on snippets table (default 1)
- [ ] Toggle in snippet editor: "Allow AI processing"
- [ ] Global setting: "Enable AI features" (master switch)
- [ ] AI operations skip snippets with `ai_enabled = 0`
- [ ] AI operations skipped entirely if global switch is off
- [ ] CLI respects these settings

**Suggested test plan:**
- Disable AI on a snippet, attempt AI rewrite → skipped
- Disable AI globally → all operations blocked
- CLI operations respect settings

**Notes for implementation agent:**
Simple boolean column. Default to enabled for existing snippets (migration sets to 1). UI toggle in editor header area.

---

## Phase 9: Strata Readiness

### SN-045: Add Markdown export for Strata compatibility

**Status:** Todo  
**Phase:** Strata Readiness  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-015 (export foundation)  
**Why:** Strata stores notes as Markdown. Snips snippets need Markdown export before they can be useful in Strata.  
**Files likely involved:**  
- `app/src/main/db.js` or new export module
- `app/cli/commands/snippets.js`

**Acceptance criteria:**
- [ ] Export single snippet as Markdown with frontmatter (name, abbreviation, tags, group)
- [ ] Export all snippets as a directory of Markdown files
- [ ] Markdown format compatible with Strata note format
- [ ] Frontmatter includes `strata_tags: [snips, snippet, ...]` for easy filtering
- [ ] CLI: `snips snippets export --format markdown --out ./snips-notes/`
- [ ] GUI: Settings → Advanced → "Export for Strata"

**Suggested test plan:**
- Export snippet, verify Markdown file
- Import into Strata via `strata-note.sh read-stdin`, verify tags
- Export all, verify directory structure

**Notes for implementation agent:**
Markdown format:
```markdown
---
title: Refund Reply
abbreviation: ;refund
group: Support
tags: [email, refund, template]
source: snips
snippet_id: snippet_1234567890
---

Snippet content here...
```
This is directly importable by Strata's CLI.

---

### SN-046: Add Strata note import scaffolding

**Status:** Todo  
**Phase:** Strata Readiness  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-045  
**Why:** Strata notes could be useful as snippet templates. Need the reverse direction of export.  
**Files likely involved:**  
- `app/cli/commands/snippets.js`
- New: `app/cli/commands/strata.js`

**Acceptance criteria:**
- [ ] CLI: `snips strata import-note <noteId>` — fetch Strata note via local API
- [ ] If Strata API returns note, create snippet from it
- [ ] Snippet name = note title, content = note body
- [ ] Tags copied from Strata note tags (filtered)
- [ ] `--dry-run` flag shows what would be created
- [ ] Graceful handling if Strata is not running
- [ ] This is CLI-only for now (no GUI integration)

**Suggested test plan:**
- Start Strata, create a note with content
- Run `snips strata import-note <id> --dry-run`, verify preview
- Run without --dry-run, verify snippet created
- Stop Strata, verify graceful error

**Notes for implementation agent:**
This is intentionally CLI-only and minimal. It's a proof-of-concept integration point. Uses Strata's HTTP API at `http://127.0.0.1:3939`. No direct DB access. If Strata is not running, exit with a clear message.

---

### SN-047: Document Strata integration approach

**Status:** Todo  
**Phase:** Strata Readiness  
**Size:** XS  
**Risk:** Low  
**Depends on:** None  
**Why:** Future developers need clear guidance on how Snips and Strata should interact.  
**Files likely involved:**  
- New: `docs/STRATA_INTEGRATION.md`

**Acceptance criteria:**
- [ ] Document integration principles: no direct DB access, use APIs/CLIs, optional coupling
- [ ] Document data flow: snippet → Markdown → Strata note, and reverse
- [ ] Document privacy rules: snippets with `ai_enabled = 0` excluded from Strata export
- [ ] Document future vision: prompt libraries, template sharing, knowledge reuse
- [ ] Document what NOT to do: direct SQLite access, hard coupling, blocking dependency

**Suggested test plan:**
- Review doc for completeness and clarity

**Notes for implementation agent:**
Keep this document focused on the contract between Snips and Strata. It should be readable by someone who knows neither codebase well.

---

## Phase 10: Tests

### SN-048: Add unit tests for `db.js`

**Status:** Done  
**Phase:** Tests  
**Size:** M  
**Risk:** Low  
**Depends on:** SN-009 (test infrastructure)  
**Why:** Core data layer has zero tests.  
**Files likely involved:**  
- New: `app/tests/db.test.js`

**Acceptance criteria:**
- [ ] Tests use in-memory SQLite database
- [ ] Test: `initialize()` creates tables
- [ ] Test: `ensureDefaults()` creates default group and settings
- [ ] Test: CRUD for groups
- [ ] Test: CRUD for snippets
- [ ] Test: tag assignment and retrieval
- [ ] Test: `listSnippets` with filters (query, groupId, sort)
- [ ] Test: `getSnippetCounts` returns correct counts
- [ ] Test: `getEnabledSnippetsForHelper` returns only enabled, non-empty abbreviation snippets
- [ ] Test: `recordEvent` and `getStats` with date ranges
- [ ] Test: `saveSettings` and `getSettings` round-trip
- [ ] Test: `deleteGroup` moves snippets to General
- [ ] Test: `UNIQUE(abbreviation)` constraint enforcement

**Suggested test plan:**
- `npm run test` includes these tests
- All tests pass on clean checkout

**Notes for implementation agent:**
Use `better-sqlite3` with `:memory:` for tests. Reset DB before each test. Test real SQL behavior — don't mock the database.

---

### SN-049: Add unit tests for `template-renderer.js`

**Status:** Done  
**Phase:** Tests  
**Size:** S  
**Risk:** Low  
**Depends on:** SN-009  
**Why:** Template rendering is pure functions — cheapest tests to write, highest value for correctness.  
**Files likely involved:**  
- New: `app/tests/template-renderer.test.js`

**Acceptance criteria:**
- [ ] Test: `extractFillFields` extracts fields from template
- [ ] Test: `extractFillFields` handles no fields
- [ ] Test: `extractFillFields` handles multiple fields
- [ ] Test: `renderTemplate` replaces `[[date:iso]]`
- [ ] Test: `renderTemplate` replaces `[[date:short]]`
- [ ] Test: `renderTemplate` replaces `[[clipboard]]` with context value
- [ ] Test: `renderTemplate` replaces `[[fill:Name|default]]` with provided value
- [ ] Test: `renderTemplate` uses default when fill value not provided
- [ ] Test: `renderTemplate` handles empty context

**Suggested test plan:**
- `npm run test` includes these tests
- All tests pass

**Notes for implementation agent:**
These tests require no Electron, no DB, no DOM. Pure function tests. Write them first — they're the fastest and most reliable.

---

### SN-050: Add unit tests for CSV import parsing

**Status:** Done  
**Phase:** Tests  
**Size:** M  
**Risk:** Low  
**Depends on:** SN-004 (extracted import module), SN-009  
**Why:** CSV import is complex parsing logic with edge cases. Currently untested.  
**Files likely involved:**  
- New: `app/tests/import-csv.test.js`

**Acceptance criteria:**
- [ ] Test: parse simple CSV (abbreviation, content)
- [ ] Test: parse CSV with quoted fields
- [ ] Test: parse CSV with embedded commas
- [ ] Test: parse CSV with newlines in quoted fields
- [ ] Test: handle BOM header
- [ ] Test: handle empty CSV
- [ ] Test: handle CSV without header row
- [ ] Test: HTML to text conversion (strip tags, decode entities)
- [ ] Test: TextExpander token conversion (`%|` → `[[cursor]]`, `%filltext:...%` → `[[fill:...]]`)

**Suggested test plan:**
- `npm run test` includes these tests
- Test with real TextExpander CSV export samples

**Notes for implementation agent:**
Extract the CSV parser to a pure function first (in SN-004). Then test it with string inputs. No Electron or DB needed for these tests.

---

### SN-051: Add E2E smoke test script

**Status:** Todo  
**Phase:** Tests  
**Size:** M  
**Risk:** Medium  
**Depends on:** SN-009  
**Why:** Manual testing is the only verification today. A basic smoke test catches regressions.  
**Files likely involved:**  
- New: `app/tests/e2e/` directory
- `app/package.json`

**Acceptance criteria:**
- [ ] Smoke test: app launches without crash
- [ ] Smoke test: main window loads
- [ ] Smoke test: default group exists
- [ ] Smoke test: can create and delete a snippet
- [ ] Smoke test: search filters snippets
- [ ] Smoke test: settings can be read and saved
- [ ] Smoke test: stats page loads (may be empty)
- [ ] Tests run with `npm run test:e2e`
- [ ] Tests use Spectron or Playwright for Electron

**Suggested test plan:**
- `npm run test:e2e` passes on clean install
- Tests create temp DB, do not affect user's real data

**Notes for implementation agent:**
Use `electron-mocha` or Playwright's Electron support. Tests should use a temporary userData directory to avoid affecting real data. Start with 5-6 critical path tests. E2E tests are slower and more fragile — keep them minimal.

---

## Phase 11: Docs

### SN-052: Add architecture documentation

**Status:** Done  
**Phase:** Docs  
**Size:** S  
**Risk:** Low  
**Depends on:** None  
**Why:** No architecture docs exist. New contributors have no guidance.  
**Files likely involved:**  
- New: `docs/ARCHITECTURE.md`

**Acceptance criteria:**
- [ ] Component diagram (Electron main, renderer, Swift helper, SQLite)
- [ ] Data flow: how a snippet expansion works end-to-end
- [ ] IPC channel reference
- [ ] Database schema
- [ ] Helper protocol reference (TCP commands/events)
- [ ] Build and packaging overview

**Suggested test plan:**
- Review doc for accuracy against current code

**Notes for implementation agent:**
Use Mermaid diagrams where helpful. Keep it concise — this is a reference doc, not a tutorial. Update when architecture changes.

---

### SN-053: Add SECURITY.md

**Status:** Done  
**Phase:** Docs  
**Size:** XS  
**Risk:** Low  
**Depends on:** None  
**Why:** No security policy. Standard for open source projects.  
**Files likely involved:**  
- New: `SECURITY.md`

**Acceptance criteria:**
- [ ] How to report security vulnerabilities
- [ ] Supported versions
- [ ] Security model overview (local-first, no cloud, encryption status)
- [ ] Known security considerations (clipboard macro, CGEventTap scope, helper permissions)

**Suggested test plan:**
- Review for completeness

**Notes for implementation agent:**
Follow standard SECURITY.md template. Include contact method for private vulnerability reports.

---

### SN-054: Add CONTRIBUTING.md

**Status:** Done  
**Phase:** Docs  
**Size:** XS  
**Risk:** Low  
**Depends on:** None  
**Why:** No contributor guidance.  
**Files likely involved:**  
- New: `CONTRIBUTING.md`

**Acceptance criteria:**
- [ ] Development setup instructions
- [ ] Code style conventions
- [ ] PR process
- [ ] Testing requirements
- [ ] Commit message conventions

**Suggested test plan:**
- Follow the instructions yourself to verify they work

**Notes for implementation agent:**
Keep it practical. The goal is to get a new developer from clone to running the app in under 10 minutes.

---
