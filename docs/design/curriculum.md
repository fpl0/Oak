# Oak master syllabus v1

Scope: core curriculum of 160 sessions (U00–U17, checkpoints, capstones, core finale) plus 75 advanced sessions (J, R and A tracks), for 235 sessions of 15–25 min each.

ID scheme:
- Lessons are `Uxx.Lyy`.
- Checkpoints are `Uxx.CP`.
- Capstone sessions are `C#.S#` (pop), `X#.S#` (transcription), `CF.S#` (core finale), `JC#.S#` (jazz), `RC#.S#` (rhythm) and `AC#.S#` (arrangement).
- Advanced lessons are `J#.L##`, `R#.L##` and `A#.L##`.
- An ID is never reused. A retired ID stays reserved.

Content root: `content/` (TypeScript).
- `content/syllabus.ts` (course map)
- `content/skills.ts`
- `content/toolbox.ts`
- `content/capstones.ts`
- `content/repertoire.ts`
- `content/drills.ts`
- `content/lessons/Uxx/Lyy.ts` (one file per lesson)

---

## 1. Course map

Columns: **ID | title — objective | unlocks (toolbox) | ear stage | skill nodes**.

Ear stages run alongside the units:

| Stage | Contents |
|---|---|
| A1 | tap pulse, echo rhythms |
| A2 | rhythm dictation (8ths, rests) |
| A3 | high/low, pitch match |
| A4 | find the tonic |
| B1 | degrees 1-3-5 |
| B2 | add 2, 4 |
| B3 | all 7 diatonic degrees |
| C1 | intervals in a key |
| C2 | isolated intervals |
| C3 | 3–5-note melodic dictation |
| C4 | phrase dictation with leaps |
| D1 | triad M/m |
| D2 | dim/aug |
| D3 | bass-degree dictation |
| D4 | schema ID |
| D5 | inversion ID |
| E1 | minor degrees b3 b6 b7 |
| E2 | 7th-chord qualities |
| E3 | blues form |
| E4 | modal colour |
| F1 | chromatic degrees |
| F2 | secondary and borrowed chords |
| F3 | modulation |
| G1 | ii–V–I |
| G2 | guide tones |
| G3 | extension colour |
| G4 | turnarounds and reharm |
| H1 | syncopation position |
| H2 | swing ratio |
| H3 | 16th placement |
| H4 | clave direction |
| H5 | odd-meter grouping |

### Core (160 sessions)

**U00 Onboarding (2)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U00.L01 | Set Up the Studio — audio unlock, wired-headphone check, tap-to-click latency calibration, API-key check, play a demo groove | Play/Stop, Sketchbook, Tutor panel | — | D01 |
| U00.L02 | Meet Your Voice — mic permission, comfortable range sweep, sustain test; sets sung-target transposition | Sing panel (tuner) | A3 | E02 V01 |

**U01 Pulse & Rhythm I (10)**, 4/4 unless stated

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U01.L01 | Heartbeat — pulse, beat, tempo; 1 cycle = 1 bar | `s()`, `setcpm`, space-sequence, `*n`, bd sd hh cp rim | A1 | R01 R02 R03 E01 |
| U01.L02 | Count to Four — downbeat, counting 1-2-3-4, rests | `~`, `.gain()`, oh cr rd | A1 | R03 R06 |
| U01.L03 | Backbeat — kick on 1 & 3, snare on 2 & 4; layering parts | `stack()`, track labels `drums:`, `.bank()` tr909 tr808 | A1 | R04 |
| U01.L04 | Two per Beat — eighth-note subdivision, hat patterns | `[ ]` | A2 | R05 |
| U01.L05 | Seeing Rhythm — whole/half/quarter/eighth values and rests on the staff | `@`, `_` | A2 | N01 R06 |
| U01.L06 | Sixteenths & 1-e-&-a — four per beat, spoken counting | `!`, lt mt ht | A2 | R07 |
| U01.L07 | Four-Bar Phrases & Fills — per-bar variation, a fill in bar 4 | `< >`, `_label:` mute | A2 | R04 R07 |
| U01.L08 | Three to a Bar — 3/4 waltz feel | `setcpm(bpm/3)` convention | A2 | R08 |
| U01.L09 | Copy That Groove — transcribe generated drum loops; half-time vs double-time | `.slow()`, `.fast()`, banks linn akailinn tr707, sh cb tb | A2 | E01 R05 |
| U01.CP | Rhythm I checkpoint | — | A1–A2 | R01–R08 N01 E01 |

**U02 Pitch, Keyboard & Treble Staff (10)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U02.L01 | High & Low — pitch, octaves | `note()`, `piano` | A3 | P01 E02 |
| U02.L02 | The White Keys — letter names, octave numbers, C4 = 60 | note names in mini | A3 | P02 P05 |
| U02.L03 | Half & Whole Steps — semitone/tone, sharps, flats, enharmonics | `#`/`b` in note names | A3 | P03 P04 |
| U02.L04 | The Treble Staff — lines, spaces, ledger lines; staff ↔ code ↔ keys | Staff panel | A3 | N02 |
| U02.L05 | Moving Melodies — MIDI numbers, transposing by semitones, chromatic scale | `.transpose(n)`, numeric `note()` | A3 | P05 P06 |
| U02.L06 | Tones & Timbres — the same tune on different sounds | sine triangle square sawtooth, `.s()` on pitches | A3 | D01 |
| U02.L07 | Sing It Back — pitch matching, higher/lower, 2–3-note echoes | — | A3 A4 | V01 E02 |
| U02.L08 | Playing from the Page — staff → code (Ode to Joy, Twinkle) | `.room()`, `.clip()` | A4 | N02 N01 D05 |
| U02.CP | Pitch checkpoint | — | A3–A4 | P01–P06 N02 V01 |
| C1.S1 | Capstone: First Loop | Album | — | — |

**U03 Major Scale & Degrees (11)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U03.L01 | Home Base — major-scale formula, tonic, degrees 1-3-5 by ear (**exemplar**) | `n().scale()`, `major`, degree labels | B1 | S01 S02 E03 E04 V02 V03 |
| U03.L02 | Restless Neighbours — 2 and 4 and their pull home; reaching below the tonic | negative / ≥7 `n` | B2 | S02 E05 V03 |
| U03.L03 | Leading Tone & Six — 6, 7, the 7→1 pull | `..` range | B3 | E05 |
| U03.L04 | Same Song, Any Key — key as a parameter | patterned `.scale("<…>")` | B3 | S03 |
| U03.L05 | Sharp Keys — G D A E B F#, order of sharps | key-sig panel | B3 | S04 N03 |
| U03.L06 | Flat Keys & the Circle — F Bb Eb Ab Db, circle of fifths | circle widget | B3 | S04 N03 |
| U03.L07 | Solfège — movable do, singing degree patterns | solfège-label toggle | B3 | V03 V04 |
| U03.L08 | Tunes by Number — write folk tunes as degrees and sight-sing them | `.legato()` | B3 | M01 V04 |
| U03.L09 | By-Ear Transcription I — fragments, then Mary Had a Little Lamb, Hot Cross Buns, Frère Jacques | — | B3 C3 | E07 |
| U03.L10 | Melody Workshop — 8-bar melody that cadences on 1 | `acgtr` | B3 | M01 S03 |
| U03.CP | Major-scale checkpoint | — | B1–B3 | S01–S04 E03–E05 V02–V03 |

**U04 Intervals (7)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U04.L01 | Steps Apart — generic interval = distance between degrees | — | C1 | I01 |
| U04.L02 | Major, Minor, Perfect — quality from semitones | — | C1 | I02 |
| U04.L03 | Tritone & Friends — aug/dim, enharmonic intervals | interval strings `.transpose("3M")` | C1 | I03 |
| U04.L04 | Flip & Stretch — inversion (sum = 9), compound intervals | — | C1 | I04 |
| U04.L05 | Together Now — harmonic intervals, consonance and dissonance | `,` stack in mini | C1 | I05 |
| U04.L06 | Interval Ear Lab — pairs in a key plus isolated asc/desc/harmonic deck; passive-listen blocks | — | C2 | E06 |
| U04.CP | Interval checkpoint | — | C1–C2 | I01–I05 E06 |

**U05 Triads (9)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U05.L01 | Stacking Thirds — `n("[0,2,4]")`; root, 3rd, 5th | — | D1 | C01 |
| U05.L02 | Major & Minor — quality by intervals and by ear | — | D1 | C02 E08 |
| U05.L03 | Diminished & Augmented | — | D2 | C03 E08 |
| U05.L04 | Chord Names & Arpeggios — C Cm C° C+; Strudel ↔ lead-sheet symbols | `.arp()` | D2 | N05 |
| U05.L05 | Inversions — 1st and 2nd inversion; slash chords | — | D5 | C04 |
| U05.L06 | Bass Clef & Grand Staff | `ebass`, `upright` | D5 | N04 |
| U05.L07 | Voice Leading by Hand — voice I–IV–V–I with note lists; common tones, nearest motion (**gate for voicing()**) | — | D5 | C05 |
| U05.L08 | Let Strudel Voice It — compare `.voicing()` with your hand voicing | `chord()`, `.voicing()`, `anchor`, `mode`, `dict("triads")`, `rhodes`, `organ` | D1–D2 | C05 N05 |
| U05.CP | Triads checkpoint | — | D1–D5 | C01–C05 N04 N05 E08 |

**U06 Diatonic Harmony (13)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U06.L01 | The Seven Chords — diatonic triads by stacking degrees | `.add()` | D1 | H01 |
| U06.L02 | Roman Numerals — I ii iii IV V vi vii° and the quality pattern | RN overlay | D1 | H01 N06 |
| U06.L03 | Home, Away, Tension — T/PD/D and the phrase model | — | D3 | H02 |
| U06.L04 | Endings I — PAC, IAC, half cadence | — | D3 | H03 |
| U06.L05 | Endings II — plagal and deceptive cadences | — | D3 | H03 |
| U06.L06 | Hear the Bass First — bass-degree dictation; sing the roots | — | D3 | E09 V05 |
| U06.L07 | The Four-Chord Schema — I–V–vi–IV and its rotations | `pad` | D4 | H04 |
| U06.L08 | Doo-Wop & Three-Chord Rock — I–vi–IV–V, I–IV–V | — | D4 | H05 |
| U06.L09 | Harmonic Rhythm — 1 vs 2 chords per bar | — | D4 | H06 |
| U06.L10 | Chord Dictation Workshop — bass → quality → RN on loops | — | D3 D4 | E09 |
| U06.L11 | Slash Chords & Walking Down — I–V/7–vi, line cliché, pedal | voicing `mode("root:…")` | D5 | H15 C04 |
| U06.L12 | Comping Patterns — chord rhythms locked to the drums | `.struct()` | D4 | H06 |
| U06.CP | Diatonic checkpoint | — | D3–D4 | H01–H06 H15 E09 |

