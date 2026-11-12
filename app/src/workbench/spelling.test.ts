// What the staff draws and what the labels say agree (Wave 3 review). Every engraved note's spelling (the ABC
// read back by abcjs's parser) is the note name under it, and its degree is the reading of that spelling in
// the key of its bar: a natural the code writes stays a natural (`note("f5")` in G major is F♮, ♭7 — not E♯,
// ♯6), a patterned `.scale()` changes the signature at the bar line (C♯ in A major, never D♭), and every
// U03/U04 example and reference solution in the Workbench passes the same check.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { midisOf } from "@oak/grader/testing";
import { labelPitch } from "@oak/theory";
import { readBack } from "../../../packages/notation/corpus/harness.ts";
import { buildModel, staffPage, staffPageCount, type WorkbenchModel } from "./model.ts";

setDefaultTimeout(60_000);
beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

const ALL = { degree: true, solfege: true, noteName: true };
async function model(code: string, bars: number, key: KeySpec | null = null): Promise<WorkbenchModel> {
  const result = await evaluateForGrading(code, { mode: "lesson", bars, lint: null });
  const out = buildModel(code, result, { meter: "4/4", key, staff: "auto", annotations: ALL });
  if (!out.ok) throw new Error(`${out.error.kind}: ${out.error.message}`);
  return out.model;
}

/** Per page: the drawn names (abcjs read-back is checked to sound the events) against the labels. */
function disagreements(m: WorkbenchModel): string[] {
  const src = m.staffSource;
  if (!src) return ["no staff"];
  const out: string[] = [];
  for (let p = 0; p < staffPageCount(src); p++) {
    const page = staffPage(src, p);
    if (!page.abc) {
      out.push(`page ${p}: ${page.error}`);
      continue;
    }
    const drawn = readBack(page.abc.abc)
      .staves.flatMap((s) => s.voices.flatMap((v) => v.flatMap((n) => n.midis)))
      .sort((a, b) => a - b);
    const sounding = m.events
      .filter(
        (e) => !e.band && e.midi !== null && e.onset >= page.startBar && e.onset < page.startBar + page.bars,
      )
      .map((e) => e.midi as number)
      .sort((a, b) => a - b);
    if (drawn.join() !== sounding.join()) out.push(`page ${p}: drew ${drawn} for ${sounding}`);
    for (const entry of page.abc.idMap) {
      const labels = entry.eventIds.map((id) => m.byId.get(id)?.label?.name).filter(Boolean);
      if (labels.length && [...labels].sort().join() !== [...entry.pitches].sort().join())
        out.push(`bar ${entry.bar + page.startBar}: drew ${entry.pitches} labelled ${labels}`);
    }
  }
  return out;
}

