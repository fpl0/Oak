# Oak Wave 4 seams — harmony, album and transcription

**Status: binding for Wave 4 Build.** Written in the Foundation phase (2026-11-12). Ranks below `contracts.md`
(version 1.3), above everything else (`wave3.md`, `wave2.md`, `interfaces.md`, ux, the rest). It records who owns
what, the seams between builders (signatures copied from the code; when this file and the code disagree, the code
is right and this file has a bug — report it), the API additions, the dev seeds, the ports, what is frozen, the
workflow rules and the definition of done.

Goal of the wave: units U05 "Triads" (8 lessons + checkpoint), U06 "Diatonic Harmony" (12 + checkpoint) and U07
"Melody" (10 + checkpoint); chords, chord symbols, inversions, bass clef and grand staff in lessons, hand voice
leading and the `voicing()` gate, Roman numerals, function, cadences, schemas, harmonic rhythm, melody over chords,
pickups and lead sheets; ear training stage D and melodic dictation up to X1's level; the multi-session capstone flow
with a recorder, the album with tree-ring covers, liner notes, version history and tutor reviews; C2 "Four-Chord
Song" and X1 "Folk Transcription"; Transcribe (own audio with time-stretch, pitch shift and A–B loop; the ladder
L1–L4 with realism levels; A/B against the learner's code; hum-to-draft) and the Transcription Gym schedule.

Wave 4 gates (PLAN W4, architecture M4): C1 and C2 in the album with reviews; A/B drift < 20 ms over 8 bars at 0.75×;
ladder levels L1–L4 graded exactly.

Read first: `wave3.md` §0 (what you can rely on, the known gaps), then this file in full, then the contracts sections
your area touches (§2.4–§2.5, §2.8–§2.9, §5, §6.4–§6.12, §7.3, §9.1, §10.2–§10.7, §11.6, §11.9).

## Wave 4 state (read this first)

Written at the Wave 4 final gate (2026-11-12), after the integration closer and the five reviews (journey,
robustness, studio, surfaces, teaching). The rest of this file is the Foundation seam document, updated where the
code moved; `interfaces.md` §19 lists the cross-package API as built and §20 what the reviews and the gate changed.
The code beats all of it. The gate's measured results are the W4 row of `docs/decisions.md` "Gate results".

**What Wave 5 can rely on** (implemented, tested by execution, green in `bun run check` and `bun run e2e`):

- **Course through U07: 64 lessons** (U00 2, U01 9, U02 8, U03 11, U04 4, U05 8, U06 12, U07 10), U01.CP–U07.CP,
  capstones C0, C1, C2 Four-Chord Song (2 sessions) and X1 Folk Transcription (3 sessions, Aura Lee or Red River
  Valley), all with locked IDs; every lesson, checkpoint and capstone passes `bun run content:check all`. The default
  order of contracts §2.5 with gym slots (GYM.nn) from U07.L01. Every musical claim and answer key of U05–U07 was
  re-derived from first principles (`content/validate/u05-u07-music.test.ts`).
- **The voicing gate** (contracts §3.1 rule 6): U05.L07's hand-voiced cadence at ≥ 0.9, typed and unrevealed; the
  client lint and the server (`reachesGatedHelpers`) both refuse `voicing()`, `chord()` and computed calls; a revealed
  check offers "Start a fresh try"; `voicing()`, `chord()`, `rhodes`, `organ` arrive with U05.L08.
- **Grading:** an `all` matcher needs every member at the pass mark (decision 39); C2's `progression` takes one chord
  a bar and names chords "V/ii (A)"; cadences are named in words; a broken-chord track (`.arp`) is read as chords; X1
  phrase checks read parts by role; chord symbols are spelled in the key everywhere (decision 44).
- **Ear training stage D** (chord quality, inversions, spelling, numerals, function, cadence, bass degree with sung
  roots and "Bass alone" while answering, schema, progression, non-chord tones) and melodic dictation to X1's level;
  the SRS simulation of contracts §7.4 holds with U05–U07 added.