**U07 Melody (14 incl. C2, X1)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U07.L01 | Shape — contour, range, steps vs leaps | — | C3 | M01 |
| U07.L02 | Motif & Variation — repetition, sequence, retrograde | `.rev()`, `.scaleTranspose()` | C3 | M02 |
| U07.L03 | Landing on Chord Tones — chord tones on strong beats | — | C3 | M03 |
| U07.L04 | Passing & Neighbour Tones | — | C3 | M04 |
| U07.L05 | Leaning & Holding — appoggiatura, 4–3 and 9–8 suspensions | — | C4 | M05 |
| U07.L06 | Question & Answer — antecedent/consequent | `.lastOf()`, `.firstOf()` | C4 | M06 F01 |
| U07.L07 | Call & Response | `.off()`, `.superimpose()` | C4 | M07 |
| U07.L08 | Reading Lead Sheets — Amazing Grace; play and sing from it | lead-sheet export | C4 | N07 V04 |
| U07.L09 | Hook Lab — hooks, controlled chance | `?`, `.degradeBy()`, `.sometimesBy()` | C4 | M09 |
| U07.CP | Melody checkpoint | — | C3–C4 | M01–M07 N07 |
| C2.S1–S2 | Capstone: Four-Chord Song | — | — | — |
| X1.S1–S2 | Capstone: Folk Song Transcription | Transcription Studio (melody mode) | — | — |

**U08 Bass Lines (5)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U08.L01 | Roots Down Low | `.rootNotes()` | D3 | B01 |
| U08.L02 | Root–Five–Octave | — | D3 | B02 |
| U08.L03 | Walking Up to It — diatonic and chromatic approach tones | — | D3 | B03 |
| U08.L04 | Lock with the Kick — shared rhythm, syncopated bass | `const` pattern variables | D3 | B04 |
| U08.L05 | Bass Dictation & Tone | `.lpf()`, `fingerbass`, `synthbass` | D3 | B01 V05 E09 |

**U09 Form (9 incl. C3)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U09.L01 | Phrases Make Sections — 4- and 8-bar units, hypermeter | — | D4 | F01 |
| U09.L02 | Verse & Chorus — contrast | `arrange()` | D4 | F02 |
| U09.L03 | AABA & Strophic | — | D4 | F03 |
| U09.L04 | The Energy Curve — builds and drops | `sine` `saw` `perlin`, `.range()`, `.segment()` | D4 | F05 |
| U09.L05 | Arranging in Code — layer entries and exits | `.mask()` | D4 | F06 |
| U09.CP | Bass & form checkpoint | — | D3–D4 | B01–B04 F01–F03 F05 |
| C3.S1–S3 | Capstone: Verse–Chorus Demo | — | — | — |

**U10 Minor (12 incl. C4)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U10.L01 | The Dark Twin — natural minor, b3 b6 b7, do-based minor solfège | `minor`/`aeolian` | E1 | S05 |
| U10.L02 | Relative & Parallel | — | E1 | S06 |
| U10.L03 | Hearing Minor — minor-degree drills | — | E1 | E10 |
| U10.L04 | Minor-Key Chords — i ii° III iv v VI VII | — | E1 | H07 |
| U10.L05 | The Aeolian Loop — i–VI–III–VII vs vi–IV–I–V | — | E1 D4 | H08 |
| U10.L06 | Raise the Seventh — harmonic minor, major V | `harmonic:minor` | E1 | S07 H09 |
| U10.L07 | The Andalusian Cadence — i–VII–VI–V | — | E1 | H09 |
| U10.L08 | Melodic Minor | `melodic:minor` | E1 | S08 |
| U10.L09 | Minor Melodies — House of the Rising Sun (trad), Wayfaring Stranger | `strings`, `.delay()` | E1 C4 | E07 V04 |
| U10.CP | Minor checkpoint | — | E1 | S05–S08 H07–H09 E10 |
| C4.S1–S2 | Capstone: Minor Indie Ballad | Studio chords mode | — | — |

**U11 Pentatonic & Blues (13 incl. C5, X2)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U11.L01 | Five Notes, No Wrong Ones — major pentatonic | `major:pentatonic` | B3 | S09 |
| U11.L02 | The Minor Pentatonic Riff | `minor:pentatonic` | E1 | S10 M08 |
| U11.L03 | Blue Notes — blues scale | `blues`, `crunch`, `.distort()` | E1 | S11 |
| U11.L04 | The Dominant Seventh | chord symbol `7` | E2 | C06 |
| U11.L05 | Twelve Bars | — | E3 | H10 F04 |
| U11.L06 | Quick Change & Turnaround | — | E3 | H10 |
| U11.L07 | Shuffle — swung 8ths and swing notation | `.swingBy()`, `.swing()` | H2 | R13 |
| U11.L08 | Riffs & Response — St. Louis Blues fragment | — | E3 | M08 M07 |
| U11.CP | Blues checkpoint | — | E1–E3 H2 | S09–S11 C06 H10 F04 R13 |
| C5.S1–S2 | Capstone: 12-Bar Shuffle | — | — | — |
| X2.S1–S2 | Capstone: Blues Transcription | Studio bass mode | — | — |

**U12 Seventh Chords (6)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U12.L01 | Major 7 & Minor 7 | `^7`, `-7` | E2 | C07 |
| U12.L02 | Dominant vs Major 7 | — | E2 | E11 |
| U12.L03 | Half-Diminished & Diminished 7 | `h7`, `o7` | E2 | C07 |
| U12.L04 | Diatonic Sevenths in Major | — | E2 | C08 |
| U12.L05 | Sevenths in Minor & Guide-Tone Preview | — | E2 | C08 |
| U12.L06 | Seventh Ear Lab & Left-Hand Voicings | `dict("lefthand")`, `jazzgtr` | E2 | E11 |

**U13 Rhythm II (7)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U13.L01 | Pushes & Anticipations | `.early()`, `.late()` | H1 | R10 |
| U13.L02 | Sixteenth Grooves & Ghost Notes | `.velocity()` | H1 | R10 |
| U13.L03 | Ties Across the Beat — notating syncopation, dotted rhythms | — | H1 | R09 N08 |
| U13.L04 | Compound Meter — 6/8 and 12/8 | compound `setcpm` convention | H1 | R11 |
| U13.L05 | Triplets — tuplets in simple meter | `.ply()` | H2 | R12 N08 |
| U13.L06 | Rhythm Dictation II | — | H1 H2 | E14 |
| U13.CP | 7ths & rhythm checkpoint; unlocks the J and R tracks | — | E2 H1–H2 | C07 C08 E11 R09–R12 E14 |

**U14 Modes (9 incl. C6)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U14.L01 | Modes as Colours — characteristic tone; Mixolydian b7 | `mixolydian` | E4 | S12 |
| U14.L02 | Mixolydian Rock — I–bVII–IV; Old Joe Clark | — | E4 | H11 |
| U14.L03 | Dorian ♮6 — i–IV; Scarborough Fair, Drunken Sailor | `dorian` | E4 | S12 H11 |
| U14.L04 | Lydian Glow — #4, I–II | `lydian` | E4 | S13 |
| U14.L05 | Phrygian Edge — b2, i–bII | `phrygian` | E4 | S13 |
| U14.L06 | Mode Lab — mode ID and a modal vamp | `.pan()`, `.jux()` | E4 | E10 |
| U14.CP | Modes checkpoint | — | E4 | S12 S13 H11 E10 |
| C6.S1–S2 | Capstone: Modal Vamp | — | — | — |

**U15 Secondary Dominants (6)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U15.L01 | Chromatic Degrees — #4 b7 #5 #1 b2 b3 b6; chromatic solfège | chromatic steps `n("4#")` | F1 | P06 E12 |
| U15.L02 | Five of Five — V/V, V7/V | — | F2 | H12 |
| U15.L03 | Visiting Other Chords — V/vi, V/ii, V7/IV | — | F2 | H12 |
| U15.L04 | Tonicization — applied vii° | — | F2 | H12 |
| U15.L05 | Dominant Chains — III7–VI7–II7–V7 (Five Foot Two, Sweet Georgia Brown) | `horns`, `trumpet` | F2 | H12 |
| U15.L06 | Hearing Secondaries | — | F2 | E12 |

**U16 Borrowed Chords (5)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U16.L01 | The Sad IV — iv in major | — | F2 | H13 |
| U16.L02 | bVI & bVII — bVI–bVII–I | — | F2 | H13 |
| U16.L03 | bIII & Minor Plagal | — | F2 | H13 |
| U16.L04 | Picardy & Dorian IV | — | F2 | H13 |
| U16.L05 | Mixture Lab — reharmonize a folk tune | `tenor` | F2 | E12 |

**U17 Modulation (12 incl. C7, CF)**

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| U17.L01 | Pivot Chords | — | F3 | H14 |
| U17.L02 | Truck-Driver & Direct Modulation — transpose per section | patterned `.transpose("<…>")` inside `arrange` | F3 | H14 |
| U17.L03 | Hearing Key Changes | — | F3 | E13 |
| U17.L04 | Transcribing Through a Key Change — generated pop, Body and Soul A→bridge | — | F3 | E13 |
| U17.CP | Chromatic checkpoint (U15–U17) | — | F1–F3 | H12–H14 E12 E13 |
| C7.S1–S3 | Capstone: Chromatic Colour | — | — | — |
| CF.S1–S4 | Core Finale | Studio full-arrangement mode, album mastering | — | — |

Core total: 2 + 10 + 10 + 11 + 7 + 9 + 13 + 14 + 5 + 9 + 12 + 13 + 6 + 7 + 9 + 6 + 5 + 12 = **160**.

### Advanced tracks (75 sessions)

Each track opens when its gate is passed. The learner picks freely among open tracks, and the tracks can interleave with U14–U17.

