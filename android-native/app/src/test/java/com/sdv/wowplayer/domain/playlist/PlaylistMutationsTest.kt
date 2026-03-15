package com.sdv.wowplayer.domain.playlist

import android.net.Uri
import com.sdv.wowplayer.core.model.Track
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaylistMutationsTest {

    @Test
    fun `create enforces unique naming and trims whitespace`() {
        val first = PlaylistMutations.create(
            current = emptyList(),
            rawName = "  Favorites  ",
            idGenerator = { "p1" },
            nowMs = 100L
        )
        val second = PlaylistMutations.create(
            current = first.first,
            rawName = "Favorites",
            idGenerator = { "p2" },
            nowMs = 200L
        )

        assertEquals("Favorites", first.second?.name)
        assertEquals("Favorites (2)", second.second?.name)
        assertEquals(2, second.first.size)
    }

    @Test
    fun `rename keeps uniqueness across playlists`() {
        val source = listOf(
            UserPlaylist("a", "Road", tracks = emptyList(), updatedAtMs = 1L),
            UserPlaylist("b", "Focus", tracks = emptyList(), updatedAtMs = 1L)
        )

        val renamed = PlaylistMutations.rename(
            current = source,
            playlistId = "a",
            rawName = "Focus",
            nowMs = 10L
        )

        assertEquals("Focus (2)", renamed.first { it.id == "a" }.name)
    }

    @Test
    fun `add track is idempotent for same track identity`() {
        val playlist = UserPlaylist("p", "Mix", tracks = emptyList(), updatedAtMs = 0L)
        val track = track("42")

        val once = PlaylistMutations.addTrack(listOf(playlist), "p", track, nowMs = 10L)
        val twice = PlaylistMutations.addTrack(once, "p", track, nowMs = 20L)

        assertEquals(1, once.first().tracks.size)
        assertEquals(1, twice.first().tracks.size)
    }

    @Test
    fun `remove track updates only target playlist`() {
        val target = UserPlaylist("target", "Target", tracks = listOf(track("1"), track("2")), updatedAtMs = 0L)
        val other = UserPlaylist("other", "Other", tracks = listOf(track("9")), updatedAtMs = 0L)

        val updated = PlaylistMutations.removeTrack(
            current = listOf(target, other),
            playlistId = "target",
            trackIdentityKey = "1|",
            nowMs = 99L
        )

        val updatedTarget = updated.first { it.id == "target" }
        val untouched = updated.first { it.id == "other" }

        assertEquals(1, updatedTarget.tracks.size)
        assertEquals("2", updatedTarget.tracks.first().id)
        assertEquals(1, untouched.tracks.size)
        assertTrue(updatedTarget.updatedAtMs >= 99L)
    }

    private fun track(id: String): Track {
        return Track(
            id = id,
            title = "t$id",
            artist = "artist",
            durationMs = 1_000L,
            uri = Uri.EMPTY
        )
    }
}