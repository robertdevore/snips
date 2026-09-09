# Snips — current agent entry point

Snips 0.5.0 is a local-first macOS (13+) snippet library and native text expander.
This checkout is authoritative; released 0.4.0 installers do not contain these changes.

## Architecture and ownership

- `app/src/main/db.js`: shared validated SQLite domain operations; GUI and CLI use this.
- `operations.js`: transactional batch, dry-run rollback, explicit idempotency and revision checks.
- `migrations.js`: ordered `PRAGMA user_version` upgrades. Never swallow migration failures.
- `app/cli/`: installed machine interface, explicit flags, bounded metadata, structured input.
- `app/src/renderer/`: sandboxed browser modules; `preload*.js` is the only privileged bridge.
- `helper/Sources/SnipsHelper/main.swift`: native matching, fill lifecycle and serial injection.
- `shared/contracts.json`: protocol v1. Commands/events require authentication, version and request ID.
- `scripts/`, `app/tests/`: verification, packaging, synthetic performance and renderer tests.

SQLite lives in `~/Library/Application Support/Snips/data/snips.db` (WAL).
Agents must use `snips`, never manipulate the live database. Tests use temporary synthetic databases.
Snippet revisions are monotonic; use `--if-revision` to avoid overwriting GUI/agent changes.
Trash is excluded from normal reads; active abbreviations are unique. Restore can conflict.
History is local, retained for the latest 100 mutations per snippet. Purge deletes history too.

## Interfaces

Install the bundled CLI using **Install / Repair CLI** on the Status screen. It writes
`~/.local/bin/snips`; add that directory to PATH yourself if needed. No shell files are edited.
Source equivalent: `npm run cli -- <command> ...` (requires an initialized database).

```sh
snips capabilities --json
snips search 'deployment' --json --limit 5
snips get <id> --json
snips update <id> --content-stdin --if-revision 14 --dry-run --json
snips update <id> --content-stdin --if-revision 14 --confirm --json
snips batch --stdin-jsonl --dry-run --json
```

Only `-h` and `-j` have short aliases. Unknown/duplicate flags fail. `list/search` default
to 50 compact metadata records; `--include-content` is explicit. See `docs/CLI_USAGE.md`.
Do not log snippet contents, raw keystrokes, clipboard data, or authentication secrets.
Do not silently overwrite imports, reset data, or permanently delete without explicit confirmation.

## Security and performance invariants

Commands bind **127.0.0.1:50555**, events **127.0.0.1:50556**. A 0600 per-install token
is shared by the app and helper; it is never exposed to renderers. This excludes other users
and unauthenticated processes, not malware with the same user's filesystem access.
Renderer IPC checks the top frame and exact bundled page. Preserve sandbox, isolation and CSP.
Fill waits are asynchronous. Event-tap callbacks schedule expansion; they must never sleep,
wait for interaction, activate apps, render templates, or inject text synchronously.
The already-active focus path must not activate or sleep. Preserve the compatibility delay
for abbreviation deletion until permission-enabled cross-application tests justify changing it.
Full config is for startup/recovery; normal updates carry deltas and monotonically ordered revisions.
Use synthetic data only for benchmarks. Report stage measurements separately from visible latency.

## Before submitting

```sh
npm ci
npm run verify
npm run test:e2e
npm run benchmark
npm run package:verify
npm audit
```

`verify` includes lint, format, JS/DB/CLI/bridge tests, both Swift builds and helper regression tests.
E2E uses isolated Electron fixtures. Real text injection/TCC and Developer ID signing require a
separate release gate; see `docs/RECOVERY.md`, `docs/SECURITY.md`, and `docs/PERFORMANCE_CURRENT.md`.
Commit coherent changes and push; leave a clean tree. Preserve durable session context in Strata
when available. SignalBox is only for unresolved, high-value findings, not completed summaries.

Historical audits and sprint reports are under `docs/history/`. They are not current requirements
or evidence of current behavior. Current architecture is `docs/ARCHITECTURE.md`.