**Jazz Harmony (35).** Gates: J1–J3 open after U13.CP; J4 needs U15; J5 needs U17.CP.

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| J1.L01 | Reading Jazz Symbols — iReal ↔ lead sheet (∆, –, ø, °, alt, 6, 69, sus) | full iReal symbol set, jazz-glyph display | G1 | J01 |
| J1.L02 | Extensions — 9/11/13, avoid notes | `^9 -9 9 13 -11`, `dict("ireal-ext")` | G3 | J02 |
| J1.L03 | Altered Dominants | `7alt 7b9 7#9 7#11 7b13`, `altered` scale | G3 | J02 |
| J1.L04 | Chord-Scales — Dorian/Mixolydian/Ionian/Lydian per chord | `bebop` scales | G1 | J03 |
| J1.L05 | Swing Feel & the Ride | `jazzkit`, `vibes` | H2 | R13 |
| J2.L01 | The ii–V–I | — | G1 | J04 |
| J2.L02 | All Twelve Keys | — | G1 | J05 |
| J2.L03 | Minor ii–V–i | — | G1 | J06 |
| J2.L04 | Guide-Tone Lines — sing 3rds and 7ths | `dict("guidetones")` | G2 | J07 V06 |
| J.CP1 | Jazz checkpoint 1 | — | G1–G3 | J01–J07 |
| JC1.S1–S2 | Capstone: Guide Tones in 12 Keys | — | — | — |
| J3.L01 | Shells — one chord pattern drives every part | `.set()`, voicing `n` | G2 | J08 |
| J3.L02 | Rootless A/B Voicings | `mode("duck")`, `offset` | G3 | J09 |
| J3.L03 | Drop-2 & Spread | — | G3 | J09 D08 |
| J3.L04 | Comping Rhythms — Charleston, pushes | — | H1 | H06 |
| J3.L05 | Walking Bass | — | G1 | B05 |
| J4.L01 | Turnarounds — I–vi–ii–V, iii–VI–ii–V | — | G4 | J10 |
| J4.L02 | Jazz Blues in F | `mutetpt` | G4 | J11 |
| J4.L03 | Rhythm Changes | — | G4 | J12 |
| J4.L04 | Reading a Standard — PD head plus changes | — | G4 | N07 J12 |
| JC2.S1–S2 | Capstone: Jazz Blues in F | — | — | — |
| J5.L01 | Tritone Substitution | — | G4 | J13 |
| J5.L02 | Backdoor — iv–bVII7–I | — | G4 | J13 |
| J5.L03 | Secondary ii–Vs & Diminished Passing Chords | — | G4 | J14 |
| J5.L04 | Reharm Techniques | — | G4 | J14 |
| J5.L05 | Coltrane Changes (enrichment, not gated) | — | G4 | J14 |
| J.CP2 | Jazz checkpoint 2 | — | G4 | J08–J14 B05 |
| JC3.S1–S3 | Capstone: Rhythm Changes Contrafact | — | — | — |
| JC4.S1–S3 | Capstone: Reharmonize a Standard | — | — | — |

**Advanced Rhythm (20).** Gate: U13.CP.

| ID | Title — objective | Unlocks | Ear | Skills |
|---|---|---|---|---|
| R1.L01 | Metric Weight — syncopation hierarchy | — | H1 | R10 |
| R1.L02 | Swing Ratios — 8th vs 16th swing | patterned swing amount `.swingBy("<0 .1 .2 .33>",4)` | H2 | R13 |
| R1.L03 | The One — 16th funk drums, ghost notes | `clav` | H3 | R14 |
| R1.L04 | Interlock — bass/clav/guitar | — | H3 | R14 B04 |
| R1.L05 | Displacement & Laid-Back Feel | `.nudge()` | H3 | R15 |
| R2.L01 | Five & Seven — 5/4, 7/8 groupings | /8 `setcpm` convention | H5 | R16 |
| R2.L02 | Odd Grooves — 7/8, 9/8 (2+2+2+3) | — | H5 | R16 |
| R2.L03 | Hemiola — 6/8 ↔ 3/4 | — | H5 | R17 |
| R2.L04 | Polyrhythm 3:2, 4:3 | — | H5 | R17 |
| R2.L05 | Polymeter & Metric Modulation | `{ }%n` | H5 | R17 |
| R3.L01 | Tresillo & Cinquillo — E(3,8), E(5,8) | euclid mini `(k,n)` | H4 | R18 |
| R3.L02 | Clave Direction — son and rumba, 3-2 and 2-3 | — | H4 | R18 |
| R3.L03 | Euclidean Rhythms & Rotation | `(k,n,r)`, `.euclid()`, `.euclidRot()` | H4 | R18 |
| R3.L04 | Montuno & Tumbao Layering | — | H4 | R18 B04 |
| R3.L05 | Rhythm Master Lab | — | H1–H5 | E14 |
| R.CP | Rhythm checkpoint | — | H1–H5 | R13–R18 |
| RC1.S1–S2 | Capstone: 16th-Note Funk | — | — | — |
| RC2.S1–S2 | Capstone: Clave & Polyrhythm | — | — | — |

**Arrangement & Sound (20).** Gates: A1 after U09.CP; A2 after U10.CP; AC2 needs J3.

| ID | Title — objective | Unlocks | Skills |
|---|---|---|---|
| A1.L01 | Waves & Harmonics — the harmonic series | `partials`, `user` wave | D02 |
| A1.L02 | Filters & Filter Envelopes | `lpf hpf bpf lpq lpenv lpa lpd lps lpr` | D03 |
| A1.L03 | Envelopes | `attack decay sustain release` | D04 |
| A1.L04 | Space — reverb, delay, orbits | `roomsize delaytime delayfeedback orbit` | D05 |
| A1.L05 | Grit | `distorttype crush coarse` | D06 |
| A1.L06 | Movement — LFOs, vibrato, tremolo, phaser | `vib vibmod tremolo phaser lprate lpdepth` | D07 |
| A1.L07 | FM & Supersaw | `fm fmh supersaw unison detune spread pulse pw` | D07 |
| A2.L01 | Roles & Registers — frequency space; why low thirds turn to mud | `.fscope()` | D08 |
| A2.L02 | Texture & Density | — | D09 F05 |
| A2.L03 | Counter-Melody & Re-Voicing per Section | — | D09 M07 |
| A2.L04 | Sampling — `brk` breakbeat | `chop slice splice loopAt striate speed begin end` | D11 |
| A2.L05 | Mix & Dynamics | `compressor duckorbit duckdepth postgain` | D10 |
| A2.L06 | Genre Translation | — | D09 F06 |
| A.CP | Sound & arrangement checkpoint | — | D01–D11 |
| AC1.S1–S3 | Capstone: One Tune, Two Genres | — | — |
| AC2.S1–S3 | Capstone: Neo-Soul Ballad | — | — |

Totals: J 35 + R 20 + A 20 = **75**. Grand total **235**.

### Checkpoint protocol (all `*.CP`)

- **Format:** 20 minutes of generated items covering every gated node.
- **Pass:** ≥85% overall and ≥75% on each node.
- **Perceptual nodes:** they also need a second-day FSRS review at ≥85% before the node counts as mastered. Until then the node shows "provisional".
- **Gate:** the next unit's L01–L02 always stay open (goal-gradient preview). L03 and later lock until the CP passes.
- **Never gated:** Sketchbook, Gym and Tutor.
- **Failed items:** each one becomes a targeted "repair set" in the next session's warm-up.

---

## 2. Skill-map graph (139 nodes, 8 regions)

Notation: `ID name [category] ← prerequisites`. Node shade is the FSRS retrievability averaged over the node's cards.

**Region 1 — Groove** (rhythm)
```
R01 Pulse & beat [rhythm] ← —
R02 Tempo/BPM [rhythm] ← R01
R03 Meter 4/4, bar & downbeat [rhythm] ← R01
R04 Backbeat & layered groove [rhythm] ← R03
R05 Eighth subdivision [rhythm] ← R03
R06 Rests [rhythm] ← R05
R07 Sixteenths & 1-e-&-a [rhythm] ← R05
R08 Triple meter 3/4 [rhythm] ← R03
R09 Ties & dotted rhythms [rhythm] ← R06
R10 Syncopation & anticipation [rhythm] ← R07 R09
R11 Compound meter 6/8 12/8 [rhythm] ← R08 R07
R12 Triplets & tuplets [rhythm] ← R11
R13 Swing & shuffle [rhythm] ← R12
R14 16th funk & ghost notes [rhythm] ← R10
R15 Metric displacement [rhythm] ← R10
R16 Odd meters [rhythm] ← R11
R17 Hemiola, polyrhythm, polymeter [rhythm] ← R12 R16
R18 Clave, tresillo, Euclidean [rhythm] ← R10
```

**Region 2 — Pitch & Staff** (pitch, notation)
```
P01 High/low & octave [pitch] ← —
P02 Note names & keyboard [pitch] ← P01
P03 Half & whole steps [pitch] ← P02
P04 Accidentals & enharmonics [pitch] ← P03
P05 Octave numbers & MIDI, C4=60 [pitch] ← P02
P06 Chromatic scale & chromatic degrees [pitch] ← P04
N01 Rhythm values & rests [notation] ← R05
N02 Treble clef & ledger lines [notation] ← P02
N03 Key signatures on the staff [notation] ← S04 N02
N04 Bass clef & grand staff [notation] ← N02
N05 Chord symbols (lead sheet) [notation] ← C03
N06 Roman numerals [notation] ← H01
N07 Lead sheets [notation] ← N05 M03
N08 Ties, beaming, tuplets & meter notation [notation] ← N01 R12
```

**Region 3 — Keys & Scales** (scales, intervals)
```
S01 Major scale WWHWWWH [scales] ← P03
S02 Scale degrees & tonic (n = degree−1) [scales] ← S01
S03 Keys as transposition [scales] ← S02
S04 Key signatures & circle of fifths [scales] ← S03 P04
S05 Natural minor [scales] ← S02
S06 Relative & parallel keys [scales] ← S05 S04
S07 Harmonic minor [scales] ← S05
S08 Melodic minor [scales] ← S07
S09 Major pentatonic [scales] ← S02
S10 Minor pentatonic [scales] ← S09 S05
S11 Blues scale & blue notes [scales] ← S10
S12 Mixolydian & Dorian [scales] ← S05 S06
S13 Lydian & Phrygian [scales] ← S12
I01 Generic intervals [intervals] ← S02
I02 Interval quality M/m/P [intervals] ← I01 P03
I03 Aug/dim & tritone [intervals] ← I02
I04 Inversion & compound [intervals] ← I02
I05 Consonance & dissonance [intervals] ← I02
```

**Region 4 — Chords & Harmony** (chords, harmony; bass nodes are category harmony)
```
C01 Triads by thirds [chords] ← I01
C02 Major vs minor triad [chords] ← C01 I02
C03 Diminished & augmented [chords] ← C02 I03
C04 Inversions & slash chords [chords] ← C02
C05 Voice leading by hand [chords] ← C04
C06 Dominant 7th [chords] ← C02
C07 Seventh family maj7 m7 ø7 °7 [chords] ← C06
C08 Diatonic sevenths [chords] ← C07 H01
C09 Sus & add chords [chords] ← C02
H01 Diatonic triads & RN [harmony] ← C03 S02
H02 Function T/PD/D [harmony] ← H01
H03 Cadences [harmony] ← H02
H04 Four-chord schema family [harmony] ← H01
H05 Doo-wop & three-chord schemas [harmony] ← H04
H06 Harmonic rhythm & comping [harmony] ← H01 R03
H07 Minor-key harmony [harmony] ← H01 S05
H08 Aeolian schema i–VI–III–VII [harmony] ← H07
H09 Harmonic-minor V & Andalusian [harmony] ← H07 S07
H10 12-bar blues & turnaround [harmony] ← C06 H03
H11 Modal harmony (bVII, I–bVII–IV, i–IV) [harmony] ← S12 H07
H12 Secondary dominants & tonicization [harmony] ← H03 C06 P06
H13 Borrowed chords [harmony] ← H07 H03
H14 Modulation [harmony] ← H12
H15 Pedal, line cliché, descending bass [harmony] ← C04 H04
B01 Root bass lines [harmony] ← H01
B02 Root–5th–octave [harmony] ← B01 I02
B03 Approach & passing tones [harmony] ← B02 M04
B04 Bass–kick lock, syncopated bass [harmony] ← B01 R07
B05 Walking bass [harmony] ← B03 C07
```

