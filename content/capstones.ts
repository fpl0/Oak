// Capstones (contracts §2.4, §2.6, §6.6): the registry the syllabus reads (`capstoneMetas`) and the full
// definitions with briefs and the binding rubrics of §6.6 (`capstones`). A flavour never changes a rubric.
// Prose briefs live in content/core/capstones/<id>/brief.mdx (later waves); the rubric is here, once.
// Rubric conditions that no generic rule of §5.6 expresses are `custom` rules, each named in
// CUSTOM_RUBRIC_FNS so the grader builders know what to register.
import {
  type CanDoId,
  type CapstoneDef,
  type CapstoneId,
  type CapstoneMeta,
  type CapstoneSessionDef,
  type ComposeBriefEx,
  defineCapstone,
  type GateSpec,
  type HintLadder,
  type KeySpec,
  type MeterId,
  type RubricRule,
  type SkillRef,
  type SongId,
  type SwingSpec,
  type TestCase,
} from "@oak/content-kit";

type Body = RubricRule extends infer R
  ? R extends RubricRule
    ? Omit<R, "id" | "label" | "required" | "skills">
    : never
  : never;
const req = (id: string, label: string, skills: SkillRef[], body: Body): RubricRule =>
  ({ id, label, required: true, skills, ...body }) as RubricRule;
const opt = (id: string, label: string, skills: SkillRef[], body: Body): RubricRule =>
  ({ id, label, required: false, skills, ...body }) as RubricRule;
const custom = (fn: string, params?: Record<string, unknown>): Body =>
  (params ? { rule: "custom", fn, params } : { rule: "custom", fn }) as Body;

const S = (cap: CapstoneId, titles: string[], goals: string[]): CapstoneSessionDef[] =>
  titles.map((title, i) => ({
    id: `${cap}.S${i + 1}` as CapstoneSessionDef["id"],
    title,
    goal: goals[i] ?? title,
  }));

const ladder = (concept: string, place: string, partial: string): HintLadder => [
  { text: concept },
  { text: place },
  { text: partial },
  "auto",
];

interface ComposeSpec {
  id: CapstoneId;
  title: string;
  objective: string;
  opensAfter: GateSpec;
  meter: MeterId;
  key?: KeySpec;
  bpm?: [number, number];
  swing?: SwingSpec;
  brief: string;
  starter: string;
  rubric: RubricRule[];
  skills: SkillRef[];
  sessions: [string, string][];
  canDo: CanDoId[];
  album?: string;
  minDurationSec?: number;
  hints: HintLadder;
  /** Graded by content CI (`bun run content:check <id>`): ≥ 2 passing pieces, ≥ 2 failing ones, the starter. */
  tests?: TestCase[];
}

function compose(c: ComposeSpec): CapstoneDef {
  const brief: ComposeBriefEx = {
    kind: "compose-brief",
    id: "brief",
    version: 1,
    title: c.title,
    prompt: c.brief,
    skills: c.skills.map((skill) => ({ skill, w: 1 })),
    role: "capstone",
    hints: c.hints,
    tests: c.tests ?? [],
    brief: c.brief,
    flavours: ["flavour.pop", "flavour.jazz-soul", "flavour.indie", "flavour.funk"],
    code: { starter: c.starter },
    rubric: c.rubric,
    ...(c.minDurationSec ? { minDurationSec: c.minDurationSec } : {}),
    album: { slot: c.album ?? c.id },
    review: { tutor: "offer" },
  };
  const early = ["C0", "C1", "C2", "C3", "C4", "X1"].includes(c.id);
  return defineCapstone({
    id: c.id,
    title: c.title,
    objective: c.objective,
    sessions: c.sessions.length,
    opensAfter: c.opensAfter,
    kind: "compose",
    version: 1,
    ...(c.key ? { key: c.key } : {}),
    meter: c.meter,
    ...(c.bpm ? { bpm: c.bpm } : {}),
    ...(c.swing ? { swing: c.swing } : {}),
    brief,
    sessionDefs: S(
      c.id,
      c.sessions.map((s) => s[0]),
      c.sessions.map((s) => s[1]),
    ),
    reviewRevisions: early ? 1 : 2,
    canDo: c.canDo,
  });
}

interface TranscribeSpec {
  id: CapstoneId;
  title: string;
  objective: string;
  opensAfter: GateSpec;
  meter: MeterId;
  song: SongId[];
  sessions: [string, string][];
  canDo: CanDoId[];
  inGymSlots?: boolean;
}
function transcribe(t: TranscribeSpec): CapstoneDef {
  return defineCapstone({
    id: t.id,
    title: t.title,
    objective: t.objective,
    sessions: t.sessions.length,
    opensAfter: t.opensAfter,
    ...(t.inGymSlots ? { inGymSlots: true } : {}),
    kind: "transcribe",
    version: 1,
    meter: t.meter,
    song: t.song,
    sessionDefs: S(
      t.id,
      t.sessions.map((s) => s[0]),
      t.sessions.map((s) => s[1]),
    ),
    reviewRevisions: t.id === "X1" ? 1 : 2,
    canDo: t.canDo,
  });
}

const backbeat = [
  req("snare-backbeat", "Snare on beats 2 and 4", ["R04"], {
    rule: "onsets",
    track: "@drums",
    drum: "snare",
    contains: [
      [1, 4],
      [3, 4],
    ],
    perBar: true,
  }),
];
const tempo = (min: number, max: number) =>
  req("tempo", `Tempo between ${min} and ${max} BPM`, ["R02"], { rule: "tempo-bpm", min, max });

/** Pass thresholds of the transcription capstones (§6.6), read by the stage exercises when answer keys land. */
export const TRANSCRIBE_PASS = {
  X1: { melodyPerPhrase: 0.85, chordsPerStage: 0.8, phraseBars: 4 },
  X2: { bass: 0.9, changes: 0.85, melody: 0.85, order: ["bass", "changes", "melody"] },
  "CF-T": { melody: 0.9, changesPerBar: 0.85, formMap: 1, order: ["bass", "changes", "melody", "arrange"] },
} as const;

