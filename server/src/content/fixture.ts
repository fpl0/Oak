// A small, complete content set for tests: three core units (one without its own checkpoint), a track
// with an optional lesson, two capstones, and an unlock table that has every kind of row (plain,
// alternative sites, START with a fallback, the conditional voicing gate). Not a test file itself.
import type {
  CapstoneDef,
  CheckpointDef,
  CheckpointMeta,
  CodeMakeEx,
  CodeModifyEx,
  Exercise,
  FactDeck,
  FamilyDef,
  HintLadder,
  LessonDef,
  LessonId,
  LessonMeta,
  SkillDef,
  SkillId,
  StepDef,
  StepUi,
  SyllabusDef,
  ToolEntry,
} from "@oak/content-kit";
import type { ContentSource } from "./types.ts";

const ui: StepUi = { panels: { roll: true, staff: false, keyboard: false } };
const ladder: HintLadder = [
  { text: "Listen again." },
  { text: "Look at beat 3." },
  { text: "Use `~`." },
  "auto",
];

function modifyEx(id: string, skill: SkillId, extra: Partial<CodeModifyEx> = {}): CodeModifyEx {
  return {
    kind: "code-modify",
    id,
    version: 1,
    role: "check",
    prompt: "Make beat 3 silent.",
    skills: [{ skill, w: 1 }],
    code: { starter: 'setcpm(96/4)\n\ndrums: s("⟪bd bd bd bd⟫")' },
    reference: { solutions: ['setcpm(96/4)\n\ndrums: s("bd bd ~ bd")'], bars: 1 },
    matcher: { m: "rhythm", tol: [0, 1], durations: false, perRole: false, displacementCredit: 0.5 },
    target: { audible: true },
    hints: ladder,
    tests: [
      { name: "reference", response: { code: 'setcpm(96/4)\n\ndrums: s("bd bd ~ bd")' }, expect: "pass" },
      {
        name: "rest on beat 2",
        response: { code: 'setcpm(96/4)\n\ndrums: s("bd ~ bd bd")' },
        expect: "fail",
        feedback: ["rhythm.displaced"],
      },
    ],
    ...extra,
  };
}

function makeEx(id: string, skill: SkillId): CodeMakeEx {
  return {
    kind: "code-make",
    id,
    version: 1,
    role: "practice",
    saveAs: "sketch",
    bars: [1, 2],
    prompt: "Write a one-bar groove with at least one rest.",
    skills: [{ skill, w: 1 }],
    code: { starter: 'setcpm(96/4)\n\ndrums: s("bd ~ sd hh")' },
    rubric: [
      {
        id: "has-rest",
        label: "Uses at least one rest",
        required: true,
        skills: [skill],
        rule: "uses",
        tool: "tb.mini.rest",
      },
      {
        id: "downbeat",
        label: "Something lands on beat 1",
        required: false,
        skills: [skill],
        rule: "onsets",
        track: "@drums",
        contains: [[0, 1]],
        perBar: true,
      },
    ],
    hints: ladder,
    tests: [],
  };
}

interface LessonSpec {
  introduces?: SkillId[];
  practises?: SkillId[];
  terms?: LessonDef["terms"];
  canDo?: LessonDef["canDo"];
  /** The graded check of S2. */
  check?: Exercise;
  /** Extra steps before the Make. */
  extra?: StepDef[];
}

export function fixtureLesson(id: LessonId, title: string, spec: LessonSpec = {}): LessonDef {
  const skill = spec.introduces?.[0] ?? spec.practises?.[0] ?? "R03";
  const steps: StepDef[] = [
    {
      id: "S1",
      kind: "predict",
      title: "How many?",
      minutes: 0.5,
      ui,
      exercise: {
        kind: "predict",
        id: "count-hits",
        version: 1,
        role: "practice",
        prompt: "How many hits?",
        skills: [{ skill, w: 1 }],
        hints: null,
        tests: [],
        code: 'setcpm(96/4)\n\ndrums: s("bd bd bd bd")',
        bars: 1,
        mode: "count",
        correct: 4,
      },
    },
    {
      id: "S2",
      kind: "modify",
      title: "Leave a hole",
      minutes: 1.5,
      graded: true,
      ui,
      exercise: spec.check ?? modifyEx("rest-on-three", skill),
    },
    ...(spec.extra ?? []),
    { id: "S9", kind: "make", title: "A groove", minutes: 2.5, ui, exercise: makeEx("groove", skill) },
  ];
  return {
    id,
    version: 1,
    title,
    objective: `I can ${title.toLowerCase()}.`,
    key: { tonic: "C", mode: "major" },
    meter: "4/4",
    bpm: 96,
    introduces: spec.introduces ?? [],
    practises: spec.practises ?? [],
    terms: spec.terms ?? [],
    canDo: spec.canDo ?? [],
    wrapAt: "S2",
    steps,
  };
}