**Region 5 — Melody & Form**
```
M01 Contour, range, steps & leaps [melody] ← S02
M02 Motif & variation [melody] ← M01
M03 Chord tones on strong beats [melody] ← M01 C02
M04 Passing & neighbour tones [melody] ← M03
M05 Appoggiatura & suspension [melody] ← M04
M06 Antecedent/consequent [melody] ← M03 H03
M07 Call & response [melody] ← M06
M08 Riffs & blues melody [melody] ← S11 M02
M09 Hook writing [melody] ← M06 M02
F01 Phrase, section, hypermeter [form] ← R03 M06
F02 Verse–chorus [form] ← F01
F03 AABA & strophic [form] ← F01
F04 12-bar form [form] ← F01 H10
F05 Energy curve & contrast [form] ← F02
F06 Arranging sections in code [form] ← F05
```

**Region 6 — Ears & Voice**
```
E01 Tap & rhythm echo [ear] ← R01
E02 Pitch match & higher/lower [ear] ← P01
E03 Find the tonic [ear] ← S02
E04 Degrees 1-3-5 [ear] ← E03
E05 All diatonic degrees [ear] ← E04
E06 Intervals in key & isolated [ear] ← E05 I02
E07 Melodic dictation [ear] ← E05 R05
E08 Triad quality [ear] ← C03
E09 Bass-degree & schema dictation [ear] ← E05 H04
E10 Minor & modal degrees [ear] ← E05 S05
E11 Seventh-chord quality [ear] ← C07 E08
E12 Chromatic, secondary & borrowed ID [ear] ← H12 H13
E13 Modulation detection [ear] ← H14 E12
E14 Rhythmic dictation (sync/swing/compound) [ear] ← R10 R12 E01
V01 Sustain & match a pitch [voice] ← E02
V02 Sing the tonic after a cadence [voice] ← E03 V01
V03 Sing degrees with solfège [voice] ← V02 E04
V04 Sight-sing from staff [voice] ← V03 N02
V05 Sing bass lines [voice] ← V03 B01
V06 Sing guide-tone lines [voice] ← V03 J07
```

**Region 7 — Jazz**
```
J01 Jazz symbols iReal ↔ lead sheet [jazz] ← C07 N05
J02 Extensions & alterations [jazz] ← J01
J03 Chord-scale basics [jazz] ← J02 S12
J04 Major ii–V–I [jazz] ← C08 H02
J05 ii–V–I in all keys [jazz] ← J04 S04
J06 Minor iiø–V7alt–i [jazz] ← J04 J02 S07
J07 Guide-tone lines [jazz] ← J04
J08 Shell voicings [jazz] ← J07
J09 Rootless & drop-2 [jazz] ← J08 J02
J10 Turnarounds [jazz] ← J04 H12
J11 Jazz blues [jazz] ← H10 J04
J12 Rhythm changes [jazz] ← J10 F03
J13 Tritone sub & backdoor [jazz] ← J10 I03
J14 Reharmonization [jazz] ← J13 H13
```

**Region 8 — Sound**
```
D01 Timbre & palette [sound] ← —
D02 Oscillators & harmonics [sound] ← D01
D03 Filters & filter env [sound] ← D02
D04 ADSR [sound] ← D02
D05 Reverb & delay [sound] ← D01
D06 Saturation & distortion [sound] ← D02
D07 Modulation (LFO/vib/trem/phaser/FM) [sound] ← D03 D04
D08 Roles & frequency space [sound] ← D01 C05
D09 Texture, density, counter-melody, genre re-arrangement [sound] ← D08 M07 F06
D10 Mix & dynamics [sound] ← D05
D11 Sampling & chopping [sound] ← D01
```

Two more nodes are referenced from lessons: V06 (Region 6) and B05 (Region 4). C09 Sus & add has no core lesson; it is trained in J1.L01 and the U06 voicing extras.

Rendering: lay out the regions as columns in the order Groove → Pitch & Staff → Keys & Scales → Chords & Harmony → Melody & Form → Ears & Voice → Jazz/Sound, with edges inside a region drawn solid and edges between regions dashed.

---

## 3. Toolbox unlock table

Rules:
- **Unlocked features get:**
  - autocomplete
  - a docs card (catalog entry)
  - use in graded steps
  - tutor teaching about the feature
- **Locked features:**
  - are absent from autocomplete and docs
  - are a hard lint error in graded steps
  - are a lint warning in the Sketchbook, which runs all code (autonomy is kept, and the unlock still means real support)
- **`.voicing()` is the exception:** it is rejected in every graded step before U05.L08, so it cannot bypass hand voicing.
- **Unlock animation:** shows the card plus a one-click "try it" snippet that drops into the current sketch.
- **Unlock IDs:** `tb.<name>`.

### Rhythm & mini-notation

| Feature | Lesson | Justifying concept |
|---|---|---|
| `s()`/`sound()`, space sequence, `*n`, `setcpm()`; bd sd hh cp rim | U01.L01 | pulse and tempo; a cycle is a bar |
| `~`, `.gain()`; oh cr rd | U01.L02 | rests; accenting the downbeat |
| `stack()`, lowercase track labels (`drums:`), `.bank("tr909"/"tr808")` | U01.L03 | layered backbeat; drum-machine timbres |
| `[ ]` | U01.L04 | subdivision |
| `@`, `_` | U01.L05 | note values (lengths) |
| `!`; lt mt ht | U01.L06 | sixteenths, repeated cells; tom fills |
| `< >`, `_label:` mute | U01.L07 | bar-level variation, fills |
| `.slow()` `.fast()`; banks linn akailinn tr707; sh cb tb | U01.L09 | half-time and double-time feel |
| `,` inside mini | U04.L05 | harmonic intervals and chords |
| `.struct()` | U06.L12 | comping rhythm shared with the drums |
| `.lastOf()` `.firstOf()` | U07.L06 | phrase-level answers |
| `.off()` `.superimpose()` | U07.L07 | call and response, echoes |
| `?` `.degradeBy()` `.sometimesBy()` | U07.L09 | controlled variation in hooks |
| `const` pattern variables | U08.L04 | bass and kick share one rhythm |
| `arrange()` | U09.L02 | sections and song form |
| `sine saw perlin`, `.range()`, `.segment()` | U09.L04 | energy curves and automation |
| `.mask()` | U09.L05 | layer entries per section |
| `.swingBy()` `.swing()` | U11.L07 | shuffle and swing ratio |
| `.early()` `.late()` | U13.L01 | anticipations and pushes |
| `.velocity()` | U13.L02 | ghost notes and dynamics |
| `.ply()` | U13.L05 | rolls and triplet repeats |
| `.nudge()` | R1.L05 | laid-back microtiming |
| `{ }%n` | R2.L05 | polymeter |
| `(k,n)` mini euclid | R3.L01 | tresillo E(3,8) and cinquillo E(5,8) |
| `(k,n,r)`, `.euclid()`, `.euclidRot()` | R3.L03 | rotation and clave families |

### Pitch, scales, harmony

| Feature | Lesson | Justifying concept |
|---|---|---|
| `note()`; `piano` (Salamander) | U02.L01 | pitch and octave |
| note names with octave in mini (`c4 e4`) | U02.L02 | letter names, C4 = 60 |
| `#`/`b` in note names | U02.L03 | accidentals |
| Staff panel (treble) | U02.L04 | staff reading |
| `.transpose(semitones)`, numeric `note(60)` | U02.L05 | semitone distance, MIDI |
| `.s()` on pitched patterns; sine triangle square sawtooth | U02.L06 | timbre |
| `.room()` `.clip()` | U02.L08 | reward: the sound of a space |
| `n()` as scale index + `.scale("C4:major")`; degree labels | U03.L01 | major scale and degrees |
| negative and ≥7 `n` | U03.L02 | below the tonic, octave above |
| `..` range | U03.L03 | the whole scale in one token |
| patterned `.scale("<C4:major G4:major>")` | U03.L04 | key as a parameter |
| key-signature and circle widgets | U03.L05–06 | key signatures |
| solfège-label toggle | U03.L07 | movable do |
| `.legato()` | U03.L08 | phrasing |
| interval strings `.transpose("3M")` | U04.L03 | interval names |
| `.arp()` | U05.L04 | chord tones in time |
| `chord()`, `.voicing()`, `anchor`, `mode`, `dict("triads")` | U05.L08 | **only after U05.L07** (hand-voiced inversions mastered) |
| `.add()` (degree arithmetic) | U06.L01 | stacking thirds on any degree |
| voicing `mode("root:g2")` | U06.L11 | bass note decides the inversion |
| `.rev()` `.scaleTranspose()` | U07.L02 | motif retrograde and sequence |
| `.rootNotes(2)` | U08.L01 | root bass lines |
| `minor`/`aeolian`, `harmonic:minor`, `melodic:minor` | U10.L01/06/08 | minor family |
| `major:pentatonic`, `minor:pentatonic`, `blues` | U11.L01–03 | pentatonic and blues |
| chord symbol `7` | U11.L04 | dominant 7th |
| `^7` `-7`, then `h7` `o7` | U12.L01/03 | seventh-chord family |
| `dict("lefthand")` | U12.L06 | left-hand piano voicings |
| `mixolydian` `dorian`, then `lydian` `phrygian` | U14.L01/03, U14.L04/05 | modal colour |
| chromatic steps `n("4#")`, `n("7b")` | U15.L01 | chromatic degrees (golden-test the mini tokenization) |
| patterned `.transpose("<0!8 2!8>")` per section | U17.L02 | truck-driver modulation |
| full iReal set, jazz-glyph display | J1.L01 | jazz symbols |
| `^9 -9 9 13 -11`, `dict("ireal-ext")` | J1.L02 | extensions |
| `7alt 7b9 7#9 7#11 7b13`, `altered` | J1.L03 | altered dominants |
| `bebop` scales | J1.L04 | chord-scale |
| `dict("guidetones")` | J2.L04 | guide tones |
| `.set()`, voicing `n` | J3.L01 | one chord pattern drives melody, comping and bass |
| `mode("duck")`, `offset` | J3.L02 | rootless voicings and inversions |

