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

### Android reliability hardening (follow-up)
- Playback transitions guarded by session/op tokens to prevent stale async state writes
- Deterministic queue reset flow after **Clear Queue** (full playback context reset)
- Autoplay handoff robustness for Next/Prev on mobile autoplay-policy constraints
- Visualizer quality switch: `off` / `light` / `full` (Android default `light`)

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

## Android app (offline local files) 📱

A dedicated Capacitor Android wrapper lives in **`android-app/`**.
It packages the same web UI into a native Android app and supports offline playback from phone files.

### What works offline

- Pick local audio files from Android storage using the system picker (SAF / `ACTION_OPEN_DOCUMENT` via `<input type="file">` in WebView)
- Build queue/playlist from selected files
- Playback without internet (play/pause, next/prev, seek, volume)

### Permissions model (Android)

- File selection is done through Android SAF picker, so **no broad storage permission is required** for normal flow.
- Existing manifest keeps only `INTERNET` (safe default for embedded web runtime).
- UX stays clean: user taps **"+ Add your music"** and chooses files directly.

### Build debug APK (Linux/macOS)

Prerequisites:
- Node.js 20+
- Java 21 (or compatible JDK supported by current Android Gradle plugin)
- Android SDK + `ANDROID_HOME` (for local builds)

From repo root:

```bash
npm ci || npm install
cd android-app
npm ci || npm install
npm run build:debug
```

Debug APK output:

```text
android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

### Release signing setup (local)

Create keystore (example):

```bash
keytool -genkeypair \
  -v \
  -keystore release-keystore.jks \
  -alias release \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Provide signing values in one of these ways:

1) Environment variables
```bash
export ANDROID_KEYSTORE_PATH="/absolute/path/to/release-keystore.jks"
export ANDROID_KEYSTORE_PASSWORD="***"
export ANDROID_KEY_ALIAS="release"
export ANDROID_KEY_PASSWORD="***"
```

2) Local file (gitignored): `android-app/android/keystore.properties`
```properties
ANDROID_KEYSTORE_PATH=/absolute/path/to/release-keystore.jks
ANDROID_KEYSTORE_PASSWORD=***
ANDROID_KEY_ALIAS=release
ANDROID_KEY_PASSWORD=***
```

### Build signed release APK / AAB

From repo root:

```bash
npm run android:release:apk
npm run android:release:aab
```

Or directly in `android-app/`:

```bash
npm run build:release:apk
npm run build:release:aab
```

Release outputs:

```text
android-app/android/app/build/outputs/apk/release/app-release.apk
android-app/android/app/build/outputs/bundle/release/app-release.aab
```

### GitHub Actions release workflow + secrets

Workflow: `.github/workflows/android-release.yml`

Required repository secrets:
- `ANDROID_KEYSTORE_BASE64` — base64 of `release-keystore.jks`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Generate base64 (Linux/macOS):

```bash
base64 -w 0 release-keystore.jks
```

The workflow fails fast with explicit error messages if any signing secret is missing.

### Install release APK to phone

Using ADB:

```bash
adb install -r android-app/android/app/build/outputs/apk/release/app-release.apk
```

Or manually:
1. Copy `app-release.apk` to phone
2. Open it in file manager
3. Allow installation from unknown sources (one-time)
4. Install

### Daily Android workflow for developers

```bash
cd android-app
npm run sync        # rebuild web + sync into Android project
npm run build:debug # create debug APK
```

### Android troubleshooting

1) **New debug APK doesn't install over previous build (conflict/package issue)**
- Debug flavor now uses `applicationIdSuffix ".debug"` (`com.sdv.wowmusicplayer.debug`) to avoid collisions with release app.
- For predictable debug-over-debug updates from CI, set repository secret `ANDROID_DEBUG_KEYSTORE_BASE64` (base64 of one stable debug keystore).
- If old APK was signed with another key, Android will block update: uninstall old debug app once, then install new one.
- Release APK and debug APK are different signing flows; they are not interchangeable updates.

2) **MP3 shown as unsupported/unknown on Android picker**
- Picker MIME can be empty/`application/octet-stream`; app now validates by extension + MIME + decode probe.
- Error now includes filename and MIME/type details to quickly spot broken files/codecs.

3) **After Next/Prev playback sometimes does not start on Android**
- Playback state-machine now uses operation/session guards to reject stale async transitions.
- Android path now uses deterministic same-deck handoff (no risky deck swap autoplay race), with fallback if policy blocks secondary deck.
- If playback was never user-started in this app session, Android WebView may still require one explicit Play tap (platform policy).

4) **After Clear Queue + re-load old tracks could still play**
- Clear Queue now performs full playback-context reset: active/standby deck sources, current index refs, transition ops/session, loudness cache, history.
- Local object URLs from previous imports are revoked and local library is reset to demo-only baseline.
- New imports build queue indexes from the current post-reset library only, so stale old tracks cannot be reused by accident.

5) **Visualizer lag on Redmi / low-end Android devices**
- Visualizer is now quality-profiled: `off` / `light` / `full`.
- Android default = `light` (ultra-light profile: reduced bars, reduced FPS, DPR cap, throttled FX updates).
- No React `setState` inside rAF for audio-energy cosmetics (CSS variables are updated directly).
- Visual loops pause in background and resume only when app returns to foreground.

6) **Slow resume after backgrounding app**
- Visualizer/progress/loudness loops pause when app is hidden and resume cleanly on foreground.
- AudioContext is suspended/resumed instead of full heavy reinit.

---

## Known Android constraints

- WebView autoplay is still platform-controlled. First playback in a fresh app process may require one explicit user gesture.
- `full` visualizer quality can be expensive on mid-range phones; prefer `light` for daily use.
- Very large local libraries may increase memory pressure in WebView; add tracks in smaller batches if needed.

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
