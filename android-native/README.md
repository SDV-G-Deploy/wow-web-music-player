# WOW Native Player (`android-native/`)

Итерация 3 нативного Android-плеера для `wow-web-music-player`.

## Что внутри

- Kotlin + Jetpack Compose (single-activity)
- Media3 ExoPlayer + `MediaSessionService`
- Сериализованный playback command pipeline + детерминированный state machine
- Persist playback-сессии (очередь/текущий трек/позиция/repeat/shuffle)
- Пользовательские плейлисты (create/rename/delete + add/remove треки)
- Fallback-логика для недоступных треков при restore и в runtime

## Итерация 3: основные изменения

### UX polish (легковесно)

- Чёткие состояния:
  - loading (`MediaStore scan` progress)
  - empty (библиотека/очередь/плейлисты)
  - error (inline + snackbar)
- Микроулучшения без тяжёлых эффектов:
  - быстрые playlist actions в библиотеке и очереди
  - repeat/shuffle controls в now playing
  - улучшенная читаемость карточек и списков
- Compose остаётся low-overhead (без тяжелых анимаций/сложных render-path).

### Плейлисты + persistence

- Плейлисты:
  - создание / переименование / удаление
  - добавление треков из библиотеки и очереди
  - удаление треков из плейлиста
  - запуск playback для всего плейлиста
- Persistence playback-сессии:
  - очередь
  - текущий индекс
  - позиция
  - режимы repeat/shuffle
- Восстановление после перезапуска:
  - restore с пропуском недоступных треков
  - безопасная очистка stale session, если всё недоступно
- Runtime fallback:
  - недоступный текущий трек автоматически удаляется из очереди,
  - playback безопасно продолжает следующий доступный трек.

## Качество

- Unit tests:
  - `PlaybackStateMachineTest`
  - `PlaylistMutationsTest`
  - `PlaybackSessionRestorePolicyTest`
- Instrumented smoke:
  - `SmokeUiTest` (launch + tabs reachability)

Локально:

```bash
cd android-native
./gradlew :app:testDebugUnitTest
./gradlew :app:assembleAndroidTest
./gradlew :app:assembleDebug
```

## Release pipeline (production-ready)

### Build env (локально/CI)

Release build требует env:

- `WOW_ANDROID_KEYSTORE_PATH`
- `WOW_ANDROID_KEYSTORE_PASSWORD`
- `WOW_ANDROID_KEY_ALIAS`
- `WOW_ANDROID_KEY_PASSWORD`

Gradle task `verifyReleaseSigningEnv` делает fail-fast с понятной ошибкой, если env не задан.

### GitHub Actions

- Debug: `.github/workflows/android-native-debug.yml`
  - artifact: `wow-native-player-debug-apk`
- Release: `.github/workflows/android-native-release.yml`
  - secrets:
    - `WOW_ANDROID_KEYSTORE_BASE64`
    - `WOW_ANDROID_KEYSTORE_PASSWORD`
    - `WOW_ANDROID_KEY_ALIAS`
    - `WOW_ANDROID_KEY_PASSWORD`
  - artifacts:
    - `wow-native-player-release-apk`
    - `wow-native-player-release-aab`

Если secrets отсутствуют, release workflow падает на первом шаге (`Validate signing secrets`) с явным fail-fast.

## Versioning / changelog

- Текущая версия: `0.3.0` (`versionCode = 3`)
- Changelog: `android-native/CHANGELOG.md`
- Итерационные отчёты:
  - `ITERATION_1.md`
  - `ITERATION_2.md`
  - `ITERATION_3.md`
