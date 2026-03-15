package com.sdv.wowplayer.domain.library

import android.net.Uri
import com.sdv.wowplayer.data.library.AudioRepository

class GetSafTracksUseCase(
    private val repository: AudioRepository
) {
    suspend operator fun invoke(uris: List<Uri>) = repository.loadFromSafUris(uris)
}
