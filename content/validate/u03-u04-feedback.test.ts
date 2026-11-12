// What a learner reads after a plausible wrong attempt in U03–U04, run through the real grader. Each case is
// an attempt a beginner makes (a key a step off, a held note played twice, a quality left off) whose
// feedback once named something the course had not taught yet: chromatic degrees and syllables ("degree
// #4", "b3 (me)") before U05, "semitones" where the course says half steps, a tool's raw card text or "1×",
// "Listen to both" on a staff item. The checks hold the words to what the learner knows at that step.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { CheckpointDef, Exercise, LessonDef, SessionId, TestResponse } from "@oak/content-kit";
import { checkpoint as U03CP } from "../core/U03/CP/checkpoint.ts";
import U03L01 from "../core/U03/L01/lesson.ts";
import U03L02 from "../core/U03/L02/lesson.ts";
import U03L06 from "../core/U03/L06/lesson.ts";
import U03L08 from "../core/U03/L08/lesson.ts";
import U03L09 from "../core/U03/L09/lesson.ts";
import { checkpoint as U04CP } from "../core/U04/CP/checkpoint.ts";
import U04L02 from "../core/U04/L02/lesson.ts";
import { grade } from "./harness.ts";

setDefaultTimeout(60_000);

/** The lesson fields the grader reads; a checkpoint is graded in its Make's key and tempo. */
type Host = { id: string; lesson: LessonDef; exercises: Exercise[] };
const lesson = (l: LessonDef): Host => ({
  id: l.id,
  lesson: l,
  exercises: l.steps.flatMap((s) => (s.exercise ? [s.exercise] : [])),
});
const cp = (c: CheckpointDef): Host => {
  const make = c.make as { key?: LessonDef["key"]; bpm?: number };
  const host = {
    id: c.id,
    key: make.key ?? { tonic: "C", mode: "major" },
    meter: "4/4",
    bpm: make.bpm ?? 96,
  };
  return { id: c.id, lesson: host as unknown as LessonDef, exercises: [...c.authored, c.make] };
};

/** A chromatic degree or syllable as the catalog prints it: "#4", "b3", "(me)", "(fi)". */
const CHROMATIC = /(^|[\s(])[#b][1-7]\b|\((ra|me|fi|le|te|di|ri|si|li)\)/;
/**
 * Words and marks the course never uses with a learner, and the catalog's bare lines ("extra note 3", "note 1
 * missing", a beat such as "1+4/7") that say where but not why.
 */
const RAW =
  /semitone|\d×|tb\.[a-z]|mini-notation|Listen to both|\{|undefined|NaN|extra note \d|note \d missing|\d\+\d+\/\d/;

const T84 = "setcpm(84/4)\n\n";
const T88 = "setcpm(88/4)\n\n";
const T92 = "setcpm(92/4)\n\n";
const T96 = "setcpm(96/4)\n\n";
const n = (t: string, p: string, key: string) => `${t}mel: n("${p}").scale("${key}").s("piano")`;

const CASES: { host: Host; ex: string; name: string; response: TestResponse; code: string }[] = [
  {
    host: lesson(U03L02),
    ex: "home-is-g",
    name: "home on F, a step below G",
    response: { code: n(T84, "<[2 2 3 4] [4 3 2 1]>", "F4:major") },
    code: "melody.wrong-degree",
  },
  {
    host: lesson(U03L02),
    ex: "home-is-g",
    name: "home on A, a step above G",
    response: { code: n(T84, "<[2 2 3 4] [4 3 2 1]>", "A4:major") },
    code: "melody.wrong-degree",
  },
  {
    host: lesson(U03L01),
    ex: "build-g-major",
    name: "C sharpened instead of F",
    response: { code: `${T84}mel: note("g4 a4 b4 c#5 d5 e5 f5 g5").s("piano")` },
    code: "melody.wrong-degree",
  },
  {
    host: lesson(U03L06),
    ex: "page-in-g",
    name: "the held note played twice",
    response: { code: n(T88, "<[4 6 7 4] [5 4 2 2]>", "G4:major") },
    code: "melody.extra-note",
  },
  {
    host: lesson(U03L06),
    ex: "every-f-sharp",
    name: "no F♯ at all, and an F natural",
    response: { code: `${T88}mel: note("<[d5 b4 a4 f4] [g4 a4 b4 g4]>").s("piano")` },
    code: "rubric.unmet",
  },
  {
    host: lesson(U03L08),
    ex: "a-line-to-sing",
    name: "the starter, over an octave wide",
    response: { code: n("setcpm(80/4)\n\n", "<[0 4 7 9] [7 4 2 0]>", "C4:major") },
    code: "rubric.unmet",
  },
  {
    host: lesson(U03L09),
    ex: "saints-by-number",
    name: "the rest dropped, the held 5 squeezed into bar 1",
    response: { code: n(T92, "<[0 2 3 4@4] [0 2 3 4@4]>", "C4:major") },
    code: "melody.extra-note",
  },
  {
    host: lesson(U04L02),
    ex: "name-the-distance",
    name: "a minor 3rd",
    response: {
      code: `${T92}mel: note("<[c4 g4 f4 g4] [c4 ~ f4 g4]>").s("piano")\nvox: note("<[c4 g4 f4 g4] [c4 ~ f4 g4]>").transpose("3m").s("piano").gain(.6)`,
    },
    code: "melody.wrong-degree",
  },
  {
    host: cp(U04CP),
    ex: "name-the-quality",
    name: "a 5th called major",
    response: { answer: { text: ["M3", "M5", "TT"] } },
    code: "id.wrong",
  },
  {
    host: cp(U04CP),
    ex: "name-the-quality",
    name: "numbers without qualities",
    response: { answer: { text: ["3", "5", "4"] } },
    code: "id.wrong",
  },
  {
    host: cp(U04CP),
    ex: "checkpoint-duet",
    name: "one voice only",
    response: { code: n(T96, "<[0 2 4 2] [3 5 4 ~]>", "C4:major") },
    code: "rubric.unmet",
  },
  {
    host: cp(U03CP),
    ex: "tune-in-d",
    name: "one note a step high",
    response: { code: n(T96, "<[0 2 4 2] [3 2 0 ~]>", "D4:major") },
    code: "melody.wrong-degree",
  },
];

describe("U03–U04 feedback after a plausible wrong attempt uses only what the learner has been taught", () => {
  for (const c of CASES)
    test(`${c.host.id} ${c.ex}: ${c.name}`, async () => {
      const ex = c.host.exercises.find((e) => e.id === c.ex);
      if (!ex) throw new Error(`${c.host.id}: no exercise ${c.ex}`);
      const r = await grade(
        ex,
        { name: c.name, response: c.response, expect: "fail" },
        c.host.lesson,
        c.host.id as SessionId,
      );
      expect(r.passed).toBe(false);
      expect(r.feedback).toContain(c.code);
      for (const m of r.messages ?? []) {
        expect(m).not.toMatch(CHROMATIC);
        expect(m).not.toMatch(RAW);
      }
    });
});
