// The proposed Wave 6 Bands (wave6-bands.ts), checked on the code the adapter would receive (`bandCodeFor`),
// evaluated in headless Strudel in every key a U12–U17 lesson uses for that Band: the harmony each Band says it
// plays, the mode it states, the applied and borrowed chords and where they resolve, the grouping of the compound
// meters, the pushes and ghost notes, the production defaults of the flavour, and the strict Band lint.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { evalHeadless, type HeadlessEvent } from "@oak/grader/testing";
import {
  appliedReading,
  borrowedReading,
  bpmToCpm,
  characteristicTonesOf,
  chordPcs,
  chromaticChordKind,
  METERS,
  modesContaining,
  parseChordSymbol,
  scalePcs,
} from "@oak/theory";
import { bandById } from "../../../content/bands/index.ts";
import { flavourById } from "../../../content/flavours.ts";
import { lint } from "../../../content/validate/harness.ts";
import { bandCodeFor, tonicOffset } from "../src/band.ts";
import type { BandSetup } from "../src/types.ts";
import { FLAVOURS, type Flavour, WAVE6_BANDS, type Wave6Band } from "./wave6-bands.ts";

setDefaultTimeout(60_000);

/** The keys the lessons of each mode use (content/specs U12–U17), plus the edges of the Band's register fold. */
const KEYS: Record<Wave6Band["mode"], readonly string[]> = {
  major: ["C", "F", "G", "D", "A", "Bb", "Eb", "E", "B"],
  mixolydian: ["G", "D", "A", "C", "E"],
  dorian: ["D", "A", "E", "G", "C"],
  lydian: ["F", "C", "G", "Bb"],
  phrygian: ["E", "A", "B", "D"],
};
const mod12 = (x: number): number => ((Math.round(x) % 12) + 12) % 12;
const beatsOf = (b: Wave6Band): number => METERS[b.meter].unitsPerBar;

function codeFor(band: Wave6Band, flavour: Flavour, tonic: string): string {
  const setup: BandSetup = {
    band: band.id as never,
    flavour: flavour as never,
    code: band.code[flavour],
    followsLearnerKey: false,
    tracks: ["drums", "bass", "chords"],
  };
  return bandCodeFor(setup, { key: { tonic, mode: band.mode } as never, defaultBpm: 96, learnerCode: "" });
}
async function eventsOf(band: Wave6Band, flavour: Flavour, tonic: string): Promise<HeadlessEvent[]> {
  const r = await evalHeadless(
    `setcpm(96/${beatsOf(band)})\n${codeFor(band, flavour, tonic)}`,
    band.bars * 2,
  );
  expect(
    r.logs.filter((l) => /\[(mini|tonal|voicing|query|eval)\]|error/i.test(l)),
    `${band.id} ${flavour} ${tonic}`,
  ).toEqual([]);
  return r.events;
}
/** The Band's harmony in `tonic`: its `changes` (written on C) moved up, as pitch-class sets with their roots. */
function changesIn(band: Wave6Band, tonic: string): { symbol: string; root: number; pcs: number[] }[] {
  const shift = tonicOffset(tonic);
  return band.changes.map((symbol) => {
    const chord = parseChordSymbol(symbol);
    if (!chord) throw new Error(`bad change ${symbol}`);
    return {
      symbol,
      root: mod12(chord.rootPc + shift),
      pcs: chordPcs(chord).map((pc) => mod12(pc + shift)),
    };
  });
}
/** The chords track cut where its pitch-class set changes: one entry per chord the Band plays, in order. */
function chordsPlayed(events: HeadlessEvent[], bars: number): { at: number; pcs: number[]; low: number }[] {
  const out: { at: number; pcs: number[]; low: number }[] = [];
  const onsets = [
    ...new Set(events.filter((e) => e.track === "chords" && e.onset < bars).map((e) => e.onset)),
  ].sort((a, b) => a - b);
  for (const at of onsets) {
    const notes = events.filter((e) => e.track === "chords" && e.onset === at && e.midi !== null);
    const pcs = [...new Set(notes.map((e) => mod12(e.midi as number)))].sort((a, b) => a - b);
    const prev = out[out.length - 1];
    const low = Math.min(...notes.map((e) => e.midi as number));
    // C6 and Am7 are the same four notes (content/bands): the voicing's lowest note tells them apart.
    if (!prev || prev.pcs.join() !== pcs.join() || prev.low !== low) out.push({ at, pcs, low });
  }
  return out;
}

