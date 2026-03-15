import test from 'node:test';
import assert from 'node:assert/strict';
import { queueNextPosition, queuePrevPosition, shuffleKeepCurrent } from '../src/playbackLogic';

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
