> HISTORICAL / SUPERSEDED. This document describes an earlier repository state. Start at ../../AGENTS.md.

# Snips Repo Audit

## Executive Summary

Snips is a working, local-first macOS snippet expander built with Electron + a native Swift helper. Version 0.2.0 delivers working snippet CRUD, system-wide expansion via Unicode typing injection, a search palette, TextExpander CSV import, usage stats with charts, and settings. The app works end-to-end but is architecturally an early-stage prototype: a monolithic renderer, no TypeScript, no tests, no export, no CLI, no AI integration, and no structured modularity. It needs phased hardening before it can safely support CLI, AI, or Strata integration.

## Verified Current Architecture

- **Framework/runtime:** Electron 37.2.0 (macOS only)
- **Main process:** `app/src/main/main.js` (~780 lines) — window management, tray, global shortcuts, helper lifecycle, IPC handlers, CSV import, helper binary resolution, LaunchAgent install
- **Preload bridge:** `app/src/main/preload.js` (~35 lines) — contextBridge exposing `snipsApi` with typed IPC channels; `preload-fill.js` (~8 lines) for fill window. Context isolation is enabled, nodeIntegration is disabled.
- **Renderer/UI:** `app/src/renderer/renderer.js` (~1345 lines) — monolithic vanilla JS handling all UI state, rendering, events, stats charts, import, settings, toast, DOM manipulation. No framework. No components.
- **State management:** Single mutable `state` object in renderer.js. No store, no immutability, no reactive binding. UI re-renders triggered manually after each mutation.
- **Data/storage model:** `app/src/main/db.js` (~390 lines) — SQLite via better-sqlite3. WAL mode. Tables: `groups`, `snippets`, `snippet_tags`, `events`, `settings`. All values stored as text.
- **Snippet model:** `id`, `groupId`, `name`, `abbreviation`, `content` (text), `enabled`, `favorite`, `notes`, `triggerMode`, `caseMode`, `createdAt`, `updatedAt`. Tags stored in separate `snippet_tags` table. `UNIQUE(abbreviation)` constraint.
- **Category/tag model:** Groups (flat, no nesting despite `parentId` column). Tags stored as comma-separated in UI; normalized in `snippet_tags` table but no tag metadata/search/index beyond exact match.
- **Clipboard/expansion model:** Expansion is performed by Swift helper — Unicode character-by-character typing injection. Clipboard is NOT used for expansion (since v0.2.1), avoiding clipboard overwrite. Copy-to-clipboard available as explicit user action in the UI.
- **Usage stats model:** `events` table records each expansion with `snippetId`, `timestamp`, `charsInserted`, `charsSaved`, `timeSavedMs`, `appBundleId`. Stats queryable by date range. Charts rendered on canvas (bar + pie). Time saved = (charsSaved / (WPM × charsPerWord / 60)) × 1000 ms.
- **Tests:** None. Zero test files, zero test scripts, zero test infrastructure.
- **Build tooling:** npm scripts for `dev`, `build`, `helper:build`, `package:dmg`. electron-builder for DMG packaging. No linting, no formatting, no CI.

## What Works Today

1. Snippet CRUD (create, read, update, delete) via SQLite
2. Groups (categories) with create, rename, delete (delete moves snippets to General)
3. Tags (comma-separated, stored normalized)
4. Favorites toggle
5. Enabled/disabled toggle per snippet
6. System-wide text expansion via native Swift helper (CGEventTap + Unicode typing)
7. Four trigger modes: immediate, whitespace, wordBoundary, enterTab
8. Global search palette (Cmd+Shift+Space default)
9. Dynamic macros: `[[date:FORMAT]]`, `[[clipboard]]`, `[[fill:Label|default]]`, `[[cursor]]`
10. Fill-in fields UI (popup window with form)
11. Usage stats tracking: expansion count, chars inserted/saved, time saved
12. Stats visualization: bar chart (top 8 snippets), pie chart (top 5 + other)
13. Stats date range selector: 7d, 30d, last month, this month, custom
14. Excluded app bundle IDs (comma-separated config)
15. Secure Input detection and status reporting
16. Tray icon with context menu (open, palette, pause, quit)
17. Settings: name, avatar (base64 stored in settings), WPM, hotkeys, max buffer, excluded apps
18. Custom global hotkeys for open palette, open Snips, create snippet, open settings, open stats
19. TextExpander CSV import (single + multi-file, with drag & drop)
20. Accessibility and Input Monitoring permission management UI
21. Helper restart with reachability check
22. LaunchAgent auto-start for helper
23. macOS app packaging via electron-builder (DMG, universal binary)

