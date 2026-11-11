// U00 Onboarding: the unit spec (rendered to content/specs/U00.md by `bun scripts/content/spec.ts`).
import type { UnitSpec } from "./types.ts";

const C = { tonic: "C", mode: "major" } as const;

/** The onboarding loop (STYLE §14, ux §8): one of the four preview contexts (contracts §3.1 rule 5a). */
export const ONBOARDING_LOOP =
  'setcpm(92/4)\n\ndrums: s("bd ~ sd ~, hh*8").bank("RolandTR808").gain(.8)\nbass: note("<c2 a1 f1 g1>").s("ebass").lpf(800)\nchords: chord("<C Am F G>").voicing().s("rhodes").gain(.5)\nmel: n("<[4 ~ 2 4] [0 ~ ~ 2] [5 ~ 3 5] [4 ~ ~ ~]>").scale("C4:major").s("piano")';

export const U00: UnitSpec = {
  unit: "U00",
  title: "Onboarding",
  summary:
    "Two short sessions before the course proper. U00.L01 is the wow: a four-layer loop, one number changed by the learner, the tutor's first words and Sketch 001, in about eight minutes. U00.L02 sets up headphones, microphone, timing and voice range, ends with a lenient first sung note, and brings the loop back for a second sketch. Both run on the onboarding loop, the one place where every tool may appear before it is unlocked (contracts §3.1 rule 5a).",
  conventions: [
    "Both lessons use the onboarding loop (`ONBOARDING_LOOP` in content/specs/U00.ts, the STYLE §14 opener with named labels). Copy it into the lessons as a constant; do not vary it between U00.L01 and U00.L02. content:check and the grader treat all U00 code as a preview context (`ONBOARDING_PREVIEW` in content/validate/harness.ts), so its locked tools lint clean there and nowhere else.",
    "The learner edits only `n` values in the melody line (the 'one editable number' of rule 5a): mark them as editable regions (`⟪…⟫`) and use `edit-only-regions` where a step is checked. No other tool is taught or named: the Coda's Toolbox ceremony, not the prose, says what unlocks.",
    'Setup screens (headphones, mic, noise, bleed, tap latency, range) are app screens from ux §4.7, mounted inside `concept` steps with the MDX component `<Setup part="…" />` (content/lib/mdx.ts). They store the learner profile; the lesson does not grade them.',
    "U00 Makes need no Band: the onboarding loop is already a full band. Set `ui.band: false` with a one-line reason comment.",
    "Voice: this is the learner's first ten minutes. Short sentences, no theory words before their sound (no 'tonic', 'scale', 'degree', 'chord' as teaching), no promises about what the app hears beyond what it measures. Mic copy, verbatim: 'Your voice is analysed live on this computer. Nothing is recorded or sent.'",
  ],
  lessons: [
    {
      id: "U00.L01",
      author: "U00",
      idea: "Code makes music here: each line is a musician, and changing one number changes what you hear.",
      hook: {
        hear: "The onboarding loop building up: drums alone, then bass, then chords, then the piano melody (one listen item per layer).",
        code: ONBOARDING_LOOP,
        preview: true,
      },
      key: C,
      meter: "4/4",
      bpm: 92,
      canDo: ["cd.code.first-loop"],
      uses: ["tb.label", "tb.feature.transport", "tb.feature.roll", "tb.feature.studio", "tb.feature.tutor"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "Four items: drums; + bass; + chords; + melody (the loop builds up). Roll in part colours, no staff.",
          term: "term.loop",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice"],
          minutes: 0.75,
          what: "Mute lines with the buttons: which line plays the lowest notes? (bass) Which sounds like a piano?",
          term: "term.timbre",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1,
          what: "Change the highlighted last melody number (`⟪4⟫`) to any number from 0 to 7 and run. Not graded: any change passes (`edit-only-regions`, `max-changed-tokens` 1); the unchanged starter fails with `code.unchanged`.",
        },
        {
          kind: "concept",
          minutes: 0.75,
          what: "Meet the tutor: it is docked on the right and knows this lesson; one suggested question. The connection card (API key or Claude login) is the onboarding flow's `onb.tutor` screen, skippable.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 1.5,
          what: "Sketch 001: change anything in the melody line, then save.",
        },
      ],
      wrapAt: 3,
      make: {
        brief: "Make the loop yours: change any of the melody's numbers, run it, and save it as Sketch 001.",
        required: {
          rule: "tracks",
          label: "The loop still plays (at least two parts)",
          why: "`tracks` min 2. Saving is never blocked; the rule only catches a loop the learner emptied by accident.",
        },
        suggestions: ["the melody changed (no generic rule: leave it to the tutor's first note)"],
        band: false,
        flavours: "No Band; the flavour choice is made later in onboarding (`onb.prefs`).",
      },
      srs: [],
      mistakes: [
        "unchanged starter in the modify: `code.unchanged`",
        "edited outside the highlighted number: `code.edit-outside`",
      ],
      connects: {
        back: "Nothing: this is the first screen after 'Start sound'.",
        forward: "U00.L02 sets up the ears and the voice; U01.L01 takes the drums apart.",
      },
      notes: [
        "The deterministic reaction keyed by the chosen number (ux §8 `onb.react`, 8 variants) is app copy owned by the onboarding flow; the lesson's own pass text stays general and true for every value.",
        "Two terms: `term.loop` (S1 pass text, after the loop has played) and `term.timbre` (S2).",
      ],
    },
    {
      id: "U00.L02",
      author: "U00",
      idea: "Oak can hear your taps and your voice; your first sung note finds the place the loop calls home.",
      hook: {
        hear: "The onboarding loop, softly, under the setup screens; it returns at the end for the second sketch.",
        code: ONBOARDING_LOOP,
        preview: true,
      },
      key: C,
      meter: "4/4",
      bpm: 92,
      canDo: ["cd.sing.first-note"],
      uses: ["tb.feature.tuner", "tb.label"],
      steps: [
        {
          kind: "concept",
          minutes: 1,
          what: 'Headphones on: `<Setup part="headphones" />` (L/R test, device type, AirPods and Bluetooth guidance).',
        },
        {
          kind: "concept",
          minutes: 1.25,
          what: 'Microphone: `<Setup part="mic" />`, `<Setup part="noise" />`, `<Setup part="bleed" />`, with the privacy line.',
        },
        {
          kind: "concept",
          minutes: 1,
          what: 'Tap timing: `<Setup part="tap-latency" />` (16 clicks at 90 BPM).',
        },
        {
          kind: "concept",
          minutes: 1.5,
          what: 'Your voice: `<Setup part="range" />` and `<Setup part="sing-latency" />`.',
        },
        {
          kind: "sing",
          exercise: "sing",
          answer: ["mic"],
          minutes: 1.25,
          what: 'First sung note: the note plays first, then the learner sings it (`fam.pit.match` level 1 stimulus, `mode: "pitch"`, `fallback: "skip"`). Lenient by design (see notes).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2,
          what: "Sketch 002: the loop again; make the melody end on the note you just sang (home).",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The loop is back, and this time the band ends on its home chord (bar 4: C instead of G, so the home note is not a sus4 over G). Change the last melody number so the tune ends on the note that feels like home too, then save.",
        required: {
          rule: "ends-on-degree",
          label: "The melody ends on the home note",
          why: "`ends-on-degree` [\"1\"] on `mel`: the learner's ear found home in the sing step; the code makes it land there (`0` or `7`). The word 'degree' stays out of the prose.",
        },
        suggestions: [],
        band: false,
        flavours: "No Band.",
      },
      srs: [{ family: "fam.pit.match", mode: "seed" }],
      mistakes: ["unchanged loop (ends on 5): `rubric.unmet`"],
      connects: {
        back: "U00.L01's loop and its editable melody numbers.",
        forward:
          "U01.L01 starts the course with the pulse; singing returns in U02.L07 and from U03.L02 on numbers.",
      },
      notes: [
        "Contracts §2.3 asks for 'any sustained pitch within ±100¢ after octave folding'. `SingTolerance.cents` tops out at 70 in the schema; use `cents: 70, octave: \"global\"` and report the gap (the schema needs a calibration value of 100).",
        "The sing step is never graded (`graded` unset) and never blocks: Quiet mode or no microphone skips it.",
        "Sing tests are pending in content CI (no recorded fixtures).",
      ],
    },
  ],
  capstones: [],
};
