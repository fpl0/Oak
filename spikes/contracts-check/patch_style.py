from patchlib import Doc
d = Doc('/Users/fpl0/Code/Oak/content/STYLE.md')

d.rep("- Every \"Right\" block below was evaluated headlessly against `@strudel/core`, `mini`, `tonal`, `transpiler` 1.2.6; `bun run content:check` re-runs them. Blocks marked \"Wrong\" show what happens instead.",
      "- Every \"Right\" block below was evaluated headlessly against `@strudel/core`, `mini`, `tonal`, `transpiler` 1.2.6, twice (the second time by an adversarial pass, `spikes/contracts-check/`); `bun run content:check` re-runs them. Blocks marked \"Wrong\" show what happens instead, and each of those was run too.")

# §1
d.rep("6. Numbers that are musical ratios are written as ratios: `setcpm(92/4)`, `swingBy(1/3, 4)`, `late(1/16)`.",
      "6. Numbers that are musical ratios are written as ratios, as JavaScript and never inside a string: `setcpm(92/4)`, `swingBy(1/3, 4)`, `late(1/16)`, `off(1/8, …)`. Inside a pattern string `\"1/16\"` means \"the value 1, slowed 16 times\", so `.late(\"1/16\")` does not shift anything (§11).")

# §2
d.rep("| `keys` `gtr` | chords or melody (by what they play) | extra harmonic or melodic parts |\n| `mel` | melody | the lead line |\n| `vox` `horns` | melody (or chords if polyphonic) | extra lines, stabs |",
      "| `keys` `gtr` `horns` | chords or melody, by what they play (contracts §6.2) | extra harmonic or melodic parts, stabs |\n| `mel` | melody | the lead line |\n| `vox` | melody | a second lead line |")
d.rep("5. Layering is done with labelled lines. `stack()` appears once, read-only, in U01.L03 and is otherwise not used in authored code. Inside one pattern string, `,` stacks events (`\"[c4,e4,g4]\"`, `\"bd*2, hh*8\"`) and is available from U04.L03.",
      "5. Layering is done with labelled lines. `stack()` appears once, read-only, in U01.L03 and is otherwise not used in authored code. Inside one pattern string, `,` stacks events and is available from U04.L03. Authored code uses it only for simultaneous pitches (`\"[c4,e4,g4]\"`, `n(\"[0,2,4]\")`); drum layers are labelled lines. The one exception is the read-only U00.L01 opener (§14). Learners may write `\"bd*2, hh*8\"` once `,` is unlocked.")
d.rep("drums: stack(s(\"bd*2\"), s(\"hh*8\"))   // use two labelled lines (or \"bd*2, hh*8\" from U04.L03)",
      "drums: stack(s(\"bd*2\"), s(\"hh*8\"))   // use two labelled lines")

# §3
d.rep("`\"C:major\"` plays from C3 (`code.scale-no-octave`); `\"C4 major\"` is an error in Strudel (`code.scale-spaces`). **[learner: error for the space form]**",
      "`\"C:major\"` plays from C3 (`code.scale-no-octave`). `\"C4 major\"` throws nothing: Strudel logs an error and most of the notes go missing (`code.scale-spaces`). **[learner: error for the space form]**")
d.rep("mel: n(\"0 2 4\").scale(\"C4 major\")       // error: Scale name C4 is incomplete",
      "mel: n(\"0 2 4\").scale(\"C4 major\")       // logs \"Scale name C4 is incomplete\"; one stray G3 is all that plays")

# §5.1 extended table
d.rep("An unknown symbol produces silence and a console line, never an exception, so the lint is the only safety net. **[learner: error `code.unknown-chord` for silent or unparsable symbols; info for `ireal`-only aliases]**",
"""An unknown symbol produces silence and a console line, never an exception, so the lint is the only safety net. **[learner: error `code.unknown-chord` for silent or unparsable symbols; info for `ireal`-only aliases]**

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

`Csus2`, `Csus4` and `Cmaj9` as code are silent; the spellings above are the only ones.""")