- **Capstones and the album:** multi-session capstones in order, drafts as the Make (another tab's save is announced),
  X1 phrase checks bass → quality → numerals, a first release only of the code that passed (migration 0005), the
  recorded take, tree-ring covers, liner notes, version history, reviews kept with an album version, calm error text.
- **Transcribe:** own audio (stretch 25–100 %, ±12 semitones of transposition, fine tune, exact A–B loops, A/B with
  the code: drift under 3 ms over 8 bars at 0.75× on the page), hum-to-draft, the ladder L1–L4 graded exactly on
  generated items at R0–R4, gym days inside the session.
- **Lenses and surfaces:** chord symbols and numerals (`tb.feature.rn`), function bands, chord tones, range, the lead
  sheet; the chord band reads only the Band parts heard (decision 37) and counts bars from 0 after a pickup; tutor
  bar references light the right bars after a pickup; the RN palette lights the chords over a known bass in staged
  dictation; reviews have "Mark done".
- **Tutor:** the live `claude-cli` smoke passed 3 of 3 turns at the gate (rung-1 hint, C2 review, Explain my mistake):
  streamed, no answer below its rung, within the introduced vocabulary.
- **Journeys** (`e2e/journey/w4-*.pw.ts`, §7) and the review suites (`e2e/review/w4-*`, `app/src/ui/review/e2e/wave4-*`,
  `app/src/album/e2e` "review-studio"), each from a dev seed.

**Known gaps (for Wave 5):**

- **Contract decisions left open** (only the contracts owner edits contracts.md; exact texts in the gate's notes):
  C2's `motif-reuse` ≥ 0.5 against its label "at least once"; C2's cadence accepting vii°→I and iv→I; C2 in a key
  other than the brief's (§6.8); X1 S3 stage pass 0.80; §7.3 rows for `fam.not.read` N04 and the pending decks
  (`deck.chd.triads`, `deck.har.rn`, `deck.har.cadence`); a §3.2 row for `tb.feature.chord-symbols`; slash chords in
  the `[[chord:…]]` token grammar (§10.7); the 0005 schema row (§11).
- **Security and data:** code imported in a backup is flagged for review in sketches and album versions only;
  transcription versions and lesson-attempt code come back unflagged (contracts §11.3). Re-recording an album track
  replaces the old recording without a confirm. Own-audio checklist changes each add self-reported evidence
  (bounded 0–2, not rate-limited).
- **Grading:** lesson grading does not pass `ctx.band` (content reads harmony from a `chords:` line); an authored
  `id.wrong` override hides the refined `id.chord-*` codes; other dictations keep the 0.85 default, which accepts one
  wrong note in five to nine; the grader's `keyEstimate` misreads very sparse sketches (a cover's key); hum-to-draft
  cuts a note held across a bar line (with a `tie-truncated` warning) instead of tying it; a transcription review
  records the version current when it was given.
- **UI:** Transcribe and X1 keep their own transport and drop area (not the kit's); the ladder's level-up and
  realism-change Codas are unit-tested only; the own-audio gym Coda shows the standard close; a staff voice under
  the numerals gets no lens lines (abcjs); a chord tone in unison with the tune is drawn as two noteheads; note names
  at four chords a bar touch at the narrowest width; the tutor panel's own "Request review" is not tied to the
  Brief's pending state; "Mark done" lives in one browser; two tabs on one capstone are told, not merged; Strudel
  re-triggers a note held into a loop that starts inside a bar.
- **Scheduling:** after the written course (X1 released, U08 not written) Today offers review days with no gym
  (contracts §2.5 as written).
- **Content:** the folk answer keys stay `verified: false`; U07.L05's suspension voices V with its 3rd under the held
  4th (Listen QA); U06.L07's three-chord-rock steps keep their own 126 BPM drums; `ms.03` keeps "You can now compose
  a song." and there is no ladder-level-2 milestone (ux §5.5).
- **Seeds:** "C2 released" leaves `fam.mel.dictation` graduated at level 3; "X1 released" and later are review or
  gym days until U08 is written.

## 0. Where the Wave 3 gaps went

| Wave 3 gap (wave3.md §0) | Wave 4 seam | Owner |
|---|---|---|
| Circle and key panels never open inside a step | `StepUi.initialPanels` (content-kit) → `initialPanelsOf` (app/src/lib/panels.ts) → `<Workbench initialPanels>` (§4.4) | lesson (host), workbench (panels) |
| The circle's key preview plays only the learner's tracks | `PatternPlayer.load(code, { band })` (§3.5) | sound |
| Tutor context names the lesson's key, not the step's; solfège before U03.L08 | `StepSource.key` in `server/src/tutor/domain.ts` (§5.6) | tutor |
| Runtime bleed detection during sing steps | unchanged: `detectBleed` from calibration into the lesson's sing step (voice gap; not a Wave 4 seam) | audio |
| Code-modify region box not redrawn after an edit | `EditorHandle.editableRanges()` (§3.5, built) | lesson |
| By-ear source loops the whole tune; live sing trace not coloured | `PatternPlayer.setLoop` already exists for ladder stimuli; colouring is the audio engineer's | lesson, audio |
| `SetPlanInput.sungStats` not filled | `FamilyStateSchema.sungStats` (§5.2) | server (fills), drills-ui (passes) |
| Drill ways home use the drills' own cue plan | unchanged (drills-engine may switch to `@oak/strudel/reference` `cadencePlan`) | drills-engine |
| Ladder milestones count a finished transcription as a pass | `TranscriptionSchema.gradedPass`, `ladderGradedPass` (§3.2, §5.4) | server |
| `snd.brk` missing; jazz-soul drums unheard | sound pack work | sound |
| Repertoire answer keys `verified: false` | a human checks them; X1's two songs first | author:songs |

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
 - author:U05a  : content/core/U05/L02, L03        - author:U05b : content/core/U05/L04, L05
 - author:U05c  : content/core/U05/L06             - author:U05d : content/core/U05/L07, L08
 - author:U06a  : content/core/U06/L01, L03, L04   - author:U06b : content/core/U06/L05, L06
 - author:U06c  : content/core/U06/L07, L08, L09   - author:U06d : content/core/U06/L10, L11, L12
 - author:U07a  : content/core/U07/L01, L02, L03   - author:U07b : content/core/U07/L04, L05
 - author:U07c  : content/core/U07/L06, L07        - author:U07d : content/core/U07/L09, L10
 - author:CP    : the U05.CP, U06.CP and U07.CP items (content/checkpoints.ts and the checkpoint folders AUTHORING.md names) and content/bands/** — the only author who edits those
 - author:songs : content/capstones.ts and the capstone folders AUTHORING.md names (C2, X1), content/repertoire/** — the only author who edits those
 (U05.L01, U06.L02 and U07.L08 are the exemplars written in Foundation. The remaining content registries — syllabus/skills/toolbox/terms/glossary/candos/flavours/milestones — content/specs/**, content/validate/**, content/lib/** and scripts/content/** are frozen during Build: authors request changes via apiNotes. app/src/lib/** (except mic*.ts and tutor-stream.ts), app/src/main.tsx, router.tsx and routes/__root.tsx are frozen during Build for everyone.)
```

Files Foundation created or changed inside an owner's paths are that owner's from now on; keep their exported
signatures (others code against them) and extend freely:

| Owner | Seam files Foundation wrote | What the owner does with them |
|---|---|---|
| grader | `packages/theory/src/harmony.ts` (+ test; `inversionOf` now exported from `roman.ts`); `packages/grader/src/analyze/harmony-view.ts` (+ test; `harmonySlots` exported from `piece.ts`); `packages/grader/src/grade/ladder.ts` (+ test); `gradeLadder`, `gradeCapstone` and the Wave 4 export block in `packages/grader/src/index.ts` | all built and tested on the Foundation defaults; tune `LADDER_MATCHERS` against generated items, extend `harmonyView` (function bands, chord-tone % for the lenses), add the planned rules (`pickup`, `chord-qualities`, `chord-inversions`) and features (§11) |
| notation | `packages/notation/src/lead-sheet.ts` (+ test); `tagChordLabels` in `render.dom.ts` (throws `NotationNotBuiltError`); the not-built message in `geometry.ts` | build `tagChordLabels`; golden snapshots for chords with seconds, slash chords, lead sheets with pickups; `staff-expect.chords` input (with answers) |
| audio | `packages/audio/src/stretch.ts` (+ test) and its export block in `index.ts` | build `createStretchPlayer`, `createAbSwitch`, `createMasterRecorder` (each throws `AudioNotBuiltError` today); prove the A/B gate in `packages/audio/e2e` |
| sound | `packages/strudel/src/realism.ts` (+ test); `PatternPlayer.load({ band })` and `setRealism` in `pattern-player.ts` (both refuse with `StrudelNotBuiltError` beyond R0 / without a Band); `EditorHandle.editableRanges()` in `editor.ts` (built) | build the Band in the pattern player and the realism layers |
| server | `packages/api` Wave 4 block (`dto.ts` end, `contract.ts` end, `wave4.test.ts`, the optional fields of §5.2, `tutor.ts` `TutorTurnRequestSchema` fields); 501 stubs in `server/src/routes/{course,library,practice,tutor}.ts`; `routes.test.ts` "Wave 4 endpoints" | dev seeds of §6 first; then the 14 endpoints and behaviour of §5; remove each name from `WAVE4_PENDING` as it lands |
| workbench | the widened `initialPanels` prop type in `Workbench.tsx` (step choice wins over the remembered panels) | draw the `chords`, `function`, `range` and `chord-tones` panels; read `useLenses().chords` |
| transcribe | `app/src/transcribe/e2e/{playwright.config.ts, support.ts, transcribe.pw.ts}` | the area; grow the suite |
| kit | `app/src/ui/kit/e2e/playwright.config.ts` moved to 5214 / 8814 | — |

Previous Wave 3 owners' folders moved: `polish` split into **capstone** (capstone, album), **tutor** (tutor UI and the
tutor service, now one owner) and **kit** (shared UI); `voice` became **audio** (plus packages/audio); drills-engine
gains `content/gym/**`.

## 2. Ports, environment, one stack per area

Environment variables are unchanged from `wave2.md` §2 and `wave3.md` §2 (`OAK_PORT`, `OAK_DEV`, `OAK_VITE_PORT`,
`OAK_API_PORT`, `OAK_DATA_DIR`, `OAK_TUTOR_FAKE`, `OAK_NOW`). Nothing new.

| Owner | Primary stack (Vite / API) | Configs the owner inherits | A second stack, if needed |
|---|---|---|---|
| notation | Vite page 5194 (no API) | `packages/notation/e2e` | — |
| answers | 5202 / 8802 | `app/src/answers/e2e` | 5232 / 8832 |
| workbench | 5206 / 8806 | `app/src/studio/e2e` (5206/8806), `app/src/toolbox/e2e`, `app/src/workbench/e2e` (Vite page 5193) | 5236 / 8836 |
| transcribe | 5213 / 8813 | `app/src/transcribe/e2e` (new, data dir `transcribe`) | 5243 / 8843 |
| audio | 5209 / 8809 | `app/src/onboarding/e2e` (5209/8809), `app/src/voice/e2e`, `packages/audio/e2e` (Vite page 5191) | 5239 / 8839 |
| drills-ui | 5203 / 8803 | `app/src/drills/e2e` | 5233 / 8833 |
| lesson | 5201 / 8801 | `app/src/lesson/e2e` | 5231 / 8831 |
| session | 5205 / 8805 | `app/src/session/e2e`, `app/src/session/seeds/e2e`, `app/src/map/e2e` (5207/8807) | 5235 / 8835 |
| capstone | 5210 / 8810 | `app/src/capstone/e2e` (capstone and album, data dir `capstone`) | 5240 / 8840 |
| tutor | 5208 / 8808 | `app/src/tutor/e2e` (data dir `tutor-ui`) | 5238 / 8838 |
| kit | 5214 / 8814 | `app/src/ui/kit/e2e` (moved from 5200/8800), `app/src/ui/review/e2e` (5222/8822) | 5244 / 8844 |
| server | API 8811 (bun tests only) | — | — |
| sound | Vite page 5192 | `packages/strudel/e2e` | — |
| (gate) | journey 5212 / 8812 (+ 8792), review 5221 / 8821, platform 5173 / 8787 / 8790 | — | — |

- Each config's `dataDirName` is unique (`test-results/stacks/<name>`, wiped at every start). A new config takes a new
  name, never another config's.
- A config in a new folder uses the owner's second pair, never the primary pair of an existing config: two configs
  that start a server of the same name with different commands make `bun run e2e` fail with a port-clash error.
- The root `playwright.config.ts` discovers every `app/src/**/e2e/playwright.config.ts`, `e2e/*/playwright.config.ts`
  and `packages/*/e2e/playwright.config.ts` that exports `area` (wave3.md §6). Verified at Foundation:
  `bunx playwright test --list` shows the projects answers, app, audio, capstone, drills, journey, kit, lesson, map,
  notation, onboarding, platform, review, session-seeds, session, strudel-*, studio, **transcribe**, tutor, ui-review,
  voice, workbench-w3, workbench. The transcribe smoke spec and the kit suite on 5214/8814 ran green.

## 3. Package seams

### 3.1 `@oak/theory` — harmony in one call each (`harmony.ts`, built and tested)

Everything spells through the one chord table (`chords.ts`) and the numerals (`roman.ts`); `harmony.ts` adds no
spelling of its own. RN answers are compared as `(degree, alt, quality, inversion)`, never as strings.

```ts
export const READABLE_QUALITIES: readonly ChordQuality[];   // maj min dim aug maj7 7 m7 m7b5 dim7 (read from notes)
export interface ChordReading {
  chord: ChordId; root: string; quality: ChordQuality;
  inversion: 0 | 1 | 2 | 3;      // 0 root, 1 the 3rd in the bass, 2 the 5th, 3 the 7th
  leadSheet: string;             // "C/E", "G7/B", "B°"
  code: string;                  // "C", "Co", "Caug" (code has no slash chords)
  slash: boolean;
}
/** A triad or seventh from a pitch-class set and the bass pitch class; null when any pc is not a chord tone. */
export function readChord(pcs: Iterable<number>, bassPc: number): ChordReading | null;
/** The diatonic chord on degree 1–7 (natural minor in minor keys); a seventh chord with `seventh`. */
export function diatonicChordOn(key: KeySpec, degree: number, opts?: { seventh?: boolean }): ChordId;
/** Oak's dialect: "I", "ii", "viio", "V6", "I64", "V65", "Imaj7", "vi7", "viiø7", "V7/V". */
export function romanText(chord: ChordId, key: KeySpec, next?: ChordId): string;
export function chordOfRoman(text: string, key: KeySpec): ChordId | null;          // "V6" in C → G/B
export function romanParts(text: string, key: KeySpec): Pick<RomanNumeral, "degree" | "alt" | "quality" | "inversion"> | null;
export function harmonicFunction(chord: ChordId, key: KeySpec): HarmonicFunction;   // "T" | "PD" | "D" | "chromatic"
/** PAC only in root position with the melody on 1 (`melodyMidi`), else IAC; HC, PC, DC, bVII-I, none. */
export function cadenceOf(penult: ChordId, final: ChordId, key: KeySpec, opts?: { melodyMidi?: number }): CadenceType;
/** Schema of a chord sequence, exact or rotated, on root + triad quality (sevenths pass). */
export function schemaOf(chords: readonly ChordId[], key: KeySpec, lib?: readonly SchemaDef[]): { schema: SchemaDef; rotation: number } | null;
export type ChordDialect = "lead-sheet" | "code" | "jazz" | "abc";
/** "C°"/"Co"/"Cdim" ↔ "C°"/"Co"; "C+"/"Caug"; "G/B" (code drops the slash); `dict` picks a dictionary's spelling. */
export function chordSymbol(text: string, to: ChordDialect, opts?: { dict?: VoicingDict }): string | null;
export type ToneRole = "chord-tone" | "passing" | "neighbour" | "appoggiatura" | "suspension" | "anticipation" | "escape" | "other";
export interface ToneContext { prev?: number | null; next?: number | null; strong: boolean; nextChord?: ChordId | null; heldFromPrevChord?: boolean }
export function toneRole(midi: number, chord: ChordId, ctx: ToneContext): ToneRole;
export function inversionOf(chord: ChordId): 0 | 1 | 2 | 3;                       // now exported from roman.ts
```

Already there and still the one place for: `parseChordSymbol`, `parseChordWithBass`, `toCode`, `toLeadSheet`,
`toJazzGlyph`, `toAbcChord`, `chordInDict`, `identifyChord`, `romanOf`, `formatRN`, `displayRN` ("vii°"),
`parseRN`, `rnToChord`, `functionOf`, `classifyCadence`, `diatonicChords`, `SCHEMAS`, `schemaMatch`. Verified in
`harmony.test.ts` against tonal and by hand: C/E, G/B = V6, C/G = I64, G7/B = V65; I ii iii IV V vi vii° in C;
Imaj7 vi7 ii7 V7 (U06.L10); i ii° III iv v VI VII in A minor; axis, axis-vi, doo-wop, three-chord rock and the
rotation G–Am–F–C = axis rotation 1; 4–3 suspension, passing, neighbour, appoggiatura, anticipation, escape.

### 3.2 `@oak/grader` — the harmony view, the ladder and capstone mode (built and tested)

`analyze/harmony-view.ts`: the analysed piece per bar and beat. Built on the same chord slots, numerals and
non-chord-tone rules the rubric uses, so a view never disagrees with a grade.

```ts
export interface SoundingChord {
  slot: number; span: [Rat, Rat];
  pcs: number[];            // ascending; from the symbol when there is one
  bassPc: number;           // lowest learner note at the onset, across tracks (contracts §6.7 item 5)
  root: string; quality: ChordQuality; inversion: 0 | 1 | 2 | 3;
  symbol: string;           // lead sheet: "G/B"
  code: string;             // "G"
  rn: string | null;        // in the track's key: "V6", "viio", "V7/V"
  function: HarmonicFunction | null;
  written?: string;         // the chord() symbol as written
}
export interface BeatHarmony { bar: number /* 1-based; pickup bar 0 */; beat: number; at: Rat; chord: number | null; change: boolean }
export type MelodyNoteRole = "chord-tone" | "passing" | "neighbour" | "appoggiatura" | "suspension" | "anticipation" | "escape" | "other" | "no-chord";
export interface MelodyNoteRelation { id: string; midi: number; onset: Rat; bar: number; beat: number; onBeat: boolean; strongBeat: boolean; chord: number | null; role: MelodyNoteRole }
export interface HarmonyView {
  key: KeySpec | null; bars: number; pickup: boolean;
  slots: SoundingChord[]; beats: BeatHarmony[];
  harmonicRhythm: number[];          // chord changes per bar, index 0 = cycle 0
  melody: MelodyNoteRelation[];      // skyline of @melody
}
export function harmonyView(n: Normalized, ctx: NormalizeContext & { bars?: number }): HarmonyView;
```

Readers: the Workbench chord band and lenses (workbench), the C2 checklist (capstone), the lesson's chord-tone
feedback (lesson), liner notes. Verified: C G Am F = I V vi IV / T D T PD; a `bass:` track makes G/B = V6; a 3/4
pickup bar is bar 0 and its note is `no-chord`.

`grade/ladder.ts` (exported from the package root): the ladder grading entry (contracts §2.9, §6.12) and the
capstone length rule (§6.4).

```ts
export type LadderLevel = 1 | 2 | 3 | 4;
export type RealismLevel = 0 | 1 | 2 | 3 | 4;
export type LadderStage = "bass" | "quality" | "rn";          // L3, bass first (content-kit TranscribeStage)
export const LADDER_PASS = 0.85;
export const REALISM_UP_AFTER = 2; export const REALISM_UP_AT = 0.9; export const REALISM_DOWN_BELOW = 0.6;
export const LADDER_MATCHERS: { 1: Matcher; 2: Matcher; 3: Record<LadderStage, Matcher>; 4: Matcher };
  // L1 rhythm per drum role (onset F1, tol 1/32); L2 melody on @bass, octave-free; L3 bass = melody on @bass,
  // quality = harmony level "quality", rn = harmony level "rn" (triad depth, harmonic rhythm given); L4 melody on @melody
export function ladderMatcher(level: LadderLevel, stage?: LadderStage): Matcher;
export interface LadderItemSpec { itemId: string; level: LadderLevel; stage?: LadderStage; reference: string; bars: number;
  key: KeySpec; meter: MeterId; bpm: number; pickup?: PickupSpec; swing?: SwingSpec }
export function ladderExercise(item: LadderItemSpec): ExerciseOf<"transcribe-step">;   // auto, pass 0.85
export interface LadderGradeRequest { item: LadderItemSpec; code: string;
  ctx: Omit<GradeContext, "mode" | "key" | "meter" | "bpm" | "pickup" | "swing" | "exerciseGlobalId"> }
export function ladderGradeRequest(req: LadderGradeRequest): GradeRequest;            // mode "lesson"
export function gradeLadder(req: LadderGradeRequest): Promise<GradeResult>;            // index.ts, the realm
export function ladderGradedPass(result: GradeResult): boolean;                        // pass, ≥ 0.85, not revealed
export interface LadderSessionScore { level: LadderLevel; realism: RealismLevel; score: number }
export function nextRealism(history: readonly LadderSessionScore[], current: RealismLevel): RealismLevel;
export interface CapstoneLength { totalBars: number; queriedBars: number; durationSec: number; truncated: boolean }
export function capstoneLength(code: string, events: readonly NEvent[], cps: number): CapstoneLength;
export function gradeCapstone(req: Omit<GradeRequest, "ctx"> & { ctx: Omit<GradeRequest["ctx"], "mode"> }): Promise<GradeResult>;
```

`gradeCapstone` is `gradeExercise` with `mode: "capstone"` (`MODE_LIMITS.capstone`: 128 bars, 5 s, 60 000 haps,
`periodCap` 128, already enforced by the runtime). Capstone drafts are graded in the browser grader host in capstone
mode (5 s kill); the server grades ladder submissions (`ladder.submit`) with `gradeLadder` on the Bun host. Verified:
an exact L1 answer passes, a wrong groove fails; `arrange([8,a],[8,a])` is 16 bars / 32 s at 0.5 cps; 200 bars is
truncated to 128.

### 3.3 `@oak/notation` — chord labels and the lead sheet (`lead-sheet.ts` and DOM tagging, built)

Chords on a staff need no new input: notes that start together on one track are engraved as one stacked chord, and
abcjs offsets the noteheads of a second. Symbols above and numerals below were already `NotationInput.chords` /
`romans` (Wave 1); the seam adds the lens filter, the lead-sheet layout and stable classes.

```ts
export const CHORD_LABEL_CLASSES: { symbol: "oak-ann-chord"; roman: "oak-ann-rn"; at: "oak-ann-at" };  // + oak-ann-at{i}
export interface ChordLabelSet { symbols?: boolean; romans?: boolean }                // the chord lenses
export interface ChordLabel { bar: number /* 0-based cycle */; beat: number /* 1-based */; symbol: string; rn?: string | null }
export function chordLabelInput(labels: readonly ChordLabel[], which: ChordLabelSet): Pick<NotationInput, "chords" | "romans">;
export interface LeadSheetInput { melody: NEvent[]; chords?: readonly ChordLabel[]; meter: MeterSpec; key: KeySpec | null;
  bars: number; startBar?: number; pickup?: PickupSpec; swing?: SwingSpec; tempoBpm?: number; title?: string;
  romans?: boolean; annotations?: AnnotationSet }
export function leadSheetInput(i: LeadSheetInput): NotationInput;                     // staff "lead", treble, symbols above
export function stepStaffInput(staff: "treble" | "bass" | "grand" | "perc" | "lead", tracks: readonly string[]):
  Pick<NotationInput, "staff" | "trackClefs" | "split">;
export function chordLabelTexts(score: Score): { symbols: string[]; romans: string[] };
// @oak/notation/render
export function tagChordLabels(el: HTMLElement, score: Score): void;                  // built (Wave 4)
```

**What a lesson host passes** for a step's staff: `stepStaffInput(step.ui.panels.staff, trackLabels)` — a grand staff
splits by track with `bass`/`lh`/`left`/`low` tracks on the bass clef (`trackClefs`), anything else treble (bass
clef and grand staff were built in Wave 3; U05.L06 unlocks `tb.feature.grand-staff`). A `lead` staff is
`leadSheetInput` with the melody track and the chart from `StepUi.leadSheet` (or the chord track's symbols, which
`buildScore` reads from `chordSymbol` when `chords` is absent). Pickups: `pickup` engraves bar 0 as a partial measure
(contracts §6.11). `tagChordLabels` is built; the Workbench's old `NotationNotBuiltError` catch is dead code. Also
built in the wave (interfaces.md §19): `leadSheetLayout`, `leadSheetPages`, `LEAD_SHEET_BAR_PX`, `chordSymbolDisplay`,
`numeralDisplay`, `keyAtOnset`, `StaffEdit` `stack`, `AbcOptions.barNumbers`, `NotationInput.endsPiece`. The staff and
the lead sheet engrave symbols with abcjs `jazzchords: true` ("Aᵐ" on the staff where the chord band prints "Am"):
kept wave-wide as the lead-sheet engraving convention.

### 3.4 `@oak/audio` — the Transcribe engine (`stretch.ts`; engine, A/B switch and master recorder built)

```ts
export const STRETCH_RATE_RANGE: readonly [0.25, 1.5];       // the engine
export const TRANSCRIBE_RATE_RANGE: readonly [0.25, 1];      // what Transcribe offers (contracts §6.12: 25–100 %)
export const STRETCH_SEMITONE_RANGE: readonly [-12, 12]; export const STRETCH_CENTS_RANGE: readonly [-50, 50];
export const AB_DRIFT_GATE_MS = 20; export const AB_DRIFT_GATE_BARS = 8; export const AB_DRIFT_GATE_RATE = 0.75;
export class AudioNotBuiltError extends Error { readonly code: "audio_not_built" }
export interface LoopSpan { startS: number; endS: number }
export interface StretchClock {
  ctxTimeOf(sourceS: number): number | null;   // AudioContext time at which source time sounds; null when paused
  sourceTimeAt(ctxTime: number): number;       // honours the loop
  readonly anchor: { ctxTime: number; sourceS: number; rate: number } | null;
}
export interface StretchPlayerState { loaded; playing; time; durationS; rate; semitones; cents; loop: LoopSpan | null; gain }
export interface StretchPlayer {
  load(buffer: AudioBuffer): Promise<void>;                       // decoded by the caller
  play(opts?: { at?: number; fromS?: number }): Promise<void>; pause(): void; seek(sourceS: number): void;
  setRate(rate: number): void; setSemitones(st: number): void; setCents(c: number): void;
  setLoop(loop: LoopSpan | null): void; setGain(gain: number): void;
  readonly clock: StretchClock; readonly state: StretchPlayerState;
  subscribe(cb: (s: StretchPlayerState) => void): () => void; dispose(): void;
}
export interface StretchPlayerDeps { ctx: AudioContext; output: AudioNode /* OakStrudel.master.input */;
  claim?: (source: { id: string; kind: "external"; stop(): void }) => () => void /* OakStrudel.coordinator.claim */ }
export function createStretchPlayer(deps: StretchPlayerDeps): Promise<StretchPlayer>;                 // built (signalsmith-stretch)
export type AbSide = "source" | "mine" | "both";
export interface PatternSideLike { cps(): number; start(o: { at: number; fromBar: number; rate: number }): Promise<void>;
  stop(): void; setGain(g: number): void; timeOfCycle(cycle: number): number }
export interface SourceGrid { downbeatS: number; barSec: number }                                    // from the BeatGrid
export interface AbState { side: AbSide; playing: boolean; bar: number; rate: number; loop: { fromBar: number; bars: number } | null }
export interface AbSwitch { readonly state: AbState; setSide(s: AbSide): void; toggle(): void;
  play(o?: { fromBar?: number }): Promise<void>; pause(): void; setRate(r: number): void;
  setLoop(l: { fromBar: number; bars: number } | null): void; subscribe(cb: (s: AbState) => void): () => void; dispose(): void }
export function createAbSwitch(deps: { ctx: AudioContext; source: StretchPlayer; mine: PatternSideLike; grid: SourceGrid }): AbSwitch; // built
export function abDriftMs(sourceBarTimes: readonly number[], mineBarTimes: readonly number[]): number; // the gate measure
export function sourceBarTimes(clock: StretchClock, grid: SourceGrid, fromBar: number, bars: number): number[];
export interface MasterRecording { blob: Blob; mime: string; durationS: number }
export interface MasterRecorder { readonly recording: boolean;
  record(o: { seconds: number; at?: number; tailSec?: number; mimeType?: string }): Promise<MasterRecording>; cancel(): void }
export function createMasterRecorder(deps: { ctx: AudioContext; tap: MediaStreamAudioDestinationNode }): MasterRecorder; // built; WAV when it can cut the take
export function fakeStretchPlayer(o: { durationS: number; now?: () => number }): StretchPlayer & { advance(s: number): void };
export function fakeMasterRecorder(): MasterRecorder;
```

- One AudioContext: the adapter's (`OakStrudel.ctx`); this package never creates one. The stretch output goes into
  `OakStrudel.master.input`, so the master tap (and both recorders) hear it; UI sounds never do.
- The existing `createTranscriptionPlayer` (Wave 1, `transcription.ts`) is the engine's starting point;
  `audioSource`/`createPatternSource` (`pattern-source.ts`) stay the Transcribe view's one `TranscribeSource`.
- Album export of a capstone release uses `OakStrudel.recorder.record({ bars })` (built since Wave 1: N bars of the
  active editor from the next cycle, then `album.putAudio`). `MasterRecorder` records a span of seconds from any
  source (a transcription version over its audio).
- The gate: `abDriftMs(sourceBarTimes(player.clock, grid, 0, 8), mineBarTimes) < 20` at rate 0.75, measured in
  `packages/audio/e2e` on the real engine (2.7 ms) and on the real Transcribe page
  (`app/src/transcribe/e2e/ab-drift.pw.ts`: 2.65 ms worst over 8 bars). Transcribe keeps its own own-audio transport
  (`app/src/transcribe/transport.ts`) on the AbSwitch design (pattern first, the source anchored on `timeOfCycle`,
  0.1 s pre-roll), because `PatternPlayer.play()` cannot start at an AudioContext time. `humToDraft` (`@oak/pitch`)
  drafts a hummed line. The release take still uses `OakStrudel.recorder.record({ bars })`.

### 3.5 `@oak/strudel` — Band in the pattern player, live editable ranges, realism

```ts
// EditorHandle — BUILT
editableRanges(): CodeRange[] | null;   // null: all editable; []: none; else the regions mapped through every edit
// PatternPlayer — built (Wave 4)
load(code: string, opts: { bars: number; cps: number; lint?: LintContext; band?: BandSetup | null; key?: KeySpec }): Promise<EvalOutcome>;
  // a bad Band resolves ok with an `eval.band-failed` warning, never rejects
setRealism(spec: RealismSpec): void;    // R0–R4, applied after the A–B loop; swing assumes 4 beats a bar
// realism.ts — BUILT (pure)
export type RealismLevelId = 0 | 1 | 2 | 3 | 4;
export interface RealismSpec { level: RealismLevelId; seed: number; timingMs: number; velocity: number;
  swing: { amount: number } | null; room: number; buried: { track: string; db: number } | null;
  leadSound: string | null; detuneCents: number; target: string | null }   // target: the transcribed part
export function realismSpec(level: RealismLevelId, opts?: { seed?: number; target?: string | null; swung?: boolean; vocalLead?: "tenor" | "choir" }): RealismSpec;
  // R0 clean · R1 ±15 ms, ±0.1 velocity · R2 + swing where marked, room 0.3 · R3 + target part −6 dB · R4 + vocal lead, ±30¢
export function isCleanRealism(spec: RealismSpec): boolean;
export class StrudelNotBuiltError extends Error { readonly code: "strudel_not_built" }
```

Who plays what: the arrangement of a ladder item (parts, kit, density) is `@oak/drills` `generateLadderPiece(level,
realism, seed, profile)` (drills-engine); the performance on top is the `RealismSpec`. The browser never receives the
hidden code: `TranscriptionDetail.stimulus` carries the events (Wave 1 decision) and, for a generated ladder item,
the generator's `performance { target, swung, vocalLead }` (integration, additive), which Transcribe passes to
`realismSpec` (R2 swing on jazz-soul comping, R3 the target part buried, R4 the picked vocal lead). Grading
tolerances never change with realism. The sound pack is v3 (`snd.brk` added).

## 4. App seams (`app/src/lib`, frozen after Foundation)

### 4.1 Query hooks (`queries.ts`)

```ts
export const useCapstoneSessions: (id: string | null) => UseQueryResult<CapstoneSessions>;   // GET /capstones/:id/sessions
export const useCapstoneSaveDraft: () => mutation<"capstones.saveDraft">;    // → capstones.sessions, capstones.get, streak.get
export const useCapstoneRecordCheck: () => mutation<"capstones.recordCheck">; // → capstones.sessions, capstones.get
export const useCapstoneGate: (id: string | null) => UseQueryResult<CapstoneGate>;
export const useAlbumPatchVersion: () => mutation<"album.patchVersion">;     // → album.track, album.get
export const useAlbumAttachReview: () => mutation<"album.attachReview">;     // → album.track, tutor.reviews
export const useTutorReviews: (s: { subjectKind: "capstone" | "transcription"; subjectId: string } | null) => UseQueryResult<{ items: ReviewRecord[] }>;
export const useTranscriptionSettings: () => mutation<"transcriptions.putSettings">;
export const useLadder: () => UseQueryResult<LadderState>;
export const useLadderSetLevel: () => mutation<"ladder.setLevel">;
export const useLadderNext: () => mutation<"ladder.next">;
export const useLadderSubmit: () => mutation<"ladder.submit">;              // → ladder.get, gym.plan, transcriptions.*, progress.get, skills.map
export const useGymPlan: () => UseQueryResult<GymPlan>;
export const useVoicingGate: () => UseQueryResult<VoicingGate>;
// changed invalidations: steps.attempt → + gates.voicing; capstones.completeSession → + capstones.sessions;
// gym.start → + gym.plan, ladder.get; transcriptions.addVersion → + gym.plan;
// capstones.release → + capstones.sessions, capstones.gate, gym.plan
```

Until the server builds an endpoint it answers 501 (`OakApiError.code === "not_implemented"`, never retried);
`ErrorState` reads "Not built yet". Code against the types now.

### 4.2 Idempotency — unchanged (`idempotency.ts`); `capstones.recordCheck` and `ladder.submit` take `idempotencyKey`.

### 4.3 Chord lenses (`lenses.ts`)

```ts
export type { ChordLensId };                         // "chordSymbols" | "romanNumerals"
export const CHORD_LENS_IDS: readonly ["chordSymbols", "romanNumerals"];
export const CHORD_LENS_UNLOCKS: { chordSymbols: "tb.arp"; romanNumerals: "tb.feature.rn" };
export const CHORD_LENS_LABELS: { chordSymbols: "Chord symbols"; romanNumerals: "Roman numerals" };
export type ChordLensPrefs = Record<ChordLensId, boolean>;
export function chordLensPrefs(prefs: LensPrefs): ChordLensPrefs;            // absent = on
export function chordLensAvailability(unlocked: ReadonlySet<string>): ChordLensPrefs;
export function effectiveChordLenses(prefs: LensPrefs, unlocked: ReadonlySet<string>): ChordLensPrefs;
export interface ChordLenses { prefs; shown; available: ChordLensPrefs; set(id: ChordLensId, on: boolean): void; toggle(id: ChordLensId): void }
// Lenses gains:  chords: ChordLenses   (same store, same optimistic save and rollback)
```

- Stored in the same `lenses` setting as two **optional** booleans (`LensPrefsSchema.chordSymbols?`,
  `romanNumerals?`; absent = on), so Wave 3 data and `DEFAULT_SETTINGS` are unchanged. `LENS_IDS` and the note-lens
  switches (drills, Workbench) are untouched; chord switches are rendered only by surfaces that show chords.
- Gates: Roman numerals from `tb.feature.rn` (U06.L02). Chord symbols are introduced in U05.L04, whose only toolbox
  row is `tb.arp`; there is no dedicated feature row yet (requested: `tb.feature.chord-symbols` at U05.L04; when the
  content lead adds it, only `CHORD_LENS_UNLOCKS` changes).
- Who wins: as wave3.md §4.3 — inside a lesson step the content decides (a step that wants symbols lists the `chords`
  panel or a `leadSheet`); everywhere else the lenses decide. Views turn them into notation with
  `chordLabelInput(labels, { symbols: shown.chordSymbols, romans: shown.romanNumerals })`.

### 4.4 Workbench panels a step opens (`panels.ts`)

```ts
export type { WorkbenchPanelId };                                 // content-kit: key circle chords function range chord-tones
export { WORKBENCH_PANELS, WORKBENCH_PANEL_TOOLS };
export function initialPanelsOf(ui: Pick<StepUi, "initialPanels"> | null | undefined): Partial<Record<WorkbenchPanelId, boolean>> | null;
export function panelUnlocked(id: WorkbenchPanelId, unlocked: ReadonlySet<string>): boolean;
```

The content field is **`StepUi.initialPanels?: WorkbenchPanelId[]`** (content-kit, schema feature
`step.initial-panels`). The lesson host passes `initialPanels={initialPanelsOf(step.ui) ?? undefined}` to the
Workbench; `Workbench.initialPanels` is now `Partial<Record<WorkbenchPanelId, boolean>>` and the step's choice wins
over the viewer's remembered panels. The Workbench opens a panel only when it is unlocked and drawn; today it draws
`key` and `circle`; the workbench engineer adds `chords`, `function`, `range`, `chord-tones`.

## 5. API additions (`packages/api`, additive)

Every new endpoint is a contract entry with a zod DTO. **All 14 are built** (Wave 4 integration, 2026-11-12):
`WAVE4_PENDING` in `server/src/routes/routes.test.ts` ("Wave 4 endpoints") is empty, so that test checks that none of
them answers 501, and no route in the server answers the typed 501 any more. Service files: `services/capstone-sessions.ts`,
`services/ladder.ts`, `services/gym.ts`, `services/voicing-gate.ts`; repos `db/repos/wave4.ts` (migration
`0004_wave4.sql`; the final gate added `0005_checked_version.sql`, schema version 5: `capstone_state` keeps the sketch
version its last check graded, and a first release must be of that code). Behaviour proofs: `server/src/routes/wave4.test.ts`, `server/src/wave4-course.test.ts`
(every dev seed on the real content), `server/src/wave4-sim.test.ts` (the planner over HTTP), `server/src/wave4-reviews.test.ts`
(reviews on the fake tutor backend).

| Name | Method · path (under `/api`) | Body / query | Response | Route file | Status | Needed by |
|---|---|---|---|---|---|---|
| `capstones.sessions` | GET `/capstones/:id/sessions` | | `CapstoneSessionsSchema` `{ capstoneId, sessions: CapstoneSessionState[], current }` | course.ts | built | capstone (multi-session flow), session (Today) |
| `capstones.saveDraft` | POST `/capstones/:id/drafts` | `CapstoneDraftSaveSchema` `{ capstoneSessionId, sessionId, sketchId, sketchVersion }` | `CapstoneSessionsSchema` | course.ts | built; the draft is the session's Make and a streak sketch | capstone |
| `capstones.recordCheck` | POST `/capstones/:id/checks/:checkId` | `CapstoneCheckRecordSchema` `{ capstoneSessionId, stage, sketchId, sketchVersion, result, idempotencyKey? }` | `CapstoneSessionsSchema` | course.ts | built; idempotent, stages bass → quality → rn, best score kept, pass at the check's own mark | capstone (X1 phrases, S3 stages) |
| `capstones.gate` | GET `/capstones/:id/gate` | | `CapstoneGateSchema` `{ capstoneId, open, conditions[], gymSetsToOpen, message }` | course.ts | built; condition `kind` also `"lesson"` (additive) | capstone, session ("Two more gym sets open X1") |
| `album.patchVersion` | PATCH `/album/tracks/:id/versions/:v` | `AlbumVersionPatchSchema` `{ linerNotesMd?, includeReviewNote? }` (≥ 1 field) | `AlbumTrackVersionSchema` | library.ts | built | capstone (album) |
| `album.attachReview` | PUT `/album/tracks/:id/versions/:v/review` | `AlbumReviewAttachSchema` `{ conversationId, review: CapstoneReview, includeReviewNote }` | `AlbumTrackVersionSchema` | library.ts | built; only a review that `review` conversation about this capstone accepted | capstone, tutor |
| `tutor.reviews` | GET `/tutor/reviews` | `?subjectKind&subjectId` | `{ items: ReviewRecord[] }` | tutor.ts (routes) | built; a capstone record names the album version it is attached to, a transcription record the version current when it was given | capstone, transcribe, tutor |
| `transcriptions.putSettings` | PUT `/transcriptions/:id/settings` | `TranscriptionSettingsPatchSchema` (partial `{ rate, semitones, fineTuneCents, loop, notes }`) | `TranscriptionSchema` | library.ts | built; rate 25–100 %, no fine-tune on a pattern source | transcribe |
| `ladder.get` | GET `/ladder` | | `LadderStateSchema` `{ level, realism, history, gradedPasses, levelUp }` | practice.ts | built | transcribe, session |
| `ladder.setLevel` | PUT `/ladder` | `LadderLevelSetSchema` `{ level }` | `LadderStateSchema` | practice.ts | built; a new level starts at R0 | transcribe |
| `ladder.next` | POST `/ladder/items` | `LadderNextSchema` `{ sessionId, gymId, level?, seed? }` | `LadderItemSchema` `{ itemId, level, realism, seed, stages, given, project }` | practice.ts | built; hidden code and answer key stay on the server | transcribe |
| `ladder.submit` | POST `/ladder/items/:id/submissions` | `LadderSubmitSchema` `{ sessionId, code, stage?, rung, idempotencyKey? }` | `LadderSubmitResultSchema` `{ result, passed, gradedPass, ladder, realismChange, version }` | practice.ts | built; graded on the server's learner host, rung 4 = revealed | transcribe |
| `gym.plan` | GET `/gym` | | `GymPlanSchema` `{ active, sinceLast, slotDue, next, history, x1 }` | course.ts | built (`gym.start` moved to `services/gym.ts`, route unchanged) | session, transcribe |
| `gates.voicing` | GET `/gates/voicing` | | `VoicingGateSchema` `{ exerciseId, variants, minScore, best, passed, passedAt, attempts, passedCode?, holds }` | course.ts | built; `passedCode` (additive) is the code of the first qualifying attempt | lesson (U05.L07/L08), toolbox, session, workbench |

The SSE review turns (Wave 2 endpoints, Wave 4 bodies): `tutor.reviewCapstone` POST `/tutor/reviews/capstone` forwards
`albumTrackId` + `albumVersion` (both or neither) and `tutor.reviewTranscription` POST `/tutor/reviews/transcription`
forwards `transcriptionVersion` to the tutor's review routes; a target on the wrong kind (or on a chat/hint turn) is a 400
before the tutor runs. An accepted capstone review is stored on the named album version with its conversation
(`onReview`), so `tutor.reviews` and `album.attachReview` agree. `capstones.release` with `includeReviewNote` appends
the latest review's liner note to `linerNotesMd` only when the body does not already contain it.

Changed shapes (all additive; every Wave 3 body still parses — `packages/api/src/wave4.test.ts`):

| Schema | Change | Owner of the behaviour |
|---|---|---|
| `LensPrefsSchema` | `chordSymbols?`, `romanNumerals?: boolean` (absent = on); `CHORD_LENS_IDS` | works now (settings repo stores the object) |
| `FamilyStateSchema` | `sungStats?: Record<category, { n, hits }>` | server fills it from sung resolutions; drills-ui passes it as `SetPlanInput.sungStats` |
| `AlbumTrackVersionSchema` | `includeReviewNote?: boolean` | server |
| `TranscriptionSchema` | `settings?: TranscriptionSettings`, `gradedPass?: boolean`, `gymId?: GYM.nn \| null` | server |
| `TranscriptionVersionCreateSchema` | `machineDraft?: boolean` (hum-to-draft, no evidence until corrected and checked) | transcribe sends, server stores |
| `TutorTurnRequestSchema` (tutor.ts) | `albumTrackId?`, `albumVersion?` (a capstone review of one version: the accepted review is attached), `transcriptionVersion?` | tutor |
| `VoicingGateSchema` | `passedCode?: string \| null` (integration) | server |
| `BackupInfoSchema` | `ownAudio?: { files, bytes, unusedFiles, unusedBytes }`, `albumAudioBytes?` (integration; Settings › Data) | server |
| `CapstoneGateConditionSchema` | `kind` gains `"lesson"` (a capstone opened by a lesson, CF-T at U15.L01) | server |
| `TranscriptionDetailSchema.stimulus` | `performance?: { target, swung, vocalLead }` (closer): a generated ladder item's hints from `LadderPiece.performance`; Transcribe passes them to `realismSpec` | server (stores), transcribe (plays) |
| `DevSeedRequestSchema` | `recordings?: boolean` (closer; default true): every seeded release gets a recording; `false` leaves the album without recordings | server |
| new constants | `TranscriptionSettingsSchema`, `DEFAULT_TRANSCRIPTION_SETTINGS`, `OWN_AUDIO_CHECKLIST` (contour, rhythm, landing, bass, chords; 0–2 each), `AUDIO_UPLOAD_MAX_BYTES` (300 MiB, = the audio store), `AUDIO_UPLOAD_TYPES`, `CAPSTONE_SESSION_STATUSES`, `WAVE4_SEED_POINTS` | — |

### 5.1 Multi-session capstones (C2.S1–S2, X1.S1–S3)

- A capstone session is a map item (`C2.S1`); Today starts it with `session.start { kind: "capstone", mapItemId }`.
  `capstones.sessions` returns every session with `status` (`locked` until the one before is done, `open`,
  `in_progress` once a draft or check exists, `done` after `capstones.completeSession`), its latest draft and, for
  transcribe capstones, one `CapstoneCheckState` per content `PhraseCheck` (and per stage of a staged one:
  `bass` → `quality` → `rn`, each `open` only after the one before passed or was revealed).
- Drafts are sketches (`sketches.addVersion`); `capstones.saveDraft` binds the version to the session and counts as
  the session's Make (contracts §9.1: "the draft save is the Make") and as a streak sketch.
- A check is graded **in the browser** in capstone mode (`gradeCapstone`; X1 phrase: `melody`, key-relative, pass
  0.85; stages 0.80) and recorded with `capstones.recordCheck` (idempotent). A revealed check (`result.assist.revealed`)
  gives no evidence and is named in the liner notes. The rubric run of the whole draft stays `capstones.check`.
- Release is `capstones.release` (Wave 2) at the end of the session whose content says `release: true` (C2.S2,
  X1.S3). A capstone in progress is never interrupted by a gym slot (§5.5).
- `capstones.gate` lists each opening condition of contracts §2.4 with `met`, and for X1 the family level
  (`fam.mel.dictation` ≥ 4: `have`, `need`) and `gymSetsToOpen`; `message` is the one line Today shows ("Two more gym
  sets open X1"). A capstone never gates a lesson.

### 5.2 Album: versions, liner notes, recordings, reviews

- Version history is `album.track` (every version, newest last). A release creates a version (`capstones.release`);
  its recording is uploaded with `album.putAudio` after `OakStrudel.recorder.record` (built); export of the album
  with audio is `backup.export` (contracts §11.10).
- Liner notes: deterministic notes (`linerNotes` of `@oak/grader`) at release; edited with `album.patchVersion`. The
  tutor's liner note shows only when `includeReviewNote` (default `Settings.linerNotesInAlbum`).
- Reviews (contracts §10.6): requested by the learner on the `review` thread (`tutor.reviewCapstone`, SSE) with
  `albumTrackId` + `albumVersion`; the server attaches the accepted `submit_capstone_review` to that version
  (`album_track_versions.review_json`), or the app calls `album.attachReview` with the conversation and the review.
  `tutor.reviews` lists stored reviews for the Review sheet. A review never states or implies pass or fail.
- Tree-ring covers are drawn in the browser from the version's code (`analyzePiece` / `harmonyView`) and
  `AlbumTrack.coverSeed`; deterministic (ux §10 item 9). No endpoint.

### 5.3 Transcription projects

- Own audio: `audio.upload` (built; stored under `~/.oak/audio` by sha256, sniffed type, 300 MiB limit) then
  `transcriptions.create { sourceKind: "own-audio", audioId }` (built). Ladder items: `ladder.next` creates a
  `generated` project (hidden code server-side; the browser gets `stimulus` events). PD songs: `pd-song` (built;
  unverified answer keys are refused with 409).
- Regions, checklist, self score, status: `transcriptions.patch` (built). Player settings and notes:
  `transcriptions.putSettings` (new). Code versions: `transcriptions.addVersion` (built; `machineDraft` new).
- Delete: `transcriptions.delete` with the confirm nonce (built; `confirm` action `transcription.delete`).
- Own-audio grading is `grading.mode: "self"`: `OWN_AUDIO_CHECKLIST` (0–2 each), `status: "ungraded"`, evidence 0.3
  `selfReported`. The tutor gets code, the checklist and the typed title — never audio.

### 5.4 The ladder (L1–L4)

- `ladder.get`: level 1–4, realism R0–R4, the last 10 sessions, graded passes per level, an offered level-up.
- `ladder.next { level?, seed? }`: `@oak/drills` `generateLadderPiece(level, realism, seed, profile)` → a project;
  `given` = tempo, meter, key, pickup, bars (contracts §6.12). L3 lists `stages: ["bass", "quality", "rn"]`.
- `ladder.submit`: graded on the server with `gradeLadder` (exactly, against the hidden reference; pass ≥ 0.85),
  saved as a transcription version; `gradedPass` = `ladderGradedPass` (and, at L3, every stage passed). The session's
  best score feeds `nextRealism` (two consecutive ≥ 0.9 → up one; one below 0.6 → down one); `realismChange` is
  announced once in the Coda.
- **Level-up (proposal, wave decision):** contracts does not say when the level rises. Foundation proposes: a
  level-up to `level + 1` is **offered** (`levelUp`) after two graded passes at the current level at realism R2 or
  higher on two different learner days; the learner takes it with `ladder.setLevel` (and may move down any time);
  the new level starts at R0. Ladder milestones count `gradedPass` only (`TranscriptionSchema.gradedPass`).

### 5.5 Gym sessions (contracts §2.5)

`gym.plan`: `active` from U07.L01; `sinceLast` completed core sessions since the last transcription session;
`slotDue` at 4 (unless a capstone is in progress — it waits — or an `X#` session takes the slot); `next.gymId` is the
next free `GYM.nn` (the learner's own ordinals); odd = `ladder` at the current level and realism, even = `own-audio`
(`ownAudioFallback: true` and a ladder session one realism level up when there is no audio project). The planner puts
the slot in `session.today` (`kind: "gym"`, `mapItemId: "GYM.nn"`); `gym.start` (built) records it. `x1` carries
X1's gate while X1 is closed. A gym day: warm-up 4 + transcription 10/14/19 + Coda 1 (§9.1); the saved transcription
version is the Make.

### 5.6 The voicing gate, sung statistics, the tutor

- **Voicing gate** (contracts §3.1 rule 6; `content/toolbox.ts` `VOICING_GATE` = exercise
  `U05.L07/hand-voiced-cadence`, `minScore` 0.9, unrevealed, `variants: ["U05.L08/hand-voiced-cadence-again"]`):
  evaluated by the server on `steps.attempt` of that exercise or a variant, from code the learner typed (an applied
  tutor card gives no evidence). U05.L08's first step is a `gateCheck` step: the lesson shows it only while
  `gates.voicing.passed` is false, and the server refuses `lessons.complete` of U05.L08 until the gate passes.
  `gates.voicing` reports it (`variants` included); `holds`
  lists the gated rows (`tb.chord`, `tb.voicing`, `tb.anchor`, `tb.mode.below`, `tb.dict.triads`, `snd.rhodes`,
  `snd.organ`, the triad chord family) granted at U05.L08 once passed.
- **Sung statistics:** the server fills `FamilyStateSchema.sungStats` from FET sung resolutions (per category: n,
  hits); drills-ui passes it to `SetPlanInput.sungStats`.
- **Tutor lesson context:** `StepSource` (`server/src/tutor/domain.ts`) gains `key: string | null` — the step
  exercise's key, else the lesson's — and `get_lesson_context.step` / `oak_context` carry it; the persona keeps to
  numbers until `term.solfege` is introduced (wave3.md gap). Owner: tutor.
- **Review threads:** one zod schema per kind (`CapstoneReviewSchema`, `TranscriptionReviewSchema`, tutor.ts) and the
  record union `ReviewRecordSchema`; the listening note is `tutor.note` (built).

## 6. Dev seeds (`POST /api/dev/seed { point }`) — the server engineer builds these FIRST

Every point gives a learner with a working mic and a calibrated range (`{ point, mic: false }`: Quiet mode, no mic),
last activity yesterday, today a fresh day. Every seeded capstone release has a recording (`{ point, recordings:
false }`: none). Each needs the content it walks through; until a lesson is authored the
point answers 400 naming the missing lesson.

| Point | Must contain (done, the last yesterday) | Today |
|---|---|---|
| `after U04.CP` | exists (wave3.md §5.5) | U05.L01 once authored |
| `after U05.L04` | default order through U05.L04 (symbols C Cm C° C+ known, `tb.arp`) | U05.L05 |
| `U05.L07 gate open` | through U05.L06; U05.L07 started, the gate exercise not yet passed | U05.L07 (gate check pending) |
| `after U05.L08` | through U05.L08 with the gate passed (≥ 0.9, typed): `chord()`, `voicing()`, `rhodes`, `organ` unlocked | U06.L01 |
| `U05.CP due` | U05.L01–L08 and U06.L01 | New block U05.CP |
| `after U06.L05` | U05.CP passed, through U06.L05 (`tb.feature.rn`, function, cadences) | U06.L06 |
| `U06.CP due` | U06.L01–L12 and U07.L01 | New block U06.CP |
| `after U07.L03 (gym due)` | U06.CP passed, U07.L01–L03: 4 core sessions since U07.L01 started the rule | New block GYM.01 (ladder, L1, R0) |
| `after U07.L07` | GYM.01 done (one graded L1 pass), U07.L04–L07, GYM.02 done (own-audio fallback) | U07.L08 |
| `U07.CP due` | U07.L01–L10, GYM.03 (U08.L01 is not written yet, so it is left out) | New block U07.CP |
| `C2 open` | U07.CP passed | C2.S1 |
| `C2.S1 done` | C2.S1 completed with a saved draft (an axis loop with a cadence in bars 7–8) | C2.S2 |
| `C2 released` | C2 released (v1, with a recording, deterministic liner notes, no review) | X1 gate closed: `fam.mel.dictation` at 3, "Two more gym sets open X1" |
| `X1 open` | C2 released and `fam.mel.dictation` at level 4 | X1.S1 |
| `X1.S2 done` | X1.S1–S2 completed: phrases 1–4 checked (one revealed) | X1.S3 |
| `X1 released` | X1 released | a review day ("The next lessons are still being written") until U08 is written, then U08.L02 |
| `ladder L3` | through U07.L07 with the ladder at level 3, realism R1, one L3 item started | a gym slot (ladder L3) |
| `own-audio project` | through U07.L07 with one own-audio project (a short WAV in the data dir, regions, a code version, half the checklist) | a gym slot (own audio) |

`GET /api/dev/seed` lists the points that exist. Specs that need a later state seed it instead of replaying days
(wave3.md §8); `PUT /api/dev/clock` moves time.

## 7. Browser suites

Unchanged from wave3.md §6: area configs are discovered by convention. Wave 4 adds `transcribe` (5213/8813) and moves
`kit` to 5214/8814. The journeys (`e2e/journey`, gate owner) run on the real stack (real server and content, the
scripted fake tutor, Chrome's fake microphone), each test from a dev seed and under about 4 minutes, with no console
error but Strudel's learner-error line and no request off this machine:

| Spec | Journeys |
|---|---|
| `w4-triads.pw.ts` | (a) U05.L01 from "after U04.L04"; U05.L07 from "after U05.L06" with the gate passed by typed code, then the next day U05.L08 granting `chord()`, `voicing()`, `rhodes`, `organ` — and (h) both again in Quiet mode (no mic request) |
| `w4-harmony.pw.ts` | (b) "after U06.L05": the bass-degree warm-up set (first trial's roots sung on the fake mic, every trial picked), U06.L06, the Coda, then the numeral lens switched off and on with Shift+R in Studio (I V vi IV on the chord band); (c) "U06.CP due" to a pass |
| `w4-transcription.pw.ts` | (d) "after U07.L03 (gym due)": GYM.01 from Today, the ladder item written from its stimulus, a graded pass, the ladder Coda; (g) own audio: a WAV imported, bars set, a bar looped at 0.75× on the stretch engine, A/B with the code |
| `w4-capstones.pw.ts` | (e) "C2 open": C2.S1 then C2.S2 a day later (review, recorded release); the album holds C0, C1 and C2 with covers and liner notes, C2 with its recording and a review; (f) "X1 open": X1.S1–S3 on Aura Lee over three days, chords bass first, the release |
| `prod.pw.ts` | the production build (`bun run build`, `--serve-dist`): onboarding, a mid-U03 learner, and a U06 learner from a backup starting the U06 session and opening Transcribe, each reloaded offline |

`w4-day.ts` holds the shared day steps. `OAK_JOURNEY_ALT=1` moves the journey to Vite 5242, API 8842 and production
8794 (data dirs `journey-alt*`), so the journeys can run while a full `bun run e2e` holds the gate ports.

## 8. What is frozen

After Foundation, import from these and never edit them; put what you need in your own folder and report under
`apiNotes` anything that should be promoted:

- `app/src/lib/**` (except `mic*.ts` — audio — and `tutor-stream.ts` — tutor), `app/src/main.tsx`,
  `app/src/router.tsx`, `app/src/routes/__root.tsx`, `app/vite.config.ts`, `app/index.html`, `app/public/**`.
- `app/src/ui/**` and `app/src/styles/**` for everyone except kit.
- `e2e/support/**`, root `playwright.config.ts`, root `package.json`, `bun.lock`, `bunfig.toml`, `biome.json`, root
  `tsconfig*.json`, `node_modules`.
- `docs/design/contracts.md`.
- Content registries (syllabus, skills, toolbox, terms, glossary, candos, flavours, milestones), `content/specs/**`,
  `content/validate/**`, `content/lib/**`, `scripts/content/**` (content lead); `packages/content-kit/**` is
  additive-only and the grader engineer's after Foundation.
- `packages/api/**` is additive-only and the server engineer's during Build; other areas request additions under
  `apiNotes`.

## 9. Workflow rules

- Never `bun install`/`bun add`, `git commit`/`stash`/`reset`/`checkout`. Stop every server you start; never kill a
  process you did not start (no `pkill` by name: twenty-eight stacks may be running).
- Vite on Node: `node node_modules/vite/bin/vite.js`, never `bunx --bun vite`.
- Logic tests `*.test.ts` next to the code: `bun test --isolate <your folder>` (always `--isolate`). Browser tests
  `*.pw.ts` in `<your folder>/e2e/` with your own config on your own ports (§2) and a `dataDirName` unique to you.
- **No stray specs or scratch files.** Temporary files go under your own directory in the scratchpad
  (`…/scratchpad/w4/tmp-<your key>/`) or `test-results/`, and are deleted before you finish.
- **Fast tests.** No Playwright test takes longer than about 4 minutes; every spec starts from a dev seed (§6) and
  `PUT /api/dev/clock` instead of replaying days.
- **Block Vite's HMR websocket** in your specs: `await page.routeWebSocket(/.*/, () => {})` before the first `goto`.
- Typecheck what you touch (`bunx tsc --noEmit -p <tsconfig>`; interfaces.md §1.4), then `bun run typecheck` and
  `bunx biome check --write <your paths>` (only your paths). Failures in another engineer's unfinished paths are
  reported, not fixed.
- Music claims and examples are verified with headless Strudel (`import { evalHeadless, midisOf } from
  "@oak/grader/testing"`), `bun run theory …` or `@oak/theory` (`readChord`, `romanText`, `cadenceOf`, `schemaOf`).
- The tutor only through the scripted fake backend (`OAK_DEV=1 OAK_TUTOR_FAKE=1`, wave2.md §5). Never the real CLI,
  never an API; nothing contacts a non-localhost host.
- **Results**: as your last step, write your full structured result as markdown to
  `/private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/w4/<label with ":" → "-">.md`.

## 10. Definition of done for a surface

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
10. **Works with lenses on and off** (Wave 3, and the chord lenses of Wave 4): with each lens on and off (and locked,
    before its unlock) your surface lays out without overflow or overlap, labels appear where the lens says and
    nowhere else, and nothing depends on a label being present.
11. **Music is right** (Wave 4): every chord name, numeral, cadence, function and degree your surface shows comes from
    `@oak/theory` / `harmonyView`, never from a local table; RN answers compare `(degree, quality, inversion)`.

## 11. Wave 4 content kinds: who renders, who grades

From `packages/content-kit/src/schema` as re-read at the end of Foundation (2026-11-12; `CONTENT_SCHEMA_VERSION` 3;
`IMPLEMENTED` and `PLANNED` in `implemented.ts`; `SCHEMA_FEATURES` name the shapes inside existing kinds). "Grades" is
always the grader (`gradeExercise` / `gradeCapstone` / `gradeLadder`); a kind or feature in `PLANNED` is rejected by
content CI in a lesson until its owner moves it into `IMPLEMENTED` with tests.

| Kind / field (status) | Type (content-kit) | Renders | Grades | Notes |
|---|---|---|---|---|
| `harmony` matcher (implemented) | `Matcher { m: "harmony"; level; qualityDepth; inversion; harmonicRhythm }` | — | grader | chord dictation, ladder L3, X1 S3 stages |
| rules `cadence`, `chord-tones-strong`, `progression`, `contains-rn`, `harmonic-rhythm`, `voice-leading` (implemented) | `rubric.ts` | capstone checklist, lesson Make lines | grader (`runRubric`) | C2 needs `progression` + `cadence` + `chord-tones-strong` + `motif-reuse` |
| `quality-pad`, `rn-palette` answers (implemented) | `AnswerUi` | answers (`widgets/Harmony.tsx`); hosted by lesson, drills-ui, checkpoint | grader (`gradeAnswer`, RN by degree/quality/inversion) | |
| `slot-choice` answer (planned) | `{ ui: "slot-choice"; slots; options: Choice[]; labels? }`; `FUNCTION_OPTIONS`, `CADENCE_OPTIONS`, `HARMONIC_FUNCTIONS` | answers (a strip of per-slot choices); hosted by lesson, checkpoint | grader (slot by slot, `partial` credit) | function strip (U06.L03), cadence per phrase (U06.L04), chord tone or not (U07.L03) |
| `progression.bars` (planned feature) | `{ rule: "progression"; …; bars?: [from, to] }` | capstone checklist | grader | C2 "bars 1–6 are the loop" |
| `voice-leading.gate` (planned feature) | `voice-leading` + `voices`, `commonTones`, `noCrossing`, `bassFree` | lesson (U05.L07 Make lines) | grader; the server evaluates the gate on `steps.attempt` (§5.6) | unlocks `voicing()`, `rhodes`, `organ` at ≥ 0.9 |
| `pickup` rule (planned) | `{ rule: "pickup"; track; units? }` | lesson Make lines | grader | U07.L08 |
| `chord-qualities` rule (planned) | `{ rule: "chord-qualities"; track?; contains?; subsetOf?; min? }` | lesson Make lines | grader (via `readChord`) | U05 Makes |
| `chord-inversions` rule (planned) | `{ rule: "chord-inversions"; track?; min; of? }` | lesson Make lines | grader (bass across tracks) | U05.L05, U06.L11 |
| `staff-expect.chords` (planned feature) | `StaffExpect { e: "chords"; symbols; spelling; bass }` + `palette.chords` | answers (`StaffInput` stacking notes; notation `[C4,E4,G4]:2`); hosted by lesson (`notate` steps) | grader (`staff-write`: pcset per chord, spelling, bass) | needs notation's chord edit in the note-list DSL |
| `dictation.stage-answers` (planned feature) | `DictationEx.stageAnswers` / `stageFlow` / `stagePass` | lesson (stage by stage, bass first); drills-ui for drill dictation | grader (`gradeStages`, each ≥ `stagePass`, default 0.8) | U06.L05, U06.L09 |
| `by-ear.parts` (planned feature) | `ByEarSpec.parts: ByEarPart[]` | lesson (one track at a time, A/B per part; Workbench `A`/`B`) | grader (per part matcher on its track, then the step matcher) | bass before any harmony part |
| `transcribe.stages` (planned feature) | `TranscribeStepEx.grading.stages`, `given: TranscribeGiven` | transcribe (ladder items, X1 in Transcribe) and capstone (X1 workspace) | grader (`gradeLadder` / per stage) | `given`: meter, key, tonic, pickup, rhythm skeleton |
| `stimulus.capstone-song` (planned feature) | `Stimulus { src: "capstone-song"; bars; layers? }` | capstone (resolves the chosen song's answer key; plays it as a pattern source) | grader (the capstone flow derives the reference) | X1: Aura Lee or Red River Valley only |
| `lead-sheet` (planned feature) | `Stimulus.showLeadSheet`, `StepUi.leadSheet: LeadSheetSpec` | lesson → Workbench staff panel via notation `leadSheetInput` (§3.3) | — | U07.L09 (3/4 with a pickup) |
| `step.gate-check` (planned feature) | `StepDef.gateCheck: true` (U05.L08 S1 only; its exercise is a `VOICING_GATE.variants` entry) | lesson (runs the step only while `gates.voicing.passed` is false; gated tools stay locked in the lesson until it passes) | grader (the voice-leading gate rules); server evaluates the gate | §5.6 |
| `step.initial-panels` (planned feature) | `StepUi.initialPanels: WorkbenchPanelId[]` | lesson (`initialPanelsOf`, §4.4) → workbench (draws the panels) | — | key, circle, chords, function, range, chord-tones |
| capstone sessions | `CapstoneSessionDef.checks: PhraseCheck[]`, `starter`, `review`, `release` | capstone (session flow, per-check A/B and check, review offer, release) | grader (`gradeCapstone`; phrase `melody` key-relative ≥ 0.85, stages ≥ 0.80) | server stores states (`capstones.recordCheck`) |
| `ListenEx.passive`, `SingEx` labels, `StaffExpect key-signature` … | Wave 3, unchanged | as wave3.md §10 | | |

Drills (`fam.chd.*`, `fam.har.*`, `fam.mel.nct`, `deck.chd.symbols`; contracts §7.3) are generated by drills-engine
and rendered by drills-ui with the `quality-pad`, `rn-palette`, `degree-pad` (bass degree) and `slot-choice` widgets;
graded by `@oak/drills` + `gradeAnswer`.
