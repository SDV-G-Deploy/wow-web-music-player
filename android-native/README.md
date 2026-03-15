# WOW Native Player (`android-native/`)

Итерация 1 нативного Android-плеера для `wow-web-music-player`.

## Что внутри

- Kotlin + Jetpack Compose (single-activity)
- Media3 ExoPlayer + MediaSessionService
- MVVM/Clean-ish каркас:
  - `core/model` — базовые модели (`Track`)
  - `data/library` — локальные источники (MediaStore + SAF URI mapping)
  - `domain/library` — use cases
  - `domain/player` — `PlayerViewModel` + UI state
  - `service` — foreground playback через `MediaSessionService`
  - `ui` — экран библиотеки/добавления и экран плеера/очереди

## MVP flow (итерация 1)

1. На экране **Библиотека**:
   - `SAF picker` — выбрать локальные файлы (`audio/*`)
   - `MediaStore` — просканировать системную библиотеку
2. Добавленные треки попадают в очередь в памяти.
3. На экране **Плеер**:
   - play/pause
   - next/prev
   - seek
   - выбор трека из текущей очереди
4. Воспроизведение держится в фоне через `MediaSessionService` + media notification.

## Локальный запуск

Требования:
- JDK 17
- Android SDK (platform 35)

Сборка debug APK:

```bash
cd android-native
./gradlew :app:assembleDebug
```

APK после сборки:

```text
android-native/app/build/outputs/apk/debug/app-debug.apk
```

## CI

Workflow: `.github/workflows/android-native-debug.yml`

Собирает `:app:assembleDebug` и публикует artifact:
- `wow-native-player-debug-apk`

## Документация итерации

См. `android-native/ITERATION_1.md` (сделано / не сделано / шаги итерации 2).
