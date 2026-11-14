// U12 Seventh Chords: the unit spec (rendered to content/specs/U12.md by `bun scripts/content/spec.ts`). Six
// lessons, no checkpoint of its own (U13.CP covers U12 and U13). Every hook was evaluated with headless Strudel
// and is linted in its lesson by content/validate/specs.test.ts; U12.L01 is the exemplar, written and passing
// with the real grader (content/core/U12/L01).
import type { UnitSpec } from "./types.ts";

const C = { tonic: "C", mode: "major" } as const;
const A_MINOR = { tonic: "A", mode: "minor" } as const;
const T = (bpm: number) => `setcpm(${bpm}/4)\n\n`;

/** What every U12 lesson has from U01–U11 (the voicing gate is met; `const` is U08's; the 7 of `C7` is U11.L04's). */
const BASE = [
  "tb.setcpm",
  "tb.label",
  "tb.mini.seq",
  "tb.mini.rest",
  "tb.mini.sub",
  "tb.mini.alt",
  "tb.mini.elongate",
  "tb.mini.replicate",
  "tb.mini.stack",
  "tb.gain",
  "tb.n",
  "tb.n.range",
  "tb.scale",
  "scale.major",
  "tb.note",
  "tb.note.names",
  "tb.note.accidentals",
  "tb.s.pitched",
  "snd.piano",
  "snd.rhodes",
  "snd.upright",
  "tb.lpf",
  "tb.add",
  "tb.struct",
  "tb.const",
  "tb.chord",
  "tb.voicing",
  "tb.rootNotes",
  "chord.triad",
  "chord.dom7",
  "chord.seventh",
  "tb.feature.degree-labels",
  "tb.feature.rn",
  "tb.feature.chord-symbols",
] as const;
const DIM = ["chord.seventh-dim"] as const;

/** One string drives the chords and the bass (U08.L04, U11.L04): Rhodes above, upright below. */
const band = (form: string, ...lines: string[]) =>
  [
    `const changes = "${form}"`,
    "",
    'chords: chord(changes).voicing().s("rhodes")',
    'bass: chord(changes).rootNotes(2).s("upright")',
    ...lines,
  ].join("\n");
/** The loop of U06.L10 "Seventh Colour", now by name: Imaj7 vi7 ii7 V7 in C. */
const SOUL = "<C^7 Am7 Dm7 G7>";
/** U06.L10's tune: every note belongs to the four-note chord under it (E G B | A G E | F D A | G F). */
const SOUL_TUNE = 'mel: n("<[2 ~ 4 6] [5 ~ 4 2] [3 ~ 1 5] [4 ~ 3 ~]>").scale("C4:major").s("piano")';
/** The cycle of U12.L05 in A minor: iv7 VII7 IIImaj7 VImaj7 iiø7 V7 i7 i7, every root a 5th below the last. */
const CYCLE = "<Dm7 G7 C^7 F^7 Bm7b5 E7 Am7 Am7>";
/** Its guide-tone line: 3rd, 7th, 3rd, 7th … F F E E D D C C, falling a step every two bars. */
const THREAD = 'mel: note("<f4 f4 e4 e4 d4 d4 c4 c4>").s("piano")';

