// U11 Pentatonic & Blues: the unit spec (rendered to content/specs/U11.md by `bun scripts/content/spec.ts`),
// with the capstones that follow it (C5 "12-Bar Shuffle", X2 "Blues Transcription") and ladder levels L5 and
// L6 of the Transcription Gym. Every hook was evaluated with headless Strudel and linted in its lesson by
// content/validate/specs.test.ts; U11.L05 is the exemplar, written and passing with the real grader
// (content/core/U11/L05).
import type { UnitSpec } from "./types.ts";

const C = { tonic: "C", mode: "major" } as const;
const C_BLUES = { tonic: "C", mode: "blues" } as const;
const A_MIN_PENT = { tonic: "A", mode: "minor pentatonic" } as const;
const T = (bpm: number) => `setcpm(${bpm}/4)\n\n`;

/** What every U11 lesson has from U01–U10 (the voicing gate is met; `const` is U08's). */
const BASE = [
  "tb.setcpm",
  "tb.label",
  "tb.mini.seq",
  "tb.mini.rest",
  "tb.mini.sub",
  "tb.mini.alt",
  "tb.mini.elongate",
  "tb.mini.replicate",
  "tb.mini.repeat",
  "tb.mini.stack",
  "tb.gain",
  "tb.n",
  "tb.n.range",
  "tb.scale",
  "scale.major",
  "tb.s.pitched",
  "snd.piano",
  "snd.ebass",
  "tb.lpf",
  "tb.add",
  "tb.struct",
  "tb.const",
  "tb.feature.degree-labels",
  "tb.feature.rn",
  "tb.feature.chord-symbols",
] as const;
const VOICED = ["tb.chord", "tb.voicing", "tb.rootNotes", "chord.triad"] as const;
const DRUMS = ["snd.drum.bd", "snd.drum.sd", "snd.drum.hh"] as const;
const NAMES = ["tb.note", "tb.note.names", "tb.note.accidentals"] as const;

/** Triads stacked on `roots` (n values, one a bar), as in U06.L01. */
const stacks = (roots: string) => `chords: n("[0,2,4]").add(n("${roots}")).scale("C3:major").s("piano")`;
const AXIS = "<0 4 5 3>";
/** The standard 12-bar blues in C, one chord a bar (the exemplar's form). */
const FORM = "<C7!4 F7!2 C7!2 G7 F7 C7 G7>";
/** The quick change (IV in bar 2) with the I–IV | I–V turnaround in bars 11–12. */
const FORM_QC = "<C7 F7 C7!2 F7!2 C7!2 G7 F7 [C7 F7] [C7 G7]>";
const blues = (form: string, ...lines: string[]) =>
  [
    `const changes = "${form}"`,
    "",
    ...lines,
    'chords: chord(changes).voicing().s("piano")',
    'bass: chord(changes).rootNotes(2).struct("x x x x").s("ebass").lpf(600)',
  ].join("\n");
const HATS = 'hats: s("hh*8").gain(.5)';
const SWUNG_HATS = 'hats: s("hh*8").swingBy(1/3, 4).gain(.5)';
const BACKBEAT = 'drums: s("bd ~ sd ~")';
/** The blues-scale riff of U11.L03 and L05: C E♭ F G | G♭ F C. */
const RIFF = 'gtr: n("<[0 1 2 4] [3 2 0 ~]>").scale("C3:blues").s("crunch")';
/**
 * The shuffle riff of U11.L07–L08, in eighths so swing moves it (quarter notes are unchanged by `swingBy`):
 * C · E♭ F · G F · | G♭ F C.
 */
const SHUFFLE_RIFF = "[0 ~ 1 2 ~ 4 2 ~] [3 2 0 ~]";

