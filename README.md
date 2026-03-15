# Wow Web Music Player v5

Web music player on **Vite + React + TypeScript** with dual-deck playback, crossfade, visual presets, queue management v2, and local-only user playlists.

Live demo (Pages): **https://SDV-G-Deploy.github.io/wow-web-music-player/**

---

## Quick start

```bash
git clone https://github.com/SDV-G-Deploy/wow-web-music-player.git
cd wow-web-music-player
npm ci || npm install
npm run test:playback
npm run build
npm run preview
```

---

## What’s new in v5

### Playlist management v2
- Drag & drop queue reorder (desktop)
- Touch-friendly reorder on mobile (touch drag/drop target)
- Explicit fallback actions: move up/down buttons
- Remove any queue item (demo and local tracks)
- Destructive confirm for full queue clear

### User playlists (strictly local-only)
- Create playlist from current queue
- Add single queue tracks to an existing playlist (`+PL`)
- Rename / delete playlists
- Save playlists to `localStorage`
- Load playlist back to queue in one click
- Export / import playlists as JSON (`wwmp-user-playlists-v1.json`)

### UX & safety
- No server upload for playlists/files (browser local only)
- Confirm dialogs for destructive actions
- Toast-style status messages (`saved/imported/deleted/error`)
- Mobile-first compact layout preserved

---

## Existing v4 features preserved

- Dual-deck playback + crossfade (`0..8s`)
- Queue navigation, shuffle, repeat (`off/all/one`)
- Visual presets (`Neon`, `Calm`, `Club`) + preset editor
- Media Session metadata/actions
- Local file upload (`.mp3/.wav/.ogg/.m4a`, browser codec dependent)

---

## Keyboard shortcuts

- `Space` — play/pause
- `←` / `→` — seek `-5s / +5s`
- `N` — next track
- `P` — previous track
- `S` — shuffle on/off
- `R` — cycle repeat mode
- `M` — mute/unmute

---

## Deployment (GitHub Pages)

Push to `main` → workflow `.github/workflows/deploy.yml` builds and publishes `dist/`.

---

## Quality checks

```bash
npm ci || npm install
npm run test:playback
npm run build
npm run preview
```

---

## License

MIT (`LICENSE`)
