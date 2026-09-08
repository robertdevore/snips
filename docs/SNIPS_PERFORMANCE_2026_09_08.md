# Expansion latency verification — September 8, 2026

Base: `4980d01` (origin/main at task start). macOS 26 / Darwin 25.6.0,
local Swift release compiler and Electron 41.10.3. No personal snippets or
clipboard content were used in these tests.

## Confirmed bottleneck and fix

Every expansion calls `refocusFrontmost` before deleting the abbreviation and
posting Unicode key events. Even when the destination application was already
active, this method activated it again and slept for 420 ms. That delay affects
ordinary typed expansions regardless of snippet size. It also runs synchronously
in the key-event callback, delaying its return.

The helper now returns immediately when the destination `NSRunningApplication`
is already active. An inactive destination still takes the existing activation
and 420 ms wait, including after a fill-in window changes focus. The 90 ms
post-deletion wait, abbreviation deletion counts, Unicode event generation,
macro rendering, and usage events are unchanged.

## Before/after measurements

`python3 scripts/performance/focus-benchmark.py 4980d01` extracts the production
method from both revisions, compiles them together with `swiftc -O`, and alternates
nine calls per version against the actual already-frontmost macOS application.
It aborts if that application loses focus. It does not inject keystrokes.

| Focus step | Median | Minimum | Maximum | Samples |
| --- | ---: | ---: | ---: | ---: |
| Before | 421.833807 ms | 420.613424 ms | 554.846286 ms | 9 |
| After | 0.415423 ms | 0.329145 ms | 0.950418 ms | 9 |

Measured median reduction: 421.418384 ms (99.90% of the focus step).
A control run before editing measured both versions at approximately 423–425 ms.
This is measured focus-stage latency, **not an end-to-end typing throughput
benchmark**. The remaining 90 ms wait, event posting cost, and destination app's
processing time still contribute to visible expansion latency. No claim is made
about improved Unicode characters per second or third-party editor delivery.

The per-character injection loop and suffix matching were also inspected. This
change does not batch or otherwise alter key events; cross-application delivery
compatibility would need separate measurements before changing that mechanism.

## Regression and integration checks

- `python3 scripts/performance/focus-regression.py`: compiles the production
  `expand` and `refocusFrontmost` methods with instrumented OS effects. Covers
  active/inactive destinations, immediate/delimited deletion counts, palette
  insertion, fill focus restoration, unchanged Unicode handoff, injection flag
  reset, and missing PID. This is control-flow testing, not OS event delivery.
- `npm run helper:build`: release builds pass for x86_64 and arm64.
- `npm test --workspace app`: 25 tests pass, including malformed URI authorities,
  strict XML entity serialization, and legitimate AJV/plist behavior.
- `node_modules/.bin/electron app/tests/electron/renderer-smoke.cjs`: real renderer
  and preload with isolated in-memory IPC fixtures. Tests group move/repeated
  save/reselection, unsaved group preservation, removed-group fallback, delayed
  selection responses, sidebar persistence and fluid layout at 900/1180/1500 px.
  On base `4980d01`, the same save regression fails: the dropdown becomes General
  and a second save actually writes the snippet back into General.
- `npm run lint`, `npm run format:check`, and `npm audit`: pass; zero vulnerabilities.
- `CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:dir --workspace app`: unsigned
  x64 macOS directory packaging passes. The packaged Electron runtime successfully
  loads its packaged better-sqlite3 and executes an in-memory query.

## Dependency remediation

Only the affected lockfile entries were updated: fast-uri 3.1.5 → 3.1.7 and
@xmldom/xmldom 0.8.13 → 0.8.15. They remain compatible transitive development
dependencies of electron-builder through AJV and plist. These address GitHub
Dependabot alerts 90–94. Electron 41.10.3 was already on the base branch.

Bot PRs #11 and #12 were not merged, accepted, or closed. GitHub's default-branch
alerts remain open until the independently authored fix PR is merged and scanned.
