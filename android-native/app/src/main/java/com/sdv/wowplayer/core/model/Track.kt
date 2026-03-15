package com.sdv.wowplayer.core.model

import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata

const val TRACK_EXTRA_DURATION_MS = "wow.track.duration.ms"
const val TRACK_EXTRA_URI = "wow.track.uri"

data class Track(
    val id: String,
    val title: String,
    val artist: String,
    val durationMs: Long,
    val uri: Uri
)

fun Track.toMediaItem(): MediaItem {
    val extras = Bundle().apply {
        putLong(TRACK_EXTRA_DURATION_MS, durationMs.coerceAtLeast(0L))
        putString(TRACK_EXTRA_URI, uri.toString())
    }

    val metadata = MediaMetadata.Builder()
        .setTitle(title)
        .setArtist(artist)
        .setExtras(extras)
        .build()

    return MediaItem.Builder()
        .setMediaId(id)
        .setUri(uri)
        .setMediaMetadata(metadata)
        .build()
}