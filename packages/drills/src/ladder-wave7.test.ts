// The gym after the core (contracts §2.5: in the advanced tracks Today offers the gym once a week): the ladder's
// generated levels L1–L3 serve the grooves and changes the tracks teach, each only once the learner has completed
// the lesson that teaches it (`LADDER_FEATURE_GATES`): the jazz ride (J1.L01), sixteenth-note funk with ghost notes
// (R1.L03), a son or rumba clave over the groove (R3.L02), a walking bass (J3.L04), the ii–V–I and the I–vi–ii–V in
// seventh chords (J1.L03, J4.L01). Golden tests state the expected notes; property tests check that no item uses
// a track's material before its lesson, that every item plays exactly what its code says, that the walking bass
// walks as J3.L04 defines it, that the clave is CLAVE_GRIDS', and that each item's answer key plays its target
// part note for note. The grading of the keys by @oak/grader is content/gym/ladder-wave7.test.ts.
import { describe, expect, test } from "bun:test";
import { CLAVE_GRIDS, type NEvent, R } from "@oak/content-kit";
import { claveOf } from "@oak/theory";
import { DEFAULT_PROFILE } from "./engine.ts";
import { mod, parsePc } from "./kernel.ts";
import {
  FUNK_KICKS,
  generateLadderPiece,
  LADDER_FEATURE_GATES,
  type LadderFeature,
  type LadderLevelNo,
  type LadderPiece,
  type LadderRealism,
  RIDE_STEPS,
} from "./ladder.ts";
import { flattenEvents, strudelEvents } from "./testing.test-util.ts";

const REALISM: LadderRealism[] = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 30 }, (_, i) => 500 + i * 41);
/** Everything the core and the three tracks teach: every feature open. */
const ALL_OPEN = { completed: new Set<string>(Object.values(LADDER_FEATURE_GATES)) };
const make = (level: LadderLevelNo, opts: { completed: Set<string> } = ALL_OPEN): LadderPiece[] =>
  REALISM.flatMap((r) => SEEDS.map((s) => generateLadderPiece(level, r, s, DEFAULT_PROFILE, opts)));
const L1 = make(1);
const L2 = make(2);
const L3 = make(3);
const of = (track: string, p: LadderPiece): NEvent[] => p.events.filter((e) => e.track === track);
const step16 = (e: NEvent) => Math.round(R.toNum(R.mul(R.frac(e.onset), [16, 1])));
const barOf = (e: NEvent) => Math.floor(R.toNum(e.onset));
const featured = (ps: LadderPiece[], f: LadderFeature) => ps.filter((p) => p.feature === f);

describe("the track features open with their lessons, never before", () => {
  test("with the core only, no item uses a track's material; the core's items are unchanged by the new gates", () => {
    const core = { completed: new Set<string>(["U07.L08"]) };
    for (const level of [1, 2, 3, 4] as const)
      for (const r of REALISM)
        for (const s of SEEDS.slice(0, 10)) {
          const p = generateLadderPiece(level, r, s, DEFAULT_PROFILE, core);
          expect([level, r, s, p.feature]).toEqual([level, r, s, undefined]);
          // The same item as with no feature open at all (a closed feature draws nothing from the seed).
          const q = generateLadderPiece(level, r, s, DEFAULT_PROFILE, {
            completed: new Set(["U07.L08", "U17.CP"]),
          });
          expect(q.code).toBe(p.code);
        }
  });
  test("each feature appears only once its own lesson is completed, at R1 and above, in about half the items", () => {
    for (const [f, lesson] of Object.entries(LADDER_FEATURE_GATES) as [LadderFeature, string][]) {
      if (f === "pickup") continue;
      const level = (["ride", "funk16", "clave"].includes(f) ? 1 : f === "walking" ? 2 : 3) as LadderLevelNo;
      // The lesson alone (with J1.L03, which every jazz lesson after it has done): no other feature of the level.
      const only = {
        completed: new Set([lesson, ...(f.startsWith("t") || f === "walking" ? ["J1.L03"] : [])]),
      };
      const items = make(level, only);
      const used = items.filter((p) => p.feature !== undefined);
      expect([f, used.some((p) => p.feature === f)]).toEqual([f, true]);
      expect([f, used.every((p) => p.realism >= 1)]).toEqual([f, true]);
      if (level === 1) for (const p of used) expect([f, p.feature]).toEqual([f, f]);
      const eligible = items.filter((p) => p.realism >= 1).length;
      expect([f, used.length / eligible > 0.3 && used.length / eligible < 0.7]).toEqual([f, true]);
    }
    // The turnaround waits for J4.L01 even when the ii–V–I loops are open.
    for (const p of make(3, { completed: new Set(["J1.L03"]) }))
      expect([p.seed, p.feature]).not.toEqual([p.seed, "turnaround"]);
  });
});

