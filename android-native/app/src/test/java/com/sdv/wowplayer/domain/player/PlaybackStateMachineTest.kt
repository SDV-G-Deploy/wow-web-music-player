package com.sdv.wowplayer.domain.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackStateMachineTest {

    private val machine = PlaybackStateMachine<String>()

    @Test
    fun `queue replace keeps deterministic index and autoplay`() {
        val state = machine.reduce(
            PlaybackMachineState(),
            PlaybackEvent.QueueReplaced(
                items = listOf("a", "b", "c"),
                startIndex = 99,
                autoPlay = true
            )
        )

        assertEquals(listOf("a", "b", "c"), state.queue)
        assertEquals(2, state.currentIndex)
        assertTrue(state.isPlaying)
        assertEquals(PlaybackStatus.BUFFERING, state.status)
        assertInvariant(state)
    }

    @Test
    fun `append queue keeps order and queue invariants`() {
        val initial = machine.reduce(
            PlaybackMachineState(),
            PlaybackEvent.QueueAppended(listOf("one"))
        )

        val appended = machine.reduce(
            initial,
            PlaybackEvent.QueueAppended(listOf("two", "three"))
        )

        assertEquals(listOf("one", "two", "three"), appended.queue)
        assertEquals(0, appended.currentIndex)
        assertInvariant(appended)
    }

    @Test
    fun `clear queue fully resets playback state`() {
        val withQueue = machine.reduce(
            PlaybackMachineState(),
            PlaybackEvent.QueueReplaced(
                items = listOf("track"),
                startIndex = 0,
                autoPlay = true
            )
        )

        val cleared = machine.reduce(withQueue, PlaybackEvent.QueueCleared())

        assertTrue(cleared.queue.isEmpty())
        assertEquals(-1, cleared.currentIndex)
        assertFalse(cleared.isPlaying)
        assertEquals(PlaybackStatus.IDLE, cleared.status)
        assertInvariant(cleared)
    }

    @Test
    fun `snapshot never leaves out of bounds current index`() {
        val base = machine.reduce(
            PlaybackMachineState(),
            PlaybackEvent.QueueReplaced(
                items = listOf("x", "y"),
                startIndex = 0,
                autoPlay = false
            )
        )

        val snapshot = machine.reduce(
            base,
            PlaybackEvent.Snapshot(
                currentIndex = 42,
                isPlaying = true,
                status = PlaybackStatus.READY,
                positionMs = 800,
                durationMs = 1200
            )
        )

        assertEquals(1, snapshot.currentIndex)
        assertTrue(snapshot.isPlaying)
        assertEquals(PlaybackStatus.READY, snapshot.status)
        assertEquals(800L, snapshot.positionMs)
        assertInvariant(snapshot)
    }

    @Test
    fun `error and reset are deterministic`() {
        val errored = machine.reduce(
            PlaybackMachineState(queue = listOf("z"), currentIndex = 0),
            PlaybackEvent.Error(PlaybackErrorReason.UNSUPPORTED_FORMAT)
        )

        assertEquals(PlaybackStatus.ERROR, errored.status)
        assertFalse(errored.isPlaying)
        assertEquals(PlaybackErrorReason.UNSUPPORTED_FORMAT, errored.errorReason)

        val reset = machine.reduce(errored, PlaybackEvent.ResetError())
        assertNull(reset.errorReason)
        assertEquals(PlaybackStatus.READY, reset.status)
        assertInvariant(reset)
    }

    @Test
    fun `disconnect always pauses playback`() {
        val connected = machine.reduce(
            PlaybackMachineState(isPlaying = true, status = PlaybackStatus.READY),
            PlaybackEvent.ControllerConnectionChanged(true)
        )

        val disconnected = machine.reduce(connected, PlaybackEvent.ControllerConnectionChanged(false))

        assertFalse(disconnected.controllerConnected)
        assertFalse(disconnected.isPlaying)
        assertEquals(PlaybackStatus.DISCONNECTED, disconnected.status)
        assertInvariant(disconnected)
    }

    private fun assertInvariant(state: PlaybackMachineState<String>) {
        if (state.queue.isEmpty()) {
            assertEquals(-1, state.currentIndex)
        } else {
            assertTrue(state.currentIndex in state.queue.indices)
        }
    }
}