### Sound, instruments, effects

Each Oak alias is a `registerSound` wrapper that pins the soundfont variant, so `n` never collides with it.

| Alias / feature | Source | Lesson | Concept |
|---|---|---|---|
| `acgtr` | gm_acoustic_guitar_steel:0 | U03.L10 | folk melody colour |
| `ebass`, `upright` | gm_electric_bass_pick:0, gm_acoustic_bass:1 | U05.L06 | bass register and bass clef |
| `rhodes`, `organ` | gm_epiano1 (variant chosen in listening pass), gm_drawbar_organ:0 | U05.L08 | voiced chords |
| `pad` | gm_pad_warm | U06.L07 | sustained harmony for schemas |
| `fingerbass`, `synthbass` | gm_electric_bass_finger:0 (never :1, which 404s); `s("sawtooth").lpf(600)` recipe | U08.L05 | bass tone |
| `.lpf()` | superdough | U08.L05 | darker bass |
| `strings`, `.delay()` | gm_string_ensemble_1:4 | U10.L09 | minor-ballad texture |
| `crunch`, `.distort()` | gm_overdriven_guitar:4 | U11.L03 | blues/rock riffs |
| `jazzgtr` | gm_electric_guitar_jazz:0 | U12.L06 | seventh-chord comping |
| `cleangtr` | gm_electric_guitar_clean:5 | U13.L02 | 16th grooves |
| `.pan()` `.jux()` | — | U14.L06 | stereo space for modal vamps |
| `horns`, `trumpet` | gm_brass_section:0, gm_trumpet:0 | U15.L05 | stabs on dominant chains |
| `tenor` | gm_tenor_sax:0 | U16.L05 | melody voice for mixture |
| `vibes`, `jazzkit` | gm_vibraphone; Oak map (Dirt-Samples jazz + VCSL hihat/sus_cymbal/snare) | J1.L05 | swing |
| `mutetpt` | gm_muted_trumpet | J4.L02 | jazz-blues head |
| `clav` | gm_clavinet | R1.L03 | funk |
| `choir` | gm_choir_aahs:5 | AC2 | neo-soul pad |
| synthesis and FX controls | — | A1.L01–L07 | see the A track rows |
| `.fscope()` | — | A2.L01 | frequency space |
| sampling controls with `brk` | — | A2.L04 | chopping |
| `compressor duckorbit duckdepth postgain` | — | A2.L05 | mix |

Curated gm_* set (16 soundfonts):

| Soundfont | Variant |
|---|---|
| epiano1 | chosen in listening pass |
| drawbar_organ | 0 |
| clavinet | — |
| acoustic_bass | 1 |
| electric_bass_pick | 0 |
| electric_guitar_clean | 5 |
| electric_guitar_jazz | 0 |
| overdriven_guitar | 4 |
| acoustic_guitar_steel | — |
| string_ensemble_1 | 4 |
| pad_warm | — |
| tenor_sax | 0 |
| trumpet | 0 |
| brass_section | 0 |
| vibraphone | — |
| choir_aahs | 5 |

Also served (and add `muted_trumpet` and `electric_bass_finger:0` to the mirror script):
- `piano` (Salamander)
- uzu-drumkit
- banks tr909, tr808, linn, akailinn, tr707

Never taught: `leslie`, `lrate`, `lsize`, `amp`, `squiz`, `triode`, `ring` (no-ops in superdough).

---

## 4. Capstones (album tracks)

Each capstone saves an album track with:
- the code
- a recording made through the MediaRecorder tap
- auto liner notes, listing the devices the analyzer detected (key, schema, cadences, borrowed and secondary chords, form), the learner's title and the tutor-review excerpt they choose to keep

Rubric checks run in the headless grader on normalized haps over the stated number of cycles. Every check is deterministic.

**Shared check primitives:**
- `tracks[]`
- `bars≥n`
- `bpmIn[a,b]`
- `durationSec≥n`
- `progression(key,[RN…],perBar)`: compares root chroma and quality pitch-class set, never strings
- `strongBeatChordToneRatio≥x`: beats 1 and 3, relative to the sounding chord on the chords track
- `cadence(barIdx,type)`
- `endsOn(degree)`
- `rangeSemitones≤n`
- `motifReuse≥x`: similarity of interval sequences, transposition-invariant
- `swingDetected(amount,n)`
- `formMatches("ABAB")`: section labels from `arrange`
- `contrast(sectionA,sectionB,{pitch≥3st|density≥25%|harmony≠})`
- `keyChange(at,+st)`
- `usesFeature(tb.*)`
- `degreeSet⊆`
- `velocityGhosts≥n`
- `onsetsMatch(pattern)`

**Tutor review (high effort)** always receives the code, the grader result, the liner-note analysis and the brief. It returns three strengths, two concrete revisions with code, and one listening question. It never decides pass or fail.

### Pop / rock / indie

| ID | Sessions | Opens after | Brief | Required devices | Deterministic checks | Tutor reviews |
|---|---|---|---|---|---|---|
| C1 First Loop | 1 | U02.CP | 4-bar loop: groove, root bass, 2-bar riff | backbeat, 8th hats, `< >` variation, note-name bass | tracks drums/bass/mel; bars=4; sd onsets ⊇ {1/4, 3/4}; bass midi ≤ 48 with ≥3 distinct pitches; mel range ≤ 15 st; bpm 70–140 | groove feel, bar-to-bar variety |
| C2 Four-Chord Song | 2 | U07.CP | 8 bars, original melody over a four-chord schema | I–V–vi–IV or a rotation, motif, PAC ending | progression ∈ H04 family; strongBeatCT ≥ 0.6; final chord I with melody on 1 at a downbeat; range ≤ 19 st; motifReuse ≥ 0.7 | melodic shape, motif development, chord–melody fit |
| C3 Verse–Chorus Demo | 3 | U09.CP | ≥1:30 demo, verse ×2 and chorus ×2; lead-sheet export | arrange, contrast, bass lock, energy curve | formMatches V C V C (C may be tagged); contrast(chorus,verse) on ≥2 axes; durationSec ≥ 90; bass onsets ∩ kick onsets ≥ 50%; lead sheet renders without the `approximate` flag | form, energy curve, hook strength |
| C4 Minor Indie Ballad | 2 | U10.CP | Aeolian verse; chorus cadence uses major V | i–VI–III–VII, harmonic-minor V | verse progression = H08; ≥1 V chord containing raised 7 followed by i; melody contains b3 and b6; endsOn(1) over i; bpm 60–95 | mood, how the raised 7 is used, texture |
| C5 12-Bar Shuffle | 2 | U11.CP | ≥2 choruses with riff, swing and turnaround | I7 IV7 V7, shuffle, call and response | 12-bar root map per chorus (quick change allowed); chords have dominant-7 pitch-class sets; swingDetected(1/3,4); bar 12 contains V; melody uses b3 or b5 ≥ 2×; riff motifReuse ≥ 0.8 | blues phrasing, call and response |
| C6 Modal Vamp | 2 | U14.CP | Mixolydian rock or Dorian indie/funk vamp, ≥16 bars | I–bVII–IV or i7–IV7 | characteristic tone (b7 or ♮6) on a strong beat ≥ 2×; no leading tone (Mixolydian) and no b6 (Dorian); tonic chord ≥ 40% of bars | modal colour, groove |
| C7 Chromatic Colour | 3 | U17.CP | Song with colour chords and a final key lift | ≥1 secondary dominant, bVI–bVII–I, truck-driver final chorus | each V/x resolves to x; bVI–bVII–I present; keyChange(lastChorus,+1 or +2) and chorus melody intervals identical; bars ≥ 32 | chromatic drama, voice leading |
| CF Core Finale | 4 | C7 | (a) original "album single" ≥2:00 with verse, chorus and bridge; (b) full transcription and arrangement of a PD song (one per row in §5 T7) | ≥4 of: secondary dominant, borrowed chord, modulation, suspension, syncopated bass, modal colour | (a) device count ≥ 4, form has a bridge, durationSec ≥ 120; (b) melody alignment ≥ 90%, changes ≥ 85% per bar, form map correct | album-level arc, an artist statement for the liner notes |

### Transcription capstones (core)

| ID | Sessions | Brief | Checks | Tutor reviews |
|---|---|---|---|---|
| X1 Folk Song Transcription | 2 | From Oak's rendition (audio only, code hidden), transcribe the melody and chords of one of Amazing Grace, Oh! Susanna or Simple Gifts, then arrange it | melody aligned by transposition-invariant degrees ≥ 90%; rhythm onset F1 ≥ 0.9; RN per bar ≥ 85% | which errors are perceptual and which are notational |
| X2 Blues Transcription | 2 | St. Louis Blues (1914) 12-bar strain or Careless Love: bass, then changes, then melody | bass line ≥ 90%; changes ≥ 85%; melody ≥ 85% | the blue-note choices |

### Jazz / soul / funk / advanced

| ID | Sessions | Brief | Devices | Checks | Tutor reviews |
|---|---|---|---|---|---|
| JC1 Guide Tones in 12 Keys | 2 | 3rd/7th line over ii–V–I through all keys, using `.transpose` | guidetones dict, cycle of 4ths | every chord's sounding pitch classes include its 3rd and 7th; successive guide-tone motion ≤ 2 st on ≥ 90% of steps; all 12 tonics present | line smoothness, singability |
| JC2 Jazz Blues in F | 2 | 2 choruses: original head, shell comping, walking bass, all from one `chord()` pattern | `.set`, rootNotes, swing | changes F7 Bb7 F7 Cm7-F7 / Bb7 Bo7 F7 D7 / Gm7 C7 F7-D7 Gm7-C7; bass has 4 onsets per bar; root on beat 1 ≥ 75%; beat-4 approach (±1–2 st to the next root) ≥ 50%; swing detected | the walking line, head–changes fit |
| JC3 Rhythm Changes Contrafact | 3 | 32-bar AABA in Bb over the I Got Rhythm (1930) changes | I–vi–ii–V, bridge D7 G7 C7 F7 | form and changes match; strongBeatCT ≥ 0.55; ≥50% of bridge chord changes are targeted by a 3rd or 7th on the downbeat | bebop vocabulary, motif across the A sections |
| JC4 Reharmonize a Standard | 3 | Oak lead sheet of Georgia on My Mind or Body and Soul (both 1930); keep the melody, reharmonize | ≥3 of: tritone sub, secondary ii–V, backdoor, dim passing | melody haps identical to the reference; each melody note is a chord tone or allowed tension (9/11/13; no b9 over maj, no 11 over maj/dom) ≥ 85%; device count ≥ 3 | taste, voice leading, comparison with Levine ch. 16 |
| RC1 16th-Note Funk | 2 | One-chord Dorian m7 vamp | ghost notes, syncopated bass, horn stabs, the one | ≥4 hits with velocity ≤ 0.4 on 16th off-beats; ≥3 bass onsets off the 8th grid; bass and kick at 0 in every bar; horns track present | pocket, interlock |
| RC2 Clave & Polyrhythm | 2 | Son clave 3-2 piece | clave, tresillo bass, a 3:2 layer, Euclidean percussion | clave onsets {0, 3/16, 6/16, 10/16, 12/16} per bar (1 cycle = 1 bar); bass ⊇ E(3,8) = {0, 3/8, 3/4}; ≥1 layer with 3 equal onsets per half-bar against 2; ≥1 `(k,n)` layer | clave alignment of other parts |
| AC1 One Tune, Two Genres | 3 | St. Louis Blues (1914) or Sweet Georgia Brown (1925) as indie and as funk | sound design per version | both versions: melody pitch-class sequence = reference; Δbpm ≥ 20 or swing ≠; instrument sets differ by ≥ 2; each version uses ≥1 A1 feature | genre idiom fidelity |
| AC2 Neo-Soul Ballad | 3 | maj9/m11 ballad | extended voicings, swung 16ths, anchor/mode voice leading, `nudge` | chords include 9 or 11 on ≥ 60% of bars; swingDetected(0.1–0.33, 8); top-voice motion ≤ 2 st on ≥ 80% of changes; `rhodes` present | voicing colour, feel |

