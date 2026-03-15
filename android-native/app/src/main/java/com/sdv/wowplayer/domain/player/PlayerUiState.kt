package com.sdv.wowplayer.domain.player

import com.sdv.wowplayer.core.model.Track

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
    val controllerConnected: Boolean = false
)
