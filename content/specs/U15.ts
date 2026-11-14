// U15 Secondary Dominants: the unit spec (rendered to content/specs/U15.md by `bun scripts/content/spec.ts`). Six
// lessons, no checkpoint of its own (U17.CP covers U15–U17) and no capstone (U15.L01 opens CF-T, which the finale
// spec owns; this spec says what the learner is told when it opens). Every hook was evaluated with headless
// Strudel and is linted in its lesson by content/validate/specs.test.ts; every rule and answer shape named
// "graded today" was run through the real grader while this spec was written. U15.L02 is the exemplar, written
// and passing every content check (content/core/U15/L02).
import type { UnitSpec } from "./types.ts";

const C = { tonic: "C", mode: "major" } as const;
const T = (bpm: number) => `setcpm(${bpm}/4)\n\n`;

/** What every U15 lesson has from U01–U14, plus the chromatic steps U15.L01 itself unlocks. */
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
  "tb.n.chromatic",
  "tb.scale",
  "scale.major",
  "tb.note",
  "tb.note.names",
  "tb.note.accidentals",
  "tb.s.pitched",
  "snd.piano",
  "snd.rhodes",
  "snd.upright",
  "tb.struct",
  "tb.const",
  "tb.chord",
  "tb.voicing",
  "tb.rootNotes",
  "chord.triad",
  "chord.dom7",
  "chord.seventh",
  "tb.feature.degree-labels",
  "tb.feature.solfege",
  "tb.feature.rn",
  "tb.feature.chord-symbols",
] as const;

/** One string drives the chords and the bass (U08.L04, U12): Rhodes above, upright below. */
const band = (form: string, ...lines: string[]) =>
  [
    `const changes = "${form}"`,
    "",
    'chords: chord(changes).voicing().s("rhodes")',
    'bass: chord(changes).rootNotes(2).s("upright")',
    ...lines,
  ].join("\n");
const mel = (pattern: string, sound = "piano") => `mel: n("${pattern}").scale("C4:major").s("${sound}")`;

/**
 * U15.L01: a soul turn whose tune leans on four notes from outside the key. sol fi sol do | la si la | fa di
 * re fa | sol fa re | sol fi sol do | te la sol | la fa la | sol. Bar 6's chord is C7, the chord te belongs to.
 */
const LEANING = mel("<[4 3# 4 7] [5 4# 5 ~] [3 0# 1 3] [4 ~ 3 1] [4 3# 4 7] [6b ~ 5 4] [5 ~ 3 5] [4 ~ ~ ~]>");
/** U15.L02 (the exemplar's hook): the key's own turn with bar 3 raised, Dm to D7, the tune on F♯. */
const FIVE_OF_FIVE = mel("<[4 ~ 2 4] [2 ~ 0 ~] [3# ~ 5 3#] [4 ~ 3 1]>");
/**
 * U15.L03: three visitors, each followed by its chord, the tune on the borrowed note and then on its
 * resolution: G♯ to A (si la), B♭ to A (te la), C♯ to D (di re).
 */
const VISITORS = "<C E7 Am C7 F A7 Dm G7>";
const VISITORS_TUNE = mel(
  "<[4 ~ 2 ~] [4# ~ 6 4#] [5 ~ 2 0] [6b ~ 4 2] [5 ~ 3 ~] [0# ~ 2 4] [1 ~ 3 1] [1 ~ -1 ~]>",
);
/** U15.L04: the walk-up. The bass climbs C C♯ D, then F♯ G G♯ A; the three diminished sevenths are all there are. */
const WALK_UP = "<C C#o7 Dm7 F#o7 G7 G#o7 Am7 G7>";
/** U15.L05: the changes that open Five Foot Two, Eyes of Blue (1925), in C. The trumpet line is Oak's, not the song's. */
const CHAIN = "<C E7 A7 A7 D7 G7 C G7>";
const CHAIN_LINE = mel(
  "<[4 ~ 2 4] [4# ~ 6 4#] [0# ~ 2 4] [5 ~ ~ ~] [3# ~ 5 3#] [4 ~ 3 1] [2 ~ ~ ~] ~>",
  "trumpet",
);
/** U15.L06: a ballad with two visitors to find by ear, A7 into Dm (bar 2) and C7 into F (bar 6). */
const BALLAD = "<C A7 Dm G7 C C7 F G7>";
const BALLAD_TUNE = mel(
  "<[2 ~ 4 2] [0# ~ 2 4] [3 ~ 1 ~] [1 ~ -1 ~] [2 ~ 4 2] [6b ~ 4 2] [5 ~ 3 ~] [4 ~ 3 1]>",
);

