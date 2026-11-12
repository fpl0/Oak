# Oak Wave 3 seams — notation and voice

**Status: binding for Wave 3 Build.** Written in the Foundation phase (2026-11-11). Ranks below `contracts.md`,
above everything else (`wave2.md`, `interfaces.md`, ux, the rest). It records who owns what, the seams between
builders (signatures copied from the code; when this file and the code disagree, the code is right and this file
has a bug — report it), the API additions, the ports, what is frozen and the definition of done.

Goal of the wave: staff input, bass clef, grand staff and key signatures; scale-degree labels, solfège, the
key-signature panel and the circle of fifths; functional ear training on scale degrees with sung resolution,
sing-echo and sight-singing, with a trustworthy pitch tracker and tolerance ladder and a first-class Quiet mode;
units U03 "Major Scale & Degrees" (11 lessons + checkpoint) and U04 "Intervals" (4 lessons + checkpoint).

Read first: `wave2.md` "Wave 2 state" (what you can rely on and the known gaps), then this file in full.

## 0. Wave 3 state (read this first)

**Status at the end of Wave 3 (2026-11-12, after integration, the four reviews and the final gate).** Everything
below is built and proven; where a section further down still says "until built" or "NOT BUILT", read it as
history. The code beats this file; `interfaces.md` §17–§18 list the API changes of the wave.

What Wave 4 can rely on:

- **The app through U04.** 34 course lessons (U00: 2, U01: 9, U02: 8, U03: 11, U04: 4) and the checkpoints U01.CP to
  U04.CP, all released, their IDs locked in `content/ids.lock.json`, every one passing `bun run content:check all`
  with the real grader. Every step of every U03–U04 lesson and both new checkpoints is walked in the real app
  (`app/src/lesson/e2e/walk-*.pw.ts`), and the journeys of §6.1 play them as daily sessions, in Quiet mode too.
- **No 501s.** `WAVE3_PENDING` is empty: `session.day`, `voice.get`, `voice.quiet`, `voice.ladder` and `drills.get`
  are built, with idempotent replay of `steps.attempt` and `srs.review` (§5.2) and one open session per learner day
  (§5.1, decision 28: a second tab joins it). `drills.start` returns the set already open for the same
  `(sessionId, warmupItemId)`, so a second browser resumes a half-done warm-up set and a double click makes one set.
- **Notation** (§3.1): `measureStaff` and `placeAnnotations` are built; annotations are emitted by `toAbc`; key
  changes inside a staff are spelled bar by bar behind a double barline; each staff can carry its own key
  (`NotationInput.trackKeys`, filled by the Workbench when learner tracks state different keys); only the last page
  of a paged staff ends with a final barline; grand-staff edits keep both hands. Staff input, the key-signature
  staff and the dictation staff (drill levels 7–9) all use `app/src/answers/staff/`. 131 golden snapshots, each read
  back independently through abcjs.
- **Voice.** `@oak/pitch` meets the pitch gate in Bun and through the browser AudioWorklet (decisions log, W3 row);
  `takeQuality(frames, profile)` says why a take failed (`voice` / `no-voice` / `too-noisy` / `too-short`, plus
  `clipped`), and the lesson and drills give each its own copy. Quiet mode is server state (§5.3), honoured by the
  planner (no mic sets), the drill runner (ways home heard, never sung; the mic never opens), the lesson (sing steps
  pass over) and checkpoints (sung items set aside, never counted), and carried to every open tab
  (`app/src/voice/sync.ts`).
- **The ladder is held only by an offered checkpoint** (decision 29): `VoiceService.pendingCheckpoint(day)` holds
  it while a checkpoint the planner offered is not passed or soft-passed and the offer is younger than
  `LADDER_OFFER_HOLD_DAYS` (14) learner days **with a session** (a break does not age it). Offers are recorded by the
  planner wrapper (`srs-wiring.ts`) under the internal setting `voice.cpOffers`. It no longer starts at a unit's
  second-to-last lesson (contracts §8.2 was amended to match in version 1.3).
- **First review within 7 days** (decision 27): a perceptual or production family still deferred 2 days after its
  lesson is released whatever the forecast; room is made by early graduation or by **resting** a stable family in
  its composite. Measured over 30 simulated 300-day runs: no such family waits more than 6 days, none is left
  unreviewed. `FamilyState.restingSince` (a day, or null) reports resting; Practice and the Oak say "In mixed
  practice", never "Mastered".
- **Today's done state** comes from `session.day.doneForToday`, which is also true on the learner day onboarding
  finished (`SessionsService.onboardedOn`). The learner day never runs backwards (`monotonicDay`, the activity
  floor). Past the written course (`after U04.CP`) Today is a review day with Studio and the note "The next lessons
  are still being written" (`app/src/session/edge.ts`).
- **Settings:** `lenses` (degrees, solfège, note names; Settings and the lens bar) and `albumTitle` (1–60 characters,
  null = the default; covers fit long names).
- **Tests:** `bun run check` and the full `bun run e2e` are green at the gate (numbers in the decisions log, W3 row).

Known gaps carried into Wave 4 (each is small and named where it lives):

- The circle-of-fifths and key-signature panels never open inside a lesson step (the lesson passes no
  `initialPanels`, and U03.L07 is authored without one); they are Studio, capstone and playground tools. The
  circle's key preview plays only the learner's tracks (`PatternPlayer.load` has no Band option).
- The tutor's lesson context names the lesson's key, not the step's (`LessonSource.key`, `server/src/tutor`). In the
  live smoke the tutor used solfège syllables in U03.L06, before U03.L08 introduces them: the persona
  (`server/src/tutor`) should keep to numbers until `term.solfege` is introduced.
- A key change in the middle of a bar does not change the signature (the notes carry accidentals); a staff that mixes
  tracks in two keys keeps the piece's signature.
- Runtime bleed detection during sing steps (contracts §8.6, `sing.bleed`) is not wired: `detectBleed` runs only in
  calibration. A silent learner whose headphones leak the backing at −40 dBFS can pass a "sing 1" step
  (pinned in `packages/pitch/src/adversarial.test.ts`); the per-note octave fold of §8.1 is what lets it through.
- After the learner's first edit the code-modify region box (`lesson/target-marks.ts`) is not redrawn where the
  region moved (`@oak/strudel` does not export the live editable ranges).
- The by-ear source player loops the whole tune (no per-bar loop); the live sing trace is not coloured by degree.
- `SetPlanInput.sungStats` is not filled (no per-degree record of sung resolutions on the server).
- Drill ways home use the drills' own cue plan, not `@oak/strudel/reference` `cadencePlan`.
- Ladder milestones count a finished generated transcription as a pass (no graded-pass flag).
- `snd.brk` is missing from the sound pack; nobody has listened to the jazz-soul drums (measured only).
- Repertoire answer keys are `verified: false` until a human checks them against the cited editions.

