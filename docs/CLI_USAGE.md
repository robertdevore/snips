# CLI — 0.5.0

Choose **Status → Install / Repair CLI** in Snips. The managed launcher is `~/.local/bin/snips`.
It uses the app's bundled runtime and SQLite binding. Add `~/.local/bin` to PATH if necessary;
Snips never edits shell profiles or replaces an unrelated executable. Moving the app requires Repair.
Source use: `node app/cli/index.js`. `SNIPS_DATA_DIR` selects an existing initialized data directory.

```sh
snips capabilities --json
snips list --json --limit 50 --offset 0
snips search 'cloudflare deployment' --json --limit 5 --fields id,name,abbreviation,revision,preview
snips list --tag work --group default --favorite --json
snips list --count --json
snips list --trash --json
snips get snippet_id --json
snips groups --json
```

Search uses ranked FTS Unicode word prefixes, not arbitrary substring matching. Default output
contains metadata and a 120-character preview, never full bodies. Use `get` or `--include-content`.
`--fields` selects explicit fields; `--ids-only` returns IDs. `--limit` is 1–500, default 50;
`--offset` is a zero-based offset in deterministic order. Pagination is not a snapshot across edits.
`--count` returns total filtered matches. JSON is compact; `--pretty` opts into indentation.
`--quiet` suppresses successful output. Errors remain visible and exit nonzero.
Only `-h` (help) and `-j` (JSON) are supported aliases. Duplicate/unknown flags are errors.

```sh
printf 'Hello\nworld\n' | snips create --name Greeting --abbr ';hello' --content-stdin --json
snips create --name Template --abbr ';template' --content-file ./template.txt --dry-run --json
cat snippet.json | snips create --stdin-json --idempotency-key task-42-create --json
cat body.txt | snips update snippet_id --content-stdin --if-revision 14 --dry-run --json
cat body.txt | snips update snippet_id --content-stdin --if-revision 14 --confirm --json
snips trash snippet_id --if-revision 15 --confirm --json
snips restore snippet_id --confirm --json
snips purge snippet_id --confirm --json
snips history snippet_id --json
snips history snippet_id --history-id 42 --json
snips revert snippet_id --history-id 42 --if-revision 16 --confirm --json
```

A structured snippet accepts `name`, `abbreviation`, `content`, `groupId`, `tags`, `enabled`,
`favorite`, `notes`, `triggerMode`, and `caseMode` (only `exact`). IDs are explicit optional
identifiers on create, never an implicit upsert. Trigger modes: immediate, whitespace, enterTab,
wordBoundary. Macros: `[[date:iso]]`, `[[date:short]]`, Swift date formats, `[[clipboard]]`,
`[[fill:Label|default]]`, and one `[[cursor]]`. See the architecture's caret limitations.

Input is bounded to 8 MiB; content to 1 MiB UTF-8; name/abbreviation to 200 characters;
notes to 10,000; tags to 50 × 64 characters. `capabilities` exposes these limits. The helper uses the same UTF-8 content bound.
A dry-run executes the same transaction and rolls it back, validating collisions and revisions.
A preview does not reserve an abbreviation or revision. Re-submit the same content to commit.

All mutations except create require `--confirm` or `--dry-run`. Permanent deletion removes
local revision history too. Restore collisions are errors; edit the conflicting active snippet first.
History retains the latest 100 mutations per snippet. History lists are metadata; use `--history-id` to fetch one full before/after record. Explicit retry keys return the original result
for the same request, reject different requests, and are cleared by permanent purge. They are not
an authorization mechanism. Prefer revision checks even when using a retry key.

## Batch

```sh
snips batch --stdin-jsonl --dry-run --json < operations.jsonl
snips batch --stdin-jsonl --confirm --idempotency-key task-42 --json < operations.jsonl
```

Each line is an operation; `--stdin-json` accepts one array instead. At most 500 operations.
Supported shapes:

```json
{"type":"create","snippet":{"name":"Reply","abbreviation":";reply","content":"Thanks","groupId":"default"}}
{"type":"update","id":"snippet_id","ifRevision":1,"patch":{"content":"Thank you"}}
{"type":"move","id":"snippet_id","groupId":"default"}
{"type":"tag","id":"snippet_id","tags":["work"]}
{"type":"enable","id":"snippet_id","enabled":false}
{"type":"favorite","id":"snippet_id","favorite":true}
{"type":"trash","id":"snippet_id","ifRevision":2}
{"type":"restore","id":"snippet_id"}
```

All operations commit together or all roll back. Results correspond to input order. A failure
returns `{"ok":false,"error":{"code":"REVISION_CONFLICT","message":"REVISION_CONFLICT"}}`
(or another named error). Exit codes are 0 success, 1 operation failure, 2 usage/confirmation error.

## Backup, diagnostics, Strata

```sh
snips export --out ./backup.json
snips import --in ./backup.json --dry-run --json
snips import --in ./backup.json --confirm --json
snips doctor --json
snips health --json
snips strata save-snippet snippet_id --dry-run --json
snips strata save-snippet snippet_id --confirm --json
snips strata search-candidates 'deployment checklist' --json
snips strata import-note note_id --dry-run --json
snips strata import-note note_id --confirm --json
```

Export refuses to replace an existing file unless `--confirm` is supplied.

Imports are atomic and reject existing snippet IDs/abbreviations; they do not merge or overwrite.
JSON imports are limited to 500 snippets per invocation. CSV import in the GUI also rejects
collisions instead of replacing existing text. Export is a version 1 data backup, not revision history.

Strata is optional. Endpoints must be literal loopback HTTP addresses (`127.0.0.1` or `[::1]`),
with redirects denied, a 5-second timeout and an 8 MiB response limit. `STRATA_API_TOKEN` is
read from the environment. Neither token nor response bodies are logged. Custom remote URLs
are intentionally rejected. No Strata dependency is required for core Snips behavior.
