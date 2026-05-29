# Contributing to Snips

## Development Setup

### Prerequisites
- macOS (the Swift helper is macOS-only)
- Node.js + npm
- Xcode Command Line Tools (`xcode-select --install`)
- Swift toolchain (included with Xcode CLT)

### Quick Start

```bash
# Clone and install
git clone https://github.com/robertdevore/snips.git
cd snips
npm install

# Build the Swift helper
npm run helper:build

# Run the helper in one terminal
npm run helper:run

# Run the Electron app in another terminal
npm run dev
```

## Project Structure

```
snips/
├── app/                    # Electron app
│   ├── src/
│   │   ├── main/           # Main process (Node.js)
│   │   │   ├── main.js     # Windows, tray, hotkeys, helper lifecycle
│   │   │   ├── db.js       # SQLite data layer
│   │   │   ├── helper-bridge.js  # TCP/HTTP bridge to Swift helper
│   │   │   ├── ipc-handlers.js   # IPC handler registrations
│   │   │   ├── import-csv.js     # CSV import logic
│   │   │   ├── validation.js     # Snippet validation
│   │   │   ├── template-renderer.js  # Template macros
│   │   │   ├── preload.js    # Renderer IPC bridge
│   │   │   └── preload-fill.js   # Fill window IPC bridge
│   │   └── renderer/        # Renderer process (browser)
│   │       ├── renderer.js  # Bootstrap
│   │       ├── state.js     # App state + DOM refs
│   │       ├── events.js    # Event wiring + boot
│   │       ├── render.js    # DOM rendering + data loading
│   │       ├── charts.js    # Canvas chart rendering
│   │       ├── icons.js     # SVG icon constants
│   │       ├── toast.js     # Toast notifications
│   │       ├── import.js    # CSV import UI
│   │       └── *.html, *.css
│   ├── cli/
│   │   └── index.js        # CLI entry point
│   ├── tests/               # Test files
│   └── package.json
├── helper/                  # Swift native helper
│   └── Sources/SnipsHelper/main.swift
├── shared/                  # App/helper contract
│   └── contracts.json
├── scripts/                 # Build scripts
└── docs/                    # Documentation
```

## Code Style

- **Indentation**: Tabs (width 4)
- **Quotes**: Single quotes preferred
- **Line endings**: LF (Unix)
- **Semicolons**: Required
- **Line width**: 120 characters max

ESLint and Prettier are configured. Run before committing:

```bash
npm run lint
npm run format
```

## Testing

```bash
# Run unit tests
cd app && npm test

# Watch mode
cd app && npm run test:watch

# Test the CLI (requires the app to be installed or running from source)
node app/cli/index.js health
node app/cli/index.js list --json
```

Tests use [Vitest](https://vitest.dev/). Pure function tests (no Electron dependency) are preferred for unit tests.

### CLI Testing

The CLI can be tested directly with Node.js — no Electron required:

```bash
# All commands work against the production database
node app/cli/index.js help
node app/cli/index.js health --json
node app/cli/index.js list | wc -l
node app/cli/index.js search "query"
node app/cli/index.js get <snippet-id>

# Dry-run mode tests validation without writing
node app/cli/index.js create --name "Test" --abbr ";test" --content "Hello" --dry-run --json
node app/cli/index.js update <id> --name "Rename" --dry-run --json
node app/cli/index.js import --in ./export.json --dry-run --json

# Export to file then verify round-trip
node app/cli/index.js export --out /tmp/snips-test.json --json
node app/cli/index.js import --in /tmp/snips-test.json --dry-run --json
```

## Commit Conventions

Use conventional commit prefixes:
- `feat:` — New feature or enhancement
- `fix:` — Bug fix
- `refactor:` — Code reorganization without behavior change
- `docs:` — Documentation changes
- `test:` — Test additions or changes

Reference checklist task IDs when applicable: `feat: SN-010 add snippet validation`

## Pull Request Process

1. Create a branch from `main`
2. Make focused, small changes
3. Run `npm run lint` and `npm test`
4. Open a PR with a clear description
5. PRs should not include unrelated changes

## Architecture Rules

- **Local-first**: No data leaves the user's machine by default
- **Snips works independently**: No dependency on other apps
- **Snippets are potentially sensitive**: Treat all snippet data with care
- **Destructive operations require confirmation**: Delete, reset, overwrite
- **CLI should go through the same service layer as the GUI**: No direct DB access
- **AI should draft and suggest before modifying**: Preview → confirm → apply

## Questions?

Open an issue or discussion on GitHub.
