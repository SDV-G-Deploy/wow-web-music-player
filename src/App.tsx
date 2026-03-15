import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  isLikelySupportedAudioInput,
  isStalePlaybackOperation,
  nextQueueOrderForNewTracks,
  queueIsCleared,
  queueNextPosition,
  queuePrevPosition,
  removeQueuePosition,
  reorderQueue,
  shouldAutoplayAfterSwitch,
  shouldReloadDeckTrack,
  shuffleKeepCurrent,
  type RepeatMode,
} from './playbackLogic';

type FxIntensity = 'low' | 'med' | 'high';
type VisualPreset = 'neon' | 'calm' | 'club';
type VisualizerQuality = 'off' | 'light' | 'full';

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

type UserPlaylistTrack = {
  id: number;
  kind: Track['kind'];
  title: string;
  artist: string;
};

type UserPlaylist = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tracks: UserPlaylistTrack[];
};

type PersistedPlaylists = {
  version: 1;
  playlists: UserPlaylist[];
};

type ToastTone = 'ok' | 'warn' | 'error';
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
const PLAYLIST_STORAGE_KEY = 'wwmp-user-playlists-v1';
const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a'];
const ACCEPTED_MIME_HINTS = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'];
const IS_ANDROID = /android/i.test(navigator.userAgent) || (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === 'android';

const FX_MULTIPLIERS: Record<FxIntensity, number> = {
  low: 0.55,
  med: 1,
  high: 1.45,
};

const VISUALIZER_PROFILES: Record<VisualizerQuality, { bars: number; fps: number; pixelRatio: number; fxTick: number }> = {
  off: { bars: 0, fps: 0, pixelRatio: 1, fxTick: 0 },
  light: { bars: 18, fps: 16, pixelRatio: 1, fxTick: 6 },
  full: { bars: 56, fps: 42, pixelRatio: 1.8, fxTick: 3 },
};

const STALE_PLAYBACK_OP = 'STALE_PLAYBACK_OP';

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

const loadUserPlaylists = (): UserPlaylist[] => {
  try {
    const raw = localStorage.getItem(PLAYLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<PersistedPlaylists>;
    if (parsed.version !== 1 || !Array.isArray(parsed.playlists)) return [];

    return parsed.playlists
      .filter((pl) => pl && typeof pl.id === 'string' && typeof pl.name === 'string' && Array.isArray(pl.tracks))
      .map((pl) => ({
        id: pl.id,
        name: pl.name.trim() || 'Untitled playlist',
        createdAt: typeof pl.createdAt === 'string' ? pl.createdAt : new Date().toISOString(),
        updatedAt: typeof pl.updatedAt === 'string' ? pl.updatedAt : new Date().toISOString(),
        tracks: pl.tracks
          .filter((t) => t && typeof t.id === 'number' && (t.kind === 'demo' || t.kind === 'local'))
          .map((t) => ({
            id: t.id,
            kind: t.kind,
            title: typeof t.title === 'string' ? t.title : 'Unknown',
            artist: typeof t.artist === 'string' ? t.artist : 'Unknown',
          })),
      }));
  } catch {
    return [];
  }
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

  const appRef = useRef<HTMLElement | null>(null);
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
  const tracksRef = useRef<Track[]>(DEMO_TRACKS);
  const queuePosRef = useRef(0);
  const queueOrderRef = useRef<number[]>(DEMO_TRACKS.map((_, i) => i));
  const repeatModeRef = useRef<RepeatMode>(initial.repeat);
  const crossfadeSecRef = useRef(initial.crossfade);
  const crossfadeTimerRef = useRef<number | null>(null);
  const loudnessTimerRef = useRef<number | null>(null);
  const loudnessMapRef = useRef<Record<number, number>>({});
  const loudnessPendingRef = useRef<Record<number, boolean>>({});
  const visualizerPausedByVisibilityRef = useRef(false);
  const playbackSessionRef = useRef(1);
  const playbackOpRef = useRef(0);
  const playbackHistoryRef = useRef<number[]>([]);
  const userGestureUnlockedRef = useRef(false);
  const visualizerQualityRef = useRef<VisualizerQuality>(IS_ANDROID ? 'light' : 'full');

  const [tracks, setTracks] = useState<Track[]>(DEMO_TRACKS);
  const [queueOrder, setQueueOrder] = useState<number[]>(DEMO_TRACKS.map((_, i) => i));
  const [queuePos, setQueuePos] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isTransitioningRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initial.volume);
  const [visualizerReady, setVisualizerReady] = useState(true);
  const [uploadStatus, setUploadStatus] = useState('');
  const [toast, setToast] = useState<{ text: string; tone: ToastTone } | null>(null);

  const [crossfadeSec, setCrossfadeSec] = useState(initial.crossfade);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(initial.repeat);
  const [fxIntensity, setFxIntensity] = useState<FxIntensity>(initial.intensity);
  const [preset, setPreset] = useState<VisualPreset>(initial.preset);
  const [presetConfigs, setPresetConfigs] = useState<Record<VisualPreset, PresetConfig>>(initial.presets);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [visualizerQuality, setVisualizerQuality] = useState<VisualizerQuality>(IS_ANDROID ? 'light' : 'full');
  const [draggedQueuePos, setDraggedQueuePos] = useState<number | null>(null);
  const [playlistName, setPlaylistName] = useState('');
  const [targetPlaylistId, setTargetPlaylistId] = useState('');
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>(() => loadUserPlaylists());

  const currentTrackIndex = queueOrder[queuePos] ?? 0;
  const currentTrack = tracks[currentTrackIndex];
  const presetConfig = presetConfigs[preset];

  useEffect(() => {
    currentTrackIndexRef.current = currentTrackIndex;
  }, [currentTrackIndex]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    queuePosRef.current = queuePos;
  }, [queuePos]);

  useEffect(() => {
    queueOrderRef.current = queueOrder;
  }, [queueOrder]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    crossfadeSecRef.current = crossfadeSec;
  }, [crossfadeSec]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isTransitioningRef.current = isTransitioning;
  }, [isTransitioning]);

  useEffect(() => {
    visualizerQualityRef.current = visualizerQuality;
  }, [visualizerQuality]);

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

  useEffect(() => {
    const payload: PersistedPlaylists = { version: 1, playlists: userPlaylists };
    localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(payload));
  }, [userPlaylists]);

  useEffect(() => {
    if (!userPlaylists.length) {
      setTargetPlaylistId('');
      return;
    }
    if (!targetPlaylistId || !userPlaylists.some((pl) => pl.id === targetPlaylistId)) {
      setTargetPlaylistId(userPlaylists[0].id);
    }
  }, [userPlaylists, targetPlaylistId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const gradientStyle = useMemo(
    () =>
      ({
        '--track-accent': currentTrack?.accent ?? '#67e8f9',
        '--fx-bass': '0',
        '--fx-mid': '0',
        '--fx-treble': '0',
        '--preset-a': presetConfig.palette[0],
        '--preset-b': presetConfig.palette[1],
        '--preset-c': presetConfig.palette[2],
        '--motion-mult': String(presetConfig.motion),
        '--anim-mult': String(presetConfig.animation),
      }) as React.CSSProperties,
    [currentTrack?.accent, presetConfig],
  );

  const setFxLevels = (bass: number, mid: number, treble: number) => {
    const host = appRef.current;
    if (!host) return;
    host.style.setProperty('--fx-bass', bass.toFixed(4));
    host.style.setProperty('--fx-mid', mid.toFixed(4));
    host.style.setProperty('--fx-treble', treble.toFixed(4));
  };

  const stopVisualizer = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setFxLevels(0, 0, 0);
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


  const invalidatePlaybackOps = () => {
    playbackSessionRef.current += 1;
    playbackOpRef.current += 1;
  };

  const throwIfStalePlaybackOp = (sessionId: number, opId: number) => {
    if (isStalePlaybackOperation(sessionId, playbackSessionRef.current, opId, playbackOpRef.current)) {
      throw new Error(STALE_PLAYBACK_OP);
    }
  };

  const resetDeckElement = (deck: HTMLAudioElement) => {
    deck.pause();
    deck.currentTime = 0;
    deck.removeAttribute('src');
    deck.load();
  };

  const resetPlaybackContext = () => {
    invalidatePlaybackOps();
    clearCrossfadeTimer();
    clearLoudnessTimer();
    stopProgressLoop();
    stopVisualizer();
    decksRef.current.forEach(resetDeckElement);
    deckTrackRef.current = [null, null];
    activeDeckRef.current = 0;
    playbackHistoryRef.current = [];
    loudnessMapRef.current = {};
    loudnessPendingRef.current = {};
    setIsPlaying(false);
    setIsTransitioning(false);
    isPlayingRef.current = false;
    isTransitioningRef.current = false;
    setProgress(0);
    setDuration(0);
    currentTrackIndexRef.current = 0;

    if (gainNodesRef.current.length >= 2) {
      gainNodesRef.current[0].gain.value = 1;
      gainNodesRef.current[1].gain.value = 0.001;
    }
  };

  const isAutoplayPolicyError = (error: unknown) =>
    error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError');

  const updateMediaSession = (trackIndex: number, playing: boolean) => {
    if (!('mediaSession' in navigator)) return;
    const track = tracks[trackIndex];
    if (!track) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: 'Wow Web Music Player v5',
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
      if (!isPlayingRef.current) return;
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
    const quality = visualizerQualityRef.current;
    const profile = VISUALIZER_PROFILES[quality];
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;

    if (quality === 'off' || !canvas || !analyser || document.hidden) {
      stopVisualizer();
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const smooth = { bass: 0, mid: 0, treble: 0 };
    const frameGap = 1000 / profile.fps;
    let lastFrameAt = 0;
    let energyTick = 0;

    const render = (ts: number) => {
      if (!canvasRef.current || !analyserRef.current || document.hidden || !isPlayingRef.current || visualizerQualityRef.current === 'off') {
        stopVisualizer();
        return;
      }

      animationRef.current = requestAnimationFrame(render);
      if (ts - lastFrameAt < frameGap) return;
      lastFrameAt = ts;

      const c = canvasRef.current;
      const a = analyserRef.current;
      const activeProfile = VISUALIZER_PROFILES[visualizerQualityRef.current];
      const pixelRatio = Math.min(activeProfile.pixelRatio, window.devicePixelRatio || 1);
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

      const bars = activeProfile.bars;
      const bucket = Math.max(1, Math.floor(bufferLength / bars));
      const intensity = FX_MULTIPLIERS[fxIntensity] * presetConfig.motion;
      const barWidth = width / bars;
      const hueShift = ts * 0.014 * presetConfig.animation;

      for (let i = 0; i < bars; i++) {
        let sum = 0;
        const start = i * bucket;
        const end = Math.min(start + bucket, dataArray.length);
        for (let j = start; j < end; j++) sum += dataArray[j];
        const avg = sum / Math.max(1, end - start);
        const value = Math.pow(avg / 255, 1.3);
        const barHeight = value * height * (0.4 + intensity * 0.24);
        const x = i * barWidth;
        const y = height - barHeight;

        const hue = (i * 5 + hueShift) % 360;
        ctx.fillStyle = `hsla(${hue}, 92%, 65%, ${0.22 + value * 0.56})`;
        ctx.fillRect(x + 0.7, y, Math.max(1.3, barWidth - 1.8), barHeight);
      }

      energyTick += 1;
      if (activeProfile.fxTick === 0 || energyTick % activeProfile.fxTick !== 0) return;

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

      setFxLevels(Math.min(1.4, smooth.bass), Math.min(1.4, smooth.mid), Math.min(1.4, smooth.treble));
    };

    animationRef.current = requestAnimationFrame(render);
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
    const nextPos = queueNextPosition(position, repeatModeRef.current, queueOrderRef.current.length);
    const validNext = nextPos >= 0 && nextPos !== position;
    const fade = clampCrossfade(crossfadeSecRef.current);

    if (!isPlayingRef.current || !validNext || fade <= 0 || !Number.isFinite(remain) || remain <= fade + 0.06) return;

    crossfadeTimerRef.current = window.setTimeout(() => {
      void transitionToPosition(nextPos, true);
    }, Math.max(40, (remain - fade) * 1000));
  };

  const prepareDeck = async (deckIndex: 0 | 1, trackIndex: number, guard?: { sessionId: number; opId: number }) => {
    if (guard) throwIfStalePlaybackOp(guard.sessionId, guard.opId);

    const deck = decksRef.current[deckIndex];
    const track = tracks[trackIndex];
    if (!track) throw new Error('Track not found for deck prepare');

    if (deckTrackRef.current[deckIndex] === trackIndex && deck.src) return;

    deck.pause();
    deck.currentTime = 0;
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

    if (guard) throwIfStalePlaybackOp(guard.sessionId, guard.opId);
  };

  const prewarmNextDeck = async (fromPosition: number, guard?: { sessionId: number; opId: number }) => {
    if (IS_ANDROID) return;

    const order = queueOrderRef.current;
    const nextPos = queueNextPosition(fromPosition, repeatModeRef.current, order.length);
    if (nextPos < 0) return;

    const nextTrackIndex = order[nextPos];
    if (nextTrackIndex == null) return;

    const standby: 0 | 1 = activeDeckRef.current === 0 ? 1 : 0;
    try {
      await prepareDeck(standby, nextTrackIndex, guard);
    } catch {
      // best-effort warmup only
    }
  };

  const transitionToPosition = async (nextPos: number, crossfade: boolean, trigger: 'user' | 'auto' = 'auto') => {
    const order = queueOrderRef.current;
    if (isTransitioningRef.current) return;
    if (nextPos < 0 || nextPos >= order.length) {
      setIsPlaying(false);
      return;
    }

    if (trigger === 'user') userGestureUnlockedRef.current = true;

    if (!shouldAutoplayAfterSwitch(isPlayingRef.current, userGestureUnlockedRef.current, IS_ANDROID)) {
      setQueuePos(nextPos);
      queuePosRef.current = nextPos;
      setProgress(0);
      setDuration(0);
      setIsPlaying(false);
      return;
    }

    const sessionId = playbackSessionRef.current;
    const opId = playbackOpRef.current + 1;
    playbackOpRef.current = opId;

    isTransitioningRef.current = true;
    setIsTransitioning(true);

    try {
      const nextTrackIndex = order[nextPos];
      if (nextTrackIndex == null) throw new Error('Missing track in queue');

      const fromDeckIndex = activeDeckRef.current;
      const preferredDeck: 0 | 1 = IS_ANDROID ? fromDeckIndex : (fromDeckIndex === 0 ? 1 : 0);
      let toDeckIndex: 0 | 1 = preferredDeck;

      const fromDeck = decksRef.current[fromDeckIndex];
      const canUseGraph = ensureAudioGraph();
      if (canUseGraph) await audioCtxRef.current?.resume();

      await prepareDeck(toDeckIndex, nextTrackIndex, { sessionId, opId });
      throwIfStalePlaybackOp(sessionId, opId);

      let playbackDeckIndex: 0 | 1 = toDeckIndex;
      let toDeck = decksRef.current[toDeckIndex];
      const fade = clampCrossfade(crossfadeSecRef.current);
      const useCrossfade = crossfade && fade > 0 && !fromDeck.paused && fromDeckIndex !== toDeckIndex;

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
          toGain.setValueAtTime(targetTo, now);
          fromGain.setValueAtTime(fromDeckIndex === toDeckIndex ? targetTo : 0.001, now);
        }
      }

      try {
        await toDeck.play();
      } catch (error) {
        if (!isAutoplayPolicyError(error) || fromDeckIndex === toDeckIndex) {
          throw error;
        }

        toDeckIndex = fromDeckIndex;
        await prepareDeck(toDeckIndex, nextTrackIndex, { sessionId, opId });
        throwIfStalePlaybackOp(sessionId, opId);

        toDeck = decksRef.current[toDeckIndex];
        await toDeck.play();
        playbackDeckIndex = toDeckIndex;
      }

      throwIfStalePlaybackOp(sessionId, opId);

      if (useCrossfade && playbackDeckIndex !== fromDeckIndex) {
        window.setTimeout(() => {
          fromDeck.pause();
          fromDeck.currentTime = 0;
        }, fade * 1000 + 40);
      } else if (playbackDeckIndex !== fromDeckIndex) {
        fromDeck.pause();
        fromDeck.currentTime = 0;
      }

      activeDeckRef.current = playbackDeckIndex;
      setQueuePos(nextPos);
      queuePosRef.current = nextPos;
      setProgress(0);
      setDuration(toDeck.duration || 0);
      setIsPlaying(true);
      playbackHistoryRef.current = [...playbackHistoryRef.current.slice(-40), nextTrackIndex];

      stopProgressLoop();
      progressLoop();
      if (visualizerQualityRef.current !== 'off') drawVisualizer();
      startLoudnessMonitor();
      updateMediaSession(nextTrackIndex, true);
      scheduleAutoCrossfade(nextPos);
      void prewarmNextDeck(nextPos, { sessionId, opId });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== STALE_PLAYBACK_OP) {
        setIsPlaying(false);
        updateMediaSession(currentTrackIndexRef.current, false);
      }
    } finally {
      if (!isStalePlaybackOperation(sessionId, playbackSessionRef.current, opId, playbackOpRef.current)) {
        isTransitioningRef.current = false;
        setIsTransitioning(false);
      }
    }
  };

  const selectQueuePosition = async (position: number) => {
    const order = queueOrderRef.current;
    if (position < 0 || position >= order.length) return;

    if (!isPlayingRef.current) {
      setQueuePos(position);
      queuePosRef.current = position;
      setProgress(0);
      setDuration(0);
      const trackIndex = order[position];
      if (trackIndex != null) updateMediaSession(trackIndex, false);
      return;
    }

    await transitionToPosition(position, true, 'user');
  };

  const nextTrack = async () => {
    const order = queueOrderRef.current;
    const currentPos = queuePosRef.current;
    const nextPos = queueNextPosition(currentPos, repeatModeRef.current, order.length);
    if (nextPos < 0) {
      setIsPlaying(false);
      return;
    }
    if (!isPlayingRef.current) {
      setQueuePos(nextPos);
      queuePosRef.current = nextPos;
      setProgress(0);
      setDuration(0);
      const trackIndex = order[nextPos];
      if (trackIndex != null) updateMediaSession(trackIndex, false);
      return;
    }
    await transitionToPosition(nextPos, true, 'user');
  };

  const prevTrack = async () => {
    const activeDeck = decksRef.current[activeDeckRef.current];
    if ((activeDeck.currentTime || 0) > 2.5 && repeatModeRef.current !== 'one') {
      activeDeck.currentTime = 0;
      setProgress(0);
      return;
    }

    const order = queueOrderRef.current;
    const prevPos = queuePrevPosition(queuePosRef.current, repeatModeRef.current, order.length);
    if (prevPos < 0) {
      activeDeck.currentTime = 0;
      setProgress(0);
      return;
    }

    if (!isPlayingRef.current) {
      setQueuePos(prevPos);
      queuePosRef.current = prevPos;
      setProgress(0);
      setDuration(0);
      const trackIndex = order[prevPos];
      if (trackIndex != null) updateMediaSession(trackIndex, false);
      return;
    }

    await transitionToPosition(prevPos, true, 'user');
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

    userGestureUnlockedRef.current = true;

    const canUseGraph = ensureAudioGraph();
    if (canUseGraph) {
      await audioCtxRef.current?.resume();
      applyDeckGain(activeDeckRef.current);
    }

    if (shouldReloadDeckTrack(deckTrackRef.current[activeDeckRef.current], currentTrackIndexRef.current) || !activeDeck.src) {
      await prepareDeck(activeDeckRef.current, currentTrackIndexRef.current);
    }

    await activeDeck.play();
    setIsPlaying(true);
    if (visualizerQualityRef.current !== 'off') drawVisualizer();
    startLoudnessMonitor();
    stopProgressLoop();
    progressLoop();
    updateMediaSession(currentTrackIndexRef.current, true);
    scheduleAutoCrossfade(queuePosRef.current);
    void prewarmNextDeck(queuePosRef.current);
  };

  const applyVolume = (nextVolume: number) => {
    setVolume(nextVolume);
    decksRef.current.forEach((deck) => {
      deck.volume = nextVolume;
    });
  };

  const validateAudioFile = async (file: File) => {
    const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    const mime = (file.type || '').toLowerCase();
    if (!isLikelySupportedAudioInput(file.name, mime, ACCEPTED_EXTENSIONS)) {
      throw new Error(`Unsupported file: ${file.name} (type: ${file.type || 'unknown'})`);
    }

    const probe = new Audio();
    const canPlayByMime = !!mime && probe.canPlayType(mime).replace('no', '').trim().length > 0;
    const canPlayByExt = ACCEPTED_MIME_HINTS.some((hint) => probe.canPlayType(hint).replace('no', '').trim().length > 0);
    if (!canPlayByMime && !canPlayByExt && !ACCEPTED_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported audio codec: ${file.name} (type: ${file.type || 'unknown'})`);
    }

    await new Promise<void>((resolve, reject) => {
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
        reject(new Error(`Cannot decode audio: ${file.name} (type: ${file.type || 'unknown'})`));
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
        const appendedIndexes = nextQueueOrderForNewTracks(prev.length, valid.length);
        setQueueOrder((prevOrder) => {
          const nextOrder = [...prevOrder, ...appendedIndexes];
          queueOrderRef.current = nextOrder;
          return nextOrder;
        });
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
      if (crossfadeSecRef.current > 0) return;
      const order = queueOrderRef.current;
      const nextPos = queueNextPosition(queuePosRef.current, repeatModeRef.current, order.length);
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
      resetDeckElement(deckA);
      resetDeckElement(deckB);
      tracksRef.current.forEach((t) => {
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
    if (visualizerQuality === 'off') {
      stopVisualizer();
      return;
    }
    if (isPlayingRef.current) drawVisualizer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualizerQuality]);

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
    const onVisibility = () => {
      if (document.hidden) {
        stopVisualizer();
        stopProgressLoop();
        clearLoudnessTimer();
        visualizerPausedByVisibilityRef.current = true;
        void audioCtxRef.current?.suspend();
        return;
      }

      if (visualizerPausedByVisibilityRef.current && isPlayingRef.current) {
        visualizerPausedByVisibilityRef.current = false;
        void audioCtxRef.current?.resume();
        if (visualizerQualityRef.current !== 'off') drawVisualizer();
        progressLoop();
        startLoudnessMonitor();
        scheduleAutoCrossfade(queuePosRef.current);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const showToast = (text: string, tone: ToastTone = 'ok') => setToast({ text, tone });

  const moveQueuePosition = (from: number, to: number) => {
    if (from === to) return;
    setQueueOrder((prev) => {
      const next = reorderQueue(prev, from, to);
      queueOrderRef.current = next;
      return next;
    });
    setQueuePos((prevPos) => {
      let nextPos = prevPos;
      if (prevPos === from) nextPos = to;
      else if (from < prevPos && to >= prevPos) nextPos = prevPos - 1;
      else if (from > prevPos && to <= prevPos) nextPos = prevPos + 1;
      queuePosRef.current = nextPos;
      return nextPos;
    });
  };

  const removeFromQueue = async (position: number) => {
    const target = queueOrder[position];
    if (target == null) return;
    const track = tracks[target];
    const ok = window.confirm(`Remove "${track?.title ?? 'this track'}" from queue?`);
    if (!ok) return;

    const nextOrder = removeQueuePosition(queueOrder, position);
    setQueueOrder(nextOrder);
    queueOrderRef.current = nextOrder;

    if (!nextOrder.length) {
      resetPlaybackContext();
      setQueuePos(0);
      queuePosRef.current = 0;
      showToast('Queue item removed. Queue is empty now.', 'warn');
      return;
    }

    const removedCurrent = position === queuePosRef.current;
    const currentPos = queuePosRef.current;
    const nextPos = position < currentPos
      ? currentPos - 1
      : position > currentPos
        ? currentPos
        : Math.min(currentPos, nextOrder.length - 1);

    setQueuePos(nextPos);
    queuePosRef.current = nextPos;

    if (removedCurrent) {
      resetPlaybackContext();
      showToast('Current track removed. Select a track and press Play.', 'warn');
      return;
    }

    showToast('Track removed from queue.');
  };

  const clearQueue = () => {
    const ok = window.confirm('Clear full queue? This cannot be undone.');
    if (!ok) return;

    resetPlaybackContext();

    tracks.forEach((t) => {
      if (t.kind === 'local') URL.revokeObjectURL(t.src);
    });

    setTracks(DEMO_TRACKS);
    setQueueOrder([]);
    queueOrderRef.current = [];
    setQueuePos(0);
    queuePosRef.current = 0;
    setShuffle(false);
    setAdvancedOpen(true);
    setUploadStatus('Queue cleared. Add new files to start fresh playback context.');
    console.assert(queueIsCleared([], 0, 0, 0, false), 'Queue clear state guard');
    showToast('Queue cleared. Old playback context removed.', 'warn');
  };

  const toggleShuffle = () => {
    setShuffle((prev) => {
      if (!prev) {
        const shuffled = shuffleKeepCurrent(queueOrder, currentTrackIndex);
        setQueueOrder(shuffled);
        queueOrderRef.current = shuffled;
        setQueuePos(0);
        queuePosRef.current = 0;
        return true;
      }

      const ordered = tracks.map((_, i) => i).filter((idx) => queueOrder.includes(idx));
      setQueueOrder(ordered);
      queueOrderRef.current = ordered;
      const nextPos = ordered.indexOf(currentTrackIndexRef.current);
      setQueuePos(Math.max(0, nextPos));
      queuePosRef.current = Math.max(0, nextPos);
      return false;
    });
  };

  const createPlaylistFromQueue = () => {
    const name = playlistName.trim();
    if (!name) {
      showToast('Enter playlist name first.', 'warn');
      return;
    }
    const pl: UserPlaylist = {
      id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tracks: queueOrder
        .map((idx) => tracks[idx])
        .filter(Boolean)
        .map((track) => ({ id: track.id, kind: track.kind, title: track.title, artist: track.artist })),
    };
    setUserPlaylists((prev) => [pl, ...prev]);
    setPlaylistName('');
    showToast('Playlist saved locally.');
  };

  const renamePlaylist = (id: string) => {
    const source = userPlaylists.find((pl) => pl.id === id);
    if (!source) return;
    const nextName = window.prompt('Rename playlist', source.name)?.trim();
    if (!nextName) return;
    setUserPlaylists((prev) => prev.map((pl) => (pl.id === id ? { ...pl, name: nextName, updatedAt: new Date().toISOString() } : pl)));
    showToast('Playlist renamed.');
  };

  const deletePlaylist = (id: string) => {
    const source = userPlaylists.find((pl) => pl.id === id);
    if (!source) return;
    const ok = window.confirm(`Delete playlist "${source.name}"?`);
    if (!ok) return;
    setUserPlaylists((prev) => prev.filter((pl) => pl.id !== id));
    showToast('Playlist deleted.', 'warn');
  };

  const addQueueTrackToPlaylist = (position: number, playlistId: string) => {
    const source = userPlaylists.find((pl) => pl.id === playlistId);
    const trackIndex = queueOrder[position];
    const track = tracks[trackIndex];
    if (!source || !track) return;

    const item: UserPlaylistTrack = {
      id: track.id,
      kind: track.kind,
      title: track.title,
      artist: track.artist,
    };

    setUserPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === source.id
          ? {
              ...pl,
              updatedAt: new Date().toISOString(),
              tracks: [...pl.tracks, item],
            }
          : pl,
      ),
    );
    showToast(`Added to "${source.name}".`);
  };

  const loadPlaylistToQueue = (id: string) => {
    const source = userPlaylists.find((pl) => pl.id === id);
    if (!source) return;
    const trackIndexes = source.tracks
      .map((saved) => tracks.findIndex((t) => t.id === saved.id || (t.kind === saved.kind && t.title === saved.title && t.artist === saved.artist)))
      .filter((idx) => idx >= 0);

    if (!trackIndexes.length) {
      showToast('No matching tracks found for this playlist in current session.', 'error');
      return;
    }

    resetPlaybackContext();
    setQueueOrder(trackIndexes);
    queueOrderRef.current = trackIndexes;
    setQueuePos(0);
    queuePosRef.current = 0;
    setShuffle(false);
    showToast(`Playlist loaded (${trackIndexes.length} tracks).`);
  };

  const exportPlaylists = () => {
    const payload: PersistedPlaylists = { version: 1, playlists: userPlaylists };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wwmp-user-playlists-v1.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Playlists exported.');
  };

  const importPlaylists = async (file: File | null) => {
    if (!file) return;
    const replaceExisting = userPlaylists.length
      ? window.confirm('Replace existing playlists with imported JSON?')
      : true;
    if (!replaceExisting) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as PersistedPlaylists;
      if (parsed.version !== 1 || !Array.isArray(parsed.playlists)) throw new Error('invalid');

      const sanitized = parsed.playlists
        .filter((pl) => pl && typeof pl.id === 'string' && typeof pl.name === 'string' && Array.isArray(pl.tracks))
        .map((pl) => ({
          id: pl.id,
          name: pl.name.trim() || 'Untitled playlist',
          createdAt: typeof pl.createdAt === 'string' ? pl.createdAt : new Date().toISOString(),
          updatedAt: typeof pl.updatedAt === 'string' ? pl.updatedAt : new Date().toISOString(),
          tracks: pl.tracks
            .filter((t) => t && typeof t.id === 'number' && (t.kind === 'demo' || t.kind === 'local'))
            .map((t) => ({
              id: t.id,
              kind: t.kind,
              title: typeof t.title === 'string' ? t.title : 'Unknown',
              artist: typeof t.artist === 'string' ? t.artist : 'Unknown',
            })),
        }));

      setUserPlaylists(sanitized);
      showToast(`Imported ${sanitized.length} playlist(s).`);
    } catch {
      showToast('Playlist import failed: invalid JSON.', 'error');
    }
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

  const isQueueEmpty = queueOrder.length === 0;

  return (
    <main ref={appRef} className="app" style={gradientStyle}>
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />
      <div className="aurora aurora-c" />
      <section className="player-card">
        <header className="player-header">
          <p className="eyebrow">Wow Web Music Player v5</p>
          <h1>{isQueueEmpty ? 'Queue is empty' : (currentTrack?.title ?? 'No track')}</h1>
          <p>{isQueueEmpty ? 'Add audio files or load playlist below.' : (currentTrack?.artist ?? '—')}</p>
        </header>

        <canvas ref={canvasRef} className="visualizer" aria-label="Audio visualizer" />
        {!visualizerReady && <p className="fallback">Visualizer unavailable in this browser — audio controls still work.</p>}
        {isTransitioning && <p className="loading-state" aria-live="polite">Loading next track…</p>}
        {uploadStatus && <p className="upload-status" aria-live="polite">{uploadStatus}</p>}
        {toast && <p className={`toast toast-${toast.tone}`} aria-live="polite">{toast.text}</p>}

        <div className="timeline">
          <span>{formatTime(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(progress, duration || progress || 0)}
            disabled={isQueueEmpty}
            onChange={(e) => {
              if (isQueueEmpty) return;
              const deck = decksRef.current[activeDeckRef.current];
              const time = Number(e.target.value);
              deck.currentTime = time;
              setProgress(time);
              scheduleAutoCrossfade(queuePosRef.current);
            }}
            aria-label="Track position"
          />
          <span>{formatTime(duration)}</span>
        </div>

        <div className="controls" role="group" aria-label="Primary playback controls">
          <button onClick={() => void prevTrack()} aria-label="Previous track" disabled={isQueueEmpty}>⏮</button>
          <button className="play-btn" onClick={() => void togglePlay()} aria-label={isPlaying ? 'Pause' : 'Play'} disabled={isQueueEmpty}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button onClick={() => void nextTrack()} aria-label="Next track" disabled={isQueueEmpty}>⏭</button>
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

        <details className="advanced-panel" open={advancedOpen} onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}>
          <summary>{advancedOpen ? 'Hide advanced controls' : 'Show advanced controls'}</summary>

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
            <label className="chip fx-chip" aria-label="Visualizer quality selector">
              Visualizer
              <select value={visualizerQuality} onChange={(e) => setVisualizerQuality(e.target.value as VisualizerQuality)}>
                <option value="off">off</option>
                <option value="light">light</option>
                <option value="full">full</option>
              </select>
            </label>
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

          <section className="queue-box" aria-label="Queue order">
            <div className="queue-header-row">
              <p className="queue-title">Queue ({shuffle ? 'shuffled' : 'ordered'})</p>
              <button className="chip danger" onClick={clearQueue} disabled={isQueueEmpty}>Clear queue</button>
            </div>
            <div className="queue-playlist-tools">
              <select
                value={targetPlaylistId}
                onChange={(e) => setTargetPlaylistId(e.target.value)}
                aria-label="Target playlist for queue items"
                disabled={!userPlaylists.length}
              >
                {userPlaylists.length === 0 ? <option value="">Create playlist first</option> : null}
                {userPlaylists.map((pl) => (
                  <option key={pl.id} value={pl.id}>{pl.name}</option>
                ))}
              </select>
              <span>Use +PL on any queue row</span>
            </div>
            <ul className="playlist">
              {isQueueEmpty ? <li><button disabled><strong>Queue is empty</strong><span>Add files with + Add your music</span></button></li> : null}
              {queueOrder.map((trackIndex, position) => {
                const track = tracks[trackIndex];
                if (!track) return null;
                const isCurrent = position === queuePos;
                return (
                  <li
                    key={`${track.id}-${position}`}
                    draggable
                    className={draggedQueuePos === position ? 'dragging' : ''}
                    onDragStart={() => setDraggedQueuePos(position)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedQueuePos == null) return;
                      moveQueuePosition(draggedQueuePos, position);
                      setDraggedQueuePos(null);
                    }}
                    onDragEnd={() => setDraggedQueuePos(null)}
                    onTouchStart={() => setDraggedQueuePos(position)}
                    onTouchEnd={(e) => {
                      const touch = e.changedTouches[0];
                      const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest<HTMLElement>('[data-queue-pos]');
                      const nextPos = Number(target?.dataset.queuePos ?? -1);
                      if (draggedQueuePos != null && Number.isInteger(nextPos) && nextPos >= 0) moveQueuePosition(draggedQueuePos, nextPos);
                      setDraggedQueuePos(null);
                    }}
                    data-queue-pos={position}
                  >
                    <button className={isCurrent ? 'active' : ''} onClick={() => void selectQueuePosition(position)} aria-label={`Play ${track.title}`}>
                      <strong>{position + 1}. {track.title}</strong>
                      <span>{track.artist}</span>
                    </button>
                    <div className="queue-actions">
                      <button className="chip mini" onClick={() => moveQueuePosition(position, Math.max(0, position - 1))} aria-label="Move track up">↑</button>
                      <button className="chip mini" onClick={() => moveQueuePosition(position, Math.min(queueOrder.length - 1, position + 1))} aria-label="Move track down">↓</button>
                      <button
                        className="chip mini"
                        onClick={() => addQueueTrackToPlaylist(position, targetPlaylistId)}
                        aria-label="Add track to selected playlist"
                        disabled={!targetPlaylistId}
                      >
                        +PL
                      </button>
                      <button className="chip mini danger" onClick={() => void removeFromQueue(position)} aria-label="Remove track from queue">✕</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="queue-box" aria-label="User playlists">
            <p className="queue-title">User playlists (local-only)</p>
            <div className="playlist-create-row">
              <input
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder="Playlist name"
                aria-label="Playlist name"
              />
              <button className="chip" onClick={createPlaylistFromQueue}>Save queue</button>
              <button className="chip" onClick={exportPlaylists}>Export JSON</button>
              <label className="chip import-chip">
                Import JSON
                <input type="file" accept="application/json,.json" onChange={(e) => void importPlaylists(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <ul className="playlist">
              {userPlaylists.map((pl) => (
                <li key={pl.id}>
                  <button aria-label={`Load playlist ${pl.name}`} onClick={() => loadPlaylistToQueue(pl.id)}>
                    <strong>{pl.name}</strong>
                    <span>{pl.tracks.length} tracks</span>
                  </button>
                  <div className="queue-actions">
                    <button className="chip mini" onClick={() => renamePlaylist(pl.id)}>Rename</button>
                    <button className="chip mini danger" onClick={() => deletePlaylist(pl.id)}>Delete</button>
                  </div>
                </li>
              ))}
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
        </details>
      </section>
    </main>
  );
}

export default App;
