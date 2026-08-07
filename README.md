# Snips

Snips is a macOS snippet expansion app built with Electron + a native Swift helper.

## Install (DMG)

1. Download the latest `Snips-*.dmg` from GitHub Releases.
2. Drag **Snips.app** into **/Applications**.
3. Open Snips.
4. Grant permissions (see **First-run permissions** below).

Note: On first launch, macOS Gatekeeper may block the app if it’s unsigned/not notarized. If so, use **System Settings → Privacy & Security** and allow it.

## Quick start

- Create a snippet: click **Snippet**.
- Set an abbreviation (e.g. `;addr`) and content, then **Save**.
- Type the abbreviation in any app to expand.
- Search snippets from the main window (search box above the snippet list) or open the palette with `Cmd+Shift+Space`.

## Architecture

Snips is split into three components:

- `app/` — Electron desktop app (snippet library UI, search palette, settings, stats, SQLite)
- `helper/` — Swift native expander agent (global key capture, trigger matching, insertion, secure input handling)
- `shared/` — contract definitions for helper/app message types

### Runtime flow

1. Electron app stores snippets/settings/events in SQLite (`better-sqlite3`).
2. Electron sends snippets + settings to helper over localhost TCP (`127.0.0.1:50555`, newline-delimited JSON).
3. Helper captures keystrokes via `CGEventTap`, keeps a short rolling buffer, and matches abbreviations.
4. On match, helper deletes abbreviation and inserts rendered content by simulated Unicode typing (clipboard remains unchanged).
5. Helper posts expansion events/status back to Electron (`http://127.0.0.1:50556/helper-event`).
6. Electron records events and updates per-snippet + weekly stats.

## Features in this build

- System-wide expansion using native helper
- Snippet CRUD with groups, favorites, tags, notes
- Group edit + delete (deleting a group moves its snippets to **General**)
- Global search palette (`Cmd+Shift+Space` default)
- Trigger modes: `immediate`, `whitespace`, `wordBoundary`, `enterTab`
- Dynamic macros in helper:
	- `[[date:FORMAT]]`
	- `[[clipboard]]`
	- `[[fill:Label|default]]`
	- `[[cursor]]` (marker removed before insert)
- Stats tracking:
	- expansion count
	- chars inserted/saved
	- estimated time saved
	- weekly rollup
- Excluded app bundle IDs
- Secure Input guard (`IsSecureEventInputEnabled`) and status reporting
- Tray/menu bar controls (open app, open palette, pause expansions)
- CLI for scripting, automation, and AI agent workflows

## CLI

Snips includes a command-line interface for managing snippets without the GUI. See the shareable [CLI usage guide](docs/CLI_USAGE.md) for installation, command reference, automation examples, backups, restores, and safety notes.

```bash
# Available commands
snips list                  # List all snippets
snips search "refund"       # Search snippets by name, abbreviation, or content
snips get <id>              # Get full snippet details
snips create --name "Title" --abbr ";t" --content "text"  # Create a snippet
snips update <id> --content "new" --confirm               # Update a snippet
snips export --out ./backup.json                          # Export all snippets
snips import --in ./backup.json --confirm                 # Import snippets
snips health                # Show database and app status
snips show                  # Show current configuration
snips doctor                # Validate configuration and report issues
```

All commands support `--json` for machine-readable output, `--dry-run` for non-destructive preview (create/update/import), and `--confirm` for destructive operations (update/import). Exit codes are deterministic: 0 = success, 1 = error, 2 = usage error.

See `docs/SNIPS_AI_AND_CLI_READINESS.md` for agent workflow patterns and CLI design principles.

## Prerequisites

- macOS
- Xcode Command Line Tools (`xcode-select --install`)
- Node.js + npm
- Swift toolchain (included with Xcode CLT)

## Development setup

From repository root:

```bash
npm install
npm run helper:build
```

Run helper in one terminal:

```bash
npm run helper:run
```

Run Electron app in another terminal:

```bash
npm run dev
```

## Build DMG package

From repository root:

```bash
npm install
npm run helper:build
npm run package:dmg
```

Artifacts are generated under:

- `app/dist/`

## First-run permissions

Snips helper requires **Accessibility** and **Input Monitoring** permissions to capture keystrokes and perform reliable expansions.

- Accessibility is required for event taps / synthetic input.
- Input Monitoring is required to read keystrokes on modern macOS.

