// U13 Rhythm II: the unit spec (rendered to content/specs/U13.md by `bun scripts/content/spec.ts`). Six lessons
// and U13.CP, the checkpoint over U12 and U13 that opens the jazz and rhythm tracks. Every hook was evaluated
// with headless Strudel and is linted in its lesson by content/validate/specs.test.ts; U13.L01 is the exemplar,
// written and passing with the real grader (content/core/U13/L01).
import type { UnitSpec } from "./types.ts";

const C = { tonic: "C", mode: "major" } as const;
const T = (bpm: number, units = 4) => `setcpm(${bpm}/${units})\n\n`;

/**
 * What every U13 lesson has from U01–U12: the drum sounds and their mini-notation, one `const` driving chords
 * and bass, sevenths by name over a root bass, `.struct()`, the funk bass sound.
 */
const BASE = [
  "tb.setcpm",
  "tb.label",
  "tb.s",
  "tb.mini.seq",
  "tb.mini.rest",
  "tb.mini.repeat",
  "tb.mini.sub",
  "tb.mini.alt",
  "tb.mini.elongate",
  "tb.mini.replicate",
  "tb.gain",
  "tb.struct",
  "tb.const",
  "tb.n",
  "tb.n.range",
  "tb.scale",
  "scale.major",
  "tb.s.pitched",
  "snd.piano",
  "snd.rhodes",
  "snd.organ",
  "snd.fingerbass",
  "tb.lpf",
  "tb.clip",
  "tb.chord",
  "tb.voicing",
  "tb.rootNotes",
  "chord.triad",
  "chord.dom7",
  "chord.seventh",
  "tb.feature.rn",
  "tb.feature.chord-symbols",
] as const;
const PUSH = ["tb.early", "tb.late"] as const;
const GHOST = ["tb.velocity", "snd.cleangtr"] as const;

/** The grid of U13.L01 and L03: kick on 1 and 3, snare on 2 and 4, eight even hats. */
const KICK = 'kick: s("bd ~ bd ~")';
const SNARE = 'snare: s("~ sd ~ sd")';
const hats = (gain: string) => `hats: s("hh*8").gain(${gain})`;
/** U13.L01: ii7 V7 Imaj7 IVmaj7 in C, the bass on beats 1, 3 and 4, the Rhodes an eighth note ahead of each bar. */
const PUSHED = [
  'const changes = "<Dm7 G7 C^7 F^7>"',
  "",
  KICK,
  SNARE,
  hats(".5"),
  'bass: chord(changes).rootNotes(2).struct("x ~ ~ ~ x ~ x ~").s("fingerbass").lpf(800)',
  'chords: chord(changes).voicing().early(1/8).s("rhodes")',
].join("\n");
/**
 * U13.L02: a ii7–V7 funk vamp on the sixteenth grid. Kick on 1, the "and" of 2 and the "and" of 3, the bass
 * locked to it; the snare loud on 2 and 4 with three ghost notes; hats and guitar accented inside the beat.
 */
const FUNK = [
  'const changes = "<Dm7 G7>"',
  "",
  'kick: s("bd ~ ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~")',
  'snare: s("~ ~ ~ ~ sd ~ ~ sd ~ sd ~ ~ sd ~ ~ sd").velocity("1 1 1 1 1 1 1 .3 1 .3 1 1 1 1 1 .3")',
  'hats: s("hh*16").velocity("[1 .4 .7 .4]*4").gain(.5)',
  'bass: chord(changes).rootNotes(2).struct("x ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~").s("fingerbass").lpf(800)',
  'gtr: chord(changes).voicing().struct("x*16").s("cleangtr").velocity("[.25 .25 1 .25 .25 1 .25 .25]*2").clip(.5).gain(.6)',
].join("\n");
/**
 * U13.L03: the last phrase of the Ode to Joy theme as Beethoven wrote it (bars 12–16 in C). The E of bar 13
 * arrives on beat 4 of bar 12 and is tied over the bar line (`2@2` inside a two-bar bracket); bar 16 is a
 * dotted quarter, an eighth and a half note (`1@3 0 0@4`).
 */
const ODE = [
  KICK,
  SNARE,
  hats(".4"),
  'bass: n("<[0 4] 0 4 0 [4 0]>").scale("C2:major").s("fingerbass").lpf(800)',
  'chords: chord("<[C G] C G C [G C]>").voicing().s("rhodes").gain(.6)',
  'mel: n("<[0 1 -3 2@2 2 3 4]@2 [4 3 2 1] [0 0 1 2] [1@3 0 0@4]>").scale("C4:major").s("piano")',
].join("\n");
/** U13.L04: a soul ballad in 6/8. Two beats a bar, each three eighths; the Rhodes rolls each chord up and down. */
const BALLAD_68 = [
  'const changes = "<C^7 Am7 F^7 G7>"',
  "",
  'kick: s("bd ~ ~ ~ ~ bd")',
  'snare: s("~ ~ ~ sd ~ ~")',
  'hats: s("hh*6").velocity("[1 .5 .6]*2").gain(.5)',
  'bass: chord(changes).rootNotes(2).struct("x ~ ~ x ~ ~").s("fingerbass").lpf(800)',
  'chords: chord(changes).voicing().arp("0 1 2 3 2 1").s("rhodes")',
].join("\n");
/** U13.L05: the same four chords as a slow-dance ballad in 4/4, three to every beat, a roll into the repeat. */
const BALLAD_TRIPLETS = [
  'const changes = "<C^7 Am7 F^7 G7>"',
  "",
  KICK,
  'snare: s("~ sd ~ sd").ply("<1 1 1 [1 1 1 3]>")',
  'hats: s("hh*4").ply(3).velocity("[1 .5 .6]*4").gain(.5)',
  'bass: chord(changes).rootNotes(2).struct("x ~ x ~").s("fingerbass").lpf(800)',
  'chords: chord(changes).voicing().struct("x*4").ply(3).s("piano").gain(.6)',
].join("\n");
/** U13.L06: one two-bar groove, the kick and the bass on one rhythm, to be heard straight, swung and in 12/8. */
const CALL = [
  'const hits = "<[x ~ ~ x ~ ~ x ~] [x ~ ~ x ~ x ~ ~]>"',
  "",
  'kick: s("bd").struct(hits)',
  SNARE,
  hats(".5"),
  'bass: n("<0 3>").struct(hits).scale("C2:major").s("fingerbass").lpf(800)',
].join("\n");

