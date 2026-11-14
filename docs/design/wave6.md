# Oak Wave 6 seams — sevenths, rhythm II, modes, chromatic harmony, the end of the core

**Status: binding for Wave 6 Build.** Written in the Foundation phase (2026-11-13). Ranks below `contracts.md`
(version 1.6), above everything else (`wave5.md`, `wave4.md`, `wave3.md`, `wave2.md`, `interfaces.md`, ux, the rest).
It records who owns what, the carry-overs from Wave 5, the seams between builders (signatures copied from the code;
when this file and the code disagree, the code is right and this file has a bug — report it), the API additions, the
dev seeds, the ports, what is frozen, the workflow rules, the browser-test rules, the definition of done and the
Wave 6 content kinds.

Goal of the wave, the end of the core: units U12 "Seventh Chords" (6 lessons), U13 "Rhythm II" (6 + U13.CP over
U12–U13, which opens the jazz and rhythm tracks), U14 "Modes" (6 + CP), U15 "Secondary Dominants" (6), U16 "Borrowed
Chords" (5) and U17 "Modulation" (4 + U17.CP over U15–U17); capstones C6 "Modal Vamp" (2 sessions) and C7 "Chromatic
Colour" (3); the core finale in two parts, CF-A "Album Single" (4 sessions) and CF-T "Standard Transcription" (4
sessions in gym slots from U15.L01); ear training stages E–F and the rhythm part of H; ladder levels L7 and L8; and
the moment the learner completes the core (session 185 in contracts 1.6: C3 gained a fourth session and U05 a ninth
lesson).

Read first: `wave5.md` "Wave 5 state" (what you can rely on and the known gaps), then this file in full, then the
contracts sections your area touches (§2.3–§2.6, §2.8–§2.9, §3, §4.3, §5, §6.6–§6.9, §7.3, §9, §10, §11).

The three things that decide whether this product works — judge every choice against them: **enjoyment** (each
session ends with something the learner made that sounds like music they would replay), **pace** (a session fits its
15/20/25 minutes, one new idea at a time) and **return** (the learner leaves knowing what they can now do and what
opens next). This wave carries the longest stretch of abstract harmony in the course (U15–U17): every idea in it
arrives as a sound from a record first, and the finale must feel like the reward for half a year of work.

## Wave 6 state (read this first)

Written by the gate (2026-11-14) after the six integrators, the closer and the six reviewers. The code beats this
summary; `interfaces.md` §23 and §23.1 have the cross-package API as built; `docs/decisions.md` row W6 has the measured
gate numbers.

**What Wave 7 (the jazz, rhythm and arrangement tracks, the illustrated Oak, the offline renderer) can rely on**
(implemented and tested by execution):

- **The whole core is playable, 185 sessions in the default order (contracts 1.6).** 129 lessons (125 core: U00–U17;
  4 A1 side lessons), 13 checkpoints (the ten of Wave 5 through U11.CP, plus U13.CP, U14.CP and U17.CP), capstones
  C0–C7, X1, X2, CF-A and CF-T. U12–U17 are in `RELEASED_UNITS` and their IDs are locked. U13.CP opens the J and R
  tracks (recorded gates, `GET /tracks`); their lessons are not written, and every surface says so calmly.
- **The end of the core** (`GET /course/completion`, `core: "complete"` in the plan): the finale Coda in four parts, the
  album of twelve tracks with Side A as one record, the reopenable ending (`/session/coda?ending=1`), Today the day
  after ("Side A is complete. Play it."). Announced once, idempotent under retries and backup → import
  (`server/src/review-wave6-robustness.test.ts`).
- **Simulation through the end of the core**: `server/src/wave6-sim.test.ts` walks three profiles through session 185
  and 60 days beyond; `packages/srs/src/simulation-wave6.test.ts` holds contracts §7.4 through CF-A.S4.
- **Journeys on the real stack**: `e2e/journey/w6-days.pw.ts`, `w6-capstones.pw.ts` (C6, C7, CF-T in its four slots,
  CF-A to a real 2:14 take, the ending), `prod.pw.ts` "production (Wave 6)", and `e2e/review/w6-journey.pw.ts`
  (keyboard-only U15 day, pushes tapped on the beat, ties by keyboard, the bar timeline by digit).
- **Takes end where the song ends** (`play({ once })`, a 0.2-s fade on the record tap). **The Master card** reads a
  well-mixed song as "touching" (`LIMITER_WORKING_SHARE` 0.4) and gives a gain factor when it is too loud or quiet.
- **C6 can start from the learner's own Mode Lab vamp** (U14.L06's Make; `CAPSTONE_FROM_SKETCH`), as U15.L06's
  Make starts from U12.L04's (`fromSketch`, d15). CF-A starts from the plan or any sketch.
- **The transcribe picker loads only the chosen song's module**: the answer keys of the songs not chosen never reach
  the network panel.
- **Browser budgets** (`e2e/budgets.json`, decisions 63 and 66).

**Known gaps** (open after Wave 6):

- **The six Wave 6 fact decks are live since the corrections pass** (contracts 1.7, §7.3 rows, `decks`; decision 71).
  Their format examples were changed at the corrections gate so that no example is a card's own answer.
- **Transcription feedback names the expected chord at rung 0** ("Bar 2: I, expected V7/vi.") on L5–L8, X1, X2 and
  CF-T, where contracts §5.3 shows only "where and how many" below rung 3. Kept for now (decision 67); the fix is a
  rung-aware `checkLines(result, rung)` over `toIssueView`.
- **Every CF-T standard and the new folk answer keys are `verified: false`**: outside dev mode L8 and CF-T stay
  locked until a person verifies one. St. Louis Blues (d14) was not transcribed; X2 offers Careless Love only.
- **The browser run takes 26.3 min of wall time** (jobs 8), over the 20-minute target; 140 minutes of test time.
- `contains-rn` compares on the triad core, so a plain triad meets a `V7` numeral (decision 68); CF-A's `form` rule
  accepts a bridge that is the chorus renamed (only the optional contrast line flags it).
- `sing.guide-tones` and `key-plan` stay PLANNED / GRADER_READY; a `dictation` on a grid, a per-example `meter`, a
  symbol-free lead-sheet chart and `StepUi.lenses` are not in the schema.
- The reopened ending has no release card; the kit's Wave 6 pieces (`BranchCard`, `AlbumPlayerBar`,
  `DeviceCounter`, `KeyStrip`) are not placed on the session surfaces. The Coda's "next" is a prose line in each
  lesson, not the planner's real next session with its goal.
- Grader wording still generic in places: `harmony.bass` names the voicing's lowest note for a dim7 on another root;
  `uses tb.scale.patterned` prints a C→G example under a C→D plan; C6 with `.early().struct()` chords loses its
  home-chord share line. Lessons that meet these override the text.
- Ladder L8 is reached by route tests and its seed, not by play in any simulation.
- No human has listened to U12–U17, the lifted Band chords, U12.L03's strings tune or U15.L06's trumpet over strings.

## 0. What Wave 6 inherits

Everything listed under "What Wave 6 can rely on" in `wave5.md`. A large part of Wave 6's theory, grading and
engraving already existed from Waves 1–5; a seam is only what was missing. Checked by execution in Foundation:

- `@oak/theory`: the five seventh qualities in the chord table (`parseChordSymbol("C^7")`, `readChord` from pitch
  classes with a bass, `SEVENTH_CORE`), `diatonicChords(key, true)` (Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7; minor too),
  numerals both ways including applied ones (`romanText`: "V7/V", "viio7/ii"; `chordOfRoman`; `romanOf` reads a
  chord in context, so D7 before G in C is V7/V), `♭VII`, `♭VI`, `♭III`, `♭II` and `iv`, the modes in `SCALES` and
  `MODES` with their characteristic tones, modal numerals (in a Lydian key D in C reads `II`, never `V/V`), chromatic
  degrees and syllables (`degreeOf`, `syllableOf`: fi si di ri li, ra me se le te), chromatic step strings
  (`strudelStep`: ♯4 ↔ `3#`), spelling by chord then key then direction (`spellMidi`), `invertInterval`, compound
  intervals in `intervalOf`, `METERS` with the dotted-quarter tempo unit, `barPosition` ("1 la li", "1-trip"),
  `SCHEMAS` `schema.mixolydian` and `schema.dorian-vamp`.
- `@oak/grader`: an analyzer for every rule contracts §6.6 names for C6, C7 and CF-A — `mode` (colour tone on strong
  beats, avoided tones, tonic chord in 40 % of bars), `contains-rn` with `mustResolve`, `progression` with `bars`,
  `key-change` (`semitones`, `minBarsAfter`, `sameMelody`; a golden test since Wave 5), `device-count`
  (`detectDevices`: the six core devices), `form`, `duration-sec`, `guide-tones`, `modulation`, `velocity-ghosts`,
  `syncopation`; `analysisKeyContexts` (the key bar by bar from a patterned `.scale()`), `keyFromContext`,
  `metricWeight`, `finestGrid` / `gridFeel`, `isStrong`. Pinned on small pieces in `rubric/wave6-rules.test.ts`.
- `@oak/notation`: ties across beats and bar lines, dotted values, 6/8 and 12/8 beaming and rests, triplets and
  tuplets up to 9, signature changes after a double barline (`NotationInput.keyChanges`), modal signatures
  (`K:Ddor`), chromatic notes spelled by the chord under them, seventh-chord symbols and applied numerals. The
  note-list DSL writes dots (`4.`), ties (`~`) and triplet values (`8t`); the edit model has `ties` and `dots`.
  Pinned in `wave6.test.ts`.
- `@oak/api`: capstones over any number of sessions, the capstone gate with a `lesson` condition (CF-T at U15.L01),
  IDs for CF-A, CF-T and the track lessons, `GymSession.ladderLevel` up to 8.

Wave 5 known gaps that are not in the carry-over list stay open (see `wave5.md`).

## 1. Ownership (Build phase)

Each engineer owns exactly these paths (verbatim from the wave plan):

```
 - notation     : packages/notation/**                                                                  (own e2e Vite port 5194 if a DOM render test needs one)
 - grader       : packages/grader/**, packages/theory/**, packages/content-kit/** (additive after Foundation)  (no browser)
 - answers      : app/src/answers/**                                                                    (ports vite 5202 / api 8802)
 - workbench    : app/src/workbench/**, app/src/studio/**, app/src/toolbox/**, app/src/routes/studio/**, app/src/routes/toolbox/**  (5206 / 8806)
 - transcribe   : app/src/transcribe/**, app/src/routes/transcribe/**                                    (5213 / 8813)
 - audio        : packages/audio/**, packages/pitch/**, app/src/voice/**, app/src/onboarding/**, app/src/lib/mic*.ts, app/src/routes/onboarding/**, app/src/routes/settings_.voice.setup.tsx, app/src/routes/settings/voice.tsx, app/src/routes/settings/audio.tsx  (5209 / 8809)
 - drills-ui    : app/src/drills/**, app/src/routes/practice/**                                         (5203 / 8803)
 - drills-engine: packages/drills/**, packages/srs/**, content/families.ts, content/decks/**, content/gym/**   (no browser)
 - lesson       : app/src/lesson/**, app/src/routes/learn/**, app/src/routes/checkpoint/**            (5201 / 8801)
 - session      : app/src/session/**, app/src/map/**, app/src/routes/index.tsx, app/src/routes/session/**, app/src/routes/progress.tsx, app/src/routes/oak.tsx, app/src/routes/dev/**  (5205 / 8805)
 - capstone     : app/src/capstone/**, app/src/album/**, app/src/routes/capstone/**, app/src/routes/album/**  (5210 / 8810)
 - tutor        : server/src/tutor/**, scripts/tutor/**, app/src/tutor/**, app/src/lib/tutor-stream.ts, app/src/routes/settings/tutor.tsx  (5208 / 8808)
 - kit          : app/src/ui/** (kit, shell, keys, review — the ONLY engineer who edits shared UI), app/src/styles/**, app/src/routes/settings/** except voice.tsx, audio.tsx and tutor.tsx  (5214 / 8814)
 - server       : server/** except server/src/tutor/**; packages/api/** (additive); scripts/** except scripts/content/**, scripts/sounds/** and scripts/tutor/**  (api 8811)
 - sound        : packages/strudel/**, scripts/sounds/**, sounds/**                                      (5192)
 - author:U12a  : content/core/U12/L02, L03        - author:U12b : content/core/U12/L04, L05        - author:U12c : content/core/U12/L06
 - author:U13a  : content/core/U13/L02, L03        - author:U13b : content/core/U13/L04, L05        - author:U13c : content/core/U13/L06
 - author:U14a  : content/core/U14/L02, L03        - author:U14b : content/core/U14/L04, L05        - author:U14c : content/core/U14/L06
 - author:U15a  : content/core/U15/L01, L03        - author:U15b : content/core/U15/L04, L05        - author:U15c : content/core/U15/L06
 - author:U16a  : content/core/U16/L02, L03        - author:U16b : content/core/U16/L04, L05
 - author:U17a  : content/core/U17/L01, L03        - author:U17b : content/core/U17/L04
 - author:CP    : the U13.CP, U14.CP and U17.CP items (content/checkpoints.ts and the checkpoint folders AUTHORING.md names) and content/bands/** — the only author who edits those
 - author:capstones : the C6 and C7 entries of content/capstones.ts and their capstone folders
 - author:finale    : the CF-A and CF-T entries of content/capstones.ts and their capstone folders (both capstone authors share content/capstones.ts: re-read it immediately before each edit, change only your own entries, never rewrite the file)
 - author:repertoire : content/repertoire/** — the only author who edits it
 (U12.L01, U13.L01, U14.L01, U15.L02, U16.L01 and U17.L02 are the exemplars written in Foundation. The remaining content registries — syllabus/skills/toolbox/terms/glossary/candos/flavours/milestones — content/specs/**, content/validate/**, content/lib/** and scripts/content/** are frozen during Build: authors request changes via apiNotes. app/src/lib/** (except mic*.ts and tutor-stream.ts), app/src/main.tsx, router.tsx and routes/__root.tsx, the root playwright.config.ts, e2e/support/** and scripts/e2e-parallel.ts are frozen during Build for everyone.)
```

Files Foundation created or changed inside an owner's paths are that owner's from now on; keep their exported
signatures (others code against them) and extend freely:

