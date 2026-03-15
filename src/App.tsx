import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

type RepeatMode = 'off' | 'all' | 'one';
type FxIntensity = 'low' | 'med' | 'high';
type VisualPreset = 'neon' | 'calm' | 'club';

type PresetConfig = {
  label: string;
  defaultIntensity: FxIntensity;
  palette: [string, string, string];
  motion: number;
  animation: number;
};

type Track = {
  id: number;
  title: string;
  artist: string;
  src: string;
  accent: string;
  artwork?: string;
  kind: 'demo' | 'local';
  file?: File;
};

type PersistedSettings = {
  version: 4;
  preset: VisualPreset;
  intensity: FxIntensity;
  crossfade: number;
  repeat: RepeatMode;
  volume: number;
  presets: Record<VisualPreset, PresetConfig>;
};

const DEMO_TRACKS: Track[] = [
  { id: 1, title: 'Neon Drift', artist: 'Demo Tone Lab', src: './audio/neon-drift.wav', accent: '#67e8f9', artwork: './favicon.svg', kind: 'demo' },
  { id: 2, title: 'Violet Pulse', artist: 'Demo Tone Lab', src: './audio/violet-pulse.wav', accent: '#c084fc', artwork: './favicon.svg', kind: 'demo' },
  { id: 3, title: 'Sunrise Glide', artist: 'Demo Tone Lab', src: './audio/sunrise-glide.wav', accent: '#fbbf24', artwork: './favicon.svg', kind: 'demo' },
];

const DEFAULT_PRESETS: Record<VisualPreset, PresetConfig> = {
  neon: { label: 'Neon', defaultIntensity: 'med', palette: ['#22d3ee', '#a855f7', '#38bdf8'], motion: 1, animation: 1 },
  calm: { label: 'Calm', defaultIntensity: 'low', palette: ['#5eead4', '#93c5fd', '#c4b5fd'], motion: 0.72, animation: 0.85 },
  club: { label: 'Club', defaultIntensity: 'high', palette: ['#f43f5e', '#f59e0b', '#06b6d4'], motion: 1.28, animation: 1.2 },
};

const STORAGE_KEY = 'wwmp-settings-v4';
const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a'];