describe("the proposed Wave 6 Bands exist in every flavour and are not yet in content/bands", () => {
  test("nine Bands, four flavours each, three labelled tracks", () => {
    expect(WAVE6_BANDS.map((b) => b.id)).toEqual([
      "band.compound-6-8",
      "band.compound-12-8",
      "band.funk-push",
      "band.mixolydian-rock",
      "band.dorian-soul",
      "band.lydian-pad",
      "band.phrygian-figure",
      "band.applied-4bar",
      "band.borrowed-4bar",
    ]);
    for (const b of WAVE6_BANDS)
      for (const f of FLAVOURS)
        expect(
          b.code[f].split("\n").map((l) => l.split(":")[0]),
          `${b.id} ${f}`,
        ).toEqual(["drums", "bass", "chords"]);
  });
  test("a Band that has landed in content/bands plays the same code (the proposal moved unchanged)", () => {
    for (const b of WAVE6_BANDS) {
      const landed = bandById.get(b.id);
      if (!landed) continue;
      for (const f of FLAVOURS) expect(landed.code[f as never], `${b.id} ${f}`).toBe(b.code[f]);
    }
  });
});

describe("harmony, register and production in every lesson key", () => {
  for (const band of WAVE6_BANDS)
    for (const flavour of FLAVOURS)
      test(`${band.id} in ${flavour}`, async () => {
        const prod = flavourById.get(flavour as never)?.production;
        if (!prod) throw new Error(`no production for ${flavour}`);
        for (const tonic of KEYS[band.mode]) {
          const where = `${band.id} ${flavour} in ${tonic} ${band.mode}`;
          const ev = await eventsOf(band, flavour, tonic);
          const by = (t: string) => ev.filter((e) => e.track === t);
          const [drums, bass, chords] = [by("drums"), by("bass"), by("chords")];
          expect(drums.length, where).toBeGreaterThanOrEqual(band.bars * 2 * 2);
          expect(bass.length, where).toBeGreaterThanOrEqual(band.bars * 2);
          expect(chords.length, where).toBeGreaterThanOrEqual(band.bars * 2 * 3);

          // The harmony: each chord the Band plays holds every note of the change it names, root in the bass.
          const want = changesIn(band, tonic);
          const played = chordsPlayed(ev, band.bars).filter((c) => c.at >= 0);
          // A pushed Band's first pass starts after its first chord (U13.L01): read the second pass.
          const pass =
            band.id === "band.funk-push"
              ? chordsPlayed(
                  ev.filter((e) => e.onset >= band.bars - 0.25),
                  band.bars * 2,
                )
              : played;
          expect(pass.length, where).toBeGreaterThanOrEqual(want.length);
          for (let i = 0; i < want.length; i++) {
            const [w, p] = [want[i] as (typeof want)[number], pass[i] as (typeof pass)[number]];
            for (const pc of w.pcs) expect(p.pcs, `${where}: ${w.symbol} (chord ${i + 1})`).toContain(pc);
            // The bass states the root where the chord arrives (a pushed chord's root is the bass's push).
            // (the note the bass is on when the chord is struck, or its next one when it is resting)
            const sorted = bass.filter((e) => e.midi !== null).sort((a, b) => a.onset - b.onset);
            const bar = Math.floor(p.at + 1e-9);
            const near =
              sorted.filter((e) => e.onset <= p.at + 1e-9 && e.onset >= bar - 1e-9).at(-1) ??
              sorted.find((e) => e.onset > p.at);
            if (band.id !== "band.lydian-pad" || i === 0)
              expect(mod12(near?.midi as number), `${where}: bass under ${w.symbol}`).toBe(w.root);
          }

          // Register: the bass between E1 and G3 and never over the chords' lowest voice; chords within E2–E5.
          for (const e of bass) {
            expect(e.midi as number, where).toBeGreaterThanOrEqual(28);
            expect(e.midi as number, where).toBeLessThanOrEqual(55);
          }
          for (const e of chords) {
            expect(e.midi as number, where).toBeGreaterThanOrEqual(40);
            expect(e.midi as number, where).toBeLessThanOrEqual(76);
          }
          for (let bar = 0; bar < band.bars; bar++) {
            const inBar = (xs: HeadlessEvent[]) => xs.filter((e) => Math.floor(e.onset + 1e-9) === bar);
            const low = Math.min(...inBar(chords).map((e) => e.midi as number));
            const high = Math.max(...inBar(bass).map((e) => e.midi as number));
            if (Number.isFinite(low) && Number.isFinite(high))
              expect(low - high, `${where} bar ${bar + 1}`).toBeGreaterThanOrEqual(0);
          }

          // Production (contracts §5.10): the kit's room, pan and bass low-pass; humanised hits within ±0.08 of
          // .92; ghost notes, where the Band has them, at .35; nothing over .9 in gain.
          for (const e of bass) {
            expect(e.value.cutoff, where).toBe(prod.bassLpf);
            expect(e.value.pan ?? 0.5, where).toBe(0.5);
          }
          for (const e of chords) {
            expect(e.value.room, where).toBe(prod.room);
            expect(e.value.pan, where).toBe(prod.pan.chords);
          }
          const vel = (e: HeadlessEvent) => (typeof e.value.velocity === "number" ? e.value.velocity : 1);
          const ghosts = drums.filter((e) => vel(e) <= 0.4);
          expect(ghosts.length, where).toBe(band.id === "band.funk-push" ? 3 * band.bars * 2 : 0);
          for (const g of ghosts) expect([g.s, vel(g)], where).toEqual(["sd", 0.35]);
          for (const part of [drums.filter((e) => vel(e) > 0.4), chords]) {
            const vs = part.map(vel);
            expect(new Set(vs).size, where).toBeGreaterThan(1);
            expect(Math.min(...vs), where).toBeGreaterThanOrEqual(1 - 2 * prod.humanizeVelocity - 1e-9);
            expect(Math.max(...vs), where).toBeLessThanOrEqual(1);
          }
          for (const e of [...drums, ...bass, ...chords])
            expect(Number(e.value.gain ?? 1), where).toBeLessThanOrEqual(0.9);
        }
      });
});

