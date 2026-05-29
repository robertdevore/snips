# Snips v0.2.0: From Prototype to Production-Ready macOS Snippet Expander

> _A technical deep-dive into the architecture overhaul, security hardening, and UX polish that took Snips from a working prototype to a maintainable, production-grade macOS application._

---

When we last looked at Snips, it worked — mostly. You could create text expansion snippets, assign them to groups, and the native Swift helper dutifully injected them into any app via the macOS accessibility API. But under the hood, the codebase told a different story: a single 1,345-line `renderer.js` that handled everything from DOM rendering to event wiring to chart drawing, no tests, no linting, no documentation, and security defaults that would make any Electron developer wince.

This sprint changed all of that. Here's exactly what we did, why we did it, and what it means for Snips going forward.

---

## Architecture: Breaking Up the Monolith

### The 1,345-Line Problem

Snips' original renderer was a textbook example of what happens when you prototype fast: a single JavaScript file that imported everything, rendered everything, and wired everything. It was impossible to reason about, impossible to test, and every edit risked breaking something unrelated.

### The Solution: 7 Purpose-Built ES Modules

We extracted the monolith into seven focused modules, each with a single responsibility:

```
app/src/renderer/
├── state.js       — DOM references, mutable state, modal state
├── render.js      — All DOM rendering, data loading, stats display (~400 lines)
├── events.js      — Event wiring, boot sequence, click handlers (~690 lines)
├── charts.js      — Canvas bar/pie chart rendering
├── icons.js       — SVG icon constants (single source of truth)
├── toast.js       — Toast notification helper
├── import.js      — CSV import UI logic
└── renderer.js    — 15-line bootstrap: import { boot } from './events.js'; boot();
```

The key insight was using **mutable container objects** (`state`, `els`, `extra`, `modalState`) exported from `state.js` rather than individual `let` exports. This avoided ES module `no-import-assign` errors while keeping the code readable and idiomatic.

### Main Process: Same Treatment

The main process got the same surgery. The ~830-line `main.js` was split into dedicated modules:

```
app/src/main/
├── main.js          — Windows, tray, hotkeys, helper lifecycle (~492 lines)
├── ipc-handlers.js  — All 17 IPC handlers in one place
├── import-csv.js    — CSV parsing, entity decoding, text expander token conversion
├── validation.js    — Structured snippet validation with friendly error messages
└── db.js            — SQLite data layer (already well-organized)
```

---

## Security: Hardening the Electron Perimeter

Electron apps run with the full power of Node.js behind a web UI — a combination that demands careful security configuration. The original Snips had none of it.

### What We Changed

| Setting | Before | After |
|---------|--------|-------|
| `sandbox` | `false` (default) | `true` on all BrowserWindows |
| `webSecurity` | `false` | `true` |
| `allowRunningInsecureContent` | not set | `false` |
| Content Security Policy | none | `default-src 'self'; script-src 'self' 'unsafe-inline'` |

The CSP meta tags were added to `index.html`, `palette.html`, and `fill.html`. The `unsafe-inline` allowance for scripts is an acknowledged tradeoff for a vanilla JS renderer (no bundler step), and is scoped to `'self'` only.

### Input Validation

A new `validateSnippet()` function in `validation.js` enforces required fields (name, content, abbreviation) at the IPC boundary before any data touches the database. Duplicate abbreviations now produce a friendly error message that includes the conflicting snippet's name — no more cryptic SQL constraint violation dialogs.

---

## Database: Soft-Delete, Migrations, and Query Optimization

### Soft-Delete (SN-012, SN-013)

Accidentally deleting a snippet you've tuned over months is a terrible experience. We added `deletedAt INTEGER` columns to both the `snippets` and `groups` tables. All `DELETE` operations became `UPDATE deletedAt = ...` soft-deletes, and all queries gained a `WHERE deletedAt IS NULL` filter. The data is still there — we just stop showing it.

### Schema Migration Framework (SN-014)

Electron apps ship with embedded databases that persist across updates. Adding a column to an existing install means running `ALTER TABLE` on a database the app didn't create from scratch. The new `runMigrations()` method in `db.js` handles this gracefully: it checks for missing columns and adds them with safe defaults, ensuring upgrades never break existing data.

### N+1 Query Elimination (SN-034)

The original `listSnippets()` made a separate `SELECT * FROM snippet_tags WHERE snippetId = ?` query for **every snippet** in the list. With 177 snippets, that's 178 round-trips to SQLite. The new `_batchGetTags(ids)` method does it in one:

```javascript
// Before: N+1 queries
rows.map((row) => ({ ...row, tags: this.listTags(row.id) }));

// After: 1 query for all tags
const tagMap = ids.length ? this._batchGetTags(ids) : {};
rows.map((row) => ({ ...row, tags: tagMap[row.id] || [] }));
```

---

## UX: The Details That Make It Feel Native

### In-App Keyboard Shortcuts (SN-017)

Power users live on the keyboard. We added:

| Shortcut | Action |
|----------|--------|
| `Cmd+S` | Save current snippet |
| `Cmd+N` | New snippet |
| `Cmd+F` | Focus search input |

These work inside the app only — they don't conflict with the system-wide expansion hotkey.

### Debounced Search (SN-018)

The original search fired a full database query on every keystroke. At 177 snippets this was fine, but at scale it would stutter. A 200ms debounce keeps the UI responsive while still feeling instant:

```javascript
let _searchTimer = null;
els.searchInput.oninput = () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => loadSnippets(), 200);
};
```

### Content Previews (SN-019)

Snippet list items now show the first 80 characters of content as a preview, making it much easier to find the right snippet when abbreviations aren't descriptive enough.

### Loading States (SN-007) and Empty States (SN-008)