| Owner | Seam files Foundation wrote | What the owner does with them |
|---|---|---|
| grader | `packages/theory/src/wave6.ts` (+ test) and its export block in `theory/src/index.ts`; `packages/grader/src/analyze/wave6-views.ts` (+ test); `grade/standard-ladder.ts` (+ test); `rubric/wave6-rules.ts` (`WAVE6_UNBUILT`, the `reharmonize` stub, `unbuiltWave6Matcher`) and `rubric/wave6-rules.test.ts`; the guard in `evalRule` and in `runMatcher`; `gradeStandardLadder` and the Wave 6 export block in `grader/src/index.ts`; `RULES.reharmonize` | build each entry of `WAVE6_UNBUILT` and delete it from the list in the same change (§3.2); `harmony.wrongQuality` (d11); d6, d12; the golden tests of contracts §6.6 for C6, C7 and CF-A (one passing piece per shipped flavour); move each rule and feature into content-kit `IMPLEMENTED` with its tests |
| notation | `packages/notation/src/wave6.ts` (+ test) and its export block | d5 (one shared helper for swing printing and relabelled spellings); `NoteListContext` triplets (§3.4); whatever the U13 lessons show that the pinned tests do not cover |
| answers | `app/src/answers/staff/rhythm.ts` (+ test): the types, `rhythmPalette`, and the stubs `applyRhythmEdit` / `rhythmKey` | build ties, dots and triplets in the staff input (§3.4) and wire them into `StaffInput.tsx`; the `form` widget's `input: "map"`; `grid` with 6 and 24 steps; `rn-palette` `labels` / `slotKeys`; `scale-builder.from` (§11); d4 |
| transcribe | two narrowings so the tree compiles with the wider ladder types: `ProjectList.tsx` (`onOpen(s.songId, level)`), `SongPanel.tsx` (`passedStages` without `form`) | the L8 picker and its four-stage panel (form map → bass → changes → melody), CF-T's workspace parts; d10, d12, d18 |
| server | `packages/api` Wave 6 block (`dto.ts`: the shared shapes before `CheckpointStatusSchema`, the block at the end; `contract.ts` end; `wave6.test.ts`), the optional fields of §5; 501 stubs in `server/src/routes/{course,library}.ts`; `routes.test.ts` "Wave 6 endpoints" (`WAVE6_PENDING`); `services/ladder.ts` answers 501 for L8 and for a form-map submission | dev seeds of §6 FIRST; then the five endpoints and the behaviour of §5; remove each name from `WAVE6_PENDING` as it lands |
| session, capstone, kit | nothing in their folders | read `boot.openSession` no more: the tab's own session is `ownOpenSession(useSessionDay().data)` (§4.2, d21) |

## 2. Carry-overs from Wave 5

Verbatim from the wave plan; the owner in brackets fixes each in this wave with a regression test. The failing cases
are in `/private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/w5/gate.md` and
`…/scratchpad/w5/review-*.md`; the browser-suite audits in `…/scratchpad/speed/audit-days.md` and
`audit-surfaces.md`. Contracts are at version 1.6.

```
 (d1) [content lead, in Foundation — the ONE contracts edit an engineer makes this wave, authorised here] Promote the written fact decks. In ONE change: (a) add these rows to contracts §7.3, each placed after the family row of its unlock lesson, text exactly: | `deck.chd.triads` | F | U05.L02 (diminished and augmented U05.L03) | C02, C03 | — |  ·  | `deck.har.rn` | F | U06.L02 | N06 | — |  ·  | `deck.har.cadence` | F | U06.L04 (deceptive U06.L06; plagal U06.L07) | H03 | — |  ·  | `deck.key.minor` | F | U10.L02 (harmonic minor U10.L06; melodic minor U10.L08) | S06, S07, S08 | — |  ·  | `deck.har.minor` | F | U10.L04 (Aeolian loop U10.L05; major V U10.L06; Andalusian U10.L07) | H07, H08, H09 | — |  ·  | `deck.scl.degrees` | F | U10.L01 (harmonic U10.L06; melodic U10.L08; pentatonic U11.L01–L02; blues U11.L03) | S05, S07, S08, S09, S10, S11 | — |  ·  | `deck.frm.twelve-bar` | F | U11.L05 (quick change and turnaround U11.L06) | F04, H10 | — |  ·  | `deck.chd.dom7` | F | U11.L04 | C06 | — |  and a row in the same form for the interval-names deck (INTERVAL_NAMES) and for every Wave 6 deck you write; (b) move those decks from PENDING_DECKS into `decks` (content/decks/index.ts) and update the tests that pinned them as pending; (c) add change-log row 1.6 to contracts, set CONTRACTS_VERSION to "1.6" (packages/content-kit/src/version.ts) and the four literals that pin it (app/e2e/fixtures.ts twice, app/src/session/fixtures.ts, packages/api/src/client.test.ts); (d) keep one new card a day per deck and prove the §7.4 simulation still holds on every seed and target; tell the server engineer, who makes sure a learner already past the unlock lesson gets the decks at start-up (a backfill test). You edit nothing else in contracts.md; any other contract request goes under apiNotes with its exact text.
 (d2) [tutor] The live C5 review wrote try-it code in F for a piece in C, used arrange() over inline patterns instead of section consts, and said "perfect authentic cadence". Fix on both sides: the persona and review prompt state the piece's key and the section-const form and allow only introduced course terms; the review lint rejects (and asks once for a repair of) try-it code that is in another key than the piece, that breaks STYLE's arrange() form, or whose prose uses a harmony term outside the introduced vocabulary. Recorded-response tests for each.
 (d3) [workbench] The editor wraps long lines (A1.L01 S5's 110-character line scrolls at 1280); the section ribbon's arrow keys reach every section, not only those in the roll's window; the staff pages to the section that is playing.
 (d4) [lesson + answers] A reload keeps an unchecked form, scale-builder, bar-grid or numeral answer (kept per step on this device; cleared when the step is checked or left). After a slot auto-advances, a disabled Check says which slot is still empty.
 (d5) [notation, then transcribe + answers + lesson as hosts] One shared helper gives every staff host the Workbench's swing printing ("Swing 8ths", straight-printed) and relabelled spellings; tooltips and the roll use the drawn spelling too.
 (d6) [grader] `must-use` accepts a SoundId; the controls matcher compares against superdough's defaults for a control the answer leaves out (A1.L02 S6: `.lpenv(4)` without `.lpd()`); a riff with single-note bars is counted by `motif-reuse` when its rhythm repeats (C5: a riff on 8 of 12 bars scored 58 %). The pinned leniencies (bass a bar late, a third as an approach, |ΔE| contrast) stay as they are: they are product decisions under "Needs you".
 (d7) [server] POST /session/start refuses a kind that does not fit its mapItemId; at realism R3 and above a ladder stimulus plays only sounds the learner has unlocked.
 (d8) [drills-engine] A lesson step that asks for minor bass degrees (U10.L04 S6) draws minor-key trials only.
 (d9) [capstone — ALREADY DONE in the browser-suite pass after Wave 5; do not redo, only keep it true] Only ONE browser test records C3's 96-second take in real time (e2e/journey/w5-capstones.pw.ts (d), which asserts durationS > 90); the capstone specs use the seeded take (app/src/capstone/e2e/seeded-take.ts). New capstone specs (C6, C7, CF-A) follow the same split: one real take per capstone whose brief requires one, in the journey; everything else from seedTake.
 (d10) [transcribe — a PRODUCT fix; the spec stays as strict as it is] When the transport's start() runs more than about 60 ms late (a busy page), the recording starts without its stretch pre-roll and joins part-way into bar 0, so `app/src/transcribe/e2e/ab-drift.pw.ts` fails its first-pair check [0,0] (seen after review-studio's quiet unit on a cold dev server; /private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/w5/../speed/cut-infra.md item 5 and audit-surfaces.md have the measurements: a forced 60 ms block joins 6 ms into bar 0, 300 ms misses bar 0). Make a late start still begin both the code and the recording at bar 0 (schedule from a start time in the near future, with the pre-roll, instead of "now"), unit-test the scheduling with a late clock, and prove the unchanged spec 10 times with a forced 300 ms main-thread block after Space. Do not touch AB_DRIFT_GATE_MS or the [0,0] check. The same late start failed app/src/album/e2e/transcribe.pw.ts "the drift at 0.25× and 1×" in the whole run of 2026-11-13 (bar 0 at −79 ms, in the run and in its traced alone re-run; 5 of 5 alone untraced, worst bar 17.2 ms of the 20 ms gate): prove that spec 10 times too, traced and untraced, and say why 0.25× sits so near the gate.
 DECIDED BY THE LEARNER on 2026-11-13 (docs/decisions.md, "Confirmed by you (2026-11-13)"; these are no longer open questions — build them, each with a regression test):
 (d11) [grader] Ladder L6 and X2 changes: a chord with the right root and the wrong quality earns NO credit for its bar — a minor chord for a dominant, and also a plain triad where the key has a 7th chord. The pass mark stays 0.85. Pin: Careless Love with every V7 written minor fails and names the first such bar; with every V7 written as a plain V it fails too; the answer key passes. Other steps that use the numeral matcher keep their present credit unless their exercise opts in.
 (d12) [grader + transcribe] Ladder L5 and every later level require the recording's key: a transposed answer fails with a message naming its key and the recording's key (the "transposed" note becomes that failure). L1–L4 are unchanged.
 (d13) [content lead in Foundation; then capstone + server + session] C3 takes FOUR sessions: C3.S3 is arranging and the lead sheet; a new C3.S4 is the 96-second take, the release and Claude's review. The content lead adds the C3.S4 row to contracts §2.4 and content/capstones.ts in the 1.6 change (part of the authorised edit of d1), with its exact goal text, and updates the course length wherever it is stated. A learner who is part-way through C3.S3 keeps everything done (a migration or a plan test proves it).
 (d14) [author:repertoire + one independent checker in Review] St. Louis Blues (W. C. Handy, 1914): transcribe the 12-bar strain X2 needs from a scan of the 1914 first edition (a public-domain source such as the Library of Congress or IMSLP; cite it as provenance). A second agent transcribes it independently from the same scan without reading the first result. It joins X2 beside Careless Love ONLY if the two agree note for note and chord for chord; otherwise change nothing and say so under notDone. Send no personal details to any site.
 (d15) [lesson + workbench] A Make that refers to an earlier lesson's sketch ("your blues", "your Aeolian loop") opens with the learner's saved sketch of that lesson when one exists, with a "Start from Oak's copy" button; with no sketch it opens with Oak's copy as now. The content lead names, per Make, which lesson's sketch it means (a typed field, not prose matching).
 (d16) [lesson + drills-ui] After a lesson ear step is answered it offers the same two buttons as a drill: the note alone, and the note in context.
 (d17) [content lead in Foundation] Split U05.L04: `.arp()` stays in U05.L04; chord-symbol names (N05, `tb.feature.chord-symbols`) become their own lesson placed directly after it in course order. NO existing lesson id changes (give the new lesson the next free U05 number and place it by the syllabus order); update contracts §2 and §3.2 in the 1.6 change, the U05 spec, the checkpoint and deck unlock references, and prove a learner past U05 keeps their progress and is not sent back.
 (d18) [transcribe + content lead] X1's chord stages pass at 0.85 (were 0.80), like its melody stages.
 (d19) [server] Review-only days (no new lesson to offer) keep the every-5th-session transcription gym.
 (d20) [capstone + server] Re-recording an album track keeps both takes: each recording is a version in the track's history, the newest plays by default, an older one can be chosen and exported. Nothing is deleted.
 (d21) [server + session] A second tab or browser starts its OWN session instead of joining the open one (reverses decision 28). A day counts once for the streak; both sessions plan the same next lesson if neither has finished it; a lesson finished in one shows as finished in the other after a reload; the 04:00 carry applies per session. Update the specs that pinned joining.
 (d22) [server + session] The warm-up no longer counts against the 12-minute "a little more" cap (reverses decision 23). The §7.4 simulation and the review-load tests must still hold.
 FOUND BY THE BROWSER-SUITE PASS (failing cases in /private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/w5/../speed/audit-days.md and audit-surfaces.md):
 (d23) [drills-ui] On a staged bass-line dictation (8 roots) at 1280×800 the feedback wraps the answer in context to two rows and pushes "Next" (next-trial) below the fold: wave5.pw.ts frameMatrix "w5-bass-wrong" fails toBeInViewport when the random draw makes trial 2 such a line (1 run in 5). Keep the primary action in view at both sizes; make the spec draw that case on purpose (a seeded trial), so it is tested every run instead of by chance.
 (d24) [audio, with the closer] e2e/review/w3-sing-takes.pw.ts "flat-c4" read −61¢ against /−60¢/ beside another unit and passed alone: a cents reading through the fake microphone under load. Find why the reading moves with load (frame drops in the worklet path, or the median window); fix the cause, or move the file to the quiet units with that evidence. Do not widen the pattern.
 (d25) [every engineer who writes a spec] The first pass of `bun run e2e` now serves a development BUNDLE (no /src module paths, hashed chunk names) and records no trace: a console filter or assertion that depends on a module path or on a stack frame's file name fails there (wave5-surfaces did). Reach the app through its `__oak*` hooks and its UI only.
 Kept as built, by the learner's decision (do not change): side lessons open in any order; C2's three rules (decision 50); the ladder moves up after two passes on two days (decision 36); two tabs on one capstone both edit (decision 46); mastery moves only on evidence (decision 22). Still open under "Needs you": Greensleeves bar 16, Wayfaring Stranger and Frankie and Johnny are unverified against print.
```

Seams Foundation added for them:

| Carry-over | Seam (where) | Notes |
|---|---|---|
| d1, d13, d17 | contracts 1.6 (content lead): the deck rows, C3.S4, U05.L09 "Chord Names" (`LessonMeta.splitFrom`), 185 core sessions | The server records U05.L09 as completed for a learner whose U05.L04 completion predates the split, at start-up, and keeps C3 progress when C3.S3 was under way (seed `C3.S3 in progress (d13)`). `CHORD_LENS_UNLOCKS.chordSymbols` is unchanged: `tb.feature.chord-symbols` now unlocks at U05.L09, and the Wave 5 backfill already grants it to learners past U05.L04. |
| d11 | content-kit `harmony.wrongQuality: "none"`; grader `unbuiltWave6Matcher` (scores 0 with `rubric.unknown` until built); `STANDARD_LADDER_MATCHERS.changes` already asks for it | The grader engineer builds it in `match/harmony.ts`, deletes the guard, and sets it on `SONG_LADDER_MATCHERS.changes` (L6, X2). |
| d15 | content-kit `CodeMakeEx.fromSketch`; endpoint `lessons.sketch` (§5); hook `useLessonSketch` | The lesson host opens the Make with `sketch.versions[last].code` when `sketch` is not null and shows "Start from Oak's copy" (`code.starter`). |
| d20 | `AlbumTakeSchema`, `AlbumTrackVersion.takes` / `currentTake`; endpoints `album.addTake`, `album.chooseTake`; `album.getAudio?take=n`; hooks `useAlbumAddTake`, `useAlbumChooseTake`, `albumTakeUrl` (§5.7) | Read as: a re-recording of the same code is a new TAKE of that album version; the track's history lists each version with its takes. `album.putAudio` stays the first recording of a version. |
| d21 | `SessionStart.tabId`, `Session.tabId`, `SessionDay.openSessions`, `session.day?tab=`; `app/src/lib/tab-session.ts`; `callApi` adds the tab by itself (§4.2, §5.6) | |
| d7, d19, d22 | no new shape | d7: a mismatch answers 400 `bad_request` naming the kind the item needs. |

