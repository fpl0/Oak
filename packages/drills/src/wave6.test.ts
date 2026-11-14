// Wave 6: the families of ear stages E and F and the rhythm part of H, tuned to content/specs/U12.md–U17.md:
// seventh-chord qualities, chromatic degrees, the colours of U14, secondary and borrowed chords, key changes,
// and Rhythm II (pushes, dotted values, ties, triplets, compound meter). Golden tests state the expected notes
// (and check them in headless Strudel); the ladder tests pin what opens at which lesson; the course walk goes
// through the default order lesson by lesson from U12.L01 to U17.L04 and checks that every trial stays inside
// what the learner has met there, that its answer is one of the options it shows, that no option repeats or
// names something still closed, that the right answer earns full credit, and that it sounds in a comfortable
// register.
import { describe, expect, test } from "bun:test";
import type { Answer, FamilyDef, KeySpec, Trial } from "@oak/content-kit";
import { MODE_OPTIONS, OUTSIDE_CHORD_OPTIONS, R } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { defaultOrder } from "../../../content/syllabus.ts";
import { FAMILIES } from "./catalog/families.ts";
import {
  bindFamily,
  DEFAULT_PROFILE,
  generateTrial,
  gradeTrial,
  maxOpenLevel,
  padMode,
  stepTrialSpec,
} from "./engine.ts";
import { MODE_VAMPS } from "./gen/key.ts";
import { CHROMATIC_KIND, modulationPlan } from "./gen/progression.ts";
import { type Span, writtenNeeds, writtenNode, writtenOnsets, writtenPhrase } from "./gen/written.ts";
import { MODE_STEPS, mod, parsePc } from "./kernel.ts";
import { parseMiniCode } from "./mini.ts";
import { resolutionSteps } from "./music.ts";
import { print, query } from "./pat.ts";
import { createRng, trialSeed } from "./rng.ts";
import { flattenEvents, strudelEvents } from "./testing.test-util.ts";

const fam = (id: string): FamilyDef => FAMILIES.find((f) => f.id === id) as FamilyDef;
const rank = (id: string): number => {
  const i = defaultOrder.indexOf(id as never);
  return i < 0 ? Number.POSITIVE_INFINITY : i;
};
function stateAt(def: FamilyDef, lesson: string) {
  const open = def.categories.filter((c) => rank(c.unlockAt) <= rank(lesson)).map((c) => c.id);
  const completed = defaultOrder.slice(0, rank(lesson) + 1) as string[];
  return { open, completed, maxLevel: maxOpenLevel(def, open, completed) };
}
const trial = (def: FamilyDef, level: number, category: string, open: readonly string[], i: number) =>
  generateTrial(
    bindFamily(def),
    { index: i, family: def.id, level, category, seed: trialSeed(def.id, `w6-${level}`, i) },
    DEFAULT_PROFILE,
    open,
  ) as Trial<Answer>;
const at = (id: string, lesson: string, level: number, category: string, i = 0) => {
  const def = fam(id);
  return trial(def, level, category, stateAt(def, lesson).open, i);
};
const num = (x: readonly [number, number]) => x[0] / x[1];
const midisOf = (t: Trial<Answer>, track: string, bar?: number) =>
  t.events
    .filter(
      (e) => e.track === track && e.midi !== null && (bar === undefined || Math.floor(num(e.onset)) === bar),
    )
    .sort((a, b) => num(a.onset) - num(b.onset) || (a.midi as number) - (b.midi as number))
    .map((e) => e.midi as number);
const pcsOf = (t: Trial<Answer>, key: KeySpec, bar?: number) =>
  [
    ...new Set(
      t.events
        .filter((e) => e.midi !== null && (bar === undefined || Math.floor(num(e.onset)) === bar))
        .map((e) => mod((e.midi as number) - parsePc(key.tonic).pc, 12)),
    ),
  ].sort((a, b) => a - b);
/** Headless Strudel plays exactly the trial's events. */
async function sameAsStrudel(t: Trial<Answer>) {
  const got = await strudelEvents(t.code, Number(t.params.bars ?? 1));
  expect(got.flat).toEqual(flattenEvents(t.events));
}
const C: KeySpec = { tonic: "C", mode: "major" };

// --- golden: U12 --------------------------------------------------------------------------------------------

describe("golden: seventh chords (U12)", () => {
  test("U12.L02: the major seventh and the dominant seventh on one root differ by the 7th alone (A♭ C E♭ G / G♭)", async () => {
    const maj7 = at("fam.chd.quality-7th", "U12.L02", 1, "maj7");
    const dom = at("fam.chd.quality-7th", "U12.L02", 1, "7");
    expect(maj7.code).toContain('chords: note("[ab3,c4,eb4,g4]")');
    expect(midisOf(maj7, "chords")).toEqual([56, 60, 63, 67]);
    expect(dom.code).toContain('chords: note("[ab3,c4,eb4,gb4]")');
    expect(midisOf(dom, "chords")).toEqual([56, 60, 63, 66]);
    expect(maj7.expected).toEqual({ qualities: ["maj7"] });
    expect(dom.expected).toEqual({ qualities: ["7"] });
    await sameAsStrudel(maj7);
    await sameAsStrudel(dom);
  });
  test("the ladder: maj7 against 7 (level 1), + m7 (level 2), + ø7 and °7 with U12.L03; the jazz sixths wait for J1.L02", () => {
    const def = fam("fam.chd.quality-7th");
    expect(def.levels.slice(0, 4).map((l) => l.categories)).toEqual([
      ["maj7", "7"],
      ["maj7", "7", "m7"],
      ["maj7", "7", "m7", "m7b5"],
      ["maj7", "7", "m7", "m7b5", "dim7"],
    ]);
    expect(stateAt(def, "U12.L02").maxLevel).toBe(2);
    expect(stateAt(def, "U12.L03").maxLevel).toBe(4);
    expect(stateAt(def, "U17.L04").maxLevel).toBe(4);
    // Each quality's near miss is the chord one note away.
    const contrast = Object.fromEntries(def.categories.map((c) => [c.id, c.contrastOf]));
    expect(contrast.maj7).toEqual(["7"]);
    expect(contrast["7"]).toEqual(["maj7"]);
    expect(contrast.m7b5).toEqual(["m7"]);
  });
  test("spelling sevenths: major, minor and dominant sevenths from U12.L01; ø7 and °7 only from U12.L03", () => {
    const def = fam("fam.chd.spell");
    expect(stateAt(def, "U12.L01").maxLevel).toBe(3);
    const early = stateAt(def, "U12.L01").open;
    expect(early).toContain("sevenths");
    expect(early).not.toContain("sevenths-dim");
    for (let i = 0; i < 40; i++) {
      const t = trial(def, 3, "sevenths", early, i);
      expect(["maj7", "m7", "7"]).toContain(t.params.quality as string);
      expect((t.expected.text as string[]).length).toBe(4);
    }
    const later = stateAt(def, "U12.L03").open;
    const dim = trial(def, 3, "sevenths-dim", later, 0);
    expect(["m7b5", "dim7"]).toContain(dim.params.quality as string);
  });
  test("numerals: the diatonic sevenths of a major key at U12.L04, of a minor key (with V7 and vii°7) at U12.L05", () => {
    const def = fam("fam.har.rn");
    expect(stateAt(def, "U12.L03").maxLevel).toBe(3);
    expect(stateAt(def, "U12.L04").maxLevel).toBe(4);
    const major = new Set<string>();
    const minor = new Set<string>();
    const { open } = stateAt(def, "U12.L05");
    for (let i = 0; i < 120; i++) {
      major.add(
        String(
          (trial(def, 4, "sevenths", open, i).expected.rn ?? [
            trial(def, 4, "sevenths", open, i).params.rn,
          ])[0],
        ),
      );
      minor.add(
        String(
          (trial(def, 4, "minor-sevenths", open, i).expected.rn ?? [
            trial(def, 4, "minor-sevenths", open, i).params.rn,
          ])[0],
        ),
      );
    }
    expect([...major].sort()).toEqual(["IVmaj7", "Imaj7", "V7", "ii7", "iii7", "vi7", "viiø7"].sort());
    for (const rn of ["i7", "iiø7", "IIImaj7", "iv7", "V7", "VImaj7", "viio7"])
      expect([rn, minor.has(rn)]).toEqual([rn, true]);
    expect(stateAt(def, "U12.L04").open).not.toContain("minor-sevenths");
  });
});

