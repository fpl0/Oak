// bun app/src/voice/e2e/make-fixtures.bun.ts
// Fake-microphone WAVs for the voice specs (Chromium reads 16-bit PCM mono; the path must be absolute; the file
// starts again at every capture open):
//   reel.wav    the pitch gate in the browser: one 48 kHz clip of every corpus class (several voices), back to
//               back, after 1 s of quiet room; reel.json lists each clip's id and start so the spec can score
//               the frames the AudioWorklet produced against the same truth the Bun gate uses.
//   match.wav   1.5 s of room, then F♯3 (54) held for 4 s on "ah": the first of the three pitch-match notes of a
//               learner whose comfort zone is C3–C4 (targets 54, 58, 49); the quiet check hears a voice in it.
//               Wave 4: the mic opens before Oak plays the note (the note is a playback-only span, contracts
//               §8.6), so the learner sings after it: from 1.5 s, when the 1.3 s note has ended.
//   bleed.wav   the same note leaking back from speakers: a piano-like F♯3 at −34 dBFS from the moment the mic
//               opens, as long as the note plays, then a silent room. The learner never sings.
//   silent.wav  a quiet room: every take hears no voice.
import { mkdirSync, writeFileSync } from "node:fs";
import { renderClip } from "@oak/pitch/corpus";
import { concat, encodeWav16, tone } from "@oak/pitch/synth";
import { REEL_IDS, reelSpecs } from "./reel.ts";

const dir = new URL("./.generated/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const SR = 48000;

const room = (sec: number) =>
  renderClip({
    id: `room/${sec}`,
    cls: "silence-room",
    rangeLow: 48,
    timbre: { vowel: "a" },
    parts: [{ kind: "gap", sec }],
  }).samples;

const clips = reelSpecs().map(renderClip);
const lead = room(1);
const parts: Float32Array[] = [lead];
const segments: { id: string; start: number; duration: number }[] = [];
let at = lead.length;
for (const c of clips) {
  if (c.sampleRate !== SR) throw new Error(`reel clip ${c.id} is not 48 kHz`);
  segments.push({ id: c.id, start: at / SR, duration: c.samples.length / SR });
  parts.push(c.samples);
  at += c.samples.length;
}
const tail = room(1.5);
parts.push(tail);
writeFileSync(`${dir}reel.wav`, encodeWav16(concat(parts), SR));
writeFileSync(
  `${dir}reel.json`,
  JSON.stringify({ sampleRate: SR, duration: (at + tail.length) / SR, segments, ids: REEL_IDS }, null, 2),
);

const match = renderClip({
  id: "e2e/match",
  cls: "steady",
  rangeLow: 48,
  timbre: { vowel: "a" },
  parts: [
    { kind: "gap", sec: 1.5 },
    { kind: "phrase", notes: [{ midi: 54, dur: 4, vibrato: { rateHz: 5.5, cents: 20, onsetSec: 0.4 } }] },
    { kind: "gap", sec: 1 },
  ],
});
writeFileSync(`${dir}match.wav`, encodeWav16(match.samples, SR));
writeFileSync(`${dir}silent.wav`, encodeWav16(room(20), SR));
// The leak: F♯3 with a piano's falling harmonics, decaying over the 1.3 s note, under the quiet room.
const leak = tone({
  hz: 440 * 2 ** ((54 - 69) / 12),
  seconds: 1.5,
  sampleRate: SR,
  wave: "saw",
  amp: 0.03,
  fade: 0.01,
});
for (let i = 0; i < leak.length; i++) leak[i] = (leak[i] as number) * Math.exp(-i / SR / 1.2);
const bleedRoom = room(6);
for (let i = 0; i < leak.length; i++) bleedRoom[i] = (bleedRoom[i] as number) + (leak[i] as number);
writeFileSync(`${dir}bleed.wav`, encodeWav16(bleedRoom, SR));
console.log(
  `voice e2e fixtures written to ${dir} (reel ${segments.length} clips, ${(at / SR).toFixed(1)} s)`,
);
