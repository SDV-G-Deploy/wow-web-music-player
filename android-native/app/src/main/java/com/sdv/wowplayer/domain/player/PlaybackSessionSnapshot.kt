package com.sdv.wowplayer.domain.player

import com.sdv.wowplayer.core.model.Track

data class PlaybackSessionSnapshot(
    val queue: List<Track>,
    val currentIndex: Int,
    val positionMs: Long,
    val repeatMode: RepeatModeSetting,
    val shuffleEnabled: Boolean
)

data class PlaybackRestorePlan(
    val queue: List<Track>,
    val startIndex: Int,
    val seekPositionMs: Long,
    val skippedCount: Int
)

object PlaybackSessionRestorePolicy {

    fun build(
        snapshot: PlaybackSessionSnapshot,
        isTrackAvailable: (Track) -> Boolean
    ): PlaybackRestorePlan {
        if (snapshot.queue.isEmpty()) {
            return PlaybackRestorePlan(
                queue = emptyList(),
                startIndex = -1,
                seekPositionMs = 0L,
                skippedCount = 0
            )
        }

        val available = mutableListOf<Pair<Int, Track>>()
        snapshot.queue.forEachIndexed { index, track ->
            if (isTrackAvailable(track)) {
                available += index to track
            }
        }

        val skippedCount = snapshot.queue.size - available.size
        if (available.isEmpty()) {
            return PlaybackRestorePlan(
                queue = emptyList(),
                startIndex = -1,
                seekPositionMs = 0L,
                skippedCount = skippedCount
            )
        }

        val targetOriginalIndex = snapshot.currentIndex.coerceIn(0, snapshot.queue.lastIndex)
        val directMatch = available.indexOfFirst { (oldIndex, _) -> oldIndex == targetOriginalIndex }

        val selectedAvailableIndex = when {
            directMatch >= 0 -> directMatch
            else -> {
                val nextAvailable = available.indexOfFirst { (oldIndex, _) -> oldIndex > targetOriginalIndex }
                if (nextAvailable >= 0) nextAvailable else available.lastIndex
            }
        }

        val selectedOriginalIndex = available[selectedAvailableIndex].first
        val restoredPosition = if (selectedOriginalIndex == targetOriginalIndex) {
            snapshot.positionMs.coerceAtLeast(0L)
        } else {
            0L
        }

        return PlaybackRestorePlan(
            queue = available.map { it.second },
            startIndex = selectedAvailableIndex,
            seekPositionMs = restoredPosition,
            skippedCount = skippedCount
        )
    }
}