// --- golden: U13 --------------------------------------------------------------------------------------------

describe("golden: Rhythm II in code (U13): lengths with @, a triplet as a bracket of three, a tie as a two-bar bracket", () => {
  const span = (bars: 1 | 2, ...v: [number, boolean, number?][]): Span => ({
    bars,
    values: v.map(([len, hit, split]) => ({ len, hit, ...(split ? { split } : {}) })),
  });
  test("a dotted quarter, an eighth and two quarters print as `cp@3 cp cp@2 cp@2`; the events carry the lengths", async () => {
    const node = writtenNode([span(1, [6, true], [2, true], [4, true], [4, true])], "cp");
    expect(print(node).text).toBe("cp@3 cp cp@2 cp@2");
    const ev = query(node, 1);
    expect(ev.map((e) => R.str(e.onset))).toEqual(["0", "3/8", "1/2", "3/4"]);
    expect(ev.map((e) => R.str(e.dur))).toEqual(["3/8", "1/8", "1/4", "1/4"]);
    const got = await evalHeadless('perc: s("cp@3 cp cp@2 cp@2")', 1);
    expect(got.events.map((e) => [e.begin, e.end])).toEqual([
      ["0", "3/8"],
      ["3/8", "1/2"],
      ["1/2", "3/4"],
      ["3/4", "1"],
    ]);
  });
  test("a note held across the bar line: `<[cp@4 cp@2 cp@4 cp@2 cp@4 cp@8 cp@8]@2>` starts on the last eighth of bar 1 and is not struck again in bar 2", async () => {
    // Bar 1: quarter, eighth, quarter, eighth, then on the “and” of 4 a note of a quarter (an eighth tied to an
    // eighth); bar 2 goes on with a quarter... written in sixteenths: 4 2 4 2 | 2+2 | 8 4 → one bracket of 32.
    const s: Span = span(2, [4, true], [2, true], [4, true], [4, true], [4, true], [6, true], [8, true]);
    const node = writtenNode([s], "cp");
    expect(print(node).text).toBe("<[cp@2 cp cp@2 cp@2 cp@2 cp@3 cp@4]@2>");
    const ev = query(node, 2);
    const crossing = ev.filter((e) => num(e.onset) < 1 && num(e.onset) + num(e.dur) > 1);
    expect(crossing.map((e) => [R.str(e.onset), R.str(e.dur)])).toEqual([["7/8", "1/4"]]);
    // Bar 2 has no onset on its first beat: the tied note is still sounding.
    expect(ev.filter((e) => num(e.onset) >= 1).map((e) => R.str(e.onset))).toEqual(["9/8", "3/2"]);
    const got = await evalHeadless(`perc: s("${print(node).text}")`, 2);
    expect(got.events.map((e) => e.begin)).toEqual(ev.map((e) => R.str(e.onset)));
    // The learner's own string is read the same way (the drill grades onsets).
    const parsed = parseMiniCode(`s("${print(node).text}")`, 2);
    expect(parsed.ok && parsed.events.map((e) => e.t)).toEqual(ev.map((e) => num(e.onset)));
  });
  test("a triplet is a bracket of three in the time of a beat: `cp@2 [cp cp cp]@2 cp cp cp@2`", async () => {
    const node = writtenNode([span(1, [4, true], [4, true, 3], [2, true], [2, true], [4, true])], "cp");
    expect(print(node).text).toBe("cp@2 [cp cp cp]@2 cp cp cp@2");
    expect(query(node, 1).map((e) => R.str(e.onset))).toEqual([
      "0",
      "1/4",
      "1/3",
      "5/12",
      "1/2",
      "5/8",
      "3/4",
    ]);
    const got = await evalHeadless('perc: s("cp@2 [cp cp cp]@2 cp cp cp@2")', 1);
    expect(got.events.map((e) => e.begin)).toEqual(["0", "1/4", "1/3", "5/12", "1/2", "5/8", "3/4"]);
  });
  test("U13.L03 read and tap: dotted values and ties arrive together at level 4, written with their lengths", async () => {
    const def = fam("fam.rhy.read");
    expect(stateAt(def, "U13.L02").open).not.toContain("dotted");
    expect(stateAt(def, "U13.L03").open).toEqual(expect.arrayContaining(["dotted", "tied"]));
    const dotted = at("fam.rhy.read", "U13.L03", 4, "dotted");
    expect(dotted.code).toContain('perc: s("<[cp@4 cp@2 cp@2 cp@4 cp@3 cp] [cp@2 cp cp cp@3 cp]>")');
    expect(dotted.params.staffNeeds).toEqual({ dots: true, ties: false, triplets: false });
    expect(dotted.params.showStaff).toBe(true);
    await sameAsStrudel(dotted);
    // Every tied trial holds a note over a beat or a bar line; none is a sixteenth push.
    for (let i = 0; i < 40; i++) {
      const t = at("fam.rhy.read", "U13.L03", 4, "tied", i);
      const held = t.events.filter((e) => {
        const on = num(e.onset) * 4;
        return on % 1 !== 0 && Math.floor(on) + 1 < on + num(e.dur) * 4 - 1e-9;
      });
      expect([i, held.length > 0]).toEqual([i, true]);
      expect([i, (t.params.staffNeeds as { ties: boolean }).ties]).toEqual([i, true]);
      for (const e of t.events) expect((num(e.onset) * 8) % 1).toBe(0);
    }
  });
  test("U13.L04–L05 echo: 6/8 counts the dotted quarter (two beats of three eighths), triplets sit beside quarters and eighths", async () => {
    const six = at("fam.rhy.echo", "U13.L05", 7, "compound");
    expect(six.params.meter).toBe("6/8");
    expect(six.code).toContain("setcpm(68/2)");
    expect(six.code).toContain('perc: s("<[cp cp@2 cp cp@2] [cp cp@2 cp@3]>")');
    await sameAsStrudel(six);
    // Every onset of a compound trial is on the eighth-note grid of six.
    for (const e of six.events) expect((num(e.onset) * 6) % 1).toBeCloseTo(0, 9);
    for (let i = 0; i < 30; i++) {
      const t = at("fam.rhy.echo", "U13.L05", 6, "triplets", i);
      const thirds = t.events.filter((e) => (num(e.onset) * 12) % 3 !== 0);
      expect([i, thirds.length >= 2]).toEqual([i, true]);
      // Triplets never share a phrase with sixteenths: every onset is on the eighth-note or the triplet grid.
      for (const e of t.events) {
        const at48 = Math.round(num(e.onset) * 48);
        expect([i, at48 % 6 === 0 || at48 % 4 === 0]).toEqual([i, true]);
      }
    }
    const waltz = at("fam.rhy.echo", "U13.L05", 7, "three-four");
    expect(waltz.params.meter).toBe("3/4");
  });
  test("U13.L01 echo level 5: pushes are eighth notes held over the beat, at a tempo where an eighth is longer than the tap window twice over", () => {
    const def = fam("fam.rhy.echo");
    expect(stateAt(def, "U12.L06").maxLevel).toBe(4);
    expect(stateAt(def, "U13.L01").maxLevel).toBe(6);
    expect(stateAt(def, "U13.L01").open).not.toContain("triplets");
    expect(stateAt(def, "U13.L05").maxLevel).toBe(7);
    for (let i = 0; i < 40; i++) {
      const t = at("fam.rhy.echo", "U13.L01", 5, "syncopation", i);
      for (const e of t.events) expect([i, (num(e.onset) * 8) % 1]).toEqual([i, 0]);
      expect(Number(t.params.bpm)).toBeLessThanOrEqual(110);
      // An eighth at this tempo, in ms, against twice the widest tap window (120 ms).
      expect(30000 / Number(t.params.bpm)).toBeGreaterThan(240);
    }
  });
  test("U13.L06 dictation: dotted, tied and triplet figures on the staff (levels 5–7), then one bar of 12/8 on the twelve-step grid", async () => {
    const def = fam("fam.rhy.dictation");
    expect(stateAt(def, "U13.L05").maxLevel).toBe(4);
    expect(stateAt(def, "U13.L06").maxLevel).toBe(8);
    const trip = at("fam.rhy.dictation", "U13.L06", 7, "triplets");
    expect(trip.code).toContain(
      'perc: s("<[rim ~ [rim rim rim] rim] [rim rim rim rim [rim rim rim]@2 rim@2]>")',
    );
    expect(trip.params).toMatchObject({ ui: "staff-input", staffNeeds: { triplets: true }, answerBars: 2 });
    await sameAsStrudel(trip);
    const twelve = at("fam.rhy.dictation", "U13.L06", 8, "compound");
    expect(twelve.code).toContain("setcpm(69/4)");
    expect(twelve.code).toContain('perc: s("cp@3 cp cp@2 cp@2 cp cp@2 cp")');
    expect(twelve.expected).toEqual({ choice: ["0", "3", "4", "6", "8", "9", "11"] });
    expect(twelve.params).toMatchObject({
      meter: "12/8",
      ui: "grid",
      stepsPerBar: 12,
      gridGroups: [3, 3, 3, 3],
    });
    await sameAsStrudel(twelve);
    // The answer written back as the reference string earns full credit on every staff level.
    for (const [level, cat] of [
      [5, "dotted"],
      [6, "syncopation"],
      [7, "triplets"],
    ] as const)
      for (let i = 0; i < 25; i++) {
        const t = at("fam.rhy.dictation", "U13.L06", level, cat, i);
        const mini = /s\("([^"]+)"\)/.exec(t.code)?.[1] as string;
        const res = gradeTrial(
          bindFamily(def),
          t,
          { answer: { text: [mini] }, rtMs: 1, replays: 0 },
          DEFAULT_PROFILE,
        );
        expect([cat, i, res.credit]).toEqual([cat, i, 1]);
      }
  });
  test("written phrases: every bar is full, the phrase starts on a note, and the category's own figure is always there", () => {
    const cats = ["dotted", "tied", "syncopation", "triplets", "three-four", "compound"] as const;
    for (const cat of cats)
      for (let seed = 1; seed <= 150; seed++) {
        const rng = createRng(seed);
        const spans = writtenPhrase(rng, cat, 2, { acrossBar: seed % 3 === 0 });
        const per = cat === "compound" ? 6 : cat === "three-four" ? 12 : 16;
        for (const s of spans) {
          expect([cat, seed, s.values.reduce((a, v) => a + v.len, 0)]).toEqual([cat, seed, per * s.bars]);
          expect(s.values.filter((v) => v.hit).length).toBeGreaterThanOrEqual(2);
        }
        expect([cat, seed, spans[0]?.values[0]?.hit]).toEqual([cat, seed, true]);
        const needs = writtenNeeds(spans, cat);
        if (cat === "dotted") expect([cat, seed, needs.dots]).toEqual([cat, seed, true]);
        if (cat === "tied" || cat === "syncopation")
          expect([cat, seed, needs.ties]).toEqual([cat, seed, true]);
        if (cat === "triplets") expect([cat, seed, needs.triplets]).toEqual([cat, seed, true]);
        const onsets = writtenOnsets(spans);
        expect(new Set(onsets).size).toBe(onsets.length);
      }
  });
  test("find the push: the pushed kick sits beside kicks on the beat; a push into beat 3 takes beat 3's place", async () => {
    const t = at("fam.rhy.syncopation", "U13.L01", 1, "anticipation");
    const cell = Number(String(t.expected.choice?.[0]).slice(1));
    expect([6, 14]).toContain(cell);
    const kicks = t.events
      .filter((e) => e.track === "kick" && num(e.onset) < 1)
      .map((e) => num(e.onset) * 16);
    expect(kicks).toEqual(cell === 6 ? [0, 6] : [0, 8, 14]);
    expect(t.params).toMatchObject({ ui: "click-cell", stepsPerBar: 16 });
    await sameAsStrudel(t);
    // Exactly the asked kicks are off the beat.
    for (const cat of ["anticipation", "offbeat-8th", "offbeat-16th", "two-per-bar"])
      for (let i = 0; i < 20; i++) {
        const x = at("fam.rhy.syncopation", "U13.L02", 4, cat, i);
        const off = x.events
          .filter((e) => e.track === "kick" && num(e.onset) < 1 && (num(e.onset) * 4) % 1 !== 0)
          .map((e) => `c${num(e.onset) * 16}`);
        expect([cat, i, off.sort()]).toEqual([cat, i, [...(x.expected.choice as string[])].sort()]);
      }
  });
  test("two or three to the beat: the answers carry U13.L05's words; 6/8 against 3/4 share their eighth-note speed", () => {
    const sub = at("fam.rhy.subdivision", "U13.L05", 1, "triplets");
    expect(sub.params.options).toEqual(["eighths", "triplets"]);
    expect(sub.params.optionLabels).toEqual({
      eighths: "Two to the beat (eighths)",
      triplets: "Three to the beat (triplets)",
    });
    expect(stateAt(fam("fam.rhy.meter"), "U13.L03").maxLevel).toBe(2);
    expect(stateAt(fam("fam.rhy.meter"), "U13.L04").maxLevel).toBe(4);
    const six = at("fam.rhy.meter", "U13.L04", 3, "6/8");
    const three = at("fam.rhy.meter", "U13.L04", 3, "3/4");
    expect(six.params.options).toEqual(["3/4", "4/4", "2/4", "6/8"]);
    // Six eighths a bar in both; grouped 3 + 3 (snare on the fourth eighth) against 2 + 2 + 2.
    const snare = (t: Trial<Answer>) =>
      t.events.filter((e) => e.track === "snare" && num(e.onset) < 1).map((e) => num(e.onset) * 6);
    expect(snare(six)).toEqual([3]);
    expect(snare(three)).toEqual([2, 4]);
  });
});

