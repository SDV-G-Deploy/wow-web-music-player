# ANDROID_NATIVE_PLAN.md

## Executive Summary (1 экран)

Цель: перейти с неудачного WebView/Capacitor подхода на **чисто нативный Android-аудиоплеер** (Kotlin + Jetpack Compose + Media3/ExoPlayer), чтобы получить предсказуемую производительность, устойчивую работу в фоне и UX уровня «системного плеера».

Реалистичный масштаб для 1–2 разработчиков: **8–10 недель до MVP**, плюс 2 недели стабилизации/релизной полировки. План построен так, чтобы уже с Sprint 1 получить «сквозной» прототип (play/pause/seek + foreground service), а затем итеративно добирать библиотеку, очередь, lockscreen controls, визуализатор с деградацией и качество.

Ключевая архитектура:
- UI: Jetpack Compose (single-activity)
- Playback engine: Media3 ExoPlayer
- Background: `MediaSessionService` + `MediaSession` + media notification
- State management: MVVM + `StateFlow`/`SharedFlow`, unidirectional data flow
- Data: Room (очередь/метаданные/настройки), MediaStore + SAF
- Модульность: `app`, `core:player`, `core:data`, `feature:library`, `feature:nowplaying`, `feature:queue`, `feature:settings`, `benchmark`

MVP-функции: локальная библиотека (MediaStore + SAF fallback), очередь, play/pause/next/prev/seek, фон/блокировка экрана, офлайн-режим (локальные файлы), стабильность на средних девайсах (Redmi Note 12 Pro класс).

Performance-first подход:
- целевые метрики (startup/resume/frame drops/battery)
- baseline profiles + macrobenchmark
- профилирование (Perfetto, JankStats, Android Studio Profiler)
- бюджеты производительности по critical user flows.

Результат MVP: подписанный release APK/AAB, CI/CD на GitHub Actions, Crash reporting + privacy-safe аналитика, test suite (unit/integration/UI + smoke на минимальном наборе устройств), и понятный план миграции из текущего репо без потери артефактов.

---

## 1) Scope и реалистичная оценка (1–2 разработчика)

### Команда и допущения
- **1 dev full-time**: 10–12 недель до production-ready MVP.
- **2 dev (1 full-time + 1 part-time ~50%)**: 8–10 недель до production-ready MVP.
- QA выделенного нет: разработчики закрывают тестирование и smoke/regression.

### Фазный план по времени
- **Phase A — Foundation (1.5–2 недели)**
- **Phase B — Core playback + library MVP (2–3 недели)**
- **Phase C — UX hardening + visualizer + perf (2 недели)**
- **Phase D — QA, release infra, rollout prep (1.5–2 недели)**
- **Buffer/risks (1 неделя)**

Итого: **8–10 недель** (или до 12 при одном разработчике и параллельных задачах по инфраструктуре).

---

## 2) Архитектура: Kotlin + Compose + Media3, MVVM/Clean-ish

## 2.1 High-level

```text
[UI Compose]
  -> ViewModel (StateFlow + Intents/Actions)
    -> Domain UseCases
      -> Repositories (Library, Queue, PlaybackState, Settings)
        -> Data Sources:
           - MediaStore/SAF scanner
           - Room DB
           - Media3 PlayerAdapter (ExoPlayer + MediaSession)
```

Принципы:
- Single source of truth для playback state в `core:player`.
- UI не работает напрямую с ExoPlayer.
- Любые команды (play/pause/seek/skip) идут через use cases.
- `Service` живет отдельно от UI lifecycle; UI безопасно реконнектится после kill/recreate.

## 2.2 Модульная структура

```text
android-native/
  app/                        // wiring, nav host, DI graph
  core/common/                // Result wrappers, dispatchers, utils
  core/model/                 // Track, Album, Artist, QueueItem, PlaybackState
  core/data/                  // repositories impl, Room, MediaStore/SAF sources
  core/player/                // ExoPlayer wrapper, MediaSessionService, notif
  feature/library/            // library screens + vm
  feature/nowplaying/         // player screen + vm + visualizer integration
  feature/queue/              // queue screen + vm
  feature/settings/           // toggles (visualizer mode, battery saver, etc.)
  benchmark/                  // macrobenchmark + baseline profiles
```

