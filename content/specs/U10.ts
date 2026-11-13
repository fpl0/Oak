// U10 Minor: the unit spec (rendered to content/specs/U10.md by `bun scripts/content/spec.ts`), with the U10.CP
// checkpoint and the C4 "Minor Indie Ballad" capstone. Every hook was evaluated with headless Strudel and
// linted in its lesson; every chord, numeral and schema named here was re-derived with `bun run theory`.
// U10.L01 is the exemplar, written and passing with the real grader (content/core/U10/L01).
import type { UnitSpec } from "./types.ts";

const T = (bpm: number) => `setcpm(${bpm}/4)\n\n`;
const C_MINOR = { tonic: "C", mode: "minor" } as const;
const C_MAJOR = { tonic: "C", mode: "major" } as const;
const A_MINOR = { tonic: "A", mode: "minor" } as const;

/** What every U10 lesson has from U03–U09 (the voicing gate is met; `arrange()` and `const` are open). */
const BASE = [
  "tb.setcpm",
  "tb.label",
  "tb.mini.seq",
  "tb.mini.rest",
  "tb.mini.sub",
  "tb.mini.alt",
  "tb.mini.replicate",
  "tb.mini.stack",
  "tb.gain",
  "tb.n",
  "tb.n.range",
  "tb.scale",
  "tb.scale.patterned",
  "scale.major",
  "scale.minor",
  "tb.s.pitched",
  "snd.piano",
  "snd.rhodes",
  "snd.ebass",
  "snd.fingerbass",
  "tb.lpf",
  "tb.room",
  "tb.add",
  "tb.feature.degree-labels",
  "tb.feature.rn",
] as const;
/** The tools behind the voicing gate (U05.L08) and the root bass (U08.L01). */
const VOICED = ["tb.chord", "tb.voicing", "chord.triad", "tb.rootNotes"] as const;
/** Note names with accidentals. */
const NAMES = ["tb.note", "tb.note.names", "tb.note.accidentals"] as const;

/** Triads stacked on `roots` (n values, one a bar), as in U06.L01. */
const stacks = (roots: string, key: string) =>
  `chords: n("[0,2,4]").add(n("${roots}")).scale("${key}").s("rhodes").room(.3)`;
/** A bass shape moved onto each root (U08.L02). */
const shape = (cell: string, roots: string, key: string) =>
  `bass: n("${cell}").add(n("${roots}")).scale("${key}").s("fingerbass").lpf(800)`;
const tune = (pattern: string, key: string) => `mel: n("${pattern}").scale("${key}").s("piano")`;