// --- golden: U14 --------------------------------------------------------------------------------------------

describe("golden: the colours of U14 (fam.key.mode levels 3–5)", () => {
  test("Dorian against natural minor: the same shape of loop, one note apart (i–IV with the raised 6, i–iv with ♭6)", async () => {
    const dorian = at("fam.key.mode", "U14.L03", 3, "dorian");
    expect(dorian.params.key).toEqual({ tonic: "F#", mode: "dorian" });
    // F♯m and B major: B D♯ F♯, the D♯ is Dorian's raised 6.
    expect(dorian.code).toContain(
      'chords: note("<[f#2,a3,c#4,f#4] [b2,d#4,f#4,b4] [f#2,a3,c#4,f#4] [b2,d#4,f#4,b4]>")',
    );
    expect(dorian.code).toContain('mel: n("<[4 3 5 6] [4 6 0] 0 0>").scale("F#4:dorian")');
    expect(pcsOf(dorian, dorian.params.key as KeySpec)).toContain(9);
    expect(pcsOf(dorian, dorian.params.key as KeySpec)).not.toContain(8);
    expect(dorian.params.options).toEqual(["minor", "dorian"]);
    expect(dorian.params.optionLabels).toEqual({ minor: "Natural minor", dorian: "Dorian (minor with ♮6)" });
    await sameAsStrudel(dorian);
    const minor = at("fam.key.mode", "U14.L03", 3, "minor", 1);
    // G minor over i–iv: Gm, Cm (C E♭ G: the ♭6).
    expect(minor.code).toContain(
      'chords: note("<[g2,bb3,d4,g4] [c3,eb4,g4,c5] [g2,bb3,d4,g4] [c3,eb4,g4,c5]>")',
    );
    expect(pcsOf(minor, minor.params.key as KeySpec)).toContain(8);
    await sameAsStrudel(minor);
  });
  test("every colour is told by what sounds: exactly one of the offered scales holds all the notes, and it is the answer", () => {
    const def = fam("fam.key.mode");
    const scale = (mode: string) => new Set(MODE_STEPS[mode as keyof typeof MODE_STEPS] as readonly number[]);
    for (const [lesson, level] of [
      ["U14.L03", 3],
      ["U14.L03", 4],
      ["U14.L05", 5],
      ["U14.L06", 6],
    ] as const) {
      const { open } = stateAt(def, lesson);
      const cats = (def.levels[level - 1]?.categories ?? []).filter((c) => open.includes(c));
      for (const cat of cats)
        for (let i = 0; i < 40; i++) {
          const t = trial(def, level, cat, open, i);
          const key = t.params.key as KeySpec;
          const pcs = pcsOf(t, key);
          const fits = (t.params.options as string[]).filter((o) => pcs.every((pc) => scale(o).has(pc)));
          expect([lesson, level, cat, i, fits]).toEqual([lesson, level, cat, i, [cat]]);
        }
    }
  });
  test("the ladder: Dorian against minor and Mixolydian against major from U14.L03, all six from U14.L05; answers in MODE_OPTIONS' words", () => {
    const def = fam("fam.key.mode");
    expect(stateAt(def, "U14.L02").maxLevel).toBe(2);
    expect(stateAt(def, "U14.L03").maxLevel).toBe(4);
    expect(stateAt(def, "U14.L04").maxLevel).toBe(4);
    expect(stateAt(def, "U14.L05").maxLevel).toBe(6);
    const six = at("fam.key.mode", "U14.L05", 5, "lydian");
    expect(six.params.options).toEqual(MODE_OPTIONS.map((o) => o.id));
    expect(six.params.optionLabels).toEqual(Object.fromEntries(MODE_OPTIONS.map((o) => [o.id, o.label])));
    // Every loop of a colour is in the colour's own scale, and its near-miss pair differs by one note.
    for (const [id, m] of Object.entries(MODE_VAMPS)) expect([id, m.vamps.length >= 2]).toEqual([id, true]);
    const mixo = at("fam.key.mode", "U14.L03", 4, "mixolydian");
    expect(mixo.params.options).toEqual(["major", "mixolydian"]);
  });
  test("spelling and n in a mode: each mode from its own lesson, no Locrian in the core, the changed note asked half the time", () => {
    const spell = fam("fam.key.scale-spell");
    expect(stateAt(spell, "U14.L01").open).toContain("mixolydian");
    expect(stateAt(spell, "U14.L01").open).not.toContain("dorian");
    expect(stateAt(spell, "U17.L04").open).not.toContain("locrian");
    expect(stateAt(spell, "U14.L01").maxLevel).toBe(5);
    const index = fam("fam.deg.index");
    expect(stateAt(index, "U14.L01").maxLevel).toBe(4);
    expect(stateAt(index, "U14.L01").open.filter((c) => /mixolydian|dorian|lydian|phrygian/.test(c))).toEqual(
      ["mixolydian"],
    );
    expect(stateAt(index, "U14.L05").open).toEqual(
      expect.arrayContaining(["mixolydian", "dorian", "lydian", "phrygian"]),
    );
    const t = at("fam.deg.index", "U14.L03", 4, "dorian");
    expect(t.params.key).toEqual({ tonic: "B", mode: "dorian" });
    expect(t.params.prompt).toBe('Which note does `n("3").scale("B4:dorian")` play? (letter name)');
    expect(t.expected).toEqual({ text: ["E"] });
    let colour = 0;
    for (let i = 0; i < 60; i++) {
      const x = at("fam.deg.index", "U14.L01", 4, "mixolydian", i);
      expect((x.params.key as KeySpec).mode).toBe("mixolydian");
      if (x.params.colour) colour++;
    }
    expect(colour).toBeGreaterThan(15);
    expect(colour).toBeLessThan(45);
  });
  test("♭VII–I joins the cadences at U14.L02; the Mixolydian loop and the Dorian vamp join the loops at U14.L06", () => {
    expect(stateAt(fam("fam.har.cadence"), "U14.L01").maxLevel).toBe(3);
    expect(stateAt(fam("fam.har.cadence"), "U14.L02").maxLevel).toBe(4);
    expect(stateAt(fam("fam.har.schema"), "U14.L05").maxLevel).toBe(4);
    expect(stateAt(fam("fam.har.schema"), "U14.L06").maxLevel).toBe(5);
    // Find home in a modal loop: the Mixolydian loop from U14.L02, the Dorian one from U14.L03.
    expect(stateAt(fam("fam.deg.tonic"), "U14.L01").maxLevel).toBe(4);
    expect(stateAt(fam("fam.deg.tonic"), "U14.L02").maxLevel).toBe(5);
    expect(stateAt(fam("fam.deg.tonic"), "U14.L02").open).not.toContain("dorian-loop");
  });
});

