# Android wrapper (Capacitor)

This folder contains native Android packaging for the main web app.

## Commands

```bash
npm ci || npm install
npm run sync
npm run build:debug
```

Debug APK path:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run sync` does:
1. Build root web project (`../dist`)
2. Copy web assets into `android-app/www`
3. Run `npx cap sync android`
