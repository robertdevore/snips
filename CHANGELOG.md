# Changelog

## 0.5.0 — unreleased

- Compact sidebar controls, preserve column positions when collapsing, and keep snippet counts on one line.
- Move helper/CLI recovery to a dedicated Status screen; reveal selection checkboxes on hover/focus
  and show bulk actions only with a selection.

- Authenticate and bound both helper IPC directions; version the protocol and detect obsolete helpers.
- Schedule expansion outside the event tap, clean up asynchronous fills, preserve cancellation text,
  protect injection from recursion and add grapheme-based cursor placement with documented limits.
- Add deliberate helper bundle upgrades, actionable permission/shortcut status and safe live-window broadcasts.
- Add atomic schema migration, reusable abbreviations after Trash, restore/purge, revision checks and local history.
- Add ranked FTS5 search, bounded SQL metadata, installed CLI, strict explicit flags, multiline/structured input,
  transactional batches, dry-run validation, explicit retry keys and compact capability discovery.
- Preserve dirty GUI drafts, show save failures, add Trash/history and bulk favorite/trash controls.
- Reject import collisions, preserve legacy WAL data, constrain Strata endpoints and renderer IPC senders.
- Add consolidated verification/CI, native package smoke checks, signing/notarization support and benchmarks.
- Archive historical audits; AGENTS.md is the canonical current entry point.
- Release remains gated on permission-enabled cross-application typing and signed TCC upgrade validation.


## 0.4.0 - 2026-08-11

### Added

- Added a guarded local Strata bridge for saving snippets, finding candidate notes, and previewing or confirming note imports.
- Added large-library database coverage and collision-resistant snippet/group identifiers.

### Changed

- Replaced per-snippet tag queries with bounded batch loading for faster library and search rendering.
- Made JSON backup writes atomic and reject unsupported backup shapes before importing.
- Updated the SQLite binding so the Node CLI and Electron app can share one ABI-stable packaged binary.
- Shortened the README around install, first use, CLI, permissions, and development.

### Fixed

- Removed stale hard-coded `0.2.0` version strings from exports, health output, the UI, and helper metadata.
- Removed executable inline script permission and safely rendered user-controlled names, abbreviations, groups, and statistics.

## 0.3.0 - 2026-08-08

### Added

- Added a scriptable CLI for listing, searching, creating, updating, importing, exporting, and diagnosing Snips data, with JSON output, dry-run previews, and confirmation gates.
- Added JSON backup/export support, multi-file CSV drag-and-drop import, richer statistics, keyboard shortcuts, loading states, and empty states.
- Added an in-app navigation menu and converted Snips into a proper macOS menu bar agent with tray controls for opening Snips, opening the palette, pausing expansions, and quitting.
- Added automated tests for template rendering and CSV import, plus ESLint and Prettier checks.

### Changed

- Split the renderer and main process into focused modules and hardened Electron windows with context isolation, sandboxing, and disabled Node integration.
- Improved helper performance by reducing work performed for every keystroke.
- Updated Electron, Vitest, and transitive dependencies to resolve known security advisories.

### Fixed

- Made fill-in prompt delivery reliable and prevented tray-menu interactions from opening the main window.
- Restored reliable window activation, debounced search, initial toggle state, helper synchronization for large snippet libraries, and migration from the legacy development database path.

## 0.2.1 - 2026-02-26

### FIX

- Snippet expansion now injects text by Unicode typing instead of pasteboard swapping, preventing clipboard overwrite and avoiding cases where existing clipboard content was pasted instead of snippet output.

## 0.2.0 - 2026-02-22

### TWEAK

- Sidebar group counts are right-aligned; edit/delete actions appear on hover.
- Snippet list scrollbar is hidden (still scrollable) so cards align full-width.
