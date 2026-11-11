// The unit specs (content/specs/*.ts) against the registries: the authors of Wave 2 build from these, so a
// spec that promises an unknown term, a locked tool, a skill before its prerequisite or a budget the
// lesson cannot meet is caught before anyone writes a step. The rendered Markdown must be current.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUTHORING_CAPS, IMPLEMENTED, type SessionId, STEP_EXERCISE_KINDS } from "@oak/content-kit";
import { bandById, bandMeter } from "../bands/index.ts";
import { candoById } from "../candos.ts";
import { checkpointMetas } from "../checkpoints.ts";
import { deckById, familyById } from "../families.ts";
import { courseGraph, registries } from "../index.ts";
import { atOrBefore, skillOrderIssues } from "../lib/course.ts";
import { unitSpecs } from "../specs/index.ts";
import { renderUnit, specBudget } from "../specs/render.ts";
import { termById } from "../terms.ts";
import { toolboxById } from "../toolbox.ts";
import { BAD_LOG, evaluate, lint, ONBOARDING_PREVIEW, unlockedFor } from "./harness.ts";

setDefaultTimeout(60_000);
const g = courseGraph();
const meta = new Map(
  registries.syllabus.units.flatMap((u) => u.lessons.map((l) => [l.id as string, l] as const)),
);
const termsOf = (t: string | string[] | undefined): string[] =>
  t === undefined ? [] : Array.isArray(t) ? t : [t];

test("the skill graph is ordered in every legal order (contracts §4.2 rule 1)", () => {
  expect(skillOrderIssues(g, registries.syllabus, registries.skills)).toEqual([]);
});