## 2.3 Управление состоянием
- `StateFlow<NowPlayingUiState>` для экранов.
- `SharedFlow<UiEvent>` для one-shot событий (snackbar/permissions prompt).
- Playback state model: `isPlaying`, `positionMs`, `durationMs`, `bufferedMs`, `repeatMode`, `shuffle`, `audioSessionId`, `queueSnapshot`.
- Tick обновление позиции: throttled (например, 250ms в active state; 1s в background UI).

## 2.4 Playback Service
- Реализация через `MediaSessionService` (Media3).
- Внутри сервиса: `ExoPlayer` + `MediaSession` + notification provider.
- Поддержка:
  - lockscreen controls,
  - bluetooth headset media buttons,
  - Android Auto readiness (базовая совместимость через MediaSession commands).
- Service foreground когда есть playback/active queue.

---

## 3) MVP фичи (строго приоритетно)

## 3.1 Локальная библиотека
- Основной источник: `MediaStore` (аудио в shared storage).
- SAF fallback для пользовательских папок/SD-card при ограничениях OEM.
- Сканер метаданных:
  - title/artist/album/duration/uri,
  - кеш обложек (coil + thumbnail strategy).
- Обработка runtime permissions (Android 13+: `READ_MEDIA_AUDIO`, старые API: `READ_EXTERNAL_STORAGE`).

## 3.2 Очередь и управление воспроизведением
- Dynamic queue model (append/remove/reorder).
- Основные действия: play/pause/next/prev/seek + seek bar.
- Repeat/shuffle — в MVP можно включить базово, но без сложных smart-режимов.
- Persist last session queue/state в Room (восстановление после restart).

## 3.3 Фон, lockscreen, notification
- Media style notification c actions.
- Lockscreen metadata + controls через MediaSession.
- Обработка audio focus (duck/pause on calls, resume policy по настройке).

## 3.4 Offline
- MVP ориентирован на локальные файлы => офлайн «из коробки».
- Без сетевого стриминга в первой версии (снижает риски).

## 3.5 Стабильность на средних девайсах
- Target hardware baseline: Redmi Note 12 Pro класс (6–8GB RAM, mid SoC).
- Ограничить тяжелые анимации, избегать лишних recomposition.
- Визуализатор адаптивный (см. раздел 4).

---

## 4) Визуализатор: реалистичная стратегия без лагов

## 4.1 Что реально делать нативно
Практичный вариант для MVP:
1. Получение аудио-данных через `android.media.audiofx.Visualizer` (по `audioSessionId`) или lightweight amplitude proxy.
2. Рендер в Compose Canvas (или Android View interop, если Canvas bottleneck).
3. Простые режимы: bars / waveform-lite, без FFT-heavy эффектов и blur/particle overload.

## 4.2 Режимы деградации (graceful)
- **OFF**: визуализатор выключен (минимум CPU/GPU).
- **LIGHT**: 15–24 FPS, low bin count (например, 24–32), упрощенный рендер.
- **FULL**: 30 FPS, 48–64 bins, сглаживание + простые цветовые переходы.

Автопереключение:
- Battery saver ON -> OFF/LIGHT.
- Thermal throttling / sustained jank -> LIGHT/OFF.
- Screen off / app in background -> OFF.

## 4.3 Критерии отключения
Отключать или понижать режим при:
- jank > 8% кадров за окно 30s,
- dropped frames burst > 5 подряд на now playing,
- CPU app process > 18–20% sustained при playback,
- заметный рост drain (>8%/час только на playback+visualizer, экран 50%).

---

## 5) UX + Performance: метрики и budget

## 5.1 Target метрики MVP
- Cold startup до interactive: **< 1.8s** (mid device).
- Resume из background: **< 700ms**.
- Play command latency (tap -> audible): **< 120ms** (локальный файл).
- Seek responsiveness: визуальный отклик **< 100ms**, audio settle **< 250ms**.
- Frame drops на now playing: **< 3%** при LIGHT visualizer, **< 5%** при FULL.
- Battery drain: playback screen-on (50% brightness, LIGHT viz) **≤ 6–8%/час**.

## 5.2 Профилирование
- Macrobenchmark сценарии:
  1) app startup,
  2) open library -> open track -> play,
  3) now playing + seek + next.
