// Whole-course checks for the first playable (U00–U02, U01.CP, U02.CP, C0, C1). `content:check` judges one
// lesson at a time; these judge the lessons as one course read in the default order of contracts §2.5:
// nothing is missing, IDs are locked, terms and can-dos are introduced once by the lesson the registries
// name, no prose names a later lesson's term or tool, every exercise's skills and drill families are open
// in every legal order, budgets hold, and what plays over the Band does not grate against its chords.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  countTerms,
  type Exercise,
  flattenExercise,
  lessonBudget,
  type SessionId,
  stripMarkers,
} from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { bandById, bandMeter } from "../bands/index.ts";
import { candos } from "../candos.ts";
import { capstones } from "../capstones.ts";
import { familyById } from "../families.ts";
import { courseGraph, registries } from "../index.ts";
import { atOrBefore } from "../lib/course.ts";
import { CONTENT_ROOT, type LoadedLesson, loadCheckpointFiles, loadLessons } from "../lib/load.bun.ts";
import { milestones } from "../milestones.ts";
import { termById } from "../terms.ts";
import { toolbox } from "../toolbox.ts";
import { exerciseTexts, lessonAuthoring, mdxSteps } from "./authoring.ts";
import { ONBOARDING_PREVIEW, unlockedFor } from "./harness.ts";

/** The first playable: every core session of the default order up to C1.S1 (sessions 1–24), less U03.L01. */
const ORDER = registries.syllabus.defaultOrder as readonly SessionId[];
const FIRST_PLAYABLE = ORDER.slice(0, ORDER.indexOf("C1.S1" as SessionId) + 1).filter(
  (s) => !s.startsWith("U03."),
);
const LESSONS = FIRST_PLAYABLE.filter((s) => /\.L\d{2}$/.test(s));

const { lessons: loaded, errors } = await loadLessons();
const byId = new Map(loaded.filter((l) => !l.sample).map((l) => [l.def.id as string, l]));
const course = LESSONS.map((id) => byId.get(id)).filter((l): l is LoadedLesson => Boolean(l));
const g = courseGraph();
const exercisesOf = (l: LoadedLesson) =>
  l.def.steps.flatMap((s) => (s.exercise ? flattenExercise(s.exercise).map((e) => ({ s, e })) : []));

describe("the first playable is complete (contracts §2.3–§2.5)", () => {
  test("the default order starts U00.L01 … U02.CP, C1.S1 as §2.5 prints it", () => {
    expect(ORDER.slice(0, 24)).toEqual([
      ...["U00.L01", "U00.L02"],
      ...["U01.L01", "U01.L02", "U01.L03", "U01.L04", "U01.L05", "U01.L06", "U01.L07", "U01.L08", "U01.L09"],
      ...["U02.L01", "U01.CP", "C0.S1", "U02.L02", "U02.L03", "U02.L04", "U02.L05", "U02.L06", "U02.L07"],
      ...["U02.L08", "U03.L01", "U02.CP", "C1.S1"],
    ] as SessionId[]);
  });
  test("every lesson of U00–U02 is authored and loads", () => {
    expect(errors.filter((e) => e.folderId && LESSONS.includes(e.folderId as SessionId))).toEqual([]);
    expect(LESSONS.filter((id) => !byId.has(id))).toEqual([]);
    expect(LESSONS.length).toBe(19);
  });
  test("both checkpoints have their authored items, and C0 and C1 have tested briefs", async () => {
    const { defs } = await loadCheckpointFiles();
    expect(defs.map((d) => d.id as string).sort()).toEqual(expect.arrayContaining(["U01.CP", "U02.CP"]));
    for (const id of ["C0", "C1"]) {
      const c = capstones.find((x) => x.id === id);
      expect([id, Boolean(c), (c?.brief?.tests ?? []).length >= 4]).toEqual([id, true, true]);
    }
  });
});

