# Oak Wave 7 seams — the advanced tracks: jazz harmony, advanced rhythm, arrangement & sound

**Status: binding for Wave 7 Build.** Written in the Foundation phase (2026-11-14). Ranks below `contracts.md`
(version 1.8, the content lead's change in this Foundation), above everything else (`wave6.md`, `wave5.md`,
`wave4.md`, `wave3.md`, `wave2.md`, `interfaces.md`, ux, the rest). It records who owns what, the carry-overs into
Wave 7, the seams between builders (signatures copied from the code; when this file and the code disagree, the code
is right and this file has a bug — report it), the API additions, the dev seeds, the ports, what is frozen, the
workflow rules, the browser-test rules with this wave's per-area allowance, the definition of done and the Wave 7
content kinds.

Goal of the wave, the last of the build: the three advanced tracks of contracts §2.6 — **Jazz Harmony** (J1–J5, 22
lessons, J.CP1, J.CP2; JC1 "ii–V Ballad" 2 sessions, JC2 "Jazz Blues in F" 2, JC3 "Rhythm-Changes Contrafact" 3, JC4
"Reharmonize a Standard" 3), **Advanced Rhythm** (R1–R3, 15 lessons, R.CP; RC1 "16th-Note Funk" 2, RC2 "Clave &
Polyrhythm" 2) and **Arrangement & Sound** (A1.L05–L07 and A2.L01–L06 beside the four side lessons, A.CP; AC1 "One
Tune, Two Genres" 3, AC2 "Neo-Soul Ballad" 3); ear training stage G (jazz) and the rest of H (swing ratio, clave, odd
groupings, polyrhythm); the planner, Today and the Oak once the learner chooses between tracks; the album from twelve
to twenty tracks; the illustrated Oak and the offline renderer with export (brought in by this Foundation); and the
product when all 259 sessions are done. Contracts 1.8 splits no lesson: J5.L03, R1.L05, A1.L07 and A2.L03 each keep
one required operation inside their budget (`content/specs` names every id).

Read first: `wave6.md` "Wave 6 state" (what you can rely on and the known gaps), then this file in full, then the
contracts sections your area touches (§2.6–§2.9, §3 rows of J, R and A, §4 nodes J01–J14, R13–R18, D02–D11, B05 and
§4.3, §5, §6, §7.3 stages G and H, §7.6, §9, §10, §11) and the pre-flight
(`/private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/codex/w7plan.result.md`:
advice, checked by execution; contracts win where they disagree).

The three things that decide whether this product works — judge every choice against them: **enjoyment** (each
session ends with something the learner made that sounds like music they would replay — these tracks are where the
jazz, soul and funk the learner came for finally sound like the records), **pace** (a session fits its 15/20/25
minutes, one new idea at a time) and **return** (the learner leaves knowing what they can now do and what opens next).
The tracks are optional: nothing forces the learner through them, so every lesson has to earn the next one.

**What the corrections pass taught, for every rule and every sentence** (decision 71): every required rule checks
what is HEARD (the effect rules of `packages/grader/src/rubric/corrections-rules.ts`, each with `alsoUses`, before a
bare `uses`); for every graded step write, besides the reference and the known-wrong variants, at least one WRONG
ANSWER THAT USES THE RIGHT FUNCTION and prove it fails, and three other right answers and prove they pass; a part
more than 24 dB under the loudest part is not heard; no feedback or hint below rung 4 names the answer; every
sentence about music is checked by running it.

## Wave 7 state (read this first; written by the final gate, 2026-11-15)

This is the last wave of the build. Everything the course map plans exists and is tested: all 259 sessions (core 185,
jazz 34, rhythm 20, arrangement and sound 20; contracts §2.7), the 46 track lessons (J1–J5, R1–R3, A1.L05–L07, A2),
the four track checkpoints (J.CP1, J.CP2, R.CP, A.CP), the eight track capstones (JC1–JC4, RC1–RC2, AC1–AC2), ear
stages G and H, the planner's choice between tracks, Today, Progress, the Coda's real next line (f6), Side B of the
album with Export (f2), the illustrated Oak with every leaf of 259 sessions (f1), and the end of the course.

**What a maintainer can rely on.**
- `bun run check` is green (typecheck of every project, `biome ci`, every unit test); `bun run content:check all` has
  0 FAIL. Every graded step of the tracks meets the corrections standard (decision 71): its reference and three other
  right answers pass, its known-wrong variants and at least one wrong answer that uses the right function fail.
- Every capstone of the course can be completed by a real learner on the normal build, JC3 included: its "tune of your
  own" line reads I Got Rhythm's head when its answer key exists and J4.L04's head until then (decision 80).
- The grader reads what is heard (24 dB rule), counts only the learner's own devices in JC4 (decision 81), judges tune
  notes between comping hits (83), and never says a key-less brief is "in C major" (83).
- Security (contracts §11): the strict profile is an allowlist; `album.source` refuses an unreviewed import; imported
  capstone drafts, sketches and album versions open as text until the strict lint passes; `/dev/*` exists only with
  OAK_DEV (server and service worker); only `/offline-render.html` may be framed, by Oak itself. "Export backup" in
  Settings works (it was refused with 403 before the gate; decision 84).
- The live tutor answers through the claude-cli backend (three real turns at the gate: a rung-1 hint, a JC1 review, an
  "Explain my mistake"; decisions.md W7 row).

**Known gaps** (each also in docs/decisions.md, "Needs you" or decision 83):
- Answer keys: I Got Rhythm and Body and Soul have none (the 1930 prints were never opened): J4.L04 reads Oak's
  stand-in head, JC3 compares with it, JC4 offers Georgia only, U17.L04 keeps its fallback. Every song stays
  `verified: false` until a person checks print. St. Louis Blues now has three agreeing readings (f8: the outside
  print reading, the author's setting, and review:teaching-rest's independent reading); bar 9's tie and bar 10's chord
  are not checked against the 1914 print.
- Grader gaps that let a wrong answer pass, written down with failing cases: `pcset` perOnset never judges answer
  onsets the target lacks where the target sounds (J1.L02/J4.L01 with a wrong last quarter); `blues-form` reads triads
  (an all-∆7 jazz blues passes "a jazz blues"); `melody.extra-note` names degrees in a key read from the answer alone;
  capstone details count over the 64-bar reading of a loop ("0 of 48 chord changes" for a 16-bar JC1); JC4 with the
  whole harmony a beat late still passes; a tune note between comping hits on a two-chord bar is judged against the
  chord struck before it. The corrections gate's content-rule cases AS-09, AS-33 (C1, contracts §6.6), AS-42, AS-48,
  AS-50, AS-51 still pass.
- Theory: C7♯5, C11, C13♭9, C7♭9♭13 and C7♯9♭13 do not parse (printed as typed); "C7b5" prints as C7♯11; the chord band
  gives no numeral for some non-diatonic chords; the blue-note lens reads a minor key's ♭3 and ♭7 as blue notes.
- Notation: 4:3 inside 9/8 on the drum staff is exact but unreadable (tied 32nds).
- Product: Make starters cannot load the learner's own sketch; code typed in a modify step is not kept over a reload;
  a drill's two-lane take lists the silent hand's missed notes; seventeen jazz lessons comp on the same Rhodes trio.
- Nobody has listened: the Wave 7 Bands with the new `drumsLift`, R2.L02's clav riff, A2.L01's strings pad, the J5.L05
  hook. Nobody has sung or tapped to the track items on a real mic.
- Time: the browser suite and the unit suite are over their targets (decisions.md W7 row has the measured numbers).

## 0. What Wave 7 inherits

Everything listed under "What Wave 7 can rely on" in `wave6.md`. Much of the tracks' theory, grading and engraving
existed before this wave; a seam is only what was missing. Checked by execution in Foundation:

- `@oak/theory`: the chord table already holds every jazz quality the tracks name (6, m6, 69, sus, 7sus, maj9, m9, 9,
  m11, 13, 7♭9, 7♯9, 7♯11, 7♭13, 7alt, maj7♯11, m(maj7)) in three spellings (code/iReal, lead sheet, glyph);
  `euclid(k, n, r)` and `bjorklund` (Strudel's), `METERS` with 5/4, 5/8, 7/8 and 9/8i and their declarable
  groupings (`meterWith`), `swingByArgs`, `guideToneLine`, the Wave 6 key plan, applied and borrowed chords.
- `@oak/grader`: the rules `euclid`, `clave`, `polyrhythm`, `register-separation`, `no-muddy-low`, `swing`,
  `syncopation`, `velocity-ghosts`, `voice-leading`, `guide-tones`, `device-count`, `reharmonize`, `blues-form` exist
  since Waves 0–6; the custom rules `walking-bass`, `allowed-tensions` and `ii-v-chain` exist with OLD semantics the
  pre-flight broke (A3: four attacks in beat 1 "walk"; A4: the tensions never read the melody; A5: two bars of clave
  pass "8+ bars"; A6: alternating bars pass as a polyrhythm; A7: "top voice" grades every voice). Content-kit 6 keeps
  all of them out of lessons (`PLANNED`) until the grader engineer rebuilds them to their content-kit definitions.
- `@oak/notation`: odd-meter beaming by the meter's grouping (7/8 as 2+2+3, 9/8i as 2+2+2+3), "Swing 16ths", section
  labels with double bars, lead sheets in pages (`leadSheetPages`), compound meters and tuplets.
- `@oak/api`: `TRACK_GATES` and their recording (`tracks.list`), `CoreCompletion`, IDs for every track lesson,
  checkpoint (`J.CP1`) and capstone session (`JC1.S2`); `capstones.gate` with several conditions (AC2's three-way
  gate fits); `AlbumTrack.side` "B" for the advanced capstones.
- The server records the J and R gates at U13.CP; the content lead's Foundation authors J1.L01, J2.L01, J3.L01,
  J5.L01, R1.L01, R3.L01 and A2.L01 as exemplars, so in this tree J and R have a next lesson: the Wave 6 specs that
  pinned "its first lessons are still being written" now see `next: "J1.L01"` (§7.3 lists them; their owners update
  them in Build).

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
   (additions for this wave: the session engineer also owns content/oak.layout.ts; the sound engineer owns packages/strudel/src/offline/** and its specs; app/offline-render.html, its entry file and the Vite and service-worker wiring are written in Foundation and frozen)
 - author:J1a : content/advanced/J1/L02, L03      - author:J1b : content/advanced/J1/L04, L05
 - author:J2a : content/advanced/J2/L02           - author:J2b : content/advanced/J2/L03, L04
 - author:J3a : content/advanced/J3/L02, L03      - author:J3b : content/advanced/J3/L04
 - author:J4a : content/advanced/J4/L01, L02      - author:J4b : content/advanced/J4/L03, L04
 - author:J5a : content/advanced/J5/L02, L03      - author:J5b : content/advanced/J5/L04, L05
 - author:R1a : content/advanced/R1/L02, L03      - author:R1b : content/advanced/R1/L04, L05
 - author:R2a : content/advanced/R2/L01, L02      - author:R2b : content/advanced/R2/L03      - author:R2c : content/advanced/R2/L04, L05
 - author:R3a : content/advanced/R3/L02, L03      - author:R3b : content/advanced/R3/L04, L05
 - author:A1a : content/advanced/A1/L05, L06      - author:A1b : content/advanced/A1/L07
 - author:A2a : content/advanced/A2/L02, L03      - author:A2b : content/advanced/A2/L04      - author:A2c : content/advanced/A2/L05, L06
 - author:CP  : the J.CP1, J.CP2, R.CP and A.CP items (content/checkpoints.ts and the checkpoint folders AUTHORING.md names) and content/bands/** — the only author who edits those
 - author:capstones-jazz-a : the JC1 and JC2 entries of content/capstones.ts and their capstone folders
 - author:capstones-jazz-b : the JC3 and JC4 entries and folders
 - author:capstones-rhythm : the RC1 and RC2 entries and folders
 - author:capstones-sound  : the AC1 and AC2 entries and folders (all four capstone authors share content/capstones.ts: re-read it immediately before each edit, change only your own entries, never rewrite the file)
 - author:repertoire : content/repertoire/** — the only author who edits it
 (J1.L01, J2.L01, J3.L01, J5.L01, R1.L01, R3.L01 and A2.L01 are the exemplars written in Foundation. If the content lead split a lesson (the specs in content/specs name every lesson id), the author who owns the original lesson also owns the lesson split from it. The remaining content registries — syllabus/skills/toolbox/terms/glossary/candos/flavours/milestones — content/specs/**, content/validate/**, content/lib/** and scripts/content/** are frozen during Build: authors request changes via apiNotes. app/src/lib/** (except mic*.ts and tutor-stream.ts), app/src/main.tsx, router.tsx and routes/__root.tsx, app/offline-render.html and its entry, the Vite configs, the root playwright.config.ts, e2e/support/** and scripts/e2e-parallel.ts are frozen during Build for everyone.)
```

Files Foundation (seams) created or changed inside an owner's paths are that owner's from now on; keep their
exported signatures (others code against them) and extend freely:

| Owner | Seam files Foundation wrote | What the owner does with them |
|---|---|---|
| grader | `packages/theory/src/wave7.ts` (+ test) and its export block; `packages/grader/src/analyze/wave7-views.ts` (+ test: views on real Strudel, the not-built guard, theory ↔ content-kit agreement); `rubric/wave7-rules.ts` (`WAVE7_UNBUILT`, `WAVE7_REBUILD`, the planned-custom-rule stubs); the guard in `evalRule` (`unbuiltWave6(rule) ?? unbuiltWave7(rule)`); `CUSTOM_RULES` = stubs + `BUILT_CUSTOM_RULES`; `GradeContext.songMelody` / `RubricContext.songMelody` (`SongMelodyNote`, threaded in `grade/index.ts`); the Wave 7 export block of `grader/src/index.ts` | build each `NotBuilt` view and each planned rule (§3.2), deleting its stub in the same change; rebuild `walking-bass`, `allowed-tensions`, `ii-v-chain` to their content-kit definitions with the pre-flight's counterexamples as known-wrong tests; carry f4; move each rule and field into content-kit `IMPLEMENTED` with golden tests |
| notation | `packages/notation/src/wave7.ts` (+ test), `NotationInput.chordStyle` and its use in `build.ts` (`jazzChordDisplay` in `theory-port.ts`) | slash noteheads and rhythm brackets (`WAVE7_NOTATION_UNBUILT`), whatever the J and R lessons show that the tests do not cover |
| answers | `app/src/answers/types.ts` (`grouping`, `euclid` values), `response.ts` (their cases), `registry.tsx` (`grouping: null`, `euclid: null`) | build the two widgets and the Wave 7 answer features (§11) |
| session | `app/src/map/illustrated/**` (the illustrated Oak, wired in `OakTree.tsx`: `IllustratedOakMap as OakMap`, `releasedTracks` from `useAlbum()`; `data-status` on leaves; an open track unit's caption reads "open" with `data-branch-row`; the focus ring carries `.oak-focus`), `content/oak.layout.ts`, `app/src/map/e2e/illustrated.pw.ts` (the harness at `ILLUSTRATED_URL`), `oak.pw.ts` and `session/seeds/e2e/progress-oak.pw.ts` adapted to the tree's geometry | carry f1 (§4.3) |
| sound | `packages/strudel/src/offline/**`, `packages/strudel/e2e/offline*`, the `./offline` and `./offline/frame` exports, the e2e page's `optimizeDeps.entries` (the offline pages crawled up front) | carry f2 (§5.5) |
| server | `packages/api` Wave 7 block (`dto.ts`: the shared shapes before `SessionPlanSchema`, the optional fields of §5, the block at the end; `contract.ts` `WAVE7_ENDPOINTS`; `wave7.test.ts`); 501 stubs in `server/src/routes/{course,library}.ts`; `routes.test.ts` "Wave 7 endpoints" (`WAVE7_PENDING`) | dev seeds of §6 FIRST; then the four endpoints and the behaviour of §5; remove each name from `WAVE7_PENDING` as it lands; carry f2's headers (§5.5) |
| capstone, kit, lesson, transcribe, workbench, tutor, drills | nothing in their folders but the app seams of §4 (frozen `app/src/lib`) | |

## 2. Carry-overs into Wave 7

Verbatim from the wave plan; the owner in brackets does each in this wave with a regression test (`git diff HEAD
--stat` shows what this wave changed). Contracts were at version 1.7 when the wave began.

```
 (f1) [seams, in Foundation] THE ILLUSTRATED OAK IS BUILT: local branch codex/oak-tree, checked out at /Users/fpl0/Code/Oak-wt/oaktree; new files only: app/src/map/illustrated/** and content/oak.layout.ts; its report with the wiring patch for app/src/map/OakTree.tsx is /private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/codex/oaktree.result.md. Copy the files in with cp from that directory (no git command), apply the wiring patch, make its 29 unit tests green and put its browser spec in the map project. [session, in Build] finishes it: give "newly learned" a real timestamp (SkillState has none; ask the server engineer through the seam Foundation writes), hang acorns for promoted sketches that have no capstone, add anchors for every node the advanced tracks add and re-run the overlap test, then look at it as the learner in both themes at both sizes (first: the rings around mastered leaves and the thick lower limbs) and fix what looks wrong. It must hold 60 fps while panning with every leaf of all 259 sessions.
 (f2) [seams, in Foundation] THE OFFLINE RENDERER IS BUILT: local branch codex/offline-renderer at /Users/fpl0/Code/Oak-wt/renderer; new files only: packages/strudel/src/offline/** and packages/strudel/e2e/offline*; report with every wiring patch at /private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/codex/renderer.result.md. Copy the files in with cp, apply the wiring (package exports, app/offline-render.html and its entry, the Vite multi-page input, the service-worker precache), make its 13 unit tests green and put its spec in the strudel project. The frame needs frame-ancestors 'self' and X-Frame-Options SAMEORIGIN on /offline-render.html ONLY: [content lead] writes that exception into contracts §11.2 in the 1.8 change; [server] serves the headers and proves with a security test that every other document keeps 'none' and DENY. [sound] verifies it on the production build and offline, compares fast-changing orbit effects with the live engine, and deals with the report's open risk that a learner script which never ends cannot be interrupted (same main thread): bound the render by the piece's computed length and refuse with a plain message otherwise. [capstone] adds "Export" on an album track: a WAV download rendered offline. The real-time take stays the release recording (whether a rendered file may replace it is a question for the learner: list it under "Needs you", do not build the replacement).
 (f3) [seams, in Foundation; then every engineer who writes a spec] THE BROWSER SUITE IS OVER ITS BUDGET AND ITS TARGET: three whole runs measured 137–141 minutes of test time against 134 and 26–31 minutes of wall time against the 20-minute target; the surfaces group measures 41.0, 41.8 and 43.5 against 37.3 and the rise is spread over every file (/private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/fix2/gate.md, "Surfaces by file"; /private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/w6/gate.md). Find out why the same files cost more beside other suites (unit placement and concurrency in scripts/e2e-parallel.ts, servers per unit, the build step) by measuring, then cut wall time and test time WITHOUT removing or weakening an assertion; a budget line changes only to a value measured for named files, argued in one line in docs/decisions.md. Report before and after per group. Wave 7 adds 46 lessons and 8 capstones of tests on top: write in wave7.md how many minutes each new area may add and where its specs go, so the whole run still fits.
 (f4) [grader] The corrections gate left 19 wrong answers passing (docs/decisions.md, "Corrections" gate row, and /private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/fix2/gate.md lines marked LEFT): fix those marked low or medium that need no product decision; the two under "Needs you" (U10.L02, U09.L05) and the three judgement calls stay as they are. CF-T session 4 checks that the song's chords are kept but not its melody: add the GradeContext field for the song's melody, have [capstone] fill it, and pin both. A1.L01, A1.L03 and A1.L04 Makes still pass on a bare "uses" rule: give each an effect rule with [author:A1a] informed through apiNotes.
 (f5) [workbench] The FeedbackPanel prints the catalog's general sentence before the step's own; the step's own sentence comes first.
 (f6) [session + server] The Coda's "next" line is taken from the planner's real next session (it is composed in the app today), including when the next session is a track lesson, a checkpoint, a capstone session or a gym slot.
 (f7) [transcribe] app/src/album/e2e/transcribe.pw.ts "the drift at 0.25× and 1×" read one bar at 39 ms beside other suites (gate 20 ms): find the cause at 0.25× (the late-start fix of Wave 6 covers 1×) and fix it in the product, or move the measurement to the quiet units with the evidence. Do not widen the gate.
 (f8) [author:repertoire, with one independent second reader in Review] St. Louis Blues (W. C. Handy, 1914) for AC1: an outside transcription of the first 12-bar strain from the 1914 Pace & Handy edition is at the end of /private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/codex/songs.result.md (G major, 2/4); Wave 6's two transcriptions are described in /private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/w6/build-author-repertoire.md and the Wave 6 review files. Three agreeing readings are the bar for using it: where they agree, write the entry; where they differ, AC1 offers Sweet Georgia Brown only (and says so honestly before U15.L05). The standards the jazz track needs — I Got Rhythm (1930; the original chorus is 34 bars, rhythm changes are 32: pin the form JC3 uses), Georgia on My Mind (1930), Body and Soul (1930), and the public-domain head J4.L04 reads — are written from a source published in 1930 or earlier with its citation, verified: false until a person checks print. Later lyrics and arrangements are not cleared by the year test: melody and original changes only.
 (f9) [content lead, in Foundation] From the pre-flight (/private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/codex/w7plan.result.md), settle BEFORE any reference solution is written: the walking-bass, clave-coverage, simultaneous-polyrhythm, allowed-tensions (it must read the melody) and AC2 top-voice rules; the descriptions of mode("duck") and dict("lefthand") (the dictionary is not uniformly rootless four-note); octave-aware hand-voicing checks for drop-2; J1.L05's payoff (learner-written shells over a supplied backing); slim J1.L02 and J2.L02 and spread twelve-key practice over later lessons; J5.L03, R1.L05, A1.L07 and A2.L03 each carry two ideas — slim each to one idea inside its session budget, or split it into two lessons (a new id at the end of its unit's numbering, placed by the syllabus order; no existing id changes) and record the split in the 1.8 contracts change; canonical timing fixtures (two-bar clave direction, polymeter period, swing amount to ratio, tempo-aware microtiming); A2.L06 uses only tools unlocked on its earliest legal route.
 (f10) [gate] The live tutor smoke was skipped at the Wave 6 gate (decision 69): it runs at this gate, three turns at most.
 Kept as built, by the learner's decision or default (do not change): everything listed under "Confirmed by you" and decisions 67 and 68 in docs/decisions.md; exercise versions are not bumped; songs stay verified: false.
```

Seams Foundation added for them:

| Carry-over | Seam (where) | Notes |
|---|---|---|
| f1 | Built and wired (§4.3); `SkillState.introducedAt` (§5.6) | The server fills `introducedAt`; the session engineer derives `newlyLearned` (introduced in the last 48 h) from it and passes it to `IllustratedOakMap`. Nothing in the app may infer it from `updatedAt`. |
| f2 | Built and wired (§5.5): `@oak/strudel/offline` `renderPiece`, `app/offline-render.html` + `app/src/offline-render.ts`, the Vite multi-page input, `vite preview`'s frame CSP, the SW precache (`shellUrls`); endpoint `album.source`; hook `useAlbumSource` | NOT done in Foundation: the Oak server's headers for `/offline-render.html` (server: `server/src/security.ts`, the patch is in the renderer report; contracts §11.2 states the exception since 1.8). Until the server sends `frame-ancestors 'self'` on that one page, Export works under `vite preview` and the dev server but not on `bun run start`. |
| f3 | The load profile in the runner (`scripts/e2e-load.ts`, the "Units" table and `test-results/e2e-load.json`); §7.2 has the measurements and this wave's allowance | |
| f4 | `GradeContext.songMelody?: readonly SongMelodyNote[]` (`{ onset: Rat; dur: Rat; midi: number }`), threaded into `RubricContext.songMelody` | the grader engineer builds `song-melody-kept` on it and pins CF-T.S4; the capstone engineer fills it from `SongDef.answerKey` |
| f6 | `SessionSummary.next?: NextSession \| null` (§5.7) | the server fills it from the planner; the session engineer's Coda draws it and composes nothing |
| f5, f7, f8, f9, f10 | no new seam | f9's rule definitions are content-kit's `TRACK_CUSTOM_RULES` (§11) |

## 3. Package seams

### 3.1 `@oak/theory` — jazz, rhythm and sound facts (`wave7.ts`, built and tested)

Every fact is computed from the existing tables (the one chord table, `METERS`, `euclid`). Content-kit 6 holds the
lists a lesson author needs (`AVAILABLE_TENSIONS`, `CLAVE_GRIDS`, `SWING_FEELS`, `VOICING_SHAPES`, `METER_GROUPINGS`,
`polymeterPeriodBars`, `lateMs`); `packages/grader/src/analyze/wave7-views.test.ts` checks that theory and
content-kit say the same (swing, microtiming, polymeter, clave grids, every allowed and avoid tension, voicing
shapes). Facts are conventions a lesson teaches as "a common choice", never laws (w7plan B2).

```ts
// --- jazz: symbols (one table, three spellings)
export const JAZZ_TENSION_LABELS: readonly ["6", "9", "11", "13", "sus", "b9", "#9", "#11", "b13", "alt"];
export const JAZZ_QUALITIES: readonly ChordQuality[];      // maj7 m7 7 m7b5 dim7 6 m6 sus4 7sus4 69 maj9 m9 9 m11 13 7b9 7#9 7#11 7b13 7alt maj7#11 mMaj7
export interface JazzSymbol { chord: ChordId; ireal: string /* "Cm7b5" */; leadSheet: string /* "Cm7♭5" */; glyph: string /* "Cø7" */; extensions: JazzTensionLabel[] }
export function jazzSymbol(chord: ChordId | string): JazzSymbol;
// --- jazz: ii–V–I
export const FOURTHS_MAJOR: readonly ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "B", "E", "A", "D", "G"];
export const FOURTHS_MINOR: readonly ["C", "F", "Bb", "Eb", "Ab", "C#", "F#", "B", "E", "A", "D", "G"];
export type CadenceMode = "major" | "minor";
export interface TwoFiveOne { key: KeySpec; mode: CadenceMode; chords: [ChordId, ChordId, ChordId]; symbols: [string, string, string]; rn: [string, string, string] }
export function twoFiveOne(tonic: string, mode?: CadenceMode, opts?: { tonic?: "m7" | "m6" | "mMaj7"; dominant?: "7alt" | "7b9" | "7" }): TwoFiveOne;
  // C: Dm7 G7 C^7 · C minor: Dm7b5 G7alt Cm7 (opts for Cm6, G7b9 — J2.L02 may start from one altered dominant)