## Major Gaps

### Architecture
- **No TypeScript** — all plain JS, no type safety
- **No framework** — vanilla DOM manipulation, no React/Vue/Svelte
- **Monolithic renderer** — `renderer.js` at 1345 lines mixes state, rendering, events, stats charts, import, and DOM logic
- **No component separation** — all UI logic in one file
- **No service layer** — DB calls go through IPC but business logic is ad-hoc in main.js handlers
- **No error boundaries** — no centralized error handling in renderer
- **No loading states** — no spinners, skeletons, or async feedback beyond toast messages

### Product
- **No export** — README states "export is not implemented yet"
- **No duplicate detection** — identical abbreviations throw DB constraint errors without friendly UX
- **No snippet variables/templates** beyond hardcoded macros
- **No rich text support** — plain text only
- **No archive/soft-delete for snippets** — deletes are permanent
- **No bulk operations** — no multi-select, bulk move, bulk delete, bulk tag
- **No undo/revert** for snippet edits
- **No recently used section**
- **No snippet preview** before expansion
- **No import from other tools** beyond TextExpander CSV

### UX
- **No dirty state tracking** — editor shows no indication of unsaved changes
- **No keyboard shortcuts within the app** — no Ctrl+S, Ctrl+N, etc. in the editor
- **No fuzzy search** — SQL LIKE only (no typo tolerance, no relevance ranking)
- **No dark mode** — single light theme
- **No responsive layout** — fixed sidebar width
- **No inline tag editing** — tags are raw comma-separated input
- **No confirmation before overwriting** when saving
- **No snippet list virtualization** — all snippets rendered, could slow with large libraries
- **No copy feedback animation** beyond toast

### Security
- **No CSP headers** in HTML files
- **No Electron security hardening** beyond contextIsolation (no sandbox, no webSecurity config visible)
- **Avatar stored as base64 data URL in settings** — no file size limit enforced
- **Settings stored as plain text** in SQLite
- **No encryption** for snippet data at rest
- **`shell.openExternal` used** — validates URL? (uses system URL scheme for settings)
- **LaunchAgent plist written to disk** — no integrity check
- **Helper binary copied from dev resources** — no hash verification
- **Clipboard read** by template renderer — could leak sensitive clipboard contents into snippets (by design, but worth noting)
- **`[[clipboard]]` macro reads clipboard** — privacy implication not surfaced to user

### Performance
- **No snippet list virtualization** — all snippets rendered in DOM
- **No debounce on search** — fires on every `input` event
- **Full snippet list re-fetched on every save/delete** — no optimistic updates
- **Stats queries scan all events** — no pre-aggregation
- **No memoization** — all derived values computed on every render
- **Canvas charts redraw on every resize via debounced handler**

### Tests
- **Zero tests** — no unit, integration, or E2E tests
- **No test infrastructure** — no test runner, no test config

### CLI
- **No CLI** — README mentions future CLI plans but nothing exists

### AI
- **No AI integration** — no provider abstraction, no generation, no rewriting

### Docs
- **README only** — no architecture docs, no API docs, no contributor guide
- **No inline code documentation** beyond a few comments in Swift
- **CHANGELOG** exists but only covers 0.2.0 and 0.2.1

## Snippet Management Audit

