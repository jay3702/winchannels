# WinChannels

WinChannels is a native Windows desktop client for Channels DVR.

It gives you a simple TV-style experience for browsing and watching your DVR content, with support for:

- Recent recordings
- TV shows and episodes
- Movies
- Library groups and videos
- Channel logos
- Captions (broadcast and sidecar `.srt`)

## What It Does

WinChannels connects to your Channels DVR server API and streams recordings via HLS.

Key behavior:

- Reads media lists from your DVR server (`/api/v1/...`)
- Streams recordings from DVR file endpoints (`/dvr/files/...`)
- Displays channel logos where available
- Supports both embedded/broadcast captions and sidecar SRT captions
- Allows switching caption mode in the player (Off, Broadcast, SRT)

## Requirements

- Windows 10/11
- A reachable Channels DVR server on your network
- DVR server URL (for example `http://192.168.3.150:8089`)
- Optional but recommended for SRT sidecar captions: access to the DVR storage path as a Windows share

## Important Shared Folder Requirement

If you want SRT sidecar captions to work for all clients/users, the Channels DVR root recording folder must be shared and readable by everyone who will run WinChannels.

Why this matters:

- WinChannels can stream video from DVR HTTP endpoints, but sidecar `.srt` loading requires filesystem access to the recording path.
- The app maps recording paths to your configured Windows UNC share path.

Example share path:

`\\192.168.3.150\AllMedia\Channels`

Recommendations:

- Share the Channels root folder (or the exact DVR recording root) from the storage host.
- Grant read permissions to all users/machines that will use WinChannels.
- Verify each user can browse the UNC path in Windows Explorer.

## Install

### Option 1: Use a Built Installer (recommended)

Install the generated Windows bundle:

- MSI: `src-tauri/target/release/bundle/msi/WinChannels_<version>_x64_en-US.msi`
- NSIS EXE: `src-tauri/target/release/bundle/nsis/WinChannels_<version>_x64-setup.exe`

### Option 2: Run from Source

1. Install prerequisites:
	- Node.js 20+
	- Rust toolchain (stable)
	- Visual Studio C++ Build Tools (for Tauri on Windows)
2. Clone repo and install dependencies:

```powershell
npm install
```

3. Start in development mode:

```powershell
npm run tauri dev
```

4. Build production bundles:

```powershell
npm run tauri build
```

## Configuration

Open Settings in the app and configure the following.

### 1) Channels DVR Server URL

- Field: `Channels DVR Server URL`
- Format: `http://<server-ip>:8089`
- Example: `http://192.168.3.150:8089`

Use the `Test Connection` button to confirm the app can reach your DVR and read shows/movies/episodes.

### 2) Storage Share Path (for SRT sidecars)

- Field: `Storage Share Path`
- Purpose: locate `.srt` files next to recordings
- Use a UNC path to your DVR storage root
- Example: `\\192.168.3.150\AllMedia\Channels`

Notes:

- Leave this blank to disable SRT sidecar loading.
- Broadcast captions can still work without a share path.
- The path is stored locally per user in app local storage.

## Caption Modes

The player exposes caption modes based on track availability:

- Off
- Broadcast (from stream text tracks)
- SRT (from sidecar subtitle file)

If both are available, you can switch between them from the player controls.

## Troubleshooting

### Start menu icon still old after update

If Windows shows an old icon after an upgrade:

- Install a newer app version (version bump helps refresh installer metadata)
- Re-pin the app in Start menu
- Ensure no stale duplicate shortcuts exist in user Start menu folders

### Can stream video but no SRT captions

- Verify `Storage Share Path` points to the correct DVR root share
- Confirm the `.srt` file exists next to the recording on disk
- Confirm current Windows user can read the share path

### Connection test fails

- Verify DVR server URL includes port (usually `8089`)
- Confirm server is reachable from the client machine
- Confirm firewall rules allow access

## Tech Stack

- Tauri 2
- React 19 + TypeScript + Vite
- Zustand for app state
- HLS.js for playback
- Tauri HTTP plugin for API requests

## License

No license file is currently included in this repository.
