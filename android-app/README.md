# Android wrapper (Capacitor)

This folder contains native Android packaging for the main web app.

## Commands

```bash
npm ci || npm install
npm run sync
npm run build:debug
npm run build:release:apk
npm run build:release:aab
```

Debug APK path:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Release outputs:

```text
android/app/build/outputs/apk/release/app-release.apk
android/app/build/outputs/bundle/release/app-release.aab
```

`npm run sync` does:
1. Build root web project (`../dist`)
2. Copy web assets into `android-app/www`
3. Run `npx cap sync android`

---

## Release signing (secure local setup)

Release build requires signing values:
- `ANDROID_KEYSTORE_PATH`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Resolution priority in Gradle:
1. Environment variables
2. Gradle properties (`~/.gradle/gradle.properties` or project properties)
3. Local file `android/keystore.properties` (gitignored)

### Option A: local `keystore.properties`

```bash
cd android
cp keystore.properties.example keystore.properties
# edit with real values
```

### Option B: environment variables

```bash
export ANDROID_KEYSTORE_PATH="/absolute/path/to/release-keystore.jks"
export ANDROID_KEYSTORE_PASSWORD="***"
export ANDROID_KEY_ALIAS="release"
export ANDROID_KEY_PASSWORD="***"
```

If signing config is missing, `assembleRelease`/`bundleRelease` will fail with a clear error.
