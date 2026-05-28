# Snips AI and CLI Readiness

## Current AI/CLI Status

**CLI: Does not exist.** The app is Electron-only with no command-line interface. All interaction is through the GUI.

**AI: Does not exist.** No AI provider integration, no prompt templates, no generation, no rewriting, no categorization. The only "smart" feature is the template macro system (`[[date]]`, `[[clipboard]]`, `[[fill]]`, `[[cursor]]`), which is deterministic string replacement.

**Architecture readiness for CLI:** Medium. The data layer (`db.js`) is clean and importable from Node.js directly. No Electron dependency for DB operations. The helper bridge uses TCP and can be reused. The main gap is the lack of a command router, argument parser, and output formatter.

**Architecture readiness for AI:** Low. No provider abstraction, no API key storage, no preview/diff system, no action history, no consent model. These all need to be built from scratch.

## Near-Term CLI Workflow

The smallest useful CLI enables:

1. **List snippets** — `snips snippets list [--json]`
2. **Search snippets** — `snips snippets search "refund email" [--json]`
3. **Get snippet** — `snips snippets get <id> [--json]`
4. **Create snippet** — `snips snippets create --title "..." --abbr "..." --content "..." [--json]`
5. **Update snippet with confirmation** — `snips snippets update <id> --content "..." --confirm`
6. **Export/Import JSON** — `snips snippets export --format json --out ./export.json`
7. **Health check** — `snips health [--json]`
8. **Config inspection** — `snips config show [--json]`

### CLI Design Principles

- **JSON output support:** `--json` flag for machine-readable output on stdout
- **Pretty output support:** Default for TTY, formatted tables and colors
- **Dry-run support:** `--dry-run` flag for non-destructive preview
- **Confirmations for destructive operations:** `--confirm` flag required for delete, reset, overwrite
- **Deterministic exit codes:** 0 = success, 1 = error, 2 = usage error
- **Stable error shape:** `{error: {code: "NOT_FOUND", message: "..."}}` in JSON mode
- **No secrets printed:** API keys, clipboard contents, and snippet content never in stdout unless explicitly requested
- **No AI required for non-AI operations:** CLI works offline, no AI dependency
- **No destructive defaults:** Import without `--confirm` does nothing; delete without `--confirm` fails
- **No direct unsafe storage writes:** CLI goes through the same `db.js` service layer as the Electron app

## Future Agent Workflow

Agents (both human and AI) should interact with Snips through the CLI. The workflow:

### Agent Snippet Retrieval
```bash
# Search for relevant snippets
snips snippets search "support refund template" --json

# Get full snippet content
snips snippets get snippet_1234567890 --json

# Copy snippet to clipboard
snips snippets copy snippet_1234567890
```

### Agent Snippet Creation
```bash
# Create a draft (from a file to avoid shell escaping issues)
snips snippets create --title "Refund Reply v2" --content-file ./draft.md --group "Support" --tags "email,refund" --dry-run

# Review the dry-run output, then confirm
snips snippets create --title "Refund Reply v2" --content-file ./draft.md --group "Support" --tags "email,refund"
```

### Agent Snippet Organization
```bash
# Detect potential duplicates (future feature)
snips snippets detect-duplicates --json

# Suggest category for untagged snippets (future AI feature)
snips snippets categorize --dry-run

# Tag batch of snippets
snips snippets tag snippet_123 snippet_456 --add "reviewed"
```

### Agent Export/Backup
```bash
# Export for backup
snips snippets export --format json --out ./backup-$(date +%Y%m%d).json

# Export for Strata
snips snippets export --format markdown --out ./strata-notes/
```

## Future AI Workflow

Safe AI-assisted flows follow this pattern:

### Flow 1: AI Rewrite Snippet
1. User selects a snippet in the GUI or CLI
2. User clicks "AI Rewrite" or runs `snips snippets ai-rewrite <id> --style "more concise"`
3. System sends snippet content + instruction to configured AI provider
4. AI returns proposed new content
5. **App shows diff/preview** — side-by-side comparison of old vs new
6. User reviews and either:
   - Accepts (applies change, records action)
   - Rejects (discards, nothing changed)
   - Edits further (manual tweaks before applying)
7. If accepted, action recorded in `ai_actions` table for future revert
8. Snippet updated, UI refreshes

### Flow 2: AI Categorize/Tag Snippet
1. User selects one or more snippets
2. User clicks "AI Suggest Tags" or runs CLI command
3. AI analyzes snippet content and existing tag vocabulary
4. AI returns suggested tags and/or group
5. **App shows suggestions** — checkboxes for each suggestion
6. User confirms which suggestions to apply
7. Tags/groups applied, action recorded

### Flow 3: AI Generate Snippet from Description
1. User provides a description: "Email template for refund confirmation"
2. AI generates snippet content, suggested abbreviation, and tags
3. **App shows generated snippet in preview mode** — not saved yet
4. User edits, adjusts, then clicks "Create Snippet"
5. Snippet saved, action recorded

### Flow 4: AI Detect Duplicates
1. User clicks "Find Duplicates" or runs CLI
2. System computes similarity between snippets (locally or via AI)
3. Results shown as pairs with similarity score
4. User can merge, delete, or mark as "not duplicate"
5. Merge creates new snippet, soft-deletes originals (preserving history)

### Flow 5: AI Audit Stale Snippets
1. User clicks "Audit Snippets" or runs CLI
2. AI analyzes: last used date, content quality, similarity to other snippets
3. Reports snippets that are: never used, very similar to others, have placeholder content, have empty fields
4. User can act on each recommendation

