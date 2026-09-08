# Architecture — 0.5.0

The Electron UI and installed CLI share `SnipsDb` validation and transactional mutations.
`operations.js` composes those mutations for batch, idempotency, dry-run, and revert; a future
MCP adapter should call this same module. No AI service or extra daemon is required.

## Data

SQLite WAL plus a 5-second busy timeout handles short concurrent GUI/CLI transactions.
Migration 1 rebuilds the old global-unique snippet table, preserves IDs/data, adds revision,
creates a partial active-abbreviation unique index, FTS5 and local history. Unexpected SQL
errors roll back and stop startup. Unknown future versions are rejected. Existing legacy
caseMode values were nonfunctional: migration normalizes them to `exact`, the only supported
case-sensitive mode. Other values now fail validation.

Group movement, snippet+tag saves, trash/restore, history, CSV imports, JSON imports, and
batches are atomic. Normal lookup/get/search exclude Trash. Restore moves a snippet whose
group was deleted into General and rejects an occupied abbreviation. Purge requires Trash
and removes tags, events, history and retry receipts. This is logical deletion, not secure
forensic erasure of WAL/backups/SSD blocks. Foreign keys were not added to dirty legacy
schemas; group existence is enforced in shared domain operations. No direct SQL API exists.

FTS5 uses Unicode token prefix matching with AND semantics, weighted name/abbreviation,
exact-abbreviation priority and deterministic ID tie breaks. Punctuation-only queries use
abbreviation prefix search. Tag/group/favorite filters apply before limits. Recent-use sorting
uses expansion timestamps. GUI lists cap at 500; the palette caps at 30; CLI defaults to 50.
Metadata is projected in SQL, so ordinary lists do not load full content.

History stores previous/new snapshots, timestamp, operation and source in SQLite, retaining
100 entries per snippet. Revert uses the ordinary revision-checked mutation path. Explicit
idempotency keys bind a request hash to its committed result; ordinary create never upserts.
Receipts persist until a permanent purge clears them; keys should be unique per logical action.

## Native expansion

The event tap keeps a bounded abbreviation buffer and matches case-sensitively. Command/control/
option combinations reset matching. Expansion preparation is scheduled after the callback returns.
A fill request owns one callback; response, cancellation or the 90-second deadline removes it.
No semaphore or user-interaction wait blocks the event tap. Cancellation leaves typed text intact.

A serial worker restores the captured destination, deletes the abbreviation plus consumed delimiter,
types rendered Unicode, then restores the delimiter. Unicode key events carry a recursion marker
and target the captured process. Physical key-down events during injection are bounded and replayed
in order after completion. A fill window does not freeze ordinary typing; typing into the destination
cancels a pending fill. Switching to an unrelated app cancels insertion before deletion.

`[[cursor]]` removes one marker and sends one left-arrow per trailing Swift grapheme (including
the restored delimiter). This supports editors whose arrow key moves by grapheme. Bidirectional
text, custom editor navigation, IME composition and unusual rich-editor behavior require manual
validation; no claim of universal caret positioning is made. Clipboard is read only when its macro
is present. Unknown macros remain literal. Multiple cursor markers are rejected on save.

## IPC and lifecycle

See `shared/contracts.json` and `SECURITY.md`. Full config establishes revision; patch requires
an exact base revision and next revision. The app serializes syncs and resets its cache after failure.
Oversized recovery libraries are transferred in bounded chunks while expansion is disabled, then
re-enabled after the final acknowledgment. Ordinary edits carry only upserts/deletes/settings.
The app still reads enabled metadata/content to compute a diff; a DB change-log could remove that
O(n) local scan if future profiling justifies it.

`PRAGMA data_version` polling every second refreshes helper configuration after external writes.
The renderer preserves dirty drafts and rejects stale saves. Window broadcasts always check liveness.
Hotkey conflicts appear in Status and in a fresh `doctor` runtime snapshot.

The packaged helper bundle is copied intact to a stable per-user path. Hash comparison detects
outdated copies even when version strings match. **Upgrade helper** explicitly replaces it and
warns about TCC re-grants. Legacy LaunchAgent installation remains; migration to SMAppService is
reserved for a signed, permission-tested release because its bundle location and registration
change the existing TCC identity. There is one runtime IPC implementation, not a parallel XPC stack.

The CLI launcher invokes the bundled Electron runtime in Node mode, loading packaged native
SQLite. It does not need an independently installed Node runtime or modify shell startup files.
MCP and generative AI are deliberately absent; the service module is their future boundary.
