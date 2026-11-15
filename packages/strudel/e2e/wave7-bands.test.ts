// The proposed Wave 7 Bands (wave7-bands.ts) and the swing generator they are written with (src/swing-backing.ts),
// checked on the code the adapter receives (`bandCodeFor`) in headless Strudel: the harmony each Band names, in
// every key a lesson can ask for (the swing ii–V–I in all twelve); the walking bass as the `walking-bass` rule reads
// it; the swing, the laid-back feel and the ghost notes where the lessons say they are; the son clave's hits; the
// odd meters' accents on their group starts; and the strict Band lint.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { CLAVE_GRIDS, FEEL_MS, lateMs } from "@oak/content-kit";
import { evalHeadless, type HeadlessEvent } from "@oak/grader/testing";
import {
  availableTensions,
  chordPcs,
  FOURTHS_MAJOR,
  METERS,
  meterGroups,
  parseChordSymbol,
  swingOffbeat,
  swingRatio,
} from "@oak/theory";
import { BAND_CHANGES, bandById } from "../../../content/bands/index.ts";
import { lint } from "../../../content/validate/harness.ts";
import { bandCodeFor, tonicOffset } from "../src/band.ts";
import { swingBacking, swingPlan } from "../src/swing-backing.ts";
import type { BandSetup } from "../src/types.ts";
import { FLAVOURS, type Flavour, WAVE7_BANDS as PROPOSED, type Wave7Band } from "./wave7-bands.ts";

/**
 * The feel a landed Band has where it differs from the proposal: the neo-soul loop that shipped (content/bands
 * `neoSoul`) swings its sixteenths with `.swingBy(1/6, 8)` and lays nothing back; the lay-back is the learner's (A2,
 * AC2's `feel` rule), so the Band's snare and chords sit on the grid.
 */
const LANDED_FEEL: Readonly<Record<string, Partial<Wave7Band>>> = {
  "band.neo-soul": { swing: { subdivision: 16, amount: 1 / 6 }, late: undefined },
};

/**
 * The Bands checked here: each proposal, with the code that landed in content/bands where author:CP adopted it (a
 * landed Band may differ from the proposal: band.jazz-blues did). What ships is what this file measures.
 */
const WAVE7_BANDS: readonly Wave7Band[] = PROPOSED.map((b) => {
  const landed = bandById.get(b.id);
  if (!landed) return b;
  const code = Object.fromEntries(
    FLAVOURS.map((f) => [f, landed.code[f as never] ?? b.code[f]]),
  ) as Wave7Band["code"];
  // A landed Band is measured against its own form and changes (content/bands BAND_CHANGES, "[Dm7 G7]" for a bar
  // of two chords), and its own feel where author:CP chose another (LANDED_FEEL): never the proposal's.
  const names = BAND_CHANGES[b.id];
  const changes = names ? names.map((n) => (n.startsWith("[") ? n.slice(1, -1).split(" ") : [n])) : b.changes;
  return { ...b, code, bars: landed.bars, changes, ...(LANDED_FEEL[b.id] ?? {}) };
});

setDefaultTimeout(120_000);

const mod12 = (x: number): number => ((Math.round(x) % 12) + 12) % 12;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const MAJOR_KEYS = ["C", "F", "Bb", "Eb", "G", "D", "A"];

function codeFor(band: Wave7Band, flavour: Flavour, tonic: string): string {
  const setup: BandSetup = {
    band: band.id as never,
    flavour: flavour as never,
    code: band.code[flavour],
    followsLearnerKey: false,
    tracks: ["drums", "bass", "chords"],
  };
  return bandCodeFor(setup, { key: { tonic, mode: "major" } as never, defaultBpm: 96, learnerCode: "" });
}
async function eventsOf(band: Wave7Band, flavour: Flavour, tonic: string): Promise<HeadlessEvent[]> {
  const units = METERS[band.meter].unitsPerBar;
  const r = await evalHeadless(`setcpm(96/${units})\n${codeFor(band, flavour, tonic)}`, band.bars);
  expect(
    r.logs.filter((l) => /\[(mini|tonal|voicing|query|eval)\]|error/i.test(l)),
    `${band.id} ${flavour} ${tonic}`,
  ).toEqual([]);
  return r.events.filter((e) => e.onset < band.bars - 1e-9);
}

