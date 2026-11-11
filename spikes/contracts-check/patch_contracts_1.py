from patchlib import Doc
d = Doc('/Users/fpl0/Code/Oak/docs/design/contracts.md')

# ---- header
d.rep("Audio behaviour (audibility of controls, sound aliases) cannot be checked headlessly and stays conditional on spike S3; such rows are marked †.",
"Audio behaviour (audibility of controls, sound aliases) cannot be checked headlessly and stays conditional on spike S3; such rows are marked †.\n\nA second, adversarial pass on the same day re-ran every Strudel claim from scratch (scripts and raw output in `spikes/contracts-check/`), re-derived the music theory, and re-checked the course map, the skill order, the unlock table and the checkpoint map by script. What it changed is in §0.13–§0.26 and in the change log.")

# ---- §0 corrections
d.rep("| 0.1 | \"Chord spellings must resolve in every voicing dictionary: `C Cm Co Caug C^7 C7 Cm7 Cm7b5 Co7`\" | No spelling resolves in every dictionary. `triads` holds only triads; `lefthand` and `guidetones` hold only sevenths and sixths. `C Cm Co Caug` resolve in `ireal`, `ireal-ext`, `triads`, `legacy`. `C^7 C7 Cm7 Cm7b5 Co7` resolve in `ireal`, `ireal-ext`, `lefthand`, `guidetones`, `legacy`. |",
      "| 0.1 | \"Chord spellings must resolve in every voicing dictionary: `C Cm Co Caug C^7 C7 Cm7 Cm7b5 Co7`\" | No spelling resolves in every dictionary. `triads` holds only triads; `lefthand` and `guidetones` hold only sevenths and sixths. `C Cm Co` resolve in `ireal`, `ireal-ext`, `triads`, `legacy`; `Caug` resolves correctly only in `ireal` and `ireal-ext` (row 0.13). `C^7 C7 Cm7 Cm7b5 Co7` resolve in `ireal`, `ireal-ext`, `lefthand`, `guidetones`, `legacy`. |")
d.after("| 0.12 | Skill graph \"139 nodes\" | The re-edging adds E12a, E12b (E12 retired), N09, M10, C10. | 143 live nodes, 1 retired ID (§4). |\n",
"""| 0.13 | `Caug` "resolves" in `triads` (first version of this document) | It sounds, but wrongly. `voicings.mjs` 1.2.6 defines `aug: ['1P 3m 5A', …]` (a minor third) in `triads` and `legacy`, so `chord("Caug").dict("triads").voicing()` plays E♭4 A♭4 C5: the pitch classes of an **A♭ major** triad. `ireal` and `ireal-ext` play C E G♯. | `Caug` with `.dict("triads")` is the lint error `code.chord-not-in-dict`. Augmented triads are voiced with the default dictionary or by hand (`note("[c4,e4,g#4]")`). |
| 0.14 | `C69` "resolves" in `lefthand` | `lefthand` defines `69: ['3M 5P 6A 9M']` (an augmented sixth), so `C69` plays E G B♭ D: it sounds as C9, a dominant. `ireal` and `guidetones` are right. | `C69` with `.dict("lefthand")` is `code.chord-not-in-dict`. |
| 0.15 | Toolbox row "`.voicing()` then `.n("0 1 2")` to pick voices" | `chord("<C Am>").voicing().n("0 1 2")` still plays all five notes (`n` is set after the notes exist). `chord("<C Am>").n("0 1 2 3").voicing()` plays one note per chord. `n("0 1 2 3").chord("<C Am>").voicing()` plays E3 C4 E4 G4: the single voices. `n("0 1 2 3").set(chord("<Dm7 G7>")).voicing()` does the same. | Single voices of a voicing are written **`n("…")` first**: `n("0 1 2 3").chord(changes).voicing()` (STYLE §5.3). |
| 0.16 | Time amounts (plan: "microtiming uses `.late()`") | `.late(1/32)` moves the events by 1/32 of a bar. `.late("1/16")` and `.off("1/8", …)` do **not** shift: inside a pattern string `1/16` is "the value 1, slowed 16 times", the same trap as patterned swing (0.7). `.late("<0 .02>")` with decimals works. | Time arguments of `late`, `early`, `off` and `swingBy` are JS expressions (`1/16`); a patterned amount uses decimals. A fraction inside such a string is the lint error `code.time-fraction-string` (`code.swing-fraction-string` for swing). |
| 0.17 | STYLE example `s("hh*16").velocity("1 .35 .6 .35")` as a per-16th accent pattern | A control pattern takes its rhythm from the pattern on its left. The four values are spread over the bar: the 16 hats get 1 1 1 1 .35 .35 .35 .35 .6 … (one value per beat). `"[1 .35 .6 .35]*4"` gives 1 .35 .6 .35 on every beat. | Per-step accent, ghost-note and gain patterns repeat their cell (`"[1 .35 .6 .35]*4"`) or list one value per step (STYLE §11). |
| 0.18 | "Key changes use a patterned `.scale()`" together with "one `arrange()` per track" | Inside `arrange()`, each section plays from its own cycle 0. A section const that carries `.scale("<C4:major!8 D4:major!8>")` therefore stays in C on every appearance. Placed **after** `arrange()`, the same pattern changes key at the right bar and keeps the key context (`arrange([8, a], [8, b], [8, b]).scale("<C4:major!16 D4:major!8>")`: bars 17–24 are in D and say `D4 major`). | The key plan of an arranged piece is one patterned `.scale()` after `arrange()` on each pitched track, or a lifted section const with its own `.scale()` (§6.3, §6.8, STYLE §9). |
| 0.19 | `.add("…")` is a no-op (0.4) | So is a bare number: `n("[0,2,4]").add(3)` logs the same warning and changes nothing. `.add(n(3))` works. | The argument of `.add` on an `n()` pattern is always wrapped in `n(…)`. |
| 0.20 | `tb.clip` and `tb.legato` as two controls | `.legato(.5)` and `.clip(.5)` both put `clip: 0.5` on the event: one control, two names. | Both names stay in the toolbox (short notes in U02.L08, phrasing in U03.L09); the grader and `NEvent.clipDur` read `clip`. |
| 0.21 | `mode("root:g2")` "root near that note" | The bass is the highest root **at or below** the note: with `root:g2`, C → C2, A → A1, F → F2, G → G2. | Described that way in STYLE §5.3; still graded on pitch-class set and bass pitch class only. |
| 0.22 | "`"C4 major"` is an error in Strudel" | No exception is thrown. Strudel logs `[tonal] error: Scale name C4 is incomplete…` and most notes vanish (`n("0 2 4").scale("C4 major")` plays a single G3). | The lint error `code.scale-spaces` is the only safety net; the eval log line is surfaced as `eval` feedback. |
| 0.23 | Plan resolution 1: `lesson.ts` holds "code, exercises, grading, unlocks"; resolution 2: "one unlock table, `content/toolbox.ts`" | The two cannot both own unlocks. | `content/toolbox.ts` is the only place an unlock is declared (§3.1 rule 1); `lesson.ts` is checked against it. |
| 0.24 | Plan resolution 10: "one thread per (subject, day)" and "effort never changes inside a conversation" | Hints (low), chat (medium) and reviews (high) on one subject on one day cannot share one API conversation without changing effort. | One **visible** thread per (subject, day); up to four API conversations behind it, one per thread kind (§10.2). |
| 0.25 | "Voicings are graded on pitch-class set plus bass only" read as "the chord can be recognised from its voicing" | It cannot always. `lefthand` voicings are rootless with a 9th or 13th (`C7` → B♭ D E A); `ireal-ext` adds notes to plain symbols (`C` → C E A, `Co` → C E♭ G♭ A); `guidetones` has two notes. | Chord **identity** (root, quality, Roman numeral) comes from the chord symbol carried by the `_oakChord` shim, never from the sounding notes of a `voicing()` (§6.7). The pitch-class comparison is for "same voicing as the reference" and for hand voicings. |
| 0.26 | `swingBy` and note lengths | `swingBy` delays the off-beat event and keeps every event's length: `s("hh*8").swingBy(1/3, 4)` gives 0–1/8, 1/6–7/24, 1/4–3/8, … 11/12–25/24. The on-beat note is not lengthened; the off-beat note overlaps the next beat (the last one crosses the bar line). | The straightening step of §6.10 moves onsets only. |
""")