export function twoFiveOnesAllKeys(mode?: CadenceMode): TwoFiveOne[];     // the cycle of fourths, spelled in each key
export function twoFiveTarget(ii: ChordId | string, v: ChordId | string): { tonicPc: Pc; mode: CadenceMode } | null;
// --- jazz: chord-scales, tensions, avoid notes
export const CHORD_SCALES: { ionian; dorian; phrygian; lydian; mixolydian; aeolian; locrian; "locrian-nat2"; "melodic-minor"; "lydian-dominant"; altered; "half-whole"; "whole-half"; "phrygian-dominant" };   // semitones above the root
export type ChordScaleId = keyof typeof CHORD_SCALES; export const CHORD_SCALE_NAMES: Readonly<Record<ChordScaleId, string>>;
export function chordScales(chord: ChordId | string, ctx?: { key?: KeySpec; next?: ChordId | string }): ChordScaleId[];
  // first choice then alternatives: Dm7 dorian · G7 mixolydian · C^7 ionian · F^7 in C lydian · Em7 in C phrygian · G7alt altered · G7 → Cm7 phrygian-dominant
export interface Tension { label: string /* "9" "#11" "b13" "6" "7" "3" */; semis: number; pc: Pc; avoid: boolean }
export function tensionsOf(chord: ChordId | string, scale?: ChordScaleId): Tension[];
  // the scale's non-chord tones; avoid = a half step above a chord tone (Ionian/Mixolydian 11; Phrygian ♭9, ♭13),
  // except a dominant's ♭9/♭13 (colours) and a sus chord's 3rd (cancels the suspension)
