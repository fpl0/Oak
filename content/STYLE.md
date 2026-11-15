# Oak Strudel dialect (STYLE)

This is the one way Strudel code is written in Oak: in lessons, examples, starters, solutions, Band layers, drill snippets, tutor cards and docs. The toolbox-aware lint (`lintOak`, contracts §3.3) enforces it. `docs/design/contracts.md` is the parent document; if the two disagree, contracts wins.

- **Authored code** (everything Oak ships or the tutor proposes) must follow every rule. Violations fail content CI.
- **Learner code** is held to the rules marked **[learner: error]** in graded steps. Everything else is at most a hint for the learner, and nothing here ever blocks code in Studio.
- Every "Right" block below was evaluated headlessly against `@strudel/core`, `mini`, `tonal`, `transpiler` 1.2.6, twice (the second time by an adversarial pass, `spikes/contracts-check/`); `bun run content:check` re-runs them. Blocks marked "Wrong" show what happens instead, and each of those was run too.

Pinned behaviour: 1 cycle = 1 bar; middle C is `c4` = MIDI 60; Strudel's own default octave is 3.

## 1. File shape

```js
setcpm(92/4)

drums: s("bd ~ sd ~")
bass: note("c2 ~ g2 ~").s("ebass").lpf(700)
mel: n("0 2 4 2").scale("C4:major").s("piano")
```

1. Line 1 is the tempo line (§8). Then one blank line.
2. `const` definitions (if any), then one blank line.
3. One labelled statement per part, in the order drums → bass → chords → melody → extras.
4. Double quotes for every pattern string. Single quotes are never used for patterns: `note('c4 e4')` is one event whose value is the text `c4 e4`. **[learner: error `code.single-quoted-pattern`]**
5. One method per call chain link, in this order: source (`s`, `note`, `n`, `chord`) → pitch and structure (`add`, `scale`, `scaleTranspose`, `voicing`, `rootNotes`, `arp`, `struct`) → time (`slow`, `fast`, `swingBy`, `late`, `mask`) → sound (`s`, `bank`) → effects (`gain`, `lpf`, `room`, …). A chain longer than 100 characters breaks before a `.`, indented two spaces.
6. Numbers that are musical ratios are written as ratios, as JavaScript and never inside a string: `setcpm(92/4)`, `swingBy(1/3, 4)`, `late(1/16)`, `off(1/8, …)`. Inside a pattern string `"1/16"` means "the value 1, slowed 16 times", so `.late("1/16")` does not shift anything (§11).
7. No trailing semicolons, no `var`/`let`, no code after the last track.

## 2. Tracks and labels

Every part is a **labelled statement** with a lowercase label. The label is the track name the grader, the roll, the mixer and the tutor all use.

| Label | Role | Use |
|---|---|---|
| `drums` | drums | a whole kit in one line |
| `kick` `snare` `hats` `perc` | drums | one drum per line (the U01 way of layering) |
| `bass` | bass | the bass line |
| `chords` | chords | the main harmony part |
| `pad` | chords | sustained harmony |
| `keys` `gtr` `horns` | chords or melody, by what they play (contracts §6.2) | extra harmonic or melodic parts, stabs |
| `mel` | melody | the lead line |
| `vox` | melody | a second lead line |
| `fx` | none | noises, risers |

A second part of the same kind takes a digit suffix: `mel2`, `keys2` (2–4 only).

```js
setcpm(96/4)

kick: s("bd ~ bd ~")
snare: s("~ sd ~ sd")
hats: s("hh*8").gain(.6)
```

Rules:

1. **Never `$:` in authored code.** For learners `$:` works (tracks become `$0`, `$1` and are read by role inference) with the note `code.dollar-label`.
2. **No label may start with a capital letter.** A label longer than one character that starts with `S` solos that line in Strudel (`Snare:` silences everything else). **[learner: error `code.label-solo-prefix`]**
3. Labels outside the table get `code.label-unknown` (warning); the part is still graded by role inference.
4. `_name:` mutes a line in code. Authored code never uses it. For learners it is allowed in Studio; in graded steps it draws `code.muted-label`, because the checker hears what the code plays. The mute and solo **buttons** never change the code.
5. Layering is done with labelled lines. `stack()` appears once, read-only, in U01.L03 and is otherwise not used in authored code. Inside one pattern string, `,` stacks events and is available from U04.L03. Authored code uses it only for simultaneous pitches (`"[c4,e4,g4]"`, `n("[0,2,4]")`); drum layers are labelled lines. The one exception is the read-only U00.L01 opener (§14). Learners may write `"bd*2, hh*8"` once `,` is unlocked.
6. One expression per label. The same label twice in one file is an error (the second replaces the first).

