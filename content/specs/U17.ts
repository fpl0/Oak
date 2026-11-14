// U17 Modulation: the unit spec (rendered to content/specs/U17.md by `bun scripts/content/spec.ts`). Four
// lessons, the checkpoint over U15–U17 (U17.CP) and the capstone it opens, C7 "Chromatic Colour". Every hook
// was evaluated with headless Strudel and is linted in its lesson by content/validate/specs.test.ts; U17.L02 is
// the exemplar, written and passing with the real grader (content/core/U17/L02). The C7 pieces quoted in its
// notes were evaluated, linted in C7's unlock context and graded with the rules the grader runs today.
import type { UnitSpec } from "./types.ts";

const C = { tonic: "C", mode: "major" } as const;
const F = { tonic: "F", mode: "major" } as const;
const T = (bpm: number) => `setcpm(${bpm}/4)\n\n`;

/** What every U17 lesson has from U01–U16 (chords by name, one `const` for the changes, the key as a pattern). */
const BASE = [
  "tb.setcpm",
  "tb.label",
  "tb.mini.seq",
  "tb.mini.rest",
  "tb.mini.sub",
  "tb.mini.alt",
  "tb.mini.repeat",
  "tb.mini.replicate",
  "tb.gain",
  "tb.n",
  "tb.n.range",
  "tb.scale",
  "tb.scale.patterned",
  "scale.major",
  "tb.note.accidentals",
  "tb.s.pitched",
  "snd.piano",
  "tb.struct",
  "tb.const",
  "tb.chord",
  "tb.voicing",
  "chord.triad",
  "tb.feature.degree-labels",
  "tb.feature.rn",
  "tb.feature.chord-symbols",
] as const;
/** The Rhodes over an upright bass, both read from one string (U08.L04, U12): L01 and L03. */
const TRIO = ["snd.rhodes", "snd.upright", "tb.rootNotes", "chord.dom7"] as const;
/** The pop band of L02 and L04: piano chords, a filtered electric bass. */
const POP = ["snd.ebass", "tb.lpf"] as const;
const SECTIONS = ["tb.arrange", "tb.lens.form"] as const;

/** One string drives the chords and the bass (U08.L04): Rhodes above, upright below. */
const trio = (form: string, mel: string) =>
  [
    `const changes = "${form}"`,
    "",
    'chords: chord(changes).voicing().s("rhodes")',
    'bass: chord(changes).rootNotes(2).s("upright")',
    mel,
  ].join("\n");

/** U17.L01: four bars in C, then C, Am (vi in C, ii in G), D7 and G. The tune ends on G, the new home. */
const PIVOT_HOOK = trio(
  "<C Am F G C Am D7 G>",
  'mel: n("<[2 ~ 4 2] [0 ~ ~ ~] [3 ~ 5 3] [4 ~ ~ ~] [2 ~ 4 2] [0 ~ 2 ~] [4 ~ 6 4] [7 ~ ~ ~]>").scale("<C4:major!6 G3:major!2>").s("piano")',
);
/** U17.L03: the same opening, but Am turns out to be home: E7 brings G♯ and the phrase ends in A minor. */
const RELATIVE_HOOK = trio(
  "<C Am F G C Am E7 Am>",
  'mel: n("<[4 ~ 2 4] [2 ~ 0 ~] [5 ~ 3 5] [4 ~ ~ ~] [4 ~ 2 4] [2 ~ 0 ~] [4 ~ 6 4] [7 ~ ~ ~]>").scale("<C4:major!6 A3:harmonic:minor!2>").s("piano")',
);

/** U17.L02 (the exemplar's song): verse, chorus, and the chorus a whole step up. */
const LIFT_SONG = [
  'const chordsVerse = chord("<C Am F G>").voicing().struct("x ~ x ~")',
  'const chordsChorus = chord("<C G Am F>").voicing().struct("x*4")',
  'const chordsChorus2 = chord("<D A Bm G>").voicing().struct("x*4")',
  'const bassVerse = n("<0 5 3 4>").struct("x ~ ~ x")',
  'const bassChorus = n("<0 4 5 3>").struct("x ~ x x")',
  'const melVerse = n("<[2 ~ 2 1] [0 ~ ~ ~] [3 ~ 3 2] [1 ~ ~ ~]>")',
  'const melChorus = n("<[4 ~ 4 5] [4 ~ 1 ~] [5 ~ 5 7] [7 ~ 5 ~]>")',
  "",
  'chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsChorus2]).s("piano")',
  'bass: arrange([4, bassVerse], [4, bassChorus], [4, bassChorus]).scale("<C2:major!8 D2:major!4>").s("ebass").lpf(700)',
  'mel: arrange([4, melVerse], [4, melChorus], [4, melChorus]).scale("<C4:major!8 D4:major!4>").s("piano")',
].join("\n");

/** U17.L04: a pop chorus in F and the same chorus a whole step up, in G: the tune to take down. */
const POP_LIFT = [
  'chords: chord("<F Dm Bb C G Em C D>").voicing().struct("x ~ x ~").s("piano")',
  'bass: n("<0 5 3 4>").struct("x ~ x x").scale("<F2:major!4 G2:major!4>").s("ebass").lpf(700)',
  'mel: n("<[2 ~ 4 2] [0 ~ 2 ~] [3 ~ 5 3] [1 ~ ~ ~]>").scale("<F4:major!4 G4:major!4>").s("piano")',
].join("\n");

const DRUMS_ONLY = "Drums from the Band in the flavour's kit (jazz-soul and funk swing them).";