export function availableTensions(chord: ChordId | string, scale?: ChordScaleId): Tension[];
// --- jazz: voicing types from sounding notes (octave-aware; w7plan B3)
export const VOICING_TYPES: readonly ["guide-tones", "shell", "rootless-a", "rootless-b", "close", "drop-2", "spread", "other"];
export interface VoicingReading { type: VoicingType; roles: string[] /* "1" "3" "b7" "9" … lowest first */; rootless: boolean; span: number }
export function voicingType(midis: readonly number[], chord: ChordId | string): VoicingReading;
export function drop2(close: readonly number[]): number[];                 // C4 E4 G4 B4 → G3 C4 E4 B4
export function rootlessVoicing(chord: ChordId | string, form: "A" | "B", low?: number): number[];   // Dm7 A: F A C E; G7 B: F A B E
export function shellVoicing(chord: ChordId | string, form?: "1-3-7" | "1-7-3", bass?: number): number[];
// --- jazz: forms and reharmonisation
export type ChartBar = string[];
export function turnaround(tonic: string, kind?: "I-vi-ii-V" | "iii-VI-ii-V"): ChartBar[];
export function jazzBlues(tonic?: string): ChartBar[];    // F7 | Bb7 | F7 | Cm7 F7 | Bb7 | Bo7 | F7 | D7 | Gm7 | C7 | F7 D7 | Gm7 C7
export const RHYTHM_CHANGES_BARS: 32; export const I_GOT_RHYTHM_ORIGINAL_BARS: 34;
export function rhythmChanges(tonic?: string): { sections: ["A", "A", "B", "A"]; bars: ChartBar[] };   // bridge D7 D7 G7 G7 C7 C7 F7 F7 in B♭
export const REHARM_DEVICES: readonly ["tritone sub", "backdoor", "secondary ii–V", "diminished passing", "coltrane"];
export function tritoneSub(dominant: ChordId | string): ChordId;          // G7 → Db7 (shares B/C♭ and F)
export function backdoor(tonic: string): [ChordId, ChordId, ChordId];     // Fm7 Bb7 C^7
export function secondaryTwoFive(target: ChordId | string): [ChordId, ChordId];   // F^7: Gm7 C7 · Dm7: Em7b5 A7b9
export function diminishedPassing(from: ChordId | string, to: ChordId | string): ChordId | null;   // C^7 → Dm7: C#o7
export function coltraneCycle(tonic?: string): ChordId[];                 // B^7 D7 G^7 Bb7 Eb^7 F#7 B^7
// --- rhythm
export function metricWeights(meter: MeterId | MeterSpec, steps?: number): number[];   // 4/4 ×16: 4 0 1 0 2 0 1 0 3 0 1 0 2 0 1 0; odd meters by group
export function syncopationScore(onsets: readonly boolean[], meter?: MeterId | MeterSpec): number;   // Longuet-Higgins & Lee
export function swingRatio(amount: number): number;                       // (1+a)/(1−a): 1/3 → 2, .2 → 1.5
export function swingAmount(ratio: number): number;
export function swingOffbeat(amount: number, subdivision: 8 | 16, meter?: MeterId | MeterSpec): number;   // cycles; = Strudel's swingBy
export function displace(onsets: readonly Rat[], by: Rat): Rat[];
export function lateMs(cycles: number, bpm: number, meter?: MeterId | MeterSpec): number;   // .late(1/32) at 76 BPM ≈ 98.7 ms
export function lateFor(ms: number, bpm: number, meter?: MeterId | MeterSpec): number;
export interface MeterGroups { meter: MeterId; groups: number[]; starts: Rat[]; count: string /* "1 2 | 1 2 | 1 2 3" */; tempoUnit }
export function meterGroups(meter: MeterId | MeterSpec): MeterGroups;
export function hemiola(): { sixEight: Rat[]; threeFour: Rat[] };
export function polyrhythm(a: number, b: number): { a: Rat[]; b: Rat[]; grid: number; together: Rat[] };
export function polymeterPeriod(length: number, perBar: number): number;  // {bd ~ ~}%4 → 3 bars (= Strudel)
export const TRESILLO: readonly [0, 3, 6]; export const CINQUILLO: readonly [0, 2, 3, 5, 6];
export function euclidIdentity(onsets: readonly number[], steps: number): { pulses; steps; rotation } | null;   // = Strudel's (k,n,r)
export const CLAVE_TYPES: readonly ["son", "rumba"]; export type ClaveDirection = "3-2" | "2-3";
export function claveSteps(type: ClaveType, direction: ClaveDirection): number[];   // 16-step grid; son 3-2: 0 3 6 10 12
export function claveOf(steps16: readonly number[]): { type: ClaveType; direction: ClaveDirection } | null;
// --- sound
export function waveHarmonic(wave: "sine" | "sawtooth" | "square" | "triangle", n: number): number;
export function harmonicsPassed(note: number, control: "lpf" | "hpf", cutoff: number, max?: number): number[];   // A2 lpf 600 → 1–5
export const REGISTER_ROLES: readonly { role; low; high; text }[];        // sub, bass, low-mid, mid, high (MIDI)
export const LOW_INTERVAL_LIMITS: Readonly<Record<number, number>>;       // bottom note per interval (the arranging convention)
export function belowLowIntervalLimit(a: number, b: number): boolean;
export interface Density { onsetsPerBar: number; polyphony: number; parts: number }
export function densityOf(events: readonly { onset: number; track: string }[], bars: number): Density;
```

Verified with headless Strudel 1.2.6 in `wave7.test.ts`: `x(3,8)`, `x(5,8)` and `x(5,8,1)` land on `TRESILLO`,
`CINQUILLO` and E(5,8) rotated by 1; the R3.L02 snippet reads as son 3-2; `swingBy(1/3, 4)` and `swingBy(.2, 8)` put
the off-beat where `swingOffbeat` says; `.late(1/100)` at the default tempo starts 0.26; `{bd ~ ~}%4` lines up after
three bars; every jazz-blues and rhythm-changes chord sounds in the default dictionary; `dict("lefthand")` on
`Cm7b5` gives E♭ G♭ B♭ C (root present: not a rootless voicing — w7plan A2).

### 3.2 `@oak/grader` — the tracks' views, rules not built yet, the song's melody

`analyze/wave7-views.ts`, exported from the package root. A view not built yet returns `NotBuilt` (`{ notBuilt:
string }`, `isNotBuilt`); a host shows "Not built yet" and nothing else.

```ts
export interface NotBuilt { notBuilt: string }  export function notBuilt(what: string): NotBuilt;  export function isNotBuilt(v: unknown): v is NotBuilt;
type Ctx = NormalizeContext & { bars?: number };
// BUILT (tested on real Strudel output)
export interface TwoFiveView { bar: number; ii: string; v: string; target: string /* "E♭ major" */; targetPc: number; mode: "major" | "minor"; resolved: boolean }
export function twoFiveView(n: Normalized, ctx: Ctx): TwoFiveView[];                                   // ii–V–I detection per key (JC1)
export interface VoicingView { bar: number; at: Rat; chord: string; midis: number[]; reading: VoicingReading; dictionary: boolean }
export function voicingView(n: Normalized, ctx: Ctx & { track: TrackRef; changes?: readonly string[] }): VoicingView[];   // voicing type per chord; `dictionary` for voicing() lines
export interface TensionNoteView { id: string; at: Rat; midi: number; chord: string | null; role: string /* "chord-tone" "9" "#11" "outside" */; avoid: boolean; structural: boolean }
export function tensionView(n: Normalized, ctx: Ctx & { melody?: TrackRef }): TensionNoteView[];       // tensions against the melody (TENSION lens; allowed-tensions)
export interface FeelView { track: string; swingRatio: number | null; medianOffsetMs: number; onsets: number }
export function feelView(n: Normalized, ctx: Ctx & { tracks?: readonly string[] }): FeelView[];         // swing ratio and microtiming (MICROTIMING view)
export interface EuclidBarView { bar: number; steps: number; onsets: number[]; euclid: { pulses; steps; rotation } | null }
export function euclidView(n: Normalized, ctx: Ctx & { track: TrackRef; steps?: 8 | 16 }): EuclidBarView[];   // Euclid identity
export interface ClaveWindowView { bar: number; steps: number[]; clave: { type; direction } | null }
export interface ClaveView { windows: ClaveWindowView[]; first: { type; direction } | null; coveredBars: number }
export function claveView(n: Normalized, ctx: Ctx & { track: TrackRef }): ClaveView;                    // clave type, direction, coverage (CLAVE lens)
export interface RegisterClashView { at: Rat; bar: number; low: number; high: number; interval: number }
export function registerClashView(n: Normalized, ctx: Ctx): RegisterClashView[];                       // register clashes (REGISTER bands)
export interface DensityBarView { bar: number; onsetsPerBar: number; polyphony: number; parts: number }
export function densityView(n: Normalized, ctx: Ctx): DensityBarView[];                                // density (DENSITY strip, per section with sectionsFromAst)
export interface LevelView { track: string; relDb: number; heard: boolean }
export function levelsView(n: Normalized, ctx: Ctx): LevelView[];                                      // levels between parts (−24 dB: not heard)
// TYPED, NOT BUILT (the grader engineer builds each against its content-kit rule)
export function walkingBassView(n, ctx & { bass?; changes? }): WalkingBassBar[] | NotBuilt;   // { bar, quarters, rootOnOne, chordToneOnThree, approach }
export function compingView(n, ctx & { track? }): CompingBar[] | NotBuilt;                    // { bar, onsets, figure: "charleston" | "push" | … }
export function reharmView(n, ctx & { reference: readonly string[] }): ReharmView | NotBuilt; // { melodyKept, devices: { device, bar, was, now }[] }
export function contrafactView(n, ctx & { changes }): ContrafactView | NotBuilt;              // { changesRatio, sharedMelodyRatio }
export function interlockView(n, ctx & { tracks }): InterlockView | NotBuilt;                 // { grid: string[][] per 16th, interlock }
export function groupingView(n, ctx & { track?; groups }): GroupingView | NotBuilt;           // odd meter and grouping
export function hemiolaView(n, ctx & { track? }): ("3+3" | "2+2+2" | null)[] | NotBuilt;
export function polyrhythmView(n, ctx & { a; b }): PolyrhythmBar[] | NotBuilt;               // { bar, a, b, together } — the SAME bars (w7plan A6)
export function polymeterView(n, ctx & { a }): { cycleSteps; periodBars } | NotBuilt;
export function claveAlignmentView(n, ctx & { track; clave? }): { bar; shared }[] | NotBuilt;
export function soundControlView(n, ctx & { track; control }): { control; changes } | NotBuilt;
export function counterMelodyView(n, ctx & { melody; counter }): { independence; doubledBeats } | NotBuilt;
export function sampleChopView(n, ctx & { track? }): { slices; order; reordered } | NotBuilt;
export function idiomView(n, ctx & { a; b }): { sameTune; axes: string[] } | NotBuilt;      // "the same tune in another idiom"
```

**Rules not built yet never pass** (`rubric/wave7-rules.ts`). `evalRule` checks `unbuiltWave6(rule) ??
unbuiltWave7(rule)` before it runs an analyzer: a rule that uses one of these fields fails with `rubric.unknown` and
"not built yet: …". `CUSTOM_RULES` is `{ ...wave7CustomStubs(built), ...BUILT_CUSTOM_RULES }`: every planned custom
rule of content-kit's `TRACK_CUSTOM_RULES` that is not built answers "not built yet: <its doc's first sentence>",
never "no custom rule named". The grader engineer builds each, deletes its stub/entry in the same change, and moves
it into content-kit `IMPLEMENTED` with golden tests (a passing piece per shipped flavour, the pre-flight's
counterexample as a known-wrong test, and a wrong answer that uses the right function).

| Rule field / custom rule | Content-kit | Needed by | Note |
|---|---|---|---|
| `clave` `minBars`, `exact` | feature `clave.coverage` | R3.L02, RC2 | every two-bar window from bar 1 (w7plan A5) |
| `polyrhythm` `minBars`, `span` | `polyrhythm.together` | R2.L04, RC2 | both pulses in the same bars (A6) |
| `voice-leading` `voice: "top"`, `minRatio` | `voice-leading.top` | AC2 | the top voice only, ≥ 80 % of changes (A7) |
| `reharmonize` `devices` | `reharmonize.devices` | J5.L01–L04 | the jazz devices, each against the reference's chord in its bar |
| custom rules (`WAVE7_REBUILD`) `walking-bass`, `allowed-tensions`, `ii-v-chain` | `TRACK_CUSTOM_RULES` | J3.L04, J4.L02, JC2; J2.L03, J5.L04, JC4; J2.L01, JC1 | built with Wave 0 semantics (A3, A4); rebuild to the content-kit definitions |
| custom rules not built: `voicing-shape`, `song-melody-kept`, `contrafact`, `two-versions-differ`, `same-tune-two-ways`, `extended-share`, `microtiming`, `displaced-copy`, `metric-weight`, `grouping-accents`, `regrouped`, `polymeter-cycle`, `clave-aligned`, `stabs`, `chord-scale-fit`, `tensions-used`, `counter-melody`, `slices-reordered`, `level-balance` | `TRACK_CUSTOM_RULES` (params checked by `trackCustomParamIssues`) | see each rule's `usedBy` | stubs until built |
| `euclid`, `clave`, `polyrhythm`, `register-separation`, `no-muddy-low` (whole rules) | `PLANNED.rubricRules` | R3, RC2, A2 | run as since Wave 0; content CI keeps them out of lessons until golden-tested |

**The song's melody (carry f4).** `GradeContext.songMelody?: readonly SongMelodyNote[]` (`{ onset: Rat; dur: Rat;
midi: number }`, bars from the first full bar, a pickup's notes negative) reaches the rubric as
`RubricContext.songMelody`. The capstone host fills it from the picked song's answer key for CF-T.S4, JC4 and AC1;
`song-melody-kept` reads it. Without it, the rule says "not built yet" (stub) or, once built, names the missing song.

### 3.3 `@oak/notation` — what a host passes (`wave7.ts`, built and tested)

```ts
export const CHORD_SYMBOL_STYLES: readonly ["lead-sheet", "jazz"]; export type ChordSymbolStyle;
export function chordSymbolText(code: string, style?: ChordSymbolStyle): string;   // "C^7" → "C∆7"; "Cm7b5" → "Cø7"; "Dm7" → "D–7"
// NotationInput gains: chordStyle?: "lead-sheet" | "jazz"   (the engraver prints every chord in that style)
export function claveLineInput(type: ClaveType, direction: ClaveDirection, opts?: { startBar?: number }): NotationInput;   // a 2-bar percussion staff
export function formSectionMarks(letters: readonly string[], bars: number | readonly number[], startBar?: number): SectionMark[];   // AABA × 8
export function compingInput(events: readonly NEvent[], opts: { track: string; meter?: MeterSpec; bars: number; startBar?: number; chords?: NotationInput["chords"] }): NotationInput;   // rhythm staff, one stroke per attack
export interface RhythmBracket { bar: number; from: Rat; to: Rat; text: string /* "3:2", "3+3 / 2+2+2" */ }
export const WAVE7_NOTATION_UNBUILT: readonly [{ id: "slash-heads" }, { id: "rhythm-brackets" }];
```

**What a host passes.**
- **Jazz chord symbols:** pass `chords` in code spelling and `chordStyle: "jazz"` (from J1.L02 on, where the learner
  turned on `tb.feature.jazz-glyphs`); the default stays lead-sheet. One table, never a local map.
- **Odd meters:** pass the meter with its grouping (`meterWith("7/8", [2, 2, 3])`); the engraver beams and rests by
  the groups. **16th swing:** pass `swing: { subdivision: 16, amount }`; "Swing 16ths" prints over bar 1.
- **The clave line:** `claveLineInput(type, direction)`, beside the learner's staff or as the CLAVE lens's strip.
- **A 32-bar lead sheet:** `leadSheetInput` / `leadSheetPages` (Wave 5) with `sections: formSectionMarks(["A", "A",
  "B", "A"], 8)` and `chordStyle` as the page wants; JC3 and J4.L03–L04.
- **Comping as slashes:** `compingInput(events, { track: "chords", bars, chords })` gives a rhythm staff with the
  symbols above. The notation engineer turns its heads into slashes; until then they print as the rhythm staff's
  ordinary heads (a host must not call them slashes).
- **Hemiola and polyrhythm brackets:** `RhythmBracket` is the shape; not drawn yet — a host shows the lanes
  (`polyLanes` lens) instead.

### 3.4 `@oak/strudel/offline` — the offline renderer (built; carry f2)

```ts
export async function renderPiece(request: RenderPieceRequest): Promise<RenderedPiece>;
export interface RenderPieceRequest { code: string; band?: BandSetup | null; key?: KeySpec | null; mutes?: MuteMap; sampleRate?: number; signal?: AbortSignal; onProgress?: (p: number) => void; frameUrl?: string /* default "/offline-render.html" */; soundsRoot?: string; timeoutMs?: number /* default 60 000 */ }
export interface RenderedPiece extends PiecePcm { wav(): ArrayBuffer; wavBlob(): Blob }   // PiecePcm: left, right, sampleRate, bars, cps, pieceDurationS, durationS, tailS, peak, rms, missingSounds
export class PieceRenderError extends Error { code: RenderErrorCode }                       // "aborted" "timeout" "engine" "silent" "missing-sound" "too-long" …
export { encodeWav };
// "@oak/strudel/offline/frame": installPieceRenderFrame()  — only app/src/offline-render.ts calls it
```

One disposable iframe realm per render (superdough's pools are per context), every sample preloaded, scheduled
incrementally, deterministic (seeded randomness, explicit mixing), the tail trimmed below −60 dBFS. Measured in
Foundation through Playwright (the strudel page, `offline.pw.ts`, 7 tests, 34.6 s alone): the real 96-s C3 exports
in 3.7 s and its first four bars sit within 0.33 dB of the live editor; an abort stops within 0.6 ms; a render beside
a playing editor leaves it sample-identical. Open (sound, Build): the production build and offline; fast-changing
orbit effects against the live engine; a script that never ends cannot be interrupted on the same main thread —
bound the render by the piece's computed length and refuse with a plain message.

## 4. App seams (`app/src/lib`, frozen after Foundation)

### 4.1 Query hooks (`queries.ts`)

```ts
export const useTrackFocus: () => UseQueryResult<TrackFocus>;                         // GET /tracks/focus
export const useSetTrackFocus: () => mutation<"tracks.setFocus">;                     // → tracks.focus, tracks.list, session.today, lessons.progress
export const useWholeCourse: () => UseQueryResult<WholeCourse>;                       // GET /course/whole
export const useAlbumSource: (trackId: string | null, version: number | null) => UseQueryResult<AlbumSource>;   // enabled when both are set
// changed invalidations: session.end → + course.whole
// no new hook: SessionPlan.trackOffers / track / focus / course (useSessionToday), SessionSummary.next / courseComplete
// (the session summary), TrackState.nextSession / focus / checkpoints / capstones (useTracks), CapstoneGate.tunes
// (useCapstoneGate), Album.sides (useAlbum), SkillState.introducedAt (useSkillMap)
```

Until the server builds an endpoint it answers 501 (`OakApiError.code === "not_implemented"`, never retried);
`ErrorState` reads "Not built yet". Code against the types now.

### 4.2 Lenses (`lenses.ts`): the tracks' eight lenses

```ts
export const TRACK_LENS_IDS: readonly ["tensions", "voicings", "chordScales", "clave", "polyLanes", "microtiming", "registers", "density"];   // @oak/api
export const TRACK_LENS_GATES: Readonly<Record<TrackLensId, { tools: readonly UnlockableId[]; lesson: string }>>;
  // tensions chord.ext | J2.L03 · voicings tb.voicing.n | J1.L05 · chordScales scale.locrian, scale.altered | J2.L04 · clave — | R3.L02
  // polyLanes tb.mini.polymeter | R2.L04 · microtiming — | R1.L05 · registers tb.fscope | A2.L01 · density — | A2.L02
