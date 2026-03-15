package com.sdv.wowplayer.domain.player

enum class PlaybackErrorReason {
    UNSUPPORTED_FORMAT,
    CORRUPTED_FILE,
    FILE_UNAVAILABLE,
    DECODER_FAILURE,
    IO_FAILURE,
    UNKNOWN
}

data class PlaybackMachineState<T>(
    val queue: List<T> = emptyList(),
    val currentIndex: Int = -1,
    val isPlaying: Boolean = false,
    val status: PlaybackStatus = PlaybackStatus.DISCONNECTED,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val controllerConnected: Boolean = false,
    val errorReason: PlaybackErrorReason? = null,
    val repeatMode: RepeatModeSetting = RepeatModeSetting.OFF,
    val shuffleEnabled: Boolean = false
)

sealed interface PlaybackEvent<T> {
    data class ControllerConnectionChanged<T>(val connected: Boolean) : PlaybackEvent<T>
    data class QueueReplaced<T>(
        val items: List<T>,
        val startIndex: Int,
        val autoPlay: Boolean
    ) : PlaybackEvent<T>

    data class QueueAppended<T>(val items: List<T>) : PlaybackEvent<T>
    class QueueCleared<T> : PlaybackEvent<T>

    data class Snapshot<T>(
        val currentIndex: Int,
        val isPlaying: Boolean,
        val status: PlaybackStatus,
        val positionMs: Long,
        val durationMs: Long,
        val repeatMode: RepeatModeSetting,
        val shuffleEnabled: Boolean
    ) : PlaybackEvent<T>

    data class Error<T>(val reason: PlaybackErrorReason) : PlaybackEvent<T>
    class ResetError<T> : PlaybackEvent<T>
}

class PlaybackStateMachine<T> {

    fun reduce(
        current: PlaybackMachineState<T>,
        event: PlaybackEvent<T>
    ): PlaybackMachineState<T> {
        return when (event) {
            is PlaybackEvent.ControllerConnectionChanged -> {
                if (event.connected) {
                    current.copy(
                        controllerConnected = true,
                        status = if (current.status == PlaybackStatus.DISCONNECTED) {
                            PlaybackStatus.IDLE
                        } else {
                            current.status
                        }
                    )
                } else {
                    current.copy(
                        controllerConnected = false,
                        isPlaying = false,
                        status = PlaybackStatus.DISCONNECTED
                    )
                }
            }

            is PlaybackEvent.QueueReplaced -> {
                val safeIndex = normalizeIndex(event.startIndex, event.items.size)
                current.copy(
                    queue = event.items,
                    currentIndex = safeIndex,
                    isPlaying = event.autoPlay && event.items.isNotEmpty(),
                    status = if (event.items.isEmpty()) PlaybackStatus.IDLE else PlaybackStatus.BUFFERING,
                    positionMs = 0L,
                    durationMs = 0L,
                    errorReason = null
                )
            }

            is PlaybackEvent.QueueAppended -> {
                if (event.items.isEmpty()) return current
                val mergedQueue = current.queue + event.items
                val updatedIndex = if (current.currentIndex == -1) 0 else current.currentIndex
                current.copy(
                    queue = mergedQueue,
                    currentIndex = normalizeIndex(updatedIndex, mergedQueue.size),
                    status = if (current.status == PlaybackStatus.DISCONNECTED) {
                        PlaybackStatus.IDLE
                    } else {
                        current.status
                    },
                    errorReason = null
                )
            }

            is PlaybackEvent.QueueCleared -> {
                current.copy(
                    queue = emptyList(),
                    currentIndex = -1,
                    isPlaying = false,
                    status = PlaybackStatus.IDLE,
                    positionMs = 0L,
                    durationMs = 0L,
                    errorReason = null
                )
            }

            is PlaybackEvent.Snapshot -> {
                val safeIndex = normalizeIndex(event.currentIndex, current.queue.size)
                current.copy(
                    currentIndex = safeIndex,
                    isPlaying = event.isPlaying && safeIndex != -1,
                    status = event.status,
                    positionMs = event.positionMs.coerceAtLeast(0L),
                    durationMs = event.durationMs.coerceAtLeast(0L),
                    controllerConnected = true,
                    repeatMode = event.repeatMode,
                    shuffleEnabled = event.shuffleEnabled
                )
            }

            is PlaybackEvent.Error -> {
                current.copy(
                    status = PlaybackStatus.ERROR,
                    isPlaying = false,
                    errorReason = event.reason
                )
            }

            is PlaybackEvent.ResetError -> {
                if (current.errorReason == null && current.status != PlaybackStatus.ERROR) {
                    current
                } else {
                    current.copy(
                        errorReason = null,
                        status = if (current.queue.isEmpty()) PlaybackStatus.IDLE else PlaybackStatus.READY
                    )
                }
            }
        }
    }

    private fun normalizeIndex(index: Int, queueSize: Int): Int {
        if (queueSize <= 0) return -1
        if (index < 0) return 0
        if (index >= queueSize) return queueSize - 1
        return index
    }
}