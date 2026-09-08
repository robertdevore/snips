# Security — current 0.5.0 implementation

Report vulnerabilities privately to the repository owner; do not publish confidential snippets.
This document covers this checkout. Older installers have different IPC security properties.

## Threat model

The helper can observe keyboard events and inject text after macOS Accessibility/Input Monitoring
approval. Protect that authority from unauthenticated network clients, unrelated renderers, malformed
input and accidental agent writes. The database and history contain plaintext local user data.
Same-user malware that can read both the database and 0600 helper token is outside this boundary.
No mandatory network service, telemetry, generative AI, or remote processing is installed.

## IPC

- Swift explicitly binds command TCP to **127.0.0.1:50555** using `requiredLocalEndpoint`.
- Electron explicitly binds HTTP events to **127.0.0.1:50556**.
- A cryptographically random 32-byte per-install secret lives in `helper-token` next to `data/`.
  Creation is exclusive, mode 0600; ownership/type/permissions are checked. No renderer receives it.
- Commands require `protocolVersion:1`, `requestId`, `token`, `type`, and `payload`.
  The helper checks protocol and a constant-work equal-length token comparison before executing.
- Events use the same envelope without the token, plus `Authorization: Bearer <secret>`.
  Electron authenticates before accumulating bodies, requires JSON Content-Type, enforces a
  256 KiB body limit, 5-second timeouts and explicit event schemas/type allowlists.
- Commands are limited to 16 MiB per connection, with a 5-second deadline. Replies are bounded.
  Config callbacks are restricted to the fixed loopback event URL. Arbitrary helper callback URLs
  and remote helper hosts are unsupported. Configuration revisions detect stale delta updates.
- An incompatible helper produces an actionable update error. A hash mismatch appears in Status;
  security-sensitive upgrades require the explicit Upgrade helper action.

A same-user client that steals the secret can exercise helper commands; this is not a sandbox
against the owner account. XPC peer identity would tighten that boundary, but a second protocol
stack was not added. Future XPC work should replace, rather than coexist with, this transport.

## Electron and inputs

All windows keep sandboxing, context isolation, nodeIntegration disabled and webSecurity enabled.
Navigation and new windows are denied. IPC verifies the sending top frame and exact bundled page;
only the library page may mutate snippets/settings, while palette privileges are bounded.
External System Settings links are fixed strings. Avatars are bounded raster data URLs and rendered
with DOM properties. There is no shell interpolation for snippet content. CLI launchers quote paths.

Shared snippet validation bounds strings/tags, validates trigger/case modes and group existence,
and rejects unknown fields. Multi-query writes use immediate transactions, with optimistic revision
checks and reversible local history. Imports reject collisions. Permanent deletion is explicit and
also removes history/retry receipts; SQLite/WAL/backups are not guaranteed forensic erasure.

Keyboard input and clipboard contents are never logged. Clipboard reading occurs only for its macro.
Secure Input pauses matching. Injection targets the captured process and uses a recursion marker.
Fill timeout/cancel returns no replacement text and removes the pending request. Debug benchmarks
use generated snippets and do not post text events.

Strata is opt-in, literal-loopback-only, authenticated when a token is supplied, rejects redirects,
and enforces request timeout and response-size limits. Remote endpoints are intentionally unsupported.

## Release gates and limitations

Developer ID signing and notarization were not claimed in this session. The build supports signing
both helper bundles and the Electron app; `scripts/notarize-release.sh` submits and staples using a
Keychain profile. See `RECOVERY.md`. Do not distribute an unsigned build as a trusted automatic update.
The helper's permission identity is preserved by copying the packaged signed bundle intact.

The current host reports Accessibility=false, ListenEvent=false, PostEvent=false for the test runtime.
Consequently real injection, cursor behavior in third-party editors, and TCC retention after signed
upgrades remain release-gate tests. Deterministic tests do not establish those properties.

Apple documents SMAppService as the modern macOS 13+ registration mechanism:
[SMAppService](https://developer.apple.com/documentation/servicemanagement/smappservice) and
[updating helper executables](https://developer.apple.com/documentation/servicemanagement/updating-helper-executables-from-earlier-versions-of-macos).
Moving this legacy per-user helper into a containing app's service location changes the permission
migration. Keep that migration paired with signed/TCC acceptance testing; it is not silently enabled.
Electron hardening follows its [security checklist](https://www.electronjs.org/docs/latest/tutorial/security).
