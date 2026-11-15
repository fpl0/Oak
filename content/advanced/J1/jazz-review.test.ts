// Wave 7 teaching review of the jazz track (review:teaching-jazz): regression pins for the musical claims the review
// found false or misleading and fixed. Each test re-derives the fact by running it (headless Strudel, the theory of
// the chord) and checks that the learner-facing text now says what the music does. Grading fixes (a straight
// Charleston, a push that stops short, the minor homes of J2.L02 and J.CP1, a chord swapped inside the bar) are
// pinned as tests of the lessons themselves and run in content:check.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckpointDef, Exercise, LessonDef, RubricRule } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { capstoneById } from "../../capstones.ts";
import auraLee from "../../repertoire/aura-lee/song.ts";
import J1L03 from "./L03/lesson.ts";

const ADV = join(import.meta.dir, "..");
const mdx = (path: string) => readFileSync(join(ADV, path), "utf8");
const lesson = async (path: string): Promise<LessonDef> =>
  (await import(join(ADV, path))).default as LessonDef;
const step = (l: LessonDef, id: string) => {
  const s = l.steps.find((x) => x.id === id);
  if (!s) throw new Error(`${l.id} has no ${id}`);
  return s;
};
const exOf = (l: LessonDef, id: string) => step(l, id).exercise as Exercise & Record<string, unknown>;
const hintTexts = (ex: { hints?: unknown }): string[] =>
  ((ex.hints ?? []) as unknown[]).flatMap((h) =>
    typeof h === "object" && h && "text" in h ? [String(h.text)] : [],
  );