interface Change {
  symbol: string;
  from: number;
  to: number;
  root: number;
  tones: number[];
  allowed: number[];
}
/** The Band's changes moved to `tonic`, each with its span in cycles, its chord tones and its available tensions. */
function changesOf(band: Wave7Band, tonic: string): Change[] {
  const shift = tonicOffset(tonic);
  return band.changes.flatMap((bar, i) =>
    bar.map((symbol, j) => {
      const c = parseChordSymbol(symbol);
      if (!c) throw new Error(symbol);
      const tones = chordPcs(c).map((pc) => mod12(pc + shift));
      const tensions = availableTensions(c).map((t) => mod12(t.pc + shift));
      const half = 1 / bar.length;
      return {
        symbol,
        from: i + j * half,
        to: i + (j + 1) * half,
        root: mod12(c.rootPc + shift),
        tones,
        allowed: [...new Set([...tones, ...tensions])],
      };
    }),
  );
}
/** The change sounding at `t`, or the next one when `t` is within `lead` cycles of it (an anticipation). */
function changeAt(changes: readonly Change[], t: number, lead = 0): Change[] {
  const now = changes.find((c) => t >= c.from - 1e-9 && t < c.to - 1e-9) as Change;
  const i = changes.indexOf(now);
  const next = changes[(i + 1) % changes.length] as Change;
  const nextFrom = i + 1 === changes.length ? changes.at(-1)?.to : next.from;
  return lead > 0 && (nextFrom as number) - t <= lead + 1e-9 ? [now, next] : [now];
}

describe("the proposed Wave 7 Bands: ten, four flavours each, three labelled tracks, no part the learner writes", () => {
  test("ids, meters and the three roles; no melody, no horns, no clave where the learner plays it", () => {
    expect(WAVE7_BANDS.map((b) => b.id)).toEqual([
      "band.swing-two-five",
      "band.jazz-blues",
      "band.rhythm-changes",
      "band.neo-soul",
      "band.funk-16",
      "band.son-montuno",
      "band.son-clave",
      "band.odd-5-4",
      "band.odd-7-8",
      "band.odd-9-8",
    ]);
    for (const b of WAVE7_BANDS) {
      expect(b.changes.length, b.id).toBe(b.bars);
      for (const f of FLAVOURS) {
        const lines = b.code[f].split("\n");
        expect(
          lines.map((l) => l.split(":")[0]),
          `${b.id} ${f}`,
        ).toEqual(["drums", "bass", "chords"]);
        // Stabs, heads and contrafacts are the learner's (RC1's horns, J4/JC2/JC3's melody): never a Band's sound.
        for (const sound of ["horns", "trumpet", "mutetpt", "tenor", "vibes", "choir"])
          expect(b.code[f].includes(`"${sound}"`), `${b.id} ${f} ${sound}`).toBe(false);
      }
      if (b.learnerParts.includes("clave"))
        for (const f of FLAVOURS) expect(b.code[f].includes("rim"), `${b.id} ${f}`).toBe(false);
    }
  });

  test("a Band that has landed in content/bands is checked as it landed, in every flavour", () => {
    for (const b of WAVE7_BANDS) {
      const landed = bandById.get(b.id);
      if (!landed) continue;
      for (const f of FLAVOURS) expect(b.code[f], `${b.id} ${f}`).toBe(landed.code[f as never]);
    }
  });
});