| Feature | Status | Notes |
|---|---|---|
| Create snippet | ✅ Working | ID auto-generated (`snippet_TIMESTAMP`) |
| Edit snippet | ✅ Working | Full CRUD via saveSnippet |
| Delete snippet | ✅ Working | Permanent delete, confirmation dialog |
| Group assignment | ✅ Working | Dropdown per snippet |
| Tags | ✅ Working | Comma-separated input, normalized storage |
| Name | ✅ Working | Defaults to "Untitled snippet" |
| Abbreviation | ✅ Working | UNIQUE constraint, acts as trigger |
| Content (text) | ✅ Working | Plain text only, `<textarea>` |
| Enabled/disabled | ✅ Working | Toggle per snippet |
| Favorite | ✅ Working | Toggle per snippet, affects sort order |
| Notes | ✅ Working | Separate textarea field |
| Trigger mode | ✅ Working | 4 modes, set per snippet |
| Case mode | Schema exists | `caseMode` column with "exact" default but no UI control |
| Search | ✅ Working | SQL LIKE on name/abbreviation/content |
| Sort | ✅ Working | 6 sort options |
| Duplicate detection | ❌ Missing | UNIQUE constraint catches duplicates but no friendly UX |
| Archive/soft-delete | ❌ Missing | Deletes are permanent |
| Bulk operations | ❌ Missing | No multi-select |
| Snippet variables | Partial | Only 4 hardcoded macros |
| Rich text | ❌ Missing | Plain text only |
| Import | Partial | TextExpander CSV only |
| Export | ❌ Missing | Not implemented |

## Text Expansion and Clipboard Audit

| Feature | Status | Notes |
|---|---|---|
| Copy-to-clipboard | ✅ Working | Via `navigator.clipboard.writeText()` in renderer, explicit user action |
| Paste/insert | ❌ N/A | Expansion uses Unicode typing injection, not paste |
| Global shortcut support | ✅ Working | `globalShortcut.register()` for multiple hotkeys |
| Trigger expansion | ✅ Working | Swift CGEventTap captures keystrokes, matches abbreviations, injects Unicode text |
| Collision handling | ⚠️ Limited | Longer abbreviations preferred; no user-visible conflict resolution |
| Permission requirements | ✅ Handled | Accessibility + Input Monitoring status shown, prompt buttons provided |
| Failure states | ✅ Handled | Helper offline/accessibility missing/secure input detected |
| Clipboard privacy | ✅ Good | Expansion does NOT touch clipboard (since 0.2.1 fix) |
| Shortcut conflicts | ⚠️ Basic | `try/catch` around register, silently ignores invalid |
| Platform differences | N/A | macOS only |
| `[[clipboard]]` macro | ⚠️ Privacy concern | Reads clipboard into snippet expansion — user may not expect this |
| Fill-in fields | ✅ Working | Popup window collects values before expansion |
| Backspace deletion | ✅ Working | Deletes typed abbreviation before inserting |

### Expansion Safety Assessment

The expansion mechanism (Unicode typing via CGEvent) is well-implemented:
- Does NOT use clipboard (avoids clipboard race conditions)
- Respects Secure Input (pauses in password fields)
- Respects excluded apps
- Has a pause toggle
- Handles fill-in fields with timeout (90s)
- Falls back to defaults if fill-in times out or is cancelled

Risks:
- CGEventTap is fragile on macOS (can be disabled by timeout, permissions, Secure Input)
- No Windows/Linux support
- Helper binary resolution logic is complex and fragile

## Usage Stats Audit

| Feature | Status | Notes |
|---|---|---|
| Usage count tracking | ✅ Working | Per-event recording with snippetId + timestamp |
| Last used timestamp | ✅ Working | `MAX(e.timestamp)` in per-snippet stats |
| Time saved calculation | ⚠️ Approximate | Formula: `charsSaved / (WPM × charsPerWord / 60)` seconds |
| Average snippet length | N/A | Uses actual output length per expansion |
| Stats persistence | ✅ Working | SQLite events table |
| Stats reset | ❌ Missing | No way to reset or clear stats |
| Stats export | ❌ Missing | No JSON/CSV export of stats data |
| Accuracy risks | ⚠️ Present | Time saved assumes user would type at WPM for the full snippet — doesn't account for snippet complexity or corrections |
| Privacy risks | ⚠️ Present | Events table records app bundle ID where expansion occurred — could reveal app usage patterns |
| UI usefulness | ✅ Good | Charts + table, date range selector |

### Time Saved Formula Analysis

Current formula in Swift helper:
```
charsPerMinute = WPM × charsPerWord
cps = charsPerMinute / 60
timeSavedMs = (charsSaved / cps) × 1000
```

This is reasonable but:
- Assumes the user would type the full snippet at their configured WPM
- Doesn't account for snippet complexity (e.g., code vs prose)
- Doesn't account for thinking time
- No per-snippet WPM override
- WPM is user-configurable (default 220) but not validated for realism

## UI/UX Audit

