# Engineering Journal

This file adds the decision context that is usually missing from commit messages and GitHub activity history. Entries should stay concise and focus on why a change was made, what symptoms were observed, and how the solution was validated.

## Unreleased

### 2026-04-16 - v1.1.5 workflow failure recovery via version correction

- Request: fix release workflow failures after the new gating step blocked compilation.
- Rationale: the version gate should prevent mixed-version assets, but the next release tag must match manifests exactly so publishing can proceed.
- Symptoms discovered:
  - all `v1.1.5` build jobs failed in `Verify tag version matches manifests`
  - manifests were still `1.1.4` while the pushed tag was `v1.1.5`
- Solution:
  - bumped release-driving metadata to `1.1.6` in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`
  - prepared next release to use a fresh matching tag rather than mutating the failed `v1.1.5` run again
- Validation:
  - local problems check to confirm updated files remain valid before retriggering release

### 2026-04-16 - Latest release pointer recovery and resilient release gating

- Request: ensure `/releases/latest` points to a release with install packages instead of stale source-only `v1.1.2`.
- Rationale: failed newer release runs should not prevent publishing valid installers and updating the latest release pointer.
- Symptoms discovered:
  - `v1.1.4` workflow failed in Windows verify step due shell-sensitive inline Node command
  - Linux ARM64 leg failure blocked publish job, leaving no newer release than `v1.1.2`
- Solution:
  - replaced inline verification commands with shared script `.github/scripts/verify-tag-version.mjs` used by Windows and Linux jobs
  - made Linux ARM64 matrix leg non-blocking (`continue-on-error` with `allow_failure: true`) so publish can proceed with available artifacts
- Validation:
  - local problems check passes; next tagged run should publish assets and advance latest release

### 2026-04-16 - Enforced build/version increment consistency

- Request: ensure build number increments on all release assets.
- Rationale: release tags and generated installer/package filenames must stay in sync to avoid mixed-version artifacts.
- Symptoms discovered:
  - previous tags could produce assets with older embedded app version when metadata had not been bumped first
- Solution:
  - bumped app version metadata from `1.1.3` to `1.1.4` in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`
  - added release workflow gate in both Windows and Linux build jobs to verify `GITHUB_REF_NAME` tag version matches manifest versions before building
- Validation:
  - local problems check passes for updated files; next release tag will fail fast if version metadata is not incremented consistently

### 2026-04-16 - Linux release pipeline for x64 and ARM64

- Request: attempt Linux builds for x64 and ARM64 to support Debian/Ubuntu-style distributions.
- Rationale: publish native Linux install assets alongside Windows to broaden supported client platforms.
- Symptoms discovered:
  - existing release workflow only produced Windows (`msi`/`nsis`) artifacts
- Solution:
  - split release build jobs into `build-windows` and `build-linux`
  - added Linux matrix targets for `x86_64-unknown-linux-gnu` and `aarch64-unknown-linux-gnu`
  - installed required Linux Tauri build dependencies on runner
  - added Linux artifact upload (`.deb`, `.AppImage`) and expanded publish globs to include Linux assets
- Validation:
  - workflow syntax/Problems checks pass locally; release run required to confirm runner availability and resulting artifacts

### 2026-04-16 - Version metadata bump to 1.1.3 for installer filenames

- Request: ensure release installer filenames show `1.1.3` instead of `1.1.1`.
- Rationale: tagged release version and generated installer version should match for support and distribution clarity.
- Symptoms discovered:
  - `v1.1.3` release assets were published but filenames were still `WinChannels_1.1.1_...`
- Solution:
  - bumped version metadata to `1.1.3` in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and root package entry in `src-tauri/Cargo.lock`
- Validation:
  - Problems check passes for updated files; ready for release rebuild via tag push

### 2026-04-16 - Release asset upload path fix

