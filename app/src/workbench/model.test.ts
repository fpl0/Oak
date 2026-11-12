// The analysis path against real Strudel 1.2.6 (the grader realm in-process, no lockdown): music facts
// first (which notes, which degrees, which bars), then the links the views rely on.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { compareCode, evaluateForGrading, initRealm } from "@oak/grader";
import { FULL_LOOP, PLAYGROUND_EXAMPLES } from "./examples.ts";
import { activeAt, buildModel, staffPage, staffPageCount, type WorkbenchModel } from "./model.ts";

setDefaultTimeout(30_000);

beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

async function model(
  code: string,
  bars: number,
  opts: Partial<Parameters<typeof buildModel>[2]> = {},
): Promise<WorkbenchModel> {
  const result = await evaluateForGrading(code, { mode: "lesson", bars, lint: null });
  const out = buildModel(code, result, { meter: "4/4", key: null, staff: "auto", ...opts });
  if (!out.ok) throw new Error(`${out.error.kind}: ${out.error.message}`);
  return out.model;
}

describe("degrees and spelling", () => {
  test("n('0 2 4 2 0 4 7 ~') in D4 major is D4 F#4 A4 F#4 D4 A4 D5: degrees 1 3 5 3 1 5 1", async () => {
    const ex = PLAYGROUND_EXAMPLES.find((e) => e.id === "degrees-d");
    if (!ex) throw new Error("example missing");
    const m = await model(ex.code, 1, { key: ex.key });
    const pitched = m.events.filter((e) => e.midi !== null);
    expect(pitched.map((e) => e.midi)).toEqual([62, 66, 69, 66, 62, 69, 74]);
    expect(pitched.map((e) => e.label?.name)).toEqual(["D4", "F#4", "A4", "F#4", "D4", "A4", "D5"]);
    expect(pitched.map((e) => e.label?.degree?.label)).toEqual(["1", "3", "5", "3", "1", "5", "1"]);
    expect(pitched.map((e) => e.label?.degree?.syllable)).toEqual([
      "do",
      "mi",
      "sol",
      "mi",
      "do",
      "sol",
      "do",
    ]);
    expect(pitched.map((e) => e.beatLabel)).toEqual(["1", "1&", "2", "2&", "3", "3&", "4"]);
    expect(pitched.every((e) => e.label?.degree?.inKey)).toBe(true);
    expect(m.cps).toBeCloseTo(80 / 4 / 60, 10);
    expect(m.bpm).toBeCloseTo(80, 6);
  });

  test("A minor: the scale's 3rd, 6th and 7th are labelled ♭3 ♭6 ♭7 (major-relative) and are in key", async () => {
    const ex = PLAYGROUND_EXAMPLES.find((e) => e.id === "minor-line");
    if (!ex) throw new Error("example missing");
    const m = await model(ex.code, 1, { key: ex.key });
    expect(m.events.map((e) => e.label?.name)).toEqual(["A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4"]);
    expect(m.events.map((e) => e.label?.degree?.label)).toEqual(["1", "2", "♭3", "4", "5", "♭6", "♭7", "1"]);
    expect(m.events.map((e) => e.label?.degree?.syllable)).toEqual([
      "do",
      "re",
      "me",
      "fa",
      "sol",
      "le",
      "te",
      "do",
    ]);
    expect(m.events.every((e) => e.label?.degree?.inKey)).toBe(true);
  });

  test("without a declared key, the .scale() context is the key", async () => {
    const m = await model('mel: n("0 4").scale("E4:major").s("triangle")', 1);
    expect(m.key).toEqual({ tonic: "E", mode: "major" });
    expect(m.events.map((e) => e.label?.name)).toEqual(["E4", "B4"]);
    expect(m.events.map((e) => e.label?.degree?.label)).toEqual(["1", "5"]);
  });

  test("no key context: note names only", async () => {
    const m = await model('mel: note("c4 eb4").s("triangle")', 1);
    expect(m.key).toBeNull();
    expect(m.events.map((e) => e.label?.name)).toEqual(["C4", "Eb4"]);
    expect(m.events[0]?.label?.degree).toBeUndefined();
  });
});

