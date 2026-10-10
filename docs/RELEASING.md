# Releasing ubongo

## Every release

1. Bump the version in `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml`,
   `pyproject.toml` and `assistant_cli/__init__.py`, and add a `CHANGELOG.md` entry. Merge.
2. Test the build on a Mac: download the **ubongo-dmg** artifact from the CI run
   on `main` (Actions → CI → latest run → Artifacts), or use `scripts/run-local.sh`.
3. **Actions → Release → Run workflow**, branch `main`, and type the version (e.g. `0.6.3`).
   The run checks the version and starts the packaged server before building.
   It then tags `v<version>` and publishes the DMG, and installed apps show an update banner.
4. If the proxy changed: `cd proxy && fly deploy`.

## Signing and notarization (removes the "couldn't verify" warning)

The Release workflow signs and notarizes **automatically once these repository
secrets exist** (GitHub → Settings → Secrets and variables → Actions). Until
then, builds are unsigned and everything else works the same.

They come from NEDApay's **Apple Developer Program** membership (the paid
program, not just an Apple ID). Someone with the Account Holder or Admin role
creates them:

| Secret | What it is | Where to get it |
|---|---|---|
| `APPLE_CERTIFICATE` | The **Developer ID Application** certificate and its private key, as a base64 `.p12` | Xcode → Settings → Accounts → Manage Certificates → **+ Developer ID Application**. Export it from Keychain Access as `.p12`, then run `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | The password you chose when exporting the `.p12` | |
| `APPLE_API_KEY_P8` | Contents of an App Store Connect API key file (`AuthKey_XXXX.p8`) | App Store Connect → Users and Access → Integrations → **Team Keys** → +, role *Developer*. You can only download it once. |
| `APPLE_API_KEY_ID` | That key's ID (10 characters) | Same page |
| `APPLE_API_ISSUER` | The Issuer ID (a UUID) | Top of the same page |

What the workflow then does on macOS:

1. Imports the certificate into a temporary keychain.
2. Signs every library in the bundled Python server and the server itself, with
   the hardened runtime (`scripts/macos_sign_server.sh`, `desktop/server/entitlements.plist`).
3. Starts the **signed** server to prove it still runs.
4. Builds the app, which Tauri signs with `desktop/src-tauri/Entitlements.plist`
   (microphone, AppleScript), notarizes with Apple and staples.
5. Checks the result with `codesign`, `stapler` and `spctl` (Gatekeeper), and fails the release if any of them reject it.

The app is published under NEDApay's developer name, which is what macOS
shows as the publisher.

## Auto-update (planned)

Updates will install in place through the Tauri updater. It needs its own
signing key pair, separate from Apple's:

```bash
cd desktop && npx tauri signer generate -w ~/.tauri/ubongo-updater.key
```

Keep the private key and its password as secrets `TAURI_SIGNING_PRIVATE_KEY`
and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Only the **public** key goes into
the app's config. Never commit or share the private key.
