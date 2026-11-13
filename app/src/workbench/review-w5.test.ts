// Wave 5 review (review:surfaces): regressions for what the review found on the Workbench's Wave 5 surfaces.
// - A 136-bar arrangement: the analysis reads 64 bars, so the sections past them are cut and said, never drawn
//   silent over bars the roll does not have.
// - A blues key's staff facts name the signature the staff draws (C blues: no ♯/♭, not "3♭"; never "NaN♭").
// - A swung line prints straight under "Swing 8ths" on the Workbench staff (contracts §6.10 items 2–3), not as
//   triplets; tracks that swing differently leave the staff as it plays.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { checkAbc, readBack } from "../../../packages/notation/corpus/harness.ts";
import { keySummary, staffFifths } from "./key-tools.ts";
import { clipSections, cutText, formLetters, letterNamed, pieceBarsOf } from "./lines.ts";
import { buildModel, staffPage, staffSwingOf, type WorkbenchModel } from "./model.ts";

setDefaultTimeout(60_000);
beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

async function model(code: string, bars: number): Promise<WorkbenchModel> {
  const r = await evaluateForGrading(code, { mode: "lesson", bars: pieceBarsOf(code, bars), lint: null });
  const out = buildModel(code, r, { meter: "4/4", key: null, staff: "auto" });
  if (!out.ok) throw new Error(out.error.message);
  return out.model;
}