const FX_MULTIPLIERS: Record<FxIntensity, number> = {
  low: 0.55,
  med: 1,
  high: 1.45,
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const clampCrossfade = (seconds: number) => Math.max(0, Math.min(8, seconds));
const clampVolume = (volume: number) => Math.max(0, Math.min(1, volume));
const clampMotion = (value: number) => Math.max(0.45, Math.min(1.8, value));

const isPreset = (value: unknown): value is VisualPreset => typeof value === 'string' && value in DEFAULT_PRESETS;
const isIntensity = (value: unknown): value is FxIntensity => value === 'low' || value === 'med' || value === 'high';
const isRepeat = (value: unknown): value is RepeatMode => value === 'off' || value === 'all' || value === 'one';
const isHexColor = (value: unknown) => typeof value === 'string' && /^#[\da-fA-F]{6}$/.test(value);

const normalizePresetConfig = (value: unknown, fallback: PresetConfig): PresetConfig => {
  if (!value || typeof value !== 'object') return fallback;
  const cfg = value as Partial<PresetConfig>;
  const p = Array.isArray(cfg.palette) ? cfg.palette : fallback.palette;
  return {
    label: typeof cfg.label === 'string' && cfg.label.trim() ? cfg.label : fallback.label,
    defaultIntensity: isIntensity(cfg.defaultIntensity) ? cfg.defaultIntensity : fallback.defaultIntensity,
    palette: [
      isHexColor(p[0]) ? p[0] : fallback.palette[0],
      isHexColor(p[1]) ? p[1] : fallback.palette[1],
      isHexColor(p[2]) ? p[2] : fallback.palette[2],
    ],
    motion: clampMotion(Number(cfg.motion ?? fallback.motion)),
    animation: clampMotion(Number(cfg.animation ?? fallback.animation)),
  };
};

const loadSettings = (): PersistedSettings => {
  const defaults: PersistedSettings = {
    version: 4,
    preset: 'neon',
    intensity: DEFAULT_PRESETS.neon.defaultIntensity,
    crossfade: 2,
    repeat: 'all',
    volume: 0.75,
    presets: DEFAULT_PRESETS,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedSettings> & { fxIntensity?: FxIntensity; repeatMode?: RepeatMode };

    const preset = isPreset(parsed.preset) ? parsed.preset : defaults.preset;
    const intensityCandidate = parsed.intensity ?? parsed.fxIntensity;
    const repeatCandidate = parsed.repeat ?? parsed.repeatMode;

    const inputPresets = (parsed.presets ?? {}) as Partial<Record<VisualPreset, PresetConfig>>;
    const presets: Record<VisualPreset, PresetConfig> = {
      neon: normalizePresetConfig(inputPresets.neon, DEFAULT_PRESETS.neon),
      calm: normalizePresetConfig(inputPresets.calm, DEFAULT_PRESETS.calm),
      club: normalizePresetConfig(inputPresets.club, DEFAULT_PRESETS.club),
    };

    return {
      version: 4,
      preset,
      intensity: isIntensity(intensityCandidate) ? intensityCandidate : presets[preset].defaultIntensity,
      crossfade: clampCrossfade(Number(parsed.crossfade ?? defaults.crossfade)),
      repeat: isRepeat(repeatCandidate) ? repeatCandidate : defaults.repeat,
      volume: clampVolume(Number(parsed.volume ?? defaults.volume)),
      presets,
    };
  } catch {
    return defaults;
  }
};

const queueNextPosition = (pos: number, mode: RepeatMode, orderLength: number) => {
  if (mode === 'one') return pos;
  const next = pos + 1;
  if (next < orderLength) return next;
  if (mode === 'all') return 0;
  return -1;
};

const queuePrevPosition = (pos: number, mode: RepeatMode, orderLength: number) => {
  if (mode === 'one') return pos;
  const prev = pos - 1;
  if (prev >= 0) return prev;
  if (mode === 'all') return orderLength - 1;
  return -1;
};

const shuffleKeepCurrent = (order: number[], currentTrackIndex: number) => {
  const rest = order.filter((item) => item !== currentTrackIndex);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [currentTrackIndex, ...rest];
};

const estimateIntegratedLufs = (buffer: AudioBuffer) => {
  const blockSize = Math.max(2048, Math.floor(buffer.sampleRate * 0.4));
  const hop = Math.max(512, Math.floor(blockSize * 0.25));
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const powers: number[] = [];

  for (let offset = 0; offset + blockSize < buffer.length; offset += hop) {
    let sumSq = 0;
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = offset; i < offset + blockSize; i++) {
        const x = data[i];
        sumSq += x * x;
      }
    }
    const meanSq = sumSq / (blockSize * channels);
    if (meanSq > 1e-12) powers.push(meanSq);
  }

  if (!powers.length) return -32;

  const toLufs = (p: number) => -0.691 + 10 * Math.log10(Math.max(1e-12, p));
  const absoluteGated = powers.filter((p) => toLufs(p) > -70);
  if (!absoluteGated.length) return -32;

  const ungatedPower = absoluteGated.reduce((acc, v) => acc + v, 0) / absoluteGated.length;
  const relativeGate = toLufs(ungatedPower) - 10;
  const relativeGated = absoluteGated.filter((p) => toLufs(p) >= relativeGate);

  const integratedPower = (relativeGated.length ? relativeGated : absoluteGated).reduce((acc, v) => acc + v, 0) /
    (relativeGated.length || absoluteGated.length);

  return toLufs(integratedPower);
};

