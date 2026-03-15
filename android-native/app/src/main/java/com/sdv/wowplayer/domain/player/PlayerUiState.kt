package com.sdv.wowplayer.domain.player

import com.sdv.wowplayer.core.model.Track
import com.sdv.wowplayer.domain.playlist.UserPlaylist

enum class PlaybackStatus {
    DISCONNECTED,
    IDLE,
    BUFFERING,
    READY,
    ENDED,
    ERROR
}

enum class VisualizerMode {
    OFF,
    ULTRA_LIGHT
}

enum class RepeatModeSetting {
    OFF,
    ALL,
    ONE
}

data class PlayerUiState(
    val libraryTracks: List<Track> = emptyList(),
    val queueTracks: List<Track> = emptyList(),
    val playlists: List<UserPlaylist> = emptyList(),
    val currentTrack: Track? = null,
    val currentIndex: Int = -1,
    val isPlaying: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val isLoadingLibrary: Boolean = false,
    val libraryErrorMessage: String? = null,
    val errorMessage: String? = null,
    val controllerConnected: Boolean = false,
    val playbackStatus: PlaybackStatus = PlaybackStatus.DISCONNECTED,
    val canSkipPrevious: Boolean = false,
    val canSkipNext: Boolean = false,
    val controlsEnabled: Boolean = false,
    val visualizerMode: VisualizerMode = VisualizerMode.OFF,
    val repeatMode: RepeatModeSetting = RepeatModeSetting.OFF,
    val shuffleEnabled: Boolean = false,
    val isRestoringSession: Boolean = false
)