Wrong:

```js bad
$: s("bd*2")              // anonymous track: authored code must name it
Snare: s("~ sd ~ sd")     // capital S solos this line: everything else goes silent
drums: stack(s("bd*2"), s("hh*8"))   // use two labelled lines
```

## 3. Pitch, octaves and scales

1. **Note names always carry an octave**: `c4`, never `c`. A bare `c` plays C3 (48). Lint: `code.octave-default`. Letters are lowercase; accidentals are `#` and `b` (`f#4`, `bb3`). Strudel's `s`/`f` accidentals (`cs4`, `df4`) are forbidden (lint `code.letter-accidental`; they play the right note).
2. `c4` = 60. Registers: melody around octave 4–5, chords around octave 3–4, bass in octave 1–2 (bass notes stay at or below `c3`).
3. **`.scale()` always names tonic, octave and mode**: `"C4:major"`. Uppercase tonic letter, `#` or `b`, octave digit, then the scale name with `:` in place of every space. `"C:major"` plays from C3 (`code.scale-no-octave`). `"C4 major"` throws nothing: Strudel logs an error and most of the notes go missing (`code.scale-spaces`). **[learner: error for the space form]**
4. Scale tonic octave by part: melody `X4` (or `X3`/`X5` to fit the range), bass `X2` (or `X1`), stacked chords by degree `X3`.
5. Scale names in Oak (each unlocks with its lesson, contracts §3.2 D):

| Name in code | Meaning |
|---|---|
| `major` | major scale |
| `minor` (alias `aeolian`) | natural minor |
| `harmonic:minor`, `melodic:minor` | raised 7; raised 6 and 7 |
| `major:pentatonic`, `minor:pentatonic` | pentatonics |
| `blues` | minor blues scale (1 ♭3 4 ♭5 5 ♭7) |
| `mixolydian`, `dorian`, `lydian`, `phrygian`, `locrian` | modes |
| `altered`, `lydian:dominant`, `bebop`, `bebop:major` | jazz chord-scales (J2.L04) |

6. Never show or store Strudel's own note spellings. `n("0 1 2").scale("C4:major")` yields `C4 D4 E4`, but chromatic steps and voicings come out misspelled (§6). Display always re-spells from MIDI and key.

```js
setcpm(80/4)

mel: n("0 2 4 7 4 2 0 ~").scale("G4:major").s("piano")
bass: n("0 ~ 4 ~").scale("G2:major").s("ebass")
```

Wrong:

```js bad
mel: note("c e g")                      // octave 3, not 4
mel: n("0 2 4").scale("C:major")        // C3 major: an octave lower than the staff will show for a melody
mel: n("0 2 4").scale("C4 major")       // logs "Scale name C4 is incomplete"; one stray G3 is all that plays
mel: note("cs4 ef4")                    // s/f accidentals: write c#4 eb4
```

## 4. Sounds, banks, instruments

1. Drum sounds are the short names `bd sd hh oh cp rim lt mt ht cr rd sh cb tb`.
2. **Banks use full names**: `RolandTR909`, `RolandTR808`, `LinnDrum`, `AkaiLinn`, `RolandTR707`, plus Oak's `jazzkit`. Short names (`tr909`, `linn`) are forbidden: `.bank("tr909")` only sounds if an alias file is loaded, and the lint cannot map it to a toolbox entry. **[learner: error `code.locked-sound` / unknown bank]**
3. Pitched instruments are Oak's curated aliases (`piano`, `ebass`, `upright`, `fingerbass`, `rhodes`, `organ`, `pad`, `acgtr`, `cleangtr`, `jazzgtr`, `crunch`, `strings`, `horns`, `trumpet`, `tenor`, `vibes`, `mutetpt`, `clav`, `choir`) and the synth waves `sine triangle square sawtooth supersaw pulse`. Raw `gm_*` names and `:n` variants are never written in authored code.
4. `.piano()` is not used; write `.s("piano")`.
5. No remote `samples(...)` calls. Oak's sound pack is the only source.

```js
setcpm(100/4)

drums: s("bd ~ sd ~").bank("RolandTR909")
hats: s("hh*8").bank("RolandTR909").gain(.5)
```

## 5. Chords and voicings

### 5.1 Canonical spellings

Roots are uppercase with `#` or `b`. The nine core symbols are the only spellings for their qualities:

| Quality | Code | Lead-sheet display | Roman-numeral suffix |
|---|---|---|---|
| major triad | `C` | C | I |
| minor triad | `Cm` | Cm | i |
| diminished triad | `Co` | C° | vii° |
| augmented triad | `Caug` | C+ | III+ |
| major seventh | `C^7` | Cmaj7 | Imaj7 |
| dominant seventh | `C7` | C7 | V7 |
| minor seventh | `Cm7` | Cm7 | ii7 |
| half-diminished | `Cm7b5` | Cm7♭5 (jazz glyph Cø7) | viiø7 |
| diminished seventh | `Co7` | C°7 | vii°7 |

Never written in authored code, with what the lint suggests: `Cmaj7` → `C^7` (silent in Strudel); `Cdim` → `Co`, `Cdim7` → `Co7`, `Csus4` → `Csus` (all silent); **`C+` → `Caug` (a parse error: `+` is not valid in a pattern string)**; `C-` → `Cm`, `C-7` → `Cm7`, `Ch7` → `Cm7b5`, `CM7` → `C^7`, `CM` → `C` (these work only in the `ireal` dictionaries); lowercase roots (`cm7` is silent). An unknown symbol produces silence and a console line, never an exception, so the lint is the only safety net. **[learner: error `code.unknown-chord` for silent or unparsable symbols; info for `ireal`-only aliases]**

The rest of the vocabulary unlocks in the jazz track (contracts §3.2 E). This table and the one above are one table in `@oak/theory`; every display string comes from it, never from an author's hand. With the jazz-glyph toggle (J1.L02) the nine core symbols show as C, C–, C°, C+, C∆7, C7, C–7, Cø7, C°7.

| Quality | Code | Lead-sheet display | Jazz glyph |
|---|---|---|---|
| sixth, minor sixth | `C6` `Cm6` | C6, Cm6 | C6, C–6 |
| six-nine | `C69` | C6/9 | C6/9 |
| suspended fourth, suspended second | `Csus` `C2` | Csus4, Csus2 | Csus, Csus2 |
| added ninth | `Cadd9` | Cadd9 | Cadd9 |
| dominant sus | `C7sus` | C7sus4 | C7sus |
| ninth, thirteenth | `C9` `C13` | C9, C13 | C9, C13 |
| major ninth | `C^9` | Cmaj9 | C∆9 |
| minor ninth, minor eleventh | `Cm9` `Cm11` | Cm9, Cm11 | C–9, C–11 |
| altered dominants | `C7b9` `C7#9` `C7#11` `C7b13` `C7alt` | C7♭9, C7♯9, C7♯11, C7♭13, C7alt | the same |
| major seventh sharp eleven | `C^7#11` | Cmaj7♯11 | C∆♯11 |
| minor-major seventh | `Cm^7` (`CmM7` under `lefthand` or `guidetones`) | Cm(maj7) | C–∆ |

`Csus2`, `Csus4` and `Cmaj9` as code are silent; the spellings above are the only ones.

### 5.2 Which dictionary knows which symbol

Verified by voicing every symbol in every dictionary and comparing the pitch classes. ✓ = sounds, with the right notes; — = silent; ✗ = sounds, with **wrong** notes. The default dictionary is `ireal`.

| Symbol | `ireal` (default) | `ireal-ext` | `triads` | `lefthand` | `guidetones` |
|---|---|---|---|---|---|
| `C` `Cm` `Co` | ✓ | ✓ | ✓ | — | — |
| `Caug` | ✓ | ✓ | ✗ | — | — |
| `C^7` `C7` `Cm7` `Cm7b5` `Co7` | ✓ | ✓ | — | ✓ | ✓ |
| `Cm6` | ✓ | ✓ | — | ✓ | ✓ |
| `C69` | ✓ | ✓ | — | ✗ | ✓ |
| `C6` | ✓ | ✓ | — | — | ✓ |
| `C7b9` `C7#9` `C7#11` `C7b13` | ✓ | ✓ | — | ✓ | ✓ |
| `C^9` `Cm9` | ✓ | ✓ | — | — | ✓ |
| `C9` `C13` `Cm11` `C7alt` `Csus` `C7sus` `C2` `Cadd9` `C^7#11` | ✓ | ✓ | — | — | — |
| minor-major seventh | `Cm^7` | `Cm^7` | — | `CmM7` | `CmM7` |

The two ✗ cells are bugs in Strudel 1.2.6's dictionaries, and they are the dangerous ones because nothing looks wrong:

- `chord("Caug").dict("triads").voicing()` plays E♭ A♭ C, an **A♭ major** triad (the dictionary has a minor third in its `aug` entry). Voice augmented triads with the default dictionary or by hand: `note("[c4,e4,g#4]")`.
- `chord("C69").dict("lefthand").voicing()` plays E G B♭ D, which sounds as C9.