describe("IDs (contracts §1.1, §11.7)", () => {
  const lock = new Set(
    (
      JSON.parse(readFileSync(join(CONTENT_ROOT, "ids.lock.json"), "utf8")) as { ids: { id: string }[] }
    ).ids.map((x) => x.id),
  );
  test("every lesson, step, example and exercise ID of the first playable is in ids.lock.json", () => {
    const missing: string[] = [];
    for (const l of course) {
      if (!lock.has(l.def.id)) missing.push(l.def.id);
      for (const s of l.def.steps) {
        if (!lock.has(`${l.def.id}/${s.id}`)) missing.push(`${l.def.id}/${s.id}`);
        if (s.example && !lock.has(`${l.def.id}@${s.example.id}`))
          missing.push(`${l.def.id}@${s.example.id}`);
      }
      for (const { e } of exercisesOf(l))
        if (!lock.has(`${l.def.id}/${e.id}`)) missing.push(`${l.def.id}/${e.id}`);
    }
    expect(missing).toEqual([]);
  });
  test("exercise IDs are unique inside a lesson; step IDs are S1, S2, … in order", () => {
    for (const l of course) {
      const ids = exercisesOf(l).map(({ e }) => e.id);
      expect([l.def.id, ids.length]).toEqual([l.def.id, new Set(ids).size]);
      const stepIds: string[] = l.def.steps.map((s) => s.id);
      expect([l.def.id, ...stepIds]).toEqual([l.def.id, ...stepIds.map((_, i) => `S${i + 1}`)]);
    }
  });
});

describe("vocabulary across lesson boundaries (AUTHORING §7)", () => {
  test("every term of U00–U02 is declared once, by the lesson the glossary names, both halves of a pair", () => {
    const declaredBy = new Map<string, string[]>();
    for (const l of course)
      for (const t of l.def.terms) declaredBy.set(t.id, [...(declaredBy.get(t.id) ?? []), l.def.id]);
    const problems: string[] = [];
    for (const t of registries.terms) {
      if (!LESSONS.includes(t.introducedBy as SessionId)) continue;
      const by = declaredBy.get(t.id) ?? [];
      if (by.length !== 1 || by[0] !== t.introducedBy)
        problems.push(`${t.id}: glossary says ${t.introducedBy}, declared by [${by.join(" ")}]`);
    }
    for (const [id, by] of declaredBy)
      if (termById.get(id)?.introducedBy !== by[0]) problems.push(`${id}: declared by ${by.join(" ")}`);
    expect(problems).toEqual([]);
  });
  test("no lesson introduces more than three terms, counting a pair once", () => {
    for (const l of course)
      expect([l.def.id, countTerms(l.def.terms, registries.terms) <= 3]).toEqual([l.def.id, true]);
  });
  // A later lesson's term in an earlier lesson's text is advice in content:check (many are plain English).
  // Read as one course, each one is either reworded or listed here with the reason it stays.
  const ALLOWED_LATER_TERMS: Record<string, string> = {
    'U01.L05 S2 prose "staff"':
      "the percussion staff is U01.L05's own subject (contracts §2.3); U02.L04 S3 ties the word back to it",
  };
  test("no lesson uses a later lesson's term unless it is listed with its reason", () => {
    const found: string[] = [];
    for (const l of course)
      for (const w of lessonAuthoring(l.def, l.mdxSource).warnings) {
        const m = w.match(/^(\S+ [a-z ]+?\d*): "([^"]+)" is a term of/);
        if (m) found.push(`${l.def.id} ${m[1]} "${m[2]}"`);
      }
    expect(found.filter((f) => !(f in ALLOWED_LATER_TERMS))).toEqual([]);
    expect(Object.keys(ALLOWED_LATER_TERMS).filter((k) => !found.includes(k))).toEqual([]);
  });
});