describe("the full 4-track loop", () => {
  let m: WorkbenchModel;
  beforeAll(async () => {
    m = await model(FULL_LOOP, 4, { key: { tonic: "C", mode: "major" } });
  });

  test("four tracks in source order, 92 BPM, four bars", () => {
    expect(m.tracks).toEqual(["drums", "chords", "bass", "mel"]);
    expect(m.bpm).toBeCloseTo(92, 6);
    expect(m.bars).toBe(4);
  });

  test("bass plays the chord roots in octave 2: D2 G2 C2 A2, one per bar", () => {
    const bass = m.events.filter((e) => e.track === "bass");
    expect(bass.map((e) => e.label?.name)).toEqual(["D2", "G2", "C2", "A2"]);
    expect(bass.map((e) => e.bar)).toEqual([1, 2, 3, 4]);
  });

  test("chord voicings carry their symbol and each note's chord-tone role", () => {
    const chords = m.events.filter((e) => e.track === "chords");
    const bars = [...new Set(chords.map((e) => e.bar))];
    expect(bars).toEqual([1, 2, 3, 4]);
    expect([...new Set(chords.map((e) => e.chordSymbol))]).toEqual(["Dm7", "G7", "C^7", "A7"]);
    // lefthand voicings are rootless: guide tones plus 9ths and 13ths, never a non-chord tone
    const role = (sym: string) =>
      chords
        .filter((e) => e.chordSymbol === sym)
        .map((e) => `${e.label?.name}=${e.chordTone?.label}/${e.chordTone?.kind}`);
    expect(role("Dm7")).toEqual(["C4=7/tone", "E4=9/tension", "F4=3/tone", "A4=5/tone"]);
    expect(role("G7")).toEqual(["B3=3/tone", "E4=13/tension", "F4=7/tone", "A4=9/tension"]);
    expect(role("C^7")).toEqual(["B3=7/tone", "D4=9/tension", "E4=3/tone", "G4=5/tone"]);
    expect(role("A7")).toEqual(["C#4=3/tone", "F#4=13/tension", "G4=7/tone", "B4=9/tension"]);
  });

  test("melody bar 1 outlines Dm7: n 1 3 5 3 = D4 F4 A4 F4, degrees 2 4 6 4 (n is 0-based)", () => {
    const mel = m.events.filter((e) => e.track === "mel" && e.bar === 1);
    expect(mel.map((e) => e.label?.name)).toEqual(["D4", "F4", "A4", "F4"]);
    expect(mel.map((e) => e.label?.degree?.label)).toEqual(["2", "4", "6", "4"]);
  });

  test("drums: bd at beat 1, sd at beat 3, hh on the off-beats; primary range is the drum atom", () => {
    const drums = m.events.filter((e) => e.track === "drums" && e.bar === 1);
    expect(drums.map((e) => [e.s, e.beatLabel])).toEqual([
      ["bd", "1"],
      ["hh", "2&"],
      ["sd", "3"],
      ["hh", "4&"],
    ]);
    for (const e of drums) {
      const p = e.primary[0];
      if (!p) throw new Error("no primary range");
      expect(FULL_LOOP.slice(p.from, p.to)).toBe(e.s as string);
    }
  });

  test('a melody note\'s primary range is its step atom, not .s("triangle") or .scale(...)', () => {
    const first = m.events.find((e) => e.track === "mel");
    if (!first) throw new Error("no melody");
    expect(first.locs.length).toBeGreaterThan(1);
    expect(first.primary.map((r) => FULL_LOOP.slice(r.from, r.to))).toEqual(["1"]);
  });

  test("the staff links every engraved melody note back to its event", () => {
    expect(m.abc).not.toBeNull();
    const mel = m.events.filter((e) => e.track === "mel");
    for (const e of mel) expect(m.abc?.byEvent.has(e.id)).toBe(true);
  });

  test("activeAt wraps the clock into the analysed bars", () => {
    const at = (c: number) =>
      activeAt(m, c)
        .map((id) => m.byId.get(id))
        .filter((e) => e?.track === "mel");
    expect(at(0).map((e) => e?.label?.name)).toEqual(["D4"]);
    expect(at(0.3).map((e) => e?.label?.name)).toEqual(["F4"]);
    expect(at(4.3).map((e) => e?.label?.name)).toEqual(["F4"]);
    expect(activeAt(m, -1)).toEqual([]);
  });
});

