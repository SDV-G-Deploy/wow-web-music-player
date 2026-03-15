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

export const reorderQueue = (order: number[], from: number, to: number) => {
  if (from === to) return [...order];
  if (from < 0 || to < 0 || from >= order.length || to >= order.length) return [...order];

  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export const removeQueuePosition = (order: number[], pos: number) => {
  if (pos < 0 || pos >= order.length) return [...order];
  return order.filter((_, idx) => idx !== pos);
};

export const moveQueueByStep = (order: number[], pos: number, dir: -1 | 1) => {
  const target = pos + dir;
  if (target < 0 || target >= order.length) return [...order];
  return reorderQueue(order, pos, target);
};

export type PlaylistTrackRef = {
  id: number;
  kind: 'demo' | 'local';
  title: string;
  artist: string;
};

export type QueueTrackRef = PlaylistTrackRef;

export const mapPlaylistTracksToQueueIndexes = (playlistTracks: PlaylistTrackRef[], libraryTracks: QueueTrackRef[]) =>
  playlistTracks
    .map((saved) =>
      libraryTracks.findIndex((t) => t.id === saved.id || (t.kind === saved.kind && t.title === saved.title && t.artist === saved.artist)),
    )
    .filter((idx) => idx >= 0);

export const isLikelySupportedAudioInput = (name: string, mimeType: string, acceptedExtensions: string[]) => {
  const ext = `.${name.split('.').pop()?.toLowerCase() ?? ''}`;
  const mime = (mimeType || '').toLowerCase();
  const mimeLooksAudio = mime.startsWith('audio/') || mime === 'application/octet-stream' || mime === '';
  return acceptedExtensions.includes(ext) || mimeLooksAudio;
};

export const queueIsCleared = (order: number[], queuePos: number, progress: number, duration: number, isPlaying: boolean) =>
  order.length === 0 && queuePos === 0 && progress === 0 && duration === 0 && !isPlaying;

export const shouldReloadDeckTrack = (loadedTrackIndex: number | null, requestedTrackIndex: number) => loadedTrackIndex !== requestedTrackIndex;

export const shouldAutoplayAfterSwitch = (wasPlaying: boolean, hasUserGestureUnlock: boolean, mobileStrictPolicy: boolean) => {
  if (!wasPlaying) return false;
  if (!mobileStrictPolicy) return true;
  return hasUserGestureUnlock;
};

export const nextQueueOrderForNewTracks = (librarySizeBeforeAppend: number, appendedTracksCount: number) =>
  Array.from({ length: Math.max(0, appendedTracksCount) }, (_, i) => librarySizeBeforeAppend + i);

export const isStalePlaybackOperation = (requestSession: number, activeSession: number, requestOpId: number, activeOpId: number) =>
  requestSession !== activeSession || requestOpId !== activeOpId;