export const U13: UnitSpec = {
  unit: "U13",
  title: "Rhythm II",
  summary:
    "Six lessons that take the learner's rhythm off the grid of U01 and put it where records put it. Until now every chord changed on beat 1 and every hit was as loud as the next. U13 teaches the five things that make a groove feel played: chords and notes that arrive early, the push, with `.early()` and `.late()` (U13.L01, the exemplar); loud and quiet hits inside a sixteenth-note groove, ghost notes, with `.velocity()` (U13.L02); notes that last longer than their beat, written with dots and ties, which is also how a page writes a push (U13.L03); beats that divide in three, 6/8 and 12/8 with the dotted-quarter beat (U13.L04); three in the time of two inside 4/4, triplets, with `.ply()`, and what the swing of U11 was made of (U13.L05); and writing down syncopated, swung and compound rhythms by ear (U13.L06). Every rhythm is felt before it is counted: tapped, then coded, then read. Funk and soul carry the unit: a kick, a snare and hats in the learner's own code, a finger bass, the seventh chords of U12 on the Rhodes, a clean guitar from U13.L02, a 6/8 soul ballad in U13.L04. In the default order U13.L01–L03 are sessions 138–140, GYM.13 follows, U13.L04–L06 are sessions 142–144, and U13.CP (session 147, after U14.L01 and GYM.14) covers U12 and U13 and opens the jazz and rhythm tracks.",
  conventions: [
    "The groove is the lesson, so the drums are the learner's: every step's code carries its own `kick:`, `snare:` and `hats:` lines (one drum per line, the U01 way), and no Make takes a Band (`band: false`, each with its reason in `NO_BAND` of content/validate/specs.test.ts). A push, a ghost note and a triplet are heard against a grid the learner can see and edit; a Band's drums would double those lines, and the jazz-soul Band swings its ride (the off-beat two thirds of the way through the beat), so a chord pushed by a straight eighth would land a triplet away from it. Starters therefore carry a whole rhythm section (drums, `bass:` on `fingerbass`, `chords:` on `rhodes`), and a flavour changes only starter sounds that are already unlocked (`flavours.sounds`; contracts §5.10 rule 8). No Band is written in 6/8 or 12/8: U13.L04 could not take one in any case.",
    'Felt, then coded, then read. Every lesson has a `tap` step before the first step that shows new code: the learner taps the push, the kick of a funk bar, the dotted figure, the two beats of 6/8, a triplet. Tap steps are never graded and never gate (contracts §8.4, §8.5; they need no mic, so Quiet mode changes nothing). The staff arrives in U13.L03: U13.L01 and L02 show the roll only, because a push cannot be engraved without a tie and "before U13.L03 nothing needs a tie or a dot" (contracts §2.8). From U13.L03 on, every staff example must render with `approximate = false` (check 9); @oak/notation engraves ties over beats and bar lines, dotted values, 6/8 and 12/8 beaming and triplet brackets from the events.',
    'Naming a place in the bar: prose counts eighths "1 & 2 & 3 & 4 &" and sixteenths "1 e & a" in simple meters, "1 la li 2 la li" in compound meters (contracts §6.9) and "1 trip let" for triplets, and names a spot as the learner would say it: "the “and” after beat 4", "the last sixteenth of the bar". In code a length or a shift is a share of the bar (the cycle): in 4/4 an eighth note is `1/8` and a sixteenth `1/16`; in 6/8 an eighth is a sixth of the bar and in 12/8 a twelfth. Say this once per lesson that uses a fraction.',
    '`.early(t)` and `.late(t)` move a whole line by `t` bars: `.early(1/8)` makes every note of the line arrive an eighth note sooner, `.late(1/8)` an eighth later (STYLE §11 rule 3). The amount is a bare JavaScript number, never a string: `.early("1/8")` shifts nothing and the lint says so (`code.time-fraction-string`; today the lint also adds a stray `code.uncatalogued` line about `slow` for the `/` inside the quotes, reported to its owner). The call goes after pitch and structure and before the sound (STYLE §1 rule 5): `chord(changes).voicing().struct("x x x x").late(1/8).s("organ")`. Written before `.struct()` it moves the chords under an unmoved rhythm, which is a realistic mistake to pin. In U13 the amount is always an eighth or a sixteenth; a patterned amount (`.late("<0 .125>")`, decimals) and shifts of a few milliseconds are R1.L05\'s. `.nudge()` never appears (contracts §3.1 rule 8).',
    'A line moved with `.early()` has nothing to play at the very start: its first note would have begun before bar 1, so the first time through the line enters at its first shifted onset (verified: `chord("<Dm7 G7 C^7 F^7>").voicing().early(1/8)` first sounds G7 at 7/8 of bar 1; Dm7 arrives at 31/8, ahead of the repeat). Every shown example keeps the drums and the bass on the beat so bar 1 is never empty, U13.L01 S4 tells the learner why, and graded references are compared from the same start, so the gap is in both. Never write prose that says a pushed line "starts on beat 1".',
    'Dynamics: `.velocity("…")` gives each hit its strength, one value for every step of the pattern on its left (a control pattern takes its rhythm from the left, STYLE §11 rule 7: `s("sd*8").velocity("1 .3")` plays four loud hits and then four quiet ones; the cell must be repeated, `"[1 .3]*4"`). Accents are 1, ghost notes .4 or less (STYLE §11 rule 5); never write 0 (the grader counts any hit at .4 or less as a ghost note) and never a rest in the velocity string (a `~` there silences the hit under it). The effective level of a hit is `gain × velocity`, which is what `velocity-ghosts` reads. The `controls` matcher does not read `velocity`, so "match these dynamics" is a `rubric` matcher with `velocity-ghosts` (`track`, `min`, `on: "16th-offbeat"`, `accents`), PLANNED until the grader lists the rule and its `accents` field.',
    'Long notes in code are shares of the bracket: `@` gives a note a weight (`[1@3 0 0@4]` is three eighths, one, four: a dotted quarter, an eighth, a half note), and a note held across a bar line is written in a two-bar bracket inside `< >` (`<[0 1 -3 2@2 2 3 4]@2 …>`: the `2@2` starts on beat 4 and ends after beat 1 of the next bar; evaluated). On the staff the same notes are a dot and a tie. A line pushed with `.early()` engraves as tied notes too: U13.L03 shows the U13.L01 push on the staff and says so. Staff writing with these values uses the note-list tokens `4.` (dotted quarter) and `8t` (triplet eighth) and `palette.ties: true` (features `staff-input.dots`, `.triplets`, `.ties`: PLANNED until the answers engineer builds them; tests answer `{ staff: "E4:4. G4:8~ G4:2" }`).',
    'Compound meter: the lesson or exercise declares `meter: "6/8"` (or `"12/8"`), the tempo line divides by the beats in the bar, `setcpm(bpm/2)` in 6/8 and `setcpm(bpm/4)` in 12/8, and BPM counts the dotted quarter (contracts §6.9; `tb.meter.compound`, U13.L04), so `setcpm(60/2)` is 60 beats and 180 eighth notes a minute. A bar is still one cycle: six equal steps in two groups of three, or twelve in four groups. The wrong divisor is `code.setcpm-form` ("In 6/8 the tempo line divides by 2"). Swing is not used in compound meters (STYLE §7). A lesson or exercise in a compound meter is the PLANNED feature `meter.compound` until every host draws the dotted-quarter beat (roll grid, counts, taps, grids); a `grid` answer with `stepsPerBar: 6` is the PLANNED feature `grid.steps`, while 12 steps (a 12/8 bar, or eighth-note triplets in 4/4) is graded today.',
    'Triplets are a bracket of three (`[hh hh hh]`) or `.ply(3)`, which plays every step of a line three times in its own time (`s("hh*4").ply(3)` is twelve hats; `tb.ply`, U13.L05). A patterned `.ply("<1 1 1 [1 1 1 3]>")` is how a roll is written into one beat of one bar. The swing of U11.L07 is the first and third note of a triplet: `s("hh*8").swingBy(1/3, 4)` and `s("[hh ~ hh]*4")` have the same onsets (verified), and U13.L05 shows it. Other tuplets (five, seven) are the rhythm track\'s.',
    'Grading (AUTHORING §19.3): a rhythm is compared with the `rhythm` matcher on the named tracks (`tol: [1, 32]`, `durations: false` for drums) or `events` with `durations: true` where lengths are the point (U13.L03); a pushed chord line is the same chords at other times, so `pcset` with `perOnset` (U13.L01: `.late(7/8)` lands on the right eighth with the wrong chord and fails on the notes). The `syncopation` rule counts notes that start on a weak position and hold over a stronger one (Longuet-Higgins and Lee): a chord on the "and" after 4 held over beat 1 counts, so does a chord on beat 4 held over beat 1, and so does a note left ringing after an "and"; even eighths or sixteenths never count. In a looped line the last note of the window counts only if a stronger position follows it inside the bar, so `.early(1/8)` over four bars scores 3. `onsets` with `perBar: true` asks every bar for the listed positions (shares of the bar). Tap steps use `windowMs: "auto"` and tests in seconds from the start of the stimulus.',
    'Tapping a push: an eighth-note push must stay longer than twice the tap window (240 ms), or a learner who taps on the beat would be forgiven as "consistently late" (the coarse-offset step of `gradeTaps`). At 96 BPM an eighth is 312 ms; keep any step that taps an eighth-note push at 110 BPM or slower, and never ask for a tapped sixteenth push.',
    "Keys, tempos and sounds: every lesson is in C major so that nothing but rhythm is new, at 96 BPM (L01, L02), 100 (L03), 60 to the dotted quarter (L04), 76 (L05) and 92 (L06). Harmony is U12's: sevenths by name in one `const` read by `chords:` and `bass:`. Sounds: the default kit, `fingerbass` with `.lpf(800)`, `rhodes`, `organ` for stabs, `piano` for tunes and triplets, and `cleangtr` from U13.L02. Chords are graded by pitch-class set only; no check and no sentence depends on a voicing's octave or top note (contracts §6.7).",
    'Words that wait: "syncopation" and "anticipation" (U13.L01; U06.L12 and U08.L04 said "between the beats" and "leans into beat 3"); "ghost note" (U13.L02; before it "a quiet hit"); "tie" and "dotted" (U13.L03; before it "holds across the bar line", "three eighth notes long"); "compound meter" and "simple meter" (U13.L04); "triplet" (U13.L05; U11.L07 said "long–short" and "two thirds of the way through the beat"). Not in the core at all: "hemiola", "polyrhythm", "clave", "metric modulation", "microtiming", "laid back" as a term (the rhythm track). "Backbeat", "subdivision", "fill", "pickup", "comping", "groove lock", "swing" and "shuffle" are known. Players say "push" for an anticipation; prose may use it as plain English from U13.L01 on.',
    "Ear training, stage H, the rhythm part (contracts §7.3): `fam.rhy.syncopation` is seeded in U13.L01 (find the kick off the beat on a sixteen-step grid) and played at level 3 in U13.L02; `fam.rhy.echo` opens level 5 (syncopated figures) in U13.L01, its triplet items in U13.L05 and level 7 (3/4 and compound) in U13.L04; `fam.rhy.read` gets dotted and tied figures from U13.L03; `fam.rhy.meter` level 3 (6/8 against 3/4) and `fam.rhy.count` level 4 open in U13.L04; `fam.rhy.subdivision` is seeded in U13.L05, where `fam.rhy.count` level 3 opens; `fam.rhy.dictation` levels 5 to 7 (dotted, syncopated, triplets, on the staff) open in U13.L06. A generator step has no tests in the lesson.",
    'Feedback the grader emits on U13 steps (pin what `bun run content:check <id> --verbose` prints): `harmony.pcset` (a chord line at the wrong time), `code.time-fraction-string`, `code.locked-tool` (`velocity` before U13.L02, `ply` before U13.L05, a 6/8 tempo line before U13.L04), `code.setcpm-form`, `code.tempo`, `rhythm.missing` / `rhythm.extra` / `rhythm.displaced`, `melody.rhythm-note`, `staff.*`, `tap.missed` / `tap.extra` / `tap.offset`, `id.wrong`, `investigate.wrong`, `code.must-use`, `code.edit-outside`, `code.unchanged`, `rubric.unmet` (overridden with the neutral "{label}: not yet.").',
    'Scaffolds (AUTHORING §6, U11 and later): roll labels off on drum steps (`rollLabels: "none"`); the chord band is opened by the steps where which chord arrives matters (`initialPanels: ["chords"]`); the staff is the treble staff for tunes and the percussion staff for drum figures (AUTHORING §6 rule 3: a long value under faster hats engraves short, so show a rhythm to be read without the hats). U13\'s Play from the page step is U13.L03 S6.',
    "Gates: all of U13 needs U11.CP passed or soft-passed (contracts §7.6 rule 2). U13.CP opens when U13.L06 is completed and is placed after U14.L01 and GYM.14.",
  ],
  lessons: [
    {
      id: "U13.L01",
      author: "spec-U13",
      idea: "A chord can arrive before its beat. When the Rhodes plays the next bar's chord on the last eighth note and holds it across the bar line, the groove leans forward: that early arrival is an anticipation, and accents between the beats are syncopation. In code one call moves a whole line: `.early(1/8)` an eighth note sooner, `.late(1/8)` an eighth later.",
      hook: {
        hear: "Dm7, G7, Cmaj7, Fmaj7 on the Rhodes over a kick, a snare, hats and a finger bass, every chord landing on beat 1 with the bass. Then the same loop with one change: the Rhodes gets to each chord an eighth note early, and the bass confirms it on beat 1. Both play within the first 25 seconds.",
        code: `${T(96)}${PUSHED}`,
      },
      key: C,
      meter: "4/4",
      bpm: 96,
      canDo: ["cd.code.pushes"],
      uses: [...BASE, ...PUSH],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items, four bars each: the loop with the Rhodes on the beat, then with `.early(1/8)` on the Rhodes line. The caption names the one thing that moved.",
        },
        {
          kind: "tap",
          exercise: "tap",
          answer: ["tap"],
          minutes: 1,
          what: 'Feel it first: tap where the Rhodes comes in, one tap a bar on the "and" after beat 4, over four bars of the pushed loop (`mode: "along"`, `target: { track: "chords" }`). Taps on beat 1 or on beat 4 fail: each is an eighth note, 312 ms, away from the chord, outside the window.',
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "The line the learner tapped ends `.early(1/8)`. Here the number is `1/16`: what will they hear? (`choose`: a shorter push, a sixteenth before the bar line / a longer push, a whole beat / sixteen chords in every bar.) The number is a share of the bar.",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: 'Run the eighth-note push with the roll and the chord band: on which count does each Rhodes chord start (choice: the "and" after beat 4); each chord lasts eight eighth notes, how many come after the bar line (number: 7). The pass text names both terms and says why bar 1 waits for the Rhodes the first time through.',
          term: ["term.anticipation", "term.syncopation"],
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: "A new loop (`<Am7 Dm7 G7 C^7>`) with everything on the beat: make the Rhodes arrive an eighth note before each bar line. `pcset` per onset on `chords`, `edit-only-regions` (only the Rhodes line); the target is audible and its roll appears after a failed try.",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 0.75,
          graded: true,
          what: 'The mirror: an organ plays a short chord on every beat (`.struct("x x x x")`, `.clip(.5)`); move all four an eighth note later with `.late(1/8)`, the off-beat chop of ska and disco. `pcset` per onset: `.early(1/8)` gives the same four "ands" with the next bar\'s chord on the last one, and fails.',
        },
        {
          kind: "ear",
          exercise: "all",
          parts: ["identify", "identify", "identify", "identify"],
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "Four two-bar grooves with two chords a bar, the drums and the bass never moving: do the chords land on the beat or are they pushed? (`PUSH_OPTIONS`; pushed by an eighth, on the beat, pushed by a sixteenth, on the beat.) Fixed items; the step seeds `fam.rhy.syncopation`, whose own trials start in tomorrow's warm-up.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "A soul loop with everything on the beat, to be pushed and made the learner's own.",
        },
      ],
      wrapAt: 5,
      make: {
        brief:
          "A soul loop, `<C^7 Am7 F^7 G7>`, with drums, a bass and the Rhodes, everything landing square on the beat. Push the Rhodes ahead of the beat. Then make the groove yours: push the bass with it, try a sixteenth, give the chords a rhythm with `.struct()`, change the chords, add a line on top.",
        required: {
          rule: "syncopation",
          label: "At least two chords arrive ahead of their beat, or after it",
          why: '`syncopation` with `track: "chords"`, `min: 2`: the starter\'s chords all start on beat 1 (0 syncopated notes); `.early(1/8)` over four bars gives 3, a quarter-note push or `.late(1/8)` passes too, two chords a bar on beats 1 and 3 do not.',
        },
        suggestions: [
          'the bass pushes with the chords (`syncopation`, `track: "bass"`, `min: 2`)',
          "a tempo that grooves, 84–108 (`tempo-bpm`)",
        ],
        band: false,
        flavours:
          "No Band: the drums are lines of the learner's code. The starter is already on `rhodes` and `fingerbass`; no sound swap is declared.",
      },
      srs: [
        { family: "fam.rhy.syncopation", mode: "seed", level: 1 },
        { family: "fam.rhy.echo", mode: "review-if-due", level: 5 },
      ],
      mistakes: [
        '`.late(1/8)` for `.early(1/8)`: `harmony.pcset` on every onset; `.late(7/8)` (the right eighth, the chord of the bar before): `harmony.pcset`; `.early("1/8")`: `code.time-fraction-string`',
        "the bass pushed as well in the first modify: `code.edit-outside`; the unchanged starter: `code.unchanged`",
        "second modify: `.late(1/8)` written before `.struct()` (the rhythm stays on the beat): `harmony.pcset`; `.early(1/8)` for `.late(1/8)`: `harmony.pcset`",
        "tap: on beat 1 with the bass, or on beat 4: fail (`tap.missed`, `tap.extra`)",
        'investigate: beat 4 for the "and" after 4, or 8 eighths after the bar line: `investigate.wrong`',
        "ear: the other answer: `id.wrong`, with text that says where the chords were against the bass",
        "Make: the starter, only the bass pushed, and two chords a bar on the beat: `rubric.unmet`",
      ],
      connects: {
        back: 'U06.L12 put hits between the beats with `.struct()` and U08.L04 locked the bass to a kick on the "and" of 2 and said it "leans the groove into beat 3" without naming it; U11.L07\'s swing call sits in the same place of the chain; U12 supplied the chords. Today the lean gets its names and a call of its own.',
        forward:
          "U13.L02 adds loud and quiet inside the bar; U13.L03 shows how a page writes today's push (an eighth tied over the bar line). In the rhythm track, R1.L01 ranks every position of the bar by weight and R1.L05 moves notes by milliseconds.",
      },
      epr: {
        enjoyment:
          "A four-bar soul groove where the Rhodes leans into every bar ahead of the bass, with the learner's own pushes, rhythm and chords: for the first time a loop of theirs moves forward the way a played record does.",
        pace: "One idea: arriving early. `.late()` is the same call the other way and gets one small step; sixteenth pushes are heard and offered, not drilled. Ghost notes, the notation of a push and the theory of metric weight are other lessons. The ear step is four fixed items, no drill set.",
        return:
          "The Coda says: you can now push a chord ahead of the beat and hear when a band does it. Next: the quiet hits between the loud ones that make a funk groove breathe.",
      },
      notes: [
        "The exemplar: content/core/U13/L01 passes every content-CI check with the real grader (8 steps, 3 graded, 9 expert minutes: 12.6 scaled; part A 5.95 + the quick sketch, part B 6.65).",
        'Evaluated: with `.early(1/8)` the Rhodes plays G7 at 7/8, Cmaj7 at 15/8, Fmaj7 at 23/8 and Dm7 at 31/8, each a bar long; the bass plays D G C F on beats 1, 3 and 4. `.struct("x x x x").late(1/8)` puts the organ on 1/8, 3/8, 5/8 and 7/8 of each bar with that bar\'s chord.',
        "The first-bar gap (unit conventions): the hook's bar 1 has drums and bass only until the Rhodes enters on its last eighth. The listen step plays the on-the-beat version first, so the learner has heard the loop whole before the push.",
        "The ear step uses two chords a bar so that two bars hold four arrivals; its bass plays half notes on beats 1 and 3, the ruler the hints point at.",
        "`fam.rhy.syncopation` unlocks here (contracts §7.3) and `fam.rhy.echo` opens level 5; neither is played as a set in the lesson.",
      ],
    },
    {
      id: "U13.L02",
      author: "U13a",
      idea: "A groove breathes when its hits are not all the same strength. In a sixteenth-note groove the snare is loud on 2 and 4 and whispers in between: those quiet hits are ghost notes, felt more than heard. In code `.velocity()` gives every hit its strength, one number for each step.",
      hook: {
        hear: "A funk vamp on Dm7 and G7: kick and finger bass locked on a syncopated figure, hats and a clean guitar in sixteenths. First every hit at full strength, stiff as a typewriter; then the same notes with the small snare hits pulled down to a whisper and the hats and guitar accented. Nothing moved; it grooves.",
        code: `${T(96)}${FUNK}`,
      },
      key: C,
      meter: "4/4",
      bpm: 96,
      canDo: ["cd.code.ghost-notes"],
      uses: [...BASE, ...PUSH, ...GHOST],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items, two bars each played twice: the vamp with no `.velocity()` anywhere, then the hook. Same onsets in both (evaluated).",
        },
        {
          kind: "tap",
          exercise: "tap",
          answer: ["tap"],
          minutes: 1,
          what: 'Tap with the kick while the snare\'s small hits fill the gaps: three taps a bar, on 1, the "and" of 2 and the "and" of 3 (`mode: "along"`, `target: { drum: ["kick"] }`, two bars). The syncopated kick is U13.L01\'s idea on the sixteenth grid.',
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`s("sd*8").velocity("1 .3")`: eight snare hits and two numbers. What will you hear? (`choose`: four loud hits, then four quiet ones / loud, quiet, loud, quiet / every hit at the same level.) The numbers are spread over the bar, not dealt one per hit.',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: 'Run the snare line of the hook beside `s("sd*8").velocity("[1 .3]*4")`, roll open: which sixteenths of the hook\'s snare are quiet (choice: the three between the backbeats, the "a" of 2, the "e" of 3 and the "a" of 4); how many numbers does the hook\'s velocity string hold, one for each sixteenth of the bar (number: 16).',
          term: "term.ghost-note",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          features: ["velocity-ghosts.accents"],
          minutes: 1.25,
          graded: true,
          what: 'The hook\'s snare with every hit at 1: turn the three small hits into ghost notes and keep beats 2 and 4 loud. Graded with `all` of a `rhythm` matcher on `snare` (the hits stay where they are) and `{ m: "rubric", rules: [velocity-ghosts, track "snare", min 3, on "16th-offbeat", accents 2] }` (PLANNED rule and field).',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "`fam.rhy.syncopation` at level 3, five trials from the generator: click the kick that falls on a sixteenth between the eighths.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "The learner's funk groove: the stiff version of the vamp, to be given its dynamics.",
        },
      ],
      wrapAt: 5,
      make: {
        brief:
          "The vamp with every hit at the same strength, and the Rhodes holding each chord. Make it breathe: ghost the small snare hits and keep 2 and 4 loud, accent the hats inside each beat, then trade the Rhodes for a sixteenth-note guitar part on `cleangtr` with accents of its own. Move a kick if you like: the bass follows `changes`, not the kick.",
        required: {
          rule: "velocity-ghosts",
          label: "Three or more ghost notes on the snare, and the backbeat still loud",
          why: '`velocity-ghosts` with `track: "snare"`, `min: 3`, `on: "16th-offbeat"`, `accents: 2` (PLANNED): the starter has no `.velocity()`; a snare that is quiet throughout has no accents and fails.',
        },
        suggestions: [
          'the hats are accented inside the beat: at least eight quiet hats between the loud ones (`velocity-ghosts`, `track: "hats"`, `on: "any"`, `min: 8`)',
          'the clean guitar plays (`sounds`, `contains: ["snd.cleangtr"]`)',
          'a kick between the beats (`syncopation`, `track: "kick"`, `min: 1`)',
        ],
        band: false,
        flavours:
          "No Band. The funk flavour may swap the kit for `RolandTR808`; chords stay on `rhodes` or `cleangtr`, the bass on `fingerbass`.",
      },
      srs: [
        { family: "fam.rhy.syncopation", mode: "review-if-due", level: 3 },
        { family: "fam.rhy.echo", mode: "review-if-due", level: 5 },
      ],
      mistakes: [
        'modify: `"1 .3"` on the whole line (the first half of the bar loud, the second quiet: beat 4\'s backbeat is lost): `rubric.unmet`; every hit at .3 (no accents): `rubric.unmet`; a `~` in the velocity string (a snare hit disappears): `rhythm.missing`; the unchanged starter: `code.unchanged`',
        "`velocity` written with values above 1 or as `.gain()` on the whole line (everything quieter, nothing ghosted): `rubric.unmet`, with an override that says the backbeat must stay at 1",
        "tap: on every beat instead of with the kick: fail",
        "investigate: the backbeats chosen as the quiet hits, or 4 numbers: `investigate.wrong`",
        "Make: the starter, and a snare ghosted on every hit: `rubric.unmet`",
      ],
      connects: {
        back: "U01.L06 wrote sixteenths and U01.L02 set one `.gain()` for a whole line; U08.L04 locked the bass to a syncopated kick; U13.L01 named the syncopation. The Bands have been accenting their hats this way since U01: now the learner can.",
        forward:
          "U13.L03 writes long notes; U13.L05 brings rolls with `.ply()`. In the rhythm track R1.L03 builds sixteenth-note funk in layers and R1.L04 swings the sixteenths.",
      },
      epr: {
        enjoyment:
          "A two-bar funk groove with a ghosted snare, breathing hats and a scratching clean guitar over a locked kick and bass: the first drum part of the learner's that sounds like a drummer rather than a sequencer.",
        pace: "One idea: loud and quiet inside the bar, written as one number per step. The sixteenth grid and the syncopated kick are known; the only new call is `.velocity()`. Humanized timing and swung sixteenths belong to the rhythm track.",
        return:
          "The Coda says: you can now write a sixteenth-note groove with ghost notes. Next: notes that last longer than their beat, and how the page writes the push you coded two days ago.",
      },
      notes: [
        'Evaluated: the hook\'s snare plays on beat 2, the "a" of 2, the "e" of 3, beat 4 and the "a" of 4, with velocities 1, .3, .3, 1, .3; the hats cycle 1 .4 .7 .4 on every beat; the guitar strums all sixteen sixteenths and accents the third and the sixth of each half bar; kick and bass share beat 1, the "and" of 2 and the "and" of 3. `s("sd*8").velocity("1 .3")` gives 1 1 1 1 .3 .3 .3 .3.',
        "The Make's required rule and the modify step's rubric use the PLANNED rule `velocity-ghosts` and its PLANNED field `accents`: the lesson fails check 2 until the grader engineer lists both with golden tests. If `accents` is not built in time, the modify step falls back to the rule without it plus an `events` match on the two backbeats.",
        "`cleangtr` unlocks here. The guitar line is labelled `gtr:` (STYLE §2) and read through `inferRoles`; its chord is its symbol, so the chord band shows Dm7 and G7 over the scratching.",
        "The rule reads the effective level, `gain × velocity` (evaluated: the hook's snare ghosts come out at .24, its hats at .5, .2 and .35 under `.gain(.5)`). A hat at .4 or less therefore counts as a ghost note, which the hats suggestion uses on purpose, and a line with its own `.gain()` never reaches full level: the `accents` field must count a line's loudest hits (velocity 1), not an absolute level, or the hats could never have accents. Said to the grader engineer in the result's apiNotes; the required rule reads the snare, which has no `.gain()`.",
        "The tap step's stimulus is the hook; if the ghosted snare makes the kick hard to follow at first, the author lowers the snare line's `.gain()` in the stimulus only.",
      ],
    },
    {
      id: "U13.L03",
      author: "U13a",
      idea: "A note can last longer than the beat it starts on. A dot makes a note half as long again: a dotted quarter is three eighths. A tie joins two notes into one sound across a beat or a bar line. Together they are how a page writes a push: the note that arrives early is tied over to the beat it belongs to. In code both are one thing: a note's share of the bar, written with `@`.",
      hook: {
        hear: "The Ode to Joy theme, whose first phrase the learner played in plain quarter notes in U02.L08 and U03.L09. Today its last phrase, over a light groove: first flattened the same way, then as Beethoven wrote it. The phrase comes in a beat early and holds across the bar line, and the tune ends long, short, long. Two small changes, and it is the tune everyone knows.",
        code: `${T(100)}${ODE}`,
      },
      key: C,
      meter: "4/4",
      bpm: 100,
      canDo: ["cd.read.ties-dots"],
      uses: [...BASE, ...PUSH, "tb.feature.staff"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items, five bars each: the phrase in plain values (`<[0 1 -3 2] [2 2 3 4] [4 3 2 1] [0 0 1 2] [1 1 0@2]>`), then the hook.",
        },
        {
          kind: "tap",
          exercise: "tap",
          answer: ["tap"],
          minutes: 1,
          what: 'Echo the rhythm of the last two bars: four even taps, then long, short, long (`mode: "echo"`, the `mel` line of bars 15–16 alone with a click, two bars).',
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`n("1@3 0 0@4")`: the bar is cut into eight shares, eighth notes. How long is the first note? (`choose`: three eighth notes, a beat and a half / three beats / a third of a beat.)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: "Bars 15–16 on the roll and the treble staff: the long first note of bar 16 is a quarter note with a dot. What does the dot add (choice: half of the note's own length); how many eighth notes does a dotted quarter last (number: 3).",
          term: "term.dotted-note",
        },
        {
          kind: "quiz",
          exercise: "staff-read",
          answer: ["number"],
          minutes: 0.75,
          graded: true,
          what: "Bars 12–13 on the staff: the E on beat 4 is joined to the E on beat 1 of the next bar by a curved line. For how many beats does that E sound (number: 2)? The pass text names the tie and says it is U13.L01's push on paper: the note arrives a beat early and holds.",
          term: "term.tie",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: "Play from the page: a two-bar soul riff on the treble staff only, a dotted quarter and an eighth tied to a half note, then a dotted quarter, an eighth and two quarters (G A | G E D C). Write it in code with `@` (`<[4@3 5@5] [4@3 2 1@2 0@2]>`). `events`, absolute pitch, `onsets+durations`, on `mel`.",
        },
        {
          kind: "notate",
          exercise: "staff-write",
          answer: ["staff-input"],
          features: ["staff-input.dots", "staff-input.ties"],
          minutes: 1,
          graded: true,
          what: 'The other direction: two bars heard and shown in code, C D, a dotted-quarter E, then a G that arrives on the last eighth and holds into the next bar, E (`n("<[0@2 1@2 2@3 4@5 2@4]@2>")`). Write them on the staff (`palette: { durations: ["8", "4", "4.", "2"], ties: true }`; `events` with durations; the answer is `C4:4 D4:4 E4:4. G4:8~ G4:2 E4:2`). PLANNED features.',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "A tune of the learner's own that leans across the beat, over the U13.L01 groove.",
        },
      ],
      wrapAt: 5,
      make: {
        brief:
          "The rhythm section you pushed two days ago, with a tune on top that walks in plain quarter notes. Make the tune lean: give notes more than their beat with `@`, let one start on an “and” and hold across the next beat, let one arrive before the bar line and ring over it. Open the staff and watch the dots and ties appear as you write.",
        required: {
          rule: "syncopation",
          label: "At least two notes of your tune start between the beats and hold across the next one",
          why: '`syncopation` with `track: "mel"`, `min: 2`: the starter\'s tune is four quarters a bar (0). A dotted quarter followed at once by an eighth does not count; the eighth must hold on, which is the tie the lesson is named for.',
        },
        suggestions: [
          'the tune writes cleanly on the staff (`notates`, `view: "staff"`, `melody: "mel"`)',
          'strong beats are chord notes (`chord-tones-strong`, `harmony: "chords"`, ≥ 0.6)',
          "the tune ends on 1 (`ends-on-degree`)",
        ],
        band: false,
        flavours: "No Band: the starter carries the U13.L01 rhythm section. No sound swap is declared.",
      },
      srs: [
        { family: "fam.rhy.read", mode: "review-if-due", level: 4 },
        { family: "fam.rhy.echo", mode: "review-if-due", level: 4 },
      ],
      mistakes: [
        "from the page: the tied eighth and half written as two notes (`5 5@4`): `melody.extra-note`; the dotted quarter as a plain quarter (`4@2 5@6`): `melody.rhythm-note`; the right rhythm a step off: `melody.wrong-degree`; the unchanged starter: `code.unchanged`",
        "staff: the tie left out (`G4:8 G4:2`: two Gs): `melody.extra-note`; a quarter for the dotted quarter: the following notes arrive early, `melody.rhythm-note`; the right notes an octave off: `staff.octave`",
        "quiz: 1 beat (the tie ignored) or 4: `id.wrong`",
        'investigate: "the dot adds one beat" or 2 eighths: `investigate.wrong`',
        "Make: the starter, and a tune of dotted quarters each followed at once by its eighth: `rubric.unmet`",
      ],
      connects: {
        back: "U01.L05 wrote long notes with `@` and `_` and read quarter, half and whole notes; U02.L08 and U03.L09 played this tune's first phrase with the dotted figure of its bar 4 flattened into two quarters, because nothing before U13 may need a dot or a tie (contracts §2.8); U13.L01 pushed a chord across the bar line by ear.",
        forward:
          "U13.L04's beat is itself a dotted quarter. From here on repertoire is read and transcribed in its real rhythm, and the transcription ladder's songs keep their dots and ties.",
      },
      epr: {
        enjoyment:
          "A tune of the learner's own that lingers and leans over a soul groove, and that they can see on the staff looking like real sheet music, ties and all; plus the small shock of hearing a tune they have known since U02 finally sound right.",
        pace: "One idea: a note longer than its beat, and its two signs. The dot and the tie are met in one famous phrase and practised once each way (page to code, code to page). Beaming rules and rests of unusual length are left to the engraver; double dots and ties in chords do not appear.",
        return:
          "The Coda says: you can now read and write dotted and tied rhythms, and you know how a push looks on paper. Next: a meter whose every beat is a dotted quarter.",
      },
      notes: [
        "Ode to Joy (song.ode-to-joy, 1824, US-PD) is used here in its written rhythm for the first time: bars 12–16 of the theme in C. Degrees evaluated: bar 12 is C D G(below) E, the E held into bar 13 (a half note across the bar line), bar 13 continues E F G, bar 14 G F E D, bar 15 C C D E, bar 16 D (dotted quarter) C (eighth) C (half). The spec's `repertoire` list is left empty because content/validate/specs.test.ts checks every listed fragment for \"no dot, no tie\" (the rule before U13.L03): author:repertoire adds the as-written setting and `usedIn` (see the result's apiNotes).",
        "Harmony under the phrase: C then G in bar 12, C, G, C, and G then C in bar 16. The tied E of bar 12 sounds over G and belongs to the C of bar 13: an anticipation is a note of the next chord heard early, which the pass text of the quiz may say in those words.",
        'Evaluated: `n("<[4@3 5@5] [4@3 2 1@2 0@2]>")` plays G for 3/8, A for 5/8, then G 3/8, E 1/8, D 1/4, C 1/4; `n("<[0@2 1@2 2@3 4@5 2@4]@2>")` plays C and D as quarters, E for three eighths, G from 7/8 to 3/2 and E to the end of bar 2.',
        "Check 9 engraves every staff example of this lesson: each must come out with `approximate = false`. The riff and the phrase do (ties over the beat and the bar line, dotted quarters). Show rhythms to be read on the treble staff without the hats line.",
        "`fam.rhy.read` deals dotted and tied figures from this lesson on (contracts §7.3, §7.4 gated ladders).",
        "The staff-writing step needs `staff-input.dots` and `staff-input.ties` (PLANNED: app/src/answers/staff/rhythm.ts); until they land the lesson fails check 2 on that step only. Fallback if they slip: the same two bars as a second code step from the roll.",
      ],
    },
    {
      id: "U13.L04",
      author: "U13b",
      idea: "Some music divides every beat in three instead of two. In 6/8 a bar has six eighth notes but only two beats, each a dotted quarter; 12/8 has four such beats. That is compound meter, the sway of soul ballads, slow blues and doo-wop. In code a bar is still one cycle, six or twelve equal steps grouped in threes, and the tempo line counts the dotted-quarter beat: `setcpm(60/2)`.",
      hook: {
        hear: "A soul ballad at a slow sway: Cmaj7, Am7, Fmaj7, G7, the Rhodes rolling each chord up and down in six even notes, a kick on one, a snare on the second beat, hats ticking the eighths in threes. Count along and there are two beats in the bar, not three and not four.",
        code: `${T(60, 2)}${BALLAD_68}`,
      },
      key: C,
      meter: "6/8",
      bpm: 60,
      canDo: ["cd.code.compound-meter"],
      uses: [...BASE, ...PUSH, ...GHOST, "tb.meter.compound", "tb.arp"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          features: ["meter.compound"],
          minutes: 0.5,
          what: "The hook, four bars twice. The caption counts it once: 1 la li 2 la li.",
        },
        {
          kind: "tap",
          exercise: "tap",
          answer: ["tap"],
          features: ["meter.compound"],
          minutes: 1,
          what: 'Tap the beat of the ballad: two taps a bar, with the kick and the snare (`mode: "along"`, `target: "beat"`, four bars). Six taps a bar (the eighths) or three (a waltz) fail.',
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          features: ["meter.compound"],
          minutes: 0.5,
          what: '`s("hh*6")` with `kick: s("bd ~ ~ ~ ~ ~")` and `snare: s("~ ~ ~ sd ~ ~")`: six hats, one kick, one snare. How many beats will you feel in the bar? (`choose`: two, each three hats long / three, each two hats long / six.)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          features: ["meter.compound"],
          minutes: 1,
          what: 'Run the six hats with the snare on the fourth eighth, then move it: `s("~ ~ sd ~ sd ~")`. Which version is a waltz bar, three beats of two (choice: the second); the tempo line is `setcpm(60/2)`, 60 beats a minute: how many eighth notes go by in a minute (number: 180).',
          term: ["term.compound-meter", "term.simple-meter"],
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          features: ["meter.compound"],
          minutes: 1.25,
          graded: true,
          what: 'A 6/8 bar with hats and a kick on 1 only: give it its second beat and a lift into the next bar, the snare on the fourth eighth and a kick on the sixth (`kick: s("bd ~ ~ ~ ~ bd")`, `snare: s("~ ~ ~ sd ~ ~")`). `rhythm` on `kick` and `snare`, `perRole`; the target is audible.',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          features: ["meter.compound"],
          minutes: 0.75,
          graded: true,
          what: 'From 6/8 to 12/8: the same groove written as one bar of four beats. Twelve steps (`s("hh*12")`, the kick and snare patterns twice in one string) and the tempo line `setcpm(60/4)`. The exercise declares `meter: "12/8"`; `rhythm` on the drums plus a `tempo` constraint (`setcpm(60/2)` left in place plays it at double speed, and the lint names the line: `code.setcpm-form`, "In 12/8 the tempo line divides by 4").',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          features: ["meter.compound"],
          minutes: 1.25,
          graded: true,
          what: "`fam.rhy.meter` at level 3, five trials from the generator: which meter? 6/8 joins 3/4, 4/4 and 2/4: the same six eighths as a waltz bar, grouped in threes instead of twos.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          features: ["meter.compound"],
          minutes: 2.75,
          panels: ["chords"],
          what: "The learner's 6/8 ballad, from held chords and a kick on one.",
        },
      ],
      wrapAt: 5,
      make: {
        brief:
          "A ballad in 6/8 that does not sway yet: four held chords, a bass note on beat 1, six even hats and a kick on one. Give it its second beat with a snare on the fourth eighth. Then make it yours: a kick that lifts into the next bar, hats accented in threes, the chords rolled with `.arp()`, a slow tune on top in dotted quarters.",
        required: {
          rule: "onsets",
          label: "The snare marks beat 2 of every bar: the fourth eighth note",
          why: '`onsets` with `track: "@drums"`, `drum: "snare"`, `contains: [[1, 2]]`, `perBar: true`: the starter has no snare; a snare on the third and fifth eighths (the waltz grouping) fails.',
        },
        suggestions: [
          'the hats are accented in threes: at least four quiet hats between the loud ones (`velocity-ghosts`, `track: "hats"`, `on: "any"`, `min: 4`; PLANNED)',
          "a tempo that sways, 50–72 dotted quarters a minute (`tempo-bpm`)",
          'the chords are arpeggiated (`uses`, `tool: "tb.arp"`)',
        ],
        band: false,
        flavours:
          "No Band: none is written in 6/8. The starter is on `rhodes` and `fingerbass`; the pop flavour may take `piano` for the chords.",
      },
      srs: [
        { family: "fam.rhy.meter", mode: "review-if-due", level: 3 },
        { family: "fam.rhy.count", mode: "review-if-due", level: 4 },
        { family: "fam.rhy.echo", mode: "review-if-due", level: 7 },
      ],
      mistakes: [
        "first modify: the snare on the third and fifth eighths (`~ ~ sd ~ sd ~`, a waltz): `rhythm.displaced` and `rhythm.extra`; the snare on the fourth of eight steps (a 4/4 habit, `~ ~ ~ sd ~ ~ ~ ~`): `rhythm.displaced`; the unchanged starter: `code.unchanged`",
        "second modify: `setcpm(60/2)` kept (twice too fast): `code.setcpm-form`; `setcpm(180/4)` (the eighth counted as the beat, three times too fast): `code.tempo`; only six steps in the twelve-step bar: `rhythm.missing`",
        "tap: six taps a bar or three: fail (`tap.extra`, `tap.missed`)",
        "investigate: the first version taken for the waltz, or 120 eighths: `investigate.wrong`",
        "Make: the starter, and a snare on the third and fifth eighths: `rubric.unmet`",
      ],
      connects: {
        back: "U01.L08 met 3/4 and 2/4 and the idea that the meter is how the pulse is grouped; U06.L07's doo-wop Band played its piano three to the beat without a name for it; U13.L03's dotted quarter is today's beat.",
        forward:
          "U13.L05 borrows the three-feel for one beat at a time inside 4/4. In the rhythm track R2.L01 groups eighths in fives and sevens.",
      },
      epr: {
        enjoyment:
          "A slow 6/8 soul ballad that sways: the learner's own backbeat and kick under rolled seventh chords on the Rhodes. It sounds like the last dance of the night, and nothing they have written before moves like it.",
        pace: "One idea: beats that divide in three. 6/8 carries the lesson; 12/8 is one small step (two bars joined). 9/8, tempo changes and the 3/4-against-6/8 play of hemiola are left out; the reading of compound meter on the staff is shown tomorrow beside triplets.",
        return:
          "The Coda says: you can now write a groove in 6/8 and in 12/8, and feel two beats where there are six notes. Next: three to a beat inside 4/4, the triplet.",
      },
      notes: [
        'Evaluated: the hook\'s kick is on eighths 1 and 6, the snare on 4, the bass on 1 and 4; `.arp("0 1 2 3 2 1")` on the default voicing of `C^7` plays C3 E4 G4 B4 G4 E4 in six even eighths. The lint accepts `setcpm(60/2)` under `meter: "6/8"` from this lesson on and refuses `setcpm(60/3)` (`code.setcpm-form`).',
        'The whole lesson is in a compound meter: every step carries the PLANNED feature `meter.compound` (reported once per lesson by content:check), so the lesson fails check 2 until the roll, the counts, the tap pad and the grids draw the dotted-quarter beat (wave6.md §11). The 12/8 step declares `meter: "12/8"` on the exercise.',
        "Tapping in 6/8 at 60: the two beats are a second apart, so the tap window is the full 120 ms. Do not ask for tapped eighths here (333 ms apart is fine, but six taps a bar for four bars drags).",
        "The Make keeps 6/8: its required rule reads positions as shares of a 6/8 bar, and a learner who rewrites the piece in 12/8 would put the snare on 1/4 and 3/4. The brief does not invite it.",
        "No Band exists in 6/8 or 12/8 (`BAND_METERS`): the starter carries bass and chords. A 6/8 Band would be worth writing for U13.CP's Make and for the rhythm track; it is requested of author:CP in the result's apiNotes, not assumed here.",
        "`fam.rhy.meter` levels 3–4, `fam.rhy.count` level 4 and `fam.rhy.echo` level 7 open here (contracts §7.3).",
      ],
    },
    {
      id: "U13.L05",
      author: "U13b",
      idea: "A triplet puts three equal notes where two would go: for one beat, 4/4 borrows the three-feel of 6/8. It is also what the swing of the blues was made of: the long–short pair is the first and third note of a triplet. In code a triplet is a bracket of three, and `.ply(3)` turns every step of a line into three; on the staff it is three notes under a bracket with a 3.",
      hook: {
        hear: "The four chords of yesterday's ballad back in 4/4 at a slow-dance tempo: the piano plays every chord three times to the beat, the hats tick in threes, kick and snare stay square on the four beats, and at the end of the fourth bar the snare rolls three quick hits into the repeat.",
        code: `${T(76)}${BALLAD_TRIPLETS}`,
      },
      key: C,
      meter: "4/4",
      bpm: 76,
      canDo: ["cd.code.triplets"],
      uses: [...BASE, ...PUSH, ...GHOST, "tb.ply", "tb.swingBy", "tb.feature.staff"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items, four bars each: the ballad with even eighths on the hats and the piano, then the hook.",
        },
        {
          kind: "tap",
          exercise: "tap",
          answer: ["tap"],
          minutes: 1,
          what: 'Echo a two-bar rhythm with triplets in it (`mode: "echo"`, `stimulus: { src: "generator", family: "fam.rhy.echo", level: 6 }`, whose triplet figures open with this lesson). Say "1 trip let" under your breath while it plays.',
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["number"],
          minutes: 0.5,
          what: '`s("hh*4").ply(3)`: four hats, each played three times in its own time. How many hats will you hear in the bar? (`count`: 12.)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: 'Triplet hats on the roll and the percussion staff, where each beat is three notes under a bracket with a 3. Beside them the swung hats of U11.L07, `s("hh*8").swingBy(1/3, 4)`: which line plays exactly their rhythm (choice: `s("[hh ~ hh]*4")`, the first and third of each triplet); into how many equal parts does a triplet cut the beat (number: 3).',
          term: "term.triplet",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'The ballad with the piano on plain quarter notes (`.struct("x*4")`): make it play three to the beat with `.ply(3)`. `rhythm` on `chords` (`[x x x]*4` and `x*12` pass too); `.ply(2)` gives eighths and fails.',
        },
        {
          kind: "quiz",
          exercise: "staff-read",
          answer: ["code"],
          minutes: 1,
          graded: true,
          what: 'Read it: one bar on the treble staff, a quarter note, a triplet, a quarter note, a triplet (C, E G C, G, E D C). Write the bar in code (`n("0 [2 4 7] 4 [2 1 0]")`; `events`, absolute pitch, `onsets+durations`). Under the staff the same bar is shown in 12/8, where the three-note groups need no bracket: one rhythm, two spellings.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1,
          graded: true,
          what: "`fam.rhy.subdivision` at level 1, six trials from the generator: do the hats move two to the beat or three? (`BEAT_DIVISION_OPTIONS`.) The lesson seeds the family.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "The learner's slow-dance ballad: the square version, to be set in threes.",
        },
      ],
      wrapAt: 5,
      make: {
        brief:
          "The ballad in plain 4/4: piano on the beats, even hats, kick and snare, a bass on 1 and 3. Turn it into a slow dance: set the piano or the hats in triplets with `.ply(3)` and keep them going through every bar, roll the snare into the repeat, and add a tune in plain quarters and eighths that floats over the threes.",
        required: {
          rule: "onsets",
          label: "A line plays triplets through every bar",
          why: '`onsets` with `track: "*"`, `contains: [[1, 12], [1, 6]]`, `perBar: true`: some line of the learner\'s plays the second and third triplet of beat 1 in every bar. The starter\'s finest notes are eighths (never at 1/12 or 1/6); a roll in bar 4 alone does not pass, which is why the brief says "through every bar".',
        },
        suggestions: [
          'a roll: three snare hits on beat 4 of bar 4 (`onsets`, `track: "@drums"`, `drum: "snare"`, `contains: [[15, 4], [23, 6], [47, 12]]`, `perBar: false`)',
          'a tune whose strong beats are chord notes (`chord-tones-strong`, `melody: "mel"`, `harmony: "chords"`, ≥ 0.6)',
          "a slow-dance tempo, 60–84 (`tempo-bpm`)",
        ],
        band: false,
        flavours:
          "No Band: `band.doo-wop` plays the same triplets, and two pianos in threes would be a blur. The starter is on `piano` and `fingerbass`; jazz-soul may take `rhodes` for the chords.",
      },
      srs: [
        { family: "fam.rhy.subdivision", mode: "seed", level: 1 },
        { family: "fam.rhy.count", mode: "review-if-due", level: 3 },
        { family: "fam.rhy.echo", mode: "review-if-due", level: 6 },
      ],
      mistakes: [
        'modify: `.ply(2)` (eighths): `rhythm.missing`; `.ply(3)` written before `.struct()` (the rhythm stays in quarters): `rhythm.missing`; `.ply("3")` passes (a pattern of one value); the unchanged starter: `code.unchanged`',
        "read it: the triplet written as two eighths and a quarter (`[2 4] 7`): `melody.rhythm-note`; four sixteenths for three: `melody.extra-note`; the triplets on beats 1 and 3: `melody.rhythm-note` from the first wrong onset",
        "predict: 7 (four plus three) or 4: logged, never gates",
        'investigate: `s("[hh hh ~]*4")` chosen (the first and second of the triplet) or 2 parts: `investigate.wrong`',
        "Make: the starter, and triplets in bar 4 only: `rubric.unmet`",
      ],
      connects: {
        back: "U11.L07 swung eighths \"long–short, two thirds of the way through the beat\" and promised the reason; U06.L07's doo-wop Band played these piano triplets under the learner's chords; U13.L04 made three-to-the-beat a meter of its own.",
        forward:
          "U13.L06 takes triplets, swing and compound meter down by ear. In the rhythm track R1 swings sixteenths and R2.L04 sets three against two.",
      },
      epr: {
        enjoyment:
          "A slow-dance soul ballad in the learner's own hands: piano triplets, a snare roll into the turn and a tune floating over the top. It is the sound of a 1950s jukebox, and they wrote every layer.",
        pace: "One idea: three in the time of two, for a beat. `.ply()` is the one new call; the bracket of three has been legal since U01. Quarter-note triplets, other tuplets and three-against-two are left to the rhythm track; the 12/8 spelling is shown once, not practised.",
        return:
          "The Coda says: you can now write triplets and rolls, and you know what swing is made of. Next: writing down by ear the rhythms of this whole unit.",
      },
      notes: [
        'Evaluated: `s("hh*4").ply(3)` is twelve even hats; `s("~ sd ~ sd").ply("<1 1 1 [1 1 1 3]>")` leaves bars 1–3 alone and plays three snare hits on beat 4 of bar 4 (at 15/4, 23/6 and 47/12); `s("hh*8").swingBy(1/3, 4)` and `s("[hh ~ hh]*4")` both sound at 0 and 2/3 of every beat; `n("0 [2 4 7] 4 [2 1 0]")` plays C, then E G C in one beat, G, then E D C.',
        '`.ply()` plays each step of the pattern on its left n times, so it must come after the rhythm it multiplies (`.struct("x*4").ply(3)`); before `.struct()` it changes nothing the ear can hear. Pin that mistake.',
        'N09 covers triplet and compound-meter notation: the read-it step shows both spellings of one bar (4/4 with brackets, 12/8 without). The 12/8 staff is a second example on the step with `meter: "12/8"` (PLANNED `meter.compound` for that example only; if it is not drawn in time the step keeps the 4/4 staff and the sentence). Evaluated: in 12/8 the bar is `n("0@3 2 4 7 4@3 2 1 0")` under `setcpm(76/4)`, a dotted quarter and three eighths twice, and both spellings engrave with `approximate = false`.',
        "Triplet staff writing (`8t`, feature `staff-input.triplets`) is not asked in the lesson: `fam.rhy.dictation` level 7 brings it after U13.L06.",
        "A rule that asks for \"a triplet somewhere\" does not exist: `onsets` is positional. The Make therefore asks for triplets through every bar; a `tuplets` rule built on the grader's `tupletsOf` is requested in the result's apiNotes.",
        "`fam.rhy.subdivision` unlocks here; `fam.rhy.count` level 3 and the triplet items of `fam.rhy.echo` level 6 open here (contracts §7.3).",
      ],
    },
    {
      id: "U13.L06",
      author: "U13c",
      idea: "A groove you can hear is a groove you can write down. Find the beat; decide how it divides, in two, long–short or in three; then place the hits one layer at a time, kick first. Pushes, long notes and triplets are the same few shapes every time.",
      hook: {
        hear: "One two-bar groove three ways, kick and bass on one syncopated rhythm: straight, at 92; then the same hits swung; then in 12/8 with twelve even hats. The kicks barely move between the three; the hats tell which is which.",
        code: `${T(92)}${CALL}`,
      },
      key: C,
      meter: "4/4",
      bpm: 92,
      canDo: ["cd.hear.rhythm-dictation-2"],
      uses: [...BASE, ...PUSH, ...GHOST, "tb.ply", "tb.swingBy", "tb.meter.compound"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Three items, two bars each played twice: the hook, the hook with `.swingBy(1/3, 4)` on hats, kick and bass, and its 12/8 version.",
        },
        {
          kind: "ear",
          exercise: "all",
          parts: ["identify", "identify", "identify"],
          answer: ["choice"],
          minutes: 0.75,
          what: "Step one of the method, three new grooves: how does the beat divide? (`choice`: even, two to the beat / swung, long–short / three to the beat.) Fixed items, not one of the graded checks.",
        },
        {
          kind: "tap",
          exercise: "tap",
          answer: ["tap"],
          minutes: 1,
          what: 'Echo a syncopated two-bar rhythm before writing one down (`mode: "echo"`, `stimulus: { src: "generator", family: "fam.rhy.echo", level: 5 }`).',
        },
        {
          kind: "dictate",
          exercise: "dictation",
          answer: ["code"],
          wave3: ["by-ear"],
          minutes: 1.5,
          graded: true,
          what: 'By ear, straight: a two-bar funk groove with the hats and the snare given in the starter. Write the kick (`<[bd ~ ~ bd ~ ~ bd ~] [bd ~ ~ ~ ~ bd bd ~]>`). `domain: "rhythm"`, `rhythm` matcher on `kick`, A/B with the source at full and three-quarter speed.',
        },
        {
          kind: "dictate",
          exercise: "dictation",
          answer: ["code"],
          wave3: ["by-ear"],
          minutes: 1.25,
          graded: true,
          what: "By ear, swung: a two-bar shuffle with a kick on some of the long and short eighths. The starter's hats are straight: write the kick in plain eighths and swing the lines that need it. The exercise declares `swing`, so onsets are compared on the straight grid; an `all` matcher adds the `swing` rule on the hats.",
        },
        {
          kind: "dictate",
          exercise: "dictation",
          answer: ["grid"],
          features: ["meter.compound"],
          minutes: 1.25,
          graded: true,
          what: 'By ear, in three: one bar of 12/8, kick and snare, placed on a twelve-step grid (`{ ui: "grid", rows: ["kick", "snare"], stepsPerBar: 12, bars: 1 }`, grouped 3 + 3 + 3 + 3; the exercise declares `meter: "12/8"`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          features: ["rubric.section"],
          minutes: 2.5,
          what: "Call and answer: the groove the learner wrote down, answered with two bars of their own.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "Bars 1 and 2 are the groove you just wrote down: that is the call. Bars 3 and 4 repeat it with a plain kick on 1 and 3. Write your answer there: a kick rhythm of your own with hits between the beats, the bass on the same rhythm, and anything else this unit gave you: a push, ghost notes, a roll into the repeat.",
        required: {
          rule: "syncopation",
          label: "Your answer has at least two kicks between the beats",
          why: '`syncopation` with `track: "kick"`, `min: 2`, `section: { bars: [3, 4] }` (feature `rubric.section`): the starter\'s bars 3–4 have the kick on 1 and 3 only.',
        },
        suggestions: [
          'the bass hits with the kick (`groove-lock`, `kick: "kick"`, `bass: "bass"`, `min: 0.75`)',
          "four bars or eight (`bars`)",
          "ghost notes on the snare (`velocity-ghosts`, PLANNED: leave it out until the grader lists the rule)",
        ],
        band: false,
        flavours: "No Band: the call's drums are the learner's own lines. No sound swap is declared.",
      },
      srs: [
        { family: "fam.rhy.dictation", mode: "review-if-due", level: 5 },
        { family: "fam.rhy.swing", mode: "review-if-due", level: 2 },
        { family: "fam.rhy.meter", mode: "review-if-due", level: 3 },
      ],
      mistakes: [
        'straight: the kick on the beat for the "and" (`bd ~ bd ~ …`): `rhythm.displaced`; a kick missed: `rhythm.missing`; the unchanged starter: `code.unchanged`',
        "swung: the kick right and nothing swung: `rubric.unmet` (with the info line `rhythm.swing-missing`); a kick on the wrong eighth: `rhythm.displaced` on the straight grid",
        "grid: the snare placed on steps 5 and 11 of twelve (counted as if the beat had four parts) for steps 4 and 10: `rhythm.displaced`; an empty row: `rhythm.missing`",
        "ear: swung taken for three to the beat: `id.wrong`, with text that points at the hats (two sounds a beat, or three)",
        "Make: the starter, and an answer with the kick on all four beats: `rubric.unmet`",
      ],
      connects: {
        back: "U01.L09 wrote down drum grooves on the eighth and sixteenth grid; U07 and X1 took tunes down by ear, X2 a blues, bass first; U13.L01–L05 supplied every shape heard today.",
        forward:
          "U13.CP checks sevenths and rhythm together and opens the jazz and rhythm tracks. From U15.L01 the finale's transcription (CF-T) asks for a standard's form, bass, changes and melody: its rhythms are today's.",
      },
      epr: {
        enjoyment:
          "A four-bar call and answer: a groove taken down by ear, and the learner's own reply to it with their pushes, ghost notes and rolls. It is the first time they answer a drummer instead of copying one.",
        pace: "One idea: a method for hearing rhythm (beat, division, hits). No new sound, call or sign: three short dictations, one per feel, each with part of the groove given. Melodic dictation with these rhythms is the gym's work, not this lesson's.",
        return:
          "The Coda says: you can now write down a syncopated, swung or compound rhythm by ear. Next: Modes begins, and after it the checkpoint that opens the jazz and rhythm tracks.",
      },
      notes: [
        "Evaluated: the hook's kick and bass play eighths 1, 4 and 7 of bar 1 and 1, 4 and 6 of bar 2; swung, the off-beat hits move to two thirds of their beat (5/12 of the bar), which are the same places the 12/8 version uses (`<[bd ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~] [bd ~ ~ ~ ~ bd ~ ~ bd ~ ~ ~]>` under `hh*12`). That is the point of the listen step: the kick does not tell swing from 12/8, the hats do.",
        "Three graded dictations, each short and each with something given (hats and snare; the hats' straight version; the grid). The answer UIs are in use today: `code` with `byEar`, and `grid` with twelve steps. Only the 12/8 step's `meter` is PLANNED (`meter.compound`); if it is not drawn in time, that step is written as eighth-note triplets in 4/4 on the same twelve-step grid.",
        "The swung dictation follows U11.L07's grading (contracts §6.10 item 4): the exercise declares `swing: { subdivision: 8, amount: 1/3 }`, a straight answer matches the onsets and fails only the `swing` rule.",
        "The Make's bars 3–4 are written as their own bars of a `< >` pattern so that `section: { bars: [3, 4] }` reads them; the starter's `kick:` is `s(\"<[call bar 1] [call bar 2] [bd ~ bd ~] [bd ~ bd ~]>\")` in eighths.",
        "`fam.rhy.dictation` levels 5–7 open here (dotted, syncopated and triplet figures written on the staff): they need the staff input's dots, ties and triplets (PLANNED) in the warm-ups, not in this lesson.",
        "E14 is perceptual: U13.CP uses it to set a level, never to gate (contracts §7.6).",
      ],
    },
  ],
  checkpoint: {
    id: "U13.CP",
    author: "CP",
    authored: [
      {
        id: "sevenths-by-number",
        kind: "identify",
        skills: ["C08", "C07"],
        what: 'A four-bar loop in F major heard with its chord symbols shown, `<Gm7 C7 F^7 Bb^7>` on the Rhodes over a root bass: write its numerals with their sevenths (`rn-palette`, `slots: 4`, `allow: ["sevenths"]`, `key: { tonic: "F", mode: "major" }`; `ii7 V7 Imaj7 IVmaj7`). Graded by degree and quality at seventh depth: `V` for `V7` and `IV7` for `IVmaj7` are `harmony.rn-quality`. Graded today.',
      },
      {
        id: "read-the-push",
        kind: "code-modify",
        skills: ["R09", "N08"],
        what: 'Play from the page: two bars on the treble staff only, in C. Bar 1: a dotted-quarter G, an eighth-note A, a quarter-note G, and a quarter-note E on beat 4 that is tied over the bar line; bar 2: that E held for a half note, then D and C as quarters. Write it in code with `@` (`n("<[4@3 5 4@2 2@6 1@2 0@2]@2>")`, a two-bar bracket cut into sixteen eighths; evaluated, and it engraves with `approximate = false`). `events`, absolute pitch, `onsets+durations`, on `mel`: the tied E written as two notes is `melody.extra-note`. Graded today.',
      },
      {
        id: "three-to-the-beat",
        kind: "code-modify",
        skills: ["N09", "R12"],
        what: 'One bar of drums on the percussion staff only: kick and snare on the four beats, and above them hats that play two eighths on beats 1 and 3 and a triplet on beats 2 and 4. Write the hats in code (`s("[hh hh] [hh hh hh] [hh hh] [hh hh hh]")`, or with a patterned `.ply("2 3 2 3")`). `rhythm` on `hats`. Graded today.',
      },
    ],
    recipe: {
      items: [12, 16],
      families: {
        C07: ["fam.chd.spell"],
        I04: ["fam.int.isolated"],
        R10: ["fam.rhy.syncopation"],
        R11: ["fam.rhy.meter"],
        R12: ["fam.rhy.subdivision"],
        E11: ["fam.chd.quality-7th"],
        E14: ["fam.rhy.dictation"],
      },
      why: "`fam.chd.spell` level 3 spells the five seventh chords (C07; C08 by `sevenths-by-number`). `fam.int.isolated` (skills E06 and I04) gives I04 its evidence at the learner's level, compound intervals included from its upper levels; no family asks for an interval's inversion, so if the gate is to hold I04's inversion half, author:CP makes `sevenths-by-number` an `all` with one `fact` part (`normalize: \"interval\"`, as U12.L06's quiz). `fam.rhy.syncopation` measures R10, `fam.rhy.meter` level 3 (6/8 against 3/4) R11, `fam.rhy.subdivision` R12. R09, N08 and N09 have no family that gives their evidence (`fam.rhy.read` feeds N01): `read-the-push` and `three-to-the-beat` measure them. E11 (`fam.chd.quality-7th`) and E14 (`fam.rhy.dictation` at its open level) are perceptual: they set levels and never gate.",
    },
    make: {
      brief:
        "A groove of your own with seventh chords, four or eight bars: a rhythm section, chords by name, and a line on top if you like. Use this unit: push something ahead of the beat, and let something breathe.",
      required:
        'R10: `syncopation` with `track: "*"`, `min: 2` (some line of the learner\'s has two notes that start between the beats and hold across the next one; even hats never count). Suggestions: `chord-qualities` `anyOf: ["maj7", "m7", "7"]`, `min: 2`, `depth: "seventh"` (C07, C08); `velocity-ghosts` on the snare (PLANNED); `onsets` with a triplet through every bar (R12).',
    },
    notes: [
      'The checkpoint follows U14.L01 and GYM.14 in the default order (session 147), so it falls on a later day than U13.L06. It covers U12 and U13 (U12 has no checkpoint of its own). Passing or soft-passing it opens the jazz track (J1, J2.L01–L03, J3) and the rhythm track (R1–R3) (contracts §2.6, §4.3; gates `J.main` and `R.main`), U14.L03 onward (§7.6 rule 2) and milestone ms.16 "You can now groove with syncopation."',
      "The Coda of the passed checkpoint is where the tracks are announced (the summary's `gatesOpened`, wave6.md §5.3): two new branches on the map, nothing the learner must do today. Copy stays calm: what opened, what each track is in one line, and that the core continues with Modes.",
      "Gated skills C07 C08 I04 R09 R10 R11 R12 N08 N09; level-setting E11 E14 (contracts §7.6 checkpoint map). All three authored items use shapes that are graded and rendered today, so the checkpoint is shippable whatever happens to the PLANNED features of the unit.",
      "No sung or tapped item gates (contracts §7.6, §8): a learner in Quiet mode passes the same checkpoint. Tap items of the recipe's rhythm families are level-setting.",
      "The Make has no Band for the reason the unit gives: its drums are the learner's. Its starter is a square 4/4 groove with `<C^7 Am7 Dm7 G7>` on the Rhodes; a learner who prefers 6/8 may rewrite it (the required rule reads the declared 4/4 meter, so author:CP keeps the brief in 4/4 unless a 6/8 variant of the item is authored).",
    ],
  },
  capstones: [],
};
