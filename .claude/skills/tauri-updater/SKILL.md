---
name: tauri-updater
description: Use when setting up or working on in-app updates for Tauri v2 desktop builds (Windows NSIS/MSI, macOS, Linux AppImage) with the updater plugin - signing keys, tauri.conf.json, the latest.json manifest published with each release, a JS wrapper, or the update UI. Does not apply to Android/iOS (see Mobile).
---

# Tauri v2 Updater

## Project context

Resolve the profile first (`.claude/PROJECT-CONTEXT.md`): `<tauri>`, `<src>`, `<exec>`, `commands.add`.
If `stack.tauri` is false, stop: this skill is Tauri-only. Read the `conventions` files and `notes` for
the project's release asset names, manifest script and wrapper conventions.

## 0. Detect the current state first

Never reinstall what exists. Check each piece and report the table back:

| Piece | Where to look |
|---|---|
| JS package | `@tauri-apps/plugin-updater` in `package.json` |
| Rust plugin | `tauri-plugin-updater` in `<tauri>/Cargo.toml`, registered in `<tauri>/src/lib.rs` (usually under `#[cfg(desktop)]`) |
| Permission | `updater:default` (or finer) in `<tauri>/capabilities/*.json` |
| Config | `plugins.updater` in `<tauri>/tauri.conf.json`: `pubkey`, `endpoints`, `windows.installMode` |
| Signed artifacts | `bundle.createUpdaterArtifacts: true` |
| Manifest | a script producing `latest.json` (search `scripts/` for `latest.json`), or a CI step |
| JS wrapper | a module wrapping the plugin (search `<src>` for `plugin-updater`) |
| Update UI | any caller of `check()` / the wrapper |

Missing pieces, in order: `<exec> tauri add updater` (adds the crate, the npm package, the permission and
the registration), generate keys (step 1), fill `plugins.updater`, set `createUpdaterArtifacts: true`.

## 1. Signing key

The public key goes in `tauri.conf.json`; the private key never goes in the repository. A build needs it
in the environment, or `createUpdaterArtifacts` makes it fail:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/<app>.key)"   # or the key's path
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="..."                # if the key has one
```

Generate a pair with `<exec> tauri signer generate -w ~/.tauri/<app>.key` and put the public key in
`plugins.updater.pubkey`. If the key is ever rotated, installed copies keep trusting the **old** key and
cannot update to a release signed with the new one: they need a manual reinstall.

## 2. Publishing an update

The endpoint is usually a static `latest.json` (e.g. attached to the latest GitHub release:
`https://github.com/<owner>/<repo>/releases/latest/download/latest.json`) or an update server.

1. Build each desktop target (`build-release` skill).
2. Rename the signed installers **and their `.sig`** to their final asset names first: the manifest's URLs
   are built from the file names.
3. Write the manifest (with the project's script if it has one), one entry per platform, merging the files
   built on different machines.
4. Publish the installers, their `.sig` and `latest.json` — outward-facing: confirm with the user first.

Manifest format (the plugin compares `version` with the running app's):

```json
{
  "version": "1.1.0",
  "notes": "Release notes",
  "pub_date": "2026-10-16T12:00:00Z",
  "platforms": {
    "linux-x86_64": { "signature": "<content of the .sig>", "url": "https://.../app-linux-x64.AppImage" },
    "windows-x86_64": { "signature": "<content of the .sig>", "url": "https://.../app-windows-x64-setup.exe" },
    "darwin-aarch64": { "signature": "<content of the .sig>", "url": "https://.../app-macos-arm64.app.tar.gz" }
  }
}
```

With `createUpdaterArtifacts: true`, Windows and Linux artifacts are the raw installers; macOS uses the
`.app.tar.gz`. `"v1Compatible"` produces zipped archives — only for apps migrating from Tauri v1.

## 3. Update UI (frontend)

If the project wraps plugins (a `<src>/tauri/*.js`-style folder), go through the wrapper and follow its
error convention. Otherwise use the plugin directly:

```js
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export async function checkForUpdate() {
  let update;
  try {
    update = await check(); // null when up to date
  } catch (err) {
    console.error('Update check failed', err); // never block the app over it
    return;
  }
  if (!update) return;

  if (!(await askToInstall(update.version, update.body))) { // the app's own dialog, texts via i18n
    await update.close(); // releases the Rust-side resource
    return;
  }
  await update.downloadAndInstall((event) => {
    // 'Started' (contentLength may be missing), 'Progress' (chunkLength), 'Finished'
  });
  // Windows: the NSIS installer closes the app itself. Linux/macOS: restart to apply.
  await relaunch();
}
```

- `relaunch` needs `tauri-plugin-process` and its permission.
- In a browser tab (dev server, web build) or on mobile, skip the check (`isTauri()` / platform test) unless
  the wrapper already returns `null` there.
- Run the check after the app's start-up work, so the first screen stays quick.
- Test it by mocking the plugin or the wrapper (see `gen-test`).

## Mobile

The updater plugin supports desktop only: don't register it on Android/iOS (`#[cfg(desktop)]`). Mobile
updates go through the stores or a manual APK install.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Reinstalling the plugin or adding a second `plugins.updater` block | Detect the state first (step 0) |
| Building a release without `TAURI_SIGNING_PRIVATE_KEY` | The build fails (`createUpdaterArtifacts`); set the variable first |
| Writing `latest.json` before renaming the installers | Its URLs then point at files the release does not have |
| Attaching `latest.json` to a draft or pre-release with a `/releases/latest/` endpoint | Only the latest published release counts |
| Bumping the version in one file only | `package.json`, `tauri.conf.json` and `Cargo.toml` must match |
| Using the v1 `tauri.updater` block or `@tauri-apps/api/updater` | v2: `plugins.updater` and `@tauri-apps/plugin-updater` |
| Committing the private key | Rotate it at once (see step 1) |

## Scope and Cross-References

- Building and publishing the release → `build-release`
- Capability or config changes → `tauri-v2-capability`, `tauri-security`
- Tests of the update UI → `gen-test`