describe("harmony and register in every lesson key (the swing ii–V–I in all twelve)", () => {
  for (const band of WAVE7_BANDS)
    for (const flavour of FLAVOURS)
      test(`${band.id} in ${flavour}`, async () => {
        const keys = band.id === "band.swing-two-five" ? FOURTHS_MAJOR : MAJOR_KEYS;
        for (const tonic of keys) {
          const where = `${band.id} ${flavour} in ${tonic}`;
          const ev = await eventsOf(band, flavour, tonic);
          const changes = changesOf(band, tonic);
          const by = (t: string) => ev.filter((e) => e.track === t && e.midi !== null);
          const [bass, chords] = [by("bass"), by("chords")];
          expect(by("drums").length + ev.filter((e) => e.track === "drums").length, where).toBeGreaterThan(0);
          // Every chord note is a chord tone or an available tension of the change it sounds in (an eighth early
          // for an anticipation: the montuno's last eighth, the comping's swung "and").
          for (const e of chords) {
            const fits = changeAt(changes, e.onset, 1 / 8).some((c) =>
              c.allowed.includes(mod12(e.midi as number)),
            );
            expect(fits, `${where}: chord note ${e.midi} at ${e.onset}`).toBe(true);
          }
          // Every bass note is a chord tone of its change, or a step from the next one's root (approach notes and
          // the walking line's 3rd and 5th are chord tones; beat 4 leads in), or an anticipation of the next root.
          for (const e of bass) {
            const [now, next] = changeAt(changes, e.onset, 1 / 4);
            const pc = mod12(e.midi as number);
            const ok =
              now?.tones.includes(pc) ||
              (next && (next.root === pc || [1, 11, 2, 10].includes(mod12(pc - next.root)))) ||
              [1, 11].includes(
                mod12(pc - (changes[(changes.indexOf(now as Change) + 1) % changes.length] as Change).root),
              );
            expect(ok, `${where}: bass ${e.midi} at ${e.onset} under ${now?.symbol}`).toBe(true);
          }
          // Each change's root is in the bass at the change, or anticipated within a quarter before it.
          for (const c of changes) {
            // (bar 1's root may be anticipated at the end of the form's last bar, as the loop comes round)
            const at = bass.filter(
              (e) =>
                (e.onset >= c.from - 0.25 - 1e-9 && e.onset <= c.from + 1e-9) ||
                (c.from === 0 && e.onset >= band.bars - 0.25 - 1e-9),
            );
            expect(
              at.some((e) => mod12(e.midi as number) === c.root),
              `${where}: root of ${c.symbol} at ${c.from}`,
            ).toBe(true);
          }
          // Register after the fold (written in C, a Band plays up to a fourth higher or a tritone lower): the bass
          // from E1 to C4 (a funk octave reaches F3 in F), the chords E2–E5 as Wave 6's Bands.
          for (const e of bass) expect(e.midi as number, where).toBeGreaterThanOrEqual(28);
          for (const e of bass) expect(e.midi as number, where).toBeLessThanOrEqual(60);
          for (const e of chords) expect(e.midi as number, where).toBeGreaterThanOrEqual(40);
          for (const e of chords) expect(e.midi as number, where).toBeLessThanOrEqual(76);
          for (const e of [...bass, ...chords, ...ev])
            expect(Number(e.value.gain ?? 1), where).toBeLessThanOrEqual(0.9);
        }
      });
});

describe("the swing Bands: a walking bass the walking-bass rule accepts, swung eighths on the last triplet", () => {
  const swing = WAVE7_BANDS.filter((b) => b.swing?.subdivision === 8);
  test("three swing Bands", () => {
    expect(swing.map((b) => b.id)).toEqual(["band.swing-two-five", "band.jazz-blues", "band.rhythm-changes"]);
  });
  for (const band of swing)
    test(`${band.id}: every quarter walked, root on 1, a chord tone on 3, beat 4 a half step from the next bar`, async () => {
      for (const tonic of ["C", "F", "Bb", "Gb"]) {
        const ev = await eventsOf(band, "flavour.jazz-soul", tonic);
        const changes = changesOf(band, tonic);
        const bass = ev.filter((e) => e.track === "bass").sort((a, b) => a.onset - b.onset);
        expect(bass.length).toBe(band.bars * 4);
        for (let bar = 0; bar < band.bars; bar++) {
          const beats = bass.slice(bar * 4, bar * 4 + 4);
          expect(beats.map((e) => e.onset).every((o, i) => near(o, bar + i / 4))).toBe(true);
          const [b1, , b3, b4] = beats.map((e) => e.midi as number) as [number, number, number, number];
          const here = changeAt(changes, bar)[0] as Change;
          const three = changeAt(changes, bar + 0.5)[0] as Change;
          expect(mod12(b1), `${band.id} ${tonic} bar ${bar + 1}`).toBe(here.root);
          expect(three.tones.includes(mod12(b3)), `${band.id} ${tonic} bar ${bar + 1} beat 3`).toBe(true);
          const nextDown = (bass[((bar + 1) % band.bars) * 4] as HeadlessEvent).midi as number;
          expect(Math.abs(b4 - nextDown), `${band.id} ${tonic} bar ${bar + 1} beat 4`).toBe(1);
        }
      }
    });

  test("the ride's skip notes and the comping's push land on the last triplet of the beat (swingBy 1/3, 4)", async () => {
    const band = WAVE7_BANDS[0] as Wave7Band;
    const ev = await eventsOf(band, "flavour.jazz-soul", "C");
    const off = swingOffbeat(1 / 3, 8);
    expect(near(off, 1 / 6)).toBe(true); // within a beat of 1/4 cycle: the "and" at 2/3 of the beat
    const ride = ev.filter((e) => e.track === "drums" && e.s === "rd").map((e) => e.onset % 1);
    const expected = [0, 1 / 4, 1 / 4 + 1 / 6, 1 / 2, 3 / 4, 3 / 4 + 1 / 6];
    for (const o of ride)
      expect(
        expected.some((x) => near(o, x)),
        `ride at ${o}`,
      ).toBe(true);
    const comp = [...new Set(ev.filter((e) => e.track === "chords").map((e) => e.onset % 1))];
    for (const o of comp)
      expect(
        [0, 1 / 4 + 1 / 6].some((x) => near(o, x)),
        `comp at ${o}`,
      ).toBe(true);
    expect(swingRatio(1 / 3)).toBeCloseTo(2, 9);
  });
});

