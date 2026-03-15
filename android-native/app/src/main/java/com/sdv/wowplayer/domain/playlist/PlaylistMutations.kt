package com.sdv.wowplayer.domain.playlist

import com.sdv.wowplayer.core.model.Track
import java.util.UUID

object PlaylistMutations {

    fun create(
        current: List<UserPlaylist>,
        rawName: String,
        nowMs: Long = System.currentTimeMillis(),
        idGenerator: () -> String = { UUID.randomUUID().toString() }
    ): Pair<List<UserPlaylist>, UserPlaylist?> {
        val normalized = normalizeName(rawName) ?: return current to null
        val uniqueName = ensureUniqueName(normalized, current.map { it.name }.toSet())
        val created = UserPlaylist(
            id = idGenerator(),
            name = uniqueName,
            tracks = emptyList(),
            updatedAtMs = nowMs
        )
        return current + created to created
    }

    fun rename(
        current: List<UserPlaylist>,
        playlistId: String,
        rawName: String,
        nowMs: Long = System.currentTimeMillis()
    ): List<UserPlaylist> {
        val normalized = normalizeName(rawName) ?: return current
        val occupiedNames = current
            .asSequence()
            .filterNot { it.id == playlistId }
            .map { it.name }
            .toSet()
        val uniqueName = ensureUniqueName(normalized, occupiedNames)

        return current.map { playlist ->
            if (playlist.id != playlistId) {
                playlist
            } else {
                playlist.copy(name = uniqueName, updatedAtMs = nowMs)
            }
        }
    }

    fun delete(current: List<UserPlaylist>, playlistId: String): List<UserPlaylist> {
        return current.filterNot { it.id == playlistId }
    }

    fun addTrack(
        current: List<UserPlaylist>,
        playlistId: String,
        track: Track,
        nowMs: Long = System.currentTimeMillis()
    ): List<UserPlaylist> {
        return current.map { playlist ->
            if (playlist.id != playlistId) {
                playlist
            } else {
                val keyToAdd = track.identityKey()
                val alreadyExists = playlist.tracks.any { it.identityKey() == keyToAdd }
                if (alreadyExists) {
                    playlist
                } else {
                    playlist.copy(
                        tracks = playlist.tracks + track,
                        updatedAtMs = nowMs
                    )
                }
            }
        }
    }

    fun removeTrack(
        current: List<UserPlaylist>,
        playlistId: String,
        trackIdentityKey: String,
        nowMs: Long = System.currentTimeMillis()
    ): List<UserPlaylist> {
        return current.map { playlist ->
            if (playlist.id != playlistId) {
                playlist
            } else {
                val updatedTracks = playlist.tracks.filterNot { it.identityKey() == trackIdentityKey }
                if (updatedTracks.size == playlist.tracks.size) {
                    playlist
                } else {
                    playlist.copy(
                        tracks = updatedTracks,
                        updatedAtMs = nowMs
                    )
                }
            }
        }
    }

    private fun normalizeName(rawName: String): String? {
        val normalized = rawName.trim().replace(Regex("\\s+"), " ")
        return normalized.takeIf { it.isNotBlank() }
    }

    private fun ensureUniqueName(base: String, occupiedNames: Set<String>): String {
        if (base !in occupiedNames) return base

        var index = 2
        while (true) {
            val candidate = "$base ($index)"
            if (candidate !in occupiedNames) return candidate
            index += 1
        }
    }
}

private fun Track.identityKey(): String = "$id|$uri"