// Test support (not a test file): the REAL course (content/: syllabus, toolbox, skills, families, decks,
// terms, can-dos, checkpoints, capstones and every authored lesson) with a stand-in for each syllabus lesson
// whose lesson file is not written yet, so a scenario can walk the default order past U01.L01 while the
// authors write U01–U02. A stand-in has the syllabus row's skills, one graded modify step with a four-rung
// hint ladder, and a Make; its title says what it is.
import { join } from "node:path";
import type { Exercise, LessonDef, LessonMeta, StepDef, UnitDef } from "@oak/content-kit";
import { loadContent } from "../content/loader.ts";
import type { ContentSource } from "../content/types.ts";

export const CONTENT_DIR = join(import.meta.dir, "..", "..", "..", "content");

const UI: StepDef["ui"] = { panels: { roll: true, staff: false, keyboard: false } };

/** The lesson a stand-in replaces: the syllabus row, shaped as a minimal lesson. */
export function standInLesson(meta: LessonMeta, unit: UnitDef): LessonDef {
  const skills = [...meta.introduces, ...meta.practises];
  const skill = skills[0] ?? "R02";
  const ex = (kind: "code-modify" | "code-make", id: string): Exercise =>
    ({
      kind,
      id,
      version: 1,
      role: kind === "code-make" ? "make" : "check",
      prompt: `${meta.title}: ${id}.`,
      skills: (skills.length === 0 ? [skill] : skills).map((s) => ({ skill: s, w: 1 })),
      hints:
        kind === "code-make"
          ? null
          : [{ text: "Listen first." }, { text: "Look at bar 1." }, { text: "Change one value." }, "auto"],
      tests: [],
      starter: 's("bd sd")',
      ...(kind === "code-make"
        ? {
            rubric: [
              { id: "plays", label: "It plays", required: true, skills: [skill], rule: "min-bars", bars: 1 },
            ],
          }
        : { reference: { solutions: ['s("bd ~ sd ~")'] }, matcher: { kind: "events" } }),
    }) as unknown as Exercise;
  return {
    id: meta.id,
    version: 1,
    title: `${meta.title} (stand-in)`,
    objective: meta.objective,
    key: { tonic: "C", mode: "major" },
    meter: unit.meter ?? "4/4",
    bpm: 96,
    introduces: [...meta.introduces],
    practises: [...meta.practises],
    terms: [],
    canDo: [],
    wrapAt: "S2" as LessonDef["wrapAt"],
    steps: [
      { id: "S1", kind: "listen", title: "Listen", minutes: 0.5, ui: UI } as StepDef,
      {
        id: "S2",
        kind: "modify",
        title: "Change it",
        minutes: 2,
        ui: UI,
        graded: true,
        exercise: ex("code-modify", "change-it"),
      } as StepDef,
      {
        id: "S3",
        kind: "make",
        title: "Make",
        minutes: 3,
        ui: UI,
        exercise: ex("code-make", "make"),
      } as StepDef,
    ],
  };
}

/** The real content with stand-ins for the core lessons up to `through` (default: all of U00–U03). */
export async function realCourse(opts: { standInUnits?: readonly string[] } = {}): Promise<ContentSource> {
  const content = await loadContent({ contentDir: CONTENT_DIR });
  const units = new Set(opts.standInUnits ?? ["U00", "U01", "U02", "U03", "U04"]);
  const authored = new Set(content.lessons.map((l) => l.id as string));
  const standIns: LessonDef[] = [];
  for (const unit of content.syllabus.units)
    if (units.has(unit.id))
      for (const meta of unit.lessons) if (!authored.has(meta.id)) standIns.push(standInLesson(meta, unit));
  return { ...content, lessons: [...content.lessons, ...standIns] };
}
