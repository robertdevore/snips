# Snips 0.5.0 hardening report

## Executive summary

Implemented a hardening candidate spanning shared data operations, helper IPC/execution,
agent CLI, daily-use recovery UX, packaging and current documentation. It is not yet certified
as a production daily driver: permission-enabled cross-application typing and signed helper/TCC
upgrade validation remain explicit environmental release gates.

## Major improvements

- **Expansion:** event callback schedules work; fills are asynchronous; active focus fast path retained;
  one canonical cursor marker maps to trailing grapheme navigation; normal syncs transmit deltas.
- **Reliability:** fill cancellation/timeouts clean up deterministically; window liveness checks;
  external DB refresh; failed saves and shortcuts are visible; explicit helper upgrade path.
- **Security:** authenticated loopback command/event protocol, payload limits/timeouts/schema checks;
  renderer sender checks, fixed external links, loopback Strata, bounded content, preserved sandbox/CSP.
- **Agent CLI:** installed launcher, explicit flags, compact bounded metadata, fields/pagination/count,
  stdin/file/JSON/JSONL input, atomic batches, dry-run, revision conflicts and explicit retry keys.
- **Human UX:** dirty drafts protected, real save errors, Trash/restore/permanent delete, lazy history
  inspection and conditional revert, multi-select trash/favorite, shortcut/helper/CLI recovery controls.
- **Integrity:** explicit transactional migration, active-only abbreviation uniqueness, history retention,
  atomic tags/group moves/imports, restore collision handling and WAL-safe legacy backup.
- **Packaging:** both architectures, bundled CLI/native SQLite, signed-helper bundle support,
  hardened runtime configuration, notarization script and checksum generation.
- **Tests/docs:** consolidated verification, macOS CI, native protocol and renderer smoke coverage,
  synthetic performance reports, canonical AGENTS.md and archived historical audits.

## Concrete bugs fixed

Unauthenticated non-loopback helper listener; unbounded event bodies; missing version negotiation;
stale helper silently retained; synchronous event-tap fill wait; leaked timed-out fill request;
cancellation inserting default content; swallowed cursor marker; unused non-exact case settings;
trashed abbreviation conflicts and deleted-row lookups; nontransactional tags/group movement;
catch-all migration exceptions; CLI short-option collision; full-body unbounded machine lists;
non-installed CLI; stale writes without conflict checks; silent import overwrite/partial import;
stale main-window dereferences; ignored shortcut registration failure.

Additional discoveries: GUI reported success after rejected validation; mutable helper status object
was replaced while handlers retained the old object; delta acknowledgments could clear permission
status; immediate abbreviations ending in punctuation could not match; palette could retain a dead
window; legacy database copy omitted committed WAL data; clipboard/fill text could be parsed again
as template macros; avatar interpolation bypassed safe DOM property assignment. Regression coverage
or guarded implementation now addresses these paths.

## Agentic improvements and performance

At 10,000 snippets, actual CLI search subprocess median changed from **377.824 ms / 18,894,516 bytes**
to **141.203 ms / 14,356 bytes**. No token count is invented. A one-snippet helper patch at 50k
measured **1.396 ms**, compared with **86.465 ms** for full index application in the same build.
See `PERFORMANCE_CURRENT.md` for all stage timings, methods, budgets and exclusions.

## Validation

- `npm run lint`, `npm run format:check`, `npm test --workspace app`: passed; 57 JS tests.
- `npm run verify`: passed, including both Swift architectures and helper tests.
- `npm run helper:test`: production matching/focus/fill/cursor/auth/version tests and real Swift TCP
  auth/version/malformed/oversize rejection on an ephemeral port; no keyboard permission required.
- `npm run test:e2e`: passed real isolated renderer/preload tests, including dirty selection and
  existing group/sidebar regressions at 900/1180/1500 px.
- `npm run benchmark`: passed. An isolated rerun supplies the performance table.
- `npm run package:verify`: fresh x64 and ARM64 app packages; Intel packaged SQLite and CLI mutation
  smoke pass, ARM64 CLI and native-binding architecture inspected. ARM64 execution is unavailable here.
- `npm audit`: zero reported vulnerabilities. No new runtime dependencies were added.
- `security find-identity`: zero signing identities. No Developer ID/notarization success is claimed.
- Keyboard permission probe: Accessibility=false, ListenEvent=false, PostEvent=false.
- GitHub issue/PR listing was accessible and returned no open items at baseline.

A packaging check initially attempted to execute an ARM64 artifact on Intel and failed; it now
separates cross-architecture artifact inspection from runnable host tests. An intermediate Swift
cursor-sentinel literal failed compilation and was replaced by a valid, per-expansion random marker;
final builds/tests pass. Neither transient failure remains an implementation blocker.

## Files by subsystem

Data/CLI: `db.js`, `migrations.js`, `operations.js`, `validation.js`, `import-csv.js`, `cli/`.
Helper/security: Swift helper, `helper-auth.js`, `helper-protocol.js`, `helper-bridge.js`, contracts.
App/UX: main lifecycle/IPC/preload, renderer events/render/styles/palette.
Release/verification: package metadata/lock, entitlements, helper/package/notarization scripts,
macOS workflow, JS/Electron/native tests and benchmark harnesses.
Documentation: AGENTS, architecture, CLI, security, recovery, performance, changelog, historical archive.

## Architecture decisions and deferred work

Keep one hardened local protocol; XPC is a replacement candidate, not a parallel stack. Retain the
legacy helper location until signed SMAppService/TCC migration can be tested. Use native SQLite FTS5,
100 local history records per snippet, revision checks and immediate transactions. Distribute CLI
through the app's own runtime instead of adding a Node installation dependency. No telemetry or AI.
MCP can be a thin future adapter over the existing operations module.

Missing Developer ID credentials, native keyboard permissions and Apple Silicon execution are real
release gates, detailed in `RECOVERY.md`. Auto-update and SMAppService migration are deliberately
paired with that signed upgrade gate. Clipboard monitoring/quick capture and generative AI remain
out of scope by the prompt's conditional priority. The app still computes helper diffs with an O(n)
local scan; full-search ranking at 50k is measurable rather than free. Large-content typing and
bounded input-queue overload behavior need real editor acceptance tests before a daily-driver claim.

## Recommendation

Use this as a tested hardening candidate and agent-interface foundation. Do not publish it as a fully
validated daily-driver upgrade until the permission/signing/cross-application acceptance matrix passes.