# ---- §1.2 grammar
d.rep("| Fact card | `fact\\.[a-z0-9-]+(\\.[a-z0-9#-]+)*` | `fact.n-index`, `fact.keysig.Eb-major` | |",
      "| Fact card | `fact\\.[a-z0-9-]+(\\.[A-Za-z0-9#-]+)*` | `fact.keysig.Eb-major`, `fact.staff.treble.F5` | Later segments may carry note and key names, so capitals and `#` are allowed there. |")
d.rep("| Feedback code | `[a-z]+\\.[a-z0-9-]+` with a registered area | `rhythm.missing`, `code.locked-tool` | §5.7. |",
      "| Feedback code | `[a-z]+(\\.[a-z0-9-]+){1,2}` with a registered area | `rhythm.missing`, `code.locked-tool`, `lint.strict.this` | §5.7. |")

# ---- §2.3 lesson rows
d.rep("| U01.L08 | Three to a Bar | 3/4 waltz feel with `setcpm(bpm/3)`. | R08 | — |",
      "| U01.L08 | Three to a Bar | 3/4 waltz feel with `setcpm(bpm/3)`; meter as \"beats per bar\", with a 2/4 march (`setcpm(bpm/2)`) heard once as the contrast. | R08 | — |")
d.rep("| U02.L01 | High & Low | Pitch and octaves; `note()` on piano; higher/lower by ear. | P01 E02 | — |",
      "| U02.L01 | High & Low | Pitch and octaves; `note(\"c3 c4 c5\").s(\"piano\")` (the letters are explained in L02); higher/lower by ear. | P01 E02 | — |")
d.rep("| U05.L04 | Chord Names & Arpeggios | Lead-sheet symbols C Cm C° C+ and their code spellings `C Cm Co Caug`; `.arp()`. | N05 | — |",
      "| U05.L04 | Chord Names & Arpeggios | Lead-sheet symbols C Cm C° C+ and their code spellings `C Cm Co Caug`, read and typed as answers and seen in read-only `preview` examples (`chord()` stays locked until L08); `.arp()` on hand-stacked triads. | N05 | — |")
d.rep("| U06.L11 | Slash Chords & Walking Down | I–V/7–vi, line cliché, pedal; the bass track decides the inversion. | H15 | C04 |",
      "| U06.L11 | Slash Chords & Walking Down | The descending bass I–V⁶–vi (C–G/B–Am), line cliché, pedal; the bass track decides the inversion. | H15 | C04 |")

# ---- §2.4
d.rep("A capstone opens when the checkpoint named in \"Opens after\" is passed or soft-passed (§7.6). Opening rules that add a condition are spelled out in the row. `ebass` and `.lpf()` unlock when C1.S1 **starts**.",
      "A capstone opens when the checkpoint named in \"Opens after\" is passed or soft-passed (§7.6). Opening rules that add a condition are spelled out in the row; a capstone named there (\"C2\", \"C5\", \"C7\") means that capstone is released. `ebass` and `.lpf()` unlock when C1.S1 **starts** (§3.1 rule 12 covers a learner who puts C1 off). **A capstone never gates a lesson or a checkpoint** (§7.6): a learner may leave one open and carry on, and X1 in particular may stay closed for a while without holding anything else back.")

# ---- §2.6
d.rep("Each track opens at its gate and can interleave with U14–U17. Order inside a track is fixed; order between tracks is the learner's choice.\n**Jazz Harmony** — 34 sessions.",
      "Each track opens at its gate and can interleave with U14–U17. Order inside a track is fixed (J2.L04 is the one lesson that can be passed over, §7.6); order between tracks is the learner's choice. Track checkpoints gate only the track capstones.\n\n**Jazz Harmony** — 34 sessions.")
d.rep("| J.CP1 | Jazz checkpoint 1 | Checkpoint over J1–J2 (J03 only if J2.L04 is done). | — | — |",
      "| J.CP1 | Jazz checkpoint 1 | Checkpoint over J1 and J2.L01–L03. J2.L04 and its node J03 belong to J.CP2, so this checkpoint never waits for U14.CP. | — | — |")
d.rep("| RC1.S1 | Capstone: 16th-Note Funk (1/2) | Drums and bass pocket on a one-chord Dorian vamp. | — | — |",
      "| RC1.S1 | Capstone: 16th-Note Funk (1/2) | Drums and bass pocket on a one-chord minor-seventh vamp (minor pentatonic; Dorian only once U14.L03 has unlocked it). | — | — |")
d.rep("| RC1.S2 | Capstone: 16th-Note Funk (2/2) | Clav and horn stabs; release. | — | — |",
      "| RC1.S2 | Capstone: 16th-Note Funk (2/2) | Clav and horn stabs on a `horns:` track (the `horns` sound unlocks at the start of this session if U15.L05 has not unlocked it yet); release. | — | — |")
d.rep("**Arrangement & Sound** — 20 sessions. Gate: A1.L01–L04 open as optional side lessons once U03.L02 is done; A1.L05–L07 after U09.CP; A2 after U10.CP; AC1 after A.CP; AC2 after A.CP + J3.L04 + R1.L05.",
      "**Arrangement & Sound** — 20 sessions. Gate: A1.L01–L04 open as optional side lessons once U03.L02 is done; A1.L05–L07 after U09.CP; A2 after U10.CP; AC1 after A.CP + U11.CP (its tunes need dominant sevenths and the 12-bar form; Sweet Georgia Brown is offered only once U15.L05 is done); AC2 after A.CP + J3.L04 + R1.L05.")

