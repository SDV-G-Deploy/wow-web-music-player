package com.sdv.wowplayer.service

import android.content.Intent
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

@UnstableApi
class WowPlaybackService : MediaSessionService() {

    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null

    private var lastErrorSignature: String? = null
    private var lastErrorAtMs: Long = 0L

    override fun onCreate() {
        super.onCreate()
        runCatching {
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build()

            val exoPlayer = ExoPlayer.Builder(this).build().apply {
                setAudioAttributes(audioAttributes, true)
                setHandleAudioBecomingNoisy(true)
                addListener(
                    object : Player.Listener {
                        override fun onPlayerError(error: PlaybackException) {
                            logServiceErrorThrottled(error)
                        }
                    }
                )
            }

            val session = MediaSession.Builder(this, exoPlayer).build()

            setMediaNotificationProvider(
                DefaultMediaNotificationProvider.Builder(this)
                    .build()
            )

            player = exoPlayer
            mediaSession = session
        }.onFailure {
            Log.e(TAG, "Playback service init failed", it)
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        val currentPlayer = player ?: return
        if (!currentPlayer.playWhenReady || currentPlayer.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        val currentSession = mediaSession
        val currentPlayer = player

        currentSession?.release()
        currentPlayer?.release()

        mediaSession = null
        player = null
        super.onDestroy()
    }

    private fun logServiceErrorThrottled(error: PlaybackException) {
        val now = System.currentTimeMillis()
        val signature = "${error.errorCodeName}:${error.cause?.javaClass?.simpleName}"

        val shouldLog = signature != lastErrorSignature ||
            now - lastErrorAtMs > LOG_THROTTLE_WINDOW_MS

        if (shouldLog) {
            Log.e(TAG, "Player error in service [${error.errorCodeName}]", error)
            lastErrorSignature = signature
            lastErrorAtMs = now
        }
    }

    private companion object {
        const val TAG = "WowPlaybackService"
        const val LOG_THROTTLE_WINDOW_MS = 8_000L
    }
}