// --- golden: U15–U17 ------------------------------------------------------------------------------------------

describe("golden: chromatic degrees (U15.L01)", () => {
  test("♯4 in E♭ after a cadence is A♮, shown on syllables, and leans up: fi sol la ti do", async () => {
    const t = at("fam.deg.fet-chromatic", "U15.L01", 1, "deg.s4");
    expect(t.params.key).toEqual({ tonic: "Eb", mode: "major" });
    expect(t.code).toContain('mel: n("<~ -4#>").scale("Eb5:major")');
    expect(midisOf(t, "mel")).toEqual([69]);
    expect(t.expected).toEqual({ degrees: ["#4"] });
    expect(t.params).toMatchObject({ syllables: true, labels: "syllables" });
    // Sung an octave lower, inside the voice: A B♭ C D E♭.
    expect((t.params.resolutionTargets as { midi: number }[]).map((x) => x.midi)).toEqual([
      57, 58, 60, 62, 63,
    ]);
    await sameAsStrudel(t);
  });
  test("♭7 leans down first (te la), then goes home as la does; ♭6 leans to sol; ♭3 to re; ♯5 to la; ♯1 to re", () => {
    const t = at("fam.deg.fet-chromatic", "U15.L01", 1, "deg.b7");
    // In E♭: D♭ C D E♭.
    expect((t.params.resolutionTargets as { midi: number }[]).map((x) => x.midi)).toEqual([61, 60, 62, 63]);
    expect(resolutionSteps("6b", C)).toEqual(["6b", 5, 6, 7]);
    expect(resolutionSteps("5b", C)).toEqual(["5b", 4, 5, 6, 7]);
    expect(resolutionSteps("2b", C)).toEqual(["2b", 1, 0]);
    expect(resolutionSteps("1b", C)).toEqual(["1b", 0]);
    expect(resolutionSteps("3#", C)).toEqual(["3#", 4, 5, 6, 7]);
    expect(resolutionSteps("4#", C)).toEqual(["4#", 5, 6, 7]);
    expect(resolutionSteps("0#", C)).toEqual(["0#", 1, 0]);
    // The diatonic paths and the minor key's own are as before.
    expect(resolutionSteps(3, C)).toEqual([3, 2, 1, 0]);
    expect(resolutionSteps(4, C)).toEqual([4, 5, 6, 7]);
    expect(resolutionSteps("6#", { tonic: "A", mode: "minor" })).toEqual(["6#", 7]);
    expect(resolutionSteps("5#", { tonic: "A", mode: "minor" })).toEqual(["5#", "6#", 7]);
    expect(resolutionSteps(6, { tonic: "A", mode: "minor" })).toEqual([6, 7]);
  });
  test("the ladder: 4 ♯4 5 6 ♭7 7 1, then ♭3 ♭6, then ♭2 ♯5 ♯1; never ♯4 and ♭5 on one pad", () => {
    const def = fam("fam.deg.fet-chromatic");
    expect(def.levels.map((l) => l.categories.length)).toEqual([7, 10, 14, 14]);
    expect(def.levels[0]?.categories.sort()).toEqual(
      ["deg.s4", "deg.b7", "deg.4", "deg.5", "deg.6", "deg.7", "deg.1"].sort(),
    );
    expect(def.categories.map((c) => c.id)).not.toContain("deg.b5");
    expect(stateAt(def, "U15.L01").maxLevel).toBe(4);
    const index = fam("fam.deg.index");
    expect(stateAt(index, "U14.L06").maxLevel).toBe(4);
    expect(stateAt(index, "U15.L01").maxLevel).toBe(5);
    const steps = new Map<string, string>();
    for (let i = 0; i < 80; i++) {
      const t = at("fam.deg.index", "U15.L01", 5, "chromatic", i);
      const m = /degree (\S+)\?|n\("([^"]+)"\)/.exec(String(t.params.prompt));
      if (t.expected.text) steps.set(String(m?.[1]), t.expected.text[0] as string);
    }
    // Contracts §7.3: ♯4 ↔ 3#, ♭7 ↔ 6b, ♭3 ↔ 2b, ♭6 ↔ 5b, ♭2 ↔ 1b; prose shows ♯ and ♭.
    expect(Object.fromEntries(steps)).toEqual({ "♯4": "3#", "♭7": "6b", "♭3": "2b", "♭6": "5b", "♭2": "1b" });
  });
});