Rule: **every chord symbol must resolve, with the right notes, in the dictionary of its own chain.** `.dict("triads")` takes `C Cm Co` only; `.dict("lefthand")` and `.dict("guidetones")` take sevenths and sixths only. The lint reads the `dict()` in the chain (default `ireal`) and raises `code.chord-not-in-dict` with a fix, for — and for ✗ cells alike. Content CI voices every `(symbol, dict)` pair that content uses and checks it has at least 2 notes and only pitch classes that belong to the chord or its usual tensions. The `legacy` dictionary and the deprecated `.voicings()` are not used.

What the dictionaries are for, so that no check asks them for something else:

- `ireal` (default): full voicings, 4–5 notes, root usually present. The 3rd or 5th is often the lowest note.
- `triads`: exactly three notes, close position.
- `lefthand`: left-hand recipes for sevenths and sixths, MOSTLY rootless four-note shapes with a 9th or 13th (`C7` → B♭ D E A; `C^7` → B D E G, the 7th lowest; `G7` → B E F A, the 3rd lowest), with exceptions: `Cm7b5` keeps its root (E♭ G♭ B♭ C, no 9th), `C7#9` has three notes. Never describe it as uniformly rootless or four-note, and never check "root absent" on its output. `.offset(1)` moves to the other rootless position (`C^7` → E G B D). Its altered-dominant entries are loose (`C7b9` and `C7b13` are the same four notes; `C7#11` has no 3rd): fine for comping, never the subject of a pitch-class check. Rootless A and B voicings, shells and drop-2 as *shapes* are hand-voiced (`note("[f3,a3,c4,e4]")`) and graded by shape (`voicing-shape`, `VOICING_SHAPES` in `@oak/content-kit`); no Strudel dictionary makes them.
- `.mode("duck")` (J3.L01) voices at or below the anchor and leaves out the note equal to the anchor, so a chord under a melody note does not double it (anchored on G4, `C^7` in `lefthand` plays B3 D4 E4). It does not remove the root and is not a "rootless" switch.
- `guidetones`: two notes, the 3rd and the 7th (or 6th).
- `ireal-ext` (J2.L03): adds colour to plain symbols too (`C` → C E A, `Co` → C E♭ G♭ A).

So a chord's **name** is always taken from its symbol, never worked out from the notes a dictionary produced (contracts §6.7).

### 5.3 Voicing controls

```js
setcpm(88/4)

chords: chord("<C Am F G>").dict("triads").voicing().s("rhodes")
bass: chord("<C Am F G>").rootNotes(2).s("ebass").lpf(700)
```

```js
setcpm(120/4)

chords: chord("<Dm7 G7 C^7 C^7>").dict("lefthand").voicing().s("rhodes")
```

1. `chord("…")` then optional `.dict()`, `.anchor()`, `.mode()`, then `.voicing()`. Controls go **before** `.voicing()`.
2. Modes: `below` (default: top note at or below the anchor, default anchor `c5`), `root:<note>` (root position; the bass is the highest root at or below that note, so `.mode("root:g2")` puts C on C2, A on A1 and G on G2), `duck` (J3.L01). **`mode("above")` is forbidden** (it behaves differently in the next Strudel release). **[learner: error `code.mode-above`]**
3. **No slash chords inside `chord()`.** `chord("C/E")` throws `Invalid argument`, because `/` is the pattern slow-down operator. An inversion is written by giving the bass note to the `bass:` track (or by a hand-voiced note list); the display layer derives `C/E`. **[learner: error `code.slash-chord`]**
4. Voicings are graded by pitch-class set and bass note only. Never author a check, a hint or prose that depends on a voicing's octave, top note or note count (the default dictionary returns five notes for a triad).
5. `voicing()` spells with flats and odd enharmonics; display re-spells.
6. Hand voicings are note lists: `note("<[e3,g3,c4] [f3,a3,c4] [d3,g3,b3] [e3,g3,c4]>")`.
7. **Single voices of a voicing: `n` goes first.** `n("0 1 2 3").chord("<C Am>").voicing()` plays the voicing's notes one at a time, lowest first (E3 C4 E4 G4); numbers past the top continue an octave up. `.n("0 1 2")` written after `.voicing()` does nothing, and `chord(…).n(…)` plays one note per chord. A shared progression drives several parts like this (J1.L05):

```js
setcpm(120/4)

const changes = "<Dm7 G7 C^7 C^7>"

chords: chord(changes).dict("lefthand").voicing().s("rhodes").gain(.5)
bass: chord(changes).rootNotes(2).s("upright")
mel: n("0 1 2 3").chord(changes).voicing().s("vibes")
```

Wrong:

```js bad
chords: chord("<C Am F G7>").dict("triads").voicing()     // G7 is silent in "triads"
chords: chord("<Dm G C>").dict("lefthand").voicing()      // triads are silent in "lefthand"
chords: chord("<C C/E F G>").voicing()                     // error: Invalid argument
chords: chord("<C F>").voicing().mode("above")             // forbidden mode (and placed after voicing)
chords: chord("<C+ F>").voicing()                          // parse error: write Caug
```

## 6. Degrees, `n`, chromatic steps, degree arithmetic

1. The learner-facing pitch language is the 1-based scale degree: `1 2 3 4 5 6 7`, altered `♭3 ♯4`. In code, **`n` = degree − 1**: `n("0")` is 1, `n("4")` is 5, `n("7")` is 1 an octave up, `n("-1")` is 7 below the tonic.
2. `n()` is used only with `.scale()`. `n` without a scale is a sample index, not a pitch. **[learner: error `code.n-without-scale`]**
3. **Chromatic degrees** are step strings: the 0-based step, then `#` or `b`.

| Degree | Code | In C major | Degree | Code | In C major |
|---|---|---|---|---|---|
| ♯1 | `n("0#")` | C♯ | ♭2 | `n("1b")` | D♭ |
| ♯2 | `n("1#")` | D♯ | ♭3 | `n("2b")` | E♭ |
| ♯4 | `n("3#")` | F♯ | ♭5 | `n("4b")` | G♭ |
| ♯5 | `n("4#")` | G♯ | ♭6 | `n("5b")` | A♭ |
| ♯6 | `n("5#")` | A♯ | ♭7 | `n("6b")` | B♭ |

   The trap: the number is the step, not the degree. `n("4#")` is ♯5, not ♯4, and `n("7b")` is the natural 7 (the octave tonic lowered). The lint warns on an accidental step of 7 or more and on `4#`/`7b` in lessons about ♯4 and ♭7 (`code.chromatic-step`). In a minor scale the step strings alter the minor scale's own steps.
4. Ranges are written with spaces: `n("0 .. 4")`. Without spaces (`"0..4"`) Strudel reports an invalid scale step. **[learner: error `code.range-spacing`]**
5. **Degree arithmetic** happens before `.scale()` and wraps its argument in `n(…)`:

```js
setcpm(84/4)

chords: n("[0,2,4]").add(n("<0 3 4 0>")).scale("C3:major").s("piano")
```

   `.add("<0 3 4>")` with a bare string, or `.add(3)` with a bare number, does nothing but log a warning (`code.add-on-control`). After `.scale()`, move by scale steps with `.scaleTranspose(n)`, or by semitones with `.transpose(n)`.

```js
setcpm(84/4)

mel: n("0 1 2 4").scale("C4:major").off(1/8, x => x.scaleTranspose(2)).s("piano")
```

Wrong:

```js bad
mel: n("3 4# 5").scale("C4:major")                 // 4# is G#, not F#: for ♯4 write 3#
chords: n("[0,2,4]").add("<0 3 4>").scale("C3:major")   // no effect: wrap the argument in n()
mel: n("0 2").scale("C4:major").off(1/8, x => x.add(n(2)))   // too late: pitches are already fixed by scale()
mel: n("0..7").scale("C4:major")                    // error: write "0 .. 7"
```

## 7. Swing

1. Rhythms are **written straight** and swung by one call on the track that swings.
2. Eighth-note swing: `.swingBy(1/3, beatsPerBar)`. Sixteenth-note swing: `.swingBy(1/3, 2 * beatsPerBar)` written as a number.

| Meter | 8th swing | 16th swing |
|---|---|---|
| 4/4 | `.swingBy(1/3, 4)` | `.swingBy(1/3, 8)` |
| 3/4 | `.swingBy(1/3, 3)` | `.swingBy(1/3, 6)` |
| 2/4 | `.swingBy(1/3, 2)` | `.swingBy(1/3, 4)` |
| 6/8, 9/8, 12/8, odd meters | not used | not used |

3. The amount runs from 0 (straight) to `1/3` (triplet swing); lighter swing is a smaller amount. `.swing(4)` is the same as `.swingBy(1/3, 4)`; authored code uses `swingBy` so the amount is visible.
4. A patterned amount uses decimals: `.swingBy("<0 .1 .2 .33>", 4)`. A fraction inside the string (`"1/3"`) silently gives no swing (`code.swing-fraction-string`).
5. Any swung example, exercise or song declares `swing: { subdivision: 8 | 16, amount }` in its metadata so notation prints "Swing 8ths" and grading compares on the straight grid.
6. Apply swing to each track that should swing (hats, ride, comping, melody). Quarter-note lines are unaffected by it.

```js
setcpm(120/4)

hats: s("hh*8").swingBy(1/3, 4).gain(.6)
drums: s("bd ~ sd ~").bank("RolandTR909")
```