export const TRACK_LENS_LABELS: { tensions: "Tensions"; voicings: "Voicings"; chordScales: "Chord-scales"; clave: "Clave"; polyLanes: "Pulse lanes"; microtiming: "Microtiming"; registers: "Registers"; density: "Density" };
export type TrackLensPrefs = Record<TrackLensId, boolean>;
export function trackLensPrefs(prefs: LensPrefs): TrackLensPrefs;                                          // absent = on
export function trackLensAvailability(unlocked: ReadonlySet<string>, completed: ReadonlySet<string>): TrackLensPrefs;   // a tool OR the lesson
export function effectiveTrackLenses(prefs: LensPrefs, unlocked: ReadonlySet<string>, completed: ReadonlySet<string>): TrackLensPrefs;
export interface TrackLenses { prefs; shown; available: TrackLensPrefs; set(id: TrackLensId, on: boolean): void; toggle(id: TrackLensId): void }
// Lenses gains:  track: TrackLenses   (same store, same queued save and rollback; `completed` from useCourseProgress)
```

- Stored as eight more optional booleans of `LensPrefsSchema` (absent = on), saved through the same queue.
- **A lens opens with its lesson or its tool** (the lesson completed, or a tool it unlocks; inside the lesson that
  teaches it the host adds that lesson's id, as for `harmonyDepth`). Clave, microtiming and density have no tool of
  their own: they open when R3.L02, R1.L05 and A2.L02 are completed. (Requested from the content lead for 1.9 if
  wanted: `tb.lens.clave`, `tb.lens.microtiming`, `tb.lens.density` rows; then only `TRACK_LENS_GATES` changes.)
- **What each draws** (all from the grader views of §3.2; a lens draws nothing for a piece with nothing to show):
  - **Tensions** (workbench roll and staff, lesson hosts): each melody note's role against its chord
    (`tensionView`: "9", "#11", "13", chord tone), avoid notes marked when they are structural (held or on a beat).
  - **Voicings** (workbench chord band, answers keyboard): the type of each hand voicing (`voicingView`); a
    `voicing()` line says "dictionary voicing" instead of a type.
  - **Chord-scales** (workbench chord band): the first choice of `chordScales(chord, { key, next })` by name.
  - **Clave** (workbench roll, drills-ui): the two-bar grid with the clave's strokes (`claveView`,
    `claveLineInput`), the direction named; only when a clave is found.
  - **Pulse lanes** (workbench roll): one lane per pulse for a polyrhythm (two tracks dividing the same span) and a
    lane per cycle for a polymeter, with the bar where they line up again (`polymeterPeriod`).
  - **Microtiming** (workbench roll, transcribe): how far each onset sits from the 16th grid in milliseconds at the
    piece's tempo (`feelView`, `lateMs`), ahead or behind.
  - **Registers** (workbench spectrum panel): `REGISTER_ROLES` bands, and the clashes under the low-interval limits
    (`registerClashView`).
  - **Density** (workbench section ribbon): `densityView` grouped per section (`sectionsFromAst`).
- Keys: at Foundation only three Shift+letter keys are free (checked against `app/src/ui/keys`,
  `workbench/shortcuts.ts` and `panels.ts`: every other letter is taken): proposed `Shift+X` tensions, `Shift+Q`
  chord-scales, `Shift+D` density. The other five lenses are switched from the lens menu and the command palette
  (Cmd/Ctrl+K), which list every lens with its state. The kit owner registers them and the shortcut sheet.
- Who wins: as wave3.md §4.3 — inside a lesson step the content decides; elsewhere the lenses decide.

### 4.3 The illustrated Oak (carry f1; built and wired, the session engineer finishes it)

`app/src/map/OakTree.tsx` renders `IllustratedOakMap` (from `app/src/map/illustrated/index.ts`) in place of the old
canvas, with the same props plus `releasedTracks` (from `useAlbum()`): acorns hang where a released capstone's unit
grows. Built in Foundation: `data-status` on every leaf (as the old canvas had), the `.oak-focus` ring child (the
review suite's convention for SVG focus), an open track unit's caption reads "open" (`data-branch-row`, never a
count of what is missing). Tests: `app/src/map/illustrated/*.test.ts` (29: layout, overlap, determinism, navigation,
visual, interaction) and `app/src/map/e2e/illustrated.pw.ts` (6, on the harness page the map project starts at
`ILLUSTRATED_URL`, shifted 5247: Paper and Bark at both sizes, keyboard over all 143 leaves, the unfurl once and never
under reduced motion, 180 leaves panned at ≥ 55 fps / p95 ≤ 20 ms); `oak.pw.ts` checks arrows against the drawn
geometry (`treeNeighbour` over the leaves' centres).

The session engineer, in Build: `newlyLearned` from `SkillState.introducedAt` (48 h); acorns for promoted sketches
without a capstone; anchors in `content/oak.layout.ts` for every node the tracks add, and the overlap test re-run;
the learner's look in both themes at both sizes (first the rings around mastered leaves and the thick lower limbs);
60 fps while panning with every leaf of all 259 sessions (raise the stress fixture to the real count).

### 4.4 What a host passes: one page per view

| View (owner) | Reads | Gate |
|---|---|---|
| Jazz chord symbols on staff and chord band (notation hosts, workbench) | `chordSymbolText(code, "jazz")`; `NotationInput.chordStyle` | `tb.feature.jazz-glyphs` |
| Tension marks (workbench, lesson) | `tensionView(n, { meter, melody })` | `lenses.track.shown.tensions` |
| Voicing labels (workbench chord band; answers keyboard `expect.voicing`) | `voicingView(n, { track, changes })`; `voicingType` | `lenses.track.shown.voicings` |
| Chord-scale names (workbench) | `chordScales(chord, { key, next })`, `CHORD_SCALE_NAMES` | `lenses.track.shown.chordScales` |
| Clave strip (workbench, drills-ui) | `claveView(n, { track })`, `claveLineInput` | `lenses.track.shown.clave` |
| Pulse lanes (workbench roll) | `polyrhythm(a, b)`, `polymeterPeriod`, (later) `polyrhythmView` | `lenses.track.shown.polyLanes` |
| Microtiming (workbench roll, transcribe) | `feelView(n, { meter })` | `lenses.track.shown.microtiming` |
| Register bands (workbench spectrum) | `REGISTER_ROLES`, `registerClashView` | `lenses.track.shown.registers` |
| Density strip (workbench ribbon) | `densityView` + `sectionsFromAst` | `lenses.track.shown.density` |
| JC1–AC2 checklists and hints (capstone) | the views beside the rubric rows; `CapstoneGate.tunes` for AC1 | — |
| Export button (capstone, album) | `useAlbumSource(trackId, version)` → `renderPiece({ code, band, key, mutes })` → `wavBlob()`, named `fileName + ".wav"` | — |
| Today's track offers, the focus switch (session) | `SessionPlan.trackOffers`, `focus`; `useTrackFocus`, `useSetTrackFocus` | — |
| The Coda's next line (session) | `SessionSummary.next` | — |
| The whole course (session, progress, album) | `useWholeCourse()`, `SessionSummary.courseComplete`, `Album.sides` | — |

## 5. API additions (`packages/api`, additive)

Every new endpoint is a contract entry with a zod DTO (`WAVE7_ENDPOINTS`); all four are built (`WAVE7_PENDING` in
`server/src/routes/routes.test.ts` is empty: no typed 501 is left for a Wave 7 endpoint, and no `notImplemented` is
mounted anywhere). Every Wave 6 body still parses (`packages/api/src/wave7.test.ts`). State at integrate:server
(2026-11-15):

| Name | Method · path (under `/api`) | Body / query | Response | Route file | Status | Needed by |
|---|---|---|---|---|---|---|
| `tracks.focus` | GET `/tracks/focus` | | `TrackFocusSchema` `{ focus: "core" \| "J" \| "R" \| "A", chosenAt }` (never chosen: `core`, `chosenAt: null`) | course.ts | built (`TrackPlanService.focus`) | session (Today), map, progress, kit (TrackCommands) |
| `tracks.setFocus` | PUT `/tracks/focus` | `{ focus }` | `TrackFocusSchema`; idempotent (the same focus keeps its `chosenAt`) | course.ts | built | session |
| `course.whole` | GET `/course/whole` | | `WholeCourseSchema` (§5.8) | course.ts | built (`TracksService.whole`) | session (the last Coda, Today after), progress, album |
| `album.source` | GET `/album/tracks/:id/versions/:v/source` | | `AlbumSourceSchema` `{ trackId, version, title, code, band, key, mutes, fileName }`; `band` is the stored Band state `{ bandId, flavour, mutes }` (the app builds the `BandSetup`) | library.ts | built (`LibraryService.albumSource`) | capstone, album (Export) |
| `/offline-render.html` (document, not API) | GET | | the frame page with `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`; every other document keeps `'none'` and `DENY`; 404 (never the SPA document) when the build has no frame page | security.ts, static.ts | built (carry f2; `security.test.ts`) | capstone, album (Export) |

Changed shapes (all additive):

| Schema | Change | Owner of the behaviour |
|---|---|---|
| `SkillStateSchema` | `introducedAt?: Instant \| null` | server (f1): built, from the append-only evidence and lesson completion, stable through backup |
| `TrackStateSchema` | `nextSession?: { kind: "lesson" \| "checkpoint" \| "capstone", mapItemId, title, estMinutes } \| null`; `focus?: boolean`; `checkpoints?: { cpId, status }[]`; `capstones?: { capstoneId, status, lockedReason }[]` | server: built |
| `SessionPlanSchema` | `track?: { trackId, sessionIndex, sessionsTotal } \| null`; `trackOffers?: TrackOffer[]`; `focus?: TrackFocusId`; `course?: "in-progress" \| "complete"` | server (planner): built, on every plan; session draws |
| `SessionSummarySchema` | `next?: NextSession \| null` (f6); `courseComplete?: WholeCourse \| null` | server fills (every summary; `null` only when the whole course is complete and nothing is due), session draws |
| `CourseProgressSchema` | `course?: "in-progress" \| "complete"`; `mapTotal` counts 259 once a track lesson is authored | server: built |
| `CapstoneGateSchema` | `tunes?: { songId, title, open, reason }[]` (AC1) | server: built (a tune without an answer key is not listed) |
| `AlbumSchema` | `sides?: { side: "A" \| "B", title, released, total }[]` | server: built |
| `CapstoneSessionsSchema` / `CapstoneDraftSaveSchema` | `versions` (AC1's latest draft per version) / `versionId?` (inferred from the session when absent) | server: built |
| `AttemptResponseSchema` | `{ lanes: number[][] }` (2–4 lanes; `tap.lanes`, R2.L04 and R.CP's polyrhythm items): accepted by `steps.attempt` and `checkpoints.attempt`; refused by `grade` like taps ("graded in the browser") | server: built at integrate:server |
| `GymSessionCreateSchema` / `GymSessionSchema` | `source?: string \| null` (`own:<id>`, `song:<id>`, `analysis:<id>`, `jazz:<form>:<tonic>`, `rhythm:<item>`; `GymSourceSchema`), stored (migration 0009) and listed in `GET /gym` history, kept through backup → import | server: built at integrate:server; transcribe may move its two-week log onto it |
| `LensPrefsSchema` | `tensions? voicings? chordScales? clave? polyLanes? microtiming? registers? density?: boolean` (absent = on); `TRACK_LENS_IDS` | works |
| new shared shapes | `NextSessionSchema` `{ kind, mapItemId, title, goal, estMinutes, trackId, slot, day: "today" \| "tomorrow" \| "later" }`; `TrackOfferSchema` `{ trackId, title, next: NextSession, sessionsDone, sessionsTotal, note }`; `TrackFocus*`; `WholeCourseSchema`; `AlbumSourceSchema`; `GymSourceSchema` | — |
| constants | `COURSE_SESSIONS` `{ core: 185, J: 34, R: 20, A: 20, total: 259 }`; `TRACK_CHECKPOINTS`; `TRACK_CAPSTONE_GATES`; `CAPSTONE_SESSION_SOUNDS`; `ALBUM_SIDES`; `TRACK_FOCUS`; `COURSE_STAGES`; `WAVE7_SEED_POINTS`; `WAVE7_ENDPOINTS` | — |

Dev seeds beyond §6's table: `after <track session>` (`after J2.L02`, `after JC1.S1`, `after R.CP`, `after A2.L03`) walks
the core complete, then J, R and A in that order up to and including the session, the focus on its track. A track
capstone a point releases is the brief's own passing piece where its content pins one (JC1, JC2, JC4 on Georgia on My
Mind, RC1, RC2, AC2), and every release passes its brief's required lines with the real grader
(`server/src/wave7-seed-releases.test.ts`) except JC3's `original`, which cannot run until I Got Rhythm has an answer
key. The tutor's review of a track capstone reads the Wave 7 views its rubric names (`tutor-adapters/review-facts-w7.ts`;
AC1 both versions and `versionsCompared`), proved for all eight on the fake backend (`server/src/wave7-reviews.test.ts`).

### 5.1 Track lessons as sessions

- A track lesson, track checkpoint or track capstone session is started like a core one: `session.start { kind:
  "lesson" | "checkpoint" | "capstone", mapItemId: "J1.L03" | "J.CP1" | "JC1.S1" }` (d7 still refuses a kind that
  does not fit). It counts 1 in its track, a streak day and 1 in the pace estimate; it never advances the core map
  (contracts §9.6).
- **Order inside a track is fixed** (contracts §7.6 rule 5): a track lesson opens when its gate (`TRACK_GATES`) is met
  and the previous lesson of its track is completed. **J2.L04 is the one lesson that can be passed over**: while U14.CP
  is unpassed the track goes on to J.CP1 and J3, and J2.L04 is offered as soon as U14.CP is passed.
- The planner reports what the learner may start in each track as `TrackState.nextSession` (a lesson, the track
  checkpoint when due, or a capstone session) and, on Today, as `SessionPlan.trackOffers`.

### 5.2 The learner's choice between tracks (contracts §2.6)

- **Order between tracks is the learner's**, recorded as one setting: `focus` ∈ `core | J | R | A`
  (`tracks.setFocus`, idempotent; `chosenAt`). Never chosen = `core`.
- **While the core is unfinished the core stays the default**: with focus `core` the New block is the core's next
  item and each open track with something to start is a `trackOffer` (and an `alternative`) beside it. With focus on
  a track, that track's next session is the New block (`SessionPlan.track` set) and the core's next item becomes the
  first alternative. **A due core checkpoint stays the New block whatever the focus** (checkpoints are scheduled,
  §7.6), and so does a capstone session already under way that day. A focus on a track with nothing to start falls
  back to `core` for that day and `SessionPlan.note` says so in one line.
- **After the core** (`core: "complete"`) the default focus still means "no track forced": Today offers each open
  track (`trackOffers`) beside reviews, the gym and Studio, as Wave 6 did; once the learner picks a track (an offer
  or the switch) the focus records it. Nothing counts down; no track reads as required.
- Track checkpoints follow the core's rule: placed after any one intervening session (contracts §7.6), scheduled as
  the New block when due only while that track has the focus; otherwise offered.

### 5.3 Gates: §4.3, AC2's three-way gate, track checkpoints that gate only track capstones

- **Lesson gates** stay `TRACK_GATES` (Wave 6, recorded the moment they are met). **Capstone gates** are
  `TRACK_CAPSTONE_GATES`: JC1 ← J.CP1; JC2 ← J4.L04 completed; JC3, JC4 ← J.CP2; RC1, RC2 ← R.CP; AC1 ← A.CP + U11.CP;
  **AC2 ← A.CP + J3.L04 + R1.L05** (three conditions in `capstones.gate`, each with its own label: the learner sees which
  of the three is missing). A checkpoint requirement is met by a pass or a soft pass.
- **AC1's tunes** (`CapstoneGate.tunes`): St. Louis Blues opens with the capstone (once its answer key exists — carry
  f8), Sweet Georgia Brown once U15.L05 is completed; a tune without a reviewed answer key is not listed. If only
  Sweet Georgia Brown exists and U15.L05 is not done, AC1 says so honestly ("Opens after U15.L05").
- **Track checkpoints** (`TRACK_CHECKPOINTS`): J.CP1 over J1 and J2.L01–L03 (opens when J2.L03 is completed; never
  waits for U14.CP), J.CP2 over J2.L04, J3, J4 and J5.L01–L04 (J5.L05 is enrichment, in no checkpoint), R.CP over
  R1–R3, A.CP over A1–A2. **They gate only their track's capstones** (§7.6 rule 5): a failed or unattempted J.CP1
  holds back JC1 and nothing else; the next track lesson opens regardless.
- A track capstone never gates a lesson (§7.6 rule 4).

### 5.4 Track capstones and sounds that unlock at a capstone session

- JC1–AC2 run over 2 or 3 sessions as core capstones do (`capstones.sessions`, `completeSession`, the session whose
  content says `release: true` releases). Their rubrics are content; the rules they need that are not built yet are
  §3.2's table.
- **Sounds at a session's start** (`CAPSTONE_SESSION_SOUNDS`; contracts §3.2 rule 11): `snd.horns` at RC1.S2 unless
  U15.L05 already granted it; `snd.choir` at AC2.S1. Granted when the session STARTS (as `snd.ebass` at C1.S1), reported
  in that session's `SessionSummary.unlocks` and shown by the capstone's start screen; a learner who puts RC1 off is
  never granted horns by it.
- One real-time take per capstone whose brief requires one, in the journey; every other spec uses `seedTake` (d9).

### 5.5 The album beyond twelve tracks, and Export (carry f2)

- **Side B** holds the eight track capstones (`ALBUM_SIDES`; `AlbumTrack.side: "B"`, numbered 1–8 in release order);
  Side A stays the core's twelve. `Album.sides` reports released and total per side; B-sides (promoted sketches) are
  unchanged. The album page shows Side B once its first track is released; the zip export includes it.
- **Export** renders a released version offline and offers a WAV download: `album.source` gives exactly what the
  version plays (its sketch version's code, the Band and key at release, the mutes) and a safe `fileName`; the app
  calls `renderPiece` and saves `wavBlob()`. Nothing is stored on the server; **the real-time take stays the release
  recording** (whether a rendered file may replace it is under "Needs you"). A render that fails says why in plain
  words (`PieceRenderError.code`), never a partial file.
- **The frame's headers:** `/offline-render.html` is the only document that may be framed, and only by Oak:
  `Content-Security-Policy: … frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` on it, `'none'` and `DENY`
  on every other document. Built in Foundation for `vite preview` (`app/vite.config.ts`, `OFFLINE_FRAME_PATH`,
  `FRAME_CSP`); the server engineer builds it in `server/src/security.ts` with a security test over every HTML route;
  contracts §11.2 states the exception (1.8). The service worker precaches the frame page
  (`shellUrls`), so Export works with the server unreachable once the app has been opened.

### 5.6 A "learned at" timestamp per skill (carry f1)

`SkillState.introducedAt`: the instant the skill was first introduced to this learner — the first evidence from its
introducing lesson, or that lesson's completion when the server backfills a learner already past it — set once and
never moved. `null` while not introduced. The illustrated Oak marks a leaf newly learned for 48 hours after it.

### 5.7 The Coda's real next session (carry f6)

`SessionSummary.next` is what the planner will put in the New block on the next learner day given everything the
session just changed: a core or track lesson (`trackId` set for a track), a checkpoint, a capstone session (CF-T
included), a gym slot (`slot: "gym" | "cf-t" | "x"`), or a reviews-only / Studio day (`mapItemId: null`). `goal` is the
content's objective for it. The session engineer's Coda draws its "next" line from it and composes nothing; with
`next: null` (the whole course complete and nothing due) the Coda shows no next line.

### 5.8 The whole course complete (session 259)

- `course.whole` reports `WholeCourseSchema` at any time: `stage` `in-progress` until every lesson and checkpoint of
  the core and the three tracks is done (passed or soft-passed; J5.L05 included as a lesson) and all twenty capstones
  are released, then `complete`; `sessionsDone` of `sessionsTotal` 259; `core`; the tracks; the album (released of 20);
  the learner's own numbers; what they can now do; what stays open (the gym — L8 on other standards, own audio —
  Studio, reviews, lesson replays).
- **The moment**: the summary of the session that completed the whole course carries `courseComplete` (once,
  idempotent under retries and backup → import, as the core's was); the Coda shows it instead of a next line.
  `SessionPlan.course` and `CourseProgress.course` carry the stage.
- **After it** the planner offers due reviews with the every-5th-session gym slot (d19), else a keep-alive or Studio
  day; nothing reads as "you are done here".

## 6. Dev seeds (`POST /api/dev/seed { point }`) — the server engineer builds these FIRST

As before: every point gives a learner with a working mic and a calibrated range (`mic: false`: Quiet mode), last
activity yesterday, today a fresh day; every seeded release has a recording (`recordings: false`: none). Each walks
the default order of contracts §2.5 through the core (185 sessions; the `core complete` point of Wave 6) and then the
tracks in the order J, R, A unless the row says otherwise; until a lesson it walks through is authored the point
answers 400 naming it. `GET /api/dev/seed` lists what exists; snapshots apply. The names are `WAVE7_SEED_POINTS`.

| Point | Must contain (done, the last yesterday) | Today |
|---|---|---|
| `core complete, tracks untouched` | Wave 6's `core complete` (session 185; J, R open; A1.L01–L04 not done) with focus `core` never chosen | a review day; `trackOffers` J1.L01, R1.L01, A1.L05 (A1.L01 if the side lessons are not done) |
| `J1.L03 next` | `core complete, tracks untouched` + J1.L01–L02 (`tb.feature.jazz-glyphs`, `chord.sixth-sus`), focus J | J1.L03 as the New block, `track` J 3/34 |
| `J.CP1 due` | J1.L03–L05, J2.L01–L03 (`chord.alt`, `chord.ext`), one session after J2.L03 | New block J.CP1 |
| `JC1 open` | J.CP1 passed | JC1.S1 |
| `JC1 released` | JC1.S1–S2, released (16 bars over ii–Vs into C, E♭ and A minor with a guide-tone melody) | J2.L04 (U14.CP passed in the core) |
| `J2.L04 locked (U14.CP not passed)` | a learner who took the jazz track after U13.CP and before U14.CP: U13.CP passed, J1.L01–L05, J2.L01–L03 done, U14.CP NOT passed | J.CP1 (J2.L04 passed over: `trackOffers` never lists it; `TrackState` names it waiting for U14.CP) |
| `J3.L02 next` | J2.L04, J3.L01 (`tb.mode.duck`, `tb.offset`) | J3.L02 |
| `J4.L03 next` | J3.L02–L04, J4.L01–L02 (`snd.mutetpt`) | J4.L03 |
| `JC2 open` | J4.L03–L04 | JC2.S1 |
| `J.CP2 due` | J5.L01–L04 (J5.L05 not done), one session after J5.L04 | New block J.CP2 |
| `JC3 open` | J.CP2 passed (JC1, JC2 released) | JC3.S1; JC4 open too |
| `JC4 open` | `JC3 open` + JC3 released | JC4.S1 |
| `JC4.S2 done` | JC4.S1–S2 completed on Georgia on My Mind: the analysis check passed, a draft with the melody untouched and three devices | JC4.S3 |
| `R1.L03 next` | `core complete, tracks untouched` + R1.L01–L02 (`tb.swing.patterned`), focus R | R1.L03 |
| `R2.L04 next` | R1.L03–L05 (`snd.clav`), R2.L01–L03 (`tb.meter.odd`) | R2.L04 |
| `R3.L02 next` | R2.L04–L05 (`tb.mini.polymeter`), R3.L01 (`tb.mini.euclid`) | R3.L02 |
| `R.CP due` | R3.L02–L05, one session after R3.L05 | New block R.CP |
| `RC1 open` | R.CP passed; `snd.horns` NOT granted by the core (a profile that skipped nothing has it from U15.L05: this point removes it so RC1.S2's grant is visible) | RC1.S1 |
| `RC2 open` | RC1 released | RC2.S1 |
| `A1.L05 next` | `core complete, tracks untouched` + A1.L01–L04 done, focus A | A1.L05 |
| `A2.L04 next` | A1.L05–L07 (`tb.crush`, `tb.vib`, `tb.fm`, …), A2.L01–L03 (`tb.fscope`) | A2.L04 |
| `A.CP due` | A2.L04 (`snd.brk`, `tb.chop`) – A2.L06, one session after A2.L06 | New block A.CP |
| `AC1 open` | A.CP passed (U11.CP passed in the core; U15.L05 done, so both tunes open) | AC1.S1 |
| `AC1.S2 done` | AC1.S1–S2 completed: version one and version two saved (`capstone.versions`) | AC1.S3 |
| `AC2 open` | AC1 released; J3.L04 and R1.L05 done (the three-way gate met); `snd.choir` not yet granted | AC2.S1 (choir granted at its start) |
| `two tracks in progress` | `core complete, tracks untouched` + J1.L01–L03 and R1.L01–L02, focus J | J1.L04; `trackOffers` J first, then R1.L03, then A |
| `whole course complete` | all 259 sessions (the default order, then J, R, A, all twenty capstones released); yesterday's summary carries `courseComplete` | a review day: `plan.course: "complete"`; `course.whole.stage: "complete"` |

## 7. Ports, environment, browser suites

Environment variables are unchanged (`OAK_PORT`, `OAK_DEV`, `OAK_VITE_PORT`, `OAK_API_PORT`, `OAK_DATA_DIR`,
`OAK_TUTOR_FAKE`, `OAK_NOW`, `OAK_SEED_CACHE`, `OAK_E2E_SHIFT`, `OAK_E2E_BUNDLE`, `OAK_E2E_PREBUILT`). New output:
`test-results/e2e-load<suffix>.json` (the runner's load profile).

| Owner | Primary stack (Vite / API) | A second stack, if needed |
|---|---|---|
| notation | Vite page 5194 (no API) | — |
| answers | 5202 / 8802 | 5232 / 8832 |
| workbench | 5206 / 8806 (configs `studio`, `toolbox`, `workbench` page 5193) | 5236 / 8836 |
| transcribe | 5213 / 8813 | 5243 / 8843 |
| audio | 5209 / 8809 (`onboarding`, `voice`, `packages/audio/e2e` page 5191) | 5239 / 8839 |
| drills-ui | 5203 / 8803 | 5233 / 8833 |
| lesson | 5201 / 8801 | 5231 / 8831 |
| session | 5205 / 8805 (`session-seeds`, `map` 5207 / 8807 + the illustrated harness 5247) | 5235 / 8835 |
| capstone | 5210 / 8810 | 5240 / 8840 |
| tutor | 5208 / 8808 | 5238 / 8838 |
| kit | 5214 / 8814 (`ui-review` 5222 / 8822) | 5244 / 8844 |
| server | API 8811 (bun tests only) | — |
| sound | Vite page 5192 (the offline pages `offline-test.html`, `offline-render.html` on it) | — |
| (integrators, reviewers) | the runner on their own shift, never 0: integrate packages 600, server 1200, content 1800, lesson 600, practice 1200, surfaces 2400; review journey 600, surfaces 1200, studio 1800, robustness 2400, teaching-jazz 3000, learner 3600 (review teaching-rest and security: bun tests and content:check only) | a long project's shards take shift + 100, + 200 … |
| (closer, gate) | shift 0: journey 5212 / 8812 (+ 8792), review 5221 / 8821, platform 5173 / 8787 / 8790 | — |

- Each config's `dataDirName` is unique; a new config takes a new name and, in a new folder, the owner's second pair.
  The root `playwright.config.ts` discovers every `app/src/**/e2e/playwright.config.ts`, `e2e/*/playwright.config.ts`
  and `packages/*/e2e/playwright.config.ts` that exports `area` (do not edit it). Configs build on
  `e2e/support/stack.ts` (frozen).
- **Build-phase engineers and authors** run their own specs directly (`bunx playwright test -c <your config> --trace
  off`) and never start the runner. **Integrators and reviewers** use the runner on their own shift. Only the closer
  and the gate run the whole `bun run e2e`, once each, alone, on shift 0.
- The gate journeys for Wave 7 (gate owner): the choice between tracks (Today with two tracks open, the focus
  switch), a jazz day (J1.L03 by ear, J1.L05 shells with the voicing lens), J.CP1 and JC1 over two days with its
  release, a rhythm day (R1.L03 with microtiming, R3.L02 with the clave lens), RC1.S2 with horns granted at its
  start, a sound day (A2.L01 with register bands, A2.L04 sampling), AC2 with choir, the album's Side B and one
  Export, the Coda of session 259 and the day after, and a track day in Quiet mode.

### 7.1 Browser tests: the runner, the budget, the rules

`wave6.md` §7.1 (copied from `wave5.md` §7.1) stays BINDING for every `*.pw.ts` added or edited in this wave, word
for word: what belongs in a browser test and what in a bun test; one item heard through per widget kind per spec
file, everything else asserts it plays and moves; real-time takes, drift and pitch gates once per thing they prove;
every spec from a dev seed (a seed never already holds what the test produces); one page per state; no test over
60 s unless it measures real time; specs reach the app through `__oak*` hooks and the UI, never `import("/src/…")`;
block Vite's HMR websocket; quiet files only with evidence; never loosen a gate. **You may NOT raise a budget**: if
your area honestly needs more minutes than §7.3 allows, say how many and why under `apiNotes`; the gate decides.

New in this wave: the runner prints, for every unit, its wall minutes, its test minutes, and **what ran beside it**
(mean units running and mean share of all cores busy, sampled every 5 s; `scripts/e2e-load.ts`), and writes the
samples to `test-results/e2e-load.json`. Read it before you blame a file for being slow.

### 7.2 Why the same files cost more beside other suites (carry f3, measured in Foundation)

Two whole runs of `bun run e2e` on shift 0 on the Foundation tree (1,117 tests listed; 2026-11-14), the same
code, the machine's desktop as it was (a music app's renderer used 1.3 cores and a file-provider service 0.8 the
whole time; the content lead was working beside it), with the runner's new load profile:

| | A: 8 jobs (the old default) | B: 6 jobs | Wave 6 gate (8 jobs) |
|---|---|---|---|
| loud pool: share of all 12 cores busy, mean 1-min load | **89 %**, 16.8 | **82 %**, 15.2 | — |
| loud pool wall (from the first loud unit to the last) | 21.6 min | 21.7 min | — |
| test time, total (budget 134) | **163.4** | **135.0** | 141.2 |
| lesson (30.5) · journey (16.7) · review (11.5) | 35.7 · 21.1 · 14.6 | 31.5 · 18.1 · 10.5 | 32.1 · 16.8 · 11.2 |
| days (21.7) · surfaces (37.3) · strudel (6.8) | 27.7 · 46.5 · 7.6 | 22.0 · 37.1 · 7.2 | 21.2 · 43.5 · 7.1 |
| audio · voice · transcribe · workbench | 2.3 · 2.4 · 4.1 · 1.5 | 2.3 · 2.4 · 2.7 · 1.2 | 2.3 · 2.6 · 3.1 · 1.3 |
| quiet phase (1–2 units, 26–45 % busy) | 6.6 min | 6.6 min | — |
| whole run wall (incl. build 0.6 min and the alone re-runs) | 36.8 min | 30.8 min | 31.1 min |

**Why the same files cost more beside other suites:** the machine runs out of cores, not out of anything else. A
loud unit alone uses about 0.55 cores (sampled with `ps` over a lesson unit: Chromium 0.43, `vite preview` and the
Playwright runner 0.08, the Oak server 0.01); beside seven others the pool used ~10.7 cores for 8 units — every
process waiting its turn on a machine with 8 performance cores, 4 slow efficiency cores and 2–3 cores taken by the
desktop. At 8 jobs every file ran about a fifth slower than at 6 (surfaces 46.5 against 37.1, spread over every
file, as the corrections gate saw) and the pool finished in the same 21.7 minutes: the extra two processes bought
nothing. The quiet phase (6.6 minutes with 10 cores idle) and the build (0.6) are the rest of the wall time; the
alone re-runs add their own minutes when anything fails.

**Changed in Foundation, no assertion touched:** `autoJobs` takes three quarters of the performance cores
(`hw.perflevel0.physicalcpu`; half the cores elsewhere) — 6 here (decision 73); the runner prints and stores the load
profile per unit; the strudel page crawls the offline pages up front (their first visit re-optimised `acorn` and
reloaded `editors.pw.ts` and `sounds.pw.ts` mid-test: three load-sensitive failures in run A); two budget lines grew by
the measured files Foundation brought in (strudel 7.5: `offline.pw.ts` 43 s; days 21.9: `illustrated.pw.ts` 11.9 s;
total 134.9). Run B: every group within its budget's tolerance, total 135.0 against 134.9 (0.1 over, with 21 tests
failed or not run because the content lead's exemplars now give J and R a next lesson, §0).

**Not reached: the 20-minute wall.** The suite is CPU-bound: about 135 minutes of test time at ~1 core each on ~9
usable cores is ~22 minutes of pool however the units are placed, plus 6.6 quiet and 0.6 build. What would cut it,
in the order of what it saves: (1) less CPU per test (Chromium is 80 % of a unit's CPU: fewer page loads per state,
fewer animation frames in specs that do not measure time); (2) the quiet phase: `review-studio`'s drift file runs
alone (2.8 min) only because its 0.25× drift moves toward its gate beside a second stream — carry f7's fix lets it
share a stream; (3) a quiet desktop (a music app alone took 1.3 cores in both runs). Every engineer who writes a spec
in this wave keeps to §7.3; the gate measures again on an idle machine.

### 7.3 This wave's allowance per area, and where the specs go

Measured base after Foundation (run B, 6 jobs): lesson 31.5, journey 18.1, review 10.5, days 22.0, surfaces 37.1,
strudel 7.2, audio 2.3, voice 2.4, transcribe 2.7, workbench 1.2 — 135.0 minutes. Wave 7 adds 46 lessons, 4
checkpoints, 8 capstones (20 sessions), a jazz and a rhythm ear stage, two lens families, Side B and Export. The MOST
each area may add (minutes of test time, measured at 6 jobs; the gate argues each new line in `docs/decisions.md` from
the named files that cost it):

| Group (project) | May add | Where the specs go | How to stay inside it |
|---|---|---|---|
| lesson (`lesson`) | **+7.0** | `app/src/lesson/e2e/walk-j1.pw.ts` … `walk-j5`, `walk-r1` … `walk-r3`, `walk-a1b.pw.ts` (A1.L05–L07), `walk-a2.pw.ts`; `w7-checkpoints.pw.ts` (J.CP1, J.CP2, R.CP, A.CP) | about 8 s per lesson, half of Wave 6's 17: one item heard through per widget kind per file, every other step asserts it plays and moves and skips; grading lives in `content:check` |
| journey (`journey`) | **+4.0** | `e2e/journey/w7-days.pw.ts` (a jazz, a rhythm and a sound day; the focus switch), `w7-capstones.pw.ts` | from seeds (§6); one real-time take per capstone whose brief requires one, the rest `seedTake` |
| review (`review`) | **+2.0** | `e2e/review/w7-*.pw.ts` | the reviewers' own; no replayed days |
| days (`session-seeds`, `drills`, `session`, `map`, `onboarding`) | **+3.5** | session-seeds `w7-today.pw.ts`, `w7-coda.pw.ts`, `w7-progress-oak.pw.ts` (2.0); drills `w7-stage-g.pw.ts` (1.2); map: the tree at 259 sessions (0.3) | one page per state; a screenshot matrix loads once and resizes in place |
| surfaces (`capstone` 2.5, `review-studio` 1.0, `ui-review` 1.0, `answers` 1.0, `studio` + `workbench-w3` 1.0, `kit` 0.3, `tutor` 0.3) | **+7.1** | `app/src/capstone/e2e/w7-*.pw.ts` (JC1–AC2 checklists, AC1 versions, Export), `app/src/album/e2e/w7-studio.pw.ts` (Side B, Export), the owners' folders | Export renders a 2-bar piece, never a whole song, except once in `offline.pw.ts` |
| transcribe (`transcribe`) | **+0.3** | its folder | — |
| strudel | **+0.3** | `packages/strudel/e2e/offline.pw.ts` (fast orbit effects against the live engine) | quiet only with evidence |
| audio · voice · workbench | **0** | — | — |
| **total** | **+24.2 → 159 minutes** | | |

At 6 jobs that is about 26 minutes of loud pool, 6.6 of quiet and 0.6 of build: **≈ 33 minutes of wall time** on this
machine as it is — over the 20-minute target, said plainly (§7.2 has what would cut it). An area that needs more than
its line says how many minutes and why under `apiNotes`; it does not borrow another area's minutes.

**Specs that pin "no track lesson written yet"** fail on this tree because the content lead's exemplars give J and R
a next lesson (J1.L01, R1.L01) — not a regression of their owners' code: `app/src/ui/kit/e2e/wave6-shell.pw.ts` (2),
`app/src/session/seeds/e2e/w6-progress-oak.pw.ts` (4), `w6-coda.pw.ts` (2), `w6-today.pw.ts` (3),
`app/src/lesson/e2e/w6-checkpoints.pw.ts` (4), `e2e/journey/w6-days.pw.ts` (4). Their owners (kit, session, lesson,
the journey's owner) rewrite them in Build for tracks that have lessons (the "Open. Next: J1.L01 …" line of §5.1).

**Measured at the close (2026-11-15, the closer's whole `bun run e2e`, shift 0, 6 jobs; decision 79).** 1,231 tests
listed; 1,216 passed, 6 failed, 4 skipped by their specs, 5 not run behind a failure, 4 load-sensitive. Every failure
was fixed and its project run again green (journey 83/83, app 14/14, and capstone, review-studio, transcribe,
session-seeds, strudel-autoplay and studio 279/279 after the content changes). Wall time **46.3 minutes** against the
20-minute target: the loud pool 33 minutes at about 70 % of the cores, the quiet files 7, the alone re-runs of failed
files 14 (without failures, about 32). Test time 155.8 minutes against the projection of 159:

| Group | Budget before | Measured | New Wave 7 files | Budget now |
|---|---|---|---|---|
| lesson | 30.5 | 38.8 | 8.8 (walks and smokes 6.8, w7-checkpoints 0.9, w7-tracks 0.6, walk-r2 0.3, tutor-w7 0.1) | 39.3 |
| journey | 16.7 | 21.6 | 5.1 (w7-capstones 3.65, w7-days 0.9, prod Wave 7 0.5) | 21.8 |
| review | 11.5 | 12.0 | — | 11.5 |
| days | 21.9 | 23.5 | 2.5 (w7-stage-g 1.4, w7-today 0.5, w7-coda 0.45, w7-progress-oak 0.1) | 24.4 |
| surfaces | 37.3 | 42.7 | 4.2 (capstone w7 2.65, w7-studio 0.5, toolbox w7 0.36, answers 0.28, ui-review 0.27, kit, tutor) | 41.5 |
| strudel | 7.5 | 8.6 | 1.15 (wave7.pw.ts) | 8.7 |
| audio · voice · transcribe · workbench | 9.6 | 8.6 | — | 9.6 |
| **total** | **134.9** | **155.8** | **21.9** | **156.8** |

Slowest files: journey w5-capstones 232 s, journey w7-capstones 219 s, review-studio transcribe 170 s, journey
journey.pw.ts 164 s, capstone w7-capstones 159 s, review-studio w6-studio 154 s, strudel wave5 121 s, journey
w3-degrees 116 s, journey w6-capstones 107 s, strudel wave6 103 s. Load-sensitive in that run (passed alone):
voice gate.pw.ts (the pitch gate while Strudel plays), journey w6-capstones (f) CF-T.S1, lesson staff.pw.ts U02.L04
S5, app smoke palette. The unit suite (`bun test --isolate`, 20,761 tests) took 1,680 s alone against 1,333.

## 8. What is frozen

After Foundation, import from these and never edit them; put what you need in your own folder and report under
`apiNotes` anything that should be promoted:

- `app/src/lib/**` (except `mic*.ts` — audio — and `tutor-stream.ts` — tutor), `app/src/main.tsx`,
  `app/src/router.tsx`, `app/src/routes/__root.tsx`, `app/vite.config.ts`, `app/index.html`, `app/public/**`,
  **`app/offline-render.html` and `app/src/offline-render.ts`**.
- `app/src/ui/**` and `app/src/styles/**` for everyone except kit.
- `e2e/support/**`, the root `playwright.config.ts`, `scripts/e2e-parallel.ts`, `scripts/e2e-load.ts`,
  `e2e/budgets.json` (a budget is raised only by the gate), root `package.json`, `bun.lock`, `bunfig.toml`,
  `biome.json`, root `tsconfig*.json`, `node_modules`.
- `docs/design/contracts.md` (1.8 after the content lead's Foundation change).
- Content registries (syllabus, skills, toolbox, terms, glossary, candos, flavours, milestones), `content/specs/**`,
  `content/validate/**`, `content/lib/**`, `scripts/content/**`; `packages/content-kit/**` is additive-only and the
  grader engineer's after Foundation.
- `packages/api/**` is additive-only and the server engineer's during Build; other areas request additions under
  `apiNotes`.

## 9. Workflow rules

- Never `bun install`/`bun add`, `git commit`/`stash`/`reset`/`checkout`. Stop every server you start; never kill a
  process you did not start (no `pkill` by name: forty stacks may be running).
- Vite on Node: `node node_modules/vite/bin/vite.js`, never `bunx --bun vite`.
- Logic tests `*.test.ts` next to the code: `bun test --isolate <your folder>` (always `--isolate`). Browser tests
  `*.pw.ts` in `<your folder>/e2e/` with your own config on your own ports (§7) and a `dataDirName` unique to you.
- **No stray specs or scratch files.** Temporary files go under
  `/private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/w7/tmp-<your key>/`
  or `test-results/`, and are deleted before you finish. No report or FINDINGS files in the repo.
- **Fast tests.** No Playwright test over 60 s unless it measures real time; every spec from a dev seed (§6).
- **Block Vite's HMR websocket** in your specs: `await page.routeWebSocket(/.*/, () => {})` before the first `goto`.
- **The bundle:** reach the app through `__oak*` hooks and its UI only; no assertion may depend on a module path.
- **The strudel page crawls its HTML entries up front** (`optimizeDeps.entries` in `packages/strudel/e2e/vite.config.ts`):
  a new page there is added to that list, or its first visit re-optimises a dependency and reloads every page under
  test (found in Foundation: the offline pages did exactly that to `editors.pw.ts` and `sounds.pw.ts`).
- Typecheck what you touch (`bunx tsc --noEmit -p <tsconfig>`; interfaces.md §1.4), then `bun run typecheck`,
  `bunx biome check --write <your paths>` (only your paths) and `bunx biome ci <your paths>`.
- Music claims and examples are verified with headless Strudel (`import { evalHeadless, midisOf } from
  "@oak/grader/testing"`), `bun run theory …` or `@oak/theory` (`twoFiveOne`, `tensionsOf`, `chordScales`,
  `voicingType`, `claveOf`, `euclidIdentity`, `swingOffbeat`, `lateMs`, `meterGroups`, `polymeterPeriod`).
- The tutor only through the scripted fake backend (`OAK_DEV=1 OAK_TUTOR_FAKE=1`, wave2.md §5). Never the real CLI,
  never an API; nothing contacts a non-localhost host at runtime or in tests.
- **Results**: as your last step, write your full structured result as markdown to
  `/private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/w7/<label with ":" → "-">.md`.

## 10. Definition of done for a surface

(wave6.md §10 items 1–17 stay, word for word.) Added for Wave 7:

18. **The tracks stay optional and honest**: nothing makes a track look required; Today names the core as the default
    while it is unfinished and offers open tracks beside it; a track lesson that cannot start says which gate holds it
    (one line, `TrackGateState.requires[].label`), never a count of what is missing; J2.L04 waiting for U14.CP is
    named as such, never as a failure.
19. **Track checkpoints gate only track capstones**: no surface shows a track lesson as locked by a track checkpoint.
20. **Jazz is read where it is written**: chord symbols come from the one table in the style the learner chose
    (`chordStyle`); a dictionary voicing is never labelled with a hand-voicing type; a tension or chord-scale is
    named "a common choice", never "the right note".
21. **Time is measured, not assumed**: swing ratios, microtiming in milliseconds and clave directions come from the
    views of §3.2 at the piece's own tempo; nothing shows a `.late()` amount as "small" without its milliseconds.
22. **Exports are honest**: an exported file is what the released version plays; a failed render says why and leaves
    nothing behind; the release recording is never replaced.
23. **The end of the course is a reward, not an exit**: the Coda of session 259 shows what the learner made (twenty
    tracks, both sides) and can now do before anything else; Today the day after names what stays open.

## 11. Wave 7 content kinds: who renders, who grades

From `packages/content-kit/src` as re-read at the end of Foundation (2026-11-14; `CONTENT_SCHEMA_VERSION` 6,
`CONTRACTS_VERSION` 1.8; the content lead was still working in it — the code wins; `schema/wave7.ts`, the Wave 7
entries of `SCHEMA_FEATURES` and `PLANNED` in `implemented.ts`, the Wave 7 checks in `define.ts` `checkWave7`).
Wave 7 adds two answer widgets, eight exercise and rule features, one capstone feature, twenty-two planned custom rules with typed
params, five whole rules moved to PLANNED, and the tables a lesson author picks from. "Grades" is always the grader
(`gradeExercise` / `gradeCapstone`; custom rules through `CUSTOM_RULES`). A feature, rule or widget in `PLANNED` is
rejected by content CI in a lesson until its owner moves it into `IMPLEMENTED` with tests (the renderer's owner
moves UI features once they render; the grader engineer moves rules, fields and custom rules once graded with golden
tests and the pre-flight's counterexamples).

| Kind / field (status at Foundation) | Type (content-kit) | Renders | Grades | Notes |
|---|---|---|---|---|
| `grouping` answer (planned widget) | `{ ui: "grouping"; meter: MeterId }`; `Answer.grouping?: number[]`; `correct: { grouping: [2, 2, 3] }` (one of `METER_GROUPINGS[meter]`) | answers (a bar of eighths cut into 2s and 3s; `registry.tsx` holds `null` until built); drills-ui | grader: the sequence of group sizes (a rotation is another grouping) | R2.L01–L02; theory `meterGroups` |
| `euclid` answer (planned widget) | `{ ui: "euclid"; maxSteps: number; rotation: boolean }`; `Answer.euclid?: number[]` (`[k, n]` or `[k, n, r]`) | answers (k, n, r steppers with the rhythm drawn); drills-ui | grader: by the onsets the numbers make (`euclid(k, n, r)`: two spellings of one rhythm are one answer) | R3.L01–L03; theory `euclidIdentity` |
| `text.jazz-chord` (planned feature) | `{ ui: "text"; normalize: "chord"; jazz?: true }` | answers (`ChordNameAnswer` reads ∆ – ø °, 9 11 13, ♭9 ♯9 ♯11 ♭13, alt, sus, 6, 69; the "reads as" preview in the learner's chosen style) | grader: root, quality and extensions, never the string (`D–7` = `Dm7` = `Dmin7`) | J1.L02; theory `jazzSymbol` |
| `keyboard.voicing` (planned feature) | `KeyboardEx.expect.voicing?: { shape: VoicingShape \| VoicingShape[]; symbol }`; needs `mode: "chord"`, `pitchMode: "absolute"` | answers (`KeyboardAnswer` in chord mode; the VOICINGS lens labels what was played) | grader: `voicingShapeOf` octave-aware, any register in range | J1.L05 shells, J3.L01 rootless A/B, J3.L02 drop-2 |
| `staff-expect.voicing` (planned feature) | `StaffExpect { e: "chords"; …; voicing?: VoicingShape \| VoicingShape[] }` | answers (`StaffInput` with `palette.chords`) | grader: each written chord in the shape, octave-aware | J3 |
| `tap.lanes` (planned feature) | `TapEx.lanes?: TapLane[]` (`{ label; track; key? }`, two lanes); tests answer `{ lanes: number[][] }` | answers / drills-ui (`TapPad` with two lanes, one key per hand; `f` and `j` by default) | grader: F1 and timing per lane, the step passes when both do | R2.L04's 3 against 2; never gates in Quiet mode |
| `clave.coverage` (planned feature) | `clave` + `minBars?` (even, ≥ 2), `exact?` | lesson Make lines, capstone checklist, the CLAVE lens | grader — **guarded** (`WAVE7_UNBUILT`): every two-bar window from bar 1 holds the whole clave in its direction (w7plan A5) | R3.L02, RC2 ("8+ bars" means 8) |
| `polyrhythm.together` (planned feature) | `polyrhythm` + `minBars?`, `span?` | lesson Make lines, the pulse lanes | grader — **guarded**: both pulses, evenly spaced, in the SAME bars (A6) | R2.L04, RC2 |
| `voice-leading.top` (planned feature) | `voice-leading` + `voice?: "all" \| "top"`, `minRatio?` | capstone checklist | grader — **guarded**: the highest sounding note at each change; `minRatio` of changes (A7); a `voicing()` track fails with a message | AC2 |
| `reharmonize.devices` (planned feature) | `reharmonize` + `devices?: DeviceName[]` (`JAZZ_DEVICES`: tritone sub, secondary ii–V, backdoor, diminished passing) | lesson Make lines | grader — **guarded**: each device against the reference's chord in its bar, as `device-count` detects it | J5.L01–L04 |
| `capstone.versions` (planned feature) | `CapstoneDef.versions?: CapstoneVersionDef[]` (`{ id: "a" \| "b"; label; startsIn; starter? }`, exactly two); rules in `across` read both | capstone (two drafts, two editors, one release with both versions; API `CapstoneDraftSave.versionId`, `CapstoneSessions.versions`) | grader: the brief's rules on each version; `two-versions-differ` reads `GradeContext.otherVersion` (typed; the grader engineer evaluates and threads it) | AC1 |
| `euclid`, `clave`, `polyrhythm`, `register-separation`, `no-muddy-low` rules (planned for content; analyzers since Wave 0) | `rubric.ts` | lesson Make lines, capstone checklists | grader (`RULES`) — golden tests and the counterexamples before they move to `IMPLEMENTED` | R3, RC2, A2 |
| Planned custom rules (`TRACK_CUSTOM_RULES`: `walking-bass`, `allowed-tensions`, `ii-v-chain`, `voicing-shape`, `song-melody-kept`, `contrafact`, `two-versions-differ`, `same-tune-two-ways`, `extended-share`, `microtiming`, `displaced-copy`, `metric-weight`, `grouping-accents`, `regrouped`, `polymeter-cycle`, `clave-aligned`, `stabs`, `chord-scale-fit`, `tensions-used`, `counter-melody`, `slices-reordered`, `level-balance`) | `{ rule: "custom"; fn; params }`; each with typed params (`trackCustomParamIssues` checks them in content CI) and `alsoUses` | lesson Make lines, capstone checklists | grader: stubs answer "not built yet" (`wave7CustomStubs`); the first three exist with OLD semantics and are rebuilt (`WAVE7_REBUILD`); each is built on its view of §3.2 | see each rule's `usedBy` |
| Tables and fixtures | `swingRatio`, `swingAmount`, `SWING_FEELS`, `lateCycles`, `lateMs`, `FEEL_MS` (8–45 ms is a feel; more is a displacement), `CLAVE_GRIDS`, `claveMini`, `claveDirectionOf`, `polymeterPeriodBars`, `METER_GROUPINGS`, `groupStarts`, `VOICING_SHAPES`, `isClose`, `isDropTwo`, `voicingShapeOf`, `AVAILABLE_TENSIONS`, `JAZZ_DEVICES` | every host and generator computes them one way | grader | theory computes the same facts; `wave7-views.test.ts` checks they agree (swing, microtiming, polymeter, clave, every allowed and avoid tension, voicing shapes) |
| Standard options | `SWING_RATIO_OPTIONS`, `MICROTIMING_OPTIONS`, `CLAVE_OPTIONS`, `TENSION_OPTIONS`, `SOUND_COMPARE_OPTIONS` (brightness, grit, width, space, movement) | answers (`choice`), drills-ui | grader (`choice`) | stage G and the rest of H (`fam.*` rows of contracts §7.3); offer each option only from its lesson |
| Wave 6 kinds | unchanged | as wave6.md §11 | | |

Drills of stage G (jazz: chord quality with extensions, ii–V–I by ear, guide-tone lines, tensions) and the rest of H
(swing ratio, clave type and direction, odd groupings, polyrhythm) are generated by drills-engine from the tables
above and rendered by drills-ui with the `choice`, `grouping`, `euclid`, `tap` (with lanes) and `rn-palette`
widgets; graded by `@oak/drills` + `gradeAnswer`.