describe("failure is data", () => {
  test("a syntax error comes back as ok:false", async () => {
    const code = 'mel: note("c4 e4"';
    const result = await evaluateForGrading(code, { mode: "lesson", bars: 1, lint: null });
    const out = buildModel(code, result, { meter: "4/4", key: null, staff: "auto" });
    expect(out.ok).toBe(false);
  });

  test("staff: false skips notation", async () => {
    const m = await model('note("c4")', 1, { staff: false });
    expect(m.abc).toBeNull();
    expect(m.score).toBeNull();
  });
});

describe("the feedback demo's comparison (the grader's compareCode, melody mode)", () => {
  test("degrees-d against its target: one wrong degree at bar 1 beat 4, the target F#4 as a ghost", async () => {
    const ex = PLAYGROUND_EXAMPLES.find((e) => e.id === "degrees-d");
    if (!ex?.target) throw new Error("example missing");
    const lint = {
      profile: "studio" as const,
      unlocked: new Set<never>(),
      allowPreview: true,
      meter: ex.meter,
      key: ex.key,
    };
    const run = (learnerCode: string) =>
      compareCode({
        learnerCode,
        target: { kind: "code", code: ex.target as string },
        fromBar: 1,
        bars: 1,
        mode: "melody",
        key: ex.key,
        meter: ex.meter,
        lint,
      });
    const r = await run(ex.code);
    expect(r.status).toBe("fail");
    const wrong = r.diagnostics.filter((d) => d.id === "melody.wrong-degree");
    expect(wrong.map((d) => [d.where?.bar, d.where?.beat])).toEqual([[1, 4]]);
    // D5 (degree 1) was played where the target has F#4 (degree 3).
    expect(r.overlay?.missing.map((e) => e.midi) ?? []).toContain(66);
    expect((await run(ex.target)).status).toBe("pass");
  });
});

describe("long loops page the staff (runtime review: 64 bars)", () => {
  test("64 bars engrave as 8 pages of 8; page 3 is bars 17–24 with the real notes and IDs", async () => {
    const ex = PLAYGROUND_EXAMPLES.find((e) => e.id === "long-64");
    if (!ex) throw new Error("example missing");
    const m = await model(ex.code, 64, { key: ex.key });
    expect(m.bars).toBe(64);
    const src = m.staffSource;
    if (!src) throw new Error("no staff source");
    expect(staffPageCount(src)).toBe(8);
    // Page 0 is the model's own engraving.
    expect(staffPage(src, 0).abc?.abc).toBe(m.abc?.abc);
    const p = staffPage(src, 2);
    expect(p.startBar).toBe(16);
    expect(p.bars).toBe(8);
    expect(p.error).toBeNull();
    const ids = p.abc?.idMap.flatMap((e) => e.eventIds) ?? [];
    expect(ids.length).toBeGreaterThan(0);
    // Every engraved event is one of the model's events in bars 17–24.
    for (const id of ids) {
      const e = m.byId.get(id);
      expect(e).toBeDefined();
      expect(e?.bar).toBeGreaterThanOrEqual(17);
      expect(e?.bar).toBeLessThanOrEqual(24);
    }
    // Bar 17's melody is degrees (16 + 2j) mod 8 = 0 2 4 6 0 2 4 6 in C4 major: C4 E4 G4 B4 C4 E4 G4 B4.
    const bar17 = m.events.filter((e) => e.track === "mel" && e.bar === 17).map((e) => e.midi);
    expect(bar17).toEqual([60, 64, 67, 71, 60, 64, 67, 71]);
    const engraved = new Set(ids);
    for (const e of m.events.filter((x) => x.track === "mel" && x.bar === 17))
      expect(engraved.has(e.id)).toBe(true);
    // Past the end clamps to the last page.
    expect(staffPage(src, 99).startBar).toBe(56);
    // Only the page that ends the piece ends with the final barline; the others close with a plain one.
    expect(m.abc?.abc).not.toContain("|]");
    expect(p.abc?.abc).not.toContain("|]");
    expect(staffPage(src, 7).abc?.abc.trimEnd()).toMatch(/\|\]$/m);
  });
});