for (const u of unitSpecs)
  describe(`${u.unit} spec`, () => {
    const unit = registries.syllabus.units.find((x) => x.id === u.unit);
    test("covers every lesson of the unit, in order", () => {
      expect(u.lessons.map((l) => l.id)).toEqual((unit?.lessons ?? []).map((l) => l.id));
    });
    test("content/specs/*.md is the current rendering", () => {
      const md = readFileSync(join(import.meta.dir, "..", "specs", `${u.unit}.md`), "utf8");
      expect(md === renderUnit(u)).toBe(true);
    });
    test("every glossary term of the unit's lessons is introduced by exactly that lesson's spec", () => {
      const ids = new Set(u.lessons.map((l) => l.id as string));
      for (const t of registries.terms.filter((x) => ids.has(x.introducedBy))) {
        const owner = u.lessons.find((l) => l.id === t.introducedBy);
        const named = owner?.steps.flatMap((s) => termsOf(s.term)) ?? [];
        expect([t.id, named.includes(t.id) || (!!t.pairedWith && named.includes(t.pairedWith))]).toEqual([
          t.id,
          true,
        ]);
      }
    });
    test("every can-do whose source is one of these lessons is listed by it", () => {
      for (const c of registries.candos.filter((x) => u.lessons.some((l) => l.id === x.source)))
        expect([c.id, u.lessons.find((l) => l.id === c.source)?.canDo.includes(c.id)]).toEqual([c.id, true]);
    });
    if (u.checkpoint) {
      const cp = u.checkpoint;
      test(`${cp.id}: skills and recipe families fit the checkpoint map`, () => {
        const m = checkpointMetas.find((c) => c.id === cp.id);
        expect(m).toBeDefined();
        const skills = new Set<string>([...(m?.gated ?? []), ...(m?.levelSetting ?? [])]);
        for (const a of cp.authored)
          for (const s of a.skills) expect([a.id, s, skills.has(s)]).toEqual([a.id, s, true]);
        for (const [s, fams] of Object.entries(cp.recipe.families))
          for (const f of fams ?? []) {
            const fam = familyById.get(f);
            expect([s, f, !!fam && atOrBefore(g, fam.unlock.lesson, cp.id as SessionId)]).toEqual([
              s,
              f,
              true,
            ]);
          }
        const measured = new Set([
          ...cp.authored.flatMap((a) => a.skills),
          ...Object.keys(cp.recipe.families),
        ]);
        expect((m?.gated ?? []).filter((s) => !measured.has(s) && !cp.make.required.includes(s))).toEqual([]);
      });
    }
    for (const l of u.lessons)
      describe(l.id, () => {
        const m = meta.get(l.id);
        const preview = ONBOARDING_PREVIEW.has(l.id);
        test("terms exist, belong to this lesson, at most three (a pair counts once)", () => {
          const terms = l.steps.flatMap((s) => termsOf(s.term));
          for (const t of terms) expect([t, termById.get(t)?.introducedBy]).toEqual([t, l.id]);
          const counted = new Set(terms.map((t) => [t, termById.get(t)?.pairedWith ?? t].sort()[0]));
          expect(counted.size).toBeLessThanOrEqual(AUTHORING_CAPS.maxTerms);
          for (const [i, s] of l.steps.entries())
            if (termsOf(s.term).length)
              expect([i + 1, ["concept", "see"].includes(s.kind)]).toEqual([i + 1, false]);
        });
        test("can-dos exist", () => {
          for (const c of l.canDo) expect([c, candoById.has(c)]).toEqual([c, true]);
        });
        test("every tool the code uses is unlocked here in every legal order", () => {
          const unlocked = unlockedFor(l.id as SessionId);
          for (const t of l.uses) {
            expect([t, toolboxById.has(t)]).toEqual([t, true]);
            if (!preview || !t.startsWith("tb.feature")) expect([t, unlocked.has(t)]).toEqual([t, true]);
          }
        });
        test("families and decks exist; a seeded family unlocks here, a reviewed one no later", () => {
          for (const r of l.srs) {
            if (r.family) {
              const f = familyById.get(r.family);
              expect([r.family, !!f]).toEqual([r.family, true]);
              if (r.mode === "seed") expect([r.family, f?.unlock.lesson]).toEqual([r.family, l.id]);
              else
                expect([r.family, atOrBefore(g, f?.unlock.lesson as SessionId, l.id as SessionId)]).toEqual([
                  r.family,
                  true,
                ]);
            }
            if (r.deck) {
              const d = deckById.get(r.deck);
              expect([r.deck, d?.unlock.lesson]).toEqual([r.deck, l.id]);
              for (const c of r.cards ?? []) expect([c, d?.cards.some((x) => x.id === c)]).toEqual([c, true]);
            }
          }
          expect(l.srs.flatMap((r) => r.cards ?? []).length).toBeLessThanOrEqual(2);
        });
        test("steps: kinds, exercise kinds and answer widgets are legal and implemented; the last is the Make", () => {
          expect(l.steps.length).toBeLessThanOrEqual(AUTHORING_CAPS.maxSteps);
          expect(l.steps.at(-1)?.kind).toBe("make");
          for (const s of l.steps) {
            const allowed = STEP_EXERCISE_KINDS[s.kind] as readonly string[];
            if (allowed.length === 0) expect([s.kind, s.exercise]).toEqual([s.kind, undefined]);
            else
              expect([s.kind, s.exercise, allowed.includes(s.exercise as string)]).toEqual([
                s.kind,
                s.exercise,
                true,
              ]);
            if (s.exercise) expect(IMPLEMENTED.exerciseKinds).toContain(s.exercise);
            for (const a of s.answer ?? []) expect(IMPLEMENTED.answerUis).toContain(a);
          }
          expect(IMPLEMENTED.rubricRules).toContain(l.make.required.rule);
        });
        test("budget of §9.2 and the 15-minute split", () => {
          const b = specBudget(l);
          expect(b.gradedChecks).toBeLessThanOrEqual(AUTHORING_CAPS.maxGradedChecks);
          expect(b.scaledMinutes).toBeLessThanOrEqual(AUTHORING_CAPS.lessonScaledMinutes + 1e-9);
          expect(b.partAScaled).toBeLessThanOrEqual(AUTHORING_CAPS.splitPartAScaled + 1e-9);
          expect(b.partBScaled).toBeLessThanOrEqual(AUTHORING_CAPS.splitPartBScaled + 1e-9);
          expect(l.wrapAt).toBeLessThan(l.steps.length);
          for (const s of l.steps) expect((s.minutes * 4) % 1).toBe(0);
        });
        test("the Band exists and is written in the lesson's meter; from U01 every Make has one", () => {
          if (l.make.band === false) expect(l.id.startsWith("U00")).toBe(true);
          else {
            expect(bandById.has(l.make.band)).toBe(true);
            expect(bandMeter(l.make.band)).toBe(l.meter);
          }
        });
        test("the hook evaluates, makes sound, has a tempo line and lints in this lesson", async () => {
          const r = await evaluate(l.hook.code, 2);
          expect([r.ok, r.error ?? ""]).toEqual([true, ""]);
          expect(r.events.length).toBeGreaterThan(0);
          expect(r.cpsSet).toBe(true);
          expect(r.logs.filter((x) => BAD_LOG.test(x))).toEqual([]);
          const errors = lint(l.hook.code, {
            session: l.id as SessionId,
            meter: l.meter,
            key: l.key,
            allowPreview: Boolean(l.hook.preview) || preview,
          }).diagnostics.filter((d) => d.severity === "error");
          expect(errors.map((d) => `${d.id} ${d.message}`)).toEqual([]);
          expect(m).toBeDefined();
        });
      });
  });