Recommended flow (from the Snips sidebar **Status** panel):

1. Click **Open Accessibility Settings**, then add/enable **SnipsHelper.app**.
2. Click **Request Input Monitoring Prompt** and/or enable **SnipsHelper** in **System Settings → Privacy & Security → Input Monitoring**.
3. Click **Restart Helper**.

If a permission is missing, expansions will not run and the Status line will show what’s missing.

## Login item / auto-start

On app startup, Snips writes a LaunchAgent plist:

- `~/Library/LaunchAgents/com.snips.helper.plist`

This is used for helper auto-start in development style installs.

## Data location

Snips stores its local SQLite database under the Electron `userData` directory (typically):

- `~/Library/Application Support/Snips/data/snips.db`

## Uninstall / reset

1. Quit Snips.
2. Stop the helper if needed:

```bash
pkill -f SnipsHelper
```

3. Remove LaunchAgent (optional):

```bash
rm -f ~/Library/LaunchAgents/com.snips.helper.plist
```

4. Remove app data (optional, deletes your snippet library):

```bash
rm -rf "$HOME/Library/Application Support/Snips"
```

## Import/export

- TextExpander CSV import is available in **Settings → Advanced → Import from TextExpander (CSV)**.
  - You can also drag & drop multiple CSVs to import each file into a group named after its filename.
- Snips is local-only. The CLI supports JSON export; see the [CLI usage guide](docs/CLI_USAGE.md).

## Packaging and distribution notes (macOS)

For production distribution:

- Package Electron app for macOS (arm64/x64 universal if needed)
- Embed/sign helper binary with the app
- Replace development LaunchAgent flow with signed login-item flow (SMAppService) for App Sandbox-compatible behavior
- Notarize app + helper
- Ensure updates replace helper binary and refresh launch configuration

## Troubleshooting

### Expansion does not happen

- Verify helper is running
- Verify Accessibility permission is granted
- Verify Input Monitoring is granted
- Check Snips settings: enabled, not paused, app not excluded
- Confirm abbreviation + trigger mode match your typing pattern

### After reinstall/rebuild, helper still behaves like old version

SnipsHelper runs as a background process. If it was already running, reinstalling a DMG will not replace the running process.

Reset steps:

```bash
pkill -f SnipsHelper
```

Then re-open Snips from `/Applications` and click **Status → Restart Helper**.

### Permissions look enabled, but helper still reports missing

On some macOS versions, Accessibility and/or Input Monitoring can look enabled in System Settings, but SnipsHelper still reports them as missing (no event tap, no expansions).

Fix:

1. Quit Snips.
2. System Settings → Privacy & Security:
	- Accessibility: remove **Snips** and **SnipsHelper.app** if present, then add them back and enable.
	- Input Monitoring: remove **Snips** and **SnipsHelper.app** if present, then add them back and enable.
3. Re-open Snips from `/Applications` and click **Status → Restart Helper**.

### Secure Input active

Some apps/fields (especially password contexts) enable secure input. Snips will not read/expand while secure input is active.

### Native DB module error (`NODE_MODULE_VERSION` mismatch)

Rebuild native modules for Electron:

```bash
cd app
npm run rebuild-native
```

## Data model

SQLite schema includes:

- `groups(id, name, parentId, sortOrder, createdAt, updatedAt)`
- `snippets(id, groupId, name, abbreviation, content, enabled, favorite, createdAt, updatedAt)`
- `snippet_tags(snippetId, tag)`
- `events(id, snippetId, timestamp, charsInserted, charsSaved, timeSavedMs, appBundleId)`
- `settings(key, value)`

Indexes:

- snippets abbreviation uniqueness
- events by timestamp
- events by `(snippetId, timestamp)`

## Security/privacy posture

- No raw keystrokes are persisted
- Helper only keeps a bounded in-memory rolling buffer
- Secure input contexts are skipped
- Works offline

## Current limitations

- Fill-in prompts use an Electron modal window (functional MVP)
- `[[cursor]]` marker is stripped but caret repositioning is not yet implemented
- Database encryption-at-rest toggle is not yet implemented
- RTF/HTML/image snippets are not yet implemented

## Release checklist (practical)

- Ensure `node_modules/`, `app/dist/`, `app/data/`, and built DMGs are not committed (see `.gitignore`).
- Build a DMG with `npm run package:dmg`.
- Test permissions on a fresh install (Accessibility + Input Monitoring).
