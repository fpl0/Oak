// The Wave 5 learner review of C3, C4 and C5 (review:studio): pieces a beginner writes, three honest ones per
// capstone in other keys, flavours and section lengths, and plausible near misses, graded exactly as the browser's
// check does (`checkPiece`: the key read from the piece when the brief has none, the brief's middle tempo, its
// swing). Each verdict must be right, each unmet rule must say something a learner can act on, and section names
// that read as something else than meant (`verseChords`, `chordsV`, a verse const reused in the chorus) get a
// hint that says what to write instead of a contrast of "no difference" or a length read from one loop.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { GradeResult, KeySpec } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { formView, keyEstimate, normalize } from "@oak/grader";
import { hasPitches, MAX_CAPSTONE_BARS, pieceBars, truncate } from "./piece.ts";
import { NAMING, PIECES, type ReviewPiece } from "./review-w5-pieces.ts";
import { capstone, ensureRealm, unlockedFor } from "./test-support.ts";
import { arrangeLines, contrastText, pieceForm, rowExtras, sectionLabelOf } from "./wave5.ts";

setDefaultTimeout(180_000);

/** `engine.checkPiece` without the worker: the same evaluation, key and grading context. */
async function check(id: ReviewPiece["id"], code: string) {
  await ensureRealm();
  const def = capstone(id);
  const ev = await grader.evaluateForGrading(code, {
    mode: "capstone",
    bars: MAX_CAPSTONE_BARS,
    lint: null,
    meter: def.meter,
  });
  let key: KeySpec | null = def.key ?? null;
  let bars = 1;
  let view = null;
  if (ev.ok) {
    const full = normalize(ev, { meter: def.meter });
    bars = pieceBars(code, full.all);
    const n = truncate(full, bars);
    if (!key && hasPitches(n)) key = keyEstimate(n.all)[0]?.key ?? null;
    view = formView(n, { code, bars });
  }
  const result: GradeResult = await grader.gradeExercise({
    exercise: def.brief as NonNullable<typeof def.brief>,
    response: { code },
    ctx: {
      exerciseGlobalId: `${id}/brief`,
      mode: "capstone",
      key: key ?? { tonic: "C", mode: "major" },
      meter: def.meter,
      bpm: def.bpm ? Math.round((def.bpm[0] + def.bpm[1]) / 2) : 100,
      ...(def.swing ? { swing: def.swing } : {}),
      params: {},
      attemptNo: 1,
      firstAttempt: true,
      rung: 0,
      tutorHints: 0,
      extraReplays: 0,
      lint: {
        profile: "graded",
        unlocked: unlockedFor(id),
        allowPreview: false,
        meter: def.meter,
        key: def.key ?? null,
      },
    },
  });
  return { result, view, bars, key, rules: def.brief?.rubric ?? [] };
}

const detailOf = (r: NonNullable<GradeResult["rubric"]>[number]): string =>
  typeof r.diag?.params.detail === "string" ? r.diag.params.detail : "";

describe("C3–C5 as a beginner writes them: every verdict right, every unmet rule actionable", () => {
  for (const p of PIECES) {
    test(`${p.id} ${p.name}`, async () => {
      const { result, view, rules } = await check(p.id, p.code);
      const unmet = (result.rubric ?? []).filter((r) => r.required && !r.ok).map((r) => r.ruleId);
      const briefIds = new Set(rules.map((r) => r.id));
      if (p.expect === "pass") {
        expect({ status: result.status, unmet }).toEqual({ status: "pass", unmet: [] });
        // An honest piece's names read: no naming hint.
        expect(pieceForm(view, p.code, rules).hint).toBeNull();
        return;
      }
      expect(result.status).toBe("fail");
      expect(unmet.filter((id) => briefIds.has(id)).sort()).toEqual([...(p.unmet ?? [])].sort());
      for (const r of result.rubric ?? []) {
        if (r.ok || !briefIds.has(r.ruleId)) continue;
        const d = detailOf(r);
        // Something to act on, in words: no ids, no placeholders, no empty line.
        expect(d.length).toBeGreaterThan(10);
        expect(d).not.toMatch(/undefined|\[object|NaN|rubric\.|\b[A-Z]\d{2}\.L\d{2}\b/);
      }
    });
  }
});

describe("section names that read as something else: the workspace says what to write", () => {
  for (const p of NAMING) {
    test(p.name, async () => {
      const { result, view, bars, rules } = await check("C3", p.code);
      expect(result.status).toBe("fail");
      const form = pieceForm(view, p.code, rules);
      expect(form.hint ?? "").toMatch(p.hint);
      const extras = rowExtras(rules, result, {
        bars,
        bpm: null,
        durationSec: null,
        meter: "4/4",
        form,
        view,
        analysis: null,
      });
      const formRow = extras.form;
      expect(formRow?.kind).toBe("note");
      // The length is every arranged part's total, never one track's loop, even while the names disagree.
      const total = (arrangeLines(p.code)[0]?.sections ?? []).reduce((n, x) => n + (x.bars ?? 0), 0);
      expect(bars).toBe(total);
      // A rule that names a section the piece does not have under that name shows no axes of its own.
      expect(extras.contrast?.kind).toBe("note");
      if (form.problem) {
        // The contrast row never says "No difference yet" for a piece whose parts disagree about the sections;
        // the length is not read from one track's loop.
        const contrast = extras.contrast;
        expect(contrast?.kind).toBe("note");
        if (contrast?.kind === "contrast")
          expect(contrastText(contrast.finding)).not.toMatch(/No difference/);
        const duration = (result.rubric ?? []).find((r) => r.ruleId === "duration");
        if (duration && !duration.ok) expect(extras.duration?.kind).toBe("unread");
      }
    });
  }

  test("the reading of arrange() lines and of a const's section", () => {
    expect(
      arrangeLines(
        'kick: s("bd*4")\nchords: arrange([8, chordsVerse], [8, silence], [4, chordsChorus2]).s("piano")',
      ),
    ).toEqual([
      {
        track: "chords",
        sections: [
          { bars: 8, name: "chordsVerse" },
          { bars: 8, name: "silence" },
          { bars: 4, name: "chordsChorus2" },
        ],
      },
    ]);
    expect(sectionLabelOf("melChorus2")).toBe("chorus");
    expect(sectionLabelOf("verseChords")).toBe("chords");
    expect(sectionLabelOf("tune")).toBe("tune");
    expect(sectionLabelOf("silence")).toBeNull();
  });
});
