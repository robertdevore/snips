# Snips Architecture

## Overview

Snips is a macOS snippet expander with three components:

```
┌─────────────────────────────────────────────────────┐
│                    Electron App (app/)               │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │ main.js  │  │ ipc-      │  │ renderer/        │ │
│  │ windows, │  │ handlers  │  │ (ES modules)     │ │
│  │ tray,    │◄─┤ groups,   ├──┤ state, render,   │ │
│  │ hotkeys  │  │ snippets, │  │ events, charts,  │ │
│  │          │  │ settings, │  │ import, icons     │ │
│  └────┬─────┘  │ stats     │  └──────────────────┘ │
│       │        └─────┬─────┘                        │
│  ┌────┴─────┐  ┌─────┴─────┐                        │
│  │ db.js    │  │ helper-   │                        │
│  │ SQLite   │  │ bridge.js │                        │
│  │ (WAL)    │  │ TCP/HTTP  │                        │
│  └──────────┘  └─────┬─────┘                        │
└───────────────────────┼──────────────────────────────┘
                        │ localhost:50555 (TCP)
                        │ localhost:50556 (HTTP events)
┌───────────────────────┼──────────────────────────────┐
│              Swift Helper (helper/)                  │
│  ┌────────────────────┴──────────────────────────┐  │
│  │              main.swift                        │  │
│  │  • CGEventTap key capture                     │  │
│  │  • Abbreviation matching                      │  │
│  │  • Unicode typing injection                   │  │
│  │  • Fill-in field handling                     │  │
│  │  • Secure Input detection                     │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Components

### Electron Main Process (`app/src/main/`)

| File | Purpose |
|---|---|
| `main.js` | Window creation, tray, global shortcuts, helper lifecycle, app events |
| `db.js` | SQLite data layer via better-sqlite3 (WAL mode) |
| `helper-bridge.js` | TCP command channel + HTTP event server for Swift helper |
| `ipc-handlers.js` | All `ipcMain.handle` registrations (groups, snippets, settings, stats, import, export, helper) |
| `import-csv.js` | CSV parsing and TextExpander import logic |
| `validation.js` | Snippet data validation |
| `template-renderer.js` | Template macro rendering (`[[date]]`, `[[clipboard]]`, `[[fill]]`) |
| `preload.js` | Context bridge exposing `snipsApi` to renderer |
| `preload-fill.js` | Context bridge for fill-in popup window |

### CLI (`app/cli/`)

| File | Purpose |
|---|---|
| `index.js` | CLI entry point — 10 commands (list, search, get, create, update, export, import, health, show, doctor) |

The CLI uses the same `db.js` service layer as the Electron main process. No Electron dependency — runs under any Node.js runtime. See `snips help` for full usage.

### Renderer (`app/src/renderer/`)

| File | Purpose |
|---|---|
| `renderer.js` | Bootstrap — imports `boot()` from `events.js` |
| `state.js` | Application state, DOM references, shared mutable containers |
| `icons.js` | SVG icon constants |
| `toast.js` | Toast notification helper |
| `charts.js` | Canvas bar/pie chart rendering |
| `import.js` | CSV import UI logic |
| `render.js` | DOM rendering, data loading, stats, helper status |
| `events.js` | Event wiring and boot sequence |
| `index.html` | Main window layout |
| `palette.html` / `palette.js` | Quick search palette popup |
| `fill.html` / `fill.js` | Fill-in fields popup |
| `styles.css` | Main styles |
| `palette.css` | Palette styles |
| `fill.css` | Fill window styles |

### Swift Helper (`helper/`)

A native macOS helper that captures keystrokes via `CGEventTap`, matches abbreviations against the snippet library, and injects expanded text as Unicode keystrokes (not clipboard paste).

### Shared Contract (`shared/contracts.json`)

Defines the TCP message types between Electron and Swift helper:
- Commands: `config_update`, `insert_by_id`, `ping`
- Events: `ack`, `expansion_event`, `status`

## Data Flow: Snippet Expansion

```
1. User types abbreviation (e.g., ";addr")
2. Swift helper CGEventTap captures keystrokes
3. Helper maintains rolling buffer, matches against abbreviation endings
4. On match: helper deletes abbreviation (backspace × length)
5. Helper renders template macros (date, clipboard, fill-in)
6. If fill-in fields present: helper requests values via HTTP → Electron shows fill window
7. Helper injects rendered text as Unicode keystrokes
8. Helper posts expansion_event to Electron (HTTP POST to :50556)
9. Electron records event in SQLite, updates stats UI
```

## Database Schema

### Tables

**groups** — snippet categories
- `id` TEXT PK, `name` TEXT, `parentId` TEXT, `sortOrder` INT, `createdAt` INT, `updatedAt` INT, `deletedAt` INT

**snippets** — stored text snippets
- `id` TEXT PK, `groupId` TEXT, `name` TEXT, `abbreviation` TEXT UNIQUE, `content` TEXT, `enabled` INT, `favorite` INT, `notes` TEXT, `triggerMode` TEXT, `caseMode` TEXT, `createdAt` INT, `updatedAt` INT, `deletedAt` INT

**snippet_tags** — many-to-many tags
- `snippetId` TEXT, `tag` TEXT, PK(snippetId, tag)

**events** — expansion usage log
- `id` TEXT PK, `snippetId` TEXT, `timestamp` INT, `charsInserted` INT, `charsSaved` INT, `timeSavedMs` INT, `appBundleId` TEXT

**settings** — key-value app configuration
- `key` TEXT PK, `value` TEXT

## IPC Channel Reference

| Channel | Direction | Purpose |
|---|---|---|
| `groups:list` | Renderer → Main | List all groups |
| `groups:save` | Renderer → Main | Create/update group |
| `groups:delete` | Renderer → Main | Soft-delete group |
| `snippets:counts` | Renderer → Main | Get snippet counts |
| `snippets:list` | Renderer → Main | List/filter snippets |
| `snippets:get` | Renderer → Main | Get single snippet |
| `snippets:save` | Renderer → Main | Create/update snippet |
| `snippets:delete` | Renderer → Main | Soft-delete snippet |
| `snippets:test-render` | Renderer → Main | Preview template rendering |
| `settings:get` | Renderer → Main | Get all settings |
| `settings:save` | Renderer → Main | Save settings |
| `stats:get` | Renderer → Main | Get usage stats |
| `stats:reset` | Renderer → Main | Reset usage stats |
| `stats:export` | Renderer → Main | Export stats as JSON |
| `import:csv` | Renderer → Main | Import TextExpander CSV |
| `export:json` | Renderer → Main | Export all snippets as JSON |
| `palette:open` | Renderer → Main | Open search palette |
| `palette:insert` | Renderer → Main | Insert snippet via palette |
| `helper:status` | Renderer → Main | Get helper status |
| `helper:restart` | Renderer → Main | Restart helper |
| `helper:open-a11y` | Renderer → Main | Open Accessibility settings |
| `helper:reveal-binary` | Renderer → Main | Show helper in Finder |
| `helper:request-accessibility` | Renderer → Main | Request Accessibility permission |
| `helper:request-input-monitoring` | Renderer → Main | Request Input Monitoring permission |
| `stats:updated` | Main → Renderer | Push: stats changed |
| `helper:status` | Main → Renderer | Push: helper status changed |
| `palette:show` | Main → Renderer | Push: show palette |
| `nav:show` | Main → Renderer | Push: navigate to view |

## Helper Protocol

TCP connection on `127.0.0.1:50555`, newline-delimited JSON.

### Commands (Electron → Helper)

**config_update** — Send full snippet library and settings
```json
{"type":"config_update","payload":{"snippets":[...],"settings":{...}}}
```

**insert_by_id** — Expand a snippet by ID (palette insertion)
```json
{"type":"insert_by_id","payload":{"snippetId":"snippet_123"}}
```

**ping** — Health check
```json
{"type":"ping","payload":{}}
```

### Events (Helper → Electron)

Posted via HTTP POST to `http://127.0.0.1:50556/helper-event`.

**expansion_event** — Snippet was expanded
```json
{"type":"expansion_event","payload":{"id":"event_...","snippetId":"...","timestamp":...,"charsInserted":...,"charsSaved":...,"timeSavedMs":...,"appBundleId":"..."}}
```

**status** — Helper status update
```json
{"type":"status","payload":{"secureInput":false,"accessibilityEnabled":true,...}}
```
