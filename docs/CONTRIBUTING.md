# Contributing

Start with [AGENTS.md](../AGENTS.md), the current architecture and security boundaries.
Requirements: macOS 13+, Node 22+ (CI uses 24), npm and Xcode Command Line Tools.

```sh
npm ci
npm run helper:build
npm run dev
npm run verify
npm run test:e2e
npm run benchmark
npm run package:verify
npm audit
```

Start the app before running the helper manually: the app provisions its private authentication token.
`verify` is deterministic and needs no keyboard permissions; `test:e2e` launches isolated Electron
renderer/preload fixtures. Benchmarks use disposable generated libraries only. No personal snippet
or clipboard data may enter test fixtures. Packaging verifies actual bundled SQLite and CLI execution.

Use shared database operations, explicit errors and regression tests. Preserve the already-active
focus fast path and keep waits/injection out of the event-tap callback. Update protocol docs/tests
when changing either side. Agent writes should preview, check revisions, commit and retain history.
Signing, real typing compatibility, TCC upgrades and Apple Silicon execution are separate release gates.
