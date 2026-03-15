# Wow Web Music Player v4 🎧⚡

Showcase-grade web music player on **Vite + React + TypeScript**, optimized for **GitHub Pages**.

- Dual-deck playback with smooth crossfade
- Upgraded loudness leveling with integrated-LUFS-style analysis (web-friendly, no heavy deps)
- Visual preset editor + JSON export/import
- Local music upload (multiple files, browser-only)
- Persistent settings in `localStorage`

![Screenshot](./docs/screenshot.png)

---

## Live Demo

- **GitHub Pages:** https://SDV-G-Deploy.github.io/wow-web-music-player/

---

## What’s new in v4

### 1) Loudness leveling upgrade
- Reworked loudness estimation to an integrated-LUFS-style approach with block gating (absolute + relative gate)
- Per-track compensation target around `-16 LUFS` with safe gain limits
- Keeps transition smoothness: crossfade ramps + micro-ramp safety for `crossfade=0`
- Lightweight and web-native (Web Audio API only)

### 2) Preset editor + JSON export/import
- Preset editor for key visual parameters:
  - palette (3 colors)
  - default FX intensity
  - motion multiplier
  - animation speed multiplier
- Export presets to JSON (`wwmp-presets-v4.json`)
- Import JSON back into the player

### 3) Upload your own music (local-only)
- `+ Add your music` button supports **multiple files**
- Supported formats (browser/codec dependent):
  - `.mp3`
  - `.wav`
  - `.ogg`
  - `.m4a`
- Files are never uploaded to server
- Added local tracks join the same queue and work with existing features:
  - crossfade
  - repeat/shuffle
  - visualizer
  - Media Session API (where browser supports it)
- Broken/unsupported files are skipped with readable status

### 4) UX/stability polish
- Added upload/progress status messages
- Preserved existing visual style and mobile layout
- Improved error handling around file validation/loading

---

## Privacy model

Local tracks are processed **only in your browser**:
- No backend upload
- No cloud analysis
- No server-side storage

Notes:
- Browser codec support varies by platform (especially `.m4a` and some `.ogg` variants)
- Very large files may analyze more slowly on low-power devices

---

## Features

- ▶️ Play / Pause
- ⏮ / ⏭ Previous / Next
- ⏱ Seek bar with current / total time
- 🔊 Volume slider
- 🎚 Crossfade slider (0–8s)
- 🔀 Shuffle
- 🔁 Repeat mode cycle (`off → all → one`)
- 🌈 Visual presets (`Neon / Calm / Club`)
- 🛠 Preset editor + export/import JSON
- 📁 Local music upload (multiple)
- ⌨️ Keyboard shortcuts:
  - `Space` — play/pause
  - `←/→` — seek ±5s
  - `N` / `P` — next/previous track
  - `S` — shuffle on/off
  - `R` — repeat mode cycle
  - `M` — mute/unmute

---

## Local run

```bash
git clone https://github.com/SDV-G-Deploy/wow-web-music-player.git
cd wow-web-music-player
npm install
npm run dev
```

Open: http://localhost:5173

---

## Build / preview

```bash
npm run build
npm run preview
```

---

## Deployment (GitHub Pages)

Workflow: `.github/workflows/deploy.yml`

1. Push to `main`
2. GitHub Actions runs `npm ci` + `npm run build`
3. Deploys `dist/` to GitHub Pages

---

## License

MIT — see [LICENSE](./LICENSE)