## 3. Package seams

### 3.1 `@oak/theory` — sevenths, guide tones, modes, chromatic degrees, applied and borrowed chords, modulation, beat grids (`wave6.ts`, built and tested)

All built on the existing tables; RN answers still compare `(degree, alt, quality, inversion)`, never strings. The
lists a lesson author needs (`SEVENTH_QUALITIES`, `SEVENTH_DEGREES`, `DIATONIC_SEVENTHS`, `MODE_CHARACTERISTIC`,
`CHROMATIC_DEGREES`, `CHROMATIC_STEPS`, `OUTSIDE_CHORD_KINDS`) live in `@oak/content-kit`; `wave6.test.ts` checks that
theory and content-kit say the same.

```ts
// --- sevenths (U12)
export interface SeventhInfo { quality: SeventhQuality; name: string /* "half-diminished seventh" */; code: string /* "^7" */;
  leadSheet: string; jazz: string; triad: "maj" | "min" | "dim"; seventh: "M7" | "m7" | "d7"; intervals: number[] }
export const SEVENTH_CHORDS: readonly SeventhInfo[];                 // content-kit order: maj7, 7, m7, m7b5, dim7
export function seventhInfo(quality: SeventhQuality): SeventhInfo;
export function seventhQualityOf(chord: ChordId | string): SeventhQuality | null;   // from the symbol; C13 → "7"; a triad → null
export function seventhFromPcs(pcs: Iterable<number>, bassPc: number):
  { chord: ChordId; quality: SeventhQuality; inversion: 0 | 1 | 2 | 3; symbol: string } | null;   // hand-voiced only (§6.7)
export function seventhChord(root: string, quality: SeventhQuality): ChordId;
export function keySevenths(key: KeySpec, opts?: { form?: "natural" | "harmonic" }): KeyChord[];
  // C major: Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7; A minor: i7 iiø7 IIImaj7 iv7 v7 VImaj7 VII7; harmonic: V7, vii°7
// --- guide tones (U12.L05)
export interface GuideTone { role: "third" | "seventh"; pc: Pc; name: string; interval: string /* "m3", "d7" */ }
export function guideTones(chord: ChordId): { third: GuideTone | null; seventh: GuideTone | null };
export interface GuideToneStep { chord: ChordId; role: "third" | "seventh"; name: string; midi: number; move: number }
export function guideToneLine(chords: readonly ChordId[], opts?: { start?: "third" | "seventh"; around?: number }): (GuideToneStep | null)[];
  // Dm7 G7 Cmaj7: F F E from the 3rd, C B B from the 7th; the nearest guide tone at each change, a tie goes down
// --- interval inversion and compound intervals (U12.L06)
export interface IntervalFacts { name: string; semitones: number; simple: string; octaves: number; compound: boolean; inversion: string }
export function intervalFacts(name: string): IntervalFacts;           // "M10" → simple "M3", inversion "m6"
export function compoundInterval(simple: string, octaves?: number): string;   // "M3" → "M10"
// --- modes (U14)
export const COLOUR_MODES: readonly ColourMode[];                     // mixolydian, dorian, lydian, phrygian (lesson order)
export const TAUGHT_MODES: readonly ["lydian", "major", "mixolydian", "dorian", "minor", "phrygian"]; export type TaughtMode;
export interface ModeColour { mode: TaughtMode; name: string /* "Mixolydian"; "Ionian", "Aeolian" */; family: "major" | "minor";
  characteristic: Degree[]; colour: string /* "♭7" */; colourChords: string[]; progressions: string[][]; parentDegree: number; brightness: number }
export const MODE_COLOURS: readonly ModeColour[]; export function modeColour(mode: ScaleMode): ModeColour | null;
export function modalKey(tonic: string, mode: TaughtMode): KeySpec;
export function parentMajor(key: KeySpec): KeySpec;                   // D Dorian → C major
export function modeFamilyKey(key: KeySpec): KeySpec;                 // D Dorian → D minor; G Mixolydian → G major
export interface CharacteristicTone { degree: Degree; display: string; syllable: string; pc: Pc; name: string; n: number }
export function characteristicTonesOf(key: KeySpec): CharacteristicTone[];   // G Mixolydian → F (♭7, te, n 6)
export function modalChords(key: KeySpec, opts?: { seventh?: boolean }): KeyChord[];
  // G Mixolydian I ii iii° IV v vi ♭VII · D Dorian i ii III IV v vi° VII · F Lydian I II iii ♯iv° V vi vii · E Phrygian i ♭II III iv v° VI vii
export function modalProgression(key: KeySpec, index?: number): KeyChord[];  // I–♭VII–IV · i–IV · I–II · i–♭II
export function modesContaining(pcs: Iterable<number>, tonicPc: number): TaughtMode[];   // brightest first
// --- chromatic degrees and chromatic solfège (U15.L01)
export interface ChromaticDegree { degree: Degree; display: string; syllable: string; semitones: number; raised: boolean; step: string /* "3#" */; resolvesTo: Degree }
export const CHROMATIC_DEGREE_TABLE: readonly ChromaticDegree[];      // ten: ♯1 ♭2 ♯2 ♭3 ♯4 ♭5 ♯5 ♭6 ♯6 ♭7
export function chromaticDegree(degree: Degree): ChromaticDegree | null;
export const CHROMATIC_SOLFEGE: { up: readonly string[]; down: readonly string[] };   // do di re ri … · do ti te la le …
export interface ChromaticLabel { degree: Degree; display: string; syllable: string; chromatic: boolean; name: string; step: number | string }
export function chromaticLabel(midi: number, key: KeySpec, ctx?: { chord?: ChordId; direction?: 1 | -1 }): ChromaticLabel;
  // by the chord under the note, then by direction, then the key's usual label: G♯ under E7 is ♯5 "si", under A♭ it is ♭6 "le"
// --- applied chords (U15)
export const APPLIED_KINDS: readonly ["V", "V7", "viio", "viio7"]; export type AppliedKind;
export interface AppliedChord { kind: AppliedKind; rn: string; chord: ChordId; symbol: string; target: KeyChord;
  leadingTone: { name: string; degree: Degree; display: string; resolvesTo: string }; chromatic: string[] }
export function appliedTargets(key: KeySpec): KeyChord[];             // major: ii iii IV V vi · minor: III iv V VI VII
export function appliedChord(kind: AppliedKind, targetDegree: number, key: KeySpec): AppliedChord | null;
export function appliedChords(key: KeySpec, kinds?: readonly AppliedKind[]): AppliedChord[];
export function appliedReading(chord: ChordId, key: KeySpec, next?: ChordId):
  { rn: string; kind: AppliedKind | null; target: KeyChord; resolves: boolean } | null;
export function dominantChain(key: KeySpec, length?: number): { chord: ChordId; symbol: string; chainRn: string; rn: string }[];
  // C major, 4: E7 A7 D7 G7 · chainRn III7 VI7 II7 V7 · rn V7/vi V7/ii V7/V V7
// --- mixture (U16)
export interface BorrowedChord { rn: string; chord: ChordId; symbol: string; sourceRn: string; lowered: Degree[]; lesson: "U16.L01" | "U16.L02" | "U16.L03" }
export function borrowedChords(key: KeySpec): BorrowedChord[];        // C major: Fm iv · A♭ ♭VI · B♭ ♭VII · E♭ ♭III · D° ii°
export function borrowedReading(chord: ChordId, key: KeySpec): BorrowedChord | null;
export function picardy(key: KeySpec): { chord: ChordId; rn: string; symbol: string; raised: { degree: Degree; name: string } };
export function dorianFour(key: KeySpec): { chord: ChordId; rn: string; symbol: string; raised: { degree: Degree; name: string } };
export type ChromaticChordKind = "diatonic" | "applied" | "borrowed" | "picardy" | "dorian-iv" | "other";
export function chromaticChordKind(chord: ChordId, key: KeySpec, next?: ChordId): ChromaticChordKind;
export function outsideChordKind(chord: ChordId, key: KeySpec, next?: ChordId): OutsideChordKind | null;   // content-kit's three kinds
// --- modulation (U17)
export interface PivotChord { chord: ChordId; symbol: string; from: string; to: string }
export function pivotChords(from: KeySpec, to: KeySpec): PivotChord[];   // C → G: C I/IV · Em iii/vi · G V/I · Am vi/ii
export type KeyRelation = "same" | "relative" | "parallel" | "dominant" | "subdominant" | "up-half" | "up-step" | "down-step" | "other";
export interface KeyDistance { semitones: number; fifths: number; relation: KeyRelation; commonTones: number; pivots: number }
export function keyDistance(from: KeySpec, to: KeySpec): KeyDistance;    // C → D: +2, 2 fifths, "up-step", 5 notes, 2 pivots
export interface KeyPlanSpan { key: KeySpec; octave: number | null; fromBar: number /* 0-based */; bars: number; text: string }
export interface KeyPlan { spans: KeyPlanSpan[]; totalBars: number; changes: { bar: number; from: KeySpec; to: KeySpec; distance: KeyDistance }[] }
export function parseKeyPlan(scaleArg: string): KeyPlan | null;          // "<C4:major!16 D4:major!8>"; null for other patterns
export function keyAtBarOfPlan(plan: KeyPlan, bar: number): KeySpec;
export function keyLiftScale(tonic: string, barsBefore: number, semitones: number, barsAfter: number, octave?: number): string;
export function keyDisplay(key: KeySpec): string;                        // "F♯ Dorian", "B♭ major"
// --- rhythm II (U13)
export interface BeatGridLine { at: Rat; level: "beat" | "sub"; label: string }
export interface BeatGrid { meter: MeterId; beats: number; division: 2 | 3; compound: boolean; beatLen: Rat; subLen: Rat; lines: BeatGridLine[] }
export function beatGrid(meter: MeterId | MeterSpec, opts?: { triplets?: boolean }): BeatGrid;
  // 6/8: 2 beats of "1 la li" · 4/4: "1 & 2 & …" · 4/4 with triplets: "1 trip let …"; odd meters throw
export function pushAmount(meter: MeterId | MeterSpec, by: 8 | 16): { cycles: Rat; code: string };   // 4/4: .early(1/8), .early(1/16)
```

Verified in `wave6.test.ts` by hand and against the chord table, and with headless Strudel 1.2.6 where code is
involved: `n("3# 6b 4# 0# 1b 2b 5b").scale("C4:major")` sounds F♯ B♭ G♯ C♯ D♭ E♭ A♭; `.scale("<C4:major!2
D4:major!2>")` lifts the same degrees a whole step at bar 3; the A minor ii–V–i guide-tone lines are D D C and
A G♯ G; the sevenths of E♭ major; the dominant chain in B♭ (D7 G7 C7 F7); V7/V in A minor is B7 with D♯.

### 3.2 `@oak/grader` — the U12–U17 views, the L8 / CF-T ladder, the rule fields not built yet

`analyze/wave6-views.ts` (exported from the package root). Every view is built on the analyzers the rubric uses.

```ts
// --- the key plan (U17; contracts §6.8)
export interface KeyPlanSpanView { fromBar: number /* 1-based */; toBar: number; key: KeySpec; source: "declared" | "scale" | "estimate" }
export interface KeyChangeView { bar: number; from: KeySpec; to: KeySpec; distance: KeyDistance; barsAfter: number }
export interface KeyPlanView { track: string | null; spans: KeyPlanSpanView[]; changes: KeyChangeView[] }
export function keyPlanView(n: Normalized, ctx: NormalizeContext & { code: string }): KeyPlanView;
export function keyAtBarOf(view: Pick<KeyPlanView, "spans">, bar: number): KeySpec | null;
// --- sevenths, applied and borrowed chords, guide tones (U12, U15, U16)
export interface ChordColourView { bar: number; beat: number; at: Rat; chord: ChordId; symbol: string /* root position */;
  inversion: 0 | 1 | 2 | 3; source: "symbol" | "notes"; key: KeySpec; rn: string; seventh: SeventhQuality | null;
  kind: ChromaticChordKind; target: string | null; resolves: boolean | null; next: string | null;
  guide: { third: string | null; seventh: string | null } }
export interface ChromaticHarmonyView { chords: ChordColourView[]; applied: number; appliedResolved: number; borrowed: number;
  guideLines: { fromThird: (GuideToneStep | null)[]; fromSeventh: (GuideToneStep | null)[] } }
export function chromaticHarmonyView(n: Normalized, ctx: NormalizeContext & { code?: string; bars?: number }): ChromaticHarmonyView;
// --- modes (U14, C6)
export interface ModeView { tonic: string | null; stated: KeySpec | null; fits: TaughtMode[];
  characteristic: { degree: Degree; display: string; name: string; count: number; strong: number; noteIds: string[] } | null;
  outside: string[]; tonicChordShare: number | null }
export function modeView(n: Normalized, ctx: NormalizeContext & { bars?: number; span?: readonly [number, number] }): ModeView;
// --- rhythm II (U13)
export interface PushView { id: string; onset: Rat; beat: Rat; by: 8 | 16; acrossBar: boolean }
export interface TupletView { bar: number; beat: number; division: number; span: number }
export interface TrackRhythmView { track: string; pushes: PushView[]; ghosts: string[]; ghostsOffbeat: string[];
  written: { ties: number; tiesAcrossBar: number; dotted: number; exact: boolean }; tuplets: TupletView[];
  feel: "binary" | "ternary" | "mixed" | "beat"; syncopation: Pick<Syncopation, "total" | "count" | "perBar"> }
export interface RhythmView { meter: MeterId; tempoUnit: "quarter" | "dottedQuarter" | "eighth"; compound: boolean; beats: number; bpm: number; tracks: TrackRhythmView[] }
export function pushesOf(events: readonly NEvent[], meter: MeterId): PushView[];
export function tupletsOf(events: readonly NEvent[], meter: MeterId): TupletView[];
export function rhythmView(n: Normalized, ctx: NormalizeContext & { bars?: number; tracks?: readonly string[] }): RhythmView;
```

- **Sevenths** come from the symbol always (`source: "symbol"`: a `chord()` value or the `_oakChord` tag) and from the
  notes only for a hand-voiced chord (`source: "notes"`, contracts §6.7 rule 2). A default `voicing()` often has the
  3rd or 5th lowest: the numeral and the symbol are always the chord in root position, and `inversion` reports the
  figure apart.
- **Numerals follow the key plan**: each chord is read in the key in force at its bar (`keyPlanView`), so a piece
  that lifts from C to D keeps I IV V I after the lift. A plan is read from the code's own `.scale()` first (a
  patterned scale after `arrange()`, §6.8 item 4), then the declared key, then an estimate; a track with
  `.transpose()` after `.scale()` is not trusted (item 3).