export const U15: UnitSpec = {
  unit: "U15",
  title: "Secondary Dominants",
  summary:
    'Six lessons on the first chords from outside the key, and the longest stretch of harmony the learner has met without a new sound to hide behind. So every idea arrives as a sound from a record first: the bar where a song leans forward, in pop, soul and early jazz, heard and found by ear before it has a name. U15.L01 starts with single notes: the five notes between the key\'s seven, each named by the degree it bends (♯4 "fi", ♭7 "te"), each leaning a half step into a neighbour, written in code as a step and a sign (`n("3#")`, `n("6b")`). The rest of the unit puts chords under those notes. Raise the 3rd of the chord on degree 2 and it becomes the V7 of V (U15.L02, the exemplar); the same move aims a V7 at vi, ii and IV (U15.L03); a diminished seventh a half step under a chord does the same job while the bass climbs, and the idea gets its name, tonicization (U15.L04); dominants that aim at dominants make the chains of the 1920s, Five Foot Two and Sweet Georgia Brown, with horns and a trumpet (U15.L05); and a lab finds and names all of them by ear (U15.L06). In the default order U15.L01 sits before U14.CP (session 154) and opens CF-T, the transcription half of the core finale, which from then on takes the transcription slots (sessions 156, 161, 166, 171); U15.L02–L06 follow C6 (sessions 159–164). U15.L03 and later need U14.CP. U17.CP covers the unit; finishing U15.L06 opens J4 in the jazz track.',
  conventions: [
    'The rule of the unit: sound, then job, then name. Each lesson opens with a loop in which the thing happens, set against the same loop without it, and asks the learner to find the bar that leans before anything is named. Lessons describe the moment by where it sits in a song ("the last line before the chorus", "the walk-up a gospel pianist plays", "the turn that ends a 1920s chorus"), never by the title of a record: Oak ships its own renditions only (contracts §2.8). The two songs U15.L05 names, Five Foot Two (1925) and Sweet Georgia Brown (1925), are in the public domain and in the repertoire; the lesson plays their changes, never their tunes (the tune of Five Foot Two is for CF-T to transcribe).',
    'One outside note per chord. U15.L01 teaches the notes; U15.L02–L05 put a chord under each; U15.L06 reads it backwards by ear. The table every author keeps to, in C: ♯4 (F♯, fi) is the leading tone of G and belongs to D7, the V7 of V; ♯5 (G♯, si) leads to A and belongs to E7, the V7 of vi; ♯1 (C♯, di) leads to D and belongs to A7, the V7 of ii; ♭7 (B♭, te) falls to A and turns C into C7, the V7 of IV. A raised note leans up, a lowered note leans down. ♭3 ♭6 ♭2 (me le ra) are heard and sung in U15.L01 and its drill; their chords belong to U16. Never say a chromatic note is "wrong" or "outside the scale, so avoid it": it is a visitor with a direction.',
    'Chromatic degrees in code (STYLE §6.3, `tb.n.chromatic`, unlocked by U15.L01): the 0-based step, then `#` or `b`: `n("3#")` is ♯4, `n("6b")` is ♭7, `n("4#")` ♯5, `n("0#")` ♯1, `n("1b")` ♭2, `n("2b")` ♭3, `n("5b")` ♭6. The bridge sentence is always the same: "the number is the step, as ever one less than the degree; the sign bends it". The trap is taught and pinned: `4#` is ♯5, not ♯4, and `7b` is the plain 7 (the lint warns `code.chromatic-step` on `7b`; `4#` evaluates and is caught by the matcher as a wrong note). Evaluated: `n("4 3# 4 7")` on `C4:major` plays G F♯ G C. Strudel names the raised notes with flats in its events (A♭ for `4#`); the roll, the staff and the degree lens spell them by the chord under them and then by direction (@oak/theory `chromaticLabel`), so prose always uses the sharp for a note that leans up.',
    'Chromatic solfège (contracts §2.3 U15.L01; content-kit `DEGREE_SYLLABLES`): raised degrees take the vowel i, di ri fi si li; lowered ones e or a, ra me se le te. The learner already sings me, le and te (minor, U10) and te and se in the blues (U11); new in U15.L01 are fi, si, di and ra. The seven names of contracts §2.3 (♯4 ♭7 ♯5 ♯1 ♭2 ♭3 ♭6) cover five keys of the keyboard: C♯ is di when it rises to re and ra when it falls to do, G♯ is si rising to la and le falling to sol; the direction chooses the name. Sung steps show numbers and syllables together (♯4 fi), are never graded and never gate; each declares `fallback: "identify"` (Quiet mode names the degrees on a pad). A degree pad may hold chromatic degrees from U15.L01 on (check 14 `chromatic.before-u15`); it never offers two names for one key (♯4 and ♭5 together).',
    'Words. New terms: chromatic degree (U15.L01), secondary dominant (U15.L02), tonicization (U15.L04); U15.L03, L05 and L06 introduce none. V7/V is said "five-seven of five" and the slash is read "of". The diminished seventh that leads into a chord is "the leading-tone chord" of that chord (leading tone is a term of U03.L04), written vii°7/ii. "Applied" stays in the schema and the grader; learner prose says secondary dominant and leading-tone chord. A run of dominants is "a chain", plain English. Words that wait: borrowed chord and modal mixture (U16), modulation, pivot chord and key change (U17: here "home has not moved" is the phrase, because a tonicization lasts a chord or two), tritone substitution (J5.L01), "ii–V" as a named gesture (J1.L03), extension, ♭9 and altered (J2). "Dominant" alone still means the chord on V and its job (U06.L03).',
    'Numerals. A secondary dominant is named by where it goes: V7/V, V7/vi, V7/ii, V7/IV, vii°7/ii, vii°7/V, vii°7/vi (STYLE §5.1, @oak/theory `romanText`). Players name a chain by its roots (III7–VI7–II7–V7, as contracts §2.3 words U15.L05); the lesson gives both once and Oak answers are the "of" form. They are entered on the `rn-palette` with `allow: ["triads", "sevenths", "secondary"]` and read by degree, chroma and quality, never as strings (`viio7/ii` typed is vii°7/ii). What the grader says today, which every author pins and overrides (`--verbose`): `II7` for `V7/V`, or `ii7`, is `harmony.rn-degree`, whose catalog text calls V7/V "built on degree 5": override it with a sentence of the lesson, worded so it also fits a miss on a plain chord (the override serves every slot); `V/V` for `V7/V` (the 7th left off) is `harmony.rn-case`, whose catalog text speaks of upper and lower case: override it too; one applied chord for another (`V7/ii` for `V7/vi`) is `id.wrong` ("That was V7/vi, not V7/ii. Listen to both."): override it with which note to listen for. U15.L02 S6 shows the first two overrides.',
    'Chords in code are names, as in U12: `D7`, `E7`, `A7`, `C7`, `C#o7`. The leading-tone chord is spelled from the sharp (`C#o7`, never `Dbo7`: both sound and pass, since chords are graded as pitch classes; the pass text shows the sharp). No slash chords and no numerals inside `chord()` (`code.slash-chord`, `code.unknown-chord`). The name of a chord comes from its symbol, never from its voicing (contracts §6.7): the default dictionary voices D7 as F♯3 C4 D4 F♯4 C5, without its 5th and with the 3rd lowest, so every loop carries `bass: chord(changes).rootNotes(2)` and every step that reads the members of a chord shows a hand stack from the root (`note("[d3,f#3,a3,c4]")`).',
    'Sound. One `const changes` drives chords and bass (U08.L04). The home of the unit is the Rhodes over an upright bass with a piano tune (U15.L01–L03, L06: soul); U15.L04 moves to the organ for the gospel walk-up; U15.L05 is a 1920s dance band: `jazzgtr` on the off-beats, the upright on 1 and 3, `horns` stabs and a `trumpet` line (`snd.horns` and `snd.trumpet` unlock there; the lint of the hook proves it). The Band is `band.axis-4bar` with `tracks: ["drums"]` in every Make: chords and bass stay in the code of the learner, where the rules read them (AUTHORING §8 rule 5). No flavour swap is needed in learner code; the flavour changes the drums.',
    'Grading, all run with the real grader for this spec. Graded today: a named chord in code as `pcset` per onset with `bass: true` on `tracks: ["chords"]`; keyboard chords as `expect: { pcs, bassPc }`; "which bar leans" as `bar-buttons`; numerals as above; a staged chord dictation (`stages: ["bass", "rn"]`, a degree pad then the palette) with applied chords in it; chromatic degrees on a `degree-pad` and in `degree-set` (`anyOf` with `minCount`); and `contains-rn` with applied numerals and `mustResolve`. How `contains-rn` reads them: by triad core, so `V/V` counts D and D7 alike; an applied numeral counts only where the chord sounds applied, so a plain C before F is not V/IV and C7 before F is; "resolves" means the root of the next chord is the root of the target, so A7 to D7 counts as V/ii (a chain passes) and the loop wraps (a visitor in the last bar resolves into bar 1); `min` counts chords, not kinds. Planned, and named where a step uses them: `contains-rn.kind` ("any secondary dominant"), `contains-rn.in-order` (a run of chords), `rn-palette.slot-keys` (slot labels such as "The chord" and "It leads to").',
    "Keys. C major is the home of the unit, so the outside notes are always the black keys and the learner can see them. U15.L02, L03, L05 and L06 each move at least one graded step to another major key (F, G or B♭; the exercise carries its own `key`), so that V7/V is learned as a relation and not as the chord D7. U15.L04 stays in C, where its three diminished sevenths are all there are. Ear items state their key in the prompt and start on I.",
    'Ear training, stage F (contracts §7.3): `fam.deg.fet-chromatic` is seeded in U15.L01 at level 1 (♯4 and ♭7 among 4 5 6 7 1); levels 2 and 3 (♭3 ♭6, then ♭2 ♯5 ♯1) arrive in warm-ups. `fam.deg.index` gains level 5 (step strings) at U15.L01. `fam.har.rn` level 5 opens with its `applied` category at U15.L02. `fam.har.chromatic` ("find the chromatic chord", `bar-buttons`) is seeded in U15.L06, where `fam.har.bass` level 6 also opens. Until U15.L06 the "find the bar" steps of U15.L02–L05 are fixed items, two or three to a step.',
    'CF-T opens when U15.L01 is completed (contracts §2.4, §2.5; wave6.md §5.2). What the learner is told, in the Coda of that session, after the recap and the unlocks of the lesson: a card titled "The core finale has opened: part one", with the text "Standard Transcription. You will take down a whole song from the 1920s by ear: its form, its bass, its chords and its melody, then arrange and release it. Four sessions. They arrive in your transcription slots, about every fifth session, where the gym has been; the gym returns when the song is released. You choose the song when the first session starts: Five Foot Two, Ain\'t She Sweet or Bye Bye Blackbird. Nothing waits for it: your lessons carry on in between." Today then shows, on the day a slot falls due, "Standard Transcription · Session 1 of 4" as the New block (plan `slot: { fills: "cf-t" }`), and the learner may open it from the capstone list on any day before that (the finale spec, content/specs/CF.md, owns those surfaces; this card is the one thing the session of U15.L01 adds). The copy never says "final exam", never counts down, and never implies the lessons stop. In the default order the four sessions are 156, 161, 166 and 171, so the learner transcribes the changes of a standard (CF-T.S2, session 161) between U15.L03 and U15.L04, with exactly the chords this unit is teaching in their ears.',
    "Order and gates. U15.L01 and U15.L02 need only the lesson before them (contracts §7.6 rule 2), so neither assumes U14.CP is passed and neither names C6; U15.L03 and later need U14.CP passed or soft-passed. U15.L01 comes the day after U14.L06 and the day before U14.CP in the default order: it adds no load to that checkpoint (E12a and H12 belong to U17.CP). Completing U15.L06 records the gate that opens J4; its Coda says so only when the jazz track is open.",
    'Scaffolds (AUTHORING §6, U11 and later). The chord band shows the numeral of an applied chord from U15.L02 on (app `HARMONY_DEPTH_GATES.applied`; the lesson host adds U15.L02 itself, so its own steps already show V7/V); before that it shows the symbol alone. The degree lens names chromatic notes from U15.L01 (`tb.n.chromatic`). Steps that read chord members set `rollLabels: "note"` and stack by hand; steps about the tune set `rollLabels: "degree"`. The Play from the page step of U15 is U15.L03 S5: a lead sheet in G major with the tune and its accidentals, numerals in the prompt, answered as chord names in code.',
    "Pace across the unit: one new thing a day, and the thing gets smaller as the stretch gets longer. U15.L01 is melody only (no new chord). U15.L02 is one chord in one place. U15.L03 is the same chord aimed at three more targets. U15.L04 is a second chord with the same job. U15.L05 is the first chord used several times in a row, with two new sounds as the reward. U15.L06 adds nothing: it is ears and an earlier loop of the learner. No lesson has more than three graded steps or eight steps, and every one ends with a loop on a real band sound that is the learner's to keep.",
    'Feedback the grader emits on U15 steps (pin what `bun run content:check <id> --verbose` prints): `harmony.pcset` (a named chord with other notes: `Gm7` or `G` for `G7`, `C#o` for `C#o7`), `code.unknown-chord` (`Cdim7`, `II7`), `code.slash-chord`, `code.edit-outside`, `code.unchanged`, `melody.wrong-degree` (`4#` for ♯4), `code.chromatic-step` (a lint warning on `7b`), `kb.extra-note` / `kb.missing-note` / `kb.bass`, `id.wrong` (a bar, a choice, a degree on the pad, one applied chord for another), `harmony.rn-degree`, `harmony.rn-case`, `harmony.bass` (the bass stage of a dictation), `investigate.wrong`, `rubric.unmet` (overridden with the neutral "{label}: not yet.": the detail the rule itself gives for an applied chord that does not resolve says "not home to I", which is wrong for a V of V).',
  ],
  lessons: [
    {
      id: "U15.L01",
      author: "U15a",
      idea: 'Between the seven notes of a key sit five more. Each is named by the degree it bends: raise 4 and it is ♯4, sung fi; lower 7 and it is ♭7, sung te. A raised note leans up into the next degree, a lowered one leans down. In code the step comes first and the sign after it: `n("3#")` is ♯4, `n("6b")` is ♭7.',
      hook: {
        hear: "A tune over a soul turn, twice. First plain, on the key's own notes. Then the way a singer would bend it: four of its notes moved a half step so each leans into the note after it, sol fi sol, la si la, di up to re, te falling to la. Same chords, same rhythm; the second one sounds like a record.",
        code: `${T(92)}${band("<C Am Dm G7 C C7 F G7>", LEANING)}`,
      },
      key: C,
      meter: "4/4",
      bpm: 92,
      canDo: ["cd.hear.chromatic-degrees", "cd.code.chromatic-degrees"],
      uses: [...BASE],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "Two items of eight bars over the Band's drums: the tune on the key's own notes (`3`, `4`, `0`, `6` where the hook bends), then the hook. The caption of the second names the four bent notes by syllable.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`n("4 3# 4")` in C major: sol, something, sol. Which note is `3#`? (`choose`: F♯, step 3 is degree 4 and the sign raises it / G♯, the 4 raised / E, the note under F)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: "Run the hook with degree labels on the roll (the lens names ♯4 fi, ♯5 si, ♯1 di, ♭7 te): where does te go next (choice: down a half step to 6, la); which step number, written before the `#`, gives ♯5 (number: 4).",
          term: "term.chromatic-degree",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: "Four bars of the plain tune over `<C C7 F G7>` with two regions, `[4 ⟪3⟫ 4 7]` and `[⟪6⟫ ~ 5 4]`: bend the first into fi and the second into te (`3#`, `6b`). `events` on `mel`, absolute pitch, `edit-only-regions`; the target is audible and its roll appears after a failed try.",
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["degree-pad"],
          minutes: 1.5,
          graded: true,
          what: "`fam.deg.fet-chromatic` at level 1, six trials from the generator: a cadence sets home, one note sounds: 4, ♯4, 5, 6, ♭7, 7 or 1? The pad shows syllables. The lesson seeds the family.",
        },
        {
          kind: "sing",
          exercise: "sing",
          answer: ["mic"],
          minutes: 1,
          what: 'Sing the two leans: sol fi sol, then do te la (`mode: "degree"`, `degrees: ["5", "#4", "5", "1", "b7", "6"]`, the 1 an octave up, `labels: "syllables"`, `fallback: "identify"`: Quiet mode names them on the pad).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Bend a tune: a plain four-bar tune over given chords and bass, to colour with leaning notes.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "A soul turn, C Am Dm G7, with a bass and a plain tune on the key's own notes. Bend it: move at least two of its notes a half step so each leans into the note after it (try `3#` before a 4, `4#` before a 5, `6b` before a 5). Then make it yours: more bends, a new rhythm, the tune an octave up.",
        required: {
          rule: "degree-set",
          label: "Two notes from outside the key in your tune",
          why: '`degree-set` on `mel` with `anyOf: ["#4", "b7", "#5", "#1", "b2", "b3", "b6"]` and `minCount: 2` (graded today): the tune of the starter has none, and no tune reaches two by accident.',
        },
        suggestions: [
          "most of the tune moves by step, so the bent notes resolve (`step-ratio`, `min: 0.5`)",
          "the tune ends on 1 (`ends-on-degree`)",
          'the bass on the root of each chord (`bass-line`, `roots: { on: "change", minRatio: 0.75 }`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band in the flavour's kit; chords stay on `rhodes`, bass on `upright`, the tune on `piano`.",
      },
      srs: [
        { family: "fam.deg.fet-chromatic", mode: "seed", level: 1 },
        { family: "fam.deg.index", mode: "review-if-due", level: 5 },
      ],
      singOn: "syllables",
      mistakes: [
        "modify: `4#` for ♯4 (plays G♯, the 5 raised): `melody.wrong-degree`, with an override that says the number is the step; `7b` for ♭7 (plays B, the plain 7): `melody.wrong-degree` and the lint warning `code.chromatic-step`; the unchanged starter: `code.unchanged`; a note outside the regions: `code.edit-outside`",
        "investigate: te taken to rise to do (it falls), or step 5 for ♯5 (the degree, not the step): `investigate.wrong`",
        "ear: ♯4 heard as 4 or 5, ♭7 as 7 or 6: `id.wrong` (the catalog text prints `#4`; override it with the syllable and where the note leans)",
        "Make: the starter as it is, and a tune with one bent note: `rubric.unmet`",
      ],
      connects: {
        back: "U02.L05 found the five notes between the white keys and called the row the chromatic scale; U03.L02 made `n` degree minus one. U10 sang me, le and te as a minor key's own notes, U11 bent ♭3 ♭5 ♭7 in the blues, U14 met ♭7, ♯4 and ♭2 as the colour of a mode. Here the key stays major and the notes visit.",
        forward:
          "U15.L02 puts a chord under fi: raise the F of D minor and it is D7, the V7 of V. Si, di and te get their chords in U15.L03; me, le and ra get theirs in U16.",
      },
      epr: {
        enjoyment:
          "A tune the learner has bent the way a singer bends one, over a Rhodes and an upright bass: the same notes as the plain version with two or three half-step leans in it, and it sounds like a performance instead of an exercise.",
        pace: "One idea: a note from outside the key is a degree bent a half step, and it leans. The hook holds four of them (fi, si, di, te), but only ♯4 and ♭7 are drilled and written under a check; the rest join through the levels of the warm-up family. No chord is new today.",
        return:
          "The Coda says: you can write and hear a note from outside the key and say where it leans. Then: the core finale has opened, part one, a standard to take down by ear in your transcription slots. Next lesson: fi gets a chord of its own.",
      },
      notes: [
        "CF-T opens when this lesson is completed. The card the Coda shows, word for word, is in the conventions of the unit; the prose of the lesson says nothing about it (AUTHORING §5 rule 9: the Coda announces unlocks). The session engineer shows the card after the recap and the tool unlock (`tb.n.chromatic`), never before the Make is saved.",
        "Evaluated: the `mel` of the hook plays G F♯ G C | A G♯ A | F C♯ D F | G F D | G F♯ G C | B♭ A G | A F A | G. Strudel reports `4#` as A♭4 and `0#` as D♭4; the lens spells them G♯ and C♯ because they rise (`chromaticLabel`, direction up).",
        'Bar 6 of the hook is C7, the chord te belongs to (U12.L02 called it "C7 leans into F"); the lesson does not name it. It is the first example of U15.L03.',
        "The new term is registered: `term.chromatic-degree` (content/terms.ts, U15.L01). It is named in the pass text of the investigate step, after the learner has heard, run and read four of them.",
        "`fam.deg.fet-chromatic` level 1 holds ♯4, ♭7, 4, 5, 6, 7 and 1 (packages/drills `cats`); the pad of the lesson offers exactly those. `fam.deg.index` level 5 (step strings both ways) opens here and plays in warm-ups.",
        "This lesson is taken the day before U14.CP in the default order and needs nothing from it. Keep it light: 8.75 expert minutes, two graded steps.",
      ],
    },
    {
      id: "U15.L02",
      author: "spec-U15",
      idea: "Raise one note of the chord on degree 2, the F of D minor to F♯, and the chord stops being the key's own: D7 is G's own V7, and it pulls into G the way G7 pulls home. G is V, so D7 is the V of V, written V7/V: a secondary dominant. It is the bar before V where a song leans forward.",
      hook: {
        hear: "A four-bar turn the learner has played for months, C Am Dm G7, then the same turn with one note of bar 3 raised a half step, in the chord and in the tune: C Am D7 G7. The second one tilts forward in bar 3 and lands harder on bar 4.",
        code: `${T(92)}${band("<C Am D7 G7>", FIVE_OF_FIVE)}`,
      },
      key: C,
      meter: "4/4",
      bpm: 92,
      canDo: ["cd.write.secondary-dominant"],
      uses: [...BASE, "snd.organ"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items over the Band's drums: `<C Am Dm G7>` with the tune on F in bar 3, then `<C Am D7 G7>` with the tune on F♯ (`3#`). The captions name the one note that differs.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`chord("<Dm D>")`: which note moves, and what is it in C major? (`choose`: F up to F♯, ♯4, fi / A up to B♭, ♭7, te / D up to E♭, ♭3, me)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: "Two pairs stacked by hand from the root, G7 then C, D7 then G, with the chord band open: D7 is the V7 of which chord (choice: G); how many of D7's four notes are outside C major (number: 1).",
          term: "term.secondary-dominant",
        },
        {
          kind: "ear",
          exercise: "all",
          parts: ["identify", "identify"],
          answer: ["bar-buttons"],
          minutes: 1,
          graded: true,
          what: "Find the lean: two loops of four bars, heard and not seen, `<C F D7 G7>` in C (bar 3) and `<F G7 C7 F>` in F (bar 2). Which bar holds the chord that is too bright for the key?",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: 'The turn in F major, `"<F Dm ⟪Gm⟫ C7>"`: make bar 3 the V7 of C (`G7`). `pcset` per onset with the bass, `edit-only-regions`; the target is audible and its roll appears after a failed try.',
        },
        {
          kind: "quiz",
          exercise: "fact",
          answer: ["rn-palette"],
          minutes: 1,
          graded: true,
          what: 'A last line in C shown in chord names, `<F D7 G7 C>`: its numerals (`rn-palette`, `slots: 4`, `allow: ["triads", "sevenths", "secondary"]`; `IV V7/V V7 I`).',
        },
        {
          kind: "sing",
          exercise: "sing",
          answer: ["mic"],
          minutes: 1,
          what: 'Sing the note that moves, one a bar over Dm, D7 and G: fa, fi, sol (`mode: "degree"`, `degrees: ["4", "#4", "5"]`, `rhythm: "x"`, `fallback: "identify"`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "An eight-bar verse on the key's own chords that ends on V without much conviction: make it lean into that V.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          'An eight-bar verse, `"<C Am F G7 C Am Dm G7>"`, with a bass and a tune. Put a V7 of V in front of a V (bar 7 is the natural place), then fix the tune note that now rubs against the chord: its F wants to be F♯, `3#`. After that it is yours: move chords, squeeze `[D7 G7]` into one bar, rewrite the tune, try the organ.',
        required: {
          rule: "contains-rn",
          label: "A V of V that goes to V",
          why: '`contains-rn` with `rn: ["V/V"]`, `min: 1`, `mustResolve: true` (graded today): the Dm of the starter does not count, `Dm7` does not count, and a D7 that goes to F does not count; D or D7 followed by G or G7 does, in a whole bar or half of one.',
        },
        suggestions: [
          'the tune sings ♯4 somewhere (`degree-set`, `contains: ["#4"]`)',
          'the bass on the root of each chord (`bass-line`, `roots: { on: "change", minRatio: 0.75 }`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: "Drums from the Band in the flavour's kit; chords stay on `rhodes`, bass on `upright`.",
      },
      srs: [
        { family: "fam.har.rn", mode: "review-if-due", level: 5 },
        { family: "fam.deg.fet-chromatic", mode: "review-if-due", level: 1 },
      ],
      singOn: "syllables",
      mistakes: [
        "modify: `Gm7` (a seventh on the key's own chord, B♭ still there), `D7` (the chord of the hook, which is G's V7, not C's) and `G` (no 7th): each `harmony.pcset`; `C7` edited too: `code.edit-outside`; the unchanged starter: `code.unchanged`",
        "numerals: `II7` and `ii7` for `V7/V`: `harmony.rn-degree`; `V/V` for `V7/V`: `harmony.rn-case`; both texts overridden (see the conventions)",
        "ear: the bar after the lean, where it lands: `id.wrong`",
        "investigate: D7 taken to lead home to C, or two notes counted (F♯ and C): `investigate.wrong`",
        "Make: the starter, a D7 that falls back to F, and `Dm7`: `rubric.unmet`",
      ],
      connects: {
        back: "U15.L01 sang fi and wrote it `3#`; U12.L04 found that a major key owns exactly one dominant seventh, on V; U12.L02 heard a dominant seventh lean a 5th down. Today a second dominant seventh appears in the key, and the ear knows it is a visitor because of the first two facts.",
        forward:
          "U15.L03 aims the same chord at vi, ii and IV. U15.L05 lets the V of V be approached by its own V, and a chain starts.",
      },
      epr: {
        enjoyment:
          "An eight-bar verse on the Rhodes that now leans into its last bar, with the learner's tune taking the raised note on the way: the lift before a chorus, which they have heard on a thousand records and can now place where they want it.",
        pace: "One idea: one chord, in one place, the V7 of V before V. The other targets are tomorrow; the triad form V/V is accepted by the Make and mentioned once; the function of the chord (it replaces the predominant) is left to the ear.",
        return:
          "The Coda says: you can build the V of V, find it by ear and name it. Next: the same chord aimed at other chords of the key.",
      },
      notes: [
        "The exemplar: content/core/U15/L02 passes every content-CI check with the real grader (8 steps, 3 graded, 9 expert minutes: 12.6 scaled, part A 4.2, part B 8.4).",
        "Evaluated: the chords of the hook voice C as E3 C4 E4 G4 C5, Am as A3 C4 E4 A4 C5, D7 as F♯3 C4 D4 F♯4 C5 and G7 as G3 D4 F4 G4 B4; the bass plays C2 A2 D2 G2; the tune plays G E G | E C | F♯ A F♯ | G F D.",
        'The investigate step stacks its chords by hand (`note("<[g2,b2,d3,f3] [c3,e3,g3] [d3,f#3,a3,c4] [g2,b2,d3]>")`) so the roll reads root, 3rd, 5th, 7th from the bottom; the default voicing of D7 has no 5th and F♯ lowest.',
        'The ear step is two fixed items, not the drill: `fam.har.chromatic` opens in U15.L06. The second item is in F so that the answer is not "the bar with D7".',
        "The starter of the Make is Oak's copy (no `fromSketch`): the lesson needs a verse whose bar 7 is the key's own chord on 2 with the tune on 4, so that the fix is one chord and one note.",
        "This lesson needs only U15.L01 (contracts §7.6 rule 2): it does not assume U14.CP or C6, though both come before it in the default order.",
      ],
    },
    {
      id: "U15.L03",
      author: "U15a",
      idea: "Any major or minor chord of the key can have its own V7 in front of it. E7 visits A minor (V7/vi), A7 visits D minor (V7/ii), C7 visits F (V7/IV). Each brings one note from outside the key, the one that leans into its target, and each is named by where it goes.",
      hook: {
        hear: "An eight-bar soul ballad turn: C, E7 into A minor, C7 into F, A7 into D minor, G7 home. Three times the harmony tilts toward a chord and lands on it, and each landing feels like a small arrival without the song leaving home. The tune takes the borrowed note each time and resolves it: si to la, te to la, di to re.",
        code: `${T(88)}${band(VISITORS, VISITORS_TUNE)}`,
      },
      key: C,
      meter: "4/4",
      bpm: 88,
      canDo: ["cd.write.applied-chords"],
      uses: [...BASE, "tb.feature.leadsheet"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "Two items of eight bars: the turn on the key's own chords, `<C Em Am C F Am Dm G7>`, then the hook, in which Em, C and Am have each become a dominant seventh on the same root.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "E7 is E G♯ B D. A dominant seventh leans to the chord a 5th below it. Where will E7 land in C major? (`choose`: A minor, vi / F, IV / C, home)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: "Run the hook with the chord band open (it now writes V7/vi, V7/IV, V7/ii): which note from outside the key does A7 bring (choice: C♯, di, the leading tone of D); how many of the eight bars hold a chord that is not the key's own (number: 3).",
        },
        {
          kind: "quiz",
          exercise: "keyboard",
          answer: ["keyboard"],
          minutes: 1,
          graded: true,
          what: "Aim a V7 at A minor: build V7/vi of C major on the keyboard, root lowest (E G♯ B D: `expect: { pcs: [4, 8, 11, 2], bassPc: 4 }`).",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.5,
          graded: true,
          features: ["lead-sheet"],
          what: "Play from the page: a lead sheet in G major shows eight bars of tune with three accidentals (D♯, F♮, G♯) and no chord symbols; the prompt gives the numerals I V7/vi vi V7/IV IV V7/ii ii V7. Write `changes` by name (`<G B7 Em G7 C E7 Am D7>`); `pcset` per onset with the bass. The tune, on `G4:major`: `<[4 ~ 2 ~] [6 ~ 4# ~] [5 ~ 2 ~] [4 ~ 6b ~] [5 ~ 3 ~] [4 ~ 0# ~] [1 ~ 3 1] [1 ~ -1 ~]>`.",
        },
        {
          kind: "ear",
          exercise: "all",
          parts: ["identify", "identify", "identify"],
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "Three loops of four bars, heard and not seen, each with one visitor in bar 2: `<C E7 Am G7>`, `<C A7 Dm G7>`, `<C C7 F G7>`. Which chord is it aimed at? (choice: A minor, vi / D minor, ii / F, IV). Fixed items: `fam.har.chromatic` opens in U15.L06.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "Three doors: the ballad turn on the key's own chords, with a visitor to place before A minor, F or D minor.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          'The ballad turn on the key\'s own chords, `"<C Em Am C F Am Dm G7>"`, with a bass and a tune. Three of its chords sit a 5th above the chord that follows. Open at least one door: turn Em, C or Am into the V7 of the chord after it, and let the tune take the note the visitor brings (`4#`, `6b` or `0#`). Open all three if they sound right to you.',
        required: {
          rule: "contains-rn",
          label: "A V7 aimed at vi, ii or IV that lands there",
          why: '`contains-rn` with `rn: ["V/vi", "V/ii", "V/IV"]`, `min: 1`, `mustResolve: true` (graded today): the Em, C and Am of the starter do not count (a plain C before F is I, not V/IV); E7 to Am, A7 to Dm or C7 to F does.',
        },
        suggestions: [
          "two visitors, each landing on its chord (`contains-rn`, the same numerals, `min: 2`)",
          'the tune takes a borrowed note (`degree-set`, `anyOf: ["#5", "#1", "b7"]`)',
          'the bass on the root of each chord (`bass-line`, `roots: { on: "change", minRatio: 0.75 }`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: "Drums from the Band in the flavour's kit; chords stay on `rhodes`, bass on `upright`.",
      },
      srs: [
        { family: "fam.har.rn", mode: "review-if-due", level: 5 },
        { family: "fam.deg.fet-chromatic", mode: "review-if-due", level: 3 },
      ],
      mistakes: [
        "keyboard: G for G♯ (Em7, the key's own chord on 3): `kb.extra-note` and `kb.missing-note`, with an override that names the leading tone; the triad without its 7th: `kb.missing-note`; G♯ lowest: `kb.bass`",
        "modify: `Bm7` for `B7` (the key's own iii7), `G^7` for `G7` (the key's own Imaj7: F♯, not F) and `A7` for `E7` (the V7 of V, a 5th above the wrong chord): each `harmony.pcset`; the unchanged starter: `code.unchanged`",
        "ear: the visitor aimed at the wrong chord: `id.wrong`, with an override that says which borrowed note to listen for (si, di or te)",
        "investigate: B♭ for the outside note of A7, or 4 chords counted (G7 is the key's own): `investigate.wrong`",
        "Make: the starter as it is, and E7 that goes to F instead of A minor: `rubric.unmet`",
      ],
      connects: {
        back: "U15.L02 built the V7 of V; the si, di and te of U15.L01 are the notes today's chords bring. U12.L02 already heard C7 lean into F, before it had a name.",
        forward:
          "U15.L04 reaches the same chords through a diminished seventh, with the bass climbing. U15.L05 aims these visitors at each other.",
      },
      epr: {
        enjoyment:
          "A slow eight-bar ballad on the Rhodes in which the harmony leans into A minor, F or D minor wherever the learner opened a door, the tune taking the borrowed note each time: the sound of the verse of a soul ballad, and theirs.",
        pace: "One idea: yesterday's chord, aimed elsewhere. Three targets in one lesson because it is one move made three times, each with a note the learner sang two days ago. V/iii is left out (it is rare, and its target is the weakest chord of the key); the leading-tone chord is tomorrow.",
        return:
          "The Coda says: you can aim a secondary dominant at any chord of the key. Next: another chord that does the same job, with a bass that climbs.",
      },
      notes: [
        "Evaluated: the tune of the hook plays G E | G♯ B G♯ | A E C | B♭ G E | A F | C♯ E G | D F D | D B; the bass plays C E A C F A D G. The in-key turn of the listen step puts Em, C and Am where E7, C7 and A7 are, on the same bass.",
        "Play from the page (the one of this unit): the lead sheet shows the tune only (a chart of symbols would give the answer away). Its tune is not the tune of the hook: each outside note is the last note of its bar and steps straight into the next bar (D♯ to E, F♮ to E, G♯ to A), because without a chord to read the staff spells a chromatic note by the half step it resolves through. Engraved for this spec in G: D B | F♯ D♯ | E B | D F♮ | E C | D G♯ | A C A | A F♯, exact, no warnings, with ♯, ♮ and ♯ on the three notes. The tune of the hook transposed would not do: its G♯ leaps before it resolves and is engraved as A♭. The author reports it if a lead sheet without chord symbols cannot be drawn by the lesson host.",
        "V7/IV is the one visitor whose outside note is a 7th, not a 3rd: the E of C7 is already in the key, and B♭ (te) is what makes I restless. The pass text of the keyboard or the investigate step says so in one sentence.",
        "This lesson needs U14.CP passed or soft-passed (contracts §7.6 rule 2).",
        "`fam.deg.fet-chromatic` level 3 (♯5, ♯1, ♭2) is open from U15.L01; the lesson names it for review because si and di are the notes of today.",
      ],
    },
    {
      id: "U15.L04",
      author: "U15b",
      idea: "A chord can also be reached through its own leading-tone chord: the diminished seventh a half step below its root. C♯°7 leads into D minor, F♯°7 into G, G♯°7 into A minor. It is the visitor's V7 with the root taken away, so it pulls as hard, and the bass gets to climb by half steps. Treating a chord as home for a moment like this, with its own V7 or its own vii°7, is called tonicization.",
      hook: {
        hear: "A gospel walk-up on the organ over an upright bass: the bass climbs C, C♯, D, then F♯, G, G♯, A, and over each of the notes between the key's own a tight, restless chord squeezes into the chord above it. Slow enough to feel every push.",
        code: `${T(84)}const changes = "${WALK_UP}"\n\nchords: chord(changes).voicing().s("organ")\nbass: chord(changes).rootNotes(2).s("upright")`,
      },
      key: C,
      meter: "4/4",
      bpm: 84,
      canDo: ["cd.write.tonicization"],
      uses: [...BASE, "chord.seventh-dim", "snd.organ"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "Two items: yesterday's visitor, `<C A7 Dm7 G7>` (the bass drops a 5th into D), then the eight-bar hook, whose first four bars are the same turn with `C#o7` in place of A7 (the same pull, the bass climbs a half step).",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "A7 is A C♯ E G. Take the root away and put B♭ on top: C♯ E G B♭. Which kind of chord is that? (`choose`: a diminished seventh, every note three half steps from the next / a half-diminished / a minor seventh)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["number", "choice"],
          minutes: 1,
          what: 'Three hand stacks on the roll, A7, C♯°7 and D minor (`note("<[a2,c#3,e3,g3] [c#3,e3,g3,bb3] [d3,f3,a3]>")`): how many notes do A7 and C♯°7 share (number: 3); where does the root of the leading-tone chord sit against the root it leads to (choice: a half step below).',
          term: "term.tonicization",
        },
        {
          kind: "quiz",
          exercise: "keyboard",
          answer: ["keyboard"],
          minutes: 1,
          graded: true,
          what: "Build the leading-tone chord of G on the keyboard, F♯ lowest: F♯ A C E♭ (`expect: { pcs: [6, 9, 0, 3], bassPc: 6 }`).",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: 'The walk-up with its first push in place and two bars waiting, `"<C C#o7 Dm7 ⟪Dm7⟫ G7 ⟪G7⟫ Am7 G7>"`: put the leading-tone chord of the chord in the next bar in each (`F#o7`, `G#o7`). `pcset` per onset with the bass, `edit-only-regions`; the target is audible.',
        },
        {
          kind: "ear",
          exercise: "all",
          parts: ["identify", "identify", "identify"],
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "Three loops heard and not seen, each with one push in bar 2: `<C A7 Dm G7>`, `<C C#o7 Dm G7>`, `<C G#o7 Am G7>`. Its own V7, or its own leading-tone chord? (choice: V7, the bass drops a 5th / leading-tone chord, the bass climbs a half step). Fixed items.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          panels: ["chords"],
          what: "A walk-up of the learner's own: a turn that waits two bars on each chord, with the waits to fill.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          'A slow turn that waits, `"<C C Dm7 Dm7 G7 G7 Am7 G7>"`, on the organ with a bass. Fill the waits: in the second bar of a pair, write the chord that pushes into the next bar, a leading-tone chord (a half step below the root you are aiming at) or a V7. Use at least one leading-tone chord, and listen to the bass climb. Then add a line on top, or change where the turn goes.',
        required: {
          rule: "contains-rn",
          label: "A leading-tone chord that goes to its chord",
          why: '`contains-rn` with `rn: ["vii°/ii", "vii°/iii", "vii°/IV", "vii°/V", "vii°/vi"]`, `min: 1`, `mustResolve: true` (graded today; read by triad core, so the diminished triad and the diminished seventh both count; the key\'s own B° before C does not). When `contains-rn.kind` is built the author may write `kind: ["applied-leading-tone"]` instead.',
        },
        suggestions: [
          "two pushes of any kind that land (`contains-rn` with the V and vii° numerals of ii, V and vi, `min: 2`, `mustResolve`)",
          'the bass on the root of each chord (`bass-line`, `roots: { on: "change", minRatio: 0.75 }`)',
          "a line on top whose strong beats are chord notes (`chord-tones-strong`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band in the flavour's kit; the starter is on `organ` and `upright`, which every flavour keeps.",
      },
      srs: [
        { family: "fam.har.rn", mode: "review-if-due", level: 5 },
        { family: "fam.chd.quality-7th", mode: "review-if-due", level: 4 },
      ],
      mistakes: [
        "modify: `F#o` (the triad, no 7th) and `F#m7b5` (the half-diminished: E, not E♭): each `harmony.pcset`; `Fo7` (the root not raised): `harmony.pcset`, the bass named too; `F#dim7`: `code.unknown-chord`; `Gbo7` passes (the same notes), and the pass text shows the sharp; the unchanged starter: `code.unchanged`",
        "keyboard: E for E♭ (F♯ half-diminished): `kb.extra-note` and `kb.missing-note`; G♯°7 (the leading-tone chord of A, not of G): the same pair; A lowest: `kb.bass`",
        "ear: a V7 taken for a leading-tone chord: `id.wrong`, with an override that points at the bass",
        "investigate: 2 shared notes, or a half step above: `investigate.wrong`",
        "Make: the starter as it is, and a diminished seventh that does not step up into the next chord (`C#o7` before G7): `rubric.unmet`",
      ],
      connects: {
        back: "U12.L03 built the diminished seventh and played C, C♯°7, Dm7, G7 in its hook without saying why it worked; U15.L03 aimed A7 at D minor. Today the two are shown to be nearly the same chord.",
        forward:
          "U15.L05 goes back to V7s and chains them. In the jazz track, J5.L03 uses diminished chords that pass between any two chords.",
      },
      epr: {
        enjoyment:
          "A slow organ walk-up over an upright bass that climbs by half steps into each chord, the sound of a gospel pianist filling the space between two bars, with the learner deciding which waits get a push.",
        pace: "One idea: a second chord for the same job, recognised by its bass. The name tonicization arrives as a word for what the last three lessons did, not as new material. Only three targets (ii, V, vi); the diminished chord that passes downward and the one before a final I are left out.",
        return:
          "The Coda says: you can make a chord sound like home for a moment, with its own V7 or its own leading-tone chord. Next: dominants that aim at dominants, and a horn section.",
      },
      notes: [
        "Evaluated: the chords of the hook voice C♯°7 as D♭3 B♭3 E4 G4 B♭4, F♯°7 as F♯3 E♭4 F♯4 A4 C5 and G♯°7 as D3 B3 F4 A♭4 B4; the bass plays C2 C♯2 D2 F♯2 G2 G♯2 A2 G2 (Strudel reports D♭2 and A♭2; display re-spells by the chord). The three diminished sevenths of the hook are the only three there are: every other one is one of these with another note lowest. That fact is for the author, not the lesson.",
        'A7 and C♯°7 share C♯, E and G; the fourth note is A in one and B♭ in the other. The lesson says "the V7 with its root taken away and the note above the root in its place" and does not say ♭9.',
        "`chord.seventh-dim` (U12.L03) is the only tool beyond the base of the unit; diminished sevenths on a sharp root (`C#o7`, `F#o7`, `G#o7`) lint and voice correctly.",
        'The numerals vii°7/ii, vii°7/V and vii°7/vi are entered on the palette with `secondary` allowed; `viio7/ii` typed is the same answer. `V7/ii` for `vii°7/ii` is `harmony.rn-degree`: if the author adds a numeral step, its override says "the same target, another chord: this one stands a half step below D".',
      ],
    },
    {
      id: "U15.L05",
      author: "U15b",
      idea: "A secondary dominant can aim at another dominant. E7 leads to A7, A7 to D7, D7 to G7, G7 home: every chord is the V7 of the next, the roots fall by 5ths, and inside the chords two notes slide down by half steps. Players call the chain by its roots, III7 VI7 II7 V7; each link is still the V7 of what follows.",
      hook: {
        hear: "The changes that open Five Foot Two, Eyes of Blue (1925): C, then E7, A7, D7 and G7 tumbling home, played by a dance band of the time: a jazz guitar on the off-beats, an upright bass on 1 and 3, horn stabs and a trumpet. Then the chain of Sweet Georgia Brown (1925), which starts one link later and holds each chord longer.",
        code: `${T(120)}const changes = "${CHAIN}"\n\nchords: chord(changes).voicing().struct("~ x ~ x").s("jazzgtr")\nbass: chord(changes).rootNotes(2).struct("x ~ x ~").s("upright")\nhorns: chord(changes).voicing().struct("x ~ ~ ~ ~ ~ ~ x").s("horns").gain(.6)\n${CHAIN_LINE}`,
      },
      key: C,
      meter: "4/4",
      bpm: 120,
      canDo: ["cd.compose.dominant-chain"],
      uses: [...BASE, "snd.jazzgtr", "snd.horns", "snd.trumpet"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "Two items of eight bars: the hook (`<C E7 A7 A7 D7 G7 C G7>`), then the chain of Sweet Georgia Brown set in C, two bars a chord (`<A7 A7 D7 D7 G7 G7 C C>`), same band.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "E7 went to A7, A7 went to D7: each root a 5th below the last. Which chord comes after D7? (`choose`: G7 / C / F7)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["number", "choice"],
          minutes: 1,
          panels: ["chords", "circle"],
          what: 'The chain reduced to two notes a chord over its bass (`note("<[g#3,d4] [g3,c#4] [f#3,c4] [f3,b3]>")` over E A D G), the circle of fifths open: how many half steps does each of the two notes fall at every change (number: 1); G♯ is the 3rd of E7: which member of A7 is the G it slides to (choice: the 7th).',
        },
        {
          kind: "quiz",
          exercise: "fact",
          answer: ["rn-palette"],
          minutes: 1,
          graded: true,
          what: 'The chain in chord names, `<E7 A7 D7 G7 C>`: each chord as the V7 of the next (`rn-palette`, `slots: 5`, `allow: ["triads", "sevenths", "secondary"]`; `V7/vi V7/ii V7/V V7 I`). The prompt says players call it III7 VI7 II7 V7 and asks for the "of" names.',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          panels: ["chords"],
          what: 'The chain of Sweet Georgia Brown in F major, two bars a chord, with the first link given: `"<D7 D7 ⟪D7 D7 D7 D7⟫ F F>"`. Write the two links between D7 and home (`G7 G7 C7 C7`). `pcset` per onset with the bass; the exercise is in F.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["degree-pad"],
          minutes: 1.25,
          graded: true,
          what: 'The bass of a chain, heard under its chords: `<C E7 A7 D7 G7 C>`, one bar each. Its degrees on the pad, in order (an `identify` with a `degree-pad`, `sequenceLen: 6`, `correct: { degrees: ["1", "3", "6", "2", "5", "1"] }`). All six are the key\'s own notes: what leaves the key is above them.',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          features: ["contains-rn.in-order"],
          panels: ["chords"],
          what: "A 1920s turn of the learner's own: a chain of dominants, a guitar, a bass, horn stabs and a trumpet line.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          'An eight-bar turn on the key\'s own chords, `"<C Em Am Am Dm G7 C G7>"`: the roots already fall by 5ths from E to C, played by a guitar, a bass and a trumpet. Turn the walk into a chain: at least three dominant sevenths in a row, each the V7 of the next, landing on C. Then give the horns their stabs with `.struct()`, and let the trumpet take the notes the chain brings (`4#`, `0#`, `3#`).',
        required: {
          rule: "contains-rn",
          label: "Three dominants in a row, each the V of the next",
          why: '`contains-rn` with `rn: ["V/ii", "V/V", "V"]`, `inOrder: true`, `min: 1` (planned feature `contains-rn.in-order`; a held chord counts once, so the long links of Sweet Georgia Brown pass): A7 D7 G7 anywhere in the piece. Until it is built the author uses `rn: ["V/vi", "V/ii", "V/V"]`, `min: 3`, `mustResolve: true`, which today passes the chain of the hook and fails the starter.',
        },
        suggestions: [
          'the horns play (`sounds`, `anyOf: ["snd.horns"]`)',
          'the chain starts a link earlier, on E7 (`contains-rn`, `["V/vi"]`, `mustResolve`)',
          "the strong beats of the trumpet are chord notes (`chord-tones-strong`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band in the flavour's kit (jazz-soul swings them, which suits the lesson best; the guitar and bass of the starter play quarter notes, so nothing flams); `jazzgtr`, `upright`, `horns` and `trumpet` stay in every flavour.",
      },
      srs: [
        { family: "fam.har.rn", mode: "review-if-due", level: 5 },
        { family: "fam.har.bass", mode: "review-if-due", level: 5 },
      ],
      mistakes: [
        "numerals: `III7 VI7 II7 V7` (the players' names): `harmony.rn-degree` today, with an override that says the roots are right and asks for each chord as the V7 of the next; `V/vi` without its 7th: `harmony.rn-case`, overridden",
        "modify: `A7 A7 E7 E7` (up a 5th instead of down), `Gm7 Gm7 C7 C7` (the key's own ii7) and `G7 G7 C C` (the last link not a seventh): each `harmony.pcset`; the unchanged starter: `code.unchanged`",
        "ear: the bass heard as 1 3 6 4 5 1 (4 for 2): `id.wrong`, with an override that says each root is a 5th below the last",
        "investigate: 2 half steps, or the 3rd for the 7th: `investigate.wrong`",
        "Make: the starter as it is (Em Am Dm are not dominants), and a chain of two (`<C C Am Am D7 G7 C G7>`): `rubric.unmet`",
      ],
      connects: {
        back: "The V7 of V of U15.L02 is the last link but one; the V7 of ii and the V7 of vi of U15.L03 are the links before it. U12.L05 followed the 3rd and the 7th through a chain of the key's own sevenths; here the same thread falls by half steps. The circle of fifths of U04 is the map of the roots.",
        forward:
          "U15.L06 finds these chords by ear. The standards of CF-T are built from such chains. In the jazz track, J4 turns the chain into the bridge of rhythm changes and J5.L01 replaces links with their tritone substitutes.",
      },
      epr: {
        enjoyment:
          "Eight bars of a 1920s dance band that the learner arranged: a chain of dominants on a chopping guitar, an upright bass, horn stabs they placed and a trumpet line of their own. It is the first sketch on their shelf that sounds like early jazz.",
        pace: "One idea: the chord of U15.L02 used several times in a row. No new chord, no new numeral; the two new sounds are the reward, not the lesson. The guide-tone slide is seen once and not drilled; swing is left to the Band.",
        return:
          "The Coda says: you can write a chain of dominant sevenths that falls by 5ths, and you have a horn section and a trumpet. Next: finding secondary dominants by ear, with nothing on the screen.",
      },
      notes: [
        "Evaluated: the bass of the hook plays C2 E2 A2 A2 D2 G2 C2 G2 on beats 1 and 3; the trumpet plays G E G | G♯ B G♯ | C♯ E G | A | F♯ A F♯ | G F D | E; `horns` and `trumpet` lint at U15.L05 (they unlock here). The reduced chain of the investigate step plays G♯ D | G C♯ | F♯ C | F B: 3rd and 7th, then 7th and 3rd, each voice a half step down every bar.",
        "Repertoire (contracts §2.8): the lesson uses the changes of `song.five-foot-two` (the first eight bars of the chorus, in C) and of `song.sweet-georgia-brown` (VI7 II7 V7 I; the teaching key in the registry is F, where the chain is D7 G7 C7 F, the answer of the modify step). Both are 1925 and in the US public domain. No tune of either is played or shown: the trumpet line is Oak's. There is no `repertoire` fragment in this spec for that reason.",
        'A learner who chose Five Foot Two for CF-T took down its changes in CF-T.S2 (session 161 of the default order, two sessions before this lesson): the hook then confirms what they heard, and the prose of the listen step may say "you may know this turn". In another order the lesson can come first; that is accepted (CF-T grades 32 bars of changes and a form map, and these eight bars are the best-known feature of the song).',
        'The palette step asks for the "of" names. `III7` for `V7/vi` is the same chord under another name and is failed today as `harmony.rn-degree`; the grader engineer is asked to accept it with an info line (see the result notes). Until then the override must not call the answer wrong notes.',
        "The stimulus of the ear step has two chords fewer than the hook (no held A7, no turnaround) so the bass is six different bars. It is an `identify` with the degrees in `correct`, not a `dictation`: a `dictation` answered on a degree pad reads the top line of its reference today, whatever track its matcher names (probed: the right bass was failed against 1 7 6 1 7 1, the top notes of the voicings).",
        "Sweet Georgia Brown becomes available to AC1 when this lesson is done (contracts §2.6).",
      ],
    },
    {
      id: "U15.L06",
      author: "U15c",
      idea: "To find a secondary dominant by ear, listen for the note that does not belong, name it, and follow it. Fi goes to sol and the chord was the V7 of V; si goes to la, the V7 of vi; di goes to re, the V7 of ii; te falls to la, the V7 of IV. The bass confirms it by dropping a 5th into the chord that was aimed at.",
      hook: {
        hear: "A soul ballad of eight bars with nothing on the screen: Rhodes, upright bass and strings, the tune on the trumpet the learner met in U15.L05 (learner review: a lab with no new chord opens on a new sound, and the prose ties it to the standard the learner is taking down). Twice the harmony leans out of the key and comes straight back. The lesson is finding those two bars and saying what they are.",
        code: `${T(84)}${band(BALLAD, BALLAD_TUNE)}`,
      },
      key: C,
      meter: "4/4",
      bpm: 84,
      canDo: ["cd.hear.secondary-dominants"],
      uses: [...BASE],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "The hook, code and roll hidden (`panels` all off): eight bars to hear twice. The prompt asks the learner to raise a finger at each lean.",
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["bar-buttons"],
          minutes: 1.25,
          graded: true,
          what: "`fam.har.chromatic` at level 2, five trials from the generator: a four-bar loop with one secondary dominant (V/V, V/vi, V/ii or V/IV); which bar holds it? The lesson seeds the family.",
        },
        {
          kind: "ear",
          exercise: "all",
          parts: ["identify", "identify", "identify"],
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "Name it: three loops in three keys (G, F and B♭ major), each with one visitor. Which one? (choice: the V7 of V, fi to sol / of vi, si to la / of ii, di to re / of IV, te to la). Fixed items; the hints sing the outside note and its resolution.",
        },
        {
          kind: "dictate",
          exercise: "dictation",
          answer: ["degree-pad", "rn-palette"],
          minutes: 1.75,
          graded: true,
          features: ["dictation.stage-answers"],
          panels: ["chords"],
          what: 'The first four bars of the hook taken down in two passes (`stages: ["bass", "rn"]`): the bass on the degree pad (1 6 2 5), then the numerals on the palette with `secondary` allowed (`I V7/ii ii V7`). `harmony` matcher at level `rn`, `qualityDepth: "seventh"`.',
        },
        {
          kind: "sing",
          exercise: "sing",
          answer: ["mic"],
          minutes: 1,
          what: 'Sing the two outside notes of the hook home: di re, then te la (`mode: "degree"`, `degrees: ["#1", "2", "b7", "6"]`, `rhythm: "x x"`, `fallback: "identify"`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          features: ["make.from-sketch"],
          panels: ["chords"],
          what: "The learner's staircase of sevenths from U12.L04, with doors opened by ear.",
        },
      ],
      wrapAt: 3,
      make: {
        brief:
          "Your staircase from Seventh Chords (or Oak's copy: Cmaj7 Dm7 Em7 Fmaj7 and back down). It stays inside the key from start to finish. Put a V7 in front of two of its chords, by ear: try a visitor before each chord in turn, keep the two that sound most like an arrival, and delete the rest. Then let the tune take the notes they bring.",
        required: {
          rule: "contains-rn",
          label: "Two secondary dominants, each landing on its chord",
          why: '`contains-rn` with `rn: ["V/V", "V/vi", "V/ii", "V/IV"]`, `min: 2`, `mustResolve: true` (graded today; the rule of packages/grader `rubric.test.ts`): Oak\'s copy has none. When `contains-rn.kind` is built the author may write `kind: ["secondary-dominant"]`, which also takes V/iii.',
        },
        suggestions: [
          'the tune takes a borrowed note (`degree-set`, `anyOf: ["#4", "#5", "#1", "b7"]`)',
          "a leading-tone chord somewhere, landing on its chord (`contains-rn` with the vii° numerals, `mustResolve`)",
          'the bass on the root of each chord (`bass-line`, `roots: { on: "change", minRatio: 0.75 }`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band in the flavour's kit; the sounds are the learner's own from U12.L04 (Oak's copy: `rhodes` and `upright`).",
      },
      srs: [
        { family: "fam.har.chromatic", mode: "seed", level: 2 },
        { family: "fam.deg.fet-chromatic", mode: "review-if-due", level: 3 },
        { family: "fam.har.bass", mode: "review-if-due", level: 6 },
      ],
      singOn: "syllables",
      mistakes: [
        "name it: the right bar and the wrong target (V7 of ii for V7 of vi): `id.wrong`, with an override that names the syllable to listen for",
        "dictation: the bass under bar 2 heard as 4 or 1 instead of 6: `harmony.bass`; `VI7` or `vi7` for `V7/ii`: `harmony.rn-degree`; `V7/V` for `V7/ii`: `id.wrong`; `V/ii` without its 7th: `harmony.rn-case`; the three texts overridden",
        "Make: Oak's copy as it is, one visitor only, and two visitors of which one does not land: `rubric.unmet`",
      ],
      connects: {
        back: 'The ear of U15.L01 for fi, si, di and te is the tool; U15.L02–L05 are the chords it finds. The "bass first, then the numeral" of U06.L09 is the method of the dictation, now with a chord from outside the key in it.',
        forward:
          "U16 borrows chords from the minor on the same home note: me, le and ra get their chords. U16.L05 mixes both kinds in one ear lab. In the jazz track, J4 opens.",
      },
      epr: {
        enjoyment:
          "The learner's own staircase of sevenths from the Seventh Chords unit, now with two chords that lean into their targets, chosen by trying each door and keeping what sounded right: an old sketch that has grown up.",
        pace: "No new idea: a lab. One method (the outside note names the chord) applied three ways, locate, name, write down. The leading-tone chord is not in the ear steps (its bass is the giveaway and was the step of U15.L04); chains are not in them either.",
        return:
          "The Coda says: you can find a secondary dominant by ear and name the chord it points at. If the jazz track is open: J4 has opened. Next unit: chords borrowed from the minor, starting with the saddest chord in pop.",
      },
      notes: [
        "Evaluated: the hook plays C A7 Dm G7 C C7 F G7 over the bass C A D G C C F G; the tune plays E G E | C♯ E G | F D | D B | E G E | B♭ G E | A F | G F D. The two visitors are bars 2 and 6.",
        "`fam.har.chromatic` unlocks here; its level 1 is V/V alone and level 2 adds V/vi, V/ii and V/IV, all open at this lesson (packages/drills `cats`), so the lesson plays level 2. `fam.har.bass` level 6 (a bass under chromatic chords) opens here too.",
        "The staged dictation with an applied chord was run through the real grader for this spec: `I V7/ii ii V7` passes; the bass stage is 1 6 2 5.",
        "The Make opens with the U12.L04 sketch of the learner (`fromSketch: \"U12.L04\"`, AUTHORING §19.9): the Make of U12.L04 asks for the key's own sevenths and suggests `in-key`, so the saved sketch has no secondary dominant. Oak's copy, the complete starter every test grades, is `<C^7 Dm7 Em7 F^7 F^7 Em7 Dm7 C^7>` with a bass and a tune. A learner whose sketch already holds two visitors is told so by the Make and changes something to save a new one.",
        "Three graded steps and a sung step fit because the lesson has no investigate or modify step; part A is three steps, 4.2 scaled minutes, and ends when the learner has located and named by ear.",
        "Completing this lesson records the gate `J.forms` (wave6.md §5.3); the Coda mentions J4 only when `tracks.list` says the jazz track is open.",
      ],
    },
  ],
  capstones: [],
};
