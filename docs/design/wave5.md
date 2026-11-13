# Oak Wave 5 seams — bass lines, form, minor, pentatonic and blues

**Status: binding for Wave 5 Build.** Written in the Foundation phase (2026-11-13). Ranks below `contracts.md`
(version 1.4), above everything else (`wave4.md`, `wave3.md`, `wave2.md`, `interfaces.md`, ux, the rest). It records
who owns what, the carry-overs from Wave 4, the seams between builders (signatures copied from the code; when this
file and the code disagree, the code is right and this file has a bug — report it), the API additions, the dev
seeds, the ports, what is frozen, the workflow rules, the definition of done and the Wave 5 content kinds.

Goal of the wave: units U08 "Bass Lines" (5 lessons), U09 "Form" (5 + U09.CP over U08–U09), U10 "Minor" (9 + CP) and
U11 "Pentatonic & Blues" (8 + CP); the optional side lessons A1.L01–L04 (waves and harmonics, filters, envelopes,
space) that open once U03.L02 is done; capstones C3 "Verse–Chorus Demo" (3 sessions), C4 "Minor Indie Ballad" (2),
C5 "12-Bar Shuffle" (2) and X2 "Blues Transcription" (2); ear training stage E (minor degrees, bass-line dictation,
dominant-seventh quality, blues and pentatonic colour, straight vs swung); ladder levels L5 (PD folk, per phrase) and
L6 (blues, staged). Everything the platform needs for them: section form with one `arrange()` per labelled track,
contrast and the energy curve, bass rules and groove lock with the kick, minor keys in theory, grading, notation,
lenses and drills, pentatonic and blues scales, dominant sevenths, the 12-bar form, shuffle and swing, and Oak's
scope and spectrum panel with visual probes for the sound lessons.

Read first: `wave4.md` "Wave 4 state" (what you can rely on and the known gaps), then this file in full, then the
contracts sections your area touches (§2.3–§2.6, §2.8–§2.9, §3, §5, §6.3, §6.6, §6.8–§6.12, §7.3, §9, §10, §11).

The three things that decide whether this product works — judge every choice against them: **enjoyment** (each
session ends with something the learner made that sounds like music they would replay), **pace** (a session fits its
15/20/25 minutes, one new idea at a time) and **return** (the learner leaves knowing what they can now do and what
opens next).

## Wave 5 state (read this first)

Written by the final gate (2026-11-13), after the 30 builders, the six integrators, the closer and the six reviews
(journey, learner, robustness, studio, surfaces, teaching). The rest of this file is the Foundation seam document,
updated where the code moved; `interfaces.md` §21 (integration) and §22 (reviews and gate) list the cross-package API
as built. The code beats all of it. The gate's item-by-item results, with the measured numbers, are the W5 row of
`docs/decisions.md` "Gate results".

**What Wave 6 can rely on** (implemented, tested by execution, green in `bun run check` and the browser suite):