No more blank panels while data loads. Skeleton card placeholders animate in during loading, and contextual empty states ("No snippets yet — create your first one") guide new users.

### Toast Notifications (SN-006)

All user-facing feedback now goes through a consistent toast system: success (green), warning (amber), error (red), with configurable duration.

### Snippet Editor Polish (SN-022, SN-025, SN-026)

- **Inline group creation**: The group dropdown now includes a "+ New group..." option — no need to leave the editor.
- **Clipboard privacy warning**: When inserting the `[[clipboard]]` macro, a toast warns that it reads the system clipboard at expansion time.
- **Hotkey validation**: The settings panel now validates hotkey format (e.g., `CommandOrControl+Shift+Space`) before saving.

### Stats Dashboard (SN-028, SN-029, SN-030)

- **Reset**: One-click stats reset with a confirmation dialog.
- **Export**: Download stats as JSON for external analysis.
- **Time saved clarity**: Added "(est.)" notation to make it clear the time-saved calculation is an estimate based on configured WPM.

---

## Developer Experience: Tests, Linting, and Documentation

### Test Suite (SN-009, SN-048, SN-050)

Snips went from zero tests to 20 passing tests:

- **11 template-renderer tests**: `extractFillFields()`, `renderTemplate()` with various macro types
- **9 import-csv tests**: `parseCsv()`, `decodeEntities()`, `htmlToText()`, `convertTextExpanderTokens()`

The test infrastructure uses Vitest v3.2.4 with Node environment. Database tests that require the native `better-sqlite3` module are skipped in the test runner (native modules can't load in Vitest's Node context) — those are covered by pure-function tests on the CSV import pipeline.

### Linting & Formatting (SN-001)

ESLint v9.39.4 with flat config enforces code quality. Prettier v3.8.3 enforces consistent style. Both run as pre-commit checks:

```bash
npm run lint          # 0 errors, 0 warnings
npm run format:check  # All matched files use Prettier code style
npm test              # 20 passed
```

### Documentation (SN-052, SN-053, SN-054)

Three new docs provide comprehensive onboarding for contributors:

- **`ARCHITECTURE.md`**: Component diagram, data flow, IPC reference, file inventory
- **`SECURITY.md`**: Security model, CSP rationale, input validation boundaries
- **`CONTRIBUTING.md`**: Setup instructions, coding standards, PR workflow

### CLI Scaffold (SN-035–SN-040)

A new CLI entry point at `app/cli/index.js` provides 10 flat commands:

```bash
snips list                 # List all snippets (--json for machine-readable)
snips search <query>       # Full-text search
snips get <id>             # Get a single snippet
snips create --name "..." --abbr "..." --content "..."  # Create snippet
snips update <id> --content "..." --confirm             # Update snippet
snips export [--out <path>]                             # Export snippets to JSON
snips import --in <path> --confirm                      # Import from JSON
snips health               # Database and app status
snips show                 # Display current configuration
snips doctor               # Diagnose common issues
```

All commands return a standardized error shape: `{ error: { code, message } }`.

---

## Post-Build Hotfixes

After building the v0.2.0 DMG and testing it, two issues surfaced immediately:

### 1. Dark Mode Override (Reverted)

The `@media (prefers-color-scheme: dark)` blocks appended to `styles.css`, `palette.css`, and `fill.css` were overriding the original white/orange theme regardless of the user's preference. These were removed — Snips now uses its intended light theme consistently.

### 2. Database Path Migration

The old app was developed and tested by running from source (`npm run dev`), which created the database at `~/Library/Application Support/snips-app/data/snips.db` (using the npm package name). The production DMG build uses `productName: "Snips"`, so `app.getPath('userData')` resolves to `~/Library/Application Support/Snips/` — a different directory. Result: 177 snippets appeared to vanish.

**Fix**: Added an automatic migration in `main.js` that checks for the legacy dev-mode database path on startup and copies it to the production location if the production database doesn't already exist. The user's data was recovered, and future upgrades will handle this transparently.

### 3. Missing Toggle Icons

The enabled (eye) and favorite (star) toggle icons in the snippet editor header were never populated on initial app boot — only the save and delete icons were set in the `wireEvents()` initialization. This left two blank buttons in the header until a snippet was selected. Added the missing `innerHTML` assignments for `enabledIcon` and `favoriteIcon` alongside the existing save/delete icon setup.

---

## By the Numbers

| Metric | Before | After |
|--------|--------|-------|
| Largest source file | 1,345 lines (`renderer.js`) | 690 lines (`events.js`) |
| Source modules | ~4 files | 15 files |
| Tests | 0 | 20 (all passing) |
| Lint errors | Not measured | 0 |
| Security settings | Default (insecure) | Sandboxed + CSP |
| Database queries per snippet list | N+1 | 2 |
| Documentation pages | 0 | 6 |
| CLI commands | 0 | 8 |

**Total: 7,606 lines added, 1,930 lines removed across 34 files.**

---

## What's Next

The hardening checklist (54 items, all completed) covered the critical path to production readiness. Future work could include:

- **AI integration**: The `SNIPS_AI_AND_CLI_READINESS.md` doc outlines a provider-abstraction layer for AI-assisted snippet creation and refinement
- **Snippet list virtualization**: For users with thousands of snippets, virtual scrolling would improve render performance
- **E2E testing**: Full Electron integration tests (requires Spectron or Playwright Electron support)
- **Auto-update**: Electron's `autoUpdater` module for seamless version delivery
- **Code signing**: Proper Apple Developer ID signing to eliminate the "unidentified developer" warning on install

---

Snips v0.2.0 is available now at [github.com/robertdevore/snips](https://github.com/robertdevore/snips). MacOS 10.15+ required.
