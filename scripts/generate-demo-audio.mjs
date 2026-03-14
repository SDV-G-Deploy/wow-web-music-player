import fs from 'node:fs';
import path from 'node:path';

const sampleRate = 44100;

const tracks = [
  { name: 'neon-drift.wav', duration: 22, tones: [220, 277.18, 329.63], wobble: 2.5 },
  { name: 'violet-pulse.wav', duration: 20, tones: [246.94, 311.13, 392.0], wobble: 3.7 },
  { name: 'sunrise-glide.wav', duration: 24, tones: [196.0, 261.63, 349.23], wobble: 1.8 },
];

const outDir = path.resolve('public/audio');
fs.mkdirSync(outDir, { recursive: true });

function writeWav(filePath, samples) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

for (const track of tracks) {
  const totalSamples = Math.floor(track.duration * sampleRate);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    let signal = 0;
    for (let j = 0; j < track.tones.length; j++) {
      const f = track.tones[j] * (1 + 0.02 * Math.sin(2 * Math.PI * track.wobble * t + j));
      signal += Math.sin(2 * Math.PI * f * t) * (0.45 / (j + 1));
    }

    const beat = 0.5 + 0.5 * Math.sin(2 * Math.PI * 1.9 * t);
    const envelope = Math.min(1, t / 0.9) * Math.min(1, (track.duration - t) / 1.2);
    samples[i] = signal * (0.55 + beat * 0.35) * envelope;
  }

  writeWav(path.join(outDir, track.name), samples);
  console.log(`Generated ${track.name}`);
}
