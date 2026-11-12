// The U03 repertoire answer keys (content/repertoire/<slug>/song.ts) against two other derivations:
//   1. a transcription written separately here, in 1-based degrees and beats (the way a teacher would
//      sing the fragment: "3 3 4 5 | 5 4 3 2 …"), turned into MIDI by arithmetic on the major scale, not by
//      Strudel;
//   2. the unit spec's letters (content/specs/U03.ts), which name the same notes in the cited edition's key.
// Both must give the same pitches and onsets as the song's own code evaluated in headless Strudel. Then the
// shape rules of contracts §2.8 (no pickup, dot or tie, nothing over a bar line) and the registry match.
// None of this is the human check against the cited edition: `verified` stays false (registries.test.ts).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { SongDef } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { U03 } from "../specs/U03.ts";
import auld from "./auld-lang-syne/song.ts";
import { PENDING_VERIFIER } from "./fragment.ts";
import { songById } from "./index.ts";
import michael from "./michael-row/song.ts";
import ode from "./ode-to-joy/song.ts";
import swingLow from "./swing-low/song.ts";
import saints from "./when-the-saints/song.ts";

setDefaultTimeout(60_000);

/**
 * Each bar as space-separated `degree:beats` (a rest is `r`); `,` after a degree is the octave below.
 * Written from the tunes as sung, not copied from the code.
 */
const SUNG: Record<string, string[]> = {
  "song.ode-to-joy": ["3:1 3:1 4:1 5:1", "5:1 4:1 3:1 2:1", "1:1 1:1 2:1 3:1", "3:1 2:1 2:2"],
  "song.when-the-saints": ["r:1 1:1 3:1 4:1", "5:4", "r:1 1:1 3:1 4:1", "5:4"],
  "song.auld-lang-syne": ["1:1 1:1 1:1 3:1", "2:1 1:1 2:1 3:1", "1:1 1:1 3:1 5:1", "6:4"],
  "song.swing-low": ["3:2 1:2", "3:2 1:1 6,:1", "5,:4", "r:4"],
  "song.michael-row": ["3:1 5:1 3:1 5:1", "6:1 5:2 r:1", "r:1 3:1 5:1 6:1", "5:4"],
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const tonicMidi = (tonic: string): number =>
  60 + (PC[tonic[0] as string] as number) + (tonic.includes("#") ? 1 : tonic.includes("b") ? -1 : 0);

/** [onset in bars, midi] for every sung note. */
function fromSung(bars: string[], tonic: string): [number, number][] {
  const out: [number, number][] = [];
  bars.forEach((bar, i) => {
    let beat = 0;
    for (const tok of bar.split(" ")) {
      const [d, len] = tok.split(":") as [string, string];
      if (d !== "r") {
        const below = d.endsWith(",");
        const deg = Number(d.replace(",", ""));
        out.push([i + beat / 4, tonicMidi(tonic) + (MAJOR[deg - 1] as number) - (below ? 12 : 0)]);
      }
      beat += Number(len);
    }
    expect([bar, beat]).toEqual([bar, 4]);
  });
  return out;
}
const rat = (x: string | number): number => {
  const [a, b] = String(x).split("/").map(Number);
  return b ? (a as number) / b : (a as number);
};
const round = (x: number) => Math.round(x * 1e6) / 1e6;

const songs: SongDef[] = [ode, saints, auld, swingLow, michael];
const specFragments = U03.lessons.flatMap((l) => (l.repertoire ?? []).map((r) => ({ lesson: l.id, ...r })));

describe("U03 repertoire answer keys", () => {
  test("every fragment the U03 spec uses has an answer key", () => {
    const keyed = new Set(songs.map((s) => s.id as string));
    expect(specFragments.map((r) => r.song).filter((id) => !keyed.has(id))).toEqual([]);
  });

  for (const s of songs)
    describe(s.id, () => {
      test("the registry entry and the song agree; still unverified", () => {
        const e = songById.get(s.id);
        expect(e).toBeDefined();
        expect({ title: s.title, year: s.year, status: s.status, key: s.key, meter: s.meter }).toEqual({
          title: e?.title,
          year: e?.year,
          status: e?.status,
          key: e?.key,
          meter: e?.meter,
        } as never);
        expect(s.provenance).toEqual(e?.provenance as never);
        expect(s.provenance.year).toBeLessThanOrEqual(1930);
        expect(e?.verified).toBe(false);
        expect(s.verifiedBy).toBe(PENDING_VERIFIER);
        expect(s.pickup).toBeUndefined();
        expect(e?.usedIn.length).toBeGreaterThan(0);
      });

      test("the code plays the separately sung transcription", async () => {
        const r = await evalHeadless(s.answerKey.code, s.answerKey.bars);
        const got = r.events.map((x) => [round(rat(x.begin)), x.midi]);
        const want = fromSung(SUNG[s.id] ?? [], s.key.tonic).map(([t, m]) => [round(t), m]);
        expect(got).toEqual(want);
      });

      test("the spec's letters name the same notes", async () => {
        const frag = specFragments.find((r) => r.song === s.id);
        expect(frag).toBeDefined();
        const bpm = s.bpm;
        const letters = await evalHeadless(
          `setcpm(${bpm}/4)\n\nmel: note("${frag?.letters}").s("piano")`,
          s.answerKey.bars,
        );
        const own = await evalHeadless(s.answerKey.code, s.answerKey.bars);
        const sig = (x: typeof own) => x.events.map((e) => `${e.begin}-${e.end}:${e.midi}`).join(" ");
        expect(sig(own)).toBe(sig(letters));
        // The spec teaches the same degrees (in C): only the key differs.
        expect(s.answerKey.layers.melody).toContain(`n("${frag?.degrees}")`);
      });

      test("no pickup, no dot or tie, nothing over a bar line (contracts §2.8)", async () => {
        const r = await evalHeadless(s.answerKey.code, s.answerKey.bars);
        const plain = [1, 1 / 2, 1 / 4, 1 / 8];
        expect(rat(r.events[0]?.begin ?? "1")).toBeLessThan(1);
        for (const e of r.events) {
          const [b0, b1] = [rat(e.begin), rat(e.end)];
          expect([e.begin, plain.some((p) => Math.abs(b1 - b0 - p) < 1e-9)]).toEqual([e.begin, true]);
          expect([e.begin, Math.floor(b0 + 1e-9) === Math.floor(b1 - 1e-9)]).toEqual([e.begin, true]);
        }
      });
    });
});
