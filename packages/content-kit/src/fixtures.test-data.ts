// Shared fixtures for the content-kit tests: the skeleton lesson of content/AUTHORING.md §8, completed so
// that it is a whole lesson.
import type { HintLadder, LessonDef, StepUi } from "./schema/index.ts";

export const ui: StepUi = { panels: { roll: true, staff: false, keyboard: false } };
export const ladder: HintLadder = [
  { text: "If you delete a word, what happens to the other three?" },
  { text: "The third word is beat 3. Silence has its own symbol." },
  { text: 'A rest is written `~`. In `s("hh ~ hh hh")` it is beat 2 that stays silent.' },
  "auto",
];

export function lessonU01L02(): LessonDef {
  return {
    id: "U01.L02",
    version: 1,
    title: "Count to Four",
    objective: "I can find beat 1, count a bar of four, and use a rest as part of a rhythm.",
    key: { tonic: "C", mode: "major" },
    meter: "4/4",
    bpm: 96,
    introduces: ["R06"],
    practises: ["R03"],
    terms: [
      { id: "term.downbeat", step: "S2" },
      { id: "term.rest", step: "S4" },
    ],
    canDo: ["cd.read.count-four"],
    wrapAt: "S4",
    steps: [
      {
        id: "S1",
        kind: "listen",
        title: "Where is one?",
        minutes: 0.5,
        ui,
        exercise: {
          kind: "listen",
          id: "where-is-one",
          version: 1,
          role: "practice",
          prompt: "Press Play and count along.",
          skills: [{ skill: "R03", w: 1 }],
          hints: null,
          tests: [],
          items: [
            { code: 'setcpm(96/4)\n\ndrums: s("cr hh hh hh")', caption: "The crash marks beat 1.", bars: 2 },
          ],
        },
      },
      {
        id: "S2",
        kind: "predict",
        title: "How many?",
        minutes: 0.5,
        ui,
        exercise: {
          kind: "predict",
          id: "count-hits",
          version: 1,
          role: "practice",
          prompt: "How many hits will you hear in one bar?",
          skills: [{ skill: "R03", w: 1 }],
          hints: null,
          tests: [],
          code: 'setcpm(96/4)\n\ndrums: s("bd bd bd bd")',
          bars: 1,
          mode: "count",
          correct: 4,
        },
      },
      { id: "S3", kind: "concept", title: "A bar of four", minutes: 1, ui },
      {
        id: "S4",
        kind: "modify",
        title: "Leave a hole",
        minutes: 1.5,
        graded: true,
        ui,
        exercise: {
          kind: "code-modify",
          id: "rest-on-three",
          version: 1,
          role: "check",
          prompt: "Make beat **3** silent. Keep the bar four beats long.",
          skills: [{ skill: "R06", w: 1 }],
          code: { starter: 'setcpm(96/4)\n\ndrums: s("⟪bd bd bd bd⟫")' },
          reference: { solutions: ['setcpm(96/4)\n\ndrums: s("bd bd ~ bd")'], bars: 1 },
          matcher: { m: "rhythm", tol: [0, 1], durations: false, perRole: false, displacementCredit: 0.5 },
          constraints: [{ c: "must-use", tool: "tb.mini.rest" }, { c: "edit-only-regions" }],
          target: { audible: true },
          hints: ladder,
          srs: [{ family: "fam.code.mini", mode: "review-if-due" }],
          tests: [
            {
              name: "reference",
              response: { code: 'setcpm(96/4)\n\ndrums: s("bd bd ~ bd")' },
              expect: "pass",
            },
            {
              name: "other sound, same rhythm",
              response: { code: 'setcpm(96/4)\n\ndrums: s("bd sd ~ sd")' },
              expect: "pass",
            },
            {
              name: "unchanged",
              response: { code: 'setcpm(96/4)\n\ndrums: s("bd bd bd bd")' },
              expect: "fail",
              feedback: ["code.unchanged"],
            },
            {
              name: "rest on beat 2",
              response: { code: 'setcpm(96/4)\n\ndrums: s("bd ~ bd bd")' },
              expect: "fail",
              feedback: ["rhythm.displaced"],
            },
            {
              name: "deleted a word instead",
              response: { code: 'setcpm(96/4)\n\ndrums: s("bd bd bd")' },
              expect: "fail",
              feedback: ["rhythm.subdivision"],
            },
          ],
        },
      },
      {
        id: "S7",
        kind: "make",
        title: "A groove with air in it",
        minutes: 2.5,
        ui: { ...ui, band: { band: "band.two-chord-vamp" } },
        exercise: {
          kind: "code-make",
          id: "groove-with-rests",
          version: 1,
          role: "practice",
          saveAs: "sketch",
          bars: [1, 2],
          prompt: "Write a one-bar groove with **at least one rest**. Any of your drum sounds.",
          skills: [{ skill: "R06", w: 1 }],
          code: { starter: 'setcpm(96/4)\n\ndrums: s("bd ~ sd hh")' },
          rubric: [
            {
              id: "has-rest",
              label: "Uses at least one rest",
              required: true,
              skills: ["R06"],
              rule: "uses",
              tool: "tb.mini.rest",
            },
            {
              id: "downbeat",
              label: "Something lands on beat 1",
              required: false,
              skills: ["R03"],
              rule: "onsets",
              track: "@drums",
              contains: [[0, 1]],
              perBar: true,
            },
          ],
          hints: [
            { text: "Where could the groove breathe?" },
            { text: "Swap one word for `~`." },
            { text: "Try a rest on beat 2 or beat 4." },
            "auto",
          ],
          tests: [
            { name: "minimal", response: { code: 'setcpm(96/4)\n\ndrums: s("bd ~ sd hh")' }, expect: "pass" },
            {
              name: "beyond the brief",
              response: {
                code: 'setcpm(110/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*4")',
              },
              expect: "pass",
            },
            {
              name: "no rest",
              response: { code: 'setcpm(96/4)\n\ndrums: s("bd hh sd hh")' },
              expect: "fail",
              feedback: ["rubric.unmet"],
            },
          ],
        },
      },
    ],
  };
}

/** A structured clone that tests may mutate freely. */
export function mutable<T>(value: T): T {
  return structuredClone(value);
}