Wrong:

```js bad
hats: s("hh*6").swingBy(1/3, 4)     // 3/4 bar: the second argument must be 3
hats: s("hh [~ hh] hh [~ hh]")      // hand-written "swing": write straight eighths and call swingBy
```

## 8. Tempo and meter

The first line is always `setcpm(BPM/unitsPerBar)`, written as a division so the BPM is readable. BPM counts the meter's tempo unit.

| Meter | Tempo line | BPM counts | Example |
|---|---|---|---|
| 4/4 | `setcpm(bpm/4)` | quarter | `setcpm(92/4)` |
| 3/4 | `setcpm(bpm/3)` | quarter | `setcpm(108/3)` |
| 2/4 | `setcpm(bpm/2)` | quarter | `setcpm(100/2)` |
| 6/8 | `setcpm(bpm/2)` | dotted quarter | `setcpm(60/2)` |
| 9/8 (3+3+3) | `setcpm(bpm/3)` | dotted quarter | `setcpm(60/3)` |
| 12/8 | `setcpm(bpm/4)` | dotted quarter | `setcpm(66/4)` |
| 5/4 | `setcpm(bpm/5)` | quarter | `setcpm(140/5)` |
| 5/8 | `setcpm(bpm/5)` | eighth | `setcpm(240/5)` |
| 7/8 | `setcpm(bpm/7)` | eighth | `setcpm(240/7)` |
| 9/8 irregular (2+2+2+3) | `setcpm(bpm/9)` | eighth | `setcpm(240/9)` |

1. The meter itself is metadata (`meter: '6/8'`); Strudel has no meter. A bar of 6/8 is six equal steps or two groups of three.
2. One tempo for the whole piece. No `setcps`, no `.cpm()`, no per-event `cps`.
3. A multi-bar idea uses `< >` (one item per bar) or `.slow(n)`; a cycle is never treated as longer than a bar.
4. `setcpm(23)` instead of `setcpm(92/4)` is accepted from learners with the note `code.setcpm-form`. Authored code always shows the division.

```js
setcpm(60/2)

drums: s("bd ~ ~ sd ~ ~")
hats: s("hh*6").gain(.5)
```

```js
setcpm(240/7)

drums: s("bd ~ sd ~ bd ~ ~")
hats: s("hh*7").gain("1 .5 1 .5 1 .5 .5")
```

## 9. Key changes and pickups

**Key changes use a patterned `.scale()`, never `.transpose()`.** The scale pattern keeps each note's key context correct, so degrees, notation and liner notes stay right after the change.

```js
setcpm(100/4)

mel: n("0 2 4 7").scale("<C4:major!2 D4:major!2>").s("piano")
```

`!n` repeats a key for n bars. `.transpose()` stays available for moving by semitones inside one key context (octaves, parallel lines); after a `.scale()` it is flagged `code.transpose-after-scale` when it is used to change key.

**In a piece with sections, the key plan goes after `arrange()`.** Inside `arrange()` every section starts from its own first bar, so a patterned `.scale()` written inside a section const never reaches its second key (`code.arranged-scale-pattern`). Keep the section consts as bare degree patterns and count the key plan in bars of the whole piece:

```js
setcpm(100/4)

const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")
const melChorus = n("<[7 6 4 2] [4 ~ 2 ~]>")

mel: arrange([4, melVerse], [4, melChorus], [4, melChorus]).scale("<C4:major!8 D4:major!4>").s("piano")
```

A chord track written by degree (`n("[0,2,4]").add(n("<0 4 5 3>"))`) takes the same key plan after its own `arrange()`. A `chord("…")` track cannot be re-keyed by a scale: give the lifted section its own const with the new symbols. Name it as the section it repeats, with a digit (`chordsChorus2`), so every track still calls the last section a chorus; a `chordsLift` beside a `melChorus` is two names for one section, and the form check reads it as `form.inconsistent-arrange`. Either every track has a `…Lift` const, or the lifted chords are `…Chorus2` (U17.L02 is the worked example).

**Pickups** (anacrusis) are leading rests in bar 0, plus `pickup` metadata on the lesson, exercise or song. Bar 0 holds only the pickup; the melody's first full bar is the second cycle. Other parts rest in bar 0.

```js
setcpm(96/3)

mel: n("<[~ ~ 4] [7 ~ 6] [4 ~ 2] [0 ~ ~]>").scale("G4:major").s("piano")
```

with `pickup: { units: [1, 1] }` (one quarter note). Without the metadata, leading rests are just rests.

## 10. Sections, variables and `arrange()`