# ---- §2.8
d.rep("No nursery tunes. Before U13 a tune is used only in a fragment or setting that needs no ties or dots. |",
      "No nursery tunes. Before U13 a tune is used only in a fragment or setting that needs no ties or dots, and before U07.L08 only in one that needs no pickup (start at the first full bar; Auld Lang Syne and Michael, Row the Boat Ashore both begin with one). |")

# ================= §3.1 rules
d.rep("10. Content CI proves, for every lesson, capstone and gym template: each tool, sound, scale name, chord family and mini operator used in a starter, solution, example or required rule is unlocked at or before that session in the default order, unless the example is `preview: true`. It also proves each ID unlocks exactly once and every `unlock.at` exists.",
"""10. Content CI proves, for every lesson, capstone and gym template: each tool, sound, scale name, chord family and mini operator used in a starter, solution, example or required rule is unlocked at or before that session **in every legal order** (§7.6 defines them; the default order alone is not enough for track lessons and side lessons), unless the example is `preview: true`. It also proves each ID has exactly one row and every session named in `unlock.at` exists.
11. **Alternative unlock sites.** A row may name two sessions ("U10.L09 or A1.L04") when a core lesson and a side or track lesson both need the tool. The tool is granted at whichever is completed first (started first, for a START site); the other session then teaches it without a ceremony. `unlock.at` is `SessionId | SessionId[]`. A session S may use a tool when one of the tool's sites is S itself or is guaranteed to precede S in every legal order.
12. **START rows and a capstone that is put off.** `snd.ebass` and `tb.lpf` are granted when C1.S1 starts. Because a capstone never gates a lesson (§7.6), a learner who has not started C1 when U03.L03 is completed is granted both at that moment, silently; C1 still shows the ceremony when it starts. So lessons up to U03.L03 never use them in learner code, and from U03.L04 on they are available in every legal order. `tb.feature.album` is granted when the learner's first capstone session of any capstone starts (C0.S1 in the default order). `snd.choir`, the `tb.template.*` rows and the `tb.feature.transcribe.*` modes are needed by no lesson and have no fallback. The three Transcribe modes are project templates for the learner's own audio; ladder levels, X1, X2 and CF-T always present the layers their stage needs, whatever is unlocked.""")

# ================= §3.2 rows
d.rep("| `tb.feature.album` | Album | C0.S1 | first track | — |  |",
      "| `tb.feature.album` | Album | C0.S1 | first track | — | START of the first capstone session the learner begins (rule 12) |")
d.rep("| `tb.mini.sub` | `[a b]` | U01.L04 | subdivision | — |  |",
      "| `tb.mini.sub` | `[a b]` | U01.L04 | subdivision | U00.L01 |  |")
d.rep("| `tb.meter.3-4` | tempo line `setcpm(bpm/3)` | U01.L08 | 3/4 | — |  |",
      "| `tb.meter.3-4` | tempo line `setcpm(bpm/3)` | U01.L08 | 3/4 | — |  |\n| `tb.meter.2-4` | tempo line `setcpm(bpm/2)` with `meter: '2/4'` | U01.L08 | meter as beats per bar | — | heard as a contrast in U01.L08; used by trad repertoire later |")
d.rep("| `tb.note.names` | note names with octave (`c4 e4`) | U02.L02 | letter names, C4 = 60 | — |  |",
      "| `tb.note.names` | note names with octave (`c4 e4`) | U02.L01 | a pitch is written as a letter plus an octave number | — | U02.L01 uses C in several octaves; U02.L02 explains the seven letters and C4 = 60 |")
d.rep("| `tb.s.pitched` | `.s(\"…\")` on pitched patterns | U02.L06 | timbre | U00.L01 |  |",
      "| `tb.s.pitched` | `.s(\"…\")` on pitched patterns | U02.L01 | an instrument plays the pitch (`.s(\"piano\")`) | U00.L01 | choosing between instruments is U02.L06, where the synth waves unlock |")
d.rep("| `tb.legato` | `.legato(x)` | U03.L09 | phrasing | — |  |",
      "| `tb.legato` | `.legato(x)` | U03.L09 | phrasing | — | the same control as `.clip(x)` under its phrasing name (§0.20) |")
d.rep("| `tb.dict.triads` | `.dict(\"triads\")` | U05.L08* | three-note voicings | — |  |",
      "| `tb.dict.triads` | `.dict(\"triads\")` | U05.L08* | three-note voicings | — | `C Cm Co` only: this dictionary voices `Caug` wrongly (§0.13) |")
d.rep("| `tb.mode.root` | `.mode(\"root:g2\")` | U06.L11 | root-position voicings near a chosen bass note | — |  |",
      "| `tb.mode.root` | `.mode(\"root:g2\")` | U06.L11 | root-position voicings with the root at or below a chosen note | — | §0.21 |")
d.rep("| `tb.dict.lefthand` | `.dict(\"lefthand\")` | U12.L06 | left-hand piano voicings | — |  |",
      "| `tb.dict.lefthand` | `.dict(\"lefthand\")` | U12.L06 | left-hand piano voicings | — | rootless, with a 9th or 13th; `C69` is wrong in it (§0.14) |")
d.rep("| `tb.voicing.n` | `.voicing()` then `.n(\"0 1 2\")` to pick voices | J1.L05 | shells and arpeggiated voicings | — |  |",
      "| `tb.voicing.n` | `n(\"0 1 2 3\").chord(changes).voicing()`: `n` first, to play single voices of the voicing | J1.L05 | shells and arpeggiated voicings | — | `.n()` after `.voicing()` does nothing (§0.15) |")
d.rep("| `tb.set` | `.set(pattern)` | J1.L05 | one chord pattern drives every part | — |  |",
      "| `tb.set` | `.set(pattern)`, as in `n(\"0 1 2 3\").set(chord(changes)).voicing()` | J1.L05 | one chord pattern drives every part | — |  |")
d.rep("| `chord.triad` | `C Cm Co Caug` | U05.L08* | triads | U00.L01; Band from U01 | dicts: ireal, ireal-ext, triads |",
      "| `chord.triad` | `C Cm Co Caug` | U05.L08* | triads | U00.L01; Band from U01 | dicts: ireal, ireal-ext, triads (`Caug`: ireal and ireal-ext only) |")
d.rep("| `chord.sixth-sus` | `C6 Cm6 C69 Csus C7sus` | J1.L02 | sixths and sus | — | dict coverage varies: STYLE §5 table |",
      "| `chord.sixth-sus` | `C6 Cm6 C69 Csus C7sus C2 Cadd9` | J1.L02 | sixths, sus and add chords | — | dict coverage varies: STYLE §5 table; `Csus C7sus C2 Cadd9` are ireal-only |")
