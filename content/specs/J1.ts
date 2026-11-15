// J1 Swing, Symbols & the ii–V–I: the unit spec (rendered to content/specs/J1.md by `bun scripts/content/spec.ts`).
// The first unit of the jazz track (contracts §2.6): five lessons, no checkpoint of its own (J.CP1 covers J1 and
// J2.L01–L03). Every hook was evaluated with headless Strudel and is linted in its lesson by
// content/validate/specs.test.ts; J1.L01 is the exemplar, written and passing with the real grader
// (content/advanced/J1/L01). The pre-flight decisions this spec rests on are in the Wave 7 content lead's result
// (scratchpad w7/foundation-content-lead.md, "Pre-flight settled") and in AUTHORING §20.
import type { UnitSpec } from "./types.ts";

const C = { tonic: "C", mode: "major" } as const;
const F = { tonic: "F", mode: "major" } as const;
const Bb = { tonic: "Bb", mode: "major" } as const;
const T = (bpm: number) => `setcpm(${bpm}/4)\n\n`;

/**
 * What every J1 lesson may use on its earliest legal route: U13.CP passed, U14–U17 possibly unfinished
 * (contracts §4.3, §7.6 rule 5). No mode names (U14), no chromatic `n` steps (U15.L01), no `horns`, `trumpet` or
 * `tenor` (U15–U16), no `.pan()` or `.jux()` (U14.L06).
 */
const BASE = [
  "tb.setcpm",
  "tb.label",
  "tb.mini.seq",
  "tb.mini.rest",
  "tb.mini.sub",
  "tb.mini.alt",
  "tb.mini.repeat",
  "tb.mini.stack",
  "tb.gain",
  "tb.s",
  "tb.bank",
  "snd.drum.bd",
  "snd.drum.sd",
  "snd.drum.hh",
  "snd.drum.rd",
  "tb.swingBy",
  "tb.swing",
  "tb.n",
  "tb.scale",
  "scale.major",
  "tb.note",
  "tb.note.names",
  "tb.note.accidentals",
  "tb.s.pitched",
  "snd.piano",
  "snd.rhodes",
  "snd.upright",
  "tb.const",
  "tb.struct",
  "tb.chord",
  "tb.voicing",
  "tb.rootNotes",
  "chord.triad",
  "chord.dom7",
  "chord.seventh",
  "tb.dict.lefthand",
  "tb.feature.chord-symbols",
  "tb.feature.rn",
] as const;
/** J1.L01's own unlocks (contracts §3.2): the jazz kit and the vibraphone. Every later J lesson has them. */
const L01 = ["snd.jazzkit", "snd.vibes"] as const;

/** The swing pocket of J1.L01: the ride pattern and the hi-hat on 2 and 4, both on the jazz kit. */
const RIDE = 'drums: s("rd [rd rd] rd [rd rd]").swingBy(1/3, 4).bank("jazzkit")';
const HATS = 'hats: s("~ hh ~ hh").bank("jazzkit")';
/** A two-feel bass under ii–V–I in C (root and 5th, two to the bar). */
const TWO_FEEL = 'bass: note("<[d2 a1] [g1 d2] [c2 g1] [c2 e2]>").s("upright")';
/** Comping on the Charleston (beat 1, the and of 2), the left hand's voicings. */
const COMP = (changes: string) =>
  `chords: chord("${changes}").dict("lefthand").voicing().struct("x ~ ~ x ~ ~ ~ ~").swingBy(1/3, 4).s("rhodes").gain(.6)`;
/** A vibes line over Dm7 G7 Cmaj7: F A C | D F | E G B G | E. */
const VIBES =
  'mel: n("<[3 ~ 5 0] [1 ~ 3 ~] [2 4 6 4] [2 ~ ~ ~]>").scale("C4:major").swingBy(1/3, 4).s("vibes")';
const II_V_I = "<Dm7 G7 C^7 C^7>";