---

## 5. Transcription ladder & repertoire

Repertoire rules:
- Oak ships only its own Strudel renditions and lead sheets.
- Compositions must be US-published ≤1930 or traditional. Use the traditional melody, never a modern arrangement.
- Each `repertoire.ts` entry stores `{title, year, status:'US-PD'|'trad', key, form, answerKey(strudel), verifiedBy}`, and content QA checks the publication year.

| Stage | When | Material | Answer format / grading | Bring-your-own audio |
|---|---|---|---|---|
| T1 Drum loops | U01–U02 | Generated kick/snare/hat loops, 8th then 16th grid | mini-notation; onset F1 | — |
| T2 Degree melodies | U03–U04 | Generated 3–5-note stepwise fragments; then Mary Had a Little Lamb (1830), Hot Cross Buns (trad), Frère Jacques (trad), Twinkle Twinkle (trad), Ode to Joy (1824) | `n().scale()`; degree alignment + rhythm | — |
| T3 Loop harmony | U05–U06 | Generated 4-chord loops: bass first, then quality, then RN; schema ID | rootNotes/RN per bar | — |
| T4 Folk melody + chords | U07, X1 | Amazing Grace (New Britain tune, 1829), Oh! Susanna (1848), Simple Gifts (1848), Aura Lee (1861), Red River Valley (trad), When the Saints (trad), Swing Low Sweet Chariot (spiritual), Down by the Riverside (trad), Auld Lang Syne (trad, pentatonic) | melody ≥ 90%, chords ≥ 85% | **Studio opens (melody mode)**: loop a hook from your own file, transcribe 2–4 bars, self-check list (contour, rhythm, landing note) |
| T5 Bass + chords + minor | U08–U10, C4 | House of the Rising Sun (trad melody), Wayfaring Stranger (trad), Go Down Moses (spiritual), Joshua Fit the Battle (spiritual), Greensleeves (trad) | bass ≥ 90% → chords → melody | Bass mode (U08), chord mode (U10): bass first, A/B against the slowed original |
| T6 Blues, modal, ragtime | U11–U14, X2 | St. Louis Blues (1914), Memphis Blues (1912), Careless Love (trad), Frankie and Johnny (trad), Scarborough Fair (trad, Dorian), Drunken Sailor (trad, Dorian), Old Joe Clark (trad, Mixolydian), The Entertainer A-strain (1902) | lead sheet in Strudel + staff | A/B overlay; self-assessment checklist |
| T7 Standards ≤1930 | U15–U17, CF | Five Foot Two (1925), Sweet Georgia Brown (1925), Bye Bye Blackbird (1926), Blue Skies (1926), Ain't She Sweet (1927), Ain't Misbehavin' (1929), Honeysuckle Rose (1929), Body and Soul (1930), Georgia on My Mind (1930), I Got Rhythm (1930), On the Sunny Side of the Street (1930) | melody, changes and form map | **Full-arrangement mode** (CF): drums → bass → chords → melody → form map; tutor reviews code only |
| T8 Advanced | J, R, A tracks | Tea for Two (1924), Lady Be Good (1924), Tiger Rag (1917), Maple Leaf Rag A-strain (1899); generated funk and clave loops | heads + changes + groove | Learner's own songs in any genre; the Gym "Song of the week" slot |

Never shipped:
- Mood Indigo (1931, not PD until 2027-01-01).
- Any post-1930 standard.
- Any recording.
- The Animals or Simon & Garfunkel arrangements.

The audio itself stays local in IndexedDB/OPFS and never leaves the device. Only code, events and the title go to the tutor.

---

## 6. Exemplar lessons (authoring template)

Lesson file shape (`content/lessons/U01/L01.ts`, exporting `lesson: Lesson`):

```ts
type GradeRule =
 | { kind:'choice'; answer:string|string[] }
 | { kind:'number'; answer:number; tol?:number }
 | { kind:'tap'; ref:Code; bars:number; windowMs:number; minHits:number; maxMedianErrMs:number }
 | { kind:'haps'; ref:Code; cycles:number; track?:string; compare:'onset'|'midi'|'pc'|'degree'|'s'; transpositionInvariant?:boolean }
 | { kind:'tempo'; bpm:number; beatsPerBar:number; tolBpm:number }
 | { kind:'source'; mustUse?:ToolId[]; mustNotUse?:ToolId[]; miniContains?:string }
 | { kind:'staffClick'; targetId:string }
 | { kind:'drill'; family:FamilyId; trials:number; minCorrect:number; params:object }
 | { kind:'sing'; targets:SungTarget[]; tolCents:number; minHoldMs:number; minCorrect:number; octaveFold:true }
 | { kind:'rubric'; checks:Check[] }            // capstone/make primitives (§4)
 | { kind:'all'; rules:GradeRule[] };
interface Step { id:string; kind:'listen'|'tap'|'predict'|'run'|'investigate'|'modify'|'quiz'|'staff'|'drill'|'sing'|'make'|'wrap'|'review';
  minutes:number; prompt:string; code?:string; readOnly?:'all'|'line1'|Range[]; grade?:GradeRule;
  hints:[nudge:string, pointer:string, worked:string]; onPass?:string; }
```

The three hint tiers unlock in order:
- the **nudge** after the first failed attempt
- the **pointer** after the second
- the **worked** answer after the third, or immediately on request

Using the worked answer marks the step `assisted`, which feeds FSRS as a Hard grade and does not block the step.

### Exemplar A — U01.L01 "Heartbeat" (first lesson)

Meta:

| Field | Value |
|---|---|
| minutes | 18 |
| meter / bpm | 4/4 / 90 |
| skills | R01 R02 R03 E01 |
| ear | A1 |
| prereq | U00 (latency offset stored) |
| unlocks | tb.s, tb.seq, tb.repeat, tb.setcpm, snd.uzu.core (bd sd hh cp rim) |
| canDo | "I can feel a steady beat, set a tempo, and write a beat in code." |

**S1 · listen · 1 min.**
Prompt: "This is where Unit 1 is headed. Everything in this groove grows from one thing: a steady pulse. Press Play and just nod along."
Code (read-only; locked features shown greyed with "unlocks in U01.L03/L04"):
```js
setcpm(90/4)
drums: stack(
  s("bd ~ bd ~"),
  s("~ sd ~ sd"),
  s("hh*8")
)
```
Grade: none (completes on Play ≥ 2 bars).

**S2 · tap · 2 min.**
Prompt: "Tap Space on every beat: the steady pulse you'd clap to. One bar of clicks counts you in, then 4 bars."
Code (hidden): the S1 groove.
Grade: `{tap, bars:4, windowMs:80, minHits:12, maxMedianErrMs:60}` against beats k/4. Latency offset applied; double taps within 120 ms are collapsed.
Hints:
1. "Tap with the low thud of the kick drum."
2. "Count '1, 2, 3, 4' out loud and tap on each number."
3. "Turn on Beat Dots: they flash on each beat. Tap with them."

Beat Dots stays allowed, but the attempt is marked assisted.
onPass: "That steady thing you just felt is the **pulse**. Each tap was a **beat**."

**S3 · predict · 1 min.**
Prompt: "In Strudel, everything inside the quotes is squeezed into one **cycle**. In Oak, one cycle is always one **bar**. How many kicks will you hear in each bar?"
```js
setcpm(90/4)
s("bd bd bd bd")
```
Grade: `{choice, answer:'4'}` from options 1/2/4/8.
Hints:
1. "Count the words inside the quotes."
2. "Each word gets an equal slice of the bar."
3. "4: four words, four kicks, evenly spaced."

**S4 · run · 1 min.**
Prompt: "Press Play (Ctrl/Cmd+Enter). Watch the punchcard light up and the beat counter go 1-2-3-4."
Explainer (shown after the first bar): "`setcpm(90/4)` means 90 beats per minute ÷ 4 beats per bar = 22.5 bars per minute. You'll always write tempo this way: `setcpm(BPM/4)`."
Grade: none (completes after Play ≥ 2 bars).

**S5 · investigate · 2 min.**
Prompt: "Delete one `bd` so there are three. Before you run it: will the bar get *shorter*, or will the kicks spread *further apart*?"
Grade: `{all, [ {choice, answer:'further apart'}, {haps, ref:'s("bd bd bd")', cycles:1, compare:'onset'} ]}`.
Hints:
1. "The cycle (bar) length is set by line 1, not by the words."
2. "Three equal slices of the same bar."
3. "Further apart: `s("bd bd bd")`."

onPass: "The bar stays the same length. More words means faster subdivisions; fewer words means slower ones."

**S6 · modify · 2 min.**
Prompt: "Put back four kicks and change the tempo to **120 BPM**."
Starting code: the S4 code.
Grade: `{all, [ {tempo, bpm:120, beatsPerBar:4, tolBpm:0.01}, {haps, ref:'s("bd bd bd bd")', cycles:2, compare:'onset'} ]}`.
If the learner writes `setcpm(30)`, the step passes with the info note "Prefer `setcpm(120/4)`: it shows the BPM."
Hints:
1. "Tempo lives on line 1."
2. "`setcpm(BPM/4)`: which number is the BPM?"
3. "`setcpm(120/4)`"

**S7 · modify · 2 min.**
Prompt: "Typing `bd` four times is slow. `bd*4` plays `bd` four times inside one slot. Rewrite the beat using `*`."
Grade: `{all, [ {haps, ref:'s("bd*4")', cycles:2, compare:'onset'}, {source, miniContains:'*'} ]}`.
Hints:
1. "Replace all four words with one word plus `*` and a number."
2. "`"bd*4"`"
3. "`s("bd*4")`"