- Baseline Profiles generation в CI.
- Perfetto trace на low/mid device для playback + UI stress.
- JankStats + frame metrics логирование в debug builds.

## 5.3 Performance budget
- Main thread long tasks: < 16ms (цель), пики >32ms не чаще 1/5s.
- Recomposition budget: избегать full-screen recomposition по каждому playback tick.
- I/O budget: сканирование медиатеки в фоне (WorkManager/Coroutine IO), UI не блокируется.

---

## 6) Технические риски и снижение

1. **Фрагментация Android/OEM behavior**
   - Митигировать: ранний smoke на 2–3 брендах, feature flags, conservative defaults.

2. **MediaStore/SAF edge-cases (SD-card, permissions revoke)**
   - Митигировать: robust permission state machine + recovery UX.

3. **Service kill/background restrictions**
   - Митигировать: корректный foreground lifecycle, sticky notification, restore queue.

4. **Visualizer нестабилен на части устройств**
   - Митигировать: OFF by default на low-tier, runtime health monitor, fallback режим.

5. **Regressions при рефакторинге playback state**
   - Митигировать: contract tests для player facade + integration tests с fake media source.

6. **Рост scope (feature creep)**
   - Митигировать: жесткий MVP gate (см. DoD), backlog freeze после Sprint 2.

---

## 7) Тестовая стратегия

## 7.1 Unit tests
- UseCases: queue operations, restore session, playback commands routing.
- Repository logic: media mapping, filtering, sorting.
- ViewModels: state transitions, event emission.

## 7.2 Integration tests
- `core:player` + fake audio source: play/pause/seek/next behavior.
- DB + repository integration: queue persistence/recovery.
- Service lifecycle test: reconnect UI to ongoing session.

## 7.3 UI tests (Compose)
- Library list render + item click to play.
- NowPlaying controls respond correctly.
- Queue reorder/remove basic flows.

## 7.4 Минимальный device matrix (smoke/regression)
Минимум 3 устройства/профиля:
1. **Mid Android 13/14 physical** (Redmi Note 12 Pro класс) — primary target.
2. **Samsung A-серия physical** (OneUI behavior).
3. **Pixel emulator/physical** (чистый Android reference).

Regression перед релизом:
- 30–60 минут непрерывного playback,
- screen on/off, app background/foreground, headset controls.

---

## 8) Release стратегия

## 8.1 Signing
- Debug keystore для dev builds.
- Release keystore хранить в защищенном secret storage (не в repo).
- Поддержка `local.properties`/env-based signing config.

## 8.2 CI/CD (GitHub Actions)
Pipeline:
1. `lint + detekt + unit tests`
2. `assembleDebug`
3. `macrobenchmark smoke` (optional nightly)
4. `assembleRelease` (tag/release branch)
5. Upload artifacts: APK (internal), AAB (release candidate)

Artifacts:
- debug APK per PR,
- signed release APK/AAB для релизных тегов.

## 8.3 Versioning
- SemVer-ish: `MAJOR.MINOR.PATCH` + build number (`versionCode`).
- Tag convention: `v0.1.0-mvp-rc1` и т.д.

## 8.4 Crash reporting + analytics (privacy-safe)
- Crash reporting: Firebase Crashlytics или Sentry (без PII).
- Basic analytics (opt-in, агрегированные):
  - app start,
  - playback start/stop,
  - feature toggle usage (visualizer mode),
  - error categories.
- Не отправлять названия треков/пути файлов/личные метаданные.

---

## 9) План миграции/интеграции с текущим репо

## 9.1 Структура в репо
Рекомендация: сохранить старый проект, добавить новый нативный в отдельной директории.

```text
/
  ANDROID_NATIVE_PLAN.md
  android-native/            # новый основной проект
  legacy-web-player/         # архив текущего WebView/Capacitor
  docs/
    migration-notes.md
```

Если текущий web-проект уже в корне:
- Переместить в `legacy-web-player/` без удаления истории.
- Добавить README с причиной архивации и статусом support-only.

## 9.2 Что оставить от старого web-плеера
Оставить:
- UX заметки/прототипные решения (документация),
- ассеты/иконки/брендовые элементы,
- сценарии пользовательских тестов и known issues.

Архивировать/не переносить напрямую:
- WebView-specific playback code,
- JS/CSS performance hacks,
- bridge-логика Capacitor.

