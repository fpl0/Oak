// bun spikes/s5-pitch/scripts/make-fixtures.ts
// Generates the WAV fixtures fed to Chromium's fake microphone.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { encodeWav16, sungSequence, tone } from '../src/synth.ts';

const outDir = join(import.meta.dir, '..', 'fixtures');
mkdirSync(outDir, { recursive: true });

async function write(name: string, samples: Float32Array, sampleRate: number) {
  const bytes = encodeWav16(samples, sampleRate);
  await Bun.write(join(outDir, name), bytes);
  console.log(`${name}: ${sampleRate} Hz, ${(samples.length / sampleRate).toFixed(3)} s, ${bytes.length} bytes`);
}

// 5 s of 440 Hz = exactly 2200 cycles => the file loops seamlessly in the fake device.
await write('sine-440.wav', tone({ hz: 440, seconds: 5, sampleRate: 48000, wave: 'sine', amp: 0.5 }), 48000);
// same tone at 44.1 kHz: proves Chromium resamples the fixture instead of pitch-shifting it (147 cents if it did not)
await write('sine-440-44k1.wav', tone({ hz: 440, seconds: 5, sampleRate: 44100, wave: 'sine', amp: 0.5 }), 44100);
// A3 - C#4 - E4, voice-like harmonics, 5.5 Hz +-15 cent vibrato, -50 dB noise floor, 100 ms gaps
await write('sung-a3-cs4-e4.wav', sungSequence(48000), 48000);
// same melody with no silence between notes (hard case for the segmenter)
await write('sung-a3-cs4-e4-legato.wav', sungSequence(48000, { legato: true }), 48000);