describe("the neo-soul groove, the funk, the clave and the odd meters", () => {
  test("neo-soul: the snare on 2 and 4 (laid back 8–45 ms where the Band leans; the landed loop leaves the lean to the learner); hats swing 16ths within AC2's range", async () => {
    const band = WAVE7_BANDS.find((b) => b.id === "band.neo-soul") as Wave7Band;
    const ev = await eventsOf(band, "flavour.jazz-soul", "C");
    const snare = ev.filter((e) => e.track === "drums" && e.s === "sd").map((e) => e.onset % 1);
    expect(snare.length).toBeGreaterThan(0);
    const late = band.late ?? 0;
    for (const o of snare) expect([1 / 4, 3 / 4].some((x) => near(o, x + late))).toBe(true);
    if (band.late !== undefined)
      for (const bpm of [66, 76, 88, 96]) {
        const ms = lateMs(band.late, bpm);
        expect(ms, `${bpm} BPM`).toBeGreaterThanOrEqual(FEEL_MS[0]);
        expect(ms, `${bpm} BPM`).toBeLessThanOrEqual(FEEL_MS[1]);
      }
    const ratio = swingRatio(band.swing?.amount as number);
    expect(ratio).toBeGreaterThanOrEqual(1.2); // AC2: swing 16 with a ratio in [1.2, 2.4]
    expect(ratio).toBeLessThanOrEqual(2.4);
    const hats = ev.filter((e) => e.s === "hh").map((e) => e.onset % (1 / 8));
    const offs = hats.filter((o) => o > 1e-6);
    for (const o of offs) expect(near(o, swingOffbeat(band.swing?.amount as number, 16))).toBe(true);
  });

  test("funk: ghost snares at .35 on the 'a' of 2 and of 4 and the 'e' of 3, the chords chopped short", async () => {
    const band = WAVE7_BANDS.find((b) => b.id === "band.funk-16") as Wave7Band;
    for (const f of FLAVOURS) {
      const ev = await eventsOf(band, f, "C");
      const vel = (e: HeadlessEvent) => (typeof e.value.velocity === "number" ? e.value.velocity : 1);
      const ghosts = ev
        .filter((e) => e.s === "sd" && vel(e) < 0.5)
        .map((e) => Math.round((e.onset % 1) * 16));
      expect(
        [...new Set(ghosts)].sort((a, b) => a - b),
        f,
      ).toEqual([7, 9, 15]);
      for (const e of ev.filter((x) => x.track === "chords")) expect(e.value.clip, f).toBe(0.3);
    }
  });

  test("son clave: band.son-clave's rim plays son 3-2 on the 2-bar 8th grid; band.son-montuno has no clave", async () => {
    const withClave = WAVE7_BANDS.find((b) => b.id === "band.son-clave") as Wave7Band;
    const without = WAVE7_BANDS.find((b) => b.id === "band.son-montuno") as Wave7Band;
    const grid = CLAVE_GRIDS.son["3-2"].map((bar) => bar.map(([n, d]) => n / d));
    for (const f of FLAVOURS) {
      const ev = await eventsOf(withClave, f, "G");
      for (const bar of [0, 1]) {
        const rim = ev
          .filter((e) => e.s === "rim" && Math.floor(e.onset + 1e-9) === bar)
          .map((e) => e.onset - bar)
          .sort((a, b) => a - b);
        expect(rim.length, f).toBe((grid[bar] as number[]).length);
        rim.forEach((o, i) => {
          expect(near(o, (grid[bar] as number[])[i] as number), `${f} bar ${bar + 1}`).toBe(true);
        });
      }
      expect(
        (await eventsOf(without, f, "G")).some((e) => e.s === "rim"),
        f,
      ).toBe(false);
    }
  });

  for (const id of ["band.odd-5-4", "band.odd-7-8", "band.odd-9-8"])
    test(`${id}: kick and snare on the group starts only, every start marked, the hats accented there`, async () => {
      const band = WAVE7_BANDS.find((b) => b.id === id) as Wave7Band;
      const starts = meterGroups(band.meter).starts.map(([n, d]) => n / d);
      for (const f of FLAVOURS) {
        const ev = await eventsOf(band, f, "C");
        for (let bar = 0; bar < band.bars; bar++) {
          const inBar = ev.filter((e) => Math.floor(e.onset + 1e-9) === bar);
          const accents = inBar.filter((e) => e.s === "bd" || e.s === "sd").map((e) => e.onset - bar);
          for (const o of accents)
            expect(
              starts.some((x) => near(o, x)),
              `${id} ${f}: accent at ${o}`,
            ).toBe(true);
          for (const s of starts)
            expect(
              accents.some((o) => near(o, s)),
              `${id} ${f}: start ${s}`,
            ).toBe(true);
          const vel = (e: HeadlessEvent) => (typeof e.value.velocity === "number" ? e.value.velocity : 1);
          for (const h of inBar.filter((e) => e.s === "hh"))
            expect(vel(h) === 1, `${id} ${f}: hat at ${h.onset - bar}`).toBe(
              starts.some((x) => near(h.onset - bar, x)),
            );
        }
      }
    });
});