## 9.3 Переходный период
- 1–2 спринта параллельно поддерживать legacy только критическими фиксами.
- Новый development только в `android-native/`.
- После MVP: legacy read-only.

---

## 10) Sprint roadmap

## Sprint 0 (1 неделя) — Foundation
- Создать `android-native` проект и модули.
- Настроить DI, build variants, quality gates (ktlint/detekt).
- Поднять `MediaSessionService` skeleton + ExoPlayer facade.
- CI baseline: build + unit tests + debug artifact.

**Exit criteria**: app запускается, service поднимается, тестовый локальный трек играет.

## Sprint 1 (2 недели) — Core Playback + Library v1
- MediaStore scan + permission flow.
- Library screen (list/search basic).
- NowPlaying screen: play/pause/seek/next/prev.
- Queue базовая (append/replace).

**Exit criteria**: end-to-end playback из локальной библиотеки с базовой очередью.

## Sprint 2 (2 недели) — Background/Lockscreen + Stability
- Полноценный MediaSession + notification controls.
- Restore queue/state после process death.
- Audio focus, noisy intent (наушники отключены), headset keys.
- Compose performance pass + baseline profile v1.

**Exit criteria**: стабильное фоновое воспроизведение + lockscreen controls.

## Sprint 3 (1.5–2 недели) — Visualizer + Perf hardening
- Реализовать visualizer OFF/LIGHT/FULL.
- Автодеградация по battery/jank.
- Macrobenchmark + Perfetto анализ, оптимизации.

**Exit criteria**: visualizer не ломает UX, target метрики близко к бюджету.

## Sprint 4 (1.5–2 недели) — QA + Release candidate
- Regression pass на device matrix.
- Crash reporting/analytics интеграция.
- Signing, release pipeline, RC build.
- Bugfix freeze + MVP DoD check.

**Exit criteria**: готовый подписанный APK/AAB, checklist DoD закрыт.

---

## 11) Definition of Done (MVP checklist)

### Functional
- [ ] Локальная библиотека (MediaStore + SAF fallback) работает стабильно.
- [ ] Play/Pause/Next/Prev/Seek работают из UI, notification, lockscreen.
- [ ] Очередь поддерживает add/remove/reorder и восстановление сессии.
- [ ] Фоновое воспроизведение устойчиво при сворачивании/блокировке.
- [ ] Оффлайн работа подтверждена (без сети).

### Non-functional
- [ ] Target метрики startup/resume/latency в пределах budget (или documented exception).
- [ ] На Redmi Note 12 Pro классе нет критичных лагов/ANR в базовых сценариях.
- [ ] Visualizer имеет OFF/LIGHT/FULL + auto degrade + safe disable.
- [ ] Нет blocker/crash в 60-минутном playback smoke.

### Quality
- [ ] Unit test coverage ключевых use cases/VM > agreed threshold (например, 50%+ в core).
- [ ] Integration тесты для player facade и queue persistence проходят.
- [ ] UI smoke tests на ключевых экранах проходят.

### Release/Ops
- [ ] CI собирает debug/release, публикует артефакты.
- [ ] Release signing настроен безопасно.
- [ ] Crash reporting и privacy-safe analytics подключены.
- [ ] CHANGELOG и release notes подготовлены.

---

## 12) Fast-start backlog (первые 10 задач)

1. Создать `android-native` multi-module skeleton.
2. Поднять `core:player` с ExoPlayer + MediaSessionService.
3. Описать доменные модели Track/Queue/PlaybackState.
4. Реализовать permission gateway для MediaStore/SAF.
5. Реализовать MediaStore scanner + mapping.
6. Сделать Library screen (Compose) + VM.
7. Сделать NowPlaying screen + control intents.
8. Добавить Room persistence для queue/session.
9. Включить media notification + lockscreen metadata/actions.
10. Подключить macrobenchmark + baseline profile generation.

---

## 13) Что сознательно вне MVP
- Онлайн-стриминг сервисы (Spotify/YouTube/радио API).
- Продвинутый эквалайзер/DSP.
- Кроссфейд и gapless tuning «audiofile-grade».
- Сложные визуальные эффекты (3D, heavy shaders).
- Cloud sync аккаунтов/плейлистов.

Это защищает сроки и качество первой рабочей версии.