# §5.2 matrix
old_matrix = """Verified by voicing every symbol in every dictionary. ✓ = sounds, — = silent. The default dictionary is `ireal`.

| Symbol | `ireal` (default) | `ireal-ext` | `triads` | `lefthand` | `guidetones` |
|---|---|---|---|---|---|
| `C` `Cm` `Co` `Caug` | ✓ | ✓ | ✓ | — | — |
| `C^7` `C7` `Cm7` `Cm7b5` `Co7` | ✓ | ✓ | — | ✓ | ✓ |
| `Cm6` `C69` | ✓ | ✓ | — | ✓ | ✓ |
| `C6` | ✓ | ✓ | — | — | ✓ |
| `C7b9` `C7#9` `C7#11` `C7b13` | ✓ | ✓ | — | ✓ | ✓ |
| `C^9` `Cm9` | ✓ | ✓ | — | — | ✓ |
| `C9` `C13` `Cm11` `C7alt` `Csus` `C7sus` `C^7#11` | ✓ | ✓ | — | — | — |
| minor-major seventh | `Cm^7` | `Cm^7` | — | `CmM7` | `CmM7` |

Rule: **every chord symbol must resolve in the dictionary of its own chain.** `.dict("triads")` takes triads only; `.dict("lefthand")` and `.dict("guidetones")` take sevenths and sixths only. The lint reads the `dict()` in the chain (default `ireal`) and raises `code.chord-not-in-dict` with a fix. Content CI also checks that every `(symbol, dict)` pair used renders at least 2 notes. The `legacy` dictionary and the deprecated `.voicings()` are not used."""
new_matrix = """Verified by voicing every symbol in every dictionary and comparing the pitch classes. ✓ = sounds, with the right notes; — = silent; ✗ = sounds, with **wrong** notes. The default dictionary is `ireal`.

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
- `lefthand`: four-note **rootless** voicings with a 9th or 13th (`C7` → B♭ D E A). Its altered-dominant entries are loose (`C7b9` and `C7b13` are the same four notes; `C7#11` has no 3rd): fine for comping, never the subject of a pitch-class check.
- `guidetones`: two notes, the 3rd and the 7th (or 6th).
- `ireal-ext` (J2.L03): adds colour to plain symbols too (`C` → C E A, `Co` → C E♭ G♭ A).

So a chord's **name** is always taken from its symbol, never worked out from the notes a dictionary produced (contracts §6.7)."""
d.rep(old_matrix, new_matrix)

# §5.3
d.rep("`root:<note>` (root position, root near that note, e.g. `.mode(\"root:g2\")`)",
      "`root:<note>` (root position; the bass is the highest root at or below that note, so `.mode(\"root:g2\")` puts C on C2, A on A1 and G on G2)")
d.rep("6. Hand voicings are note lists: `note(\"<[e3,g3,c4] [f3,a3,c4] [d3,g3,b3] [e3,g3,c4]>\")`.",
"""6. Hand voicings are note lists: `note("<[e3,g3,c4] [f3,a3,c4] [d3,g3,b3] [e3,g3,c4]>")`.
7. **Single voices of a voicing: `n` goes first.** `n("0 1 2 3").chord("<C Am>").voicing()` plays the voicing's notes one at a time, lowest first (E3 C4 E4 G4); numbers past the top continue an octave up. `.n("0 1 2")` written after `.voicing()` does nothing, and `chord(…).n(…)` plays one note per chord. A shared progression drives several parts like this (J1.L05):

```js
setcpm(120/4)

const changes = "<Dm7 G7 C^7 C^7>"

chords: chord(changes).dict("lefthand").voicing().s("rhodes").gain(.5)
bass: chord(changes).rootNotes(2).s("upright")
mel: n("0 1 2 3").chord(changes).voicing().s("vibes")
```""")

# §6
d.rep("`.add(\"<0 3 4>\")` with a bare string does nothing but log a warning (`code.add-on-control`).",
      "`.add(\"<0 3 4>\")` with a bare string, or `.add(3)` with a bare number, does nothing but log a warning (`code.add-on-control`).")