/** Every string the learner can read in a lesson's typed file (prompts, captions, hints, feedback, labels). */
const learnerText = (l: LessonDef): string => {
  const out: string[] = [];
  const walk = (v: unknown, key = ""): void => {
    if (typeof v === "string") {
      if (["prompt", "caption", "text", "label", "title"].includes(key) || key.includes(".")) out.push(v);
    } else if (Array.isArray(v)) for (const x of v) walk(x, key);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(l.steps);
  return out.join("\n");
};
const pcs = (midis: number[]) => [...new Set(midis.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b);
/** Pitch classes sounding per cycle of a one-track pattern. */
async function chordsPerBar(code: string, bars: number): Promise<number[][]> {
  const r = await evalHeadless(code, bars);
  return Array.from({ length: bars }, (_, i) =>
    pcs(r.events.filter((e) => Math.floor(e.onset) === i && e.midi !== null).map((e) => e.midi as number)),
  );
}

describe("J1.L03: the trio in F is not every line a 4th higher", () => {
  test("its bass moves down a 5th, and the text no longer says the lines all went up", async () => {
    const items = (exOf(J1L03, "S1").items as { code: string; caption: string }[]) ?? [];
    const firstBass = async (code: string) =>
      (await evalHeadless(code, 1)).events.find((e) => e.track === "bass" && e.midi !== null)?.midi as number;
    const inC = await firstBass(items[0]?.code as string);
    const inF = await firstBass(items[1]?.code as string);
    expect(inF - inC).toBe(-7);
    expect(items[1]?.caption).not.toMatch(/4th higher/);
    expect(mdx("J1/L03/lesson.mdx")).not.toMatch(/every line moved up/);
  });
});

describe("J2.L03: Fm9 in `ireal-ext` gives its root to the bass", () => {
  test("bar 2 adds G and drops F from the Rhodes; the prose says so", async () => {
    const [fm7, fm9] = await chordsPerBar('m: chord("<Fm7 Fm9>").dict("ireal-ext").voicing()', 2);
    expect(fm7).toContain(5);
    expect(fm9).not.toContain(5);
    expect(fm9?.filter((p) => !fm7?.includes(p))).toEqual([7]);
    expect(mdx("J2/L03/lesson.mdx")).toMatch(/leaves the root to the bass/);
  });
});

describe("J3.L01: the 9th of Fmaj7 is a step above the root, not above E", () => {
  test("G is two half steps above F and three above E; the hint names the root", async () => {
    const l = await lesson("J3/L01/lesson.ts");
    const hints = hintTexts(exOf(l, "S3")).join(" ");
    expect(7 - 5).toBe(2);
    expect(7 - 4).toBe(3);
    expect(hints).not.toMatch(/a step above E\b/);
    expect(hints).toMatch(/a step above the root F/);
  });
});

describe("J3.L03: a Charleston and a push that swing, and a push that rings", () => {
  test("both modify steps read the off-beat hits' swing; the push also reads how long its chord lasts", async () => {
    const l = await lesson("J3/L03/lesson.ts");
    const rulesOf = (id: string) =>
      (
        (exOf(l, id).matcher as { of?: { m: string; rules?: RubricRule[]; durations?: boolean }[] }).of ?? []
      ).flatMap((m) => (m.m === "rubric" ? (m.rules ?? []) : []));
    for (const id of ["S3", "S5"])
      expect(rulesOf(id).map((r) => (r.rule === "custom" ? r.fn : r.rule))).toContain("swung-offbeats");
    const s5 = (exOf(l, "S5").matcher as { of: { m: string; durations?: boolean }[] }).of;
    expect(s5.find((m) => m.m === "pcset")?.durations).toBe(true);
  });
  test("a straight Charleston really is straight: its off-beat hit sits halfway through beat 2", async () => {
    const at = async (code: string) =>
      (await evalHeadless(code, 1)).events.map((e) => e.onset).filter((o) => o > 0 && o < 1);
    expect(await at('c: note("c4").struct("x ~ ~ x ~ ~ ~ ~").swingBy(1/3, 4)')).toEqual([5 / 12]);
    expect(await at('c: note("c4").swingBy(1/3, 4).struct("x ~ ~ x ~ ~ ~ ~")')).toEqual([3 / 8]);
  });
});

describe("J4.L02: the chart's bar 11", () => {
  test("the modify prompt names bar 11, which the charted solution may change", async () => {
    const l = await lesson("J4/L02/lesson.ts");
    const ex = exOf(l, "S4");
    expect(String(ex.prompt)).toMatch(/bar 11/);
    expect((ex.reference as { solutions: string[] }).solutions.some((s) => s.includes("[F7 D7]"))).toBe(true);
  });
});

describe("J5.L04: D7 is not Aura Lee's own chord", () => {
  test("the answer key has ii in bar 2, and the lesson calls D7 U16's, not the verse's own", async () => {
    const bar2 = auraLee.answerKey.chords?.find((c) => c.bar === 2)?.symbol;
    expect(bar2).toBe("Dm");
    const l = await lesson("J5/L04/lesson.ts");
    expect(`${learnerText(l)}\n${mdx("J5/L04/lesson.mdx")}`).not.toMatch(/own chords/);
  });
});

describe("J5.L05: the leap pinned as a fail is a 4th", () => {
  test("G4 to C5 is five half steps, over the rule's limit of four, and the test says a 4th", async () => {
    const l = await lesson("J5/L05/lesson.ts");
    const ex = exOf(l, "S4");
    const rule = (ex.rubric as RubricRule[]).find((r) => r.id === "guide-tones-through") as {
      maxMoveSemis: number;
    };
    expect(72 - 67).toBeGreaterThan(rule.maxMoveSemis);
    const names = (ex.tests as { name: string }[]).map((t) => t.name);
    expect(names.some((n) => /a 4th up into bar 3/.test(n))).toBe(true);
    expect(names.some((n) => /a 5th into bar 3/.test(n))).toBe(false);
  });
});

describe("J5.L01–L03: the brief's bass move is told when the bass stays", () => {
  test("each Make suggests the bass on the new roots", async () => {
    for (const path of ["J5/L01/lesson.ts", "J5/L02/lesson.ts", "J5/L03/lesson.ts"]) {
      const l = await lesson(path);
      const make = l.steps.find((s) => s.kind === "make")?.exercise as { rubric: RubricRule[] };
      const r = make.rubric.find((x) => x.id === "bass-follows");
      expect(r).toMatchObject({ rule: "bass-line", required: false, roots: { on: "change", minRatio: 1 } });
    }
  });
});

describe("J.CP2: the bridge is asked for in the numerals J4.L03 taught", () => {
  test("the prompt's numerals are J4.L03 S3's answer", async () => {
    const j4l03 = await lesson("J4/L03/lesson.ts");
    const rn = (exOf(j4l03, "S3").correct as { rn: string[] }).rn;
    const cp = (await import(join(ADV, "J5/CP/checkpoint.ts"))).default as CheckpointDef;
    const item = cp.authored.find((x) => x.id === "rhythm-changes-from-numerals") as { prompt: string };
    expect(item.prompt).toContain(rn.join(" "));
  });
});

describe("JC1: the 7th-to-3rd step holds inside a ii–V–I, not across every change", () => {
  /** Third and seventh above a root, by quality. */
  const GUIDES: Record<string, [number, number]> = {
    m7: [3, 10],
    m7b5: [3, 10],
    "7": [4, 10],
    "^7": [4, 11],
  };
  const step = (a: string, b: string) => {
    const seventh = (GUIDES[a] as [number, number])[1] % 12;
    const third = (5 + (GUIDES[b] as [number, number])[0]) % 12; // the next root a 5th below = a 4th above
    return Math.min((third - seventh + 12) % 12, (seventh - third + 12) % 12);
  };
  test("ii to V, V to I and the minor ii–V–i step 1 or 2; Cmaj7 into Fm7, roots a 5th apart too, steps 3", () => {
    for (const [a, b] of [
      ["m7", "7"],
      ["m7b5", "7"],
      ["7", "^7"],
      ["7", "m7"],
    ] as const)
      expect([1, 2]).toContain(step(a, b));
    expect(step("^7", "m7")).toBe(3);
    const jc1 = capstoneById.get("JC1") as { hints?: unknown; brief?: { hints?: unknown } };
    const hints = [...hintTexts(jc1), ...hintTexts(jc1.brief ?? {})].join(" ");
    expect(hints).toMatch(/inside each ii–V–I/);
    expect(hints).not.toMatch(/wherever the roots fall a 5th/);
  });
});

describe("J4.L02: the ii of B♭ is a whole step above it", () => {
  test("C is two half steps above B♭ and F seven; the hint says so", async () => {
    const l = await lesson("J4/L02/lesson.ts");
    const hints = hintTexts(exOf(l, "S2")).join(" ");
    expect((0 - 10 + 12) % 12).toBe(2);
    expect((5 - 10 + 12) % 12).toBe(7);
    expect(hints).toMatch(/minor chord a whole step above B♭/);
    expect(hints).not.toMatch(/minor chord a 5th above B♭/);
  });
});

describe("J5.L03: the tune does not fit every aimed ii–V", () => {
  test("D over F♯m7 is a half step above its C♯; the prompt asks the learner to check", async () => {
    const [fsm7] = await chordsPerBar('m: chord("F#m7").voicing()', 1);
    expect(fsm7).toContain(1); // C♯, a half step under the tune's D
    const l = await lesson("J5/L03/lesson.ts");
    const prompt = String(exOf(l, "S7").prompt);
    expect(prompt).not.toMatch(/fit every ii–V/);
    expect(prompt).toMatch(/check that its long notes agree/);
  });
});

describe("J.CP2: the walk is heard into every bar line, the loop's included", () => {
  test("two passes of the loop and every bar asked for, as the prompt says", async () => {
    const cp = (await import(join(ADV, "J5/CP/checkpoint.ts"))).default as CheckpointDef;
    const item = cp.authored.find((x) => x.id === "walk-the-blues") as unknown as {
      reference: { bars: number };
      matcher: { rules: { params: Record<string, number> }[] };
    };
    expect(item.reference.bars).toBe(8);
    expect(item.matcher.rules[0]?.params).toMatchObject({
      rootOnOne: 1,
      chordToneOnThree: 1,
      approachOnFour: 1,
    });
  });
});