d.rep("| `chord.alt` | `C7b9 C7#9 C7#11 C7b13 C7alt` | J2.L02 | altered dominants | — | `C7alt` is ireal-only |",
      "| `chord.alt` | `C7b9 C7#9 C7#11 C7b13 C7alt`, and the minor-major seventh `Cm^7` | J2.L02 | altered dominants; the tonic colours of the minor ii–V–i | — | `C7alt` is ireal-only; minor-major seventh is `Cm^7` in ireal and `CmM7` in lefthand and guidetones |")
d.rep("| `snd.ebass` | `ebass` (gm_electric_bass_pick:0) | C1.S1 | a real bass for the first loop | U00.L01; Band from U01 | unlocks at the START of C1.S1 |",
      "| `snd.ebass` | `ebass` (gm_electric_bass_pick:0) | C1.S1 | a real bass for the first loop | U00.L01; Band from U01 | unlocks at the START of C1.S1; fallback grant on completing U03.L03 (rule 12) |")
d.rep("| `snd.horns` | `horns` (gm_brass_section:0) | U15.L05 | stabs on dominant chains | — |  |",
      "| `snd.horns` | `horns` (gm_brass_section:0) | U15.L05 or RC1.S2 | stabs on dominant chains; funk stabs | — | START at RC1.S2 (rule 11) |")
d.rep("| `tb.lpf` | `.lpf(hz)` (taught as the bass preset `.lpf(600)`) | C1.S1 | a darker bass | Band production defaults | unlocks at the START of C1.S1 together with `ebass` |",
      "| `tb.lpf` | `.lpf(hz)` (taught as the bass preset `.lpf(600)`) | C1.S1 or A1.L02 | a darker bass; filters | U00.L01; Band production defaults | unlocks at the START of C1.S1 together with `ebass`; fallback grant on completing U03.L03 (rule 12) |")
d.rep("| `tb.delay` | `.delay(x)` | U10.L09 | echo for ballads | — |  |",
      "| `tb.delay` | `.delay(x)` | U10.L09 or A1.L04 | echo for ballads; space | — | rule 11 |")
d.rep("| `tb.distort` | `.distort(x)` | U11.L03 | grit for riffs | — |  |",
      "| `tb.distort` | `.distort(x)` | U11.L03 or A1.L05 | grit for riffs | — | rule 11 |")
d.rep("| `tb.pan` | `.pan(x)` | U14.L06 | stereo space | Band production defaults |  |",
      "| `tb.pan` | `.pan(x)` | U14.L06 or A2.L05 | stereo space; the mix | Band production defaults | rule 11 |")
d.rep("| `tb.tremolo` | tremolo controls † | A1.L06 | tremolo | — |  |",
      "| `tb.tremolo` | `.tremolosync(n)` `.tremolodepth(x)` † | A1.L06 | tremolo | — | both exist as controls in core 1.2.6; audibility is S3's call |")
d.rep("Legend: `*` = behind the voicing gate (rule 6). † = audibility pending spike S3 (rule 7). \"START\" rows unlock when the session starts.",
      "Legend: `*` = behind the voicing gate (rule 6). † = audibility pending spike S3 (rule 7). \"START\" rows unlock when the session starts. \"X or Y\" = alternative sites (rule 11). Every control name in group H was checked to exist on `Pattern.prototype` in `@strudel/core` 1.2.6 (`partials`, `distorttype`, `tremolosync`, `tremolodepth`, `lprate`, `lpdepth`, `duckorbit`, `duckdepth` included); `scope`, `fscope` and `piano` do not exist in the grader realm and are stubbed there (§11.4).")

# ================= §4.2 / §4.3
d.rep("is introduced either in a lesson that is reachable no later than L in every legal order (core default order plus the track gates in §2.6), or earlier in L's own ordered `introduces` list.",
      "is introduced either in a lesson that is guaranteed to come before L in every legal order (§7.6: linear core, track gates of §4.3), or earlier in L's own ordered `introduces` list.")
d.rep("| J.CP1 | JC1 · R.CP → RC1, RC2 · A.CP → AC1 · A.CP + J3.L04 + R1.L05 → AC2 · J4.L04 → JC2 · J.CP2 → JC3, JC4 |",
      "| J.CP1 | JC1 |\n| R.CP | RC1, RC2 |\n| A.CP + U11.CP | AC1 (Sweet Georgia Brown as its tune also needs U15.L05) |\n| A.CP + J3.L04 + R1.L05 | AC2 |\n| J4.L04 completed | JC2 |\n| J.CP2 | JC3, JC4 |")

# ================= §5.6 rubric
d.rep("  | { rule: 'uses'; tool: ToolId | ToolId[]; min?: number }             // amended: toolbox IDs, like AstConstraint 'must-use'\n```",
      "  | { rule: 'uses'; tool: ToolId | ToolId[]; min?: number }             // amended: toolbox IDs, like AstConstraint 'must-use'\n  | { rule: 'swing'; track: TrackRef | TrackRef[]; drums?: DrumRole[]; subdivision: 8 | 16; ratio: [number, number] }\n      // amended: a priority list of tracks, an optional drum-sound filter, and the subdivision that swings (§6.6)\n```")
d.rep("`swing` keeps its required `track` field: the rule always names the track it measures (ride, hats or comping), never a quarter-note bass.",
      "`swing` always names the track or tracks it measures (hats, ride or comping), never a quarter-note bass; how it picks among them is in §6.6.")

# ================= §5.7 feedback codes
d.rep("| `code.chord-not-in-dict` | E | the symbol is valid but not in the `dict()` of this chain; suggests a dict or a spelling |",
      "| `code.chord-not-in-dict` | E | the symbol is valid but the `dict()` of this chain does not carry it, or voices it wrongly (`Caug` in `triads`, `C69` in `lefthand`); suggests a dict or a spelling |")
d.rep("| `code.range-spacing` | E | `0..7` without spaces |",
      "| `code.range-spacing` | E | `0..7` without spaces |\n| `code.time-fraction-string` | E | a fraction inside a string argument of `late`, `early` or `off` (`.late(\"1/16\")` does not shift; write `.late(1/16)`) |\n| `code.arranged-scale-pattern` | W | a patterned `.scale(\"<…>\")` inside a const that is used as an `arrange()` section: it restarts with the section; put the key plan after `arrange()` |\n| `form.section-period` | W | a section's bar count is not a multiple of its pattern's period, so the idea is cut off |")

# ================= §5.10 band
d.rep("7. A flavour never changes a rubric (§6.6). The learner's flavour choice (Settings → Learning, or per capstone) selects the Band code and the starter sounds only.",
      "7. A flavour never changes a rubric (§6.6). The learner's flavour choice (Settings → Learning, or per capstone) selects the Band code and the starter sounds only.\n8. **Starter sounds follow the unlock table.** A flavour's `sounds` swap is applied to code the learner edits (a starter, a solution, a hint patch) only when that sound is unlocked for the session. Otherwise the default stays: `piano` for lead and chords, `ebass` for bass (`piano` before `ebass` unlocks), the default kit for drums. The Band may use the kit's sounds at any time, because it is a preview context. A jazz-soul learner therefore hears vibes and Rhodes in the Band from U01 and writes with `piano` until `rhodes` (U05.L08) and `vibes` (J1.L01) unlock; content CI checks every flavour's starter against the unlock table.")

