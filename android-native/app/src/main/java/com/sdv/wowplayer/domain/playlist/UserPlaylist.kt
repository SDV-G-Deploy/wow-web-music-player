package com.sdv.wowplayer.domain.playlist

import com.sdv.wowplayer.core.model.Track

data class UserPlaylist(
    val id: String,
    val name: String,
    val tracks: List<Track>,
    val updatedAtMs: Long
)