describe("golden: the tracks' grooves (L1)", () => {
  test("the jazz ride: spang-a-lang on the ride, the hi-hat foot on 2 and 4, swung by the player", async () => {
    const rides = featured(L1, "ride");
    expect(rides.length).toBeGreaterThan(10);
    for (const p of rides) {
      for (const b of [0, 1])
        expect(
          of("drums", p)
            .filter((e) => barOf(e) === b)
            .map(step16),
        ).toEqual([...RIDE_STEPS]);
      expect(
        of("hats", p)
          .filter((e) => barOf(e) === 0)
          .map(step16),
      ).toEqual([4, 12]);
      expect(of("drums", p).every((e) => e.s === "rd")).toBe(true);
      expect(p.swing).toEqual({ subdivision: 8, amount: 1 / 3 });
      expect(p.flavour).toBe("jazz-soul");
      expect(p.given.sounds).toContain("rd");
    }
    await sameAsStrudel(rides[0] as LadderPiece);
  });
  test("sixteenth funk: a kick of R1.L03 on the one, the backbeat, ghost notes between, softer than the backbeat", async () => {
    const funk = featured(L1, "funk16");
    expect(funk.length).toBeGreaterThan(10);
    for (const p of funk) {
      const kick = of("kick", p)
        .filter((e) => barOf(e) === 0)
        .map(step16);
      expect(FUNK_KICKS.map((k) => k.join(" "))).toContain(kick.join(" "));
      expect(
        of("snare", p)
          .filter((e) => barOf(e) === 0)
          .map(step16),
      ).toEqual([4, 12]);
      const ghosts = of("perc", p).filter((e) => barOf(e) === 0);
      expect(ghosts.length).toBeGreaterThanOrEqual(2);
      for (const g of ghosts) {
        expect(step16(g) % 4).not.toBe(0); // off the beat: an "e", "and" or "a"
        expect(g.gain).toBeLessThan(0.5 * (of("snare", p)[0]?.gain ?? 1));
      }
      expect(of("hats", p).filter((e) => barOf(e) === 0)).toHaveLength(16);
    }
    await sameAsStrudel(funk[0] as LadderPiece);
  });
  test("the clave: CLAVE_GRIDS' son or rumba, 3-2 or 2-3, over a groove that is the same in both bars", async () => {
    const claves = featured(L1, "clave");
    expect(claves.length).toBeGreaterThan(10);
    const seen = new Set<string>();
    for (const p of claves) {
      const rim = of("perc", p);
      const steps = rim.filter((e) => barOf(e) < 2).map((e) => barOf(e) * 8 + Math.round(step16(e) / 2));
      const found = claveOf(steps);
      expect([p.seed, found !== null]).toEqual([p.seed, true]);
      if (!found) continue;
      seen.add(`${found.type} ${found.direction}`);
      const grid = CLAVE_GRIDS[found.type][found.direction];
      expect(rim.filter((e) => barOf(e) === 0).map((e) => R.toNum(R.frac(e.onset)))).toEqual(
        grid[0].map(([n, d]) => n / d),
      );
      // A four-bar item repeats the two-bar clave.
      if (p.bars === 4)
        expect(rim.filter((e) => barOf(e) === 2).map(step16)).toEqual(
          rim.filter((e) => barOf(e) === 0).map(step16),
        );
      const kickBars = [0, 1].map((b) =>
        of("kick", p)
          .filter((e) => barOf(e) === b)
          .map(step16)
          .join(" "),
      );
      expect(kickBars[0]).toBe(kickBars[1]);
    }
    expect(seen.has("son 3-2") && seen.has("son 2-3")).toBe(true);
    await sameAsStrudel(claves[0] as LadderPiece);
  });
});

