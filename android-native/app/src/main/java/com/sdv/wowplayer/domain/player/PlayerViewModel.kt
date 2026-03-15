package com.sdv.wowplayer.domain.player

import android.app.Application
import android.content.ComponentName
import android.net.Uri
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.sdv.wowplayer.core.model.TRACK_EXTRA_DURATION_MS
import com.sdv.wowplayer.core.model.TRACK_EXTRA_URI
import com.sdv.wowplayer.core.model.Track
import com.sdv.wowplayer.core.model.toMediaItem
import com.sdv.wowplayer.data.library.LocalAudioRepository
import com.sdv.wowplayer.data.persistence.PlaybackSessionStore
import com.sdv.wowplayer.data.persistence.PlaylistStore
import com.sdv.wowplayer.domain.library.GetMediaStoreTracksUseCase
import com.sdv.wowplayer.domain.library.GetSafTracksUseCase
import com.sdv.wowplayer.domain.playlist.PlaylistMutations
import com.sdv.wowplayer.domain.playlist.UserPlaylist
import com.sdv.wowplayer.service.WowPlaybackService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

@UnstableApi
class PlayerViewModel(
    application: Application
) : AndroidViewModel(application), Player.Listener {

    private val repository = LocalAudioRepository(application.applicationContext)
    private val playlistStore = PlaylistStore(application.applicationContext)
    private val sessionStore = PlaybackSessionStore(application.applicationContext)

    private val getMediaStoreTracks = GetMediaStoreTracksUseCase(repository)
    private val getSafTracks = GetSafTracksUseCase(repository)

    private val stateMachine = PlaybackStateMachine<Track>()
    private val machineMutex = Mutex()
    private var machineState = PlaybackMachineState<Track>()

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState = _uiState.asStateFlow()

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var mediaController: MediaController? = null

    private val commandChannel = Channel<PlaybackCommand>(capacity = Channel.UNLIMITED)
    private val pendingCommands = ArrayDeque<PlaybackCommand>()

    private var positionTicker: Job? = null
    private var commandProcessor: Job? = null
    private var persistSessionJob: Job? = null
    private var isPlayerScreenVisible = false

    private var sessionRestoreAttempted = false
    private var isHydratingSession = false
    private var lastPersistedSession: PlaybackSessionSnapshot? = null

    private var lastLoggedErrorSignature: String? = null
    private var lastLoggedErrorAtMs: Long = 0L

    init {
        startCommandProcessor()
        connectControllerIfNeeded()
        startPositionTicker()
        loadPersistedPlaylists()
    }

    fun onHostStarted() {
        connectControllerIfNeeded()
        enqueueCommand(PlaybackCommand.SyncFromController)
    }

    fun onHostStopped() {
        Log.d(TAG, "UI host stopped - playback continues in MediaSessionService")
    }

    fun setPlayerScreenVisible(visible: Boolean) {
        isPlayerScreenVisible = visible
    }

    fun loadMediaStoreLibrary() {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoadingLibrary = true,
                    libraryErrorMessage = null,
                    errorMessage = null
                )
            }
            getMediaStoreTracks()
                .onSuccess { tracks ->
                    _uiState.update {
                        it.copy(
                            libraryTracks = tracks,
                            isLoadingLibrary = false,
                            libraryErrorMessage = null,
                            errorMessage = null
                        )
                    }
                }
                .onFailure { throwable ->
                    Log.e(TAG, "MediaStore scan failed", throwable)
                    _uiState.update {
                        it.copy(
                            isLoadingLibrary = false,
                            libraryErrorMessage = "Не удалось прочитать MediaStore",
                            errorMessage = "Не удалось прочитать MediaStore"
                        )
                    }
                }
        }
    }

    fun clearLibraryError() {
        _uiState.update { it.copy(libraryErrorMessage = null) }
    }

    fun addSafTracks(uris: List<Uri>) {
        if (uris.isEmpty()) return

        viewModelScope.launch {
            val (supportedUris, unsupportedCount) = splitSupportedUris(uris)
            if (unsupportedCount > 0) {
                emitMessage("$unsupportedCount файл(ов) пропущено: неподдерживаемый формат")
            }

            if (supportedUris.isEmpty()) return@launch

            getSafTracks(supportedUris)
                .onSuccess { tracks ->
                    if (tracks.isEmpty()) {
                        emitMessage("Файлы не были распознаны")
                        return@onSuccess
                    }
                    enqueueCommand(PlaybackCommand.AppendQueue(tracks))
                }
                .onFailure { throwable ->
                    Log.e(TAG, "SAF mapping failed", throwable)
                    emitMessage("Ошибка при обработке выбранных файлов")
                }
        }
    }

    fun playLibraryTrack(index: Int) {
        val tracks = _uiState.value.libraryTracks
        if (tracks.isEmpty()) {
            emitMessage("Библиотека пустая")
            return
        }

        val normalizedIndex = index.coerceIn(0, tracks.lastIndex)
        enqueueCommand(PlaybackCommand.ReplaceQueueAndPlay(tracks, normalizedIndex))
    }

    fun enqueueTrack(track: Track) {
        enqueueCommand(PlaybackCommand.AppendQueue(listOf(track)))
    }

    fun playQueueTrack(index: Int) {
        enqueueCommand(PlaybackCommand.PlayQueueIndex(index))
    }

    fun playPlaylist(playlistId: String) {
        val playlist = _uiState.value.playlists.firstOrNull { it.id == playlistId }
        if (playlist == null) {
            emitMessage("Плейлист не найден")
            return
        }
        if (playlist.tracks.isEmpty()) {
            emitMessage("Плейлист пуст")
            return
        }
        enqueueCommand(PlaybackCommand.ReplaceQueueAndPlay(playlist.tracks, 0))
    }

    fun createPlaylist(name: String, initialTrack: Track? = null) {
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val (createdState, createdPlaylist) = PlaylistMutations.create(
                current = _uiState.value.playlists,
                rawName = name,
                nowMs = now
            )

            if (createdPlaylist == null) {
                emitMessage("Введите название плейлиста")
                return@launch
            }

            val finalState = if (initialTrack != null) {
                PlaylistMutations.addTrack(
                    current = createdState,
                    playlistId = createdPlaylist.id,
                    track = initialTrack,
                    nowMs = now
                )
            } else {
                createdState
            }

            savePlaylists(finalState)
            emitMessage("Плейлист \"${createdPlaylist.name}\" создан")
        }
    }

    fun renamePlaylist(playlistId: String, newName: String) {
        viewModelScope.launch {
            val updated = PlaylistMutations.rename(
                current = _uiState.value.playlists,
                playlistId = playlistId,
                rawName = newName,
                nowMs = System.currentTimeMillis()
            )

            if (updated == _uiState.value.playlists) {
                emitMessage("Название не изменено")
                return@launch
            }

            savePlaylists(updated)
        }
    }

    fun deletePlaylist(playlistId: String) {
        viewModelScope.launch {
            val target = _uiState.value.playlists.firstOrNull { it.id == playlistId }
            val updated = PlaylistMutations.delete(_uiState.value.playlists, playlistId)
            if (updated == _uiState.value.playlists) return@launch

            savePlaylists(updated)
            emitMessage("Плейлист \"${target?.name ?: ""}\" удалён")
        }
    }

    fun addTrackToPlaylist(playlistId: String, track: Track) {
        viewModelScope.launch {
            val updated = PlaylistMutations.addTrack(
                current = _uiState.value.playlists,
                playlistId = playlistId,
                track = track,
                nowMs = System.currentTimeMillis()
            )

            if (updated == _uiState.value.playlists) {
                emitMessage("Трек уже есть в плейлисте")
                return@launch
            }

            savePlaylists(updated)
            emitMessage("Трек добавлен в плейлист")
        }
    }

    fun removeTrackFromPlaylist(playlistId: String, track: Track) {
        viewModelScope.launch {
            val updated = PlaylistMutations.removeTrack(
                current = _uiState.value.playlists,
                playlistId = playlistId,
                trackIdentityKey = track.identityKey(),
                nowMs = System.currentTimeMillis()
            )

            if (updated == _uiState.value.playlists) return@launch

            savePlaylists(updated)
        }
    }

    fun togglePlayPause() {
        enqueueCommand(PlaybackCommand.TogglePlayPause)
    }

    fun playNext() {
        enqueueCommand(PlaybackCommand.Next)
    }

    fun playPrevious() {
        enqueueCommand(PlaybackCommand.Previous)
    }

    fun seekTo(positionMs: Long) {
        enqueueCommand(PlaybackCommand.SeekTo(positionMs))
    }

    fun toggleShuffle() {
        enqueueCommand(PlaybackCommand.ToggleShuffle)
    }

    fun cycleRepeatMode() {
        enqueueCommand(PlaybackCommand.CycleRepeatMode)
    }

    fun clearQueue() {
        enqueueCommand(PlaybackCommand.ClearQueue)
    }

    fun setVisualizerMode(mode: VisualizerMode) {
        _uiState.update { current ->
            val updated = current.copy(visualizerMode = mode)
            if (updated == current) current else updated
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
        viewModelScope.launch {
            applyEvent(PlaybackEvent.ResetError())
        }
    }

    override fun onEvents(player: Player, events: Player.Events) {
        viewModelScope.launch {
            syncStateFromPlayer(player)
        }
    }

    override fun onPlayerError(error: PlaybackException) {
        val reason = mapErrorReason(error)
        logPlaybackErrorThrottled(error)
        viewModelScope.launch {
            applyEvent(PlaybackEvent.Error(reason))
            if (reason == PlaybackErrorReason.FILE_UNAVAILABLE) {
                enqueueCommand(PlaybackCommand.SkipUnavailableCurrent)
            }
        }

        val title = _uiState.value.currentTrack?.title
        emitMessage(formatPlaybackError(reason, title))
    }

    override fun onCleared() {
        super.onCleared()
        commandProcessor?.cancel()
        positionTicker?.cancel()
        persistSessionJob?.cancel()
        mediaController?.removeListener(this)
        mediaController?.release()
        mediaController = null
        controllerFuture?.cancel(true)
        commandChannel.close()
    }

    private fun loadPersistedPlaylists() {
        viewModelScope.launch {
            val playlists = playlistStore.load()
            _uiState.update { it.copy(playlists = playlists) }
        }
    }

    private suspend fun savePlaylists(playlists: List<UserPlaylist>) {
        _uiState.update { it.copy(playlists = playlists) }
        playlistStore.save(playlists)
    }

    private fun connectControllerIfNeeded() {
        if (mediaController != null || controllerFuture != null) return

        val app = getApplication<Application>()
        val token = SessionToken(app, ComponentName(app, WowPlaybackService::class.java))
        val future = MediaController.Builder(app, token).buildAsync()
        controllerFuture = future

        future.addListener({
            try {
                val controller = future.get()
                mediaController = controller
                controller.addListener(this)

                viewModelScope.launch {
                    applyEvent(PlaybackEvent.ControllerConnectionChanged(true))
                    isHydratingSession = true
                    restorePersistedSessionIfNeeded(controller)
                    isHydratingSession = false

                    syncStateFromPlayer(controller)
                    flushPendingCommands()
                }
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to connect MediaController", t)
                viewModelScope.launch {
                    applyEvent(PlaybackEvent.ControllerConnectionChanged(false))
                }
                emitMessage("Не удалось подключиться к playback service")
            } finally {
                isHydratingSession = false
                controllerFuture = null
            }
        }, ContextCompat.getMainExecutor(app))
    }

    private suspend fun restorePersistedSessionIfNeeded(controller: MediaController) {
        if (sessionRestoreAttempted) return
        sessionRestoreAttempted = true

        if (controller.mediaItemCount > 0) {
            return
        }

        _uiState.update { it.copy(isRestoringSession = true) }
        try {
            val snapshot = sessionStore.load() ?: return
            val restorePlan = withContext(Dispatchers.IO) {
                PlaybackSessionRestorePolicy.build(snapshot) { track ->
                    repository.isTrackAvailable(track)
                }
            }

            if (restorePlan.queue.isEmpty()) {
                sessionStore.clear()
                if (restorePlan.skippedCount > 0) {
                    emitMessage("Старая очередь больше недоступна и очищена")
                }
                return
            }

            controller.setMediaItems(
                restorePlan.queue.map { it.toMediaItem() },
                restorePlan.startIndex,
                restorePlan.seekPositionMs
            )
            controller.repeatMode = mapRepeatModeToPlayer(snapshot.repeatMode)
            controller.shuffleModeEnabled = snapshot.shuffleEnabled
            controller.prepare()
            controller.playWhenReady = false

            lastPersistedSession = snapshot.copy(
                queue = restorePlan.queue,
                currentIndex = restorePlan.startIndex,
                positionMs = restorePlan.seekPositionMs
            )

            if (restorePlan.skippedCount > 0) {
                emitMessage("Восстановлено с пропуском ${restorePlan.skippedCount} недоступных треков")
            }
        } finally {
            _uiState.update { it.copy(isRestoringSession = false) }
        }
    }

    private fun enqueueCommand(command: PlaybackCommand) {
        val result = commandChannel.trySend(command)
        if (result.isFailure) {
            Log.w(TAG, "Dropping command: $command")
        }
    }

    private fun queuePendingCommand(command: PlaybackCommand) {
        pendingCommands.addLast(command)
        connectControllerIfNeeded()
    }

    private suspend fun flushPendingCommands() {
        if (pendingCommands.isEmpty()) return

        val toReplay = pendingCommands.toList()
        pendingCommands.clear()
        toReplay.forEach { enqueueCommand(it) }
    }

    private fun startCommandProcessor() {
        commandProcessor = viewModelScope.launch {
            for (command in commandChannel) {
                executeCommand(command)
            }
        }
    }

    private suspend fun executeCommand(command: PlaybackCommand) {
        val controller = mediaController
        if (controller == null && command !is PlaybackCommand.SyncFromController) {
            queuePendingCommand(command)
            emitMessage("Плеер подключается…")
            return
        }

        when (command) {
            is PlaybackCommand.ReplaceQueueAndPlay -> {
                val readyController = controller ?: return
                if (command.tracks.isEmpty()) {
                    executeCommand(PlaybackCommand.ClearQueue)
                    return
                }
                val startIndex = command.startIndex.coerceIn(0, command.tracks.lastIndex)
                readyController.setMediaItems(command.tracks.map { it.toMediaItem() }, startIndex, 0L)
                readyController.prepare()
                readyController.playWhenReady = true
                readyController.play()

                applyEvent(
                    PlaybackEvent.QueueReplaced(
                        items = command.tracks,
                        startIndex = startIndex,
                        autoPlay = true
                    )
                )
            }

            is PlaybackCommand.AppendQueue -> {
                val readyController = controller ?: return
                if (command.tracks.isEmpty()) return

                val wasEmpty = readyController.mediaItemCount == 0
                readyController.addMediaItems(command.tracks.map { it.toMediaItem() })

                if (wasEmpty) {
                    readyController.prepare()
                    readyController.playWhenReady = true
                    readyController.play()
                }

                applyEvent(PlaybackEvent.QueueAppended(command.tracks))
            }

            is PlaybackCommand.PlayQueueIndex -> {
                val readyController = controller ?: return
                val state = machineState
                if (command.index !in state.queue.indices) {
                    emitMessage("Трек вне диапазона очереди")
                    return
                }

                readyController.seekToDefaultPosition(command.index)
                if (readyController.playbackState == Player.STATE_IDLE) {
                    readyController.prepare()
                }
                readyController.playWhenReady = true
                readyController.play()
            }

            is PlaybackCommand.TogglePlayPause -> {
                val readyController = controller ?: return
                if (readyController.mediaItemCount == 0) {
                    emitMessage("Очередь пуста")
                    return
                }

                if (readyController.isPlaying) {
                    readyController.pause()
                } else {
                    if (readyController.playbackState == Player.STATE_IDLE) {
                        readyController.prepare()
                    }
                    readyController.play()
                }
            }

            PlaybackCommand.Next -> {
                val readyController = controller ?: return
                if (readyController.mediaItemCount == 0) {
                    emitMessage("Очередь пуста")
                    return
                }

                if (readyController.hasNextMediaItem()) {
                    readyController.seekToNextMediaItem()
                } else if (readyController.repeatMode == Player.REPEAT_MODE_ALL) {
                    readyController.seekToDefaultPosition(0)
                } else {
                    emitMessage("Это последний трек в очереди")
                }
            }

            PlaybackCommand.Previous -> {
                val readyController = controller ?: return
                if (readyController.mediaItemCount == 0) {
                    emitMessage("Очередь пуста")
                    return
                }

                val canGoPrevious = readyController.hasPreviousMediaItem() ||
                    readyController.currentPosition > PREVIOUS_SEEK_THRESHOLD_MS

                if (canGoPrevious) {
                    readyController.seekToPreviousMediaItem()
                } else if (readyController.repeatMode == Player.REPEAT_MODE_ALL && readyController.mediaItemCount > 0) {
                    readyController.seekToDefaultPosition(readyController.mediaItemCount - 1)
                } else {
                    emitMessage("Это начало очереди")
                }
            }

            is PlaybackCommand.SeekTo -> {
                val readyController = controller ?: return
                if (readyController.mediaItemCount == 0) return

                val duration = readyController.duration.takeIf { it > 0L } ?: _uiState.value.durationMs
                val target = if (duration > 0L) {
                    command.positionMs.coerceIn(0L, duration)
                } else {
                    command.positionMs.coerceAtLeast(0L)
                }
                readyController.seekTo(target)
            }

            PlaybackCommand.ToggleShuffle -> {
                val readyController = controller ?: return
                readyController.shuffleModeEnabled = !readyController.shuffleModeEnabled
                syncStateFromPlayer(readyController)
            }

            PlaybackCommand.CycleRepeatMode -> {
                val readyController = controller ?: return
                readyController.repeatMode = nextRepeatMode(readyController.repeatMode)
                syncStateFromPlayer(readyController)
            }

            PlaybackCommand.SkipUnavailableCurrent -> {
                val readyController = controller ?: return
                val currentIndex = readyController.currentMediaItemIndex
                if (currentIndex !in 0 until readyController.mediaItemCount) return

                val shouldContinuePlaying = readyController.isPlaying
                readyController.removeMediaItem(currentIndex)

                if (readyController.mediaItemCount == 0) {
                    applyEvent(PlaybackEvent.QueueCleared())
                    return
                }

                val targetIndex = currentIndex.coerceAtMost(readyController.mediaItemCount - 1)
                readyController.seekToDefaultPosition(targetIndex)
                readyController.prepare()
                readyController.playWhenReady = shouldContinuePlaying
                if (shouldContinuePlaying) {
                    readyController.play()
                }

                syncStateFromPlayer(readyController)
                emitMessage("Недоступный трек удалён из очереди")
            }

            PlaybackCommand.ClearQueue -> {
                val readyController = controller ?: return
                readyController.stop()
                readyController.clearMediaItems()
                applyEvent(PlaybackEvent.QueueCleared())
            }

            PlaybackCommand.SyncFromController -> {
                val readyController = controller ?: return
                syncStateFromPlayer(readyController)
            }
        }
    }

    private suspend fun syncStateFromPlayer(player: Player) {
        val queueSize = machineState.queue.size
        val playerQueueSize = player.mediaItemCount

        if (playerQueueSize == 0 && queueSize > 0) {
            applyEvent(PlaybackEvent.QueueCleared())
        } else if (playerQueueSize > 0) {
            val shouldRestoreQueue = queueSize != playerQueueSize ||
                queueSize == 0 ||
                machineState.currentTrackIdentity() != player.currentMediaItem?.mediaId

            if (shouldRestoreQueue) {
                val restoredQueue = restoreQueueFromController(player)
                if (restoredQueue.isNotEmpty()) {
                    applyEvent(
                        PlaybackEvent.QueueReplaced(
                            items = restoredQueue,
                            startIndex = player.currentMediaItemIndex.coerceAtLeast(0),
                            autoPlay = player.isPlaying
                        )
                    )
                }
            }
        }

        val fallbackDuration = machineState.queue
            .getOrNull(player.currentMediaItemIndex)
            ?.durationMs
            ?: 0L

        applyEvent(
            PlaybackEvent.Snapshot(
                currentIndex = player.currentMediaItemIndex,
                isPlaying = player.isPlaying,
                status = mapStatus(player.playbackState),
                positionMs = player.currentPosition,
                durationMs = if (player.duration > 0L) player.duration else fallbackDuration,
                repeatMode = mapRepeatMode(player.repeatMode),
                shuffleEnabled = player.shuffleModeEnabled
            )
        )
    }

    private suspend fun applyEvent(event: PlaybackEvent<Track>) {
        machineMutex.withLock {
            machineState = stateMachine.reduce(machineState, event)
            publishUiStateLocked(machineState)
        }

        if (!isHydratingSession) {
            scheduleSessionPersist()
        }
    }

    private fun publishUiStateLocked(machine: PlaybackMachineState<Track>) {
        val currentTrack = machine.queue.getOrNull(machine.currentIndex)
        val duration = when {
            machine.durationMs > 0L -> machine.durationMs
            currentTrack?.durationMs != null -> currentTrack.durationMs
            else -> 0L
        }

        val canSkip = machine.controllerConnected && machine.queue.isNotEmpty()

        _uiState.update { current ->
            val updated = current.copy(
                queueTracks = machine.queue,
                currentIndex = machine.currentIndex,
                currentTrack = currentTrack,
                isPlaying = machine.isPlaying,
                positionMs = machine.positionMs,
                durationMs = duration,
                controllerConnected = machine.controllerConnected,
                playbackStatus = machine.status,
                canSkipPrevious = canSkip,
                canSkipNext = canSkip,
                controlsEnabled = machine.controllerConnected && machine.queue.isNotEmpty(),
                repeatMode = machine.repeatMode,
                shuffleEnabled = machine.shuffleEnabled
            )

            if (updated == current) current else updated
        }
    }

    private fun restoreQueueFromController(player: Player): List<Track> {
        if (player.mediaItemCount == 0) return emptyList()

        return buildList {
            for (index in 0 until player.mediaItemCount) {
                val mediaItem = player.getMediaItemAt(index)
                val metadata = mediaItem.mediaMetadata
                val extras = metadata.extras
                val mediaUri = extras?.getString(TRACK_EXTRA_URI)
                    ?.let { Uri.parse(it) }
                    ?: mediaItem.localConfiguration?.uri
                    ?: Uri.EMPTY

                add(
                    Track(
                        id = mediaItem.mediaId.ifBlank { "restored_$index" },
                        title = metadata.title?.toString() ?: "Track ${index + 1}",
                        artist = metadata.artist?.toString() ?: "Unknown artist",
                        durationMs = extras?.getLong(TRACK_EXTRA_DURATION_MS, 0L) ?: 0L,
                        uri = mediaUri
                    )
                )
            }
        }
    }

    private fun scheduleSessionPersist() {
        persistSessionJob?.cancel()
        persistSessionJob = viewModelScope.launch {
            delay(400L)
            persistSessionNow()
        }
    }

    private suspend fun persistSessionNow() {
        val state = machineState
        if (!state.controllerConnected || isHydratingSession) return

        if (state.queue.isEmpty()) {
            if (lastPersistedSession != null) {
                sessionStore.clear()
                lastPersistedSession = null
            }
            return
        }

        val snapshot = PlaybackSessionSnapshot(
            queue = state.queue,
            currentIndex = state.currentIndex.coerceIn(0, state.queue.lastIndex),
            positionMs = state.positionMs,
            repeatMode = state.repeatMode,
            shuffleEnabled = state.shuffleEnabled
        )

        if (snapshot == lastPersistedSession) return

        sessionStore.save(snapshot)
        lastPersistedSession = snapshot
    }

    private fun startPositionTicker() {
        positionTicker = viewModelScope.launch {
            while (isActive) {
                val controller = mediaController
                if (controller != null) {
                    val shouldSync = isPlayerScreenVisible || controller.isPlaying ||
                        controller.playbackState == Player.STATE_BUFFERING
                    if (shouldSync) {
                        syncStateFromPlayer(controller)
                    }
                }
                delay(if (isPlayerScreenVisible) 700L else 1400L)
            }
        }
    }

    private fun splitSupportedUris(uris: List<Uri>): Pair<List<Uri>, Int> {
        val contentResolver = getApplication<Application>().contentResolver
        val supported = mutableListOf<Uri>()
        var unsupportedCount = 0

        uris.forEach { uri ->
            val mime = contentResolver.getType(uri)
            if (mime == null || mime.startsWith("audio/", ignoreCase = true)) {
                supported += uri
            } else {
                unsupportedCount += 1
            }
        }

        return supported to unsupportedCount
    }

    private fun emitMessage(message: String) {
        _uiState.update { current ->
            val updated = current.copy(errorMessage = message)
            if (updated == current) current else updated
        }
    }

    private fun mapStatus(playbackState: Int): PlaybackStatus {
        return when (playbackState) {
            Player.STATE_IDLE -> PlaybackStatus.IDLE
            Player.STATE_BUFFERING -> PlaybackStatus.BUFFERING
            Player.STATE_READY -> PlaybackStatus.READY
            Player.STATE_ENDED -> PlaybackStatus.ENDED
            else -> PlaybackStatus.ERROR
        }
    }

    private fun mapRepeatMode(playerMode: Int): RepeatModeSetting {
        return when (playerMode) {
            Player.REPEAT_MODE_ALL -> RepeatModeSetting.ALL
            Player.REPEAT_MODE_ONE -> RepeatModeSetting.ONE
            else -> RepeatModeSetting.OFF
        }
    }

    private fun mapRepeatModeToPlayer(mode: RepeatModeSetting): Int {
        return when (mode) {
            RepeatModeSetting.OFF -> Player.REPEAT_MODE_OFF
            RepeatModeSetting.ALL -> Player.REPEAT_MODE_ALL
            RepeatModeSetting.ONE -> Player.REPEAT_MODE_ONE
        }
    }

    private fun nextRepeatMode(current: Int): Int {
        return when (current) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }

    private fun mapErrorReason(error: PlaybackException): PlaybackErrorReason {
        val codeName = error.errorCodeName
        return when {
            codeName.contains("UNSUPPORTED", ignoreCase = true) -> PlaybackErrorReason.UNSUPPORTED_FORMAT
            codeName.contains("MALFORMED", ignoreCase = true) -> PlaybackErrorReason.CORRUPTED_FILE
            codeName.contains("FILE_NOT_FOUND", ignoreCase = true) ||
                codeName.contains("NO_PERMISSION", ignoreCase = true) -> PlaybackErrorReason.FILE_UNAVAILABLE
            codeName.contains("DECODING", ignoreCase = true) -> PlaybackErrorReason.DECODER_FAILURE
            codeName.contains("IO", ignoreCase = true) -> PlaybackErrorReason.IO_FAILURE
            else -> PlaybackErrorReason.UNKNOWN
        }
    }

    private fun formatPlaybackError(reason: PlaybackErrorReason, trackTitle: String?): String {
        val prefix = trackTitle?.let { "\"$it\": " } ?: ""
        return when (reason) {
            PlaybackErrorReason.UNSUPPORTED_FORMAT -> prefix + "формат не поддерживается"
            PlaybackErrorReason.CORRUPTED_FILE -> prefix + "файл повреждён или неполный"
            PlaybackErrorReason.FILE_UNAVAILABLE -> prefix + "файл недоступен (проверьте доступ к памяти)"
            PlaybackErrorReason.DECODER_FAILURE -> prefix + "ошибка декодирования аудио"
            PlaybackErrorReason.IO_FAILURE -> prefix + "ошибка чтения файла"
            PlaybackErrorReason.UNKNOWN -> prefix + "неизвестная ошибка воспроизведения"
        }
    }

    private fun logPlaybackErrorThrottled(error: PlaybackException) {
        val now = System.currentTimeMillis()
        val signature = "${error.errorCodeName}:${error.cause?.javaClass?.simpleName}"

        val shouldLog = signature != lastLoggedErrorSignature ||
            now - lastLoggedErrorAtMs > LOG_THROTTLE_WINDOW_MS

        if (shouldLog) {
            Log.e(TAG, "Playback error [${error.errorCodeName}]", error)
            lastLoggedErrorSignature = signature
            lastLoggedErrorAtMs = now
        } else {
            Log.w(TAG, "Playback error suppressed (duplicate): ${error.errorCodeName}")
        }
    }

    private sealed interface PlaybackCommand {
        data class ReplaceQueueAndPlay(val tracks: List<Track>, val startIndex: Int) : PlaybackCommand
        data class AppendQueue(val tracks: List<Track>) : PlaybackCommand
        data class PlayQueueIndex(val index: Int) : PlaybackCommand
        data class SeekTo(val positionMs: Long) : PlaybackCommand

        object TogglePlayPause : PlaybackCommand
        object Next : PlaybackCommand
        object Previous : PlaybackCommand
        object ToggleShuffle : PlaybackCommand
        object CycleRepeatMode : PlaybackCommand
        object SkipUnavailableCurrent : PlaybackCommand
        object ClearQueue : PlaybackCommand
        object SyncFromController : PlaybackCommand
    }

    private companion object {
        const val TAG = "PlayerViewModel"
        const val LOG_THROTTLE_WINDOW_MS = 8_000L
        const val PREVIOUS_SEEK_THRESHOLD_MS = 3_000L
    }
}

private fun Track.identityKey(): String = "$id|$uri"

private fun PlaybackMachineState<Track>.currentTrackIdentity(): String? {
    return queue.getOrNull(currentIndex)?.id
}