### Strengths
- Clean visual design with consistent color scheme
- Sidebar + main content layout is intuitive
- Status panel provides good permission debugging
- Toast notifications for feedback
- Canvas charts look professional
- Group hover reveals edit/delete actions
- Drag-and-drop CSV import is polished

### Weaknesses
- **No dirty state** — user can navigate away from unsaved snippet without warning
- **No inline save** — must click Save button explicitly; no Cmd+S, no autosave
- **No keyboard shortcuts** in editor (Ctrl+S, Ctrl+N, Escape to close, etc.)
- **Search is basic** — no fuzzy matching, no debounce (fires on every keystroke)
- **No empty state** for library (just shows 0 count)
- **No error state** for failed saves/loads
- **Editor always shows** — even when no snippet is selected (shows empty form)
- **Tag input is raw text** — no autocomplete, no tag pills, no tag suggestions
- **Group selector is a plain dropdown** — no create-new-group inline
- **Snippet list shows limited info** — only name and abbreviation; no content preview, no tag badges, no favorite star, no usage count
- **No recently used** section or sorting option
- **No pinned snippets** beyond favorites
- **Stats charts have no interactivity** — no tooltips, no click-through
- **No dark mode** — single light theme
- **No responsive layout** — fixed sidebar width, fixed palette size
- **ARIA labels present** but incomplete — no roles, no keyboard navigation patterns
- **Avatar preview updates on file select** but no remove/reset button

## Data Integrity Audit

| Concern | Status | Risk |
|---|---|---|
| SQLite WAL mode | ✅ Enabled | Good for concurrent access |
| UNIQUE constraint on abbreviation | ✅ Present | Prevents accidental duplicates |
| Group referential integrity | ⚠️ Partial | Delete group moves snippets to General but no foreign key constraint |
| Tag integrity | ✅ Good | Stored in normalized table, cleaned on save |
| Empty snippet handling | ⚠️ Weak | Name defaults to "Untitled snippet", content can be empty |
| Deleted snippet handling | ⚠️ Permanent | No soft delete, no trash, no recovery |
| Abbreviation uniqueness | ⚠️ DB-only | UNIQUE constraint fails silently in UI (catch needed) |
| Settings as key-value text | ⚠️ Fragile | No typing, no validation, no migration strategy |
| Event data integrity | ✅ Good | All fields required, timestamps recorded |
| Migration support | ❌ None | No schema versioning, no migration framework |
| Backup support | ❌ None | No automated backup, no export |
| Data location documented | ✅ In README | `~/Library/Application Support/Snips/data/snips.db` |

## Performance Audit

| Concern | Status | Impact |
|---|---|---|
| Snippet list rendering | ⚠️ Full re-render | All snippets rendered in DOM on any change |
| Search debounce | ❌ None | Fires SQL query on every keystroke |
| Stats queries | ⚠️ Full scan | No pre-aggregation, no caching |
| Canvas redraw | ⚠️ On resize | Redraws on every window resize |
| Helper config sync | ⚠️ Full payload | Sends all snippets on every config change |
| Startup time | ⚠️ Unmeasured | No profiling or benchmarks |
| Large library behavior | ⚠️ Untested | No virtualization, no pagination, no lazy loading |

## Modularity and DRY Audit

### Current File Structure Assessment

| File | Lines | Concerns | Recommendation |
|---|---|---|---|
| `renderer.js` | ~1345 | Everything: state, rendering, events, charts, import, toasts, settings | Split into modules |
| `main.js` | ~780 | Window mgmt, IPC, helper lifecycle, CSV import, LaunchAgent | Split helper/IPC/import concerns |
| `main.swift` | ~820 | Command server, event tap, expansion, fill, rendering, networking | Reasonable given Swift patterns |
| `db.js` | ~340 | Clean data access layer | Good separation |
| `helper-bridge.js` | ~115 | TCP/HTTP bridge | Good separation |
| `template-renderer.js` | ~45 | Template macros | Good separation |

### Duplicated Logic
- `extractFillFields` and fill rendering logic duplicated between `template-renderer.js` (Node) and `main.swift` (Swift)
- Date formatting logic duplicated between `template-renderer.js` and `main.swift`
- Settings defaults defined in both `db.js` (ensureDefaults) and `main.swift` (struct defaults)

