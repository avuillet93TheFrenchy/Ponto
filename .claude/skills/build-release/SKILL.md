---
name: build-release
description: Build release artifacts — the web build (Vite or the project's bundler) and, for Tauri projects, Windows (.exe/.msi), macOS (.app/.dmg), Linux (.deb, .rpm, .AppImage), Android (.apk/.aab) or iOS. Check prerequisites for each target, bump the version if requested, generate artifacts and prepare them for the release (asset names, updater manifest).
---

# Build Release

## Project context

Resolve the profile first (`.claude/PROJECT-CONTEXT.md`): `<run>`, `<exec>`, `commands.*`, `scripts.build`,
`stack.tauri`, `<tauri>`. Read `package.json` scripts (the project may have per-target scripts such as
`tauri:build:linux`), `<tauri>/tauri.conf.json` (`bundle.targets`, `plugins.updater`,
`bundle.createUpdaterArtifacts`) and the `conventions` files: **release asset names, required env vars and
publishing steps are project-specific** — follow them when they exist, otherwise ask.

## Workflow

1. Ask which target to build for:

- Web: the static bundle (`dist/` or the bundler's `outDir`) — always available when there is a build script
- Tauri only (`stack.tauri`): Windows, macOS, Linux, Android, iOS — limit to what the project ships and
  what the host can build (Linux bundles need a Linux host, macOS/iOS a Mac)
- all: every target available on this host

2. Optional: ask if the user wants to bump the version before building (patch, minor, major)
3. Check prerequisites for the selected target
4. Start the build
5. Display the generated artifacts and their location
6. If they are meant for a release, prepare them for publishing (see "Publishing a release")

## Prerequisites by target

### All targets

- The package manager (`packageManager`) installed: check `<pm> -v`; if missing, give the official install
  command and let the user run it
- Dependencies installed: `<commands.install>` (Tauri: installs `@tauri-apps/cli` as a devDependency)

### Web

- No Rust, no Tauri CLI, no OS-level deps
- Every build-time env var the app needs (`VITE_*`, `.env*`) is set — a missing required value often builds
  fine and breaks at runtime: check the project's `notes`/conventions and `.env.example`

### Tauri desktop (Windows / macOS / Linux)

- Rust installed (`rustc --version`)
- Windows: Visual Studio Build Tools (C++ workload), WebView2
- macOS: Xcode command line tools; signing identity/notarization credentials for a public release
- Linux (Linux host only): [Tauri v2 Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux)
  (WebKitGTK 4.1, GTK 3, librsvg, libayatana-appindicator, build-essential...) and `rpm` for .rpm
- If `createUpdaterArtifacts` is enabled: `TAURI_SIGNING_PRIVATE_KEY` (and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if set) — the build fails without it

### Android

- Android Studio with SDK, build tools and NDK (`ANDROID_HOME`, `NDK_HOME`/`ANDROID_NDK_HOME`)
- JDK required by the Gradle project + `JAVA_HOME`
- The Rust targets for the ABIs built: `rustup target add aarch64-linux-android` (and
  `armv7-linux-androideabi`, `i686-linux-android`, `x86_64-linux-android` for a universal build)
- A release keystore (usually described by a git-ignored `keystore.properties`)

### iOS

- macOS with Xcode, `rustup target add aarch64-apple-ios`, an Apple development team configured

## Build commands

Prefer the project's own scripts when they exist (`<run> tauri:build`, `<run> build:web`...). Otherwise:

| Target | Command | Artifacts |
| --- | --- | --- |
| Web | `<run> <scripts.build>` then `<run> preview` to sanity-check | `dist/` (or `build.outDir`) |
| Windows | `<exec> tauri build` | `<tauri>/target/release/bundle/nsis/*.exe`, `msi/*.msi` (+ `.sig` with updater artifacts) |
| macOS | `<exec> tauri build` | `<tauri>/target/release/bundle/macos/*.app`, `dmg/*.dmg` |
| Linux | `<exec> tauri build --bundles deb,rpm,appimage` | `<tauri>/target/release/bundle/{deb,rpm,appimage}/` |
| Android | `<exec> tauri android build --apk [--target aarch64]` (`--aab` for the Play Store) | `<tauri>/gen/android/app/build/outputs/{apk,bundle}/...` |
| iOS | `<exec> tauri ios build` | `<tauri>/gen/apple/build/...` |

Check which `--target`/`--bundles` the project's scripts pass — don't assume a universal APK or every bundle.

If a production build uploads anything (source maps to Sentry, a deploy), tell the user before building.

## Version bump

If a bump is requested:

1. Update `version` in `package.json` (patch, minor, major as requested).
2. Tauri: update `<tauri>/tauri.conf.json` `version` (unless it references `../package.json`) and
   `[package] version` in `<tauri>/Cargo.toml`.
3. Any other manifest listed in the conventions.
4. Verify all versions match.

## Publishing a release

1. Use the asset names documented by the project (website download links, README, updater). If none are
   documented, propose `<name>-<os>-<arch>.<ext>` and ask before renaming.
2. Tauri updater: rename each signed installer **and its `.sig`** to its final name first, then build the
   updater manifest (`latest.json`) — with the project's script if it has one — since the download URL is
   built from the file name. See the `tauri-updater` skill.
3. Creating the release and uploading assets are outward-facing: confirm with the user first.

## Post-build validation

- Verify that the artifacts exist
- Display the size of the generated files
- List the artifacts with their full paths