/** The one-off rubric checks (`rule: 'custom'`) the capstones need; each gets a unit test in @oak/grader. */
export const CUSTOM_RUBRIC_FNS = {
  "hats-grid": "the hi-hat line sits on an 8th or 16th grid",
  "fill-last-bar": "the last bar's drum onsets differ from bar 1",
  "leadsheet-exact": "the lead sheet renders with approximate = false",
  "blues-form-any": "standard or quick-change 12-bar form, for at least `choruses` choruses",
  "all-dominant-sevenths": "every chord symbol is a dominant seventh (pc-set only for hand voicings)",
  "bar-contains-rn": "bar `bar` contains the Roman numeral `rn`",
  "blue-notes": "the melody uses one of `degrees` at least `min` times",
  "mode-either":
    "the piece is in one of `modes` with its characteristic tone on a strong beat ≥ `minStrong` times",
  "mode-avoid": "no leading tone (Mixolydian) / no ♭6 (Dorian)",
  "tonic-chord-share": "the tonic chord sounds in at least `min` of the bars",
  "form-has-section": "the arranged form contains a section of type `section`",
  "ii-v-chain": "chained ii–Vs into at least `minKeys` distinct target keys",
  "guide-tone-motion": "guide-tone melody moves by at most `maxSemis` at chord changes",
  "walking-bass": "4 onsets per bar, root on beat 1 ≥ 75%, beat-4 approach ≥ 50%",
  "bridge-guide-tones": "bridge changes met by a 3rd or 7th on the downbeat ≥ `min`",
  "melody-matches-song": "melody identical to the song's answer key (`pitch`: absolute or pitch-class)",
  "allowed-tensions": "share of melody-over-chord tensions that are allowed ≥ `min`",
  "bass-kick-downbeat": "bass and kick both sound at beat 1 of every bar",
  "horn-stabs": "a track labelled `label` with at least `min` onsets in every `per` bars",
  "tresillo-bass": "the bass contains tresillo {0, 3/8, 6/8} on every 3-side bar",
  "two-versions-differ":
    "two versions: Δ tempo ≥ 20 BPM or swung vs straight; instrument sets differ by ≥ 2 sounds",
  "extended-chord-share": "a 9th or 11th in at least `min` of the bars",
} as const;

const PIANO_LOOP = (bpm: number) =>
  `setcpm(${bpm}/4)\n\ndrums: s("bd ~ sd ~, hh*8")\nchords: chord("<C G Am F>").voicing().s("piano")\nmel: n("⟪0 2 4 2⟫").scale("C4:major").s("piano")`;

/** C0's reference intro (tests and the release preview): four bars, the fill a sixteenth-note snare-tom run. */
const C0_REFERENCE =
  'setcpm(100/4)\n\nkick: s("<[bd ~ bd ~] [bd ~ bd [~ bd]] [bd ~ bd ~] [bd ~ ~ ~]>")\nsnare: s("<[~ sd ~ sd]!3 [~ sd [sd sd sd sd] [ht ht lt lt]]>")\nhats: s("<hh*8!3 [hh hh hh hh ~ ~ ~ ~]>").gain(.6)';

/**
 * C1's reference loop with one part swapped out, for the known-weak tests. The capstone's Band plays the
 * chords of `band.axis-4bar` (C G Am F, one a bar), so the bass walks those roots and the riff uses notes
 * that sit inside them; a bass on C A F G under that Band put F under A minor and G under F.
 */
const c1Loop = (o: { bpm?: number; snare?: string; bass?: string; mel?: string } = {}) =>
  [
    `setcpm(${o.bpm ?? 96}/4)`,
    "",
    'kick: s("bd ~ [~ bd] ~")',
    `snare: s("${o.snare ?? "~ sd ~ sd"}")`,
    'hats: s("hh*8").gain(.6)',
    `bass: note("${o.bass ?? "<[c2 ~ c2 g1] [g1 ~ g1 d2] [a1 ~ a1 e2] [f1 ~ f1 c2]>"}").s("ebass").lpf(600)`,
    `mel: note("${o.mel ?? "<[c5 ~ g4 a4] [g4 e4 ~ d4]>"}").s("piano")`,
  ].join("\n");

/**
 * Liner-note seeds for the release dialog (ux §5, "write a one-line liner note"): first lines the learner
 * can take, edit or ignore. `{bars}` and `{bpm}` are filled from the released piece. They describe what
 * the brief made the learner write, never how well it went; the tutor's own note is separate (§10.6).
 */
export const CAPSTONE_LINER_SEEDS: Readonly<Partial<Record<CapstoneId, readonly string[]>>> = {
  C0: [
    "The album opens on {bars} bars of drums at {bpm} BPM: snare on 2 and 4, hats underneath, a fill to hand over.",
    "A count-in for everything that follows. The last bar breaks the pattern on purpose.",
    "Kick, snare and hats, one line each. The fill is the only bar that changes.",
  ],
  C1: [
    "Four bars at {bpm} BPM: a groove, a bass line written note by note, and a two-bar riff on top.",
    "The bass walks underneath; the riff says its line twice.",
    "The first loop with notes in it. Drums from the intro, a bass and a riff of my own.",
  ],
};

