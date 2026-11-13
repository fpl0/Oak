// The Band layers as U03–U04 use them (contracts §5.10, FLAVOUR_RULES): the stage each flavour plays at a
// point of the course, every (band, flavour, stage) in all twelve major keys, the production defaults of
// the kits, the register, and the music the lessons and checkpoints put over each flavour. The frozen
// content/validate/bands.test.ts checks each Band's first stage in three keys; course.test.ts scans the
// pop Band under every lesson. This file adds the later stages, every key and the other three flavours.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  type BandRef,
  type CheckpointDef,
  type Exercise,
  type FlavourId,
  flattenExercise,
  type LessonDef,
  type SessionId,
  stripMarkers,
} from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { CHECKPOINT_MAKE_BANDS } from "../checkpoints.ts";
import { flavourById, flavours } from "../flavours.ts";
import { courseGraph } from "../index.ts";
import { atOrBefore } from "../lib/course.ts";
import { loadCheckpointFiles, loadLessons } from "../lib/load.bun.ts";
import { BAD_LOG, evaluate, lint } from "../validate/harness.ts";
import { BAND_STAGES, bandById, bandCodeAt, bandMeter, bands } from "./index.ts";

setDefaultTimeout(120_000);
const g = courseGraph();
const at = (session: string) => (from: string) => atOrBefore(g, from as SessionId, session as SessionId);
const KEYS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"].map((t) => `${t}4:major`);
const fill = (code: string, key = "C4:major", beats = 4, bpm = 96) =>
  `setcpm(${bpm}/${beats})\n\n${code.replaceAll("{{key}}", key).replaceAll("{{bpm}}", String(bpm))}`;
const beatsOf = (id: string) => Number(bandMeter(id).split("/")[0]);
const rat = (x: string | number): number => {
  const [a, b] = String(x).split("/").map(Number);
  return b ? (a as number) / b : (a as number);
};
/** Every code a Band can play: its first stage and each later one, per flavour. */
const allCodes = bands.flatMap((b) =>
  Object.entries(b.code).flatMap(([flavour, code]) => [
    { band: b.id, flavour, stage: "first", code },
    ...(BAND_STAGES[b.id]?.[flavour as FlavourId] ?? []).map((s) => ({
      band: b.id,
      flavour,
      stage: s.from as string,
      code: s.code,
    })),
  ]),
);
const lineOf = (code: string, label: string) => code.split("\n").find((l) => l.startsWith(`${label}:`)) ?? "";

describe("stages (FLAVOUR_RULES, contracts §5.10)", () => {
  const vamp = "band.two-chord-vamp";
  test("jazz-soul: triads and straight before U03, four-note chords and swing from U03.L01", () => {
    const u02 = bandCodeAt(vamp, "flavour.jazz-soul", at("U02.L08"));
    const u03 = bandCodeAt(vamp, "flavour.jazz-soul", at("U03.L02"));
    expect(u02).toBe(bandById.get(vamp)?.code["flavour.jazz-soul"] as string);
    expect(u02).not.toContain("swingBy");
    expect(u03).toContain("swingBy(1/3, 4)");
    expect(bandCodeAt(vamp, "flavour.jazz-soul", at("U03.CP"))).toBe(u03);
    expect(bandCodeAt(vamp, "flavour.jazz-soul", at("U04.CP"))).toBe(u03);
    expect(bandCodeAt("band.waltz-vamp", "flavour.jazz-soul", at("U03.L01"))).toContain("swingBy(1/3, 3)");
  });
  test("funk: triads until U06, four-note chords from U06.L01; pop and indie never change", () => {
    expect(bandCodeAt(vamp, "flavour.funk", at("U05.L08"))).toBe(
      bandById.get(vamp)?.code["flavour.funk"] as string,
    );
    expect(bandCodeAt(vamp, "flavour.funk", at("U06.L02"))).not.toBe(
      bandById.get(vamp)?.code["flavour.funk"] as string,
    );
    for (const f of ["flavour.pop", "flavour.indie"])
      for (const b of bands) expect(bandCodeAt(b.id, f, at("U17.L04"))).toBe(b.code[f as never] as string);
  });
  test("an unknown flavour plays pop; an unknown band is an error", () => {
    expect(bandCodeAt(vamp, "flavour.unknown", at("U03.L02"))).toBe(
      bandById.get(vamp)?.code["flavour.pop"] as string,
    );
    expect(() => bandCodeAt("band.nope", "flavour.pop", at("U03.L02"))).toThrow();
  });
});

