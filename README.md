# Wow Web Music Player (pre-v5 stabilization)

Web music player on **Vite + React + TypeScript** with dual-deck playback, crossfade, visual presets, queue/shuffle/repeat, and local file upload.

Live demo (Pages): **https://SDV-G-Deploy.github.io/wow-web-music-player/**

---

## Quick start

### Local development

```bash
git clone https://github.com/SDV-G-Deploy/wow-web-music-player.git
cd wow-web-music-player
npm ci || npm install
npm run dev
```

Open: `http://localhost:5173`

### Production build + local preview

```bash
npm run build
npm run preview
```

By default preview is available at `http://localhost:4173`.

### GitHub Pages deploy

1. Push to `main`
2. GitHub Actions workflow `.github/workflows/deploy.yml` runs build
3. `dist/` is published to Pages

---

## Features

### Playback
- Play / pause
- Previous / next
- Progress seek bar
- Volume slider
- Crossfade `0..8s`
- Queue with click-to-jump
- Shuffle (preserve current track at queue head)
- Repeat: `off → all → one`

### Visuals
- Real-time visualizer (Web Audio Analyser)
- Presets: `Neon`, `Calm`, `Club`
- Preset editor:
  - 3 colors (C1/C2/C3)
  - default FX intensity
  - motion multiplier
  - animation multiplier
- Export presets to JSON
- Import presets from JSON

### Device integration
- Media Session metadata and position state
- Media Session actions (`play`, `pause`, `prev`, `next`) where supported

### Local music upload
- Multi-file upload (browser-only)
- Supported extensions (actual support depends on browser codecs):
  - `.mp3`
  - `.wav`
  - `.ogg`
  - `.m4a`

---

## Keyboard shortcuts

- `Space` — play/pause
- `←` / `→` — seek `-5s / +5s`
- `N` — next track
- `P` — previous track
- `S` — shuffle on/off
- `R` — cycle repeat mode
- `M` — mute/unmute (toggle with preset level)

---

## Local music upload: how-to

1. Click **Show advanced controls**
2. Press **+ Add your music**
3. Select one or multiple files
4. Wait for validation status text
5. Added tracks appear in queue and are fully playable with crossfade/modes

Notes:
- Files are not uploaded to any server.
- On unsupported codecs the file is skipped with error status.

---

## Presets editor + export/import

### Edit preset
1. Choose preset chip (`Neon/Calm/Club`)
2. Open advanced controls → **Preset editor**
3. Adjust C1/C2/C3, Motion, Animation, Default FX

### Export presets
- Click **Export JSON** to download `wwmp-presets-v4.json`

### Import presets
- Click **Import JSON** and choose previously exported file
- Invalid JSON/schema is rejected with user-friendly status

---

## Known limitations

- **Codec support is browser-dependent**: especially `.m4a` / some `.ogg` variants
- **Autoplay policy**: playback may require explicit user gesture before `audio.play()` succeeds
- **Media Session API** differences across browsers/OS (metadata artwork/actions may vary)
- **Very large local files** can take noticeable time for decode/loudness analysis on low-power devices

---

## Troubleshooting playback

### Next/Prev pressed but no sound
- Ensure at least one track is loaded and not blocked by codec compatibility
- Toggle play once after first interaction to satisfy autoplay policy
- Set crossfade to `0` and retry (helps isolate crossfade timing issues)

### Track switches but timeline freezes
- Re-open the tab and trigger playback with a click (resumes audio context)
- Check browser console for decode/media errors

### Imported files are skipped
- Confirm extensions are supported
- Try converting problematic files to `.mp3` or `.wav`

### Media keys not working
- Browser/OS may ignore Media Session handlers for background tabs
- Keep tab active and verify browser supports Media Session API

---

## Quality checks used in this repo

```bash
npm ci || npm install
npm run test:playback
npm run build
npm run preview
```

---

## License

MIT — see `LICENSE`
