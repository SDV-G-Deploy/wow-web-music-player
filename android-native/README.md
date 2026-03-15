# WOW Native Player (`android-native/`)

Итерация 2 нативного Android-плеера для `wow-web-music-player`.

## Что внутри

- Kotlin + Jetpack Compose (single-activity)
- Media3 ExoPlayer + MediaSessionService
- Детерминированная playback state machine + сериализованный command pipeline
- MVVM/Clean-ish каркас:
  - `core/model` — базовые модели (`Track`)
  - `data/library` — локальные источники (MediaStore + SAF URI mapping)
  - `domain/library` — use cases
  - `domain/player` — `PlayerViewModel`, state machine, UI state
  - `service` — foreground playback через `MediaSessionService`
  - `ui` — библиотека, плеер и очередь

## Reliability / lightweight baseline (итерация 2)

- Последовательная обработка команд (`next/prev/play/pause/seek`) без гонок
- Корректный `clear/reload` очереди через единый state reducer
- Восстановление состояния после reconnect/background/foreground
- Троттлинг дублирующихся playback-логов (без log spam)
- UI оптимизации:
  - seek теперь отправляется по `onValueChangeFinished` (меньше лишних вызовов)
  - ключи в `LazyColumn` для стабильных списков
  - ultra-light visualizer с режимом `OFF` по умолчанию

## UX

- Пустые состояния библиотеки/очереди без блокировок
- Понятные сообщения для неподдерживаемых/битых файлов
- Предсказуемые queue-controls: disabled prev/next на краях, clear queue

## Tests

- JVM unit tests: `PlaybackStateMachineTest`
- Compose instrumented smoke: `SmokeUiTest` (сборочный gate через `assembleAndroidTest`)

## Локальный запуск

Требования:
- JDK 17
- Android SDK (platform 35)

Сборка debug APK:

```bash
cd android-native
./gradlew :app:assembleDebug
```

Unit tests:

```bash
./gradlew :app:testDebugUnitTest
```

APK после сборки:

```text
android-native/app/build/outputs/apk/debug/app-debug.apk
```

## CI

Workflow: `.github/workflows/android-native-debug.yml`

Собирает:
- `:app:testDebugUnitTest`
- `:app:assembleAndroidTest`
- `:app:assembleDebug`

Публикует artifact:
- `wow-native-player-debug-apk`

## Документация итераций

- `android-native/ITERATION_1.md`
- `android-native/ITERATION_2.md`
