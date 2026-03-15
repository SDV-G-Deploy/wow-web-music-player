export type RepeatMode = 'off' | 'all' | 'one';

export const queueNextPosition = (pos: number, mode: RepeatMode, orderLength: number) => {
  if (mode === 'one') return pos;
  const next = pos + 1;
  if (next < orderLength) return next;
  if (mode === 'all') return 0;
  return -1;
};

export const queuePrevPosition = (pos: number, mode: RepeatMode, orderLength: number) => {
  if (mode === 'one') return pos;
  const prev = pos - 1;
  if (prev >= 0) return prev;
  if (mode === 'all') return orderLength - 1;
  return -1;
};

export const shuffleKeepCurrent = (order: number[], currentTrackIndex: number) => {
  const rest = order.filter((item) => item !== currentTrackIndex);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [currentTrackIndex, ...rest];
};