# ================= §6.2 roles
d.rep("`keys gtr horns` and any other label → `inferRoles` (drum sounds only → drums; lowest monophonic pitched line → bass; polyphonic → chords; highest monophonic → melody).",
      "`keys gtr horns` and any other label → `inferRoles`. `inferRoles` decides in this order: (a) a track whose events are all drum sounds is drums; (b) a pitched track is polyphonic, and so chords, when at least 25% of its onsets carry two or more pitches; (c) among the remaining monophonic tracks, the one with the lowest median pitch is bass if that median is below C3 (MIDI 48); (d) the monophonic track with the highest median pitch is melody, and any others are extra melody lines. A single monophonic track is melody unless its median is below C3. Ties go to the track written first.")

# ================= §6.3 form
d.rep("5. `key-change` and `contrast` take `SectionRef`s resolved through the same section list. A key lift needs a final section of at least 8 bars (`minBarsAfter`), which removes the old \"two 4-bar windows\" problem.",
"""5. `key-change` and `contrast` take `SectionRef`s resolved through the same section list. A key lift needs a final section of at least 8 bars (`minBarsAfter`), which removes the old "two 4-bar windows" problem.
6. `arrange()` may be followed by a method chain on the same track (`arrange(…).scale("…").s("piano").room(.2)`). A track is "arranged" when its labelled expression has exactly one `arrange()` call at the root of that chain; `sectionsFromAst` reads it there.
7. **Sections restart.** Executed against 1.2.6: inside `arrange()` each section plays from its own cycle 0 (`arrange([2, a], [3, b], [2, a])` plays a's first two bars both times). Two consequences bind. A section's bar count must be a whole multiple of its pattern's period, or the idea is cut off mid-way (`form.section-period`, a warning). And anything that must change **across** sections (a key plan, a long build) is applied after `arrange()`, never inside a section const (§6.8 item 4). The grader evaluates the first pass of the piece only.
8. Golden rubric tests cover the convention: for each of `form`, `contrast`, `key-change` and `groove-lock`, one piece that passes under per-track `arrange()` and one that fails only because two tracks disagree about the sections.""")

# ================= §6.4
d.rep("| `lesson` | lesson steps, Make, drills, checkpoints, gym L1–L5 | `max(reference.bars, periodOf(answer) ≤ 16)`, at most 64 |",
      "| `lesson` | lesson steps, Make, drills, checkpoints, gym L1–L5 | `min(64, max(reference.bars, min(16, periodOf(answer))))` |")

# ================= §6.6 capstones
d.rep("| **C0 Intro** | `bars` 4–8;", "| **C0 Intro** | 4/4; `bars` 4–8;")
d.rep("`cadence` at bars 7–8 of type PAC, IAC or PC, ending on I;",
      "`cadence` at bars 7–8 of type PAC, IAC or PC (authentic, perfect or imperfect: V→I; or plagal: IV→I), ending on I;")
d.rep("chords are dominant-seventh pitch-class sets; `swing` on the hats or ride track, ratio in [1.6, 2.4];",
      "chords are dominant-seventh pitch-class sets; `swing` (subdivision 8) on the hi-hat or ride line, ratio in [1.6, 2.4];")
d.rep("bass and kick both at beat 1 of every bar; a `horns` track present |",
      "bass and kick both at beat 1 of every bar; a track labelled `horns` with at least 2 onsets in every 2 bars (stabs; any unlocked sound) |")
d.rep("`polyrhythm` 3:2 between two named tracks (3 even onsets against 2 per bar); `uses tb.mini.euclid` ≥ 1 |",
      "`polyrhythm` 3:2 between two named tracks (3 even onsets against 2 per bar); `uses tb.mini.euclid` ≥ 1. For reference, the `clave` rule's other grids: son 2-3 swaps the two bars; rumba 3-2 is bar A {0, 3/8, 7/8}, bar B {2/8, 4/8}. |")
d.rep("| **AC1 One Tune, Two Genres** | both versions:", "| **AC1 One Tune, Two Genres** | Opens after A.CP + U11.CP. Both versions:")
d.rep("Every capstone also gets a tutor review (§10.6), which never affects pass or fail.",
"""**Which track a `swing` rule measures.** `track` is a list in priority order. The rule uses the first listed track that, after the optional `drums` filter, has at least 4 measurable beats on the rule's subdivision (a beat is measurable when it has an onset at its start and exactly one inside it). C5 uses `track: ['hats', '@drums'], drums: ['hatClosed', 'hatOpen', 'ride'], subdivision: 8`; JC2 uses the same list followed by `'chords'`; AC2 uses `['hats', '@drums']` with `subdivision: 16`. If no listed track is measurable the rule fails with `rhythm.swing-missing` and names the line to swing.

Every capstone also gets a tutor review (§10.6), which never affects pass or fail.""")

# ================= §6.7 voicings
d.rep("2. The grader realm wraps `Pattern.prototype.voicing` with the `_oakChord` shim so the source symbol survives on each voiced note; if spike S1 shows the shim does not survive, chord identity falls back to `identifyChord` on the sounding notes.",
      "2. The grader realm wraps `Pattern.prototype.voicing` with the `_oakChord` shim (`this.fmap(v => ({ ...v, _oakChord: v.chord }))` before the original call) so the source symbol survives on each voiced note. Executed on the main thread against 1.2.6: the tag survives `.voicing()`, `.s()`, `.struct()` and the `n(…).chord(…).voicing()` form (whose notes come out as MIDI numbers, not names). **Chord identity (root, quality, Roman numeral, triad core) always comes from the symbol**, because rootless, extended and two-note voicings cannot be identified from their notes (§0.25). If spike S1 finds the shim unreliable inside a Worker, the fallback is the symbol read from the event's source location (`locs` → the mini-notation leaf inside `chord(\"…\")`); `identifyChord` on sounding notes is used only for hand-voiced note lists and `n()` stacks.")
d.rep("5. Inversions and slash chords are read from the lowest sounding note across all pitched learner tracks at the chord's onset, so a separate `bass:` track sets the inversion.",
"""5. Inversions and slash chords are read from the lowest sounding note across all pitched learner tracks at the chord's onset, so a separate `bass:` track sets the inversion. A default `voicing()` with no bass track often has the 3rd or 5th lowest (`chord("C").voicing()` → E3 C4 E4 G4 C5), so a rule that needs root position (`cadence` PAC) is only authored where the lesson has given the learner a way to put the root in the bass.
6. A `(symbol, dict)` pair that Strudel voices wrongly (`Caug` in `triads`, `C69` in `lefthand`) is treated exactly like a missing pair: lint error `code.chord-not-in-dict`, never authored, never an expected answer. STYLE §5.2 is the list; a content-CI test re-derives it by voicing every pair and comparing pitch classes with `@oak/theory`.
7. `@oak/theory` owns the single chord-spelling table (STYLE §5.1): quality ↔ code spelling ↔ lead-sheet display ↔ jazz glyph. `parseChordSymbol`, `toLeadSheet`, `toCode` and the lint's chord-family map all derive from it; no other package spells a chord.""")