- **A push** (`pushesOf`) is a note that starts an eighth or a sixteenth before a beat, holds through it, and has no
  note of its own line on that beat: what `.early(1/8)` writes. Ghost notes are `velocityGhosts` (effective gain at
  most 0.4). Ties and dotted values are counted on the score `@oak/notation` engraves (`scoreRhythm`), so the view
  and the staff agree. A tuplet is a beat cut into parts the meter does not give it (3, 5, 6, 7 in a simple meter,
  over one beat or two; 2 or 4 in a compound one). `bpm` counts the meter's tempo unit (60 for `setcpm(60/2)` in 6/8).
- **`modeView`** counts every pitched learner note, as the `mode` rule does (a chord's notes included).

Readers: the chord lens and the guide-tone lens (workbench, through `app/src/lib/harmony-lens.ts`), the key lens, the
beat-grid lens, the C6 and C7 checklists and hints (capstone), U12–U17 Make lines (lesson), liner notes and the tutor.
Verified on real Strudel output in `wave6-views.test.ts`.

`grade/standard-ladder.ts`: ladder L8 and CF-T (contracts §2.9, §6.6), reusing the L6 machinery.

```ts
export const STANDARD_LADDER_STAGES: readonly ["form", "bass", "changes", "melody"]; export type StandardLadderStage;
export type StandardCodeStage = Exclude<StandardLadderStage, "form">;
export const STANDARD_LADDER_PASS: { form: 1; bass: 0.9; changes: 0.85; melody: 0.9 };
export const STANDARD_LADDER_MATCHERS: Record<StandardCodeStage, Matcher>;   // changes: rn, seventh depth, wrongQuality "none" (d11)
export interface StandardLadderItem { itemId: string; level: 8; stage: StandardLadderStage; phrase?: number | [number, number] }
export function standardLadderCheck(item: StandardLadderItem & { stage: StandardCodeStage }, song: Pick<SongDef, "answerKey">): PhraseCheck;
export function nextStandardStage(passed: readonly StandardLadderStage[]): StandardLadderStage | null;
export function standardLadderPassed(stage: StandardCodeStage, result: GradeResult): boolean;
export interface StandardLadderGradeRequest { item: StandardLadderItem & { stage: StandardCodeStage }; song: SongDef; code: string; ctx: SongLadderGradeRequest["ctx"] }
export function standardLadderRequest(req: StandardLadderGradeRequest): GradeRequest;   // capstone mode
export function gradeStandardLadder(req: StandardLadderGradeRequest): Promise<GradeResult>;   // index.ts, the realm
// the form map (no code, no Strudel)
export interface FormMapAnswer { sections: readonly string[]; bars: readonly number[] /* 1-based first bar of each */ }
export interface FormMapSection { index: number; expected: { label: string; bar: number; bars: [number, number] };
  got: { label: string; bar: number } | null; startOk: boolean; labelOk: boolean; ok: boolean }
export interface FormMapResult { score: number; passed: boolean; expected: string /* "AABA" */; got: string; sections: FormMapSection[]; extra: number[] }
export function formMapKey(song: Pick<SongDef, "answerKey">): { labels: string[]; bars: number[]; letters: string } | null;
export function gradeFormMap(answer: FormMapAnswer, song: Pick<SongDef, "answerKey">, pass?: number): FormMapResult;
```

A section of a form map counts when it starts on the right bar and carries the right label by shape (`A A B A`,
`verse verse bridge verse` and `X X Y X` are one answer); a missing boundary costs its own section and does not
rename the later ones; a boundary where the tune has none lowers the score. **L7** is the learner's own audio:
self-assessed with `OWN_AUDIO_CHECKLIST` (`@oak/api`, built in Wave 4), `grading.mode: "self"`, never graded here.

**Rules.** `rubric/wave6-rules.ts` lists the Wave 6 rule fields that have no analyzer yet (`WAVE6_UNBUILT`). A rule
that uses one fails with `rubric.unknown` and the detail "not built yet: …" (`evalRule` checks before it runs the
analyzer): never a silent pass, never a field silently ignored. The grader engineer builds each and deletes its entry
in the same change:

| Rule | Field (content-kit feature) | Needed by |
|---|---|---|
| `mode` | `anyOf`, `tonic: "declared"` (`mode.any-of`) | C6 "Mixolydian or Dorian" |
| `contains-rn` | `kind` (`contains-rn.kind`) | C7 and CF-A "a secondary dominant, whichever"; U16 "a borrowed chord" |
| `contains-rn` | `inOrder` (`contains-rn.in-order`) | C7 "♭VI–♭VII–I present" |
| `form` | `contains`, the `*` pattern (`form.contains`) | CF-A "the form contains a bridge" |
| `form` | the `@song` pattern, `extra` (`form.song`) | CF-T.S4 |
| `guide-tones` | `at`, `maxMoveSemis` (`guide-tones.motion`) | U12.L05 |
| `modulation` | `via` (`modulation.via`) | U17.L01 |
| `velocity-ghosts` | `drum`, `accents` (`velocity-ghosts.accents`) | U13.L02 |
| `reharmonize` | the whole rule (a stub in `RULES`) | U16.L05 |
| `harmony` matcher | `wrongQuality: "none"` (`harmony.wrong-quality`, `unbuiltWave6Matcher`) | d11: L6, X2, L8, CF-T changes |

Without those fields the rules run as they have since Wave 1; `wave6-rules.test.ts` pins each on a passing and a
known-wrong piece (a Mixolydian vamp and the same with a leading tone; V7/V that resolves and one that does not;
♭VI–♭VII–I as a `progression` over its bars; `device-count`; a form with a bridge at a fixed place; `duration-sec`
96 s for 48 bars at 120 BPM). Content-kit lists `mode`, `key-change`, `modulation`, `guide-tones`, `velocity-ghosts`,
`device-count` and `reharmonize` as `PLANNED` until the golden tests of contracts §6.6 are in.

### 3.3 `@oak/notation` — what a host passes (`wave6.ts`, built and tested)

```ts
export interface KeySpanInput { fromBar: number /* 1-based */; key: KeySpec }
export function keyChangesOf(plan: readonly (KeyPlanEntry | KeySpanInput)[], opts?: { pickup?: boolean }): Pick<NotationInput, "key" | "keyChanges">;
export const MODAL_SIGNATURE_STYLES: readonly ["mode", "parallel"]; export type ModalSignatureStyle;
export const MODAL_SIGNATURE_DEFAULT: ModalSignatureStyle;            // "mode"
export function modalSignatureKey(key: KeySpec, style?: ModalSignatureStyle): KeySpec;
export interface ScoreRhythm { ties: number; tiesAcrossBar: number; dotted: number; tuplets: (TupletMark & { bar: number })[]; exact: boolean }
export function scoreRhythm(score: Score): ScoreRhythm;
export interface HarmonyLabelInput { bar: number /* 1-based; 0 = pickup */; beat: number; symbol: string /* code */; rn: string }
export function harmonyLabels(chords: readonly HarmonyLabelInput[], opts?: { pickup?: boolean; symbols?: boolean; numerals?: boolean }): Pick<NotationInput, "chords" | "romans">;
```

**What a host passes.**

- **Ties, dotted values, compound meters, tuplets:** nothing new. Pass the events and the meter (`METERS["6/8"]`); the
  engraver ties a note over a beat or a bar line, writes a dotted quarter as one value where the meter allows it,
  beams 6/8 in two groups of three and 12/8 in four, rests by the beat, and brackets triplets, quarter-note triplets
  and other tuplets up to 9. `scoreRhythm(score)` reports what it wrote.
- **A piece that changes key:** `...keyChangesOf(keyPlanView(n, ctx).spans)` (or an exercise's or a song's
  `keyPlan`); the staff writes the new signature after a double barline and spells each bar in its key.
- **A modal piece — decided here (the contracts are silent):** the staff shows the mode's OWN signature by default
  (`MODAL_SIGNATURE_DEFAULT = "mode"`: D Dorian has no sharps or flats, abcjs `K:Ddor`), as the folk repertoire is
  printed and as the engraver has done since Wave 1. A lesson that compares a mode with its parent (U14.L01 "Modes as
  Colours", the `scale-builder.from` steps) passes `key: modalSignatureKey(key, "parallel")`: the signature of the
  major or minor key on the same tonic, with the colour tone written as an accidental every time (G Mixolydian: one
  sharp, each F with a natural). Degree labels read ♭7, ♯4, ♭2 and 6 either way.
- **Chromatic spelling by function:** pass the chords (`chords`, or `...harmonyLabels(view.chords)`): a note under a
  chord that contains it is spelled as the chord spells it (the leading tone of a secondary dominant is a sharp: G♯
  under E7; a borrowed ♭VI is flats: A♭ under A♭). Without a chord a chromatic note follows its direction.
- **Seventh-chord symbols and applied numerals:** `harmonyLabels(chromaticHarmonyView(n, ctx).chords)` gives `chords`
  (printed Cmaj7, Dm7, G7, Bm7♭5, C°7 through the chord table) and `romans` (V7/V, ♭VI, iiø7, vii°7/ii). Bars are
  1-based there and converted to cycles (`pickup: true` when the piece has one).

### 3.4 `app/src/answers/staff/rhythm.ts` — ties, dotted values and triplets in the staff input (signatures; the answers engineer builds it)

```ts
export interface TripletToken { token: string; base: 4 | 8 | 16 }   export function parseTriplet(token: string): TripletToken | null;   // "8t"
export interface RhythmPalette { ties: boolean; dots: boolean; triplets: TripletToken[] }
export function rhythmPalette(spec: StaffSpec): RhythmPalette;                         // built: read from `palette`
export function rhythmContext(ctx: NoteListContext, palette: RhythmPalette): NoteListContext;   // built: ties and dots on
export const RHYTHM_KEYS: { tie: "t"; dot: "."; triplet: ";" }; export type RhythmToolId; export const RHYTHM_TOOL_LABELS;
export type RhythmEdit =
  | { op: "tie"; eventId: string; on: boolean; fill?: string }
  | { op: "dot"; eventId: string; dots: 0 | 1 }
  | { op: "triplet"; onset: Rat; base: 4 | 8 | 16; pitches: [string | null, string | null, string | null] }
  | { op: "untriplet"; onset: Rat };
export type RhythmEditOutcome = StaffEditOutcome | { list: string; refused: "not-built" | "not-offered" | "no-next-note" | "crosses-bar"; clipped: false };
export function applyRhythmEdit(value: string, edit: RhythmEdit, ctx: NoteListContext, palette: RhythmPalette): RhythmEditOutcome;   // STUB
export function rhythmKey(cursor: StaffCursor, input: StaffKeyInput, k: StaffKeyContext): StaffKeyResult | undefined;               // STUB
export function rhythmRefusalText(refused: RhythmEditOutcome["refused"]): string | null;
```

- The answer value stays the note-list DSL (`AnswerValueMap["staff-input"]`): `C4:4. D4:8` (dot), `G4:4~ | G4:4`
  (tie, also over the bar line), `C4:8t D4:8t E4:8t` (a triplet group; always three values, rests fill).
- **Keyboard** (proposed; the kit owner lists them in the shortcut sheet): `t` ties the note under the cursor to the
  next note of the same pitch (again: unties); `.` dots it (built since Wave 3); `;` switches the cursor's
  length between a plain value and its triplet value (all three are free in `staffKey`). `rhythmKey` is tried before `staffKey` and returns `undefined`
  for every key it does not take. **Pointer:** each tool is a toggle button in the palette row (Tie, Dot, Triplet, in
  that order, only the ones the palette offers); a tie can also be drawn by dragging from a notehead to the next
  notehead of the same pitch.
- The stubs never change the answer: `applyRhythmEdit` refuses with `not-offered` (the palette lacks the tool) or
  `not-built`; `rhythmKey` says "Ties are not built yet." Content CI keeps `staff-input.ties`, `.dots` and
  `.triplets` out of lessons until the answers engineer moves them into `IMPLEMENTED`.
- Notation's edit model (`editNoteList`, `NoteListContext.ties` / `dots`) already ties and dots; a triplet length is
  not a binary value there yet (`plainNoteList` returns `null` and the engraving is printed). The notation engineer
  adds triplet-aware editing if the answers engineer needs it from the model (request it under `apiNotes`).

## 4. App seams (`app/src/lib`, frozen after Foundation)

### 4.1 Query hooks (`queries.ts`)

```ts
export const useTracks: () => UseQueryResult<Tracks>;                      // GET /tracks
export const useCoreCompletion: () => UseQueryResult<CoreCompletion>;       // GET /course/completion
export const useLessonSketch: (lessonId: string | null) => UseQueryResult<LessonSketch>;   // GET /lessons/:id/sketch (d15)
export const useAlbumAddTake: () => mutation<"album.addTake">;             // → album.track, album.get (d20)
export const useAlbumChooseTake: () => mutation<"album.chooseTake">;       // → album.track, album.get
export function albumTakeUrl(trackId: string, version: number, take?: number): string;   // <audio src>; absent take: the current one
// changed invalidations: session.end → + tracks.list, course.completion
```

Until the server builds an endpoint it answers 501 (`OakApiError.code === "not_implemented"`, never retried);
`ErrorState` reads "Not built yet". Code against the types now.

### 4.2 The tab's own session (`tab-session.ts`, `api.ts`; d21)

```ts
export function tabId(): string;                                           // "tab_" + 16 hex digits; sessionStorage
export function ownOpenSession(day: Pick<SessionDay, "open" | "openSessions"> | null | undefined, tab?: string): Session | null;
export function otherOpenSessions(day, tab?: string): Session[];
export function withTab(name: string, input: unknown): unknown;            // api.ts: callApi applies it to every call
```

- Every tab has an id, kept in sessionStorage (it survives a reload of that tab and is not shared with another tab
  or window). `callApi` adds it to `session.start` (`body.tabId`) and to `session.day` (`?tab=`) whoever calls them,
  so no caller can forget it.
- The open session of THIS tab is `ownOpenSession(useSessionDay().data)`. `bootstrap.openSession` is the newest open
  session of any tab and must no longer decide what a tab resumes: the session, capstone and kit engineers replace
  their reads of it (`SessionHost.tsx`, `TodayPage.tsx`, `today-model.ts`, `CodaPage.tsx`, `CapstoneScreen.tsx`,
  `Workspace.tsx`, `X1Workspace.tsx`, `GlobalKeys.tsx`).
- From a server that does not list `openSessions` yet, `ownOpenSession` returns its one open session, as before:
  the app keeps working while the server engineer builds d21.

### 4.3 Lenses (`lenses.ts`) and how deep they write (`harmony-lens.ts`)

```ts
// lenses.ts
export type { MusicLensId };                                       // "guideTones" | "keyPlan" | "beatGrid"
export const MUSIC_LENS_IDS: readonly ["guideTones", "keyPlan", "beatGrid"];
export const MUSIC_LENS_UNLOCKS: { guideTones: ["chord.seventh"]; keyPlan: ["tb.scale.patterned"]; beatGrid: ["tb.meter.compound", "tb.ply"] };
export const MUSIC_LENS_LABELS: { guideTones: "Guide tones"; keyPlan: "Key"; beatGrid: "Beat grid" };
export type MusicLensPrefs = Record<MusicLensId, boolean>;
export function musicLensPrefs(prefs: LensPrefs): MusicLensPrefs;             // absent = on
export function musicLensAvailability(unlocked: ReadonlySet<string>): MusicLensPrefs;   // any one of its tools
export function effectiveMusicLenses(prefs: LensPrefs, unlocked: ReadonlySet<string>): MusicLensPrefs;
export interface MusicLenses { prefs; shown; available: MusicLensPrefs; set(id: MusicLensId, on: boolean): void; toggle(id: MusicLensId): void }
// Lenses gains:  music: MusicLenses   (same store, same queued save and rollback)
// harmony-lens.ts
export const HARMONY_DEPTH_GATES: { sevenths: { tools: ["chord.dom7", "chord.seventh"]; lesson: null }; applied: { tools: []; lesson: "U15.L02" };
  borrowed: { tools: []; lesson: "U16.L01" }; chromatic: { tools: ["tb.n.chromatic"]; lesson: null } };
export type HarmonyDepthId; export type HarmonyDepth = Record<HarmonyDepthId, boolean>;
export function harmonyDepth(unlocked: ReadonlySet<string>, completed: ReadonlySet<string>): HarmonyDepth;
export const FULL_HARMONY_DEPTH: HarmonyDepth;
export interface ChordLensText { symbol: string; rn: string | null; reduced: boolean }
export function chordLensText(c: Pick<ChordColourView, "chord" | "key" | "kind" | "rn" | "symbol" | "seventh">, depth: HarmonyDepth): ChordLensText;
export interface DegreeLensText { degree: string; syllable: string; chromatic: boolean }
export function degreeLensText(midi: number, key: KeySpec, depth: Pick<HarmonyDepth, "chromatic">, ctx?: { chord?: ChordId; direction?: 1 | -1 }): DegreeLensText;
```

- Stored as three more optional booleans of `LensPrefsSchema` (`guideTones?`, `keyPlan?`, `beatGrid?`; absent = on),
  saved through the same queue as every lens.
- **Guide-tone lens**: marks the 3rd and the 7th of each chord on roll and staff
  (`chromaticHarmonyView(...).chords[].guide`) and draws the line they make (`guideLines.fromThird` / `fromSeventh`).
  Gated on `chord.seventh` (U12.L01) until the requested row `tb.lens.guide-tones` (U12.L05) exists; then only
  `MUSIC_LENS_UNLOCKS` changes.
- **Key lens**: a ribbon along the timeline naming the key in force (`keyPlanView(...).spans`, `keyDisplay`) and a
  mark at each change ("+2: up a step", `distance.relation`). It draws nothing for a piece in one key. Gated on
  `tb.scale.patterned`.
- **Beat grid**: on the roll, `beatGrid(meter)` lines for a compound meter (two or four dotted-quarter beats, each in
  three) and `beatGrid(meter, { triplets: true })` where `rhythmView` reports a ternary or mixed feel in a simple
  meter. Gated on `tb.meter.compound` (U13.L04) or `tb.ply` (U13.L05).
- **The chord lens writes as deep as the learner has been taught** — a gate, not a switch. The existing chord-symbol
  and numeral lenses call `chordLensText(c, depth)`: a seventh is written as its triad until `chord.dom7` or
  `chord.seventh` is unlocked (the jazz-soul Band plays sevenths from U03), an applied chord keeps its symbol and has
  no numeral until U15.L02 is completed, a borrowed chord likewise until U16.L01; a chord the course never names has
  no numeral at any depth. `reduced` lets a view draw such a label quieter; never a lock, never a "?".
- **The degree lens with chromatic degrees and syllables**: `degreeLensText(midi, key, depth, { chord, direction })`.
  From U15.L01 (`tb.n.chromatic`) a chromatic note is named by the chord under it, then by its direction (♯4 "fi"
  rising, ♭5 "se" falling); before it, it keeps the label the earlier units gave it and shows a syllable only where
  the learner knows one (me, le, te from minor; se from the blues).
- `completed` for `harmonyDepth` is the set of completed lesson ids (`useCourseProgress`); **inside the lesson that
  teaches a thing the host adds that lesson's id**, so U15.L02's own steps already show "V7/V" (the same rule as
  `unlocksOf(currentSession)` for tools).
- Proposed keys (the kit owner registers them in `app/src/ui/keys` and the shortcut sheet; checked free against
  `workbench/shortcuts.ts` and `panels.ts` at Foundation, where N K C H R F T G L O E B U W Y P are taken):
  `Shift+I` guide tones, `Shift+J` the key lens, `Shift+V` the beat grid.
- Who wins: as wave3.md §4.3 — inside a lesson step the content decides; elsewhere the lenses decide.

### 4.4 What a host passes: one page per view

| View (owner) | Reads | Gate |
|---|---|---|
| Chord band and staff chord labels (workbench; lesson, transcribe, capstone as hosts) | `chromaticHarmonyView(n, { ...ctx, code }).chords` → `chordLensText(c, depth)`; the staff through `harmonyLabels(...)` | `lenses.chords.shown`, `harmonyDepth` |
| Guide-tone marks and line (workbench) | `chords[].guide`, `guideLines` | `lenses.music.shown.guideTones` |
| Key ribbon (workbench, transcribe) | `keyPlanView(n, { ...ctx, code })`, `keyDisplay`, `changes[].distance` | `lenses.music.shown.keyPlan`; only when `spans.length > 1` |
| Beat grid on the roll (workbench) | `beatGrid(meter)`; `rhythmView(n, ctx).tracks[].feel` for triplets | `lenses.music.shown.beatGrid` |
| Degree and solfège labels (workbench, answers, drills-ui) | `degreeLensText(midi, key, depth, { chord, direction })` | `lenses.shown.degrees` / `solfege`, `depth.chromatic` |
| Staff of a piece that changes key (notation hosts) | `keyChangesOf(keyPlanView(...).spans)` | — |
| Staff of a modal lesson step (lesson) | `modalSignatureKey(key, "parallel")` where the step compares a mode with its parent | — |
| C6 and C7 checklists and hints (capstone) | `modeView`, `chromaticHarmonyView`, `keyPlanView` beside the rubric rows | — |
| The finale card and the "after the core" Today (session) | `SessionSummary.coreComplete`, `useCoreCompletion()`, `useTracks()` | — |

## 5. API additions (`packages/api`, additive)

Every new endpoint is a contract entry with a zod DTO (`WAVE6_ENDPOINTS`). All five are built; `WAVE6_PENDING` in
`server/src/routes/routes.test.ts` "Wave 6 endpoints" is empty and no route answers a typed 501 (the
`notImplemented` helper in `server/src/errors.ts` has no caller left). Integration (integrate:server) checked each
on the real course from the Wave 6 dev seeds.

| Name | Method · path (under `/api`) | Body / query | Response | Route file | Status | Needed by |
|---|---|---|---|---|---|---|
| `tracks.list` | GET `/tracks` | | `TracksSchema` `{ items: TrackState[] }`; each `trackId, title, status, openedAt, gates: TrackGateState[], sessionsDone, sessionsTotal, next, note` (`note` starts "Open." for an open track) | course.ts | built | session (Today, Coda), map, progress, kit palette |
| `course.completion` | GET `/course/completion` | | `CoreCompletionSchema` `{ stage, completedAt, sessionId, sessionsDone, sessionsTotal, remaining, milestone, stats, canDo, album, open }`; `sessionId` is the session whose Coda carried the moment; `canDo` is one statement per area, at most seven; an `open` track row that can be started carries its next LESSON id, one that cannot carries the track letter | course.ts | built | session (the finale Coda, Today after the core), progress, album |
| `lessons.sketch` | GET `/lessons/:id/sketch` | | `LessonSketchSchema` `{ lessonId, sketch: SketchDetail \| null }` | library.ts | built | lesson (d15) |
| `album.addTake` | POST `/album/tracks/:id/versions/:v/takes` | binary; `?durationS=` | `AlbumTrackVersionSchema` (with `takes`, `currentTake` = the new take) | library.ts | built | capstone, album (d20) |
| `album.chooseTake` | PUT `/album/tracks/:id/versions/:v/take` | `{ take }` | `AlbumTrackVersionSchema` | library.ts | built | album (d20) |

Changed shapes (all additive; every Wave 5 body still parses — `packages/api/src/wave6.test.ts`):

| Schema | Change | Owner of the behaviour |
|---|---|---|
| `LensPrefsSchema` | `guideTones?`, `keyPlan?`, `beatGrid?: boolean` (absent = on); `MUSIC_LENS_IDS` | works now |
| `SessionStartSchema` | `tabId?: string` (8–64 chars) | server (d21), built |
| `SessionSchema` | `tabId?: string \| null` | server, built |
| `SessionDaySchema` | `openSessions?: Session[]`; `open` is the calling tab's with `?tab=` | server, session; built |
| `session.day` | query `{ tab? }` | server, built |
| `SessionPlanSchema` | `slot?: { fills: "gym" \| "cf-t" \| "x", sinceLast } \| null`; `tracks?: { open: TrackId[], lessonsAuthored, note } \| null`; `core?: "in-progress" \| "lessons-done" \| "complete"`. `alternatives` lists CF-T's next session while it is open and unfinished, and on a CF-T slot day the compose capstone that waits | server (planner), session; built |
| `SessionSummarySchema` | `gatesOpened?: TrackGateState[]`; `coreComplete?: CoreCompletion \| null`; `gym.ladder.level` and `levelUp.to` up to 8 | server fills, session draws; built |
| `CourseProgressSchema` | `tracks?: TrackState[]`; `core?`; `mapTotal` is the core's 185 sessions until a track has lessons | server, built |
| `CheckpointOutcomeSchema`, `LessonCompleteResultSchema` | `gatesOpened?: TrackGateState[]`; `LessonCompleteResult.opened` names an opened capstone by its first session (`CF-T.S1`) | server, built; lesson draws it on the outcome screen |
| `GymPlanSchema` | `cfT?: { status, nextSessionId, takesSlot, songId } \| null` | server (planner), built |
| `CapstoneCheckStateSchema` | `layer` gains `"form"` (the form map, content-kit `FormMapCheck`) | server, capstone; built |
| `AlbumTrackVersionSchema` | `takes?: AlbumTake[]`, `currentTake?: number \| null` | server, capstone; built |
| `album.getAudio` | query `{ take? }` (1-based; absent: the current take). No new media GET: contracts §11.1 rule 4 names three | server, built |
| ladder | `ladderLevel` 1–8 in state, history and scores; a level an item is drawn at or the ladder is set to is 1–6 or 8 (`LadderNext.level`, `LadderItem.level`, `LadderLevelSet`: 7 is refused); `LADDER_STAGES` gains `"form"` (appended); `LadderSubmit.formMap?: { sections, bars }`; `LadderSong.level` 5 \| 6 \| 8, `passedStages` may hold `"form"`, `passedLines` are the sections passed of the stage now open; an L8 song's `phrases` (and the project's `given.form`) are `[]`/`null` until its form map passed or was revealed; `LadderItem.given.keyPlan` and `TranscriptionDetail.given.keyPlan` carry `SongDef.keyPlan` for a tune that changes key | server, built |
| own audio | `OWN_AUDIO_FORM_ROW` (`{ id: "form", … }`): the row Transcribe's full-arrangement checklist adds once the sections are mapped; the server takes it as self-reported evidence (0.3) for `fam.frm.sections`' skills | server, transcribe |
| evidence | a family's set evidence (`srs-set`, `gym-set`, `anchor-set`, `self-transcription`) counts only for skills whose introducing lesson is started (`MasteryService.addEvidence`): a composite set at U13 is no evidence for U15–U17 or track skills, so the skill map shows nothing as practised before it is taught | server, built |
| unlocks | `tb.feature.transcribe.full` is granted when CF-T.S1 is COMPLETED (content/toolbox.ts; contracts §3.2 has no START note, and the contracts win over §5.2 below) | content, server |
| constants | `TRACK_IDS`, `TRACK_TITLES`, `TRACK_GATES`, `CORE_STAGES`, `CF_T_SONG_IDS`, `CF_T_GATE`, `MUSIC_LENS_IDS`, `WAVE6_SEED_POINTS`, `WAVE6_ENDPOINTS`, `OWN_AUDIO_FORM_ROW` | — |

### 5.1 Capstones C6, C7 and CF-A; four-session capstones

- Nothing new on the wire: `capstones.sessions` lists every session of a capstone, `current` moves on with
  `capstones.completeSession`, and the session whose content says `release: true` releases (C3.S4, C6.S2, C7.S3,
  CF-A.S4, CF-T.S4). Four sessions were already possible; C3 is the first to have them (d13).
- **C3.S4 (d13):** the server keeps a learner's progress across the change of definition: C3.S1–S2 completed stay
  completed; a C3.S3 that was under way keeps its draft and its lead-sheet check and can now be completed without a
  take; a C3 already released stays released (its S3 held the take). Seed `C3.S3 in progress (d13)` is that learner.
- **Gates:** C6 opens at U14.CP, C7 at U17.CP, CF-A when C7 is released, CF-T when U15.L01 is completed
  (`capstones.gate`, condition kind `lesson`). A capstone never gates a lesson (contracts §7.6).
- **Rubrics** are content (contracts §6.6); the rule fields they need that are not built yet are §3.2's table. The
  one real-time take per capstone whose brief requires one lives in the journey; every other spec uses `seedTake`
  (d9).

### 5.2 CF-T: a capstone that runs in gym slots (contracts §2.4, §2.5)

- CF-T opens when U15.L01 is completed (`CF_T_GATE`) and is offered from the next transcription slot on. **What fills
  a slot:** while CF-T is open and unfinished the slot is its next session; otherwise a gym session. The planner sets
  `SessionPlan.kind: "capstone"`, `mapItemId: "CF-T.S2"`, `slot: { fills: "cf-t", sinceLast }`, and `GymPlan.cfT`
  says `{ status, nextSessionId, takesSlot: true, songId }` with `GymPlan.next: null`. A slot filled by a gym session
  has `slot.fills: "gym"`, one an `X#` session takes `"x"`. The slot count resets on a CF-T session as on a gym
  session (§2.5 "since the last transcription session").
- A capstone in progress is never interrupted by a slot — except by CF-T's own sessions, which ARE the slot. In the
  default order CF-T.S1 falls before C6.S1 (session 156), S2–S4 between the U15–U16 lessons.
- The learner may also open CF-T from the capstone list at any time once it is open (an alternative on Today), as
  any capstone; that session then counts as the transcription session for the slot rule.
- **Sessions and checks** (content, `CapstoneSessionDef`): S1 the form map (`formMap`, a `form` answer in
  `input: "map"`, graded with `gradeFormMap`; recorded with `capstones.recordCheck` on the check id of
  `FormMapCheck.id`, reported as a `CapstoneCheckState` with `layer: "form"`) and the bass (≥ 0.90); S2 the changes
  (≥ 0.85 per bar, `after` the bass); S3 the melody (≥ 0.90); S4 arrange, review, release (`rubric` with
  `{ rule: "form", pattern: "@song" }`). The song is one of `CF_T_SONG_IDS`, picked in S1 like X1's and X2's.
- `tb.feature.transcribe.full` is granted when CF-T.S1 is COMPLETED (content/toolbox.ts; contracts §3.2 has no START
  note), not when it starts (as built; `server/src/wave6-integration.test.ts` pins it at "CF-T open" and "C6 open").

### 5.3 The advanced tracks open: recorded gates (contracts §2.6, §4.3)

- `TRACK_GATES` is the table of §4.3 for lessons: `J.main` and `R.main` at U13.CP, `J.chord-scales` at U14.CP,
  `J.forms` at U15.L06 completed, `J.reharmonization` at U17.CP (and the A gates, listed for completeness; `A.side`
  is Wave 5's `SIDE_LESSON_GATE`). A checkpoint requirement is met by a pass or a soft pass.
- The server **records** each gate the moment it is met (a row with its instant; at start-up for a learner already
  past it) whether or not the lessons behind it exist. In Wave 6 no J or R lesson is authored: `lessonsAuthored` is
  0, `TrackState.next` is `null`, and `note` says so plainly ("Open. Its first lessons are still being written.").
- **Announced once:** the checkpoint outcome and the lesson completion that met a gate carry `gatesOpened`; so does
  that session's summary (the Coda card "The Jazz and Rhythm tracks are open"). Never again after that.
- **The plan stays honest:** a track with no authored lesson is never the New block and never an alternative that
  leads nowhere. `SessionPlan.tracks = { open: ["J", "R"], lessonsAuthored: false, note }` lets Today say it in one
  line; it is `null` before any gate is met and once a track lesson can be planned (the next wave).
- `CourseProgress.tracks` carries the same `TrackState[]` for the map and the progress page. `mapTotal` stays the
  core's count until a track has lessons to count.
- Order inside a track and between tracks, track checkpoints and track capstones are the next wave's.

### 5.4 The ladder: L7 and L8 (contracts §2.9, §6.12)

- **L7** is the learner's own audio: an own-audio project with the self-assessed checklist (`OWN_AUDIO_CHECKLIST`,
  evidence weight 0.3, `selfReported`), worked in even gym slots. It is reported (`GymSession.ladderLevel: 7`) and
  never an item: `ladder.next { level: 7 }` and `ladder.setLevel { level: 7 }` are refused by the schema (400).
- **L8** is a full arrangement of a public-domain standard, staged **form → bass → changes → melody** with CF-T's
  marks (`STANDARD_LADDER_PASS`). On own audio it is self-assessed (the same checklist in Transcribe's
  full-arrangement mode, `tb.feature.transcribe.full`).
  - `ladder.songs` lists the standards with `level: 8` (the three of `CF_T_SONG_IDS`; a song whose answer key is not
    `verifiedBy` a human, or has no `answerKey.sections`, is `locked` "Being checked").
  - `ladder.next { level: 8, songId? }` creates a `pd-song` project and returns `stages: ["form", "bass", "changes",
    "melody"]`; the song CF-T used is skipped by default.
  - `ladder.submit { stage: "form", formMap: { sections, bars }, code }` is graded on the server with `gradeFormMap`
    (the result's `score` and one diagnostic per wrong section); the three code stages with `gradeStandardLadder`.
    Each stage opens when the one before passed or was revealed.
  - **Level-up (decided here; the contracts say only "first available: CF-T"):** L8 is offered once CF-T is released
    and two L6 songs have a graded pass on two days (decision 36's rule). A released CF-T counts as one L8 pass, as
    a released X2 counts for L6. Before that `ladder.setLevel { level: 8 }` answers 409 with the reason.
  - Built: `ladder.next`/`setLevel` with level 8 and the form-map submission are served (never an L6 item, never a
    silent level change; `server/src/wave6-course.test.ts`). The standards are "Being checked" until a human
    verifies their keys; in dev (OAK_DEV=1) they can be worked, as the L5/L6 songs can.
- Realism applies to L8 as to L5–L6.

### 5.5 The end of the core (contracts §2.5; ux §5.5 M7)

- **Stages** (`CORE_STAGES`, decided here): `in-progress` while a core lesson or checkpoint remains; `lessons-done`
  when every core lesson is completed and every core checkpoint is passed or soft-passed but a core capstone (C0–C7,
  X1, X2, CF-A, CF-T) is not released (a capstone never gates, so a learner can stand here); `complete` when all of
  it is done. In the default order that is the end of session 185 (CF-A.S4).
- `course.completion` reports it at any time: `remaining` (what is still open, in map order, at most 12),
  `milestone` (ms.07), `stats` (first day, days with a session, sessions, active minutes, lessons, Side A tracks,
  transcriptions, sketches: the learner's own numbers, never compared with a plan), `canDo` (the can-do statements
  at `solid` or `strong`, newest first, at most 8, with their text), `album` (Side A released of total, the newest
  track: the banner plays two bars of it), and `open`: what stays open after the core, in the order Today offers it —
  each advanced track with its honest note (`available: false` while it has no lesson), the Transcription Gym
  (ladder L8 on another standard, own audio), Studio, reviews, side lessons, any capstone left unreleased.
- **The moment:** the summary of the session that completed the core carries `coreComplete` (stage `complete`), once;
  the Coda shows the finale card instead of a teaser. `SessionPlan.core` and `CourseProgress.core` carry the stage
  for Today, the map and the progress page.
- **After it,** the planner offers, in this order: a capstone left open; due reviews with the every-5th-session gym
  slot kept (d19); else a keep-alive or Studio day. `SessionPlan.kind` is `review`, `gym`, `capstone`, `keepalive`
  or `studio` as today, with `core: "complete"`; `tracks` carries the tracks line. Nothing counts down, nothing
  reads as "you are done here": the note names what is open.
- **For the content lead:** `ms.07` is reached today when EITHER finale is released (`anyOf`); in the default order
  CF-T.S4 is session 171, fourteen sessions before the end. The server reports `stage: "complete"` only when both
  are released; the milestone's condition should say the same (`capstones: ["CF-A", "CF-T"]`).

### 5.6 A session per tab (d21)

- `session.start` with a `tabId` (the app always sends one): the same tab on the same learner day gets its open
  session back (a reload, a retry: the idempotency the old "join" gave); **another tab gets a new session of its
  own**. Without a `tabId` (an older client, a spec posting by hand) the caller is one anonymous tab.
- `session.day?tab=<id>`: `open` is that tab's open session or `null`; `openSessions` lists every session open
  today, oldest first; `ended`, `doneForToday` and `summarySessionId` are the learner day's, shared by all tabs.
- A day counts once for the streak. Both sessions plan the same next lesson while neither has finished it
  (`session.today` is the learner's plan, not the tab's); a lesson finished in one shows as finished in the other
  after a reload (the queries are per learner). The 04:00 carry (a session started before the rollover stays the
  open one for 3 hours) applies per session.
- Two tabs on one capstone both edit, as before (decision 46). `bootstrap.openSession` stays for older clients (the
  newest open session); the app no longer reads it to decide what to resume (§4.2).

### 5.7 The smaller carry-overs on the wire

- **d15 `lessons.sketch`:** the newest unarchived sketch with `originKind: "lesson-make"` and `originId` = the
  lesson, with its versions; `sketch: null` when there is none; 404 for an unknown lesson id.
- **d20 takes:** `album.addTake` appends a recording to a version and makes it current; `album.chooseTake` sets
  `currentTake`; `album.getAudio` serves the current take, or `?take=n`. `hasAudio`, `audioMime` and `durationS` of
  the version describe the current take. `album.putAudio` stays the first recording of a version; on a version that
  already has one the server now appends a take too (nothing is replaced, the `album.audio.replace` nonce is
  accepted and no longer needed), so an older client cannot delete a recording either. Backup export and
  `BackupInfo.albumAudio` include every take.
- **d7:** `session.start` answers 400 when `kind` does not fit `mapItemId` (a lesson id with `kind: "gym"`, a
  capstone session with `kind: "lesson"`), naming the kind the item needs. At realism R3 and above a ladder stimulus
  plays only sounds the learner has unlocked.
- **d19:** on a review-only day the slot rule still runs: the fifth session since the last transcription session is
  a gym (or CF-T) session.
- **d22:** the warm-up's seconds are no longer counted against the 12-minute "a little more" cap.

## 6. Dev seeds (`POST /api/dev/seed { point }`) — the server engineer builds these FIRST

As in Wave 5: every point gives a learner with a working mic and a calibrated range (`mic: false`: Quiet mode), last
activity yesterday, today a fresh day; every seeded release has a recording (`recordings: false`: none); each walks
the default order of contracts §2.5 in version 1.6 (gym slots included: 132 U12.L02 … 185 CF-A.S4) and needs the
content it walks through — until a lesson is authored the point answers 400 naming the missing lesson. `GET
/api/dev/seed` lists what exists. Snapshots (`dev-seed-cache.ts`) apply as before. The names are
`WAVE6_SEED_POINTS`.

| Point | Must contain (done, the last yesterday) | Today |
|---|---|---|
| `after X2 (U12.L02 next)` | X2 released (C5 and X2 in the album), U12.L01 done (it precedes GYM.11 in the order); `chord.seventh` unlocked | U12.L02 |
| `after U12.L05` | U12.L02–L05 (`chord.seventh-dim`; the diatonic sevenths; `fam.chd.quality-7th` seeded) | GYM.12 (a gym slot) |
| `after U13.L03` | GYM.12, U12.L06 (`tb.dict.lefthand`, `fam.int.isolated`), U13.L01–L03 (`tb.early`, `tb.late`, `tb.velocity`) | GYM.13 |
| `U13.CP due` | GYM.13, U13.L04–L06 (`tb.meter.compound`, `tb.ply`), U14.L01, GYM.14 | New block U13.CP |
| `tracks open (after U13.CP)` | U13.CP passed yesterday: gates `J.main` and `R.main` recorded, announced in yesterday's summary (`gatesOpened`) | U14.L02 with `plan.tracks = { open: ["J", "R"], lessonsAuthored: false, … }`; `tracks.list` shows both open with no `next` |
| `after U14.L03` | U14.L02–L03 (`scale.mixolydian`, `scale.dorian`) | U14.L04 |
| `U14.CP due` | U14.L04, GYM.15, U14.L05–L06, U15.L01 (`tb.n.chromatic`; CF-T's gate met) | New block U14.CP |
| `CF-T open (U15.L01 done)` | U14.CP passed (gate `J.chord-scales` recorded); CF-T open, not started | CF-T.S1 with `slot: { fills: "cf-t" }`; `gym.plan.cfT.takesSlot` true |
| `C6 open` | CF-T.S1 completed on Five Foot Two (form map and bass passed) | C6.S1 |
| `C6 released` | C6.S1–S2, released (a Mixolydian vamp of 16 bars with its ♭7 on strong beats) | U15.L02 |
| `CF-T.S2 done` | U15.L02–L03, CF-T.S2 completed (changes passed); the draft tagged with its song, in the song's key | U15.L04 |
| `after U15.L05` | U15.L04–L05 (`snd.horns`, `snd.trumpet`) | U15.L06 |
| `after U16.L03` | U15.L06 (gate `J.forms` recorded), U16.L01, CF-T.S3 (melody passed), U16.L02–L03 | U16.L04 |
| `after U17.L02` | U16.L04–L05 (`snd.tenor`), CF-T.S4 (CF-T released), U17.L01–L02 | U17.L03 |
| `U17.CP due` | U17.L03–L04, GYM.16 | New block U17.CP |
| `C7 open` | U17.CP passed (gate `J.reharmonization` recorded) | C7.S1 |
| `C7.S2 done` | C7.S1–S2 completed with a saved draft: verse and chorus sections, a secondary dominant that resolves, ♭VI–♭VII–I, a melody; no key lift yet | C7.S3 |
| `C7 released` | C7 released (32 bars, the last chorus lifted by a whole step for 8 bars) | GYM.17 |
| `CF-A open` | GYM.17 | CF-A.S1 |
| `CF-A.S3 done` | CF-A.S1–S3 completed with a saved draft that has a verse, a chorus and a bridge and four devices; shorter than 2:00 | CF-A.S4; `plan.core` is `lessons-done` |
| `core complete` | everything through CF-A.S4 (session 185); yesterday's summary carries `coreComplete` | a review day: `plan.core: "complete"`, `plan.tracks` set; `course.completion.stage` is `complete` |
| `ladder L8` | through `after U17.L02` (CF-T released) with the ladder at L8, R1, one L8 standard that is not CF-T's song with the form and bass stages passed | U17.L03; Transcribe opens the L8 item at its changes stage |
| `C3.S3 in progress (d13)` | U09.CP passed, C3.S1–S2 completed and C3.S3 started as the old three-session C3 had it (a draft with the arranged sections and the lead-sheet check passed, no take) | C3.S3 resumes with nothing lost; C3.S4 follows |
| `two takes (d20)` | `C3 released` with a second take recorded on v1 (`takes` of 2, `currentTake` 2) | as `C3 released` |
| `second tab (d21)` | `after X2 (U12.L02 next)` with a lesson session already open today from another tab (`tabId: "tab_00000000000000aa"`, phase `main`, U12.L02) | U12.L02: a spec's own tab starts its own session |

`after X2 (U12.L02 next)` is the Wave 5 point `X2 released` under its Wave 6 name (keep both).

## 7. Ports, environment, browser suites

Environment variables are unchanged (`OAK_PORT`, `OAK_DEV`, `OAK_VITE_PORT`, `OAK_API_PORT`, `OAK_DATA_DIR`,
`OAK_TUTOR_FAKE`, `OAK_NOW`, `OAK_SEED_CACHE`, `OAK_E2E_SHIFT`; wave2.md §2, wave5.md §6–§7). Nothing new.

| Owner | Primary stack (Vite / API) | A second stack, if needed |
|---|---|---|
| notation | Vite page 5194 (no API) | — |
| answers | 5202 / 8802 | 5232 / 8832 |
| workbench | 5206 / 8806 (configs `studio`, `toolbox`, `workbench` page 5193) | 5236 / 8836 |
| transcribe | 5213 / 8813 | 5243 / 8843 |
| audio | 5209 / 8809 (`onboarding`, `voice`, `packages/audio/e2e` page 5191) | 5239 / 8839 |
| drills-ui | 5203 / 8803 | 5233 / 8833 |
| lesson | 5201 / 8801 | 5231 / 8831 |
| session | 5205 / 8805 (`session-seeds`, `map` 5207 / 8807) | 5235 / 8835 |
| capstone | 5210 / 8810 | 5240 / 8840 |
| tutor | 5208 / 8808 | 5238 / 8838 |
| kit | 5214 / 8814 (`ui-review` 5222 / 8822) | 5244 / 8844 |
| server | API 8811 (bun tests only) | — |
| sound | Vite page 5192 | — |
| (integrators, reviewers) | the runner on their own shift, never 0: integrate packages 600, server 1200, content 1800, lesson 600, practice 1200, surfaces 2400; review journey 600, surfaces 1200, studio 1800, robustness 2400, teaching 3000, learner 3600 | a long project's shards take shift + 100, + 200 … |
| (closer, gate) | shift 0: journey 5212 / 8812 (+ 8792), review 5221 / 8821, platform 5173 / 8787 / 8790 | — |

- Each config's `dataDirName` is unique (`test-results/stacks/<name>`, wiped at every start). A new config takes a new
  name, never another config's, and a config in a new folder uses the owner's second pair, never the primary pair of an
  existing config. The root `playwright.config.ts` discovers every `app/src/**/e2e/playwright.config.ts`,
  `e2e/*/playwright.config.ts` and `packages/*/e2e/playwright.config.ts` that exports `area` (do not edit it).
- Configs build on `e2e/support/stack.ts` (frozen).
- **Build-phase engineers and authors** run their own specs directly with their own config and ports (`bunx
  playwright test -c <your config> --trace off`) and never start the runner: it rebuilds `dist/` and the development
  bundle, which others are reading. **Integrators and reviewers** check their projects with the runner on their own
  shift (`bun run e2e --project <name> --shift <yours>`). Only the closer and the gate run the whole `bun run e2e`,
  once each, alone, on shift 0.
- The gate journeys for Wave 6 (gate owner): sevenths (U12.L02 by ear, U12.L05 with the guide-tone lens), rhythm II
  (U13.L01 a push, U13.L04 in 6/8 with the beat grid), U13.CP and the Coda that opens the tracks, modes (U14.L03 in
  Studio with the degree lens), C6, a CF-T session from a gym slot, chromatic harmony (U15.L02 with applied numerals,
  U16.L01, U17.L02 with the key ribbon), C7 with its key lift, CF-A over four days with ONE real take, the Coda of
  session 185 and the day after it, ladder L8, and the U12, U15 and finale days again in Quiet mode.

### 7.1 Browser tests: the runner, the budget, the rules

Copied from `wave5.md` §7.1 (test-speed, 2026-11-13): BINDING for every `*.pw.ts` added or edited in this wave. The
learner has called the suite's run time unacceptable twice; removing or weakening an assertion to save time is a
defect, not a saving. You may NOT raise a budget: if your new lessons or screens honestly need more minutes, say how
many and why under `apiNotes` and the gate decides.

The browser suite is the slowest thing in the repo and grows with every lesson. Its target is **`bun run e2e` in 20
minutes or less on an idle 12-core machine, every test green**. Measured on 2026-11-13 after the suite pass: **19.3 minutes** at 8 jobs, with **100 minutes of test time** (it was 63 minutes and 194 before; the pass aimed at 70 of test time and did not reach it). The budget is 105 minutes for the
whole suite. Every engineer who adds or edits a `*.pw.ts` keeps their project inside its budget.

**The command.** `bun run e2e` (`scripts/e2e-parallel.ts`):
1. builds once: the content, the production app (`dist/`), and the app again in development mode
   (`test-results/e2e-bundle`, `import.meta.env.DEV` true, so every `__oak*` hook and `/dev` route is there), and
   writes the fake-microphone fixtures;
2. runs the quiet files (below) with nothing loud beside them: review-studio's alone, the others in 2 streams;
3. runs everything else in a pool of `--jobs` processes (default from the machine: two thirds of the cores, one per
   3 GB, 8 on 12 cores / 32 GB; test times did not stretch up to a load of 14 on 12 cores, and stretched 43–57 % at
   26–28), longest first; projects over 7 minutes are cut into shards on shifted ports. Every
   stack that allows it serves the development bundle with `vite preview` instead of starting a Vite dev server, and
   this pass records **no Playwright trace**;
4. runs every failed or not-run test again, alone and **traced** (`retain-on-failure`): exactly those tests, or the
   whole file when it is serial. The alone outcome counts; a test that failed beside others and passed alone is
   **load-sensitive** and fails the run, named;
5. prints the units, the ten slowest files, every test over 60 s, the per-project counts (which must add up to the
   listing) and **the budget table**, then `E2E TOTAL`. Exit 0 only when nothing failed, nothing was left unrun,
   nothing was load-sensitive and no budget was exceeded.

| Command | What it does |
|---|---|
| `bun run e2e` | everything, budgets enforced |
| `bun run e2e --project lesson [--project review]` | those projects; their budgets are checked (a group budget only when all its projects ran) |
| `bun run e2e --project lesson --no-budget` | the same, the budget table printed but not enforced |
| `bun run e2e --since origin/main` | the projects that cover the changed paths (`SINCE_MAP`; a shared path selects everything) |
| `bun run e2e --jobs 3` / `--quiet-jobs 1` | fewer processes (a shared machine) / the quiet units one at a time |
| `bun run e2e --shift 300` | every port and data dir moved by 300; logs, reports and durations go to `-s300` files |
| `bun run e2e --no-bundle` | every stack on its Vite dev server |
| `bun run e2e --plan` | the units, shards and files, without running |
| `bun run e2e -- --grep foo` | anything after `--` goes to every Playwright process |
| `OAK_E2E_SHIFT=300 bunx playwright test --project=lesson [file]` | one project directly, on the Vite dev server, traced on failure (`--project=x`: the space form eats file arguments) |
| `bun run e2e:serial` | the old single process |

**The budget.** `e2e/budgets.json` holds minutes of test time (the sum of every test's duration, as
`test-results/e2e-durations.json` counts it) per project or group, and the total (105). The runner fails the run when
a budget is exceeded by more than 15 %, when the total is exceeded, or when a project that ran has no budget. A new
project adds its line; a budget is raised only in the change that argues for it. Check yours before you hand over:
`bun run e2e --project <yours>` prints the table. To stay under it, cut waste (the rules below) before anything else.

**What belongs in a browser test, and what in a bun test.** A browser test proves what only a browser can: that a
screen renders, that its widget takes input from the keyboard and pointer, that it reaches the real server and comes
back, that it sounds and moves in time, that it lays out at both sizes and themes. Everything that can be decided
without a page is a `bun test`: grading every exercise and every wrong variant (`bun run content:check` does it for
every lesson with the real grader), the text of feedback (clean, no raw IDs, no leaked answer), the shape of a plan,
a seed, a payload, a reducer. Decide per assertion which suite owns it, and never prove the same thing twice: a lesson
walk proves that each step KIND renders, takes its answer through the real widget and moves on; it does not re-grade
every exercise.

**Real time.** Listening never gates (every step offers Skip from the start), so a walker hears **one** item through
per widget kind per spec file; everywhere else it asserts that the item plays (`aria-pressed`) and that its position
moves (compare beats, not bars: one-bar loops wrap), then skips. A take, a drift gate, a pitch gate, a sung trial
through the fake microphone are real time on purpose: keep them, once per thing they prove. No `waitForTimeout`
except inside a real-time measurement: wait for the condition (`expect(...).toHave…`, `waitForResponse`,
`document.fonts.ready` plus two animation frames). Never `.catch()` an auto-waiting read or click without a short
timeout (journey and review have a 60-s action timeout); read what is on screen now with `textNow()`
(`e2e/support/ui.ts`). Timers that are not the subject (a cool-down, "nothing polls for 9 s") run on
`page.clock`, where no audio plays.

**Seeds.** Every test starts from a dev seed (`POST /api/dev/seed`, §6, wave3.md and wave4.md §6), never by replaying
a warm-up, a lesson or a day to reach the screen under test. A seed may not already hold the state the test is meant
to produce. A missing point is a request to the server owner, not a replayed day.

**One page per state.** Reach a state once and assert everything about it there: a screenshot matrix seeds and loads
once, then changes the size in place (`setViewportSize`) and reloads only to change the theme; the tests of a serial
file may share a page set up in `beforeAll` when each starts where the last left it. A new context costs 0.1 s; a
seed up to 15 s; a reload of the dev app 1 s.

**No test over 60 s** unless it measures real time (a take the brief requires, the drift or pitch gate); the runner
lists every one. A long test is split from a seed, never given a longer timeout.

**The bundle.** Specs reach the app through its `__oak*` dev hooks (present in the development bundle) and its UI,
never by `import("/src/…")` in the page: the bundle has no source paths. An area that needs a page only the dev
server has (answers' gallery, kit's galleries, the specs that import `/src/…`: voice, review-studio) passes
`bundle: false` to `oakStack`. Measured on map, studio and tutor (the same 66–81 tests side by side, swapped): the
bundle alone −36 %, tracing off alone −18 %, both −42 %. A faster page exposes races a slow one hid: wait for the
state your key press needs (the data loaded, the handler mounted), never for time.

**Quiet files** measure milliseconds or cents on real audio, so nothing loud runs beside them: audio's measuring specs,
strudel sounds/editors, voice gate/settings/bleed, transcribe ab-drift/hum/own-audio, review-studio's
`transcribe.pw.ts`, workbench loop/workbench (`QUIET` in the runner). They run before the loud pool, in 2 streams,
except a project in `QUIET_ALONE` (review-studio: its 0.25× drift at bar 0 went from −7.6 ms alone to −15.6 ms beside a
second quiet stream, gate 20 ms), which runs with nothing beside it. The audio A/B gate (2.73 → 2.75 ms), the pitch
gate (recall 99.9 %, p95 5.8 → 6.2¢) and the 1× and loop drifts did not move with a second stream. A file moves into
QUIET, or a project into QUIET_ALONE, only with evidence (a number that moves toward its gate beside other suites),
never to hide a flake; never loosen a gate or a tolerance to pass under load. A late start is a fact of a busy page:
a spec reads where the audio actually started (ab-drift reads the file's join from the capture) instead of assuming.

**Traces.** The pool records none (they cost 5–80 % of a test's time and are thrown away when it passes); every
failure is re-run alone with a trace in `test-results/e2e-out/<unit>.alone/`. Locally, `--trace on` traces anything.

**Shards and ports.** `OAK_E2E_SHIFT=<multiple of 10>` moves every port of every e2e server and suffixes data and
output dirs with `-s<n>`; shards take base + 100·k, so a spec file never depends on another file having run first.
Specs read ports from their config's `stack` or `shifted()`, never literals. The test front end (`vite preview` of the
bundle, or `e2e/support/vite.e2e.config.ts` without HMR and watcher) never reloads a page mid-test.

## 8. What is frozen

After Foundation, import from these and never edit them; put what you need in your own folder and report under
`apiNotes` anything that should be promoted:

- `app/src/lib/**` (except `mic*.ts` — audio — and `tutor-stream.ts` — tutor), `app/src/main.tsx`,
  `app/src/router.tsx`, `app/src/routes/__root.tsx`, `app/vite.config.ts`, `app/index.html`, `app/public/**`.
- `app/src/ui/**` and `app/src/styles/**` for everyone except kit.
- `e2e/support/**`, the root `playwright.config.ts`, `scripts/e2e-parallel.ts`, `e2e/budgets.json` (a budget is
  raised only by the gate), root `package.json`, `bun.lock`, `bunfig.toml`, `biome.json`, root `tsconfig*.json`,
  `node_modules`.
- `docs/design/contracts.md`.
- Content registries (syllabus, skills, toolbox, terms, glossary, candos, flavours, milestones), `content/specs/**`,
  `content/validate/**`, `content/lib/**`, `scripts/content/**`; `packages/content-kit/**` is additive-only and the
  grader engineer's after Foundation.
- `packages/api/**` is additive-only and the server engineer's during Build; other areas request additions under
  `apiNotes`.

## 9. Workflow rules

- Never `bun install`/`bun add`, `git commit`/`stash`/`reset`/`checkout`. Stop every server you start; never kill a
  process you did not start (no `pkill` by name: thirty stacks may be running).
- Vite on Node: `node node_modules/vite/bin/vite.js`, never `bunx --bun vite`.
- Logic tests `*.test.ts` next to the code: `bun test --isolate <your folder>` (always `--isolate`). Browser tests
  `*.pw.ts` in `<your folder>/e2e/` with your own config on your own ports (§7) and a `dataDirName` unique to you.
- **No stray specs or scratch files.** Temporary files go under your own directory in the scratchpad
  (`…/scratchpad/w6/tmp-<your key>/`) or `test-results/`, and are deleted before you finish. No report or FINDINGS
  files in the repo.
- **Fast tests.** No Playwright test takes longer than 60 s unless it measures real time; every spec starts from a
  dev seed (§6) and `PUT /api/dev/clock` instead of replaying days (§7.1).
- **Block Vite's HMR websocket** in your specs: `await page.routeWebSocket(/.*/, () => {})` before the first `goto`
  (other engineers' edits reload the page and can load a module twice).
- **d25:** reach the app through its `__oak*` hooks and its UI only; no console filter or assertion may depend on a
  module path or a stack frame's file name (the first pass serves a bundle).
- Typecheck what you touch (`bunx tsc --noEmit -p <tsconfig>`; interfaces.md §1.4), then `bun run typecheck`,
  `bunx biome check --write <your paths>` (only your paths) and `bunx biome ci <your paths>`. Failures in another
  engineer's unfinished paths are reported, not fixed.
- Music claims and examples are verified with headless Strudel (`import { evalHeadless, midisOf } from
  "@oak/grader/testing"`), `bun run theory …` or `@oak/theory` (`keySevenths`, `guideToneLine`, `modalChords`,
  `appliedChord`, `borrowedChords`, `pivotChords`, `keyDistance`, `chromaticLabel`, `readChord`, `romanText`).
- The tutor only through the scripted fake backend (`OAK_DEV=1 OAK_TUTOR_FAKE=1`, wave2.md §5). Never the real CLI,
  never an API; nothing contacts a non-localhost host at runtime or in tests.
- **Results**: as your last step, write your full structured result as markdown to
  `/private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/w6/<label with ":" → "-">.md`.

## 10. Definition of done for a surface

(wave2.md §8, with the Wave 3, 4, 5 and 6 additions.)

1. **Real data, every state.** Loading (kit `Skeleton`/`LoadingState`), empty (`EmptyState` with the next action),
   error (`ErrorState` with retry; 501 reads "Not built yet"), offline server, tutor off, Quiet mode / no mic where
   relevant. No placeholder copy, no lorem, no dead buttons, no `WavePlaceholder` left on your surface.
2. **The next action is obvious** and progress is visible (ux §1); copy is calm, adult, precise, never cute or
   shaming (ux §7.11); no banned patterns (ux §1.6: no loss framing, countdowns, red streak states).
3. **Keyboard-only**: every action reachable and operable; visible focus; the keys of ux §7.10 that your surface
   lists work and appear in the shortcut sheet; `Esc` closes overlays; focus lands somewhere sensible after each
   transition.
4. **Both themes and both sizes**: Playwright screenshots at 1440×900 and 1280×800 in Paper and Bark
   (`SCREENSHOT_MATRIX`, `useUiPrefs`, `shoot`), saved under `<your folder>/e2e/screenshots/`, **read and fixed**
   (alignment, overflow, contrast, focus rings). At 1280×800 every primary action is visible without scrolling with
   the tutor drawer closed (ux §10.11; d23). No horizontal overflow.
5. **Reduced motion**: with `prefers-reduced-motion` (or Settings → Appearance) nothing transforms for longer than
   120 ms; content appears at once.
6. **Tests**: logic in `*.test.ts` (pure functions, reducers, machines), behaviour in `*.pw.ts` on your own stack,
   including a keyboard-only path and the tutor through the fake backend where the surface talks to it; inside the
   browser-test rules of §7.1 and your project's budget. A spec that runs broken learner code allows Strudel's one
   `console.error`.
7. **Seams kept**: you only edited your paths; you used the contracts of §3–§5 as written; anything you needed from
   shared code is in your folder and listed in `apiNotes`.
8. **Green**: `bun test --isolate <your paths>`, your Playwright suite, `bun run typecheck`,
   `bunx biome check <your paths>`.
9. **Works in Quiet mode** (Wave 3): with `voice.get.quiet` true (or no mic) every sing part shows its fallback
   (the guide-tone sing step too), nothing waits for a voice, nothing is gated, nothing reads as a failure, the mic
   chip says Quiet; hum-to-draft offers typing instead. A spec covers the Quiet path.
10. **Works with lenses on and off** (Waves 3–6: note, chord, section, bass-role, blue-note, and now guide-tone, key
    and beat-grid lenses): with each lens on and off (and locked, before its unlock) your surface lays out without
    overflow or overlap, labels appear where the lens says and nowhere else, and nothing depends on a label being
    present.
11. **Music is right** (Wave 4): every chord name, numeral, cadence, function and degree your surface shows comes
    from `@oak/theory` / the grader's views, never from a local table; RN answers compare `(degree, quality,
    inversion)`.
12. **Minor is minor** (Wave 5): in a minor key, degrees read 1 2 ♭3 4 5 ♭6 ♭7 with do-based syllables, numerals read
    i ii° III iv v VI VII (V and vii° with the raised 7), and nothing relabels a minor piece in its relative major.
13. **Form and time are right** (Wave 5): sections, bar numbers, charts and loops count from the first full bar after
    a pickup, come from `sectionsFromAst` / `formView`, and a swung piece shows "Swing 8ths" and grades on the
    straightened grid (§6.10).
14. **Side lessons stay optional** (Wave 5), and so do the advanced tracks (Wave 6): nothing makes a track look
    required or started; a track with no authored lesson is named as open and still being written, never offered as
    a session.
15. **Nothing is shown before it is taught** (Wave 6): a seventh, an applied numeral, a borrowed chord's numeral and
    a chromatic syllable appear only at the depth `harmonyDepth` opens (`chordLensText`, `degreeLensText`); a mode is
    named only from its lesson (content-kit `MODE_OPTIONS`); the lesson that teaches a thing shows it in its own
    steps.
16. **Keys and meters are read where they are** (Wave 6): after a key change every degree, syllable and numeral is
    read in the key in force at its bar (`keyPlanView`, `keyPlan`), never in the first key; in 6/8, 9/8 and 12/8 the
    beat is the dotted quarter everywhere (the roll's grid, the count labels "1 la li", the tempo line, taps, grids
    of 6 steps), and BPM counts that beat.
17. **The end of the core is a reward, not an exit** (Wave 6): the Coda of the last core session shows what the
    learner made and can now do before anything else; Today the day after names what is open (reviews, the gym,
    Studio, the tracks with their honest note) and never reads as finished, empty or broken.

## 11. Wave 6 content kinds: who renders, who grades

From `packages/content-kit/src` as re-read at the end of Foundation (2026-11-13; `CONTENT_SCHEMA_VERSION` 5,
`CONTRACTS_VERSION` 1.6; `IMPLEMENTED`, `PLANNED` and `SCHEMA_FEATURES` in `implemented.ts`; AUTHORING §19). No new
exercise kind, answer widget or matcher was added: Wave 6 is new fields on existing kinds, one new rule
(`reharmonize`), and rules that have had an analyzer since Wave 1 and now meet authored content. "Grades" is always
the grader (`gradeExercise` / `gradeCapstone` / `gradePhraseCheck` / `gradeSongLadder` / `gradeStandardLadder` /
`gradeFormMap`). A feature or rule in `PLANNED` is rejected by content CI in a lesson until its owner moves it into
`IMPLEMENTED` with tests (the renderer's owner moves UI features once they render; the grader engineer moves rules,
rule fields and matcher fields once graded with golden tests).

| Kind / field (status at Foundation) | Type (content-kit) | Renders | Grades | Notes |
|---|---|---|---|---|
| `key-plan` (planned feature) | `ExBase.keyPlan?: KeyPlanEntry[]` (`{ bar, key }`, 1-based; the pickup bar is 0); `SongDef.keyPlan?` | lesson and transcribe hosts → notation (`keyChangesOf(keyPlan)`), workbench (the key ribbon), answers (degree pad, `rn-palette`, `bar-grid` read each bar in its key) | grader: `key-relative` melody, degrees and numerals in the key in force at each bar (`keyAtBarOf`) | U17; the first entry is bar 1 (0 with a pickup) and equals `key` |
| `rn-palette.slot-keys` (planned feature) | `rn-palette` + `labels?: string[]`, `slotKeys?: KeySpec[]` (one per slot) | answers (a label per slot; a slot's numerals offered in its own key) | grader (`grade/answers.ts`: each slot by degree, chroma and quality in its key) | U17.L01: one pivot chord named in two keys (`pivotChords`) |
| `rn-palette` `allow` | `sevenths`, `secondary`, `borrowed` | answers (the palette offers the suffixes and applied / borrowed numerals; Shift+digit for a seventh) | grader (at seventh depth where `sevenths` is allowed) | U12.L04, U15.L02, U16.L01; `fam.har.rn` L4–L5 |
| `grid.steps` (planned feature) | `grid` + `stepsPerBar: 6 \| 24` | answers (`RhythmGrid`: grouped by the meter, 3 + 3 in 6/8); drills-ui | grader (onsets on the grid) | U13.L04 (6/8), U13.L05 (sixteenth triplets); `beatGrid(meter)` gives the grouping |
| `form.map` (planned feature) | `form` + `input: "map"`, `bars`; `Answer.bars?: number[]` (the first bar of each section) | answers (`Form.tsx`: a bar strip the learner cuts and labels); capstone (CF-T.S1), transcribe (L8) | grader `gradeFormMap` (start bar and label by shape) | CF-T, L8; the number of sections is not shown |
| `scale-builder.from` (planned feature) | `scale-builder` + `from: ScaleMode` | answers (`ScaleBuilder.tsx` opens holding that scale and shows which degree moved) | grader (the same set comparison) | U14 "raise or lower one note"; pair it with `modalSignatureKey(key, "parallel")` on the staff |
| `staff-input.ties`, `.dots`, `.triplets` (planned features) | `staff-input` `palette.ties: true`; duration tokens `4.` and `8t` | answers (`staff/rhythm.ts` §3.4 → `StaffInput.tsx`) on notation's edit model | grader (`events` matcher with `durations: true`; a tied note is one event) | U13.L03, L05 |
| `meter.compound` (planned feature) | a lesson or exercise with `meter` 6/8, 9/8 or 12/8 (`COMPOUND_METERS`) | every host: the roll's grid (`beatGrid`), counts "1 la li", taps, grids, the tempo line `setcpm(bpm/2)`; notation beams by the dotted quarter | grader (already meter-aware: `METERS`, `metricWeight`, `isStrong`) | U13.L04; reported once per lesson |
| `sing.guide-tones` (planned feature) | `SingEx` `mode: "guide-tones"`; the target a reference track or degrees | lesson, drills-ui through answers `SingCapture` (one note per chord while the chords play); Quiet mode picks the notes | grader `gradeSung` per note (contracts §8.1); `guideToneLine` gives the line | U12.L05 preview; never gates |
| `harmony.wrong-quality` (planned feature) | `harmony` matcher + `wrongQuality: "partial" \| "none"` | — | grader — **stub** (`unbuiltWave6Matcher`: score 0, `rubric.unknown`) until `match/harmony.ts` builds it | d11: L6, X2, L8 and CF-T changes use `none` |
| `contains-rn.kind`, `.in-order` (planned features) | `contains-rn` + `kind?: OutsideChordKind[]`, `inOrder?: boolean` | lesson Make lines, capstone checklist | grader — **stub** (`WAVE6_UNBUILT`); build on `outsideChordKind` | C7 "a secondary dominant that resolves", "♭VI–♭VII–I present"; CF-A; U15–U16 Makes |
| `form.contains`, `form.song` (planned features) | `form` + `contains?: string[]`, the patterns `*` and `@song`, `extra?: string[]` | capstone checklist | grader — **stub**; `@song` reads `SongDef.answerKey.sections` | CF-A "contains a bridge"; CF-T.S4 |
| `mode.any-of` (planned feature) | `mode` + `anyOf?: ScaleMode[]`, `tonic: "declared"` | capstone checklist (C6) | grader — **stub** for the new fields; the rule itself runs (`modeView` asks the same) | C6 "Mixolydian or Dorian"; `MODE_CHARACTERISTIC` names the tone and the degree it replaces |
| `guide-tones.motion` (planned feature) | `guide-tones` + `at?: "change" \| "strong" \| "all"`, `maxMoveSemis?` | lesson Make lines | grader — **stub** for the new fields | U12.L05 |
| `modulation.via` (planned feature) | `modulation` + `via?: "pivot" \| "direct"` | lesson Make lines | grader — **stub** for the field; build on `pivotChords` and `keyPlanView` | U17.L01 |
| `velocity-ghosts.accents` (planned feature) | `velocity-ghosts` + `drum?: DrumRole`, `accents?: number` | lesson Make lines | grader — **stub** for the new fields; `rhythmView().tracks[].ghosts` | U13.L02 |
| `mode`, `key-change`, `modulation`, `guide-tones`, `velocity-ghosts`, `device-count` rules (planned for content; analyzers since Wave 1) | `rubric.ts`; `device-count` now takes `DeviceName[]` (`DEVICE_NAMES`, `CORE_DEVICES`) | lesson Make lines, capstone checklist | grader (`RULES`) — golden tests per contracts §6.6 before they move to `IMPLEMENTED` | C6, C7, CF-A; pinned on small pieces in `rubric/wave6-rules.test.ts` |
| `reharmonize` rule (planned) | `{ rule: "reharmonize"; melody; reference; min; kinds?; harmony? }` | lesson Make lines (U16.L05) | grader — **stub** in `RULES` (fails "not built yet") | the same tune over new chords; later JC4 |
| `make.from-sketch` (planned feature) | `CodeMakeEx.fromSketch?: LessonId` | lesson (opens the Make with `useLessonSketch(fromSketch)`; "Start from Oak's copy" puts `code.starter` back) → workbench | — (grades against the brief as any Make) | d15; the server builds `lessons.sketch` |
| `capstone.form-map` (planned feature) | `CapstoneSessionDef.formMap?: FormMapCheck` (`{ id, vocabulary, boundaries: "asked" \| "given", pass, given? }`) | capstone (the session starts with the map: the `form` widget in `input: "map"`, or `"label"` when boundaries are given) | grader `gradeFormMap`; server keeps it as a check (`CapstoneCheckState.layer: "form"`) | CF-T.S1; a `PhraseCheck.after` may name it |
| `capstone.session-rubric` (planned feature) | `CapstoneSessionDef.rubric?: RubricRule[]` | capstone checklist of a transcribe capstone's session | grader (`gradeCapstone` on the whole piece; `required` rules gate the release) | CF-T.S4 (`form` `@song`, the four roles) |
| `LessonMeta.splitFrom` (schema) | `splitFrom?: LessonId` | — | — | d17: U05.L09 out of U05.L04; the server records it as completed for a learner whose U05.L04 predates the split |
| `SongDef.answerKey.sections`, `SongDef.keyPlan` (schema) | `{ label, bars: [from, to] }[]`; `KeyPlanEntry[]` | transcribe (the form strip, the key given per section), capstone | grader (`formMapKey`, `@song`) | the three CF-T standards; Body and Soul (U17.L04) |
| Standard options | `MODE_OPTIONS`, `METER_FEEL_OPTIONS`, `BEAT_DIVISION_OPTIONS`, `PUSH_OPTIONS`, `OUTSIDE_CHORD_OPTIONS`, `KEY_CHANGE_OPTIONS` | answers (`choice`), drills-ui | grader (`choice`) | `fam.key.mode`, `fam.rhy.meter`, `fam.rhy.subdivision`, `fam.rhy.syncopation`, `fam.har.chromatic`, `fam.har.modulation`; offer each option only from its lesson |
| Tables | `SEVENTH_QUALITIES`, `SEVENTH_DEGREES`, `DIATONIC_SEVENTHS`, `HARMONIC_MINOR_SEVENTHS`, `MODE_CHARACTERISTIC` (`ColourMode`), `CHROMATIC_DEGREES`, `CHROMATIC_STEPS`, `OUTSIDE_CHORD_KINDS`, `COMPOUND_METERS` | answers (quality pad, degree pad with chromatic degrees from U15.L01), drills-ui | grader | `@oak/theory` `wave6.ts` computes the same facts from the chord and scale tables; `wave6.test.ts` checks they agree |
| Wave 5 kinds | unchanged | as wave5.md §11 | | |

Drills of stages E–F and the rhythm part of H (`fam.chd.quality-7th`, `fam.int.isolated`, `fam.rhy.syncopation`,
`fam.rhy.subdivision`, `fam.rhy.meter` L3, `fam.rhy.echo` L5–L7, `fam.rhy.dictation` L5+, `fam.key.mode` L3–L5,
`fam.deg.fet-chromatic`, `fam.deg.index` L5, `fam.har.chromatic`, `fam.har.modulation`, `fam.har.rn` L4–L5,
`fam.har.bass` L6, `fam.har.progression` L5–L6; contracts §7.3) are generated by drills-engine and rendered by
drills-ui with the `choice`, `degree-pad`, `quality-pad`, `rn-palette`, `grid`, `tap` and `mic` widgets; graded by
`@oak/drills` + `gradeAnswer`.
