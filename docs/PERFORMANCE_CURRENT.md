# Performance — 0.5.0 hardening candidate

Measured 2026-09-08 on MacBookPro16,1, Intel i7-9750H 2.60 GHz, macOS 26.6.2,
Node 24.20.0, Electron 41.10.3, local release Swift compiler. Baseline: `31be5c8`.
Synthetic snippets only; no personal snippets, clipboard reads, or posted keyboard events.

## Library query plus serialization

Baseline: generated 100/1k/10k/50k snippets, each containing about 1,300 characters,
LIKE search for “deployment”, full pretty JSON, median of five runs. Current: same workload
shape with FTS and 50 SQL-projected metadata records, compact JSON, median of seven warm runs.
This compares useful default behavior, not identical output volume. Current table is an isolated
rerun after packaging; a simultaneous build run was slower and is not used for this table.

| Library | Baseline search + JSON | Current search + JSON | Baseline bytes | Current bytes | Current list + JSON |
|---|---:|---:|---:|---:|---:|
| 100 | 1.941 ms | 0.926 ms | 193,618 | 13,951 | 0.578 ms |
| 1,000 | 18.210 ms | 2.811 ms | 1,937,819 | 14,139 | 0.537 ms |
| 10,000 | 347.851 ms | 32.528 ms | 19,397,820 | 14,323 | 0.556 ms |
| 50,000 | 1,693.729 ms | 166.033 ms | 97,077,820 | 14,503 | 0.493 ms |

Current end-to-end Node process startup plus `list --json` (one sample per size) measured
177.050 / 185.369 / 190.763 / 206.378 ms. These are not warm SQLite query timings.

A separate five-run subprocess comparison archives the actual baseline CLI and generates one
10,000-snippet fixture, then invokes old/new `search deployment --json`:

| CLI process including startup | Median | Stdout bytes |
|---|---:|---:|
| Baseline | 377.824 ms | 18,894,516 |
| Current | 141.203 ms | 14,356 |

This is 18,880,160 fewer bytes (99.924%); tokenizer-specific token counts were not measured.
The fixture uses deterministic IDs/timestamps, hence byte totals differ from the first table.
Reproduce: `node scripts/performance/cli-baseline.cjs`.

## Helper stages

Nine release-build samples per size. Full apply is the production index rebuild; patch includes
JSON encode/decode, validation and updating one existing snippet. Matching is repeated 100 times
per sample against the final generated abbreviation; it is the candidate/suffix stage, not the OS callback.

| Snippets | Full config apply | One-snippet patch | Matching |
|---|---:|---:|---:|
| 100 | 0.112 ms | 0.456 ms | 0.000607 ms |
| 1,000 | 1.401 ms | 0.640 ms | 0.005006 ms |
| 10,000 | 13.203 ms | 0.658 ms | 0.047033 ms |
| 50,000 | 86.465 ms | 1.396 ms | 0.210176 ms |

This measures the work avoided by sending a patch instead of a full resync. It does not claim a
new matching algorithm speedup. Large recovery syncs exceeding the command limit are chunked
with expansion disabled until complete. Normal diffs still scan the enabled library in JavaScript.

Creating one Unicode key-down event for each of 1,100 synthetic graphemes took **1.130293 ms**
(median of nine). This excludes key-up creation, posting, delivery and destination rendering.

The existing real already-frontmost focus benchmark, alternating nine calls per version:

| Baseline current focus fast path | Final focus fast path |
|---:|---:|
| 0.266792 ms median | 0.300828 ms median |

No material focus-stage speedup is claimed here. The previous ~421 ms improvement is preserved;
see `history/SNIPS_PERFORMANCE_2026_09_08.md` for its original measurement. Inactive destination
restoration retains its compatibility delay. The post-delete 90 ms wait is retained only when
an abbreviation is deleted; palette insertion no longer pays an unconditional post-delete wait.

## Budgets and limits

- Active-focus branch: no activation or sleeps (deterministically tested).
- Event-tap callback: no template render, interaction wait, focus activation or event injection.
- Matching target: below 1 ms at 50k synthetic snippets; pathological suffix distributions may differ.
- 10k default search target: below 100 ms warm; 50k broad search below 250 ms on this host.
- Metadata list target: below 10 ms warm; 50 records and bounded previews by default.
- Use measurements as diagnostic budgets, not flaky wall-clock assertions on shared CI.

## What these tests do not establish

**Visible end-to-end expansion latency is unmeasured.** Accessibility, ListenEvent and PostEvent
all returned false for the session's test runtime. Real native/browser/Electron/terminal/rich-editor
injection, cursor placement, IME/RTL behavior and signed TCC upgrades require the release matrix in
`RECOVERY.md`. A 90 ms sleep is not an end-to-end latency measurement. Queued physical keyboard
input is bounded (256 events); overload compatibility also belongs in that matrix.

Commands: `npm run benchmark`, helper `--benchmark`, `npm run helper:test`, and the CLI baseline
script. Normal verification tests output bounds and control flow without relying on UI timing.