- Request: fix tagged releases that completed workflow runs but still showed source-only assets.
- Rationale: successful build jobs should always result in attached installer assets on the GitHub Release.
- Symptoms discovered:
  - latest `Release` workflow runs reported success across build/upload/download/publish steps
  - `v1.1.2` release still had zero attached assets
- Solution:
  - updated release publish globs to recursive patterns (`release-artifacts/**/*.msi`, `release-artifacts/**/*-setup.exe`) to match downloaded artifact subfolder layouts
  - added explicit artifact listing step before publish for visibility in workflow logs
- Validation:
  - workflow syntax/Problems checks pass locally; ready for retrigger on next tag

### 2026-04-16 - Release publish fix for source-only tag releases

- Request: resolve repeated release workflow failures where tagged releases showed only source archives.
- Rationale: installer assets must publish reliably for both x64 and ARM64 builds.
- Symptoms discovered:
  - `Publish GitHub Release` step failed with `Resource not accessible by integration` on release notes generation API
  - release page remained with source-only assets
- Solution:
  - updated release workflow to stop calling `generate_release_notes` and use explicit `GITHUB_TOKEN` in `softprops/action-gh-release`
- Validation:
  - workflow file updated; ready for retrigger via tag push

### 2026-04-15 - Fullscreen label and stats hotkey toggle corrections

- Request: fix fullscreen button text showing `Exit Fullscreen` at startup and make stats hotkey toggle persist instead of only while key is held.
- Rationale: diagnostics controls should accurately reflect state and behave predictably during playback.
- Symptoms discovered:
  - fullscreen control could render the exit label before entering fullscreen
  - stats overlay toggled on keydown and back off on keyup, causing press-and-hold behavior
- Solution:
  - changed overlay fullscreen state check to require a non-null fullscreen element match
  - removed keyup listener from stats hotkey path so `Shift+S` toggles only on keydown
- Validation:
  - TypeScript/Problems check reports no errors in updated files

### 2026-04-15 - Fullscreen-safe stats hotkey and player fullscreen control

- Request: make `Shift+S` reliably toggle stats while fullscreen.
- Rationale: native video fullscreen can intercept some keys before app-level handlers, causing diagnostics hotkeys to appear broken.
- Symptoms discovered:
  - even after expanding listeners, `Shift+S` still did not always fire when using native video fullscreen controls
- Solution:
  - hardened hotkey matching (`code === KeyS` with shift fallback to key value) and added capture listeners on window/document
  - added app-controlled fullscreen toggle on the player overlay so keyboard events stay inside app-managed DOM focus
  - focused overlay container on entering overlay fullscreen to keep shortcut handling reliable
- Validation:
  - TypeScript/Problems check reports no errors in updated files

### 2026-04-15 - Stats hotkey support in fullscreen playback

- Request: make the diagnostics stats hotkey work while video is in fullscreen mode.
- Rationale: fullscreen troubleshooting should not require exiting fullscreen to toggle diagnostics.
- Symptoms discovered:
  - `Shift+S` worked in windowed playback but could miss key events in fullscreen focus contexts
- Solution:
  - expanded key listeners from window-only to window + document capture + video element listeners
  - retained diagnostics-enabled and active-playback gating for shortcut behavior
- Validation:
  - TypeScript/Problems check reports no errors in updated files

### 2026-04-15 - Stats overlay keyboard toggle

- Request: add a keyboard shortcut for toggling player diagnostics stats.
- Rationale: quick in-playback toggling is faster than targeting a small header button during troubleshooting.
- Symptoms discovered:
  - stats overlay could only be toggled via mouse click
- Solution:
  - added `Shift+S` key handling in `VideoPlayer` when diagnostics tools are enabled and playback is active
  - updated the Stats button tooltip to document the shortcut
- Validation:
  - TypeScript/Problems check reports no errors in updated files

### 2026-04-15 - Player diagnostics "Stats for Nerds" overlay

