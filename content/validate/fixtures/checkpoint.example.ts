// A worked checkpoint for the tooling tests and the template of AUTHORING §10: three authored items, the
// generator recipe and the checkpoint Make for U01.CP. The real file is content/core/U01/CP/checkpoint.ts
// (owned by its author); this copy lives under validate/ so the checker always has a known-good input.
import { type CheckpointDef, defineCheckpoint } from "@oak/content-kit";

const T = (bpm: number) => `setcpm(${bpm}/4)\n\n`;

export const exampleCheckpoint: CheckpointDef = defineCheckpoint({
  id: "U01.CP",
  title: "Rhythm I checkpoint",
  covers: ["U01"],
  gated: ["R02", "R03", "R04", "R05", "R06", "R07", "R08", "N01"],
  levelSetting: ["R01", "E01"],
  version: 1,
  authored: [
    {
      kind: "code-modify",
      id: "tempo-and-rest",
      version: 1,
      role: "checkpoint",
      prompt: "Set the tempo to **104** and make beat 3 silent. Keep the bar four beats long.",
      skills: [
        { skill: "R02", w: 0.4 },
        { skill: "R06", w: 0.4 },
        { skill: "R03", w: 0.2 },
      ],
      hints: null,
      code: { starter: `setcpm(⟪90⟫/4)\n\ndrums: s("⟪bd sd bd sd⟫")` },
      reference: { solutions: [`${T(104)}drums: s("bd sd ~ sd")`], bars: 1 },
      matcher: { m: "rhythm", tol: [0, 1], durations: false, perRole: false, displacementCredit: 0.5 },
      constraints: [{ c: "tempo", bpm: 104 }],
      target: { audible: true },
      tests: [
        { name: "reference", response: { code: `${T(104)}drums: s("bd sd ~ sd")` }, expect: "pass" },
        { name: "other sounds", response: { code: `${T(104)}drums: s("bd cp ~ cp")` }, expect: "pass" },
        {
          name: "unchanged",
          response: { code: `${T(90)}drums: s("bd sd bd sd")` },
          expect: "fail",
          feedback: ["code.unchanged"],
        },
        {
          name: "rest, old tempo",
          response: { code: `${T(90)}drums: s("bd sd ~ sd")` },
          expect: "fail",
          feedback: ["code.tempo"],
        },
        {
          name: "deleted a word",
          response: { code: `${T(104)}drums: s("bd sd sd")` },
          expect: "fail",
          feedback: ["rhythm.missing"],
        },
      ],
    },
    {
      kind: "code-modify",
      id: "backbeat-lines",
      version: 1,
      role: "checkpoint",
      prompt: "Finish the backbeat on three lines: kick on 1 and 3, snare on 2 and 4, hats on every eighth.",
      skills: [
        { skill: "R04", w: 0.6 },
        { skill: "R05", w: 0.4 },
      ],
      hints: null,
      code: { starter: `${T(100)}kick: s("⟪bd ~ ~ ~⟫")` },
      reference: {
        solutions: [`${T(100)}kick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")`],
        bars: 1,
      },
      matcher: { m: "rhythm", tol: [0, 1], durations: false, perRole: true, displacementCredit: 0.5 },
      constraints: [{ c: "labels", min: 3 }],
      target: { audible: true },
      tests: [
        {
          name: "reference",
          response: { code: `${T(100)}kick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")` },
          expect: "pass",
        },
        {
          name: "brackets for the hats",
          response: { code: `${T(100)}kick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("[hh hh]*4")` },
          expect: "pass",
        },
        {
          name: "unchanged",
          response: { code: `${T(100)}kick: s("bd ~ ~ ~")` },
          expect: "fail",
          feedback: ["code.unchanged"],
        },
        {
          name: "snare on 1 and 3",
          response: { code: `${T(100)}kick: s("bd ~ bd ~")\nsnare: s("sd ~ sd ~")\nhats: s("hh*8")` },
          expect: "fail",
          feedback: ["rhythm.displaced"],
        },
        {
          name: "one line",
          response: { code: `${T(100)}drums: s("bd sd bd sd")` },
          expect: "fail",
          feedback: ["code.labels"],
        },
      ],
    },
    {
      kind: "fact",
      id: "eighths-in-a-half",
      version: 1,
      role: "checkpoint",
      prompt: "How many eighth notes last as long as one half note?",
      skills: [{ skill: "N01", w: 1 }],
      hints: null,
      answer: { ui: "number" },
      correct: { number: 4 },
      spelling: "strict",
      order: "set",
      tests: [
        { name: "four", response: { answer: { number: 4 } }, expect: "pass" },
        { name: "two", response: { answer: { number: 2 } }, expect: "fail" },
      ],
    },
  ],
  recipe: {
    items: [12, 16],
    perSkillMin: 2,
    families: {
      R05: ["fam.rhy.count"],
      R07: ["fam.rhy.count"],
      R08: ["fam.rhy.meter"],
      N01: ["fam.rhy.read"],
      R01: ["fam.rhy.pulse"],
      E01: ["fam.rhy.echo", "fam.rhy.dictation"],
    },
  },
  make: {
    kind: "code-make",
    id: "checkpoint-groove",
    version: 1,
    role: "checkpoint",
    prompt: "A two-bar groove with everything from this unit you like. Keep the backbeat.",
    skills: [{ skill: "R04", w: 1 }],
    hints: null,
    code: { starter: `${T(100)}kick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")` },
    bars: [2, 4],
    saveAs: "sketch",
    rubric: [
      {
        id: "backbeat",
        label: "Snare on beats 2 and 4",
        required: true,
        skills: ["R04"],
        rule: "onsets",
        track: "@drums",
        drum: "snare",
        contains: [
          [1, 4],
          [3, 4],
        ],
        perBar: true,
      },
      {
        id: "two-bars",
        label: "Two bars, with `< >`",
        required: false,
        skills: ["R03"],
        rule: "uses",
        tool: "tb.mini.alt",
      },
    ],
    tests: [
      {
        name: "minimal",
        response: { code: `${T(100)}kick: s("bd ~ [~ bd] ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")` },
        expect: "pass",
      },
      {
        name: "beyond the brief",
        response: {
          code: `${T(112)}kick: s("<[bd ~ bd ~] [bd ~ [~ bd] ~]>")\nsnare: s("~ sd ~ sd")\nhats: s("<hh*8 [hh*6 oh ~]>")`,
        },
        expect: "pass",
      },
      {
        name: "snare on the wrong beats",
        response: { code: `${T(100)}kick: s("bd ~ bd ~")\nsnare: s("sd ~ sd ~")\nhats: s("hh*8")` },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
    ],
  },
});
export default exampleCheckpoint;
