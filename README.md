# Snips

Snips is a local-first macOS text expander: an Electron library UI backed by SQLite and a small native Swift helper for system-wide expansion.

## Install

Download the installer for your Mac from the [v0.4.0 release](https://github.com/robertdevore/snips/releases/tag/v0.4.0):

- Apple silicon: `Snips-0.4.0-arm64.dmg`
- Intel: `Snips-0.4.0.dmg`

Drag Snips into `/Applications`, open it, then grant Accessibility and Input Monitoring access when prompted. The release includes `SHA256SUMS.txt`; verify it with:

```bash
shasum -a 256 -c SHA256SUMS.txt
```

Snips is not notarized yet. If Gatekeeper blocks the first launch, allow it from **System Settings → Privacy & Security**.

## Use

1. Click **Snippet**, choose an abbreviation such as `;addr`, add content, and save.
2. Type the abbreviation in any app.
3. Open the search palette with `Cmd+Shift+Space`.

Snips supports groups, tags, favorites, fill fields, dates, clipboard insertion, cursor markers, per-app exclusions, secure-input detection, and usage statistics.

## CLI and Strata

```bash
snips list
snips search "refund"
snips create --name "Reply" --abbr ";reply" --content "Thanks!"
snips update <id> --content "Updated" --confirm
snips export --out ./snips-backup.json
snips import --in ./snips-backup.json --dry-run
snips import --in ./snips-backup.json --confirm
snips doctor --json
```

Exchange reusable text with a running [Strata](https://github.com/robertdevore/strata) instance:

```bash
snips strata save-snippet <snippet-id>
snips strata search-candidates "deployment checklist"
snips strata import-note <note-id> --dry-run
snips strata import-note <note-id> --confirm
```

The bridge uses `http://127.0.0.1:3939` by default. Override it with `STRATA_URL` or `--strata-url`; authenticated Strata instances read `STRATA_API_TOKEN`. See [CLI usage](docs/CLI_USAGE.md) for the full command reference.

## Develop

Requirements: macOS, Node.js 22+, npm, and Xcode Command Line Tools.

```bash
npm install
npm run helper:build
npm run dev
```

Useful checks:

```bash
npm run lint
npm run format:check
npm test --workspace app
npm run helper:build
```

Build release installers with `npm run package:dmg`. Artifacts are written to `app/dist/`.

## Data and permissions

The database normally lives at `~/Library/Application Support/Snips/data/snips.db`. Snips stays local unless you explicitly invoke the Strata bridge.

The helper needs Accessibility and Input Monitoring permissions. If expansion stops after an update, quit Snips, run `pkill -f SnipsHelper`, reopen Snips, and use **Status → Restart Helper**.

## Architecture

- `app/`: Electron UI, SQLite storage, CLI, import/export, and stats
- `helper/`: Swift key-capture and text-insertion helper
- `shared/`: app/helper contracts

See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and the [changelog](CHANGELOG.md) for more detail.
