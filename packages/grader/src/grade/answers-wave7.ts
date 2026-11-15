// Wave 7 Build (grader): the answers the advanced tracks add (docs/design/wave7.md §11).
// - `grouping` (R2.L01–L02): the sequence of group sizes of an odd-meter bar; a rotation is another grouping.
// - `euclid` (R3.L01–L03): k, n (and r) graded by the onsets they make, so two spellings of one rhythm are one answer.
// - `text.jazz-chord` (J1.L02): jazz glyphs and extensions read as chords (`D–7` = `Dm7`, `Cø7` = `Cm7b5`, `C∆9` =
//   `Cmaj9`, `G7(♭9)` = `G7b9`, `Galt` = `G7alt`), compared on root, quality and extensions, never as strings.
// - `keyboard.voicing` / `staff-expect.voicing` (J1.L05, J3.L01–L02): the chord in the asked shape, octave-aware.
// - `tap.lanes` (R2.L04): two lanes graded on their own and combined; the step passes when both do.
// No message below the reveal rung names the answer: a miss says what the learner's own answer is.
import type { AnswerUi, Diagnostic, MeterId, TapLane, VoicingShape } from "@oak/content-kit";
import { voicingShapeOf } from "@oak/content-kit";
import { type ChordId, euclid as euclidPattern, parseChordSymbol } from "@oak/theory";
import { voicedChordOf } from "../analyze/wave7-views.ts";
import { diag } from "../feedback/catalog.ts";
import { tapTargets } from "../perf/index.ts";
import type { MatchResult, Normalized } from "../types.ts";
import type { AnswerCheck } from "./answers.ts";

const ok = (): AnswerCheck => ({
  score: 1,
  dims: { choice: { score: 1, weight: 1 } },
  diagnostics: [],
  slots: [1],
});
const miss = (d: Diagnostic, score = 0): AnswerCheck => ({
  score,
  dims: { choice: { score, weight: 1 } },
  diagnostics: [d],
  slots: [score],
});

/** `grouping`: the group sizes in order. The same groups in another order is a near miss. */
export function groupingCheck(correct: readonly number[], got: readonly number[]): AnswerCheck {
  if (got.length === 0) return miss(diag("id.missing", { n: 1 }));
  if (got.length === correct.length && got.every((g, i) => g === correct[i])) return ok();
  const total = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const gotText = got.join("+");
  if (total(got) !== total(correct))
    return miss(
      diag(
        "id.grouping-count",
        { got: gotText, gotTotal: total(got), total: total(correct) },
        undefined,
        "choice",
      ),
    );
  const same = [...got].sort().join() === [...correct].sort().join();
  return same
    ? miss(diag("id.grouping-order", { got: gotText }, undefined, "choice"), 0.5)
    : miss(diag("id.grouping-wrong", { got: gotText }, undefined, "choice"));
}

/** The onsets of E(k, n, r) on its n-step grid. */
function euclidSteps(x: readonly number[]): number[] | null {
  const [k, n, r = 0] = x;
  if (
    k === undefined ||
    n === undefined ||
    !Number.isInteger(k) ||
    !Number.isInteger(n) ||
    n <= 0 ||
    k < 0 ||
    k > n
  )
    return null;
  const bits = euclidPattern(k, n, r);
  return bits.flatMap((b, i) => (b ? [i] : []));
}
/** `euclid`: the numbers graded by the rhythm they make. Without `rotation`, r is not part of the answer. */
export function euclidCheck(
  ui: Extract<AnswerUi, { ui: "euclid" }>,
  correct: readonly number[],
  got: readonly number[],
): AnswerCheck {
  if (got.length < 2) return miss(diag("id.missing", { n: 1 }));
  const want = ui.rotation ? correct : correct.slice(0, 2);
  const mine = ui.rotation ? got : got.slice(0, 2);
  const a = euclidSteps(want);
  const b = euclidSteps(mine);
  const gotText = `(${mine.join(",")})`;
  if (!b)
    return miss(
      diag("id.euclid-wrong", { got: gotText, k: got[0] ?? 0, n: got[1] ?? 0 }, undefined, "choice"),
    );
  if (a && a.length === b.length && (want[1] ?? 0) === (mine[1] ?? 0) && a.every((x, i) => x === b[i]))
    return ok();
  if ((want[0] ?? -1) === (mine[0] ?? -2) && (want[1] ?? -1) === (mine[1] ?? -2))
    return miss(diag("id.euclid-rotation", { got: gotText }, undefined, "choice"), 0.5);
  return miss(
    diag("id.euclid-wrong", { got: gotText, k: mine[0] ?? 0, n: mine[1] ?? 0 }, undefined, "choice"),
  );
}