## 1. Ownership (Build phase)

Each engineer owns exactly these paths (verbatim from the wave plan):

- notation    : packages/notation/**                                                                  (own e2e Vite port 5194 if a DOM render test needs one)
- grader      : packages/grader/**, packages/theory/**, packages/content-kit/** (additive after Foundation)  (no browser)
- answers     : app/src/answers/**                                                                    (ports vite 5202 / api 8802)
- workbench   : app/src/workbench/**, app/src/studio/**, app/src/toolbox/**, app/src/routes/studio/**, app/src/routes/toolbox/**  (5206 / 8806)
- voice       : packages/pitch/**, packages/audio/**, app/src/voice/**, app/src/onboarding/**, app/src/lib/mic*.ts, app/src/routes/onboarding/**, app/src/routes/settings_.voice.setup.tsx, app/src/routes/settings/voice.tsx, app/src/routes/settings/audio.tsx  (5209 / 8809)
- drills-ui   : app/src/drills/**, app/src/routes/practice/**                                         (5203 / 8803)
- drills-engine: packages/drills/**, packages/srs/**, content/families.ts, content/decks/**             (no browser)
- lesson      : app/src/lesson/**, app/src/routes/learn/**, app/src/routes/checkpoint/**            (5201 / 8801)
- session     : app/src/session/**, app/src/map/**, app/src/routes/index.tsx, app/src/routes/session/**, app/src/routes/progress.tsx, app/src/routes/oak.tsx, app/src/routes/dev/**  (5205 / 8805)
- polish      : app/src/tutor/**, app/src/capstone/**, app/src/album/**, app/src/ui/** (kit, shell, keys, review — the ONLY engineer who edits shared UI), app/src/styles/**, app/src/lib/tutor-stream.ts, app/src/routes/capstone/**, app/src/routes/album/**, app/src/routes/settings/tutor.tsx  (5208 / 8808)
- server      : server/** except server/src/tutor/**; packages/api/** (additive); scripts/** except scripts/content/** and scripts/sounds/**  (api 8811)
- sound       : packages/strudel/**, scripts/sounds/**, sounds/**                                      (5192)
- author:U03a : content/core/U03/L01, L03, L04      - author:U03b : content/core/U03/L05, L06, L07
- author:U03c : content/core/U03/L08, L09           - author:U03d : content/core/U03/L10, L11
- author:U04  : content/core/U04/L01 … L04
- author:CP   : the U03.CP and U04.CP items (content/checkpoints.ts and the checkpoint folders AUTHORING.md names), content/bands/**, content/repertoire/** — the only author who edits those
- (U03.L02 "Degrees in Code" is the exemplar written in Foundation by the content lead. The remaining content registries — syllabus/skills/toolbox/terms/glossary/candos/flavours/milestones — content/specs/**, content/validate/** and scripts/content/** are frozen during Build: authors request changes via apiNotes. app/src/lib/** (except mic*.ts and tutor-stream.ts), app/src/main.tsx, router.tsx and routes/__root.tsx are frozen during Build for everyone.)

Files Foundation created or changed inside an owner's paths are that owner's from now on; keep their exported
signatures (others code against them) and extend freely:

| Owner | Seam files Foundation wrote | What the owner does with them |
|---|---|---|
| notation | `packages/notation/src/options.ts`, `geometry.ts`, `seams.test.ts`; additions in `edit.ts` (`move`, `accidental`, `noteListInput`, `editNoteList`), `render.dom.ts` (`noteElements`, `noteBox`, `measureStaff`, `placeAnnotations`), `types.ts` (`NotationInput.annotations`) | write `measureStaff` and `placeAnnotations` (today they throw `NotationNotBuiltError`), emit `annotations` in `toAbc`, bass/grand/key-signature engraving polish |
| grader | `packages/theory/src/keys.ts` (+ `keys.test.ts`); `packages/grader/src/analyze/scale-context.ts` (+ test) | both are implemented and tested; extend (chromatic labels in modes, `ignoreScaleCtx` from the lint) |
| server | `packages/api` Wave 3 block (`dto.ts` end, `contract.ts` end, `wave3.test.ts`); 501 stubs in `server/src/routes/{course,meta,practice}.ts`; `routes.test.ts` "Wave 3 endpoints" | build the five endpoints and the behaviour of §5.1–§5.4; remove each name from `WAVE3_PENDING` as it lands; dev seeds of §5.5 first |
| session | `app/src/session/fixtures.ts` (`lenses` added to the fixture settings) | — |

Previous Wave 2 owners' folders moved: map → session; studio, toolbox → workbench; onboarding, voice → voice;
tutor, capstone, album, ui → polish. Their seam files of `wave2.md` §1 move with them.

## 2. Ports, environment, one stack per area

Environment variables are unchanged from `wave2.md` §2 (`OAK_PORT`, `OAK_DEV`, `OAK_VITE_PORT`, `OAK_API_PORT`,
`OAK_DATA_DIR`, `OAK_TUTOR_FAKE`; `OAK_NOW` sets the dev clock at start-up). Nothing new.

| Owner | Primary stack (Vite / API) | Existing configs the owner inherits | A second stack, if needed |
|---|---|---|---|
| notation | Vite page 5194 (no API) | — | — |
| answers | 5202 / 8802 | `app/src/answers/e2e` | 5232 / 8832 |
| workbench | 5206 / 8806 | `app/src/studio/e2e` (5206/8806), `app/src/workbench/e2e` (Vite page 5193) | 5236 / 8836 |
| voice | 5209 / 8809 | `app/src/onboarding/e2e` (5209/8809) | 5239 / 8839 (e.g. `app/src/voice/e2e`) |
| drills-ui | 5203 / 8803 | `app/src/drills/e2e` | 5233 / 8833 |
| lesson | 5201 / 8801 | `app/src/lesson/e2e` | 5231 / 8831 |
| session | 5205 / 8805 | `app/src/session/e2e`, `app/src/map/e2e` (5207/8807) | 5235 / 8835 |
| polish | 5208 / 8808 | `app/src/tutor/e2e`, `app/src/capstone/e2e` (5210/8810), `app/src/ui/kit/e2e` (5200/8800), `app/src/ui/review/e2e` (5222/8822) | 5238 / 8838 |
| server | API 8811 (bun tests only) | — | — |
| sound | Vite page 5192 | `packages/strudel/e2e` | — |
| (gate) | journey 5212 / 8812 (+ 8792), review 5221 / 8821, platform 5173 / 8787 / 8790, audio 5191 | — | — |

- Each config's `dataDirName` is unique (`test-results/stacks/<name>`, wiped at every start). A new config takes a
  new name (`voice`, `lesson-w3`, …), never another config's.
- A config in a new folder uses the owner's second pair above, never the primary pair of an existing config: two
  configs on one port make `bun run e2e` fail with a port-clash error (§6).
- **Notation's DOM page** (if needed): `packages/notation/e2e/playwright.config.ts` exporting `area: Area` with
  its own Vite page on 5194 (copy the shape of `app/src/workbench/e2e/playwright.config.ts`); its files are
  typechecked by `tsconfig.e2e.json` (which now includes `packages/notation/e2e`).

## 3. Package seams

### 3.1 `@oak/notation` — clef, key signature, annotations, staff geometry, edit model

The split: everything that can be computed from a `Score` or from numbers is pure and lives in the package root
(Bun-testable); everything that needs the rendered SVG lives in `render.dom.ts` (entry `@oak/notation/render`)
and only measures or decorates. The staff-input widget (answers) composes them:
`renderStaff` → `measureStaff` → pointer → `hitTest` → `editNoteList` → re-render.

Options (`options.ts`):

```ts
export type Clef = Extract<StaffKind, "treble" | "bass" | "grand" | "percussion">;
export const CLEFS: readonly Clef[];
/** A key: a KeySpec, a key name or .scale() argument ("Eb", "F#m", "C4:major"), or fifths −7…7 (major). */
export type KeySignatureOption = KeySpec | string | number | null;
export function resolveKeySignature(opt: KeySignatureOption): KeySpec | null;   // throws RangeError on a non-key
export interface AnnotationSet { degree?: boolean; solfege?: boolean; noteName?: boolean; position?: "below" | "above" }
export interface NoteAnnotation { n: number; degree?: string; solfege?: string; noteName?: string }
export const ANNOTATION_CLASSES: { degree: "oak-ann-degree"; solfege: "oak-ann-solfege"; noteName: "oak-ann-name"; note: "oak-ann-e" };
/** Texts per engraved pitched note (tie continuations skipped; chords joined low→high by a thin space). */
export function noteAnnotations(score: Score, which: AnnotationSet, key?: KeySpec | null /* default score.key */): NoteAnnotation[];
// NotationInput gains: annotations?: AnnotationSet   — NOT BUILT in toAbc yet; `labels` keeps working.
```

Clef and key are the existing `NotationInput.staff: StaffKind` (`treble | bass | grand | percussion | …`, grand
split by `splitMidi`, default 60) and `NotationInput.key: KeySpec | null`; resolve a key option with
`resolveKeySignature` first. Degree texts are 1-based with Unicode accidentals (`1`, `♭3`, `♯4`), syllables are
movable do with do-based minor (`do re mi`, `me le te`), names are display spellings (`F♯4`).

Geometry and hit-testing (`geometry.ts`, pure):

```ts
export interface Box { x: number; y: number; width: number; height: number }
export interface StaffBandGeometry {
  staff: Staff["id"]; clef: Staff["clef"]; system: number;
  topLineY: number; lineSpacing: number; y0: number; y1: number;
  bars: { x0: number; x1: number; cycle: number }[];
}
export interface NoteGeometry { n: number; staff: Staff["id"]; box: Box; heads: Box[] }
export interface StaffGeometry { staves: StaffBandGeometry[]; notes: NoteGeometry[] }
export interface HitContext { meter: MeterSpec; key: KeySpec | null; grid?: Rat /* default [1,16] */ }
export interface StaffHit {
  staff: Staff["id"]; clef: Staff["clef"]; system: number;
  cycle: number; onset: Rat; slot: number;          // bar, snapped onset, grid slot in the bar
  step: number; pitch: SpelledPitch | null;          // half-spaces below the top line; pitch in clef + key (null: perc)
  note: number | null;                               // engraved note under the pointer (`oak-e{n}`)
}
export function hitTest(geom: StaffGeometry, point: { x: number; y: number }, ctx: HitContext): StaffHit | null;
export function staffAt(geom: StaffGeometry, y: number): StaffBandGeometry | null;
export function noteAt(geom: StaffGeometry, point: { x: number; y: number }, slop?: number): number | null;
export function headAt(note: NoteGeometry, point: { x: number; y: number }): number | null;   // chord member
export function stepY(band: Pick<StaffBandGeometry, "topLineY" | "lineSpacing">, step: number): number; // ghost note y
export function onsetX(band: Pick<StaffBandGeometry, "bars">, onset: Rat): number | null;             // ghost note x
export class NotationNotBuiltError extends Error { readonly code: "notation_not_built" }
// unchanged and still exported: staffStepAtY, stepToPitch, pitchToStep, nudgePitch, xToOnset, writtenToCycles
```

Edit model (`edit.ts`, pure). `StaffEdit` gains two operations:

```ts
export type StaffEdit =
  | { op: "insert"; onset: Rat; dur: Rat; pitch: string; track?: string; keep?: boolean }
  | { op: "rest"; onset: Rat; dur: Rat; track?: string }
  | { op: "delete"; eventId: string }
  | { op: "repitch"; eventId: string; pitch: string }
  | { op: "resize"; eventId: string; dur: Rat }                       // change duration
  | { op: "move"; eventId: string; onset: Rat; pitch?: string }       // Wave 3: keeps length, replaces what it lands on
  | { op: "accidental"; eventId: string; alt: -2 | -1 | 0 | 1 | 2 };  // Wave 3: same letter and octave