# ================= §6.8 key changes
d.rep("3. If the AST has a `.transpose` later in the same chain as a `.scale`, analysis ignores `scaleCtx` for that track and uses the per-section `keyEstimate`; the lint adds `code.transpose-after-scale` (warning for learners, error in content).",
"""3. If the AST has a `.transpose` later in the same chain as a `.scale`, analysis ignores `scaleCtx` for that track and uses the per-section `keyEstimate`; the lint adds `code.transpose-after-scale` (warning for learners, error in content).
4. **Key changes in an arranged piece.** Sections restart (§6.3 item 7), so a patterned `.scale()` inside a section const never reaches its later keys. The binding form, executed against 1.2.6: section consts are bare degree patterns and the key plan follows `arrange()` on each pitched track, counted in bars of the whole piece:

   ```js
   const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")
   const melChorus = n("<[7 6 4 2] [4 ~ 2 ~]>")

   mel: arrange([8, melVerse], [8, melChorus], [8, melChorus]).scale("<C4:major!16 D4:major!8>").s("piano")
   ```

   The alternative is a lifted section with its own const (`const melLift = melChorusNotes.scale("D4:major")`). Chord tracks written by degree (`n("[0,2,4]").add(n("<0 4 5 3>"))`) take the same key plan after `arrange()`; `chord("…")` tracks need a lifted const with the new symbols. Both forms keep `scaleCtx` right per bar. The lint flags a patterned `.scale()` inside an arranged section (`code.arranged-scale-pattern`).""")

# ================= §6.10 swing
d.rep("5. Patterned amounts use decimals (`.swingBy(\"<0 .1 .2 .33>\", 4)`); a fraction inside the string is the lint error `code.swing-fraction-string`.",
      "5. Patterned amounts use decimals (`.swingBy(\"<0 .1 .2 .33>\", 4)`); a fraction inside the string is the lint error `code.swing-fraction-string`.\n6. **Straightening, exactly.** `swingBy` delays the off-beat event by `amount / 2` of a slot (a slot is a beat for 8th swing, half a beat for 16th swing) and keeps every event's length, so a swung off-beat note overlaps the next slot and the last one of a bar crosses the bar line (§0.26). Straightening subtracts `amount / 2 × slot` from the onset of each off-beat event and leaves durations alone; the notation quantizer then clips a note at the next onset on its track.")

# ================= §6.12 transcription
d.rep("- Own-audio work (L7, L8) is `grading.mode: 'self'`: a checklist, `status: 'ungraded'`, evidence weight 0.3 flagged `selfReported`.",
      "- **Pattern source.** Ladder stimuli (L1–L6, X1, X2, CF-T) have no audio file. The hidden reference code plays through a second, hidden adapter instance: rate is a cps scale (25–100%), transposition is `.transpose(semitones)` on the pitched tracks, the A–B loop is `.ribbon(fromBar, bars)`, and a bar timeline replaces the waveform and spectrogram. Fine-tune is disabled for pattern sources. The hidden code never enters an editor or the DOM, and reaches the tutor only as §10.5 allows.\n- Own-audio work (L7, L8) is `grading.mode: 'self'`: a checklist, `status: 'ungraded'`, evidence weight 0.3 flagged `selfReported`.")

# ================= §7.3 families
d.rep("| `fam.rhy.echo` | Pr | U01.L04 (L6 U11.L07; L7 U13.L04) | E01 | rhythm |",
      "| `fam.rhy.echo` | Pr | U01.L04 (L5 U13.L01; L6 U11.L07, its triplet items from U13.L05; L7 U13.L04) | E01 | rhythm |")
d.rep("| `fam.rhy.read` | Pr | U01.L05 | N01 | rhythm |",
      "| `fam.rhy.read` | Pr | U01.L05 (dotted and tied figures from U13.L03) | N01 | rhythm |")
d.rep("| `fam.rhy.swing` | P | U11.L07 | R13 | rhythm |",
      "| `fam.rhy.swing` | P | U11.L07 (L4 R1.L02) | R13 | rhythm |")
d.rep("| `fam.key.scale-spell` | C | U03.L01 (L3 U10.L01; L4 U11.L01; L5 U14.L01) | S01 | — |",
      "| `fam.key.scale-spell` | C | U03.L01 (L3 U10.L01, harmonic and melodic forms from U10.L06 and U10.L08; L4 U11.L01, blues from U11.L03; L5 U14.L01, each mode from its own lesson) | S01 | — |")
d.rep("| `fam.deg.index` | C | U03.L02 (L3 U10.L01; L4 U14.L01) | S02 | — |",
      "| `fam.deg.index` | C | U03.L02 (L3 U10.L01; L4 U14.L01; new L5 U15.L01: chromatic steps ♯4 ↔ `3#`, ♭7 ↔ `6b`, ♭3 ↔ `2b`, ♭6 ↔ `5b`, ♭2 ↔ `1b`) | S02 | — |")
d.rep("| `fam.chd.quality-7th` | P | U12.L02 (L3 U12.L03) | E11 | harmony |",
      "| `fam.chd.quality-7th` | P | U12.L02 (L3 U12.L03; L5 J1.L02 for 6 and m6, J2.L02 for the minor-major seventh) | E11 | harmony |")
d.rep("| `fam.har.rn` | C | U06.L02 (L3 U10.L04; L4 U12.L04; L5 U15.L02, U16.L01) | N06 | — |",
      "| `fam.har.rn` | C | U06.L02 (L3 U10.L04, the harmonic-minor V from U10.L06; L4 U12.L04; L5 U15.L02, U16.L01) | N06 | — |")
d.rep("| `fam.har.function` | C/P | U06.L03 | H02 | harmony |",
      "| `fam.har.function` | C/P | U06.L03 (L3 U10.L04; L4 U12.L04, applied chords from U15.L02) | H02 | harmony |")
d.rep("| `fam.har.cadence` | P | U06.L04 PAC vs HC, then IAC (L2 plagal U06.L07 and deceptive U06.L06; L4 U14.L02) | H03 | harmony |",
      "| `fam.har.cadence` | P | U06.L04. Ladder re-cut to the merged lesson: L1 PAC vs HC · L2 + IAC · ★L3 + plagal and deceptive (gate U06.L07) · L4 + ♭VII–I and minor cadences (gate U14.L02) | H03 | harmony |")
