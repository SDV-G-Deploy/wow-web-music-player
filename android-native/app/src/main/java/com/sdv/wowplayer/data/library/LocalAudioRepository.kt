package com.sdv.wowplayer.data.library

import android.content.ContentUris
import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Log
import com.sdv.wowplayer.core.model.Track
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class LocalAudioRepository(
    private val context: Context
) : AudioRepository {

    override suspend fun loadFromMediaStore(): Result<List<Track>> = withContext(Dispatchers.IO) {
        runCatching {
            val tracks = mutableListOf<Track>()
            val projection = arrayOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.DURATION
            )

            val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0"
            val sortOrder = "${MediaStore.Audio.Media.DATE_ADDED} DESC"

            context.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                sortOrder
            )?.use { cursor ->
                val idIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val titleIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                val artistIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                val durationIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)

                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idIndex)
                    val contentUri = ContentUris.withAppendedId(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                        id
                    )
                    val title = cursor.getString(titleIndex) ?: "Unknown title"
                    val artist = cursor.getString(artistIndex) ?: "Unknown artist"
                    val durationMs = cursor.getLong(durationIndex)

                    tracks += Track(
                        id = "ms_$id",
                        title = title,
                        artist = artist,
                        durationMs = durationMs,
                        uri = contentUri
                    )
                }
            }
            tracks
        }.onFailure {
            Log.e(TAG, "Failed to query MediaStore", it)
        }
    }

    override suspend fun loadFromSafUris(uris: List<Uri>): Result<List<Track>> = withContext(Dispatchers.IO) {
        runCatching {
            uris.mapIndexed { index, uri ->
                val title = queryDisplayName(uri) ?: "Track ${index + 1}"
                val durationMs = queryDuration(uri)
                Track(
                    id = "saf_${uri.hashCode()}",
                    title = title,
                    artist = "Local file",
                    durationMs = durationMs,
                    uri = uri
                )
            }
        }.onFailure {
            Log.e(TAG, "Failed to map SAF uris", it)
        }
    }

    private fun queryDisplayName(uri: Uri): String? {
        return runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    val nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameColumn >= 0 && cursor.moveToFirst()) cursor.getString(nameColumn) else null
                }
        }.getOrElse {
            Log.w(TAG, "Cannot read display name for $uri", it)
            null
        }
    }

    private fun queryDuration(uri: Uri): Long {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(context, uri)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        } catch (t: Throwable) {
            Log.w(TAG, "Cannot read duration for $uri", t)
            0L
        } finally {
            retriever.release()
        }
    }

    private companion object {
        const val TAG = "LocalAudioRepository"
    }
}