describe("golden: secondary and borrowed chords (U15–U16)", () => {
  test("find V7/V: the key's own ii stands next to it (G minor, then G7 over the same bass, in F)", async () => {
    const t = at("fam.har.chromatic", "U15.L06", 1, "V/V", 1);
    expect(t.params.key).toEqual({ tonic: "F", mode: "major" });
    expect(t.code).toContain('chords: note("<[a3,c4,f4] [bb3,d4,g4] [b3,d4,f4] [e4,g4,c5]>")');
    expect(t.code).toContain('bass: note("<f2 g2 g2 c2>")');
    // Bar 2 is G B♭ D (ii), bar 3 G B D F (V7/V): one note moved, a 7th added.
    expect(pcsOf(t, { tonic: "G", mode: "major" }, 1)).toEqual([0, 3, 7]);
    expect(pcsOf(t, { tonic: "G", mode: "major" }, 2)).toEqual([0, 4, 7, 10]);
    expect(t.expected).toEqual({ choice: ["3"] });
    expect(t.params).toMatchObject({
      ui: "bar-buttons",
      question: "bar",
      options: ["2", "3", "4"],
      kind: "secondary-dominant",
    });
    await sameAsStrudel(t);
  });
  test("find ♭VI: vi, then ♭VI a half step lower (E minor, then E♭, in G)", async () => {
    const t = at("fam.har.chromatic", "U16.L05", 3, "bVI", 1);
    expect(t.params.key).toEqual({ tonic: "G", mode: "major" });
    expect(t.code).toContain('bass: note("<g2 eb2 d2 e2>")');
    expect(pcsOf(t, { tonic: "Eb", mode: "major" }, 1)).toEqual([0, 4, 7]);
    expect(t.expected).toEqual({ choice: ["2"] });
    await sameAsStrudel(t);
  });
  test("the ladder and the three questions: bar at level 1; which target at level 2; which borrowed chord and where from at level 3", () => {
    const def = fam("fam.har.chromatic");
    expect(stateAt(def, "U15.L06").maxLevel).toBe(2);
    expect(stateAt(def, "U16.L04").maxLevel).toBe(2);
    expect(stateAt(def, "U16.L05").maxLevel).toBe(4);
    const seen = { 1: new Set<string>(), 2: new Set<string>(), 3: new Set<string>() };
    for (const [lesson, level] of [
      ["U15.L06", 1],
      ["U15.L06", 2],
      ["U16.L05", 3],
    ] as const) {
      const { open } = stateAt(def, lesson);
      const cats = (def.levels[level - 1]?.categories ?? []).filter((c) => open.includes(c));
      for (const cat of cats)
        for (let i = 0; i < 40; i++) {
          const t = trial(def, level, cat, open, i);
          seen[level].add(String(t.params.question));
          const options = t.params.options as string[];
          expect(options).toContain(t.expected.choice?.[0] as string);
          if (t.params.question === "name") {
            // Only chords of the same kind: which target, or which borrowed chord.
            for (const o of options) expect(CHROMATIC_KIND[o]).toBe(CHROMATIC_KIND[cat] as never);
            expect(options.length).toBeGreaterThanOrEqual(2);
          }
          if (t.params.question === "kind") {
            expect(options).toEqual(["secondary-dominant", "borrowed"]);
            expect(t.params.optionLabels).toEqual(
              Object.fromEntries(
                OUTSIDE_CHORD_OPTIONS.filter((o) => options.includes(o.id)).map((o) => [o.id, o.label]),
              ),
            );
            expect(t.expected.choice).toEqual([CHROMATIC_KIND[cat] as string]);
          }
          if (t.params.question === "bar") {
            // The chord outside the key is in the answer bar and nowhere else.
            const key = t.params.key as KeySpec;
            const scale = new Set(MODE_STEPS.major);
            for (let b = 0; b < 4; b++) {
              const foreign = pcsOf(t, key, b).some((pc) => !scale.has(pc));
              expect([cat, i, b, foreign]).toEqual([cat, i, b, String(b + 1) === t.expected.choice?.[0]]);
            }
          }
        }
    }
    expect([...seen[1]]).toEqual(["bar"]);
    expect([...seen[2]].sort()).toEqual(["bar", "name"]);
    expect([...seen[3]].sort()).toEqual(["bar", "kind", "name"]);
  });
  test("numerals level 5 opens at U15.L02 with V7/V and fills lesson by lesson; the key's own chord on the same root is the near miss", () => {
    const def = fam("fam.har.rn");
    expect(stateAt(def, "U15.L01").maxLevel).toBe(4);
    expect(stateAt(def, "U15.L02").maxLevel).toBe(5);
    const openAt = (lesson: string) => stateAt(def, lesson).open.filter((c) => /applied|borrowed/.test(c));
    expect(openAt("U15.L02")).toEqual(["applied"]);
    expect(openAt("U15.L03")).toEqual(["applied", "applied-visitors"]);
    expect(openAt("U16.L01")).toEqual(["applied", "applied-visitors", "borrowed"]);
    expect(openAt("U16.L02")).toEqual(["applied", "applied-visitors", "borrowed", "borrowed-flats"]);
    expect(openAt("U16.L03")).toHaveLength(5);
    const answers = (lesson: string, cat: string) => {
      const out = new Set<string>();
      for (let i = 0; i < 160; i++) {
        const t = at("fam.har.rn", lesson, 5, cat, i);
        out.add(String(t.expected.rn?.[0] ?? t.params.rn));
      }
      return [...out].sort();
    };
    expect(answers("U15.L02", "applied")).toEqual(["V7/V", "ii"]);
    expect(answers("U15.L03", "applied-visitors")).toEqual(["I", "V7/IV", "V7/ii", "V7/vi", "iii", "vi"]);
    expect(answers("U16.L01", "borrowed")).toEqual(["IV", "iv"]);
    expect(answers("U16.L02", "borrowed-flats")).toEqual(["bVI", "bVII", "vi", "viio"]);
    expect(answers("U16.L03", "borrowed-bIII")).toEqual(["bIII", "iii"]);
    // In C: V7/V is D7, ♭VI is A♭, and the palette is told what it must offer.
    let d7 = false;
    for (let i = 0; i < 200 && !d7; i++) {
      const t = at("fam.har.rn", "U15.L02", 5, "applied", i);
      if ((t.params.key as KeySpec).tonic === "C" && t.params.rn === "V7/V") {
        expect(t.expected).toEqual({ text: ["D7"] });
        expect(t.params.rnAllow).toEqual(["triads", "sevenths", "secondary"]);
        d7 = true;
      }
    }
    expect(d7).toBe(true);
  });
  test("the bass under chromatic chords: secondary dominants from U15.L06, the borrowed roots ♭6 ♭7 ♭3 from U16.L05", () => {
    const def = fam("fam.har.bass");
    expect(stateAt(def, "U15.L05").maxLevel).toBe(5);
    expect(stateAt(def, "U15.L06").maxLevel).toBe(6);
    const early = stateAt(def, "U15.L06").open;
    expect(early).toContain("chromatic");
    expect(early).not.toContain("borrowed");
    const diatonic = new Set(["1", "2", "3", "4", "5", "6", "7"]);
    for (let i = 0; i < 40; i++) {
      const t = trial(def, 6, "chromatic", early, i);
      for (const d of t.expected.degrees ?? []) expect([i, diatonic.has(d)]).toEqual([i, true]);
    }
    const late = stateAt(def, "U16.L05").open;
    const flats = new Set<string>();
    for (let i = 0; i < 60; i++)
      for (const d of trial(def, 6, "borrowed", late, i).expected.degrees ?? []) flats.add(d);
    expect([...flats].filter((d) => d.startsWith("b")).sort()).toEqual(["b3", "b6", "b7"]);
  });
  test("U16.L03: the plagal cadence with a minor IV (IV–iv–I) joins the cadences beside the plain one", async () => {
    const def = fam("fam.har.cadence");
    expect(stateAt(def, "U16.L02").open).not.toContain("minor-plagal");
    const t = at("fam.har.cadence", "U16.L03", 4, "minor-plagal");
    expect(t.params.key).toEqual({ tonic: "D", mode: "major" });
    // D | G | G minor | D, the tune leaning la–le–sol (B B♭ A).
    expect(t.code).toContain('chords: note("[d3,f#3,a3,d4] [g2,g3,b3,d4] [g2,g3,bb3,d4] [d3,f#3,a3,d4]")');
    expect(t.code).toContain('mel: n("4 5 5b 4").scale("D4:major")');
    expect(midisOf(t, "mel")).toEqual([69, 71, 70, 69]);
    expect(t.expected).toEqual({ choice: ["minor-plagal"] });
    expect((t.params.optionLabels as Record<string, string>)["minor-plagal"]).toBe(
      "Plagal with a minor IV (IV–iv–I)",
    );
    expect(def.categories.find((c) => c.id === "minor-plagal")?.contrastOf).toEqual(["PC"]);
    // The answers are each cadence once: a minor-key phrase is answered "PAC" or "HC", never a button of its own.
    expect(t.params.options).toEqual(["PAC", "IAC", "HC", "PC", "DC", "bVII-I", "minor-plagal"]);
    const minor = at("fam.har.cadence", "U14.L02", 4, "minor-PAC");
    expect(minor.expected).toEqual({ choice: ["PAC"] });
    expect(minor.params.options).toEqual(["PAC", "IAC", "HC", "PC", "DC", "bVII-I"]);
    expect(at("fam.har.cadence", "U06.L04", 1, "HC").params.options).toEqual(["PAC", "HC"]);
    await sameAsStrudel(t);
  });
});

