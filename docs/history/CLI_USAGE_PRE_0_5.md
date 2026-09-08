> HISTORICAL / SUPERSEDED. See ../../AGENTS.md and current docs.

# Snips CLI Usage

The Snips CLI manages the local snippet library from a terminal. It is useful for backups, scripted updates, automation, and AI-agent workflows. It uses the same database service layer as the desktop app; it does not require Electron to be running.

## Requirements

- macOS with Node.js and npm installed
- Snips installed once, or a source checkout with dependencies installed
- Access to the Snips data directory

The production database is normally stored at:

```text
~/Library/Application Support/Snips/data/snips.db
```

The CLI exits with code `1` when an operation fails and `2` for invalid or incomplete command usage.

## Starting the CLI

For a source checkout, run commands from the repository root:

```bash
node app/cli/index.js help
```

The repository also provides an npm wrapper:

```bash
npm run cli -- list
npm run cli -- search "refund" --json
```

If the `snips` executable is installed on your `PATH`, the same commands can be written as:

```bash
snips list
snips search "refund" --json
```

Use `--help` with any command. `--json` produces machine-readable output and is recommended for scripts.

## Read snippets

List snippets. Human-readable output includes the abbreviation, name, and ID:

```bash
snips list
snips list --json
```

Search by name, abbreviation, or content:

```bash
snips search "refund"
snips search ";addr" --json
```

Fetch one complete snippet. The ID is shown by `list` and `search`:

```bash
snips get <snippet-id>
snips get <snippet-id> --json
```

## Create snippets

Create requires a name, abbreviation, and content. Abbreviations cannot contain spaces. The default group is `General`.

```bash
snips create \
  --name "Support address" \
  --abbr ";addr" \
  --content "123 Main Street, Detroit, MI"
```

Set a group and comma-separated tags:

```bash
snips create \
  --name "Refund reply" \
  --abbr ";refund" \
  --content "Thanks for reaching out. We have started your refund." \
  --group "Support" \
  --tags "support,refund"
```

Preview validation without writing to the database:

```bash
snips create \
  --name "Daily standup" \
  --abbr ";standup" \
  --content "Yesterday: [[fill:Yesterday|]]\nToday: [[fill:Today|]]\nBlockers: [[fill:Blockers|None]]" \
  --dry-run --json
```

Snippet content supports the same macros as the app, including `[[date:iso]]`, `[[clipboard]]`, `[[fill:Label|default]]`, and `[[cursor]]`.

## Update snippets

Updates are protected by an explicit confirmation flag. Preview first, then apply:

```bash
snips update <snippet-id> --content "Updated text" --dry-run --json
snips update <snippet-id> --content "Updated text" --confirm
```

You can update one or more of these fields:

```bash
snips update <snippet-id> --name "New name" --confirm
snips update <snippet-id> --abbr ";new-abbr" --confirm
snips update <snippet-id> --name "New name" --abbr ";new" --content "New content" --confirm
```

The CLI update command preserves the snippet's group, tags, enabled state, favorite state, trigger mode, case mode, and notes. Change those fields in the desktop app.

## Back up and restore

Export the complete library, including groups and snippets:

```bash
snips export --out ./snips-backup.json
```

Without `--out`, export writes JSON to standard output:

```bash
snips export > ./snips-backup.json
```

Preview an import before changing the database:

```bash
snips import --in ./snips-backup.json --dry-run --json
```

Apply an import only with `--confirm`:

```bash
snips import --in ./snips-backup.json --confirm --json
```

Import expects the JSON format produced by `snips export`. Invalid snippets are skipped and reported in the result. Existing records with matching IDs are updated by the database layer.

## Diagnostics

Check the database path, snippet count, group count, and expansion event count:

```bash
snips health
snips health --json
```

Show current settings. Avatar data is intentionally omitted:

```bash
snips show
snips show --json
```

Run configuration checks:

```bash
snips doctor
snips doctor --json
```

`doctor` checks the WPM range, palette hotkey, and whether the library is empty. It does not test macOS Accessibility or Input Monitoring permissions; use the Snips Status panel for helper permissions.

## Strata bridge

With Strata running locally, Snips can deliberately exchange selected content through its HTTP API:

```bash
snips strata save-snippet <snippet-id>
snips strata search-candidates "query"
snips strata import-note <note-id> --dry-run
snips strata import-note <note-id> --confirm
```

The default base URL is `http://127.0.0.1:3939`. Set `STRATA_URL` or pass `--strata-url`; set `STRATA_API_TOKEN` when Strata authentication is enabled. Imports require a preview or explicit confirmation.

## Isolated or test database

Set `SNIPS_DATA_DIR` to point the CLI at another data directory. This is useful for tests and safe previews:

```bash
SNIPS_DATA_DIR=/tmp/snips-cli-test/data node app/cli/index.js health --json
SNIPS_DATA_DIR=/tmp/snips-cli-test/data node app/cli/index.js create \
  --name "Test" --abbr ";test" --content "Hello" --dry-run --json
```

Do not point this variable at a shared or production database while another process is writing to it.

## Automation pattern

Use `--json`, check the exit status, and keep errors from stderr separate from successful output:

```bash
set -euo pipefail

snippet_id="$(snips create \
  --name "Build status" \
  --abbr ";build" \
  --content "Build complete" \
  --json | node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => process.stdout.write(JSON.parse(input).snippet.id));
  ')"

snips get "$snippet_id" --json
```

For destructive or bulk changes, always run the corresponding `--dry-run` command first and require `--confirm` in the write step.

## Command reference

| Command              | Purpose                                        | Write operation                  | Confirmation                   |
| -------------------- | ---------------------------------------------- | -------------------------------- | ------------------------------ |
| `list`               | List all snippets                              | No                               | —                              |
| `search <query>`     | Search snippet name, abbreviation, and content | No                               | —                              |
| `get <id>`           | Show one snippet                               | No                               | —                              |
| `create`             | Create a snippet                               | Yes                              | No; use `--dry-run` to preview |
| `update <id>`        | Update name, abbreviation, or content          | Yes                              | `--confirm` required           |
| `export`             | Export groups and snippets                     | Writes only when `--out` is used | —                              |
| `import --in <path>` | Import groups and snippets                     | Yes                              | `--confirm` required           |
| `health`             | Show database health and counts                | No                               | —                              |
| `show`               | Show settings                                  | No                               | —                              |
| `doctor`             | Check common configuration issues              | No                               | —                              |
| `strata`             | Exchange selected content with local Strata    | Import/save only                 | Import requires `--confirm`    |

## Privacy and safety

The CLI normally reads and writes only the local SQLite database. The `strata` command is the sole opt-in bridge and sends only the selected snippet or query to the configured Strata URL. Treat exported JSON files as sensitive if they contain private templates, clipboard macros, customer data, or credentials.