### Missing Separation
- No `services/` layer between IPC handlers and DB
- No `components/` for UI elements
- No `utils/` for shared helpers
- No `types/` or schema definitions

## Security and Local-First Audit

| Area | Status | Notes |
|---|---|---|
| Local data ownership | ✅ All local | SQLite in userData, no cloud |
| Context isolation | ✅ Enabled | `contextIsolation: true` |
| Node integration in renderer | ✅ Disabled | `nodeIntegration: false` |
| Clipboard privacy for expansion | ✅ Good | Unicode typing, not clipboard swap |
| Explicit clipboard access | ⚠️ Via macro | `[[clipboard]]` reads clipboard during expansion |
| Sensitive snippet contents | ⚠️ Unprotected | Plain text in SQLite, no encryption |
| Token/secret handling | ✅ None | No API keys or tokens stored currently |
| Logs | ⚠️ Basic | `fputs` in Swift helper to stderr; no Electron logging config |
| Unsafe shell execution | ⚠️ Present | `execFile('/usr/bin/pkill')`, `execFileSync('/usr/bin/codesign')`, `execFile('/usr/bin/osascript')` in Swift |
| Global keyboard listener | ⚠️ Inherent risk | CGEventTap captures ALL keystrokes — necessary for expansion but requires trust |
| File overwrite safety | ⚠️ Partial | Helper binary copy checks existence before overwriting; no hash verification |
| CSP headers | ❌ Missing | No Content-Security-Policy in HTML |
| Electron sandbox | ❌ Not enabled | `sandbox: true` not set on windows |
| WebSecurity | ⚠️ Default | `webSecurity` not explicitly configured |
| `shell.openExternal` | ⚠️ Used | Opens system preferences URL — safe in this context but worth noting |
| Avatar upload | ⚠️ No validation | Any image file accepted, stored as base64 in settings, no size limit |
| Settings persistence | ⚠️ Plain text | All settings stored as text in SQLite |

## CLI Readiness Audit

**Current status: No CLI exists.**

### What Needs to Exist Before CLI

1. **Stable data access API** — currently only IPC handlers; need a CLI-accessible interface
2. **JSON output format** — no structured output convention
3. **Error shape standardization** — IPC returns inconsistent shapes (`{ok: bool}` vs thrown errors)
4. **Process-level data access** — CLI needs direct DB access or local API
5. **Command architecture** — no command pattern exists
6. **Exit codes** — no convention for success/failure
7. **Confirmation mechanism** — only `window.confirm()` in renderer
8. **Dry-run support** — no concept exists

### Recommended CLI Architecture

```
snips (entry point)
├── health          — check app/helper status
├── config          — show, doctor
├── snippets        — list, search, get, create, update, delete, copy, export, import
├── groups          — list, create, delete
├── tags            — list
├── stats           — summary, top
└── strata          — (future) save-snippet, import-note, search-candidates
```

## AI Readiness Audit

**Current status: No AI integration exists.**

### What Needs to Exist Before AI Features

1. **Provider abstraction** — model registry, API key management, provider selection
2. **Prompt templates** — system prompts for snippet generation, rewriting, categorization
3. **Diff/preview system** — show AI-proposed changes before applying
4. **Action history** — record AI-generated changes for review/revert
5. **Consent model** — per-snippet opt-out from AI processing
6. **Rate limiting** — prevent accidental mass processing
7. **Streaming support** — for real-time AI generation preview
8. **Sensitive content detection** — flag snippets that shouldn't be sent to AI
9. **Cost estimation** — show token count before sending

### Safety Requirements for AI Features

- AI must not overwrite snippets without preview and confirmation
- AI must not delete snippets without explicit confirmation
- AI must not send snippet content externally unless provider is configured
- AI-generated edits must support review/revert
- Sensitive snippets must be excludable from AI by user setting or per-snippet flag
- AI actions should be recorded in an audit log

## Strata Integration Readiness

**Current status: No integration exists.**

### Prerequisites

1. Snips must have a stable CLI or local API
2. Strata must have a stable CLI or local API
3. Export to Markdown/JSON must be implemented
4. Import from Markdown/JSON must be implemented
5. No direct database coupling

### Proposed Integration Points

- Save snippet as Strata note (via Strata CLI: `strata-note.sh`)
- Import Strata note as snippet (read note content via API)
- Search Strata notes for snippet candidates
- Export snippets as Strata-compatible JSON