export const J1: UnitSpec = {
  unit: "J1",
  title: "Swing, Symbols & the ii–V–I",
  summary:
    'The first five lessons of the jazz track (contracts §2.6), the sound the learner came for: a swinging rhythm section under a ii–V–I. Music first: the ride pattern and the hi-hat on 2 and 4 make a groove swing (J1.L01, the exemplar); jazz charts write the chords the learner already plays with other glyphs, plus two new colours, the sixth chord and the sus chord (J1.L02); Dm7 G7 Cmaj7 is one gesture, the ii–V–I (J1.L03); its 3rds and 7ths make a thread that moves by a step or stays, the guide tones, sung and written with `.dict("guidetones")` (J1.L04); and the learner comps their own swinging ii–V–I with three-note shells over a supplied walking backing (J1.L05). The track opens after U13.CP (session 147 of the default order) and may interleave with U14–U17; most learners reach it with the core finished (about session 185). Every lesson is optional and earns the next: each Make is a loop the learner would replay, in the sound of a jazz trio.',
  conventions: [
    "Written for the learner at the gate (contracts §7.6 rule 5, AUTHORING §20.1): a J1 lesson may be taken with U14–U17 unfinished, so it uses only what U13.CP guarantees plus J1's own unlocks. No mode names or `.scale(\"D4:dorian\")` (U14; chord-scales are J2.L04's, gated on U14.CP), no chromatic `n` steps (U15.L01: an altered note is a note name), no secondary dominants by name (U15), no `horns` / `trumpet` / `tenor`, no `.pan()`. A learner at session 185 reads the same lesson: it never calls the core's ideas new.",
    'The sound of the unit: the jazz kit (`.bank("jazzkit")`, J1.L01) with the ride pattern on a `drums:` line (`s("rd [rd rd] rd [rd rd]").swingBy(1/3, 4)`) and the hi-hat on 2 and 4 on a `hats:` line; the upright bass; the Rhodes comping with `.dict("lefthand")`; the vibraphone (`vibes`, J1.L01) for melodies. The ride is labelled `drums:` (STYLE §2 has no `ride` label; `drums` is the kit\'s timekeeping line), so the `swing` rule\'s track list `["drums", "@drums"]` with `drums: ["ride"]` reads it.',
    "Swing: `.swingBy(1/3, 4)` on every line that swings (contracts §6.10), swing declared on the lesson (`swing: { subdivision: 8, amount: 1/3 }`), ratio windows [1.6, 2.4] for a check and [1.45, 2.4] for a Make (U11.L07's). The amount → ratio fixture is `swingRatio` (`@oak/content-kit`): `.2` is 3:2, `1/3` is 2:1, `.5` is 3:1. Quarter notes do not swing (§6.10 item 4): a swing check always reads a line with off-beats (the ride's skip notes, comping, the vibes), never the bass.",
    'Chord symbols (STYLE §5.1, AUTHORING §5 rule 3): code uses `C^7 Cm7 Cm7b5 Co7 C7 C6 Cm6 Csus C7sus`; prose uses the lead-sheet form (Cmaj7, Cm7, Cm7♭5); the jazz glyphs (C∆7, C–7, Cø7, C°7) arrive in J1.L02 with `tb.feature.jazz-glyphs` and are display only: `chord("C–7")` is not code. A chord\'s name comes from its symbol, never from the notes a dictionary produced (contracts §6.7). `lefthand` is MOSTLY rootless (STYLE §5.2): `C^7` → B D E G (the 7th lowest), `G7` → B E F A (the 3rd lowest), `Cm7b5` keeps its root: never say "the left hand leaves out the root" of all of them; every loop carries a `bass:` line.',
    "Keys spread twelve-key practice over the track (pre-flight B1): J1.L01 and L03 in C, J1.L02 in F, J1.L04 in B♭, J1.L05 in C with its Make inviting F; J2.L01 tours all twelve; after it, each lesson's Make is in the key the drill schedule needs least recently (the spec of each unit says which), and `deck.jzz.ii-v` keeps the twelve keys alive one card a day. No lesson asks for twelve keys in one session.",
    "Grading (AUTHORING §20.3, the corrections-pass standard): every required rule checks what is HEARD. The ride pattern is a `rhythm` match on the `drums` line plus `swung-offbeats` (the skip notes really swing); the hi-hat is `onsets` with `contains` 2 and 4 and `excludes` 1 and 3; a swinging Make is `swing` on the ride; a chord written by name is `pcset` per onset with the bass; a ii–V–I is `contains-rn` with `inOrder`; a guide-tone tune is `guide-tones` at the change with `maxMoveSemis: 2`; shells are the planned `voicing-shape` (octave-aware: root lowest, 3rd and 7th above). For every graded step: the reference, at least three other right answers (triplet-written swing, `.swing(4)`, a lighter amount inside the window, another sound), the unchanged starter, and at least one WRONG answer that uses the right function (`.swingBy(1/3, 8)`, which leaves eighths even; `.swingBy(0, 4)`; a silent `.gain(0)` line; a `^7` where the chart says `7`).",
    'Words that wait: "comping" is U06.L08\'s and may be used; "guide tones" is U12.L05\'s; "ii–V–I" as a term is J1.L03\'s (J1.L01–L02 say "Dm7, G7, Cmaj7"); "shell" J1.L05; "extension", "tension" and "avoid note" J2.L03 (J1 says "the 9th, a 2nd an octave up" if it must); "walking bass" J3.L04 (J1\'s backings play a two-feel or a supplied walk, unnamed); "chord-scale" J2.L04. New terms: ride pattern (L01), sixth chord and sus chord (L02), ii–V–I (L03), shell voicing (L05). L04 introduces none.',
    'Bands: `band.two-five-one` (Dm7 G7 C6 C6 as guide tones over a two-feel bass, four bars, every flavour; its jazz-soul kit swings) with `tracks: ["bass", "chords"]` when the learner writes the drums (J1.L01) and `tracks: ["drums"]` when the learner\'s chords and bass are what the rules read (J1.L03–L05; AUTHORING §8 rule 5). Its key follows the learner\'s (`params.key`). Lessons in another key (J1.L02 in F, J1.L04 in B♭) write their backing in the step\'s code instead and use `tracks: ["drums"]`.',
    'Singing (J1.L04): the guide-tone thread on syllables with numbers shown, `mode: "guide-tones"` (planned, `sing.guide-tones`), `fallback: "identify"` (Quiet mode picks the notes); never graded, never gating (contracts §7.6, §8).',
    "Ear training, stage G (contracts §7.3): `fam.jzz.ii-v` is seeded in J1.L03, `fam.jzz.guide` in J1.L04, `fam.jzz.voicing` in J1.L05; `fam.rhy.swing` is reviewed in J1.L01 (stage H continues it in R1.L02). `deck.chd.symbols` deals its sixth and sus cards from J1.L02; the Wave 7 decks `deck.jzz.ii-v` (J1.L03) and `deck.jzz.voicings` (J1.L05) are seeded where their lessons say once the drills engine writes them (until then the lesson says `review-if-due` on nothing and the spec lists them under notes).",
    'Feedback the grader emits on J1 steps (pin what `bun run content:check <id> --verbose` prints): `rhythm.missing`, `rhythm.extra`, `rhythm.displaced`, `rhythm.swing-missing`, `rubric.unmet` ("{label}: not yet." overrides that serve every rule stay neutral), `harmony.pcset`, `code.unknown-chord` (`Cmaj7`, `C-7`), `code.locked-chord` (`G7b9` before J2.L02, `Dm9` before J2.L03), `code.chord-not-in-dict` (`C69` or a triad under `lefthand`), `code.swing-fraction-string` (`"1/3"`), `code.unchanged`, `code.edit-outside`, `id.wrong`, `kb.missing-note` / `kb.extra-note` / `kb.bass`.',
  ],
  lessons: [
    {
      id: "J1.L01",
      author: "content-lead",
      idea: "A jazz groove swings because the drummer's ride cymbal plays four beats with a short swung note just after beats 2 and 4 (ding, ding-a, ding, ding-a), and the hi-hat closes on 2 and 4. Written as plain eighths and swung with `.swingBy(1/3, 4)`, the same pattern turns the trio's chords and bass into a swinging rhythm section.",
      hook: {
        hear: "A jazz trio within the first ten seconds: the ride pattern and the hi-hat on 2 and 4 on the jazz kit, an upright bass in two, Rhodes comping on the Charleston and a vibes line over Dm7 G7 Cmaj7, all swinging. Then the same trio with the ride on plain quarters: it stops swinging.",
        code: `${T(132)}${RIDE}\n${HATS}\n${TWO_FEEL}\n${COMP(II_V_I)}\n${VIBES}`,
      },
      key: C,
      meter: "4/4",
      bpm: 132,
      canDo: ["cd.code.swing-ride"],
      uses: [...BASE, ...L01],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items over nothing else: the trio with the ride pattern, then the same trio with the ride on four plain quarters. The caption names the one line that changed.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`s("rd [rd rd] rd [rd rd]").swingBy(1/3, 4)`: which hits move? (`choose`: the second hit inside beats 2 and 4, later / every hit, later / the hits on beats 2 and 4, earlier)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 0.75,
          what: "Run the ride alone and read it on the roll: how many hits in a bar (number: 6); where the short hit inside beat 2 lands (choice: two thirds of the way through the beat).",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'The ride plays four swung quarters (`rd rd rd rd`, nothing to swing). Give it the skip notes after 2 and 4. Graded: the ride\'s onsets on the straightened grid (`rhythm`, `tracks: ["drums"]`) and `swung-offbeats` on the drums line.',
          term: "term.ride-pattern",
        },
        {
          kind: "tap",
          exercise: "tap",
          answer: ["tap"],
          minutes: 1.25,
          what: "The trio plays; tap (snap) on 2 and 4 with the hi-hat, eight taps over two bars. Never graded.",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: "Add the hi-hat on 2 and 4 under the ride. Graded: `onsets` on `hats` with `contains` [1/4, 3/4] and `excludes` [0, 1/2] in every bar (a rubric matcher), so 1 and 3, every beat, and a silent line all fail.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Your swing pocket: the ride, the hi-hat and a kick or a vibes line of your own over the two-five-one Band's bass and chords.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The Band plays a ii–V–I in two, bass and chords. The drums are yours: make them swing. The ride pattern on the jazz kit, the hi-hat on 2 and 4; then make it your own: a feathered kick, a snare comment on the and of 4, a vibes line, a slower or faster tempo.",
        required: {
          rule: "swing",
          label: "The ride swings",
          why: '`swing` on `["drums", "@drums"]` with `drums: ["ride"]`, `subdivision: 8`, `ratio: [1.45, 2.4]`: the starter\'s straight quarters are not measurable and fail; a ride pattern swung with `.swingBy(1/3, 4)`, `.swing(4)`, `.swingBy(.2, 4)` or written on the triplet grid passes; a ride swung on 16ths (`.swingBy(1/3, 8)`) stays even and fails.',
        },
        suggestions: [
          "the hi-hat on 2 and 4 (`onsets` on `hats`, `contains` [1/4, 3/4])",
          "a vibes line that swings too (`swing` on `mel`)",
          "a tempo for medium swing, 110–180 (`tempo-bpm`)",
        ],
        band: "band.two-five-one",
        tracks: ["bass", "chords"],
        flavours:
          "The Band's bass and chords in the flavour's sounds (jazz-soul: upright and Rhodes, swung); the learner's drums stay on the jazz kit in every flavour, because the kit is the lesson.",
      },
      srs: [{ family: "fam.rhy.swing", mode: "review-if-due" }],
      mistakes: [
        'modify (ride): the skip notes after 1 and 3 (`[rd rd] rd [rd rd] rd`): `rhythm.displaced` / `rhythm.extra`; the pattern swung on 16ths (`.swingBy(1/3, 8)`, the right function, eighths still even): `rubric.unmet`; `.swingBy("1/3", 4)`: `code.swing-fraction-string`; the unchanged starter: `code.unchanged`',
        "modify (hats): on 1 and 3: `rubric.unmet`; on every beat (`hh*4`): `rubric.unmet`; the right places with `.gain(0)` (silent, the right function): `rubric.unmet`",
        "Make: the starter's straight quarters, a ride of plain eighths with no swing, and `.swingBy(1/3, 8)`: `rubric.unmet`",
      ],
      connects: {
        back: "U11.L07 swung the hats of a blues with `.swingBy(1/3, 4)` and named swing and shuffle; U01.L02 met the ride (`rd`) as a second timekeeper; U13.L05 showed the triplet behind the swing. J1.L01 calls those back and puts them on the jazz kit.",
        forward:
          "J1.L02 reads the chords this trio plays from a jazz chart; J1.L03 names the gesture they make, Dm7 G7 Cmaj7, the ii–V–I. R1.L02 (rhythm track) sets the swing amount by ear and in code.",
      },
      epr: {
        enjoyment:
          "A swinging jazz trio the learner drives from the drum chair: their ride pattern and hi-hat on the jazz kit over an upright bass and Rhodes chords, a loop that sounds like the records they came for.",
        pace: "One idea: the ride pattern and the hat on 2 and 4 are the swing pocket. The swing call itself is U11.L07's and is reused, not retaught; the chords are the Band's and stay unnamed until J1.L03; the swing amount waits for R1.L02.",
        return:
          "The Coda says: you can now play a swing ride pattern with the hi-hat on 2 and 4, and the jazz kit and the vibraphone are yours. Next: the chords this trio plays, read from a jazz chart.",
      },
      notes: [
        "The exemplar: content/advanced/J1/L01 passes every content-CI check with the real grader (7 steps, 2 graded), with the corrections-pass test set on each graded step: the reference, three other right answers, the unchanged starter, and a wrong answer that uses the right function.",
        'Evaluated: `s("rd [rd rd] rd [rd rd]").swingBy(1/3, 4)` plays at 0, 1/4, 5/12, 1/2, 3/4, 11/12 of the bar: the skip notes sit two thirds of the way through beats 2 and 4 (contracts §6.10). Written on the triplet grid, `[rd ~ ~] [rd ~ rd] [rd ~ ~] [rd ~ rd]` plays the same onsets.',
        "The Make's Band plays the guide tones of Dm7 G7 C6 C6 over a two-feel bass; under the jazz-soul flavour its comping swings with the learner's ride.",
      ],
    },
    {
      id: "J1.L02",
      author: "J1a",
      idea: "A jazz chart writes the chords you already play with a few new glyphs: ∆ is major seventh, – is minor, ø half-diminished, ° diminished; a symbol tells you the notes. Two symbols are new colours: the sixth chord (C6: the triad plus the 6th, warm and settled) and the sus chord (Csus: the 4th in place of the 3rd, floating until it resolves).",
      hook: {
        hear: "A four-bar chart in F read aloud by the band: F6, Dm7, Gm7, C7sus resolving to C7, on Rhodes over an upright, swung on the jazz kit. The chart shows glyphs above the staff (F6 D–7 G–7 C7sus).",
        code: `${T(116)}const changes = "<F6 Dm7 Gm7 [C7sus C7]>"\n\n${RIDE}\n${HATS}\nchords: chord(changes).voicing().s("rhodes")\nbass: chord(changes).rootNotes(2).s("upright")`,
      },
      key: F,
      meter: "4/4",
      bpm: 116,
      canDo: ["cd.read.jazz-symbols"],
      uses: [...BASE, ...L01, "chord.sixth-sus", "tb.feature.jazz-glyphs"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "The chart plays twice with the chord band open in glyphs: once as written, once with every 6 and sus taken out (plain F, C7). The caption names the two colours.",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: "Toggle the chord band between lead-sheet and jazz glyphs: which glyph means minor seventh (choice: –7); how many notes C6 has (number: 4) and which one is added to the C triad (in the pass text: A, the 6th).",
          term: "term.sixth-chord",
        },
        {
          kind: "quiz",
          exercise: "fact",
          answer: ["text"],
          features: ["text.jazz-chord"],
          minutes: 1,
          graded: true,
          what: 'Read four glyph symbols and write each as code (`text`, `normalize: "chord"`, `jazz: true`): B♭∆7 → `Bb^7`, E–7 → `Em7`, Fø7 → `Fm7b5`, A°7 → `Ao7`. Graded on root and quality, never as a string.',
        },
        {
          kind: "compare",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1,
          what: "Two cards: C7sus, then C7. Which one floats and which one leans (choice), named in the pass text.",
          term: "term.sus-chord",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: 'Play from the chart: a four-bar chart shown only in glyphs (G–7 C7 F∆7 F6) becomes `chord("<…>")` in code. `pcset` per onset with the bass; the target is audible. Pins `Fmaj7` (`code.unknown-chord`) and `F7` for F∆7 (`harmony.pcset`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "A four-bar chart of your own in F that ends on a sixth chord and uses one sus chord on its way, played by the trio.",
        },
      ],
      wrapAt: 3,
      make: {
        brief:
          "Write your own four-bar chart in F, the way a jazz player would read it, and let the trio play it: somewhere a sus chord that floats before it resolves, and the last chord a warm sixth chord. Keep the ride swinging.",
        required: {
          rule: "chord-qualities",
          label: "A sixth chord and a sus chord in your chart",
          why: '`chord-qualities` with `contains: ["6", "sus4"]` (`7sus4` counts as sus) on the chords track: the starter (Fmaj7 Dm7 Gm7 C7) fails, a chart with only one of the two fails, any chart with both passes. Read from the symbols (contracts §6.7).',
        },
        suggestions: [
          "the sus chord resolves to the same root with its 3rd (`C7sus` → `C7`)",
          "the bass on each chord's root (`bass-line`, roots on the change)",
        ],
        band: "band.two-five-one",
        tracks: ["drums"],
        flavours: "Drums in the flavour's kit; the starter is on `rhodes` and `upright`.",
      },
      srs: [{ deck: "deck.chd.symbols", cards: ["fact.chord.F6", "fact.chord.Csus"], mode: "seed" }],
      mistakes: [
        "quiz: `Bbmaj7` / `Bb∆7` written as code: `code.unknown-chord` is not a quiz code, the text answer normalizes glyphs; `Bb7` for B♭∆7: `id.wrong`",
        "modify: `F7` for F∆7: `harmony.pcset`; `Fmaj7`: `code.unknown-chord`; `G-7`: `code.unknown-chord`; the unchanged starter: `code.unchanged`",
        'Make: no sixth chord, or no sus chord: `rubric.unmet`; `C69` under `.dict("lefthand")`: `code.chord-not-in-dict`',
      ],
      connects: {
        back: "U05.L09 named chords by symbol; U12.L01–L03 wrote the five sevenths as `C^7 C7 Cm7 Cm7b5 Co7`; J1.L01's trio plays these chords.",
        forward: "J1.L03 takes three of these symbols, Dm7 G7 Cmaj7, and hears them as one gesture.",
      },
      epr: {
        enjoyment:
          "The learner's own chart in F played by a swinging trio, with a sus chord that hangs and a sixth chord that settles at the end: a jazz intro they could loop all evening.",
        pace: "One skill: read a jazz symbol into notes. The glyphs spell chords already known; the two new colours are heard once and built once each. Minor-major sevenths, 69, add9 and the altered symbols wait for J2.",
        return:
          "The Coda says: you can now read a jazz chord chart and write it in code. Next: three of these chords in a row are the ii–V–I, the sentence jazz is built from.",
      },
      notes: [
        '`C7sus` and `Csus` are ireal-only (STYLE §5.2): never under `.dict("lefthand")` or `guidetones`. `C6` and `F6` are silent under `lefthand` too (evaluated: lint `code.chord-not-in-dict`), and `C69` is wrong there (contracts §0.14): sixth chords use the default dictionary.',
        "The quiz needs the planned feature `text.jazz-chord` (the text answer reads glyphs); until the answers engineer lands it, the author may grade the same step with a `choice` of four code spellings per glyph.",
      ],
    },
    {
      id: "J1.L03",
      author: "J1a",
      idea: "Dm7, G7, Cmaj7: the minor seventh on 2, the dominant seventh on 5, home on 1. Each root falls a 5th, each chord pulls into the next, and the three together are one gesture, the ii–V–I, the sentence most jazz tunes are made of.",
      hook: {
        hear: "Four bars of ii–V–I in C by the trio (ride, hi-hat, two-feel bass, Rhodes comping, vibes), then the same four bars in F: the same pull, a new home.",
        code: `${T(132)}${RIDE}\n${HATS}\n${TWO_FEEL}\n${COMP(II_V_I)}\n${VIBES}`,
      },
      key: C,
      meter: "4/4",
      bpm: 132,
      canDo: ["cd.hear.ii-v-i"],
      uses: [...BASE, ...L01],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "The ii–V–I in C, then in F, by the trio.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "After Dm7 and G7, which chord does the ear expect? (`choose`: Cmaj7 / Am7 / Fmaj7)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice"],
          minutes: 1,
          panels: ["chords"],
          what: "With the chord band showing numerals: the three chords are ii7, V7 and Imaj7 (choice); each root falls a 5th (or rises a 4th).",
          term: "term.ii-v-i",
        },
        {
          kind: "quiz",
          exercise: "identify",
          answer: ["rn-palette"],
          minutes: 1,
          graded: true,
          what: 'Name a ii–V–I in B♭ by numeral (`rn-palette`, `allow: ["sevenths"]`, three slots: ii7 V7 Imaj7), graded by degree and quality at seventh depth.',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: "The ii–V–I in C plays; write it in F (Gm7 C7 F^7). `pcset` per onset with the bass; pins `Gm7 C7 F7` (`harmony.pcset`: a dominant where home is a major seventh).",
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "Does this four-bar phrase end with a ii–V–I or not (ii–V–vi, IV–V–I)? A mini-set from `fam.jzz.ii-v` level 1, seeded here.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Two ii–V–Is chained: one into C, one into F (or any second key), with the trio.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "Write eight bars for the trio: a ii–V–I into C, then a ii–V–I into a second key of your choice (F is close: Gm7 C7 Fmaj7). Comp them, give the vibes a line, keep the ride swinging.",
        required: {
          rule: "custom",
          label: "A ii–V–I",
          why: "`custom` `ii-v-chain` `{ harmony: \"chords\", minKeys: 1, minPairs: 1, resolved: 0.5 }` on the comping line (Wave 7 Build: `contains-rn` read the chord symbols a `rootNotes()` bass carries, so the right names over a silent comping line passed, and it compared the triad core, so Dm7 G7 C7 passed): a ii–V that never reaches I fails, a silent or masked comping line fails, any ii7 V7 Imaj7 run passes. A looped I vi ii V passes (each G7 lands on bar 1's Cmaj7: the gesture is heard), so the starter is I vi IV V. The same rule with `minKeys: 3` is JC1's.",
        },
        suggestions: [
          "a second ii–V–I into another key (`ii-v-chain`, `minKeys: 2`, planned)",
          "the ride swings (`swing`)",
        ],
        band: "band.two-five-one",
        tracks: ["drums"],
        flavours: "Drums in the flavour's kit; the starter is on `rhodes`, `upright` and `vibes`.",
      },
      srs: [{ family: "fam.jzz.ii-v", mode: "seed", level: 1 }],
      mistakes: [
        "quiz: `ii V I` without sevenths: `harmony.rn-quality`; `IImaj7`: `harmony.rn-quality`",
        "modify: `F7` for `F^7`: `harmony.pcset`; the ii–V–I left in C: `harmony.pcset`; `Fmaj7`: `code.unknown-chord`",
        "ear: the other answer: `id.wrong`",
        "Make: Dm7 G7 Am7 (no home): `rubric.unmet`",
      ],
      connects: {
        back: "U12.L04 named the diatonic sevenths Imaj7 ii7 … V7; U06.L03 taught function (predominant, dominant, tonic). The ii–V–I is those three functions in one gesture.",
        forward:
          "J1.L04 finds the two notes of each chord that make the gesture move, the guide tones; J2.L01 takes the ii–V–I round all twelve keys.",
      },
      epr: {
        enjoyment:
          "Eight bars of the learner's trio landing twice, once in C and once in a key they chose: the sound of a jazz tune's last line.",
        pace: "One idea: the three chords are one gesture. The guide tones inside it are tomorrow's; the minor version and the other keys are J2's.",
        return:
          "The Coda says: you can now hear a ii–V–I and write one. Next: the two notes in each chord that make the gesture move.",
      },
      notes: [
        'Evaluated: `chord("<Dm7 G7 C^7 C^7>").voicing()` with `.rootNotes(2)` under it; the numerals read ii7 V7 Imaj7 Imaj7 in C.',
      ],
    },
    {
      id: "J1.L04",
      author: "J1b",
      idea: "Inside a ii–V–I, the 3rd and the 7th of each chord make a thread that moves by a half step or stays: the 7th of ii falls to the 3rd of V, the 7th of V falls to the 3rd of I. Those are the guide tones; sing them, write them, and a melody built on them outlines the changes by itself.",
      hook: {
        hear: 'A ii–V–I in B♭ (Cm7 F7 B♭maj7) played only as its guide tones with `.dict("guidetones")`, then with a vibes line that follows the thread: two notes per chord and the changes are unmistakable.',
        code: `${T(120)}const changes = "<Cm7 F7 Bb^7 Bb^7>"\n\n${RIDE}\n${HATS}\nchords: chord(changes).dict("guidetones").voicing().s("rhodes")\nbass: chord(changes).rootNotes(2).s("upright")\nmel: note("<bb4 a4 a4 a4>").s("vibes")`,
      },
      key: Bb,
      meter: "4/4",
      bpm: 120,
      canDo: ["cd.sing.guide-tones"],
      uses: [...BASE, ...L01, "tb.dict.guidetones"],
      singOn: "syllables",
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "The guide tones of Cm7 F7 B♭maj7 alone, then under the vibes thread.",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: '`.dict("guidetones")` plays two notes per chord: which members (choice: the 3rd and the 7th); how far the 7th of Cm7 (B♭) moves to the 3rd of F7 (A) (number: 1 half step).',
        },
        {
          kind: "sing",
          exercise: "sing",
          answer: ["mic"],
          features: ["sing.guide-tones"],
          minutes: 1.5,
          what: 'Sing the thread B♭–A–A–A over the changes (`mode: "guide-tones"`, syllables with numbers shown, `fallback: "identify"`). Never graded.',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: "Write the other thread, starting on the 3rd of Cm7 (E♭): E♭–E♭–D–D, one note per chord, on the `mel` line. `events` match on `mel`, absolute pitch; the unchanged starter, `d4` for `eb4` in bar 2 (`melody.wrong-degree`).",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'Swap the chords line to `.dict("guidetones")` so the Rhodes plays only the thread. `pcset` per onset against the reference in the same dictionary, plus `voiced-with` `guidetones` (the dictionary really in force).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "A melody over Cm7 F7 B♭maj7 B♭maj7 that lands on a guide tone at every change and moves by a step or less between them; decorate it in between.",
        },
      ],
      wrapAt: 3,
      make: {
        brief:
          "Write a tune for the vibes over the ii–V–I in B♭ that lands on a guide tone (a 3rd or a 7th) at every chord change and moves by a step or less from one to the next. Between the changes it may go anywhere.",
        required: {
          rule: "guide-tones",
          label: "Your tune meets every change on a 3rd or a 7th, moving by a step",
          why: '`guide-tones` with `at: "change"`, `minRatio: 0.75`, `maxMoveSemis: 2` and `changes: ["Cm7", "F7", "Bb^7", "Bb^7"]` (the cycle given, so rewriting the chords cannot make a wrong tune right): a tune on roots fails, a guide-tone tune that leaps a 5th between changes fails, the thread itself and any decorated version of it pass.',
        },
        suggestions: ["the ride swings (`swing`)", "the vibes line swings too (`swing` on `mel`)"],
        band: "band.two-five-one",
        tracks: ["drums"],
        flavours: "Drums in the flavour's kit.",
      },
      srs: [{ family: "fam.jzz.guide", mode: "seed", level: 1 }],
      mistakes: [
        "modify (thread): `d4` in bar 2: `melody.wrong-degree`; the whole thread an octave up: `melody.octave`",
        'modify (dict): `.dict("guidetones")` after `.voicing()`: `rubric.unmet` (`voiced-with`); `ireal` left in place: `harmony.pcset`',
        "Make: a tune on the roots; the thread with a leap of a 5th between changes: `rubric.unmet`",
      ],
      connects: {
        back: "U12.L05 named the guide tones and sang the thread through a cycle of sevenths in A minor; J1.L03 named the ii–V–I.",
        forward: "J1.L05 voices the ii–V–I with three-note shells: the root plus these two notes.",
      },
      epr: {
        enjoyment:
          "A vibes melody of the learner's own over a swinging ii–V–I in B♭ that outlines the changes by itself.",
        pace: "One idea: the 3rd and 7th thread through the ii–V–I. The dictionary that plays it is the lesson's one new tool; shells are tomorrow's.",
        return:
          "The Coda says: you can now sing and write guide-tone lines through a ii–V–I. Next: the root plus these two notes is a shell, the voicing jazz pianists comp with.",
      },
      notes: [
        'Evaluated: `chord("<Dm7 G7 C^7 C^7>").dict("guidetones").voicing()` plays F C | F B | E B (pre-flight table): the thread F–F–E and C–B–B.',
        "The sung step needs the planned feature `sing.guide-tones`; it never gates and its Quiet path picks the notes.",
      ],
    },
    {
      id: "J1.L05",
      author: "J1b",
      idea: "A shell voicing is three notes: the root in the left hand's bottom, with the 3rd and the 7th above it. It says everything a chord's quality needs and leaves room for the bass and the melody. Comp your own ii–V–I in shells over the walking backing and it swings like a pianist's left hand.",
      hook: {
        hear: "The trio with the learner's comping chair empty, then filled with shells written by hand (D F C | G F B | C E B), on the Charleston, swinging.",
        code: `${T(132)}${RIDE}\n${HATS}\n${TWO_FEEL}\nchords: note("<[d3,f3,c4] [g2,f3,b3] [c3,e3,b3] [c3,e3,b3]>").struct("x ~ ~ x ~ ~ ~ ~").swingBy(1/3, 4).s("rhodes")`,
      },
      key: C,
      meter: "4/4",
      bpm: 132,
      canDo: ["cd.code.shells"],
      uses: [...BASE, ...L01, "tb.dict.guidetones", "tb.set", "tb.voicing.n"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "The backing without comping, then with shells on the Charleston.",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice"],
          minutes: 0.75,
          what: "Which three notes make the shell of G7 (choice: G, F, B; root, 7th, 3rd). The pass text names the **shell voicing**.",
          term: "term.shell-voicing",
        },
        {
          kind: "quiz",
          exercise: "keyboard",
          answer: ["keyboard"],
          features: ["keyboard.voicing"],
          minutes: 1,
          graded: true,
          what: 'Build the shell of Fmaj7 on the keyboard, F lowest: `expect: { voicing: { shape: "shell", symbol: "F^7" } }`, `pitchMode: "absolute"` (F A E or F E A above it).',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'The backing gives `const changes`; the chords line plays full voicings. Rewrite it as shells by hand (`note("<[…] […]>")`), keeping the Charleston. Graded with `voicing-shape` (`shape: ["shell"]`, `changes`) inside a rubric matcher, plus the rhythm of the comping.',
        },
        {
          kind: "see",
          minutes: 0.5,
          what: 'How a backing is made from one chord string (shown, read only): `n("0 1 2").set(chord(changes)).voicing()` arpeggiates the voicing for the vibes, `rootNotes` gives the bass. Seen, not asked for.',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Your own comping: shells for a ii–V–I (in C or F) over the supplied backing, in a rhythm of your choice.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The Band plays the drums and a bass in two. Comp a ii–V–I with shells of your own, written by hand: root at the bottom, 3rd and 7th above. Choose your rhythm: the Charleston, a push on the and of 4, or whole notes.",
        required: {
          rule: "custom",
          label: "Your chords are shells: root, 3rd and 7th",
          why: '`custom` `voicing-shape` (planned) with `shape: ["shell"]`, `minRatio: 0.75`, `changes` the given cycle: full `voicing()` chords fail with a message, four-note close voicings fail, root–3–7 and root–7–3 shells in any register pass. Until the grader implements `voicing-shape`, the lesson fails check 2 and says so.',
        },
        suggestions: ["the comping swings (`swing` on `chords`)", "a second ii–V–I into F (`contains-rn`)"],
        band: "band.two-five-one",
        tracks: ["drums", "bass"],
        flavours: "Drums and bass in the flavour's sounds; the learner's shells on `rhodes`.",
      },
      srs: [{ family: "fam.jzz.voicing", mode: "seed", level: 1 }],
      mistakes: [
        "keyboard: F A C (the triad, no 7th): `kb.missing-note`; A lowest: `kb.bass`; F E♭ A (F7's shell): `kb.extra-note`",
        "modify: the 5th for the 7th (`[d3,f3,a3]`): `rubric.unmet`; full voicings left in: `rubric.unmet`; the right shells all on beat 1 (the rhythm lost): `rhythm.missing`",
        "Make: the starter's `voicing()` line: `rubric.unmet`",
      ],
      connects: {
        back: "J1.L04 found the guide tones; U12.L06 voiced sevenths with `lefthand`; U08.L04 shared one rhythm between parts with a `const`.",
        forward:
          "J2.L01 carries the shells round all twelve keys; J3.L01 opens them into rootless A and B voicings.",
      },
      epr: {
        enjoyment:
          "The learner's own left hand in a swinging jazz trio: shells they wrote, comping a ii–V–I over a walking bass and the ride.",
        pace: "One idea: three notes, root–3rd–7th. The shared chord string is supplied and only shown; `.set()` is read, never required; rootless and drop-2 voicings wait for J3.",
        return:
          "The Coda says: you can now comp a ii–V–I with shell voicings of your own (milestone: You can now comp a ii–V–I). Next: the same gesture in all twelve keys.",
      },
      notes: [
        "The required rule `voicing-shape` and the keyboard's `keyboard.voicing` are planned (TRACK_CUSTOM_RULES, SCHEMA_FEATURES): the Build lands them before this lesson can pass.",
        "The supplied backing's walk is written in note names (the walking bass is J3.L04's idea), unnamed here.",
      ],
    },
  ],
  capstones: [],
};