/** A jazz chord symbol in code spelling: glyphs, Unicode accidentals and parentheses read as the dictionary does. */
export function jazzChordText(s: string): string {
  let t = s.trim().replace(/♭/g, "b").replace(/♯/g, "#").replace(/[()]/g, "").replace(/\s+/g, "");
  const m = /^([A-Ga-g])([#b]?)(.*)$/.exec(t);
  if (!m) return t;
  const root = `${(m[1] as string).toUpperCase()}${m[2] ?? ""}`;
  let q = m[3] ?? "";
  q = q
    .replace(/^[∆Δ△]$/, "^7")
    .replace(/^[∆Δ△]/, "^")
    .replace(/^[–−-]/, "m")
    .replace(/^min/, "m")
    .replace(/^ø7?/, "m7b5")
    .replace(/^°7/, "o7")
    .replace(/^°/, "dim")
    .replace(/^alt$/, "7alt")
    .replace(/^m[∆Δ△]7?/, "m^7");
  t = `${root}${q}`;
  return t;
}
/** The chord a jazz symbol names, or null. */
export function parseJazzChord(s: string): ChordId | null {
  return parseChordSymbol(jazzChordText(s));
}

const SHAPE_WORDS: Record<string, string> = {
  shell: "a shell (root, then the 3rd and the 7th)",
  close: "a close voicing (four notes inside an octave)",
  "drop-2": "a drop-2 voicing",
  "rootless-a": "a rootless A voicing (the 3rd at the bottom)",
  "rootless-b": "a rootless B voicing (the 7th at the bottom)",
};
const shapesOf = (s: VoicingShape | VoicingShape[]): VoicingShape[] => (Array.isArray(s) ? s : [s]);
/** The shape of `midis` over `symbol`, and whether it is one of `shapes`. */
export function voicingShapeCheck(
  midis: readonly number[],
  symbol: string,
  shapes: VoicingShape | VoicingShape[],
): { ok: boolean; got: string; want: string } {
  const chord = parseJazzChord(symbol);
  const want = shapesOf(shapes)
    .map((x) => SHAPE_WORDS[x] ?? x)
    .join(" or ");
  if (!chord) return { ok: false, got: "no chord", want };
  const shape = voicingShapeOf(midis, voicedChordOf(chord));
  return {
    ok: shape !== null && shapesOf(shapes).includes(shape),
    got: shape ? (SHAPE_WORDS[shape] ?? shape) : "none of the voicing shapes",
    want,
  };
}
/** `keyboard.voicing`: the chord played in the asked shape, in any register. */
export function keyboardVoicingCheck(
  expect: { shape: VoicingShape | VoicingShape[]; symbol: string },
  got: readonly number[],
): AnswerCheck {
  if (got.length === 0)
    return { ...miss(diag("id.missing", { n: 1 })), dims: { pitch: { score: 0, weight: 1, n: 0 } } };
  const r = voicingShapeCheck(got, expect.symbol, expect.shape);
  const score = r.ok ? 1 : 0;
  return {
    score,
    dims: { pitch: { score, weight: 1, n: got.length } },
    diagnostics: r.ok ? [] : [diag("kb.voicing", { got: r.got, want: r.want }, undefined, "pitch")],
    slots: [score],
  };
}

/** Wave 7 answers inside `gradeAnswer`: the grouping and Euclid widgets, or `null` for every other answer. */
export function wave7Answer(
  ui: AnswerUi,
  correct: { grouping?: number[]; euclid?: number[] },
  got: { grouping?: number[]; euclid?: number[] },
): AnswerCheck | null {
  if (correct.grouping) return groupingCheck(correct.grouping, got.grouping ?? []);
  if (correct.euclid && ui.ui === "euclid") return euclidCheck(ui, correct.euclid, got.euclid ?? []);
  if (correct.euclid)
    return euclidCheck({ ui: "euclid", maxSteps: 16, rotation: true }, correct.euclid, got.euclid ?? []);
  return null;
}

/** `tap.lanes`: the targets of each lane (seconds), read off the evaluated stimulus, in the lanes' order. */
export function tapLaneTargets(
  lanes: readonly TapLane[],
  n: Normalized,
  bars: number,
  meter: MeterId,
): number[][] {
  return lanes.map((l) => tapTargets({ track: l.track }, n, bars, meter));
}
/**
 * `tap.lanes`: one performance from the lanes' own (each graded by @oak/pitch against its lane's targets): the
 * score is the weaker lane's, so the step passes only when both do; each finding names its lane.
 *
 * Prefer @oak/pitch `gradeLaneTaps(lanes, tapLaneTargets(...).map(...), tol, profile)` and pass its result as the
 * step's performance (Wave 7 integration, build-audio): grading each lane alone forgives each lane's OWN offset at
 * levels 1–2, so a three tapped 60 ms early throughout reads as a perfect lane; `gradeLaneTaps` forgives only the
 * offset both hands share, says "rushing against the two", and passes when both lanes pass. This join stays for a
 * host that has only per-lane results.
 */
export function combineLanePerformances(
  lanes: readonly TapLane[],
  perfs: readonly MatchResult[],
): MatchResult {
  const weakest = perfs.reduce((m, p) => Math.min(m, p.score), perfs.length ? 1 : 0);
  const dims: MatchResult["dims"] = {};
  for (const p of perfs)
    for (const [k, d] of Object.entries(p.dims ?? {})) {
      const prev = (dims as Record<string, { score: number; weight: number }>)[k];
      (dims as Record<string, unknown>)[k] = prev ? { ...d, score: Math.min(prev.score, d.score) } : d;
    }
  return {
    ...(perfs[0] ?? { score: 0, dims: {}, diagnostics: [] }),
    score: weakest,
    dims,
    diagnostics: perfs.flatMap((p, i) =>
      p.diagnostics.map((d) => ({
        ...d,
        where: { ...(d.where ?? {}), track: lanes[i]?.label ?? `lane ${i + 1}` },
      })),
    ),
  } as MatchResult;
}
