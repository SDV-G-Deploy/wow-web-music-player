import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

type Track = {
  id: number;
  title: string;
  artist: string;
  src: string;
  accent: string;
};

const tracks: Track[] = [
  { id: 1, title: 'Neon Drift', artist: 'Demo Tone Lab', src: './audio/neon-drift.wav', accent: '#67e8f9' },
  { id: 2, title: 'Violet Pulse', artist: 'Demo Tone Lab', src: './audio/violet-pulse.wav', accent: '#c084fc' },
  { id: 3, title: 'Sunrise Glide', artist: 'Demo Tone Lab', src: './audio/sunrise-glide.wav', accent: '#fbbf24' },
];

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [visualizerReady, setVisualizerReady] = useState(true);

  const currentTrack = tracks[currentIndex];

  const gradientStyle = useMemo(
    () => ({ '--track-accent': currentTrack.accent } as React.CSSProperties),
    [currentTrack.accent],
  );

  const ensureAudioGraph = () => {
    if (!audioRef.current) return false;
    if (!window.AudioContext && !(window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) {
      setVisualizerReady(false);
      return false;
    }

    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        setVisualizerReady(false);
        return false;
      }
      audioCtxRef.current = new Ctx();
    }

    if (!analyserRef.current) {
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
    }

    if (!sourceRef.current) {
      sourceRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
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

    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
    ctx.scale(dpr, dpr);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, clientWidth, clientHeight);

      const barWidth = clientWidth / bufferLength;
      const hueShift = Date.now() * 0.02;

      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i] / 255;
        const barHeight = value * clientHeight * 0.9;
        const x = i * barWidth;
        const y = clientHeight - barHeight;

        const hue = (i * 4 + hueShift) % 360;
        ctx.fillStyle = `hsla(${hue}, 90%, 65%, 0.85)`;
        ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();
  };

  const stopVisualizer = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        stopVisualizer();
      } else {
        if (ensureAudioGraph()) {
          await audioCtxRef.current?.resume();
          drawVisualizer();
        }
        await audio.play();
        setIsPlaying(true);
      }
    } catch {
      setIsPlaying(false);
    }
  };

  const selectTrack = (index: number) => {
    setCurrentIndex(index);
    setProgress(0);
    setDuration(0);
  };

  const nextTrack = () => {
    const next = (currentIndex + 1) % tracks.length;
    selectTrack(next);
  };

  const prevTrack = () => {
    const prev = (currentIndex - 1 + tracks.length) % tracks.length;
    selectTrack(prev);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume;
    audio.load();

    if (isPlaying) {
      void (async () => {
        if (ensureAudioGraph()) {
          await audioCtxRef.current?.resume();
          drawVisualizer();
        }
        await audio.play();
      })();
    }
  }, [currentIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      stopVisualizer();
      nextTrack();
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
    };
  }, [currentIndex]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        void togglePlay();
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = Math.min(audio.currentTime + 5, duration || 0);
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = Math.max(audio.currentTime - 5, 0);
      }
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setVolume((v) => (v > 0 ? 0 : 0.75));
      }
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        nextTrack();
      }
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        prevTrack();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [duration, currentIndex, isPlaying]);

  useEffect(() => {
    return () => {
      stopVisualizer();
      audioCtxRef.current?.close();
    };
  }, []);

  return (
    <main className="app" style={gradientStyle}>
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />
      <section className="player-card">
        <header className="player-header">
          <p className="eyebrow">Wow Web Music Player</p>
          <h1>{currentTrack.title}</h1>
          <p>{currentTrack.artist}</p>
        </header>

        <canvas ref={canvasRef} className="visualizer" aria-label="Audio visualizer" />
        {!visualizerReady && <p className="fallback">Visualizer unavailable in this browser — audio controls still work.</p>}

        <audio ref={audioRef} src={currentTrack.src} preload="metadata" />

        <div className="timeline">
          <span>{formatTime(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={progress}
            onChange={(e) => {
              const audio = audioRef.current;
              if (!audio) return;
              const time = Number(e.target.value);
              audio.currentTime = time;
              setProgress(time);
            }}
          />
          <span>{formatTime(duration)}</span>
        </div>

        <div className="controls">
          <button onClick={prevTrack} aria-label="Previous track">⏮</button>
          <button className="play-btn" onClick={() => void togglePlay()} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button onClick={nextTrack} aria-label="Next track">⏭</button>
        </div>

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

        <ul className="playlist">
          {tracks.map((track, index) => (
            <li key={track.id}>
              <button
                className={index === currentIndex ? 'active' : ''}
                onClick={() => selectTrack(index)}
                aria-label={`Play ${track.title}`}
              >
                <strong>{track.title}</strong>
                <span>{track.artist}</span>
              </button>
            </li>
          ))}
        </ul>

        <footer className="shortcuts">
          <span>Space: play/pause</span>
          <span>←/→: seek ±5s</span>
          <span>N/P: next/prev</span>
          <span>M: mute</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
