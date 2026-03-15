# Wow Web Music Player v3 🎧⚡

Showcase-grade web music player on **Vite + React + TypeScript**, optimized for **GitHub Pages**.

- Gapless-ready dual-deck playback + crossfade compatibility
- Adaptive loudness leveling (perceived loudness balancing, no hard compression)
- Visual presets: **Neon / Calm / Club**
- Persistent user settings in `localStorage`
- Installable PWA + Media Session API support

![Screenshot](./docs/screenshot.png)

![Demo GIF](./docs/demo.gif)

---

## Live Demo

- **GitHub Pages:** https://SDV-G-Deploy.github.io/wow-web-music-player/

---

## What’s new in v3

### 1) Gapless + loudness leveling
- Improved deck prewarming to minimize click/gap artifacts between tracks
- Keeps compatibility with existing crossfade engine (0–8s)
- Adds soft safety micro-ramp even with `crossfade=0` to reduce transition clicks
- Per-track adaptive loudness compensation (light touch, no aggressive compression)

### 2) Visual presets
- Added 3 presets:
  - **Neon** (balanced motion)
  - **Calm** (gentler palette + lower default intensity)
  - **Club** (high-energy palette + stronger default intensity)
- Preset changes:
  - palette colors
  - background/aurora motion behavior
  - default FX intensity

### 3) Persistence + migration
- Saved to `localStorage`:
  - preset
  - FX intensity
  - crossfade
  - repeat mode
  - volume
- Includes safe fallback/migration behavior for users without v3 data yet

### 4) UX polishing
- Added explicit loading state during track transitions
- Added graceful empty queue state
- Micro-animations tuned for responsiveness (with `prefers-reduced-motion` fallback)
- Improved accessibility labels (`aria-label`) for key controls

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
- ✨ Beat-reactive FX with intensity control
- ⌨️ Keyboard shortcuts:
  - `Space` — play/pause
  - `←/→` — seek ±5s
  - `N` / `P` — next/previous track
  - `S` — shuffle on/off
  - `R` — repeat mode cycle
  - `M` — mute/unmute

---

## Tech Stack

- React 19
- TypeScript
- Vite 8
- Web Audio API (analyser + gain staging + crossfade)
- Media Session API
- Service Worker + Web App Manifest
- GitHub Actions (Pages deploy)

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

## Demo audio generation

Demo tracks are generated locally (copyright-safe synthesis):

```bash
npm run generate:audio
```

Script: `scripts/generate-demo-audio.mjs`

---

## Deployment (GitHub Pages)

Workflow: `.github/workflows/deploy.yml`

1. Push to `main`
2. GitHub Actions runs `npm ci` + `npm run build`
3. Deploys `dist/` to GitHub Pages

This project keeps GitHub Pages compatibility via dynamic Vite `base` in `vite.config.ts`.

---

## License

MIT — see [LICENSE](./LICENSE)