describe("the strict Band lint (profile 'band', as content/validate/bands.test.ts runs it)", () => {
  for (const band of WAVE6_BANDS)
    test(band.id, () => {
      for (const flavour of FLAVOURS) {
        const code = `setcpm(96/${beatsOf(band)})\n\n${band.code[flavour].replaceAll("{{key}}", `C4:${band.mode}`)}`;
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

describe("compound meters (contracts §6.9): the bar is two or four beats of three, tempo counts the dotted quarter", () => {
  const compound = WAVE6_BANDS.filter((b) => b.meter === "6/8" || b.meter === "12/8");
  test("a 6/8 and a 12/8 Band, with the tempo unit of §6.9", () => {
    expect(compound.map((b) => b.meter)).toEqual(["6/8", "12/8"]);
    // One cycle is one bar: 60 BPM to the dotted quarter is setcpm(60/2) in 6/8 and setcpm(60/4) in 12/8.
    expect(bpmToCpm(60, "6/8")).toBe(30);
    expect(bpmToCpm(60, "12/8")).toBe(15);
    expect(METERS["6/8"].unitsPerBar).toBe(2);
    expect(METERS["12/8"].unitsPerBar).toBe(4);
  });
  for (const band of compound)
    for (const flavour of FLAVOURS)
      test(`${band.id} in ${flavour}: eighths in threes, the kick on beat 1, a backbeat, no swing`, async () => {
        const ev = (await eventsOf(band, flavour, "C")).filter((e) => e.onset < band.bars);
        const beats = beatsOf(band);
        const eighths = beats * 3;
        // Every onset sits on the bar's eighths (funk's hats on its sixteenths): nothing swung, nothing in twos.
        for (const e of ev) {
          const pos = (e.onset % 1) * eighths * 2;
          expect(Math.abs(pos - Math.round(pos)), `${e.track} at ${e.begin}`).toBeLessThan(1e-6);
        }
        expect(band.code[flavour]).not.toContain("swingBy");
        const drums = ev.filter((e) => e.track === "drums");
        const at = (e: HeadlessEvent) => Math.round((e.onset % 1) * eighths * 1000) / 1000;
        for (let bar = 0; bar < band.bars; bar++) {
          const inBar = drums.filter((e) => Math.floor(e.onset + 1e-9) === bar);
          expect(
            inBar.some((e) => e.s === "bd" && at(e) === 0),
            `kick on 1, bar ${bar + 1}`,
          ).toBe(true);
          // The backbeat is the beat's own: the fourth eighth (beat 2), and the tenth in 12/8 (beat 4).
          const snares = inBar.filter((e) => e.s === "sd").map(at);
          expect(snares, `bar ${bar + 1}`).toEqual(beats === 2 ? [3] : [3, 9]);
          // The ride or hats mark every eighth and lean on the first of each three.
          const top = inBar.filter((e) => e.s === "hh" || e.s === "rd");
          const leans = top.filter((e) => e.value.velocity === 1).map(at);
          expect(leans, `bar ${bar + 1}`).toEqual(Array.from({ length: beats }, (_, k) => k * 3));
          for (let k = 0; k < eighths; k++)
            expect(
              top.some((e) => at(e) === k),
              `eighth ${k + 1}`,
            ).toBe(true);
        }
        // The bass and the chords land on beat 1 of every bar.
        for (const t of ["bass", "chords"])
          for (let bar = 0; bar < band.bars; bar++) {
            const first = ev
              .filter((e) => e.track === t && Math.floor(e.onset + 1e-9) === bar)
              .map((e) => at(e))
              .sort((a, b) => a - b)[0] as number;
            expect(first, `${t} bar ${bar + 1}`).toBeLessThanOrEqual(t === "chords" ? 1 : 0);
          }
      });
});

describe("band.funk-push: chords an eighth early, the bass locked to the kick, three ghost notes a bar", () => {
  const band = WAVE6_BANDS.find((b) => b.id === "band.funk-push") as Wave6Band;
  for (const flavour of FLAVOURS)
    test(flavour, async () => {
      const ev = await eventsOf(band, flavour, "C");
      const pos = (e: HeadlessEvent) => Math.round((e.onset % 1) * 16);
      const second = (t: string) => ev.filter((e) => e.track === t && e.onset >= 2 && e.onset < 4);
      // The chords strike on the "and" of 2 and the "and" of 4, never on a beat.
      expect([...new Set(second("chords").map(pos))].sort((a, b) => a - b)).toEqual([6, 14]);
      // The chord on the "and" of 4 is the NEXT bar's chord: the push.
      const pushed = second("chords").filter((e) => Math.floor(e.onset) === 2 && pos(e) === 14);
      const next = second("chords").filter((e) => Math.floor(e.onset) === 3 && pos(e) === 6);
      expect(pushed.map((e) => e.midi).sort()).toEqual(next.map((e) => e.midi).sort());
      const g = chordPcs(parseChordSymbol("G") as never);
      for (const pc of g) expect(pushed.map((e) => mod12(e.midi as number))).toContain(pc);
      // The kick and the bass share every hit; the bass's last note of the bar is the next chord's root.
      const kick = second("drums").filter((e) => e.s === "bd");
      expect([...new Set(kick.map(pos))].sort((a, b) => a - b)).toEqual([0, 6, 14]);
      expect([...new Set(second("bass").map(pos))].sort((a, b) => a - b)).toEqual([0, 6, 14]);
      const lastOfBar = second("bass").filter((e) => Math.floor(e.onset) === 2 && pos(e) === 14)[0];
      expect(mod12(lastOfBar?.midi as number)).toBe(7);
      // The snare: loud on 2 and 4, a ghost on the "a" of 2, the "e" of 3 and the "a" of 4.
      const snare = second("drums").filter((e) => e.s === "sd" && Math.floor(e.onset) === 2);
      expect(snare.map((e) => [pos(e), e.value.velocity])).toEqual([
        [4, 1],
        [7, 0.35],
        [9, 0.35],
        [12, 1],
        [15, 0.35],
      ]);
      expect(band.code[flavour]).not.toContain("swingBy");
    });
});

describe("the modal Bands state their mode (U14): its own notes only, the colour note in the colour chord", () => {
  for (const band of WAVE6_BANDS.filter((b) => !["major"].includes(b.mode)))
    for (const flavour of FLAVOURS)
      test(`${band.id} in ${flavour}`, async () => {
        for (const tonic of KEYS[band.mode]) {
          const key = { tonic, mode: band.mode } as KeySpec;
          const where = `${band.id} ${flavour} in ${tonic} ${band.mode}`;
          const ev = (await eventsOf(band, flavour, tonic)).filter((e) => e.midi !== null);
          const pcs = new Set(ev.map((e) => mod12(e.midi as number)));
          const scale = new Set<number>(scalePcs(key));
          for (const pc of pcs) expect(scale.has(pc), `${where}: pitch class ${pc}`).toBe(true);
          // Among the scales the course teaches on this tonic, only this mode holds every note the Band plays.
          expect(modesContaining(pcs, tonicOffset(tonic) % 12), where).toEqual([band.mode]);
          // The colour note (♭7, raised 6, ♯4, ♭2) sounds in the chords, in the bar of the colour chord.
          const colour = characteristicTonesOf(key).map((t) => t.pc as number);
          expect(colour.length, where).toBeGreaterThan(0);
          const chordPcsPlayed = new Set(
            ev.filter((e) => e.track === "chords").map((e) => mod12(e.midi as number)),
          );
          for (const pc of colour) expect(chordPcsPlayed.has(pc), `${where}: colour note ${pc}`).toBe(true);
          // Home is where the loop starts and where at least half its bars sit, in the bass.
          const bassBars = Array.from(
            { length: band.bars },
            (_, bar) =>
              ev
                .filter((e) => e.track === "bass" && Math.floor(e.onset + 1e-9) === bar)
                .sort((a, b) => a.onset - b.onset)[0],
          );
          const home = bassBars.filter((e) => mod12(e?.midi as number) === tonicOffset(tonic) % 12).length;
          expect(mod12(bassBars[0]?.midi as number), where).toBe(tonicOffset(tonic) % 12);
          expect(home / band.bars, where).toBeGreaterThanOrEqual(0.5);
        }
      });
});

describe("the chromatic Bands (U15–U16): every outside chord is what it says and goes where it should", () => {
  const key = (tonic: string): KeySpec => ({ tonic, mode: "major" }) as KeySpec;
  const chordIn = (symbol: string, tonic: string) => {
    const c = parseChordSymbol(symbol);
    if (!c) throw new Error(symbol);
    return { ...c, rootPc: mod12(c.rootPc + tonicOffset(tonic)) } as typeof c;
  };
  test("applied: E7 is V7/vi and resolves to vi; D7 is V7/V and resolves to V7 (theory's reading, in C)", () => {
    const [e7, am, d7, g7] = ["E7", "Am", "D7", "G7"].map((s) => parseChordSymbol(s) as never);
    const k = key("C");
    expect(chromaticChordKind(e7, k, am)).toBe("applied");
    expect(appliedReading(e7, k, am)).toMatchObject({ kind: "V7", resolves: true });
    expect(appliedReading(e7, k, am)?.rn).toBe("V7/vi");
    expect(appliedReading(d7, k, g7)).toMatchObject({ kind: "V7", resolves: true });
    expect(appliedReading(d7, k, g7)?.rn).toBe("V7/V");
    expect(chromaticChordKind(am, k, d7)).toBe("diatonic");
  });
  test("borrowed: Fm is iv, A♭ is ♭VI, B♭ is ♭VII, each from the parallel minor (theory's reading, in C)", () => {
    const k = key("C");
    const read = (s: string) => borrowedReading(parseChordSymbol(s) as never, k)?.rn;
    expect([read("Fm"), read("Ab"), read("Bb"), read("C")]).toEqual(["iv", "bVI", "bVII", undefined]);
    for (const s of ["Fm", "Ab", "Bb"])
      expect(chromaticChordKind(parseChordSymbol(s) as never, k)).toBe("borrowed");
  });
  for (const flavour of FLAVOURS) {
    test(`band.applied-4bar in ${flavour}: the raised note moves up a half step into the next chord, in every key`, async () => {
      const band = WAVE6_BANDS.find((b) => b.id === "band.applied-4bar") as Wave6Band;
      for (const tonic of KEYS.major) {
        const ev = await eventsOf(band, flavour, tonic);
        const played = chordsPlayed(ev, band.bars);
        expect(played.length, tonic).toBe(5);
        const t = tonicOffset(tonic);
        // ♯5 (G♯ in C) in the second chord, then 6; ♯4 (F♯) in the fourth, then 5. Each outside chord is a full
        // dominant seventh; neither raised note is anywhere else in the loop.
        const [sharp5, six, sharp4, five] = [8, 9, 6, 7].map((s) => mod12(t + s));
        expect(played[1]?.pcs, tonic).toContain(sharp5);
        expect(played[2]?.pcs, tonic).toContain(six);
        expect(played[3]?.pcs, tonic).toContain(sharp4);
        expect(played[4]?.pcs, tonic).toContain(five);
        for (const i of [0, 2, 4]) {
          expect(played[i]?.pcs, tonic).not.toContain(sharp5);
          expect(played[i]?.pcs, tonic).not.toContain(sharp4);
        }
        for (const [i, sym] of [
          [1, "E7"],
          [3, "D7"],
        ] as const)
          expect(
            [...(played[i]?.pcs ?? [])].sort((a, b) => a - b),
            tonic,
          ).toEqual([...chordPcs(chordIn(sym, tonic))].sort((a, b) => a - b));
        // Both dominants are struck: V7/V in the first half of bar 4, V7 in its second half.
        expect(played[3]?.at, tonic).toBeGreaterThanOrEqual(3);
        expect(played[3]?.at, tonic).toBeLessThanOrEqual(3.25);
        expect(played[4]?.at, tonic).toBeGreaterThanOrEqual(3.5);
        expect(played[4]?.at, tonic).toBeLessThanOrEqual(3.75);
      }
    });
    test(`band.borrowed-4bar in ${flavour}: iv, ♭VI and ♭VII with their lowered notes, in every key`, async () => {
      const band = WAVE6_BANDS.find((b) => b.id === "band.borrowed-4bar") as Wave6Band;
      for (const tonic of KEYS.major) {
        const ev = await eventsOf(band, flavour, tonic);
        const played = chordsPlayed(ev, band.bars);
        expect(played.length, tonic).toBe(4);
        const t = tonicOffset(tonic);
        const [flat6, flat3, flat7] = [8, 3, 10].map((s) => mod12(t + s));
        expect(played[0]?.pcs, tonic).not.toContain(flat6);
        expect(played[1]?.pcs, tonic).toContain(flat6); // iv: the lowered 6th is its third
        expect(played[2]?.pcs, tonic).toContain(flat6); // ♭VI: its root
        expect(played[2]?.pcs, tonic).toContain(flat3);
        expect(played[3]?.pcs, tonic).toContain(flat7); // ♭VII: its root
        // The bass walks 1 – 4 – ♭6 – ♭7 and the loop turns ♭7 up a whole step to 1.
        const roots = [0, 1, 2, 3].map((bar) =>
          mod12(
            ev
              .filter((e) => e.track === "bass" && Math.floor(e.onset + 1e-9) === bar)
              .sort((a, b) => a.onset - b.onset)[0]?.midi as number,
          ),
        );
        expect(roots, tonic).toEqual([0, 5, 8, 10].map((s) => mod12(t + s)));
      }
    });
  }
});