- Request: add a YouTube-style in-player diagnostics view to inspect live playback performance and stream selection.
- Rationale: playback quality and stutter reports are easier to debug when stream/video telemetry is visible during playback, not only in copied logs.
- Symptoms discovered:
  - current diagnostics exposed only a copy-to-clipboard report and no live metrics view
  - users needed immediate visibility for bitrate estimate, selected level, buffering, and dropped-frame behavior
- Solution:
  - added a diagnostics-only `Stats` toggle in `VideoPlayer` header controls
  - implemented a live overlay panel updating every second with state, resolution, selected level, bandwidth estimate, buffer ahead, dropped/decoded frames, dropped-frame percentage, playback rate, volume, and manifest URL
  - extended copied playback report to include the same runtime metrics snapshot
  - updated Settings diagnostics hint text to describe the new overlay tool
- Validation:
  - TypeScript/Problems check reports no errors in changed files

### 2026-04-15 - Release workflow adds Windows ARM64 artifacts

- Request: publish Windows ARM64 installers in addition to existing x64 artifacts so Snapdragon users can install native builds.
- Rationale: release automation should ship both supported Windows architectures from tagged builds.
- Symptoms discovered:
  - local ARM64 build attempt failed on missing ARM64 MSVC cross tools (`cl.exe`/`clang` not found), indicating architecture-specific toolchain requirements
  - existing release workflow built only one default Windows target and uploaded only x64 paths
- Solution:
  - changed `.github/workflows/release.yml` to a matrix build for `x86_64-pc-windows-msvc` and `aarch64-pc-windows-msvc`
  - configured Rust setup with per-matrix target installation
  - uploaded per-target installer bundles as artifacts and added a single publish job that downloads and releases all installers together
- Validation:
  - workflow YAML updated with explicit per-target build commands and release file globs for both architectures

## Version 1.1.1 (2026-04-15)

### Fix duplicate channels in Favorites view

- Request: favorites list showed the same channel multiple times when it was present across multiple tuner sources.
- Rationale: `dedupeRows` was only applied for the `all` filter mode; the `favorites` filter left all per-source rows in the list.
- Solution: extended the `dedupeRows` call to also run when `filterMode === 'favorites'`.
- Validation: build passes; favorites view now shows each channel once.

### 2026-04-15 - Version bump to 1.1.0 for release parity

- Request: bump app version to `1.1` and ensure installer artifacts carry the same version.
- Rationale: shipped binaries and in-app/version metadata must stay aligned for supportability and release clarity.
- Solution:
  - updated `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` to `1.1.0`
  - prepared release by pushing matching git tag `v1.1.0` so CI-generated installers inherit the same version line
- Validation:
  - project build succeeds after version updates

### 2026-04-15 - Live diagnostics favorites and matching corrections

- Request: reduce false-positive favorites and align same channels (for example `TLC`) into the same comparison row across sources.
- Rationale: the diagnostics table should be trustworthy for source comparison and should not imply favorites that are not explicitly flagged by authoritative metadata.
- Symptoms discovered:
  - too many channels were marked favorite in Live diagnostics
  - same channel names could appear on separate rows across sources
- Solution:
  - tightened favorite detection to explicit channel/guide favorite flags only
  - changed diagnostics grouping key from channel number-only to normalized channel name
  - kept number/name sort controls while using representative minimum number for numeric ordering
- Validation:
  - build succeeds
  - same-name channels now align into shared rows across sources

### 2026-04-15 - Live source diagnostics matrix

- Request: add a diagnostics-only tool on Live showing a popup table of channels by source.
- Rationale: troubleshooting source differences (especially between similarly named sources) requires a single view that clearly shows channel membership per source instance.
- Symptoms discovered:
  - regular list filtering was useful for browsing but not ideal for side-by-side source inventory visibility
- Solution:
  - added a `Source Diagnostics` button on Live, shown only when diagnostics are enabled in settings
  - added modal with source-grouped channel tables including number, name, id, and favorite field state