onPass: toolbox flash: `*` is now yours.

**S8 · staff · 1.5 min.**
Prompt: "Musicians write this pulse as notes. Each ♩ (quarter note) = 1 beat; **4/4** means 4 quarter-note beats per bar. Which staff matches `s("hh*4")`?"
Three one-line percussion staves (the NotationModel renders the haps of `hh*2`, `hh*4` and `hh*8`). Clicking any of them plays it.
Grade: `{choice, answer:'staff-b'}`.
Hints:
1. "Count the note heads per bar."
2. "Four notes, each lasting one beat."
3. "The one with four ♩."

**S9 · investigate (ear + code) · 3 min.**
Prompt: "Mystery loop! Oak plays a kick pulse at a secret tempo. Edit `setcpm` until yours matches, then press Check. (Tip: tap along with the mystery loop; Oak shows your tapped BPM.)"
Code: `setcpm(100/4)\ns("bd*4")`. The mystery loop plays `s("rim*4")` at a target drawn from 70–140, at least 15 BPM away from 100.
Grade: `{tempo, bpm:<target>, beatsPerBar:4, tolBpm:4}`.
Hints:
1. "Faster or slower than yours? Start there."
2. "Use the tap-tempo readout, then round it."
3. "The target is `<target>`: `setcpm(<target>/4)`."

**S10 · make · 2.5 min.**
Prompt: "Your first sketch: a heartbeat for a song that doesn't exist yet. Pick a tempo between 60 and 160 and any of `bd sd hh cp rim`. Use exactly one sound per beat, four beats. Mixing sounds is encouraged: `s("bd rim bd cp")`."
Starting code: `setcpm(90/4)\ns("bd bd bd bd")`.
Grade:
```
{rubric, [
  onsetsEach(cycle) = {0, 1/4, 1/2, 3/4} over 2 cycles,
  bpmIn[60, 160],
  sounds ⊆ {bd, sd, hh, cp, rim},
  noEvalError
]}
```
Hints:
1. "Four words inside the quotes, one per beat."
2. "Each word can be a different sound."
3. "`setcpm(100/4)` then `s("bd hh sd hh")`."

onPass: saved to the Sketchbook as "Heartbeat"; the learner can rename it.

**S11 · wrap · 1 min.**
- Can-do ledger: "I can feel a steady beat, set a tempo, and write a beat in code."
- Toolbox cards fly in: `s()`, `setcpm()`, `*`, 5 drum sounds.
- Next-unlock teaser (goal-gradient): "Next: `~` — silence is rhythm too."
- Optional button "Ask Claude to listen" (tutor, low effort; input is the sketch code plus the rubric result): one encouraging, specific sentence and one curiosity question.

**SRS seeded:**

| Card | Type | Prompt → answer |
|---|---|---|
| `fact.cycle-bar` | fact | "In Oak, one cycle = ?" → one bar |
| `fact.setcpm` | fact | "120 BPM in 4/4" → `setcpm(120/4)` |
| `fam.tap.pulse` | perceptual | random groove at 70–140 BPM, 2 bars per trial, 5 trials |

Streak: credited once S10 passes.

### Exemplar B — U03.L01 "Home Base: the major scale & 1-3-5"

Meta:

| Field | Value |
|---|---|
| minutes | 21 |
| meter / bpm | 4/4 / 80 |
| skills | S01 S02 E03 E04 V02 V03 N02 |
| ear | B1 |
| prereq | U02.CP |
| unlocks | tb.n-degree, tb.scale, scale `major`, degree labels in the piano roll |
| canDo | "I can build a major scale in any key and hear whether a note is 1, 3 or 5." |

**S0 · review · 4 min.**
Engine-driven warm-up: FSRS due items interleaved across the week's material, starting with a high-retrievability item. Example: staff note names, `fam.halfwhole`, `fam.pitch.match`. Not authored per lesson.

**S1 · listen + predict · 1.5 min.**
Prompt: "Two endings of the same climb. Which one sounds *finished*?"
Clip A:
```js
setcpm(80/4)
mel: note("c4 d4 e4 f4 g4 a4 b4 c5").s("piano").slow(2)
```
Clip B: same notes, ending `… a4 b4 ~`.
Grade: `{choice, answer:'A'}`.
Hints:
1. "Listen to the last note. Does it want to keep going?"
2. "B stops one step short of somewhere."
3. "A: C feels like home."

onPass: "That home note is the **tonic**. Today's scale is built to come home to it."

**S2 · investigate · 2 min.**
Prompt: "On the keyboard view, the scale's notes are lit. Between most neighbours there's a black key, which makes a whole step. Click the two places with **no** key in between: the half steps."
Grade: `{choice, answer:['E-F','B-C']}` (multi-select).
Hints:
1. "Look for white keys with no black key between them."
2. "One pair is in the middle, one at the top."
3. "E–F and B–C."

onPass: reveal the formula **W W H W W W H**, the "major scale"; labels 1–7 appear above the keys.

**S3 · modify · 2.5 min.**
Prompt: "Build a major scale on **G** using W W H W W W H. Exactly one note needs a sharp."
```js
setcpm(80/4)
mel: note("g4 a4 b4 c5 d5 e5 f5 g5").s("piano").slow(2)
```
Grade: `{all, [ {haps, compare:'midi', ref:'note("g4 a4 b4 c5 d5 e5 f#5 g5").slow(2)', cycles:2}, {source, miniContains:'f#5'} ]}`.
If the sound is right but spelled `gb5`, the step does not pass, with the feedback: "Sounds right! But a scale uses each letter once: G A B C D E _ G. Which letter is missing?"
Hints:
1. "Check steps 6→7: E to F is only a half step."
2. "Raise F by a half step."
3. "`f#5`"

**S4 · run (the unlock) · 2 min.**
Prompt: "Spelling every key by hand is slow. Musicians think in **scale degrees**: numbered steps from the tonic. Strudel does too, but it counts like an array, from 0. **n = degree − 1.** Run it and read the degree labels."
```js
setcpm(80/4)
mel: n("0 1 2 3 4 5 6 7").scale("C4:major").s("piano").slow(2)
```
Inline table: `n: 0 1 2 3 4 5 6 7` → `degree: 1 2 3 4 5 6 7 1'`.
Grade: none (completes on Play).
onPass: unlock card for `n().scale()`: "Play in any major key by changing one word."

**S5 · quiz · 1 min.**
Two numeric inputs:
- "Which `n` plays degree 5?" → `{number, answer:4}`
- "Which `n` plays 1 an octave up?" → `{number, answer:7}`

Hints:
1. "Subtract one."
2. "Degree 5 → n 4; the 8th note of the scale is index 7."
3. "4 and 7."

**S6 · predict + run · 1.5 min.**
Prompt: "Change `"C4:major"` to `"G3:major"`. Will the melody's *shape* change, or just its height? Hum your guess, then run."
Grade: `{all, [ {choice, answer:'same shape, different height'}, {source, mustUse:['tb.scale']} ]}` plus the haps check `degree sequence = [1..7,1']` with tonic G.
Hints:
1. "Only the home note moved."
2. "Every degree keeps its distance from home."
3. "Same shape: the key is just a setting."

onPass: "A **key** is the tonic plus its scale. In code, it's one parameter."

**S7 · modify · 1.5 min.**
Prompt: "Play the home chord's notes one by one, as eighth notes: degrees **1 3 5 1' 5 3 1**, then a rest."
Grade: `{haps, ref:'n("0 2 4 7 4 2 0 ~").scale("C4:major")', cycles:1, compare:'degree', transpositionInvariant:true}` (any major key accepted).
Hints:
1. "Convert each degree to n by subtracting 1."
2. "1→0, 3→2, 5→4, 1'→7."
3. "`n("0 2 4 7 4 2 0 ~")`"

**S8 · drill (functional ear, B1) · 3.5 min.**
Prompt: "Oak plays a cadence that says 'this is home', then one note. Is it **1, 3 or 5**? Then Oak plays it walking home."
Engine:
- Cadence: I–IV–V–I on `piano`, close voicing, random inversion.
- Key: random from C D Eb F G A Bb, different every trial.
- Target note: random register 3–5.
- Resolution: 3→2→1, 5→6→7→1', 1 is held.

Grade: `{drill, family:'fam.deg.major.135', trials:8, minCorrect:6}`.
Adaptive: under 4/8 after 6 trials inserts a blocked contrast set (1 vs 5, then 1 vs 3) before resuming interleaved trials.
Hints:
1. "1 = at rest."
2. "5 = stable but open, a leaning post. 3 = the sweet colour of the chord."
3. Replay the cadence followed by 1-3-5 played in order as a reference.

**S9 · sing · 2 min.**
Prompt: "After the cadence, sing **do** (1) and hold it. Then sing **do–mi–sol–mi–do** (1-3-5-3-1)."
Targets are pitch classes placed inside the range calibrated in U00.L02.
Grade: `{sing, tolCents:50, octaveFold:true}`, two parts:
- tonic: `minHoldMs:400`, `minCorrect:1`
- arpeggio: 5 targets, `minHoldMs:200`, `minCorrect:4`

Pitch pipeline:
- pitchy clarity ≥ 0.9
- median-of-5 filter
- onset and stability segmentation

Hints:
1. "Hum it first."
2. "Oak replays do; match it, then step up."
3. "Sing on 'la' if the syllables get in the way."

If the mic is unavailable, the step becomes "sing silently and self-rate". It is recorded as unverified, and V nodes do not advance.

**S10 · staff · 1 min.**
Prompt: "Here's G major on the treble staff, with degrees and solfège under each note. Click **degree 3**."
Grade: `{staffClick, targetId:'oak-e3'}` (B4).
Hints:
1. "Start from G = 1 and count up."
2. "G A B…"
3. "B4."

Note: the F# in the scale previews key signatures (U03.L05).

**S11 · make · 2.5 min.**
Prompt: "Write a 2-bar 'home' melody: **only degrees 1, 3 and 5** (any octave), ending on **1**, in any major key. Paste in your Heartbeat or another drum sketch if you want."
```js
setcpm(80/4)
mel: n("<[0 2 4 2] [4 2 0 ~]>").scale("C4:major").s("piano")
// drums: paste a groove from your sketchbook
```
Grade:
```
{rubric, [
  hasTrack('mel'),
  noteOnsets(mel, 2 cycles) ≥ 6,
  degreeSet(mel) ⊆ {1, 3, 5} (pitch classes relative to context.scale tonic),
  scaleType == major,
  lastNoteDegree == 1,
  noEvalError
]}
```
Hints:
1. "Use only n values 0, 2, 4, 7, -3, -5."
2. "Make the very last note 0 or 7."
3. Shows the starter with one alternative ending.

onPass: saved as "Home Base"; auto-tag `key: <tonic> major`.

