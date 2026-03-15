import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLikelySupportedAudioInput,
  isStalePlaybackOperation,
  mapPlaylistTracksToQueueIndexes,
  moveQueueByStep,
  nextQueueOrderForNewTracks,
  queueIsCleared,
  queueNextPosition,
  queuePrevPosition,
  removeQueuePosition,
  reorderQueue,
  shouldAutoplayAfterSwitch,
  shouldReloadDeckTrack,
  shuffleKeepCurrent,
} from '../src/playbackLogic';

test('queueNextPosition handles repeat modes', () => {
  assert.equal(queueNextPosition(0, 'off', 3), 1);
  assert.equal(queueNextPosition(2, 'off', 3), -1);
  assert.equal(queueNextPosition(2, 'all', 3), 0);
  assert.equal(queueNextPosition(1, 'one', 3), 1);
});

test('queuePrevPosition handles repeat modes', () => {
  assert.equal(queuePrevPosition(2, 'off', 3), 1);
  assert.equal(queuePrevPosition(0, 'off', 3), -1);
  assert.equal(queuePrevPosition(0, 'all', 3), 2);
  assert.equal(queuePrevPosition(1, 'one', 3), 1);
});

test('shuffleKeepCurrent keeps current track first and preserves set', () => {
  const source = [0, 1, 2, 3, 4];
  const shuffled = shuffleKeepCurrent(source, 2);
  assert.equal(shuffled[0], 2);
  assert.equal(shuffled.length, source.length);
  assert.deepEqual([...new Set(shuffled)].sort((a, b) => a - b), source);
});

test('reorderQueue moves item between positions', () => {
  assert.deepEqual(reorderQueue([0, 1, 2, 3], 3, 1), [0, 3, 1, 2]);
  assert.deepEqual(reorderQueue([0, 1, 2, 3], 1, 1), [0, 1, 2, 3]);
});

test('removeQueuePosition removes requested item', () => {
  assert.deepEqual(removeQueuePosition([0, 1, 2, 3], 2), [0, 1, 3]);
  assert.deepEqual(removeQueuePosition([0, 1], 5), [0, 1]);
});

test('moveQueueByStep supports explicit move up/down actions', () => {
  assert.deepEqual(moveQueueByStep([0, 1, 2], 1, -1), [1, 0, 2]);
  assert.deepEqual(moveQueueByStep([0, 1, 2], 1, 1), [0, 2, 1]);
  assert.deepEqual(moveQueueByStep([0, 1, 2], 0, -1), [0, 1, 2]);
});

test('mapPlaylistTracksToQueueIndexes resolves loadable tracks from library', () => {
  const playlist = [
    { id: 11, kind: 'demo' as const, title: 'A', artist: 'Artist A' },
    { id: 77, kind: 'local' as const, title: 'Missing', artist: 'X' },
    { id: 13, kind: 'demo' as const, title: 'C', artist: 'Artist C' },
  ];

  const library = [
    { id: 11, kind: 'demo' as const, title: 'A', artist: 'Artist A' },
    { id: 12, kind: 'demo' as const, title: 'B', artist: 'Artist B' },
    { id: 13, kind: 'demo' as const, title: 'C', artist: 'Artist C' },
  ];

  assert.deepEqual(mapPlaylistTracksToQueueIndexes(playlist, library), [0, 2]);
});

test('isLikelySupportedAudioInput tolerates unknown mime from Android pickers', () => {
  const ext = ['.mp3', '.wav', '.ogg', '.m4a'];
  assert.equal(isLikelySupportedAudioInput('song.mp3', '', ext), true);
  assert.equal(isLikelySupportedAudioInput('song.unknown', 'application/octet-stream', ext), true);
  assert.equal(isLikelySupportedAudioInput('song.txt', 'text/plain', ext), false);
});

test('queueIsCleared validates clear-queue state guard', () => {
  assert.equal(queueIsCleared([], 0, 0, 0, false), true);
  assert.equal(queueIsCleared([1], 0, 0, 0, false), false);
});

test('nextQueueOrderForNewTracks does not reuse stale indexes after clear/reload', () => {
  assert.deepEqual(nextQueueOrderForNewTracks(3, 2), [3, 4]);
  assert.deepEqual(nextQueueOrderForNewTracks(10, 0), []);
});

test('shouldReloadDeckTrack detects stale active source mismatch', () => {
  assert.equal(shouldReloadDeckTrack(5, 5), false);
  assert.equal(shouldReloadDeckTrack(5, 9), true);
  assert.equal(shouldReloadDeckTrack(null, 0), true);
});

test('shouldAutoplayAfterSwitch models mobile autoplay guard', () => {
  assert.equal(shouldAutoplayAfterSwitch(true, true, true), true);
  assert.equal(shouldAutoplayAfterSwitch(true, false, true), false);
  assert.equal(shouldAutoplayAfterSwitch(true, false, false), true);
  assert.equal(shouldAutoplayAfterSwitch(false, true, false), false);
});

test('isStalePlaybackOperation rejects stale async operations', () => {
  assert.equal(isStalePlaybackOperation(4, 4, 10, 10), false);
  assert.equal(isStalePlaybackOperation(3, 4, 10, 10), true);
  assert.equal(isStalePlaybackOperation(4, 4, 9, 10), true);
});
