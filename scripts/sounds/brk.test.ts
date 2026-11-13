// Oak's rendered break (`s("brk")`, contracts §3.2 `snd.brk`): a one-bar, licence-clean, deterministic render.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BRK_BPM,
  BRK_DIR,
  BRK_FILE,
  BRK_GROOVE,
  BRK_SOURCES,
  type BrkVoice,
  brkFrames,
  decodeWav,
  encodeWav,
  type Pcm,
  renderBreak,
  renderBreakWav,
} from "./brk.ts";
import { PACK_VERSION, type PackLock } from "./pack.config.ts";

const ROOT = join(import.meta.dirname, "../..");

/** A decaying sine one-shot: a stand-in for a drum sample. */
function shot(hz: number, seconds: number, channels = 1, rate = 44100): Pcm {
  const n = Math.round(seconds * rate);
  const ch = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++)
    for (const c of ch) c[i] = Math.sin((2 * Math.PI * hz * i) / rate) * Math.exp((-8 * i) / n);
  return { sampleRate: rate, channels: ch };
}
const SHOTS: Record<BrkVoice, Pcm> = {
  kick: shot(60, 0.3, 2),
  snare: shot(200, 0.2, 2),
  hat: shot(8000, 0.04),
  open: shot(7000, 0.4, 1, 48000),
};

describe("the break", () => {
  test("one bar of 4/4 at its tempo, 16 sixteenth steps, every hit on a step", () => {
    expect(brkFrames()).toBe(Math.round((60 / BRK_BPM) * 4 * 44100));
    for (const h of BRK_GROOVE) {
      expect(Number.isInteger(h.step) && h.step >= 0 && h.step < 16).toBe(true);
      expect(Math.abs(h.nudgeMs)).toBeLessThanOrEqual(10);
    }
    // a backbeat on 2 and 4, a kick on 1
    expect(BRK_GROOVE.some((h) => h.voice === "kick" && h.step === 0 && h.gain === 1)).toBe(true);
    for (const step of [4, 12])
      expect(BRK_GROOVE.some((h) => h.voice === "snare" && h.step === step)).toBe(true);
  });

  test("renders stereo at −3 dBFS peak, no click at the loop point, the same samples every time", () => {
    const a = renderBreak(SHOTS);
    const b = renderBreak(SHOTS);
    expect(a.channels.length).toBe(2);
    expect(a.channels[0]?.length).toBe(brkFrames());
    let peak = 0;
    for (const c of a.channels) for (const x of c) peak = Math.max(peak, Math.abs(x));
    expect(peak).toBeCloseTo(10 ** (-3 / 20), 4);
    for (const c of a.channels) expect(Math.abs(c.at(-1) as number)).toBeLessThan(1e-3);
    expect(encodeWav(a)).toEqual(encodeWav(b));
  });

  test("WAV encode and decode round-trip at 16 bits", () => {
    const pcm = renderBreak(SHOTS);
    const back = decodeWav(encodeWav(pcm));
    expect(back.sampleRate).toBe(44100);
    expect(back.channels.length).toBe(2);
    let worst = 0;
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < (pcm.channels[0]?.length ?? 0); i += 97)
        worst = Math.max(
          worst,
          Math.abs(
            ((back.channels[c] as Float32Array)[i] as number) -
              ((pcm.channels[c] as Float32Array)[i] as number),
          ),
        );
    expect(worst).toBeLessThan(1 / 16000);
    expect(() => decodeWav(new Uint8Array(8))).toThrow();
  });

  const lockPath = join(ROOT, "sounds/pack.lock.json");
  const uzu = join(ROOT, `sounds/pack/${PACK_VERSION}/uzu-drumkit`);
  test.skipIf(!existsSync(uzu))(
    "the pack's break is exactly this render of the pack's own one-shots",
    async () => {
      const lock = JSON.parse(readFileSync(lockPath, "utf8")) as PackLock;
      const entry = lock.files.find((f) => f.path === `${PACK_VERSION}/${BRK_DIR}${BRK_FILE}`);
      expect(entry?.derived).toBe(true);
      expect(entry?.sourceUrl).toContain("CC0");
      const wav = await renderBreakWav(async (p) => new Uint8Array(readFileSync(join(uzu, p))));
      expect(createHash("sha256").update(wav).digest("hex")).toBe(entry?.sha256 as string);
      for (const p of Object.values(BRK_SOURCES))
        expect(lock.files.some((f) => f.path.endsWith(`uzu-drumkit/${p}`))).toBe(true);
    },
  );
});