describe("golden: the walking bass (L2, J3.L04)", () => {
  test("four quarters a bar: the root on 1, a chord tone on 3, a half or whole step into the next root on 4", async () => {
    const walks = featured(L2, "walking");
    expect(walks.length).toBeGreaterThan(10);
    for (const p of walks) {
      const key = p.key;
      const bass = of("bass", p);
      expect(bass).toHaveLength(p.bars * 4);
      const tonic = parsePc(key.tonic).pc;
      for (let b = 0; b < p.bars; b++) {
        const bar = bass.filter((e) => barOf(e) === b).map((e) => e.midi as number);
        const nextRoot = bass.find((e) => barOf(e) === (b + 1) % p.bars)?.midi as number;
        // 2: one or two half steps into the next bar's root.
        const into = Math.abs((bar[3] as number) - nextRoot);
        expect([p.seed, b, into >= 1 && into <= 2]).toEqual([p.seed, b, true]);
        // Every note in the bass's register, E1 to A♭3.
        for (const m of bar) expect([p.seed, m, m >= 28 && m <= 56]).toEqual([p.seed, m, true]);
        // 1 and 3 are chord tones of the bar's chord (root; 3rd or 5th), 1 the root.
        const rootRel = mod((bar[0] as number) - tonic, 12);
        const third = mod((bar[2] as number) - (bar[0] as number), 12);
        expect([p.seed, b, [3, 4, 7, 8, 9].includes(third) || third === 0]).toEqual([p.seed, b, true]);
        expect([p.seed, b, [0, 2, 4, 5, 7, 9, 11].includes(rootRel)]).toEqual([p.seed, b, true]);
      }
      expect(p.title.startsWith("Walking bass")).toBe(true);
    }
    await sameAsStrudel(walks[0] as LadderPiece);
  });
});

describe("golden: jazz loops in seventh chords (L3)", () => {
  test("the ii–V–I and the I–vi–ii–V sound as diatonic sevenths; the answer key writes [0,2,4,6]; graded on the triad core", async () => {
    const loops = featured(L3, "twoFive").concat(featured(L3, "turnaround"));
    expect(loops.length).toBeGreaterThan(10);
    for (const p of loops) {
      const rns = p.chords?.map((c) => c.rn).join(" ");
      expect(["ii V I I", "I ii V I", "I vi ii V"]).toContain(rns as string);
      for (const c of p.chords ?? [])
        expect(["Dm7", "G7", "Cmaj7", "Am7"].some((x) => c.symbol.endsWith(x.slice(1)))).toBe(true);
      const tonic = parsePc(p.key.tonic).pc;
      for (let b = 0; b < p.bars; b++) {
        // The Rhodes plays the upper notes, the bass the root: the four notes of the seventh chord between them.
        const pcs = new Set(
          [...of("chords", p), ...of("bass", p).filter((e) => R.toNum(R.frac(e.onset)) === 0)]
            .filter((e) => barOf(e) === b)
            .map((e) => mod((e.midi as number) - tonic, 12)),
        );
        expect([p.seed, b, pcs.size]).toEqual([p.seed, b, 4]);
        // Diatonic: every chord tone is in the major scale.
        for (const pc of pcs) expect([0, 2, 4, 5, 7, 9, 11]).toContain(pc);
      }
      expect(p.answer).toContain('n("[0,2,4,6]")');
      expect(p.stageAnswers?.rn).toContain('n("[0,2,4,6]")');
    }
    await sameAsStrudel(loops[0] as LadderPiece);
  });
});

async function sameAsStrudel(p: LadderPiece) {
  const got = await strudelEvents(p.code, p.bars);
  expect(got.flat).toEqual(flattenEvents(p.events));
}

describe("every featured item plays its code, and its answer key plays the target part", () => {
  test("a sample of each feature at R1–R4 in headless Strudel", async () => {
    for (const f of ["ride", "funk16", "clave", "walking", "twoFive", "turnaround"] as LadderFeature[]) {
      const items = [...L1, ...L2, ...L3].filter((p) => p.feature === f).slice(0, 4);
      expect([f, items.length]).toEqual([f, 4]);
      for (const p of items) {
        await sameAsStrudel(p);
        // The key's target lines play the reference's target events (onsets and, for pitched parts, pitches).
        const key = await strudelEvents(p.answer, p.bars);
        const want = flattenEvents(p.events.filter((e) => p.target.includes(e.track)));
        const strip = (rows: readonly string[]) => rows.map((r) => r.split("|").slice(0, 4).join("|")).sort();
        if (p.level === 1) expect([f, p.seed, strip(key.flat)]).toEqual([f, p.seed, strip(want)]);
        else {
          const bassKey = strip(key.flat.filter((r) => r.startsWith("bass|")));
          expect([f, p.seed, bassKey]).toEqual([f, p.seed, strip(want.filter((r) => r.startsWith("bass|")))]);
        }
      }
    }
  }, 120_000);
});
