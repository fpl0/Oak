// bun packages/audio/e2e/make-fixtures-w6.bun.ts
// The Wave 6 fake-microphone take, written into e2e/.generated/ by the Wave 6 sing spec before Chromium starts:
// one file, three phrases with a short silence between them, then a silent room (the fake device loops it).
//   1. chromatic degrees in C (U15.L01): sol fi sol te la, the fi sung as FA (the key's own note, a half step low)
//   2. a guide-tone line over Dm7 G7 Cmaj7 (U12.L05): F, then B where the line holds F (the other guide tone), E
//   3. D Dorian's colour (U14.L03): 1 5 6 5, the raised 6 sung as the minor ♭6
import { mkdirSync } from "node:fs";
import { type ClipPart, renderClip } from "@oak/pitch/corpus";
import { encodeWav16 } from "@oak/pitch/synth";

/** Seconds of silent room before the first note. */
export const LEAD_SEC = 0.5;
/** Each sung note lasts its slot minus this articulation gap. */
export const GAP_SEC = 0.06;
/** Silence between two phrases. */
export const BETWEEN_SEC = 0.4;

export const CHROMATIC = {
  noteSec: 0.5,
  degrees: ["5", "#4", "5", "b7", "6"] as const,
  /** What is sung: fa (65) where the line has fi (66); te 10¢ sharp. */
  sung: [67, 65, 67, 70.1, 69],
};
export const GUIDE = {
  chordSec: 0.9,
  chords: ["Dm7", "G7", "C^7"] as const,
  /** F, B (the 3rd of G7, where the line holds the 7th, F), E. */
  sung: [65, 59, 64],
};
export const MODAL = {
  noteSec: 0.5,
  degrees: ["1", "5", "6", "5"] as const,
  /** D A B♭ A: the minor scale's ♭6 where Dorian has B. */
  sung: [62, 69, 70, 69],
};

/** When each phrase starts, in seconds after the first note of the take. */
export const PHRASE_AT = {
  chromatic: 0,
  guide: CHROMATIC.sung.length * CHROMATIC.noteSec + BETWEEN_SEC,
  modal:
    CHROMATIC.sung.length * CHROMATIC.noteSec +
    BETWEEN_SEC +
    GUIDE.sung.length * GUIDE.chordSec +
    BETWEEN_SEC,
};
/** Seconds from the first note to the end of the last. */
export const TAKE_SEC = PHRASE_AT.modal + MODAL.sung.length * MODAL.noteSec;

function take(): Uint8Array {
  const parts: ClipPart[] = [{ kind: "gap", sec: LEAD_SEC }];
  const phrase = (midis: readonly number[], slot: number) => {
    for (const midi of midis) {
      parts.push({ kind: "phrase", notes: [{ midi, dur: slot - GAP_SEC }] });
      parts.push({ kind: "gap", sec: GAP_SEC });
    }
  };
  phrase(CHROMATIC.sung, CHROMATIC.noteSec);
  parts.push({ kind: "gap", sec: BETWEEN_SEC });
  phrase(GUIDE.sung, GUIDE.chordSec);
  parts.push({ kind: "gap", sec: BETWEEN_SEC });
  phrase(MODAL.sung, MODAL.noteSec);
  parts.push({ kind: "gap", sec: 2.4 });
  const clip = renderClip({ id: "e2e/sing-w6", cls: "steady", rangeLow: 48, timbre: { vowel: "a" }, parts });
  return encodeWav16(clip.samples, clip.sampleRate);
}

if (import.meta.main) {
  const dir = new URL("./.generated/", import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  await Bun.write(`${dir}sing-w6.wav`, take());
  console.log(`wave 6 fixtures written to ${dir}`);
}