describe("the strict Band lint (profile 'band', as content/validate/bands.test.ts runs it)", () => {
  for (const band of WAVE7_BANDS)
    test(band.id, () => {
      const units = METERS[band.meter].unitsPerBar;
      for (const flavour of FLAVOURS) {
        const code = `setcpm(96/${units})\n\n${band.code[flavour].replaceAll("{{key}}", "C4:major")}`;
        const res = lint(code, {
          session: "U01.L01",
          meter: band.meter,
          allowPreview: true,
          profile: "band",
        });
        expect(
          res.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.id} ${d.message}`),
          `${band.id} ${flavour}`,
        ).toEqual([]);
      }
    });
});

describe("swingBacking: a standard's backing from its changes, in its own key", () => {
  test("note names in the key, walking and two-feel, brushes for a ballad; triads refused with the fix", async () => {
    const chart = [["Ebm7", "Ab7"], ["Db^7"], ["Bbm7", "Eb7"], ["Abm7", "Db7"]] as const;
    const four = swingBacking(chart, { bank: "jazzkit" });
    expect(four.bass).toContain('note("<[');
    const r = await evalHeadless(
      `setcpm(120/4)\ndrums: ${four.drums}\nbass: ${four.bass}\nchords: ${four.chords}`,
      4,
    );
    expect(r.logs.filter((l) => /error|\[(mini|query|eval)\]/i.test(l))).toEqual([]);
    expect(r.events.filter((e) => e.track === "bass").length).toBe(16);
    const plan = swingPlan(chart);
    expect(plan.map((b) => mod12(b.bass[0] as number))).toEqual([3, 1, 10, 8]);
    for (const b of plan) expect(b.chords.every((v) => v.length === 4)).toBe(true);
    const two = swingPlan(chart, { feel: "two" });
    expect(two.every((b) => b.bass.length === 2)).toBe(true);
    const brushes = swingBacking(chart, { drums: "brushes", bank: "jazzkit" });
    expect(brushes.drums).toContain('s("sd:2 ~ sd:2 ~")');
    expect(() => swingPlan([["C"]])).toThrow(/triad/);
  });

  test("the comping moves the hand little: from chord to chord no voice leaps more than a fourth", () => {
    for (const band of WAVE7_BANDS.filter((b) => b.swing?.subdivision === 8)) {
      const plan = swingPlan(band.changes);
      const voicings = plan.flatMap((b) => b.chords);
      for (let i = 1; i < voicings.length; i++) {
        const [a, b] = [voicings[i - 1] as number[], voicings[i] as number[]];
        const moves = b.map((m, j) => Math.abs(m - (a[j] as number)));
        expect(Math.max(...moves), `${band.id} change ${i}`).toBeLessThanOrEqual(5);
      }
    }
  });
});