**S12 · wrap · 1 min.**
- Can-do: "I can build a major scale in any key and hear whether a note is 1, 3 or 5."
- Skill-map nodes S01, S02, E04 light up.
- Next unlock: "U03.L02: degrees 2 and 4, the restless neighbours; negative n reaches below home."
- Optional "Ask Claude": tutor comments on the contour of the S11 melody.

**SRS seeded:**

| Card | Type | Content |
|---|---|---|
| `fact.major-formula` | fact | WWHWWWH |
| `fact.n-index` | fact | n = degree − 1 |
| `fact.major-halfsteps` | fact | half steps fall at 3–4 and 7–8 |
| `fam.deg.major.135` | perceptual | B1 drill family |
| `fam.sing.135` | perceptual | sung 1-3-5 |

---

## 7. Conventions (binding for every lesson)

### Time & tempo
1. **1 cycle = 1 bar, always.** Every lesson's code starts with a tempo line. For graded steps it is read-only unless the step is about tempo.

   | Meter | Tempo line | BPM refers to |
   |---|---|---|
   | 4/4 | `setcpm(BPM/4)` | quarter note |
   | 3/4 | `setcpm(BPM/3)` | quarter note |
   | 6/8 | `setcpm(BPM/2)` | dotted quarter |
   | 12/8 | `setcpm(BPM/4)` | dotted quarter |
   | 5/4 | `setcpm(BPM/5)` | quarter note |
   | 7/8 | `setcpm(BPM8/7)` | eighth note |
   | 9/8 (2+2+2+3) | `setcpm(BPM8/9)` | eighth note |

   Lesson metadata declares `meter` and `bpm`. The grader captures the stubbed `setcpm` value and compares it to the metadata.
2. **Swing:** written straight. 8th swing is `.swingBy(1/3, 4)`; 16th swing is `.swingBy(1/3, 8)`, with amount 0–1/3. The NotationModel quantizes swung haps back to the straight grid when the lesson declares `swing`, and prints "Swing 8ths" or "Swing 16ths".
3. **Bars:** bar index = floor(onset). A multi-bar idea uses `< >` or `.slow(n)` and never relies on a cycle being longer than a bar.

### Code style
4. **Double quotes** are always mini-notation. Single quotes are never used.
5. **Track labels** are lowercase from this fixed set: `drums bass chords keys gtr mel pad perc horns vox` (plus `fx`). The `_label:` prefix mutes a track. **No label may start with capital S** (Strudel's solo prefix). Graders select tracks by label; a single unlabeled expression is track `main`.
6. **Pitch:** note names always carry an octave (`c4`, never `c`; bare `c` = c3 in Strudel). Lint warns on octave-less pitched notes. Middle C = **c4 = 60**.
7. **Registers:** `.scale()` tonics always carry an octave.

   | Part | Tonic octave / anchor |
   |---|---|
   | melody | `X4:` |
   | bass | `X2:` or `.rootNotes(2)` |
   | chords | voicing default anchor c5 (lessons may set `anchor`) |

   Sung targets are octave-folded into the learner's calibrated range.
8. **Scale names** use `:` instead of spaces (`"C4:major:pentatonic"`).

### Pitch language
9. **Degrees:** primary label is the scale degree with accidental prefix: `1 2 3 4 5 6 7`, `b3 b6 b7 #4 b2 #5`.
   - Octave marks are ABC-style: `1'` is the octave above, `5,` is below the tonic.
   - Strudel index is taught as **n = degree − 1**: `n 7 = 1'`, `n -1 = 7,`.
   - Chromatic degrees use step strings `"4#"`/`"7b"` from U15.
   - The piano roll and staff always show 1-based degrees.
   - Fixed degree colours: 1 = tonic colour, and 3, 5 and 7 each have their own hue.
10. **Solfège:** movable do. Major: do re mi fa sol la ti. Minor is do-based: do re me fa sol le te.

    | Raised | Lowered |
    |---|---|
    | #1 di | b2 ra |
    | #2 ri | b3 me |
    | #4 fi | b5 se |
    | #5 si | b6 le |
    | #6 li | b7 te |

    Shown as a toggle under the degree labels and used as the singing aid.

### Chord symbols
11. **Display mapping.** Strudel input is canonical in code; the lead-sheet form is the default display, with a jazz-glyph toggle.

    | Strudel / iReal (code) | Lead sheet (default display) | Jazz glyph | Roman numeral (in C) |
    |---|---|---|---|
    | `C` | C | C | I |
    | `C-` / `Cm` | Cm | C– | i / ii (on D) |
    | `Co` | C° | C° | vii° |
    | `C+` / `Caug` | C+ | C+ | III+ |
    | `Csus` | Csus4 | Csus | — |
    | `C^7` / `CM7` | Cmaj7 | C∆7 | Imaj7 |
    | `C7` | C7 | C7 | V7 |
    | `C-7` / `Cm7` | Cm7 | C–7 | ii7 |
    | `Ch7` / `Cm7b5` | Cm7♭5 | Cø7 | viiø7 |
    | `Co7` | C°7 | C°7 | vii°7 |
    | `C6` / `C-6` / `C69` | C6 / Cm6 / C6/9 | — | — |
    | `C^9` / `C-9` / `C9` / `C13` | Cmaj9 / Cm9 / C9 / C13 | — | — |
    | `C7b9` / `C7#9` / `C7alt` | C7♭9 / C7♯9 / C7alt | — | — |

    Lint errors:
    - `Cmaj7`, `Cdim`, `Cmin`, `dim7` → "Strudel spells this `C^7` / `Co` / `C-` / `Co7`."
    - lowercase roots → "chord roots must be uppercase".

    Before any tonal comparison, normalize ∆/Δ→^, ø→h, °→o, −→-, ♭→b, ♯→#, s/f→#/b.
12. **Roman numerals:**
    - Case = quality: upper = major, lower = minor; ° dim, ø half-dim, + aug.
    - Sevenths: `Imaj7 ii7 V7 viiø7 vii°7`.
    - Borrowed: `bIII bVI bVII iv`.
    - Secondary: `V/V`, `V7/vi`, `vii°/V`.
    - Inversions in lead sheets use slash chords (`C/E`); classical figures are never used.
    - Answers are graded by root chroma + quality pitch-class set + bass, never by string.
13. **Spelling:** never display Strudel's raw note strings. Re-spell from MIDI using the lesson's key, then the chord context, then the direction rule (tonal 6.5.1).

### Lesson structure
14. **Session template:** warm-up review 3–5 min → PRIMM core with 2–4 graded checks → Make (saved sketch, mandatory) → wrap. A wrap always contains a can-do line, the unlock or next-unlock preview, an optional tutor listen, and the SRS cards seeded.
    - **Sound → code → symbol order** within each concept: hear or play it first, then the code, then the staff or term.
    - Every pitched concept appears in all three synchronized views (code ↔ piano roll ↔ staff), with linked highlighting.
15. **Introducing terms:**
    - A term is introduced only *after* the learner has heard or used the thing. It appears **bold** in the `onPass` text of the step where it is named.
    - At most **3 new terms per lesson**.
    - Each term gets a glossary entry with an audio example and becomes a fact card at the wrap.
    - Terms are never introduced in a hint or in a graded prompt before they've been heard.
16. **Grading:**
    - Deterministic graders alone decide pass or fail.
    - Perceptual drills target about 85% success adaptively; lesson-internal drill passes are about 75% (introductory), and mastery comes from FSRS plus checkpoints.
    - Singing tolerance is ±50¢, tightening to ±35¢ after U07 and ±25¢ after U11 (per-learner override). Octaves are folded.
    - Tap windows are ±80 ms, tightening to ±50 ms by U13, after latency calibration.
17. **Make steps** never fail permanently: after 3 tries the sketch saves as "draft" and the rubric gaps show as tutor talking points.
18. **IDs:**
    - Lessons `Uxx.Lyy`; steps `S1…Sn` (stable within a lesson version).
    - Skill nodes as in §2; toolbox `tb.*`, sounds `snd.*`.
    - Drill families `fam.*`; fact cards `fact.*`.
    - Every lesson file carries `version`. Progress keys on `id`, and minor edits keep step IDs.
19. **SRS mapping:** facts use desiredRetention 0.9; perceptual families 0.85. A perceptual review is a mini-set of 5–8 freshly generated trials (random key, register and instrument):

    | Result | Grade |
    |---|---|
    | <70% | Again |
    | 70–89% | Hard |
    | ≥90% | Good |
    | ≥90% with fast median response time | Easy |

    Drill families seeded by lessons:
    - **Rhythm:** tap.pulse (U01.L01), rhythm.echo8 (U01.L04), rhythm.dict8 (U01.L09), rhythm.dict16 (U01.L06), sync.pos (U13.L01), rhythm.dict.adv (U13.L06), swing.ratio (U11.L07), clave.dir (R3.L02), odd.group (R2.L01)
    - **Pitch, degrees & voice:** pitch.hilo (U02.L01), pitch.match (U02.L07), tonic.find (U02.L07), deg.major.135 / .12345 / .all (U03.L01–03), sing.degrees (U03.L07), deg.minor (U10.L03), mode.color (U14.L06), deg.chromatic (U15.L01)
    - **Intervals & melody:** int.inkey (U04.L01), int.iso.asc / desc / harm (U04.L06), mel.dict (U03.L09)
    - **Chords & harmony:** chord.qual.Mm (U05.L02), chord.qual.dimaug (U05.L03), chord.inv (U05.L05), cadence.id (U06.L04), bass.deg (U06.L06), schema.id (U06.L07), chord.qual.7th (U12.L02), blues.form (U11.L05), secondary.id (U15.L06), borrowed.id (U16.L05), modulation (U17.L03)
    - **Jazz:** iiVI (J2.L01), ext.color (J1.L02), guide.sing (J2.L04)
20. **Genre flavour:** every capstone and every Make step offers a genre-flavour choice (pop/rock/indie or jazz/soul/funk starter kit: drums bank plus instrument aliases) without changing the rubric.

### Critical Files for Implementation
- /Users/fpl0/Code/Oak/content/syllabus.ts (course map: lessons, CPs, capstones, gates)
- /Users/fpl0/Code/Oak/content/skills.ts (139-node skill graph with edges and regions)
- /Users/fpl0/Code/Oak/content/toolbox.ts (unlock table: tb.*/snd.* → lesson, concept, catalog entry)
- /Users/fpl0/Code/Oak/content/lessons/U01/L01.ts and /Users/fpl0/Code/Oak/content/lessons/U03/L01.ts (exemplar lessons; Lesson/Step/GradeRule types in /Users/fpl0/Code/Oak/src/curriculum/types.ts)
- /Users/fpl0/Code/Oak/content/capstones.ts and /Users/fpl0/Code/Oak/content/repertoire.ts (rubric checks, PD repertoire with answer keys)