export const U11: UnitSpec = {
  unit: "U11",
  title: "Pentatonic & Blues",
  summary:
    'Eight lessons and a checkpoint on the sound of the blues and of most rock, soul and funk melody. Two five-note scales first: the major pentatonic, the major scale without its two half steps, where no note clashes with the four-chord loop ("five notes, no wrong ones": improvise by editing over a Band), and the minor pentatonic, the same five notes from 6, the scale of a riff. Then the blue notes: ♭3, ♭5 and ♭7 against a major sound, gathered in the blues scale (`.scale("C4:blues")`), and the chord that carries them, the dominant seventh (`C7`). The form follows: twelve bars of I7, IV7 and V7 in a fixed order (U11.L05, the exemplar), its two standard variations, the quick change and the turnaround, then the shuffle: swung eighths with `.swingBy(1/3, 4)`, written straight and printed "Swing 8ths". The unit closes with riffs that answer each other and the first line of St. Louis Blues (1914). U11.L01 sits before U10.CP in the default order (session 112); U11.L02–L08 follow C4, with GYM.10 after L05 and U12.L01 and GYM.11 before U11.CP (session 127). Then C5 "12-Bar Shuffle" (sessions 128–129) and X2 "Blues Transcription" (130–131).',
  conventions: [
    "Degrees are spelled against major and sung do-based (contracts §8.3; content-kit `MODE_DEGREES`, `DEGREE_SYLLABLES`): the major pentatonic is 1 2 3 5 6 (do re mi sol la), the minor pentatonic 1 ♭3 4 5 ♭7 (do me fa sol te), the blues scale 1 ♭3 4 ♭5 5 ♭7 (do me fa se sol te). The blue notes are ♭3, ♭5 and ♭7 (theory `BLUE_NOTES`); the lens spells ♭5 as F♯ going up and G♭ going down (wave5.md §0).",
    'In a pentatonic or blues scale `n` counts that scale\'s own notes, so "degree − 1" no longer holds: in `C4:major:pentatonic` n 0–4 are C D E G A (n 3 is degree 5, n 4 is degree 6); in `A3:minor:pentatonic` n 0–4 are A C D E G (n 1 is ♭3); in `C4:blues` n 0–5 are C E♭ F G♭ G B♭ (evaluated: MIDI 60 63 65 66 67 70). Writing degree − 1 on a pentatonic (degree 5 as n 4, which plays A) is the realistic mistake of U11.L01–L03: every graded step that moves a line onto one of these scales pins it (`melody.wrong-degree`), and the degree labels on the roll always show the degree, never the `n`.',
    'Chromatic degrees (STYLE §6.3): `n("2b")` is ♭3, `n("4b")` is ♭5, `n("6b")` is ♭7 over a major scale (evaluated: `n("0 2b 4b 6b").scale("C4:major")` plays C4 E♭4 G♭4 B♭4). They are `tb.n.chromatic`, unlocked at U15.L01 (contracts §3.2), so U11 shows them only in a read-only `preview: true` example (U11.L03 S6). Learner code reaches a blue note through `.scale("C4:blues")` or as a note name (`note("eb4")`, U02.L03 accidentals), the way U08.L03 wrote chromatic approach notes.',
    'The twelve bars are one string in a `const` (U08.L04), read by the chords and by the bass: `const changes = "<C7!4 F7!2 C7!2 G7 F7 C7 G7>"`, `chords: chord(changes).voicing()`, `bass: chord(changes).rootNotes(2)` (U08.L01). Inside `< >` each entry is a bar; `!4` holds a chord four bars; `[C7 F7]` is two chords in one bar (the turnaround, U11.L06). STYLE §14 and the C5 starter use the same shape. The standard form has V in bar 12 (`fam.frm.blues`, the `term.twelve-bar-blues` example); the grader\'s `bluesForm` also accepts IV in bar 10 being V and I in bar 12, so a last chorus that ends on I is still a blues.',
    'Keys: U11.L01 is in C major, U11.L02 in A minor pentatonic (the relative of C\'s major pentatonic, U10.L02), U11.L03–L08 in C blues (`{ tonic: "C", mode: "blues" }`, as C5), so the chord band and the `harmony` matcher read C7 F7 G7 as I7 IV7 V7 and never as V7/IV. In the blues key a degree pad offers ♭3, never 3 (`minor.degree-pad`), and a sung target writes `b3` (`minor.sung-degree`).',
    '"Chorus" in the blues is one time through the twelve bars; U09\'s chorus is a song section (`term.chorus`). U11.L05 says "one time through the twelve bars, a chorus of the blues" the first time; C5 names its two choruses `melChorus` and `melChorus2` in `arrange()` (contracts §6.3: a tagged section is a chorus), so both meanings agree.',
    "Swing (contracts §6.10, STYLE §7): rhythms are written straight and swung by one call on each track that swings, `.swingBy(1/3, 4)` in 4/4 (the off-beat eighth lands two thirds through its beat). A swung exercise declares `swing: { subdivision: 8, amount: 1/3 }` so notation prints \"Swing 8ths\" over plain eighths and grading compares on the straightened grid. Before U11.L07 every U11 example is straight, a rock-and-roll blues; the jazz-soul and funk flavours' Band already swings (a preview), the learner's own lines do not.",
    'Words that wait: "syncopation" (U13.L01; say "between the beats"), "triplet" (U13.L05; U11.L07 says "long–short", "two thirds of the way through the beat"), "major 7th chord" and "minor 7th chord" (U12.L01; U11.L04 compares C7 only with the C triad), "Mixolydian" and "mode" (U14), "walking bass" (J3.L04), "tension" and "extension" (J track). "Riff" and "lick" are plain English, not terms (the content lead dropped "riff", foundation-content-lead apiNotes). New terms: pentatonic scale (L01); blue note and blues scale (L03); dominant seventh (L04); 12-bar blues (L05); quick change and turnaround (L06); swing and shuffle (L07). L02 and L08 introduce none.',
    'Grading (AUTHORING §17–§18): a line moved onto a pentatonic is an `events` match, `absolute`, on its track; "every note from the scale" is `in-key` with a pentatonic key (`{ tonic: "C", mode: "major pentatonic" }`, `minRatio: 1`); a blue note in a line is `degree-set` `contains: ["b3"]` (with `anyOf` once the feature `degree-set.any-of` lands); chords are compared as numerals on the triad core (`harmony`, level `rn`, `qualityDepth: "triad"`: C7 counts as I) or spelled as pitch classes (`pcset`, `perOnset`, `bass: true`) where the 7th itself is the point (U11.L04). PLANNED until the grader lists them: `blues-form` (U11.L06 Make), `swing` (U11.L07 Make), the feature `chord-qualities.depth` (U11.L04 Make) and the answers `scale-builder` (U11.L01, L03) and `bar-grid` (U11.L06, U11.CP). Those steps fail check 2 until then, and their authors say so.',
    'The Band: there is no 12-bar Band yet. U11 Makes take the drums of `band.axis-4bar` (`tracks: ["drums"]`, a 4-bar groove that loops under twelve bars) and keep chords and bass in the learner\'s code, which the rules must read anyway (AUTHORING §8 rule 5). U11.L01 also takes the Band\'s chords (`tracks: ["drums", "chords"]`: the four-chord loop under a pentatonic tune; no rule reads them). Requested of author:CP (content/bands): `band.blues-12bar`, a 12-bar blues in C with straight and shuffle drum parts, I7 IV7 V7 comping and a root bass, for U11.L06–L08 (with `tracks: ["drums"]` while the learner writes the changes) and for U11.CP\'s Make.',
    'Staff and scaffolds (AUTHORING §6): degree labels on the roll (they show ♭3, ♭5, ♭7 in the blues key); chord symbols and numerals in the chord band (`tb.feature.chord-symbols`, `tb.feature.rn`); the treble staff for riffs, with "Swing 8ths" from U11.L07. U11\'s Play from the page step is U11.L07 S5: a swung riff on the staff only, written in code straight with `.swingBy(1/3, 4)`.',
    'Singing: on syllables with numbers shown (contracts §8.3), `labels: "syllables"`, `fallback: "identify"`, never graded, never gating; Quiet mode replaces it with naming the degrees. U11.L02 sings the minor pentatonic (do me fa sol te), U11.L05 the twelve roots of the blues, U11.L08 a call back to the riff.',
    "Ear training, stage E (contracts §7.3): `fam.frm.blues` is seeded in U11.L05 (level 1, which chord in a marked bar) and played at level 3 in U11.L06 (quick change or standard); `fam.rhy.swing` is seeded in U11.L07 (level 1, straight or swung); `fam.har.schema` level 4 (blues12) and `fam.key.scale-spell` level 4 (pentatonic, blues) are reviewed. Scale colour by ear (major pentatonic, minor pentatonic, blues: `SCALE_COLOUR_OPTIONS`) and triad-or-dominant-seventh are fixed-item `identify` steps: no family generates them yet (`fam.chd.quality-7th` opens at U12.L02).",
    'Feedback the grader emits on U11 steps (pin what `bun run content:check <id> --verbose` prints): `melody.wrong-degree` (a pentatonic `n` written as degree − 1), `harmony.rn` ("Bar 12: you have I7, the blues has V7 there" when overridden, U11.L05 S4), `harmony.pcset` (a chord spelled wrong), `rhythm.swing-missing` (a straight line where the reference swings), `code.must-use` (`.swingBy()`), `code.edit-outside`, `code.unchanged`, `rubric.unmet` (overridden with the neutral "{label}: not yet."), `code.label-unknown` (a label outside STYLE §2: the riff goes on `gtr:` or `mel:`, never `riff:`).',
  ],
  lessons: [
    {
      id: "U11.L01",
      author: "U11a",
      idea: 'The major pentatonic is the major scale without its two half steps: 1 2 3 5 6, no 4 and no 7. Over the four-chord loop none of its notes clashes with a chord (the worst one does is add a colour: E over F, C over G), so you can improvise by editing: change any number and it still fits. In code it is `.scale("C4:major:pentatonic")`, and `n` counts its five notes (n 3 is degree 5).',
      hook: {
        hear: "The four-chord loop under a tune on the major scale whose F and B rub against two chords, then the same rhythm on the major pentatonic: nothing rubs. Both play within the first 30 seconds.",
        code: `${T(96)}${stacks(AXIS)}\nbass: n("${AXIS}").scale("C2:major").s("ebass").lpf(600)\nmel: n("<[4 3 2 1] [0 1 2 ~] [3 4 5 4] [2 1 0 ~]>").scale("C4:major:pentatonic").s("piano")`,
      },
      key: C,
      meter: "4/4",
      bpm: 96,
      canDo: ["cd.compose.pentatonic"],
      uses: [...BASE, ...VOICED, "scale.major-pentatonic"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items over the loop: a tune on all seven notes (F on beat 1 under C, B under F: they rub), then the same rhythm on the major pentatonic.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`n("0 1 2 3 4").scale("C4:major:pentatonic")`: which five notes? (`choose`: C D E G A / C D E F G / C E G B D)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: "The hook with degree labels: which two degrees of the major scale are missing (choice: 4 and 7, the two notes a half step from a neighbour); n 3 plays which degree (number: 5).",
          term: "term.pentatonic",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'A line written on the major scale, `n("<[0 1 2 4] [5 4 2 ~]>").scale("C4:major")` (degrees 1 2 3 5 | 6 5 3), moved onto `.scale("C4:major:pentatonic")`: rewrite the numbers so it plays the same notes (`<[0 1 2 3] [4 3 2 ~]>`; `events`, `absolute`, `tracks: ["mel"]`; edit-only-regions on the string). The unchanged numbers on the new scale play A for G and C5 for A: `melody.wrong-degree`.',
        },
        {
          kind: "compare",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1,
          graded: true,
          what: "Four short runs over a C chord, fixed code stimuli: five notes or seven? (`choice`: the major pentatonic / the major scale; the half steps E–F and B–C give the scale away.)",
        },
        {
          kind: "quiz",
          exercise: "fact",
          answer: ["scale-builder"],
          minutes: 1,
          graded: true,
          what: 'Build G major pentatonic on the keyboard (`scale-builder`, `tonic: "G"`, `input: "keyboard"`, `range: ["g3", "g4"]`; `correct.degrees` 1 2 3 5 6: G A B D E). PLANNED answer UI: fails check 2 until the answers engineer lists `scale-builder`; until then the author may ship it as a `keyboard` step with `expect.pcs`.',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Improvise by editing over the Band: five notes, no wrong ones.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The Band plays the four-chord loop. Your tune is on the major scale and rubs in two places. Move it onto the major pentatonic, then edit freely: change numbers, rests and rhythm, and keep what you like. Every note fits.",
        required: {
          rule: "in-key",
          label: "Every note of the tune from C major pentatonic",
          why: '`in-key` with `key: { tonic: "C", mode: "major pentatonic" }`, `minRatio: 1`, `tracks: ["mel"]`. The starter (degrees 4 and 7 on two beats) fails; any tune on `.scale("C4:major:pentatonic")` passes, whatever its numbers, which is the point of the lesson. Override `rubric.unmet` with "{label}: not yet."',
        },
        suggestions: [
          'the tune ends on 1 (`ends-on-degree`, `degrees: ["1"]`, `track: "mel"`)',
          'an idea that comes back (`motif-reuse`, `track: "mel"`, `minRatio: 0.5`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums", "chords"],
        flavours:
          "Drums and chords from the Band in the flavour's kit and voicing; jazz-soul swaps `piano` for `rhodes` in the starter. The flavours' swing stays in the Band: the learner's line is straight.",
      },
      srs: [{ family: "fam.key.scale-spell", mode: "review-if-due", level: 4 }],
      mistakes: [
        "degree − 1 on the pentatonic (degree 5 written n 4, which plays A): `melody.wrong-degree`, overridden to say that `n` counts the five notes",
        "the scale changed but the numbers left as they were: `melody.wrong-degree` on the moved notes; the unchanged starter: `code.unchanged`",
        "`major:pentatonic` written `pentatonic:major` or `majorpentatonic`: the lint's `code.uncatalogued` error (checked), shown before the run",
        'scale-builder: F or B added (seven notes): `id.wrong`, overridden: "Five notes: leave out the two that sit a half step from a neighbour."',
        "Make starter: `rubric.unmet`",
      ],
      connects: {
        back: "U03's major scale and degrees; U07.L03's chord tones on strong beats: the pentatonic is the scale where that worry goes away.",
        forward: "U11.L02 starts the same five notes from 6: the minor pentatonic, the scale of a riff.",
      },
      epr: {
        enjoyment:
          "The learner improvises for the first time: they change numbers at will over the Band's four-chord loop and every change still sounds like a tune, so the Make is a melody they found by playing.",
        pace: "One idea: five notes with no half steps. The minor pentatonic, blue notes and the blues form each wait for their own lesson; no new rhythm, no new chord.",
        return:
          "The Coda says: you can write a melody on the major pentatonic, and any note you choose will fit the loop. Next: the same five notes from 6, the minor pentatonic riff.",
      },
      notes: [
        'Evaluated: `n("0 1 2 3 4 5").scale("C4:major:pentatonic")` plays C4 D4 E4 G4 A4 C5 (MIDI 60 62 64 67 69 72). The hook\'s tune is A G E D | C D E | G A C5 A | E D C under C G Am F: no 4 (F) or 7 (B) anywhere. "No wrong ones" is honest, not absolute: E over F sounds as Fmaj7 and C over G as a suspended 4th, colours a pop tune uses; the half-step rubs (F over C or Am, B over C or F) are the ones the pentatonic removes. The pass text says "no clashes", never "every note is a chord tone".',
        "U11.L01 is session 112, the day before U10.CP: it asks for nothing from U10, so a learner who has not yet passed the minor checkpoint meets nothing minor here.",
        "The quiz step needs the planned `scale-builder`; the compare step is graded with fixed items, because no drill family generates scale colour yet.",
      ],
    },
    {
      id: "U11.L02",
      author: "U11a",
      idea: "The minor pentatonic is 1 ♭3 4 5 ♭7 (do me fa sol te). Its five notes are the major pentatonic's, started from that scale's 6: A minor pentatonic is C major pentatonic from A, as A minor is C major's relative. A riff is a short figure, a bar or two, that repeats under or over the changes; most rock and blues riffs live on these five notes.",
      hook: {
        hear: "A one-bar riff on the minor pentatonic, the bass doubling it an octave down, over a rock beat: A C D E D C, again and again.",
        code: `${T(100)}kick: s("bd ~ ~ bd ~ ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8").gain(.5)\ngtr: n("0 ~ 1 2 3 2 1 ~").scale("A2:minor:pentatonic").s("acgtr")\nbass: n("0 ~ 1 2 3 2 1 ~").scale("A1:minor:pentatonic").s("fingerbass")`,
      },
      key: A_MIN_PENT,
      meter: "4/4",
      bpm: 100,
      canDo: ["cd.compose.riff"],
      uses: [...BASE, ...DRUMS, "scale.minor-pentatonic", "scale.minor", "snd.acgtr", "snd.fingerbass"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items: the riff alone on the guitar, then guitar and bass together over the drums.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`n("0 1 2 3 4").scale("A3:minor:pentatonic")`: which five notes? (`choose`: A C D E G / A B C D E / A C E G B)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: "The hook with degree labels (do-based minor): which two degrees of A natural minor are left out (choice: 2 and ♭6); how many notes A minor pentatonic shares with C major pentatonic (number: 5).",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'The riff ends on D, up in the air: `n("0 ~ 1 2 3 2 ⟪2⟫ ~")`. Land it on home, 1 (`0`, or `5` an octave up; `events`, `octave-free`, `tracks: ["gtr"]`; edit-only-regions). Writing 1 as n 1 plays C, ♭3: `melody.wrong-degree`, overridden to name the five notes.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1,
          graded: true,
          what: "Four short riffs and tunes, fixed code stimuli in several keys: major pentatonic or minor pentatonic? (`choice` from `SCALE_COLOUR_OPTIONS` without blues; home is played first.)",
        },
        {
          kind: "sing",
          exercise: "sing",
          minutes: 1.5,
          what: 'Sing A minor pentatonic up and down in your own range, do me fa sol te do (`mode: "degree"`, `target.degrees` 1 b3 4 5 b7 1, `labels: "syllables"`, `fallback: "identify"`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "A riff of your own on the minor pentatonic, over the drums.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The drums and a riff on A natural minor that leans on F and B. Move it onto the minor pentatonic, then make it yours: a bar or two, notes and rests, doubled by the bass if you like.",
        required: {
          rule: "in-key",
          label: "Every note of the riff from A minor pentatonic",
          why: '`in-key` with `key: { tonic: "A", mode: "minor pentatonic" }`, `minRatio: 1`, `tracks: ["gtr"]`. The starter on `A2:minor` (n 1 and n 5 are B and F) fails; a riff on `A2:minor:pentatonic` passes.',
        },
        suggestions: [
          'the bass doubles the riff (`tracks`, `min: 2`, `roles: ["melody", "bass"]`)',
          'a two-bar riff whose second bar answers the first (`motif-reuse`, `track: "gtr"`, `minRatio: 0.5`, `unitBars: 1`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band in the flavour's kit; funk keeps `fingerbass` for the doubling, jazz-soul swaps `acgtr` for `rhodes`.",
      },
      srs: [
        { family: "fam.key.mode", mode: "review-if-due" },
        { family: "fam.deg.fet-minor", mode: "review-if-due" },
      ],
      singOn: "syllables",
      mistakes: [
        "home written as n 1 (degree − 1 thinking with 1 → 0 is right; n 1 is ♭3 on this scale): `melody.wrong-degree`",
        "the riff moved to the major pentatonic of A (A B C♯ E F♯): `melody.wrong-degree`; pin the override that names C, not C♯",
        "`minor:pentatonic` written `minorpentatonic`: `code.uncatalogued` (checked)",
        'ear: a minor pentatonic riff that starts on ♭3 heard as major: `id.wrong`, overridden: "Find home first: is the note a minor or a major 3rd above it?"',
        "Make starter: `rubric.unmet`",
      ],
      connects: {
        back: "U10.L02's relative minor: A minor shares C major's notes; the pentatonics share theirs the same way. U08.L04's kick and bass lock under the riff.",
        forward: "U11.L03 adds one note between 4 and 5, ♭5: the blues scale, and the blue notes.",
      },
      epr: {
        enjoyment:
          "A riff doubled by the bass over a rock beat is the first thing that sounds like a band playing a song the learner could have heard on a record; their Make is a riff of their own they will loop and keep.",
        pace: "One idea: the five-note minor scale, used for a riff. Blue notes, the dominant seventh and the 12-bar form wait; the riff needs no chords under it today.",
        return:
          "The Coda says: you can write a riff on the minor pentatonic. Next: the blue notes, the bite of the blues.",
      },
      notes: [
        'Evaluated: `n("0 1 2 3 4 5").scale("A3:minor:pentatonic")` plays A3 C4 D4 E4 G4 A4 (MIDI 57 60 62 64 67 69), the notes of C major pentatonic from A.',
        "U11.L02 follows C4 (session 117), so minor keys, do-based solfège and `scale.minor` are the learner's.",
        "The riff needs no chords: the Band's drums keep time, and the Make's rule reads only the riff. A chord loop under the riff waits for the dominant seventh (L04) and the form (L05).",
      ],
    },
    {
      id: "U11.L03",
      author: "U11a",
      idea: 'Blue notes are ♭3, ♭5 and ♭7 played against a major sound: a minor-sounding note over a major chord, a rub that is the blues. The blues scale gathers them: the minor pentatonic with ♭5 added between 4 and 5, 1 ♭3 4 ♭5 5 ♭7. In code `.scale("C4:blues")`; a single blue note is a note name, `note("eb4")`.',
      hook: {
        hear: "Over a C–F vamp on the organ, the same riff twice: first on the major pentatonic (sweet), then on the blues scale through the crunch guitar (the bite).",
        code: `${T(92)}chords: chord("<C F>").voicing().s("organ").gain(.5)\nbass: chord("<C F>").rootNotes(2).s("ebass").lpf(600)\ngtr: n("<[0 1 2 3] [4 ~ 3 2]>").scale("C3:blues").s("crunch").distort(.8)`,
      },
      key: C_BLUES,
      meter: "4/4",
      bpm: 92,
      canDo: ["cd.compose.blue-notes"],
      uses: [
        ...BASE,
        ...VOICED,
        ...NAMES,
        "snd.organ",
        "scale.major-pentatonic",
        "scale.minor-pentatonic",
        "scale.blues",
        "snd.crunch",
        "tb.distort",
      ],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items over the vamp: the riff on the major pentatonic, then on the blues scale with `crunch`.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`n("0 1 2 3 4 5").scale("C4:blues")` against the minor pentatonic: which note is new? (`choose`: G♭, between F and G / D / B)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: "The hook with degree labels: which three are the blue notes (choice: ♭3 ♭5 ♭7); how many half steps from ♭5 up to 5 (number: 1).",
          term: ["term.blues-scale", "term.blue-note"],
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'The bend into the 3rd: bar 1 of a lick over C plays `note("<[⟪~⟫ e4 c4 ~] [g4 ~ e4 ~]>")`; slide into E from the blue note just below it (`eb4`; `events`, `absolute`, `tracks: ["mel"]`; edit-only-regions). `d#4` passes (same sound); the prose spells E♭.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "Four licks over a C chord, fixed code stimuli: major pentatonic, minor pentatonic or blues scale (`SCALE_COLOUR_OPTIONS`)? The blues scale's ♭5 passing between 4 and 5 gives it away.",
        },
        {
          kind: "see",
          minutes: 0.5,
          what: 'The same blue notes as altered degrees of C major, a read-only `preview: true` example: `n("0 2b 2 4b 4 6b").scale("C4:major")` plays C E♭ E G♭ G B♭; "♭3 is `n("2b")`: the step, then the flat. You will write steps like these from U15."',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "A riff with bite over the vamp.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The C–F vamp and a sweet riff on the major pentatonic. Give it the blues: move it to the blues scale or bend a note in from a blue note below. Then try `crunch` and a touch of `.distort()`.",
        required: {
          rule: "degree-set",
          label: "The riff has the blue third, ♭3",
          why: '`degree-set` with `track: "gtr"`, `contains: ["b3"]` (degrees against C). The starter on the major pentatonic has no ♭3 and fails; the riff on `C3:blues` or with an `eb` note name passes. With the feature `degree-set.any-of` the rule becomes `anyOf: ["b3", "b5", "b7"]`, `minCount: 1`.',
        },
        suggestions: [
          'the crunch guitar (`sounds`, `contains: ["snd.crunch"]`)',
          'the riff resolves a blue note up a half step (♭3 to 3) somewhere (`degree-set`, `contains: ["3"]`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band; the vamp is the learner's (organ). Jazz-soul swaps `organ` for `rhodes`; funk keeps `crunch` but no `.distort()` in its starter.",
      },
      srs: [{ family: "fam.key.scale-spell", mode: "review-if-due", level: 4 }],
      mistakes: [
        "the slide written after the 3rd (`e4 eb4`, a fall instead of a bend up): `melody.wrong-degree` / `melody.first-difference`; pin which",
        "the blue note a whole step below (`d4`): `melody.wrong-degree`",
        'ear: blues heard as minor pentatonic when ♭5 passes quickly: `id.wrong`, overridden: "Listen between 4 and 5: is there a note squeezed in?"',
        "`.distort()` turned up until the riff is noise: no rule; the hint says to start small (contracts §3.1 rule on audible levels)",
        "Make starter: `rubric.unmet`",
      ],
      connects: {
        back: "U11.L02's minor pentatonic is the blues scale without ♭5; U08.L03 wrote chromatic notes as names, and so does the bend.",
        forward: "U11.L04: the chord that has a blue note built in, the dominant seventh (C7's B♭).",
      },
      epr: {
        enjoyment:
          "The crunch guitar plays a riff with real bite over an organ vamp; the learner hears the moment a sweet riff turns into the blues and makes a riff of their own with that grit.",
        pace: "One idea: the blue notes and the scale that holds them. The chromatic step strings are only shown (they unlock at U15.L01); the chord that carries ♭7 is tomorrow's.",
        return:
          "The Coda says: you can give a line its bite with the blue notes of the blues scale; `crunch` and `.distort()` are yours. Next: the dominant seventh, the chord of the blues.",
      },
      notes: [
        'Evaluated: `n("0 1 2 3 4 5 6").scale("C4:blues")` plays C4 E♭4 F4 G♭4 G4 B♭4 C5 (MIDI 60 63 65 66 67 70 72); `n("0 2b 4b 6b").scale("C4:major")` plays C4 E♭4 G♭4 B♭4 (60 63 66 70). The hook\'s riff is C E♭ F G♭ | G G♭ F over C and F.',
        '`tb.n.chromatic` is U15.L01\'s (contracts §3.2), so the S6 example is `preview: true` and never edited or graded. Requested by the spec brief: blue notes "written with the dialect\'s chromatic degrees"; they are, read-only, and learner code uses `.scale("C4:blues")` and note names.',
        "`snd.crunch` and `tb.distort` unlock here (contracts §3.2; `tb.distort` also at A1.L05). The hook's `.distort(.8)` keeps the level safe; the Make's suggestion leaves the amount to the learner.",
      ],
    },
    {
      id: "U11.L04",
      author: "U11b",
      idea: 'A dominant seventh is a major triad with a minor 7th on top: C7 is C E G B♭, ten half steps from root to 7th. It sounds restless and wants to move. Its symbol is `C7` and its code `chord("C7")`; in a major key the one dominant seventh among the stacked sevenths is on 5 (G7, `n("[0,2,4,6]").add(n("4"))`), and the blues puts one on every chord.',
      hook: {
        hear: "A C–F vamp as plain triads, then the same vamp as C7–F7: the B♭ and the E♭ turn it into the blues.",
        code: `${T(90)}chords: chord("<C7 F7>").voicing().s("piano")\nbass: chord("<C7 F7>").rootNotes(2).struct("x x x x").s("ebass").lpf(600)\ngtr: n("<[0 1 2 4] [3 2 0 ~]>").scale("C3:blues").s("crunch")`,
      },
      key: C_BLUES,
      meter: "4/4",
      bpm: 90,
      canDo: ["cd.read.dominant-seventh"],
      uses: [...BASE, ...VOICED, "chord.dom7", "scale.blues", "snd.crunch", "tb.feature.grand-staff"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items: the vamp as triads, then as dominant sevenths with the riff on top.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`chord("<G G7>")`: what does the 7 add? (`choose`: F, a minor 7th above G / F♯, the 7th note of G major / G an octave up)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: "The hook with the roll and the chord band: which four notes make C7 (choice: C E G B♭); how many half steps from C up to B♭ (number: 10). G7 then C (V7–I) is played once so the pull is heard.",
          term: "term.dominant-seventh",
        },
        {
          kind: "quiz",
          exercise: "keyboard",
          answer: ["keyboard"],
          minutes: 1,
          graded: true,
          what: 'Play F7 on the keyboard (`expect.pcs` F A C E♭, `bassPc` F, `pitchMode: "pc"`). Mistake to pin: E for E♭ (an F major 7th, U12\'s chord): `id.wrong`, overridden: "A dominant seventh has the flat 7th: a whole step below the octave."',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'Turn the triads into dominant sevenths: `chord("<⟪C F G C⟫>")` → `<C7 F7 G7 C7>` (`pcset`, `perOnset`, `bass: true`, `tracks: ["chords"]`; edit-only-regions). `Cmaj7`/`C^7` (a major 7th) fails `harmony.pcset`; lowercase `c7` is silent (`code.unknown-chord`).',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "Four chords in several keys and voicings, fixed code stimuli: a major triad or a dominant seventh? (`choice`; `fam.chd.quality-7th` opens at U12.L02, so no generator yet.)",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "A two-chord blues vamp of dominant sevenths, with your riff on top.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The vamp in plain triads, C and F, with the hook's riff on top. Make both chords dominant sevenths, then make the riff yours: new notes from the blues scale, a new rhythm. Try another pair: G7 and C7, or F7 and B♭7. (Learner review: the riff is in the starter so the vamp sounds like a record once the sevenths go in; the learner's choice is the riff.)",
        required: {
          rule: "chord-qualities",
          label: "Two dominant sevenths or more in the chords",
          why: '`chord-qualities` with `anyOf: ["7"]`, `min: 2`, `depth: "seventh"` (feature `chord-qualities.depth`, PLANNED: fails check 2 until the grader lists it; the analyzer reads the `chord()` symbol, or the pitch-class set of a hand stack via `isDominantSeventhPcs`). The starter (C and F triads) fails. Until the feature lands, the author may ship `uses` with `tool: "chord.dom7"`, `min: 2` and say so in the lesson header.',
        },
        suggestions: [
          'a riff from the blues scale (`in-key`, `key: { tonic: "C", mode: "blues" }`, `minRatio: 1`, `tracks: ["gtr"]`)',
          "the bass on the roots (`matches` + `harmony` level `bass`, as U08.L01)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band; jazz-soul swaps `piano` for `rhodes` (whose Band has played sevenths since U03: now the learner writes them).",
      },
      srs: [{ deck: "deck.chd.symbols", cards: ["fact.chord.C7", "fact.chord.G7"], mode: "seed" }],
      mistakes: [
        "the major 7th for the minor 7th (`C^7`, or E for E♭ on the keyboard): `harmony.pcset` / `id.wrong`, overridden to name the flat 7th",
        "lowercase or unknown symbols (`c7`, `Cdom7`): `code.unknown-chord`, the lint's fix",
        "the stack `[0,2,4,6]` on 0 in C major heard as C7 (it is Cmaj7): named in S3's pass text; no graded step asks for it",
        'ear: a dominant seventh voiced with the 7th on top heard as a triad: `id.wrong`, overridden: "Listen for the top: does it lean down a step?"',
        "Make starter: `rubric.unmet`",
      ],
      connects: {
        back: "U06.L10 stacked one more 3rd on every chord; U05.L04 read chord symbols. In a major key only V's stacked seventh is dominant: G7 → C is U06's V–I with one more note.",
        forward: "U11.L05: twelve bars of I7, IV7 and V7, the 12-bar blues.",
      },
      epr: {
        enjoyment:
          "One added note per chord turns a polite vamp into the blues; the learner's Make is a dominant-seventh vamp with their own crunch riff on top, the sound of a thousand blues and funk grooves.",
        pace: "One idea: the dominant seventh, its sound and its symbol. Other sevenths (major 7, minor 7, half-diminished) are U12's; the 12-bar form is tomorrow's; the vamp is two chords.",
        return:
          "The Coda says: you can build, name and hear a dominant seventh; C7, F7 and G7 join your symbol cards. Next: the twelve bars of the blues.",
      },
      notes: [
        'Evaluated: `chord("C7").voicing()` plays E3 B♭3 E4 G4 C5 (MIDI 52 58 64 67 72): C E G B♭, with E lowest, so the hook\'s bass gives each chord its root. `chord("F7")` gives F E♭ F A C, `chord("G7")` G D F G B.',
        "`chord.dom7` unlocks here (contracts §3.2; the jazz-soul Band previewed it). The deck cards `fact.chord.C7` … `fact.chord.Bb7` are gated at U11.L04 (content/decks); the lesson seeds two, the engine opens the rest.",
        "The key is C blues so the chord band reads C7 as I7 and F7 as IV7, not V7/IV; the G7–C pull in S3 reads V7–I in either key.",
      ],
    },
    {
      id: "U11.L05",
      author: "spec-U11",
      idea: 'The 12-bar blues is three chords, I7, IV7 and V7, in a fixed order over twelve bars: four bars of I, two of IV, two of I, then V, IV, I and V to send it round again. In code the whole form is one string in a `const`, read by the chords and the bass: `const changes = "<C7!4 F7!2 C7!2 G7 F7 C7 G7>"`.',
      hook: {
        hear: "A twelve-bar blues in C over the drums: chords and a root bass, then a crunch-guitar riff on the blues scale riding all twelve bars. The first chord change arrives at bar 5, about ten seconds in.",
        code: `${T(100)}${blues(FORM, RIFF)}`,
      },
      key: C_BLUES,
      meter: "4/4",
      bpm: 100,
      canDo: ["cd.read.twelve-bar"],
      uses: [...BASE, ...VOICED, "chord.dom7", "scale.blues", "scale.minor-pentatonic", "snd.crunch"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 1.25,
          what: "Two items, twelve bars each (about 29 seconds at 100 BPM): chords and bass, then the same with the riff.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`const changes = "<C7!4 F7!2 C7!2 G7 F7 C7 G7>"`: how long does the first C7 last? (`choose`: four bars / four beats / one bar, louder)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: "The hook with the chord band (numerals): which three chords make the twelve bars (choice: I7 IV7 V7); in which bar V7 first sounds (number: 9; 8 is counting from 0, pinned).",
          term: "term.twelve-bar-blues",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: 'The last line: `"<C7!4 F7!2 C7!2 ⟪C7 C7 C7 C7⟫>"` → `G7 F7 C7 G7` (`harmony`, level `rn`, `qualityDepth: "triad"`, `harmonicRhythm: "given"`; edit-only-regions; the target\'s roll after one failed try). Bar 12 on I and IV–V swapped both fail with `harmony.rn` ("Bar 12: you have I7, the blues has V7 there").',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1,
          graded: true,
          what: "From `fam.frm.blues` level 1 (generator stimulus, `which-chord`): a 12-bar blues in C or another key with a bar counter; which chord plays in the marked bar, I, IV or V?",
        },
        {
          kind: "sing",
          exercise: "sing",
          minutes: 1.5,
          what: 'Sing the twelve roots in your own range, one syllable a bar: do ×4, fa ×2, do ×2, sol fa do sol (`mode: "degree"`, `labels: "syllables"`, `fallback: "identify"`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "Your first blues: the twelve bars under your riff.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "Twelve bars of C7 and a riff over the drums. Turn the changes into a 12-bar blues, I, IV and V in their order; then make the riff yours: new notes from the blues scale, a new rhythm, another sound.",
        required: {
          rule: "matches",
          label: "The changes follow the twelve bars: I, IV and V in order",
          why: '`matches` against the standard form (`chords` + `bass` on `<C7!4 F7!2 C7!2 G7 F7 C7 G7>`) with `{ m: "harmony", level: "rn", qualityDepth: "triad", inversion: false, harmonicRhythm: "given" }`, `min: 0.9`: eleven bars of twelve, so the quick change (IV in bar 2, U11.L06) and a last bar on I pass (both are blues the grader\'s `bluesForm` accepts); twelve bars of I (the starter, 7 of 12) and IV and V swapped fail. `blues-form` is planned, so the exemplar uses `matches`.',
        },
        suggestions: [
          'a riff on top (`tracks`, `min: 1`, `roles: ["melody"]`)',
          'the blue third in the riff (`degree-set`, `track: "gtr"`, `contains: ["b3"]`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band in the flavour's kit (jazz-soul and funk swing their hats: a preview of U11.L07); jazz-soul swaps `piano` for `rhodes` and `ebass` for `upright`.",
      },
      srs: [
        { family: "fam.frm.blues", mode: "seed", level: 1 },
        { family: "fam.har.schema", mode: "review-if-due", level: 4 },
      ],
      singOn: "syllables",
      mistakes: [
        'bar 12 left on I: `harmony.rn` ("Bar 12: you have I7, the blues has V7 there"); in the Make it passes (11 of 12)',
        "IV and V swapped in bars 9–10: `harmony.rn` twice; the Make with IV and V swapped all through: `rubric.unmet`",
        "the first bars edited too: `code.edit-outside`; the unchanged starter: `code.unchanged`",
        "V's bar counted from 0 (8): `investigate.wrong`",
        "Make starter (twelve bars of I): `rubric.unmet` with `harmony.rn` per wrong chord",
      ],
      connects: {
        back: "U11.L04's dominant sevenths; U06.L02's I IV V; U08.L01's `.rootNotes()` and U08.L04's `const`: one string drives the chords and the bass.",
        forward:
          "U11.L06 adds the quick change and the turnaround; U11.L07 swings it; C5 is two choruses of your own.",
      },
      epr: {
        enjoyment:
          "The learner's riff rides a whole blues for the first time: twelve bars that come round on their own, with chords, bass and drums, a track that already sounds like a band playing the blues.",
        pace: "One idea: the twelve-bar order of I, IV and V. The quick change and the turnaround are named tomorrow; swing waits for U11.L07, so this blues is straight; the chart answer (`bar-grid`) is not needed yet.",
        return:
          "The Coda says: you can play and write the 12-bar blues and keep your place in it by ear. Next: the quick change and the turnaround, the two ways players vary it.",
      },
      notes: [
        "The exemplar: content/core/U11/L05 passes every content-CI check with the real grader (7 steps, 2 graded; expert minutes 9.0, scaled 12.6; part A 5.25, part B 7.35 scaled).",
        "Evaluated: under `chord(changes).voicing()` the twelve bars are C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7 (C7 = E3 B♭3 E4 G4 C5), the bass C2 ×4 F2 ×2 C2 ×2 G2 F2 C2 G2; the riff is C3 E♭3 F3 G3 | G♭3 F3 C3, the same over every chord, as blues riffs are.",
        'The required rule is `matches` + `harmony` at level `rn` (implemented) rather than the planned `blues-form`, so the exemplar ships before the grader lists `blues-form`. The investigate, modify and Make steps open the chord band (`initialPanels: ["chords"]`, implemented).',
        "`fam.frm.blues` unlocks here (contracts §7.3); the lesson seeds it in S5 with a generator stimulus at level 1 (`which-chord`, options I / IV / V, ids as the generator gives them).",
      ],
    },
    {
      id: "U11.L06",
      author: "U11b",
      idea: "Two standard variations of the twelve bars. The quick change visits IV in bar 2 and comes back to I in bar 3. The turnaround is the last two bars made to lead back to the top, here two chords a bar, I–IV then I–V, ending on V so the next chorus lands on I: `[C7 F7] [C7 G7]`.",
      hook: {
        hear: "Twelve bars with the quick change in bar 2 and the turnaround in bars 11–12, over the drums with the riff; then, for contrast, the plain form.",
        code: `${T(104)}${blues(FORM_QC, BACKBEAT, HATS, RIFF)}`,
      },
      key: C_BLUES,
      meter: "4/4",
      bpm: 104,
      canDo: ["cd.write.turnaround"],
      uses: [...BASE, ...VOICED, ...DRUMS, "chord.dom7", "scale.blues", "snd.crunch"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 1.25,
          what: "Two items, twelve bars each: the plain form, then the quick change and the turnaround.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "`[C7 F7]` inside `< >`: what plays in that bar? (`choose`: C7 for two beats, then F7 / both at once / C7 this time round, F7 the next)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: "The hook with the chord band: where IV first arrives (choice: bar 2); how many chords sound in bars 11 and 12 together (number: 4).",
          term: "term.quick-change",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: 'Add the quick change: `"<C7 ⟪C7⟫ C7!2 F7!2 …>"` → F7 in bar 2 (`harmony`, level `rn`, triad depth; edit-only-regions).',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: 'Write the turnaround in bars 11–12: `… ⟪C7 G7⟫>` → `[C7 F7] [C7 G7]` (`harmony`, level `rn`, triad depth, `harmonicRhythm: "given"`: two chords a bar are read on the half bar). `[C7 G7] [C7 G7]` fails `harmony.rn` at bar 11.',
          term: "term.turnaround",
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1,
          graded: true,
          what: "From `fam.frm.blues` level 3 (generator stimulus): six bars of a blues; quick change or the standard form?",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "A full chorus with a quick change and a turnaround, your riff on top.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The blues and its riff, now in G: I, IV and V are G7, C7 and D7. Give it a quick change in bar 2 and a turnaround in bars 11–12, then play with the turnaround: I–IV | I–V, or I | V, or your own way back to the top that ends on V. (Learner review: in C the Make repeated S4 and S5 and passed with the hook pasted in; in G the learner writes both moves from the numerals. The exercise's key is G blues.)",
        required: {
          rule: "blues-form",
          label: "A quick-change blues",
          why: '`blues-form` with `variant: "quick-change"` (PLANNED rule; graded by `bluesForm` since Wave 1, listed once the grader\'s golden tests are in: fails check 2 until then). The starter (the standard form) fails on bar 2 only; `bluesForm` accepts I or V in bar 12 and IV or V in bar 10, so any turnaround ending on V passes.',
        },
        suggestions: [
          'bar 12 contains V (`contains-rn`, `rn: ["V", "V7"]`, `min: 1`, `section: { bars: [12, 12] }`; feature `rubric.section`, planned)',
          "two chords in a bar somewhere (`harmonic-rhythm`, `changesPerBar: [1, 2]`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band; jazz-soul swaps `piano` for `rhodes` and `ebass` for `upright`. A 12-bar Band (`band.blues-12bar`, requested of author:CP) replaces the 4-bar drums once it exists.",
      },
      srs: [{ family: "fam.frm.blues", mode: "review-if-due", level: 3 }],
      mistakes: [
        "the quick change held for two bars (IV in bars 2–3): `harmony.rn` at bar 3",
        'the turnaround\'s two chords written as a new bar each (`C7 F7 C7 G7` inside `< >`: fourteen bars): the form shifts; pin `harmony.rn` and the hint "two chords in one bar go in `[ ]`"',
        "the turnaround ending on I (`[C7 F7] [C7 C7]`): `harmony.rn` at bar 12, second half",
        'ear: a quick change missed because bar 2 is short: `id.wrong`, overridden: "Listen to bar 2 only: does the chord move away and come straight back?"',
        "Make starter: `rubric.unmet`",
      ],
      connects: {
        back: "U11.L05's twelve bars; U06.L12 and U06.L08's two chords in a bar; U06's V → I pull, now at the end of every chorus.",
        forward:
          'U11.L07 swings the whole blues; ms.13 "You can now play a 12-bar blues" is shown at this lesson\'s Coda.',
      },
      epr: {
        enjoyment:
          "The learner's blues now moves like the records: an early trip to IV, and a turnaround that throws the music back to the top, so their twelve bars want to be looped again and again.",
        pace: "One idea: varying the form at two fixed places. The jazz blues and other turnarounds are J4's; swing is tomorrow's; the riff carries over unchanged.",
        return:
          'The Coda says: you can add a quick change and a turnaround to a 12-bar blues; milestone ms.13 "You can now play a 12-bar blues." Next: the shuffle, the swung eighths of the blues.',
      },
      notes: [
        "Evaluated: `<C7 F7 C7!2 F7!2 C7!2 G7 F7 [C7 F7] [C7 G7]>` plays C7 F7 C7 C7 F7 F7 C7 C7 G7 F7, then C7–F7 and C7–G7 two beats each.",
        "Two graded modify steps (AUTHORING §3 rule 4: two small modifies beat one large one), one per variation; terms split between them so each pass text names one.",
        'Milestone ms.13 is `when: { sessions: ["U11.L06"] }` (content/milestones.ts).',
      ],
    },
    {
      id: "U11.L07",
      author: "U11c",
      idea: 'Swing plays eighth notes long–short instead of even: each off-beat eighth lands two thirds of the way through its beat. A shuffle is a groove built on swung eighths, the beat of the blues. Rhythms stay written straight; `.swingBy(1/3, 4)` on each line that swings does the rest, and the staff prints "Swing 8ths" over plain eighths.',
      hook: {
        hear: "The twelve bars with straight hats, then with the hats and the riff swung: the same notes, a lope instead of a march.",
        code: `${T(112)}${blues(FORM, SWUNG_HATS, BACKBEAT, `gtr: n("<${SHUFFLE_RIFF}>").scale("C3:blues").swingBy(1/3, 4).s("crunch")`)}`,
      },
      key: C_BLUES,
      meter: "4/4",
      bpm: 112,
      canDo: ["cd.hear.swing"],
      uses: [
        ...BASE,
        ...VOICED,
        ...DRUMS,
        "chord.dom7",
        "scale.blues",
        "snd.crunch",
        "tb.swingBy",
        "tb.swing",
        "tb.feature.staff",
      ],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items, four bars each: straight hats, then swung hats (U01.L09's preview, now the learner's to write).",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`s("hh*8").swingBy(1/3, 4)`: which hats move? (`choose`: the off-beat ones, later / all of them / the ones on the beat, earlier)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: "The hats on the roll, straight then swung: where the off-beat lands (choice: two thirds through the beat); the second argument in 4/4 (number: 4, the beats in a bar).",
          term: ["term.swing", "term.shuffle"],
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'Swing the hats and the riff of the straight blues (`.swingBy(1/3, 4)` on both; `rhythm` on `tracks: ["hats", "gtr"]` against a reference with `swing: { subdivision: 8, amount: 1/3 }`; `must-use` `tb.swingBy` or `tb.swing`, min 2; built as an `all` with a `rubric` of `swing` on each line, ratio [1.6, 2.4]). `swingBy(1/3, 8)` swings sixteenths: `rubric.unmet`, overridden. `.swing(4)` passes.',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          wave3: ["staff-labels"],
          what: 'Play from the page: a two-bar riff in plain eighths on the treble staff with "Swing 8ths" over it (`staff`, no code, no roll); write it in code, straight, and swing it (`melody`, `absolute`, `rhythmTol` a sixteenth so `.33` lines up, on `gtr`, reference with `swing`, in an `all` with a `swing` rule on `gtr`; `must-use` `tb.swingBy` or `tb.swing`). Writing the swing by hand as `[x ~ x]` triplets fails `rhythm.*`; a straight answer passes the notes and draws `rhythm.swing-missing` with the constraint failing.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1,
          graded: true,
          what: "From `fam.rhy.swing` level 1 (generator stimulus): straight or swung? (`FEEL_OPTIONS`.)",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Your blues, shuffled.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "Your twelve bars with straight hats and your riff. Make it shuffle: swing the hats, then the riff. Try a lighter swing too (`.swingBy(.2, 4)`) and keep the feel you like.",
        required: {
          rule: "swing",
          label: "The hats swing",
          why: '`swing` with `track: ["hats", "@drums"]`, `drums: ["hatClosed", "hatOpen", "ride"]`, `subdivision: 8`, `ratio: [1.6, 2.4]` (C5\'s rule, contracts §6.6; PLANNED for content: fails check 2 until the grader lists `swing`). The straight starter fails with `rhythm.swing-missing`; `.swingBy(1/3, 4)` gives ratio 2 and passes; `.swingBy(.2, 4)` gives 1.5 and is named as "light swing", not a pass.',
        },
        suggestions: [
          'the riff swings too (`swing`, `track: "gtr"`, `subdivision: 8`, `ratio: [1.4, 2.4]`)',
          "a tempo for a shuffle (`tempo-bpm`, `min: 80`, `max: 140`)",
        ],
        band: false,
        flavours:
          "No Band (as built): the learner's code carries the drums, `hats:` and `drums:`, because a Band's straight hats would flam against the swung ones and \"drums minus their hats\" cannot be asked of `band.axis-4bar`. The flavours swap sounds only.",
      },
      srs: [
        { family: "fam.rhy.swing", mode: "seed", level: 1 },
        { family: "fam.rhy.echo", mode: "review-if-due", level: 6 },
      ],
      mistakes: [
        '`.swingBy(1/3, 8)` (sixteenths swung): `code.arg-mismatch`, overridden: "In 4/4 the second number is 4, the beats in a bar"',
        '`.swingBy("1/3", 4)` (a fraction in a string, no swing): `code.swing-fraction-string`',
        "swing on a quarter-note line (the bass on `x x x x`): no change, so the rule cannot measure it; the hint points at the hats",
        "only the riff swung, the hats straight: the Make's rule fails with `rhythm.swing-missing` naming `hats`",
        "Make starter: `rubric.unmet`",
      ],
      connects: {
        back: "U01.L09 heard straight against swung hats; U01's eighth notes and U08.L04's shared rhythm.",
        forward:
          "U11.L08 writes riffs and answers in a shuffle; C5 is a two-chorus shuffle; U13 returns to swing as triplets.",
      },
      epr: {
        enjoyment:
          "One call turns the learner's straight blues into a shuffle that sways; they hear their own track change character at once and leave with a swinging blues they made.",
        pace: "One idea: long–short eighths. The triplet behind them is U13's; sixteenth swing waits for the funk and neo-soul tracks; the form and the riff carry over unchanged.",
        return:
          "The Coda says: you can hear whether a groove is straight or swung and swing your own lines in code. Next: riffs that answer each other, and a line of St. Louis Blues.",
      },
      notes: [
        'Evaluated (contracts §6.10): `s("hh*8").swingBy(1/3, 4)` puts each off-beat hat at 2/3 of its beat; quarter-note lines are unchanged by it, so the bass on `x x x x` stays where it is.',
        'Every swung exercise and the Make\'s reference declare `swing: { subdivision: 8, amount: 1/3 }` (STYLE §7.5), so the staff prints "Swing 8ths" and the matchers compare on the straightened grid.',
        "The Play from the page step is U11's (AUTHORING §4): the staff is the only view of the target; the learner answers in code.",
      ],
    },
    {
      id: "U11.L08",
      author: "U11c",
      idea: "A blues line is a call and its answer: a two-bar riff, then two bars that answer it, three times over the twelve bars. The riff stays the same as the chords change under it; the answer can change. W. C. Handy's St. Louis Blues (1914) opens this way: a sung line, then a fill that answers it.",
      hook: {
        hear: "A shuffle in C: the crunch-guitar riff in bars 1–2 of each line, the organ answering in bars 3–4, over the twelve bars.",
        code: `${T(108)}${blues(FORM, SWUNG_HATS, BACKBEAT, `gtr: n("<${SHUFFLE_RIFF} ~ ~>").scale("C3:blues").swingBy(1/3, 4).s("crunch")`, 'keys: n("<~ ~ [~ 4 5 4 ~ 2 ~ ~] [1 ~ 0 ~]>").scale("C4:blues").swingBy(1/3, 4).s("organ")')}`,
      },
      key: C_BLUES,
      meter: "4/4",
      bpm: 108,
      canDo: ["cd.compose.riff-response"],
      uses: [
        ...BASE,
        ...VOICED,
        ...DRUMS,
        "chord.dom7",
        "scale.blues",
        "snd.crunch",
        "snd.organ",
        "tb.swingBy",
      ],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 1.25,
          what: "Two items, twelve bars each: the riff alone in its lines, then riff and answer.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`keys: n("<~ ~ [~ 4 5 4 ~ 2 ~ ~] [1 ~ 0 ~]>")`: when does it play? (`choose`: in bars 3 and 4 of every four, after the riff / with the riff / only once)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: "The hook with the chord band: what the riff does when the chords move to IV in bar 5 (choice: the same notes, unchanged); how many times the call sounds in the twelve bars (number: 3).",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'Answer the call: the `keys:` line\'s bars 3–4 are `⟪~⟫`; write an answer from the blues scale that ends on 1 (`rubric` matcher: `ends-on-degree` `degrees: ["1"]` on `keys`, `in-key` C blues `minRatio: 1` on `keys`, `distinct-pitches` ≥ 3; edit-only-regions).',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["bar-buttons"],
          minutes: 1,
          graded: true,
          what: "The first line of the 12-bar strain of St. Louis Blues (1914), Oak's plain setting in G from content/repertoire (`song.st-louis-blues`): four bars, the tune and then a fill. In which bar does the answer begin? (`bar-buttons`, `bars: 4`; the bar comes from the verified answer key.)",
        },
        {
          kind: "sing",
          exercise: "sing",
          minutes: 1.5,
          what: 'Hear the call, sing it back on syllables (`mode: "echo"`, the riff\'s first bar: do me fa sol, `labels: "syllables"`, `fallback: "identify"`); then sing an answer of your own (not checked).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "A chorus of riff and response over the shuffle.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The swung twelve bars with a new guitar line every two bars that never repeats. Turn it into a call and response: a riff in bars 1–2 of each line that comes back each time, and an answer on another part in bars 3–4.",
        required: {
          rule: "motif-reuse",
          label: "The riff comes back in every line",
          why: '`motif-reuse` with `track: "gtr"`, `minRatio: 0.5`, `unitBars: 2`: the 2-bar call returns in three of the six 2-bar units (the answers are on `keys`). The through-composed starter fails. The author pins with `content:check --verbose` what the analyzer returns for a `<call call2 ~ ~>` riff over twelve bars (period 4) and sets `minRatio` so the hook passes and the starter fails.',
        },
        suggestions: [
          'an answer on a second part (`tracks`, `min: 2`, `roles: ["melody"]`)',
          'a blue note in the call (`degree-set`, `track: "gtr"`, `contains: ["b3"]`)',
        ],
        band: false,
        flavours:
          "No Band (as built): the shuffle's swung hats and its kick and snare are in the learner's code, as in U11.L07; jazz-soul swaps `organ` for `rhodes` on the answer and `piano` for `rhodes` on the chords; funk keeps `crunch`.",
      },
      srs: [
        { family: "fam.mel.dictation", mode: "review-if-due" },
        { family: "fam.rhy.swing", mode: "review-if-due" },
      ],
      singOn: "syllables",
      mistakes: [
        'the answer ends on ♭3 or 5 (up in the air): `rubric.unmet` on `ends-on-degree`, overridden: "End the answer on home, 1."',
        "the answer written over the call (same bars): `code.edit-outside`",
        "the answer off the blues scale (a natural 3 or 7): `in-key` fails; ♮3 as a passing note after ♭3 is idiomatic, so the step's `minRatio` is 1 only on its short answer",
        'bar-buttons: the fill heard as starting with the last sung word: `id.wrong`, overridden: "Find where the singing stops; the answer starts after it."',
        "Make starter: `rubric.unmet`",
      ],
      connects: {
        back: "U07.L07's call and response and motif; U11.L02's riff; U11.L07's shuffle.",
        forward:
          "U11.CP, then C5 (a two-chorus shuffle with a riff that answers itself) and X2 (St. Louis Blues or Careless Love by ear).",
      },
      epr: {
        enjoyment:
          "Two instruments talk across a swung blues, guitar calling and organ answering: the learner's Make is a full chorus of blues conversation they wrote, the closest yet to a finished blues track.",
        pace: "One idea: the call stays, the answer changes. The St. Louis Blues line is heard, not transcribed (that is X2's), and nothing new in rhythm or harmony is added.",
        return:
          "The Coda says: you can write a blues riff and answer it. Next: the blues checkpoint, then C5, a 12-bar shuffle of your own for the album.",
      },
      notes: [
        "No `repertoire` fragment is pinned in this spec: content/repertoire has no answer key for `song.st-louis-blues` yet, and its notes must come from Handy's 1914 sheet as checked by a human (contracts §2.8 `verifiedBy`). author:repertoire writes `content/repertoire/st-louis-blues/song.ts` (12-bar strain, key G, Oak's plain setting: no dotted value or tie before U13, as the specs test requires of a lesson fragment; the pickup, if the strain has one, declared). The S5 step reads its first four bars and the bar where the answering fill starts from that key; until it exists the step is pending and the author ships nothing that names the song's notes.",
        "The lyric of the strain is not shown or sung (Oak ships no lyrics of a non-PD text; the 1914 words are PD, but the step does not need them).",
        "Evaluated: the hook's call is C3 · E♭3 F3 · G3 F3 · | G♭3 F3 C3 in bars 1–2 of each four (the off-beat F and G swung to 2/3 of their beats); the answer · G4 B♭4 G4 · F4 | E♭4 C4 in bars 3–4 ends on 1. Both lines are written in eighths so the swing is heard: a riff in quarters is unchanged by `swingBy`.",
      ],
    },
  ],
  checkpoint: {
    id: "U11.CP",
    author: "CP",
    authored: [
      {
        id: "build-the-scales",
        kind: "fact",
        skills: ["S09", "S10", "S11"],
        what: 'Three scales on the keyboard, one after another (`all` of three `fact` parts with `scale-builder`, `input: "keyboard"`): D major pentatonic (1 2 3 5 6), E minor pentatonic (1 ♭3 4 5 ♭7), A blues (1 ♭3 4 ♭5 5 ♭7). Graded as pitch-class sets against each tonic. PLANNED answer UI: until it lands, three `keyboard` parts with `expect.pcs`.',
      },
      {
        id: "chart-the-blues",
        kind: "identify",
        skills: ["H10", "F04", "C06"],
        what: 'A 12-bar blues in F (quick change, turnaround in bar 12) played twice, chord symbols hidden: chart it in numerals (`bar-grid`, `bars: 12`, `perRow: 4`, `entry: "rn"`, `qualities: ["7"]`, `given: [1]`; `correct.rn` I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7). Graded bar by bar by degree and quality; a triad numeral (IV for IV7) is `id.quality`. PLANNED answer UI.',
      },
      {
        id: "swing-it",
        kind: "code-modify",
        skills: ["R13"],
        what: 'A straight 12-bar blues with hats and a riff: make it shuffle (`rubric` matcher: `swing` on `["hats", "@drums"]` ratio [1.6, 2.4] and on `gtr` ratio [1.4, 2.4]; `must-use` `tb.swingBy` or `tb.swing`). PLANNED rule `swing` (as U11.L07\'s Make).',
      },
    ],
    recipe: {
      items: [12, 16],
      families: {
        S09: ["fam.key.scale-spell"],
        S11: ["fam.key.scale-spell"],
        F04: ["fam.frm.blues"],
        H10: ["fam.frm.blues", "fam.har.schema"],
        R13: ["fam.rhy.swing"],
      },
      why: "`fam.key.scale-spell` level 4 spells the pentatonic and blues scales in any key (S09, S11; S10 by `build-the-scales`). `fam.frm.blues` level 3 (which chord in a bar, where IV arrives, quick change or standard) measures F04 and H10, with `fam.har.schema` level 4's blues12 items. `fam.rhy.swing` level 2 (straight, triplet, light, hard) measures R13. C06 has no family before U12.L02 (`fam.chd.quality-7th`): `chart-the-blues` and the Make measure it. M08 (riffs and blues melody) is creative: the Make measures it.",
    },
    make: {
      brief:
        "A 12-bar blues of your own over the drums: dominant sevenths, a riff that comes back, an answer, swung or straight as you like.",
      required:
        'M08: `motif-reuse` `track: "@melody"`, `minRatio: 0.5`, `unitBars: 2` (the riff returns in half the 2-bar units). Suggestions: `blues-form` standard or quick change (H10, F04), `chord-qualities` `subsetOf: ["7"]` `depth: "seventh"` (C06), `swing` on the hats (R13).',
    },
    notes: [
      "The checkpoint follows U12.L01 and GYM.11 in the default order (session 127), so it always falls on a later day than U11.L08. It opens C5 (contracts §2.4) and, with A.CP, AC1 (§2.6). U12.L03 onward and all of U13 need it (contracts §7.6 rule 2).",
      "Two of three authored items use planned answer UIs (`scale-builder`, `bar-grid`) and one a planned rule (`swing`): author:CP writes them now and they pass content:check when the answers and grader engineers list them. Fallbacks named per item keep the checkpoint shippable without them.",
      "No sung item is gated (contracts §7.6, §8): a learner in Quiet mode passes the same checkpoint.",
      "U11.CP's Make uses the drums of `band.axis-4bar` until `band.blues-12bar` (requested of author:CP, who owns content/bands) exists.",
    ],
  },
  capstones: [
    {
      id: "C5",
      author: "capstones",
      intent:
        "The fourth composed track on the album (sessions 128–129 in the default order): two choruses of a 12-bar blues in the learner's key, every chord a dominant seventh, a shuffle on the hats, a turnaround in bar 12, a riff that answers itself and the blue notes in the tune. Session 1 builds one chorus (changes, feel, riff); session 2 adds the second chorus with call and response, checks the whole rubric and releases. Everything was taught in U08–U11; nothing new is introduced. From C5 on the tutor review carries two revisions (`reviewRevisions: 2`).",
      opens:
        "When U11.CP is passed or soft-passed (contracts §2.4). Today then offers C5.S1 as the New block; a learner who puts it off keeps going into U12 (a capstone never gates a lesson). In progress, no gym slot interrupts it: the slot waits until C5.S2 is done (§2.5). Its release opens X2.",
      band: "None: a capstone is the learner's whole song, so the starter carries its own `hats:` and `drums:` lines; the swing rule reads the learner's hats. The flavour sets the starter's kit and sounds (§5.10 rule 8: jazz-soul swaps `piano` for `rhodes`; a bass line the learner adds takes `upright` in jazz-soul and `fingerbass` in funk) and never changes the rubric (§6.6).",
      sessions: [
        {
          id: "C5.S1",
          goal: "Changes, shuffle feel and riff.",
          opens:
            "The brief and its starter (content/capstones.ts): `const changes` holding twelve bars of dominant sevenths in C, swung hats, a backbeat, `chords:` and a riff line on `C4:blues` with one bar marked. Tempo 112 (the brief allows 80–140), key C blues (the learner may change the tonic in the `const` and the scale).",
          hear: "The starter looping its twelve bars; A/B against the last saved draft; the chord band reads I7 IV7 V7.",
          see: 'The capstone workspace: the Workbench (code, roll with degree labels, chord band with symbols and numerals), the 12-bar chart view of the changes (notation `chartLayout`, four bars a line, "Swing 8ths" over it) and the C5 checklist with the S1 lines live: "Every chord a dominant seventh", "Swung 8ths on the hats", "Bar 12 contains V", "The riff comes back"; the S2 lines ("two choruses", "♭3 or ♭5 in the tune twice") greyed with "next session". Session bar: "Session 1 of 2: Changes and riff".',
          work: [
            "The changes: the standard form or the quick change, every chord a `7` (C7 F7 G7 in C, or the learner's key).",
            "The feel: `.swingBy(1/3, 4)` on the hats and on the riff; the bass on quarters stays as it is (contracts §6.10 item 4).",
            "The riff: two bars from the blues scale, the same over I and IV; bar 12 turns around on V.",
          ],
          checks: [
            '`capstones.check` runs the whole rubric on each save; the session\'s lines are `sevenths` (`chord-qualities` `subsetOf: ["7"]`, `depth: "seventh"`), `swing` (`track: ["hats", "@drums"]`, `drums: ["hatClosed", "hatOpen", "ride"]`, `subdivision: 8`, `ratio: [1.6, 2.4]`), `turnaround` (`contains-rn` `rn: ["V", "V7"]`, `min: 1`, `section: { bars: [12, 12] }`) and `riff` (`motif-reuse` `track: "@melody"`, `minRatio: 0.6`).',
            "Nothing blocks saving; the draft is the session's Make (contracts §9.1). The session is done when a draft is saved (`capstones.saveDraft`, then `capstones.completeSession`).",
          ],
          ends: 'Draft saved and bound to C5.S1; the Coda says "Next time: the second chorus" and lists the lines already met. No review, no release.',
        },
        {
          id: "C5.S2",
          goal: "Second chorus, turnaround, call and response; release.",
          opens:
            "The C5.S1 draft. The tune line is offered as `arrange()` sections if it is not already (`const melChorus = …`, `const melChorus2 = …`, `mel: arrange([12, melChorus], [12, melChorus2])`, U09.L02): chorus 1 is the riff, chorus 2 is the learner's to write.",
          hear: "The two choruses through, 24 bars; A/B between the draft and the last version; the release recording plays the final version once in full.",
          see: 'The same workspace with every checklist line live, the form map showing `chorus chorus2` (U09.L02\'s lens), the blue-note lens (`blueNotes`, wave5.md §4.3) marking ♭3 and ♭5 in the tune, and the "Review" and "Release" actions at the end. Session bar: "Session 2 of 2: Second chorus and release".',
          work: [
            "The second chorus: call and response, the riff's call in bars 1–2 of each line and an answer in bars 3–4 (U11.L08), on the tune line or a second part.",
            "Blue notes: ♭3 or ♭5 in the tune at least twice (the lens counts them).",
            "The turnaround: bar 12 on V (or `[C7 F7] [C7 G7]`); the very last bar may end on I (the grader's `bluesForm` accepts I or V in bar 12).",
            "Optional: a quick change, an intro, a second sound for the answer, a lighter swing on the tune.",
          ],
          checks: [
            'The whole rubric of contracts §6.6 C5 (content/capstones.ts): `blues-form` `variant: "standard"`, `quickChangeOk: true`, `choruses: 2`; every chord a dominant seventh; `swing` on the hats, ratio [1.6, 2.4]; bar 12 contains V; `degree-set` `track: "@melody"`, `anyOf: ["b3", "b5"]`, `minCount: 2`; `motif-reuse` ≥ 0.6. Tempo 80–140 from the brief\'s `bpm`.',
            'Release is allowed once every required line is met and the latest check graded the code being released (c1: an edited draft says "Check again before you release"); the tutor review (contracts §10.6, `reviewRevisions: 2`) is offered before release and never affects pass or fail.',
          ],
          ends: "Review offered (`review: true`), then release (`release: true`): album track C5 v1 with a recording, a tree-ring cover, deterministic liner notes and the learner's own line. ms.06 (C4 + C5) shows when both are released. Revising later makes v2. X2 opens.",
        },
      ],
      linerNotes: [
        'Deterministic (`linerNotes` of @oak/grader, at release): key, tempo, meter, 24 bars; the form named from `bluesView` ("12-bar blues, quick change, two choruses"); the turnaround ("bar 12 turns around on V"); the feel from `swingView` ("shuffle: swung 8ths on the hats, about 2:1"); blue notes in the tune counted ("♭3 four times, ♭5 twice"); how the riff comes back ("the call returns in bars 1, 5 and 9"); instruments and the flavour; tools used.',
        "The learner's line: one sentence they type at release (`album.patchVersion` `linerNotesMd`).",
        "The tutor's listening note only with consent (`includeReviewNote`, default `Settings.linerNotesInAlbum`).",
      ],
      tests: [
        "The starter fails (`form`: one chorus; `blue-notes` may already pass from the riff's ♭3: pin what it says).",
        "Per shipped flavour, one passing piece (contracts §6.6): pop, the standard form in C at 112 with swung hats, a crunch riff and a call and response in chorus 2; indie, the quick change in A at 96 with a lighter swing on the tune (`.swingBy(.25, 4)`) and swung hats; jazz-soul, `rhodes` and `upright`, F blues with the turnaround `[F7 Bb7] [F7 C7]` at 132; funk, `fingerbass` and swung hats at 100, the riff doubled by the bass.",
        "Fails: one chorus only (`blues-form`, choruses); a C triad in bar 1 (`sevenths`); straight hats (`swing`, `rhythm.swing-missing`); bar 12 on I in both choruses (`turnaround`); a tune with no ♭3 or ♭5 (`blue-notes`); a tune that never repeats (`riff`); IV and V swapped (`blues-form`).",
        "A two-chorus piece written as one 24-bar `const changes` passes `blues-form` as well as the `arrange()` version (capstone mode reads `totalBars` from `arrange()` or the period, contracts §6.4).",
      ],
      notes: [
        "content/capstones.ts is author:capstones': C5's rubric still uses `custom` rules (`blues-form-any`, `all-dominant-sevenths`, `bar-contains-rn`, `blue-notes`). Replace them with the Wave 5 shapes above (foundation-content-lead apiNotes; `packages/content-kit/src/wave5.test.ts` holds parsing versions to copy): `blues-form` + `choruses`/`quickChangeOk`, `chord-qualities` + `depth`, `contains-rn` + `section`, `degree-set` + `anyOf`. Each is planned until the grader lists it; `bun run content:check C5` names them.",
        "C5's `sessionDefs` (built by `compose()` from its `sessions` pairs) already carry the goals above word for word (contracts §2.4), `review` and `release` on S2 and `reviewRevisions: 2` (from C5 on); keep them when the rubric changes.",
        'The swing rule reads `hats` first, then any drum line\'s closed hat, open hat or ride (contracts §6.6 "Which track a swing rule measures"); a learner who swings only the riff fails it with a message naming `hats`.',
        "After editing content/capstones.ts, run `bun scripts/content/spec.ts`: this document renders C5's rubric from it.",
      ],
    },
    {
      id: "X2",
      author: "capstones",
      intent:
        "The second transcription on the album (sessions 130–131 in the default order): a blues by ear, the 12-bar strain of St. Louis Blues (W. C. Handy, 1914) or Careless Love (trad), in stages that must pass in order: the bass (≥ 0.90), the changes (≥ 0.85), then the melody (≥ 0.85). Session 1 takes down the bass and the changes; session 2 the melody, then the arrangement, the review and the release. The learner is told the meter, the key and its tonic, the form, the pickup and the feel (swing 8ths); everything else is heard.",
      opens:
        'When C5 is released (contracts §2.4). While it is closed, `capstones.gate` lists the condition with `met`; Today says "X2 opens when C5 is released". X2 never gates a lesson or a checkpoint; a learner may leave it closed and carry on into U12. In progress it takes the gym slot (§2.5): no separate gym session until X2.S2 is done.',
      band: "None while transcribing: the source is the song itself, Oak's rendition played as a pattern source (hidden reference code in a hidden adapter instance, contracts §6.12) with Oak's accompaniment (a shuffle on the drums, block dominant sevenths and a root bass) at realism R1, the same for every learner. In the X2.S2 arrangement the learner adds what they like under melody, bass and changes; the whole arrangement is their code.",
      sessions: [
        {
          id: "X2.S1",
          goal: "A pre-1930 12-bar blues from the repertoire (Careless Love; St. Louis Blues (1914) once a verified answer key exists): bass, then changes.",
          opens:
            'The song choice (two cards, each with a 4-bar preview, title, year or "trad" and the source edition), then the givens (`TranscribeGiven`): meter (4/4), key and tonic ("G, home is G" for St. Louis Blues; "F" for Careless Love), the form ("one 12-bar strain" or "a 16-bar verse"), the pickup if the answer key has one, the feel ("Swing 8ths": the reference declares `swing`, so a straight answer still matches), and the harmonic rhythm (one chord a bar; a bar with two chords is marked). Starter: `bass:` with one `0` a bar in the song\'s key (`n("<0 0 …>").scale("G2:major")`), a `chords:` line of rests, the melody layer muted in the source mixer.',
          hear: "The song, the bass layer forward: rate 25–100 %, ±12 semitones, an A–B loop on any bars, the bar timeline (no fine-tune for a pattern source), V to switch original ⇄ mine at the same bar. For the changes, the chord layer forward.",
          see: 'The capstone workspace in transcription mode: the stage strip Bass → Changes → Melody (a stage opens when the one before passes; `CapstoneCheckState.after` and `passAt`), the Workbench (code and roll, degree labels; the source\'s code never shown), the 12-bar chart view filling in as the learner writes the changes, the givens card, a Check button per stage. Session bar: "Session 1 of 2: Bass and changes".',
          work: [
            "Bass: the root of each bar by ear, home first (U08.L05, U06.L09). Check.",
            'Changes: each bar\'s chord as a dominant seventh or a triad over the bass the learner found, written as `chord("<G7 …>")` or numerals in the chart; one or two chords a bar as marked. Check.',
            "Hints follow the normal ladder; a reveal shows the stage's answer, gives no evidence and is named in the liner notes.",
          ],
          checks: [
            '`PhraseCheck` `bass`: `phrase: [1, 12]` (16 for Careless Love), `layer: "bass"`, the L3 bass matcher (`melody` on `@bass`, octave-free; `SONG_LADDER_MATCHERS.bass`), pass ≥ 0.90.',
            '`PhraseCheck` `changes`, `after: ["bass"]` (feature `capstone.check-after`): `layer: "chords"`, `{ m: "harmony", level: "rn", qualityDepth: "seventh", inversion: false, harmonicRhythm: "given", weights: { bass: 0 }, wrongQuality: "none" }` (Wave 6, d11: the dominant sevenths are part of the answer, and a wrong quality earns nothing, as on ladder L6), pass ≥ 0.85. Graded in capstone mode (contracts §6.4) and recorded with `capstones.recordCheck`.',
          ],
          ends: 'Draft saved and bound to X2.S1; the session completes when both checks are recorded (passed or revealed). Coda: "Bass and changes are down; next time the melody".',
        },
        {
          id: "X2.S2",
          goal: "Melody, review, release.",
          opens:
            'The X2.S1 draft with a `mel:` line added (`n("⟪~⟫").scale(…)` in the song\'s key) and the melody layer unmuted; the givens card stays. No rhythm skeleton (X1 gave one; X2 is the second transcription).',
          hear: 'As X2.S1, with the melody forward and the A–B loop on one 4-bar line at a time; "play from bar N" for the joins.',
          see: 'The same workspace; bass and changes marked done (or revealed); the melody split into its lines (Line 1 · 2 · 3 for the 12-bar strain, four for Careless Love), each with a Check; then the arrange view (Workbench `full`) and the Review and Release actions. Session bar: "Session 2 of 2: Melody and release".',
          work: [
            'Each line of the melody by ear, with blue notes written as note names or on `.scale("G4:blues")` where the tune bends (♭3 and ♭7 over I).',
            "Join the lines and play the whole strain against the original from bar 1.",
            "Arrange: melody, bass, changes and, if wanted, drums and a second sound; swing the lines that swing. The arrangement is the learner's (not graded).",
          ],
          checks: [
            '`PhraseCheck` `melody-1` … `melody-3` (`melody-4` for Careless Love), each `after: ["changes"]`, one 4-bar line each: `melody`, `pitch: "key-relative"`, `wPitch: 0.8`, `wRhythm: 0.2`, `rhythmTol: [1, 16]`, pass ≥ 0.85, with the song\'s `pickup` and `swing` in the context (contracts §6.6 X2: melody ≥ 0.85; `TRANSCRIBE_PASS.X2`).',
            "Release needs the bass, the changes and every melody line recorded (passed or revealed); the arrangement is not graded.",
          ],
          ends: 'Tutor transcription review offered (`review: true`, contracts §10.6: sections, plausibility flags, next focus; never pass or fail; two revisions), then release (`release: true`): album track X2 v1, recording, cover, liner notes. ms.14 "You can now transcribe a blues" shows. The ladder counts the release as an L6 pass.',
        },
      ],
      linerNotes: [
        'The song: title, year or "trad", status (US-PD / trad), the source edition (`provenance`), "Oak\'s rendition; transcribed by ear".',
        "Key, meter, the pickup, the form (12-bar strain, standard or quick change as heard; or 16-bar verse), the changes as numerals, the feel.",
        'Per stage and per melody line: transcribed by ear (score) or "revealed" (contracts §6.6: a revealed phrase is named).',
        "Instruments of the learner's arrangement; the learner's line; the tutor's listening note only with consent.",
      ],
      tests: [
        "`bun run content:check X2` resolves every check against both songs (`capstoneSessionSections`): until each song's answer key has `layers.bass`, `layers.chords`, `layers.melody` and `answerKey.phrases`, the checks are pending.",
        "Per song: the answer key's bass passes `bass`; the bass a bar late fails it; the bass right with a natural-minor chord quality in one bar still passes `changes` only if ≥ 0.85 (pin the score); IV7 for V7 in bar 9 alone passes (11/12 ≥ 0.85) and the whole last line wrong fails; each melody line passes, a line a degree off throughout fails with `melody.index-shift`, the same line in another key passes (key-relative), a straight answer to a swung line passes with `rhythm.swing-missing` as an info note.",
        "Order: a `changes` check before `bass` passes is refused (`open: false`, `after` unmet); `melody-1` before `changes` likewise; a revealed stage opens the next.",
      ],
      notes: [
        'content/capstones.ts is author:capstones\': X2\'s `sessionDefs` (built by `transcribe()`) already have the goals, review and release on S2 and `reviewRevisions: 2`; they need the checks above (X2.S1: `bass`, `changes` with `after: ["bass"]`; X2.S2: `melody-1`… with `after: ["changes"]`) and the givens per song. `PhraseCheck.after` is the planned feature `capstone.check-after`.',
        "Pool (contracts §2.4, §2.8): the St. Louis Blues 12-bar strain (1914, US-PD, key G in Oak's setting) and Careless Love (trad, F, a 16-bar verse). author:repertoire writes both `song.ts` answer keys with `layers` bass/chords/melody, `phrases` per 4-bar line, `swing: { subdivision: 8, amount: 1/3 }` (Oak's rendition shuffles), the pickup the cited edition has, and a `verifiedBy` human; a song without one is offered as \"Being checked\" and cannot be chosen.",
        "Oak's setting of either song is plain (no dotted value or tie unless the answer key's setting note justifies one: X2 comes before U13's ties and dots, so a held note takes the next beat as U07's settings do).",
        "The source plays at R1 for everyone so X2's difficulty is the song's, not the learner's gym realism; grading tolerances never change with realism (§6.12).",
      ],
    },
  ],
  gym: {
    summary:
      "Ladder levels L5 and L6 (Wave 5): the first song levels of the Transcription Gym. The slot rule, the gym session's budget at each target, levels L1–L4, realism and own audio are specified in content/specs/U07.md and unchanged; this section adds what L5 and L6 serve, how an item is cut from a song, what is given, how they are graded, which realism applies and when the learner moves up. Nobody authors a ladder item: L5 and L6 read the repertoire's verified answer keys (content/repertoire, author:repertoire) and are graded by `gradeSongLadder` (@oak/grader `grade/song-ladder.ts`, wave5.md §3.2); the server serves them through `ladder.songs`, `ladder.next` and `ladder.submit` (wave5.md §5.3).",
    slots: [
      "Unchanged (U07.md): every fifth session from U07.L01 is a transcription slot; odd `GYM.nn` are graded ladder sessions at the learner's level and realism, even ones own audio (or a ladder session one realism level up when there is no audio project).",
      "A song item spans sessions: `ladder.next { level: 5 | 6, songId? }` creates a `pd-song` project the first time and resumes it after; the next ladder slot opens the same song at its next unpassed phrase (L5) or stage (L6) until the song is done, then offers the next song.",
      'The learner picks the song from `ladder.songs` (title, year or trad, phrases, status); a song whose answer key has no `verifiedBy` is listed as "Being checked" and cannot be chosen.',
      "X1 and X2 take the slot when they are next (§2.5); while a learner is in X2, the gym does not also serve L6.",
    ],
    budget: [
      {
        target: 15,
        minutes: 10,
        contains:
          "L5: one phrase (4 bars), A/B as often as wanted, check, save. L6: one stage of the strain (the bass, or the changes, or one melody line).",
      },
      {
        target: 20,
        minutes: 14,
        contains: "L5: two phrases. L6: the bass and the changes, or two melody lines.",
      },
      {
        target: 25,
        minutes: 19,
        contains:
          "L5: three phrases, or a whole short song (Oh! Susanna). L6: two stages, or the last melody lines and a transcription review from the tutor (code only, never audio).",
      },
    ],
    ladder: [
      {
        level: 5,
        material:
          "One phrase (4 bars, as the answer key's `phrases` cut it) of a public-domain folk tune from the L5 pool with a verified answer key: Aura Lee (1861), Red River Valley (trad), Shenandoah (trad), Simple Gifts (1848) and Oh! Susanna (1848); Drunken Sailor and Scarborough Fair (Dorian) only from U14.L03 (`availableFrom`); never Amazing Grace (U07.L09 reading only). Melody only: the chords play as accompaniment and are not graded at L5. A song is worked phrase by phrase, in order; a phrase already passed in X1 is not served again.",
        source:
          "content/repertoire `<song>/song.ts` (`folkSong`: melody, harmony, phrases, pickup, the setting note), Oak's rendition played as a pattern source with Oak's plain accompaniment (block chords and a root bass); the hidden code never reaches the browser.",
        given:
          'Tempo, meter, key and tonic, the pickup ("the tune starts on beat 3 of bar 0" or "on beat 1"), the phrase\'s bars. No rhythm skeleton (X1 gave one). At R2+ the key may be transposed up to ±5 semitones; the given key says so.',
        grading:
          'Per phrase: `melody`, `pitch: "key-relative"`, `wPitch: 0.8`, `wRhythm: 0.2`, `rhythmTol: [1, 16]`, with the pickup in the context (`SONG_LADDER_MATCHERS.melody`), lesson mode, pass ≥ 0.85 (`SONG_LADDER_PASS[5]`); a phrase written from the bar line where the song has a pickup gets `rhythm.pickup-missing`.',
      },
      {
        level: 6,
        material:
          "One strain of a blues published by 1930 from the L6 pool with a verified answer key: the St. Louis Blues 12-bar strain (1914), a 12-bar strain of Memphis Blues (1912), Frankie and Johnny (trad, 12-bar verse) and Careless Love (trad, 16-bar verse); Old Joe Clark (Mixolydian) from U14.L02 and Sweet Georgia Brown from U15.L05 (`availableFrom`); the standards in the repertoire's ladder-6 pool (Body and Soul, Georgia on My Mind, I Got Rhythm) only from their own lessons (requested of author:repertoire: `availableFrom` U17.L04 and J4.L03). Three layers in stages: bass, then changes, then melody.",
        source:
          "content/repertoire (pool L6), Oak's rendition with its `swing` declared (the blues shuffle at every realism level), played as a pattern source with a shuffle on the drums, block chords and a root bass.",
        given:
          'Tempo, meter, key and tonic, the form ("one 12-bar strain", "a 16-bar verse"), the pickup, the feel ("Swing 8ths": grading straightens the reference, so a straight answer still matches), the harmonic rhythm (one chord a bar; two-chord bars marked).',
        grading:
          "Staged, in order (`SONG_LADDER_STAGES`, `nextSongStage`): `bass` (melody on `@bass`, octave-free) ≥ 0.90 → `changes` (`harmony`, level `rn`, seventh depth, a wrong quality earns nothing: Wave 6, d11) ≥ 0.85 → `melody` (key-relative, per 4-bar line) ≥ 0.85 (`SONG_LADDER_PASS[6]`, as X2); capstone mode (contracts §6.4: gym L6 is graded like a capstone); each stage opens after the one before passed.",
      },
    ],
    realism: [
      "As U07.md (contracts §6.12): R0 clean and quantized; R1 humanized ±15 ms and velocity ±0.1; R2 the feel where idiomatic, plus room; R3 dense mix with the target layer 6 dB down; R4 a vocal-like lead (`tenor`, `choir`) and detune up to ±30¢. Up one step after two consecutive ladder sessions whose best item scored ≥ 0.9, down one after a session below 0.6; a new level starts at R0.",
      "L5 folk: R2 adds room and a light lilt only where the tune has one (none in the current pool: folk songs stay straight); from R2 the phrase may also be transposed (given). R3 puts the accompaniment over the tune; R4 sings the tune on `tenor` or `choir`.",
      "L6 blues: the shuffle is the song's own feel and is there from R0 (declared and given, never a realism step); R2 adds room and humanized drums; R3 brings the other layers up over the stage's layer (the bass under chords and drums for the bass stage); R4 puts the melody on `tenor` or a horn-like lead with detune.",
      "Grading tolerances never change with realism; answers stay on the grid (the swung grid is straightened first).",
    ],
    levelUp: [
      "L4 → L5: offered (`ladder.get` `levelUp`) after two graded L4 passes at R2 or higher on two different learner days (wave5.md §5.3); the released X1 counts as an L5 pass, so a learner whose X1 is out already has one. The learner takes it on the gym screen (`ladder.setLevel`) or stays.",
      "A graded L5 pass is a song whose every phrase passed at ≥ 0.85 unrevealed; a graded L6 pass is a strain whose three stages passed unrevealed (`songLadderPassed`). A hum-to-draft that was not corrected and checked never counts.",
      'L5 → L6: offered after two graded L5 songs once U11.L05 (the 12-bar form) is completed, since L6 material is blues (wave5.md §5.3; this replaces U07.md\'s "only once X2 is released"). The released X2 counts as an L6 pass.',
      "Down a level at any time; L7 is never a ladder level a learner sets (it is the even slots), and L8 is CF-T's.",
      "Dev seeds: `ladder L5` (through `after U10.L02`, L5, R0, one song with phrase 1 passed) and `ladder L6` (through `C5 released`, L6, R1, one song with the bass stage passed); `ladder level-up due` offers L5 (wave5.md §6).",
    ],
    ownAudio: [
      "Unchanged (U07.md): the even slots. A learner's own blues recording can be worked in the same stages as L6 (Bass, Chords, Melody layer modes as their `tb.feature.transcribe.*` rows allow), self-assessed.",
    ],
    notes: [
      "L5 and L6 are the first ladder levels with no generator: they are only as wide as the repertoire's verified answer keys. Today, content/repertoire has answer keys for Aura Lee, Red River Valley, Shenandoah, Simple Gifts, Oh! Susanna (and the U03 fragments), none of them `verifiedBy` yet; the L6 songs have stubs only. Until a human verifies a key, its song is \"Being checked\": author:repertoire's work in this wave decides how many songs L5 and L6 can serve.",
      'content/gym/ladder.ts lists L5\'s layers as melody and chords; L5 grades the melody only (the chords are accompaniment, X1.S3 and L3 already graded chords bass first). Requested of drills-engine: L5 `layers: ["melody"]`, or a note that chords play ungraded.',
      'Simple Gifts has no printing from 1930 or earlier in its provenance (content/repertoire note), so it stays "Being checked" until one is found: L5\'s pool at launch is at most four songs.',
      "St. Louis Blues and Careless Love are both X2's songs and L6's; a song released as X2 is not served again at L6 for that learner.",
    ],
  },
};