### Rules
- Snips must work independently of Strata
- No direct Strata SQLite access
- Use HTTP API or CLI bridges only
- Integration is optional and user-initiated

## Documentation Gaps

| Document | Status | Notes |
|---|---|---|
| README | ✅ Present | Good overview, could use architecture diagram |
| CHANGELOG | ✅ Present | Only covers 0.2.x |
| API docs | ❌ Missing | No IPC API documentation |
| Architecture docs | ❌ Missing | No component diagram, no data flow docs |
| Contributor guide | ❌ Missing | No setup guide for new contributors |
| Security policy | ❌ Missing | No SECURITY.md |
| Code of conduct | ❌ Missing | No CODE_OF_CONDUCT.md |
| License | ✅ Present | MIT |
| CLI docs | ❌ Missing | No CLI exists |
| AI docs | ❌ Missing | No AI integration exists |

## Test Coverage Gaps

| Area | Status | Priority |
|---|---|---|
| Snippet CRUD | ❌ No tests | Critical |
| Group CRUD | ❌ No tests | High |
| Tag assignment | ❌ No tests | High |
| Search/filter | ❌ No tests | High |
| Duplicate detection | ❌ No tests | Medium |
| Stats calculations | ❌ No tests | High |
| Template rendering | ❌ No tests | Medium |
| CSV import parsing | ❌ No tests | Medium |
| Settings persistence | ❌ No tests | Medium |
| Helper bridge | ❌ No tests | Medium |
| IPC handlers | ❌ No tests | High |
| Renderer state | ❌ No tests | Medium |
| Clipboard behavior | ❌ No tests | Low (hard to test) |
| Expansion logic | ❌ No tests | Low (Swift tests needed) |
| E2E workflows | ❌ No tests | Low (after unit tests) |

## Recommended Cleanup Order

### Phase 1: Stabilize App Foundations
- Add TypeScript or JSDoc types
- Add ESLint + Prettier
- Add basic test infrastructure
- Electron security hardening (sandbox, CSP, webSecurity)
- Error boundaries in renderer
- Loading states

### Phase 2: Fix Snippet/Data Correctness
- Snippet validation on save
- Friendly duplicate abbreviation handling
- Soft-delete for snippets
- Schema versioning and migrations
- Export functionality

### Phase 3: Improve Editor and Search UX
- Dirty state tracking
- Keyboard shortcuts in editor
- Debounced search
- Snippet list improvements (content preview, tag badges)
- Empty states
- Dark mode

### Phase 4: Harden Clipboard/Expansion
- `[[clipboard]]` privacy warning
- Shortcut conflict detection UX
- Helper binary integrity verification
- Expansion edge case handling

### Phase 5: Improve Stats Correctness
- Stats reset functionality
- Stats export
- Time saved formula review
- Stats caching/pre-aggregation

### Phase 6: Improve Performance
- Snippet list virtualization
- Search debounce
- Optimistic UI updates
- Stats query optimization

### Phase 7: Add CLI Foundation
- CLI entry point
- Health, config, snippets list/get
- JSON output, exit codes, error shapes

### Phase 8: Prepare AI Foundation
- Provider abstraction
- Preview/diff system
- Action history
- Consent/per-snippet AI opt-out

### Phase 9: Prepare Strata Integration
- Export to Markdown/JSON
- CLI bridge design
- Integration tests

## Risks

1. **CGEventTap fragility** — macOS can silently disable event taps; expansion stops working without clear user feedback beyond status indicator
2. **Helper binary management** — complex resolution logic; permission grants can be lost on binary updates
3. **No Windows/Linux support** — Swift helper is macOS-only; expanding to other platforms requires a complete rewrite of the expansion mechanism
4. **Monolithic renderer** — current structure makes incremental feature additions expensive and bug-prone
5. **No tests** — refactoring without tests risks regressions
6. **Abbreviation collisions** — UNIQUE constraint prevents saving, but user gets no clear guidance
7. **Permanent deletes** — no undo, no trash; user data loss risk
8. **Settings fragility** — key-value text storage with no typing or migration strategy
9. **`[[clipboard]]` privacy** — users may not realize clipboard contents are read during expansion
10. **No encryption** — snippet data is plain text on disk; sensitive snippets (passwords, API keys) could be exposed