describe("golden: key changes (U17.L03)", () => {
  test("a lift: the phrase starts again a whole step up at bar 5 (B♭ to C), every chord moved by the same step", async () => {
    const t = at("fam.har.modulation", "U17.L03", 1, "truck-driver");
    expect(t.params).toMatchObject({
      key: { tonic: "Bb", mode: "major" },
      newKey: { tonic: "C", mode: "major" },
      liftSemis: 2,
      ui: "bar-buttons",
    });
    expect(t.code).toContain('bass: note("<bb2 g2 eb2 f2 c2 a2 f2 g2>")');
    expect(t.expected).toEqual({ choice: ["5"] });
    expect((t.params.options as string[])[0]).toBe("none");
    await sameAsStrudel(t);
  });
  test("lifts are a half step as often as a whole step, after 3 to 5 bars; no key change comes in the two shapes a change is mistaken for", () => {
    const lifts = { 1: 0, 2: 0 } as Record<number, number>;
    const ats = new Set<number>();
    let restart = 0;
    let visit = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const lift = modulationPlan(createRng(seed), "truck-driver", C);
      lifts[lift.liftSemis as number] = (lifts[lift.liftSemis as number] ?? 0) + 1;
      ats.add(lift.at as number);
      const none = modulationPlan(createRng(seed), "none", C);
      expect(none.at).toBeNull();
      if (none.chords.some((c) => c.chord.of)) visit++;
      else restart++;
    }
    expect(lifts[1]).toBeGreaterThan(150);
    expect(lifts[2]).toBeGreaterThan(150);
    expect([...ats].sort()).toEqual([4, 5, 6]);
    expect(restart).toBeGreaterThan(120);
    expect(visit).toBeGreaterThan(120);
  });
  test("the ladder: lifts and no change at U17.L03, then the relative minor, then the dominant through a pivot", () => {
    const def = fam("fam.har.modulation");
    expect(stateAt(def, "U17.L02").maxLevel).toBe(1);
    expect(def.levels.map((l) => l.categories)).toEqual([
      ["truck-driver", "none"],
      ["truck-driver", "none", "relative"],
      ["truck-driver", "none", "relative", "dominant-pivot"],
    ]);
    const rel = at("fam.har.modulation", "U17.L03", 2, "relative");
    expect((rel.params.newKey as KeySpec).mode).toBe("minor");
  });
});