describe("every band, flavour and stage in all twelve keys", () => {
  for (const c of allCodes)
    test(`${c.band} × ${c.flavour} (${c.stage})`, async () => {
      const b = bandById.get(c.band);
      for (const key of KEYS) {
        const r = await evaluate(fill(c.code, key, beatsOf(c.band)), b?.bars ?? 2);
        expect([key, r.ok, r.error ?? ""]).toEqual([key, true, ""]);
        expect(r.logs.filter((l) => BAD_LOG.test(l))).toEqual([]);
        expect([...r.tracks].sort()).toEqual([...(b?.roles ?? [])].sort());
        // Register. `{{key}}` puts the tonic in octave 4 whatever the key, so from F# up to B the whole
        // Band sits up to a fifth higher than in C: the bass's roots stay between E1 and B2 and its octave
        // pops reach E4 at most; the chords stay between E2 and E5.
        const bass = r.events.filter((e) => e.track === "bass").map((e) => e.midi as number);
        const chords = r.events.filter((e) => e.track === "chords").map((e) => e.midi as number);
        expect([key, Math.min(...bass) >= 28, Math.min(...bass) <= 47, Math.max(...bass) <= 64]).toEqual([
          key,
          true,
          true,
          true,
        ]);
        expect([key, Math.min(...chords) >= 40, Math.max(...chords) <= 76]).toEqual([key, true, true]);
        // Wave 4: in every bar the chords stay above the bass (a crossing muddies the root on headphones).
        // Funk's octave pops are the one exception, by design: a short popped note above a bright clav stab is
        // the style; even there the chords never dip under the root.
        for (let bar = 0; bar < (b?.bars ?? 2); bar++) {
          const inBar = (t: string) =>
            r.events
              .filter((e) => e.track === t && Math.floor(rat(e.begin) + 1e-9) === bar && e.midi !== null)
              .map((e) => e.midi as number);
          const bassNotes = inBar("bass");
          const top = c.flavour === "flavour.funk" ? Math.min(...bassNotes) : Math.max(...bassNotes);
          const [lo, hi] = [Math.min(...inBar("chords")), top];
          if (Number.isFinite(lo) && Number.isFinite(hi))
            expect([key, bar, lo >= hi]).toEqual([key, bar, true]);
        }
      }
      const res = lint(fill(c.code, "C4:major", beatsOf(c.band)), {
        session: "U01.L01",
        meter: bandMeter(c.band),
        allowPreview: true,
        profile: "band",
      });
      expect(
        res.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.id} ${d.message}`),
      ).toEqual([]);
    });
});

describe("production defaults (contracts §5.10, content/flavours.ts)", () => {
  test("room, bass low-pass and chord pan are the kit's; velocities within ±0.08 of 0.92", () => {
    const bad: string[] = [];
    for (const c of allCodes) {
      const p = flavourById.get(c.flavour)?.production;
      if (!p) {
        bad.push(`${c.band} ${c.flavour}: no kit`);
        continue;
      }
      const chords = lineOf(c.code, "chords");
      const bass = lineOf(c.code, "bass");
      const n = (re: RegExp, s: string) => Number(re.exec(s)?.[1]);
      if (n(/\.room\(([\d.]+)\)/, chords) !== p.room) bad.push(`${c.band} ${c.flavour} ${c.stage}: room`);
      if (n(/\.lpf\(([\d.]+)\)/, bass) !== p.bassLpf) bad.push(`${c.band} ${c.flavour} ${c.stage}: lpf`);
      if (n(/\.pan\(([\d.]+)\)/, chords) !== p.pan.chords) bad.push(`${c.band} ${c.flavour} ${c.stage}: pan`);
      if (/\.pan\(/.test(bass)) bad.push(`${c.band} ${c.flavour} ${c.stage}: the bass stays centred`);
      for (const label of ["drums", "chords"]) {
        const v = /\.velocity\("([^"]*)"\)/.exec(lineOf(c.code, label))?.[1];
        if (!v) bad.push(`${c.band} ${c.flavour} ${c.stage}: ${label} not humanized`);
        for (const x of (v ?? "").match(/[\d.]+/g)?.filter((t) => t.includes(".") || t === "1") ?? [])
          if (Math.abs(Number(x) - 0.92) > 0.08 + 1e-9)
            bad.push(`${c.band} ${c.flavour} ${c.stage}: ${label} velocity ${x}`);
      }
    }
    expect(bad).toEqual([]);
  });
  test("every kit is covered", () => {
    for (const b of bands) expect(Object.keys(b.code).sort()).toEqual(flavours.map((f) => f.id).sort());
  });
});

describe("the harmony the stages play (checked against Strudel)", () => {
  const chordsByBar = async (code: string, key: string, bars: number) => {
    const line = lineOf(code, "chords")
      .replace(/\.struct\("[^"]*"\)/, "")
      .replace(/\.swingBy\([^)]*\)/, "");
    const r = await evalHeadless(fill(line, key), bars);
    return [...Array(bars).keys()].map((i) =>
      [
        ...new Set(
          r.events.filter((e) => Math.floor(rat(e.begin) + 1e-9) === i).map((e) => e.midi as number),
        ),
      ].sort((a, b) => a - b),
    );
  };
  test("jazz-soul from U03: C6 (C E G A) and F6 (D F A C over the F bass), in G: G6 and C6", async () => {
    const code = bandCodeAt("band.two-chord-vamp", "flavour.jazz-soul", at("U03.L02"));
    expect(await chordsByBar(code, "C4:major", 2)).toEqual([
      [48, 52, 55, 57],
      [50, 53, 57, 60],
    ]);
    expect(await chordsByBar(code, "G4:major", 2)).toEqual([
      [55, 59, 62, 64],
      [57, 60, 64, 67],
    ]);
  });
  test("the eight-bar phrase in jazz-soul: C6 F6 C6 G7 | C6 F6 G7 C6", async () => {
    const code = bandCodeAt("band.phrase-8bar", "flavour.jazz-soul", at("U03.L11"));
    const C6 = [48, 52, 55, 57];
    const F6 = [50, 53, 57, 60];
    const G7 = [47, 50, 53, 55];
    expect(await chordsByBar(code, "C4:major", 8)).toEqual([C6, F6, C6, G7, C6, F6, G7, C6]);
  });
  test("the eight-bar phrase in funk plays triads until U06", async () => {
    const code = bandCodeAt("band.phrase-8bar", "flavour.funk", at("U03.CP"));
    const bars = await chordsByBar(code, "C4:major", 8);
    expect(bars.every((b) => b.length === 3)).toBe(true);
  });
  // Wave 4: the four-chord loop with four notes, doo-wop and three-chord rock (U06.L07, C2).
  const [C, Am, F, G] = [
    [48, 52, 55],
    [48, 52, 57],
    [48, 53, 57],
    [47, 50, 55],
  ];
  /** F6 as the loops voice it, low and close: C D F A. */
  const [C6, G7, Am7, F6low] = [
    [48, 52, 55, 57],
    [47, 50, 53, 55],
    [45, 48, 52, 55],
    [48, 50, 53, 57],
  ];
  test("the four-chord loop: from U03 (jazz-soul) and U06 (funk) C6 G7 Am7 F6 (as C D F A); funk in triads before", async () => {
    const axisTriads = [
      [48, 52, 55],
      [55, 59, 62],
      [57, 60, 64],
      [53, 57, 60],
    ];
    expect(
      await chordsByBar(bandCodeAt("band.axis-4bar", "flavour.funk", at("U05.L08")), "C4:major", 4),
    ).toEqual(axisTriads);
    const fours = [C6, G7, Am7, [48, 50, 53, 57]];
    expect(
      await chordsByBar(bandCodeAt("band.axis-4bar", "flavour.jazz-soul", at("U03.L02")), "C4:major", 4),
    ).toEqual(fours);
    expect(
      await chordsByBar(bandCodeAt("band.axis-4bar", "flavour.funk", at("U06.L02")), "C4:major", 4),
    ).toEqual(fours);
    expect(bandCodeAt("band.axis-4bar", "flavour.jazz-soul", at("U06.L06"))).toContain("swingBy(1/3, 4)");
  });
  test("no major 7th under a tune: the four-note loops play no B over C and no E over F", async () => {
    for (const band of ["band.axis-4bar", "band.doo-wop", "band.three-chord", "band.two-chord-vamp"])
      for (const f of ["flavour.jazz-soul", "flavour.funk"]) {
        const bars = await chordsByBar(bandCodeAt(band, f, at("U07.L02")), "C4:major", 4);
        const pcs = (b: number[]) => b.map((m) => m % 12);
        for (const [i, b] of bars.entries()) {
          // C6 (C E G A) and F6 (C D F A or D F A C) are the only chords with C and F where a major 7th would go.
          if (pcs(b).includes(0) && pcs(b).includes(4) && pcs(b).includes(7))
            expect([band, f, i, pcs(b).includes(11)]).toEqual([band, f, i, false]);
          if (pcs(b).includes(5) && pcs(b).includes(9))
            expect([band, f, i, pcs(b).includes(4)]).toEqual([band, f, i, false]);
        }
      }
  });
  test("doo-wop: C Am F G (C E A, C F A, B D G close to C); from U03 in jazz-soul C6 Am7 F6 G7", async () => {
    expect(
      await chordsByBar(bandCodeAt("band.doo-wop", "flavour.pop", at("U06.L07")), "C4:major", 4),
    ).toEqual([C, Am, F, G]);
    expect(
      await chordsByBar(bandCodeAt("band.doo-wop", "flavour.jazz-soul", at("U06.L07")), "C4:major", 4),
    ).toEqual([C6, Am7, F6low, G7]);
    expect(
      await chordsByBar(bandCodeAt("band.doo-wop", "flavour.funk", at("U05.L08")), "C4:major", 4),
    ).toEqual([C, Am, F, G]);
  });
  test("doo-wop's piano strikes every triplet: twelve chords a bar", async () => {
    const code = bandCodeAt("band.doo-wop", "flavour.pop", at("U06.L07"));
    const r = await evalHeadless(fill(lineOf(code, "chords")), 1);
    expect(new Set(r.events.map((e) => Math.round(rat(e.begin) * 12))).size).toBe(12);
  });
  test("three-chord rock: C F G F; from U06 in funk C6 F6 G7 F6", async () => {
    expect(
      await chordsByBar(bandCodeAt("band.three-chord", "flavour.indie", at("U06.L07")), "C4:major", 4),
    ).toEqual([C, F, G, F]);
    expect(
      await chordsByBar(bandCodeAt("band.three-chord", "flavour.funk", at("U06.L07")), "C4:major", 4),
    ).toEqual([C6, F6low, G7, F6low]);
  });
  test("the four-bar loops are voice-led: at each change, the turn back to bar 1 included, no voice moves more than a major 3rd", async () => {
    const bad: string[] = [];
    const loops = ["band.axis-4bar", "band.doo-wop", "band.three-chord"];
    // The four-chord loop's first stage is Wave 2's (root-position triads; pinned by content/validate/bands.test.ts).
    const mine = (x: (typeof allCodes)[number]) =>
      loops.includes(x.band) && !(x.band === "band.axis-4bar" && x.stage === "first");
    for (const c of allCodes.filter(mine)) {
      const bars = await chordsByBar(c.code, "C4:major", bandById.get(c.band)?.bars ?? 2);
      for (const [i, a] of bars.entries()) {
        const b = bars[(i + 1) % bars.length] as number[];
        if (a.length !== b.length) continue;
        const move = Math.max(...a.map((x, k) => Math.abs((b[k] as number) - x)));
        if (move > 4)
          bad.push(
            `${c.band} ${c.flavour} ${c.stage}: bar ${i + 1} to ${((i + 1) % bars.length) + 1} moves ${move}`,
          );
      }
    }
    expect(bad).toEqual([]);
  });
  test("swing: the jazz-soul ride's second eighth lands on the last triplet of the beat", async () => {
    const code = bandCodeAt("band.two-chord-vamp", "flavour.jazz-soul", at("U03.L02"));
    const r = await evalHeadless(fill(lineOf(code, "drums")), 1);
    // Every drum onset of the bar, in 48ths: the ride's offbeats are the only ones between the beats.
    const onsets = r.events.map((e) => Math.round(rat(e.begin) * 48));
    expect(onsets).toContain(8); // 2/3 of the first beat: 1/6 of the bar
    expect(onsets).not.toContain(6); // never the straight eighth (1/8 of the bar)
  });
});

// What plays over each flavour. A tune note a half step above a Band note sounding with it, held a beat
// or more, is the harshest clash there is. course.test.ts already scans the pop Band; here a clash counts
// only if the same note does not clash with pop, so what is found is the flavour's own doing.
interface Shown {
  owner: string;
  id: string;
  code: string;
  band: BandRef;
  key: string;
  session: string;
  beats: number;
}
const shownOf = (owner: string, session: string, key: string, beats: number, band: BandRef, e: Exercise) => {
  const out: Shown[] = [];
  for (const x of flattenExercise(e)) {
    if ("reference" in x && x.reference?.solutions?.[0])
      out.push({ owner, id: x.id, code: x.reference.solutions[0], band, key, session, beats });
    if (x.kind === "code-make") {
      out.push({
        owner,
        id: `${x.id}:starter`,
        code: stripMarkers(x.code.starter).code,
        band,
        key,
        session,
        beats,
      });
      for (const t of x.tests)
        if (t.expect === "pass" && "code" in t.response && t.response.code)
          out.push({ owner, id: `${x.id}:${t.name}`, code: t.response.code, band, key, session, beats });
    }
  }
  return out;
};
const { lessons } = await loadLessons();
const { defs: checkpoints } = await loadCheckpointFiles();
const shown: Shown[] = [];
for (const l of lessons.map((x) => x.def as LessonDef).filter((d) => /^U0[3-7]\.L/.test(d.id))) {
  const beats = Number(l.meter.split("/")[0]);
  const key = `${l.key.tonic}4:${l.key.mode}`;
  for (const s of l.steps) {
    const band = s.ui.band;
    if (!band) continue;
    if (s.example)
      shown.push({ owner: l.id, id: s.example.id, code: s.example.code, band, key, session: l.id, beats });
    if (s.exercise) shown.push(...shownOf(l.id, l.id, key, beats, band, s.exercise));
  }
}
for (const cp of checkpoints as CheckpointDef[]) {
  const band = CHECKPOINT_MAKE_BANDS[cp.id];
  if (!band) continue;
  const k = cp.make.key ?? { tonic: "C", mode: "major" };
  shown.push(...shownOf(cp.id, cp.id, `${k.tonic}4:${k.mode}`, 4, band, cp.make));
}
/** The Band's key: the learner's first `.scale()` when the Band follows it, else the step's key. */
const keyFor = (s: Shown): string => {
  if (!s.band.followsLearnerKey) return s.key;
  const m = /\.scale\("<?\s*([A-G][#b]?)-?\d*:([a-z]+)/.exec(s.code);
  return m ? `${m[1]}4:${m[2]}` : s.key;
};
async function clashes(s: Shown, flavour: string): Promise<Set<string>> {
  const def = bandById.get(s.band.band);
  if (!def || beatsOf(def.id) !== s.beats) return new Set();
  const tracks = s.band.tracks ?? def.roles;
  const harmony = bandCodeAt(def, flavour, at(s.session))
    .replaceAll("{{key}}", keyFor(s))
    .split("\n")
    .filter((ln) => /^(bass|chords):/.test(ln) && tracks.includes(ln.split(":")[0] as never))
    .map((ln) => `band_${ln}`)
    .join("\n");
  const r = await evalHeadless(`${s.code}\n${harmony}`, def.bars * 2);
  const backing = r.events.filter((e) => e.track.startsWith("band_") && e.midi !== null);
  const found = new Set<string>();
  for (const n of r.events.filter((e) => !e.track.startsWith("band_") && e.midi !== null)) {
    const [b0, b1] = [rat(n.begin), rat(n.end)];
    if ((b1 - b0) * s.beats < 1) continue;
    const hit = backing.some(
      (x) =>
        rat(x.begin) < b1 &&
        rat(x.end) > b0 &&
        ((((n.midi as number) - (x.midi as number)) % 12) + 12) % 12 === 1,
    );
    if (hit) found.add(`${n.note}@${round(b0 * s.beats)}`);
  }
  return found;
}
const round = (x: number) => Math.round(x * 1000) / 1000;
/** Clashes a flavour may add, each with its reason. */
const ALLOWED: Record<string, string> = {
  "U03.L06 every-f-sharp:starter f4@3":
    "the starter's deliberately wrong F natural (the learner makes it F#): over the jazz-soul G6 it rubs against E",
  "U03.L06 every-f-sharp:starter f4@11": "the same wrong note, second time round",
};

describe("music over every flavour (U03–U07 lessons and the checkpoint Makes)", () => {
  test("there is something to scan: U03–U07 lessons and the checkpoints with a Band", () => {
    for (const u of ["U03", "U05", "U06", "U07"])
      expect(shown.some((s) => s.owner.startsWith(`${u}.L`))).toBe(true);
    for (const cp of ["U03.CP", "U04.CP", "U05.CP", "U06.CP", "U07.CP"])
      expect(shown.some((s) => s.owner === cp)).toBe(true);
  });
  for (const flavour of ["flavour.jazz-soul", "flavour.indie", "flavour.funk"])
    test(`no ${flavour} Band adds a half-step clash the pop Band does not have`, async () => {
      const found: string[] = [];
      for (const s of shown) {
        const pop = await clashes(s, "flavour.pop");
        for (const c of await clashes(s, flavour)) {
          const id = `${s.owner} ${s.id} ${c}`;
          if (!pop.has(c) && !(id in ALLOWED)) found.push(id);
        }
      }
      expect(found).toEqual([]);
    });
  // From U03 on (U02.CP's sketch leans on chromatic neighbours on purpose).
  test("the U03–U07 checkpoint Makes' starters and passing sketches clash with no flavour", async () => {
    const found: string[] = [];
    for (const s of shown.filter((x) => /^U0[3-7]\.CP$/.test(x.owner)))
      for (const f of flavours)
        for (const c of await clashes(s, f.id)) found.push(`${s.owner} ${s.id} ${f.id} ${c}`);
    expect(found).toEqual([]);
  });
  test("the chords sit under the tune: their middle note below the tune's, in every flavour", async () => {
    const found: string[] = [];
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    for (const s of shown) {
      const def = bandById.get(s.band.band);
      if (!def || beatsOf(def.id) !== s.beats) continue;
      // Only where the Band plays its chords: under a chord lesson it plays drums (and bass) alone.
      if (!(s.band.tracks ?? def.roles).includes("chords")) continue;
      for (const f of flavours) {
        const chords = lineOf(bandCodeAt(def, f.id, at(s.session)), "chords").replaceAll(
          "{{key}}",
          keyFor(s),
        );
        const r = await evalHeadless(`${s.code}\nband_${chords}`, def.bars);
        const band = r.events.filter((e) => e.track.startsWith("band_")).map((e) => e.midi as number);
        const tune = r.events
          .filter(
            (e) => !e.track.startsWith("band_") && e.midi !== null && !/^(bass|drums|chords)/.test(e.track),
          )
          .map((e) => e.midi as number);
        if (tune.length && median(band) >= median(tune)) found.push(`${s.owner} ${s.id} ${f.id}`);
      }
    }
    expect(found).toEqual([]);
  });
});

describe("room for the learner's chords (U05–U07)", () => {
  test("no step plays the Band's chords under a chord line the learner writes", () => {
    const found: string[] = [];
    for (const l of lessons.map((x) => x.def as LessonDef).filter((d) => /^U0[5-7]\.L/.test(d.id)))
      for (const st of l.steps) {
        const band = st.ui.band;
        if (!band) continue;
        const tracks = band.tracks ?? bandById.get(band.band)?.roles ?? [];
        const learner = JSON.stringify([st.exercise ?? null, st.example ?? null]);
        if (tracks.includes("chords") && /chords: (n|note|chord)\(/.test(learner))
          found.push(`${l.id} ${st.id}`);
      }
    for (const [id, band] of Object.entries(CHECKPOINT_MAKE_BANDS)) {
      const cp = (checkpoints as CheckpointDef[]).find((c) => c.id === id);
      if (!cp || !band) continue;
      const tracks = band.tracks ?? bandById.get(band.band)?.roles ?? [];
      if (tracks.includes("chords") && /chords: (n|note|chord)\(/.test(JSON.stringify(cp.make)))
        found.push(id);
    }
    expect(found).toEqual([]);
  });
});
