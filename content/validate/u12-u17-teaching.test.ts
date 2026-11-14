// Teaching review of U12–U17, their checkpoints, C6, C7, CF-A and CF-T (Wave 6 adversarial review): regression
// checks for what a learner reads that the music or the grader contradicted. A hint that names the counts of a
// rhythm names the ones its pattern plays; a guide-tone thread is said to move "by a step", because two of its
// moves are whole steps; a chord placed after `.struct()` is what the feedback asks for; a capstone brief names
// the notes a mode must leave out; a bridge "in another key" brings that key's own leading note; and the finale
// spec's list of Five Foot Two's syncopated bars is the list the repertoire key plays.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Exercise, HintLadder, LessonDef } from "@oak/content-kit";
import { flattenExercise } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { CF_A_PIECES, capstones } from "../capstones.ts";
import { CONTENT_ROOT, loadLessons } from "../lib/load.bun.ts";
import fiveFootTwo from "../repertoire/five-foot-two/song.ts";

const { lessons } = await loadLessons();
const lesson = (id: string): LessonDef => {
  const l = lessons.find((x) => x.def.id === id);
  if (!l) throw new Error(`no lesson ${id}`);
  return l.def;
};
const exercise = (id: string, exId: string): Exercise => {
  for (const s of lesson(id).steps)
    for (const e of s.exercise ? flattenExercise(s.exercise) : []) if (e.id === exId) return e;
  throw new Error(`no exercise ${id}/${exId}`);
};
const hintText = (h: HintLadder | null | undefined) =>
  (h ?? []).map((r) => (typeof r === "string" ? "" : r.text)).join(" ");
const mdx = (id: string) => {
  const [unit, l] = id.split(".");
  return readFileSync(join(CONTENT_ROOT, "core", unit as string, l as string, "lesson.mdx"), "utf8");
};
const frac = (s: string) => {
  const [a, b] = s.split("/");
  return Number(a) / (b ? Number(b) : 1);
};

describe("U12–U17 teaching", () => {
  test("U13.L06's Make hint names the counts its kick pattern plays, and no others", () => {
    const hints = hintText(exercise("U13.L06", "call-and-answer").hints);
    const pattern = /`\[(bd[^`\]]*)\]`/.exec(hints)?.[1];
    expect(pattern).toBeDefined();
    const steps = (pattern as string).trim().split(/\s+/);
    expect(steps).toHaveLength(8);
    steps.forEach((step, i) => {
      const beat = Math.floor(i / 2) + 1;
      const words = i % 2 === 0 ? `beat ${beat}` : `“and” of ${beat}`;
      if (step === "bd") expect(hints).toContain(words);
      else if (i % 2 === 1) expect(hints).not.toContain(words);
    });
  });

  test("the guide-tone thread is said to move by a step: two of its moves are whole steps", () => {
    // The thread of U12.L05's cycle, one note a bar: F F E E D D C (3rd, 7th, 3rd, 7th, …).
    const thread = [65, 65, 64, 64, 62, 62, 60];
    const moves = thread.slice(1).map((m, i) => (thread[i] as number) - m);
    expect(moves).toContain(1);
    expect(moves).toContain(2);
    const prompt = (exercise("U12.L05", "finish-the-thread") as { prompt: string }).prompt;
    expect(prompt).not.toContain("smallest step");
    expect(mdx("U12.L05")).not.toContain("move by the smallest step");
  });

  test("U13.L01 S6 says where `.late()` goes when it is the rhythm that must move", () => {
    const ex = exercise("U13.L01", "after-the-beat") as { feedbackText?: Record<string, string> };
    expect(ex.feedbackText?.["harmony.pcset"]).toContain("after `.struct()`");
  });

  test("U15.L04 S5 words a diminished seventh on another root as a root, not as a voicing's lowest note", () => {
    const ex = exercise("U15.L04", "two-more-pushes") as {
      feedbackText?: Record<string, string>;
      tests: { name: string; feedback?: string[] }[];
    };
    expect(ex.feedbackText?.["harmony.bass"]).toContain("wrong root");
    expect(ex.tests.some((t) => t.feedback?.includes("harmony.bass"))).toBe(true);
  });

  test("U16.L05's last hint does not ask for a third outside chord the rubric does not need", () => {
    const hints = hintText(exercise("U16.L05", "your-reharmonization").hints);
    expect(hints).toContain("already enough");
  });
});

describe("C6, CF-A and CF-T", () => {
  test("C6's brief names the note each mode leaves out", () => {
    const c6 = capstones.find((c) => c.id === "C6");
    const brief = (c6?.brief as { brief?: string } | undefined)?.brief ?? "";
    expect(brief).toContain("the 7th a half step below home");
    expect(brief).toContain("♭6");
  });

  test("the indie single's bridge in A minor brings A minor's own leading note, G♯", async () => {
    // Verse 8, chorus 8, verse 8: the bridge is bars 25–32, under `A1:minor` in the key plan.
    expect(CF_A_PIECES.indie).toContain("A1:minor!8");
    const r = await evalHeadless(CF_A_PIECES.indie, 44);
    const bridge = r.events.filter(
      (e) => e.track === "chords" && e.midi !== null && frac(e.begin) >= 24 && frac(e.begin) < 32,
    );
    expect(bridge.some((e) => ((Math.round(e.midi as number) % 12) + 12) % 12 === 8)).toBe(true);
  });

  test("the finale spec lists the bars where Five Foot Two's tune is tied or syncopated", async () => {
    const key = (fiveFootTwo as unknown as { answerKey: { bars: number; layers: { melody: string } } })
      .answerKey;
    const mel = key.layers.melody.replace(/\.swing(By)?\([^)]*\)/g, "");
    const r = await evalHeadless(`setcpm(192/4)\nmel: ${mel}`, key.bars);
    const bars = new Set<number>();
    for (const e of r.events) {
      const b = frac(e.begin) * 4;
      const end = frac(e.end) * 4;
      const bar = Math.floor(b / 4) + 1;
      // A note that starts between the beats and holds over the next one, or one that crosses a bar line.
      if (Math.abs(b - Math.round(b)) > 1e-9 && Math.ceil(b + 1e-9) < end - 1e-9) bars.add(bar);
      const last = Math.floor((end - 1e-9) / 4) + 1;
      for (let k = bar + 1; k <= last; k++) bars.add(bar).add(k);
    }
    const spec = readFileSync(join(CONTENT_ROOT, "specs", "CF.ts"), "utf8");
    const listed = /plain rhythm \(bars ([^)]*?) hold ties or syncopations/.exec(spec)?.[1] ?? "";
    const fromSpec = new Set<number>();
    for (const part of listed.replace(" and ", ", ").split(", ")) {
      const [a, b] = part.split("–").map(Number);
      for (let k = a as number; k <= (b ?? a ?? 0); k++) fromSpec.add(k);
    }
    expect([...fromSpec].sort((x, y) => x - y)).toEqual([...bars].sort((x, y) => x - y));
  });
});
