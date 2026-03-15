# Android Native — Iteration 1 Report

## Что сделано

1. **Новый проект `android-native/`**
   - Gradle Kotlin DSL
   - Compose setup
   - Media3 (ExoPlayer + Session)
   - app module с базовой архитектурой (MVVM/Clean-ish packages)

2. **Playback MVP локальных файлов**
   - SAF picker (`OpenMultipleDocuments`) для выбора локальных аудио
   - MediaStore scan (с runtime permission)
   - Очередь в памяти
   - Базовые команды: play/pause/next/prev/seek
   - Выбор трека из очереди

3. **Фон и notification controls**
   - `WowPlaybackService : MediaSessionService`
   - `MediaSession` + ExoPlayer
   - foreground media notification controls через Media3 provider

4. **UX минимум**
   - Экран библиотеки/добавления
   - Экран плеера
   - Пустые состояния для библиотеки/очереди
   - Snackbar для ошибок

5. **Надёжность (база)**
   - Без WebView пути
   - UI/service lifecycle разделены
   - Повторное подключение к service через `MediaController`
   - Логирование критических ошибок (`Log.e` / `Log.w`)

6. **CI**
   - Workflow для сборки debug APK и загрузки artifact

## Что НЕ сделано (честно)

- Нет persistence очереди/last session (Room пока не добавлен)
- Нет полноценного DI (Hilt/Koin)
- Нет unit/instrumentation тестов
- Нет shuffle/repeat/удаления/перестановки очереди
- Нет cover-art/богатых metadata
- Нет baseline profiles и perf-бенчмарков
- Нет релизного signing pipeline (только debug)

## Next steps (Iteration 2)

1. Добавить Room persistence для очереди и restore после restart
2. Вынести playback facade/use cases в более строгий Clean split
3. Расширить queue UX: remove/reorder/clear, repeat/shuffle
4. Добавить audio focus policy и устойчивый resume policy
5. Добавить базовые unit tests (queue/usecases/viewmodel)
6. Добавить visualizer light-mode (feature-flag + graceful fallback)