d.rep("| `fam.har.schema` | P | U06.L06 (L2 U06.L07; L3 U11.L05; L4 U10.L07; L5 U14.L06; L6 J1.L03) | H04, H05 | harmony |",
      "| `fam.har.schema` | P | U06.L06. Ladder re-cut to the lesson order: L1 axis vs three-chord · L2 + axis-vi, doo-wop (U06.L07) · ★L3 + aeolian, andalusian (U10.L07) · L4 + blues12 (U11.L05) · L5 + mixolydian, dorian vamp (U14.L06) · L6 + ii–V–I (J1.L03) | H04, H05 | harmony |")
d.rep("| `fam.key.mode` | P | U10.L01 (L3+ U14.L03) | E10 | pitch |",
      "| `fam.key.mode` | P | U10.L01 (L3 and L4 U14.L03; L5 U14.L05) | E10 | pitch |")
d.rep("`fam.not.read` is the daily **\"Read it\"** family:",
"""**Level and category gates.** Every category of a family names the lesson that teaches it (`unlockAt`), and the generator samples only categories whose lesson is completed. A level opens at the gate in the table and is filled from its open categories; a family is promoted past a level only when every category of that level is open. So no trial ever asks for something untaught, even where one level of the original ladder mixes material from two lessons (the notes in brackets above name those cases).

The critique's "`fact.n-index` card" is `fam.deg.index`: its new level 5 carries the chromatic step pairs, and `packages/theory` has a golden test for each pair of STYLE §6 in C, G, F, D and E♭ major and in A minor.

`fam.not.read` is the daily **"Read it"** family:""")

# ================= §7.4 governor
d.rep("Leftovers stay due without any penalty or display.",
      "Leftovers stay due without any penalty or display. On a day with no lesson, `/practice/review` plans the same budget and then offers \"a little more\" in budget-sized blocks, up to **12 minutes** in total.")
d.rep("**When the cap is hit.** A new family seeded by a lesson while 12 are active is created `deferred`.",
      "**Gated ladders.** A family whose next level is closed by a lesson the learner has not completed counts as being at its mastery level, for graduation only, while it sits at its highest open level with stability ≥ 21 days and two Good-or-better ratings. (Otherwise `fam.rhy.read`, whose dotted figures wait for U13.L03, would hold one of the 12 slots for months.) When the gating lesson is completed the family is recalled like any other member and climbs on.\n\n**When the cap is hit.** A new family seeded by a lesson while 12 are active is created `deferred`.")
d.rep("p95 age of the oldest undelivered due card ≤ 7 days; deferred queue p95 ≤ 4 cards.",
      "p95 age of the oldest undelivered due card ≤ 7 days; deferred queue p95 ≤ 4 cards; p95 of a planned reviews-only day ≤ 720 s.")

# ================= §7.6 gates
d.rep("**Gates.** The next unit's **L01 and L02 are always open**. L03 and later need the previous checkpoint passed or soft-passed. Never gated: Studio, Practice, Transcribe and the gym, the tutor, the album, lesson replays, the optional A1 side lessons.",
"""**Gates and the legal orders.** These rules define every order in which a learner can meet the content; "every legal order" in §3.1 and §4.2 means exactly this.

1. **Core lessons are linear.** A core lesson opens when the lesson before it in §2.3 is completed, across unit boundaries. Nothing in the core can be skipped ahead.
2. **L01 and L02 of a unit need nothing else. L03 and later also need the most recent checkpoint before that unit** passed or soft-passed. For the units that follow a unit without its own checkpoint this reads: U08.L03 onward and all of U09 need U07.CP; U12.L03 onward and all of U13 need U11.CP; U15.L03 onward, U16 and U17 need U14.CP.
3. A checkpoint opens when the last lesson it covers is completed; the planner places it after the next unit's L01.
4. **A capstone never gates a lesson, a checkpoint or a unit.** It opens by §2.4 and §4.3, and the only things it holds back are other capstones named there (C2 → X1, C5 → X2, C7 → CF-A). Gym slots are scheduling, not gates.
5. **Tracks.** A track lesson opens when its gate in §4.3 is met and the previous lesson of its track is completed. J2.L04 is the one lesson that can be passed over: while U14.CP is unpassed the track goes on to J.CP1 and J3, and J2.L04 is offered as soon as U14.CP is passed. Track checkpoints gate only track capstones.
6. Never gated: Studio, Practice, Transcribe and the gym, the tutor, the album, lesson replays.

The default order of §2.5 is one legal order; from Today the learner may pick any other.""")
d.rep("| U02.CP | P01–P06 N02 [E02 V01] |", "| U02.CP | P01–P06 N02 D01 [E02 V01] |")
d.rep("| U07.CP | M01–M07 M10 N07 F01 [V04] |", "| U07.CP | M02–M07 M09 M10 N07 F01 [V04] |")
d.rep("| J.CP1 | J01 J02 J04–J08 C09 [V06] · J.CP2: J03 J09–J14 B05 · R.CP: R13–R18 · A.CP: D02–D11 |",
      "| J.CP1 | J01 J02 J04–J08 C09 [V06] |\n| J.CP2 | J03 J09–J14 B05 |\n| R.CP | R14–R18 [E14] |\n| A.CP | D02–D11 |")
d.rep("### 7.7 Debt",
      "Every one of the 143 nodes is in exactly one checkpoint as a first listing. A bracketed skill that appears again in a later checkpoint (V04 in U07.CP, E10 in U14.CP, E14 in R.CP) is a re-test: it sets the level again, and the first listing is the one §7.5 means by \"that checkpoint\". D05 is introduced in U02.L08 but is checked in A.CP with the rest of the sound nodes; until then it can reach `practiced`, not `mastered`.\n\n### 7.7 Debt")

# ================= §9
d.rep("The 20-minute row leaves one minute of slack on purpose. Checkpoint day: 3 + 12 + 4 + 1. Capstone day: 3 + 15 work + 1 (the draft save is the Make). Gym day: 4 + 14 transcription + 1 (the saved transcription version is the Make).",
      "The 20-minute row leaves one minute of slack on purpose. Checkpoint day: 3 + 12 + 4 + 1 at **every** target (the checkpoint is never split; a 15-minute learner sees \"Checkpoint day: about 20 minutes\" on Today and may wrap up with a Quick sketch instead of the Make). Capstone day: 3 + work + 1, with 11 / 15 / 20 minutes of work at the 15 / 20 / 25 targets (the draft save is the Make). Gym day: 4 + transcription + 1, with 10 / 14 / 19 minutes (the saved transcription version is the Make).")
d.rep("So the author's own expert estimates add up to at most **9.3 minutes**.",
      "So the author's own expert estimates add up to at most **9.25 minutes** (13 / 1.4 = 9.29; `minutes` is written in steps of 0.25).")
