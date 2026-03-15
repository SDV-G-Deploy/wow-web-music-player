# Android Native — Iteration 3 Report

## Done

### 1) UX polish (lightweight)

- Добавлены аккуратные состояния:
  - loading для MediaStore scan,
  - error (inline + snackbar),
  - empty states для библиотеки/очереди/плейлистов.
- Улучшена читаемость UI:
  - более чёткие action-зоны,
  - быстрые playlist actions прямо из библиотеки и очереди,
  - repeat/shuffle controls в now playing.
- Сохранён low-overhead Compose-подход:
  - без тяжёлых анимаций,
  - без дорогих визуальных эффектов по умолчанию.

### 2) Плейлисты и persistence

- Реализованы пользовательские плейлисты:
  - create / rename / delete,
  - add/remove tracks,
  - play all tracks from playlist.
- Реализован persistence playback-сессии:
  - queue,
  - current track index,
  - position,
  - repeat mode,
  - shuffle mode.
- Реализовано восстановление после перезапуска приложения:
  - восстановление очереди/позиции,
  - skip недоступных треков при restore,
  - очистка stale session если все треки недоступны.
- Безопасный runtime fallback:
  - при file-unavailable текущий трек удаляется из очереди,
  - playback продолжается безопасно.

### 3) Release readiness

- Добавлен release signing через env (`WOW_ANDROID_*`) в Gradle.
- Добавлен fail-fast task: `verifyReleaseSigningEnv`.
- Добавлен GitHub Actions workflow:
  - `.github/workflows/android-native-release.yml`
  - signed release APK + AAB artifacts.
- Документация релиза обновлена в `android-native/README.md`.
- Добавлен `android-native/CHANGELOG.md`.
- Версия обновлена до `0.3.0` (`versionCode = 3`).

### 4) Качество

- Unit tests добавлены/обновлены:
  - `PlaybackStateMachineTest` (extended repeat/shuffle snapshot assertions),
  - `PlaylistMutationsTest`,
  - `PlaybackSessionRestorePolicyTest`.
- Smoke checks:
  - `SmokeUiTest` обновлён (tabs reachability including Playlists).
- Debug workflow не ломался: `android-native-debug.yml` по-прежнему основной gate.

## Not done

- Нет drag&drop reorder внутри плейлиста/очереди.
- Нет import/export плейлистов.
- Нет полной instrumented проверки реального audio restore (в CI без device-farm).
- Нет baseline profile/macrobenchmark (перенесено в итерацию 4).

## Known limitations

- Проверка доступности трека опирается на URI-доступ (`content/file`) и может зависеть от OEM-ограничений.
- Very large playlists пока без отдельной виртуализации detail-блока beyond базового LazyColumn.
- Session restore intentionally стартует в paused mode (без auto-resume воспроизведения).

## Test checklist

### Local

- [ ] `./gradlew :app:testDebugUnitTest`
- [ ] `./gradlew :app:assembleAndroidTest`
- [ ] `./gradlew :app:assembleDebug`
- [ ] Ручная проверка:
  - [ ] создать/переименовать/удалить плейлист,
  - [ ] добавить/удалить треки,
  - [ ] закрыть приложение и проверить restore queue/index/position,
  - [ ] проверить repeat/shuffle restore,
  - [ ] проверить fallback при недоступном треке.

### CI

- [ ] Debug workflow success + APK artifact.
- [ ] Release workflow validated:
  - success при наличии secrets,
  - fail-fast с понятной ошибкой при отсутствии secrets.

## Next steps (Iteration 4)

1. Drag&drop reorder для очереди и плейлистов.
2. Room/DataStore migration с versioned schema для playlist/session persistence.
3. Instrumented playback-restore сценарии на device-farm.
4. Baseline profile + macrobenchmark для startup/seek/queue interactions.
5. Тонкая UX-полировка accessibility (контраст, touch targets, semantics labels).