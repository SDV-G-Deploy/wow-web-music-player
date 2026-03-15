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
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

@UnstableApi
class PlayerViewModel(
    application: Application
) : AndroidViewModel(application), Player.Listener {

    private val repository = LocalAudioRepository(application.applicationContext)
    private val getMediaStoreTracks = GetMediaStoreTracksUseCase(repository)
    private val getSafTracks = GetSafTracksUseCase(repository)

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState = _uiState.asStateFlow()

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var mediaController: MediaController? = null
    private var positionTicker: Job? = null

    init {
        connectControllerIfNeeded()
        startPositionTicker()
    }

    fun onHostStarted() {
        connectControllerIfNeeded()
    }

    fun onHostStopped() {
        Log.d(TAG, "UI host stopped - playback continues in MediaSessionService")
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
            getSafTracks(uris)
                .onSuccess { tracks ->
                    if (tracks.isEmpty()) {
                        _uiState.update { it.copy(errorMessage = "Файлы не были распознаны") }
                        return@launch
                    }
                    appendToQueue(tracks)
                }
                .onFailure { throwable ->
                    Log.e(TAG, "SAF mapping failed", throwable)
                    _uiState.update { it.copy(errorMessage = "Ошибка при обработке выбранных файлов") }
                }
        }
    }

    fun playLibraryTrack(index: Int) {
        val tracks = _uiState.value.libraryTracks
        if (tracks.isEmpty()) {
            _uiState.update { it.copy(errorMessage = "Библиотека пустая") }
            return
        }

        val normalizedIndex = index.coerceIn(0, tracks.lastIndex)
        setQueueAndPlay(tracks, normalizedIndex)
    }

    fun enqueueTrack(track: Track) {
        appendToQueue(listOf(track))
    }

    fun playQueueTrack(index: Int) {
        val controller = mediaController ?: return
        if (index !in _uiState.value.queueTracks.indices) return
        controller.seekToDefaultPosition(index)
        controller.playWhenReady = true
        controller.play()
    }

    fun togglePlayPause() {
        val controller = mediaController ?: run {
            _uiState.update { it.copy(errorMessage = "Плеер ещё подключается") }
            connectControllerIfNeeded()
            return
        }

        if (controller.isPlaying) {
            controller.pause()
        } else {
            if (controller.playbackState == Player.STATE_IDLE) {
                controller.prepare()
            }
            controller.play()
        }
    }

    fun playNext() {
        mediaController?.seekToNextMediaItem()
    }

    fun playPrevious() {
        mediaController?.seekToPreviousMediaItem()
    }

    fun seekTo(positionMs: Long) {
        mediaController?.seekTo(positionMs)
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    override fun onEvents(player: Player, events: Player.Events) {
        syncStateFromPlayer(player)
    }

    override fun onPlayerError(error: PlaybackException) {
        Log.e(TAG, "Playback error", error)
        _uiState.update { it.copy(errorMessage = "Ошибка воспроизведения: ${error.errorCodeName}") }
    }

    override fun onCleared() {
        super.onCleared()
        positionTicker?.cancel()
        mediaController?.removeListener(this)
        mediaController?.release()
        mediaController = null
        controllerFuture?.cancel(true)
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
                val restoredQueue = restoreQueueFromController(controller)
                syncStateFromPlayer(controller, restoredQueue)
                _uiState.update { it.copy(controllerConnected = true, errorMessage = null) }
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to connect MediaController", t)
                _uiState.update {
                    it.copy(
                        controllerConnected = false,
                        errorMessage = "Не удалось подключиться к playback service"
                    )
                }
            } finally {
                controllerFuture = null
            }
        }, ContextCompat.getMainExecutor(app))
    }

    private fun appendToQueue(tracks: List<Track>) {
        val controller = mediaController ?: run {
            _uiState.update { it.copy(errorMessage = "Плеер ещё подключается") }
            connectControllerIfNeeded()
            return
        }

        val wasEmpty = controller.mediaItemCount == 0
        controller.addMediaItems(tracks.map { it.toMediaItem() })
        if (wasEmpty) {
            controller.prepare()
            controller.play()
        }

        val updatedQueue = _uiState.value.queueTracks + tracks
        _uiState.update { it.copy(queueTracks = updatedQueue, errorMessage = null) }
        if (wasEmpty) {
            syncStateFromPlayer(controller, updatedQueue)
        }
    }

    private fun setQueueAndPlay(tracks: List<Track>, startIndex: Int) {
        val controller = mediaController ?: run {
            _uiState.update { it.copy(errorMessage = "Плеер ещё подключается") }
            connectControllerIfNeeded()
            return
        }

        controller.setMediaItems(tracks.map { it.toMediaItem() }, startIndex, 0L)
        controller.prepare()
        controller.playWhenReady = true
        controller.play()
        syncStateFromPlayer(controller, tracks)
    }

    private fun syncStateFromPlayer(player: Player, queueOverride: List<Track>? = null) {
        val queue = queueOverride ?: _uiState.value.queueTracks
        val index = player.currentMediaItemIndex
        val currentTrack = queue.getOrNull(index)
        val duration = when {
            player.duration > 0L -> player.duration
            currentTrack?.durationMs != null -> currentTrack.durationMs
            else -> 0L
        }

        _uiState.update {
            it.copy(
                queueTracks = queue,
                currentIndex = index,
                currentTrack = currentTrack,
                isPlaying = player.isPlaying,
                positionMs = player.currentPosition.coerceAtLeast(0L),
                durationMs = duration,
                controllerConnected = true
            )
        }
    }

    private fun restoreQueueFromController(controller: MediaController): List<Track> {
        if (controller.mediaItemCount == 0) return _uiState.value.queueTracks

        return controller.mediaItems.mapIndexed { index, mediaItem ->
            val mediaUri = mediaItem.localConfiguration?.uri ?: Uri.EMPTY
            Track(
                id = mediaItem.mediaId.ifBlank { "restored_$index" },
                title = mediaItem.mediaMetadata.title?.toString() ?: "Track ${index + 1}",
                artist = mediaItem.mediaMetadata.artist?.toString() ?: "Unknown artist",
                durationMs = 0L,
                uri = mediaUri
            )
        }
    }

    private fun startPositionTicker() {
        positionTicker = viewModelScope.launch {
            while (isActive) {
                mediaController?.let { controller ->
                    if (controller.playbackState != Player.STATE_IDLE) {
                        val knownDuration = if (controller.duration > 0L) {
                            controller.duration
                        } else {
                            _uiState.value.currentTrack?.durationMs ?: 0L
                        }

                        _uiState.update {
                            it.copy(
                                positionMs = controller.currentPosition.coerceAtLeast(0L),
                                durationMs = knownDuration
                            )
                        }
                    }
                }
                delay(500)
            }
        }
    }

    private companion object {
        const val TAG = "PlayerViewModel"
    }
}
