package com.sdv.wowplayer.data.persistence

import android.content.Context
import android.net.Uri
import com.sdv.wowplayer.core.model.Track
import com.sdv.wowplayer.domain.player.PlaybackSessionSnapshot
import com.sdv.wowplayer.domain.player.RepeatModeSetting
import com.sdv.wowplayer.domain.playlist.UserPlaylist
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class PlaybackSessionStore(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    suspend fun load(): PlaybackSessionSnapshot? = withContext(Dispatchers.IO) {
        val raw = prefs.getString(KEY_SESSION, null) ?: return@withContext null
        decodeSession(raw)
    }

    suspend fun save(snapshot: PlaybackSessionSnapshot) = withContext(Dispatchers.IO) {
        prefs.edit()
            .putString(KEY_SESSION, encodeSession(snapshot))
            .apply()
    }

    suspend fun clear() = withContext(Dispatchers.IO) {
        prefs.edit().remove(KEY_SESSION).apply()
    }

    private fun encodeSession(snapshot: PlaybackSessionSnapshot): String {
        return JSONObject().apply {
            put("currentIndex", snapshot.currentIndex)
            put("positionMs", snapshot.positionMs)
            put("repeatMode", snapshot.repeatMode.name)
            put("shuffleEnabled", snapshot.shuffleEnabled)
            put("queue", snapshot.queue.toJsonArray())
        }.toString()
    }

    private fun decodeSession(raw: String): PlaybackSessionSnapshot? {
        return runCatching {
            val json = JSONObject(raw)
            val queue = json.optJSONArray("queue").toTrackList()
            if (queue.isEmpty()) return null

            PlaybackSessionSnapshot(
                queue = queue,
                currentIndex = json.optInt("currentIndex", 0),
                positionMs = json.optLong("positionMs", 0L),
                repeatMode = RepeatModeSetting.entries
                    .firstOrNull { it.name == json.optString("repeatMode", RepeatModeSetting.OFF.name) }
                    ?: RepeatModeSetting.OFF,
                shuffleEnabled = json.optBoolean("shuffleEnabled", false)
            )
        }.getOrNull()
    }

    private companion object {
        const val PREFS_NAME = "wow_player_persistence"
        const val KEY_SESSION = "playback_session"
    }
}

class PlaylistStore(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    suspend fun load(): List<UserPlaylist> = withContext(Dispatchers.IO) {
        val raw = prefs.getString(KEY_PLAYLISTS, null) ?: return@withContext emptyList()
        decodePlaylists(raw)
    }

    suspend fun save(playlists: List<UserPlaylist>) = withContext(Dispatchers.IO) {
        prefs.edit()
            .putString(KEY_PLAYLISTS, encodePlaylists(playlists))
            .apply()
    }

    private fun encodePlaylists(playlists: List<UserPlaylist>): String {
        return JSONArray().apply {
            playlists.forEach { playlist ->
                put(
                    JSONObject().apply {
                        put("id", playlist.id)
                        put("name", playlist.name)
                        put("updatedAtMs", playlist.updatedAtMs)
                        put("tracks", playlist.tracks.toJsonArray())
                    }
                )
            }
        }.toString()
    }

    private fun decodePlaylists(raw: String): List<UserPlaylist> {
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val obj = array.optJSONObject(index) ?: continue
                    val id = obj.optString("id").takeIf { it.isNotBlank() } ?: continue
                    val name = obj.optString("name").takeIf { it.isNotBlank() } ?: continue
                    val tracks = obj.optJSONArray("tracks").toTrackList()
                    val updatedAtMs = obj.optLong("updatedAtMs", 0L)
                    add(
                        UserPlaylist(
                            id = id,
                            name = name,
                            tracks = tracks,
                            updatedAtMs = updatedAtMs
                        )
                    )
                }
            }
        }.getOrElse { emptyList() }
    }

    private companion object {
        const val PREFS_NAME = "wow_player_persistence"
        const val KEY_PLAYLISTS = "user_playlists"
    }
}

private fun List<Track>.toJsonArray(): JSONArray {
    return JSONArray().apply {
        this@toJsonArray.forEach { track ->
            put(
                JSONObject().apply {
                    put("id", track.id)
                    put("title", track.title)
                    put("artist", track.artist)
                    put("durationMs", track.durationMs)
                    put("uri", track.uri.toString())
                }
            )
        }
    }
}

private fun JSONArray?.toTrackList(): List<Track> {
    if (this == null) return emptyList()

    return buildList {
        for (index in 0 until length()) {
            val obj = optJSONObject(index) ?: continue
            val id = obj.optString("id").takeIf { it.isNotBlank() } ?: continue
            val title = obj.optString("title").ifBlank { "Track ${index + 1}" }
            val artist = obj.optString("artist").ifBlank { "Unknown artist" }
            val durationMs = obj.optLong("durationMs", 0L)
            val uriRaw = obj.optString("uri").takeIf { it.isNotBlank() } ?: continue
            val uri = runCatching { Uri.parse(uriRaw) }.getOrNull() ?: continue

            add(
                Track(
                    id = id,
                    title = title,
                    artist = artist,
                    durationMs = durationMs,
                    uri = uri
                )
            )
        }
    }
}