describe("unlock-before-use across lesson boundaries (contracts §3.1)", () => {
  const byName = new Map<string, string[]>();
  for (const t of toolbox) for (const m of t.matches ?? []) byName.set(m, [...(byName.get(m) ?? []), t.id]);
  test("prose, prompts, hints and labels name only tools and sounds the learner has at that lesson", () => {
    const locked: string[] = [];
    for (const l of course) {
      if (ONBOARDING_PREVIEW.has(l.def.id)) continue; // U00 is a preview context (§3.1 rule 5a)
      const open = unlockedFor(l.def.id as SessionId);
      const mdx = mdxSteps(l.mdxSource ?? "");
      for (const s of l.def.steps) {
        const texts = [
          { where: `${s.id} title`, text: s.title },
          ...(s.exercise ? exerciseTexts(s.exercise, s.id) : []),
          { where: `${s.id} prose`, text: `${mdx.get(s.id)?.prose ?? ""}\n${mdx.get(s.id)?.onPass ?? ""}` },
        ];
        for (const t of texts)
          for (const m of t.text.matchAll(/`([^`]+)`/g))
            for (const name of (m[1] as string).match(/[A-Za-z_]\w*/g) ?? []) {
              const ids = byName.get(name);
              if (ids && !ids.some((id) => open.has(id as never)))
                locked.push(`${l.def.id} ${t.where}: \`${m[1]}\` names ${ids.join("/")}`);
            }
      }
    }
    expect(locked).toEqual([]);
  });
  test("every exercise's skills are introduced at or before its lesson, in every legal order", () => {
    const late: string[] = [];
    for (const l of course)
      for (const { s, e } of exercisesOf(l))
        for (const sk of e.skills) {
          const node = registries.skills.find((x) => x.id === sk.skill.split("/")[0]);
          if (node && !atOrBefore(g, node.introducedBy, l.def.id as SessionId))
            late.push(`${l.def.id}/${s.id}/${e.id}: ${sk.skill} arrives in ${node.introducedBy}`);
        }
    expect(late).toEqual([]);
  });
  test("every drill family a lesson seeds, reviews or draws a stimulus from is open there", () => {
    const late: string[] = [];
    for (const l of course)
      for (const { s, e } of exercisesOf(l)) {
        const fams = [
          ...(e.srs ?? []).flatMap((x) => (x.family ? [{ id: x.family, level: 1 }] : [])),
          ...("stimulus" in e && e.stimulus?.src === "generator"
            ? [{ id: e.stimulus.family, level: e.stimulus.level }]
            : []),
        ];
        for (const f of fams) {
          const def = familyById.get(f.id);
          if (!def) continue;
          const gate = def.unlock.levelGates?.[f.level] ?? def.unlock.lesson;
          const gates = Array.isArray(gate) ? gate : [gate];
          if (!gates.some((x) => atOrBefore(g, x as SessionId, l.def.id as SessionId)))
            late.push(`${l.def.id}/${s.id}/${e.id}: ${f.id} level ${f.level} opens at ${gates.join("/")}`);
        }
      }
    expect(late).toEqual([]);
  });
});

describe("can-dos and milestones", () => {
  test("each can-do of U00–U02 is awarded once, by the lesson the registry names", () => {
    const problems: string[] = [];
    for (const c of candos) {
      if (!LESSONS.includes(c.source as SessionId)) continue;
      const by = course.filter((l) => (l.def.canDo as string[]).includes(c.id)).map((l) => l.def.id);
      if (by.join() !== c.source) problems.push(`${c.id}: source ${c.source}, awarded by [${by.join(" ")}]`);
    }
    expect(problems).toEqual([]);
  });
  test("every milestone condition names a real session, capstone or can-do", () => {
    const sessions = new Set<string>(ORDER);
    for (const m of milestones) {
      for (const s of m.when.sessions ?? []) expect([m.id, s, sessions.has(s)]).toEqual([m.id, s, true]);
      for (const c of m.when.capstones ?? [])
        expect([m.id, c, capstones.some((x) => x.id === c)]).toEqual([m.id, c, true]);
      for (const c of m.when.canDos ?? [])
        expect([m.id, c, candos.some((x) => x.id === c)]).toEqual([m.id, c, true]);
    }
  });
});