describe("the staff and the labels say the same note", () => {
  test("a natural the code writes stays natural: f5 in G major is F♮ = ♭7, b4 in F major is B♮ = ♯4", async () => {
    const g = await model('mel: note("g4 a4 b4 c5 d5 e5 f5 g5").s("piano")', 1);
    const f5 = g.events.find((e) => e.midi === 77);
    expect(g.key).toEqual({ tonic: "G", mode: "major" });
    expect(f5?.label?.name).toBe("F5");
    expect(f5?.label?.degree?.label).toBe("♭7");
    expect(disagreements(g)).toEqual([]);
    const f = await model('mel: note("<[f4 a4 c5 [b4 a4]] [g4 a4 f4 ~]>").s("piano")', 2);
    const b4 = f.events.find((e) => e.midi === 71);
    expect(f.key).toEqual({ tonic: "F", mode: "major" });
    expect(b4?.label?.name).toBe("B4");
    expect(b4?.label?.degree?.label).toBe("♯4");
    expect(disagreements(f)).toEqual([]);
  });

  test("a chromatic neighbour keeps the key's spelling; only a passing note follows its motion", async () => {
    // E E♭ E in C major: a lower neighbour is ♭3 (E♭), as the staff draws it, not ♯2 (D♯) by its rise.
    const m = await model('mel: note("64 63 64 67 60 61 62 64").s("piano")', 1, {
      tonic: "C",
      mode: "major",
    });
    expect(m.events.map((e) => e.label?.name)).toEqual(["E4", "Eb4", "E4", "G4", "C4", "C#4", "D4", "E4"]);
    expect(m.events.map((e) => e.label?.degree?.label)).toEqual(["3", "♭3", "3", "5", "1", "♯1", "2", "3"]);
    expect(disagreements(m)).toEqual([]);
  });

  test("a key that changes every bar: the signature changes at the bar line, C♯ in A major", async () => {
    const code = 'mel: n("0 2 4 2").scale("<C4:major G4:major D4:major A4:major>").s("piano")';
    expect(await midisOf(code, 4)).toEqual([60, 64, 67, 64, 67, 71, 74, 71, 62, 66, 69, 66, 69, 73, 76, 73]);
    const m = await model(code, 4);
    const page = staffPage(m.staffSource as NonNullable<WorkbenchModel["staffSource"]>, 0);
    expect(page.score?.keyChanges?.map((c) => c.key.tonic)).toEqual(["G", "D", "A"]);
    expect(page.abc?.abc).toContain("[K:A]");
    expect(page.abc?.idMap.filter((e) => e.bar === 4).map((e) => e.pitches[0])).toEqual([
      "A4",
      "C#5",
      "E5",
      "C#5",
    ]);
    const src = m.staffSource as NonNullable<WorkbenchModel["staffSource"]>;
    const degreesOnly = staffPage(
      { ...src, annotations: { degree: true, solfege: false, noteName: false } },
      0,
    );
    const w = (degreesOnly.abc?.abc ?? "").split("\n").find((l) => l.startsWith("w:"));
    expect(w).toBe("w:1 3 5 3 | 1 3 5 3 | 1 3 5 3 | 1 3 5 3");
    expect(disagreements(m)).toEqual([]);
  });

  test("two tracks in two keys on the grand staff: each staff shows its own signature and spelling", async () => {
    // A melody in C over a bass in G-flat (polytonal): the bass's B-flat and D-flat were drawn as A-sharp and
    // C-sharp against one C-major signature; its staff now carries six flats, the melody's none.
    const code = [
      'mel: n("0 2 4 7").scale("C4:major").s("piano")',
      'bass: n("0 2 4 0").scale("Gb2:major").s("gm_acoustic_bass")',
    ].join("\n");
    const m = await model(code, 1);
    expect(m.score?.staves.map((s) => s.clef)).toEqual(["treble", "bass"]);
    expect(m.score?.key).toEqual({ tonic: "C", mode: "major" });
    expect(m.score?.staves[0]?.key).toBeUndefined();
    expect(m.score?.staves[1]?.key).toEqual({ tonic: "Gb", mode: "major" });
    expect(m.abc?.abc).toContain("[K:Gb]");
    const bassNames = m.abc?.idMap.filter((e) => e.pitches[0]?.endsWith("2") || e.pitches[0]?.endsWith("3"));
    expect(bassNames?.map((e) => e.pitches[0])).toEqual(["Gb2", "Bb2", "Db3", "Gb2"]);
    expect(disagreements(m)).toEqual([]);
    // Read back through abcjs: the bass voice's own signature, and no accidental written for its flats.
    const back = readBack(m.abc?.abc ?? "");
    expect(back.staves.length).toBe(2);
    expect(m.abc?.abc.split("\n").find((l) => l.startsWith("[K:Gb]"))).not.toMatch(/_/);
    // The same key on both tracks keeps one signature (no inline key).
    const same = await model(
      'mel: n("0 2 4 7").scale("G4:major").s("piano")\nbass: n("0 4").scale("G2:major").s("gm_acoustic_bass")',
      1,
    );
    expect(same.abc?.abc).not.toMatch(/\[K:/);
    expect(same.score?.staves.every((s) => s.key === undefined)).toBe(true);
  });

  test("seven sharps, seven flats, a 64-bar key walk and notes far off the staff all draw what sounds", async () => {
    for (const [code, bars] of [
      ['mel: n("0 1 2 3 4 5 6 7").scale("<C#4:major Cb4:major>").s("piano")', 2],
      [
        'mel: n("0 1 2 3 4 5 6 7").scale("<C4:major G4:major D4:major A4:major E4:major B4:major F#4:major C#4:major>").s("piano")',
        64,
      ],
      ['mel: n("-14 -7 0 7 14 21").scale("C4:major").s("piano")', 1],
      ['mel: note("c1 c8 a0 c7").s("piano")', 1],
    ] as const) {
      const m = await model(code, bars);
      expect(disagreements(m)).toEqual([]);
    }
  });
});

describe("every U03 and U04 example and reference solution", () => {
  test("draws exactly the notes that sound, each named and numbered as drawn", async () => {
    const { readdirSync, existsSync } = await import("node:fs");
    const root = new URL("../../../content/core/", import.meta.url).pathname;
    const codes = new Map<string, string>();
    const walk = (x: unknown, at: string) => {
      if (typeof x === "string") {
        if (/\b(n|note)\(/.test(x) && /\.(s|sound)\(/.test(x)) codes.set(x, at);
      } else if (Array.isArray(x)) {
        for (const [i, v] of x.entries()) walk(v, `${at}[${i}]`);
      } else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) walk(v, `${at}.${k}`);
    };
    for (const unit of ["U03", "U04"])
      for (const dir of readdirSync(`${root}${unit}`))
        for (const file of ["lesson.ts", "checkpoint.ts"]) {
          const path = `${root}${unit}/${dir}/${file}`;
          if (existsSync(path)) walk((await import(path)).default, `${unit}/${dir}`);
        }
    expect(codes.size).toBeGreaterThan(100);
    const failures: string[] = [];
    let checked = 0;
    for (const [code, at] of codes) {
      const result = await evaluateForGrading(code, { mode: "lesson", bars: 8, lint: null });
      if (!result.ok) continue; // starters with blanks to fill
      const out = buildModel(code, result, { meter: "4/4", key: null, staff: "auto", annotations: ALL });
      if (!out.ok) continue;
      checked++;
      // Written enharmonics the code chose itself (`note("d#4")` in E♭) are drawn as written: names agree.
      for (const d of disagreements(out.model)) failures.push(`${at}: ${d}`);
      for (const e of out.model.events)
        if (e.midi !== null && e.label?.degree && !e.band) {
          const k = e.label.degree;
          // The degree number is the letter distance from the tonic of its key (spelling-aware).
          expect(k.num).toBeGreaterThanOrEqual(1);
          expect(k.num).toBeLessThanOrEqual(7);
        }
    }
    expect(checked).toBeGreaterThan(100);
    expect(failures).toEqual([]);
    expect(labelPitch(73, { tonic: "A", mode: "major" }).name).toBe("C#5");
  }, 300_000);
});
