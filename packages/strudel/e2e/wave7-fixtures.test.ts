// The musical facts wave7.pw.ts measures on (wave7-fixtures.ts), checked headless and with @oak/theory: each voicing
// is the shape its name says, the stabs are the funk Band's chord, JC4's ballad is 32 bars and 128 s of what it
// claims, and the tuning pitches sit inside each alias's range.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { chordPcs, parseChordSymbol, voicingType } from "@oak/theory";
import { OAK_ALIASES } from "../../../scripts/sounds/pack.config.ts";
import {
  FUNK_STABS,
  JAZZ_VOICINGS,
  JC4_BARS,
  JC4_BPM,
  jc4Ballad,
  W7_KNOWN_TUNING,
  W7_TUNING,
} from "./wave7-fixtures.ts";

setDefaultTimeout(60_000);
const mod12 = (x: number) => ((x % 12) + 12) % 12;

describe("wave7-fixtures", () => {
  test("each voicing is the shape its name says (@oak/theory voicingType, octave-aware)", () => {
    const want: Record<string, string> = {
      shell: "shell",
      "rootless A": "rootless-a",
      "rootless B": "rootless-b",
      "drop-2": "drop-2",
    };
    for (const v of JAZZ_VOICINGS) {
      const kind = Object.keys(want).find((k) => v.id.startsWith(k)) as string;
      expect([v.id, voicingType(v.midis, v.chord).type]).toEqual([v.id, want[kind]]);
      const pcs = chordPcs(parseChordSymbol(v.chord) as never);
      if (kind === "shell") expect(v.midis.every((m) => pcs.includes(mod12(m)))).toBe(true);
    }
  });

  test("the stabs are the funk Band's first chord, C9 without its root (E B♭ D)", async () => {
    for (const s of FUNK_STABS) {
      const r = await evalHeadless(s.code, 1);
      expect([
        s.id,
        [...new Set(r.events.map((e) => mod12(e.midi as number)))].sort((a, b) => a - b),
      ]).toEqual([s.id, [2, 4, 10]]);
    }
  });

  test("JC4's ballad: 32 bars at 60 BPM (128 s), four parts, every bar sounding, nothing silent or unknown", async () => {
    const code = jc4Ballad();
    expect((JC4_BARS * 240) / JC4_BPM).toBe(128);
    const r = await evalHeadless(code, JC4_BARS);
    expect(r.logs.filter((l) => /error|\[(mini|tonal|voicing|query|eval)\]/i.test(l))).toEqual([]);
    expect(new Set(r.events.map((e) => e.track))).toEqual(new Set(["drums", "bass", "chords", "mel"]));
    for (let bar = 0; bar < JC4_BARS; bar++)
      for (const t of ["drums", "bass", "chords"])
        expect([bar, t, r.events.some((e) => e.track === t && Math.floor(e.onset) === bar)]).toEqual([
          bar,
          t,
          true,
        ]);
  });

  test("the tuning pitches lie in each alias's range; a known zone is listed among them", () => {
    for (const [sound, midis] of Object.entries(W7_TUNING)) {
      const range = OAK_ALIASES[sound]?.range ?? [36, 84];
      for (const m of midis) expect([sound, m >= range[0] && m <= range[1]]).toEqual([sound, true]);
    }
    for (const [sound, zones] of Object.entries(W7_KNOWN_TUNING))
      for (const midi of Object.keys(zones)) expect(W7_TUNING[sound]).toContain(Number(midi));
  });
});
