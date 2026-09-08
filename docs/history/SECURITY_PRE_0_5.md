> HISTORICAL / SUPERSEDED. See ../../AGENTS.md and current docs.

# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Snips, please report it privately to the maintainers. Do not open a public issue.

## Supported Versions

| Version | Supported |
|---|---|
| 0.2.x   | ✅        |

## Security Model

Snips is a **local-first** application. All snippet data is stored in a local SQLite database at `~/Library/Application Support/Snips/data/snips.db`. No data is sent to external servers unless explicitly configured by the user (e.g., future AI provider integration).

### Key Security Properties

- **Local data ownership**: All snippets and settings live on your machine.
- **No cloud sync**: No account required, no data leaves your device by default.
- **Context isolation**: Electron renderer runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **Content Security Policy**: CSP headers restrict script sources to the app bundle.
- **Clipboard safety**: Snippet expansion uses Unicode typing injection, not clipboard paste. The system clipboard is only read when the `[[clipboard]]` macro is explicitly used in a snippet.
- **Secure Input respect**: The helper pauses expansion when Secure Input is active (password fields, etc.).

### Known Security Considerations

- **CGEventTap scope**: The Swift helper uses a system-wide keyboard event tap to detect abbreviations. This requires Accessibility and Input Monitoring permissions. The helper only processes keystrokes for abbreviation matching and does not log or transmit raw keystrokes.
- **Clipboard macro**: The `[[clipboard]]` macro reads your system clipboard at expansion time. Avoid using this macro in snippets that expand while sensitive data is on your clipboard.
- **Local storage**: Snippet data is stored as plain text in SQLite. There is no encryption at rest. Do not store passwords, API keys, or other secrets in snippets.
- **Helper binary**: The Swift helper binary is copied to `~/Library/Application Support/Snips/helper/`. macOS may treat updated binaries as new applications, requiring re-granting of Accessibility permissions.
- **API keys**: Future AI provider integration will store API keys using Electron's `safeStorage` API. Currently no API keys are stored.

## Best Practices for Users

1. Do not store passwords or API keys in snippet content.
2. Be aware that `[[clipboard]]` reads whatever is currently on your clipboard.
3. Review Accessibility and Input Monitoring permissions periodically.
4. Back up your snippet database (`~/Library/Application Support/Snips/data/`).
5. Quit Snips when not in use if you have sensitive data in your snippet library.
