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
import com.sdv.wowplayer.core.model.Track
import com.sdv.wowplayer.core.model.toMediaItem
import com.sdv.wowplayer.data.library.LocalAudioRepository
import com.sdv.wowplayer.domain.library.GetMediaStoreTracksUseCase
import com.sdv.wowplayer.domain.library.GetSafTracksUseCase
import com.sdv.wowplayer.service.WowPlaybackService
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

@UnstableApi
class PlayerViewModel(
    application: Application
) : AndroidViewModel(application), Player.Listener {

    private val repository = LocalAudioRepository(application.applicationContext)
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
    private var isPlayerScreenVisible = false

    private var lastLoggedErrorSignature: String? = null
    private var lastLoggedErrorAtMs: Long = 0L

    init {
        startCommandProcessor()
        connectControllerIfNeeded()
        startPositionTicker()
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
            _uiState.update { it.copy(isLoadingLibrary = true, errorMessage = null) }
            getMediaStoreTracks()
                .onSuccess { tracks ->
                    _uiState.update {
                        it.copy(
                            libraryTracks = tracks,
                            isLoadingLibrary = false,
                            errorMessage = null
                        )
                    }
                }
                .onFailure { throwable ->
                    Log.e(TAG, "MediaStore scan failed", throwable)
                    _uiState.update {
                        it.copy(
                            isLoadingLibrary = false,
                            errorMessage = "Не удалось прочитать MediaStore"
                        )
                    }
                }
        }
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
        }

        val title = _uiState.value.currentTrack?.title
        emitMessage(formatPlaybackError(reason, title))
    }

    override fun onCleared() {
        super.onCleared()
        commandProcessor?.cancel()
        positionTicker?.cancel()
        mediaController?.removeListener(this)
        mediaController?.release()
        mediaController = null
        controllerFuture?.cancel(true)
        commandChannel.close()
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
                    val restoredQueue = restoreQueueFromController(controller)
                    if (restoredQueue.isNotEmpty()) {
                        val restoredIndex = controller.currentMediaItemIndex.coerceAtLeast(0)
                        applyEvent(
                            PlaybackEvent.QueueReplaced(
                                items = restoredQueue,
                                startIndex = restoredIndex,
                                autoPlay = controller.isPlaying
                            )
                        )
                    }
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
                controllerFuture = null
            }
        }, ContextCompat.getMainExecutor(app))
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
                if (readyController.hasNextMediaItem()) {
                    readyController.seekToNextMediaItem()
                } else {
                    emitMessage("Это последний трек в очереди")
                }
            }

            PlaybackCommand.Previous -> {
                val readyController = controller ?: return
                if (readyController.hasPreviousMediaItem() || readyController.currentPosition > PREVIOUS_SEEK_THRESHOLD_MS) {
                    readyController.seekToPreviousMediaItem()
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

        if (player.mediaItemCount == 0 && queueSize > 0) {
            applyEvent(PlaybackEvent.QueueCleared())
        } else if (player.mediaItemCount > 0 && player.mediaItemCount != queueSize) {
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
                durationMs = if (player.duration > 0L) player.duration else fallbackDuration
            )
        )
    }

    private suspend fun applyEvent(event: PlaybackEvent<Track>) {
        machineMutex.withLock {
            machineState = stateMachine.reduce(machineState, event)
            publishUiStateLocked(machineState)
        }
    }

    private fun publishUiStateLocked(machine: PlaybackMachineState<Track>) {
        val currentTrack = machine.queue.getOrNull(machine.currentIndex)
        val duration = when {
            machine.durationMs > 0L -> machine.durationMs
            currentTrack?.durationMs != null -> currentTrack.durationMs
            else -> 0L
        }

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
                canSkipPrevious = machine.currentIndex > 0,
                canSkipNext = machine.currentIndex in 0 until (machine.queue.size - 1),
                controlsEnabled = machine.controllerConnected && machine.queue.isNotEmpty()
            )

            if (updated == current) current else updated
        }
    }

    private fun restoreQueueFromController(player: Player): List<Track> {
        if (player.mediaItemCount == 0) return emptyList()

        return buildList {
            for (index in 0 until player.mediaItemCount) {
                val mediaItem = player.getMediaItemAt(index)
                val mediaUri = mediaItem.localConfiguration?.uri ?: Uri.EMPTY
                add(
                    Track(
                        id = mediaItem.mediaId.ifBlank { "restored_$index" },
                        title = mediaItem.mediaMetadata.title?.toString() ?: "Track ${index + 1}",
                        artist = mediaItem.mediaMetadata.artist?.toString() ?: "Unknown artist",
                        durationMs = 0L,
                        uri = mediaUri
                    )
                )
            }
        }
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
        object ClearQueue : PlaybackCommand
        object SyncFromController : PlaybackCommand
    }

    private companion object {
        const val TAG = "PlayerViewModel"
        const val LOG_THROTTLE_WINDOW_MS = 8_000L
        const val PREVIOUS_SEEK_THRESHOLD_MS = 3_000L
    }
}
