package com.sdv.wowplayer.domain.library

import com.sdv.wowplayer.data.library.AudioRepository

class GetMediaStoreTracksUseCase(
    private val repository: AudioRepository
) {
    suspend operator fun invoke() = repository.loadFromMediaStore()
}