describe("session budget and shape (contracts §9)", () => {
  test("each lesson fits the 20-minute target and splits cleanly at 15 minutes", () => {
    for (const l of course) {
      const b = lessonBudget(l.def);
      expect([
        l.def.id,
        b.scaledMinutes <= 13,
        b.partAScaled <= 8.5,
        b.partBScaled <= 9.5,
        b.gradedChecks <= 3,
      ]).toEqual([l.def.id, true, true, true, true]);
    }
  });
  test("every graded step has a four-rung hint ladder", () => {
    for (const l of course)
      for (const s of l.def.steps.filter((x) => x.graded && x.exercise))
        for (const e of flattenExercise(s.exercise as Exercise))
          expect([l.def.id, s.id, e.id, e.hints?.length ?? 0]).toEqual([l.def.id, s.id, e.id, 4]);
  });
  test("each Make's required rule practises the lesson's own idea", () => {
    for (const l of course) {
      const make = l.def.steps.at(-1)?.exercise;
      const req = make && "rubric" in make ? make.rubric.find((r) => r.required) : undefined;
      const own = new Set<string>([...l.def.introduces, ...l.def.practises]);
      expect([l.def.id, (req?.skills ?? []).some((sk) => own.has(sk))]).toEqual([l.def.id, true]);
    }
  });
  test("U02 has a Play from the page step: a modify or dictate step with the staff and no roll (§9.2 rule 8)", () => {
    const u02 = course.filter((l) => l.def.id.startsWith("U02."));
    const pages = u02.flatMap((l) =>
      l.def.steps
        .filter(
          (s) => (s.kind === "modify" || s.kind === "dictate") && s.ui.panels?.staff && !s.ui.panels?.roll,
        )
        .map((s) => `${l.def.id}/${s.id}`),
    );
    expect(pages.length).toBeGreaterThan(0);
  });
});

// What plays over the Band. A learner note a half step above a Band note sounding at the same time, held for
// a beat or more, is the harshest clash there is (a minor ninth). Shown examples and reference solutions
// must not do it, except a passing note on the way somewhere, listed here with its reason.
const ALLOWED_CLASHES: Record<string, string> = {
  "U02.L03 hook f4@1":
    "the chromatic creep e f f# g passes through F on its way to G; the creep is the point",
  "U02.L08 hook f4@2": "Ode to Joy's own passing F in bar 1 (e e f g)",
  "U02.L08 your-arrangement:starter f4@2": "the Make starts from that same Ode to Joy opening",
};
describe("music over the Band", () => {
  test("no shown example or reference sounds a half step above the Band's chord for a beat", async () => {
    const found: string[] = [];
    for (const l of course) {
      const beats = Number(l.def.meter.split("/")[0]);
      const key = `${l.def.key.tonic}4:${l.def.key.mode}`;
      const band = l.def.steps.find((s) => s.ui.band)?.ui.band;
      const b = band ? bandById.get(band.band) : undefined;
      if (!b || bandMeter(b.id) !== l.def.meter) continue;
      const harmony = (b.code["flavour.pop"] ?? "")
        .replaceAll("{{key}}", key)
        .split("\n")
        .filter((ln) => /^(bass|chords):/.test(ln))
        .map((ln) => `band_${ln}`)
        .join("\n");
      for (const s of l.def.steps) {
        if (!s.ui.band) continue; // the Band plays only where the step declares it
        const shown: { id: string; code: string }[] = [];
        if (s.example) shown.push({ id: s.example.id, code: s.example.code });
        for (const e of s.exercise ? flattenExercise(s.exercise) : []) {
          if ("reference" in e && e.reference?.solutions?.[0])
            shown.push({ id: e.id, code: e.reference.solutions[0] });
          if (e.kind === "code-make")
            shown.push({ id: `${e.id}:starter`, code: stripMarkers(e.code.starter).code });
        }
        for (const c of shown) {
          const r = await evalHeadless(`${c.code}\n${harmony}`, Number(b.bars) * 2);
          const backing = r.events.filter((e) => e.track.startsWith("band_") && e.midi !== null);
          for (const n of r.events.filter((e) => !e.track.startsWith("band_") && e.midi !== null)) {
            const [b0, b1] = [frac(n.begin), frac(n.end)];
            if ((b1 - b0) * beats < 1) continue;
            const hit = backing.some(
              (x) =>
                frac(x.begin) < b1 &&
                frac(x.end) > b0 &&
                ((((n.midi as number) - (x.midi as number)) % 12) + 12) % 12 === 1,
            );
            if (hit) found.push(`${l.def.id} ${c.id} ${n.note}@${(b0 * beats) % (beats * Number(b.bars))}`);
          }
        }
      }
    }
    const unique = [...new Set(found)];
    expect(unique.filter((f) => !(f in ALLOWED_CLASHES))).toEqual([]);
    expect(Object.keys(ALLOWED_CLASHES).filter((k) => !unique.includes(k))).toEqual([]);
  }, 60_000);
});

function frac(s: string): number {
  const [a, b] = s.split("/").map(Number);
  return b ? (a as number) / b : (a as number);
}