export const U12: UnitSpec = {
  unit: "U12",
  title: "Seventh Chords",
  summary:
    'Six lessons on the sound of the learner\'s soul, jazz and neo-soul records: the chord with four notes. U06.L10 previewed it as "one more 3rd" on a triad and U11.L04 named one kind, the dominant seventh. U12 names the rest and puts them to work. Major seventh and minor seventh first (`C^7`, `Cm7`; U12.L01, the exemplar), then the half step that separates a major seventh from a dominant seventh, by ear (U12.L02); the two dark ones built on the diminished triad, half-diminished and diminished seventh (`Cm7b5`, `Co7`; U12.L03); the seventh chord each degree of a major key gets, Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7 (U12.L04); the same in minor, with the thread of 3rds and 7ths that runs through a chain of sevenths, the guide tones (U12.L05); and a lab: sevenths by ear, the rootless voicings of a pianist\'s left hand with `.dict("lefthand")`, and the two interval ideas those voicings need, inversion and compound intervals, moved here from U04 (U12.L06). Every hook is a loop in that sound, on the Rhodes over an upright bass. In the default order U12.L01 sits before U11.CP (session 125); U12.L02–L05 follow X2 (sessions 132–135), GYM.12 comes before U12.L06 (137), and U13.CP (session 147) covers U12 and U13 and opens the jazz and rhythm tracks.',
  conventions: [
    'A seventh chord is a triad plus the note a 7th above its root, and its name says both parts: the triad (major, minor, diminished) and the size of the 7th (major: a half step below the octave; minor, written ♭7: a whole step below). The five of this unit, as degrees above the chord\'s own root (content-kit `SEVENTH_DEGREES`): major seventh 1 3 5 7, dominant seventh 1 3 5 ♭7 (U11.L04), minor seventh 1 ♭3 5 ♭7, half-diminished 1 ♭3 ♭5 ♭7, diminished seventh 1 ♭3 ♭5 and the 7th lowered once more (it sounds as 6). Lessons build each one from a triad the learner already knows: "the C major triad, plus B".',
    'Spelling (STYLE §5.1, AUTHORING §5 rule 3): prose uses the lead-sheet form (Cmaj7, Am7, Bm7♭5, B°7), code the STYLE spelling (`C^7`, `Am7`, `Bm7b5`, `Bo7`); when both appear, show both once: "`C^7` (Cmaj7)". `Cmaj7`, `CM7`, `Cdim7` and `C-7` in code are silent or ireal-only and the lint refuses them (`code.unknown-chord` with the fix); every graded code step that asks for a named seventh pins that mistake. The jazz glyphs (C∆7, C–7, Cø7) wait for J1.L02. A chord\'s name is always read from its symbol, never worked out from the notes a dictionary produced (contracts §6.7).',
    'Voicings (STYLE §5.2, evaluated): the default dictionary voices `C^7` as C3 E4 G4 B4, `Am7` as A3 C4 E4 G4 C5, `Dm7` as F3 C4 D4 F4 C5 and `G7` as G3 D4 F4 G4 B4, so the root is not always lowest: every loop has a `bass:` line on `.rootNotes(2)` that puts it there. Sevenths are silent in `.dict("triads")` (U05.L08\'s dictionary); `.dict("lefthand")` is U12.L06\'s and voices them without the root (`Dm7` → C4 E4 F4 A4: 7th, 9th, 3rd, 5th). Never author a check, a hint or prose that depends on a voicing\'s octave, top note or note count.',
    'Chord tracks are one string in a `const` read by the chords and the bass (U08.L04, U11.L04–L05): `const changes = "<C^7 Am7 Dm7 G7>"`, `chords: chord(changes).voicing().s("rhodes")`, `bass: chord(changes).rootNotes(2).s("upright")`. The Rhodes over an upright bass is the unit\'s sound; `jazzgtr` joins in U12.L06. The stack of U06.L10 (`n("[0,2,4,6]")`) stays valid and is how U12.L04 shows that the key itself decides each chord\'s quality.',
    "Numerals: a seventh chord's numeral is its triad's with a suffix (STYLE §5.1): Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7 in major (content-kit `DIATONIC_SEVENTHS`); in minor, as U10 writes numerals (against the minor scale, no flat signs), i7 iiø7 IIImaj7 iv7 v7 VImaj7 VII7, with V7 and vii°7 from harmonic minor (U10.L06). They are answered with the `rn-palette` (`allow: [\"sevenths\"]`) and graded by degree and quality at seventh depth, never by string: `V` for `V7` and `I7` for `Imaj7` are quality misses (`harmony.rn-quality`).",
    'Grading (AUTHORING §17–§19): a named chord in code is its pitch classes and its lowest note per onset (`pcset`, `perOnset`, `bass: true`, `tracks: ["chords"]`), so `C7` for `C^7` fails on one note and the same symbol written `[C^7]` passes; a keyboard chord is `expect: { pcs, bassPc }`; quality by ear is a `quality-pad` with a subset of `SEVENTH_QUALITIES`; "a major seventh and a minor seventh in your loop" is `chord-qualities` with `contains` and `depth: "seventh"` (the symbol is read; a hand stack is read from its pitch classes). PLANNED until the grader lists them: the `guide-tones` rule (U12.L05\'s Make) and the feature `sing.guide-tones` (U12.L05\'s sung step); those steps fail check 2 until then, and their author says so.',
    'Keys: U12.L01, L02, L04 and L06 are in C major; U12.L03 and L05 in A minor (`{ tonic: "A", mode: "minor" }`), the relative minor, so the same seven chords serve both and the learner hears one family from two homes. Ear steps move through other roots (E♭, B, G, A) so a quality is never learned as one chord.',
    'Words that wait: "ii–V–I" as a named gesture (J1.L03; U12 says "Dm7, G7, Cmaj7" and writes the numerals), "tension" and "extension" (J2.L03; U12.L06 says "the 9th: a 2nd an octave up"), "shell" (J1.L05), "secondary dominant" (U15.L02; U12.L02\'s C7 before F "leans into F" and has no name yet), "tritone" is known (U04.L03) and may be used for the B–F inside G7, "mode" (U14), "syncopation" (U13.L01; say "between the beats"). New terms: major seventh chord and minor seventh chord (a pair, L01); half-diminished seventh and diminished seventh (a pair, L03); guide tones (L05); interval inversion, compound interval and rootless voicing (L06). L02 and L04 introduce none. "Major seventh chord" is the chord; "major 7th" stays the interval (U04.L02), and prose keeps them apart.',
    "The Band: Makes take the drums of `band.axis-4bar` (`tracks: [\"drums\"]`; the jazz-soul and funk flavours swing them) and keep chords and bass in the learner's code, which the rules read (AUTHORING §8 rule 5). In the A minor lessons the same drums serve (a Band written in major degrees plays only its drums under a minor key). The jazz-soul flavour is the unit's natural home: `rhodes` and `upright` are already the starters' sounds, so the flavour changes only the drums.",
    'Singing: on syllables with numbers shown (contracts §8.3), never graded, never gating; Quiet mode replaces each sung step with picking the notes. U12.L02 sings the two sevenths against the root (do–ti–do, then do–te–do), U12.L05 the guide-tone thread through four chords (`mode: "guide-tones"`, planned).',
    "Ear training, stage E (contracts §7.3): `fam.chd.quality-7th` is seeded in U12.L02 (level 1: major seventh against dominant seventh; level 2 adds the minor seventh) and reaches level 3 and 4 in U12.L03 (half-diminished, diminished seventh); `fam.int.isolated` is seeded in U12.L06. Concept families grow a level: `fam.chd.spell` level 3 (U12.L01), `fam.har.rn` and `fam.har.function` level 4, `fam.chd.inversion` level 3 and `fam.har.progression` level 5 (U12.L04). `deck.chd.symbols` gains its seventh cards (U12.L01, U12.L03).",
    'Scaffolds (AUTHORING §6, U11 and later): roll labels are the learner\'s choice (steps that read chord members set `rollLabels: "degree"`); the chord band is opened by the steps that name chords (`initialPanels: ["chords"]`), with symbols and numerals; the staff is a lead sheet where a tune matters. U12\'s Play from the page step is U12.L04 S5: a lead sheet of four bars with numerals under it, written in code by name in a new key.',
    'Feedback the grader emits on U12 steps (pin what `bun run content:check <id> --verbose` prints): `harmony.pcset` (a named chord with other notes: `C7` for `C^7`), `code.unknown-chord` (`Cmaj7`, `Cdim7`), `code.locked-chord` (`Cm7b5` before U12.L03, `Cm^7` at any point of the core), `code.chord-not-in-dict` (a seventh under `.dict("triads")`, a triad under `.dict("lefthand")`), `code.lowercase-chord-root`, `kb.extra-note` / `kb.missing-note` / `kb.bass`, `id.quality`, `harmony.rn-quality` and `harmony.rn-degree`, `id.interval-quality` and `id.interval-number`, `code.must-use`, `code.edit-outside`, `code.unchanged`, `rubric.unmet` (overridden with the neutral "{label}: not yet.").',
  ],
  lessons: [
    {
      id: "U12.L01",
      author: "content-lead",
      idea: "A seventh chord is a triad with one more note, a 7th above the root. On a major triad, the 7th a half step below the octave gives a major seventh chord, written Cmaj7 and in code `C^7`: soft and settled. On a minor triad, the ♭7 gives a minor seventh chord, `Cm7`: mellow. Together they are the sound of soul.",
      hook: {
        hear: "The loop from Seventh Colour (U06.L10), which the learner stacked by hand sessions ago: first in plain triads, C Am Dm G, then with its sevenths, now written by name, Cmaj7 Am7 Dm7 G7, on the Rhodes over an upright bass with the same tune. Both play within the first 30 seconds.",
        code: `${T(84)}${band(SOUL, SOUL_TUNE)}`,
      },
      key: C,
      meter: "4/4",
      bpm: 84,
      canDo: ["cd.code.seventh-chords"],
      uses: [...BASE],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "Two items, four bars each, over the Band's drums: the loop in triads (`<C Am Dm G>`), then by name with sevenths (`<C^7 Am7 Dm7 G7>`) and the tune.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`chord("<C C^7>")`: what does `^7` add to the C chord? (`choose`: B, a half step below the next C / B♭, a whole step below / D, the note above the octave)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: "Run `<C^7 Am7>` on stacks written by hand, with the chord band open and degree labels on the roll: which four notes make Am7 (choice: A C E G); how many half steps from C up to B (number: 11).",
          term: ["term.major-seventh-chord", "term.minor-seventh-chord"],
        },
        {
          kind: "quiz",
          exercise: "keyboard",
          answer: ["keyboard"],
          minutes: 1,
          graded: true,
          what: "Build Fmaj7 on the keyboard, F lowest: the F major triad and the white key a half step below the next F (`expect: { pcs: [5, 9, 0, 4], bassPc: 5 }`).",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: 'The loop in triads with G7 already in place (`"<C Am Dm G7>"`): give the other three their sevenths by name. `pcset` per onset with the bass, `edit-only-regions`; the target is audible and its roll appears after a failed try.',
        },
        {
          kind: "ear",
          exercise: "all",
          parts: ["identify", "identify", "identify", "identify"],
          answer: ["quality-pad"],
          minutes: 1.25,
          graded: true,
          what: "Four chords on other roots, one at a time, each comped twice: major seventh or minor seventh? (E♭maj7, Bm7, Gm7, Amaj7; a `quality-pad` with `maj7` and `m7`.) Fixed items: `fam.chd.quality-7th` opens in U12.L02.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "A soul loop of the learner's own: four bars that walk down from F to C, given in plain triads with a bass and a tune.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "A loop that walks down from F to C: F, Em, Dm, C, in plain triads, with a bass on the roots and a tune. Turn it into soul: give each chord its seventh by name (two of them are major sevenths, two are minor sevenths: the triad under each tells which), then make it yours: reorder the chords, write a new tune from their notes, try the organ.",
        required: {
          rule: "chord-qualities",
          label: "A major seventh chord and a minor seventh chord in your loop",
          why: '`chord-qualities` with `contains: ["maj7", "m7"]` and `depth: "seventh"` on the chords track: the starter\'s triads fail it, a loop of dominant sevenths fails it, and any loop with both kinds passes, whatever its roots.',
        },
        suggestions: [
          'the bass on each chord\'s root (`bass-line`, `roots: { on: "change", minRatio: 0.75 }`)',
          'a tune whose strong beats are chord notes (`chord-tones-strong`, `harmony: "chords"`, ≥ 0.6)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band in the flavour's kit (jazz-soul and funk swing them); the starter is already on `rhodes` and `upright`, so no sound swap is needed.",
      },
      srs: [
        { deck: "deck.chd.symbols", cards: ["fact.chord.Cmaj7", "fact.chord.Cm7"], mode: "seed" },
        { family: "fam.chd.spell", mode: "review-if-due", level: 3 },
      ],
      mistakes: [
        "`C7` for `C^7`: `harmony.pcset` (B♭ where the target has B); `Cmaj7` in code: `code.unknown-chord`; `Am^7` (the minor-major seventh, a jazz-track chord): `code.locked-chord`",
        "keyboard: E♭ for E (F7, the dominant): `kb.extra-note` and `kb.missing-note`; the triad without its 7th: `kb.missing-note`; A lowest: `kb.bass`",
        "investigate: C♯ in Am7 or 10 half steps (the ♭7): `investigate.wrong`",
        "ear: the other quality: `id.quality`",
        "modify: G7 edited too: `code.edit-outside`; the unchanged starter: `code.unchanged`",
        "Make: the starter (triads) and a loop of dominant sevenths (`<F7 E7 D7 C7>`): `rubric.unmet`",
      ],
      connects: {
        back: 'U06.L10 stacked `n("[0,2,4,6]")` on this very loop and called it "one more 3rd"; U11.L04 named the dominant seventh and wrote `C7`. The hook brings the U06.L10 loop back and gives its chords their names.',
        forward:
          "U12.L02 sets Cmaj7 against C7 and trains the ear on the half step between them; U12.L04 shows why the key gives I and IV a major seventh and ii, iii and vi a minor one.",
      },
      epr: {
        enjoyment:
          "A four-bar soul loop on the Rhodes that walks down from Fmaj7 to Cmaj7 over an upright bass and swung or straight drums, with the learner's own tune on top: the first thing they have made that sounds like the neo-soul records they own.",
        pace: "One idea: a triad plus a 7th, in the two gentle kinds, written by name. Major seventh against dominant seventh by ear is tomorrow's whole lesson; the dark sevenths wait for U12.L03 and the numerals for U12.L04. The ear step has four fixed items, no new drill family.",
        return:
          "The Coda says: you can now write Cmaj7 and Am7 by name and hear what the 7th adds. Next: one half step turns Cmaj7 into C7, and you will learn to hear which is which.",
      },
      notes: [
        "The exemplar: content/core/U12/L01 passes every content-CI check with the real grader (7 steps, 3 graded).",
        'Evaluated: `chord("<C^7 Am7 Dm7 G7>").voicing()` plays C3 E4 G4 B4 | A3 C4 E4 G4 C5 | F3 C4 D4 F4 C5 | G3 D4 F4 G4 B4; `.rootNotes(2)` gives C2 A2 D2 G2. The Make\'s walk, `<F^7 Em7 Dm7 C^7>`, voices as F3 C4 E4 A4 C5 | E3 B3 D4 G4 B4 | F3 C4 D4 F4 C5 | C3 E4 G4 B4.',
        'The investigate step shows the two chords as hand stacks (`note("[c3,e3,g3,b3]")`, `note("[a2,c3,e3,g3]")`) so the roll reads root, 3rd, 5th, 7th from the bottom; the named voicing would put other notes lowest.',
        "The Make's starter is Oak's copy, not the learner's U06.L10 sketch (`fromSketch`): that sketch already holds sevenths as stacks, so it would meet the required rule before the learner had named anything.",
        "`deck.chd.symbols` deals its `^7` and `m7` cards from this lesson on (card gate U12.L01); the modify step seeds two of them.",
      ],
    },
    {
      id: "U12.L02",
      author: "U12a",
      idea: "Cmaj7 and C7 share three notes; the fourth differs by one half step, B against B♭. That half step changes what the chord does: the major seventh rests where it is, the dominant seventh leans on to the chord a 5th below. Hearing which is which is the first seventh-chord skill.",
      hook: {
        hear: "The same two roots twice over one groove: C and F as major sevenths (two bars of soul), then as dominant sevenths (two bars of blues). One note in each chord has moved a half step.",
        code: `${T(88)}${band("<C^7 F^7 C7 F7>")}`,
      },
      key: C,
      meter: "4/4",
      bpm: 88,
      canDo: ["cd.hear.sevenths"],
      uses: [...BASE],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "Two items over the Band's drums: `<C^7 F^7>` (rest), then `<C7 F7>` (lean). The caption names the one note that moved in each chord.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "`C^7` then `C7`: which note changes? (`choose`: the 7th, B to B♭ / the 3rd, E to E♭ / the root)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: "Run `<C^7 C7 F^7 F^7>` with the chord band: which bar leans into the next (choice: bar 2, C7 into F); how many half steps apart are the two 7ths (number: 1).",
        },
        {
          kind: "modify",
          exercise: "error-hunt",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: "`<C^7 Am7 Dm7 G^7>`: one chord has a note from outside the key (G^7's F♯). Find it (locate on the roll) and fix it to G7 (`pcset` per onset with the bass).",
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["quality-pad"],
          minutes: 1.5,
          graded: true,
          what: "`fam.chd.quality-7th` at level 1, six trials from the generator: major seventh or dominant seventh? The lesson seeds the family.",
        },
        {
          kind: "sing",
          exercise: "all",
          parts: ["sing", "sing"],
          answer: ["mic"],
          minutes: 1,
          what: 'Sing the two sevenths against a held C: do–ti–do in C major, then do–te–do, te being the ♭7 the learner has sung in the blues since U11.L02. Two `sing` parts in `mode: "degree"`: the second declares `key: { tonic: "C", mode: "blues" }`, where ♭7 is one of the key\'s own degrees (chromatic degrees against a major key wait for U15.L01: check 14, `chromatic.before-u15`). `fallback: "identify"`: Quiet mode picks the degree on the pad.',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "Rest and lean: a four-bar loop that uses both colours on purpose.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          'A ballad turn in plain triads, `"<C C F G>"`, with a bass and a tune that already reaches for the 7ths. Colour it: a major seventh chord where the music should rest, a dominant seventh where it should lean (C7 in bar 2 into F, G7 in bar 4 home), then rewrite the tune so it holds a 7th where a chord leans. Learner review: the starter used to rest in Cmaj7 already, so changing G to G7 alone passed; now the learner chooses both colours.',
        required: {
          rule: "chord-qualities",
          label: "A major seventh chord that rests and a dominant seventh that leans",
          why: '`chord-qualities` with `contains: ["maj7", "7"]` and `depth: "seventh"`: the starter has no dominant seventh; a loop of four dominants has no major seventh.',
        },
        suggestions: [
          'the dominant seventh goes to the chord a 5th below (`contains-rn` `["V7"]`, `mustResolve`)',
          'the bass on each chord\'s root (`bass-line`, `roots: { on: "change", minRatio: 0.75 }`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: "Drums from the Band in the flavour's kit; chords stay on `rhodes`, bass on `upright`.",
      },
      srs: [
        { family: "fam.chd.quality-7th", mode: "seed", level: 1 },
        { deck: "deck.chd.symbols", cards: ["fact.chord.Cmaj7", "fact.chord.C7"], mode: "review-if-due" },
      ],
      singOn: "syllables",
      mistakes: [
        "error-hunt: the wrong bar located (`investigate.wrong`); G^7 changed to Gm7 (B♭ for B): `harmony.pcset`; the unchanged starter: `code.unchanged`",
        "ear: the other quality: `id.quality`",
        "Make: the starter as it is, and `<C7 C7 F7 G7>` (no major seventh): `rubric.unmet`",
      ],
      connects: {
        back: "U11.L04 taught the dominant seventh in the blues, where every chord is one; U12.L01 wrote the major seventh. Here they meet on the same root.",
        forward:
          "U12.L04 shows that a major key has exactly one dominant seventh, on V; U15.L02 will name bar 2's C7 before F (a secondary dominant).",
      },
      epr: {
        enjoyment:
          "A four-bar ballad turn where the learner decides where the music rests and where it leans, Cmaj7 to C7 into Fmaj7 and G7 home: the move that opens a hundred soul songs, under their own tune.",
        pace: "One idea: the half step between the major and the minor 7th above the same major triad, by ear. No new symbol, no new tool; the minor seventh joins the drill at its level 2 in the warm-ups, not here.",
        return:
          "The Coda says: you can hear a major seventh from a dominant seventh and choose between them. Next: the two dark sevenths, built on the diminished triad.",
      },
      notes: [
        "Evaluated: `C^7` voices C3 E4 G4 B4 and `C7` E3 B♭3 E4 G4 C5 in the default dictionary, so the lowest note differs too: the bass line on `.rootNotes(2)` keeps C under both, and prose never points at a voice of the voicing.",
        "The error-hunt's `G^7` is G B D F♯: the F♯ is outside C major, which the learner can see on the roll (degree labels show ♯4). The fix is the lesson's point: on V the key gives a ♭7.",
        "`fam.chd.quality-7th` level 1 is maj7 against 7 (packages/drills `cats`); the generator's answer widget is the `quality-pad`.",
      ],
    },
    {
      id: "U12.L03",
      author: "U12a",
      idea: "Two more sevenths, both on the diminished triad. With a ♭7 on top it is half-diminished (Bm7♭5, in code `Bm7b5`); lower that 7th one more half step and it is the diminished seventh (B°7, `Bo7`), four notes each three half steps apart. Both are tense chords that lead somewhere: Bm7♭5 into E7 into Am, B°7 up a half step into C.",
      hook: {
        hear: "The saddest two bars in a jazz ballad: Bm7♭5, E7, then A minor seventh for two bars, on the Rhodes over an upright bass at a slow tempo, with a tune on the harmonic minor. Then a gospel walk-up for contrast: C, C♯°7, Dm7, G7.",
        code: `${T(76)}${band("<Bm7b5 E7 Am7 Am7>", 'mel: n("<[3 ~ 5 3] [4 ~ 6 4] [2 ~ ~ ~] ~>").scale("A3:harmonic:minor").s("piano")')}`,
      },
      key: A_MINOR,
      meter: "4/4",
      bpm: 76,
      canDo: ["cd.write.seventh-family"],
      uses: [...BASE, ...DIM, "scale.harmonic-minor"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "Two items: `<Bm7b5 E7 Am7 Am7>` with the tune (the minor turn), then `<C C#o7 Dm7 G7>` (a diminished seventh as a stepping stone between C and Dm).",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "`Bm7` then `Bm7b5`: which note moves, and where? (`choose`: the 5th, F♯ down to F / the 7th, A down to A♭ / the 3rd)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: "Hand stacks of B D F A and B D F A♭ on the roll: which one is half-diminished (choice); how many half steps between neighbouring notes of the diminished seventh (number: 3).",
          term: ["term.half-diminished", "term.diminished-seventh"],
        },
        {
          kind: "quiz",
          exercise: "keyboard",
          answer: ["keyboard"],
          minutes: 1,
          graded: true,
          what: "Build Bm7♭5 on the keyboard, B lowest: all white keys (`expect: { pcs: [11, 2, 5, 9], bassPc: 11 }`).",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: '`"<Bm7 E7 Am7 Am7>"` in A minor: Bm7 has F♯, which the key does not. Make it the chord the key gives on degree 2 (`Bm7b5`). `pcset` per onset with the bass; the target is audible.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["quality-pad"],
          minutes: 1.25,
          graded: true,
          what: "`fam.chd.quality-7th` at level 3, five trials: minor seventh or half-diminished (and the earlier pair still in the mix).",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "A dark turn: a minor loop with one of the two tense chords placed by the learner.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "A torch song in A minor, `\"<Am7 F^7 Dm7 E7>\"`: the piano on every beat, the tune on strings, a bass (learner review: the unit's third Rhodes Make in a row, so this one sounds like a record of its own). Darken it with one of today's chords: Bm7♭5 in place of Dm7 (it leads into E7), or G♯°7 in the last bar or before Am7 (it steps up into home). Then shape the tune around the new chord's notes.",
        required: {
          rule: "chord-qualities",
          label: "A half-diminished or a diminished seventh chord in your loop",
          why: '`chord-qualities` with `anyOf: ["m7b5", "dim7"]`, `min: 1` and `depth: "seventh"`: the starter has neither.',
        },
        suggestions: [
          "the tense chord is followed by E7 or by Am7 (`contains-rn` with `mustResolve`)",
          'the tune uses the raised 7, G♯, over E7 (`degree-set`, `contains: ["7"]`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: "Drums from the Band in the flavour's kit; chords stay on `rhodes`, bass on `upright`.",
      },
      srs: [
        { family: "fam.chd.quality-7th", mode: "review-if-due", level: 3 },
        { deck: "deck.chd.symbols", cards: ["fact.chord.Cm7b5", "fact.chord.Cdim7"], mode: "seed" },
      ],
      mistakes: [
        "`Bdim7` or `Bm7-5` in code: `code.unknown-chord`; `Bo` (the triad) for `Bo7`: `harmony.pcset`; `Bm7` left in place: `code.unchanged`",
        "keyboard: F♯ for F (Bm7): `kb.extra-note` and `kb.missing-note`; A♭ for A (the diminished seventh): the same pair, with an override that names the difference",
        "investigate: the two stacks swapped, or 4 half steps: `investigate.wrong`",
        "Make: the starter as it is: `rubric.unmet`",
      ],
      connects: {
        back: "U05.L03's diminished triad was the unstable stack on degree 7; here it gets its two sevenths. U10.L06's major V (E in A minor) is the chord the half-diminished leads into.",
        forward:
          "U12.L04 finds the half-diminished on degree 7 of every major key; U12.L05 puts it in a chain of sevenths. U15.L04 uses the diminished seventh to lead into any chord of the key.",
      },
      epr: {
        enjoyment:
          "A slow minor loop on the Rhodes with one chord that aches, Bm7♭5 into E7 into Am7, or a diminished seventh that pulls up into home: the sound of a bossa or a torch song, with the learner choosing where the ache goes.",
        pace: "One idea: the two sevenths on the diminished triad, one half step apart. The five qualities are complete after this lesson; where each lives in a key is tomorrow. The diminished seventh's use as a passing chord is heard in the hook and left for U15.L04 to explain.",
        return:
          "The Coda says: you can now build all five seventh chords from a triad and a 7th. Next: which of them each degree of a key gets.",
      },
      notes: [
        "Evaluated: `Bm7b5` voices A3 D4 F4 A4 B4, `E7` E3 D4 E4 A♭4 B4, `Bo7` D3 B3 F4 A♭4 B4, `C#o7` D♭3 B♭3 E4 G4 B♭4 (the voicing spells with flats; display re-spells, STYLE §5.3 item 5).",
        "The key is A natural minor with E7 borrowed from harmonic minor, as U10.L06 taught; the hook's tune is on `A3:harmonic:minor` so its G♯ fits E7.",
        'A diminished seventh\'s 7th is written `6` in content-kit `SEVENTH_DEGREES` (there is no double flat in `Degree`); prose says "the 7th lowered once more" and shows the letter (A♭ over B).',
      ],
    },
    {
      id: "U12.L04",
      author: "U12b",
      idea: "Stack four notes on each degree of a major key and the seventh chords come out in a fixed order: Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7. Two major sevenths (I and IV), three minor sevenths (ii, iii, vi), one half-diminished (vii) and exactly one dominant seventh, on V: which is why a dominant seventh tells the ear where home is.",
      hook: {
        hear: "The key walked up and back down in sevenths, Cmaj7 Dm7 Em7 Fmaj7 and down again, on the Rhodes over an upright bass: the staircase that half the soul records the learner knows are built on.",
        code: `${T(92)}${band("<C^7 Dm7 Em7 F^7 F^7 Em7 Dm7 C^7>")}`,
      },
      key: C,
      meter: "4/4",
      bpm: 92,
      canDo: ["cd.read.diatonic-sevenths"],
      uses: [...BASE, ...DIM],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "The hook (eight bars), over the Band's drums.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`n("[0,2,4,6]")` moved onto degree 5: G B D F. Which kind of seventh chord is that? (`choose`: dominant seventh / major seventh / minor seventh)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["number", "choice"],
          minutes: 1,
          panels: ["chords"],
          what: 'One stack on all seven degrees (`n("[0,2,4,6]").add(n("<0 .. 6>"))`), with the chord band naming each: how many are major sevenths (number: 2); which degree gets the half-diminished (choice: 7).',
        },
        {
          kind: "quiz",
          exercise: "identify",
          answer: ["rn-palette"],
          minutes: 1,
          graded: true,
          what: 'The loop of U12.L01 heard and seen as symbols: write its numerals with their sevenths (`rn-palette`, `slots: 4`, `allow: ["sevenths"]`; `Imaj7 vi7 ii7 V7`).',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.5,
          graded: true,
          what: "Play from the page: a lead sheet in G major shows four bars of melody with the numerals Imaj7 ii7 iii7 IVmaj7 under it and no chord symbols. Write `changes` by name (`<G^7 Am7 Bm7 C^7>`); `pcset` per onset with the bass.",
        },
        {
          kind: "ear",
          exercise: "dictation",
          answer: ["rn-palette"],
          minutes: 1.25,
          what: "`fam.har.progression` at level 5, three trials: a four-bar loop of diatonic sevenths, numerals by ear, bass first (not one of the graded checks; the lesson's graded steps are the quiz and the modify).",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "A staircase of the learner's own, from the key's seven chords.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "Write a four- or eight-bar loop from the seventh chords of C major, by name: walk by step like the hook, or jump. Use at least one of each family the key has plenty of: a major seventh, a minor seventh and the dominant seventh on G. Add a bass on the roots and a tune.",
        required: {
          rule: "chord-qualities",
          label: "A major seventh, a minor seventh and a dominant seventh chord in your loop",
          why: '`chord-qualities` with `contains: ["maj7", "m7", "7"]` and `depth: "seventh"`: the starter is `<C^7 C^7 C^7 C^7>`.',
        },
        suggestions: [
          'every chord note belongs to C major (`in-key`, `tracks: ["chords"]`, `minRatio: 1`): a C7 or a D7 would break it',
          'the dominant seventh goes home (`contains-rn` `["V7"]`, `mustResolve`)',
          "a tune whose strong beats are chord notes (`chord-tones-strong`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: "Drums from the Band in the flavour's kit; chords stay on `rhodes`, bass on `upright`.",
      },
      srs: [
        { family: "fam.har.rn", mode: "review-if-due", level: 4 },
        { family: "fam.har.function", mode: "review-if-due", level: 4 },
        { family: "fam.har.progression", mode: "review-if-due", level: 5 },
      ],
      mistakes: [
        "numerals: `V` for `V7`, `I7` for `Imaj7`: `harmony.rn-quality`; a numeral on the wrong degree (`iii7` for `vi7`): `harmony.rn-degree`",
        "modify: `C7` for `C^7` in G (IV gets a major seventh): `harmony.pcset`; `Bm7b5` for `Bm7` (iii is minor, vii is the half-diminished): `harmony.pcset`; the unchanged starter: `code.unchanged`",
        "investigate: 3 major sevenths (counting V): `investigate.wrong`",
        "Make: the starter, and a loop with no dominant seventh: `rubric.unmet`",
      ],
      connects: {
        back: "U06.L01 stacked a triad on every degree and found major, minor, minor, major, major, minor, diminished; this is the same walk with one more 3rd. U06.L10's loop was four of these chords before they had names.",
        forward:
          "U12.L05 does the same in minor; U15 will use dominant sevenths on other degrees on purpose, and the ear will know they are visitors because the key has only one.",
      },
      epr: {
        enjoyment:
          "A staircase of sevenths the learner wrote from the key's own chords, walking or jumping, on the Rhodes with bass and drums: it already sounds finished, like the bed of an R&B verse.",
        pace: "One idea: each degree's seventh chord in a major key. No new chord, no new tool: the lesson spends its time on the pattern and on reading it as numerals. Function with sevenths is left to the warm-up family.",
        return:
          "The Coda says: you can name the seventh chord on every degree of a major key. Next: the same in minor, and the thread that ties a chain of sevenths together.",
      },
      notes: [
        'Evaluated: `n("[0,2,4,6]").add(n("<0 1 2 3 4 5 6>")).scale("C3:major")` plays C E G B | D F A C | E G B D | F A C E | G B D F | A C E G | B D F A: maj7 m7 m7 maj7 7 m7 m7♭5, as content-kit `DIATONIC_SEVENTHS.major` lists.',
        "The Play from the page step shows the tune on a lead sheet in G major with no chord symbols (a lead-sheet `chart` takes symbols, which would give the answer away): the numerals Imaj7 ii7 iii7 IVmaj7 are in the prompt, and the key signature tells the key.",
        "`fam.har.rn` level 4, `fam.har.function` level 4, `fam.chd.inversion` level 3 and `fam.har.progression` level 5 open at this lesson (contracts §7.3).",
      ],
    },
    {
      id: "U12.L05",
      author: "U12b",
      idea: "A minor key has its own seven sevenths: i7 iiø7 IIImaj7 iv7 v7 VImaj7 VII7, with V7 from harmonic minor. And through any chain of sevenths runs a thread: the 3rd of one chord stays or steps down to become the 7th of the next. Those two notes, the 3rd and the 7th, are the guide tones; follow them and the chords almost play themselves.",
      hook: {
        hear: "Eight bars of sevenths in A minor whose roots fall a 5th each time, Dm7 G7 Cmaj7 Fmaj7 Bm7♭5 E7 Am7, with one long piano note per bar on top that barely moves: F F E E D D C C. That slow line is made only of 3rds and 7ths.",
        code: `${T(96)}${band(CYCLE, THREAD)}`,
      },
      key: A_MINOR,
      meter: "4/4",
      bpm: 96,
      canDo: ["cd.hear.guide-tones"],
      uses: [...BASE, ...DIM],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "The hook: first the chords and bass alone, then with the thread on top.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "Dm7 is D F A C; G7 is G B D F. Which note of Dm7 is still there in G7 and has changed its job? (`choose`: F, the 3rd that becomes the 7th / D / A)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords", "chord-tones"],
          what: "The first four bars with the chord-tone lens: which member of each chord does the thread play, in order (choice: 3rd, 7th, 3rd, 7th); how many half steps does it move when G7 goes to Cmaj7 (number: 1).",
          term: "term.guide-tones",
        },
        {
          kind: "quiz",
          exercise: "identify",
          answer: ["rn-palette"],
          minutes: 1,
          graded: true,
          what: 'A minor loop heard and seen as symbols, `<Am7 Dm7 Bm7b5 E7>`: its numerals in A minor (`rn-palette`, `allow: ["sevenths"]`; `i7 iv7 iiø7 V7`).',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: "The last four bars of the cycle, `<Bm7b5 E7 Am7 Am7>`, with a `mel:` line that holds one note per bar and starts on D. Finish the thread: the 3rd or 7th of each chord, moving by step or staying (`<d4 d4 c4 c4>`; `events`, absolute, on `mel`).",
        },
        {
          kind: "sing",
          exercise: "sing",
          answer: ["mic"],
          features: ["sing.guide-tones"],
          minutes: 1.25,
          what: 'Sing the thread through the first four chords while they play: fa, fa, mi, mi in C (`mode: "guide-tones"`, target the `mel` track of the reference, `fallback: "identify"`: Quiet mode picks each note on the keyboard).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords", "chord-tones"],
          what: "A melody threaded through the cycle: the chords and bass are given, the tune is the learner's.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The eight-bar cycle plays with its bass. Write a tune over it that lands on a guide tone, the 3rd or the 7th, at the start of each bar, and fills the rest of the bar as you like: passing notes, a rhythm, a leap. Let the line fall slowly, the way the thread does.",
        required: {
          rule: "guide-tones",
          label: "Your tune starts each bar on the chord's 3rd or 7th",
          why: '`guide-tones` with `track: "mel"`, `harmony: "chords"`, `minRatio: 0.75`, `at: "change"`: the starter\'s tune is one held A.',
        },
        suggestions: [
          "from one bar's first note to the next the line moves a step or less (`guide-tones` `maxMoveSemis: 2`)",
          "the tune ends on 1 over Am7 (`ends-on-degree`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: "Drums from the Band in the flavour's kit; chords stay on `rhodes`, bass on `upright`.",
      },
      srs: [
        { family: "fam.har.rn", mode: "review-if-due", level: 4 },
        { family: "fam.chd.quality-7th", mode: "review-if-due", level: 4 },
      ],
      singOn: "syllables",
      mistakes: [
        "numerals: `ii7` for `iiø7` and `v7` for `V7`: `harmony.rn-quality`; numerals counted from C, the relative major's home (`vi7` for `i7`): `harmony.rn-degree`",
        "thread: the root of each chord instead of a guide tone (`<b3 e4 a3 a3>`): `melody.wrong-degree`; the unchanged starter: `code.unchanged`",
        "investigate: root and 5th chosen: `investigate.wrong`",
        "Make: the starter's held A, and a tune that sits on every root: `rubric.unmet`",
      ],
      connects: {
        back: "U10.L04 named the minor key's triads and U10.L06 its major V; U12.L03 built the half-diminished the key puts on degree 2. U07.L03's chord tones on strong beats were the first version of today's rule.",
        forward:
          "U12.L06 voices these chords the way a pianist's left hand does, around the same two notes. In the jazz track, J1.L04 sings and writes guide-tone lines through every key.",
      },
      epr: {
        enjoyment:
          "A melody of the learner's own drifting down through eight bars of falling fifths in A minor, on the Rhodes with an upright bass: the harmonic motion of a jazz standard, and a tune that fits it because it follows the thread.",
        pace: "One idea carried by one sound: the 3rd and 7th as a thread through a chain of sevenths. The minor key's numerals are met inside that chain and checked once; voicing the thread is tomorrow; naming the chain itself waits for the jazz track.",
        return:
          "The Coda says: you can follow, and write a tune along, the 3rds and 7ths of a progression. Next: the voicings a pianist's left hand builds around those two notes.",
      },
      notes: [
        'Evaluated: `.dict("guidetones")` voices Dm7 G7 C^7 F^7 as F4 C5 | F4 B4 | E4 B4 | E4 A4 (the dictionary is J1.L04\'s and is not used in learner code here); the thread F F E E D D C C is the 3rd of Dm7, 7th of G7, 3rd of Cmaj7, 7th of Fmaj7, 3rd of Bm7♭5, 7th of E7, 3rd of Am7.',
        'The `guide-tones` rule and `mode: "guide-tones"` are PLANNED (content-kit `PLANNED.rubricRules`, feature `sing.guide-tones`): the Make and the sung step fail check 2 until the grader and the voice engineer list them. The graded modify step uses the implemented `events` matcher.',
        "The cycle is a progression, not a tune: no repertoire entry and no provenance are needed. Do not name a standard in prose.",
        "Minor-key numerals are written as U10 writes them (IIImaj7, VImaj7, VII7: against the minor scale, no flat signs); the answer key is entered through the palette, so the author checks what the palette labels them.",
      ],
    },
    {
      id: "U12.L06",
      author: "U12c",
      idea: 'A pianist\'s left hand leaves the root to the bass and plays the rest: the 3rd and the 7th with one or two colour notes, close together in the middle of the keyboard. `.dict("lefthand")` voices chords that way. Two interval ideas explain what the hand is doing: an interval turned upside down becomes its inversion (a 3rd becomes a 6th), and an interval wider than an octave is a compound interval (a 9th is a 2nd an octave up).',
      hook: {
        hear: "Dm7, G7, Cmaj7 twice: first in the default voicing, then with left-hand voicings on the Rhodes, the upright walking the roots in quarter notes and a jazz guitar answering. The second time it sounds like a trio in a club.",
        code: `${T(112)}const changes = "<Dm7 G7 C^7 C^7>"\n\nchords: chord(changes).dict("lefthand").voicing().struct("~ x ~ ~ x ~ ~ ~").s("rhodes")\nbass: chord(changes).rootNotes(2).struct("x x x x").s("upright")\ngtr: n("<[~ 5 ~ 3] [~ 6 ~ 4] [~ 4 6 ~] ~>").scale("C4:major").s("jazzgtr")`,
      },
      key: C,
      meter: "4/4",
      bpm: 112,
      canDo: ["cd.code.left-hand-voicings", "cd.read.interval-inversion"],
      uses: [...BASE, "tb.dict.lefthand", "snd.jazzgtr"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "Two items: the three chords in the default voicing with a root bass, then the hook.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: 'Under `.dict("lefthand")`, Cmaj7 is played B D E G. Which chord note is missing? (`choose`: C, the root / E, the 3rd / B, the 7th)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: "The left-hand Cmaj7 beside the stack on the roll: the note that is not in the stack is D, above the octave from C. A 9th is an octave plus which interval (choice: a 2nd); how many half steps from C up to that D (number: 14).",
          term: ["term.rootless-voicing", "term.compound-interval"],
        },
        {
          kind: "quiz",
          exercise: "all",
          parts: ["fact", "fact", "fact"],
          answer: ["text"],
          minutes: 1,
          graded: true,
          what: 'Three intervals to turn over or stretch, typed as names (`text`, `normalize: "interval"`): C up to E is a major 3rd; E up to the next C is a … (`m6`); the inversion of a perfect 5th (`P4`); an octave plus a major 3rd (`M10`).',
          term: "term.interval-inversion",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'The loop in the default voicing: voice it for the left hand (`.dict("lefthand")` before `.voicing()`). `pcset` per onset on `chords`, `must-use tb.dict.lefthand`; the bass line stays.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["quality-pad"],
          minutes: 1.25,
          graded: true,
          what: "`fam.chd.quality-7th` at level 4, five trials: all five qualities by ear.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "The learner's trio: left-hand comping, a bass on the roots, a line on top.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "Your trio. Take a loop of sevenths you like from this unit (the staircase, the cycle, or a new one), comp it with left-hand voicings on the Rhodes or the jazz guitar, keep the bass on the roots, and write a line on top. Give the comping a rhythm with `.struct()`.",
        required: {
          rule: "uses",
          label: "The chords are voiced for the left hand",
          why: "`uses` `tb.dict.lefthand`: the starter's chords use the default dictionary.",
        },
        suggestions: [
          'a bass on each chord\'s root, since the voicing has none (`bass-line`, `roots: { on: "change", minRatio: 0.75 }`)',
          'the jazz guitar somewhere (`sounds`, `anyOf: ["snd.jazzgtr"]`)',
          "a line that starts its bars on guide tones (`guide-tones`, planned)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band in the flavour's kit (jazz-soul swings them, which suits this lesson best); the learner's own lines stay straight unless they add `.swingBy(1/3, 4)` (U11.L07).",
      },
      srs: [
        { family: "fam.int.isolated", mode: "seed", level: 1 },
        { family: "fam.chd.quality-7th", mode: "review-if-due", level: 4 },
      ],
      mistakes: [
        '`.dict("lefthand")` written after `.voicing()`: no effect, the default voicing plays (`code.must-use` is met, `harmony.pcset` names the notes); a triad left in the loop under `lefthand`: `code.chord-not-in-dict`',
        "intervals: `M6` for `m6` (`id.interval-quality`); `M3` for `M10` or `P5` for `P4` (`id.interval-number`)",
        "investigate: a 9th taken for a 7th plus a 2nd, or 2 half steps: `investigate.wrong`",
        "Make: the starter as it is (default dictionary): `rubric.unmet`",
      ],
      connects: {
        back: "U05.L07 voiced triads by hand so each note moved as little as possible and U05.L08 handed that job to `voicing()`; U12.L05 found the two notes that matter most. U04 left inversion and compound intervals for this lesson.",
        forward:
          "U13 gives this trio its rhythm (pushes, ghost notes). In the jazz track, J1.L05 strips the voicing to shells and J3.L01 writes the A and B left-hand forms by hand.",
      },
      epr: {
        enjoyment:
          "A jazz-trio loop the learner arranged: left-hand Rhodes or guitar comping in a rhythm of their own, an upright bass, a line on top. It is the most grown-up-sounding sketch on their shelf so far.",
        pace: "The lesson has three threads by contract (ear lab, left-hand voicings, interval inversion and compound intervals). They are taught as one idea, what the left hand is doing: no root, a 9th on top (a compound interval), 3rds flipped into 6ths (inversion). The ear step is five trials of a family the learner already knows.",
        return:
          "The Coda says: you can now write with seventh chords, by name, on every degree, voiced like a pianist (milestone ms.15). Next: Rhythm II, where these chords start to arrive early.",
      },
      notes: [
        'Evaluated: under `.dict("lefthand")` Dm7 voices C4 E4 F4 A4 (7th, 9th, 3rd, 5th), G7 B3 E4 F4 A4 (3rd, 13th, 7th, 9th), C^7 B3 D4 E4 G4 (7th, 9th, 3rd, 5th) and Am7 C4 E4 G4 B4: no root in any of them, and from Dm7 to G7 only one note moves, C down to B (the 7th becoming the 3rd).',
        "`lefthand` takes sevenths and sixths only (STYLE §5.2): a triad in the same string is silent and the lint says so (`code.chord-not-in-dict`). Its altered-dominant entries are loose and are never the subject of a pitch-class check; this lesson uses only the five qualities of the unit.",
        "The hook's `gtr:` line is on `jazzgtr`, which unlocks here; `keys`, `gtr` and `horns` are labels of STYLE §2 read through `inferRoles`.",
        '`fam.int.isolated` unlocks here (contracts §7.3) and is seeded by the quiz; `deck.int.names` deals its "how many half steps" cards from this lesson on (content/decks `HALF_STEP_COUNTS_FROM`).',
        'Milestone ms.15 "You can now write with seventh chords." is reached when this lesson is completed.',
      ],
    },
  ],
  capstones: [],
};