function App() {
  const initial = useMemo(() => loadSettings(), []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const progressRafRef = useRef<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodesRef = useRef<MediaElementAudioSourceNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);

  const decksRef = useRef<[HTMLAudioElement, HTMLAudioElement]>([new Audio(), new Audio()]);
  const deckTrackRef = useRef<[number | null, number | null]>([null, null]);
  const activeDeckRef = useRef<0 | 1>(0);
  const currentTrackIndexRef = useRef(0);
  const crossfadeTimerRef = useRef<number | null>(null);
  const loudnessTimerRef = useRef<number | null>(null);
  const loudnessMapRef = useRef<Record<number, number>>({});
  const loudnessPendingRef = useRef<Record<number, boolean>>({});

  const [tracks, setTracks] = useState<Track[]>(DEMO_TRACKS);
  const [queueOrder, setQueueOrder] = useState<number[]>(DEMO_TRACKS.map((_, i) => i));
  const [queuePos, setQueuePos] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initial.volume);
  const [visualizerReady, setVisualizerReady] = useState(true);
  const [uploadStatus, setUploadStatus] = useState('');

  const [crossfadeSec, setCrossfadeSec] = useState(initial.crossfade);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(initial.repeat);
  const [fxIntensity, setFxIntensity] = useState<FxIntensity>(initial.intensity);
  const [preset, setPreset] = useState<VisualPreset>(initial.preset);
  const [presetConfigs, setPresetConfigs] = useState<Record<VisualPreset, PresetConfig>>(initial.presets);

  const [bassLevel, setBassLevel] = useState(0);
  const [midLevel, setMidLevel] = useState(0);
  const [trebleLevel, setTrebleLevel] = useState(0);

  const currentTrackIndex = queueOrder[queuePos] ?? 0;
  const currentTrack = tracks[currentTrackIndex];
  const presetConfig = presetConfigs[preset];

  useEffect(() => {
    currentTrackIndexRef.current = currentTrackIndex;
  }, [currentTrackIndex]);

  useEffect(() => {
    const payload: PersistedSettings = {
      version: 4,
      preset,
      intensity: fxIntensity,
      crossfade: clampCrossfade(crossfadeSec),
      repeat: repeatMode,
      volume: clampVolume(volume),
      presets: presetConfigs,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [preset, fxIntensity, crossfadeSec, repeatMode, volume, presetConfigs]);

  const gradientStyle = useMemo(
    () =>
      ({
        '--track-accent': currentTrack?.accent ?? '#67e8f9',
        '--fx-bass': bassLevel.toFixed(4),
        '--fx-mid': midLevel.toFixed(4),
        '--fx-treble': trebleLevel.toFixed(4),
        '--preset-a': presetConfig.palette[0],
        '--preset-b': presetConfig.palette[1],
        '--preset-c': presetConfig.palette[2],
        '--motion-mult': String(presetConfig.motion),
        '--anim-mult': String(presetConfig.animation),
      }) as React.CSSProperties,
    [currentTrack?.accent, bassLevel, midLevel, trebleLevel, presetConfig],
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

  const clearLoudnessTimer = () => {
    if (loudnessTimerRef.current) {
      window.clearInterval(loudnessTimerRef.current);
      loudnessTimerRef.current = null;
    }
  };

  const updateMediaSession = (trackIndex: number, playing: boolean) => {
    if (!('mediaSession' in navigator)) return;
    const track = tracks[trackIndex];
    if (!track) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: 'Wow Web Music Player v4',
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

    if (!audioCtxRef.current) audioCtxRef.current = new Ctx();

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
        deck.preload = 'auto';
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

  const applyDeckGain = (deckIndex: 0 | 1, strength = 1) => {
    const trackIndex = deckTrackRef.current[deckIndex];
    if (trackIndex == null) return;
    const gainNode = gainNodesRef.current[deckIndex];
    if (!gainNode || !audioCtxRef.current) return;

    const now = audioCtxRef.current.currentTime;
    const loudnessComp = loudnessMapRef.current[trackIndex] ?? 1;
    const target = Math.max(0.001, Math.min(1.9, loudnessComp * strength));
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setTargetAtTime(target, now, 0.06);
  };

  const analyzeTrackLoudness = async (trackIndex: number) => {
    if (loudnessMapRef.current[trackIndex] || loudnessPendingRef.current[trackIndex]) return;
    const track = tracks[trackIndex];
    if (!track) return;

    loudnessPendingRef.current[trackIndex] = true;

    try {
      const ctx = audioCtxRef.current ?? new AudioContext();
      if (!audioCtxRef.current) audioCtxRef.current = ctx;

      const arrayBuffer = track.file
        ? await track.file.arrayBuffer()
        : await fetch(track.src).then(async (res) => {
            if (!res.ok) throw new Error('Audio fetch failed');
            return res.arrayBuffer();
          });

      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const lufs = estimateIntegratedLufs(decoded);
      const targetLufs = -16;
      const gainDb = Math.max(-8, Math.min(8, targetLufs - lufs));
      const compensation = Math.pow(10, gainDb / 20);
      loudnessMapRef.current[trackIndex] = compensation;
      applyDeckGain(activeDeckRef.current);
    } catch {
      loudnessMapRef.current[trackIndex] = 1;
    } finally {
      delete loudnessPendingRef.current[trackIndex];
    }
  };

  const startLoudnessMonitor = () => {
    clearLoudnessTimer();
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const target = 0.2;

    loudnessTimerRef.current = window.setInterval(() => {
      if (!isPlaying) return;
      analyser.getByteTimeDomainData(bins);
      let sum = 0;
      for (let i = 0; i < bins.length; i++) {
        const x = (bins[i] - 128) / 128;
        sum += x * x;
      }
      const rms = Math.sqrt(sum / bins.length);
      const activeTrackIndex = deckTrackRef.current[activeDeckRef.current];
      if (activeTrackIndex == null) return;

      const micro = Math.max(0.85, Math.min(1.15, target / Math.max(0.08, rms)));
      const base = loudnessMapRef.current[activeTrackIndex] ?? 1;
      const prev = loudnessMapRef.current[activeTrackIndex] ?? 1;
      loudnessMapRef.current[activeTrackIndex] = prev * 0.92 + (base * micro) * 0.08;
      applyDeckGain(activeDeckRef.current);
    }, 420);
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

      const intensity = FX_MULTIPLIERS[fxIntensity] * presetConfig.motion;
      const barWidth = width / bars;
      const hueShift = performance.now() * 0.014 * presetConfig.animation;

      for (let i = 0; i < bars; i++) {
        let sum = 0;
        const start = i * bucket;
        const end = Math.min(start + bucket, dataArray.length);
        for (let j = start; j < end; j++) sum += dataArray[j];
        const avg = sum / Math.max(1, end - start);
        const value = Math.pow(avg / 255, 1.3);
        const barHeight = value * height * (0.42 + intensity * 0.28);
        const x = i * barWidth;
        const y = height - barHeight;

        const hue = (i * 5 + hueShift) % 360;
        ctx.fillStyle = `hsla(${hue}, 92%, 65%, ${0.24 + value * 0.58})`;
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

  const scheduleAutoCrossfade = (position: number) => {
    clearCrossfadeTimer();
    const activeDeck = decksRef.current[activeDeckRef.current];
    const remain = (activeDeck.duration || 0) - (activeDeck.currentTime || 0);
    const nextPos = queueNextPosition(position, repeatMode, queueOrder.length);
    const validNext = nextPos >= 0 && nextPos !== position;
    const fade = clampCrossfade(crossfadeSec);

    if (!isPlaying || !validNext || fade <= 0 || !Number.isFinite(remain) || remain <= fade + 0.06) return;

    crossfadeTimerRef.current = window.setTimeout(() => {
      void transitionToPosition(nextPos, true);
    }, Math.max(40, (remain - fade) * 1000));
  };

  const prepareDeck = async (deckIndex: 0 | 1, trackIndex: number) => {
    const deck = decksRef.current[deckIndex];
    const track = tracks[trackIndex];
    if (!track) return;

    if (deckTrackRef.current[deckIndex] === trackIndex && deck.src) return;

    deck.src = track.src;
    deck.load();
    deckTrackRef.current[deckIndex] = trackIndex;

    void analyzeTrackLoudness(trackIndex);

    if (deck.readyState < 3) {
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          cleanup();
          resolve();
        };
        const fail = () => {
          cleanup();
          reject(new Error('Unable to load track'));
        };
        const cleanup = () => {
          deck.removeEventListener('canplaythrough', done);
          deck.removeEventListener('error', fail);
        };
        deck.addEventListener('canplaythrough', done, { once: true });
        deck.addEventListener('error', fail, { once: true });
      });
    }
  };

  const prewarmNextDeck = async (fromPosition: number) => {
    const nextPos = queueNextPosition(fromPosition, repeatMode, queueOrder.length);
    if (nextPos < 0) return;

    const nextTrackIndex = queueOrder[nextPos];
    const standby: 0 | 1 = activeDeckRef.current === 0 ? 1 : 0;
    await prepareDeck(standby, nextTrackIndex);
  };

  const transitionToPosition = async (nextPos: number, crossfade: boolean) => {
    if (nextPos < 0 || nextPos >= queueOrder.length) {
      setIsPlaying(false);
      return;
    }

    setIsTransitioning(true);

    const nextTrackIndex = queueOrder[nextPos];
    const fromDeckIndex = activeDeckRef.current;
    const toDeckIndex: 0 | 1 = fromDeckIndex === 0 ? 1 : 0;

    const fromDeck = decksRef.current[fromDeckIndex];
    const toDeck = decksRef.current[toDeckIndex];

    const canUseGraph = ensureAudioGraph();
    if (canUseGraph) await audioCtxRef.current?.resume();

    await prepareDeck(toDeckIndex, nextTrackIndex);

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
      const targetTo = Math.max(0.001, Math.min(1.9, loudnessMapRef.current[nextTrackIndex] ?? 1));

      fromGain.cancelScheduledValues(now);
      toGain.cancelScheduledValues(now);

      if (useCrossfade) {
        toGain.setValueAtTime(0.001, now);
        toGain.exponentialRampToValueAtTime(targetTo, now + fade);
        fromGain.setValueAtTime(Math.max(0.001, fromGain.value || 1), now);
        fromGain.exponentialRampToValueAtTime(0.001, now + fade);
      } else {
        toGain.setValueAtTime(0.001, now);
        toGain.exponentialRampToValueAtTime(targetTo, now + 0.018);
        fromGain.setValueAtTime(Math.max(0.001, fromGain.value || 1), now);
        fromGain.exponentialRampToValueAtTime(0.001, now + 0.018);
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
    startLoudnessMonitor();
    updateMediaSession(nextTrackIndex, true);
    scheduleAutoCrossfade(nextPos);
    void prewarmNextDeck(nextPos);
    setIsTransitioning(false);
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
    const nextPos = queueNextPosition(queuePos, repeatMode, queueOrder.length);
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

    const prevPos = queuePrevPosition(queuePos, repeatMode, queueOrder.length);
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
      clearLoudnessTimer();
      updateMediaSession(currentTrackIndexRef.current, false);
      return;
    }

    const canUseGraph = ensureAudioGraph();
    if (canUseGraph) {
      await audioCtxRef.current?.resume();
      applyDeckGain(activeDeckRef.current);
    }

    if (!activeDeck.src) {
      await prepareDeck(activeDeckRef.current, currentTrackIndexRef.current);
    }

    await activeDeck.play();
    setIsPlaying(true);
    drawVisualizer();
    startLoudnessMonitor();
    stopProgressLoop();
    progressLoop();
    updateMediaSession(currentTrackIndexRef.current, true);
    scheduleAutoCrossfade(queuePos);
    void prewarmNextDeck(queuePos);
  };

  const applyVolume = (nextVolume: number) => {
    setVolume(nextVolume);
    decksRef.current.forEach((deck) => {
      deck.volume = nextVolume;
    });
  };

  const validateAudioFile = async (file: File) => {
    const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported format: ${file.name}`);
    }

    await new Promise<void>((resolve, reject) => {
      const probe = new Audio();
      const url = URL.createObjectURL(file);
      const cleanup = () => {
        probe.src = '';
        URL.revokeObjectURL(url);
      };
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        cleanup();
        resolve();
      };
      probe.onerror = () => {
        cleanup();
        reject(new Error(`Broken or unsupported file: ${file.name}`));
      };
      probe.src = url;
    });
  };

  const handleLocalFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    setUploadStatus(`Checking ${files.length} file(s)…`);

    const valid: Track[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        await validateAudioFile(file);
        const url = URL.createObjectURL(file);
        valid.push({
          id: Date.now() + Math.random(),
          title: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Local file',
          src: url,
          accent: '#7dd3fc',
          artwork: './favicon.svg',
          kind: 'local',
          file,
        });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    if (valid.length) {
      setTracks((prev) => {
        const next = [...prev, ...valid];
        setQueueOrder((prevOrder) => [...prevOrder, ...valid.map((_, i) => prev.length + i)]);
        return next;
      });
    }

    if (valid.length && errors.length) {
      setUploadStatus(`Added ${valid.length}. Skipped ${errors.length}: ${errors[0]}`);
    } else if (valid.length) {
      setUploadStatus(`Added ${valid.length} local track(s) to queue.`);
    } else {
      setUploadStatus(errors[0] ?? 'No files were added.');
    }
  };

  useEffect(() => {
    if (!tracks.length) return;

    const graphReady = ensureAudioGraph();
    if (graphReady) {
      gainNodesRef.current[0].gain.value = 1;
      gainNodesRef.current[1].gain.value = 0.001;
    }

    const deckA = decksRef.current[0];
    const deckB = decksRef.current[1];

    const onEnded = () => {
      if (crossfadeSec > 0) return;
      const nextPos = queueNextPosition(queuePos, repeatMode, queueOrder.length);
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
      clearLoudnessTimer();
      deckA.pause();
      deckB.pause();
      tracks.forEach((t) => {
        if (t.kind === 'local') URL.revokeObjectURL(t.src);
      });
      void audioCtxRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    decksRef.current.forEach((deck) => {
      deck.volume = volume;
    });
  }, [volume]);

  useEffect(() => {
    if (!isPlaying) return;
    scheduleAutoCrossfade(queuePos);
    void prewarmNextDeck(queuePos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuePos, crossfadeSec, repeatMode, isPlaying, tracks.length]);

  useEffect(() => {
    updateMediaSession(currentTrackIndex, isPlaying);
  }, [currentTrackIndex, isPlaying]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

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
        applyVolume(volume > 0 ? 0 : 0.75);
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
  }, [isPlaying, queuePos, repeatMode, crossfadeSec, volume]);

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

  const handlePreset = (nextPreset: VisualPreset) => {
    setPreset(nextPreset);
    setFxIntensity(presetConfigs[nextPreset].defaultIntensity);
  };

  const updatePresetField = (patch: Partial<PresetConfig>) => {
    setPresetConfigs((prev) => ({
      ...prev,
      [preset]: {
        ...prev[preset],
        ...patch,
      },
    }));
  };

  const exportPresets = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      presets: presetConfigs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wwmp-presets-v4.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importPresets = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { presets?: Partial<Record<VisualPreset, PresetConfig>> };
      if (!parsed.presets) throw new Error('No presets block');
      setPresetConfigs({
        neon: normalizePresetConfig(parsed.presets.neon, presetConfigs.neon),
        calm: normalizePresetConfig(parsed.presets.calm, presetConfigs.calm),
        club: normalizePresetConfig(parsed.presets.club, presetConfigs.club),
      });
      setUploadStatus('Presets imported successfully.');
    } catch {
      setUploadStatus('Preset import failed: invalid JSON format.');
    }
  };

  if (!tracks.length) {
    return (
      <main className="app" style={gradientStyle}>
        <section className="player-card empty-state" aria-live="polite">
          <h1>Queue is empty</h1>
          <p>Add audio files to start playback.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app" style={gradientStyle}>
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />
      <section className="player-card">
        <header className="player-header">
          <p className="eyebrow">Wow Web Music Player v4</p>
          <h1>{currentTrack?.title ?? 'No track'}</h1>
          <p>{currentTrack?.artist ?? '—'}</p>
        </header>

        <canvas ref={canvasRef} className="visualizer" aria-label="Audio visualizer" />
        {!visualizerReady && <p className="fallback">Visualizer unavailable in this browser — audio controls still work.</p>}
        {isTransitioning && <p className="loading-state" aria-live="polite">Loading next track…</p>}
        {uploadStatus && <p className="upload-status" aria-live="polite">{uploadStatus}</p>}

        <div className="upload-zone">
          <label className="upload-btn">
            + Add your music
            <input
              type="file"
              accept=".mp3,.wav,.ogg,.m4a,audio/*"
              multiple
              onChange={(e) => {
                void handleLocalFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <p>Local only in your browser. Supported: mp3, wav, ogg, m4a (codec support depends on browser).</p>
        </div>

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
            aria-label="Track position"
          />
          <span>{formatTime(duration)}</span>
        </div>

        <div className="controls" role="group" aria-label="Primary playback controls">
          <button onClick={() => void prevTrack()} aria-label="Previous track">⏮</button>
          <button className="play-btn" onClick={() => void togglePlay()} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button onClick={() => void nextTrack()} aria-label="Next track">⏭</button>
        </div>

        <div className="preset-row" role="group" aria-label="Visual presets">
          {(Object.keys(presetConfigs) as VisualPreset[]).map((key) => (
            <button
              key={key}
              className={preset === key ? 'chip active' : 'chip'}
              onClick={() => handlePreset(key)}
              aria-pressed={preset === key}
              aria-label={`Use ${presetConfigs[key].label} preset`}
            >
              {presetConfigs[key].label}
            </button>
          ))}
        </div>

        <section className="preset-editor" aria-label="Preset editor">
          <p className="queue-title">Preset editor ({presetConfigs[preset].label})</p>
          <div className="preset-colors">
            {presetConfigs[preset].palette.map((c, i) => (
              <label key={`${preset}-${i}`} className="color-row">
                C{i + 1}
                <input
                  type="color"
                  value={c}
                  onChange={(e) => {
                    const next = [...presetConfigs[preset].palette] as [string, string, string];
                    next[i] = e.target.value;
                    updatePresetField({ palette: next });
                  }}
                />
              </label>
            ))}
          </div>
          <div className="preset-sliders">
            <label>
              Motion {presetConfigs[preset].motion.toFixed(2)}
              <input
                type="range"
                min={0.45}
                max={1.8}
                step={0.01}
                value={presetConfigs[preset].motion}
                onChange={(e) => updatePresetField({ motion: clampMotion(Number(e.target.value)) })}
              />
            </label>
            <label>
              Animation {presetConfigs[preset].animation.toFixed(2)}
              <input
                type="range"
                min={0.45}
                max={1.8}
                step={0.01}
                value={presetConfigs[preset].animation}
                onChange={(e) => updatePresetField({ animation: clampMotion(Number(e.target.value)) })}
              />
            </label>
            <label>
              Default FX
              <select
                value={presetConfigs[preset].defaultIntensity}
                onChange={(e) => updatePresetField({ defaultIntensity: e.target.value as FxIntensity })}
              >
                <option value="low">low</option>
                <option value="med">med</option>
                <option value="high">high</option>
              </select>
            </label>
          </div>
          <div className="preset-actions">
            <button className="chip" onClick={exportPresets}>Export JSON</button>
            <label className="chip import-chip">
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => void importPresets(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </section>

        <div className="control-grid">
          <label className="volume">
            <span>🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => applyVolume(Number(e.target.value))}
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
          <button className={shuffle ? 'chip active' : 'chip'} onClick={toggleShuffle} aria-pressed={shuffle} aria-label="Toggle shuffle mode">
            Shuffle {shuffle ? 'On' : 'Off'}
          </button>
          <button
            className="chip"
            onClick={() => setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'))}
            aria-label="Toggle repeat mode"
          >
            Repeat: {repeatMode}
          </button>
          <label className="chip fx-chip" aria-label="Effect intensity selector">
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
              if (!track) return null;
              const isCurrent = position === queuePos;
              return (
                <li key={`${track.id}-${position}`}>
                  <button className={isCurrent ? 'active' : ''} onClick={() => void selectQueuePosition(position)} aria-label={`Play ${track.title}`}>
                    <strong>{position + 1}. {track.title}</strong>
                    <span>{track.artist}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="shortcuts" aria-label="Keyboard shortcuts">
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