- Validation:
  - build succeeds
  - diagnostics control is gated behind the existing diagnostics setting

### 2026-04-15 - Diagnostics matrix layout refactor

- Request: refactor diagnostics display to show sources across the top with channels listed in columns under each source.
- Rationale: source-by-source comparison is easier when all sources are aligned in one matrix rather than stacked as separate tables.
- Solution:
  - replaced per-source stacked tables with a single cross-source matrix keyed by channel number
  - sources are column headers and channel numbers are row headers
  - added diagnostics sort options for channel number and channel name
  - each cell stacks all matching entries for that source/number and shows logo, name, id, and favorite marker
- Validation:
  - build succeeds
  - matrix renders sources horizontally for direct comparison and keeps duplicate per-source matches visible within each cell

### 2026-04-15 - Live source split and favorites parity tuning

- Request: expose each real channel source instance separately at the top of Live (not merged by source name), while keeping `All Channels` and `Favorites` meta filters.
- Rationale: multiple HDHomeRun devices with the same source name can still differ in feed behavior, so source-instance visibility is needed for troubleshooting and comparison.
- Symptoms discovered:
  - source filters merged both HDHomeRun devices into one `HDHomeRun QUATRO` entry
  - some channels appeared as favorites in Channels UX context but were missing from Live favorites when `favorited` was absent in `/api/v1/channels`
- Solution:
  - changed source filters to use `source_name + source_id` labels (per-source-instance chips)
  - kept meta filters (`All Channels`, `Favorites`) as top-level options
  - expanded favorites detection to combine channel `favorited`, guide `Favorite` flags, and membership in `/dvr/guide/channels?source=favorites`
- Validation:
  - build succeeds
  - source chips now expose each real source instance separately
  - custom channels in the server favorites source can now be treated as favorites even when explicit flags are missing

### 2026-04-15 - VS Code build-task workflow approximation

- Request: approximate a Visual Studio-style Build menu experience in VS Code.
- Rationale: VS Code does not expose the same top-level Build menu model as Visual Studio, but default build tasks provide equivalent day-to-day behavior.
- Symptoms discovered:
  - F5 launch worked, but there was no obvious build-menu-style action
- Solution:
  - marked `WinChannels: Build` as the default build task in `.vscode/tasks.json`
  - this enables `Terminal -> Run Build Task...` and `Ctrl+Shift+B` for one-step builds
- Validation:
  - build task remains `npm run build` and continues to execute successfully

### 2026-04-15 - VS Code F5 launch configuration

- Request: make F5 start this project reliably from VS Code Run and Debug.
- Rationale: running through helper scripts worked, but F5 had no workspace launch configuration to invoke the app.
- Symptoms discovered:
  - pressing F5 did not start WinChannels debugging workflow
- Solution:
  - added `.vscode/launch.json` with a `node-terminal` launch profile that runs `npm run tauri dev`
  - added `.vscode/tasks.json` with named dev/build tasks for consistency
- Validation:
  - configuration files are present and valid JSON; project build remains successful

### 2026-04-15 - Convenience scripts for common commands

- Request: add root-level `run.cmd` and `build.cmd` wrappers for the common npm commands.
- Rationale: the full npm commands were easy to forget during routine local development.
- Symptoms discovered:
  - repeated need to recall or retype the exact dev and build commands
- Solution:
  - added `run.cmd` to call `npm run tauri dev`
  - added `build.cmd` to call `npm run build`
- Validation:
  - executed the build helper successfully

### 2026-04-15 - Live TV: source filters, dedupe, playback, logos

- Request: add a Live TV view with a list-style channel browser, sorting, filtering, and click-to-play behavior.
- Rationale: a list matched the existing TV Shows navigation model better than a dense guide grid and was sufficient for initial live playback support.
- Symptoms discovered:
  - initial list rows were inert because they had no play behavior
  - early filter rendering behaved incorrectly when duplicate channels were present
  - guessed live playback endpoints produced `manifestLoadError` 404s and `levelLoadError` 500s on some channels
  - custom 9000+ channels had no `logo_url` in the API even though Channels DVR web showed logos
