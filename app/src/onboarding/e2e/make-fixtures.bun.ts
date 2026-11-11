// bun app/src/onboarding/e2e/make-fixtures.bun.ts
// Fake-microphone WAVs for the onboarding specs (Chromium reads 16-bit PCM mono; the path must be absolute).
// Chromium starts the file again each time a capture opens (checked: two opens read the same levels in the same
// order), so every measurement hears the file from its start:
//   0–3.3 s   a quiet room (−70 dBFS): the noise floor (0.2–3.2 s) and the bleed test (0.3–3 s) hear nothing
//   3.33 s…   five short "da"s, 0.75 s apart, 80 ms after the sing-latency clicks (1 s + 0.75 k after opening),
//             alternating A2 and E4: the range sweep hears both ends
//   7.0 s…    C4 held for 9 s: the live "hear" check, and the first sung note (home, C)
import { mkdirSync, writeFileSync } from "node:fs";
import { concat, encodeWav16, silence, tone } from "@oak/pitch/synth";

const dir = new URL("./.generated/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const sr = 48000;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const voice = (midi: number, seconds: number) =>
  tone({ hz: hz(midi), seconds, sampleRate: sr, amp: 0.35, wave: "voice", fade: 0.02, vibratoCents: 6 });
const quiet = (seconds: number) => silence(seconds, sr, -70);

export const VOICE = {
  low: 45,
  high: 64,
  home: 60,
  firstDa: 3.33,
  daGap: 0.75,
  daLen: 0.25,
  holdAt: 7.0,
} as const;

const parts: Float32Array[] = [quiet(VOICE.firstDa)];
for (let k = 0; k < 5; k++) {
  parts.push(voice(k % 2 === 0 ? VOICE.low : VOICE.high, VOICE.daLen));
  if (k < 4) parts.push(quiet(VOICE.daGap - VOICE.daLen));
}
const used = VOICE.firstDa + 4 * VOICE.daGap + VOICE.daLen;
parts.push(quiet(VOICE.holdAt - used), voice(VOICE.home, 9));
writeFileSync(`${dir}voice.wav`, encodeWav16(concat(parts), sr));
// A room with no voice at all: every measurement that needs a voice reports that it heard none.
writeFileSync(`${dir}silent.wav`, encodeWav16(quiet(20), sr));
console.log(`onboarding e2e fixtures written to ${dir}`);
