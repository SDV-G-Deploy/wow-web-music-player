# Android Native — Iteration 2 Report

## Что сделано

### 1) Playback reliability hardening

- Введена **детерминированная playback state machine** (`PlaybackStateMachine`) с явными событиями:
  - `ControllerConnectionChanged`
  - `QueueReplaced` / `QueueAppended` / `QueueCleared`
  - `Snapshot`
  - `Error` / `ResetError`
- Добавлен **сериализованный command pipeline** (`Channel` + single consumer) в `PlayerViewModel`:
  - команды `next/prev/play/pause/seek/clear/reload` идут последовательно,
  - убраны гонки между быстрыми нажатиями.
- Реализован `pendingCommands` буфер до подключения `MediaController`.
- Очередь при `clear/reload` теперь обновляется через единый reducer с инвариантами.
- Усилен resume сценарий:
  - `onHostStarted()` вызывает sync с `MediaController`,
  - при reconnect очередь и индекс восстанавливаются из session.
- Ошибки воспроизведения:
  - классификация причин (`unsupported/corrupted/file unavailable/decoder/io/unknown`),
  - троттлинг повторяющихся логов (без спама),
  - user-friendly сообщения в UI.

### 2) Lightweight performance baseline

- UI уменьшил лишние действия:
  - seek отправляется в плеер только на `onValueChangeFinished` (а не на каждый пиксель слайдера),
  - `LazyColumn` использует стабильные ключи (`track.id`),
  - периодический sync позиции адаптирован (реже вне Player-tab).
- Визуальные эффекты по умолчанию выключены:
  - добавлен `VisualizerMode.OFF` как default,
  - добавлен опциональный `ULTRA_LIGHT` режим визуализатора.

### 3) UX robustness

- Пустые/ошибочные состояния не блокируют интерфейс.
- Понятные сообщения об ошибках для проблемных треков.
- Queue controls стали предсказуемыми:
  - `prev/next` disabled на границах,
  - clear queue доступен отдельной кнопкой,
  - попытки вне диапазона дают понятное сообщение.

### 4) Tests / quality gates

- Добавлены **unit tests** для state transitions и queue invariants:
  - `PlaybackStateMachineTest`.
- Добавлен **instrumented smoke test**:
  - `SmokeUiTest` (launch + tab navigation).
- В CI добавлены шаги:
  - `:app:testDebugUnitTest`
  - `:app:assembleAndroidTest`
  - `:app:assembleDebug`

### 5) CI + docs

- Workflow debug APK для `android-native` сохранён и усилен (добавлены quality gates).
- Обновлён `android-native/README.md` под iteration 2.
- Добавлен этот отчёт `android-native/ITERATION_2.md`.

---

## Что НЕ сделано

- Нет persistence очереди/сессии в БД (Room) после полного process death.
- Нет real-time audio analyzer визуализатора (используется ultra-light синтетический режим).
- Instrumented tests пока только smoke-level (без полного playback-on-device сценария в CI).
- Нет baseline profile / macrobenchmark.

## Known limitations

- При полном убийстве процесса системой очередь не гарантированно сохраняется в storage.
- Ultra-light visualizer не использует реальную аудио-амплитуду (энергосберегающий компромисс).
- Сообщения ошибок зависят от `PlaybackException.errorCodeName`, точность ограничена качеством кода ошибки от decoder/источника.

## Next steps (Iteration 3)

1. Добавить persistence очереди и last-session restore (Room/DataStore).
2. Расширить queue UX: remove/reorder/shuffle/repeat.
3. Сделать фоновую telemetry-lite диагностику стабильности (агрегированные counters без спама).
4. Добавить baseline profile + macrobenchmark (startup, scroll, playback controls latency).
5. Расширить instrumented tests на сценарии:
   - SAF import → queue → play/pause/seek → background/foreground resume.