export interface NoteListContext { meter: MeterSpec; key: KeySpec | null; bars: number; staff?: "treble" | "bass" | "grand"; track?: string }
export function noteListInput(list: string, ctx: NoteListContext): NotationInput;
/** The staff-input answer value (note-list DSL) in, one edit, the new value out, with the rebuilt Score and ABC. */
export function editNoteList(list: string, edit: StaffEdit, ctx: NoteListContext, opts?: AbcOptions):
  { list: string; input: NotationInput; score: Score; abc: AbcResult };
```

Event IDs are the canonical ones of `parseNoteList` (contracts §5.7); a clicked `oak-e{n}` resolves through
`abc.idMap[n].eventIds`. The answer value stays the note-list string (`AnswerValueMap["staff-input"]`), e.g.
`"F#4:4 r:4 Ab4:2"`; `editNoteList("", insert E4 quarter, bars 2)` gives `"E4:4 r:4 r:2 | r:1"`.

DOM layer (`render.dom.ts`, entry `@oak/notation/render`):

```ts
export function renderStaff(el: HTMLElement, abc: string, opts?: {...}): Promise<RenderedStaff>;   // Wave 1, unchanged
export function noteElements(root: ParentNode, n: number, prefix?: string): Element[];              // built
export function noteBox(root: ParentNode, n: number, prefix?: string): DOMRect | null;              // built
export function measureStaff(el: HTMLElement, abc: AbcResult, score: Score): StaffGeometry;         // built
export function placeAnnotations(el: HTMLElement, annotations: readonly NoteAnnotation[], which: AnnotationSet): void; // built
```

Until notation lands `measureStaff`, the staff-input widget catches `NotationNotBuiltError` and keeps the typed
note-list field the lesson host already has (wave2.md known gap 2), so nothing is a dead end mid-build.

### 3.2 `@oak/theory` — key context, labels, signatures, intervals (`keys.ts`, built and tested)

```ts
export type KeyInput = KeySpec | string | number;   // KeySpec; "C4:major", "D4 major", "F#m", "A minor"; fifths −7…7
export function keyOf(input: KeyInput, mode?: "major" | "minor"): KeySpec | null;
export function keyFromFifths(fifths: number, mode?: "major" | "minor"): KeySpec;      // −3 → E♭ major / C minor
export function fifthsOfKey(key: KeySpec): number;                                    // D major +2, D dorian 0
export const SHARP_ORDER: readonly ["F#","C#","G#","D#","A#","E#","B#"];
export const FLAT_ORDER: readonly ["Bb","Eb","Ab","Db","Gb","Cb","Fb"];
export interface SignatureInfo { fifths: number; sharps: string[]; flats: string[]; major: KeySpec; minor: KeySpec }
export function signatureOf(keyOrFifths: KeySpec | number): SignatureInfo;
export interface PitchLabel {
  midi: number; degree: Degree; num: number; alt: number; chromatic: boolean;
  syllable: string; name: string; display: string; degreeDisplay: string;   // "b3"/"me"/"Eb4"/"E♭4"/"♭3"
}
export function labelPitch(midi: number, key: KeySpec, opts?: { direction?: 1 | -1 }): PitchLabel;
export interface FifthsNeighbours { key: KeySpec; fifths: number; clockwise: KeySpec; counterclockwise: KeySpec; relative: KeySpec; parallel: KeySpec }
export function fifthsNeighbours(key: KeySpec): FifthsNeighbours;                     // past ±7: enharmonic (C♯ → A♭)
export interface IntervalInfo {
  semitones: number; generic: number; name: string; quality: "P"|"M"|"m"|"A"|"d"|"AA"|"dd";
  long: string; tritone: boolean; compound: boolean; direction: "up" | "down" | "unison"; low: string; high: string;
}
export function intervalOf(a: number | string, b: number | string, key?: KeySpec | null): IntervalInfo;
```

Already there and still the one place for: `degreeOf`, `syllableOf`, `spellMidi`, `keySignature` (notes in
order + abcjs `K:`), `keysWithSignature`, `circleOfFifths`, `relativeKey`, `parallelKey`, `transposeKey`,
`strudelStep` (degree → `n` step, "3#" for ♯4), `intervalBetween`/`parseInterval`/`invertInterval`,
`normalizeText("interval" | "key", …)`. Names follow Oak's dialect: specific intervals quality-first (`m3`,
`P5`, `A4`; tonal writes `3m`), generic by number (`3` = a third), long names `minor 3rd`, `perfect 5th`,
`augmented 4th`, `unison`, `octave`. A chromatic pitch is labelled by the key's convention (♭3 ♯4 ♭6 ♭7 ♭2 in
major); `direction` spells a passing note by its motion (A♯ rising = ♯6, G♭ falling = ♭5) and the degree follows
the spelling. Verified against tonal (`keys.test.ts`).

### 3.3 `@oak/grader` — the key context per track (`analyze/scale-context.ts`, built and tested)

```ts
export interface KeySpan { from: Rat; to: Rat; key: KeySpec; scaleCtx: string | null; source: "declared" | "scale" | "estimate" }
export interface TrackKeyContext { track: string; band: boolean; spans: KeySpan[] }
export interface KeyContextOptions {
  declared?: KeySpec | null;
  prefer?: "declared" | "code";            // "declared" = contracts §6.8 (grading); "code" = Studio, free play, lenses
  ignoreScaleCtx?: readonly string[];       // tracks with .transpose() after .scale() (lint code.transpose-after-scale)
}
export function trackKeyContexts(n: Normalized, opts?: KeyContextOptions): TrackKeyContext[];
export function keyAt(contexts: readonly TrackKeyContext[], track: string, onset: Rat): KeySpec | null;
```

Every pitched track gets spans: from `NEvent.scaleCtx` (`.scale("C4:major")`, and per event for a patterned
`.scale("<C4:major D4:major>")` — verified headless: bar 1 "C4 major", bar 2 "D4 major"), the declared key, or a
whole-piece estimate for `note()`/`chord()` tracks. Drum tracks have no spans. A view labels an event with
`labelPitch(e.midi, keyAt(ctx, e.track, e.onset))`. The Workbench's own `keyContext` (first `.scale()` of the
piece) is replaced by this in Wave 3 (workbench).

### 3.4 Seams added during Build and integration (all exported, all tested)

- **`@oak/pitch`**: `take.ts` — `takeQuality(frames, profile): TakeQuality` (`heard: TakeHeard` =
  `"voice" | "no-voice" | "too-noisy" | "too-short"`, `clipped`, counts), the thresholds `HOLD_SEC`, `CLIP_LEVEL`,
  `CLIP_MIN_FRAMES`, `VOICE_LIKE_CLARITY`, `VOICE_LIKE_ABOVE_FLOOR_DB`, `LOUD_ROOM_SEC`; `PitchFrame.peak?` (window
  max |sample|); `SungResult.take`; `TrackerOptions.splitWindow?` (default 16 frames: a note splits only when the
  ~170 ms mean leaves it, so vibrato stays one note).
- **`@oak/grader`**: `toolText` (a tool named as the learner writes it, never by ID); `unfilledSlots` and
  `OPTIONAL_SLOTS` (catalog render audit, `feedback/render-audit.test.ts`); `transpositionOf` (by-ear answers are
  read in the learner's `.scale()` key unless another shift really fits); `stepIndex` (match/melody);
  `GradeDeps` / `ConstraintInput` / `RubricContext` gain `toolCode`; `intervalSlots(..., { spelled })` and
  `gradeAnswer`'s `spelledIntervals` (the page's spelling decides TT vs A4 vs d5); `MotifReuseOptions`,
  `diatonicIndex`, and the motif-reuse rule's optional `shape: "semitones" | "steps" | "either"` measured over ONE
  period of the learner's loop. New codes and params: `sing.clipped` (warning); `sing.no-voice` gains
  `params.reason` (`none | noisy | short`), `params.ms`, `params.more`; a single `melody.index-shift` replaces
  per-note wrong degrees when every note is one scale step off; an unchanged by-ear starter gives `code.unchanged`.
- **`@oak/notation`**: `NotationInput.keyChanges?`, `Score.keyChanges?`, `KeyChange`, `keyAtBar(score, bar)`;
  `slicedNoteList` (overlaps written with ties; grand-staff edits displace only notes on their own side of
  `splitMidi`).
- **`@oak/strudel`**: Band key names are folded into the register they were written for (C–F at octave 4, F♯/G♭–B
  at 3) in `band.ts`, including key plans (`.scale("<C4:major G4:major …>")`). Band code keeps writing `{{key}}` as
  `<tonic>4:<mode>`. `@oak/strudel/reference` gives the home/chords reference sounds the answer widgets play.
- **`@oak/srs`** (decision 27): `DECISION_27`, `overdueFirstReviews`, `restCandidate`, `planOverdueReleases`,
  `pickRestReturn`, `ReviewItem.firstSet`, `GovernorConfig.restMinReps`; `recommendedGovernor` sets
  `releaseAfterDays: 2`, `restMinReps: 3`. `graduateForOverdue` is gone.

## 4. App seams (`app/src/lib`, frozen after Foundation)

### 4.1 Query hooks (`queries.ts`)

```ts
export const useSessionDay: () => UseQueryResult<SessionDay>;            // GET /session/day
export const useVoiceState: () => UseQueryResult<VoiceState>;            // GET /voice
export const useVoiceQuiet: () => mutation<"voice.quiet">;               // invalidates voice.get, profile.get, bootstrap, srs.due
export const useVoiceLadder: () => mutation<"voice.ladder">;             // invalidates voice.get, profile.get
export const useDrillSession: (id: string | null) => UseQueryResult<DrillSessionDetail>;
// changed invalidations: steps.attempt → + voice.get; drills.finish → + voice.get, drills.get;
// session.start / session.end → + session.day
```

Until the server builds an endpoint it answers 501 (`OakApiError.code === "not_implemented"`, never retried);
`ErrorState` reads "Not built yet". Code against the types now; the data arrives when the server lands.

### 4.2 Idempotency (`idempotency.ts`)

```ts
export function idempotencyKey(): string;   // crypto.randomUUID(), else 22 URL-safe random characters
```

One key per learner action (one Check, one finished set), reused on a retry of that same action; sent as
`body.idempotencyKey` on `steps.attempt` and `srs.review` (§5.2). lesson and drills-ui generate them.

### 4.3 Lenses (`lenses.ts`)

```ts
export type { LensId, LensPrefs };                     // "degrees" | "solfege" | "noteNames"; { degrees; solfege; noteNames: boolean }
export const LENS_IDS: readonly ["degrees", "solfege", "noteNames"];
export const LENS_UNLOCKS: { degrees: "tb.feature.degree-labels"; solfege: "tb.feature.solfege"; noteNames: null };
export const LENS_LABELS: { degrees: "Degrees"; solfege: "Solfège"; noteNames: "Note names" };
export const DEFAULT_LENSES: LensPrefs;                // { degrees: true, solfege: true, noteNames: false }
export function lensAvailability(unlocked: ReadonlySet<string>): Record<LensId, boolean>;
export function effectiveLenses(prefs: LensPrefs, unlocked: ReadonlySet<string>): LensPrefs;
export function rollLabelsOf(shown: LensPrefs): "none" | "note" | "degree" | "degree+solfege";
export interface Lenses {
  prefs: LensPrefs; shown: LensPrefs; available: Record<LensId, boolean>; ready: boolean;
  set(id: LensId, on: boolean): void; toggle(id: LensId): void;
}
export function useLenses(): Lenses;
```

- The preference is the `lenses` setting (`settings.put` key `lenses`, read from `bootstrap.settings`) — already
  persisted by the existing settings endpoint, no stub. `set` is optimistic on the bootstrap cache and rolls back
  with a toast on failure. Every component that calls `useLenses()` sees the same value.
- **Shown = preference ∧ unlocked.** A locked lens has no switch (`available[id] === false`): before U03.L02 no
  degree labels anywhere, before U03.L08 no syllables.
- **Who wins.** Inside a lesson step, the content's `ui.rollLabels` / `ui.staffLabels` (scaffold fading,
  AUTHORING §6) win; the lens switches are hidden there. Everywhere else (Studio, free play, Toolbox demos, drills,
  answer widgets, the album) the lenses decide. Settings → Learning's `rollLabels` stays: `auto` follows the lenses;
  a fixed value overrides the roll only.
- **Where the switches live**: the Workbench transport (workbench owns), the drill footer (drills-ui owns).
  Answer widgets only read `shown` (degree pads already have their own `syllables` prop from content; a widget
  shows syllables when either asks).
- Singing labels are separate: `VoiceState.labels` (profile `solfege`: numbers until U03.L08) decides what the
  learner sings on and sees under a sung target (contracts §8.3); the solfège lens is display only.

## 5. API additions (`packages/api`, additive)

Every new endpoint is a contract entry with a zod DTO; until built it answers the typed 501, registered in the
route file named below. `WAVE3_ENDPOINTS` lists them; `server/src/routes/routes.test.ts` ("Wave 3 endpoints")
keeps `WAVE3_PENDING` and checks each pending one answers 501 and each built one never does.

| Name | Method · path (under `/api`) | Body / query | Response | Route file | Needed by |
|---|---|---|---|---|---|
| `session.day` | GET `/session/day` | | `SessionDaySchema` `{ day, open, ended, doneForToday, summarySessionId }` | course.ts | Today's done state on the server (gap 3) |
| `voice.get` | GET `/voice` | | `VoiceStateSchema` `{ day, quiet, quietReason, range, labels, ladder }` | meta.ts | drills, lesson sing steps, mic chip, Settings → Voice |
| `voice.quiet` | PUT `/voice/quiet` | `VoiceQuietSetSchema` `{ quiet, scope: "today" \| "always" }` | `VoiceStateSchema` | meta.ts | the mic chip, Settings → Voice |
| `voice.ladder` | PUT `/voice/ladder` | `VoiceLadderSetSchema` `{ mode: "auto" \| "fixed" \| "loosen", cents? }` (cents iff fixed) | `VoiceStateSchema` | meta.ts | Settings → Voice, the one-tap loosen |
| `drills.get` | GET `/drills/sessions/:id` | | `DrillSessionDetailSchema` `{ session, trials }` | practice.ts | drill resume, set summary |

Changed shapes (all additive; every Wave 2 body still parses — `packages/api/src/wave3.test.ts`):

| Schema | Change | Owner of the behaviour |
|---|---|---|
| `SettingsSchema` / `DEFAULT_SETTINGS` | `lenses: LensPrefsSchema` (`{ degrees, solfege, noteNames }`, default `true, true, false`) | works now (settings repo) |
| `StepAttemptCreateSchema`, `SrsReviewRequestSchema` | `idempotencyKey?: IdempotencyKeySchema` (`[A-Za-z0-9_-]{8,64}`) | server (§5.2) |
| `DrillTrialRecordSchema` | `revealed?: boolean`, `modality?: "normal" \| "quiet" \| "fallback"`, `sungResolution?: SungResolution \| null` | server stores and reads them (§5.3) |
| `SungNoteSchema`, `SungResolutionSchema` (new) | `{ path: Degree[], order: "play-first" \| "sing-first", notes: SungNote[], credit, passed, skipped, quiet, tolCents }` | drills-ui sends, server evidence |
| `ProgressReportSchema.milestones[]` | `+ title, description` (from `content/milestones.ts`) | built (server `progressReport`) |
| `WAVE3_SEED_POINTS` (new const) | the dev seeds of §5.5 | server |
| `FamilyStateSchema` | `restingSince?: Day \| null` (decision 27) in `families.list`, `families.state`, `srs.review` and `drills.finish` | built (server); read by `app/src/drills/resting.ts` |
| `SettingsSchema` / `DEFAULT_SETTINGS` | `albumTitle?: string \| null` (trimmed, 1–60 characters, no control characters; default null); `settings.put` with no value is a 400 | built |
| library | a pd-song whose answer key is unchecked (`verifiedBy` "pending…") is refused for transcription with 409 | built |

### 5.1 One open session per learner day (decision)

`session.start` on a learner day that already has an open session (not ended) returns **that** session (same
`id`, HTTP 200) instead of starting a second one, whatever `kind`/`mapItemId` the second call names. Two tabs
therefore share one session; the second tab resumes it. A session ended today does not block a new one ("More
practice", Studio). `session.day` reports the open one and those ended; `doneForToday` is true once a planned
session (kind ≠ `studio`) ended today, and Today renders its done state from it instead of localStorage.

### 5.2 Idempotency

The server stores the first response of `steps.attempt` and `srs.review` under `idempotencyKey` (per endpoint) and
answers a repeat with the same body, without counting an attempt, evidence, a rating or a streak day again. A key
seen with a different body is a 409 `conflict`. Keys live at least 24 hours. A request without a key behaves as
in Wave 2. (`drills.trials` is already idempotent: trials are upserted by `(drillSessionId, idx)`;
`checkpoints.attempt` refuses a second submit of the same `attemptNo` with 409.)

### 5.3 Voice: Quiet mode, range, the tolerance ladder

- **Quiet mode** is server state. `quiet` is true when the learner set it for today (`scope: "today"`, lapses at
  the next learner day), set it always, or `profile.inputKind === "none"` (`quietReason` says which). While quiet:
  production (sing) cards are paused (not due, not rated, not in the load forecast or map shading), `srs.due`
  plans no mic sets, a lesson `sing` step is shown as its `fallback`, checkpoint sing items are skipped (contracts
  §8.5). The drill runner and the lesson player read `voice.get`; they never decide Quiet mode themselves.
- **Range** comes from the range calibration (`profile.calibration` kind `range`, unchanged); `voice.get.range`
  is `null` until then and drills use `toLearnerProfile`'s defaults.
- **The ladder** (contracts §8.2) is computed by the server from graded sung notes it already receives: `sung`
  responses of `steps.attempt` and `drills.trials`, and `sungResolution.notes` of FET trials — excluding
  `modality: "quiet"`, skipped parts and calibration runs. It tightens on 3 distinct qualifying days within 21
  (≥ 8 notes, day median |e| ≤ 35 / 25 / 20¢), never while a checkpoint is pending, never loosens by itself, and
  the change is announced once through `SessionSummary.toleranceChange`. `voice.ladder` sets Auto, a fixed value
  (`singTolMode: "fixed"`) or the one-tap loosen (only when `offerLoosen`). The ladder is the only writer of
  `profile.singToleranceCents` in auto mode.
- **Sung resolutions** never change a trial's identification credit (`credit`, `correct`); they feed
  `fam.deg.resolve` evidence and the ladder. A `revealed` trial has credit 0 and gives no **identification**
  evidence; its sung resolution still counts for the ladder and `fam.deg.resolve`, because the way home is sung
  after the answer is shown on every trial, revealed or not.
- **The ladder is held** only while a checkpoint the planner has offered is pending (decision 29, §0): not passed
  or soft-passed, and offered within the last 14 learner days **on which a session was started** (a break does not
  age the offer; a learner who keeps practising without the checkpoint lapses it). Notes sung on the day of the
  last change do not count toward the next rung (only later days), as in `@oak/pitch`.

### 5.4 Milestones

`progress.get` milestones now carry `title` and `description` from `content/milestones.ts`. The content schema
allows `when.anyOf` and `when.ladder` (content lead, Wave 3), and the server's `progressReport` evaluates both,
beside `sessions`, `capstones` and `canDos`. A ladder milestone counts a finished generated transcription at
`ladder_level >= level` as a pass (there is no separate graded-pass flag yet).

### 5.5 Dev seeds (`POST /api/dev/seed { point }`) — the server engineer builds these first

| Point | Means | Exists today |
|---|---|---|
| `after U02.CP` | every default-order session through U02.CP done (U03.L01 the day before it), the last yesterday; today C1.S1 | yes |
| `C1 released` | C1 released yesterday; today U03.L02 | yes |
| `after U03.L02` | through C1 and U03.L02 (degree labels, `n()`, `.scale()` unlocked); today U03.L03 | yes |
| `U03.CP due` | every U03 lesson and U04.L01 done, the last yesterday; today's New block is U03.CP | yes |
| `after U03.CP` | U03.CP passed yesterday; today the next U04 lesson | yes |
| `U04.CP due` | U04.L01–L04 done (U05.L01 is not written), the last yesterday; today's New block is U04.CP | yes |
| `after U04.CP` | U04.CP passed yesterday: the end of the authored course. Today is a review day (warm-up sets, "a little more", Studio) with the note "The next lessons are still being written. Today: a review, then Studio." | yes |

Every point gives a learner with a working mic and a calibrated range; `{ point, mic: false }` gives one without a
mic (Quiet mode, reason `no-mic`). All are proven on the real content by `server/src/wave3-course.test.ts`.

Specs that need a later state seed it instead of replaying earlier days (§8). `GET /api/dev/seed` lists the points.

## 6. Browser suites by convention (root `playwright.config.ts`)

The root config no longer imports each area by hand. It discovers every `app/src/**/e2e/playwright.config.ts`,
`e2e/*/playwright.config.ts` and `packages/*/e2e/playwright.config.ts` that exports `area: Area`
(`e2e/support/stack.ts`) and makes it a project named `area.name` (the gate journey first, then by name). A new
area config is picked up by `bun run e2e` and `--project <name>` without editing the root config. Rules:

- Your config file exports `area` and `default areaConfig(area)` (copy `app/src/drills/e2e/playwright.config.ts`).
- `area.name` is unique (a duplicate fails the run, naming both files).
- Two areas that start a web server of the same name (`oak-api:<port>`, `oak-vite:<port>`) with different
  commands fail the run with a port-clash error; take the ports of §2.
- Configs without an `area` export (strudel, audio) stay configured explicitly in the root config.

Run one suite: `bunx playwright test -c <your config>` or `bunx playwright test --project <name>`.

### 6.1 The Wave 3 journeys (`e2e/journey/w3-*.pw.ts`, project `journey`)

Each test starts from a dev seed on the journey's real stack (Vite 5212, API 8812, the scripted fake tutor,
Chrome's fake microphone) and stays under about 4 minutes. Shared helpers: `day.ts` (`startToday` with a
`warmupSets` budget — the sets past it are reported skipped through `__oakSession`; `coda` with `unlocks: "auto"`;
`lessonDay`), `warmup-walk.ts` (pads, typed answers by "Show me", fact decks, sung and heard ways home, passive
blocks), `lesson-walk.ts` (references through the editor and the dev hook; passive blocks played).

| Spec | Seed → what it proves |
|---|---|
| `w3-capstone.pw.ts` | `after U02.CP` → C1 from Today, checklist, check, release with a recording; the album holds two tracks |
| `w3-degrees.pw.ts` | `after U02.L08` → U03.L01; `after C1.S1` → U03.L02 and the Degrees lens in Studio; `after U03.L02` → the first `fam.deg.fet-major` set with its way home sung (posted as `sungResolution`); all three again in Quiet mode (heard, never sung; no `getUserMedia` at all) |
| `w3-notation.pw.ts` | `after U03.L05` → U03.L06 with S4 (D major's sharps) by keyboard, wrong order first, then the key panel in Studio; `after U03.L06` → U03.L07 with B♭ major's flats by keyboard, then the circle and the key panel agreeing in Studio |
| `w3-checkpoint.pw.ts` | `U03.CP due` → U03.CP end to end to a pass with every sung item left unanswered (all level-setting); `U03.CP failed` → the retake between 0.75 and 0.85, "Continue anyway", soft-passed |
| `w3-intervals.pw.ts` | `after U04.L03` → U04.L04 (passive blocks, the harmonic "Together" step, the Make), then the ear lab's passive block in Practice |
| `journey.pw.ts` | the Wave 2 gate journey, split at the final gate into five seeded tests (`fresh` → onboarding with a mic; `onboarded` → U00.L02 and U01.L01 with warm-ups; `after U01.L01` → U01.L02 with a tutor hint and "Explain my mistake", Studio's listening note, the Toolbox, the Oak grown since onboarding; `U01.CP due` → the checkpoint passed; `C0 ready` → C0 released and on the album) plus onboarding in Quiet mode. The journey project's per-test timeout is 6 minutes |
| `prod.pw.ts` | the production build: onboarding and an offline reload; then a mid-U03 learner moved over by backup (`backup.import` with its confirm nonce) starts the U03 session and reloads offline |

## 7. What is frozen

After Foundation, import from these and never edit them; put what you need in your own folder and report under
`apiNotes` anything that should be promoted:

- `app/src/lib/**` (except `mic*.ts` — voice — and `tutor-stream.ts` — polish), `app/src/main.tsx`,
  `app/src/router.tsx`, `app/src/routes/__root.tsx`, `app/vite.config.ts`, `app/index.html`, `app/public/**`.
- `app/src/ui/**` and `app/src/styles/**` for everyone except polish (the only engineer who edits shared UI:
  kit, shell, keys, review).
- `e2e/support/**`, root `playwright.config.ts`, root `package.json`, `bun.lock`, `bunfig.toml`, `biome.json`,
  root `tsconfig*.json`, `node_modules`.
- `docs/design/contracts.md`; `server/src/tutor/**` (the tutor core, finished).
- Content registries (syllabus, skills, toolbox, terms, glossary, candos, flavours, milestones), `content/specs/**`,
  `content/validate/**`, `scripts/content/**` (content lead); `packages/content-kit/**` is additive-only and the
  grader engineer's after Foundation.
- `packages/api/**` is additive-only and the server engineer's during Build; other areas request additions under
  `apiNotes`.

## 8. Workflow rules

- Never `bun install`/`bun add`, `git commit`/`stash`/`reset`/`checkout`. Stop every server you start; never kill a
  process you did not start (no `pkill` by name: eighteen stacks may be running).
- Vite on Node: `node node_modules/vite/bin/vite.js`, never `bunx --bun vite`.
- Logic tests `*.test.ts` next to the code: `bun test --isolate <your folder>` (always `--isolate`). Browser tests
  `*.pw.ts` in `<your folder>/e2e/` with your own config on your own ports (§2) and a `dataDirName` unique to you.
- **No stray specs or scratch files.** Temporary files go under your own directory in the scratchpad or
  `test-results/`, and are deleted before you finish. A stray `e2e/review/debug.pw.ts` broke the whole typecheck in
  Wave 2.
- **Fast tests.** No Playwright test takes longer than about 4 minutes; split long walks into specs that each start
  from a dev seed (§5.5, `POST /api/dev/seed`) and `PUT /api/dev/clock` instead of replaying days in real time.
- **Block Vite's HMR websocket** in your specs (other engineers' edits reload your page mid-test), as the capstone and
  review suites do: `await page.routeWebSocket(/.*/, () => {})` before the first `goto` (app/src/ui/review/e2e).
- Typecheck what you touch (`bunx tsc --noEmit -p <tsconfig>`; interfaces.md §1.4), then `bun run typecheck` and
  `bunx biome check --write <your paths>` (only your paths). Failures in another engineer's unfinished paths are
  reported, not fixed.
- Music claims and examples are verified with headless Strudel (`import { evalHeadless, midisOf } from
  "@oak/grader/testing"`) or `bun run theory …`. Interval and degree facts: `@oak/theory` (`intervalOf`,
  `labelPitch`), cross-checked with tonal in tests.
- The tutor only through the scripted fake backend (`OAK_DEV=1 OAK_TUTOR_FAKE=1`, wave2.md §5). Never the real CLI.

## 9. Definition of done for a surface

1. **Real data, every state.** Loading (kit `Skeleton`/`LoadingState`), empty (`EmptyState` with the next action),
   error (`ErrorState` with retry; 501 reads "Not built yet"), offline server, tutor off, no mic where relevant. No
   placeholder copy, no lorem, no dead buttons, no `WavePlaceholder` left on your surface.
2. **The next action is obvious** and progress is visible (ux §1); copy is calm, adult, precise, never cute or
   shaming (ux §7.11); no banned patterns (ux §1.6: no loss framing, countdowns, red streak states).
3. **Keyboard-only**: every action reachable and operable; visible focus; the keys of ux §7.10 that your surface
   lists work and appear in the shortcut sheet; `Esc` closes overlays; focus lands somewhere sensible after each
   transition.
4. **Both themes and both sizes**: Playwright screenshots at 1440×900 and 1280×800 in Paper and Bark
   (`SCREENSHOT_MATRIX`, `useUiPrefs`, `shoot`), saved under `<your folder>/e2e/screenshots/`, **read and fixed**
   (alignment, overflow, contrast, focus rings). At 1280×800 every primary action is visible without scrolling
   with the tutor drawer closed (ux §10.11). No horizontal overflow.
5. **Reduced motion**: with `prefers-reduced-motion` (or Settings → Appearance) nothing transforms for longer than
   120 ms; content appears at once.
6. **Tests**: logic in `*.test.ts` (pure functions, reducers, machines), behaviour in `*.pw.ts` on your own stack,
   including a keyboard-only path and the tutor through the fake backend where the surface talks to it. A spec
   that runs broken learner code allows Strudel's one `console.error`.
7. **Seams kept**: you only edited your paths; you used the contracts of §3–§5 as written; anything you needed from
   shared code is in your folder and listed in `apiNotes`.
8. **Green**: `bun test --isolate <your paths>`, your Playwright suite, `bun run typecheck`,
   `bunx biome check <your paths>`.
9. **Works in Quiet mode** (Wave 3): with `voice.get.quiet` true (or no mic) every sing part shows its fallback
   (listen, "hear it in your head, then press Space", or the identify equivalent), nothing waits for a voice,
   nothing is gated, nothing reads as a failure, and the mic chip says Quiet. A spec covers the Quiet path.
10. **Works with lenses on and off** (Wave 3): with each lens on and off (and locked, before its unlock) your
    surface lays out without overflow or overlap, labels appear where the lens says and nowhere else, and nothing
    depends on a label being present (the note is still identifiable by position, colour or the notes table).

## 10. Wave 3 content kinds: who renders, who grades

From `packages/content-kit/src/schema` as re-read at the end of Foundation (2026-11-11; `CONTENT_SCHEMA_VERSION` 2;
the structural rules are `checkWave3` in `define.ts`). "Renders" is the app engineer whose code shows it; "grades" is always the grader
(`gradeExercise`), with sung and tapped performances measured by `@oak/pitch` (voice) first.

| Kind / field | Type (content-kit) | Renders | Grades | Notes |
|---|---|---|---|---|
| `staff-input` answer, `key?: KeySpec` | `AnswerUi` `{ ui: "staff-input"; clef; bars; palette; key?; mode? }` | answers (`StaffInput` widget on notation §3.1); hosted by lesson (`notate` steps) and drills-ui | grader (`staff-write`) | a note on a line or space takes the signature's accidental; the value is the sounding spelling (`F#4:4` in G). `editNoteList` with `ctx.key = spec.key` |
| `staff-input` `mode: "key-signature"` | same, `mode?: "notes" \| "key-signature"` | answers (a key-signature placing widget; `hitTest` gives the line/space, `signatureOf` the target) | grader (`StaffExpect` `key-signature`) | value = the accidentals in the order placed, `"F# C#"`; the host sends `{ answer: { text: value.split(" ") } }` |
| `StaffExpect` `{ e: "key-signature"; key; order?: "sequence" \| "set" }` | `exercise.ts` | — | grader (adds the `order: "sequence"` check: F C G D A E B / B E A D G C F) | |
| `StaffExpect` `pitches` / `rhythm` / `events` | unchanged, now documented | answers | grader | lesson host converts the note list with `parseNoteList` (as in Wave 2) |
| `SingEx.labels?: "numbers" \| "syllables"` | `exercise.ts` | lesson (sing steps), drills-ui (sung parts) via voice's PitchLane | grader wraps `@oak/pitch` (voice) | default by unit (numbers before U03.L08); content CI refuses syllables before U03.L08 |
| `SingTarget` `{ from: "degrees"; degrees; rhythm?; octaves?: number[] }` | `exercise.ts` | lesson, drills-ui (targets drawn by voice's PitchLane) | grader (`singTargets` places them; pitch measures) | `octaves` relative to the tonic's (1-3-5-1′ = `[0,0,0,1]`); the pattern moves by octaves into the comfort range |
| `SingTolerance.lenient?: boolean` | `exercise.ts` | lesson (U00.L02 only) | grader + pitch: any sustained pitch ±100¢ after folding, coverage ≥ `minCoverage` for 600 ms; `cents` ignored | contracts §8.1 item 8 |
| `SingMode` `echo` / `sight` / `resolution` (documented) | `exercise.ts` | lesson, drills-ui (voice's pitch and PitchLane) | grader + pitch (`gradeSung` free/timed modes, contracts §8.1) | `sight`: target shown, only the cue plays, Oak plays it after |
| `CodeModifyEx.target.revealRollAfter?: number` | `exercise.ts` | lesson (shows the target roll after N failed checks) | — | presentation only |
| `DictationEx.byEar?: ByEarSpec` `{ ab; rates; accepts: "exact" \| "any-octave" \| "any-key" }` | `exercise.ts` | lesson (hidden source, A/B at the bar, rates; Workbench `A`/`B` from workbench) | grader (`matcher`, usually `melody`; CI checks `accepts` ↔ matcher `pitch`) | needs `answer: { ui: "code" }` |
| `ListenEx.passive?: PassiveListen` `{ family; level; items; reveal: "with" \| "after"; gapBeats }` | `exercise.ts` | lesson (plays a generated stream from `@oak/drills` at `level`; labels with/after) | — (no evidence, no SRS) | completes when the stream ends or on Continue |
| `StepUi.staffLabels?: "none" \| "note" \| "degree" \| "degree+solfege"` | `lesson.ts` | lesson → Workbench staff (`annotations`, §3.1) | — | content wins over the lenses inside the step (§4.3) |
| `FactCardDef.accept?: Answer[]` | `catalog.ts` | drills-ui (fact sets) | drills-engine / grader fact check: correct when `answer` or any `accept` matches | e.g. `F#` or `Gb` |
| `MilestoneDef.when.anyOf`, `MilestoneCondition.ladder` | `catalog.ts` | session (/progress, Coda banner) | server (`progressReport`, §5.4) | |

The content lead's `implemented.ts` (`IMPLEMENTED`) decides what a lesson may use this wave; a kind listed above
but missing there is rejected by content CI until the grader engineer adds it.