## Snippet Privacy Rules

### Sensitive Content Handling
- Snippets may contain: passwords, API keys, personal data, work-confidential text, PII
- Users must be able to mark snippets as "sensitive" (opt-out of AI processing)
- Default assumption: snippets are potentially sensitive
- AI processing requires explicit per-snippet or global opt-in

### AI Consent Rules
- AI features are opt-in at the app level: global "Enable AI features" toggle
- AI features are opt-in at the snippet level: per-snippet "Allow AI" toggle
- First AI use of any kind shows a consent dialog explaining:
  - Content will be sent to the configured AI provider
  - Provider privacy policy applies to transmitted content
  - How to disable AI per-snippet or globally
- Consent state is persisted

### Log Privacy
- AI prompts and responses must not be logged by default
- Debug logging of AI interactions requires explicit opt-in
- Clipboard contents read by `[[clipboard]]` macro must not be logged
- Snippet content in logs must be redacted unless debug mode is enabled

### Token/Secret Handling
- API keys stored using Electron `safeStorage` or macOS Keychain
- API keys never written to SQLite settings table in plain text
- API keys never included in export data
- API keys never shown in settings UI after entry (masked)
- CLI never outputs API keys

### Clipboard Privacy
- `[[clipboard]]` macro reads system clipboard at expansion time
- User must be informed when inserting this macro (SN-025)
- System clipboard is never stored, only read at expansion time
- Clipboard contents are not logged

## CLI Command Ideas

### Implemented in Phase 7 (SN-035 through SN-040)
```
snips health                              # App/DB/helper status
snips config show                         # Settings overview
snips config get <key>                    # Single setting
snips config doctor                       # Configuration validation
snips snippets list [--group <name>]     # List snippets
snips snippets search <query>             # Search snippets
snips snippets get <id>                   # Get full snippet
snips snippets create [options]           # Create snippet
snips snippets update <id> [options]      # Update snippet
snips snippets delete <id> --confirm      # Delete snippet
snips snippets copy <id>                  # Copy to clipboard
snips snippets export --format json|markdown --out <path>
snips snippets import <path> [--dry-run]
snips groups list                         # List groups
snips groups create <name>                # Create group
snips groups delete <id> --confirm        # Delete group
snips stats summary [--from <date> --to <date>]
snips stats top [--limit <n>]
snips stats reset [<snippetId>] --confirm
```

### Future (Post-Phase 7)
```
snips snippets ai-rewrite <id> --style "concise" [--dry-run]
snips snippets ai-generate --prompt "..." [--dry-run]
snips snippets categorize [--dry-run]
snips snippets detect-duplicates [--threshold 0.8]
snips snippets merge <id1> <id2> --confirm
snips snippets audit-stale
snips strata save-snippet <id> --tag snips
snips strata import-note <noteId> [--dry-run]
snips strata search-candidates <query>
snips backup create [--out <path>]
snips backup restore <path> --confirm
```

## Strata Integration Ideas

### Save Snippet as Strata Note
```bash
snips strata save-snippet snippet_123 --tag snips --tag template
```
- Exports snippet as Markdown with frontmatter
- Creates Strata note via `strata-note.sh read-stdin`
- Tags note with `snips` and original snippet tags
- Useful for: saving prompt libraries, sharing templates, archiving

### Import Strata Note as Snippet
```bash
snips strata import-note note_456 --as-snippet --dry-run
```
- Reads Strata note via local HTTP API
- Creates snippet from note title + body
- Copies tags from Strata note
- Useful for: turning meeting notes into snippets, saving SOPs as templates

### Search Strata for Snippet Candidates
```bash
snips strata search-candidates "support replies"
```
- Searches Strata notes for text that would make good snippets
- Returns candidates with suggested abbreviations
- User can import directly

### Export Snippets as Strata Notes (Batch)
```bash
snips snippets export --format markdown --out ./snips-notes/
# Then in Strata:
for f in ./snips-notes/*.md; do cat "$f" | strata-note.sh read-stdin --tags snips; done
```

## Safety Rules

Before AI write access exists, these gates must be in place:

1. **Provider configured:** API key stored securely, endpoint validated
2. **Consent obtained:** User has seen and accepted AI privacy notice
3. **Global AI enabled:** Master toggle is on
4. **Per-snippet AI enabled:** Snippet is not marked as AI-opt-out
5. **Preview shown:** User sees diff/suggestion before applying
6. **Confirmation required:** User must explicitly accept (not auto-apply)
7. **Action recorded:** Every AI mutation is logged in `ai_actions` table
8. **Revert available:** User can undo AI changes
9. **Rate limited:** No mass AI processing without explicit user action
10. **Provider errors handled:** Timeout, rate limit, content filter — all surfaced gracefully

## Recommended First CLI/AI Upgrade Slice

### CLI First Slice (2-3 sessions)
1. SN-035: CLI entry point and argument parser
2. SN-036: `snips health` command
3. SN-037: `snips snippets list/search/get` (read-only commands first)
4. SN-040: Error shape standardization

After this slice, agents can list, search, and retrieve snippets via CLI. No write operations yet — that comes next.

### AI First Slice (requires SN-009, SN-041, SN-042 first)
1. SN-041: AI provider abstraction + secure key storage
2. SN-042: Preview/diff system in GUI
3. SN-044: Per-snippet AI opt-out
4. First AI feature: "AI Rewrite" for a single snippet (Flow 1 above)

This is the smallest possible AI feature that demonstrates the full safety pipeline: provider → generate → preview → confirm → record.