// --- d8 -----------------------------------------------------------------------------------------------------

describe('d8: a lesson step in a minor key draws minor-key trials only (U10.L04 S6 "Hear the minor bass")', () => {
  const def = fam("fam.har.bass");
  const runtime = bindFamily(def);
  const { open } = stateAt(def, "U10.L04");
  const PAD = new Set(["1", "2", "b3", "4", "5", "b6", "b7"]);
  test("with the step's mode, every level 5 trial is in a minor key and its bass stays on the step's pad", () => {
    const cats = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const spec = stepTrialSpec(runtime, {
        level: 5,
        seed: seed * 7919,
        openCategories: open,
        mode: "minor",
      });
      const t = generateTrial(runtime, spec, DEFAULT_PROFILE, open) as Trial<Answer>;
      cats.add(t.category);
      expect([seed, (t.params.key as KeySpec).mode]).toEqual([seed, "minor"]);
      for (const d of t.expected.degrees ?? [])
        expect([seed, t.category, d, PAD.has(d)]).toEqual([seed, t.category, d, true]);
    }
    // Both things level 5 brings are heard: the bass under a minor loop, and a bass line in a minor key.
    expect([...cats].sort()).toEqual(["lines", "minor"]);
  });
  test("without the mode a step draws any open category of its level, major keys among them (the Wave 5 behaviour that failed the pad)", () => {
    let major = 0;
    const cats = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const spec = stepTrialSpec(runtime, { level: 5, seed: seed * 7919, openCategories: open });
      cats.add(spec.category);
      const t = generateTrial(runtime, spec, DEFAULT_PROFILE, open) as Trial<Answer>;
      if ((t.params.key as KeySpec).mode === "major") major++;
    }
    expect([...cats].sort()).toEqual([
      "diatonic-roots",
      "inversions",
      "lines",
      "minor",
      "schema-roots",
      "two-per-bar",
    ]);
    expect(major).toBeGreaterThan(150);
  });
  test("an identification step keeps every answer of its level: 6/8 beside 3/4, 4/4 and 2/4 (U13.L04 S7)", () => {
    const meter = bindFamily(fam("fam.rhy.meter"));
    const openMeters = stateAt(fam("fam.rhy.meter"), "U13.L04").open;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++)
      seen.add(stepTrialSpec(meter, { level: 3, seed: seed * 31, openCategories: openMeters }).category);
    expect([...seen].sort()).toEqual(["2/4", "3/4", "4/4", "6/8"]);
  });
  test("the mode comes from the step's own degree pad: a minor pad asks for minor, a major pad for major, a chromatic pad for neither", () => {
    expect(padMode(["1", "2", "b3", "4", "5", "b6", "b7"])).toBe("minor");
    expect(padMode(["1", "2", "3", "4", "5", "6", "7"])).toBe("major");
    expect(padMode(["1", "5"])).toBeUndefined();
    expect(padMode(["1", "b3", "3", "5"])).toBeUndefined();
    // U10.L04 S6 as authored: level 5, the minor pad, every degree asked is on it.
    const authored = ["1", "2", "b3", "4", "5", "b6", "b7"];
    for (let seed = 1; seed <= 200; seed++) {
      const mode = padMode(authored);
      const spec = stepTrialSpec(runtime, {
        level: 5,
        seed: seed * 104729,
        openCategories: open,
        ...(mode ? { mode } : {}),
      });
      const t = generateTrial(runtime, spec, DEFAULT_PROFILE, open) as Trial<Answer>;
      for (const d of t.expected.degrees ?? [])
        expect([seed, d, authored.includes(d)]).toEqual([seed, d, true]);
    }
  });
  test("a family with no minor material is not emptied by the hint, and a major-key step never gets a minor trial", () => {
    const meter = bindFamily(fam("fam.rhy.meter"));
    const spec = stepTrialSpec(meter, { level: 1, seed: 5, openCategories: ["4/4", "3/4"], mode: "minor" });
    expect(["4/4", "3/4"]).toContain(spec.category);
    for (let seed = 1; seed <= 100; seed++) {
      const s = stepTrialSpec(runtime, { level: 5, seed: seed * 31, openCategories: open, mode: "major" });
      const t = generateTrial(runtime, s, DEFAULT_PROFILE, open) as Trial<Answer>;
      expect([seed, (t.params.key as KeySpec).mode]).toEqual([seed, "major"]);
    }
  });
});

// --- the course walk ----------------------------------------------------------------------------------------

/** The families the stretch U12–U17 opens or moves (wave6.md §11). */
const WAVE6 = [
  "fam.chd.quality-7th",
  "fam.chd.spell",
  "fam.chd.inversion",
  "fam.int.isolated",
  "fam.rhy.syncopation",
  "fam.rhy.subdivision",
  "fam.rhy.meter",
  "fam.rhy.count",
  "fam.rhy.echo",
  "fam.rhy.read",
  "fam.rhy.dictation",
  "fam.key.mode",
  "fam.key.scale-spell",
  "fam.deg.tonic",
  "fam.deg.index",
  "fam.deg.fet-chromatic",
  "fam.har.rn",
  "fam.har.function",
  "fam.har.cadence",
  "fam.har.schema",
  "fam.har.bass",
  "fam.har.progression",
  "fam.har.chromatic",
  "fam.har.modulation",
  // Their top levels open with the chromatic degrees of U15.L01.
  "fam.mel.dictation",
  "fam.mel.echo",
  "fam.mel.sight",
];
const WALK = defaultOrder.slice(rank("U12.L01"), rank("U17.L04") + 1).filter((s) => /\.(L\d+|CP)$/.test(s));
/** What each lesson allows from then on: [lesson, a test on a trial's text that must fail before it]. */
const NOT_BEFORE: readonly [string, string, (t: Trial<Answer>) => boolean][] = [
  [
    "U14.L01",
    "a mode",
    (t) =>
      /mixolydian|dorian|lydian|phrygian|locrian/.test((t.params.key as KeySpec | undefined)?.mode ?? ""),
  ],
  ["U14.L03", "Dorian", (t) => (t.params.key as KeySpec | undefined)?.mode === "dorian"],
  ["U14.L04", "Lydian", (t) => (t.params.key as KeySpec | undefined)?.mode === "lydian"],
  ["U14.L05", "Phrygian", (t) => (t.params.key as KeySpec | undefined)?.mode === "phrygian"],
  ["J2.L04", "Locrian", (t) => (t.params.key as KeySpec | undefined)?.mode === "locrian"],
  [
    "U15.L02",
    "a secondary dominant",
    (t) => [...(t.expected.rn ?? []), String(t.params.rn ?? "")].some((r) => r.includes("/")),
  ],
  [
    "U16.L01",
    "a borrowed chord",
    (t) =>
      [...(t.expected.rn ?? []), String(t.params.rn ?? "")].some((r) => /^(iv|bVI|bVII|bIII)$/.test(r)) &&
      (t.params.key as KeySpec | undefined)?.mode === "major",
  ],
  ["U13.L04", "a compound meter", (t) => t.params.meter === "6/8" || t.params.meter === "12/8"],
  [
    "U13.L05",
    "a triplet",
    (t) =>
      t.events.some(
        (e) =>
          e.track === "perc" &&
          (num(e.onset) * 48) % 3 !== 0 &&
          t.params.meter === "4/4" &&
          !/swingBy/.test(t.code),
      ),
  ],
];