- Solution:
  - added a Live page with channel sorting and filtering
  - changed source menus to use unique `source_name` values only
  - deduped the `All Channels` view while preserving source-specific filtering
  - resolved live playback against Channels DVR live HLS endpoints that match web playback behavior
  - centralized channel logo fallback logic using `station_id -> /tmsimg/assets/...`
  - added explicit list scrolling and kept duplicate-aware playback support
- Validation:
  - production build passes
  - live playback works with the verified `/devices/ANY/channels/{number}/hls` endpoint pattern
  - custom channel logos can be resolved from `station_id` fallback

### 2026-04-14 - TV and movie browsing UX refinement

- Request: make TV Shows and Movies behavior more consistent with Recent Recordings, then refine TV detail layout further.
- Rationale: the previous flows were inconsistent and exposed too much raw metadata in the TV detail view.
- Symptoms discovered:
  - TV details showed raw API output that was noisy and hard to scan
  - movie and TV navigation patterns differed more than necessary
- Solution:
  - reworked TV show list/detail flow to use artwork, summary, episode grid, and metadata popup
  - reworked movie browsing into a cleaner detail-first flow with back navigation
  - renamed Library to Videos for clearer navigation
- Validation:
  - UX changes were reviewed interactively and accepted during the session

### 2026-04-14 - Versioning, About page, and release wiring

- Request: surface version `1.0` in-app and make release packaging reflect it.
- Rationale: release builds and in-app UI needed a single visible version source for shipping and support.
- Solution:
  - bumped app, Tauri, and Rust package versions
  - added compile-time version constants and About section in Settings
  - ensured release workflow could publish tagged builds
- Validation:
  - tagged releases were created and pushed successfully

### 2026-04-14 - Playback quality investigation and remux preference

- Request: investigate blocky playback compared with Channels DVR web playback.
- Rationale: WinChannels should not force a visibly worse transcoding path than the native web client when the DVR can serve a better stream.
- Symptoms discovered:
  - DVR logs showed WinChannels requests triggering `h264_vaapi` while the web UI often used `remux`
  - HLS level selection was not reliably choosing the best variant
- Solution:
  - used absolute HLS URLs in Tauri contexts and routed playback through the Tauri HLS loader in dev and prod
  - added browser-like headers in the loader
  - added remux-preferred manifest requests with fallback to default manifests on load failure
  - switched level choice to highest bitrate rather than index order
  - added optional diagnostics and playback report capture
- Validation:
  - user confirmed playback quality improved and remux path activation was visible in DVR behavior

### 2026-04-14 - Multi-server support and connection diagnostics

- Request: support multiple DVR servers, allow switching in the sidebar, and test each configured server.
- Rationale: the app needed to work across several DVRs without editing config or restarting the app.
- Symptoms discovered:
  - connection tests initially used stale server state until settings were saved
  - server changes required restart-like behavior without an explicit refetch trigger
- Solution:
  - added persisted server table config with active-server selection
  - added sidebar dropdown for server choice
  - added server-change versioning to trigger refetch across pages
  - changed test flow to save first and then test all configured servers with per-server output
- Validation:
  - user reported all configured servers tested successfully

### 2026-04-14 - Tauri scope fix for non-default DVR ports

- Request: allow DVR access on ports other than `8089`.
- Rationale: the Tauri HTTP allow-list was too narrow and blocked legitimate DVR hosts on alternate ports.
- Symptoms discovered:
  - requests succeeded on `:8089` but failed on another DVR port due to scope restrictions
- Solution:
  - updated Tauri capability URL patterns to allow host + any port for HTTP and HTTPS
- Validation:
  - alternate-port DVR requests became reachable after the capability change