1. Section patterns are `const`s named **`<role><Section>`** in camelCase: `drumsVerse`, `bassChorus`, `chordsBridge`, `melChorus2`. Roles are the labels of §2. Section words: `intro verse pre chorus bridge solo break head vamp lift outro`, the two idioms of a genre translation `ballad drive` (A2.L06), or a single letter `a b c`, with an optional digit for a variant.
2. **One `arrange()` per labelled track.** Every arranged track lists the same sections with the same bar counts. A part that rests in a section uses `silence`.
3. A track that plays the same thing throughout may skip `arrange()`.
4. `const` is the only declaration keyword. Names are never reused. A helper that is not a section is named for what it is (`changes`, `groove`).
5. `arrange()` may be followed by a method chain (`arrange(…).scale("…").s("piano")`); nothing may wrap it.
6. Sections restart: each one plays from its own first bar every time it appears. Give a section a bar count that is a whole multiple of its pattern's length (an idea written as `<a b c>` is 3 bars long and is cut off in a 4-bar section: `form.section-period`).

```js
setcpm(104/4)

const drumsVerse = s("bd ~ sd ~")
const drumsChorus = s("bd bd sd ~")
const bassVerse = n("<0 4 5 3>").scale("C2:major").s("ebass").lpf(700)
const bassChorus = n("<3 4 0 0>").scale("C2:major").s("ebass").lpf(700)
const melVerse = n("<[0 2 4 2] [4 2 1 ~] [0 2 4 5] [4 ~ ~ ~]>").scale("C4:major").s("piano")
const melChorus = n("<[7 6 4 2] [4 ~ 2 ~] [7 6 4 2] [0 ~ ~ ~]>").scale("C4:major").s("piano")

drums: arrange([8, drumsVerse], [8, drumsChorus])
bass: arrange([8, bassVerse], [8, bassChorus])
mel: arrange([8, melVerse], [8, melChorus])
```

Wrong:

```js bad
song: arrange([8, stack(drumsVerse, bassVerse)], [8, stack(drumsChorus, bassChorus)])   // one label: per-track checks cannot see the parts
bass: arrange([8, bassVerse], [4, bassChorus])     // lengths differ from the other tracks: form.inconsistent-arrange
const v = n("0 2 4")                               // unnamed role and section
```

## 11. Effects and controls

1. Authored code uses only controls that are in `content/toolbox.ts` (contracts §3.2 H) and unlocked for that lesson (or flagged as a preview).
2. Never used, because they are silent in this Strudel version: `leslie`, `lrate`, `lsize`, `amp`, `squiz`, `triode`, `ring`.
3. **Microtiming is `.late(t)` / `.early(t)`**, which move the events. The amount is JavaScript (`.late(1/32)`); as a string (`.late("1/32")`) it does not shift at all (`code.time-fraction-string`), and the same goes for `.off("1/8", …)`. A patterned amount uses decimals: `.late("<0 .02>")`. `.nudge()` is never used in authored code: it leaves event times unchanged, so the checker cannot see it; for learners it is Studio-only (`code.nudge-studio-only`).
4. Visual methods are not written in authored code: `.pianoroll()`, `.punchcard()`, `.spiral()`, `.pitchwheel()`, `._scope()` and every `_`-prefixed inline widget. `.scope()` and `.fscope()` are allowed from their unlock lessons and open Oak's own panel.
5. `gain` and `velocity` stay within 0–1. Ghost notes are `.velocity()` values of 0.4 or less. Bass tracks carry a low-pass (`.lpf(600)`–`.lpf(900)`) from C1 on.
6. Randomness (`?`, `degradeBy`, `sometimesBy`, `rand`, `perlin` as a note source) is never used in an exercise with an exact-match grader. It is fine in Make steps and in rubric-graded work.
7. **A control pattern takes its rhythm from the pattern on its left.** `s("hh*16").velocity("1 .35 .6 .35")` does not accent every beat: the four values are spread over the bar, one per beat (1 1 1 1 .35 .35 .35 .35 …). For an accent pattern inside the beat, repeat the cell (`"[1 .35 .6 .35]*4"`) or write one value per step.
8. `.legato(x)` and `.clip(x)` are the same control under two names; use `clip` for "short notes" and `legato` for phrasing.

```js
setcpm(96/4)

snare: s("~ sd ~ sd").late(1/32)
hats: s("hh*16").velocity("[1 .35 .6 .35]*4").gain(.7)
```

## 12. Forbidden constructs (lint summary)