const meta = (l: LessonDef, optional = false): LessonMeta => ({
  id: l.id,
  title: l.title,
  objective: l.objective,
  introduces: l.introduces,
  practises: l.practises,
  ...(optional ? { optional: true } : {}),
});

/** The exercise the conditional unlock (the voicing gate, contracts §3.1 rule 6) looks at. */
export const GATE_EXERCISE = "U02.L01/hand-voiced-cadence";

export function fixtureContent(): ContentSource {
  const lessons: LessonDef[] = [
    fixtureLesson("U01.L01", "Hear the pulse", {
      introduces: ["R03"],
      terms: [{ id: "term.pulse", step: "S1" }],
      canDo: ["cd.hear.pulse"],
    }),
    fixtureLesson("U01.L02", "Count to four", {
      introduces: ["R06", "E01"],
      practises: ["R03"],
      terms: [{ id: "term.rest", step: "S2" }],
      check: modifyEx("rest-on-three", "R06", {
        srs: [{ family: "fam.rhy.read", mode: "seed" }],
      }),
      extra: [
        {
          id: "S3",
          kind: "modify",
          title: "Know this already?",
          minutes: 1,
          ui,
          testOut: { skips: ["S1"] },
          exercise: modifyEx("test-out", "R06", { role: "practice" }),
        },
      ],
    }),
    fixtureLesson("U01.L03", "Tap along", { introduces: ["V01"], practises: ["R06"] }),
    fixtureLesson("U02.L01", "Hand-voiced chords", {
      introduces: ["P01"],
      check: modifyEx("hand-voiced-cadence", "P01"),
    }),
    fixtureLesson("U02.L02", "Voicings", { introduces: ["C01"], practises: ["P01"] }),
    fixtureLesson("U02.L03", "Faster", { practises: ["P01"] }),
    fixtureLesson("U03.L01", "Form", { introduces: ["M01"] }),
    fixtureLesson("U03.L02", "Endings", { practises: ["M01"] }),
    fixtureLesson("J1.L01", "Swing feel", { introduces: ["J01"] }),
    fixtureLesson("J1.L02", "Side trip", { practises: ["J01"] }),
    fixtureLesson("J2.L01", "Shell voicings", { introduces: ["J02"] }),
  ];
  const by = (id: string) => lessons.find((l) => l.id === id) as LessonDef;

  const checkpointMeta: CheckpointMeta[] = [
    {
      id: "U01.CP",
      title: "Pulse and rests",
      covers: ["U01"],
      gated: ["R03", "R06"],
      levelSetting: ["E01", "V01"],
    },
    {
      id: "U03.CP",
      title: "Chords and form",
      covers: ["U02", "U03"],
      gated: ["P01", "C01", "M01"],
      levelSetting: [],
    },
    { id: "J.CP1", title: "Jazz one", covers: ["J1", "J2"], gated: ["J01", "J02"], levelSetting: [] },
  ];
  const checkpoints: CheckpointDef[] = [
    {
      ...(checkpointMeta[0] as CheckpointMeta),
      version: 1,
      authored: [
        modifyEx("cp-rest", "R06", { role: "checkpoint", hints: null }),
        modifyEx("cp-pulse", "R03", { role: "checkpoint", hints: null }),
      ],
      recipe: {
        items: [12, 18],
        perSkillMin: 2,
        families: {
          R03: ["fam.rhy.read"],
          R06: ["fam.rhy.read"],
          E01: ["fam.ear.pulse"],
          V01: ["fam.tap.pulse"],
        },
      },
      make: { ...makeEx("cp-make", "R06"), role: "checkpoint", hints: null },
    },
  ];

  const syllabus: SyllabusDef = {
    units: [
      {
        id: "U01",
        title: "Pulse",
        track: "core",
        checkpoint: "U01.CP",
        lessons: [meta(by("U01.L01")), meta(by("U01.L02")), meta(by("U01.L03"))],
      },
      {
        id: "U02",
        title: "Chords",
        track: "core",
        lessons: [meta(by("U02.L01")), meta(by("U02.L02")), meta(by("U02.L03"))],
      },
      {
        id: "U03",
        title: "Form",
        track: "core",
        checkpoint: "U03.CP",
        lessons: [meta(by("U03.L01")), meta(by("U03.L02"))],
      },
      { id: "J1", title: "Swing", track: "J", lessons: [meta(by("J1.L01")), meta(by("J1.L02"), true)] },
      { id: "J2", title: "Shells", track: "J", lessons: [meta(by("J2.L01"))] },
    ],
    tracks: [{ id: "J", title: "Jazz", units: ["J1", "J2"], checkpoints: ["J.CP1"], capstones: ["JC1"] }],
    checkpoints: checkpointMeta,
    capstones: [
      {
        id: "C0",
        title: "First loop",
        objective: "A four-bar loop.",
        sessions: 2,
        opensAfter: { checkpoints: ["U01.CP"] },
        kind: "compose",
      },
      {
        id: "C1",
        title: "Second loop",
        objective: "An eight-bar loop.",
        sessions: 1,
        opensAfter: { capstones: ["C0"], lessonsCompleted: ["U02.L01"] },
        kind: "compose",
      },
      {
        id: "JC1",
        title: "Blues head",
        objective: "A twelve-bar head.",
        sessions: 1,
        opensAfter: { checkpoints: ["J.CP1"] },
        kind: "compose",
      },
    ],
    trackGates: [
      { gate: { checkpoints: ["U01.CP"] }, opens: ["J1"] },
      { gate: { checkpoints: ["U03.CP"] }, opens: ["J1.L02"] },
    ],
    defaultOrder: [
      "U01.L01",
      "U01.L02",
      "U01.L03",
      "U02.L01",
      "U01.CP",
      "C0.S1",
      "U02.L02",
      "C0.S2",
      "U02.L03",
      "GYM.01",
      "U03.L01",
      "U03.L02",
      "U03.CP",
    ],
  };

  const capstones: CapstoneDef[] = [
    {
      ...(syllabus.capstones[0] as CapstoneDef),
      version: 1,
      meter: "4/4",
      sessionDefs: [
        { id: "C0.S1", title: "Sketch", goal: "Get four bars down." },
        { id: "C0.S2", title: "Finish", goal: "Finish and release." },
      ],
      reviewRevisions: 1,
      canDo: ["cd.compose.first-loop"],
    },
  ];

  const tool = (
    id: ToolEntry["id"],
    kind: ToolEntry["kind"],
    code: string,
    unlock: ToolEntry["unlock"],
  ): ToolEntry => ({
    id,
    kind,
    code,
    unlock,
    concept: code,
    catalog: { signature: code, meaning: code, demo: code },
  });
  const toolbox: ToolEntry[] = [
    tool("tb.mini.rest", "tool", "~", { at: "U01.L01", when: "complete" }),
    tool("snd.piano", "sound", 's("piano")', { at: "U01.L01", when: "complete" }),
    tool("tb.note", "tool", "note()", { at: "U01.L02", when: "complete" }),
    tool("tb.lpf", "tool", ".lpf()", { at: "C0.S1", when: "start", fallbackAt: "U01.L03" }),
    tool("tb.feature.album", "feature", "album", { at: "C0.S1", when: "start" }),
    tool("tb.voicing", "tool", ".voicing()", {
      at: "U02.L02",
      when: "complete",
      condition: { exercise: GATE_EXERCISE, minScore: 0.9, unrevealed: true },
    }),
    tool("chord.triad", "chord", "C", {
      at: "U02.L02",
      when: "complete",
      condition: { exercise: GATE_EXERCISE, minScore: 0.9, unrevealed: true },
    }),
    tool("tb.fast", "tool", ".fast()", { at: ["U02.L03", "J1.L01"], when: "complete" }),
    tool("scale.major", "scale", "major", { at: "U03.L01", when: "complete" }),
  ];

  const skill = (
    id: SkillId,
    kind: SkillDef["kind"],
    introducedBy: LessonId,
    checkpoint?: SkillDef["checkpoint"],
  ): SkillDef => ({
    id,
    name: `Skill ${id}`,
    region: "groove",
    category: "rhythm",
    kind,
    prerequisites: [],
    introducedBy,
    ...(checkpoint === undefined ? {} : { checkpoint }),
  });
  const skills: SkillDef[] = [
    skill("R03", "concept", "U01.L01", "U01.CP"),
    skill("R06", "concept", "U01.L02", "U01.CP"),
    skill("E01", "perceptual", "U01.L02", "U01.CP"),
    skill("V01", "production", "U01.L03", "U01.CP"),
    skill("P01", "fact", "U02.L01", "U03.CP"),
    skill("C01", "creative", "U02.L02", "U03.CP"),
    skill("M01", "concept", "U03.L01", "U03.CP"),
    skill("J01", "concept", "J1.L01", "J.CP1"),
    skill("J02", "concept", "J2.L01", "J.CP1"),
  ];

  const family = (
    id: FamilyDef["id"],
    kind: FamilyDef["kind"],
    skillId: SkillId,
    lesson: LessonId,
    extra: Partial<FamilyDef> = {},
  ): FamilyDef => ({
    id,
    title: id,
    kind,
    domain: "rhythm",
    skills: [{ skill: skillId, w: 1 }],
    unlock: { lesson },
    categories: [
      { id: "basic", unlockAt: lesson },
      { id: "dotted", unlockAt: "U03.L01" },
    ],
    levels: [
      { categories: ["basic"], replays: 1, instruments: "drums", keys: "C", tempo: [80, 100] },
      { categories: ["basic", "dotted"], replays: 1, instruments: "drums", keys: "C", tempo: [80, 120] },
    ],
    masteryLevel: 2,
    trialsPerSet: 6,
    fastRtMs: 4000,
    estTrialSec: 10,
    retention: kind === "concept" ? 0.9 : 0.85,
    mix: kind === "concept" ? null : "rhythm",
    answer: "choice",
    generator: "fixture",
    ...extra,
  });
  const families: FamilyDef[] = [
    family("fam.rhy.read", "concept", "R03", "U01.L02", {
      skills: [
        { skill: "R03", w: 1 },
        { skill: "R06", w: 1 },
      ],
    }),
    family("fam.ear.pulse", "perceptual", "E01", "U01.L02"),
    family("fam.tap.pulse", "production", "V01", "U01.L03", { mic: true }),
  ];
  const decks: FactDeck[] = [
    {
      id: "deck.notes.treble",
      title: "Treble notes",
      unlock: { skill: "P01", lesson: "U02.L01" },
      cards: [
        { id: "fact.treble.E4", prompt: { text: "Bottom line?" }, answer: { text: ["E"] } },
        { id: "fact.treble.G4", prompt: { text: "Second line?" }, answer: { text: ["G"] } },
      ],
      newPerDay: 4,
      fastRtMs: 3000,
      answer: "choice",
    },
  ];

  return {
    contentVersion: "fixture-1",
    syllabus,
    toolbox,
    skills,
    families,
    decks,
    terms: [
      {
        id: "term.pulse",
        term: "pulse",
        definition: "The steady beat.",
        example: 's("bd*4")',
        introducedBy: "U01.L01",
      },
      {
        id: "term.rest",
        term: "rest",
        definition: "A silence with a length.",
        example: 's("bd ~")',
        introducedBy: "U01.L02",
      },
    ],
    canDos: [
      {
        id: "cd.hear.pulse",
        area: "hear",
        statement: "I can find the pulse.",
        skills: ["R03"],
        source: "U01.L01",
      },
      {
        id: "cd.compose.first-loop",
        area: "compose",
        statement: "I can finish a four-bar loop.",
        skills: ["R06"],
        source: "C0",
      },
    ],
    milestones: [
      {
        id: "ms.01",
        title: "First week",
        description: "Three lessons done.",
        when: { sessions: ["U01.L01", "U01.L02", "U01.L03"] },
      },
    ],
    songs: [],
    lessons,
    checkpoints,
    capstones,
    tutorPrefix: { syllabus: "SYLLABUS (fixture)", catalog: "CATALOG (fixture)" },
    problems: [],
  };
}