describe("the course walk U12.L01–U17.L04: every trial stays inside what the learner has met", () => {
  for (const id of WAVE6)
    test(id, () => {
      const def = fam(id);
      const runtime = bindFamily(def);
      const catIds = new Set(def.categories.map((c) => c.id));
      let checked = 0;
      for (const lesson of WALK) {
        if (rank(def.unlock.lesson) > rank(lesson)) continue;
        const { open, maxLevel } = stateAt(def, lesson);
        for (let level = 1; level <= maxLevel; level++) {
          const lv = def.levels[level - 1] as FamilyDef["levels"][number];
          const cats = lv.categories.filter((c) => open.includes(c));
          expect([id, lesson, level, cats.length > 0]).toEqual([id, lesson, level, true]);
          for (let i = 0; i < 8; i++) {
            const t = trial(def, level, cats[i % cats.length] as string, open, i);
            checked++;
            const where = [id, lesson, level, t.category, i];
            expect([...where, open.includes(t.category)]).toEqual([...where, true]);
            // Options: unique, the answer among them, and none naming a category still closed.
            const options = t.params.options as string[] | undefined;
            if (options) {
              expect([...where, new Set(options).size]).toEqual([...where, options.length]);
              for (const c of t.expected.choice ?? [])
                expect([...where, c, options.includes(c)]).toEqual([...where, c, true]);
              for (const o of options)
                if (catIds.has(o)) expect([...where, o, open.includes(o)]).toEqual([...where, o, true]);
            } else {
              for (const c of t.expected.choice ?? [])
                if (catIds.has(c)) expect([...where, c, open.includes(c)]).toEqual([...where, c, true]);
            }
            // Nothing the course has not reached yet.
            for (const [from, what, has] of NOT_BEFORE)
              if (rank(lesson) < rank(from))
                expect([...where, what, has(t)]).toEqual([...where, what, false]);
            // Degree answers: chromatic degrees only from U15.L01, and only the family's open ones.
            const degrees = t.expected.degrees ?? [];
            const key = t.params.key as KeySpec | undefined;
            if (degrees.length > 0 && key && key.mode === "major" && rank(lesson) < rank("U15.L01"))
              for (const d of degrees) expect([...where, d, /[#b]/.test(d)]).toEqual([...where, d, false]);
            if (id === "fam.deg.fet-chromatic")
              for (const d of degrees)
                expect([...where, d, open.includes(`deg.${d.replace("#", "s")}`)]).toEqual([
                  ...where,
                  d,
                  true,
                ]);
            // A comfortable register: chords and tunes between E1 and C7, the bass at or above E1.
            for (const e of t.events)
              if (e.midi !== null) {
                expect([...where, e.midi, e.midi >= 28]).toEqual([...where, e.midi, true]);
                expect([...where, e.midi, e.midi <= 96]).toEqual([...where, e.midi, true]);
              }
            // The sound is one of the family's instruments, or a drum.
            // The right answer earns full credit (an identification; code, tap and sung trials are checked
            // by generators.test.ts against headless Strudel).
            const mode = t.params.mode;
            const answered =
              (t.expected.choice ??
                t.expected.degrees ??
                t.expected.rn ??
                t.expected.text ??
                t.expected.qualities) !== undefined || t.expected.number !== undefined;
            if (answered && mode !== "tap" && mode !== "sing" && mode !== "code") {
              const res = gradeTrial(
                runtime,
                t,
                { answer: t.expected, rtMs: 1000, replays: 0 },
                DEFAULT_PROFILE,
              );
              expect([...where, res.credit]).toEqual([...where, 1]);
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
    });

  test("no level asks for nothing: every level a lesson opens has an open category, at every lesson of the walk", () => {
    for (const def of FAMILIES) {
      for (const lesson of WALK) {
        if (rank(def.unlock.lesson) > rank(lesson)) continue;
        const { open, maxLevel } = stateAt(def, lesson);
        for (let level = 1; level <= maxLevel; level++) {
          const cats = (def.levels[level - 1]?.categories ?? []).filter((c) => open.includes(c));
          expect([def.id, lesson, level, cats.length > 0]).toEqual([def.id, lesson, level, true]);
        }
      }
    }
  });

  test("flavours and registers: chord stimuli of the new families sound on the keyboards of the course's two flavours", () => {
    const POP_SOUL = new Set(["piano", "rhodes", "organ", "cleangtr", "jazzgtr", "triangle"]);
    let checked = 0;
    for (const id of ["fam.chd.quality-7th", "fam.key.mode", "fam.har.chromatic", "fam.har.modulation"]) {
      const def = fam(id);
      const { open, maxLevel } = stateAt(def, "U17.L04");
      for (let level = 1; level <= maxLevel; level++) {
        const cats = (def.levels[level - 1]?.categories ?? []).filter((c) => open.includes(c));
        for (let i = 0; i < 24; i++) {
          const t = trial(def, level, cats[i % cats.length] as string, open, i);
          const chords = t.events.filter((e) => e.track === "chords");
          checked += chords.length;
          for (const e of chords) {
            expect([id, level, e.s, POP_SOUL.has(String(e.s))]).toEqual([id, level, e.s, true]);
            // A2 to C6 for the upper voices of a chord: the middle of the keyboard.
            expect([id, level, e.midi, (e.midi as number) >= 36 && (e.midi as number) <= 84]).toEqual([
              id,
              level,
              e.midi,
              true,
            ]);
          }
          for (const e of t.events.filter((x) => x.track === "bass"))
            expect([id, e.midi, (e.midi as number) >= 28 && (e.midi as number) <= 59]).toEqual([
              id,
              e.midi,
              true,
            ]);
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  test("a sample of every new level plays in headless Strudel exactly as written", async () => {
    const samples: [string, string, number][] = [
      ["fam.chd.quality-7th", "U12.L03", 4],
      ["fam.int.isolated", "U12.L06", 4],
      ["fam.rhy.echo", "U13.L05", 5],
      ["fam.rhy.echo", "U13.L05", 6],
      ["fam.rhy.echo", "U13.L05", 7],
      ["fam.rhy.read", "U13.L03", 4],
      ["fam.rhy.dictation", "U13.L06", 5],
      ["fam.rhy.dictation", "U13.L06", 6],
      ["fam.rhy.dictation", "U13.L06", 7],
      ["fam.rhy.dictation", "U13.L06", 8],
      ["fam.rhy.syncopation", "U13.L01", 4],
      ["fam.rhy.subdivision", "U13.L05", 3],
      ["fam.rhy.meter", "U13.L04", 4],
      ["fam.key.mode", "U14.L05", 5],
      ["fam.deg.fet-chromatic", "U15.L01", 3],
      ["fam.har.cadence", "U16.L03", 4],
      ["fam.har.bass", "U16.L05", 6],
      ["fam.har.progression", "U16.L05", 6],
      ["fam.har.chromatic", "U16.L05", 3],
      ["fam.har.modulation", "U17.L03", 3],
    ];
    for (const [id, lesson, level] of samples) {
      const def = fam(id);
      const { open } = stateAt(def, lesson);
      const cats = (def.levels[level - 1]?.categories ?? []).filter((c) => open.includes(c));
      const fresh = cats.filter((c) => !(def.levels[level - 2]?.categories ?? []).includes(c));
      for (const cat of fresh.length > 0 ? fresh : cats.slice(0, 2))
        for (let i = 0; i < 3; i++) {
          const t = trial(def, level, cat, open, i);
          const got = await strudelEvents(t.code, Number(t.params.bars ?? 1));
          expect([id, level, cat, i, got.flat]).toEqual([id, level, cat, i, flattenEvents(t.events)]);
        }
    }
  });
});