| Construct | Authored code | Learner, graded step | Code |
|---|---|---|---|
| `$:` labels | error | info | `code.dollar-label` |
| Label starting with a capital | error | error | `code.label-solo-prefix` |
| `_name:` code mute | error | info | `code.muted-label` |
| Single-quoted pattern string | error | error | `code.single-quoted-pattern` |
| Note name without octave | error | info | `code.octave-default` |
| `s`/`f` accidentals (`cs4`) | error | info | `code.letter-accidental` |
| `.scale()` without octave / with spaces | error / error | warning / error | `code.scale-no-octave` / `code.scale-spaces` |
| `n()` without `.scale()` on a pitched sound | error | error | `code.n-without-scale` |
| `Cmaj7 Cdim Cdim7 Csus4`, lowercase roots, `C+` | error | error | `code.unknown-chord`, `code.lowercase-chord-root` |
| `C- C-7 Ch7 CM CM7` | error | info (if the dict knows it) | `code.unknown-chord` |
| Symbol not in the chain's `dict()`, or voiced wrongly by it (`Caug` in `triads`, `C69` in `lefthand`) | error | error | `code.chord-not-in-dict` |
| `/` inside `chord("…")` | error | error | `code.slash-chord` |
| `mode("above")`, `.voicings()` | error | error | `code.mode-above` |
| `.add("…")` or `.add(3)` on an `n()` pattern (argument not wrapped in `n(…)`) | error | error | `code.add-on-control` |
| Accidental step ≥ 7; `4#` for ♯4 | error | warning | `code.chromatic-step` |
| `"0..7"` | error | error | `code.range-spacing` |
| Short bank names | error | error | `code.locked-sound` |
| Raw `gm_*` names, `.piano()`, remote `samples()` | error | info (Studio) / error (remote) | `code.uncatalogued` |
| Swing argument ≠ beats per bar (or twice it); fraction in a patterned amount | error | warning / error | `code.swing-convention`, `code.swing-fraction-string` |
| Fraction inside a string time argument (`.late("1/16")`, `.off("1/8", …)`) | error | error | `code.time-fraction-string` |
| Patterned `.scale("<…>")` inside an `arrange()` section | error | warning | `code.arranged-scale-pattern` |
| Section length not a multiple of its pattern's length | error | warning | `form.section-period` |
| Missing tempo line; `setcps`; `.cpm()`; `cps` control | error | warning | `code.setcpm-missing` |
| `setcpm(23)` without the division | error | info | `code.setcpm-form` |
| Key change by `.transpose()` after `.scale()` | error | warning | `code.transpose-after-scale` |
| `.nudge()` | error | error (info in Studio) | `code.nudge-studio-only` |
| Silent controls (`leslie`, `squiz`, …) | error | info | `code.uncatalogued` |
| Visual methods and inline widgets | error | ignored (stubbed) | — |
| A single `arrange()` holding stacked parts; unequal sections | error | error when a form rule applies | `form.inconsistent-arrange` |
| Locked tool, sound, scale, chord family or operator | error unless `preview: true` | error | `code.locked-*` |
| Anything in the strict profile (contracts §11.3) | error | n/a | `lint.strict.*` |

## 13. Comments

1. Line comments only (`//`), on their own line above the thing they describe, or at the end of a line in a "Wrong" block. No block comments.
2. Sentence case, no full stop, 60 characters at most, musical words: `// the answer phrase lands on 1`.
3. At most one comment per track in a starter. Comments never contain the answer, and never contain commented-out code.
4. Editable regions and blanks are marked with `⟪…⟫` and `⟦id⟧` in `lesson.ts`; they are not comments and never appear in what the learner sees as text.

## 14. Two complete examples

A four-layer loop in the shape of the U00.L01 opener (labels from day one):

```js
setcpm(92/4)

drums: s("bd ~ sd ~, hh*8").bank("RolandTR808").gain(.8)
bass: note("<c2 a1 f1 g1>").s("ebass").lpf(800)
chords: chord("<C Am F G>").voicing().s("rhodes").gain(.5)
mel: n("<[4 ~ 2 4] [0 ~ ~ 2] [5 ~ 3 5] [4 ~ ~ ~]>").scale("C4:major").s("piano")
```

A 12-bar shuffle (swing declared as `swing: { subdivision: 8, amount: 1/3 }` in the metadata):

```js
setcpm(112/4)

const changes = "<C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>"

hats: s("hh*8").swingBy(1/3, 4).gain(.5)
drums: s("bd ~ sd ~").bank("RolandTR909")
bass: chord(changes).rootNotes(2).struct("x*4").s("ebass").lpf(700)
chords: chord(changes).dict("lefthand").voicing().struct("~ x ~ x").s("organ").gain(.5)
mel: n("<[0 1 2 3] [4 ~ 1 0]>").scale("C4:blues").swingBy(1/3, 4).s("piano")
```