d.rep("Part A = steps up to and including `wrapAt`, then a one-to-two-minute Quick sketch that saves the current workbench, then Coda.",
      "Part A = steps up to and including `wrapAt`, then a Quick sketch (budgeted at 1.5 minutes) that saves the current workbench, then Coda.")

# ================= §11.12 browsers
d.rep("## 12. Resolution ledger",
"""### 11.12 Supported browsers

Chromium-based desktop browsers only: Chrome, Arc and Edge, current stable and the one before it. Any other engine gets a static "Open Oak in Chrome" page before app code loads. The reasons are `AudioContext.getOutputTimestamp()` for tap timing, AudioWorklet with raw microphone constraints, the fake-microphone end-to-end tests, and Safari's voice ducking. No code path, polyfill or test targets another engine.

## 12. Resolution ledger""")

# ================= §12 ledger rows
d.rep("| F6 | Canonical chord spellings silent outside `ireal` | §0.1, §0.2; STYLE §5 (dictionary-aware table and lint); §3.3 step 3 |",
      "| F6 | Canonical chord spellings silent outside `ireal` | §0.1, §0.2, §0.13, §0.14; STYLE §5 (dictionary-aware table and lint; the golden \"(symbol, dict) renders ≥ 2 right notes\" test); §3.3 step 3; §6.7 item 7 (the single `toLeadSheet` table in `@oak/theory`) |")
d.rep("| F7 | Chromatic step strings off by one | §0.5; STYLE §6; `tb.n.chromatic` in §3.2; `code.chromatic-step` |",
      "| F7 | Chromatic step strings off by one | §0.5; STYLE §6; `tb.n.chromatic` in §3.2; `code.chromatic-step`; the pairs join `fam.deg.index` at level 5 and get golden tests (§7.3) |")
d.rep("| F11 | Form checks vs per-track checks under `arrange()` | §6.3; STYLE §10; `key-change`, `contrast` in §5.6 |",
      "| F11 | Form checks vs per-track checks under `arrange()` | §6.3 (items 6–8: chains after `arrange()`, sections restart, golden rubric tests); §6.8 item 4; STYLE §9, §10; `key-change`, `contrast` in §5.6 |")
d.rep("| F13 | Ladder stimuli have no audio to load | §2.9, §6.12 (pattern source); offline renderer stays a W7 item |",
      "| F13 | Ladder stimuli have no audio to load | §2.9, §6.12 (pattern source: cps rate, `.transpose()`, `.ribbon()` loop, bar timeline); offline renderer stays a W7 item |")
d.rep("| F16 | SRS models conflict; no realistic load check | §7.1–§7.4 (one card per family, one grade map, governor, 300-day CI) |",
      "| F16 | SRS models conflict; no realistic load check | §7.1–§7.4 (one card per family, one grade map, governor, 300-day CI on the warm-up budget and on the 12-minute reviews-only day; graduation into composites is the retirement and merging the critic asked for) |")
d.rep("| F17 | Mastery, checkpoint and gate rules specified four ways; singing can block | §7.5–§7.7, §8.5 |",
      "| F17 | Mastery, checkpoint and gate rules specified four ways; singing can block | §7.5–§7.7 (one map keyed to the curriculum's CP IDs; one definition of the legal orders), §8.5. The two-part checkpoint the critic proposed is superseded by L7's one-part session. |")
d.rep("| F18 | Skill-graph edges contradict lesson order | §4.1 (re-edged, machine-checked), §4.2 (CI rule) |",
      "| F18 | Skill-graph edges contradict lesson order | §4.1 (re-edged, machine-checked twice), §4.2 (CI rule over every legal order, §7.6). R13 follows the learner critic's edge (← R05 R08), not the feasibility critic's (← R05 R07). |")
d.rep("| F22 | The plan collapses under its own size | Plan waves and just-in-time authoring;",
      "| F22 | The plan collapses under its own size | Plan waves and just-in-time authoring (the plan keeps staff input in W3 and the advanced tracks in W7 instead of deferring them outright);")
d.rep("| FM2 | Missing: target-browser decision | Plan: Chromium-based browsers only (Chrome, Arc, Edge); nothing here depends on another engine |",
      "| FM2 | Missing: target-browser decision | §11.12 |")
d.rep("| L8 | Prerequisite violations; capstones need locked tools | §4; §4.3 (J2.L04 behind U14.CP; AC2 behind J3 + R1); §3.1 rule 10 |",
      "| L8 | Prerequisite violations; capstones need locked tools | §4; §4.3 (J2.L04 behind U14.CP; AC2 behind J3 + R1; AC1 behind U11.CP); RC1 no longer needs Dorian or a locked `horns` sound (§2.6, §6.6); §3.1 rules 10–12 |")
d.rep("| L16 | Layering written four ways | STYLE §2; §6.2; `tb.stack` and `tb.mini.stack` rows in §3.2 |",
      "| L16 | Layering written four ways | STYLE §2 (labelled lines; `,` only for simultaneous pitches in authored code); §6.2; `tb.stack` and `tb.mini.stack` rows in §3.2 |")
d.rep("| L23 | Review formats inconsistent and heavy; daily notes and cost are noise | §10.6, §10.9, §10.10 |",
      "| L23 | Review formats inconsistent and heavy; daily notes and cost are noise | §10.6, §10.9, §10.10. The critic's \"budget that quietly lowers effort\" is not adopted: plan resolution 10 fixes effort per thread kind. |")
d.rep("| 1 | 2026-11-11 | First binding version, written in Wave 0 from the plan's resolutions and the two critiques. |",
"""| 1 | 2026-11-11 | First binding version, written in Wave 0 from the plan's resolutions and the two critiques. |
| 1.1 | 2026-11-11 | Adversarial edit pass before the freeze. By execution: `Caug` is wrong in `triads` and `C69` in `lefthand` (§0.13, §0.14); `n` goes before `chord().voicing()` (§0.15); fraction strings in `late`/`off` (§0.16); control patterns take their rhythm from the left (§0.17); sections restart inside `arrange()`, so the key plan follows it (§0.18, §6.3, §6.8); straightening swing (§0.26, §6.10). By checking the tables: `tb.note.names` and `tb.s.pitched` move to U02.L01; `tb.meter.2-4` added; alternative unlock sites and the C1 fallback (§3.1 rules 11–12); AC1 gated on U11.CP; RC1 freed from Dorian and the `horns` sound; J03 only in J.CP2; U07.CP gains M09 and drops M01; R.CP drops R13; U02.CP gains D01. Decided: the legal orders (§7.6); level and category gates and graduation of gated ladders (§7.3, §7.4); `fam.har.schema` and `fam.har.cadence` ladders re-cut; `inferRoles` tie-breaks (§6.2); which track a `swing` rule measures (§6.6); starter sounds follow the unlock table (§5.10); per-target capstone, gym and checkpoint days (§9.1); supported browsers (§11.12); ID grammar for fact cards and three-part feedback codes (§1.2). |""")
d.save()
