package com.sdv.wowplayer.data.library

import android.net.Uri
import com.sdv.wowplayer.core.model.Track

interface AudioRepository {
    suspend fun loadFromMediaStore(): Result<List<Track>>
    suspend fun loadFromSafUris(uris: List<Uri>): Result<List<Track>>
}