export const capstones: readonly CapstoneDef[] = [
  compose({
    id: "C0",
    title: "C0 Intro",
    objective: "A 4–8 bar drum intro: backbeat, 8th or 16th hats, a fill; first album track.",
    opensAfter: { checkpoints: ["U01.CP"] },
    meter: "4/4",
    bpm: [70, 140],
    brief:
      "Write a 4 to 8 bar drum intro for your album: a backbeat, steady hats, and a fill in the last bar.",
    starter: 'setcpm(100/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")',
    skills: ["R04", "R05", "R07"],
    // §6.6 names two one-off checks, `hats-grid` and `fill-last-bar` (CUSTOM_RUBRIC_FNS). Until @oak/grader
    // registers them, C0 grades the same ideas with implemented rules: closed hats on every 8th of bar 1
    // (16ths contain the 8ths), the backbeat in bars 1–3 (the last bar is free for the fill), and the
    // fill written as bar-level variation with `< >`, the U01.L07 way.
    rubric: [
      req("meter", "In 4/4, 4 to 8 bars long", ["R03"], { rule: "bars", min: 4, max: 8 }),
      req("drum-lines", "At least two drum lines", ["R04"], { rule: "tracks", min: 2, roles: ["drums"] }),
      req("snare-backbeat", "Snare on beats 2 and 4 in bars 1 to 3", ["R04"], {
        rule: "onsets",
        track: "@drums",
        drum: "snare",
        contains: [
          [1, 4],
          [3, 4],
          [5, 4],
          [7, 4],
          [9, 4],
          [11, 4],
        ],
        perBar: false,
      }),
      req("hats-grid", "Closed hats on every eighth of bar 1 (or every sixteenth)", ["R05", "R07"], {
        rule: "onsets",
        track: "@drums",
        drum: "hatClosed",
        contains: [
          [0, 1],
          [1, 8],
          [1, 4],
          [3, 8],
          [1, 2],
          [5, 8],
          [3, 4],
          [7, 8],
        ],
        perBar: false,
      }),
      req("fill", "A fill: the last bar changes, written with `< >`", ["R07"], {
        rule: "uses",
        tool: "tb.mini.alt",
      }),
      tempo(70, 140),
    ],
    sessions: [["Intro", "A 4–8 bar drum intro: backbeat, 8th or 16th hats, a fill; first album track."]],
    canDo: ["cd.compose.drum-intro"],
    hints: ladder(
      "What does a listener need to hear before the band comes in?",
      "The snare marks beats 2 and 4; the last bar is where the fill goes.",
      'Try toms in the last bar: `s("<[~ sd ~ sd] [~ sd ~ sd] [~ sd ~ sd] [ht mt lt lt]>")`.',
    ),
    tests: [
      {
        name: "the starter: one bar, no fill",
        response: { code: 'setcpm(100/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")' },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "four bars, tom fill in bar 4",
        response: {
          code: 'setcpm(100/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("<[~ sd ~ sd] [~ sd ~ sd] [~ sd ~ sd] [sd sd ht lt]>")\nhats: s("<hh*8 hh*8 hh*8 [hh hh hh hh ~ ~ ~ ~]>")',
        },
        expect: "pass",
      },
      {
        name: "eight bars, sixteenth hats, crash and fill",
        response: {
          code: 'setcpm(124/4)\n\nkick: s("<[bd ~ bd ~]!7 [bd bd ~ ~]>")\nsnare: s("<[~ sd ~ sd]!7 [[sd sd] [mt mt] [lt lt] [lt ~]]>")\nhats: s("<hh*16!7 ~>")\nperc: s("<cr ~ ~ ~ ~ ~ ~ ~>")',
        },
        expect: "pass",
      },
      {
        name: "no backbeat",
        response: {
          code: 'setcpm(100/4)\n\nkick: s("bd bd bd bd")\nsnare: s("<[sd ~ ~ ~]!3 [ht mt lt lt]>")\nhats: s("hh*8")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "too fast",
        response: {
          code: 'setcpm(160/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("<[~ sd ~ sd]!3 [ht mt lt lt]>")\nhats: s("hh*8")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      // The reference intro: kick pushes into bar 2, the hats drop out for a sixteenth-note snare and tom
      // run in bar 4 that hands the downbeat back to bar 1.
      {
        name: "reference: four bars with a sixteenth-note fill",
        response: { code: C0_REFERENCE },
        expect: "pass",
      },
      // Known-weak pieces, one per required rule (the other rules hold).
      {
        name: "weak: two bars only",
        response: {
          code: 'setcpm(100/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("<[~ sd ~ sd] [~ sd [ht lt] sd]>")\nhats: s("hh*8")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: quarter-note hats",
        response: {
          code: 'setcpm(100/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("<[~ sd ~ sd]!3 [~ sd ht lt]>")\nhats: s("hh*4")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        // The same bar four times is, to the grader, one bar repeated: it fails the length and the fill.
        name: "weak: one bar repeated, no fill",
        response: {
          code: 'setcpm(100/4)\n\nkick: s("[bd ~ bd ~]!4").slow(4)\nsnare: s("[~ sd ~ sd]!4").slow(4)\nhats: s("hh*32").slow(4)',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
    ],
  }),
  compose({
    id: "C1",
    title: "C1 First Loop",
    objective: "A 4-bar loop: groove, note-name bass (ebass unlocks at the start), 2-bar riff.",
    opensAfter: { checkpoints: ["U02.CP"] },
    meter: "4/4",
    bpm: [70, 140],
    brief: "A 4-bar loop: a groove, a bass line written with note names, and a 2-bar riff on top.",
    starter:
      'setcpm(96/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")\nbass: note("⟪c2 c2 g1 a1⟫").s("ebass").lpf(600)\nmel: note("⟪e4 g4 a4 g4⟫").s("piano")',
    skills: ["R04", "P02", "P05"],
    rubric: [
      req("roles", "Drums, bass and melody", ["R04"], {
        rule: "tracks",
        min: 3,
        roles: ["drums", "bass", "melody"],
      }),
      req("bars", "Exactly 4 bars", ["R03"], { rule: "bars", min: 4, max: 4 }),
      ...backbeat,
      req("bass-range", "Bass between C1 and C3", ["P05"], {
        rule: "range",
        track: "@bass",
        within: ["c1", "c3"],
      }),
      req("bass-pitches", "Bass uses at least 3 different notes", ["P02"], {
        rule: "distinct-pitches",
        track: "@bass",
        min: 3,
      }),
      req("riff-range", "Riff spans at most 15 half steps", ["P03"], {
        rule: "range",
        track: "@melody",
        maxSpan: 15,
      }),
      tempo(70, 140),
    ],
    sessions: [
      ["First Loop", "A 4-bar loop: groove, note-name bass (ebass unlocks at the start), 2-bar riff."],
    ],
    canDo: ["cd.compose.first-loop"],
    hints: ladder(
      "Which part holds the floor of the loop?",
      "The bass line sits under C3; give it three different notes.",
      'A two-bar riff: a first bar, then one that answers it, `note("<[c4 e4 g4 e4] [d4 g4 a4 g4]>")`. The bass can walk the band\'s chords: c, g, a, f.',
    ),
    tests: [
      {
        name: "the starter: one bar",
        response: {
          code: 'setcpm(96/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")\nbass: note("c2 c2 g1 a1").s("ebass").lpf(600)\nmel: note("e4 g4 a4 g4").s("piano")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "four bars, riff answers itself",
        response: {
          code: 'setcpm(96/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")\nbass: note("<[c2 ~ c2 g1] [g1 ~ g1 d2] [a1 ~ a1 e2] [f1 ~ f1 c2]>").s("ebass").lpf(600)\nmel: note("<[c4 e4 g4 e4] [d4 g4 b4 g4] [c4 e4 a4 e4] [c4 f4 a4 ~]>").s("piano")',
        },
        expect: "pass",
      },
      {
        name: "two-bar ideas filling four bars, at 120",
        response: {
          code: 'setcpm(120/4)\n\nkick: s("bd ~ [~ bd] ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*16").gain(.5)\nbass: note("<c2 g1 a1 f1>").s("ebass").lpf(600)\nmel: note("<[c5 ~ a4 g4] [~ g4 a4 d5]>").s("piano")',
        },
        expect: "pass",
      },
      {
        name: "bass too high",
        response: {
          code: 'setcpm(96/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")\nbass: note("<c3 e3 g3 e3>").s("ebass").lpf(600)\nmel: note("<[c4 e4 g4 e4] [c4 e4 g4 c5]>").s("piano")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "no melody",
        response: {
          code: 'setcpm(96/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")\nbass: note("<c2 g1 a1 f1>").s("ebass").lpf(600)',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      // The reference loop: a bass on C, G, A and F (the Band's chords) that adds each root's fifth on beat
      // 4, under a two-bar riff whose notes sit inside the chord of every bar.
      { name: "reference: walking bass, two-bar riff", response: { code: c1Loop() }, expect: "pass" },
      // Known-weak pieces, one per required rule (the other rules hold).
      {
        name: "weak: snare on 1 and 3",
        response: { code: c1Loop({ snare: "sd ~ sd ~" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a two-note bass",
        response: { code: c1Loop({ bass: "<[c2 ~ c2 ~] [g1 ~ g1 ~] [c2 ~ c2 ~] [g1 ~ g1 g1]>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a riff that leaps two octaves",
        response: { code: c1Loop({ mel: "<[c4 ~ g4 c6] [g5 e5 ~ c4]>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: too slow",
        response: { code: c1Loop({ bpm: 64 }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
    ],
  }),
  compose({
    id: "C2",
    title: "C2 Four-Chord Song",
    objective: "Chords loop then land; a melody over the changes that reuses its bar-1 idea.",
    opensAfter: { checkpoints: ["U07.CP"] },
    meter: "4/4",
    key: { tonic: "C", mode: "major" },
    bpm: [70, 140],
    brief:
      "Loop, then land: a four-chord schema in bars 1–6, a cadence in bars 7–8, and a melody that repeats or varies its bar-1 idea.",
    starter: PIANO_LOOP(96),
    skills: ["H04", "H03", "M03", "M02"],
    rubric: [
      req("bars", "8 bars", ["F01"], { rule: "bars", min: 8, max: 8 }),
      req("roles", "Chords and melody", ["H04"], { rule: "tracks", min: 2, roles: ["chords", "melody"] }),
      req("schema", "Bars 1–6: a four-chord schema loop, one chord per bar", ["H04"], {
        rule: "progression",
        schema: "schema.axis",
        allowRotation: true,
      }),
      req("cadence", "Bars 7–8 land on I (authentic or plagal)", ["H03"], {
        rule: "cadence",
        types: ["PAC", "IAC", "PC"],
        at: "last",
      }),
      req("chord-tones", "Chord tones on beats 1 and 3", ["M03"], {
        rule: "chord-tones-strong",
        minRatio: 0.6,
        melody: "@melody",
        harmony: "@chords",
        strength: "strong",
      }),
      req("range", "Melody within 19 semitones", ["M01"], { rule: "range", track: "@melody", maxSpan: 19 }),
      req("motif", "Repeat or vary your bar-1 idea at least once", ["M02"], {
        rule: "motif-reuse",
        track: "@melody",
        minRatio: 0.5,
      }),
      opt("ends-home", "The melody ends on 1", ["M01"], {
        rule: "ends-on-degree",
        degrees: ["1"],
        track: "@melody",
      }),
    ],
    sessions: [
      ["Chords", 'Chords: schema loop in bars 1–6, cadence in bars 7–8 ("loop, then land").'],
      ["Melody", "Melody over the changes; vary the bar-1 idea; release."],
    ],
    canDo: ["cd.compose.fourchord"],
    hints: ladder(
      "Where does the loop stop looping?",
      "Bars 7 and 8 carry the ending: V to I or IV to I.",
      "Keep the loop for six bars, then `<… G C>` for the last two.",
    ),
  }),
  transcribe({
    id: "X1",
    title: "X1 Folk Transcription",
    objective: "Aura Lee or Red River Valley by ear, phrase by phrase, then chords bass-first.",
    opensAfter: {
      checkpoints: ["U07.CP"],
      capstones: ["C2"],
      familyLevels: [{ family: "fam.mel.dictation", level: 4 }],
    },
    meter: "4/4",
    song: ["song.aura-lee", "song.red-river-valley"],
    sessions: [
      ["Phrases 1–2", "Phrases 1–2 of Aura Lee or Red River Valley, by ear, checked per phrase."],
      ["Phrases 3–4", "Phrases 3–4."],
      ["Chords", "Chords bass-first, arrange, review, release."],
    ],
    canDo: ["cd.transcribe.folk-tune"],
  }),
  compose({
    id: "C3",
    title: "C3 Verse–Chorus Demo",
    objective: "A verse–chorus demo with contrasting sections, at least 90 seconds long.",
    opensAfter: { checkpoints: ["U09.CP"] },
    meter: "4/4",
    bpm: [70, 140],
    brief:
      "A demo in verse–chorus form: verse, chorus, verse, chorus. Make the chorus different on at least two counts.",
    starter: `setcpm(100/4)\n\nconst chordsVerse = chord("<C Am F G>").voicing()\nconst chordsChorus = chord("<F G C C>").voicing()\n\nchords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus]).s("piano")\ndrums: s("bd ~ sd ~, hh*8")`,
    skills: ["F02", "F05", "B04"],
    minDurationSec: 90,
    rubric: [
      req("form", "Verse, chorus, verse, chorus", ["F02"], {
        rule: "form",
        pattern: "verse chorus verse chorus",
      }),
      req("contrast", "The chorus differs from the verse on at least two counts", ["F02", "F05"], {
        rule: "contrast",
        a: { section: "chorus" },
        b: { section: "verse" },
        axes: ["pitch", "density", "harmony", "register", "energy"],
        minAxes: 2,
      }),
      req("duration", "At least 90 seconds", ["F06"], { rule: "duration-sec", min: 90 }),
      req("groove-lock", "Bass locks with the kick", ["B04"], {
        rule: "groove-lock",
        kick: "@drums",
        bass: "@bass",
        min: 0.5,
      }),
      req("leadsheet", "The lead sheet renders exactly", ["N07"], custom("leadsheet-exact")),
    ],
    sessions: [
      ["Groove & changes", "Groove and changes for verse and chorus."],
      ["Melodies", "Melodies and section contrast."],
      ["Arrange", "Arrange V C V C, lead sheet, review, release."],
    ],
    canDo: ["cd.compose.verse-chorus"],
    hints: ladder(
      "What makes a chorus feel like a lift?",
      "Compare the two sections: register, density, harmony.",
      "Move the chorus melody up a few steps and add hats on 16ths.",
    ),
  }),
  compose({
    id: "C4",
    title: "C4 Minor Indie Ballad",
    objective: "An Aeolian verse i–VI–III–VII and a chorus cadence with the major V.",
    opensAfter: { checkpoints: ["U10.CP"] },
    meter: "4/4",
    key: { tonic: "A", mode: "minor" },
    bpm: [60, 95],
    brief:
      "A slow minor ballad: an Aeolian verse loop, then a chorus whose cadence uses the major V before i.",
    starter: `setcpm(76/4)\n\nchords: chord("<Am F C G>").voicing().s("piano")\nmel: n("⟪0 2 4 2⟫").scale("A4:minor").s("piano")\ndrums: s("bd ~ sd ~")`,
    skills: ["H08", "H09", "S05"],
    rubric: [
      req("aeolian", "Verse loop i–VI–III–VII", ["H08"], { rule: "progression", schema: "schema.aeolian" }),
      req("major-v", "A major V (raised 7) followed by i", ["H09"], {
        rule: "contains-rn",
        rn: ["V"],
        min: 1,
        mustResolve: true,
      }),
      req("minor-colour", "Melody uses ♭3 and ♭6", ["S05"], {
        rule: "degree-set",
        track: "@melody",
        contains: ["b3", "b6"],
      }),
      req("ends-on-1", "Melody ends on 1 over i", ["S05"], {
        rule: "ends-on-degree",
        degrees: ["1"],
        track: "@melody",
      }),
      tempo(60, 95),
    ],
    sessions: [
      ["Aeolian verse", "Aeolian verse i–VI–III–VII."],
      ["Chorus cadence", "Chorus cadence with the major V; release."],
    ],
    canDo: ["cd.compose.minor-ballad"],
    hints: ladder(
      "Which chord makes minor sound like it has to go home?",
      "The V chord needs the raised 7th: in A minor, E with a G♯.",
      "End the chorus `<… E Am>`.",
    ),
  }),
  compose({
    id: "C5",
    title: "C5 12-Bar Shuffle",
    objective: "Two choruses of 12-bar blues with a shuffle feel, a turnaround and a riff.",
    opensAfter: { checkpoints: ["U11.CP"] },
    meter: "4/4",
    key: { tonic: "C", mode: "blues" },
    bpm: [80, 140],
    swing: { subdivision: 8, amount: 1 / 3 },
    brief:
      "A 12-bar shuffle: two choruses, dominant sevenths, swung hats, a turnaround in bar 12 and a riff that answers itself.",
    starter: `setcpm(112/4)\n\nconst changes = "<C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>"\n\nhats: s("hh*8").swingBy(1/3, 4).gain(.5)\ndrums: s("bd ~ sd ~")\nchords: chord(changes).voicing().s("piano")\nmel: n("⟪0 2 3 4⟫").scale("C4:blues").swingBy(1/3, 4).s("piano")`,
    skills: ["H10", "F04", "R13", "M08"],
    rubric: [
      req(
        "form",
        "12-bar blues, at least two choruses",
        ["F04", "H10"],
        custom("blues-form-any", { variants: ["standard", "quick-change"], choruses: 2 }),
      ),
      req("sevenths", "Every chord is a dominant seventh", ["C06"], custom("all-dominant-sevenths")),
      req("swing", "Swung 8ths on the hats", ["R13"], {
        rule: "swing",
        track: ["hats", "@drums"],
        drums: ["hatClosed", "hatOpen", "ride"],
        subdivision: 8,
        ratio: [1.6, 2.4],
      }),
      req("turnaround", "Bar 12 contains V", ["H10"], custom("bar-contains-rn", { bar: 12, rn: "V" })),
      req(
        "blue-notes",
        "The melody uses ♭3 or ♭5 at least twice",
        ["S11"],
        custom("blue-notes", { degrees: ["b3", "b5"], min: 2 }),
      ),
      req("riff", "The riff comes back", ["M08"], { rule: "motif-reuse", track: "@melody", minRatio: 0.6 }),
    ],
    sessions: [
      ["Changes & riff", "Changes, shuffle feel and riff."],
      ["Second chorus", "Second chorus, turnaround, call and response; release."],
    ],
    canDo: ["cd.compose.twelve-bar"],
    hints: ladder(
      "What makes a shuffle lean?",
      "Swing the hats with `.swingBy(1/3, 4)`; bar 12 turns around on V.",
      "The last chord of the changes is `G7`.",
    ),
  }),
  transcribe({
    id: "X2",
    title: "X2 Blues Transcription",
    objective: "St. Louis Blues (1914) 12-bar strain or Careless Love: bass, changes, then melody.",
    opensAfter: { capstones: ["C5"] },
    meter: "4/4",
    song: ["song.st-louis-blues", "song.careless-love"],
    sessions: [
      ["Bass & changes", "St. Louis Blues (1914) 12-bar strain or Careless Love: bass, then changes."],
      ["Melody", "Melody, review, release."],
    ],
    canDo: ["cd.transcribe.blues"],
  }),
  compose({
    id: "C6",
    title: "C6 Modal Vamp",
    objective: "A Mixolydian or Dorian vamp that makes its characteristic tone heard.",
    opensAfter: { checkpoints: ["U14.CP"] },
    meter: "4/4",
    bpm: [80, 130],
    brief: "A modal vamp in Mixolydian or Dorian, at least 16 bars, that leans on the mode's colour note.",
    starter: `setcpm(100/4)\n\nchords: chord("<G F>").voicing().s("piano")\nmel: n("⟪0 2 4 6⟫").scale("G4:mixolydian").s("piano")\ndrums: s("bd ~ sd ~, hh*8")`,
    skills: ["S12", "H11"],
    rubric: [
      req(
        "mode",
        "Mixolydian ♭7 or Dorian ♮6 on a strong beat, twice or more",
        ["S12"],
        custom("mode-either", { modes: ["mixolydian", "dorian"], minStrong: 2 }),
      ),
      req("no-leading-tone", "No leading tone (Mixolydian) or no ♭6 (Dorian)", ["S12"], custom("mode-avoid")),
      req(
        "tonic",
        "The tonic chord in at least 40% of the bars",
        ["H11"],
        custom("tonic-chord-share", { min: 0.4 }),
      ),
      req("bars", "At least 16 bars", ["F01"], { rule: "bars", min: 16 }),
    ],
    sessions: [
      ["Vamp", "Mixolydian or Dorian vamp and characteristic tone."],
      ["Melody & groove", "Melody, groove, release."],
    ],
    canDo: ["cd.compose.modal-vamp"],
    hints: ladder(
      "Which note makes this mode sound unlike major?",
      "In G Mixolydian it is F natural; put it on beat 1 or 3.",
      'Try `n("<6 4> 2 0 ~")` over the G chord.',
    ),
  }),
  compose({
    id: "C7",
    title: "C7 Chromatic Colour",
    objective: "Colour chords (a secondary dominant and ♭VI–♭VII–I) and a final-chorus key lift.",
    opensAfter: { checkpoints: ["U17.CP"] },
    meter: "4/4",
    key: { tonic: "C", mode: "major" },
    bpm: [70, 140],
    brief:
      "A song with chromatic colour: a secondary dominant that resolves, a ♭VI–♭VII–I, and a key lift for the last chorus.",
    starter: `setcpm(100/4)\n\nchords: chord("<C A7 Dm G Ab Bb C C>").voicing().s("piano")\nmel: n("⟪0 2 4 2⟫").scale("C4:major").s("piano")`,
    skills: ["H12", "H13", "H14"],
    rubric: [
      req("secondary", "A secondary dominant that resolves", ["H12"], {
        rule: "contains-rn",
        rn: ["V/ii", "V/iii", "V/IV", "V/V", "V/vi", "V7/ii", "V7/iii", "V7/IV", "V7/V", "V7/vi"],
        min: 1,
        mustResolve: true,
      }),
      req("mixture", "♭VI–♭VII–I", ["H13"], { rule: "progression", rn: ["bVI", "bVII", "I"] }),
      req("lift", "The last chorus lifts by 1 or 2 semitones for 8+ bars, same melody", ["H14"], {
        rule: "key-change",
        at: "last",
        semitones: [1, 2],
        minBarsAfter: 8,
        sameMelody: true,
      }),
      req("bars", "At least 32 bars", ["F02"], { rule: "bars", min: 32 }),
    ],
    sessions: [
      ["Colour chords", "Colour chords: a secondary dominant and ♭VI–♭VII–I."],
      ["Melody & sections", "Melody and sections."],
      ["Key lift", "Final-chorus key lift (≥8 bars), arrange, release."],
    ],
    canDo: ["cd.compose.chromatic"],
    hints: ladder(
      "Which chord can borrow a leading tone from a neighbour key?",
      "V/ii is A7 in C: it wants to go to Dm.",
      'Lift the last chorus with `.scale("<C4:major!24 D4:major!8>")` after `arrange()`.',
    ),
  }),
  compose({
    id: "CF-A",
    title: "CF-A Core Finale: Album Single",
    objective: "An album single of at least two minutes with a bridge and four harmonic devices.",
    opensAfter: { capstones: ["C7"] },
    meter: "4/4",
    bpm: [60, 160],
    brief:
      "Your album single: verse, chorus and a bridge, at least two minutes, using four or more of the devices you have learned.",
    starter: `setcpm(100/4)\n\nconst chordsVerse = chord("<C Am F G>").voicing()\nconst chordsChorus = chord("<F G Em Am>").voicing()\nconst chordsBridge = chord("<Dm7 G7 E7 Am>").voicing()\n\nchords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsBridge], [8, chordsChorus]).s("piano")\ndrums: s("bd ~ sd ~, hh*8")`,
    skills: ["H12", "H13", "H14", "F02"],
    minDurationSec: 120,
    rubric: [
      req("devices", "At least 4 devices", ["H12", "H13", "H14"], {
        rule: "device-count",
        devices: [
          "secondary-dominant",
          "borrowed-chord",
          "modulation",
          "suspension",
          "syncopated-bass",
          "modal-colour",
        ],
        min: 4,
      }),
      req("bridge", "The form has a bridge", ["F03"], custom("form-has-section", { section: "bridge" })),
      req("duration", "At least 2 minutes", ["F06"], { rule: "duration-sec", min: 120 }),
    ],
    sessions: [
      ["Form & groove", "Plan the form (verse, chorus, bridge) and groove."],
      ["Harmony", "Harmony with ≥4 devices."],
      ["Melody & bridge", "Melody and bridge."],
      ["Arrange & master", "Arrange to ≥2:00, master, release."],
    ],
    canDo: ["cd.compose.album-single"],
    album: "single",
    hints: ladder(
      "Which of your devices have you not used yet?",
      "A bridge is a natural place for a borrowed chord or a key change.",
      "Try ♭VI–♭VII–I at the end of the bridge.",
    ),
  }),
  transcribe({
    id: "CF-T",
    title: "CF-T Core Finale: Standard Transcription",
    objective: "Transcribe a public-domain standard: form map, bass, changes, melody.",
    opensAfter: { lessonsCompleted: ["U15.L01"] },
    inGymSlots: true,
    meter: "4/4",
    song: ["song.five-foot-two", "song.aint-she-sweet", "song.bye-bye-blackbird"],
    sessions: [
      [
        "Form & bass",
        "Form map and bass of a public-domain standard (Five Foot Two, Ain't She Sweet or Bye Bye Blackbird).",
      ],
      ["Changes", "Changes."],
      ["Melody", "Melody."],
      ["Arrange", "Arrange, review, release."],
    ],
    canDo: ["cd.transcribe.standard"],
  }),
  compose({
    id: "JC1",
    title: "JC1 ii–V Ballad",
    objective: "16 bars over chained ii–Vs in at least 3 keys, with a guide-tone melody.",
    opensAfter: { checkpoints: ["J.CP1"] },
    meter: "4/4",
    bpm: [56, 92],
    swing: { subdivision: 8, amount: 1 / 3 },
    brief:
      "A 16-bar ballad over chained ii–Vs that reach at least three keys, with a melody built on guide tones.",
    starter: `setcpm(72/4)\n\nconst changes = "<Dm7 G7 C^7 C^7 Fm7 Bb7 Eb^7 Eb^7>"\n\nchords: chord(changes).dict("guidetones").voicing().s("piano")\nbass: chord(changes).rootNotes(2).s("upright")`,
    skills: ["J04", "J05", "J07"],
    rubric: [
      req("bars", "16 bars", ["F01"], { rule: "bars", min: 16, max: 16 }),
      req("ii-v", "Chained ii–Vs into at least 3 keys", ["J05"], custom("ii-v-chain", { minKeys: 3 })),
      req("guide-tones", "Melody on 3rds or 7ths at chord changes", ["J07"], {
        rule: "guide-tones",
        track: "@melody",
        harmony: "@chords",
        minRatio: 0.7,
      }),
      req(
        "guide-motion",
        "Guide tones move by 2 semitones or less",
        ["J07"],
        custom("guide-tone-motion", { maxSemis: 2 }),
      ),
      tempo(56, 92),
    ],
    sessions: [
      ["Changes", "16 bars over chained ii–Vs in at least 3 keys."],
      ["Guide-tone melody", "Guide-tone melody; release."],
    ],
    canDo: ["cd.compose.ii-v-ballad"],
    hints: ladder(
      "Which notes of a ii–V move the least?",
      "The 7th of ii falls to the 3rd of V.",
      "Over Dm7 to G7, sing C then B.",
    ),
  }),
  compose({
    id: "JC2",
    title: "JC2 Jazz Blues in F",
    objective:
      "Jazz-blues changes, shell comping and walking bass from one chord() pattern; an original head.",
    opensAfter: { lessonsCompleted: ["J4.L04"] },
    meter: "4/4",
    key: { tonic: "F", mode: "major" },
    bpm: [100, 180],
    swing: { subdivision: 8, amount: 1 / 3 },
    brief:
      "A jazz blues in F: changes, swinging comping and a walking bass all driven by one chord pattern, then your own head over two choruses.",
    starter: `setcpm(132/4)\n\nconst changes = "<F7 Bb7 F7 Cm7 Bb7 Bo7 F7 D7 Gm7 C7 F7 C7>"\n\nhats: s("rd*8").swingBy(1/3, 4).gain(.5)\nchords: n("0 1").chord(changes).voicing().struct("~ x ~ x").s("piano")\nbass: chord(changes).rootNotes(2).struct("x*4").s("upright")`,
    skills: ["J11", "B05", "J08"],
    rubric: [
      req("form", "Jazz 12-bar blues", ["J11"], { rule: "blues-form", variant: "jazz" }),
      req(
        "walking",
        "A walking bass",
        ["B05"],
        custom("walking-bass", { rootOnOne: 0.75, approachOnFour: 0.5 }),
      ),
      req("swing", "Swung 8ths on the ride or comping", ["R13"], {
        rule: "swing",
        track: ["hats", "@drums", "chords"],
        drums: ["hatClosed", "hatOpen", "ride"],
        subdivision: 8,
        ratio: [1.6, 2.4],
      }),
      req("one-pattern", "Comping and bass come from one chord pattern", ["J08"], {
        rule: "uses",
        tool: ["tb.set", "tb.rootNotes"],
        min: 1,
      }),
    ],
    sessions: [
      ["Changes & comping", "Changes, shell comping and walking bass from one `chord()` pattern."],
      ["Head", "Original head over two choruses; release."],
    ],
    canDo: ["cd.compose.jazz-blues"],
    hints: ladder(
      "What does the bass do on beat 4?",
      "Beat 4 approaches the next root by a step.",
      "Walk F A C B to reach B♭.",
    ),
  }),
  compose({
    id: "JC3",
    title: "JC3 Rhythm-Changes Contrafact",
    objective: "A 32-bar AABA contrafact on rhythm changes in B♭.",
    opensAfter: { checkpoints: ["J.CP2"] },
    meter: "4/4",
    key: { tonic: "Bb", mode: "major" },
    bpm: [120, 220],
    swing: { subdivision: 8, amount: 1 / 3 },
    brief: "A new head on rhythm changes in B♭: 32 bars, AABA, with the bridge D7 G7 C7 F7.",
    starter: `setcpm(160/4)\n\nconst chordsA = chord("<[Bb^7 Gm7] [Cm7 F7]>").voicing()\nconst chordsB = chord("<D7 D7 G7 G7 C7 C7 F7 F7>").voicing()\n\nchords: arrange([8, chordsA], [8, chordsA], [8, chordsB], [8, chordsA]).s("piano")`,
    skills: ["J12", "J10"],
    rubric: [
      req("form", "AABA, 32 bars", ["J12"], { rule: "form", pattern: "AABA" }),
      req("bars", "32 bars", ["J12"], { rule: "bars", min: 32, max: 32 }),
      req("a-changes", "A sections on rhythm changes", ["J12"], {
        rule: "progression",
        schema: "schema.rhythm-a",
      }),
      req("bridge", "Bridge D7 G7 C7 F7", ["J10"], { rule: "progression", rn: ["III7", "VI7", "II7", "V7"] }),
      req("chord-tones", "Chord tones on strong beats", ["M03"], {
        rule: "chord-tones-strong",
        minRatio: 0.55,
        melody: "@melody",
        harmony: "@chords",
        strength: "strong",
      }),
      req(
        "bridge-guides",
        "Bridge changes met by a 3rd or 7th",
        ["J07"],
        custom("bridge-guide-tones", { min: 0.5 }),
      ),
    ],
    sessions: [
      ["A sections", "A sections in B♭."],
      ["Bridge", "Bridge D7 G7 C7 F7."],
      ["Arrange", "Arrange and release."],
    ],
    canDo: ["cd.compose.contrafact"],
    hints: ladder(
      "Which note of D7 tells the ear the key has moved?",
      "F♯, the 3rd of D7, is not in B♭.",
      "Land on F♯ on the downbeat of the bridge.",
    ),
  }),
  compose({
    id: "JC4",
    title: "JC4 Reharmonize a Standard",
    objective: "Reharmonize Georgia on My Mind or Body and Soul with three devices, melody untouched.",
    opensAfter: { checkpoints: ["J.CP2"] },
    meter: "4/4",
    bpm: [56, 100],
    brief: "Reharmonize a 1930 standard with at least three devices. The melody stays exactly as written.",
    starter: `setcpm(72/4)\n\nchords: chord("<Dm7 G7 C^7 A7>").voicing().s("piano")`,
    skills: ["J14", "J13"],
    rubric: [
      req(
        "melody",
        "Melody identical to the original",
        ["J14"],
        custom("melody-matches-song", {
          songs: ["song.georgia-on-my-mind", "song.body-and-soul"],
          pitch: "absolute",
        }),
      ),
      req(
        "tensions",
        "Tensions over the new chords are allowed ones",
        ["J02"],
        custom("allowed-tensions", { min: 0.85 }),
      ),
      req("devices", "At least 3 reharmonization devices", ["J14", "J13"], {
        rule: "device-count",
        devices: ["tritone-sub", "secondary-ii-v", "backdoor", "diminished-passing"],
        min: 3,
      }),
    ],
    sessions: [
      ["Analyse", "Analyse Georgia on My Mind or Body and Soul (both 1930)."],
      ["Reharmonize", "Reharmonize with ≥3 devices; melody untouched."],
      ["Voice-lead", "Voice-lead and release."],
    ],
    canDo: ["cd.compose.reharm"],
    hints: ladder(
      "Which chord could be replaced by one a tritone away?",
      "Any V7 can become ♭II7 into the same target.",
      "Swap G7 for Db7 before C^7.",
    ),
  }),
  compose({
    id: "RC1",
    title: "RC1 16th-Note Funk",
    objective: "A 16th-note funk pocket with ghost notes, a syncopated bass and horn stabs.",
    opensAfter: { checkpoints: ["R.CP"] },
    meter: "4/4",
    bpm: [90, 115],
    brief: "A one-chord funk vamp: ghosted 16ths, a syncopated bass that still hits the one, and horn stabs.",
    starter: `setcpm(100/4)\n\nkick: s("bd ~ ~ bd ~ ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*16").velocity("[1 .35 .6 .35]*4")\nbass: note("⟪c2 ~ ~ c2 ~ eb2 ~ g2⟫").s("fingerbass").lpf(800)`,
    skills: ["R14", "R15", "R10"],
    rubric: [
      req("ghosts", "At least 4 ghost notes on 16th off-beats", ["R14"], {
        rule: "velocity-ghosts",
        track: "@drums",
        min: 4,
        on: "16th-offbeat",
      }),
      req("syncopated-bass", "Bass with 3+ onsets off the 8th grid", ["R10"], {
        rule: "syncopation",
        track: "@bass",
        min: 3,
      }),
      req("one", "Bass and kick on the one of every bar", ["R14"], custom("bass-kick-downbeat")),
      req(
        "horns",
        "A horns track with stabs",
        ["R14"],
        custom("horn-stabs", { label: "horns", min: 2, per: 2 }),
      ),
    ],
    sessions: [
      [
        "Pocket",
        "Drums and bass pocket on a one-chord minor-seventh vamp (minor pentatonic; Dorian only once U14.L03 has unlocked it).",
      ],
      [
        "Stabs",
        "Clav and horn stabs on a `horns:` track (the `horns` sound unlocks at the start of this session if U15.L05 has not unlocked it yet); release.",
      ],
    ],
    canDo: ["cd.compose.funk"],
    hints: ladder(
      "Where does funk put its weight?",
      "Everything meets on the one; the rest dances around it.",
      'Ghost the hats with `.velocity("[1 .3 .6 .3]*4")`.',
    ),
  }),
  compose({
    id: "RC2",
    title: "RC2 Clave & Polyrhythm",
    objective:
      "Son clave 3-2 on the 2-bar 8th grid with tresillo bass, a 3:2 layer and Euclidean percussion.",
    opensAfter: { checkpoints: ["R.CP"] },
    meter: "4/4",
    bpm: [90, 130],
    brief:
      "A son clave groove, 3-2, at least 8 bars, with a tresillo bass, a 3-against-2 layer and a Euclidean rhythm.",
    starter: `setcpm(110/4)\n\nperc: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")\nbass: note("c2(3,8)").s("ebass").lpf(700)`,
    skills: ["R18", "R17"],
    rubric: [
      req("clave", "Son clave 3-2 for 8+ bars", ["R18"], {
        rule: "clave",
        track: "perc",
        type: "son",
        direction: "3-2",
      }),
      req("bars", "At least 8 bars", ["R18"], { rule: "bars", min: 8 }),
      req("tresillo", "Tresillo in the bass on the 3-side", ["R18"], custom("tresillo-bass")),
      req("poly", "A 3:2 layer between two tracks", ["R17"], {
        rule: "polyrhythm",
        a: "perc2",
        b: "drums",
        ratio: [3, 2],
      }),
      req("euclid", "A Euclidean rhythm", ["R18"], { rule: "uses", tool: "tb.mini.euclid", min: 1 }),
    ],
    sessions: [
      ["Clave & tresillo", "Son clave 3-2 on the 2-bar 8th grid with tresillo bass."],
      ["Layers", "A 3:2 layer and Euclidean percussion; release."],
    ],
    canDo: ["cd.compose.clave"],
    hints: ladder(
      "Which side of the clave has three hits?",
      "Bar A: 0, 3/8, 6/8. Bar B: 2/8, 4/8.",
      "Tresillo is `(3,8)`.",
    ),
  }),
  compose({
    id: "AC1",
    title: "AC1 One Tune, Two Genres",
    objective: "St. Louis Blues or Sweet Georgia Brown arranged twice, in two genres.",
    opensAfter: { checkpoints: ["A.CP", "U11.CP"] },
    meter: "4/4",
    bpm: [60, 180],
    brief:
      "Arrange one public-domain tune twice, in two genres: same melody, different tempo or feel, different instruments.",
    starter: `setcpm(100/4)\n\nmel: n("⟪0 2 4 2⟫").scale("G4:major").s("piano")`,
    skills: ["D09", "F06"],
    rubric: [
      req(
        "melody",
        "Both versions keep the tune's melody",
        ["D09"],
        custom("melody-matches-song", {
          songs: ["song.st-louis-blues", "song.sweet-georgia-brown"],
          pitch: "pitch-class",
        }),
      ),
      req(
        "differ",
        "The two versions differ in tempo or feel, and in instruments",
        ["D09"],
        custom("two-versions-differ", { tempoDelta: 20, soundsDiffer: 2 }),
      ),
      req("sound-design", "Each version uses a sound-design tool", ["D02", "D03"], {
        rule: "uses",
        tool: [
          "tb.lpenv",
          "tb.adsr",
          "tb.hpf",
          "tb.bpf",
          "tb.lpq",
          "tb.roomsize",
          "tb.delaytime",
          "tb.delayfeedback",
          "tb.orbit",
          "tb.crush",
          "tb.coarse",
          "tb.vib",
          "tb.phaser",
          "tb.fm",
          "tb.unison",
          "tb.pw",
        ],
        min: 1,
      }),
    ],
    sessions: [
      ["Version one", "St. Louis Blues (1914) or Sweet Georgia Brown (1925), version one."],
      ["Version two", "Version two in the other flavour."],
      ["Compare & polish", "Compare, polish, release."],
    ],
    canDo: ["cd.compose.two-genres"],
    hints: ladder(
      "What stays the same when a song changes genre?",
      "The melody's pitch classes stay; tempo, feel and sounds move.",
      "Try the second version 30 BPM slower with swing.",
    ),
  }),
  compose({
    id: "AC2",
    title: "AC2 Neo-Soul Ballad",
    objective: "maj9/m11 changes, a swung-16th groove with .late() feel, and a mix.",
    opensAfter: { checkpoints: ["A.CP"], lessonsCompleted: ["J3.L04", "R1.L05"] },
    meter: "4/4",
    bpm: [60, 90],
    swing: { subdivision: 16, amount: 0.2 },
    brief:
      "A neo-soul ballad: ninth and eleventh chords on Rhodes, smooth voice leading, and a swung 16th groove that leans back.",
    starter: `setcpm(76/4)\n\nhats: s("hh*16").swingBy(.2, 8).gain(.5)\nsnare: s("~ sd ~ sd").late(1/32)\nchords: chord("<D^9 Em11 F#m7 Bm9>").voicing().s("rhodes")`,
    skills: ["D09", "D10", "J02"],
    rubric: [
      req(
        "extensions",
        "A 9th or 11th in 60% of the bars",
        ["J02"],
        custom("extended-chord-share", { min: 0.6 }),
      ),
      req("swing", "Swung 16ths on the hats", ["R13"], {
        rule: "swing",
        track: ["hats", "@drums"],
        subdivision: 16,
        ratio: [1.2, 2.4],
      }),
      req("voice-leading", "Top voice moves by 2 semitones or less", ["C05"], {
        rule: "voice-leading",
        track: "@chords",
        maxMovePerVoice: 2,
      }),
      req("rhodes", "Rhodes in the mix", ["D01"], { rule: "sounds", contains: ["snd.rhodes"] }),
    ],
    sessions: [
      ["Changes & voicings", "maj9/m11 changes and voicings (choir unlocks at the start)."],
      ["Groove & melody", "Swung-16th groove with `.late()` feel; melody."],
      ["Mix", "Mix and release."],
    ],
    canDo: ["cd.compose.neo-soul"],
    hints: ladder(
      "How does a groove sound laid back?",
      "Late snares, swung 16ths.",
      "`.late(1/32)` on the snare, `.swingBy(.2, 8)` on the hats.",
    ),
  }),
];
export default capstones;

export const capstoneById: ReadonlyMap<string, CapstoneDef> = new Map(
  capstones.map((c) => [c.id, c] as const),
);

/** The registry rows the syllabus and the planner read. */
export const capstoneMetas: CapstoneMeta[] = capstones.map((c) => ({
  id: c.id,
  title: c.title,
  objective: c.objective,
  sessions: c.sessions,
  opensAfter: c.opensAfter,
  ...(c.inGymSlots ? { inGymSlots: true } : {}),
  kind: c.kind,
}));