const NAMES = [
  "intro",
  "verse",
  "pre",
  "chorus",
  "verse2",
  "pre2",
  "chorus2",
  "bridge",
  "solo",
  "break",
  "chorus3",
  "outro",
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LONG = [
  "setcpm(120/4)",
  ...NAMES.flatMap((n) => [
    `const drums${cap(n)} = s("bd ~ sd ~")`,
    `const mel${cap(n)} = n("<[0 2 4 2] [4 2 1 ~]>").scale("C4:major").s("piano")`,
  ]),
  ...["drums", "mel"].map(
    (r) =>
      `${r}: arrange(${NAMES.map((n, i) => `[${i === 0 || i === 11 ? 8 : 12}, ${r}${cap(n)}]`).join(", ")})`,
  ),
].join("\n");

describe("a form longer than the bars analysed", () => {
  test("136 bars in twelve sections: six shown (the last cut at bar 64), the rest named as left out", async () => {
    const m = await model(LONG, 8);
    expect(m.bars).toBe(64);
    const lines = m.lines;
    expect(lines?.sections.map((s) => `${s.tag}@${s.startBar}+${s.bars}`)).toEqual([
      "intro@0+8",
      "verse@8+12",
      "pre@20+12",
      "chorus@32+12",
      "verse2@44+12",
      "pre2@56+8",
    ]);
    // Every section shown has music in it (none is "silence" past the roll).
    for (const s of lines?.sections ?? []) expect(s.tracks.length).toBeGreaterThan(0);
    expect(lines?.cut).toEqual({
      bars: 64,
      total: 136,
      hidden: ["Chorus 2", "Bridge", "Solo", "Break", "Chorus 3", "Outro"],
    });
    expect(cutText(lines?.cut as NonNullable<typeof lines>["cut"] & object)).toBe(
      "The song runs 136 bars; the Workbench reads its first 64. Chorus 2 to Outro are not shown.",
    );
  });

  test("a form that fits is not cut", async () => {
    const short = LONG.split("\n")
      .filter((l) => !/arrange/.test(l))
      .concat([
        "drums: arrange([4, drumsVerse], [4, drumsChorus])",
        "mel: arrange([4, melVerse], [4, melChorus])",
      ])
      .join("\n");
    const m = await model(short, 4);
    expect(m.lines?.cut).toBeNull();
    expect(m.lines?.sections.map((s) => s.tag)).toEqual(["verse", "chorus"]);
  });

  test("clipSections and cutText on their own", () => {
    const s = (tag: string, startBar: number, bars: number) => ({
      label: tag,
      tag,
      text: cap(tag),
      startBar,
      bars,
      tracks: ["mel"],
      energy: 0.5,
      letter: "A",
    });
    const out = clipSections([s("verse", 0, 40), s("chorus", 40, 40)], 64);
    expect(out.sections.map((x) => x.bars)).toEqual([40, 24]);
    expect(out.hidden).toEqual([]);
    expect(cutText({ bars: 64, total: 80, hidden: [] })).toBe(
      "The song runs 80 bars; the Workbench reads its first 64.",
    );
    expect(cutText({ bars: 64, total: 96, hidden: ["Outro"] })).toBe(
      "The song runs 96 bars; the Workbench reads its first 64. Outro is not shown.",
    );
  });
});

describe("sections named by letter", () => {
  test("B then A reads B A (its own letters), A A B A reads A A B A; a named form keeps its letters", async () => {
    const ba = await model(
      'const melB = n("0 2 4 2").scale("C4:major").s("piano")\nconst melA = n("4 2 1 0").scale("C4:major").s("piano")\nmel: arrange([2, melB], [2, melA], [2, melB])',
      2,
    );
    const s = ba.lines?.sections ?? [];
    expect(s.map((x) => x.text)).toEqual(["B", "A", "B"]);
    expect(s.every(letterNamed)).toBe(true);
    expect(formLetters(s)).toBe("B A B");
    const vc = await model(
      'const melVerse = n("0 2 4 2").scale("C4:major").s("piano")\nconst melChorus = n("4 2 1 0").scale("C4:major").s("piano")\nmel: arrange([2, melVerse], [2, melChorus])',
      2,
    );
    expect(formLetters(vc.lines?.sections ?? [])).toBe("A B");
    expect(letterNamed({ text: "Verse" })).toBe(false);
    expect(letterNamed({ text: "A 2" })).toBe(true);
  });
});

describe("a blues key's staff facts", () => {
  test("C blues and A minor blues read as the signature the staff draws", () => {
    expect(staffFifths({ tonic: "C", mode: "blues" } as never)).toBe(0);
    expect(staffFifths({ tonic: "A", mode: "minor blues" } as never)).toBe(3);
    expect(keySummary([], 0, 1, { tonic: "C", mode: "blues" } as never)).toBe("C blues · no ♯/♭");
    expect(keySummary([], 0, 1, { tonic: "A", mode: "minor blues" } as never)).not.toContain("NaN");
    expect(keySummary([], 0, 1, { tonic: "Eb", mode: "harmonic minor" } as never)).toBe(
      "E♭ harmonic minor · 6♭",
    );
  });
});

describe("swing on the Workbench staff", () => {
  test("swung hats and a swung riff print straight under Swing 8ths; the drawn notes keep their pitches", async () => {
    const m = await model(
      'setcpm(112/4)\nriff: n("[0 1 2 3 4 3 2 1]").scale("C4:blues").swingBy(1/3, 4).s("piano")\nhats: s("hh*8").swing(4)',
      1,
    );
    expect(m.staffSource?.swing?.subdivision).toBe(8);
    const page = staffPage(m.staffSource as NonNullable<WorkbenchModel["staffSource"]>, 0);
    const abc = page.abc?.abc ?? "";
    expect(abc).toContain('Q:"Swing 8ths"');
    // No triplets: every eighth on the straight grid.
    expect(abc).not.toMatch(/\(3/);
    expect(page.score?.approximate).toBe(false);
    const check = checkAbc(abc);
    expect(check.warnings ?? []).toEqual([]);
    const midis = readBack(abc).staves.flatMap((s) => s.voices.flatMap((v) => v.flatMap((n) => n.midis)));
    expect(midis.filter((x) => x > 0).slice(0, 8)).toEqual([60, 63, 65, 66, 67, 66, 65, 63]);
  });

  test("a straight piece has no swing; tracks that swing differently leave the staff as it plays", async () => {
    const straight = await model('mel: n("0 1 2 3 4 3 2 1").scale("C4:major").s("piano")', 1);
    expect(straight.staffSource?.swing).toBeUndefined();
    const p = (n: number, d: number) => ({ p: [n, d] as [number, number] });
    expect(
      staffSwingOf([
        { swung: 8, eighths: p(2, 3), sixteenths: { p: null } },
        { swung: 16, eighths: { p: null }, sixteenths: p(2, 3) },
      ]),
    ).toBeNull();
    expect(
      staffSwingOf([
        { swung: 8, eighths: p(2, 3), sixteenths: { p: null } },
        { swung: 8, eighths: p(3, 5), sixteenths: { p: null } },
      ]),
    ).toBeNull();
    expect(staffSwingOf([{ swung: 8, eighths: p(3, 5), sixteenths: { p: null } }])?.amount).toBeCloseTo(
      0.2,
      9,
    );
    expect(staffSwingOf([{ swung: null, eighths: { p: null }, sixteenths: { p: null } }])).toBeNull();
  });
});