- **Course through U11: 95 lessons** — 91 core (U00–U07's 64, plus U08 5, U09 5, U10 9, U11 8) and the side lessons
  A1.L01–L04 (open after U03.L02, offered beside or after the day's session, never moving the core map) — with
  U01.CP–U11.CP, capstones C0–C5, X1 and X2, all with locked IDs (`content/ids.lock.json`). `content:check all`
  passes; every U08–U11 and A1 musical claim is re-derived in `content/validate/u08-u11-music.test.ts` and
  `u08-u11-teaching.test.ts`. Every graded step requires either swing spelling (`.swing(4)` or `.swingBy(1/3, 4)`).
  The learner review rewrote the Makes that repeated their modify step (U10.L06, U10.L07, U11.L04, U11.L06 in G,
  U05.L06, U06.L10) and timed every listen step against its audio.
- **Grading:** every rule the C3–C5 and X2 briefs name, each with golden passing pieces per flavour and known-wrong
  pieces; the reviewed beginner pieces (`app/src/capstone/review-w5-pieces.ts`, 3 honest pieces per capstone and 14
  near misses) grade right with actionable lines. Numeral reading gives a wrong root no quality credit and compares a
  held target chord bar by bar where the answer changes (L6, X2, every `rn` matcher). A failing capstone in another
  key than its brief's says so (`harmony.key-mismatch`). The ladder L5 (per phrase) and L6 (bass → changes → melody)
  grade on the songs' answer keys.
- **Ear training stage E** in warm-ups and Practice (minor degrees do-based, groove lock, 12-bar position, straight
  vs swung, dominant-seventh quality, form sections); the SRS simulation holds with U08–U11 and their decks added.
- **Surfaces:** the section ribbon and form map with section loops (a song past 64 bars says what is cut), the scope
  and spectrum panel with probes, the chart panel, swing badges and straight-printed swung staves, the line lenses,
  minor in every lens and palette, the capstone form strip with naming hints, the lead sheet with sections, "check
  again before you release" (c1), Transcribe's song panel with the L6 chart, the side-lesson offer, the gym Codas
  (c10); the Coda's "Next time" names a capstone session with its place and goal and a gym slot due first.
- **Sessions:** a session started before the 04:00 rollover stays the open one for 3 hours (a reload resumes it).
- **Carry-overs:** c1, c2, c4–c13 fixed with regression tests; c3 decided; c14 landed in Foundation. The Wave 4
  "the message names the key mismatch" is now built.
- **Journeys** (`e2e/journey/w5-days.pw.ts`, `w5-capstones.pw.ts`), each from a dev seed, and the review suites
  (`e2e/review/w5-*.pw.ts`, `app/src/album/e2e/w5-studio.pw.ts`, `app/src/ui/review/e2e/wave5-surfaces.pw.ts`).
- **Tutor:** the live smoke on the `claude-cli` backend passed its three turns (hint rung 1 on U10.L06, a C5 review
  with two revisions, Explain my mistake on U11.L05's last line); details in the W5 gate row.

**Known gaps (for Wave 6):**

- **Contracts owner** (only they edit contracts.md; exact texts in the gate's result): the §7.3 rows for
  `deck.key.minor`, `deck.har.minor`, `deck.scl.degrees`, `deck.frm.twelve-bar`, `deck.chd.dom7` and the Wave 4 decks
  `deck.chd.triads`, `deck.har.rn`, `deck.har.cadence` (the decks stay in `PENDING_DECKS`); `fam.rhy.swing` is stage
  E here and stage H in §7.3's EAR_STAGES; §2.4's X2.S1 row promises St. Louis Blues, which has no answer key;
  U05.L04 holds two ideas (`.arp()` and chord-symbol names, N05), a syllabus move.
- **Product decisions open** ("Needs you" in decisions.md): L6/X2 changes pass at 0.85, so Careless Love with every
  V7 written minor passes (0.886); L5 accepts an answer in another key with only an info note; side lessons may be
  taken out of order; C3.S3 holds arranging, the lead sheet, the review and a 96-second real-time take.
- **Grading leniencies** (pinned as graded today): X2/L6 bass one bar late passes (≈0.91–0.93); `approachKind` counts
  a third as an approach; `contrast` is |ΔE| (contracts §5.6); a chorus line written as one 24-step repeat reads as
  one chorus (the message now says how to write the second); `must-use` cannot take a SoundId.
- **Repertoire:** St. Louis Blues and Memphis Blues have no answer key; no answer key is human-verified; Greensleeves
  bar 16 (`[b3@2 ~]`) differs from the common tune (the teaching review); X2 does not check Careless Love's line 4.
- **Ladder:** at R3+ an L4 stimulus may play a sound not unlocked yet; L5 has no transposition.
- **UI:** the Workbench editor does not wrap long lines (A1.L01 S5's 110-character line scrolls inside it at
  1280); the ribbon's arrow keys reach only the sections in the roll's window (the form map reaches all); the staff
  does not page to the section playing; a reload clears an unchecked form, scale or numeral answer (attempts and the
  rung are kept); lesson ear steps offer no "the note alone" after answering (a design choice to confirm); a Make
  cannot start from the learner's own sketch of an earlier lesson; relabelled staff texts are page-local; hosts
  other than the Workbench (Transcribe, answers, lesson) do not get the staff's swing and relabel behaviour.
- **Tutor output** (the live smoke): a C5 review's try-it code used F-blues changes for a piece in C, wrote
  `arrange()` over inline patterns instead of section consts, and named a "perfect authentic cadence" (not a course
  term); the persona and the review lint do not catch these yet.
- **Timing:** the C3 tests record the brief's 96-second take in real time and run past the suite's 90-second guide;
  the full suite does not meet its 20-minute target on this machine (68.7 min at jobs 4, load 7–16; the W5 gate row).
- **Flaky by name:** `app/src/transcribe/e2e/ab-drift.pw.ts` fails when it runs right after `review-studio.quiet` in
  the runner's quiet chain (2 of 2) and passes alone (6 of 6, 2.65–5.02 ms): on a busy start the transport joins the
  recording part-way into bar 0 (by design, transport.ts), its first burst is not heard, and the spec reads that as a
  bar offset. Fix in Wave 6: let the spec read where the file started, or give the start more margin.

## 0. What Wave 5 inherits

Everything listed under "What Wave 5 can rely on" in `wave4.md` (course through U07, 64 lessons, C0–C2, X1, the album,
Transcribe and the ladder L1–L4, the voicing gate, lenses, the tutor). Before Foundation, a large part of Wave 5's
theory and grading already existed from Wave 1 and is the base to build on, not to rewrite:

- `@oak/theory`: the three minor scales, pentatonic and blues in `SCALES`; `relativeKey`, `parallelKey`,
  `keySignature` (minor keys), `spellMidi` (raised 6 and 7 in minor, direction for chromatic notes), `degreeOf` and
  `syllableOf` (do-based minor: me le te), numerals in minor both ways (`romanText`, `chordOfRoman`; V and vii° from
  harmonic minor), `SCHEMAS` with `schema.aeolian`, `schema.andalusian`, `schema.blues12`, `schema.blues12-qc`.
- `@oak/grader`: `sectionsFromAst` (per-track `arrange()`), `energyCurve`, `spanStats`, `formLabels`, `formMatches`,
  `grooveLock`, `bluesForm`, `swingRatio` / `straighten`, and rubric analyzers for every rule the C3, C4, C5 and X2
  rubrics name (`form`, `contrast`, `duration-sec`, `groove-lock`, `progression`, `contains-rn`, `degree-set`,
  `ends-on-degree`, `blues-form`, `chord-qualities`, `swing`, `motif-reuse`, `tempo-bpm`).
- `@oak/notation`: "Swing 8ths" and straightening (§6.10), minor signatures with raised 6/7 as accidentals, chromatic
  notes spelled by melodic direction (a blue ♭5 is F♯ going up, G♭ going down).
- `@oak/strudel`: `.scope()` / `.fscope()` routed to Oak's panel through the master-bus analyser (`ScopeTap`), never
  Strudel's canvas (contracts §3.1 rule 9).

The seams below add what was missing. Wave 4 known gaps not in the carry-over list stay open (see `wave4.md`).

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
 - test-speed   : scripts/e2e-parallel.ts, root playwright.config.ts, e2e/support/**, e2e/journey/**, e2e/review/**, every per-area playwright.config.ts, and the EXISTING *.pw.ts specs and their helpers written in Waves 2–4 (everyone else adds NEW spec files and touches an old one only to keep it passing; when two engineers must edit one spec, re-read it immediately before each edit and keep the other's change). Runs on SHIFTED ports only (every stack + 300), from the start of Foundation to the end of Build.
 - author:U08a  : content/core/U08/L02, L03        - author:U08b : content/core/U08/L04, L05
 - author:U09a  : content/core/U09/L01, L03        - author:U09b : content/core/U09/L04, L05
 - author:U10a  : content/core/U10/L02, L03        - author:U10b : content/core/U10/L04, L05
 - author:U10c  : content/core/U10/L06, L07        - author:U10d : content/core/U10/L08, L09
 - author:U11a  : content/core/U11/L01, L02, L03   - author:U11b : content/core/U11/L04, L06
 - author:U11c  : content/core/U11/L07, L08        - author:A1   : the A1.L02, L03 and L04 lesson folders (where AUTHORING.md and the A1 spec place advanced-track lessons)
 - author:CP    : the U09.CP, U10.CP and U11.CP items (content/checkpoints.ts and the checkpoint folders AUTHORING.md names) and content/bands/** — the only author who edits those
 - author:capstones : content/capstones.ts and the capstone folders AUTHORING.md names (C3, C4, C5, X2) — the only author who edits those
 - author:repertoire : content/repertoire/** — the only author who edits it
 (U08.L01, U09.L02, U10.L01, U11.L05 and A1.L01 are the exemplars written in Foundation. The remaining content registries — syllabus/skills/toolbox/terms/glossary/candos/flavours/milestones — content/specs/**, content/validate/**, content/lib/** and scripts/content/** are frozen during Build: authors request changes via apiNotes. app/src/lib/** (except mic*.ts and tutor-stream.ts), app/src/main.tsx, router.tsx and routes/__root.tsx are frozen during Build for everyone.)
```

Files Foundation created or changed inside an owner's paths are that owner's from now on; keep their exported
signatures (others code against them) and extend freely:

| Owner | Seam files Foundation wrote | What the owner does with them |
|---|---|---|
| grader | `packages/theory/src/wave5.ts` (+ test) and its export block in `theory/src/index.ts`; `packages/grader/src/analyze/wave5-views.ts` (+ test); `grade/song-ladder.ts` (+ test); `rubric/wave5-rules.ts` (`bass-line` built, `notates` stub) (+ test); `match/controls.ts` (stub); `gradeSongLadder` and the Wave 5 export block in `grader/src/index.ts`; `RULES` gained `bass-line`, `notates`; `MATCHERS` gained `controls` | build `notates` (via `@oak/notation`, `approximate = false`), the `controls` matcher, the Wave 5 rule fields (`section`, `depth`, `anyOf`, `over`, `choruses`/`quickChangeOk`), the `form`/`bar-grid`/`scale-builder` answers in `grade/answers.ts`; golden tests per contracts §6.3 item 8 and §6.6 (one passing piece per flavour) for C3–C5; c6 `keyEstimate`; move each into content-kit `IMPLEMENTED` with its tests |
| notation | `packages/notation/src/wave5.ts` (+ test); `NotationInput.sections` and `SectionMark` in `types.ts` | draw `sections` (ABC `P:` labels, `||` before each new section); the 12-bar chart view (DOM, from `chartLayout`); c5 |
| sound | `packages/strudel/src/probes.ts`, `scope-fake.ts` (+ test); `ScopeTap.source` / `setSource` (track throws `StrudelNotBuiltError`); the `./probes` package export | tap one track for the scope (`setSource({ kind: "track" })`); pin `SYNTH_ENVELOPE_DEFAULTS` / `DELAY_DEFAULTS` against the audibility harness |
| audio | `packages/audio/src/scope.ts` (+ test) and its export block | the panel's frame helpers stay pure; c7 |
| server | `packages/api` Wave 5 block (`dto.ts` end, `contract.ts` end, `wave5.test.ts`), the optional fields of §5, `confirmIf` on `album.putAudio`; 501 stubs in `server/src/routes/{course,practice,library}.ts`; `routes.test.ts` "Wave 5 endpoints" (`WAVE5_PENDING`); `services/ladder.ts` answers 501 for L5/L6 | dev seeds of §6 FIRST; then the 3 endpoints and the behaviour of §5; remove each name from `WAVE5_PENDING` as it lands |
| workbench | `app/src/workbench/panels.ts` `NO_PANELS` gained `form`, `scope`, `spectrum` (false) | draw the section ribbon, the form map, the scope / spectrum panel and the probes (§4.4) |
| answers | `app/src/answers` registry entries `form`, `bar-grid`, `scale-builder` = `null` (the host shows `<AnswerUnavailable>`); their `AnswerValueMap` entries, `emptyValue` / `isComplete` / `responseOf` cases | build the three widgets (§11) |

## 2. Carry-overs from Wave 4

Verbatim from the wave plan; the owner in brackets fixes each in this wave with a regression test. For the ones the
Wave 4 gate already fixed, the owner only confirms the regression test exists. The failing cases are in
`/private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/w4/review-*.md`.

```
 (c1) ALREADY FIXED: a capstone's first release must be of the code its last check passed (migration 0005; release answers 409 when the draft changed). [capstone] keeps the UI honest for C3–C5 and X2: an edited draft says "check again before you release".
 (c2) [server + transcribe] OPEN: code that the learner did not type and that arrives through a backup restore or an import (transcription versions, lesson-attempt code) is marked for review and runs under the strict lint profile until the learner confirms it (contracts §11.3): a flag column (new numbered migration) and a Transcribe notice that shows the code and lints it strictly before its first run.
 (c3) DECIDED, nothing to do: two tabs on one capstone draft keep both saves and tell the second tab (decision 46).
 (c4) ALREADY FIXED: tutor bar links and chord-band labels count from the first full bar when there is a pickup. [tutor + workbench] keep it true for sections and 12-bar charts.
 (c5) [notation + workbench] OPEN: with numerals drawn on a staff, a second voice on that staff gets no lens lines; a chord note in unison with the melody is drawn as two noteheads on top of each other; note names touch at four chords a bar at the narrowest width.
 (c6) [grader] OPEN: keyEstimate on sparse and long sketches (D F♯ A F♯ was labelled F♯ minor; a 64-bar D-minor sketch F major): fix with tests. (An empty sketch's cover is already fixed.)
 (c7) [audio] OPEN: humToDraft cuts a legato note held across a bar line (with a tie-truncated warning); it should draft a held or tied note, never a rest on the next beat 1.
 (c8) ALREADY FIXED: the Roman-numeral palette lights the numerals that fit the bass the learner found. [answers + drills-ui] make it work in minor keys.
 (c9) "Mark done" on review suggestions is ALREADY FIXED. [tutor] OPEN: the tutor panel's own "Request review" action follows the capstone Brief's pending state, and a request that fails before reaching the server clears "pending" at once.
 (c10) [session; server adds the seed] OPEN: the own-audio gym Coda has its own card; the ladder level-up and realism-change Codas get a seed and an e2e test.
 (c11) [server] OPEN: a transcription review records which version it was asked about (new numbered migration). Re-recording an album track asks first (a confirm in the dialog [capstone] and the confirm nonce on the endpoint) before the earlier recording is replaced. Own-audio checklist toggles count as evidence at most once per project per day.
 (c12) [transcribe + capstone] OPEN: Transcribe and X1 use the kit's TransportBar and FileDropZone.
 (c13) [author:capstones] OPEN: C2's rule label becomes "Repeat or vary your bar-1 idea in half the bars or more" (it is checked at ≥ 0.5; contracts 1.4); its cadence rule keeps accepting vii°–I and iv–I.
 (c14) [content lead, in Foundation] OPEN: add the toolbox feature row tb.feature.chord-symbols ("Chord-symbol labels (chord band and staff)", unlocked at U05.L04; contracts §3.2 in version 1.4) and tell the seams engineer, who switches CHORD_LENS_UNLOCKS.chordSymbols in app/src/lib/lenses.ts from tb.arp to it; add the §7.3 rows the pending decks deck.chd.triads, deck.har.rn and deck.har.cadence need and report their exact text under apiNotes.
 Not changed, by decision: a capstone is analysed in the key its brief gives (contracts §6.8 item 1), and the message names the mismatch; X1's chord stages pass at 0.80; the gym is counted between lessons only.
```

Seams Foundation added for them (§5): **c1** `CapstoneStateSchema.checkedVersion` and `draftChangedSinceCheck`
(the Brief's "check again before you release" reads them; server fills them from migration 0005's column). **c2**
`TranscriptionVersionSchema.reviewBeforeRun`, `VoicingGateSchema.passedCodeImported`, the endpoint
`transcriptions.confirmVersion`. **c10** `SessionSummarySchema.gym` (the gym Coda's own card: ladder or own audio)
and the seeds "ladder level-up due" and "ladder realism-up due". **c11** the confirm action `album.audio.replace`
and `album.putAudio.confirmIf` (the nonce only when a recording exists; `callConfirmed` in `app/src/lib/api.ts`).
**c14** the content lead added `tb.feature.chord-symbols` (U05.L04); Foundation switched
`CHORD_LENS_UNLOCKS.chordSymbols` from `tb.arp` to it (`app/src/lib/lenses.ts`), with the Studio hint
(`harmonyViewHints`) and the toolbox e2e grant (`w4-harmony.pw.ts` grants both rows) kept in step; the server's
start-up backfill grants the new row to learners already past U05.L04.

## 3. Package seams

### 3.1 `@oak/theory` — minor, pentatonic and blues, the dominant seventh, the 12-bar form, bass (`wave5.ts`, built and tested)

All built on the existing tables; RN answers still compare `(degree, alt, quality, inversion)`, never strings.

```ts
export const MINOR_FORMS: readonly ["natural", "harmonic", "melodic"]; export type MinorForm;
export function minorKey(tonic: string, form?: MinorForm): KeySpec;            // { tonic, mode: "harmonic minor" }
export function minorFormOf(key: KeySpec): MinorForm | null;
export interface MinorDegree { degree: Degree; syllable: string; n: number; lowered: boolean; raised: boolean }
export function minorDegrees(form: MinorForm): MinorDegree[];                   // 1 2 b3 4 5 b6 b7 · do re me fa sol le te
export function minorScaleNotes(tonic: string, form?: MinorForm): string[];    // A melodic: A B C D E F# G#
export function keyTwins(key: KeySpec): { relative: KeySpec; parallel: KeySpec };
export interface KeyChord { degree: number; rn: string; chord: ChordId; symbol: string }
export function minorKeyChords(tonic: string, opts?: { form?: "natural" | "harmonic"; seventh?: boolean }): KeyChord[];
  // natural: i iio III iv v VI VII; harmonic: V and viio (E, G♯° in A minor); sevenths Am7 Bm7♭5 Cmaj7 Dm7 E7 Fmaj7 G♯°7
export function schemaChords(schemaId: SchemaId, key: KeySpec): ChordId[];     // aeolian in A minor: Am F C G
export type PentatonicKind = "major" | "minor";
export function pentatonicKey(tonic: string, kind: PentatonicKind): KeySpec;
export function bluesKey(tonic: string): KeySpec;                              // 1 b3 4 b5 5 b7
export function scaleDegrees(key: KeySpec): Degree[];
export interface BlueNote { degree: "b3" | "b5" | "b7"; name: string; syllable: string; semitones: 3 | 6 | 10 }
export const BLUE_NOTES: readonly BlueNote[];                                  // flat three/five/seven · me se te
export function blueNoteOf(midi: number, key: KeySpec): BlueNote | null;       // against the key's tonic as major
export function spellBlueNote(midi: number, key: KeySpec, direction?: 1 | -1): SpelledPitch;  // F♯ up, G♭ down
export function isDominantSeventhSymbol(symbol: string): boolean;              // "C7", "G7/B"; not maj7, m7
export function isDominantSeventhPcs(pcs: Iterable<number>, bassPc?: number): boolean;
export function dominantSeventh(root: string): ChordId;
export const TWELVE_BAR_VARIANTS: readonly ["standard", "quick-change"];
export interface TwelveBarForm { variant: TwelveBarVariant; turnaround: boolean }   // turnaround: V in bar 12
export function twelveBarPlan(form: TwelveBarForm): string[];                  // 12 numerals, all "I7"/"IV7"/"V7"
export function twelveBarChords(tonic: string, form: TwelveBarForm): ChordId[];// read in a blues key: I7 not V7/IV
export function twelveBarFormOf(rootSemis: readonly (number | null)[]): TwelveBarForm | null;
export type BassRole = "root" | "octave" | "fifth" | "third" | "seventh" | "approach" | "other";
export function bassRole(midi: number, chord: ChordId, ctx?: { rootMidi?; nextChord?; beforeChange?; key? }): BassRole;
export type ApproachKind = "chromatic-below" | "chromatic-above" | "diatonic-below" | "diatonic-above" | "dominant";
export function approachKind(midi: number, target: ChordId, key: KeySpec | null): ApproachKind | null;
export function approachTones(targetMidi: number, key: KeySpec): Record<ApproachKind, { midi: number; name: string }>;
export function rootFiveOctave(chord: ChordId, rootMidi: number): { root: number; fifth: number; octave: number };
export function degreeLens(midi: number, key: KeySpec): { degree: string; syllable: string };  // "♭3", "me"
export function tonicDisplay(tonic: string): string;                           // "F#" → "F♯"
```

Verified in `wave5.test.ts` by hand and against the chord table: the three A minors; numerals in A minor both ways;
aeolian and Andalusian (D minor: Dm C B♭ A); signatures of E, C and A (harmonic) minor; ♭5 in C as F♯4 up and G♭4
down; the quick-change blues in F with a turnaround (F7 B♭7 F7 F7 B♭7 B♭7 F7 F7 C7 B♭7 F7 C7); root–fifth–octave
under C; approach tones to G in C (F♯ chromatic below, F diatonic below, A diatonic above, D the dominant).

### 3.2 `@oak/grader` — form, bass, blues and swing views; the song ladder; Wave 5 rules (built and tested)

`analyze/wave5-views.ts` (exported from the package root). Every view is built on the functions the rubric uses.

```ts
export interface SectionFeatures { density: number; meanPitch: number | null; low: number | null; high: number | null;
  instrumentation: string[] /* sorted labels */; loudness: number /* mean gain */; harmonicRhythm: number; energy: number }
export interface FormSectionView extends SectionInfo /* label, tag, bars, startBar */ { tracks: string[]; features: SectionFeatures }
export type FormView =
  | { kind: "sections"; sections: FormSectionView[]; totalBars: number; energy: number[] }
  | { kind: "inconsistent"; track: string; detail: string; totalBars: number; energy: number[] }
  | { kind: "through"; letters: string; phraseBars: number; totalBars: number; energy: number[] };
export function formView(n: Normalized, ctx: { code: string; bars?: number }): FormView;
export function sectionFeatures(n: Normalized, span: readonly [number, number], energy?: readonly number[]): SectionFeatures;
export const CONTRAST_AXES: readonly ["density", "register", "instrumentation", "loudness", "harmonic-rhythm", "pitch", "energy"];
export const CONTRAST_THRESHOLDS: { pitchSemis: 3; densityRatio: 0.25; registerSemis: 5; energyDelta: 0.15; loudnessDelta: 0.15; harmonicRhythmDelta: 0.5 };
export function contrastAxes(a: SectionFeatures, b: SectionFeatures, th?): ContrastAxis[];   // the form lens; the `contrast` rule grades
export interface BassNoteView { id; midi; onset: Rat; bar /* 1-based, 0 pickup */; beat; downbeat: boolean;
  chord: string | null; role: BassRole | null; approach: ApproachKind | null; onKick: boolean }
export interface BassView { track: string | null; notes: BassNoteView[]; rootOnChange: number; groove: GrooveLock | null }
export function bassView(n: Normalized, ctx: NormalizeContext & { bars?: number }): BassView;
export function bassNotes(bass: readonly NEvent[], slots: readonly ChordSlot[], ctx: NormalizeContext & { kicks?: readonly Rat[] }):
  { notes: BassNoteView[]; changes: number; rootsOnChange: number };      // shared by bassView and the `bass-line` rule
export interface BluesView { form: (TwelveBarForm & { jazz: boolean }) | null; choruses: number; wrongBars: number[];
  bars: (string | null)[]; allDominant: boolean }
export function bluesView(n: Normalized, ctx: NormalizeContext & { bars?: number }): BluesView;
export interface TrackSwing { track: string; eighths: SwingMeasure; sixteenths: SwingMeasure; swung: 8 | 16 | null }
export function swingView(n: Normalized, meter: MeterId): TrackSwing[];   // [] in compound meters
```

Readers: the form lens, the section ribbon and the form map (workbench, via `app/src/lib/form-view.ts`), the C3
checklist and contrast hints (capstone), U08–U09 Make lines (lesson), the bass-role and blue-note lenses
(workbench), liner notes and the tutor. Verified: a V C V C piece with a bass that rests in the verses (chorus denser,
higher, more instruments, more energy); root–fifth–octave–approach under C G and under Am E (minor); groove lock 0.5
with a two-kick bar; a quick-change F blues with turnaround; swung hats ratio 2.

`grade/song-ladder.ts`: ladder L5 and L6 (contracts §2.9, §6.4, §6.6 X2), reusing the X1 phrase machinery.

```ts
export type SongLadderLevel = 5 | 6;
export const SONG_LADDER_STAGES: readonly ["bass", "changes", "melody"];          // L6, in order
export const SONG_LADDER_PASS: { 5: 0.85; 6: { bass: 0.9; changes: 0.85; melody: 0.85 } };
export const SONG_LADDER_MATCHERS: Record<"melody" | SongLadderStage, Matcher>;   // melody key-relative; bass = L3 bass; changes rn/triad
export interface SongLadderItem { itemId: string; level: SongLadderLevel; phrase: number | [number, number]; stage?: SongLadderStage }
export function songLadderCheck(item: SongLadderItem): PhraseCheck;
export interface SongLadderGradeRequest { item; song: SongDef; code: string; ctx: Omit<GradeContext, "mode" | "key" | "meter" | "bpm" | "pickup" | "swing" | "exerciseGlobalId" | "window"> }
export function songLadderRequest(req: SongLadderGradeRequest): GradeRequest;    // L5 lesson mode, L6 capstone mode
export function nextSongStage(passed: readonly SongLadderStage[]): SongLadderStage | null;
export function songLadderPassed(item: SongLadderItem, result: GradeResult): boolean;
export function gradeSongLadder(req: SongLadderGradeRequest): Promise<GradeResult>;   // index.ts, the realm
```

Rules: `RULES["bass-line"]` is built (`rubric/wave5-rules.ts`: `roots` on change or downbeat, `members` with `each`,
`approach` with kinds; the chords exclude the bass line; partial credit is the weakest part). `RULES.notates` and
`MATCHERS.controls` are typed stubs that fail with `rubric.unknown` ("not built yet") — never a silent pass. Every
rule C3, C4, C5 and X2 name has an analyzer (`rubric/wave5-rules.test.ts`); content-kit still lists `bass-line`,
`notates`, `groove-lock`, `duration-sec`, `form`, `contrast`, `swing`, `syncopation`, `blues-form` as `PLANNED` until
the grader engineer's golden tests (contracts §6.3 item 8, §6.6) are in.

### 3.3 `@oak/notation` — section marks, the 12-bar chart (`wave5.ts`)

```ts
export interface SectionMark { bar: number /* 0-based cycle */; text: string /* "Chorus 2" */; tag: string; doubleBar: boolean }
// NotationInput gains:  sections?: readonly SectionMark[]   — accepted now, drawn by the notation engineer in Build
export interface SectionSpanInput { label: string; tag: string; startBar: number; bars: number }
export function sectionMarks(sections: readonly SectionSpanInput[], window?: { startBar: number; bars: number }): SectionMark[];
export interface ChartInput { chords: readonly { bar: number; beat: number; symbol: string }[]; bars: number; meter: MeterSpec;
  key: KeySpec | null; barsPerLine?: number /* 4 */; swing?: SwingSpec; title?: string; sections?: readonly SectionMark[] }
export interface ChartChord { beat: number; text: string /* "B♭7" */; symbol: string }
export interface ChartBar { bar: number /* 1-based */; chords: ChartChord[]; slashes: number; sounding: string | null; section: SectionMark | null }
export interface ChartLayout { title: string | null; swingText: string | null; lines: ChartBar[][] }
export function chartLayout(input: ChartInput): ChartLayout;          // four bars a line, a slash per beat
export function chartChordText(symbol: string): string;              // lead-sheet display: "Bb7" → "B♭7", "Co" → "C°"
```

**What a host passes.** A sectioned piece: `sections: sectionMarks(formView.sections)` (or `sectionsFromAst`); the
staff draws a label and a double barline at each. A 12-bar chart (U11.L05–L06, C5, X2): `chartLayout({ chords, bars:
12 | 24, meter, key, swing })` with `chords` from the harmony view's slots (`{ bar: cycle, beat, symbol: code }`) or
the content's chart; the DOM view (workbench / lesson) draws lines of four bars with a slash per beat and the symbol
over its beat. Minor signatures, raised 6/7 accidentals, blue notes by direction and "Swing 8ths" need nothing new
(`wave5.test.ts` pins them). Dominant sevenths engrave as "G7" through `chordSymbolDisplay`. Pickups and c4: bar
numbers in charts and section labels count from the first full bar (`ChartBar.bar` is 1-based cycles; with a pickup
the host passes `startBar` 1 and the chart starts at the first full bar).

### 3.4 `@oak/strudel` and `@oak/audio` — the scope and spectrum panel, visual probes

```ts
// @oak/strudel — ScopeTap (types.ts) gains:
readonly source: ScopeSource; setSource(source: ScopeSource): void;   // track → StrudelNotBuiltError until sound taps it
export type ScopeSource = { kind: "master" } | { kind: "track"; label: string };
// @oak/strudel/probes (pure; also re-exported from "@oak/strudel")
export type VisualProbeKind = "filter" | "envelope" | "harmonics" | "delay";   // content-kit ProbeKind + delay
export interface FilterProbe { kind: "filter"; filter: "lpf" | "hpf" | "bpf"; cutoff: number; q: number; slope: 12 | 24 }
export interface AdsrProbe { kind: "envelope"; attack: number; decay: number; sustain: number; release: number }
export interface HarmonicsProbe { kind: "harmonics"; amplitudes: number[]; source: "wave" | "partials"; wave: string | null }
export interface DelayProbe { kind: "delay"; wet: number; time: number; feedback: number }
export type VisualProbe = FilterProbe | AdsrProbe | DelayProbe | HarmonicsProbe;
export const SYNTH_ENVELOPE_DEFAULTS = { attack: 0.001, decay: 0.05, sustain: 0.6, release: 0.01 };   // superdough synths
export const DELAY_DEFAULTS = { feedback: 0.5, syncCycles: 3 / 16, maxFeedback: 0.98 }; export const FILTER_Q_DEFAULT = 1;
export function adsrValues(set: { attack?; decay?; sustain?; release? }, defaults?): AdsrProbe;   // superdough getADSRValues
export function adsrCurve(p: AdsrProbe, holdSec: number): [number, number][];
export function logFrequencies(n?: number, min?: number, max?: number): number[];
export function filterCurve(p: FilterProbe, freqs: readonly number[], sampleRate?: number): number[];  // dB, Web Audio biquad
export function delayTaps(p: DelayProbe, opts?: { floor?: number; max?: number }): [number, number][];
export function waveHarmonics(wave: string, n?: number): number[] | null;    // sine, saw 1/n, square odd 1/n, triangle odd 1/n²
export function harmonicsOf(value: Record<string, unknown>, n?: number): HarmonicsProbe | null;   // `.partials([…])` first
export function probeOf(kind: VisualProbeKind, value: Record<string, unknown>, cps?: number): VisualProbe | null;
  // reads cutoff/resonance, hcutoff/hresonance, bandf/bandq, ftype, attack…release, partials, s, delay/delaytime/delayfeedback/delaysync
export function fakeScopeTap(o?: { sampleRate?; fftSize?; partials?; f0? }): ScopeTap & { open(panels: ScopePanel[]): void };
// @oak/audio (scope.ts, pure)
export function triggerIndex(wave: ArrayLike<number>, level?: number): number;     // rising crossing: a held note stands still
export function steadyWave(wave: ArrayLike<number>, count?: number): Float32Array;
export interface SpectrumBand { lowHz: number; highHz: number; db: number }
export function spectrumBands(spectrum: ArrayLike<number>, sampleRate: number, o?: { bands?; minHz?; maxHz?; floorDb? }): SpectrumBand[];
export function harmonicLevels(spectrum: ArrayLike<number>, sampleRate: number, f0: number, n?: number): (number | null)[];
```

- One analyser, post-limiter, on the master bus (`OakStrudel.scope`, unchanged); `.scope()` / `.fscope()` in code put
  `"scope"` / `"fscope"` in `EvalOutcome.panels` and in the tap's store. The panel draws `steadyWave(tap.wave())`
  and `spectrumBands(tap.spectrum(), tap.sampleRate)`; A1.L01's harmonics read `harmonicLevels` at the note's f0
  next to the `harmonics` probe's theory series.
- A probe is computed from the step track's first hap after each run (`probeFromHaps` in `app/src/lib/scope-panel.ts`);
  it never evaluates code. Defaults are superdough's as installed (`node_modules/superdough`); the sound engineer pins
  them against the audibility harness. Only `audible: true` controls are taught (contracts §3.1 rule 7).

## 4. App seams (`app/src/lib`, frozen after Foundation)

### 4.1 Query hooks (`queries.ts`) and the confirmed call (`api.ts`)

```ts
export const useSideLessons: () => UseQueryResult<SideLessons>;            // GET /side-lessons
export const useLadderSongs: () => UseQueryResult<{ items: LadderSong[] }>; // GET /ladder/songs
export const useTranscriptionConfirmVersion: () => mutation<"transcriptions.confirmVersion">;  // → transcriptions.get, .list
// changed invalidations: lessons.complete → + sideLessons.list; session.end → + sideLessons.list
// api.ts
export function callConfirmed<N extends JsonEndpointName>(name: N, action: ConfirmAction, target: string, input?): Promise<EndpointOutput<N>>;
  // c11: after the capstone dialog asked "Replace the earlier recording?": callConfirmed("album.putAudio", "album.audio.replace", `${trackId}/v${v}`, input)
```

Until the server builds an endpoint it answers 501 (`OakApiError.code === "not_implemented"`, never retried);
`ErrorState` reads "Not built yet". Code against the types now.

### 4.2 Idempotency — unchanged. `ladder.submit` keeps its `idempotencyKey` (L5 adds `phrase`, L6 the new stages).

### 4.3 Lenses (`lenses.ts`)

```ts
export type { LineLensId };                                       // "sections" | "bassRoles" | "blueNotes"
export const LINE_LENS_IDS: readonly ["sections", "bassRoles", "blueNotes"];
export const LINE_LENS_UNLOCKS: { sections: "tb.lens.form"; bassRoles: "tb.rootNotes"; blueNotes: "scale.blues" };
export const LINE_LENS_LABELS: { sections: "Sections"; bassRoles: "Bass roles"; blueNotes: "Blue notes" };
export type LineLensPrefs = Record<LineLensId, boolean>;
export function lineLensPrefs(prefs: LensPrefs): LineLensPrefs;              // absent = on
export function lineLensAvailability(unlocked: ReadonlySet<string>): LineLensPrefs;
export function effectiveLineLenses(prefs: LensPrefs, unlocked: ReadonlySet<string>): LineLensPrefs;
export interface LineLenses { prefs; shown; available: LineLensPrefs; set(id: LineLensId, on: boolean): void; toggle(id: LineLensId): void }
// Lenses gains:  lines: LineLenses   (same store, same optimistic save and rollback)
// c14: CHORD_LENS_UNLOCKS.chordSymbols is now "tb.feature.chord-symbols" (was "tb.arp")
```

- Stored as three optional booleans of `LensPrefsSchema` (`sections?`, `bassRoles?`, `blueNotes?`; absent = on).
- **Saving (gate):** every lens switch updates the bootstrap cache at once; the saves run one at a time
  (`queueLensSave`), each sending the preference stored when its turn comes, and nothing invalidates the bootstrap on
  success. A failed save rolls back to the last saved preference with a toast. (Concurrent PUTs of the whole object
  had left the switches on a state nobody chose after a burst of Shift+O/B/U/D/S/N.)
- **The degree lens in minor** needs no switch: the existing degree and solfège lenses already label through
  `@oak/theory` (`degreeOf`, `degreeLens`), so in a minor key they say ♭3 ♭6 ♭7 and me le te, and the raised 6/7 of
  melodic and harmonic minor say 6/7 and la/ti. Views must pass the step's or the piece's real key (minor), never a
  relative major.
- **Section lens** (ribbon over the roll and the staff, `tb.lens.form`, U09.L02): sections from `formView` via
  `formSectionsOf` (§4.4). **Bass-role lens**: marks root / fifth / octave / approach on the bass line from
  `bassView(...).notes[].role` — gated on `tb.rootNotes` (U08.L01) until the requested row `tb.lens.bass-roles`
  (U08.L02) exists. **Blue-note lens**: marks notes where `blueNoteOf(midi, key)` is not null (key read as major),
  gated on `scale.blues` (U11.L03).
- Proposed keys (the kit owner registers them in `app/src/ui/keys` and the shortcut sheet; checked free at
  Foundation): `Shift+O` sections / form map, `Shift+B` bass roles, `Shift+U` blue notes, `Shift+W` the scope panel.
- Who wins: as wave3.md §4.3 — inside a lesson step the content decides (`StepUi.initialPanels` "form"); elsewhere the
  lenses decide.

### 4.4 The form view and the scope panel inside a step (`form-view.ts`, `scope-panel.ts`, `panels.ts`)

```ts
// form-view.ts
export interface FormViewSection { label; tag; text /* "Chorus 2" */; startBar /* 0-based */; bars; tracks: string[]; energy: number; letter: string }
export interface SectionLoop { from: number; bars: number; tag: string }            // = the Workbench LoopRegion + tag
export interface FormViewHostProps { sections: readonly FormViewSection[]; energy: readonly number[]; totalBars: number;
  inconsistent: string | null; currentBar: number | null; loop: SectionLoop | null; onLoop(loop: SectionLoop | null): void }
export function formSectionsOf(view: FormView | null): FormViewSection[];
export function formProblemOf(view: FormView | null): string | null;
export function sectionLoopOf(section): SectionLoop;
export function sectionAtBar(sections, bar: number): FormViewSection | null;
export function stepSection(sections, current: FormViewSection | null, dir: 1 | -1): FormViewSection | null;
export function loopBarsForForm(totalBars: number, loopBars: number): number;
// scope-panel.ts
export interface StepProbe { kind: ProbeKind; track: string | null }
export interface ScopePanelHostProps { panels: ScopePanel[]; source: ScopeSource; probe: StepProbe | null }
export function stepProbeOf(ui: Pick<StepUi, "probe"> | null | undefined): StepProbe | null;
export function stepScopePanelsOf(ui: Pick<StepUi, "initialPanels"> | null | undefined): ScopePanel[];   // scope → wave, spectrum → fscope
export function scopePanelOf(ui, fromCode?: readonly ScopePanel[]): ScopePanelHostProps;
export function probeUnlocked(kind: ProbeKind, unlocked: ReadonlySet<string>): boolean;      // PROBE_TOOLS
export function probeFromHaps(probe: StepProbe, haps: readonly LiveHap[], cps: number): VisualProbe | null;
```

- **Form view.** The Workbench analyses the evaluated code (`formView`, `@oak/grader`, in the grader host it already
  uses for analysis), turns it into `FormViewSection[]` and draws the ribbon (lens) and, when `form` is open, the form
  map. A click (or `Enter` on a focused section; arrows move with `stepSection`) calls `onLoop(sectionLoopOf(s))`;
  the Workbench feeds that region to its existing `useLoopPlayback` (hidden PatternPlayer, `.ribbon(from, bars)`),
  with `loopBars = loopBarsForForm(totalBars, loopBars)` so a late section can loop. `inconsistent` shows the rule's
  message ("Write one arrange() per labelled track"), never a broken ribbon. Sections restart (§6.3 item 7): the ribbon
  shows the code's sections exactly.
- **Scope panel and probes.** The lesson host passes `scopePanelOf(step.ui, outcome.panels ?? [])` to the Workbench
  (prop name `scopePanel`, the workbench engineer adds it), which opens the panel when `panels` is non-empty and
  `tb.scope` (or `tb.fscope`) is unlocked, sets `oak.scope.setSource(source)` (master today; a track source throws
  `StrudelNotBuiltError` until sound builds it — catch and fall back to master with a one-line note), and draws the
  probe (`probeFromHaps` after each run; `null` → a hint "Add .lpf() to see its curve"). Panels: content-kit
  `WORKBENCH_PANELS` now include `form`, `scope`, `spectrum` (`WORKBENCH_PANEL_TOOLS`: `tb.lens.form`, `tb.scope`,
  `tb.fscope`); `initialPanelsOf` already maps them; `NO_PANELS` has them false.
- Quiet mode and no audio: the probes are pure and draw without sound; the scope shows "Press Play to see the wave"
  while the transport is stopped. Reduced motion: the scope redraws at most 10 times a second, without easing.

## 5. API additions (`packages/api`, additive)

Every new endpoint is a contract entry with a zod DTO (`WAVE5_ENDPOINTS`). **All three are built** (integration,
2026-11-13): `WAVE5_PENDING` in `server/src/routes/routes.test.ts` "Wave 5 endpoints" is empty, and no Wave 5 route
answers 501.

| Name | Method · path (under `/api`) | Body / query | Response | Route file | Status | Needed by |
|---|---|---|---|---|---|---|
| `sideLessons.list` | GET `/side-lessons` | | `SideLessonsSchema` `{ open, items: SideLessonState[], next }`; each item `lessonId, title, status, estMinutes, completedAt, offer?` | course.ts | built | session (Today chip, Coda "one more"), map, progress, kit palette |
| `ladder.songs` | GET `/ladder/songs` | | `{ items: LadderSong[] }` (`songId, title, year, level 5|6, phrases, status, lockedReason, passedPhrases, passedStages, passedLines?` (L6)) | practice.ts | built | transcribe (L5/L6 picker), session |
| `transcriptions.confirmVersion` | POST `/transcriptions/:id/versions/:v/confirm` | `{ strictLintPassed: true }` | `TranscriptionVersionSchema` (flag cleared); 400 naming the first strict-lint finding, 409 on an unflagged version, 404 unknown | library.ts | built | transcribe (c2 notice) |

Changed shapes (all additive; every Wave 4 body still parses — `packages/api/src/wave5.test.ts`):

| Schema | Change | Owner of the behaviour |
|---|---|---|
| `LensPrefsSchema` | `sections?`, `bassRoles?`, `blueNotes?: boolean` (absent = on); `LINE_LENS_IDS` | works now |
| `CourseProgressSchema` | `sideLessons?: { done, total }` | server |
| `SessionPlanSchema` | `sideLesson?: { lessonId, title, estMinutes, placement: "alternative" \| "after-core", note } \| null` | server (planner), session |
| `SessionSummarySchema` | `gym?: { gymId, kind, transcriptionId, title, ladder: { level, realism, bestScore, gradedPass, realismChange, levelUp } \| null, ownAudio: { checklist, versionsToday, regions } \| null } \| null` (c10) | server fills, session draws |
| `CapstoneStateSchema` | `checkedVersion?: { sketchId, sketchVersion } \| null`, `draftChangedSinceCheck?: boolean` (c1) | server, capstone |
| `CapstoneCheckStateSchema` | `after?: string[]` (content `PhraseCheck.after`), `passAt?: number` (X2 0.90 / 0.85 / 0.85) | server, capstone |
| `TranscriptionVersionSchema` | `reviewBeforeRun?: true` (c2) | server (migration), transcribe |
| `VoicingGateSchema` | `passedCodeImported?: boolean` (c2: the Workbench runs `passedCode` only after the strict lint) | server, workbench |
| ladder | `ladderLevel` 1–6 everywhere (`LadderState`, `LadderNext`, `LadderLevelSet`, `GymPlan.next`, scores); `LADDER_STAGES` = bass quality rn changes melody (`LadderItem.stages`, `LadderSubmit.stage`); `LadderNext.songId?`; `LadderItem.song?`, `phrases?`; `LadderSubmit.phrase?` | server — built: L5 per phrase (`phrase` 1-based), L6 `stage` bass → changes → melody (melody with `phrase` = the 4-bar line) |
| `CONFIRM_ACTIONS` | `"album.audio.replace"` (c11) | server, capstone |
| `EndpointDef.confirmIf` | `album.putAudio.confirmIf = "album.audio.replace"`: the client sends `X-Oak-Confirm` when given a nonce; the server answers 428 when a recording exists and no valid nonce for `<trackId>/v<v>` came, and needs none otherwise | server, capstone |
| constants | `SIDE_LESSON_IDS`, `SIDE_LESSON_GATE` (U03.L02), `WAVE5_SEED_POINTS` (+ `"imported own-audio (c2)"`, integration), `LADDER_STAGES`, `LINE_LENS_IDS` | — |
| `SideLessonStateSchema` | integration: `offer?: string` — the one-line offer (the A1 spec's lines; the same text ends `SessionPlan.sideLesson.note`) | server; session, lesson, kit read it |
| `TranscriptionDetailSchema` | integration: `given?: { pickup: PickupSpec \| null; swing: SwingSpec \| null; form: string \| null }` on pd-song projects (absent for own audio and generated items) | server; transcribe, capstone (X1/X2) |
| `TranscriptionSettingsSchema` / `TranscriptionPatchSchema` | integration: `swing?: SwingSpec \| null` (own-audio feel; `null` straight). `PATCH /transcriptions/:id { swing }` stores it in `settings.swing`; `PUT …/settings` accepts it too | server; transcribe |
| `LadderSongSchema` | integration: `passedLines?: number[]` on L6 songs (the 4-bar melody lines passed; = `passedPhrases` for L6) | server; transcribe |
| `BackupInfoSchema` | integration: `albumAudio?: { trackId, version, bytes }[]` (each album recording; sums to `albumAudioBytes`) | server; kit (Settings › Data) |

Server notes from integration (2026-11-13), for every reader of the endpoints above:

- **Stimulus.** A pd-song project's stimulus spans `answerKey.bars + 1` cycles when the song has a pickup (the pickup
  bar is the code's first cycle) and is read in the song's own meter. A song that declares swing (the L6 blues) is
  marked `performance.swung`, so realism R2 plays the feel (contracts §6.12).
- **Family levels.** The server's open level per family is `@oak/drills` `maxOpenLevel` (a gate of several lessons
  needs all of them; a family moves past a level only when all its categories are open). Checkpoint family items and
  their level-setting result never go above it.
- **Seeded drafts** never contain starter markers (`⟪…⟫`, `⟦id⟧`): a starter is saved through `stripMarkers`.

### 5.1 Side lessons (A1.L01–L04; contracts §2.6, §9.6)

- **Open** once U03.L02 is completed (`SIDE_LESSON_GATE`); `sideLessons.list` lists all four with `status`, and `next`
  is the first unfinished one in order (A1.L02 after A1.L01, and so on; they are a track, in order).
- **Offered, never displacing the core lesson.** The planner never puts a side lesson in the New block. It sets
  `SessionPlan.sideLesson` with `placement: "alternative"` (a chip beside today's session, also in `alternatives`
  with `kind: "lesson"`), or `"after-core"` once today's planned session ended ("One more, if you like: Filters,
  about 15 minutes"). At most one offer a day; none on a checkpoint or capstone day, none during a return warm-up.
- **Started** with `session.start { kind: "lesson", mapItemId: "A1.L02" }` — a normal lesson session (its warm-up
  follows §7.4 budgets); **completed** with `lessons.complete`. **Counted** (§9.6): 1 in track A (`progress.sideLessons`,
  never `mapDone` of the core), a streak day, 1 in the pace estimate. Its unlocks (`tb.scope`, `tb.hpf`, `tb.adsr`, …)
  are granted on completion like any lesson's (§3.1 rule 2; `tb.lpf` and `tb.delay` have alternative sites, rule 11).
- A side lesson started and left is `in_progress` and resumes like any lesson; it never blocks the core.

### 5.2 Capstones C3–C5 and X2

- Three sessions (C3.S1–S3) need nothing new: `capstones.sessions` lists every session; `current` moves on with
  `capstones.completeSession`. Release at the session whose content says `release: true` (C3.S3, C4.S2, C5.S2, X2.S2).
- **X2's order** (bass ≥ 0.90 → changes ≥ 0.85 → melody ≥ 0.85, contracts §6.6): content `PhraseCheck.after` names
  the checks that must pass (or be revealed) first; the server returns them as `CapstoneCheckState.after` with
  `passAt`, and keeps a check `open: false` until its `after` are passed. X2.S1 holds bass then changes, X2.S2 the
  melody. Grading is `gradePhraseCheck` in capstone mode (bass = L3's bass matcher, changes = harmony rn triad depth).
- **c1:** `capstones.get` returns `checkedVersion` and `draftChangedSinceCheck`; the Brief shows "Check again before
  you release" whenever the latter is true (release would 409).
- C5's swing is measured on the hat or ride line (`track: ['hats', '@drums'], drums: [...], subdivision: 8`, ratio
  1.6–2.4); "bar 12 contains V" is `contains-rn` with `section: { bars: [12, 12] }` (feature `rubric.section`).

### 5.3 The ladder L5 and L6

- `ladder.songs` lists the repertoire pool (contracts §2.8): L5 Aura Lee, Red River Valley, Shenandoah, Simple Gifts,
  Oh! Susanna (Drunken Sailor and Scarborough Fair locked until U14; Amazing Grace never); L6 St. Louis Blues (12-bar
  strain), Memphis Blues, Careless Love, Frankie and Johnny (Old Joe Clark and The Entertainer per their lessons). A
  song whose answer key is not `verifiedBy` a human is `locked` ("Being checked").
- `ladder.next { level: 5 | 6, songId? }` creates a `pd-song` project (pattern source; the hidden code stays on the
  server) and returns `song` and `phrases`. L5: one submission per phrase (`LadderSubmit.phrase`), graded with
  `gradeSongLadder` in lesson mode at 0.85, key-relative. L6: `stages: ["bass", "changes", "melody"]`, each opening
  after the one before passed, graded in capstone mode at 0.90 / 0.85 / 0.85.
- **Graded pass and level-up** (wave4.md §5.4 rule, extended): L5 counts a graded pass when every phrase of a song
  passed unrevealed; L6 when all three stages passed. The level-up to L5 is offered after two graded L4 passes at R2+
  on two days, and to L6 after two graded L5 songs once U11.L05 (the 12-bar form) is completed — L6 material is blues; L7/L8 are not ladder levels a learner sets (own audio, CF-T).
  Released X1 counts as an L5 pass and X2 as L6 (already so in `progressReport`).
- Realism applies to L5/L6 as to L1–L4 (§6.12; R2 swing on the blues).

### 5.4 Gym Coda, imported code, reviews (c2, c10, c11)

- **c10:** `session.summary` of a gym day carries `gym` (ladder: level, realism, best score, graded pass, the realism
  change and an offered level-up, each announced once; own audio: today's checklist, versions and regions). The
  session engineer draws an own-audio card and a ladder card from it.
- **c2:** a backup import sets `reviewBeforeRun` on every imported transcription version (new numbered migration,
  a flag column) and marks imported lesson attempts; Transcribe shows such a version as text with "Review before
  running", lints it with the strict profile in the browser, and on "Run it as mine" calls
  `transcriptions.confirmVersion` (the server re-lints strictly). An imported attempt never supplies
  `gates.voicing.passedCode` without `passedCodeImported: true`.
- **c11:** the transcription review records the version it was asked about (`ReviewRecord.version` = the
  `transcriptionVersion` of the request; new numbered migration). Re-recording: the capstone dialog asks "Replace the
  earlier recording of v2?", then `callConfirmed("album.putAudio", "album.audio.replace", "<trackId>/v<v>", …)`.
  Own-audio checklist changes give self-reported evidence at most once per project per learner day.

## 6. Dev seeds (`POST /api/dev/seed { point }`) — the server engineer builds these FIRST

As in Wave 4: every point gives a learner with a working mic and a calibrated range (`mic: false`: Quiet mode), last
activity yesterday, today a fresh day; every seeded release has a recording (`recordings: false`: none); each walks
the default order of contracts §2.5 (gym slots included) and needs the content it walks through — until a lesson is
authored the point answers 400 naming the missing lesson. `GET /api/dev/seed` lists what exists.

| Point | Must contain (done, the last yesterday) | Today |
|---|---|---|
| `after X1 (U08.L02 next)` | X1 released (C2 and X1 in the album) and U08.L01 done (it precedes GYM.03 in the order) | U08.L02 |
| `after U08.L04` | through U08.L04 (`tb.const`, `fam.rhy.groove-lock` seeded) | U08.L05 |
| `after U09.L01` | U08.L05, GYM.04 (ladder), U09.L01 | U09.L02 (`arrange()`, form lens) |
| `after U09.L04` | through U09.L04 (`tb.signal`, `tb.range`, `tb.segment`) | GYM.05 (own-audio fallback when no project) |
| `U09.CP due` | GYM.05, U09.L05, U10.L01 | New block U09.CP |
| `C3 open` | U09.CP passed | C3.S1 |
| `C3.S2 done` | C3.S1–S2 completed with a saved draft (V C V C sections, verse and chorus melodies, bass on the kick) | C3.S3 |
| `C3 released` | C3 released (v1, recording, liner notes, no review) | GYM.06 |
| `after U10.L02` | GYM.06, U10.L02 (relative/parallel; `deck.key.signature` minor) | U10.L03 |
| `after U10.L05` | U10.L03–L05 (minor chords, the aeolian loop) | GYM.07 |
| `after U10.L08` | GYM.07, U10.L06–L08 (harmonic and melodic minor) | U10.L09 |
| `U10.CP due` | U10.L09, GYM.08, U11.L01 | New block U10.CP |
| `C4 open` | U10.CP passed | C4.S1 |
| `C4 released` | C4.S1–S2, released | GYM.09 |
| `after U11.L03` | GYM.09, U11.L02–L03 (blues scale; `snd.crunch`, `tb.distort`) | U11.L04 |
| `after U11.L06` | U11.L04–L05, GYM.10, U11.L06 | U11.L07 (swing) |
| `U11.CP due` | U11.L07–L08, U12.L01 if authored (else left out, as Wave 4 did for U08.L01), GYM.11 | New block U11.CP |
| `C5 open` | U11.CP passed | C5.S1 |
| `C5.S1 done` | C5.S1 completed: a draft with one 12-bar chorus of dominant sevenths, swung hats, a riff | C5.S2 |
| `C5 released` | C5 released | X2 gate: open (C5 released) — today X2.S1 |
| `X2 open` | = `C5 released` (alias kept for specs that name X2) | X2.S1 |
| `X2.S1 done` | X2.S1 completed on its first written song (Careless Love: St. Louis Blues has no answer key yet): bass passed (≥ 0.90), changes passed; the draft is tagged with the song and kept in its key (F major) | X2.S2 |
| `X2 released` | X2 released | U12.L02 once authored, else a review day ("The next lessons are still being written") |
| `ladder L5` | through U10.L05 (as built) with the ladder at L5, realism R0, Aura Lee started (phrase 1 passed) | GYM.07 (ladder L5) |
| `ladder L6` | through `C5 released` with the ladder at L6, R1, one L6 song with the bass stage passed | a gym slot (ladder L6) |
| `ladder level-up due` | through U09.L04 (as built), ladder at L4 with two graded L4 passes at R2 on the last two days: `levelUp: { to: 5 }` offered in `GET /ladder` | GYM.05. The Coda announces a level-up only in the session whose pass earned it, so today's Coda does not; the c10 browser test (`w5-coda.pw.ts`) earns it from `after U09.L04` |
| `ladder realism-up due` | through U09.L04 (as built), ladder L2 at R1 with one session ≥ 0.9 at R1: the next session ≥ 0.9 raises realism | GYM.05 (ladder L2, R1) (c10) |
| `side lesson offered` | through `after U03.L02` (gate met), no side lesson done | U03.L03 with `sideLesson` A1.L01 (`alternative`) |
| `A1.L02 done` | through `after U03.L02` plus A1.L01 and A1.L02 completed (`tb.scope`, `tb.partials`, `tb.hpf`, `tb.bpf`, `tb.lpq`, `tb.lpenv`; `tb.lpf` was already granted at C1.S1, its other site) | U03.L03 with `sideLesson` A1.L03 |
| `imported own-audio (c2)` (integration) | the own-audio project (through U07.L07) as if restored from a backup (`markForReview`): every transcription version `reviewBeforeRun`, sketches flagged, typed attempts marked imported | GYM.02 (own audio); Transcribe's c2 notice is tested against the real confirm endpoint (`w5-own-audio.pw.ts`) |

The own-audio gym Coda (c10) uses the existing Wave 4 point `own-audio project`.

## 7. Ports, environment, browser suites

Environment variables are unchanged (`OAK_PORT`, `OAK_DEV`, `OAK_VITE_PORT`, `OAK_API_PORT`, `OAK_DATA_DIR`,
`OAK_TUTOR_FAKE`, `OAK_NOW`; wave2.md §2). Nothing new.

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
| test-speed | every stack + 300 (Foundation to end of Build) | — |
| (gate) | journey 5212 / 8812 (+ 8792), review 5221 / 8821, platform 5173 / 8787 / 8790 | — |

- Each config's `dataDirName` is unique (`test-results/stacks/<name>`, wiped at every start). A new config takes a new
  name, never another config's, and a config in a new folder uses the owner's second pair, never the primary pair of an
  existing config. The root `playwright.config.ts` discovers every `app/src/**/e2e/playwright.config.ts`,
  `e2e/*/playwright.config.ts` and `packages/*/e2e/playwright.config.ts` that exports `area` (do not edit it).
- Configs build on `e2e/support/stack.ts` (test-speed owns it).
- The gate journeys for Wave 5 (gate owner): bass and form (U08.L02 → U09.L02 with the section ribbon and a section
  loop), C3 over three days, minor (U10.L05 aeolian loop in Studio with the degree lens in minor), C4, blues (U11.L05
  12-bar chart, U11.L07 swing), C5 and X2, a side lesson from Today, ladder L5, and each again in Quiet mode.
- The closer's journeys (built): `e2e/journey/w5-days.pw.ts` (U08.L01, a U09 day with the form map, U09.CP, a U10 day
  with the minor-degree warm-up, U11.L07's shuffle, A1.L01 from Today with the scope panel, a gym day on L6; the U08
  and U10 days again in Quiet mode) and `e2e/journey/w5-capstones.pw.ts` (C3, C4 also in Quiet mode, C5, X2 and the
  eight-track album); `prod.pw.ts` adds a U10 session and the C4 workspace on the production build, offline.

### 7.1 Browser tests (the reworked runner; test-speed, Build)

- **The command.** `bun run e2e` (`scripts/e2e-parallel.ts`) builds once, writes the fake-microphone fixtures once,
  runs the quiet files alone first, runs everything else `--jobs` processes at once (auto: 2–6 from the free cores),
  re-runs each failure alone, and prints `E2E TOTAL`, the ten slowest files and every test over 90 s. `bun run
  e2e:serial` is the old single process; `bun run e2e --plan` shows units, shards and files without running anything.
- **One project or a few:** `bun run e2e --project lesson [--project review]`, or `OAK_E2E_SHIFT=300 bunx playwright
  test --project=lesson [file]` (the `=` form: the space form eats file arguments). **Changed only:** `bun run e2e
  --since origin/main` (the path → project table is `SINCE_MAP`; shared paths select everything).
- **The shift.** `OAK_E2E_SHIFT=<multiple of 10>` (or `--shift`) moves every port of every e2e server and suffixes data
  and output dirs with `-s<n>`; shards take base + 100·k. Specs read ports from their config's `stack` or
  `shifted()`, never literals.
- **Groups.** Quiet files (audio measuring specs, strudel sounds/editors, voice gate/settings/bleed, transcribe
  ab-drift/hum/own-audio, review-studio transcribe, workbench loop/workbench) run alone; projects with more than 7
  minutes of tests are sharded, so a spec file never depends on another file having run first.
- **Outcomes.** Every listed test is accounted for (passed, failed, flaky, skipped by the spec, did not run); a test
  that fails beside others and passes alone is **load-sensitive** and fails the run, named. Durations go to
  `test-results/e2e-durations.json` and balance the next run's shards.
- **The rules.** No test over 90 s (the capstone journeys and C3's take are the documented exceptions: real-time
  recording); every test starts from a dev seed; never `.catch()` an auto-waiting read without a short timeout
  (`textNow()` in `e2e/support/ui.ts`); the test Vite (`e2e/support/vite.e2e.config.ts`) has no HMR and watches
  nothing; never loosen an assertion to pass under load — move the file to QUIET with the evidence.

## 8. What is frozen

After Foundation, import from these and never edit them; put what you need in your own folder and report under
`apiNotes` anything that should be promoted:

- `app/src/lib/**` (except `mic*.ts` — audio — and `tutor-stream.ts` — tutor), `app/src/main.tsx`,
  `app/src/router.tsx`, `app/src/routes/__root.tsx`, `app/vite.config.ts`, `app/index.html`, `app/public/**`.
- `app/src/ui/**` and `app/src/styles/**` for everyone except kit.
- `e2e/support/**`, root `playwright.config.ts` and the per-area configs (test-speed), root `package.json`,
  `bun.lock`, `bunfig.toml`, `biome.json`, root `tsconfig*.json`, `node_modules`.
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
  Run your project only: `bun run e2e --project <yours>` (the whole `bun run e2e` is for the closer and the gate).
- **No stray specs or scratch files.** Temporary files go under your own directory in the scratchpad
  (`…/scratchpad/w5/tmp-<your key>/`) or `test-results/`, and are deleted before you finish. No report or FINDINGS
  files in the repo.
- **Fast tests.** No Playwright test takes longer than about 4 minutes; every spec starts from a dev seed (§6) and
  `PUT /api/dev/clock` instead of replaying days.
- **Block Vite's HMR websocket** in your specs: `await page.routeWebSocket(/.*/, () => {})` before the first `goto`
  (other engineers' edits reload the page and can load a module twice).
- Typecheck what you touch (`bunx tsc --noEmit -p <tsconfig>`; interfaces.md §1.4), then `bun run typecheck`,
  `bunx biome check --write <your paths>` (only your paths) and `bunx biome ci <your paths>`. Failures in another
  engineer's unfinished paths are reported, not fixed.
- Music claims and examples are verified with headless Strudel (`import { evalHeadless, midisOf } from
  "@oak/grader/testing"`), `bun run theory …` or `@oak/theory` (`minorKeyChords`, `twelveBarChords`, `blueNoteOf`,
  `bassRole`, `readChord`, `romanText`, `schemaOf`).
- The tutor only through the scripted fake backend (`OAK_DEV=1 OAK_TUTOR_FAKE=1`, wave2.md §5). Never the real CLI,
  never an API; nothing contacts a non-localhost host at runtime or in tests.
- **Results**: as your last step, write your full structured result as markdown to
  `/private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/w5/<label with ":" → "-">.md`.

## 10. Definition of done for a surface

(wave2.md §8, with the Wave 3, 4 and 5 additions.)

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
   the tutor drawer closed (ux §10.11). No horizontal overflow.
5. **Reduced motion**: with `prefers-reduced-motion` (or Settings → Appearance) nothing transforms for longer than
   120 ms; content appears at once.
6. **Tests**: logic in `*.test.ts` (pure functions, reducers, machines), behaviour in `*.pw.ts` on your own stack,
   including a keyboard-only path and the tutor through the fake backend where the surface talks to it. A spec that
   runs broken learner code allows Strudel's one `console.error`.
7. **Seams kept**: you only edited your paths; you used the contracts of §3–§5 as written; anything you needed from
   shared code is in your folder and listed in `apiNotes`.
8. **Green**: `bun test --isolate <your paths>`, your Playwright suite, `bun run typecheck`,
   `bunx biome check <your paths>`.
9. **Works in Quiet mode** (Wave 3): with `voice.get.quiet` true (or no mic) every sing part shows its fallback,
   nothing waits for a voice, nothing is gated, nothing reads as a failure, the mic chip says Quiet; hum-to-draft
   offers typing instead. A spec covers the Quiet path.
10. **Works with lenses on and off** (Waves 3–5: note, chord, and now section, bass-role and blue-note lenses): with
    each lens on and off (and locked, before its unlock) your surface lays out without overflow or overlap, labels
    appear where the lens says and nowhere else, and nothing depends on a label being present.
11. **Music is right** (Wave 4): every chord name, numeral, cadence, function and degree your surface shows comes
    from `@oak/theory` / `harmonyView`, never from a local table; RN answers compare `(degree, quality, inversion)`.
12. **Minor is minor** (Wave 5): in a minor key, degrees read 1 2 ♭3 4 5 ♭6 ♭7 with do-based syllables (do re me fa
    sol le te; raised 6 and 7 are la and ti), numerals read i ii° III iv v VI VII (V and vii° with the raised 7),
    and nothing on your surface relabels a minor piece in its relative major. Blue notes, pentatonic and blues
    degrees come from `@oak/theory` (`blueNoteOf`, `scaleDegrees`).
13. **Form and time are right** (Wave 5): sections, bar numbers, charts and loops count from the first full bar after
    a pickup (c4), come from `sectionsFromAst` / `formView` (never re-parsed), and a swung piece shows "Swing 8ths"
    and grades on the straightened grid (§6.10).
14. **Side lessons stay optional** (Wave 5): nothing on your surface makes A1 look required, displaces the core
    lesson, or counts it in the core map; a learner who never takes one loses nothing.

## 11. Wave 5 content kinds: who renders, who grades

From `packages/content-kit/src` as re-read at the end of Foundation (2026-11-13; `CONTENT_SCHEMA_VERSION` 4;
`IMPLEMENTED`, `PLANNED` and `SCHEMA_FEATURES` in `implemented.ts`). "Grades" is always the grader
(`gradeExercise` / `gradeCapstone` / `gradePhraseCheck` / `gradeSongLadder`); a kind or feature in `PLANNED` is
rejected by content CI in a lesson until its owner moves it into `IMPLEMENTED` with tests (the renderer's owner moves
UI kinds once they render; the grader engineer moves rules and matchers once graded with golden tests).

| Kind / field (status at Foundation) | Type (content-kit) | Renders | Grades | Notes |
|---|---|---|---|---|
| `form` answer (planned) | `{ ui: "form"; sections; vocabulary: "letters" \| FormSectionName[]; input: "label" \| "order"; sectionBars? }`; `Answer.sections`; `FORM_SECTION_NAMES`, `formLetters` | answers (a strip of section slots or ordered cards); hosted by lesson, checkpoint, drills-ui (`fam.frm.sections`) | grader (`grade/answers.ts`: both sides as letters by first appearance, `formLetters`) | U09.L01, L03; value `string[]`, sent as `answer.sections` |
| `bar-grid` answer (planned) | `{ ui: "bar-grid"; bars; perRow; entry: "rn" \| "symbol"; qualities; given? }` | answers (a chart grid; reuses the RN palette / chord-name picker per bar; lays out with notation `chartLayout`); hosted by lesson, checkpoint, drills-ui (`fam.frm.blues`), capstone (X2 changes view) | grader (bar by bar, degree + quality, never by string) | U11.L05–L06; value `string[]`, `answer.rn` or `answer.text` |
| `scale-builder` answer (planned) | `{ ui: "scale-builder"; tonic; input: "keyboard" \| "degrees"; palette?; range? }` | answers (keyboard pick or degree pad); hosted by lesson, checkpoint, drills-ui (`fam.key.scale-spell` L3–L4) | grader (as a pitch-class / degree set against `correct.degrees`) | U10–U11; value `(number \| string)[]`, `answer.midi` or `answer.degrees` |
| `controls` matcher (planned) | `{ m: "controls"; controls: ControlTolerance[]; track? }` (`linear` / `log` / `exact`) | lesson (A1 "match this sound": A/B against the hidden reference; the probe beside it) | grader — **stub** in `match/controls.ts` (score 0, `rubric.unknown`) until built | A1.L02–L04 |
| `bass-line` rule (planned) | `{ rule: "bass-line"; track; harmony?; roots?; members?: { allowed: BassMember[]; minRatio; each? }; approach? }`; `BASS_MEMBERS` | lesson Make lines, capstone checklist | grader — **built** (`rubric/wave5-rules.ts` on `bassNotes`) | U08.L01–L03, C3, C5 |
| `notates` rule (planned) | `{ rule: "notates"; view: "lead-sheet" \| "staff"; melody? }` | capstone checklist (C3 "the lead sheet renders") | grader — **stub** (fails "not built yet") until built with `@oak/notation` | C3 |
| `groove-lock`, `duration-sec`, `form`, `contrast`, `swing`, `syncopation`, `blues-form` rules (planned for content; analyzers exist since Wave 1) | `rubric.ts` | lesson Make lines, capstone checklist | grader (`RULES`) — golden tests per contracts §6.3 item 8 and §6.6 before they move to `IMPLEMENTED` | C3, C5, U08.L04, U09, U11 |
| `matches` rule (implemented in Foundation) | `{ rule: "matches"; reference; matcher; min }` | lesson Make lines | grader | U08.L01 reads the bass under each chord (`harmony` level `bass`) |
| `rubric.section` (planned feature) | `RubricRuleBase.section?: SectionRef` | capstone checklist, Make lines ("in the chorus", "bar 12") | grader (`resolveSection` on `sectionsFromAst`, or a bar window) | C3, C5 "bar 12 contains V" |
| `chord-qualities.depth` (planned feature) | `chord-qualities` + `depth: "seventh"` | capstone checklist | grader (from the `chord()` symbol, else the hand-voiced pcset; `isDominantSeventhPcs`) | C5 "every chord a dominant seventh" |
| `degree-set.any-of` (planned feature) | `degree-set` + `anyOf` + `minCount` | capstone checklist | grader | C5 "♭3 or ♭5 at least twice"; C4 ♭3 and ♭6 use `contains` |
| `ends-on-degree.over` (planned feature) | `ends-on-degree` + `over: string` (a numeral in the rule's key) | capstone checklist | grader (`romanParts` of the last chord) | C4 "ends on 1 over i" |
| `blues-form.choruses` (planned feature) | `blues-form` + `choruses?`, `quickChangeOk?` | capstone checklist | grader (`bluesForm`, `bluesView`) | C5 ≥ 2 choruses, standard or quick change |
| `step.probe` (planned feature) | `StepUi.probe: { kind: ProbeKind; track? }`; `PROBE_KINDS` filter / envelope / harmonics; `PROBE_TOOLS` tb.lpf / tb.adsr / tb.partials | lesson (passes `scopePanelOf(step.ui)`) → workbench (draws with `@oak/strudel/probes`) | — | A1.L01–L03 |
| `panel.wave5` (planned feature) | `StepUi.initialPanels` with `form`, `scope`, `spectrum` (`WORKBENCH_PANEL_TOOLS`: tb.lens.form, tb.scope, tb.fscope) | lesson (`initialPanelsOf`, `scopePanelOf`) → workbench (form map, scope, spectrum) | — | U09.L02+, A1.L01, A2.L01 |
| `capstone.check-after` (planned feature) | `PhraseCheck.after: string[]` | capstone (checks open in order; X2 workspace) | grader (`gradePhraseCheck`); server stores order (`CapstoneCheckState.after`, `passAt`) | X2 bass → changes → melody |
| `LessonMeta.side` (schema) | `side?: boolean` (implies `optional`) | session (Today chip / after-core offer), map (track A), lesson (normal host) | — | A1.L01–L04; server plans per §5.1 |
| Standard options | `FEEL_OPTIONS` (straight / swung), `MINOR_OPTIONS` (natural / harmonic / melodic), `SCALE_COLOUR_OPTIONS` (major pent. / minor pent. / blues), `MODE_DEGREES`, `MINOR_THIRD_MODES`, `DEGREE_SYLLABLES` | answers (`choice`, `degree-pad` offering ♭3 in minor keys), drills-ui | grader (`choice`, degrees) | `fam.rhy.feel`, `fam.scl.colour`, `fam.deg.fet-minor` (drills-engine) |
| Wave 4 kinds | unchanged | as wave4.md §11 | | |

Drills of stage E (`fam.deg.fet-minor`, `fam.key.mode`, `fam.chd.quality-7th`, `fam.frm.blues`, `fam.frm.sections`,
`fam.rhy.groove-lock`, `fam.rhy.swing`, bass-line dictation through `fam.har.bass` L5 and melodic dictation of bass
lines; contracts §7.3) are generated by drills-engine and rendered by drills-ui with the `choice`, `degree-pad`,
`quality-pad`, `form`, `bar-grid` and `scale-builder` widgets; graded by `@oak/drills` + `gradeAnswer`.
