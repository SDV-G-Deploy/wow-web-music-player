package com.sdv.wowplayer.domain.player

import android.net.Uri
import com.sdv.wowplayer.core.model.Track
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.Mockito

class PlaybackSessionRestorePolicyTest {

    @Test
    fun `keeps current index and position when current track is available`() {
        val snapshot = PlaybackSessionSnapshot(
            queue = listOf(track("1"), track("2"), track("3")),
            currentIndex = 1,
            positionMs = 22_000L,
            repeatMode = RepeatModeSetting.ALL,
            shuffleEnabled = true
        )

        val plan = PlaybackSessionRestorePolicy.build(snapshot) { track ->
            track.id != "3"
        }

        assertEquals(2, plan.queue.size)
        assertEquals(1, plan.startIndex)
        assertEquals(22_000L, plan.seekPositionMs)
        assertEquals(1, plan.skippedCount)
    }

    @Test
    fun `falls back to next available track and resets position`() {
        val snapshot = PlaybackSessionSnapshot(
            queue = listOf(track("1"), track("2"), track("3")),
            currentIndex = 1,
            positionMs = 9_000L,
            repeatMode = RepeatModeSetting.OFF,
            shuffleEnabled = false
        )

        val plan = PlaybackSessionRestorePolicy.build(snapshot) { track ->
            track.id != "2"
        }

        assertEquals(listOf("1", "3"), plan.queue.map { it.id })
        assertEquals(1, plan.startIndex)
        assertEquals(0L, plan.seekPositionMs)
        assertEquals(1, plan.skippedCount)
    }

    @Test
    fun `returns empty plan when all tracks are unavailable`() {
        val snapshot = PlaybackSessionSnapshot(
            queue = listOf(track("x"), track("y")),
            currentIndex = 0,
            positionMs = 1000L,
            repeatMode = RepeatModeSetting.ONE,
            shuffleEnabled = false
        )

        val plan = PlaybackSessionRestorePolicy.build(snapshot) { false }

        assertTrue(plan.queue.isEmpty())
        assertEquals(-1, plan.startIndex)
        assertEquals(0L, plan.seekPositionMs)
        assertEquals(2, plan.skippedCount)
    }

    private fun track(id: String): Track {
        return Track(
            id = id,
            title = "track-$id",
            artist = "artist",
            durationMs = 1000L,
            uri = mockUri("content://tracks/$id")
        )
    }

    private fun mockUri(value: String): Uri {
        val uri = Mockito.mock(Uri::class.java)
        Mockito.`when`(uri.toString()).thenReturn(value)
        return uri
    }
}