# §9 key changes with arrange
d.rep("`!n` repeats a key for n bars. `.transpose()` stays available for moving by semitones inside one key context (octaves, parallel lines); after a `.scale()` it is flagged `code.transpose-after-scale` when it is used to change key.",
"""`!n` repeats a key for n bars. `.transpose()` stays available for moving by semitones inside one key context (octaves, parallel lines); after a `.scale()` it is flagged `code.transpose-after-scale` when it is used to change key.

**In a piece with sections, the key plan goes after `arrange()`.** Inside `arrange()` every section starts from its own first bar, so a patterned `.scale()` written inside a section const never reaches its second key (`code.arranged-scale-pattern`). Keep the section consts as bare degree patterns and count the key plan in bars of the whole piece:

```js
setcpm(100/4)

const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")
const melChorus = n("<[7 6 4 2] [4 ~ 2 ~]>")

mel: arrange([4, melVerse], [4, melChorus], [4, melChorus]).scale("<C4:major!8 D4:major!4>").s("piano")
```

A chord track written by degree (`n("[0,2,4]").add(n("<0 4 5 3>"))`) takes the same key plan after its own `arrange()`. A `chord("…")` track cannot be re-keyed by a scale: give the lifted section its own const with the new symbols (`chordsLift`).""")

# §10
d.rep("4. `const` is the only declaration keyword. Names are never reused. A helper that is not a section is named for what it is (`changes`, `groove`).",
"""4. `const` is the only declaration keyword. Names are never reused. A helper that is not a section is named for what it is (`changes`, `groove`).
5. `arrange()` may be followed by a method chain (`arrange(…).scale("…").s("piano")`); nothing may wrap it.
6. Sections restart: each one plays from its own first bar every time it appears. Give a section a bar count that is a whole multiple of its pattern's length (an idea written as `<a b c>` is 3 bars long and is cut off in a 4-bar section: `form.section-period`).""")

# §11
d.rep("3. **Microtiming is `.late(t)` / `.early(t)`**, which move the events. `.nudge()` is never used in authored code: it leaves event times unchanged, so the checker cannot see it; for learners it is Studio-only (`code.nudge-studio-only`).",
      "3. **Microtiming is `.late(t)` / `.early(t)`**, which move the events. The amount is JavaScript (`.late(1/32)`); as a string (`.late(\"1/32\")`) it does not shift at all (`code.time-fraction-string`), and the same goes for `.off(\"1/8\", …)`. A patterned amount uses decimals: `.late(\"<0 .02>\")`. `.nudge()` is never used in authored code: it leaves event times unchanged, so the checker cannot see it; for learners it is Studio-only (`code.nudge-studio-only`).")
d.rep("6. Randomness (`?`, `degradeBy`, `sometimesBy`, `rand`, `perlin` as a note source) is never used in an exercise with an exact-match grader. It is fine in Make steps and in rubric-graded work.",
"""6. Randomness (`?`, `degradeBy`, `sometimesBy`, `rand`, `perlin` as a note source) is never used in an exercise with an exact-match grader. It is fine in Make steps and in rubric-graded work.
7. **A control pattern takes its rhythm from the pattern on its left.** `s("hh*16").velocity("1 .35 .6 .35")` does not accent every beat: the four values are spread over the bar, one per beat (1 1 1 1 .35 .35 .35 .35 …). For an accent pattern inside the beat, repeat the cell (`"[1 .35 .6 .35]*4"`) or write one value per step.
8. `.legato(x)` and `.clip(x)` are the same control under two names; use `clip` for "short notes" and `legato` for phrasing.""")
d.rep("hats: s(\"hh*16\").velocity(\"1 .35 .6 .35\").gain(.7)",
      "hats: s(\"hh*16\").velocity(\"[1 .35 .6 .35]*4\").gain(.7)")

# §12 table
d.rep("| Symbol not in the chain's `dict()` | error | error | `code.chord-not-in-dict` |",
      "| Symbol not in the chain's `dict()`, or voiced wrongly by it (`Caug` in `triads`, `C69` in `lefthand`) | error | error | `code.chord-not-in-dict` |")
d.rep("| `.add(\"…\")` on a control pattern | error | error | `code.add-on-control` |",
      "| `.add(\"…\")` or `.add(3)` on an `n()` pattern (argument not wrapped in `n(…)`) | error | error | `code.add-on-control` |")
d.rep("| Missing tempo line; `setcps`; `.cpm()`; `cps` control | error | warning | `code.setcpm-missing` |",
      "| Fraction inside a string time argument (`.late(\"1/16\")`, `.off(\"1/8\", …)`) | error | error | `code.time-fraction-string` |\n| Patterned `.scale(\"<…>\")` inside an `arrange()` section | error | warning | `code.arranged-scale-pattern` |\n| Section length not a multiple of its pattern's length | error | warning | `form.section-period` |\n| Missing tempo line; `setcps`; `.cpm()`; `cps` control | error | warning | `code.setcpm-missing` |")
d.save()
