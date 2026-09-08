# Recovery and release gates

## Database

Migration failures stop startup; they never mean “already migrated.” Quit Snips before making a
filesystem backup. Preserve `snips.db`, `snips.db-wal` and `snips.db-shm` together, or use a SQLite
online backup. Do not delete a database to resolve migration errors. `user_version > 1` requires
a newer application. The legacy-location copy now uses SQLite backup so committed WAL rows survive.

A pre-upgrade backup is recommended; migration 1 is transactional and preserves the source table
if constraints fail. Existing bad boolean values must be repaired deliberately in an offline copy.
A failed update leaves the current snippet unchanged. Copy a conflicting GUI draft before reloading.
History → Revert restores prior text through the same revision checks. Trash restore can conflict
with an active abbreviation; change the active abbreviation first. Permanent deletion is irreversible.

## Helper and permissions

Status shows missing permissions, failed shortcuts and helper update requirements. Use **Upgrade
helper** to install the packaged helper at its stable per-user path. Then open Accessibility and Input
Monitoring in System Settings and re-enable **SnipsHelper.app** if required. Use Restart Helper afterward.
An incompatible helper is never treated as a successfully synchronized helper.

Legacy LaunchAgent registration remains. SMAppService migration requires a signed integration test
covering app relocation, upgrades, login/reboot, registration denial and TCC retention. A future XPC
migration should replace the existing authenticated protocol rather than add competing implementations.

## Signing and distribution

1. Supply `SNIPS_SIGNING_IDENTITY` (Developer ID Application identity name) for the helper build.
2. Configure electron-builder signing using `CSC_NAME` or its secure certificate environment inputs.
3. Run `npm run package:dmg`. Both architectures and SHA256SUMS are generated.
4. Store notarization credentials in Keychain with Apple's `notarytool store-credentials`.
5. Set `SNIPS_NOTARY_PROFILE` to that profile name and run
   `zsh scripts/notarize-release.sh app/dist/Snips-0.5.0.dmg` for each architecture.
6. Verify app/helper signatures with `codesign --verify --deep --strict`, Gatekeeper with
   `spctl --assess --type execute`, and staple validation before publishing.

No credentials belong in this repository. Unsigned directory packages only prove structure/runtime
loading, not trusted distribution. Auto-update is deliberately not enabled before signed artifacts
and the helper/TCC upgrade gate are verified. Use explicit downloaded, checksum-verified releases.

## Remaining environment-dependent acceptance

The session's test runtime has no Accessibility, Input Monitoring or PostEvent permission. A human
must grant these to a disposable signed test installation before validating:

- immediate, whitespace, punctuation, Enter/Tab expansion in native text fields, browser textareas,
  code editors, Electron, Terminal and rich text;
- cursor position after emoji, combining characters, multiline fills, RTL/IME content;
- fast typing while insertion runs, cancellation, focus changes, and app/helper restarts;
- visible end-to-end latency (focus and synthetic event creation timings are not substitutes);
- Developer ID helper update without TCC loss, and regrant/recovery when the OS revokes it.

ARM64 helper builds and app artifacts can be inspected on this Intel host. Running the ARM64 app
requires Apple Silicon. Do not call these release gates passed until run on the appropriate machine.

MCP and generative AI are deferred by product design. A future MCP adapter can expose bounded
reads and `operations.execute` previews/conditional commits without filesystem or raw SQLite access.
Quick capture/clipboard monitoring is not added: explicit create/paste preserves consent and privacy.
