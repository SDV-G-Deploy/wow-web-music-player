package com.sdv.wowplayer.domain.player

import com.sdv.wowplayer.core.model.Track

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

data class PlayerUiState(
    val libraryTracks: List<Track> = emptyList(),
    val queueTracks: List<Track> = emptyList(),
    val currentTrack: Track? = null,
    val currentIndex: Int = -1,
    val isPlaying: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val isLoadingLibrary: Boolean = false,
    val errorMessage: String? = null,
    val controllerConnected: Boolean = false,
    val playbackStatus: PlaybackStatus = PlaybackStatus.DISCONNECTED,
    val canSkipPrevious: Boolean = false,
    val canSkipNext: Boolean = false,
    val controlsEnabled: Boolean = false,
    val visualizerMode: VisualizerMode = VisualizerMode.OFF
)