export const U10: UnitSpec = {
  unit: "U10",
  title: "Minor",
  summary:
    'Nine lessons on the minor key, the longest stretch on one topic so far, planned so that every lesson ends with a new thing that sounds good: a dark tune, a twin-key loop, a minor answer phrase, a soul groove on the key\'s major chords, the Aeolian loop, a loop that lands with the major V, the Andalusian descent, a line that climbs with melodic minor, and a minor spiritual arranged as a ballad. Natural minor is major\'s dark twin: the same home, degrees 3, 6 and 7 a half step lower (♭3 ♭6 ♭7), sung do re me fa sol le te (do-based minor), and in code one word, `.scale("C4:minor")`. Then the two twin keys (relative: the same notes, a new home; parallel: the same home, new notes), hearing minor degrees, the chords of a minor key (i ii° III iv v VI VII), the Aeolian loop i–VI–III–VII against vi–IV–I–V (the same four chords, two homes), harmonic minor and the major V, the Andalusian cadence, melodic minor, and two minor spirituals taken down and sung. The two strongest "this sounds like a record" moments are the U10.L05 Make (the learner\'s own Aeolian loop, arranged: Rhodes in a room, a driving eighth-note bass, a tune that comes home on A) and the U10.L09 Make (a minor spiritual arranged as a ballad with `strings` and `.delay()`, both unlocked there); C4 "Minor Indie Ballad" (two sessions after U10.CP) is built from exactly those two sounds plus the major V of U10.L06. Feels: indie (Rhodes or acoustic guitar with room, straight eighths) and soul (fingerbass, a groove on the key\'s major chords) in every Make; the jazz-soul flavour swaps `piano` for `rhodes` and `ebass` for `upright`. U10.L01 sits between U09.L05 and U09.CP in the default order (session 94); U10.L02–L09 follow C3 and GYM.06 (sessions 100–108), with GYM.07 between L05 and L06 and GYM.08 after L09; U10.CP follows U11.L01 (session 111) and opens C4.',
  conventions: [
    'Keys: U10.L01 is in C minor (the parallel twin of the C major the learner has used since U03, so "the same home" is literal); U10.L02 is in C major with steps in A minor and C minor (a starter may sit in the lesson\'s key while its step asks for another, check 13); U10.L03–L09, U10.CP and C4 are in A minor, the relative minor of C, so the key signature is empty and the only accidentals are the raised 6 and 7 of U10.L06–L08. A key is `{ tonic: "A", mode: "minor" }`; a step that uses the raised forms declares `"harmonic minor"` or `"melodic minor"` as its exercise key. The `.scale()` names are `"A3:minor"` (alias `"A3:aeolian"`, which passes as an equivalent answer), `"A3:harmonic:minor"`, `"A3:melodic:minor"`.',
    'Degrees are do-based and spelled against major on the same home (contracts §8.3, AUTHORING §18.3): 1 2 ♭3 4 5 ♭6 ♭7, sung do re me fa sol le te; the raised 6 and 7 are 6 and 7, la and ti. Never "la-based" minor, never A minor described as "C major starting on 6" once U10.L02 has named the relative key (say "the same notes, a new home"). In `n()` the numbers do not change with the mode: degree ♭3 is `n` 2 in minor as degree 3 is in major. A degree pad in a minor key offers `b3`, `b6`, `b7` (`minor.degree-pad`); a sung target writes `b3` (`minor.sung-degree`).',
    "Numerals in minor (U10.L04 on): i ii° III iv v VI VII in natural minor; V and vii° come from harmonic minor (U10.L06). In A minor: Am B° C Dm Em F G, and E, G♯° with the raised 7 (`bun run theory diatonic A:minor`, `A:harmonic:minor`). Numerals are graded by degree, quality and bass, never by string (`harmony.rn-case` for v against V). The Aeolian loop i–VI–III–VII is `schema.aeolian` (Am F C G), the Andalusian cadence i–VII–VI–V is `schema.andalusian` (Am G F E); `bun run theory progression C:major Am F C G` reads the same chords as vi–IV–I–V (`schema.axis-vi`): which one the learner hears depends on where the tune and the loop make home.",
    'The major V in code. Chord names are the simple way (`chord("<Am Dm E Am>").voicing()`: E is E G♯ B). A stack over `.scale("A2:harmonic:minor")` also gives V, but it turns III into an augmented chord (C E G♯) and VII into vii° (G♯ B D): so a loop that needs both VII and V (the Andalusian cadence) is written in chord names, never in harmonic-minor stacks, and U10.L06 shows the augmented III once as the reason. A melody may use harmonic minor over V and natural minor elsewhere with a patterned `.scale()` (`"<A3:minor!3 A3:harmonic:minor>"`), the idiom U10.L08 extends to melodic minor.',
    'Melodic minor in Strudel is one scale (`melodic:minor`: raised 6 and 7 both ways). U10.L08 teaches the classical rule "raised going up, natural coming down" as a patterned `.scale()` per bar (`"<A3:melodic:minor A3:minor>"`) or as note names; a descending line in melodic minor is not wrong, it is the jazz sound, and the lesson says so.',
    'Words that wait: "mode" and "modal" (U14.L01; say "minor", "the minor scale"), "Dorian", "Phrygian" (U14), "borrowed chord" (U16.L01: U10.L02 says "a chord from the parallel minor" only as plain words, and does not use one), "modulation" (U17.L01; U10.L02 says "move to the twin key"), "secondary dominant" (U15), "dominant seventh" (U11.L04: E7 may be played in C4 as a chord symbol, never named as a type), "swing", "blue note", "pentatonic" (U11), "syncopation" (U13). New terms in U10, one lesson each: natural minor (L01), relative minor and parallel minor (L02, a pair counted once), subtonic (L04), Aeolian (L05), harmonic minor (L06), Andalusian cadence (L07), melodic minor (L08). L03 and L09 introduce none.',
    'Harmony under a tune is a chord line in the learner\'s code whenever a rule reads it (the grader is not given the Band, AUTHORING §8 rule 5), so every U10 Make plays over `band.axis-4bar` with `tracks: ["drums"]`. There is no minor Band yet: author:CP is asked (apiNotes) for `band.aeolian-4bar` (4/4, A minor, i–VI–III–VII, all four flavours) for checkpoint and gym use; until it exists no lesson needs it.',
    "Grading (AUTHORING §18.3): the Makes use only implemented rules: `degree-set` (`contains`, judged in the declared minor key: L01, L03, L08), `ends-on-degree` (L02), `contains-rn` (L04, L06 with `mustResolve`), `progression` with `schema` (L05 `schema.aeolian`, L07 `schema.andalusian`) and `matches` (L09). A Make whose rule counts degrees or numerals does not invite another key. Code steps that write a minor line are `events` matches (`absolute` when the letters are the point, `octave-free` otherwise); chord steps are `pcset` per onset; numeral answers are `rn-palette` with the exercise's minor `key`.",
    "Staff and scaffolds (AUTHORING §6, U08–U10 row): degrees on the roll (they now read ♭3 ♭6 ♭7 in minor), lead sheet on the staff, numerals in the chord band. A minor key signature is its relative major's (A minor: none; D minor: B♭; E minor: F♯); the raised 6 and 7 appear as accidentals (G♯, F♯ in A minor), engraved by @oak/notation from the key (wave5.md §3.3). U10's Play from the page step is U10.L09 S5: a phrase of Go Down Moses on the staff only, written in code.",
    'Singing: syllables with numbers shown (contracts §8.3), do-based minor (me, le, te; la and ti for the raised 6 and 7), `labels: "syllables"`, `fallback: "identify"`; never graded, never gating. Quiet mode replaces each sing step with naming the degrees; U10.L09\'s sight-singing becomes naming the phrase\'s last three degrees from the lead sheet.',
    "Ear training (stage E, contracts §2.9, §7.3): `fam.key.mode` (major or minor) is seeded in U10.L01 at level 1; `fam.deg.fet-minor` (minor degrees after a minor cadence) in U10.L03 at level 1, its 6 and 7 categories opening at U10.L06; `fam.har.bass` level 5 (bass degree in minor) is played in U10.L04; `fam.har.schema` level 3 (Aeolian and Andalusian among the loops) in U10.L07; `fam.mel.dictation` level 7 and `fam.mel.sight` level 4 (both gated at U10.L01) are reviewed in U10.L09. `deck.key.signature`'s eight minor cards open at U10.L02.",
    'Feedback the grader emits on U10 steps (pin what `bun run content:check <id> --verbose` prints): `melody.wrong-degree` (a major letter where minor lowers it; override it with the lesson\'s image: "Bar {bar}: the tune plays {got}, the minor tune has {exp}. Minor lowers degrees 3, 6 and 7"), `melody.octave`, `code.unchanged`, `code.edit-outside`, `harmony.pcset` (a minor v where the step asks for the major V: E G B against E G♯ B), `harmony.rn-case` (v for V, iii for III), `harmony.rn`, `id.wrong`, `investigate.wrong`, `rubric.unmet` (override it with the neutral "{label}: not yet."; it serves every rule of the rubric).',
  ],
  lessons: [
    {
      id: "U10.L01",
      author: "spec-U10",
      idea: 'Natural minor is major\'s dark twin: the same home, the same numbers, with degrees 3, 6 and 7 a half step lower (♭3 ♭6 ♭7), sung do re me fa sol le te. In code it is one word: `.scale("C4:minor")` for `.scale("C4:major")`, and every line written in degrees turns dark at once; a line in note names needs its three flats by hand.',
      hook: {
        hear: "The four-chord loop of U05–U08 with its root bass and its tune on a Rhodes with a little room, over the Band's drums: four bars in C major, then the same four bars with one word changed in each line. The mood turns at bar 5, about 11 seconds in.",
        code: `${T(84)}chords: n("[0,2,4]").add(n("<0 4 5 3>")).scale("<C3:major!4 C3:minor!4>").s("rhodes").room(.3)\nbass: n("<0 4 5 3>").scale("<C2:major!4 C2:minor!4>").s("ebass").lpf(600)\nmel: n("<[4 ~ 2 4] [6 ~ 4 ~] [5 ~ 7 5] [5 ~ 3 ~]>").scale("<C4:major!4 C4:minor!4>").s("piano")`,
      },
      key: C_MINOR,
      meter: "4/4",
      bpm: 84,
      canDo: ["cd.write.minor-scale"],
      uses: [...BASE, ...NAMES],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "One item, eight bars over the drums: the loop, bass and tune in C major, then the same code in C minor.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "The scale word changes from `major` to `minor` at bar 5 and the numbers stay: what happens to the notes? (`choose`: home stays, a few notes drop a half step / every note drops / home moves)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: 'The two scales from C to C, `n("0 .. 7").scale("<C4:major C4:minor>")`, over a held C, with degree labels: which degrees are lower in bar 2 (choice: 3, 6 and 7); how many half steps lower is 3 (number: 1). Pass text names natural minor and its syllables.',
          term: "term.natural-minor",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'Darken it by hand: chords and bass in C minor, the U05 tune in note names with major\'s letters (G E G | B G | A C A | A F); flatten the three letters minor lowers (E♭, B♭, A♭; `events`, absolute, `tracks: ["mel"]`; edit-only-regions; target audible). Equivalent: the same notes spelled with sharps.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "From `fam.key.mode` level 1 (generator stimulus): major or minor? Six short tunes with chords, each in a new key.",
        },
        {
          kind: "sing",
          exercise: "sing",
          minutes: 1.5,
          what: 'Sing do re me fa sol le sol over a held C, in your own range (`mode: "degree"`, `labels: "syllables"`, target `1 2 b3 4 5 b6 5`, `fallback: "identify"`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "A dark tune over the minor loop.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The loop is dark now: chords and bass in C minor over the drums. The tune only says home. Write a tune that sings me and le, degrees ♭3 and ♭6, and make it one you would loop.",
        required: {
          rule: "degree-set",
          label: "The tune sings ♭3 and ♭6",
          why: '`degree-set` with `contains: ["b3", "b6"]` on `@melody`, judged in C minor: me and le are the two notes that make a tune sound minor (♭7 also sits in natural minor, but a tune can be minor without it). The starter (C on beats 1 and 3) fails; the hook\'s tune in minor passes; a tune of 1 and 5 only fails.',
        },
        suggestions: [
          "the tune ends on 1 (`ends-on-degree`)",
          "the tune spans an octave or less (`range`, `maxSpan: 12`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band in the flavour's kit; the chords are already on a Rhodes; jazz-soul swaps `piano` for `rhodes` and `ebass` for `upright` in the starter.",
      },
      srs: [
        { family: "fam.key.mode", mode: "seed", level: 1 },
        { family: "fam.key.scale-spell", mode: "review-if-due", level: 3 },
      ],
      singOn: "syllables",
      mistakes: [
        'modify: only the 3rd lowered (E♭ and nothing else): `melody.wrong-degree` per note, overridden to say "Minor lowers degrees 3, 6 and 7 of C: E, A and B"',
        "modify: the flat written an octave up (`eb5`): `melody.octave`",
        "modify: the chords put back in major: `code.edit-outside`; the unchanged starter: `code.unchanged`",
        "modify: every note flattened, G and C included: `melody.wrong-degree`",
        'Make: the starter, and a tune on 1 and 5 only: `rubric.unmet` with "The tune sings ♭3 and ♭6: not yet."',
      ],
      connects: {
        back: "U03's major scale and its degrees, U03.L05's patterned `.scale()`, U03.L06–L07's flats, U08.L01's root bass. The loop is the one the learner has played since U05.L01.",
        forward:
          "U09.CP and C3 come next in the default order; then U10.L02 names the two twin keys: the same home (parallel) and the same notes (relative).",
      },
      epr: {
        enjoyment:
          "The loop the learner has known for weeks turns dark with one word, and their Make is a slow minor tune over it, Rhodes in a room and drums underneath: the opening of a sad song they wrote.",
        pace: "One idea: three degrees lower, the same home. Names for the twin keys wait for U10.L02, minor chords by numeral for U10.L04, the raised 7 for U10.L06; the chords here change only because their stacks follow the scale word.",
        return:
          "The Coda says: you can turn any tune minor and sing do re me fa sol le te; major or minor is in tomorrow's warm-up. Next: the bass and form checkpoint and C3, your verse–chorus demo; then the two twin keys.",
      },
      notes: [
        "The exemplar: content/core/U10/L01 passes every content-CI check with the real grader (7 steps, 2 graded, 8.75 expert minutes, 12.25 scaled; part A 4.55, part B 7.70). Evaluated: the hook plays C E G | G B D | A C E | F A C under G E G | B G | A C A | A F, then C E♭ G | G B♭ D | A♭ C E♭ | F A♭ C under G E♭ G | B♭ G | A♭ C A♭ | A♭ F: the tune is on chord notes in both keys.",
        'The S1 listen item and the S2/S3 code use a patterned `.scale("<C3:major!4 C3:minor!4>")`, so check 13 (one declared key per exercise) reads them as one piece; the S4 tune is in note names, so its starter has no `.scale()` to disagree with the C minor key.',
        "U10.L01 comes before U09.CP and C3 (session 94): a learner may use minor in C3 if they like, and the C3 rubric does not care (contracts §6.6 C3 has no key rule).",
      ],
    },
    {
      id: "U10.L02",
      author: "U10a",
      idea: "A major key has two minor twins. The relative minor uses the same seven notes with a new home, on degree 6 (C major and A minor, no sharps or flats in either); the parallel minor keeps the same home and lowers 3, 6 and 7 (C major and C minor, three flats). In code the relative twin changes the tonic and the word (`A3:minor`), the parallel twin only the word (`C4:minor`).",
      hook: {
        hear: "A two-chord groove and its tune over the drums, played in three keys two bars each: C major (C, F), A minor (Am, Dm: the same white keys, a new home), C minor (Cm, Fm: the same home, darker notes).",
        code: `${T(88)}chords: n("[0,2,4]").add(n("<0 3>")).scale("<C3:major!2 A2:minor!2 C3:minor!2>").s("rhodes").room(.3)\nbass: n("<0 3>").scale("<C2:major!2 A1:minor!2 C2:minor!2>").s("ebass").lpf(600)\nmel: n("<[4 2 0 2] [3 ~ 2 ~]>").scale("<C4:major!2 A3:minor!2 C4:minor!2>").s("piano")`,
      },
      key: C_MAJOR,
      meter: "4/4",
      bpm: 88,
      canDo: ["cd.read.relative-keys"],
      uses: [...BASE, ...NAMES, "tb.feature.keysig", "tb.feature.circle"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "The hook as one item: the same groove in C major, A minor and C minor, two bars each, with the keyboard lit.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: '`.scale("A3:minor")`: how many black keys does it play? (`choose`: none / one / three)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["key"],
          what: "The three scales one bar each, with the key-signature panel open: which minor key uses exactly C major's notes (choice: A minor); how many flats does C minor add (number: 3). Pass text names both twins.",
          term: ["term.relative-minor", "term.parallel-minor"],
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'The parallel twin: a C major groove in degrees (chords, bass, tune); put all three lines in C minor (`events`, absolute, `tracks: ["mel", "bass"]`; exercise key C minor; the starter sits in the lesson\'s C major). Equivalent: `C4:aeolian`. The realistic mistake is the relative key (`A3:minor`).',
        },
        {
          kind: "quiz",
          exercise: "fact",
          answer: ["choice"],
          minutes: 0.75,
          graded: true,
          what: "Two facts from the circle panel: the relative minor of F major (D minor) and of G major (E minor). One `choice` with four keys each; the circle panel shows the inner ring after the answer.",
        },
        {
          kind: "notate",
          exercise: "staff-write",
          answer: ["staff-input"],
          minutes: 1,
          graded: true,
          wave3: ["key-signature"],
          what: "Write D minor's key signature on the staff (one flat, B♭: the same as F major, its relative). `keysig` answer, order as written.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "The relative twin: the same loop, home on A.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "A C major loop over the drums: chords, bass and a tune that ends on C. Move it to its relative minor, A minor, so the same notes find a new home and the tune ends there. Then, if you like, let it go back and forth: four bars in each key.",
        required: {
          rule: "ends-on-degree",
          label: "The tune ends on 1 in A minor",
          why: '`ends-on-degree` with `degrees: ["1"]` on `@melody`, exercise key A minor. The starter (in C major, ending on C, which is ♭3 in A minor) fails; the three `.scale()` calls moved to `A…:minor` pass (the same `n` numbers, home on A); a patterned `.scale("<C4:major!4 A3:minor!4>")` ending in A minor passes. A tune moved to C minor (the wrong twin) ends on C and fails.',
        },
        suggestions: [
          'the tune uses ♭3 (`degree-set`, `contains: ["b3"]`)',
          "a bass on the roots (`matches` + `harmony` level `bass`, as U08.L01)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band; jazz-soul swaps `piano` for `rhodes` and `ebass` for `upright` in the starter.",
      },
      srs: [
        { deck: "deck.key.signature", cards: ["fact.keysig.D-minor", "fact.keysig.E-minor"], mode: "seed" },
        { family: "fam.key.circle", mode: "review-if-due", level: 2 },
      ],
      mistakes: [
        'modify: the relative key instead of the parallel (`A3:minor`): `melody.wrong-degree`, overridden: "Keep home on C: this twin shares its home"',
        "modify: only the tune moved, the bass left in major: `melody.wrong-degree` on the bass track",
        "modify: the unchanged starter: `code.unchanged`; the octave changed with the key (`C3:minor` on the tune): `melody.octave`",
        "notate: B♭ and E♭ (C minor's first two flats): `keysig.count`; F♯ (E minor's sharp): `keysig.type`",
        "Make: moved to C minor: `rubric.unmet` (ends on 1 of C, ♭3 of A)",
      ],
      connects: {
        back: "U10.L01's dark twin (that was the parallel minor, unnamed); U03.L06–L07's key signatures and the circle of fifths.",
        forward:
          "U10.L03 trains the ear on minor degrees, now that the learner can find any minor key's home and signature.",
      },
      epr: {
        enjoyment:
          "One groove travels through three keys in a few bars, and the learner's Make is a loop that turns from C major into A minor and back, the bittersweet move of many pop choruses.",
        pace: "One idea: two twins, one with the same notes and one with the same home. No new chords (the stacks follow the scale), no new scale forms; key signatures reuse U03's flats and sharps.",
        return:
          "The Coda says: you can find the relative and the parallel minor of any major key and write their signatures; the minor signatures join your key-signature cards. Next: hearing minor degrees.",
      },
      notes: [
        "Evaluated: the hook plays C F | Am Dm | Cm Fm (C E G, F A C, A C E, D F A, C E♭ G, F A♭ C) under G E C E | F E, E C A C | D C, G E♭ C E♭ | F E♭: the tune keeps its numbers in every key.",
        "Lesson key C major (the Make's starter and the modify's starter sit in it); the modify's exercise key is C minor, the Make's A minor (check 13). `deck.key.signature`'s eight minor cards open here (gate U10.L02); the spec seeds two by name, the engine the rest.",
      ],
    },
    {
      id: "U10.L03",
      author: "U10a",
      idea: "Minor degrees have their own sound against home: me sits close above re and colours the whole key, le leans down onto sol, te is a whole step below do and does not pull up the way ti does. Hearing them after a minor cadence is how a minor tune is taken down by ear.",
      hook: {
        hear: "A soul groove in A minor over the drums: Am Dm F Em on a Rhodes, a fingerbass bouncing root–root–octave, and a tune that starts on me and lands on sol.",
        code: `${T(92)}${stacks("<0 3 5 4>", "A2:minor")}\n${shape("[0 ~ 0 7]", "<0 3 5 4>", "A1:minor")}\n${tune("<[2 ~ 1 0] [5 ~ 3 ~] [7 ~ 5 4] [4 ~ ~ ~]>", "A3:minor")}`,
      },
      key: A_MINOR,
      meter: "4/4",
      bpm: 92,
      canDo: ["cd.hear.minor"],
      uses: [...BASE],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "The hook over the drums, then its tune alone after a minor cadence, with degree labels.",
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["degree-pad"],
          minutes: 1.25,
          graded: true,
          what: "From `fam.deg.fet-minor` level 1 (generator stimulus): after a minor cadence, one note: 1, ♭3 or 5? The pad offers `b3`, never `3` (`minor.degree-pad`).",
        },
        {
          kind: "compare",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1,
          graded: true,
          what: "Two audio cards: the hook's tune with me (C) and with mi (C♯) in bar 1, over the same Am. Which one is the minor tune? (fixed code stimuli; replays unlimited)",
        },
        {
          kind: "sing",
          exercise: "sing",
          minutes: 1.5,
          what: 'Resolve the leaning notes: after a minor cadence, sing le falling to sol, then te rising to do (`mode: "degree"`, targets `b6 5` and `b7 1`, `labels: "syllables"`, `fallback: "identify"`). Te rises a whole step to do: its pull is weaker than ti\'s.',
        },
        {
          kind: "dictate",
          exercise: "dictation",
          answer: ["code"],
          minutes: 1.75,
          graded: true,
          wave3: ["by-ear"],
          what: 'By ear over the given chords: a two-bar minor phrase (me re do | le sol, the hook\'s first two bars reshaped); write the `mel:` line in degrees over `.scale("A3:minor")` (`byEar`: A/B at the bar, rates 1, 0.75, 0.5; `accepts: "any-octave"`; `melody` matcher, `octave-free`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "A minor answer phrase with all three dark degrees.",
        },
      ],
      wrapAt: 3,
      make: {
        brief:
          "The soul groove in A minor over the drums, with a tune of only 1 and 5. Rewrite the tune so it sings me, le and te: ♭3, ♭6 and ♭7. Lean le onto sol somewhere and let the last note land where it sounds finished to you.",
        required: {
          rule: "degree-set",
          label: "The tune sings ♭3, ♭6 and ♭7",
          why: '`degree-set` with `contains: ["b3", "b6", "b7"]` on `@melody`, key A minor. The starter (1 and 5) fails; the hook\'s tune extended with a G (te) passes; a tune that sings ♭3 and ♭6 but no G fails.',
        },
        suggestions: [
          "the tune ends on 1 (`ends-on-degree`)",
          "chord tones on beats 1 and 3 (`chord-tones-strong`, `minRatio: 0.6`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: "Drums from the Band; funk keeps `fingerbass`; jazz-soul swaps `piano` for `rhodes`.",
      },
      srs: [
        { family: "fam.deg.fet-minor", mode: "seed", level: 1 },
        { family: "fam.deg.resolve", mode: "review-if-due", level: 4 },
      ],
      singOn: "syllables",
      mistakes: [
        'ear: ♭3 heard as 5 (both stable, both in the minor triad): `id.wrong`; the hint says "Sing up from do: re, then me. Is it that close?"',
        'compare: the major-3rd card chosen because it sounds "brighter and so more finished": `id.wrong`',
        "dictation: ♭3 written as `n` 3 (degree 4, the off-by-one): `melody.wrong-degree`; the right notes a bar late: `melody.first-difference`",
        "Make starter and a tune with no ♭7: `rubric.unmet`",
      ],
      connects: {
        back: "U10.L01's me le te sung on the scale; U03.L04's leaning notes and resolution, now with minor's own pulls; U07's dictation in major.",
        forward: "U10.L04 builds chords on every degree just heard: three of them are major.",
      },
      epr: {
        enjoyment:
          "A warm soul groove in A minor plays under every step, and the learner's Make is their own minor phrase over it, leaning on le and te, the sound of a slow jam.",
        pace: "One idea: hearing minor degrees against home. No new code (the scale word is L01's); the raised 6 and 7 wait for U10.L06 and L08, and the dictation is two bars only.",
        return:
          "The Coda says: you can tell major from minor and hear me, le and te; minor degrees join tomorrow's warm-up. Next: the chords of a minor key.",
      },
      notes: [
        "Evaluated: the hook's chords are Am Dm F Em (A C E, D F A, F A C, E G B); the bass plays A A A' | D D D' | F F F' | E E E'; the tune C B A | F D | A F E | E, every beat 1 and 3 a chord note (B on beat 2 and E on beat 4 of bar 3 pass).",
        "`fam.deg.fet-minor` unlocks here (contracts §7.3): its level 1 is 1, ♭3, 5 after a minor cadence; the 6 and 7 categories open at U10.L06. `fam.deg.resolve` level 4 (gate U10.L03) adds the minor resolutions to the warm-up.",
        "The compare step's major card writes C♯ as a note name over the same stacks (`note(\"c#4\")` in a `mel:` line of note names); the minor card is the hook's bar 1 in note names.",
      ],
    },
    {
      id: "U10.L04",
      author: "U10b",
      idea: "Stack a triad on every degree of a minor key and the qualities shift: i, iv and v are minor, III, VI and VII are major, ii° is diminished. The major chord on ♭7, VII, a whole step below home, is the subtonic, and the key's three major chords are where minor songs get their lift.",
      hook: {
        hear: "Over the drums, a soul groove i–iv–VII–III (Am Dm G C): Rhodes, a fingerbass on root and 5th, a tune on chord notes. Bars 3–4 brighten on the major chords.",
        code: `${T(90)}${stacks("<0 3 6 2>", "A2:minor")}\n${shape("[0 ~ 0 4]", "<0 3 6 2>", "A1:minor")}\n${tune("<[4 ~ 2 0] [5 ~ 3 ~] [6 ~ 4 1] [4 ~ 2 ~]>", "A3:minor")}`,
      },
      key: A_MINOR,
      meter: "4/4",
      bpm: 90,
      canDo: ["cd.read.minor-roman"],
      uses: [...BASE, ...VOICED],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: 'Two items: the seven triads of A minor up the scale (`n("<[0 1 2 3] [4 5 6 7]>").add(n("[0,2,4]"))`: roots first, so each beat is one chord; one a beat for two bars), then the hook.',
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "The triad on ♭3 (C E G): major, minor or diminished? (`choose`)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: "The seven triads with the chord band's numerals: which numerals are major (choice: III, VI, VII); how many minor chords does the key have (number: 3: i, iv, v). Pass text names the subtonic.",
          term: "term.subtonic",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'A loop i–iv–v–i (`.add(n("<0 3 4 0>"))`): make bars 3–4 VII–III (`<0 3 6 2>`; `pcset` per onset, `tracks: ["chords"]`; edit-only-regions). Equivalent: `<0 3 -1 2>` (VII from below). The off-by-one (`<0 3 7 3>`, degrees for `n`) is the mistake to pin.',
        },
        {
          kind: "quiz",
          exercise: "fact",
          answer: ["rn-palette"],
          minutes: 1,
          graded: true,
          what: 'Name a four-bar loop in A minor in numerals, from the chord band\'s symbols (Am F G Am → i VI VII i; `rn-palette`, `slots: 4`, `allow: ["triads"]`, key A minor).',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["degree-pad"],
          minutes: 1.25,
          graded: true,
          what: "From `fam.har.bass` level 5 (generator stimulus; gate U10.L04): the bass degree under each chord of a minor loop, four in a row (the pad offers `b3`, `b6`, `b7`).",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "A minor-key loop that lifts on the key's major chords.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "A loop in A minor over the drums, i–iv–v–i, all minor chords. Rewrite it with at least two of the key's major chords, III, VI or VII, put a bass under it, and choose where the lift comes.",
        required: {
          rule: "contains-rn",
          label: "Two bars or more on III, VI or VII",
          why: '`contains-rn` with `rn: ["III", "VI", "VII"]`, `min: 2`, key A minor (numerals graded by degree and quality: `iii` or a C minor chord does not count). The starter i–iv–v–i fails; the hook\'s i–iv–VII–III passes; i–VI–VII–i passes.',
        },
        suggestions: [
          "a bass on the roots (`matches` + `harmony` level `bass`)",
          "a tune with chord tones on beats 1 and 3 (`chord-tones-strong`, `minRatio: 0.6`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band; jazz-soul swaps the stacks' `rhodes` sound for itself and `fingerbass` for `upright`; chords by name are triads here: seventh symbols unlock at U11.L04 (G7) and U12.L01 (Am7, Dm7, Cmaj7).",
      },
      srs: [
        { family: "fam.har.bass", mode: "review-if-due", level: 5 },
        { family: "fam.har.rn", mode: "review-if-due", level: 3 },
      ],
      mistakes: [
        'modify: the numerals read as degrees (`<0 3 7 3>`): `harmony.pcset` per bar ("Bar 3: your chord has A C E; the target has G B D")',
        "modify: v changed to V by hand (E G♯ B as a note list): `harmony.pcset` (this lesson stays in natural minor)",
        "quiz: VII written as vii (lowercase): `harmony.rn-case`; VI as IV (counting from C): `harmony.rn`",
        'Make starter: `rubric.unmet` with "Two bars or more on III, VI or VII: not yet."',
      ],
      connects: {
        back: "U06.L01's triads on every degree of a major key and U06.L02's numerals; U08.L02's root–5th bass shape.",
        forward: "U10.L05 puts four of these chords in the most-used order in minor, the Aeolian loop.",
      },
      epr: {
        enjoyment:
          "A soul groove that brightens on its major chords plays from the first second, and the learner's Make is a minor loop of their own with a fingerbass under it that they can jam over for minutes.",
        pace: "One idea: the qualities of the seven chords of a minor key, and the subtonic. The major V of harmonic minor waits for U10.L06; schemas for U10.L05.",
        return:
          "The Coda says: you can name the chords of a minor key in numerals; minor bass lines join the warm-up. Next: the Aeolian loop, the minor four-chord song.",
      },
      notes: [
        "Evaluated: the hook's chords are Am Dm G C (A C E, D F A, G B D, C E G), the bass A A E | D D A | G G D | C C G (root, root, 5th: a perfect 5th above every root), the tune E C A | F D | G E B | E C.",
        "`theory diatonic A:minor` gives i ii° III iv v VI VII = Am B° C Dm Em F G. `fam.har.rn` level 3 and `fam.har.function` level 3 (both gated here) add minor keys to the warm-up; `fam.har.bass` level 5 is the bass degree in minor.",
      ],
    },
    {
      id: "U10.L05",
      author: "U10b",
      idea: "The Aeolian loop i–VI–III–VII (Am F C G) is minor's four-chord song. Its chords are the same as vi–IV–I–V in C major: whether it sounds minor or major depends on where the loop starts and where the tune comes home. Start on Am and land the tune on A, and A is home.",
      hook: {
        hear: "Over the drums: Am F C G on a Rhodes with room, a fingerbass driving eighths with an octave pop at the end of each bar, and a tune that falls from A and lands back on it. The unit's first record-sounding loop, inside 10 seconds.",
        code: `${T(96)}chords: chord("<Am F C G>").voicing().s("rhodes").room(.4)\nbass: n("[0 0 0 0 0 0 0 7]").add(n("<0 5 2 6>")).scale("A1:minor").s("fingerbass").lpf(900)\n${tune("<[7 ~ 6 4] [5 ~ 7 ~] [2 ~ 4 6] [8 ~ 6 ~]>", "A3:minor")}`,
      },
      key: A_MINOR,
      meter: "4/4",
      bpm: 96,
      canDo: ["cd.compose.aeolian"],
      uses: [...BASE, ...VOICED],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items over the drums, the same four chords: the hook (tune home on A), then Am F C G with a tune that keeps landing on C (it sounds like vi–IV–I–V in C).",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "Same chords, two tunes: in which one does the loop feel like it is in minor? (`choose`: the tune that lands on A / the tune that lands on C / both the same)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: "The hook with the chord band in A minor: its numerals (choice: i–VI–III–VII); the bar where the loop's major chord on home's ♭3 sits (number: 3). Pass text names the Aeolian loop.",
          term: "term.aeolian",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'Chords in degrees, `n("[0,2,4]").add(n("<0 ⟪3 4 0⟫>")).scale("A2:minor")` (i iv v i): make it the Aeolian loop (`<0 5 2 6>`; `pcset` per onset; edit-only-regions). Equivalent: `<0 -2 2 -1>` (VI and VII from below).',
        },
        {
          kind: "compare",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "Four pairs of loops of the same four chords with different tunes and bass starts: which of the two is home on A (Aeolian), which on C (vi–IV–I–V)? Fixed code stimuli; the chord band stays closed.",
        },
        {
          kind: "sing",
          exercise: "sing",
          minutes: 1.5,
          what: 'Sing the loop\'s roots in your own range: do le me te (A F C G; `mode: "degree"`, targets `1 b6 b3 b7`, `labels: "syllables"`, `fallback: "identify"`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Your Aeolian loop, arranged.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "Over the drums, a minor groove that only rocks between Am and Dm. Make it the Aeolian loop, i–VI–III–VII, one chord a bar, and arrange it: a bass that drives, a sound and a room for the chords, a tune that comes home on A.",
        required: {
          rule: "progression",
          label: "The loop is i–VI–III–VII",
          why: '`progression` with `schema: "schema.aeolian"`, key A minor (triad core, so Am7 Fmaj7 Cmaj7 G7 pass). The starter (i–iv–i–iv) fails; the hook passes; the loop started on VI (F C G Am) passes only if rotation is allowed: it is not (`allowRotation: false`), because starting on home is the point of the lesson.',
        },
        suggestions: [
          "the tune ends on 1 (`ends-on-degree`)",
          "a bass on the roots (`matches` + `harmony` level `bass`)",
          "three parts or more (`tracks`, `min: 3`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band in the flavour's kit (indie puts the snare on 3: a half-time ballad feel); jazz-soul swaps `fingerbass` for `upright`; sevenths by name pass on the triad core.",
      },
      srs: [
        { family: "fam.har.progression", mode: "review-if-due", level: 4 },
        { family: "fam.key.mode", mode: "review-if-due", level: 1 },
      ],
      singOn: "syllables",
      mistakes: [
        "modify: the loop written from C's numbers (`<5 3 0 4>`, vi IV I V counted in C) over `A2:minor`: `harmony.pcset` per bar (the stacks land on F, D, A, E)",
        "modify: the right chords in the axis order (`<0 2 6 5>`): `harmony.pcset` on bars 2 and 4",
        "compare: a tune on C heard as minor because the loop starts on Am: `id.wrong`; the hint asks where the tune comes to rest",
        "Make: F C G Am (a rotation): `rubric.unmet`; the starter: `rubric.unmet`",
      ],
      connects: {
        back: "U06.L06–L07's schemas, the axis loop and vi–IV–I–V; U10.L02's relative keys (the same chords, a new home); U08's driving bass.",
        forward: "U10.L06 gives minor the pull home that the Aeolian loop does not have: the major V.",
      },
      epr: {
        enjoyment:
          "The first of the unit's two record moments: the learner's own Aeolian loop with a driving fingerbass, Rhodes in a room and a tune that comes home on A, the sound of a generation of indie and pop records.",
        pace: "One idea: i–VI–III–VII and where its home is. No new chords or scales (L04's chords, L01's scale); the major V and the cadence wait for U10.L06.",
        return:
          "The Coda says: you can write the Aeolian loop and tell it from vi–IV–I–V by where it comes home. Next, after a gym session: raise the 7th for a major V.",
      },
      notes: [
        "Evaluated: `chord(\"<Am F C G>\").voicing()` plays A C E A C | F C F A C | E C E G C | G D G B; the bass A ×7 then A' | F ×7 then F' | C ×7 then C' | G ×7 then G'; the tune A G E | F A | C E G | B G: chord notes on every beat 1 and 3. `theory progression A:minor Am F C G` → i VI III VII, `schema.aeolian`; in C major the same chords read vi IV I V (`schema.axis-vi`).",
        "GYM.07 follows this lesson in the default order (session 104); the dev seed `after U10.L05` lands on it with the Aeolian loop in Studio and the degree lens in minor (wave5.md §6, §7).",
      ],
    },
    {
      id: "U10.L06",
      author: "U10c",
      idea: "In natural minor, v (Em) leaves home without a pull: its 3rd, G, is a whole step below A. Raise degree 7 a half step (G♯) and v becomes a major V whose 3rd is a leading tone, a half step below home: V–i lands the way V–I does in major. The scale with the raised 7 is harmonic minor.",
      hook: {
        hear: "A minor ballad loop i–iv–v–i (Am Dm Em Am) on a Rhodes, then the same four bars with E major in bar 3: the tune climbs E to G♯ to A and the loop lands. Both within 23 seconds.",
        code: `${T(84)}chords: chord("<Am Dm Em Am Am Dm E Am>").voicing().s("rhodes").room(.3)\nbass: chord("<Am Dm Em Am Am Dm E Am>").rootNotes(2).s("fingerbass").lpf(800)\nmel: n("<[4 ~ 2 0] [3 ~ 5 3] [4 ~ 1 ~] [0 ~ ~ ~] [4 ~ 2 0] [3 ~ 5 3] [4 ~ 6 ~] [7 ~ ~ ~]>").scale("A3:harmonic:minor").s("piano")`,
      },
      key: A_MINOR,
      meter: "4/4",
      bpm: 84,
      canDo: ["cd.compose.harmonic-minor"],
      uses: [...BASE, ...VOICED, "scale.harmonic-minor"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items: i–iv–v–i, then i–iv–V–i with the tune's leading tone. Which one lands?",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "Em becomes E: which note changes? (`choose`: G to G♯ / E to E♭ / B to C)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: 'The two scales from A to A, `.scale("<A3:minor A3:harmonic:minor>")`, with degree labels: which degree moved (choice: 7, up); how many half steps from G♯ to A (number: 1). Pass text names harmonic minor; the step also plays `n("[0,2,4]").add(2).scale("A2:harmonic:minor")` once: C E G♯, the reason the lesson\'s chords are written by name.',
          term: "term.harmonic-minor",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'Raise it: `chord("<Am Dm ⟪Em⟫ Am>").voicing()` → `E` (`harmony` matcher at level `rn`, `qualityDepth: "triad"`, key A minor; edit-only-regions). Equivalent: E struck twice in the bar (`[E E]`); `E7` is locked until U11.L04. The realistic mistake: `G#o` (the chord on the raised note), `harmony.rn`.',
        },
        {
          kind: "compare",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "Four short cadences in minor keys, fixed code stimuli: v–i or V–i? (`choice`; the hint: listen for the note just below home in the chord before the last)",
        },
        {
          kind: "sing",
          exercise: "sing",
          minutes: 1.5,
          what: 'Over i–iv–V–i, sing sol ti do on the last two chords (`mode: "degree"`, targets `5 7 1` in A harmonic minor, `octaves` so ti sits below do, `labels: "syllables"`, `fallback: "identify"`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "A minor loop that lands with the major V.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The Aeolian loop, Am F C G, circles: G steps up to home without a pull. Give it a landing, a major V that goes home to i: E in place of G, or four more bars that end E Am. Then shape the tune around that landing. (Learner review: the Make starts from U10.L05's loop instead of repeating the modify step's Em, and the learner chooses where the V goes, the verse-and-chorus shape of C4.)",
        required: {
          rule: "contains-rn",
          label: "A major V that goes home to i",
          why: '`contains-rn` with `rn: ["V"]`, `min: 1`, `mustResolve: true`, key A minor: the C4 rule, met once. The starter (Am F C G, no V) fails, and so does Am F C Em; Am F C E passes (the loop wraps home) and so does Am F C G Am F E Am; E written but followed by F fails ("one doesn\'t resolve").',
        },
        suggestions: [
          'the tune climbs through ti to do (`degree-set`, `contains: ["7"]`)',
          "the tune ends on 1 (`ends-on-degree`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band; seventh symbols wait for U11.L04 and U12.L01, so jazz-soul plays the triads on `rhodes`; funk keeps `fingerbass`.",
      },
      srs: [
        { family: "fam.har.rn", mode: "review-if-due", level: 3 },
        { family: "fam.deg.fet-minor", mode: "review-if-due", level: 1 },
      ],
      singOn: "syllables",
      mistakes: [
        "modify: `Em7` for `E` (still minor, v): `harmony.rn-case`; `Am` changed to `A`: `code.edit-outside`",
        "modify: the unchanged starter: `code.unchanged`",
        "compare: V–i heard as v–i when the tune avoids G♯: `id.wrong` (the stimuli keep G♯ in an inner voice; the hint says so)",
        'Make: E followed by Dm (V not resolving): `rubric.unmet` with the detail "one doesn\'t resolve"',
      ],
      connects: {
        back: "U03.L04's leading tone (ti to do) and U06.L04's authentic cadence, now in minor; U10.L04's v.",
        forward: "U10.L07 walks down to that major V from home: the Andalusian cadence.",
      },
      epr: {
        enjoyment:
          "The learner's loop finally lands: E major to A minor with the tune climbing through G♯, the cadence of every dramatic minor ballad, in a loop they can replay and feel arrive each time.",
        pace: "One idea: raise 7 for a major V. Melodic minor (raised 6 as well) waits for U10.L08; the Andalusian descent for U10.L07; chords stay by name to avoid harmonic minor's augmented III.",
        return:
          "The Coda says: you can raise the 7th to give a minor key a major V; harmonic-minor V joins your numeral reviews. Next: the Andalusian cadence.",
      },
      notes: [
        "Evaluated: bar 3 voices E G B and bar 7 E G♯ B; the tune plays E C A | D F D | E B | A, then E C A | D F D | E G♯ | A (the leading tone into home). `theory diatonic A:harmonic:minor` gives V = E and III+ = C+ (Caug), vii° = G♯°: the reason for chord names.",
        "`scale.harmonic-minor` unlocks here; `fam.deg.fet-minor` opens its 6 and 7 categories and `fam.har.rn` its harmonic-minor V (contracts §7.3).",
      ],
    },
    {
      id: "U10.L07",
      author: "U10c",
      idea: "The Andalusian cadence walks down from home: i–VII–VI–V (Am G F E), the bass stepping A G F E and the last chord the major V. It mixes both minors: G natural for VII, G♯ in the V, so it is written in chord names.",
      hook: {
        hear: "Over the drums: Am G F E on a steel-string acoustic guitar, a fingerbass stepping down root and 5th, and a tune that falls with it and hangs on B over the E chord, ready to start again.",
        code: `${T(100)}chords: chord("<Am G F E>").voicing().s("acgtr")\nbass: note("<[a1 ~ a1 e2] [g1 ~ g1 d2] [f1 ~ f1 c2] [e1 ~ e1 b1]>").s("fingerbass").lpf(800)\n${tune("<[7 ~ 6 7] [6 ~ 8 6] [5 ~ 2 0] [1 ~ ~ ~]>", "A3:minor")}`,
      },
      key: A_MINOR,
      meter: "4/4",
      bpm: 100,
      canDo: ["cd.hear.andalusian"],
      uses: [...BASE, ...VOICED, ...NAMES, "snd.acgtr", "scale.harmonic-minor"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "The hook over the drums, twice round; then the bass alone, A G F E.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "The bass is A G F E: does it step down, step up, or leap? And what comes after E? (`choose`: back to A / on down to D / stays on E)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          panels: ["chords"],
          what: "The hook with the chord band: the numerals (choice: i–VII–VI–V); which bar holds the only G♯ (number: 4). Pass text names the Andalusian cadence.",
          term: "term.andalusian-cadence",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'The descent ends on Em: `chord("<Am ⟪G F Em⟫>")` → `G F E` (`harmony` matcher at level `rn`, `qualityDepth: "triad"`, key A minor; edit-only-regions). Equivalent: `G F [E E]` (`E7` is locked until U11.L04). The realistic mistake: `G#o` for `G` in bar 2 as well ("raise every G"): `harmony.rn` on bar 2.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "From `fam.har.schema` level 3 (generator stimulus; gate U10.L07): which loop? The axis, the Aeolian loop or the Andalusian cadence among the earlier schemas.",
        },
        {
          kind: "sing",
          exercise: "sing",
          minutes: 1.5,
          what: 'Sing the bass line down in your own range: do te le sol (`mode: "degree"`, targets `1 b7 b6 5`, `labels: "syllables"`, `fallback: "identify"`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "The Andalusian descent, in your feel.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The bass already walks down, A G F E, but the guitar strums Am over every note. Give each bass note its chord, i–VII–VI–V, then make the descent yours: one chord a bar or two (`<[Am G] [F E]>`, the bass to match), a tune that hangs on the V, a sound, a room. (Learner review: the Make no longer repeats the modify step's one-chord fix; the learner writes the cadence from its bass line.)",
        required: {
          rule: "progression",
          label: "The loop is i–VII–VI–V",
          why: '`progression` with `schema: "schema.andalusian"`, key A minor (triad core). The starter (Am over the walking bass) fails, and so does Am G F Em; Am G F E passes, on any sound and in any rhythm, two chords a bar included.',
        },
        suggestions: [
          "the bass steps down (`step-ratio` on `bass`, `min: 0.5`)",
          'the tune holds a note of the V chord in bar 4 (`chord-tones-strong`, `strength: "downbeat"`, `minRatio: 0.75`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours: "Drums from the Band; jazz-soul swaps `acgtr` for `rhodes` and `fingerbass` for `upright`.",
      },
      srs: [{ family: "fam.har.schema", mode: "review-if-due", level: 3 }],
      singOn: "syllables",
      mistakes: [
        "modify: every G raised (`G#o` in bar 2 too, vii° for VII): `harmony.rn` on bar 2; Em kept (v for V): `harmony.rn-case`",
        "modify: `Em` left and `Am` raised to `A`: `code.edit-outside`; unchanged: `code.unchanged`",
        "ear: the Andalusian cadence heard as the Aeolian loop (both start on i, both use VI and VII): `id.wrong`; the hint asks whether the bass falls by step",
        "Make starter: `rubric.unmet`",
      ],
      connects: {
        back: "U10.L06's major V; U06.L11's line cliché, a bass that steps; U10.L04's VII and VI.",
        forward: "U10.L08 raises the 6th too, so a tune can climb smoothly over that V.",
      },
      epr: {
        enjoyment:
          "Four chords falling to a major V, from flamenco to surf rock to soul: the learner's Make is their own take on the most dramatic descent in minor, played on a guitar or a Rhodes in their feel.",
        pace: "One idea: i–VII–VI–V as one gesture. No new tools (chord names, the raised 7 from U10.L06); the melodic-minor climb waits for U10.L08.",
        return:
          "The Coda says: you can recognise and write the Andalusian cadence; it joins the loops in your warm-up. Next: melodic minor, a smooth climb home.",
      },
      notes: [
        "Evaluated: the chords voice A C E | G B D | F A C | E G♯ B; the bass A A E | G G D | F F C | E E B (root, root, 5th, all by note name); the tune A G A | G B G | F C A | B: G natural only over G, B over E. `theory progression A:minor Am G F E` → i VII VI V, `schema.andalusian`.",
        "`fam.har.schema` level 3 is gated at U10.L07 (contracts §7.3 ★L3: + aeolian, andalusian), so the Aeolian loop of U10.L05 enters the schema drill here, together with the Andalusian cadence.",
      ],
    },
    {
      id: "U10.L08",
      author: "U10d",
      idea: "Harmonic minor's raised 7 leaves a gap of three half steps between ♭6 and 7 (F to G♯) that a tune climbing home trips over. Melodic minor raises 6 as well (F♯ G♯), so the line climbs by steps; coming down, tunes usually go back to natural minor (G F). In code: a patterned `.scale()`, melodic up, natural down.",
      hook: {
        hear: "Over the drums: Am Dm E Am on a Rhodes with a fingerbass, and a tune that climbs E F♯ G♯ to A over the E chord, smoothly, into the last bar.",
        code: `${T(88)}chords: chord("<Am Dm E Am>").voicing().s("rhodes").room(.3)\nbass: chord("<Am Dm E Am>").rootNotes(2).s("fingerbass").lpf(800)\nmel: n("<[0 2 4 ~] [3 ~ 2 1] [4 5 6 ~] [7 ~ ~ ~]>").scale("<A3:minor!2 A3:melodic:minor A3:minor>").s("piano")`,
      },
      key: A_MINOR,
      meter: "4/4",
      bpm: 88,
      canDo: ["cd.write.melodic-minor"],
      uses: [...BASE, ...VOICED, ...NAMES, "scale.harmonic-minor", "scale.melodic-minor"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Two items over the drums: the climb in bar 3 in harmonic minor (E F G♯, the gap), then in melodic minor (E F♯ G♯).",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "To climb E F? G♯ A by steps, what must F become? (`choose`: F♯ / F♭ / it stays F)",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: 'The three minors from A to A, `.scale("<A3:minor A3:harmonic:minor A3:melodic:minor>")`, with degree labels: which degrees melodic minor raises (choice: 6 and 7); half steps from F to G♯ in harmonic minor (number: 3). Pass text names melodic minor and says how it usually comes down.',
          term: "term.melodic-minor",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'Up melodic, down natural: `mel: n("<[4 5 6 7] [7 6 5 4]>").scale("<⟪A3:minor⟫ A3:minor>")` over E | Am; make bar 1 climb with melodic minor (`events`, absolute; edit-only-regions; the scale string patterned, so check 13 reads it as one piece). Equivalent: `"<A3:melodic:minor A3:aeolian>"`. The realistic mistake: harmonic minor (F G♯): `melody.wrong-degree` on F.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1,
          graded: true,
          what: "Which minor? Three short climbs to home (fixed code stimuli): natural, harmonic or melodic (`MINOR_OPTIONS`, all three offered from this lesson).",
        },
        {
          kind: "sing",
          exercise: "sing",
          minutes: 1.5,
          what: 'Sing the climb sol la ti do over V–i, then come down do te le sol (`mode: "degree"`, targets `5 6 7 1` then `1 b7 b6 5`, `labels: "syllables"`, `fallback: "identify"`).',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "A minor tune that climbs home through la and ti.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "Over the drums, Am Dm E Am and a tune in natural minor that ends by jumping to A. Rewrite the end so it climbs home by steps through the raised 6 and 7, F♯ and G♯, over the E chord; come down in natural minor wherever the tune falls.",
        required: {
          rule: "degree-set",
          label: "The tune climbs through raised 6 and 7",
          why: '`degree-set` with `contains: ["6", "7"]` on `@melody`, key A minor (F♯ is 6 and G♯ is 7, spelled against major). The starter (natural minor only) fails; the hook passes; harmonic minor alone (G♯ but F) fails.',
        },
        suggestions: [
          "the tune ends on 1 (`ends-on-degree`)",
          'the tune also uses ♭6 or ♭7 coming down (`degree-set`, `contains: ["b6"]`)',
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "Drums from the Band; jazz-soul swaps `fingerbass` for `upright`; a jazz learner may come down in melodic minor too, which passes.",
      },
      srs: [{ family: "fam.key.scale-spell", mode: "review-if-due", level: 3 }],
      singOn: "syllables",
      mistakes: [
        'modify: harmonic minor for the climb: `melody.wrong-degree` on F ("the tune plays ♭6, the target has 6")',
        "modify: melodic minor written on both bars (raised going down too): `melody.wrong-degree` on bar 2; the override says this is jazz's choice, not today's",
        "modify: unchanged: `code.unchanged`",
        "ear: melodic heard as major (the top half is major's): `id.wrong`; the hint: listen to the bottom half, A B C",
        "Make starter and harmonic-minor-only tune: `rubric.unmet`",
      ],
      connects: {
        back: "U10.L06's raised 7 and its gap; U03.L05's patterned `.scale()`, now changing the form of minor bar by bar.",
        forward:
          "U10.L09 hears all three minors in two old songs and takes one down by ear; jazz's melodic minor (both ways) comes back in the J track.",
      },
      epr: {
        enjoyment:
          "The learner's tune now climbs into the last bar the way a singer would, smooth and inevitable over the major V: a minor melody that sounds written, not computed.",
        pace: "One idea: raise 6 as well, going up. The scale names and the patterned `.scale()` are known; no new chords (L06's V), and the jazz use of melodic minor is a sentence, not a step.",
        return:
          "The Coda says: you can tell natural, harmonic and melodic minor apart and write each one. Next: two minor spirituals, by ear and from the page.",
      },
      notes: [
        "Evaluated: the hook's tune is A C E | D C B | E F♯ G♯ | A, over Am | Dm | E (E G♯ B) | Am; F♯ is a passing note over E. `theory scale A:melodic:minor` → A B C D E F♯ G♯.",
        "`scale.melodic-minor` unlocks here; `fam.key.scale-spell` adds the melodic form (contracts §7.3). Strudel's `melodic:minor` is the same up and down; the lesson writes the classical descent with a patterned `.scale()`.",
      ],
    },
    {
      id: "U10.L09",
      author: "U10d",
      idea: "Two minor spirituals, Go Down Moses and Wayfaring Stranger, carry everything in this unit: me and le, a melody that climbs with raised notes, a key home that a tune can feel without a single chord. Take one down by ear, sing the other from the page, and arrange one as a ballad with strings and a delay.",
      hook: {
        hear: "Over a soft pulse: a strings pad on i–VI–VII–i in A minor, an upright bass, and a slow piano line with an echo after every note. The texture the spirituals will be arranged in.",
        code: `${T(76)}pad: n("[0,2,4]").add(n("<0 5 6 0>")).scale("A2:minor").s("strings").gain(.6)\nbass: n("<0 5 6 0>").scale("A1:minor").s("upright")\nmel: n("<[4 ~ ~ 2] [0 ~ 2 ~] [1 ~ ~ ~] [0 ~ ~ ~]>").scale("A3:minor").s("piano").delay(.3)`,
      },
      key: A_MINOR,
      meter: "4/4",
      bpm: 76,
      canDo: ["cd.transcribe.minor-tune"],
      uses: [...BASE, ...VOICED, ...NAMES, "snd.upright", "snd.strings", "tb.delay", "tb.feature.leadsheet"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.75,
          what: "The hook, then the first phrase of Go Down Moses on piano over the same pad (from its answer key).",
        },
        {
          kind: "dictate",
          exercise: "dictation",
          answer: ["code"],
          minutes: 2,
          graded: true,
          wave3: ["by-ear"],
          what: 'Go Down Moses, the refrain phrase ("Let my people go", from the answer key of content/repertoire/go-down-moses, in A minor): write the `mel:` line by ear over the given pad (`byEar`: A/B at the bar, rates 1, 0.75, 0.5; `accepts: "any-octave"`; `melody` matcher, `key-relative`, pass 0.85). Given: meter, key, home, the first note and the rhythm skeleton (contracts §6.12).',
        },
        {
          kind: "sing",
          exercise: "sing",
          minutes: 1.5,
          wave3: ["sight-sing"],
          what: 'Sight-sing the first phrase of Wayfaring Stranger from the lead sheet (`mode: "sight"`, `showLeadSheet: true`, its own `meter` and pickup as the answer key gives them, `labels: "syllables"`, `fallback: "identify"`: in Quiet mode, name the phrase\'s last three degrees).',
        },
        {
          kind: "see",
          minutes: 0.5,
          what: "The transcribed Go Down Moses phrase as a lead sheet in A minor: an empty key signature, a G♯ written as an accidental where the tune climbs, the chord symbols above.",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'Play from the page (U10\'s): the next phrase of Go Down Moses on the staff only (no code, no roll); write it as `n()` over `.scale("A3:minor")`, with the raised note as the step asks (`events`, octave-free, `tracks: ["mel"]`). Starter: `mel: n("⟪…⟫").scale("A3:minor")`.',
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Go Down Moses as a minor ballad.",
        },
      ],
      wrapAt: 2,
      make: {
        brief:
          "Your Go Down Moses phrase over the strings pad and the upright: arrange it as a slow minor ballad. Choose the sounds, an echo on the tune with `.delay()`, how the pad and the bass move, and a second phrase or a reply of your own.",
        required: {
          rule: "matches",
          label: "The tune is the spiritual's phrase",
          why: '`matches` against the answer key\'s refrain phrase with `{ m: "melody", pitch: "key-relative", wPitch: 0.8, wRhythm: 0.2, rhythmTol: [1, 16] }`, `min: 0.85`: the learner\'s arrangement carries the tune they took down (any octave, any sound, any key with the same degrees). The starter (the phrase\'s rhythm on one note) fails.',
        },
        suggestions: [
          "an echo on the tune (`uses` `tb.delay`)",
          'the strings or a Rhodes under it (`sounds`, `anyOf: ["snd.strings", "snd.rhodes"]`)',
          "four parts or more (`tracks`, `min: 4`)",
        ],
        band: "band.axis-4bar",
        tracks: ["drums"],
        flavours:
          "The Band's drums are optional here (the pad and the bass carry the pulse); jazz-soul swaps `piano` for `rhodes`.",
      },
      srs: [
        { family: "fam.mel.dictation", mode: "review-if-due", level: 7 },
        { family: "fam.mel.sight", mode: "review-if-due", level: 4 },
      ],
      singOn: "syllables",
      mistakes: [
        "dictation: ♭3 written as 3 (`n` 3 for degree ♭3's `n` 2): `melody.wrong-degree`; the phrase a step off throughout: `melody.index-shift`; right pitches, wrong rhythm: `melody.pitch-only`",
        "Play from the page: the accidental ignored (G for G♯): `melody.wrong-degree`; the unchanged starter: `code.unchanged`",
        "Make: a new tune in place of the spiritual's: `rubric.unmet`",
      ],
      connects: {
        back: "U07.L09's lead sheet and pickups; U03.L10's by-ear transcription; U10.L01–L08's whole minor vocabulary.",
        forward:
          "GYM.08, U11.L01 and then U10.CP; C4 arranges a minor ballad of the learner's own in this texture. Ladder L5 draws more folk tunes (wave5.md §5.3).",
      },
      epr: {
        enjoyment:
          "The unit's second record moment: a 150-year-old spiritual the learner took down by ear, arranged with strings, an upright and an echoing piano, a minor ballad that sounds finished.",
        pace: "One idea: minor by ear and from the page, on real tunes. `strings` and `.delay()` are two sounds, not a topic (space is A1.L04's); no new theory.",
        return:
          "The Coda says: you can transcribe and sight-sing a minor folk tune; `strings` and `.delay()` are yours. Next: the gym, then the minor checkpoint, and after it C4, your minor ballad.",
      },
      notes: [
        "Evaluated: the hook plays Am F G Am (A C E, F A C, G B D) on `strings`, A F G A on `upright`, and E C | A C | B | A on piano with `.delay(.3)`. `snd.strings` and `tb.delay` unlock here (tb.delay's other site is A1.L04, contracts §3.1 rule 11).",
        "Repertoire (contracts §2.8): Go Down Moses (spiritual; Jubilee Songs, as Sung by the Fisk Jubilee Singers, 1872; A minor, 4/4) and Wayfaring Stranger (trad; 3/4, D minor in content/repertoire/index.ts). author:repertoire writes both answer keys from the cited editions with `verifiedBy`; this spec does not pin their notes. The lesson uses whole phrases from the answer keys: after U07.L08 pickups are allowed (declared as `pickup` metadata), but before U13.L03 a fragment may not need a dot or a tie, so the setting plain-rhythms any dotted value (the `setting` line of the fragment says how) or the step picks a phrase that has none.",
        "Wayfaring Stranger is sung in its own 3/4 (`meter: \"3/4\"` and `bpm` on the sing exercise); the lesson and its Band stay in 4/4. If the answer key's phrase needs a dot or a tie, the sight-singing step uses Go Down Moses's second phrase instead and Wayfaring Stranger moves to the ladder (L5).",
        "If an answer key is not verified when the author starts, the lesson is held (check 2 names the missing song) rather than written from memory.",
      ],
    },
  ],
  checkpoint: {
    id: "U10.CP",
    author: "CP",
    authored: [
      {
        id: "the-twins",
        kind: "code-modify",
        skills: ["S05", "S06"],
        what: "A tune in E major in degrees, on two labelled lines `mel` and `vox` (AUTHORING §13): put `mel` in its parallel minor (E minor: the scale word) and `vox` in its relative minor (C♯ minor: a new tonic, the same notes) (`all` of two `events` matchers, octave-free, one per track, so the relative minor written an octave up passes; exercise key E minor). The realistic mistakes: the two twins swapped, or the relative minor counted from the wrong degree (`melody.wrong-degree`).",
      },
      {
        id: "number-the-minor-song",
        kind: "fact",
        skills: ["H07", "H08", "H09"],
        what: "Eight bars in D minor from the chord band's symbols (Dm B♭ F C | Dm Gm A Dm): the numerals (`rn-palette`, `slots: 8`, `allow: [\"triads\"]`, key D minor): i VI III VII | i iv V i. Bars 1–4 are the Aeolian loop (H08), bar 7 the major V (H09), the rest the key's chords (H07).",
      },
      {
        id: "up-and-down",
        kind: "code-modify",
        skills: ["S07", "S08"],
        what: 'A line in E minor over B | Em climbing to home and falling back (`n("<[4 5 6 7] [7 6 5 4]>")`): give bar 1 the raised 6 and 7 with a patterned `.scale()` and leave bar 2 natural (`events` absolute), and make the chord in bar 1 a major V (`chord("<⟪Bm⟫ Em>")` → `B`; `pcset`). Harmonic minor in bar 1 (C natural, D♯) fails with `melody.wrong-degree` on C.',
      },
    ],
    recipe: {
      items: [12, 16],
      families: {
        E10: ["fam.deg.fet-minor", "fam.key.mode"],
        S06: ["fam.key.circle"],
      },
      why: "E10 is level-setting (a re-test that never blocks): `fam.deg.fet-minor` at the learner's level (6 and 7 included) and `fam.key.mode` level 1. S06 is also drawn from `fam.key.circle` level 2–3 (relative keys round the circle) and from `deck.key.signature`'s minor cards. The concept skills S05, S07, S08, H07, H08 and H09 have no family of their own: the three authored items measure them, and the Make measures H08 and H09 again.",
    },
    make: {
      brief:
        "A minor loop of your own over the drums, eight bars: the Aeolian loop for four bars, then a turn that lands with the major V on i, and a tune that sings me and le.",
      required:
        'H08 and H09: `progression` `schema: "schema.aeolian"` on bars 1–4 (feature `progression.bars`, implemented) as the one required rule; suggestions: `contains-rn` V `mustResolve` (H09), `degree-set` `contains: ["b3", "b6"]` on `@melody` (S05).',
    },
    notes: [
      "U10.CP follows GYM.08 and U11.L01 in the default order (session 111), so it always falls on a later day than U10.L09; passing or soft-passing it opens C4 and A2 (contracts §2.4, §2.6) and shows milestone ms.12.",
      "Gated: S05 S06 S07 S08 H07 H08 H09; level-setting: E10 (content/checkpoints.ts).",
      "Keys differ from the lessons on purpose (E minor, D minor): the checkpoint asks for the idea in a key the learner has not drilled. Every item names its key; nothing asks for a key signature with more than three accidentals.",
      "The checkpoint's Make plays over `band.axis-4bar` drums until author:CP adds `band.aeolian-4bar`; its chords are in the learner's code either way.",
    ],
  },
  capstones: [
    {
      id: "C4",
      author: "capstones",
      intent:
        "The third composed track on the album (sessions 112–113 in the default order): a slow minor ballad in A minor, 60–95 BPM, in the indie or soul feel the learner chose. Session 1 builds the verse on the Aeolian loop i–VI–III–VII (U10.L05) with a bass and a verse tune that sings me and le; session 2 writes a chorus whose cadence uses the major V before i (U10.L06), puts the song in order with one `arrange()` per labelled track (U09.L02, C3), and releases it. Everything it asks for was taught in U09–U10; nothing new is introduced. The sound it reaches for is the two record moments of the unit: the U10.L05 loop and the U10.L09 ballad texture (`strings`, `.delay()`).",
      opens:
        'When U10.CP is passed or soft-passed (contracts §2.4). Today then offers C4.S1 as the New block; a learner who puts it off keeps going into U11 (a capstone never gates a lesson). In progress, no gym slot interrupts it: GYM.09 waits until C4.S2 is done (§2.5). While closed, the capstone card says "Opens after the minor checkpoint".',
      band: "None: a capstone is the learner's whole song, so the starter carries its own `drums:` line and the learner writes chords, bass and tune; the recording, cover and liner notes cover everything that plays. The flavour sets the starter's kit and sounds (contracts §5.10 rule 8: indie `acgtr` or `rhodes` with room and the snare on 3, jazz-soul `rhodes` and `upright`, funk `fingerbass`, pop `piano`) and never changes the rubric (§6.6).",
      sessions: [
        {
          id: "C4.S1",
          goal: "Aeolian verse i–VI–III–VII.",
          opens:
            'The brief and a sectioned starter (`CapstoneSessionDef.starter`), which replaces the brief\'s single-loop starter for this session: tempo 76, key A minor; section consts `chordsVerse` (`chord("<Am F C G>")`, the loop), `bassVerse` (roots), `melVerse` (`n("⟪0 ~ 0 ~⟫").scale("A3:minor")`), `drumsVerse`; and for each labelled track one `arrange([8, …Verse])` (contracts §6.3, STYLE §10), so the chorus slots in next session without rewriting a line. Sounds per flavour.',
          hear: "The starter's verse looping its eight bars: drums, the Aeolian loop on the flavour's chord sound, a root bass; A/B against the last saved draft.",
          see: 'The capstone workspace: the Workbench (code, roll, lead-sheet staff), the chord band in A minor with numerals (`chords` panel: i VI III VII), the degree lens in minor (♭3 ♭6 ♭7, me le te), the form ribbon showing one section, "verse", 8 bars (`tb.lens.form`), and the C4 checklist read from the grader: "verse loop i–VI–III–VII", "melody sings ♭3 and ♭6", "tempo 60–95", then "a major V that goes home to i" and "ends on 1 over i" greyed with "next session". Session bar: "Session 1 of 2: The verse".',
          work: [
            "The verse loop: i–VI–III–VII, one chord a bar, twice (eight bars); sevenths by name are fine (Am7 Fmaj7 Cmaj7 G7: the rubric compares the triad core).",
            "A bass under it from U08: roots on beat 1, 5ths and octaves, approach notes into the changes, or a rhythm locked to the kick.",
            "A verse tune that sings me and le (♭3, ♭6) and sits low and close, so the chorus can lift above it.",
            "Choose the tempo (60–95) and the sounds: the U10.L05 Rhodes and fingerbass, or the U10.L09 strings and a delayed piano.",
          ],
          checks: [
            '`capstones.check` runs the whole rubric on each save; this session\'s lines are the verse ones: `progression` `schema: "schema.aeolian"` on `section: { section: "verse" }` (planned feature `rubric.section`; until it lands, on the whole piece, which in S1 is the verse), `degree-set` `contains: ["b3", "b6"]` on `@melody`, `tempo-bpm` 60–95.',
            "Nothing blocks saving; the draft is the session's Make (contracts §9.1). The session is done when a draft is saved (`capstones.saveDraft`, then `capstones.completeSession`).",
          ],
          ends: 'Draft saved and bound to C4.S1; the Coda says "Next time: the chorus and its landing" and shows the verse lines that are met. No review, no release.',
        },
        {
          id: "C4.S2",
          goal: "Chorus cadence with the major V; release.",
          opens:
            'The C4.S1 draft. If it has no chorus consts, a `…Chorus` const is added for each labelled track (chords `chord("<Dm G C ⟪F⟫ Dm G E Am>")` as a suggestion the learner overwrites: iv–VII–III–VI, then iv–VII–V–i; tune and bass as `⟪…⟫`), and each `arrange()` gains `[8, …Chorus]`.',
          hear: "The learner's verse and chorus in order, with A/B between the draft and the last version; the release recording plays the final version once in full.",
          see: 'The same workspace with the form ribbon showing verse and chorus (click a section to loop it), the chord-tone and range lenses, the checklist live on every line, and the "Review" and "Release" actions at the end. Session bar: "Session 2 of 2: Chorus and release".',
          work: [
            "The chorus chords: a different loop from the verse that ends V–i with the major V (E or E7): iv–VII–V–i, VI–VII–V–i, or the Andalusian cadence i–VII–VI–V–i (U10.L07).",
            "A chorus tune that lifts: higher, longer notes, a climb through the raised 6 and 7 into home over V–i (U10.L08) where it fits.",
            "End the song on 1 over i: the tune's last note is A over the last Am.",
            "Arrange with one `arrange()` per labelled track: verse–chorus, verse–chorus–verse–chorus, or an intro of the verse loop; every arranged track the same sections (contracts §6.3).",
            "Optional: `strings` and `.delay()` (U10.L09) in the chorus only, for the lift.",
          ],
          checks: [
            "The whole rubric of contracts §6.6 C4 (content/capstones.ts): verse `progression` = `schema.aeolian`; `contains-rn` V (major, with the raised 7) followed by i, ≥ 1 (`mustResolve: true`); melody `degree-set` contains ♭3 and ♭6; `ends-on-degree` 1 over i (planned feature `ends-on-degree.over`); `tempo-bpm` 60–95.",
            'Release is allowed once every required line is met and the latest passing check graded the code being released (c1: an edited draft says "Check again before you release"); the tutor review (contracts §10.6) is offered before release and never affects pass or fail.',
          ],
          ends: "Review offered (`review: true`), then release (`release: true`): album track C4 v1 with a recording, a tree-ring cover drawn from the code, deterministic liner notes and the learner's own line. Milestone ms.06 shows once C4 and C5 are both released (content/milestones.ts).",
        },
      ],
      linerNotes: [
        'Deterministic (`linerNotes` of @oak/grader, at release): key (A minor, "natural minor with a raised 7 at the cadence"), tempo, meter, bars and duration; the form from `sectionsFromAst` ("verse 8, chorus 8, verse 8, chorus 8"); the verse loop named as a schema and as numerals ("the Aeolian loop, i–VI–III–VII"); the chorus cadence named ("V–i, with G♯ as the leading tone"); the minor colour of the tune ("sings ♭3 and ♭6"); melody range; instruments and the flavour; tools used (`strings`, `.delay()` if present).',
        "The learner's line: one sentence they type at release (`album.patchVersion` `linerNotesMd`).",
        "The tutor's listening note only with consent (`includeReviewNote`, default `Settings.linerNotesInAlbum`).",
      ],
      tests: [
        "The starter fails (no major V; the tune has no ♭3 or ♭6).",
        'Per shipped flavour, one passing piece in sections (contracts §6.6): pop, Am F C G verse and Dm G E Am chorus on piano at 80; indie, the same on `acgtr` with room at 72, chorus Am G F E Am (Andalusian into i); jazz-soul, `chord("<Am7 Fmaj7 Cmaj7 G7>")` verse and `Dm7 G7 E7 Am7` chorus on `rhodes` with `upright` (sevenths pass on the triad core; E7 is V); funk, the same chords at 92 with a sixteenth-note `fingerbass`.',
        "Fails, each on one rule: the verse as vi–IV–I–V in C (C chords and a tune home on C: `ends-on-degree` and the key's analysis); a chorus ending Em Am (v, no raised 7: `contains-rn`); E followed by Dm (V that does not resolve); a tune with ♭3 but no ♭6; the last note C over Am (ends on ♭3); tempo 110.",
        "Sections: one passing piece written as one `arrange()` per labelled track and the same piece failing only because two tracks disagree about the sections (`form.inconsistent-arrange`, contracts §6.3 item 8).",
      ],
      notes: [
        'content/capstones.ts is author:capstones\'. Requested (as the content lead\'s apiNotes list): the verse rule becomes `progression` with `schema: "schema.aeolian"` and `section: { section: "verse" }` (feature `rubric.section`), and the ending rule `ends-on-degree` with `degrees: ["1"]` and `over: "i"` (feature `ends-on-degree.over`); both planned until the grader lists them. Until then the verse rule reads the whole piece, so a chorus that leaves the Aeolian loop fails it: the S2 tests that need the section are written now and listed as pending.',
        "The brief's current starter puts the tune on `.scale(\"A4:minor\")`, high for a ballad verse that must leave room for the chorus to lift: A3 is suggested (the U10 lessons' tunes sit on A3). The starter's `drums:` line should follow the flavour's kit, as C2's does.",
        "The brief's key is A minor and the analysis runs in it (contracts §6.8 item 1); a learner who writes in another minor key reads the message that names the mismatch. The brief says so in one line.",
        'The major V may be a chord name (`E`, `E7`) or a stack over `.scale("A2:harmonic:minor")` on that bar only; the brief\'s hint warns that harmonic-minor stacks turn III into C augmented (U10.L06).',
        "Add C4.S1's sectioned starter as `sessionDefs[0].starter` and the S2 chorus consts as described; keep `sessions` goals word for word (contracts §2.4). After editing content/capstones.ts, run `bun scripts/content/spec.ts`: this document renders C4's rubric from it.",
        "Dev seeds (wave5.md §6): `C4 open` (U10.CP passed; today C4.S1) and `C4 released` (C4.S1–S2 released; today GYM.09). The capstone engineer's specs start from them.",
      ],
    },
  ],
};