export const U17: UnitSpec = {
  unit: "U17",
  title: "Modulation",
  summary:
    'Four lessons on the last harmonic idea of the core: a song can move its home. U15 visited other chords for a bar (a secondary dominant and its target) and U16 borrowed colours from the parallel minor; in both, C stayed home. In U17 home itself moves, and every way of moving it arrives as a sound the learner knows from records before it gets a name. U17.L01: the smooth way, through a chord both keys own (the pivot chord), from C to G. U17.L02 (the exemplar): the blunt way, the last chorus that simply starts again a step higher, written with a patterned `.scale("<C4:major!8 D4:major!4>")` after `arrange()`. U17.L03: hearing it, in three questions (is the old do still home, where did the first new note arrive, was there a door), with the drill family `fam.har.modulation` seeded. U17.L04: taking a tune down through its key change, first a pop chorus that lifts, then the bridge of Body and Soul (1930), which leaves D♭ for D. In the default order the lessons are sessions 172–175; GYM.16 (176) separates them from U17.CP (177), the checkpoint over U15–U17, which opens C7 "Chromatic Colour" (sessions 178–180: colour chords, melody and sections, the final-chorus key lift and the release) and the jazz unit J5. C7\'s release opens CF-A, the album single that ends the core.',
  conventions: [
    'A key change in code is a pattern in `.scale()` (contracts §6.8, STYLE §9): `.scale("<C4:major!8 D4:major!4>")` holds C major for eight bars, then D major for four. `!n` counts bars of the whole piece. Lessons call that string the line\'s key plan (plain words, not a glossary term). The numbers in `n()` never change: the same degrees in a new key. `.transpose()` after `.scale()` moves the notes and leaves the key context behind, so it is never taught as a key change: the lint warns (`code.transpose-after-scale`) and every graded step that could be solved with it carries `must-not-use tb.transpose` (verified: without the constraint the `events` matcher passes it, because the notes are right).',
    "In a piece with sections the key plan follows `arrange()` on each line written in degrees, and the section consts are bare `n()` patterns: inside `arrange()` a section starts again from its own first bar each time it plays, so a plan written inside a section const never reaches its second key (`code.arranged-scale-pattern`; verified: the piece evaluates and plays the first key throughout). The learner's own sketches since U09.L02 carry `.scale()` inside their section consts, so U17.L02 S6 teaches the move: delete it there, write one plan after `arrange()`.",
    'Chords written by name do not follow a key plan (a name is not a number): the lifted section gets its own const with every name moved up, and that const is a VARIANT of the section it lifts, named with a digit: `chordsChorus2` (STYLE §10 rule 1). Verified with the lint and the grader: a const named `chordsLift` beside `bassChorus` and `melChorus` is `form.inconsistent-arrange` ("section 3 is a chorus in bass and a lift elsewhere"), because every arranged track must list the same sections; `chordsChorus2` reads as a chorus. Use the `…Lift` names only when every track has one. A bass on `.rootNotes(2)` of the same string lifts with the names; a bass or a tune in degrees needs the key plan.',
    'The words of the unit: modulation and pivot chord (U17.L01), direct modulation (U17.L02). "The truck-driver\'s gear change" is said once in U17.L02\'s pass text as what players call a last-chorus lift; it is a nickname, not a term, and never appears in a prompt or a label. A secondary dominant (U15.L02) and a tonicization (U15.L04) are a visit: the music comes back to the old home. A modulation is a move: the new home is confirmed by its own V and the music stays. Lessons say "visit" and "move". Words that wait or are not taught in the core: common-tone and enharmonic modulation, "ii–V–I" as a named gesture (J1.L03; U17.L01 writes vi/ii, V7, I in numerals), "tritone substitution" (J track).',
    "The destinations, one per lesson, each a neighbour or a lift: C to G through Am (U17.L01: the dominant, one sharp away, four shared triads: C, Em, G and Am, `pivotChords` of @oak/theory); C to D (U17.L02: a whole step, two sharps away, only Em and G shared, which is why the lift needs no door and gets none), with the half-step lift to D♭ by ear; C to A minor through its own V, E7 (U17.L03's Make: the relative minor, U10.L02's twin key, now arrived at instead of started in); D♭ to D, a half step, at the bridge of a standard (U17.L04). Keys of the lessons: C major, except U17.L04 (F major, then D♭ for the standard).",
    'Reading across a key change: degrees, syllables and numerals of a bar belong to the key in force at that bar. An exercise whose example or answer changes key declares `keyPlan` (AUTHORING §19.7, planned feature `key-plan`), and the chord band, the key lens and the lead sheet then read each bar in its key (I V vi IV before and after a lift). Until the feature is implemented, a step that reads the notes across a change sets `rollLabels: "note"` and overrides `melody.wrong-degree` with text that names the bars and the two keys, as the exemplar does: the catalog text would word a wrong note of the lifted bars in degrees of the first key.',
    'Grading (AUTHORING §19.7): a lifted or modulating line is an `events` match in absolute pitch on every track; "where does it change" is `bar-buttons`; "how" is a `choice` with `KEY_CHANGE_OPTIONS` (offer `pivot` from U17.L01, `direct` from U17.L02); "to what key" is a `text` answer with `normalize: "key"`; a pivot chord named in two keys is an `rn-palette` with `labels` and `slotKeys` (planned, `rn-palette.slot-keys`). In a Make: a lift is `in-key` on the `last` section (implemented: every pitched note of the last chorus in the new key; it is the rule that sees chord names left behind); a move through a pivot is `modulation` with `to` and `via: "pivot"` (planned rule, planned field). C7\'s `key-change` (planned) reads the key from the lines in degrees and compares the tune\'s degrees before and after; it does not look at the chord names.',
    "The Band: every Make takes the drums of `band.axis-4bar` (`tracks: [\"drums\"]`) and keeps chords, bass and tune in the learner's code, where the rules read them (AUTHORING §8 rule 5); a Band's own chords would stay in the old key. The jazz-soul and funk kits swing the drums, so starters keep chords and bass on the beats (no straight eighths that would flam against a swung hat).",
    "Singing: only U17.L03 has a sung step (the old do, then the new do), on syllables with numbers shown, never graded, never gating; Quiet mode picks the notes instead. Movable do means what it says: after a modulation the new home is do. The learner is told so in that step, and is never asked to sing a line across the change itself.",
    'Ear training, stage F (contracts §7.3): `fam.har.modulation` ("Did it change key?", `bar-buttons`: no key change, or the bar where the new key begins) is seeded in U17.L03 at level 1 (a lift by a half or a whole step, or no change); level 2 adds the relative minor through its V, level 3 the dominant through a pivot. Its lifts are a half step as often as a whole step, which is why U17.L02 compares the two by ear. `fam.har.chromatic` (U15.L06, level 3 from U16.L05) and `fam.deg.fet-chromatic` (U15.L01) keep running in the warm-ups; U17 seeds no fact deck.',
    'Scaffolds (AUTHORING §6, U11 and later): the chord band is opened by the steps that read chords across a change (`initialPanels: ["chords"]`), the form lens by the steps with sections (`["form"]`); the key lens (`keyPlan` of docs/design/wave6.md §4.3, a ribbon naming the key in force) is the learner\'s to switch and draws itself whenever a piece has more than one key. Roll labels are the learner\'s choice except where the sixth convention sets them. U17\'s Play from the page step is U17.L01 S6: four bars of lead sheet that move from F to C, written in code.',
    "Repertoire (contracts §2.8): Body and Soul (J. Green, 1930; in the US public domain since 1 January 2026) is used in U17.L04 only, in Oak's rendition from the answer key author:repertoire verifies against the 1930 print: the end of the second A section in D♭ and the first four bars of the bridge in D. No lyric is quoted and no recording is named. Everything else in the unit is Oak's own material; prose may say \"records\" and never names one.",
    'Feedback the grader emits on U17 steps (pin what `bun run content:check <id> --verbose` prints): `melody.wrong-degree` (a note of a lifted line that differs: a plan counted per section, a half step for a whole step, a line left in the old key; overridden as the sixth convention says), `melody.octave` (the new key an octave off: `D5:major` for `D4:major`), `code.must-not-use` with `code.transpose-after-scale` (a key change by `.transpose()`), `code.arranged-scale-pattern` (the plan inside a section const), `form.inconsistent-arrange` (a lifted const named as another section), `harmony.pcset` (a named chord with other notes: `D` or `Dm` for `D7`), `harmony.rn-degree` and `harmony.rn-case` (a numeral read in the wrong key, or a major numeral for a minor chord), `investigate.wrong`, `id.wrong` (overridden where the option ids would show), `code.edit-outside`, `code.unchanged`, `rubric.unmet` (overridden with the neutral "{label}: not yet.").',
    "Gates and order (contracts §7.6): all of U17 needs U14.CP passed or soft-passed (U15 and U16 have no checkpoint of their own). U17.CP follows GYM.16, so it falls on a later day than U17.L04; passing or soft-passing it opens C7 and J5. C7 never gates anything except CF-A, which opens when C7 is released.",
  ],
  lessons: [
    {
      id: "U17.L01",
      author: "U17a",
      idea: "A song can leave home and make another note home: that is a modulation. The smooth way goes through a chord that both keys own, the pivot chord: A minor is vi in C and ii in G. After it comes the new key's own V7 (D7, with the F♯ that C major does not have), and G is home.",
      hook: {
        hear: "Eight bars on the Rhodes over an upright bass. Four in C: C, Am, F, G. Then C and Am again, and where the ear expects F and G it gets D7 and G instead. The tune comes to rest on G, and G sounds like home: the move a pre-chorus makes on a soul record.",
        code: `${T(96)}${PIVOT_HOOK}`,
      },
      key: C,
      meter: "4/4",
      bpm: 96,
      canDo: ["cd.write.pivot-modulation"],
      uses: [...BASE, ...TRIO],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "Two items over the Band's drums, eight bars each: the phrase that stays (`<C Am F G C Am F G>`, ending on G as the chord that wants C), then the hook (`<C Am F G C Am D7 G>`, ending on G as home). The same last chord, two meanings.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "`<C Am D7 G>`: D7 holds one note that C major does not have. Which? (`choose`: F♯, the note a half step below G / B♭ / C♯)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          features: ["key-plan"],
          minutes: 1,
          panels: ["chords"],
          what: "Run the hook with the chord band and the key lens: which chord of bars 5–8 belongs to both C major and G major (choice: Am; D7 / G7); in which bar does the first note from outside C major sound (number: 7). The exercise declares `keyPlan` (C from bar 1, G from bar 7), so the band reads Am as vi and the last two chords as V7 and I.",
          term: ["term.modulation", "term.pivot-chord"],
        },
        {
          kind: "quiz",
          exercise: "fact",
          answer: ["rn-palette"],
          features: ["rn-palette.slot-keys"],
          minutes: 1,
          graded: true,
          what: 'One chord, two names: Am as a numeral in C major and in G major (`rn-palette`, `slots: 2`, `allow: ["triads"]`, `labels: ["In C major", "In G major"]`, `slotKeys`; `correct.rn` vi, ii).',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: 'Write the door: `const changes = "<C Am F G C Am ⟪F G⟫>"`, with a tune whose key plan already ends in G. Replace the last two chords so the phrase lands in G through its own V7 (`D7 G`; `pcset` per onset with the bass on `chords`, `edit-only-regions`; the target is audible and its roll appears after a failed try).',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          features: ["lead-sheet", "key-plan"],
          minutes: 1.5,
          graded: true,
          what: 'Play from the page: a lead sheet only (no code, no roll), four bars that move from F major to C major, chords F, Dm, G7, C over a tune, with the new key signature after the double bar. Write the chords and the bass in code (`chord("<F Dm G7 C>")`, `pcset` per onset with the bass; exercise key F, `keyPlan` F from bar 1 and C from bar 3). Dm is the pivot: vi in F, ii in C.',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "A verse that leaves home: eight bars in C that end in G through a pivot chord, with the learner's own tune.",
        },
      ],
      wrapAt: 5,
      make: {
        brief:
          'A verse that goes round twice and stays in C: `"<C Am F G C Am F G>"`, with a bass on the roots and a tune. Make the second time leave home: keep Am as the door, then bring in G\'s own V7 and land on G. Give the tune a key plan so its last two bars are in G, and end it on the new home. Then make it yours: another pivot (Em or C would also open the door), a longer stay in G, a new tune.',
        required: {
          rule: "modulation",
          label: "The verse ends in G major, reached through a chord both keys share",
          why: '`modulation` with `to: "dominant"` and `via: "pivot"` (planned rule, planned field `modulation.via`): the piece ends a 5th above the key it starts in, and the last chord before the new key\'s first dominant belongs to both keys. The starter stays in C and fails; `<C Am F G C Am D7 G>` with the last two bars of the tune in G passes; a jump to G with no shared chord before D7 and a lift to D both fail. The author writes these as tests and pins what the grader says once the rule is listed.',
        },
        suggestions: [
          "the tune ends on the new home, G (`ends-on-degree` 1, read in the key in force at the last bar)",
          'the bass on each chord\'s root (`bass-line`, `roots: { on: "change", minRatio: 0.75 }`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: `${DRUMS_ONLY} The starter is on \`rhodes\` and \`upright\`; the pop and indie flavours take \`piano\` and \`ebass\`.`,
      },
      srs: [
        { family: "fam.har.rn", mode: "review-if-due", level: 5 },
        { family: "fam.key.circle", mode: "review-if-due", level: 1 },
      ],
      mistakes: [
        "pivot: the numerals swapped (ii in C, vi in G) or both read in C (vi, vi): `harmony.rn-degree`; `VI` for `vi`: `harmony.rn-case`",
        "the door: `Dm G` (ii–V of C: the phrase never leaves) and `D G` (the triad, no 7th): `harmony.pcset`; `G D7` (the two swapped): `harmony.pcset` on both bars; the unchanged starter: `code.unchanged`; the tune's line edited: `code.edit-outside`",
        "from the page: the chords of F major only (`<F Dm Gm C>`: Gm for G7, B♭ where the page has B): `harmony.pcset`",
        "investigate: D7 chosen as the shared chord, or bar 5 or 6: `investigate.wrong`",
        "Make: the starter, and a verse that jumps to G with no shared chord before D7: `rubric.unmet`",
      ],
      connects: {
        back: "U15.L02 met this very chord: D7 before G in the key of C was V7/V, a one-bar visit that came straight home. Today the same D7 arrives after a chord that already belongs to G, and the music stays. U03.L07's circle of fifths said that C and G are neighbours; U06.L02's numerals are what gives Am two names.",
        forward:
          "U17.L02 changes key with no door at all: the last chorus a step higher. U17.L03 trains the ear to tell a visit from a move and to find the bar where home changes.",
      },
      epr: {
        enjoyment:
          "An eight-bar verse on the Rhodes that sets out from C and, without a bump, ends at home in G under the learner's own tune: the first time their music goes somewhere and does not come back.",
        pace: "One idea: a chord with two names is a door between two keys. Only one pair of keys (C to G) and one door (Am) are graded; the relative minor as a destination waits for U17.L03's Make, the lift for U17.L02, and hearing a move by ear for U17.L03.",
        return:
          "The Coda says: you can now change key through a chord both keys share. Next: the key change that needs no door, the last chorus that lifts.",
      },
      notes: [
        "Evaluated: the hook voices D7 as F♯3 C4 D4 F♯4 C5 over D2 and the tune plays D4 F♯4 D4 in bar 7 and G4 in bar 8 (`G3:major` keeps the tune in the register of `C4:major`; `n` 7 is G4).",
        "`pivotChords` (@oak/theory): C major and G major share C (I / IV), Em (iii / vi), G (V / I) and Am (vi / ii). The lesson grades Am only; the Make's brief names Em and C as other doors.",
        'Tonicization against modulation is said in sound, not as a rule: play the U15.L02 version (`<C Am D7 G C …>`, straight back to C) beside the hook in the listen step\'s captions if the budget allows. The words are "a visit" and "a move".',
        "S3, S4 and S6 use planned shapes (`key-plan`, `rn-palette.slot-keys`), and the Make a planned rule (`modulation`, `modulation.via`): the lesson fails check 2 until the grader and the answers engineer list them. S5 is graded with implemented shapes only. If `rn-palette.slot-keys` does not land, S4 becomes an `all` of two `rn-palette` parts, each with its own `key`.",
        'Play from the page (AUTHORING §4): the starter is staff-only (`panels: { roll: false, staff: "lead", keyboard: false }`, `leadSheet`), and the staff writes the signature of C after a double bar at bar 3 (`keyChangesOf(keyPlan)`, docs/design/wave6.md §3.3).',
      ],
    },
    {
      id: "U17.L02",
      author: "spec-U17",
      idea: 'The last chorus can simply start again a step higher, with no chord to prepare it: a direct modulation. In code the key of a line written in degrees is a pattern, `.scale("<C4:major!8 D4:major!4>")`: the numbers stay, the key moves. In a song with sections that key plan goes after `arrange()`, and chords written by name get new names.',
      hook: {
        hear: "A small pop song over the drums: a verse in C, the chorus, and at bar 9 the chorus once more, a whole step higher, in D. Piano chords, a pumping electric bass and the tune all rise together. The lift arrives inside the first twenty seconds.",
        code: `${T(112)}${LIFT_SONG}`,
      },
      key: C,
      meter: "4/4",
      bpm: 112,
      canDo: ["cd.code.key-lift"],
      uses: [...BASE, ...POP, ...SECTIONS, "snd.rhodes", "snd.strings"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          panels: ["form"],
          what: "One item, twelve bars over the Band's drums: verse, chorus, and the chorus again in D. The caption names the bar (9) and the distance (a whole step).",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: 'The chorus tune alone with `.scale("<C4:major!4 D4:major!4>")`: what will bars 5 to 8 play? (`choose`: the same tune, every note a whole step higher / a different tune / the same notes as before)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: 'The chorus twice, `chord("<C G Am F D A Bm G>")` over a bass and a tune that each carry a key plan, note names on the roll: which chord takes Am\'s place four bars later (choice: Bm; B♭m / B); by how many half steps does every note rise at bar 5 (number: 2).',
          term: "term.direct-modulation",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1,
          graded: true,
          panels: ["chords"],
          what: 'The chords and the bass lift at bar 5; the tune stays in C and rubs against them. Give the tune its key plan (`.scale("⟪C4:major⟫")` → `<C4:major!4 D4:major!4>`; `events`, absolute, on every track; `edit-only-regions`; the target is audible and its roll appears after a failed try).',
        },
        {
          kind: "compare",
          exercise: "identify",
          answer: ["choice"],
          minutes: 0.75,
          what: 'Half step or whole step: two audio cards, each two bars of the chorus and the same two bars lifted, one to D and one to D♭. Which lifts by the half step? (`choice`, `layout: "audio-cards"`)',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.5,
          graded: true,
          panels: ["form"],
          what: "The hook's song in sections. Chords (`chordsChorus2`) and bass already lift the last chorus; the tune's `.scale(\"C4:major\")` is still inside its two section consts. Delete it there and write one key plan after the tune's `arrange()`, counted in bars of the whole song (`<C4:major!8 D4:major!4>`; `events`, absolute, on every track; three editable regions; `must-not-use tb.transpose`).",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["form"],
          what: "Your last chorus: the song with everything in C, to lift and then to make the learner's own.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The song with everything in C. Lift the last chorus a whole step, to D: a key plan after `arrange()` on the bass and on the tune, and in `chordsChorus2` every chord name a whole step up. Then make it yours: a new chorus tune, strings on a `pad:` line for the lift, a longer song.",
        required: {
          rule: "in-key",
          label: "The last chorus is in D major on every line: chords, bass and tune",
          why: '`in-key` with `key` D major, `minRatio: 1` and `section: "last"` (feature `rubric.section`, implemented): every pitched note of the last section of the `arrange()`. Graded with the real grader: the starter fails (59% of the notes of the last section are in D major), as do bass and tune lifted over unmoved chord names (67%), the tune left in C (98%: its C natural), and plans counted per section, which lift the first chorus and drop the last (92%); the minimal piece and a five-section piece with a new tune, Rhodes and strings pass. It asks for D, so a half-step lift fails: the brief says "to D". `key-change` (C7\'s rule, planned) is not the required rule here on purpose: it reads the key from the lines in degrees and passes a lifted tune over chord names that never moved (verified). When the grader lists it, add it as a suggestion ("the same tune, a step higher": `at: "last"`, `semitones: [1, 2]`, `minBarsAfter: 4`, `sameMelody: true`).',
        },
        suggestions: [
          "everything before it stays in C major (`in-key`, C major, `section: { bars: [1, 8] }`)",
          'a key plan on the bass and on the tune (`uses`, `tool: "tb.scale.patterned"`, `min: 2`)',
          "something new comes in: a fourth line (`tracks`, `min: 4`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: `${DRUMS_ONLY} The starter's chords and bass sit on the beats, so nothing flams against swung hats; sounds stay \`piano\` and \`ebass\` (the learner swaps them in the Make).`,
      },
      srs: [],
      mistakes: [
        "lift the tune: no counts (`<C4:major D4:major>`, the key changes every bar) and a half step (`Db4`): `melody.wrong-degree` (overridden: it names bars 1–4 and 5–8 and the two keys); the new key an octave up (`D5:major`): `melody.octave`; the unchanged starter: `code.unchanged`",
        'after arrange(): the plan counted like one section (`!4 !4`) and the old `.scale()` left inside the sections: `melody.wrong-degree`; the plan written inside the chorus const: `melody.wrong-degree` with `code.arranged-scale-pattern`; `.scale("C4:major").transpose("<0!8 2!4>")`: `code.must-not-use` with `code.transpose-after-scale`; the lifted chorus written into `arrange()` with its own `.scale("D4:major")` (the other legal form of contracts §6.8, but outside the editable regions): `code.edit-outside`',
        "investigate: B♭m (a half step up) or 1 half step (counted in whole steps): `investigate.wrong`",
        "compare: the whole-step card: `id.wrong` (overridden: the catalog text would print the option ids)",
        "Make: the starter; the chord names left in C; the tune left in C; the plans counted per section: `rubric.unmet`",
      ],
      connects: {
        back: 'U03.L05 first put a pattern in `.scale()` ("Same Song, Any Key") and U09.L02 built songs from sections with one `arrange()` per track; U17.L01 changed key through a pivot chord. Today the pattern in `.scale()` becomes the plan of a whole song, and the key changes with no pivot at all.',
        forward:
          "U17.L03 trains the ear to find the bar where a key changes and to tell a lift from a move through a pivot; C7's last session lifts the final chorus of the learner's own song by exactly this method.",
      },
      epr: {
        enjoyment:
          "A twelve-bar pop song of the learner's own whose last chorus rises a whole step over the drums, with their tune on top and, if they take the brief's offer, strings that come in for the lift: the ending of a record, made by changing a few characters.",
        pace: "One idea: the last chorus again, a step higher, and how each kind of line follows it (numbers take a key plan, names are renamed). The half-step lift is heard on two cards and not written; finding a key change by ear is tomorrow's lesson; pivot chords were yesterday's. No new tool and no drill family.",
        return:
          "The Coda says: you can now lift a chorus into a new key with a patterned .scale(). Next: hearing where a song changes key, and how.",
      },
      notes: [
        "The exemplar: content/core/U17/L02 passes every content-CI check with the real grader (7 steps, 2 graded, 8 expert minutes: 11.2 scaled, part A 4.2, part B 7.0).",
        "Evaluated: the last chorus plays D F♯ A, A C♯ E, B D F♯ and G B D over D2 A2 B2 G2, and the tune A A B | A E | B B D | D B: the chorus's own degrees (5 5 6 | 5 2 | 6 6 8 | 8 6) in D.",
        'It uses no planned shape: `key-plan` would let the roll show degrees that stay 5 5 6 across the lift and word feedback in the key in force. When the feature is implemented, add `keyPlan` to S3, S4, S6 and the Make, set `rollLabels: "degree"`, and drop the two `melody.wrong-degree` overrides.',
        'Known limit of the required rule, accepted: `in-key` counts notes, so a tune that avoids the two notes D major does not share with C major (C and F) would pass without being lifted. The starter\'s tune holds a C, and the suggestion "a key plan on the bass and on the tune" stays unmet in that case.',
        "The compare step's cards are four bars each (`<C G D A>` and `<C G Db Ab>` with their key plans); the question's stimulus is the two bars with no lift.",
        "The lesson seeds no family: `fam.har.modulation` opens in U17.L03.",
      ],
    },
    {
      id: "U17.L03",
      author: "U17a",
      idea: "You hear a key change before you can name it: home has moved. Three questions find it. Does the old do still sound like home at the end? In which bar did the first new note arrive? And was there a door (a shared chord, then the new key's V) or did the music just lift?",
      hook: {
        hear: "Eight bars that begin like the phrase from Pivot Chords and end somewhere darker: C, Am, F, G, then C, Am, E7 and A minor. One new note, G♯ in bar 7, and A is home: the song has changed colour without a jolt, the way a bridge slips into the minor.",
        code: `${T(92)}${RELATIVE_HOOK}`,
      },
      key: C,
      meter: "4/4",
      bpm: 92,
      canDo: ["cd.hear.key-change"],
      uses: [...BASE, ...TRIO, ...POP, "scale.minor", "scale.harmonic-minor", "tb.arrange"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "Two items, eight bars each: the chorus of U17.L02 lifting from C to D at bar 5 (no door), then the hook (a door: Am, then E7). The captions ask one thing: sing the first note of the piece at the end. Does it still feel like home?",
        },
        {
          kind: "compare",
          exercise: "identify",
          answer: ["choice"],
          minutes: 0.75,
          what: 'Two audio cards with the same first four bars: one comes home to C (`… C Am F [G C]`), one has moved to G (`… C Am D7 G`). After which card is the first chord no longer home? (`choice`, `layout: "audio-cards"`)',
        },
        {
          kind: "sing",
          exercise: "all",
          parts: ["sing", "sing"],
          answer: ["mic"],
          minutes: 1,
          what: 'Sing home, twice: the phrase from Pivot Chords plays; sing do before it starts (C), and do again when it has ended (G). Two `sing` parts in `mode: "degree"`, each with its own `key` (C major, then G major), degree 1, `fallback: "identify"`: Quiet mode picks the note on the keyboard.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["bar-buttons"],
          minutes: 1.5,
          graded: true,
          what: "`fam.har.modulation` at level 1, four trials from the generator: eight bars of chords over a bass; no key change, or the bar where the new key begins (a lift by a half or a whole step). The lesson seeds the family.",
        },
        {
          kind: "quiz",
          exercise: "all",
          parts: ["identify", "identify", "identify"],
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "How did it get there? Three fixed eight-bar items, one at a time, each a `choice` with `KEY_CHANGE_OPTIONS` (no key change / through a pivot chord / direct: it just lifts): a phrase that visits D7 and comes back to C (no key change), the hook (pivot), a half-step lift (direct).",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords", "form"],
          what: "A bridge in the relative minor: a verse in C and a four-bar bridge that really moves to A minor.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "A verse in C and a bridge that starts on Am but never leaves C: its chords are Am, Dm, G, C, and it sounds like more verse. Make the bridge a different place: move it to A minor, the relative minor. Bring in A minor's own V (E or E7) before an Am and give the tune a key plan, so that in the bridge its numbers mean A minor (`A3:minor`, or `A3:harmonic:minor` where the tune climbs through G♯). The loop takes the song back to C by itself: Am is also C's vi.",
        required: {
          rule: "modulation",
          label: "The bridge moves to A minor, the relative minor",
          why: "`modulation` with `to: \"relative\"` and `atBar` at the bridge's first bar (planned rule): from the bridge on the piece is in the relative minor of the key it starts in. The starter's bridge (Am Dm G C, tune in C major) fails; a bridge of Am Dm E7 Am with the tune on `A3:harmonic:minor` passes; a lift to D fails.",
        },
        suggestions: [
          'a major V that goes home to i in the bridge (`contains-rn` `["V", "V7"]`, `mustResolve`, `section: { section: "bridge" }`, read in A minor)',
          "the bridge differs from the verse on two axes (`contrast`, `minAxes: 2`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: `${DRUMS_ONLY} Chords on \`rhodes\`, bass on \`upright\`; the pop and indie flavours take \`piano\` and \`ebass\`.`,
      },
      srs: [
        { family: "fam.har.modulation", mode: "seed", level: 1 },
        { family: "fam.har.chromatic", mode: "review-if-due", level: 3 },
      ],
      singOn: "syllables",
      mistakes: [
        'ear: the bar after the change, or "no key change" for a half-step lift: `id.wrong` from the generator\'s grading (the family is tested in @oak/drills; the lesson has no tests for it)',
        'how: "through a pivot chord" for the D7 that comes back (a visit, not a move), and "no key change" for the half-step lift: `id.wrong`',
        "compare: the card that comes home chosen: `id.wrong` (overridden)",
        "Make: the starter, and a bridge in C major that only starts on Am: `rubric.unmet`",
      ],
      connects: {
        back: "U17.L01 moved from C to G through Am and U17.L02 lifted a chorus with no door; U15.L06 located applied dominants by ear, which is the skill of bar 7 here: the first note from outside the key. U10.L02 taught that C major and A minor share their notes; U10.L06 gave the minor its major V.",
        forward:
          "U17.L04 takes a tune down through a key change, in code. The drill keeps running in the warm-ups and adds the relative minor (level 2) and the dominant through a pivot (level 3).",
      },
      epr: {
        enjoyment:
          "A song with a verse in C and a bridge that turns to A minor and darkens, on the Rhodes over an upright bass: the first of the learner's pieces whose middle is somewhere else, the way the bridges on their records are.",
        pace: "One idea: finding a key change by ear, with three questions. The drill gets four trials and its first level only; naming the new key by ear and writing the tune down wait for U17.L04. The Make reuses the pivot of U17.L01 on a key the learner has known since U10.",
        return:
          "The Coda says: you can hear where a song changes key, and whether it used a door. Next: writing a tune down through its key change, in a pop chorus and in a standard from 1930.",
      },
      notes: [
        "Evaluated: the hook's E7 voices E3 D4 E4 G♯4 B4 over E2; the tune plays E4 G♯4 E4 in bar 7 and A4 in bar 8 (`\"<C4:major!6 A3:harmonic:minor!2>\"` parses and keeps both keys' context).",
        '`fam.har.modulation` (packages/drills `gen/progression.ts`): level 1 is `truck-driver` and `none`; its truck-driver items lift by 1 or 2 half steps after 3 to 5 bars; the answer is "none" or the first bar of the new key. Level 2 adds `relative` (vi becomes i, then V with the raised 7th), level 3 `dominant-pivot` (vi becomes ii, then V7 of the new key).',
        'The "how" quiz offers `pivot` and `direct`, both named by now (U17.L01, U17.L02). Its first item is the point of the lesson: a secondary dominant is a visit, and "no key change" is the right answer. Give that item its own `id.wrong` text.',
        'The sung step uses implemented shapes only (two `sing` parts in `mode: "degree"` with their own keys); nothing in it is graded or gated, and its tests are pending until recorded pitch fixtures exist (AUTHORING §9).',
        "The Make uses the planned rule `modulation`. A bridge is a section (`chordsBridge`, `melBridge`; U09.L03's word), so the starter is arranged: verse 4, bridge 4 (the rule reads from the bridge on, so the piece ends in the bridge and loops back to the verse), with the tune's `.scale()` after `arrange()`.",
      ],
    },
    {
      id: "U17.L04",
      author: "U17b",
      idea: "To write a tune down through a key change, find the bar where home moves and the new do. From there the degrees work as they always have: one line of numbers, and a key plan that says which key they mean.",
      hook: {
        hear: "A pop chorus in F over a pumping bass, four bars, and the same chorus again a whole step up, in G: the kind of song the gym has been giving the learner for months, now with a join in the middle.",
        code: `${T(104)}${POP_LIFT}`,
      },
      key: F,
      meter: "4/4",
      bpm: 104,
      canDo: ["cd.transcribe.key-change"],
      uses: [
        ...BASE,
        ...POP,
        "chord.dom7",
        "chord.seventh",
        "snd.rhodes",
        "snd.upright",
        "tb.feature.transcribe",
        "tb.feature.leadsheet",
      ],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "The hook once through over the Band's drums, eight bars. The caption asks the learner to hum do before bar 1 and to notice where it stops fitting.",
        },
        {
          kind: "ear",
          exercise: "all",
          parts: ["identify", "identify"],
          answer: ["bar-buttons", "choice"],
          minutes: 0.75,
          graded: true,
          what: "Where and how far: the bar where the new key begins (`bar-buttons`, `bars: 8`; bar 5), then the size of the lift (`choice`: a half step / a whole step).",
        },
        {
          kind: "dictate",
          exercise: "dictation",
          answer: ["code"],
          wave3: ["by-ear"],
          features: ["key-plan"],
          minutes: 2.25,
          graded: true,
          what: 'The tune, by ear, through the change (`byEar`, A/B and a slower rate): the starter gives `mel: n("<⟪~⟫>").scale("⟪F4:major⟫")` and the first note. Write bars 1–4 in degrees, then make the line eight bars long with a key plan instead of writing the notes again. Graded with `melody`, `pitch: "key-relative"`, over eight bars with the exercise\'s `keyPlan` (F from bar 1, G from bar 5).',
        },
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          panels: ["chords"],
          what: 'Body and Soul (1930) in Oak\'s rendition, six bars: the last two bars of the second A section in D♭ and the first four of the bridge. One item; the caption says only "home moves once: listen for the bar".',
        },
        {
          kind: "dictate",
          exercise: "dictation",
          answer: ["code"],
          wave3: ["by-ear"],
          features: ["key-plan", "by-ear.parts"],
          minutes: 2,
          graded: true,
          what: 'The bass of those six bars, by ear, through the change (`byEar`, one part, the bass track; A/B and a slower rate): the starter gives `bass: n("<⟪~⟫>").scale("⟪Db2:major⟫")`, the first root and the bar of the change. The learner finds the new do (a half step up: D), writes the key plan and the roots in degrees. Graded with the bass matcher of X2 (`melody` on `@bass`, octave-free) with `keyPlan` (D♭ from bar 1, D from bar 3).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "The pop chorus arranged: the tune the learner took down over its chords, with a bass line of their own that follows the song through its key change.",
        },
      ],
      wrapAt: 3,
      make: {
        brief:
          "The chorus you took down, with its chords and its tune, in F and then in G. It has no bass. Write one of your own from Roots Down Low on: roots where the chords change, then 5ths, approach notes or a rhythm that locks to the kick. Write it once in degrees and give it a key plan, so it follows the song up. Then change the sounds and make the second chorus bigger.",
        required: {
          rule: "bass-line",
          label: "The bass plays each chord's root where the chords change, in both keys",
          why: '`bass-line` with `track: "bass"`, `harmony: "chords"` and `roots: { on: "change", minRatio: 0.75 }` (implemented): eight changes, four of them after the lift, so a bass left in F fails (at most four of eight roots). The starter has no bass line; a bass written out note by note in both keys passes as well as one with a key plan.',
        },
        suggestions: [
          'the tune is still the song\'s, in both keys (`matches`, `melody` `pitch: "absolute"` on `mel` against the reference, `min: 0.85`)',
          "something new comes in for the second chorus: a fourth line (`tracks`, `min: 4`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: `${DRUMS_ONLY} Chords stay on \`piano\`; the bass the learner writes takes \`ebass\`, \`upright\` in jazz-soul and \`fingerbass\` in funk.`,
      },
      srs: [
        { family: "fam.har.modulation", mode: "review-if-due", level: 1 },
        { family: "fam.mel.dictation", mode: "review-if-due" },
        { family: "fam.har.bass", mode: "review-if-due" },
      ],
      mistakes: [
        "where: bar 4 or bar 6: `id.wrong`; how far: a half step: `id.wrong`",
        "the tune: bars 5–8 written as new numbers on `F4:major` (B♭ where the song has B): `melody.wrong-degree` or `melody.index-shift` (pin what `--verbose` prints); the key plan counted `!2 !6`: `melody.wrong-degree`; the line left four bars long (it repeats in F): `melody.wrong-degree` from bar 5; the unchanged starter: `code.unchanged`",
        "the bass: everything read in D♭ (the bridge's roots come out a half step low): `melody.wrong-degree` from bar 3; the new key guessed a whole step up (E♭): `melody.wrong-degree`; `.transpose(1)` after `.scale()`: `code.must-not-use`",
        "Make: the starter (no bass), and a bass that stays in F under the second chorus: `rubric.unmet`",
      ],
      connects: {
        back: "The gym's ladder gave the learner tunes, basses and changes to take down in one key (L3 to L6), and CF-T a whole standard; U17.L03 found the bar where a key changes. Today the two meet. U08.L01 is where a bass first followed its chords.",
        forward:
          "U17.CP checks the three units of chromatic harmony. In C7 the learner's own song lifts its last chorus; in the jazz track, JC4 reharmonizes Body and Soul or Georgia on My Mind.",
      },
      epr: {
        enjoyment:
          "A pop chorus taken down by ear and arranged, with the learner's own bass line carrying it from F up into G under the drums; and before that, six bars of a 1930 standard heard, understood and written down through the half step that every jazz player knows.",
        pace: "One idea: find the new do, then the degrees carry over. The pop tune is four bars written once and extended by a key plan; the standard gives only its bass, six bars, with the bar of the change told. No chord dictation and no new drill.",
        return:
          "The Coda says: you can now transcribe a tune through its key change. Next: the checkpoint on colour chords and key changes, which opens your seventh track.",
      },
      notes: [
        "Evaluated: the hook's tune is A C | F A | B♭ D | G in F (degrees 3 5 3 | 1 3 | 4 6 4 | 2) and B D | G B | C E | A in G; the bass plays F D B♭ C, then G E C D.",
        "Body and Soul: the answer key (`song.body-and-soul`, author:repertoire) must carry `keyPlan` (D♭ major from bar 1; D major at the bridge, bar 17; C major from bar 21; D♭ major again at bar 25, all to be confirmed against the 1930 print), `layers.bass` and `layers.chords`, and a `verifiedBy` human. The lesson's two items are bars 15–20 of that rendition, written into the lesson from the verified answer key; no lyric, no recording named. The roots are not quoted here: they are the answer key's.",
        "If the answer key is not verified when U17b writes the lesson, S4 and S5 take a second Oak tune instead (a half-step lift announced by the new key's V7 in the bar before it) and the author says so under notDone; the lesson title's standard is then offered in the gym only.",
        'Five flats do not burden the learner: the bass is written in degrees, and `Db2:major` is one string. Prose says "D♭" and never asks for the key signature.',
        'S3 and S5 use the planned feature `key-plan` (a `key-relative` match read in the key in force at each bar). Until it is implemented both can be graded in absolute pitch (`pitch: "absolute"`) with the override text of U17.L02; the author picks whichever the grader lists when the lesson is written.',
        "The Make's starter holds the reference tune (the learner has just written it; a Make cannot read a step's answer). Its required rule is implemented today.",
      ],
    },
  ],
  checkpoint: {
    id: "U17.CP",
    author: "CP",
    authored: [
      {
        id: "name-the-colours",
        kind: "fact",
        skills: ["H12", "H13"],
        what: 'Eight bars in G major from the chord band\'s symbols, one chord a bar: G, E7, Am, Cm, G, E♭, F, G. Their numerals (`rn-palette`, `slots: 8`, `allow: ["triads", "sevenths", "secondary", "borrowed"]`, key G major): I, V7/ii, ii, iv, I, ♭VI, ♭VII, I. Bar 2 is the secondary dominant with its target in bar 3 (H12); bars 4, 6 and 7 are borrowed from G minor (H13). Graded by degree, chroma and quality: `VI7` for `V7/ii` and `VI` for `♭VI` are `harmony.rn-degree`, `IV` for `iv` is `harmony.rn-case` (graded with the real grader).',
      },
      {
        id: "lift-the-last-chorus",
        kind: "code-modify",
        skills: ["H14"],
        what: 'A song in G in three sections (verse, chorus, chorus; four bars each), chords by name, bass and tune in degrees with `.scale("G2:major")` and `.scale("G4:major")` after `arrange()`, and `chordsChorus2` still a copy of the chorus. Lift the last chorus a whole step, to A: two key plans (`<G4:major!8 A4:major!4>`) and four chord names (`events`, absolute, on every track; `must-not-use tb.transpose`). The realistic mistakes: the plans counted per section (`melody.wrong-degree`), and the chord names left in G (pin what `--verbose` prints for the chords track).',
      },
      {
        id: "two-names-one-chord",
        kind: "fact",
        skills: ["H14"],
        what: 'A phrase that moves from F to C, heard and shown as symbols: F, Dm, G7, C. Name the pivot, Dm, in both keys (`rn-palette`, `slots: 2`, `labels: ["In F major", "In C major"]`, `slotKeys`; vi, ii). PLANNED (`rn-palette.slot-keys`): until it lands, an `all` of two `rn-palette` parts, each with its own `key`.',
      },
    ],
    recipe: {
      items: [12, 16],
      families: {
        H12: ["fam.har.chromatic"],
        E12a: ["fam.deg.fet-chromatic"],
        E12b: ["fam.har.chromatic"],
        E13: ["fam.har.modulation"],
      },
      why: "`fam.har.chromatic` at the learner's level (level 3 from U16.L05: which bar holds the chord from outside the key, and whether it is applied or borrowed) measures H12 and, as level-setting, E12b. `fam.deg.fet-chromatic` (E12a) and `fam.har.modulation` (E13) are level-setting re-tests that never block. H13 and H14 have no drill family: `name-the-colours` measures H13, `lift-the-last-chorus` and `two-names-one-chord` measure H14, and the Make measures H14 again.",
    },
    make: {
      brief:
        "A song of your own over the drums, in sections, twelve bars or more: one chord from outside the key that you chose on purpose, and a last chorus that lifts.",
      required:
        'H14: `in-key` on the `last` section in the key a whole step above the starter\'s (as U17.L02\'s Make; the starter is in G, so A major, `minRatio: 1`). Suggestions: `contains-rn` with `kind: ["secondary-dominant"]` and `mustResolve` (H12) and `contains-rn` with `kind: ["borrowed"]` (H13), both planned fields; `key-change` `at: "last"`, `semitones: [1, 2]`, `minBarsAfter: 4`, `sameMelody: true` (planned rule) for "the same tune, a step higher".',
    },
    notes: [
      "U17.CP follows U17.L04 and GYM.16 in the default order (session 177), so it always falls on a later day than the unit's last lesson. Passing or soft-passing it opens C7 (contracts §2.4) and J5 (§2.6, gate `J.reharmonization`). It is the last checkpoint of the core.",
      "Gated: H12 H13 H14; level-setting: E12a E12b E13 (content/checkpoints.ts). It covers three units; U15 and U16 have no checkpoint of their own, so its items lean on them: two of the three authored items and the recipe's largest family are about applied and borrowed chords.",
      "Keys differ from the lessons on purpose (G major, F to C, G to A): the checkpoint asks for each idea in a key the learner has not drilled it in. Nothing asks for a key signature with more than three accidentals.",
      "No sung item is gated (contracts §7.6, §8): a learner in Quiet mode passes the same checkpoint.",
      "`name-the-colours` and `lift-the-last-chorus` use implemented shapes; `two-names-one-chord` has a fallback that does. The Make's required rule is implemented; its suggestions wait for the grader.",
      "The checkpoint's Make plays over the drums of `band.axis-4bar`; its starter is U17.L02's song moved to G, with one diatonic chord marked as the place for a colour chord.",
    ],
  },
  capstones: [
    {
      id: "C7",
      author: "capstones",
      intent:
        "The seventh composed track on the album (sessions 178–180 in the default order) and the last before the finale: a pop or soul song in C with two colours from outside the key and an ending that lifts. Session 1 writes the harmony of a verse and a chorus and puts the colours in: a secondary dominant that goes where it points (U15) and ♭VI–♭VII–I, borrowed from C minor (U16.L02). Session 2 writes the tunes and puts the song in order. Session 3 adds the chorus once more, a half or a whole step higher, for eight bars or more (U17.L02), records the take and releases. Everything it asks for was taught in U15–U17; nothing new is introduced. It should sound like the last ninety seconds of a record the learner would have bought: a verse that leans, a chorus that ends on three big chords, and the roof coming off at the end.",
      opens:
        'When U17.CP is passed or soft-passed (contracts §2.4). Today then offers C7.S1 as the New block. In progress, no gym slot interrupts it: GYM.17 waits until C7.S3 is done (§2.5). While closed, the capstone card says "Opens after the chromatic checkpoint". Its release shows ms.19 ("You can now change key.") and opens CF-A.',
      band: "None: a capstone is the learner's whole song, so the starter carries its own `drums:` and `hats:` lines. The flavour sets the starter's kit and sounds (contracts §5.10 rule 8: pop `piano` and `ebass`; indie `acgtr` or `rhodes` with room; jazz-soul `rhodes` and `upright`; funk `rhodes` and `fingerbass`) and never changes the rubric (§6.6).",
      sessions: [
        {
          id: "C7.S1",
          goal: "Colour chords: a secondary dominant and ♭VI–♭VII–I.",
          opens:
            'The brief and a sectioned starter (`CapstoneSessionDef.starter`; it replaces the brief\'s single loop): tempo 100, key C major. One string per section drives the chords and the bass (U08.L04): `const changesVerse = "<C Am F G C Am Dm G>"`, `const changesChorus = "<F G C Am F G C C>"`, then `chordsVerse = chord(changesVerse).voicing()`, `bassVerse = chord(changesVerse).rootNotes(2)` and the same for the chorus; `drumsVerse`, `drumsChorus`; one `arrange([8, …Verse], [8, …Chorus])` per labelled track (16 bars). Everything in it is in the key: the colours are the learner\'s to place. No tune yet.',
          hear: "The starter's verse and chorus looping, plain and diatonic; then, chord by chord, what each colour does to it. A/B against the last saved draft. The chord band reads every chord as a numeral, a colour chord in its own colour with its target named (V7/ii → ii).",
          see: 'The capstone workspace: the Workbench (code, roll, chord band with symbols and numerals, the form lens showing verse and chorus) and the C7 checklist with the session\'s two lines live: "A secondary dominant that resolves" and "♭VI–♭VII–I"; "The last chorus lifts" and "At least 32 bars" greyed with "session 3". Beside the checklist, the two palettes of U15 and U16 for the key of C, read-only: the dominants that point at a chord of the key (A7 → Dm, E7 → Am, D7 → G, C7 → F) and the chords borrowed from C minor (Fm, A♭, B♭, E♭). Session bar: "Session 1 of 3: Colour chords".',
          work: [
            "Listen to the starter and choose where the verse should lean: put a secondary dominant in the bar before its target (bar 6: `A7` before `Dm` is the nearest; E7 before Am, D7 before G and C7 before F are the others).",
            "End the chorus on three big chords: ♭VI, ♭VII, I in its last three bars (`Ab Bb C`), in place of the plain close.",
            "Play it with the bass: the roots follow the strings, so nothing else needs changing. Adjust the comping rhythm and the drums until verse and chorus feel different.",
            "Optional: a second colour (the sad iv, `Fm`, in place of an F in the chorus), sevenths by name, another tempo (70–140).",
          ],
          checks: [
            '`capstones.check` runs the whole rubric on each save; the session\'s lines are `secondary` (`contains-rn`, `rn: []`, `kind: ["secondary-dominant"]`, `min: 1`, `mustResolve: true`) and `mixture` (`contains-rn`, `rn: ["bVI", "bVII", "I"]`, `min: 1`, `inOrder: true`). Both use planned fields (`contains-rn.kind`, `contains-rn.in-order`).',
            "Nothing blocks saving; the draft is the session's Make (contracts §9.1). The session is done when a draft is saved (`capstones.saveDraft`, then `capstones.completeSession`).",
          ],
          ends: 'Draft saved and bound to C7.S1; the Coda says "Next time: the tunes, and the song in order" and lists the lines already met. No review, no release.',
          epr: {
            enjoyment:
              "A verse that leans into its ii and a chorus that ends on A♭, B♭ and C, looping under the drums: already the sound of a record, before there is a tune.",
            pace: "Two edits to a working starter, each one chord idea the learner has used before; the tune and the form are next session's, the lift the last one's.",
            return:
              "The Coda names the two colours by their numerals and says what comes next: tunes for both sections.",
          },
        },
        {
          id: "C7.S2",
          goal: "Melody and sections.",
          opens:
            'The C7.S1 draft with a `mel:` line added: `melVerse` and `melChorus` as bare degree patterns (`n("⟪0 ~ ~ ~⟫")`), one `arrange()` like the other tracks, and `.scale("C4:major")` after it (so that session 3 changes one string). The sections are offered as verse, chorus, verse, chorus (32 bars).',
          hear: "The learner's song in order, with A/B between the draft and the last version; clicking a section in the form lens loops it.",
          see: 'The same workspace with the chord-tone lens on, so the tune\'s notes show against each chord, the colour chords included; the checklist with "At least 32 bars" now live. Session bar: "Session 2 of 3: Melody and sections".',
          work: [
            'A verse tune that sits low and follows the lean: over the secondary dominant, take its 3rd, the one note from outside the key (over A7 that is C♯, written `n("0#")`: U15.L01), and let it rise a half step into the target.',
            "A chorus tune that lifts above the verse and climbs over the three big chords: do, re, mi (C, D, E) fits ♭VI, ♭VII and I as the 3rd of each (evaluated: C over A♭, D over B♭, E over C).",
            "Put the song in order with one `arrange()` per labelled track: verse, chorus, verse, chorus. Every arranged track lists the same sections with the same lengths.",
            "Optional: a second verse tune (`melVerse2`), a line that drops out in the second verse (`silence`), a `pad:` for the chorus.",
          ],
          checks: [
            "`bars` ≥ 32 is met by the four sections. The colour-chord lines stay live: an edit that removes a colour unticks its line. Suggestions only, never blocking (author:capstones adds them as non-required rules): `chord-tones-strong` ≥ 0.6 on the tune against `chords`; `contrast` between chorus and verse on two axes.",
            "The session is done when a draft is saved.",
          ],
          ends: 'Draft saved and bound to C7.S2; the Coda says "Next time: the last chorus lifts, and you release it".',
          epr: {
            enjoyment:
              "The whole song, verse and chorus twice, with the learner's own tune rising do–re–mi over the three borrowed chords: a minute of music that already sounds finished.",
            pace: "Two tunes of eight bars over harmony that is already written, and an `arrange()` the learner has written many times; the chromatic note in the tune is offered, not required.",
            return:
              "The Coda says the song is complete in C and names what is left: one more chorus, higher.",
          },
        },
        {
          id: "C7.S3",
          goal: "Final-chorus key lift (≥8 bars), arrange, release.",
          opens:
            "The C7.S2 draft, unchanged. The hint ladder for this session walks through the three edits of the work list.",
          hear: "The song through to its new ending: verse, chorus, verse, chorus, and the chorus once more in the new key. A/B between the draft and the last version; the release recording plays the final version once in full (40 bars at 100 BPM: 1:36).",
          see: 'The same workspace with the key lens drawing its ribbon (C major, then D major from bar 33) and the chord band reading the last chorus in its own key, so both choruses show the same numerals; the checklist live on every line; the "Review" and "Release" actions at the end. Session bar: "Session 3 of 3: The lift and release".',
          work: [
            "Add the chorus once more at the end of every `arrange()` (a fifth section of eight bars).",
            'Lift the tune: turn its `.scale("C4:major")` into a key plan counted in bars of the whole song, `.scale("<C4:major!32 D4:major!8>")` (or `Db4` for a half step).',
            "Lift the chords: `const changesChorus2`, the chorus's names each moved up by the same step (`\"<G A D Bm G Bb C D>\"` for the starter's chorus with its colours), with `chordsChorus2` and `bassChorus2` built from it; the last section of the chords and bass tracks is the `…Chorus2` const. Check it in the chord band: the two choruses read the same numerals.",
            "Make the lift land: a fill in the bar before it, something new in the last chorus (strings, a second voice, doubled hats).",
            "Record the take, read the review, release.",
          ],
          checks: [
            'The whole rubric of contracts §6.6 C7 (content/capstones.ts): `secondary`, `mixture`, `lift` (`key-change`, `at: "last"`, `semitones: [1, 2]`, `minBarsAfter: 8`, `sameMelody: true`: the last section is a half or a whole step above the section before it, lasts eight bars or more, and its tune has the degrees of the previous chorus) and `bars` ≥ 32.',
            'Release is allowed once every required line is met and the latest passing check graded the code being released (an edited draft says "Check again before you release"); the tutor review (contracts §10.6, two revisions) is offered before release and never affects pass or fail.',
          ],
          ends: 'Review offered (`review: true`), then release (`release: true`): album track C7 v1 with a recording, a tree-ring cover, deterministic liner notes and the learner\'s own line. ms.19 shows. CF-A opens: the Coda says "Your album single is next: four sessions, and it ends the core".',
          epr: {
            enjoyment:
              "The learner hears their own song end the way the records do: the chorus comes back a step higher with everything they wrote in it, and it goes on the album.",
            pace: "Three edits the learner has made before, in U17.L02 (one more section, one key plan, eight chord names), then the take; nothing is composed from scratch in this session.",
            return:
              "The Coda says: you can now change key, with the track on the album to show for it, and that the album single, the last piece of the core, is open.",
          },
        },
      ],
      linerNotes: [
        'Deterministic (`linerNotes` of @oak/grader, at release; facts from `chromaticHarmonyView` and `keyPlanView`): key and the lift ("C major; the last chorus lifts a whole step to D major at bar 33"), tempo, meter, bars and duration; the form from `sectionsFromAst` ("verse 8, chorus 8, verse 8, chorus 8, chorus 8"); the secondary dominant with its target ("A7, the V7 of ii, leads into Dm in bar 6"); the borrowed run ("♭VI–♭VII–I closes the chorus: A♭, B♭, C, borrowed from C minor"); any note of the tune from outside the key ("the tune sings ♯1 over A7"); instruments and the flavour; tools used.',
        "The learner's line: one sentence they type at release (`album.patchVersion` `linerNotesMd`).",
        "The tutor's listening note only with consent (`includeReviewNote`, default `Settings.linerNotesInAlbum`).",
      ],
      tests: [
        "The starter fails all four lines: it has no colour chord, no lift and 16 bars.",
        "Per shipped flavour, one passing piece in five sections (contracts §6.6). Pop: the piece of the notes below on `piano` and `ebass` at 100, lifted a whole step. Indie: E7 before Am as the secondary dominant, `acgtr` with room at 88, lifted a half step (`Db`, with the chorus's names moved up by one: G♭ A♭ D♭ B♭m G♭ A B D♭). Jazz-soul: sevenths by name on `rhodes` over `upright` (`A7` before `Dm7`, `Ab^7 Bb7 C^7`: the rules compare the triad core). Funk: `fingerbass` at 104, D7 before G.",
        "Fails, each on one rule: no secondary dominant in a song that lifts (`secondary`; see the first grader note below: today the lifted chorus's own chords pass this line by accident); A7 followed by F (`secondary`, it does not resolve); ♭VII–♭VI–I and ♭VI–♭VII–IV (`mixture`); a last chorus of four bars, a lift of a 4th (F), and a last chorus with a new tune (`lift`, each with its own detail text); three sections of eight bars, verse, chorus and the lifted chorus (`bars`: 24).",
        "Sections: the passing piece with the lifted chords in a const named `chordsLift` while the tune lists `melChorus` fails with `form.inconsistent-arrange`; the same piece with `chordsChorus2` passes.",
        "A piece that puts the key plan inside the chorus const fails `lift` (the last chorus plays in C) and carries `code.arranged-scale-pattern`.",
      ],
      notes: [
        'Evaluated and linted in C7\'s unlock context, and graded in capstone mode with the rules the grader runs today (`contains-rn` with listed numerals and `mustResolve`, `key-change`, `bars`): the passing piece is the starter with `changesVerse = "<C Am F G C A7 Dm G>"`, `changesChorus = "<F G C Am F Ab Bb C>"`, `changesChorus2 = "<G A D Bm G Bb C D>"`, the tunes `melVerse = n("<[2 ~ 2 1] [0 ~ ~ ~] [3 ~ 3 2] [1 ~ ~ ~] [2 ~ 2 1] [0# ~ ~ ~] [3 ~ 3 2] [1 ~ ~ ~]>")` and `melChorus = n("<[5 ~ 5 7] [6 ~ 4 ~] [7 ~ 7 9] [7 ~ 5 ~] [5 ~ 5 7] [7 ~ ~ ~] [8 ~ ~ ~] [9 ~ ~ ~]>")`, five sections of eight bars on every arranged track and `mel: arrange(…).scale("<C4:major!32 D4:major!8>")`. `key-change` reports "C major → D major at bar 33"; the last chorus plays G, A, D, Bm, G, B♭, C, D under the tune\'s own degrees.',
        "FOR THE GRADER ENGINEER (verified, blocks C7's `secondary` line): `contains-rn` reads every chord in the brief's key, not in the key in force at its bar. In a lifted piece the last chorus's chords are therefore read in C: a wholly diatonic song whose lifted chorus holds A then D (V and I of D) passes \"a secondary dominant that resolves\" as V/ii → II, and a lifted ♭VI–♭VII–I (B♭ C D) is not counted as one. The rule must read each chord through `keyAtBarOf(keyPlanView(…))`, as `chromaticHarmonyView` already does (docs/design/wave6.md §3.2).",
        "FOR THE GRADER ENGINEER (verified): `key-change` reads the key from the lines that carry a scale context and compares the tune only, so a song whose tune lifts over chord names that were never moved passes `lift` although the last chorus is in two keys at once. Either the rule also asks that the chord track's chords in the last section are the previous chorus's moved by the same interval, or the check adds a `harmony.key-mismatch` warning for that section; U17.L02's Make uses `in-key` on the last section for this reason, which C7 cannot (its chorus holds chords from outside the key).",
        "content/capstones.ts is author:capstones'. The C7 entry already has the rubric of AUTHORING §19.8 without `custom` rules, three sessions with the goals above word for word, `key` C major and `canDo`. Still to do there: replace the brief's starter (it holds A7, A♭ and B♭ already, so the colours would not be the learner's) with the sectioned, diatonic one above as `sessionDefs[0].starter`; add the `mel:` scaffold of C7.S2; `tests` as listed; the hint ladder per session. Keep `sessions` goals word for word (contracts §2.4). After editing, run `bun scripts/content/spec.ts`: this document renders C7's rubric from it.",
        "The lifted chords are a variant of the chorus, named with a digit (`changesChorus2`, `chordsChorus2`, `bassChorus2`): a `…Lift` name on some tracks and `…Chorus` on others is `form.inconsistent-arrange` (U17's third convention). The brief's hint must use the `…Chorus2` names; STYLE §9 suggests `chordsLift` and should say that every track then needs a `…Lift` const (reported to the content lead).",
        "The brief's key is C major and the analysis runs in it (contracts §6.8 item 1), following the key plan from the lift on. A learner who writes the song in another key reads the message that names the mismatch (`harmony.key-mismatch`); the brief says so in one line.",
        "A half-step lift from C lands in D♭ major: the chord names of the last chorus then carry flats (G♭ A♭ D♭ B♭m, and the borrowed run A, B, D♭). The session's hint shows the whole-step version first; the half step is the learner's choice (`semitones: [1, 2]`).",
        "Dev seeds (docs/design/wave6.md §6): `C7 open` (U17.CP passed; today C7.S1), `C7.S2 done` (a saved draft with verse and chorus, a secondary dominant that resolves, ♭VI–♭VII–I and a tune; no lift) and `C7 released` (the lift of a whole step for 8 bars). The capstone engineer's specs start from them; one real-time take of C7 lives in the journey suite, every other spec uses the seeded take.",
      ],
    },
  ],
};
