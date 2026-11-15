// Wave 7 integration (packages; build-author-CP, J.CP2): a code-modify step graded by a `rubric` matcher whose rules
// carry their own reference (`reharmonize` with `devices`, `matches`) evaluates that reference, as a Make does.
// Before, those rules answered `rubric.unknown` inside a matcher.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ExerciseOf, KeySpec, RubricRule } from "@oak/content-kit";
import { headlessDeps } from "../analyze/__support__/fixtures.ts";
import { normalizedFromEvents } from "../analyze/tracks.ts";
import type { GradeContext } from "../types.ts";
import { gradeWith } from "./index.ts";

setDefaultTimeout(60_000);
const raw = headlessDeps();
const deps: typeof raw = {
  ...raw,
  normalize(res, c) {
    const n = raw.normalize(res, c);
    const peak = n.all.reduce((m, e) => Math.max(m, e.gain), 0);
    const kept = [...n.all, ...n.band].filter((e) => e.gain > 0.01 && e.gain >= peak / 16);
    const out = normalizedFromEvents(kept, { cps: n.cps, bpm: n.bpm });
    for (const t of Object.keys(n.byTrack)) out.byTrack[t] ??= [];
    return out;
  },
};
const C: KeySpec = { tonic: "C", mode: "major" };
const TUNE = 'mel: n("<[0 3 2 3] [4 1 4@2] [3 2 1 2] [3@4]>").scale("C4:major").s("piano")';
const piece = (c: string, tail = "") =>
  `setcpm(84/4)\nchords: chord("<${c}>").voicing().s("piano")${tail}\nbass: note("<c2 d2 g1 c2>").s("upright")\n${TUNE}`;
const ORIGINAL = piece("C Dm G C");
const REHARM: RubricRule = {
  id: "two-devices",
  label: "Two devices under the tune",
  required: true,
  skills: [],
  rule: "reharmonize",
  melody: "mel",
  reference: { solutions: [ORIGINAL], bars: 4 },
  min: 2,
  kinds: ["borrowed", "secondary-dominant"],
} as unknown as RubricRule;
const exercise = {
  kind: "code-modify",
  id: "S1",
  version: 1,
  prompt: "",
  skills: [],
  role: "check",
  hints: null,
  tests: [],
  code: { starter: ORIGINAL },
  reference: { solutions: [piece("C D7 G [Ab Bb]")], bars: 4 },
  matcher: { m: "rubric", rules: [REHARM] },
  target: { audible: true },
} as unknown as ExerciseOf<"code-modify">;
const ctx = {
  exerciseGlobalId: "J.CP2/S1",
  mode: "lesson",
  key: C,
  meter: "4/4",
  bpm: 84,
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0,
  tutorHints: 0,
  extraReplays: 0,
  lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
} as unknown as GradeContext;
const grade = (code: string) => gradeWith({ exercise, response: { code }, ctx }, deps);
const ids = (r: Awaited<ReturnType<typeof grade>>) => r.diagnostics.map((d) => d.id);

describe("a rubric matcher's reharmonize rule reads its reference", () => {
  test("two new colours under the unchanged tune pass; three other right answers pass", async () => {
    for (const c of ["C D7 G [Ab Bb]", "C A7 Dm Bb", "C E7 Am Ab", "Fm D7 G C"]) {
      const r = await grade(piece(c));
      expect([c, r.status, ids(r)]).toEqual([c, "pass", expect.not.arrayContaining(["rubric.unknown"])]);
    }
  });
  test("the original chords, or the right chords on a silent line, fail (never rubric.unknown)", async () => {
    for (const code of [ORIGINAL, piece("C D7 G [Ab Bb]", ".gain(0)")]) {
      const r = await grade(code);
      expect(r.status).toBe("fail");
      expect(ids(r)).not.toContain("rubric.unknown");
    }
  });
});
