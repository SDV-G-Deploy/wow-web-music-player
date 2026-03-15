import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

type Track = {
  id: number;
  title: string;
  artist: string;
  src: string;
  accent: string;
  artwork?: string;
};

type RepeatMode = 'off' | 'all' | 'one';
type FxIntensity = 'low' | 'med' | 'high';

const tracks: Track[] = [
  { id: 1, title: 'Neon Drift', artist: 'Demo Tone Lab', src: './audio/neon-drift.wav', accent: '#67e8f9', artwork: './favicon.svg' },
  { id: 2, title: 'Violet Pulse', artist: 'Demo Tone Lab', src: './audio/violet-pulse.wav', accent: '#c084fc', artwork: './favicon.svg' },
  { id: 3, title: 'Sunrise Glide', artist: 'Demo Tone Lab', src: './audio/sunrise-glide.wav', accent: '#fbbf24', artwork: './favicon.svg' },
];

const FX_MULTIPLIERS: Record<FxIntensity, number> = {
  low: 0.55,
  med: 1,
  high: 1.5,
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const shuffleKeepCurrent = (order: number[], currentTrackIndex: number) => {
  const rest = order.filter((item) => item !== currentTrackIndex);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [currentTrackIndex, ...rest];
};

const clampCrossfade = (seconds: number) => Math.max(0, Math.min(8, seconds));

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const progressRafRef = useRef<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodesRef = useRef<MediaElementAudioSourceNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);

  const decksRef = useRef<[HTMLAudioElement, HTMLAudioElement]>([
    new Audio(),
    new Audio(),
  ]);
  const activeDeckRef = useRef<0 | 1>(0);
  const currentTrackIndexRef = useRef(0);
  const crossfadeTimerRef = useRef<number | null>(null);

  const [queueOrder, setQueueOrder] = useState<number[]>(tracks.map((_, i) => i));
  const [queuePos, setQueuePos] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [visualizerReady, setVisualizerReady] = useState(true);

  const [crossfadeSec, setCrossfadeSec] = useState(2);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [fxIntensity, setFxIntensity] = useState<FxIntensity>('med');

  const [bassLevel, setBassLevel] = useState(0);
  const [midLevel, setMidLevel] = useState(0);
  const [trebleLevel, setTrebleLevel] = useState(0);

  const currentTrackIndex = queueOrder[queuePos] ?? 0;
  const currentTrack = tracks[currentTrackIndex];

  useEffect(() => {
    currentTrackIndexRef.current = currentTrackIndex;
  }, [currentTrackIndex]);

  const gradientStyle = useMemo(
    () =>
      ({
        '--track-accent': currentTrack.accent,
        '--fx-bass': bassLevel.toFixed(4),
        '--fx-mid': midLevel.toFixed(4),
        '--fx-treble': trebleLevel.toFixed(4),
      }) as React.CSSProperties,
    [currentTrack.accent, bassLevel, midLevel, trebleLevel],
  );

  const stopVisualizer = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  const stopProgressLoop = () => {
    if (progressRafRef.current) {
      cancelAnimationFrame(progressRafRef.current);
      progressRafRef.current = null;
    }
  };

  const clearCrossfadeTimer = () => {
    if (crossfadeTimerRef.current) {
      window.clearTimeout(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
  };

  const updateMediaSession = (trackIndex: number, playing: boolean) => {
    if (!('mediaSession' in navigator)) return;
    const track = tracks[trackIndex];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: 'Wow Web Music Player v2',
      artwork: track.artwork
        ? [
            { src: track.artwork, sizes: '96x96', type: 'image/svg+xml' },
            { src: track.artwork, sizes: '192x192', type: 'image/svg+xml' },
            { src: track.artwork, sizes: '512x512', type: 'image/svg+xml' },
          ]
        : undefined,
    });
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  };

  const updateMediaSessionPosition = () => {
    if (!('mediaSession' in navigator)) return;
    if (typeof navigator.mediaSession.setPositionState !== 'function') return;

    const activeDeck = decksRef.current[activeDeckRef.current];
    navigator.mediaSession.setPositionState({
      duration: Number.isFinite(activeDeck.duration) ? activeDeck.duration : 0,
      playbackRate: activeDeck.playbackRate || 1,
      position: Math.max(0, Math.min(activeDeck.currentTime || 0, activeDeck.duration || 0)),
    });
  };

  const ensureAudioGraph = () => {
    const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      setVisualizerReady(false);
      return false;
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }

    if (!analyserRef.current) {
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      analyserRef.current.smoothingTimeConstant = 0.86;
    }

    if (sourceNodesRef.current.length === 0) {
      const master = audioCtxRef.current.createGain();
      master.gain.value = 1;
      const analyser = analyserRef.current;

      sourceNodesRef.current = decksRef.current.map((deck) => {
        deck.preload = 'metadata';
        deck.crossOrigin = 'anonymous';
        return audioCtxRef.current!.createMediaElementSource(deck);
      });

      gainNodesRef.current = decksRef.current.map(() => {
        const gain = audioCtxRef.current!.createGain();
        gain.gain.value = 0;
        gain.connect(master);
        return gain;
      });

      sourceNodesRef.current.forEach((source, i) => source.connect(gainNodesRef.current[i]));
      master.connect(analyser);
      analyser.connect(audioCtxRef.current.destination);
    }

    setVisualizerReady(true);
    return true;
  };

  const drawVisualizer = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const bars = 56;
    const bucket = Math.max(1, Math.floor(bufferLength / bars));
    const smooth = { bass: 0, mid: 0, treble: 0 };

    const render = () => {
      if (!canvasRef.current || !analyserRef.current) return;
      const c = canvasRef.current;
      const a = analyserRef.current;
      const pixelRatio = window.devicePixelRatio || 1;
      const width = c.clientWidth;
      const height = c.clientHeight;
      const expectedW = Math.floor(width * pixelRatio);
      const expectedH = Math.floor(height * pixelRatio);

      if (c.width !== expectedW || c.height !== expectedH) {
        c.width = Math.max(1, expectedW);
        c.height = Math.max(1, expectedH);
      }

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      a.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, width, height);

      const intensity = FX_MULTIPLIERS[fxIntensity];
      const barWidth = width / bars;
      const hueShift = performance.now() * 0.014;

      for (let i = 0; i < bars; i++) {
        let sum = 0;
        const start = i * bucket;
        const end = Math.min(start + bucket, dataArray.length);
        for (let j = start; j < end; j++) sum += dataArray[j];
        const avg = sum / Math.max(1, end - start);
        const value = Math.pow(avg / 255, 1.3);
        const barHeight = value * height * (0.45 + intensity * 0.3);
        const x = i * barWidth;
        const y = height - barHeight;

        const hue = (i * 5 + hueShift) % 360;
        ctx.fillStyle = `hsla(${hue}, 92%, 65%, ${0.28 + value * 0.62})`;
        ctx.fillRect(x + 0.7, y, Math.max(1.3, barWidth - 1.8), barHeight);
      }

      const third = Math.floor(dataArray.length / 3);
      const getEnergy = (from: number, to: number) => {
        let sum = 0;
        for (let i = from; i < to; i++) sum += dataArray[i];
        return (sum / Math.max(1, to - from)) / 255;
      };

      const bassRaw = getEnergy(0, third) * intensity;
      const midRaw = getEnergy(third, third * 2) * intensity;
      const trebleRaw = getEnergy(third * 2, dataArray.length) * intensity;

      smooth.bass = smooth.bass * 0.85 + bassRaw * 0.15;
      smooth.mid = smooth.mid * 0.85 + midRaw * 0.15;
      smooth.treble = smooth.treble * 0.85 + trebleRaw * 0.15;

      setBassLevel(Math.min(1.4, smooth.bass));
      setMidLevel(Math.min(1.4, smooth.mid));
      setTrebleLevel(Math.min(1.4, smooth.treble));

      animationRef.current = requestAnimationFrame(render);
    };

    render();
  };

  const progressLoop = () => {
    const activeDeck = decksRef.current[activeDeckRef.current];
    if (!activeDeck.paused) {
      setProgress(activeDeck.currentTime || 0);
      setDuration(activeDeck.duration || 0);
      updateMediaSessionPosition();
      progressRafRef.current = requestAnimationFrame(progressLoop);
    }
  };

  const queueNextPosition = (pos: number, mode: RepeatMode) => {
    if (mode === 'one') return pos;
    const next = pos + 1;
    if (next < queueOrder.length) return next;
    if (mode === 'all') return 0;
    return -1;
  };

  const queuePrevPosition = (pos: number, mode: RepeatMode) => {
    if (mode === 'one') return pos;
    const prev = pos - 1;
    if (prev >= 0) return prev;
    if (mode === 'all') return queueOrder.length - 1;
    return -1;
  };

  const scheduleAutoCrossfade = (position: number) => {
    clearCrossfadeTimer();
    const activeDeck = decksRef.current[activeDeckRef.current];
    const remain = (activeDeck.duration || 0) - (activeDeck.currentTime || 0);
    const nextPos = queueNextPosition(position, repeatMode);
    const validNext = nextPos >= 0 && nextPos !== position;
    const fade = clampCrossfade(crossfadeSec);

    if (!isPlaying || !validNext || fade <= 0 || !Number.isFinite(remain) || remain <= fade + 0.05) return;

    crossfadeTimerRef.current = window.setTimeout(() => {
      void transitionToPosition(nextPos, true);
    }, Math.max(40, (remain - fade) * 1000));
  };

  const prepareDeck = async (deck: HTMLAudioElement, trackIndex: number) => {
    deck.src = tracks[trackIndex].src;
    deck.currentTime = 0;
    deck.load();

    if (deck.readyState < 1) {
      await new Promise<void>((resolve) => {
        const onLoaded = () => {
          deck.removeEventListener('loadedmetadata', onLoaded);
          resolve();
        };
        deck.addEventListener('loadedmetadata', onLoaded, { once: true });
      });
    }
  };

  const transitionToPosition = async (nextPos: number, crossfade: boolean) => {
    if (nextPos < 0 || nextPos >= queueOrder.length) {
      setIsPlaying(false);
      return;
    }

    const nextTrackIndex = queueOrder[nextPos];
    const fromDeckIndex = activeDeckRef.current;
    const toDeckIndex: 0 | 1 = fromDeckIndex === 0 ? 1 : 0;

    const fromDeck = decksRef.current[fromDeckIndex];
    const toDeck = decksRef.current[toDeckIndex];

    const canUseGraph = ensureAudioGraph();
    if (canUseGraph) await audioCtxRef.current?.resume();

    await prepareDeck(toDeck, nextTrackIndex);
    toDeck.volume = volume;

    const fade = clampCrossfade(crossfadeSec);
    const useCrossfade = crossfade && fade > 0 && !fromDeck.paused;

    setQueuePos(nextPos);
    setProgress(0);
    setDuration(toDeck.duration || 0);

    if (canUseGraph) {
      const ctx = audioCtxRef.current!;
      const now = ctx.currentTime;
      const fromGain = gainNodesRef.current[fromDeckIndex].gain;
      const toGain = gainNodesRef.current[toDeckIndex].gain;

      fromGain.cancelScheduledValues(now);
      toGain.cancelScheduledValues(now);

      if (useCrossfade) {
        toGain.setValueAtTime(0.001, now);
        toGain.exponentialRampToValueAtTime(1, now + fade);
        fromGain.setValueAtTime(Math.max(0.001, fromGain.value || 1), now);
        fromGain.exponentialRampToValueAtTime(0.001, now + fade);
      } else {
        fromGain.setValueAtTime(0.001, now);
        toGain.setValueAtTime(1, now);
      }
    }

    await toDeck.play();
    setIsPlaying(true);

    if (useCrossfade) {
      window.setTimeout(() => {
        fromDeck.pause();
        fromDeck.currentTime = 0;
      }, fade * 1000 + 40);
    } else {
      fromDeck.pause();
      fromDeck.currentTime = 0;
    }

    activeDeckRef.current = toDeckIndex;
    stopProgressLoop();
    progressLoop();
    drawVisualizer();
    updateMediaSession(nextTrackIndex, true);
    scheduleAutoCrossfade(nextPos);
  };

  const selectQueuePosition = async (position: number) => {
    if (position < 0 || position >= queueOrder.length) return;

    if (!isPlaying) {
      setQueuePos(position);
      setProgress(0);
      setDuration(0);
      updateMediaSession(queueOrder[position], false);
      return;
    }

    await transitionToPosition(position, true);
  };

  const nextTrack = async () => {
    const nextPos = queueNextPosition(queuePos, repeatMode);
    if (nextPos < 0) {
      setIsPlaying(false);
      return;
    }
    await transitionToPosition(nextPos, true);
  };

  const prevTrack = async () => {
    const activeDeck = decksRef.current[activeDeckRef.current];
    if ((activeDeck.currentTime || 0) > 2.5 && repeatMode !== 'one') {
      activeDeck.currentTime = 0;
      setProgress(0);
      return;
    }

    const prevPos = queuePrevPosition(queuePos, repeatMode);
    if (prevPos < 0) {
      activeDeck.currentTime = 0;
      setProgress(0);
      return;
    }

    await transitionToPosition(prevPos, true);
  };

  const togglePlay = async () => {
    const activeDeck = decksRef.current[activeDeckRef.current];

    if (isPlaying) {
      activeDeck.pause();
      setIsPlaying(false);
      stopProgressLoop();
      clearCrossfadeTimer();
      updateMediaSession(currentTrackIndexRef.current, false);
      return;
    }

    const canUseGraph = ensureAudioGraph();
    if (canUseGraph) {
      await audioCtxRef.current?.resume();
      const gain = gainNodesRef.current[activeDeckRef.current]?.gain;
      const now = audioCtxRef.current!.currentTime;
      if (gain) {
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(1, now);
      }
    }

    if (!activeDeck.src) {
      await prepareDeck(activeDeck, currentTrackIndexRef.current);
    }

    activeDeck.volume = volume;
    await activeDeck.play();
    setIsPlaying(true);
    drawVisualizer();
    stopProgressLoop();
    progressLoop();
    updateMediaSession(currentTrackIndexRef.current, true);
    scheduleAutoCrossfade(queuePos);
  };

  useEffect(() => {
    const graphReady = ensureAudioGraph();
    if (graphReady) {
      gainNodesRef.current[0].gain.value = 1;
      gainNodesRef.current[1].gain.value = 0.001;
    }

    const deckA = decksRef.current[0];
    const deckB = decksRef.current[1];
    deckA.volume = volume;
    deckB.volume = volume;

    const onEnded = () => {
      if (crossfadeSec > 0) return;
      const nextPos = queueNextPosition(queuePos, repeatMode);
      if (nextPos < 0) {
        setIsPlaying(false);
        return;
      }
      void transitionToPosition(nextPos, false);
    };

    deckA.addEventListener('ended', onEnded);
    deckB.addEventListener('ended', onEnded);

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => void togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => void togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => void prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => void nextTrack());
    }

    updateMediaSession(currentTrackIndexRef.current, false);

    return () => {
      deckA.removeEventListener('ended', onEnded);
      deckB.removeEventListener('ended', onEnded);
      stopVisualizer();
      stopProgressLoop();
      clearCrossfadeTimer();
      deckA.pause();
      deckB.pause();
      void audioCtxRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    decksRef.current[0].volume = volume;
    decksRef.current[1].volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!isPlaying) return;
    scheduleAutoCrossfade(queuePos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuePos, crossfadeSec, repeatMode, isPlaying]);

  useEffect(() => {
    updateMediaSession(currentTrackIndex, isPlaying);
  }, [currentTrackIndex, isPlaying]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        void togglePlay();
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const deck = decksRef.current[activeDeckRef.current];
        deck.currentTime = Math.min((deck.currentTime || 0) + 5, deck.duration || 0);
        setProgress(deck.currentTime || 0);
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const deck = decksRef.current[activeDeckRef.current];
        deck.currentTime = Math.max((deck.currentTime || 0) - 5, 0);
        setProgress(deck.currentTime || 0);
      }
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setVolume((v) => (v > 0 ? 0 : 0.75));
      }
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void nextTrack();
      }
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        void prevTrack();
      }
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        setShuffle((v) => !v);
      }
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, queuePos, repeatMode, crossfadeSec]);

  const toggleShuffle = () => {
    setShuffle((prev) => {
      if (!prev) {
        const shuffled = shuffleKeepCurrent(queueOrder, currentTrackIndex);
        setQueueOrder(shuffled);
        setQueuePos(0);
        return true;
      }

      const ordered = tracks.map((_, i) => i);
      setQueueOrder(ordered);
      const nextPos = ordered.indexOf(currentTrackIndexRef.current);
      setQueuePos(Math.max(0, nextPos));
      return false;
    });
  };

  return (
    <main className="app" style={gradientStyle}>
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />
      <section className="player-card">
        <header className="player-header">
          <p className="eyebrow">Wow Web Music Player v2</p>
          <h1>{currentTrack.title}</h1>
          <p>{currentTrack.artist}</p>
        </header>

        <canvas ref={canvasRef} className="visualizer" aria-label="Audio visualizer" />
        {!visualizerReady && <p className="fallback">Visualizer unavailable in this browser — audio controls still work.</p>}

        <div className="timeline">
          <span>{formatTime(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(progress, duration || progress || 0)}
            onChange={(e) => {
              const deck = decksRef.current[activeDeckRef.current];
              const time = Number(e.target.value);
              deck.currentTime = time;
              setProgress(time);
              scheduleAutoCrossfade(queuePos);
            }}
          />
          <span>{formatTime(duration)}</span>
        </div>

        <div className="controls">
          <button onClick={() => void prevTrack()} aria-label="Previous track">
            ⏮
          </button>
          <button className="play-btn" onClick={() => void togglePlay()} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button onClick={() => void nextTrack()} aria-label="Next track">
            ⏭
          </button>
        </div>

        <div className="control-grid">
          <label className="volume">
            <span>🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
            />
          </label>

          <label className="crossfade">
            <span>Crossfade {crossfadeSec.toFixed(1)}s</span>
            <input
              type="range"
              min={0}
              max={8}
              step={0.5}
              value={crossfadeSec}
              onChange={(e) => setCrossfadeSec(clampCrossfade(Number(e.target.value)))}
              aria-label="Crossfade duration"
            />
          </label>
        </div>

        <div className="mode-row" role="group" aria-label="Playback modes">
          <button className={shuffle ? 'chip active' : 'chip'} onClick={toggleShuffle} aria-pressed={shuffle}>
            Shuffle {shuffle ? 'On' : 'Off'}
          </button>
          <button
            className="chip"
            onClick={() => setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'))}
            aria-label="Repeat mode"
          >
            Repeat: {repeatMode}
          </button>
          <label className="chip fx-chip">
            FX
            <select value={fxIntensity} onChange={(e) => setFxIntensity(e.target.value as FxIntensity)} aria-label="Effect intensity">
              <option value="low">low</option>
              <option value="med">med</option>
              <option value="high">high</option>
            </select>
          </label>
        </div>

        <section className="queue-box" aria-label="Queue order">
          <p className="queue-title">Queue ({shuffle ? 'shuffled' : 'ordered'})</p>
          <ul className="playlist">
            {queueOrder.map((trackIndex, position) => {
              const track = tracks[trackIndex];
              const isCurrent = position === queuePos;
              return (
                <li key={`${track.id}-${position}`}>
                  <button
                    className={isCurrent ? 'active' : ''}
                    onClick={() => void selectQueuePosition(position)}
                    aria-label={`Play ${track.title}`}
                  >
                    <strong>
                      {position + 1}. {track.title}
                    </strong>
                    <span>{track.artist}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="shortcuts">
          <span>Space: play/pause</span>
          <span>←/→: seek ±5s</span>
          <span>N/P: next/prev</span>
          <span>S: shuffle</span>
          <span>R: repeat mode</span>
          <span>M: mute</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
