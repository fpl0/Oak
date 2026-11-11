# Oak interfaces (Wave 1)

**Status: binding for Wave 1; updated at the Wave 1 final gate.** This is the cross-package public API that the platform is built against. It was written in the Foundation phase from `docs/design/contracts.md` (which outranks it), `docs/design/architecture.md` §2 (corrected where contracts differ) and the gotchas in `docs/spikes.md`. Every signature below is copied from the code in `packages/*/src`; when this file and the code disagree, the code is right and this file has a bug.

**How to work with it.** You own one folder. Code against the signatures here and import other packages by name (`@oak/theory`); never reach into another package's files. If another package is still a stub when you need it, write a local fake in your tests and say so. If you need an API to change, do not edit the other package: adapt on your side and report it.

## Wave 1 state (read this first)

Written at the Wave 1 final gate (2026-11-11). §1–§10 are the Foundation API; §11 and §12 record what the
code changed since. When they disagree, §12 beats §11 beats §4, and the code beats all of them.

**What Wave 2 can rely on** (implemented, tested by execution, green in `bun run check` and `bun run e2e`):

- **Every package of §4 is implemented**: `@oak/content-kit`, `api`, `theory`, `grader` (lint, evaluate,
  normalize, analyze, match, rubric, feedback, Bun subprocess/worker and browser hosts), `notation` (63 golden
  snapshots), `pitch`, `drills` (engine, ladder, grading, the generators not marked `pending:*`), `srs`
  (FSRS-7, governor, planner, mastery helpers), `strudel` (the one adapter: editors, transport, coordinator,
  playback, recorder, audibility, pack) and `audio` (mic graph, pitch worklet, calibration, tap,
  transcription, wave view).
- **The server** (`server/src` minus `tutor/`): every §6 endpoint of `@oak/api`'s contract, SQLite with
  migrations and append-only triggers, SRS wiring in one transaction per call, backups (export, import with a
  safety copy, reset), the confirm-nonce flow, dev routes behind `OAK_DEV=1` (encoded-path bypass closed),
  bounded request bodies, the static/production server with the Service Worker pack, the grader hosts
  (subprocess for code the learner did not type, with an RSS watchdog and a respawn breaker).
- **The app shell**: every §8 route renders in Paper and Bark; global keys and the shortcut sheet (only keys
  that work are listed); settings; the Workbench (`app/src/workbench`: editor + roll + staff + keyboard +
  track chips, A/B, Band layer, the 760 px tab rule, 8-bar staff pages, calm highlighting, keyboard-only
  use); `app/src/lib/mic.ts` as the only mic entry point; offline production reloads.
- **Content**: the registries (syllabus, skills, toolbox, families, terms, can-dos, flavours, bands,
  repertoire, capstones with rubrics), checked against the contracts tables by
  `content/validate/contracts-sync.test.ts` (course map, default order, unlock table, skill graph, family
  catalog, checkpoint map, capstone session goals), and one gate sample lesson that uses every exercise kind
  and every MDX component and passes every content-CI check with the real grader.
- **Music facts** are checked against headless Strudel 1.2.6 (`@oak/grader/testing`), including the
  adversarial theory and analyzer suites of the final review.

**Known gaps** (each is either a Wave 2 task or a recorded decision; none is hidden behind a passing test):

1. **SRS §7.4 gate**: "deferred queue p95 ≤ 4" and "oldest undelivered due card p95 ≤ 7 days" are not met
   in the 300-day simulation (`packages/srs/src/simulation.test.ts`, `test.failing` with measured values).
   The warm-up, active-family and review-day criteria are met.
2. **17 drill generators are `pending:*`** (groove-lock, polyrhythm, NCT, progression, chromatic,
   modulation, form sections and blues, the jazz families, sound params and roles, code mini and
   functions). `createRegistry` skips them and says why; the families stay in the catalog.
3. **App surfaces still placeholders** (`WavePlaceholder`): the lesson player, the drill runner, the Studio
   workbench on `/studio/$sketchId` (code is shown as text), capstone, transcribe and the tutor panel UI.
   Their keys (`Mod+Shift+Enter`, `Mod+I`, `Mod+S`, Drills and Lesson keys) are added to the shortcut
   sheet with their features. **Loop region (`L`, `[`/`]`) and metronome (`M`) do not exist yet.**
4. **Imported code**: the server flags every imported sketch and album version
   (`flags.reviewBeforeRun: true`, §12). Wave 2's Studio must run such a version only after `lintStrict`
   passes and otherwise open it as text with "Review before running" (contracts §11.3).
5. **The `bun-worker` learner host shares the server heap**: learner code can grow the server by
   gigabytes within the 1.5 s window. Only the subprocess host is memory-capped. Base-profile code can
   also poison builtin prototypes in a reused realm until it respawns, and `Error.stack` inside the realm
   shows absolute file paths.
6. **Browser coverage**: every browser test runs in headless Chromium only (contracts §11.12 supports
   Chromium-based browsers). Strudel's repl `console.error`s each learner evaluation error (harmless):
   the platform e2e's zero-console-error rule holds only because it runs valid code, so a Wave 2 spec that
   runs broken learner code must allow for that one message. The app smoke test "the command palette
   navigates and runs actions" failed once in three full runs (the second `Cmd+K` did not open the
   palette). It passes when repeated alone, and no cause has been found.
7. **Roll on long loops**: the roll draws a 64-bar loop at once (readable, dense); a roll that follows the
   playhead was not built. The staff pages 8 bars at a time.
8. **Content**: only the gate sample lesson exists; the course lessons, checkpoints' authored items and
   the listening pass on instruments (`docs/decisions.md`, "Needs you") are Wave 2.

## 1. Workspace

### 1.1 Layout and ownership

| Path | Package | Owner in Wave 1 | State at the end of Wave 1 |
|---|---|---|---|
| `packages/content-kit` | `@oak/content-kit` | Foundation | **implemented and tested** |
| `packages/api` | `@oak/api` | Foundation | **implemented and tested** |
| `packages/theory` | `@oak/theory` | theory builder | **implemented and tested** |
| `packages/grader` | `@oak/grader` | grader builders | **implemented and tested** |
| `packages/notation` | `@oak/notation` | notation builder | **implemented and tested** |
| `packages/pitch` | `@oak/pitch` | pitch builder | **implemented and tested** |
| `packages/drills` | `@oak/drills` | drills builder | **implemented and tested** (some generators `pending:*`, see §11) |
| `packages/srs` | `@oak/srs` | srs builder | **implemented and tested** (two §7.4 sub-criteria open, see §11) |
| `packages/strudel` | `@oak/strudel` | adapter builder | **implemented and tested** (browser e2e) |
| `packages/audio` | `@oak/audio` | audio builder | **implemented and tested** (browser e2e) |
| `server/src` (except `tutor/`) | `@oak/server` | server builder | **implemented and tested** |
| `server/src/tutor` | — | a separate session | exists; read-only for everyone else |
| `app/` | `@oak/app` | app builders | shell, routes, settings, workbench; lesson player, drill runner and Studio workbench are Wave 2 placeholders |
| `content/` | — | content builders | registries, capstones, bands, the gate sample lesson and content CI; course lessons are Wave 2 |
| `scripts/content`, `scripts/db` | — | whoever owns the feature | exist (see §1.4) |
| `types/` | — | Foundation | ambient declarations and the import-boundary test |

No `not implemented yet` stub is left in any package. Where a feature is deliberately unfinished the code says so with a typed marker (`pending:*` generators, `WavePlaceholder` in the app, `test.failing` with the measured values).

### 1.2 Toolchain facts

- Bun 1.4.4 runs the server, scripts and tests. Vite 8 runs on Node: `node node_modules/vite/bin/vite.js`, never `bunx --bun vite`.
- TypeScript 7.0.2 (`tsc`, typecheck only, no emit). Strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `allowImportingTsExtensions`. Import with the `.ts` extension. An optional property is absent, never `undefined` (zod: `.exactOptional()`).
- Workspace packages export TypeScript source (`"exports": { ".": "./src/index.ts" }`). There is no build step.
- Every dependency is a root dependency, and every `@oak/*` package is a root `workspace:*` dependency, so any file can import any installed package by walking up to the root `node_modules`. **Do not run `bun install`, `bun add` or `bun patch`**, and do not add `dependencies` to a package's `package.json`.
- Biome 2.6.6: double quotes, 2 spaces, line width 110. Run `bunx biome check --write <your paths>` before you finish. `docs/` and `spikes/` are not linted.
- zod 4.6.7. `z.strictObject` for authored content and request bodies, `z.object` for responses.

### 1.3 File-name conventions (they decide which typecheck project sees a file)

| Suffix | Meaning | Checked by |
|---|---|---|
| `*.ts` in an isomorphic package | no DOM global, no `Bun`, no `node:` import | the package's `tsconfig.json`, `tsconfig.app.json` and `tsconfig.server.json` |
| `*.bun.ts` | Bun-only host file (`Bun.spawn`, `bun:sqlite`, `node:fs`) | package `tsconfig.json`, `tsconfig.server.json` |
| `*.dom.ts`, `*.dom.tsx` | browser-only file inside an otherwise isomorphic package | `tsconfig.app.json` |
| `*.worklet.ts` | AudioWorkletGlobalScope code (no `self`, `performance` or `process`) | `tsconfig.worklet.json` |
| `*.test.ts` | Bun test, next to the code | package `tsconfig.json`, `tsconfig.server.json` |
| `*.pw.ts` | Playwright spec; `bun test` ignores it | not typechecked by the root projects |

Isomorphic packages: `api`, `theory`, `grader`, `notation`, `pitch`, `drills`, `srs`, `content-kit`. Browser-only packages: `strudel`, `audio`.

Typecheck one package: `bunx tsc --noEmit -p packages/<name>/tsconfig.json`. Typecheck everything: `bun run typecheck` (app, server and worklet projects). `server/src/tutor` has its own `tsconfig.json` and is excluded from `tsconfig.server.json`.

Ambient declarations in `types/`: `strudel.d.ts` (untyped Strudel modules plus the structural `Strudel.*` types: `Hap`, `Pattern`, `Fraction`, `TimeSpan`, `State`, `Location`), `abcjs-ext.d.ts` (`extraClass`, `rest`, `OakClickListener`, `TuneObject.warnings`), `signalsmith-stretch.d.ts`, `audio-worklet.d.ts` (worklet project only), `vite-worker-url.d.ts` (`?worker&url`, `?worker`, `?url`, `?raw` for packages; the app gets them from `vite/client`).

### 1.4 Ports, scripts, data

- **Dev ports:** Vite `127.0.0.1:5173` (strict port; proxies `/api` and `/sounds` to the API), API `127.0.0.1:8787`. The server binds `127.0.0.1` only. Constants: `PORTS`, `ALLOWED_HOSTS`, `ALLOWED_DEV_HOSTS` in `@oak/api`. Stop every server you start.
- **Data directory:** `OAK_DATA_DIR` (default `~/.oak`): `oak.db`, `audio/`, `album/`, `backups/`, `secrets/`. Tests must set it to a temp directory.
- **Root scripts** (`package.json`), as of the end of Wave 1 (all exist and are exercised by `check` or the e2e run).

| Script | Runs |
|---|---|
| `dev` | `content:build` once, then `concurrently`: server (`OAK_DEV=1 bun --watch server/src/main.ts`), Vite on 5173, `content:build --watch` |
| `dev:server`, `dev:web` | one of the two alone (`dev:server` sets `OAK_DEV=1`) |
| `build` | `scripts/content/build.ts`, `scripts/sounds/check.ts`, `vite build` → `dist/` |
| `start`, `oak` | `server/src/main.ts --serve-dist` (dist + `/sounds` + `/api` on 8787); `oak` builds first |
| `typecheck` | `tsconfig.{app,server,worklet,e2e}.json`, `server/src/tutor/tsconfig.json`, `app/tsconfig.json`, the strudel and audio e2e tsconfigs, then `typecheck:packages` |
| `typecheck:packages` | each `packages/*/tsconfig.json` in turn |
| `lint` | `biome ci .` (Markdown, JSON and the generated route tree are excluded) |
| `test` | `bun test --isolate` (ignores `spikes/**`, `e2e/**`, `**/*.pw.ts`) |
| `test:content` | `bun test --isolate content` |
| `e2e`, `test:browser` | `playwright test` with the root `playwright.config.ts`: every `*.pw.ts` suite (platform, app, workbench, strudel, audio) and their servers |
| `check` | `typecheck`, `lint`, `test` |
| `check:full` | `check`, then `e2e` (which itself runs `build` for the production project) |
| `content:build`, `content:new`, `content:check` | `scripts/content/{build,new,check}.ts` |
| `theory` | `packages/theory/src/cli.bun.ts` (`bun run theory <op> …`) |
| `sounds:mirror`, `sounds:check` | `scripts/sounds/*.ts` |
| `tutor:smoke` | `server/src/tutor/backends/cli/live-smoke.ts` (one live CLI turn; refuses to run without `--yes`) |
| `db:backup` | `scripts/db/backup.ts`: a manual `VACUUM INTO` copy in `<data>/backups` |

### 1.5 Test conventions

- Tests live next to the code as `*.test.ts` and run with `bun test <your folder>`. Browser and Playwright specs are `*.pw.ts`.
- Bun 1.4.4 does not honour the `[test] timeout` of `bunfig.toml`: a test that needs more than 5 s calls `setDefaultTimeout(…)` itself.
- **Headless Strudel in tests:** `import { evalHeadless, midisOf } from "@oak/grader/testing"`. It evaluates a code string (labels, `$:`, `_muted:`, a tempo line) and returns sorted onset events with exact fraction strings, MIDI, scale context, logs and code locations. Use it to verify any theory or music claim against Strudel 1.2.6. Do not import `@strudel/*` in tests outside `packages/grader` and `packages/strudel`.
- `types/import-boundaries.test.ts` runs with the root `bun test` and fails on a forbidden import (§2). Test-support files (`*.test-util.ts`, `*.test-data.ts`) count as tests.
- **Run the suite with `--isolate`** (`bun run test`). Strudel's repl and the grader realm install globals (`Pattern.prototype.p`, the eval scope); without a fresh global per file, the order of files changes results. Bun 1.4.4 reads `isolate` from the command line only, not from `bunfig.toml`.
- Fixtures that are not tests must not be named `*.test.ts` (see `packages/content-kit/src/fixtures.test-data.ts`).
- Music correctness is tested with golden facts, not snapshots of whatever the code returned: state the expected notes, then assert them.

## 2. Dependency direction

An arrow means "may import". Test files may import any package for verification; the Strudel rule has no exception.

```
content-kit                      (zod only)
  ├─ api                         (content-kit)
  ├─ theory                      (content-kit; tonal)
  │    ├─ grader                 (content-kit, theory; @strudel/core mini tonal transpiler, acorn)
  │    ├─ notation               (content-kit, theory)
  │    ├─ pitch                  (content-kit, theory; pitchy)
  │    │    ├─ drills            (content-kit, theory, pitch)
  │    │    └─ audio             (content-kit, theory, pitch; signalsmith-stretch)        browser only
  │    └─ strudel                (content-kit, theory, grader, drills; every @strudel/*, superdough,
  │                               CodeMirror, worker-timers)                               browser only
  └─ srs                         (content-kit; ts-fsrs)

server  → api, content-kit, theory, grader, notation, pitch, drills, srs      (never strudel or audio)
app     → every package
content → content-kit (lesson files); content/validate tests may use any non-browser package
```

Rules, enforced by `types/import-boundaries.test.ts`:

1. Only `@oak/strudel` and `@oak/grader` import Strudel packages; the grader only `@strudel/core`, `mini`, `tonal`, `transpiler`. Everything else goes through those two packages. `@oak/strudel` is the only module that knows `defaultOutput` (1.2.6) from `onSchedule` (Strudel main).
2. A package imports only the `@oak` packages listed for it.
3. Isomorphic packages import nothing from `bun`, `bun:*` or `node:*` outside `*.bun.ts` and tests.
4. `@oak/api` re-exports `@oak/content-kit` (contracts §5.1), so the app and the server may take every wire type from `@oak/api`.

Shared data types live in the package that produces them: `NEvent`, `GradeResult`, `Diagnostic`, `Exercise`, `Trial` in `@oak/content-kit`; `OakEvent`, `EvalResult`, the worker protocol and `GraderHost` in `@oak/grader`; `Score` (the NotationModel) in `@oak/notation`; `PitchFrame`, `SungNote`, `SungResult`, `TapResult` in `@oak/pitch`; `Card`, `ReviewOutcome`, `GovernorConfig` in `@oak/srs`; `DrillFamilyRuntime`, `TrialResponse`, `AudioPlan` in `@oak/drills`; `OakStrudel`, `EditorHandle`, `Transport`, `MasterBus`, `Recorder` in `@oak/strudel`; `MicGraph`, `Calibration`, `TapInput`, `TranscriptionPlayer` in `@oak/audio`.

## 3. Conventions every package shares

- **Time.** 1 cycle = 1 bar, always. Positions are exact rationals `Rat = readonly [n, d]` (reduced, `d > 0`). Use `R`, `rat`, `parseRat`, `fromFraction`, `barOf` from `@oak/content-kit`; do not write another rational type. Bar numbers are 1-based (`floor(onset) + 1`); with a declared pickup, cycle 0 is the pickup bar.
- **Tempo.** `cpm = bpm / unitsPerBar` through `METERS` in `@oak/theory` (`bpmToCpm`, `cpsToBpm`, `tempoLine`). The tempo line is always a division that shows the BPM: `setcpm(120/4)`.
- **Code ranges.** `CodeRange = { from, to }` are offsets into the clean code (markers stripped by `stripMarkers`). Strudel's own locations are `{ start, end }`; only `OakEvent.locations` and `LiveHap.locations` keep that shape. A hap's locations hold **every** contributing mini-notation atom, later-applied first: for `note("c4").s("piano")` the first entry is the word `piano`. Views must pick the right one, never `[0]`.
- **Events are sorted.** `queryArc` is not time-sorted across cycle boundaries. Every array of events that leaves `@oak/grader` or `@oak/strudel` is sorted by (onset, track order, midi).
- **Pitch.** Integer MIDI, 60 = C4. An octave-less Strudel note is octave 3. Spelling is never read from Strudel's `value.note` (`.scale()` spells accidentals backwards): re-spell from MIDI and context with `spellMidi`.
- **Chords.** Identity (root, quality, Roman numeral) always comes from the chord symbol (`NEvent.chordSymbol`), never from the notes of a `voicing()`. `@oak/theory` owns the one spelling table.
- **IDs.** Grammar and types are in `@oak/content-kit` (`ID_PATTERNS`, `isId`, `parse*`, `format*`). The ID types are template-literal types today; `bun run content:build` will generate the exact unions in `content/.generated/ids.ts`, and they are assignable to these.
- **Failure is data.** A problem in a learner's code (lint error, syntax error, silence, timeout) comes back as a result (`EvalFailure`, a `GradeResult` with `status: 'error'`, `EvalOutcome.ok === false`). Functions throw only for programming errors and infrastructure failures.
- **Mute and solo never rewrite code.** They are a live `filterHaps` inside the adapter's `beforeEval` hook (`EditorHandle.setMutes`). The grader ignores UI mute state and grades the code as written.
- **Grader hosts.** Browser: module Web Worker. Server: Bun Worker for the learner's own code, tests and content CI; **Bun subprocess for model-written code** (the only backend with memory isolation). All three sit behind `GraderHost`. Runaway patterns are stopped inside the realm by a fuel budget (Fraction-operation counter), then by the kill timer.

## 4. Packages

### 4.1 `@oak/content-kit` — implemented

**Purpose.** The canonical content schema of contracts §5 as TypeScript types plus matching zod schemas; the ID grammar of §1; `define*` helpers that validate at definition time; and the small pure functions every consumer of content shares (rationals, seeded params, starter markers, budgets, the rung-redacted grade view). Isomorphic.
**Owner paths.** `packages/content-kit/**` (Foundation). **Spike.** None. **May import.** zod only.

Files: `src/schema/{common,exercise,rubric,results,lesson,catalog}.ts` (types), `src/zod.ts` (schemas; also `@oak/content-kit/zod`, and `schemas` on the main entry), `src/ids.ts`, `src/define.ts`, `src/params.ts`, `src/rat.ts`, `src/budget.ts`, `src/implemented.ts`, `src/issue-view.ts`, `src/lint-types.ts`, `src/version.ts`.

**Schema types** (all exported from the package root; definitions are contracts §5 verbatim unless noted in §10):

- Common: `Rat`, `Md`, `CodeRange`, `Degree`, `ScaleMode`, `KeySpec`, `MeterId`, `TempoUnit`, `MeterSpec`, `SwingSpec`, `PickupSpec`, `DrumRole`, `Layer`, `ChordQuality`, `PitchMode`, `TrackRef`, `SkillRef`, `SkillWeight`, `Role`, `ParamRef`, `Num`, `CadenceType`, `Severity`; constants `DEGREES`, `SCALE_MODES`, `METER_IDS`, `DRUM_ROLES`, `LAYERS`, `CHORD_QUALITIES`, `TRACK_LABELS`, `LABEL_ROLES`.
- Exercises: `ExBase`, `HintLadder`, `Hint`, `HintRung`, `TutorPolicy`, `SrsLink`, `ParamGen`, `KeyPool`, `ParamValues`, `Stimulus`, `Cue`, `AnswerUi`, `Choice`, `Answer`, `PartialMap`, `TargetSelector`, `CodeSpec`, `Reference`, `Matcher`, `MiniOp`, `AstConstraint`, `TapTolerance`, `SingTolerance`, `SingTolCents`, `LearnerProfile`, the 19 kinds (`PredictEx` … `ListenEx`, `AllEx`), `Exercise`, `ExerciseKind`, `ExerciseOf<K>`, `InvestigateQ`, `BlankSpec`, `ParsonsBlock`, `StaffExpect`, `SingMode`, `SingTarget`, `DictationStage`, `TestResponse`, `TestCase`; constants `EXERCISE_KINDS`, `DEFAULT_PASS`, `CODE_KINDS`, `HINTLESS_KINDS`, `RUNG_RULES`; functions `replayMultiplier(extraReplays)`, `adjustScore(score, rung, extraReplays)`.
- Rubric: `RubricRule` (= `RubricRuleBase & RubricRuleBody`), `RubricRuleName`, `SectionRef`, `RuleOutcome`, `RUBRIC_RULE_NAMES` (39 rules).
- Results: `PitchSource`, `NEvent`, `Dimension`, `DimScore`, `Loc`, `Diagnostic`, `GradingMode`, `GradeStatus`, `EvalSummary`, `AssistState`, `GradeResult`, `AnalysisSummary`, and the view types `IssueView`, `FacetView`, `GradeView`.
- Lessons and the course: `StepKind`, `StepUi`, `BandRef`, `TermDef`, `StepExample`, `StepDef`, `LessonDef`, `STEP_EXERCISE_KINDS`, `LessonMeta`, `UnitDef`, `TrackDef`, `GateSpec`, `TrackGate`, `SyllabusDef`, `CheckpointMeta`, `CheckpointDef`, `CapstoneMeta`, `CapstoneSessionDef`, `CapstoneDef`, `LadderLevel`, `RealismLevel`, `LadderLevelDef`, `GymTemplate`.
- Registries: `ToolKind`, `UnlockSpec`, `ToolEntry`, `SkillKind`, `SkillRegion`, `SkillDef`, `FamilyKind`, `FamilyDomain`, `CompositeGroup`, `COMPOSITE_FAMILIES`, `LevelParams`, `FamilyCategory`, `FamilyDef`, `Trial`, `TrialResult`, `FactCardDef`, `FactDeck`, `TermEntry`, `CanDoArea`, `CanDoStatus`, `CanDoDef`, `MilestoneDef`, `SongDef`, `BandDef`, `FlavourKit`, `BandState`, `DEFAULT_STARTER_SOUNDS`.

**zod schemas** (`schemas.*`, each annotated with its type so `tsc` proves they match): `idSchema(kind)`, `SessionIdSchema`, `RatSchema`, `CodeRangeSchema`, `KeySpecSchema`, `SwingSpecSchema`, `PickupSpecSchema`, `SkillWeightSchema`, `TargetSelectorSchema`, `HintSchema`, `HintLadderSchema`, `SrsLinkSchema`, `ParamGenSchema`, `StimulusSchema`, `CueSchema`, `AnswerSchema`, `AstConstraintSchema`, `ReferenceSchema`, `MatcherSchema`, `RubricRuleSchema`, `AnswerUiSchema`, `TapToleranceSchema`, `SingToleranceSchema`, `LearnerProfileSchema`, `TestResponseSchema`, `TestCaseSchema`, `ExerciseSchema`, `CodeMakeExSchema`, `ComposeBriefExSchema`, `TranscribeStepExSchema`, `NEventSchema`, `LocSchema`, `DiagnosticSchema`, `AnalysisSummarySchema`, `GradeResultSchema`, `StepUiSchema`, `StepDefSchema`, `LessonDefSchema`, `UnitDefSchema`, `GateSpecSchema`, `CheckpointDefSchema`, `CapstoneDefSchema`, `ToolEntrySchema`, `SkillDefSchema`, `FamilyDefSchema`, `FactDeckSchema`, `TermEntrySchema`, `CanDoDefSchema`, `MilestoneDefSchema`, `SongDefSchema`, `BandDefSchema`, `FlavourKitSchema`.

**ID types:** `UnitId`, `TrackId`, `LessonId`, `CheckpointId`, `CapstoneId`, `CapstoneSessionId`, `GymSessionId`, `SessionId`, `StepId`, `StepLocalId`, `ExerciseOwnerId`, `ExerciseId`, `ExampleId`, `SkillId`, `SkillCategoryId`, `FamilyId`, `DeckId`, `FactId`, `ToolId`, `SoundId`, `ScaleId`, `ChordFamilyId`, `SchemaId`, `CanDoId`, `MilestoneId`, `TermId`, `SongId`, `FlavourId`, `BandId`, `FeedbackId`, `FeedbackArea`, `UnlockableId`, `SubjectKind`, `TutorThreadKind`, `IdKind`, `IdTypes`.

**Functions and constants** (other than the schema ones above):

Constants: `FEEDBACK_AREAS`, `FLAVOUR_IDS`, `SUBJECT_KINDS`, `TUTOR_THREAD_KINDS`, `ID_PATTERNS`, `ID_KINDS`, `STEP_LOCAL_PATTERN`, `SLUG_PATTERN`, `isLessonId`, `isCheckpointId`, `isCapstoneId`, `isSkillId`, `isFamilyId`, `isToolId`, `isSoundId`, `isFeedbackId`, `RETIRED_IDS_V1`, `MARK`, `ZERO`, `ONE`, `MAX_DENOMINATOR`, `R`, `BEGINNER_FACTOR`, `SESSION_BUDGET`, `CHECKPOINT_DAY`, `AUTHORING_CAPS`, `defineFlavour`, `defineTerm`, `defineCanDo`, `defineMilestone`, `IMPLEMENTED`, `OPEN_FEEDBACK_AREAS`, `ANSWER_PARAMS`, `LINT_PROFILES`, `STRICT_PROFILES`, `CONTRACTS_VERSION`, `CONTENT_SCHEMA_VERSION`

```ts
function isId<K extends IdKind>(kind: K, id: unknown): id is IdTypes[K];
function idKind(id: string): IdKind | null;
function assertId<K extends IdKind>(kind: K, id: string): IdTypes[K];
function isSessionId(id: unknown): id is SessionId;
function isUnlockableId(id: unknown): id is UnlockableId;
function isSkillRef(id: unknown): id is SkillId | SkillCategoryId;
function parseUnitId(id: string): ParsedUnit | null;
function formatUnitId(track: "core" | TrackId, n: number): UnitId;
function parseLessonId(id: string): ParsedLesson | null;
function formatLessonId(unit: UnitId, l: number): LessonId;
function parseCheckpointId(id: string): ParsedCheckpoint | null;
function checkpointRouteParam(id: CheckpointId): string;
function checkpointFromRouteParam(param: string): CheckpointId | null;
function parseCapstoneSessionId(id: string): ParsedCapstoneSession | null;
function formatCapstoneSessionId(capstone: CapstoneId, n: number): CapstoneSessionId;
function parseGymSessionId(id: string): { session: GymSessionId; n: number } | null;
function formatGymSessionId(n: number): GymSessionId;
function parseSessionId(id: string): ParsedSession | null;
function parseStepId(id: string): { lesson: LessonId; step: StepLocalId; n: number } | null;
function formatStepId(lesson: LessonId, step: StepLocalId | number): StepId;
function parseExerciseId(id: string): { owner: ExerciseOwnerId; slug: string } | null;
function formatExerciseId(owner: ExerciseOwnerId, slug: string): ExerciseId;
function parseExampleId(id: string): { lesson: LessonId; slug: string } | null;
function formatExampleId(lesson: LessonId, slug: string): ExampleId;
function parseSkillId(id: string): { skill: SkillId; letter: string; n: number; suffix: "a" | "b" | null } | null;
function parseSkillRef(ref: string): { skill: SkillId; category: string | null } | null;
function skillOf(ref: string): SkillId;
function parseFamilyId(id: string): { family: FamilyId; domain: string; name: string; composite: boolean } | null;
function parseToolId(id: string):;
function parseFeedbackId(id: string): { id: FeedbackId; area: FeedbackArea; code: string } | null;
function formatTutorThreadId(key: TutorThreadKey): string;
function parseTutorThreadId(id: string): TutorThreadKey | null;
function mulberry32(seed: number): () => number;
function hashSeed(...parts: (string | number)[]): number;
function paramSeed(exerciseGlobalId: string, seriesNo: number): number;
function keyPool(keys: KeyPool, mode: ScaleMode): string[];
function drawParam(gen: ParamGen, rng: () => number): number | string;
function drawParams(params: Record<string, ParamGen> | undefined, seed: number): ParamValues;
function drawExerciseParams(ex: Pick<ExBase<string>, "params">, exerciseGlobalId: string, seriesNo: number): ParamValues;
function substituteParams<T>(value: T, params: ParamValues): T;
function collectParamRefs(value: unknown, skipKeys: readonly string[] = ["params", "tests"]): Set<string>;
function stripMarkers(starter: string): CleanStarter;
function fillBlanks(starter: string, values: Record<string, string>): string;
function rat(n: number, d = 1): Rat;
function parseRat(text: string): Rat;
function fromFraction(f: { s?: bigint | number; n: bigint | number; d: bigint | number }): Rat;
function nearest(x: number, den: number): Rat;
function barOf(onset: Rat, pickup = false): number;
function lessonBudget(def: Pick<LessonDef, "steps" | "wrapAt">): LessonBudget;
function schemaIssues(schema: z.ZodType, value: unknown): ContentIssue[];
function flattenExercise(ex: Exercise): Exercise[];
function checkExercise(ex: Exercise, path: string, where: "lesson" | "capstone" | "checkpoint" = "lesson"): ContentIssue[];
function checkLessonStructure(def: LessonDef): ContentIssue[];
function countTerms(terms: LessonDef["terms"], glossary: readonly Pick<TermEntry, "id" | "pairedWith">[]): number;
function checkLessonAuthoring(def: LessonDef, glossary: readonly Pick<TermEntry, "id" | "pairedWith">[] = []): ContentIssue[];
function defineLesson(def: LessonDef): LessonDef;
function defineUnit(def: UnitDef): UnitDef;
function defineFamily<L extends LevelParams = LevelParams>(def: FamilyDef<L>): FamilyDef<L>;
function defineDeck(def: FactDeck): FactDeck;
function defineTool(def: ToolEntry): ToolEntry;
function defineToolbox(entries: readonly ToolEntry[]): readonly ToolEntry[];
function defineSkill(def: SkillDef): SkillDef;
function defineSkills(defs: readonly SkillDef[]): readonly SkillDef[];
function defineSong(def: SongDef): SongDef;
function defineCapstone(def: CapstoneDef): CapstoneDef;
function defineCheckpoint(def: CheckpointDef): CheckpointDef;
function defineBand(def: BandDef): BandDef;
function unimplementedIn(exercise: Exercise, impl: Implemented = IMPLEMENTED): UnimplementedUse[];
function unimplementedInLesson(def: LessonDef, impl: Implemented = IMPLEMENTED): UnimplementedUse[];
function countIssues(diagnostics: readonly Diagnostic[]):;
function toIssueView(result: GradeResult, rung: HintRung, opts: IssueViewOptions = {}): GradeView;
```

What `defineLesson` enforces beyond the schema (rule names appear in `ContentDefinitionError.issues[].rule`): unique step, exercise and example IDs; at most 12 steps; the last step is a non-optional `make`; `wrapAt` is a non-optional step before the Make; at most 3 `graded` steps, none of them a make, predict, listen, run, see, concept or reflect step; step kind and exercise kind agree (`STEP_EXERCISE_KINDS`); a `run` step has no questions; `hints: null` only for `predict`, `listen` and role `checkpoint`; a `sing` exercise declares `fallback`; a lesson Make has exactly one `required` rule; starter markers balance and `code-fill` blanks match the `⟦id⟧` markers; every `{{param:x}}` and `{ param: 'x' }` is declared and every declared param is used; test-out only on `modify` steps and only skipping earlier steps; in U00 to U04 at most two of roll, staff and keyboard. `checkLessonAuthoring` adds the budget caps of contracts §9.2 and §9.4 and the test requirements of AUTHORING §8; content CI calls it.

`toIssueView(result, rung, opts?)` is the one implementation of the redaction matrix of contracts §10.5 for a `GradeResult`: every rung gets status, score, facets, counts and each issue's place; rung ≥ 2 adds the kind and direction; rung 3 adds `fix`, `expected`, `got` and ghost notes for the first issue only; rung 4 or a passed step gets everything. Findings in `OPEN_FEEDBACK_AREAS` (the learner's own code and performance) are always shown in full. Pass `render` (`renderFeedback` from `@oak/grader`) to get catalog text.

### 4.2 `@oak/api` — implemented

**Purpose.** The REST contract as zod (one table, no codegen), the shared DTOs, a typed fetch client that sends `X-Oak: 1`, and the tutor's SSE protocol as the browser sees it. Re-exports `@oak/content-kit`. Isomorphic.
**Owner paths.** `packages/api/**` (Foundation). **Spike.** `spikes/s6-tutor/client.ts` informed the stream reader. **May import.** `@oak/content-kit`, zod.

Files: `src/contract.ts` (the endpoint table, §6), `src/dto.ts`, `src/tutor.ts`, `src/client.ts`.

**DTO schemas** (each `XSchema` has an inferred type `X`): `Profile`, `ProfilePatch`, `CalibrationRun`, `Settings` (`SETTING_KEYS`, `DEFAULT_SETTINGS`), `Health`, `KeyStatus`, `Unlock`, `CanDoEntry`, `TermIntroduced`, `StreakDay`, `StreakWeek`, `StreakSummary`, `SkillState`, `SkillMap`, `Evidence`, `SrsCard`, `FamilyState`, `WarmupItem`, `DueBatch`, `SrsReviewRequest`, `SrsReviewResult`, `DrillSession` (+ `DrillSessionCreateSchema`), `DrillTrialRecord`, `DrillFinish`, `LessonProgress`, `CheckpointStatus`, `CapstoneStatus`, `CourseProgress`, `AttemptResponse`, `StepAttemptCreate`, `StepAttempt`, `ExerciseResult`, `StepState`, `StepAttemptResult`, `LessonCompleteResult` (+ request), `CheckpointItemSpec`, `CheckpointAttemptStart`, `CheckpointSubmit`, `CheckpointOutcome`, `CapstoneState` (+ `CapstoneCheckSchema`, `CapstoneSessionCompleteSchema`), `GymSession` (+ create), `SessionPlan`, `Session` (+ start, heartbeat, end), `SessionSummary`, `SketchVersion`, `Sketch`, `SketchDetail`, `SketchCreate`, `SketchVersionCreate`, `SketchSaved`, `AlbumTrackVersion`, `AlbumTrack`, `AlbumTrackDetail`, `AudioFile`, `Transcription`, `TranscriptionDetail` (+ create, patch, version), `StepTelemetry`, `SessionTelemetry`, `TelemetryReport`, `QaReportCreate`, `QaReport`, `ProgressReport`, `ConfirmNonce` (+ `ConfirmRequestSchema`, `CONFIRM_ACTIONS`), `BackupManifest`, `Bootstrap`, `AnalyzeResponse`, `ApiErrorBody`. Primitives: `Instant`, `Day`, `WeekStart`, `TargetMinutesSchema`, `SingTolCentsSchema`. Helper: `toLearnerProfile(profile)` gives the grader's `LearnerProfile` with defaults where nothing is calibrated.

**Tutor wire types** (mirrors of `server/src/tutor`, kept in step by `src/tutor-align.test.ts`): `BACKEND_IDS`/`BackendId`, `THREAD_KINDS`/`ThreadKind` (the six request kinds: `chat hint explain listening review-capstone review-transcription`), `LANES`/`Lane` (contracts' `thread_kind`: `hint note chat review`), `LANE_OF`, `EFFORT_OF`, `TUTOR_ERROR_KINDS`, `TUTOR_ERROR_COPY`, `TUTOR_HEALTH`, `RungSchema`/`Rung`, `SubjectRefSchema`, `RawIssueSchema`, `GradeSnapshotSchema`, `TutorTurnRequestSchema`, `CapstoneReviewSchema`, `TranscriptionReviewSchema`, `REVIEW_LIMITS`, `UsageSummarySchema`, `CardDataSchema`, `TutorEventSchema`/`TutorEvent`/`TutorEventOf<T>`, `TUTOR_EVENT_TYPES` (`meta status text thinking tool_start tool_input tool_result card review usage done error`), `SseParser`, `asTutorEvent`, `TranscriptEntrySchema`, `CardRecordSchema`, `TutorNoteSchema`, `TutorTimelineSchema`, `TutorSettingsSchema`, `TutorUsageReportSchema`, `MusicToken`, `TutorTextPart`.

**Functions and constants:**

Constants: `TUTOR_ROUTE_OF`, `contract`, `ENDPOINT_NAMES`, `HEADERS`, `API_PREFIX`, `PORTS`, `ALLOWED_HOSTS`, `ALLOWED_DEV_HOSTS`, `Instant`, `Day`, `WeekStart`, `Ok`, `OUTPUT_KINDS`, `INPUT_KINDS`, `CALIBRATION_KINDS`, `SETTING_KEYS`, `DEFAULT_SETTINGS`, `UNLOCK_KINDS`, `CANDO_STATUSES`, `STREAK_DAY_SOURCES`, `STREAK_WEEK_STATUSES`, `MASTERY_LEVELS`, `DEBT_REASONS`, `EVIDENCE_SOURCES`, `CARD_KINDS`, `CARD_STATUSES`, `RATINGS`, `WARMUP_ITEM_KINDS`, `DRILL_PURPOSES`, `LESSON_STATUSES`, `SESSION_KINDS`, `SESSION_PHASES`, `SKETCH_ORIGINS`, `QA_KINDS`, `CONFIRM_ACTIONS`, `BACKUP_FORMAT_VERSION`, `TUTOR_MODEL`, `BACKEND_IDS`, `THREAD_KINDS`, `LANES`, `LANE_OF`, `EFFORT_OF`, `TUTOR_ERROR_KINDS`, `TUTOR_HEALTH`, `REVIEW_LAYERS`, `REVIEW_LIMITS`, `APPLY_STATES`, `STOP_REASONS`, `TUTOR_EVENT_TYPES`, `SSE_PING_INTERVAL_MS`, `TUTOR_ERROR_COPY`, `DEFAULT_TUTOR_SETTINGS`, `MUSIC_TOKEN_KINDS`

```ts
function createClient(options: OakClientOptions = {}): OakClient;
function pathParams(path: string): string[];
function buildPath(def: Pick<EndpointDef, "path">, params: Record<string, string> = {}, query: Record<string, string | undefined> = {}): string;
function toLearnerProfile(p: Profile): LearnerProfile;
function reviewRevisionsFor(capstoneId: string): 1 | 2;
function asTutorEvent(parsed: ParsedSse): TutorEvent | null;
function parseTutorText(markdown: string): TutorTextPart[];
```

```ts
interface OakClient {
  call<N extends JsonEndpointName>(name: N, input: EndpointInput<N>, opts?: CallOptions): Promise<EndpointOutput<N>>; // input optional when the endpoint takes none
  url<N extends JsonEndpointName>(name: N, input?: { params; query }): string;
  confirm(action: ConfirmAction, target: string, opts?: CallOptions): Promise<ConfirmNonce>;
  destructive<N extends ConfirmEndpointName>(name: N, target: string, input: EndpointInput<N>, opts?: CallOptions): Promise<EndpointOutput<N>>;
  stream(name: SseEndpointName, body: TutorTurnRequest, opts: { signal?: AbortSignal; onEvent(event: TutorEvent): void }): Promise<TutorTerminalEvent>;
}
// Server side: type a handler from the same table.
type HandlerInput<N extends EndpointName>;   // { params, query, body } after validation
type EndpointOutput<N extends EndpointName>; // what the handler must return
```

Client behaviour: `call` validates `params`, `query` and `body` before sending (a mismatch never leaves the browser) and the response after receiving (`OakApiError.code === "contract"` on a mismatch); a destructive endpoint without a nonce is refused locally; `stream` resolves with the terminal `done` or `error` event and never rejects (a stream that ends without one is a `network` error; an abort is `aborted`). `url(name, input)` builds media URLs for `<audio src>`.

### 4.3 `@oak/theory`

**Purpose.** Music theory behind normalization: notes with Strudel's semantics, degrees and chromatic steps, scales and key signatures, the single chord-spelling table and its per-dictionary matrix, Roman numerals and function, the schema library, meters and tempo, bar positions and beat labels, and the text normalizers for fact answers. tonal 6.5.1 is an implementation detail. Also the `theory` CLI (`src/cli.bun.ts`) that AUTHORING §9.2 uses.
**Owner paths.** `packages/theory/**`. **Spikes.** `spikes/s4-notation/quantize.ts` (`normalizeNoteName`, `keyInfo`, `spell`), `spikes/s4-notation/tonal-api.test.ts`, the chord matrix measured in `spikes/s1-grader/facts.test.ts` and `spikes/contracts-check/`. **May import.** `@oak/content-kit`, `tonal`.

Implemented already: `src/meters.ts` (golden-tested against contracts §6.9 and against Strudel). Golden tests the builder owes: every row of the chord table voiced in every dictionary and compared by pitch class (contracts §6.7 rule 6); each chromatic step pair of STYLE §6 in C, G, F, D, E♭ major and A minor (contracts §7.3).

Types: `Pc`, `ParsedNote`, `SpelledPitch`, `DegreeInfo`, `ScaleRef`, `ChordId`, `VoicingDict`, `ChordSpelling`, `RomanNumeral`, `HarmonicFunction`, `SchemaDef`, `KeySignature`, `BarPosition`, `NoteTextKind`

Constants: `CHORD_TABLE`, `SCHEMAS`, `METERS`, `DECLARABLE_GROUPINGS`, `VOICING_DICTS`

```ts
function parseNote(text: string): ParsedNote | null;
function noteToMidi(text: string): number | null;
function midiToPc(midi: number): Pc;
function freqToMidi(hz: number, a4 = 440): number;
function midiToFreq(midi: number, a4 = 440): number;
function spellMidi(midi: number, ctx: { key: KeySpec | null; chord?: ChordId; direction?: 1 | -1 }): SpelledPitch;
function pcOf(name: string): Pc;
function degreeOf(midi: number, key: KeySpec): DegreeInfo;
function degreeSemitones(degree: Degree): number;
function strudelStep(degree: Degree, key: KeySpec): number | string;
function stepToMidi(step: number | string, scale: ScaleRef): number;
function scaleNotes(key: KeySpec): string[];
function scalePcs(key: KeySpec): Pc[];
function parseScaleName(text: string): ScaleRef | null;
function formatScaleName(key: KeySpec, octave: number): string;
function keyFromScaleCtx(scaleCtx: string): KeySpec | null;
function scaleIdOf(mode: ScaleMode): ScaleId;
function keySignature(key: KeySpec): KeySignature;
function relativeKey(key: KeySpec): KeySpec;
function parallelKey(key: KeySpec): KeySpec;
function transposeKey(key: KeySpec, semitones: number): KeySpec;
function intervalBetween(low: string, high: string): string;
function invertInterval(interval: string): string;
function parseChordSymbol(symbol: string): ChordId | null;
function toCode(chord: ChordId): string;
function toLeadSheet(chord: ChordId): string;
function toJazzGlyph(chord: ChordId): string;
function toAbcChord(chord: ChordId): string;
function isCanonicalCode(symbol: string): boolean;
function chordFamilyOf(symbol: string): ChordFamilyId | null;
function chordInDict(symbol: string, dict: VoicingDict): "ok" | "missing" | "wrong" | "unknown-chord";
function chordPcs(chord: ChordId): Pc[];
function triadCore(chord: ChordId):;
function sameChord(a: ChordId, b: ChordId, opts?: { bass?: boolean; depth?: "triad" | "seventh" | "extended" }): boolean;
function identifyChord(midis: number[], opts?: { allowRootless?: boolean; bassPc?: Pc }): (ChordId & { fit: number })[];
function romanOf(chord: ChordId, key: KeySpec, next?: ChordId): RomanNumeral;
function parseRN(text: string, key: KeySpec): RomanNumeral | null;
function formatRN(rn: RomanNumeral): string;
function rnToChord(rn: RomanNumeral, key: KeySpec): ChordId;
function functionOf(rn: RomanNumeral, key: KeySpec): HarmonicFunction;
function schemaMatch(rns: RomanNumeral[], lib?: readonly SchemaDef[]): { schema: SchemaDef; rotation: number } | null;
function barPosition(onset: Rat, meter: MeterId | MeterSpec, pickup?: PickupSpec): BarPosition;
function normalizeText(kind: NoteTextKind, text: string): string | null;
function qualityOf(intervals: number[]): ChordQuality | null;
function meterWith(id: MeterId, grouping?: number[]): MeterSpec;
function bpmToCpm(bpm: number, meter: MeterId | MeterSpec): number;
function cpmToBpm(cpm: number, meter: MeterId | MeterSpec): number;
function bpmToCps(bpm: number, meter: MeterId | MeterSpec): number;
function cpsToBpm(cps: number, meter: MeterId | MeterSpec): number;
function tempoLine(bpm: number, meter: MeterId | MeterSpec): string;
function swingByArgs(meter: MeterId | MeterSpec, subdivision: 8 | 16): number | null;
function barSeconds(bpm: number, meter: MeterId | MeterSpec): number;
```

### 4.4 `@oak/grader`

**Purpose.** The shared headless grader: the Strudel realm (evalScope, `.p` collector, voicing shim, visual stubs, fuel, lockdown, healing), the lint (`lintOak`), normalization to `NEvent`, constraints, matchers, rubric rules and analysis, the feedback catalog, the worker protocol, and three hosts behind `GraderHost`.
**Owner paths.** `packages/grader/**`. **Spike.** `spikes/s1-grader` (`runtime.ts`, `lint.ts`, `protocol.ts`, `host.ts`, `worker.ts`, `proc.ts`, `watchdog.ts`, and its four test files, which carry the facts). **May import.** `@oak/content-kit`, `@oak/theory`, `@strudel/core|mini|tonal|transpiler`, `acorn`.

Entry points: `@oak/grader` (isomorphic), `@oak/grader/host/browser` (`src/host/browser.dom.ts`), `@oak/grader/host/bun` (`src/host/bun.bun.ts`), `@oak/grader/worker` (`src/worker.ts`, the entry of both Worker kinds), `@oak/grader/proc` (`src/proc.bun.ts`, the subprocess entry), `@oak/grader/testing` (implemented; keep it free of other Oak imports).

Gotchas that are part of the contract (all from spike S1): leave `SyntaxError` out of the mini scope before `evalScope`; capture `Function` before lockdown and evaluate with it (core's `evaluate` is dead after lockdown); the lockdown stub needs `prototype = Function.prototype`; neuter `ShadowRealm`; shadow globals by allowlist complement; ban `import()` and `import.meta` by AST scan; query per cycle with `pattern.query(new State(…))`, never `queryArc`; re-register `.cpm()` against the captured cps; emit a unique logger line per request (Strudel's logger drops a repeated line for 1 s); `setcpm("90")` in double quotes does not set the tempo; a label that starts with a capital `S` solos; with labels present an unlabelled trailing expression is dropped. Limits per mode are `MODE_LIMITS` (contracts §6.4): lesson 64 bars / 1500 ms / 20 000 haps, capstone 128 / 5000 / 60 000, tutor 16 / 1500 / 5000.

Types: `BrowserHostOptions`, `BunHostOptions`, `HeadlessEvent`, `HeadlessResult`, `OakEvent`, `LogLine`, `GraderErrorKind`, `GraderErrorInfo`, `ModeLimits`, `EvalOptions`, `EvalSuccess`, `EvalFailure`, `EvalResult`, `Normalized`, `NormalizeContext`, `ExerciseResponse`, `GradeContext`, `GradeRequest`, `CompareMode`, `CompareRequest`, `MatchResult`, `MatcherFn`, `GraderInit`, `GraderReady`, `GraderRequest`, `GraderResponse`, `HostBackend`, `GraderHostOptions`, `HostStats`, `GraderHost`, `TutorEvalView`, `FeedbackTemplate`, `SectionInfo`

Constants: `FEEDBACK_CATALOG`, `MODE_LIMITS`, `FUEL_PER_EVENT`

```ts
function createBrowserGraderHost(options: BrowserHostOptions): GraderHost;
function createBunGraderHost(options: BunHostOptions): GraderHost;
function initRealm(init: Omit<GraderInit, "kind">): Promise<GraderReady>;
function evaluateForGrading(code: string, opts: EvalOptions): Promise<EvalResult>;
function normalize(result: Extract<EvalResult, { ok: true }>, ctx: NormalizeContext): Normalized;
function gradeExercise(req: GradeRequest): Promise<GradeResult>;
function compareCode(req: CompareRequest): Promise<GradeResult>;
function barsToQuery(mode: GradeContext["mode"], referenceBars: number, answerPeriod: number): number;
function lintOak(code: string, ctx: LintContext, toolbox: readonly ToolEntry[]): LintResult;
function lintBase(code: string): LintDiagnostic[];
function lintStrict(code: string): LintDiagnostic[];
function toolsUsed(code: string, toolbox: readonly ToolEntry[]): { id: string; range: { from: number; to: number } }[];
function renderFeedback(d: Diagnostic, overrides?: Partial<Record<FeedbackId, Md>>): string;
function inferRoles(byTrack: Record<string, NEvent[]>): Partial<Record<Exclude<Layer, "all">, string>>;
function selectTrack(n: Normalized, ref: TrackRef): NEvent[];
function resolveTarget(n: Normalized, selector: TargetSelector, ctx: NormalizeContext): NEvent[];
function drumRole(s: string, bank?: string): DrumRole | null;
function periodOf(events: readonly NEvent[], maxBars: number): number;
function sectionsFromAst(code: string): | { sections: SectionInfo[]; totalBars: number } | { inconsistent: { track: string; detail: string } } | null;
function analyzePiece(n: Normalized, ctx: NormalizeContext & { code: string }): AnalysisSummary;
function linerNotes(analysis: AnalysisSummary, result: GradeResult, extra?: { band?: string; lockedTools?: string[]; attribution?: string }): string;
function straighten(events: readonly NEvent[], swing: { subdivision: 8 | 16; amount: number }, meter: MeterId): NEvent[];
function keyEstimate(events: readonly NEvent[]): { key: KeySpec; r: number }[];
function runMatcher(matcher: Matcher, reference: Normalized, answer: Normalized, ctx: NormalizeContext): MatchResult;
function runRubric(rules: readonly RubricRule[], n: Normalized, ctx: NormalizeContext & { code: string; params: ParamValues }): NonNullable<GradeResult["rubric"]>;
function toTutorEvalView(result: EvalResult, ctx: NormalizeContext): TutorEvalView;
function evalHeadless(code: string, bars = 1): Promise<HeadlessResult>;
async function midisOf(code: string, bars = 1): Promise<(number | null)[]>;
function defaultFuel(hapCap: number): number;
```

### 4.5 `@oak/notation`

**Purpose.** `NEvent`s in, the NotationModel (`Score`) out, ABC text for abcjs out, with a stable link from every engraved note back to its events and code ranges. Handles a declared swing (straightened, "Swing 8ths" printed) and a pickup (partial bar 0). abcjs itself is used only by the app's StaffView.
**Owner paths.** `packages/notation/**`. **Spike.** `spikes/s4-notation` (`quantize.ts`, `abc.ts`, `notation.test.ts`, `abcjs-limits.test.ts`). **May import.** `@oak/content-kit`, `@oak/theory`.

Gotchas: one `!class=…!` decoration per element, placed before chord brackets and after a tuplet marker; tuplet `p`, `q`, `r` are single digits; `selectTypes: ['note']` also reports rests; chord text `h7` must be rewritten; `tune.warnings` is `undefined` when clean. The class is `oak-e{n}` with `n` the index into `AbcResult.idMap`; content never refers to it.

Types: `StaffKind`, `NotationInput`, `TupletMark`, `NoteItem`, `Voice`, `Staff`, `NotationWarning`, `Score`, `NotationModel`, `AbcOptions`, `IdMapEntry`, `AbcResult`

```ts
function buildScore(input: NotationInput): Score;
function toAbc(score: Score, opts?: AbcOptions): AbcResult;
function notate(input: NotationInput, opts?: AbcOptions): { score: Score; abc: AbcResult };
function activeNotes(score: Score, cycle: number): number[];
function scoreToEvents(score: Score, track?: string): NEvent[];
function parseNoteList(dsl: string, opts?: { track?: string; start?: Rat }): NEvent[];
function drumStaffPosition(s: string): { pitch: string; head: "normal" | "x" } | null;
```

### 4.6 `@oak/pitch`

**Purpose.** Pitch detection (pitchy McLeod, 2048 window, 512 hop), tracking, segmentation, and the one rule for a sung note (`gradeSung`, `gradeSungLive`) and for taps (`gradeTaps`) from contracts §8, plus the tolerance ladder and the calibration maths. Pure: the worklet in `@oak/audio` feeds it frames.
**Owner paths.** `packages/pitch/**`. **Spike.** `spikes/s5-pitch/src/pitch.ts`, `pitch.test.ts`, `synth.ts`. **May import.** `@oak/content-kit`, `@oak/theory`, `pitchy`.

Gotchas: gate with `minVolumeAbsolute = 10 ** (dB / 20)`, never pitchy's `minVolumeDecibels`; reject `hz < 2 · sampleRate / windowSize` (noise passes the clarity gate otherwise); `PitchFrame.t` is the context time of the window's **last** sample; nothing at module scope may touch `self`, `performance` or `process` (the detector runs inside the worklet).

Types: `class PitchFrameAnalyzer`, `class PitchTracker`, `PitchFrame`, `DetectorOptions`, `Detector`, `TrackerOptions`, `TrackedFrame`, `SungNote`, `SungTarget`, `SungNoteResult`, `SungResult`, `TapResult`, `SingDayStat`

Constants: `WINDOW_SIZE`, `HOP_SIZE`

```ts
function createDetector(options?: DetectorOptions): Detector;
function hzToMidi(hz: number, a4 = 440): number;
function midiToHz(midi: number, a4 = 440): number;
function centsFrom(midi: number, targetMidi: number, fold = false): number;
function rmsDb(rms: number): number;
function pitchFramesToNotes(frames: readonly PitchFrame[], options?: TrackerOptions): SungNote[];
function gradeSung(frames: readonly PitchFrame[], targets: readonly SungTarget[], tol: SingTolerance, mode: SingMode, profile: LearnerProfile): SungResult;
function gradeSungLive(frames: readonly PitchFrame[], targets: readonly SungTarget[], tol: SingTolerance, mode: SingMode, profile: LearnerProfile, now: number): SungResult;
function firstSingPasses(frames: readonly PitchFrame[], tonicMidi: number, profile: LearnerProfile): boolean;
function fitToRange(midis: readonly number[], profile: Pick<LearnerProfile, "comfLow" | "comfHigh" | "rangeLow" | "rangeHigh">): number;
function nextSingTolerance(current: SingTolCents, days: readonly SingDayStat[], opts: { today: string; checkpointPending: boolean; mode: "auto" | "fixed" }): SingTolCents;
function detectBleed(frames: readonly PitchFrame[], playing: readonly SungTarget[]): boolean;
function calibrateRange(frames: readonly PitchFrame[]):;
function tapWindowMs(minIoiMs: number, level: number, levels: number, profile: Pick<LearnerProfile, "outputKind" | "tapJitterMs">): number;
function gradeTaps(taps: readonly number[], targets: readonly number[], tol: TapTolerance, profile: LearnerProfile, opts?: { level?: number; levels?: number }): TapResult;
function calibrateTapLatency(taps: readonly number[], clicks: readonly number[]): { latencyMs: number; jitterMs: number };
```

### 4.7 `@oak/drills`

**Purpose.** Drill generators and their graders, set planning (level mix, category sampling, blocked introductions, composites), the level staircase, AudioPlans for playback, and the generated ladder material L1 to L4. Trials are generated as events; their shown `code` must evaluate to the same events (property test with `@oak/grader/testing`).
**Owner paths.** `packages/drills/**`. **Spike.** None (exercises §4 is the specification; contracts §7.3 the catalog). **May import.** `@oak/content-kit`, `@oak/theory`, `@oak/pitch`.

Types: `DrillRegistry`, `Rng`, `TrialResponse`, `DrillFamilyRuntime`, `FactDeckRuntime`, `TrialSpec`, `SetPlan`, `SetPlanInput`, `SetSummary`, `SuperdoughValue`, `AudioPlan`, `StaircaseState`

Constants: `GENERATORS`

```ts
function createRng(seed: number): Rng;
function trialSeed(family: FamilyId, setId: string, index: number): number;
function bindFamily<L extends LevelParams = LevelParams>(def: FamilyDef<L>): DrillFamilyRuntime<L>;
function bindDeck(def: FactDeck): FactDeckRuntime;
function createRegistry(families: readonly FamilyDef[], decks: readonly FactDeck[]): DrillRegistry;
function planSet(family: DrillFamilyRuntime, input: SetPlanInput): SetPlan;
function planCompositeSet(members: readonly { family: DrillFamilyRuntime; input: SetPlanInput; recentAccuracy: number }[], setId: string, quiet: boolean): SetPlan[];
function generateTrial<E = Answer>(family: DrillFamilyRuntime<LevelParams, E>, spec: TrialSpec, profile: LearnerProfile, openCategories: readonly string[], previous?: Trial<E>): Trial<E>;
function gradeTrial<E = Answer>(family: DrillFamilyRuntime<LevelParams, E>, trial: Trial<E>, response: TrialResponse, profile: LearnerProfile): TrialResult;
function summarizeSet(plan: SetPlan, trials: readonly Trial<unknown>[], results: readonly TrialResult[]): SetSummary;
function levelAfterSet(state: { level: number; promoDay: string | null; maxOpenLevel: number }, summary: SetSummary, day: string): { level: number; promoDay: string | null; change: "promoted" | "demoted" | null };
function staircaseStep(state: StaircaseState, correct: boolean): StaircaseState;
function eventsToAudioPlan(events: readonly NEvent[], cps: number, opts?: { gain?: number; rate?: number; transpose?: number; fromBar?: number; bars?: number }): AudioPlan;
function trialAudio(trial: Trial<unknown>, key?: { tonic: string; mode: string }): { cue: AudioPlan | null; stimulus: AudioPlan; resolution: AudioPlan | null };
function clickPlan(bars: number, cps: number, unitsPerBar: number): AudioPlan;
function generateLadderPiece(level: 1 | 2 | 3 | 4, realism: 0 | 1 | 2 | 3 | 4, seed: number, profile: LearnerProfile): { code: string; events: NEvent[]; cps: number; bars: number; preload: string[] };
```

### 4.8 `@oak/srs`

**Purpose.** ts-fsrs 6 (FSRS-7) behind Oak's rules: card creation and review with Oak's own interval floor, cap, due-day pick and day snapping; the grade map; the review-load governor and warm-up planner; day arithmetic with the 04:00 rollover; shading maths. `src/constants.ts` holds every number of contracts §7 for this package and for `server/services/{mastery,gates,streak,session-plan}`.
**Owner paths.** `packages/srs/**`. **Spike.** `spikes/s7-srs` (`srs.ts`, `governor.ts`, `sim.ts`, both test files). **May import.** `@oak/content-kit`, `ts-fsrs`.

Gotchas: `DefaultScheduler` is async; run the library with `enableFuzz: false` and a huge `maximumInterval` and clamp in Oak; `stability` under FSRS-7 is not the 90% interval (use `intervalAt(card, 0.9)`); guard `forgettingCurve` on a never-reviewed card; pass a stable card ID; `Rating` is a const object, not an enum. **Open conflict to settle with the CI gate:** the constants carry the contract's numbers; `DECISION_2` carries the three overrides of `docs/decisions.md` row 2 that spike S7 needed to pass the 300-day simulation (`recommendedGovernor`).

Types: `CardKind`, `KindSchedule`, `Rating`, `CardStatus`, `Card`, `ReviewOutcome`, `Revlog`, `ReviewOptions`, `ReviewResult`, `Srs`, `GovernorConfig`, `GovernorDefaults`, `ItemClass`, `ReviewItem`, `PlannedItem`, `WarmupPlan`, `PlanContext`, `ReturnMode`, `GraduationInput`

Constants: `SCHEDULES`, `DECISION_2`, `FSRS_VERSION`, `FSRS_MODEL_NAME`, `FUZZ`, `QUICK_RECALL`, `GRADE_MAP`, `SET_TRIALS`, `WARMUP_BUDGET_SEC`, `WARMUP_SHORT_SEC`, `REVIEW_DAY_MAX_SEC`, `GOVERNOR`, `PRIORITY_WEIGHTS`, `SIM_GATE`, `MASTERY`, `EVIDENCE_WEIGHTS`, `CHECKPOINT`, `STREAK`, `RETURN`, `SHADING`, `GYM`, `SING_LADDER`, `RATING_NAME`

```ts
function createSrs(overrides?: { factRetention?: number; fuzz?: number; timeZone?: string; rolloverHour?: number; }): Promise<Srs>;
function gradeFor(outcome: ReviewOutcome): Rating;
function factGrade(correct: boolean, rtMs: number, fastRtMs: number, hinted: boolean): Rating;
function stepGrade(adjustedScore: number, outcome: Pick<ReviewOutcome, "hintRung" | "revealed" | "extraReplays">): Rating;
function learnerDay(now: Date, timeZone: string, rolloverHour?: number): string;
function daysBetween(a: string, b: string): number;
function dayIndex(day: string): number;
function weekStart(day: string): string;
function governorFor(targetMinutes: 15 | 20 | 25, opts?: Partial<GovernorConfig>): GovernorConfig;
function recommendedGovernor(targetMinutes: 15 | 20 | 25, opts?: Partial<GovernorConfig>): GovernorConfig;
function forecastLoad(items: readonly ReviewItem[], today: number, days: number): number[];
function planWarmup(due: readonly ReviewItem[], ctx: PlanContext, cfg: GovernorConfig): WarmupPlan;
function admitNew(items: readonly ReviewItem[], waiting: { families: number; facts: number }, activePerceptual: number, today: number, cfg: GovernorConfig): { families: number; facts: number };
function shouldGraduate(input: GraduationInput, cfg: GovernorConfig): boolean;
function earlyGraduate(active: readonly (GraduationInput & { cardId: string })[], cfg: GovernorConfig): string | null;
function smoothBacklog(overdue: readonly ReviewItem[], today: number, cfg: GovernorConfig): Map<string, number>;
function intervalCap(card: Pick<Card, "kind" | "status">, perceptual: boolean, cfg: GovernorConfig): number | undefined;
function returnMode(gapDays: number): ReturnMode;
function freshness(retrievability: number, desiredRetention: number): number;
function nodeOpacity(cards: readonly { retrievability: number; desiredRetention: number; weight: number }[]): number | null;
```

### 4.9 `@oak/strudel` (browser only)

**Purpose.** The OakStrudel adapter: the only place a `StrudelMirror` is built; one eval mutex across editors; live mute and solo; the Band layer; one transport clock; prebake from the self-hosted sound pack; preload; direct `superdough` playback for drills; the master bus with limiter, analysers and record tap; the recorder; a hidden pattern player for Transcribe; CM6 extension hooks (completion from the unlocked set, lint, read-only regions, cursor reporting).
**Owner paths.** `packages/strudel/**`. **Spikes.** `spikes/s2-editors/src/oakStrudel.ts` (editors, mutex, dispose, mute) and `spikes/s3-sounds/src/oak-audio.ts` (prebake, aliases, preload, master bus, record), `spikes/s3-sounds/src/audibility.ts` (the harness for `ToolEntry.audible`). **May import.** `@oak/content-kit`, `@oak/theory`, `@oak/grader` (types and `lintOak`), `@oak/drills` (`AudioPlan`), every `@strudel/*`, `superdough`, CodeMirror, `worker-timers`.

Gotchas that are part of the contract: editor IDs end with `_`; call `codemirrorSettings.set()` with the FULL object before the first mirror and never enable Strudel's own autocompletion; replace `mirror.evaluate` with the locked version so Ctrl-Enter and the repl-evaluate event are serialized too; do the async waits inside the mutex but before the original evaluate, checking `disposed` in between; race `ctx.resume()` against a timeout and do not memoize a failure; capture and remove the window `message` listener kabelsalat adds per mirror; `evalScope` overwrites `window.SyntaxError` (filter it out); `onToggle(false)` fires for editors that were not playing; mount editors from `useEffect` or a `useCallback` ref, never an inline ref callback; fetch sample-map JSON yourself and delete `_base`; register curated aliases with `registerSound` plus variant pinning, lower-case; call `aliasBank` after samples are registered; re-attach the master bus when superdough rebuilds `destinationGain`; decode `%20` in sound paths on the server side; one offline render per realm.

Types: `Readable`, `AudioState`, `LessonCtx`, `LiveHap`, `PaintFrame`, `EvalOutcome`, `MuteMap`, `BandSetup`, `EditorHooks`, `EditorOptions`, `EditorHandle`, `TransportState`, `Transport`, `PreloadSpec`, `PreloadReport`, `MasterBus`, `RecordOptions`, `Recording`, `Recorder`, `PlaybackHandle`, `PatternPlayer`, `StrudelLog`, `OakStrudelOptions`, `OakStrudel`

Constants: `LIMITER`

```ts
function createOakStrudel(options: OakStrudelOptions): OakStrudel;
function getOakStrudel(): OakStrudel;
function resetOakStrudelForTests(): void;
function editorId(slug: string, n = 0): string;
function limiterMakeupDb(threshold: number = LIMITER.threshold, ratio: number = LIMITER.ratio): number;
```

The full interfaces are in `packages/strudel/src/types.ts`: `OakStrudel`, `OakStrudelOptions`, `EditorOptions`, `EditorHandle`, `EditorHooks`, `LessonCtx`, `EvalOutcome`, `PaintFrame`, `LiveHap`, `MuteMap`, `BandSetup`, `Transport`, `TransportState`, `PreloadSpec`, `PreloadReport`, `MasterBus`, `Recorder`, `RecordOptions`, `Recording`, `PlaybackHandle`, `PatternPlayer`, `StrudelLog`, `Readable<T>`, `AudioState`.

```ts
interface OakStrudel {
  readonly ctx: AudioContext;
  readonly ready: Promise<void>;
  unlock(): Promise<boolean>;
  readonly audio: Readable<AudioState>;
  createEditor(root: HTMLElement, opts: EditorOptions): EditorHandle;
  readonly editors: ReadonlyMap<string, EditorHandle>;
  readonly transport: Transport;
  preload(spec: PreloadSpec, onProgress?: (done: number, total: number) => void): Promise<PreloadReport>;
  soundsIn(code: string): PreloadSpec;
  playEvents(plan: AudioPlan, opts?: { at?: number; gain?: number }): PlaybackHandle;
  playNote(value: { s: string; note: number | string | (number | string)[]; dur?: number; gain?: number }): void;
  stopAll(): void;
  readonly master: MasterBus;
  readonly recorder: Recorder;
  createPatternPlayer(): PatternPlayer;
  lint(code: string, ctx: LintContext): LintResult;
  onLog(cb: (log: StrudelLog) => void): () => void;
  sounds(): string[];
  dispose(): void;
}
interface EditorHandle {
  readonly id: string; readonly view: EditorView; readonly playing: boolean; readonly disposed: boolean;
  getCode(): string;
  setCode(code: string, opts?: { undoable?: boolean }): void;
  evaluate(opts?: { autostart?: boolean }): Promise<EvalOutcome>;
  play(): Promise<EvalOutcome>; stop(): void; toggle(): Promise<void>;
  setDiagnostics(diagnostics: readonly LintDiagnostic[]): void;
  focusRanges(ranges: readonly CodeRange[]): void;
  setMarks(marks: readonly { range: CodeRange; kind: "hint" | "error" | "target" | "ok" }[]): void;
  setEditable(readOnly: EditorOptions["readOnly"]): void;
  setUnlocked(unlocked: ReadonlySet<UnlockableId>): void;
  setMutes(mutes: MuteMap): void; getMutes(): MuteMap;
  setBand(band: BandSetup | null): void;
  dispose(): void;
}
interface Transport extends Readable<TransportState> {
  readonly activeEditorId: string | null;
  cycle(): number; audibleCycle(): number; timeOfCycle(cycle: number): number;
  cps(): number; setCps(cps: number): void; setVisualOffset(ms: number): void;
}
```

### 4.10 `@oak/audio` (browser only)

**Purpose.** The microphone graph and its pitch worklet, device detection (including AirPods mode), the measurements of the calibration wizard, tap input mapped to AudioContext time, and the transcription player for the learner's own audio (signalsmith-stretch into `MasterBus.input`). It never creates an AudioContext: it is given `OakStrudel.ctx`.
**Owner paths.** `packages/audio/**`. **Spike.** `spikes/s5-pitch` (`src/pitch.worklet.ts`, `src/main.ts`, `src/strudel-coexist.ts`, the fake-mic e2e set-up). **May import.** `@oak/content-kit`, `@oak/theory`, `@oak/pitch`, `signalsmith-stretch`.

Gotchas: load the worklet with `?worker&url` (also exported as `@oak/audio/pitch-worklet`); create the node once, at unlock or calibration, with `numberOfOutputs: 0`, `channelCount: 1`, `channelCountMode: "explicit"`; a sing step opens and closes only the MediaStream and its source; with no input the processor skips analysis and resets its ring; leave the context sample rate alone; the mic is never connected to the destination.

Types: `class MicError`, `OutputKind`, `InputKind`, `DeviceReport`, `MicState`, `MicSession`, `MicGraph`, `CalibrationDeps`, `TapLatencyResult`, `RangeResult`, `Calibration`, `TapEvent`, `TapInput`, `TranscriptionPlayerState`, `TranscriptionPlayer`

Constants: `PITCH_PROCESSOR`

```ts
function createMicGraph(ctx: AudioContext, opts?: { workletUrl?: string; lowVoice?: boolean }): MicGraph;
function detectDevices(ctx: AudioContext): Promise<DeviceReport>;
function classifyDeviceLabel(label: string, kind: "audioinput" | "audiooutput"): "builtin" | "external" | "bluetooth" | "wired" | "speakers" | "unknown";
function createCalibration(deps: CalibrationDeps): Calibration;
function createTapInput(ctx: AudioContext, opts?: { target?: EventTarget; latencyMs?: number }): TapInput;
function eventTimeToContextTime(ctx: AudioContext, eventTimeStamp: number): number;
function createTranscriptionPlayer(ctx: AudioContext, output: AudioNode): Promise<TranscriptionPlayer>;
function computePeaks(buffer: AudioBuffer, pointsPerSecond = 100): Float32Array;
```

The full interfaces are in `packages/audio/src/types.ts`: `MicGraph`, `MicSession`, `MicState`, `MicError`, `DeviceReport`, `Calibration`, `CalibrationDeps`, `TapLatencyResult`, `RangeResult`, `TapInput`, `TapEvent`, `TranscriptionPlayer`, `TranscriptionPlayerState`.

## 5. Server (`server/src`, Bun + Hono)

**Purpose.** The single writer of learner state. It serves the REST contract of §6 on `127.0.0.1:8787`, owns SQLite (`bun:sqlite`), commits every attempt in one transaction (attempt, evidence, revlog, family state, skill cache), plans sessions, runs the Bun grader hosts, stores audio, and hosts the tutor service by implementing its ports.
**Owner paths.** `server/src/**` except `server/src/tutor/**`. **Spikes.** `spikes/s6-tutor/server.ts` (security middleware, SSE with `server.timeout(req, 0)` and a 5 s ping), `spikes/s1-grader/host.ts`, `spikes/s8-claude-cli` (the CLI backend lives in the tutor folder). **May import.** `@oak/api`, `content-kit`, `theory`, `grader`, `notation`, `pitch`, `drills`, `srs`; `hono`, `@hono/zod-validator`; never `@oak/strudel` or `@oak/audio`.

Suggested modules (architecture §1.1, renamed where contracts renamed things):

| Module | Responsibility |
|---|---|
| `main.ts`, `app.ts`, `config.ts` | `Bun.serve({ hostname: "127.0.0.1", port: 8787 })`; `buildApp(deps)`; `OAK_DATA_DIR`, `OAK_DEV` |
| `security.ts` | contracts §11.1: Host allowlist on every `/api/*` request; Origin allowlist on non-GET; `X-Oak: 1` except the three media GETs, which need `Sec-Fetch-Site: same-origin`; no CORS headers; `OPTIONS` → 403; CSP of §11.2 on HTML; `/api/dev/*` only with `OAK_DEV=1` |
| `confirm.ts` | nonces for the seven destructive endpoints: single-use, 60 s, bound to `(action, target)`, in memory |
| `db/` | `index.ts`, `migrate.ts`, `migrations/0001_init.sql` (§7), `repos/*.ts` |
| `routes/*.ts` | one file per resource; mount from `contract` with `zValidator` |
| `services/srs.ts` | cards, reviews, `family_state`, graduation and recall, through `@oak/srs` |
| `services/mastery.ts` | evidence, `skill_state`, levels, debt, shading (contracts §7.5, §7.7, §7.10) |
| `services/gates.ts` | legal orders, lesson and capstone gates, checkpoints (contracts §7.6), the voicing gate (§3.1 rule 6) |
| `services/unlocks.ts` | grants from `content/.generated/toolbox.json`: on complete, on start, fallback and backfill; never revoked |
| `services/session-plan.ts` | Today: warm-up plan, gym slot rule (§2.5), return policy (§7.9), 15-minute split (§9.4) |
| `services/streak.ts` | weekly streak, banked rests, repair, pause (contracts §7.8) |
| `services/cando.ts`, `album.ts`, `audio-store.ts`, `backup.ts`, `telemetry.ts`, `qa.ts` | as named |
| `grader/host.ts` | one `bun-worker` host for learner code and `POST /api/grade`; one `bun-subprocess` host for tutor code |
| `secrets.ts` | the API key: `.env.local` or `~/.oak/secrets/anthropic.key` (0600); `delete process.env.ANTHROPIC_API_KEY` before any worker or child starts |
| `tutor-adapters/*.ts` | the adapters below |
| `static.ts` | `/sounds/manifest.json` (no-cache), `/sounds/<packVersion>/*` (immutable, Range, `decodeURIComponent` on the path), `dist/*` with SPA fallback |

### 5.1 Ports the tutor expects the server to implement

`server/src/tutor/ports.ts` defines `TutorPorts`; the tutor imports nothing else. The server builds one `TutorPorts` at start-up and passes it to `prepareTurn`, `runTurn` and `runReview` (`server/src/tutor/{prepare,run}.ts`). Routes: validate the body with `TutorTurnRequestSchema`, call `server.timeout(req, 0)`, stream `encodeSse(event)` frames, write `SSE_PING` every 5 s.

| Port | Methods | Backed by |
|---|---|---|
| `grader: GraderPort` | `evaluate(req: EvalRequest, signal): Promise<EvalResult>` · `compare(req: CompareRequest, signal): Promise<CompareResult>` | the `bun-subprocess` `GraderHost` in `tutor` mode (16 bars, 1500 ms, 5000 haps). `origin: "tutor"` code is strict-linted by the host too. Map with `toTutorEvalView` and a `GradeResult` → `GradeSnapshot` adapter. A lint or evaluation failure is `ok: false`, not a throw. `lockedTools` comes from `LintResult.lockedTools` with the learner's unlocked set |
| `lessons: LessonContextPort` | `lesson(lessonId)` · `step(lessonId, stepId)` (must return `null` for checkpoint items and the current drill trial) · `resolveExercise(ref)` · `subject(ref): SubjectFacts` · `review(ref): ReviewSource \| null` · `prefixSources(): { syllabus, catalog }` | the content index and `content/.generated/tutor/` (syllabus and Strudel catalog text); `StepSource` is unredacted (solutions, wrong variants from `tests` with `expect: 'fail'`, the four hint texts) |
| `progress: ProgressPort` | `stepState(lessonId, stepId): StepState` · `advanceHintRung(lessonId, stepId, max): Rung` · `snapshot(): ProgressSnapshot` · `termsIntroduced(): IntroducedTerms` | `step_state`, `step_attempts`, `skill_state`, `family_state`, `unlocks`, `streak_weeks`, `terms_introduced`. `advanceHintRung` is the same operation as `POST …/hints` without `reveal`, and counts a tutor hint |
| `conversations: ConversationStore` | `find(key)` · `create(init)` · `entries(id, opts)` · `append(id, entry)` · `subjectDay(subject, day)` · `timeline(subject)` · `backendRecords(id, backend)` · `appendBackendRecords(id, backend, records, { excluded })` · `saveCard(card)` · `card(id)` · `markCardApplied(id)` | `tutor_conversations`, `tutor_messages`, `tutor_backend_records`, `tutor_cards`. Messages and backend records are append-only (triggers). The conversation ID is `<subjectKind>:<subjectId>:<day>:<lane>` |
| `notes: TutorNotesStore` | `recent(subject, limit)` · `add(note)` · `retract(id, at)` | `tutor_notes` (`retracted_at`) |
| `settings: SettingsPort` | `tutor(): TutorSettings` · `markSoftWarned(month)` | the `tutor` settings key (`TutorSettingsSchema`) |
| `usage: UsageSink` | `record(row: UsageRow)` · `month(month): MonthUsage` | `tutor_usage` |
| `clock: Clock` | `now()` · `timeZone()` | system clock; `learner_profile.timezone` |

The tutor's own names differ from contracts in one place: its `ThreadKind` is the request kind (six values) and its `Lane` is contracts' `thread_kind` (four values). `tutor_conversations.thread_kind` stores the lane.

## 6. Endpoints

All under `/api`, validated with the schemas named here (in `@oak/api`; "inline" means the schema is written in the contract table). Every request carries `X-Oak: 1` except media GETs. Errors are `ApiErrorBody` (`{ error: { code, message, issues? } }`) with status 400, 403, 404, 409, 428 (confirm required) or 500. Outside `/api`: `GET /sounds/manifest.json`, `GET /sounds/<packVersion>/*`, and in production `dist/*` with SPA fallback.

| Name | Method | Path (under `/api`) | Query | Body | Response | Notes |
|---|---|---|---|---|---|---|
| `health` | GET | `/health` |  |  | `HealthSchema` |  |
| `bootstrap` | GET | `/bootstrap` |  |  | `BootstrapSchema` |  |
| `settings.put` | PUT | `/settings/:key` |  | inline | `SettingsSchema` |  |
| `settings.anthropicKey.set` | POST | `/settings/anthropic-key` |  | inline | `KeyStatusSchema` |  |
| `settings.anthropicKey.delete` | DELETE | `/settings/anthropic-key` |  |  | `KeyStatusSchema` | confirm `anthropic-key.delete` |
| `confirm` | POST | `/confirm` |  | `ConfirmRequestSchema` | `ConfirmNonceSchema` |  |
| `data.reset` | POST | `/data/reset` |  |  | `Ok` | confirm `data.reset` |
| `profile.get` | GET | `/profile` |  |  | `ProfileSchema` |  |
| `profile.put` | PUT | `/profile` |  | `ProfilePatchSchema` | `ProfileSchema` |  |
| `profile.calibration` | POST | `/profile/calibration` |  | `CalibrationRunSchema` | `ProfileSchema` |  |
| `session.today` | GET | `/session/today` | targetMinutes |  | `SessionPlanSchema` |  |
| `session.start` | POST | `/session/start` |  | `SessionStartSchema` | `SessionSchema` |  |
| `session.heartbeat` | POST | `/session/:id/heartbeat` |  | `SessionHeartbeatSchema` | `Ok` |  |
| `session.end` | POST | `/session/:id/end` |  | `SessionEndSchema` | `SessionSummarySchema` |  |
| `lessons.progress` | GET | `/lessons/progress` |  |  | `CourseProgressSchema` |  |
| `steps.state` | GET | `/lessons/:id/steps/:stepId` |  |  | `StepStateSchema` |  |
| `steps.attempt` | POST | `/lessons/:id/steps/:stepId/attempts` |  | `StepAttemptCreateSchema` | `StepAttemptResultSchema` |  |
| `steps.hint` | POST | `/lessons/:id/steps/:stepId/hints` |  | inline | `StepStateSchema` |  |
| `steps.newSeries` | POST | `/lessons/:id/steps/:stepId/series` |  |  | `StepStateSchema` |  |
| `lessons.complete` | POST | `/lessons/:id/complete` |  | `LessonCompleteRequestSchema` | `LessonCompleteResultSchema` |  |
| `checkpoints.start` | POST | `/checkpoints/:cpId/start` |  |  | `CheckpointAttemptStartSchema` |  |
| `checkpoints.attempt` | POST | `/checkpoints/:cpId/attempts` |  | `CheckpointSubmitSchema` | `CheckpointOutcomeSchema` |  |
| `capstones.get` | GET | `/capstones/:id` |  |  | `CapstoneStateSchema` |  |
| `capstones.check` | POST | `/capstones/:id/checks` |  | `CapstoneCheckSchema` | `CapstoneStateSchema` |  |
| `capstones.completeSession` | POST | `/capstones/:id/sessions` |  | `CapstoneSessionCompleteSchema` | `CapstoneStateSchema` |  |
| `gym.start` | POST | `/gym/sessions` |  | `GymSessionCreateSchema` | `GymSessionSchema` |  |
| `terms.introduced` | GET | `/terms/introduced` |  |  | inline |  |
| `skills.map` | GET | `/skills/map` |  |  | `SkillMapSchema` |  |
| `srs.due` | GET | `/srs/due` | budgetSec, more |  | `DueBatchSchema` |  |
| `srs.review` | POST | `/srs/review` |  | `SrsReviewRequestSchema` | `SrsReviewResultSchema` |  |
| `families.list` | GET | `/drills/families` |  |  | inline |  |
| `families.state` | GET | `/drills/difficulty/:familyId` |  |  | `FamilyStateSchema` |  |
| `drills.start` | POST | `/drills/sessions` |  | `DrillSessionCreateSchema` | `DrillSessionSchema` |  |
| `drills.trials` | POST | `/drills/sessions/:id/trials` |  | inline | `Ok` |  |
| `drills.finish` | POST | `/drills/sessions/:id/finish` |  |  | `DrillFinishSchema` |  |
| `unlocks.list` | GET | `/unlocks` |  |  | inline |  |
| `unlocks.seen` | POST | `/unlocks/:id/seen` |  |  | `Ok` |  |
| `cando.list` | GET | `/cando` |  |  | inline |  |
| `progress.get` | GET | `/progress` |  |  | `ProgressReportSchema` |  |
| `streak.get` | GET | `/streak` | weeks |  | inline |  |
| `sketches.list` | GET | `/sketches` | origin, archived |  | inline |  |
| `sketches.create` | POST | `/sketches` |  | `SketchCreateSchema` | `SketchSavedSchema` |  |
| `sketches.get` | GET | `/sketches/:id` |  |  | `SketchDetailSchema` |  |
| `sketches.addVersion` | POST | `/sketches/:id/versions` |  | `SketchVersionCreateSchema` | `SketchSavedSchema` |  |
| `sketches.patch` | PATCH | `/sketches/:id` |  | `SketchPatchSchema` | `SketchSchema` |  |
| `sketches.delete` | DELETE | `/sketches/:id` |  |  | `Ok` | confirm `sketch.delete` |
| `album.get` | GET | `/album` |  |  | `AlbumSchema` |  |
| `album.track` | GET | `/album/tracks/:id` |  |  | `AlbumTrackDetailSchema` |  |
| `album.createTrack` | POST | `/album/tracks` |  | `AlbumTrackCreateSchema` | `AlbumTrackDetailSchema` |  |
| `album.addVersion` | POST | `/album/tracks/:id/versions` |  | `AlbumTrackVersionCreateSchema` | `AlbumTrackDetailSchema` |  |
| `album.putAudio` | PUT | `/album/tracks/:id/versions/:v/audio` | durationS | binary | `AlbumTrackVersionSchema` |  |
| `album.getAudio` | GET | `/album/tracks/:id/versions/:v/audio` |  |  | binary | media GET |
| `album.deleteTrack` | DELETE | `/album/tracks/:id` |  |  | `Ok` | confirm `track.delete` |
| `audio.upload` | POST | `/audio` | name | binary | `AudioFileSchema` |  |
| `audio.get` | GET | `/audio/:id` |  |  | binary | media GET |
| `audio.putPeaks` | PUT | `/audio/:id/peaks` |  | binary | `Ok` |  |
| `audio.getPeaks` | GET | `/audio/:id/peaks` |  |  | binary | media GET |
| `audio.delete` | DELETE | `/audio/:id` |  |  | `Ok` | confirm `audio.delete` |
| `transcriptions.list` | GET | `/transcriptions` |  |  | inline |  |
| `transcriptions.create` | POST | `/transcriptions` |  | `TranscriptionCreateSchema` | `TranscriptionDetailSchema` |  |
| `transcriptions.get` | GET | `/transcriptions/:id` |  |  | `TranscriptionDetailSchema` |  |
| `transcriptions.patch` | PATCH | `/transcriptions/:id` |  | `TranscriptionPatchSchema` | `TranscriptionSchema` |  |
| `transcriptions.addVersion` | POST | `/transcriptions/:id/versions` |  | `TranscriptionVersionCreateSchema` | `TranscriptionDetailSchema` |  |
| `transcriptions.delete` | DELETE | `/transcriptions/:id` |  |  | `Ok` | confirm `transcription.delete` |
| `tutor.chat` | POST | `/tutor/chat` |  | `TutorTurnRequestSchema` | SSE |  |
| `tutor.hint` | POST | `/tutor/hint` |  | `TutorTurnRequestSchema` | SSE |  |
| `tutor.note` | POST | `/tutor/note` |  | `TutorTurnRequestSchema` | SSE |  |
| `tutor.reviewCapstone` | POST | `/tutor/reviews/capstone` |  | `TutorTurnRequestSchema` | SSE |  |
| `tutor.reviewTranscription` | POST | `/tutor/reviews/transcription` |  | `TutorTurnRequestSchema` | SSE |  |
| `tutor.warm` | POST | `/tutor/warm` |  |  | inline |  |
| `tutor.timeline` | GET | `/tutor/timeline` | subjectKind, subjectId |  | `TutorTimelineSchema` |  |
| `tutor.usage` | GET | `/tutor/usage` | month |  | `TutorUsageReportSchema` |  |
| `tutor.cardApplied` | POST | `/tutor/cards/:id/applied` |  | inline | `CardRecordSchema` |  |
| `tutor.notes` | GET | `/tutor/notes` | subjectKind, subjectId |  | inline |  |
| `tutor.retractNote` | POST | `/tutor/notes/:id/retract` |  |  | `TutorNoteSchema` |  |
| `grade` | POST | `/grade` |  | `GradeRequestSchema` | `GradeResultSchema` |  |
| `analyze` | POST | `/analyze` |  | `AnalyzeRequestSchema` | `AnalyzeResponseSchema` |  |
| `telemetry.steps` | POST | `/telemetry/steps` |  | inline | `Ok` |  |
| `qa.report` | POST | `/qa/reports` |  | `QaReportCreateSchema` | `QaReportSchema` |  |
| `backup.info` | GET | `/backup` |  |  | `BackupInfoSchema` |  |
| `backup.export` | GET | `/backup/export` | audio |  | binary |  |
| `backup.import` | POST | `/backup/import` |  | binary | `BackupImportResultSchema` | confirm `backup.import` |
| `dev.qa` | GET | `/dev/qa` |  |  | inline | dev |
| `dev.qaUpdate` | PATCH | `/dev/qa/:id` |  | inline | `QaReportSchema` | dev |
| `dev.telemetry` | GET | `/dev/telemetry` |  |  | `TelemetryReportSchema` | dev |
| `dev.contentReport` | GET | `/dev/content-report` |  |  | inline | dev |

Added against architecture §4.4 and contracts §11.9 because the flows need them: `steps.state`, `steps.hint` (pressing Hint; `reveal: true` is the only way to rung 4), `steps.newSeries`, `checkpoints.start` (the server composes the attempt), `capstones.*`, `families.list`, `progress.get`, `streak.get`, `album.track`, `tutor.timeline` (replaces `GET tutor/conversations/:id`: the panel shows one merged timeline per subject), `tutor.notes`, `analyze`, `backup.info`, `dev.qaUpdate`. Dropped: `tutor/retry/:conversationId` (the client resends), `dev/count-tokens`.

## 7. SQLite (`server/src/db/migrations/0001_init.sql`)

Pragmas: `journal_mode=WAL; foreign_keys=ON; busy_timeout=5000; synchronous=NORMAL`. Timestamps are ISO-8601 UTC TEXT; `day` columns hold the learner-local date after the 04:00 rollover; `*_json` columns hold JSON text. This is architecture §4.2 with every amendment of contracts §11.11 applied; tables marked ＋ are additions this document makes (§10).

| Table | Columns |
|---|---|
| `settings` | `key` PK, `value_json`, `updated_at` |
| `learner_profile` | `id` PK CHECK (id = 1), `display_name`, `timezone`, `rollover_hour` DEFAULT 4, `daily_minutes` DEFAULT 20 CHECK IN (15, 20, 25), `weekly_goal` DEFAULT 5, `flavour`, `vocal_low_midi`, `vocal_high_midi`, `comfort_low_midi`, `comfort_high_midi`, `sing_tolerance_cents` DEFAULT 70 CHECK IN (70, 50, 35, 25), `sing_tol_mode` CHECK IN ('auto', 'fixed'), `output_latency_ms`, `input_latency_ms`, `sing_latency_ms`, `tap_latency_ms`, `tap_jitter_ms`, `visual_offset_ms` DEFAULT 0, `output_kind` CHECK IN ('wired', 'bluetooth', 'speakers', 'unknown'), `input_kind` CHECK IN ('builtin', 'external', 'bluetooth', 'none'), `input_device_id`, `noise_floor_db`, `quiet`, `solfege` DEFAULT 'numbers', `onboarded_at`, `created_at` |
| `calibration_runs` | `id` PK, `kind`, `result_json`, `at` |
| `sessions` | `id` PK, `day`, `kind` CHECK IN ('lesson', 'checkpoint', 'capstone', 'gym', 'keepalive', 'light', 'studio', 'review'), `target_minutes`, `content_version`, `map_item_id`, `phase`, `started_at`, `ended_at`, `active_minutes`, `plan_json`, `summary_json` |
| `lesson_progress` | `lesson_id` PK, `status` CHECK IN ('locked', 'available', 'in_progress', 'completed'), `current_step`, `split_part`, `started_at`, `completed_at`, `best_score`, `completed_version`, `content_hash`, `updated_at` |
| `step_state` ＋ | `lesson_id`, `step_id`, `series_no`, `rung` DEFAULT 0, `tutor_hints` DEFAULT 0, `attempts` DEFAULT 0, `passed` DEFAULT 0, `updated_at`; PK (`lesson_id`, `step_id`) |
| `step_attempts` | `id` PK, `session_id` → sessions, `lesson_id`, `step_id`, `exercise_id`, `exercise_version`, `series_no`, `attempt_no`, `params_json`, `code`, `response_json`, `result_json`, `passed`, `score`, `adjusted`, `feedback_codes` DEFAULT '[]', `hint_rung` DEFAULT 0, `assisted` DEFAULT 0, `modality`, `disputed` DEFAULT 0, `tutor_assisted` DEFAULT 0, `tutor_conversation_id`, `at` |
| `exercise_results` | `exercise_id`, `exercise_version`, `lesson_id`, `first_pass_at`, `attempts_to_pass`, `best_score`, `last_score`, `assisted`, `last_at`; PK (`exercise_id`, `exercise_version`) |
| `checkpoint_attempts` | `id` PK, `cp_id`, `attempt_no`, `started_at`, `finished_at`, `score`, `passed`, `soft_pass`, `per_skill_json`, `items_json`, `detail_json` |
| `repair_queue` ＋ | `id` PK, `cp_id`, `skill_id`, `family_id`, `sets_remaining`, `created_at` |
| `capstone_state` ＋ | `capstone_id` PK, `status` CHECK IN ('open', 'in_progress', 'released'), `sessions_json`, `sketch_id`, `track_id`, `flavour`, `last_result_json`, `started_at`, `released_at`, `updated_at` |
| `evidence` | `id` PK, `skill_id`, `category`, `at`, `day`, `score`, `weight`, `source_kind`, `source_id` |
| `skill_state` | `skill_id` PK, `P`, `R`, `D`, `level` CHECK IN ('new', 'available', 'learning', 'practiced', 'mastered'), `debt`, `debt_reason`, `provisional`, `paused`, `updated_at` |
| `srs_cards` | `card_id` PK, `kind` CHECK IN ('fact', 'concept', 'family', 'composite'), `status` CHECK IN ('active', 'deferred', 'graduated', 'paused', 'retired'), `payload_json`, `fsrs_json`, `model`, `desired_retention`, `due_at`, `state`, `introduced_by`, `released_at`, `created_at`, `updated_at` |
| `srs_revlog` | `id` PK, `card_id` → srs_cards, `reviewed_at`, `rating`, `revlog_json`, `drill_session_id`, `mean_credit`, `trials_total`, `median_rt_ms` |
| `family_state` | `family_id` PK, `level`, `promo_day`, `category_stats_json`, `confusion_json`, `blocked_remaining`, `composite_id`, `graduated_at`, `updated_at` |
| `drill_sessions` | `id` PK, `session_id` → sessions, `purpose` CHECK IN ('srs', 'practice', 'lesson', 'checkpoint', 'gym', 'anchor', 'repair', 'keepalive'), `family_ids`, `set_id`, `warmup_item_id`, `started_at`, `finished_at`, `trials_total`, `mean_credit` |
| `drill_trials` | `id` PK, `drill_session_id` → drill_sessions, `idx`, `family_id`, `seed`, `level`, `category`, `trial_json`, `response_json`, `credit`, `correct`, `cents_error`, `rt_ms`, `replays`, `at` |
| `streak_days` | `day` PK, `qualified`, `source` CHECK IN ('review', 'sketch', 'keepalive', 'session', 'repair', 'rest', 'banked-rest', 'paused'), `kinds_json`, `minutes`, `review_sets`, `sketch_saved` |
| `streak_weeks` | `week_start` PK, `goal`, `qualifying_days`, `banked_used`, `repaired_days`, `status` CHECK IN ('open', 'met', 'met-banked', 'met-repaired', 'tie-open', 'missed', 'paused') |
| `rests` | `id` PK, `earned_week`, `spent_week` NULL (at most 2 unspent) |
| `unlocks` | `item_id` PK, `kind` CHECK IN ('tool', 'sound', 'scale', 'chord', 'feature', 'template', 'lens'), `source_kind`, `source_id`, `unlocked_at`, `seen` DEFAULT 0 (rows are never deleted) |
| `cando_ledger` | `cando_id`, `status` CHECK IN ('emerging', 'solid', 'strong', 'fading'), `evidence_kind`, `evidence_id`, `at`; PK (`cando_id`, `at`) |
| `terms_introduced` | `term_id` PK, `lesson_id`, `at` |
| `sketches` | `id` PK, `title`, `origin_kind` CHECK IN ('lesson-make', 'free', 'capstone', 'transcription', 'tutor', 'keepalive', 'checkpoint'), `origin_id`, `current_version`, `tags_json`, `archived`, `listening_comment`, `created_at`, `updated_at` |
| `sketch_versions` | `sketch_id` → sketches, `version`, `code`, `bpm`, `meter`, `key`, `analysis_json`, `note`, `tutor_assisted` DEFAULT 0, `band_json`, `flags_json`, `created_at`; PK (`sketch_id`, `version`) |
| `album_tracks` | `id` PK, `capstone_id` NULL, `sketch_id`, `side` CHECK IN ('A', 'B', 'Bside'), `track_no`, `title`, `flavour`, `current_version`, `cover_seed`, `created_at` |
| `album_track_versions` | `track_id` → album_tracks, `version`, `sketch_id`, `sketch_version`, `audio_path`, `audio_mime`, `duration_s`, `liner_notes_md`, `theory_tags_json`, `review_json`, `tutor_assisted` DEFAULT 0, `attribution`, `band_json`, `flags_json`, `created_at`; PK (`track_id`, `version`) |
| `audio_files` | `id` PK (sha256), `original_name`, `mime`, `bytes`, `duration_s`, `sample_rate`, `channels`, `stored_path`, `peaks_path`, `created_at` |
| `transcriptions` | `id` PK, `source_kind` CHECK IN ('own-audio', 'pd-song', 'generated'), `player` CHECK IN ('audio', 'pattern'), `audio_id` → audio_files, `song_id`, `title`, `artist`, `key`, `bpm`, `meter`, `downbeat_s`, `fine_tune_cents`, `ladder_level`, `realism`, `hidden_code`, `regions_json`, `checklist_json`, `self_score`, `current_version`, `status`, `review_json`, `created_at`, `updated_at` |
| `transcription_versions` | `transcription_id` → transcriptions, `version`, `code`, `result_json`, `created_at`; PK (`transcription_id`, `version`) |
| `gym_sessions` | `gym_id` PK (`GYM.nn`), `session_id`, `kind` CHECK IN ('ladder', 'own-audio'), `ladder_level`, `realism`, `transcription_id`, `at` |
| `tutor_conversations` | `id` PK (the thread ID), `subject_kind`, `subject_id`, `day`, `thread_kind` CHECK IN ('hint', 'note', 'chat', 'review'), `effort`, `session_id`, `model`, `prefix_version`, `created_at`; UNIQUE (`subject_kind`, `subject_id`, `day`, `thread_kind`) |
| `tutor_messages` | `id` PK, `conversation_id` → tutor_conversations, `seq`, `at`, `role` CHECK IN ('user', 'assistant'), `kind`, `text`, `learner_code`, `card_ids_json`, `review_json`, `step_id`, `rung`, `summary`, `backend`, `excluded` DEFAULT 0, `error_kind`; UNIQUE (`conversation_id`, `seq`); triggers forbid UPDATE and DELETE |
| `tutor_backend_records` ＋ | `id` PK, `conversation_id` → tutor_conversations, `backend` CHECK IN ('anthropic-api', 'claude-cli'), `seq`, `record_json`, `excluded` DEFAULT 0, `created_at`; triggers forbid UPDATE and DELETE |
| `tutor_usage` | `id` PK, `conversation_id`, `kind`, `lane`, `backend`, `served_by_json`, `requests`, `input_tokens`, `output_tokens`, `cache_write_5m`, `cache_write_1h`, `cache_read`, `cache_creation`, `cost_usd` NULL, `included_in_plan`, `day`, `at` |
| `tutor_cards` | `id` PK, `conversation_id`, `tool_use_id`, `kind`, `title`, `code`, `explanation`, `bars`, `apply_state` CHECK IN ('preview_only', 'applicable', 'applied'), `locked_tools_json`, `applied_at`, `saved_sketch_id`, `created_at` |
| `tutor_notes` | `id` PK, `day`, `subject_kind`, `subject_id`, `source` CHECK IN ('listening', 'review', 'observation'), `text`, `skill_id` NULL, `conversation_id`, `retracted_at` NULL, `at` |
| `qa_reports` | `id` PK, `at`, `kind`, `lesson_id`, `step_id`, `exercise_id`, `exercise_version`, `family_id`, `trial_seed`, `params_json`, `response_json`, `grade_result_json`, `hint_rung`, `note`, `content_version`, `app_version`, `status` CHECK IN ('open', 'triaged', 'fixed', 'wontfix') |
| `step_telemetry` | `id` PK, `session_id`, `lesson_id`, `lesson_version`, `step_id`, `step_kind`, `target_minutes`, `authored_minutes`, `scaled_minutes`, `started_at`, `ended_at`, `active_ms`, `attempts`, `max_hint_rung`, `tutor_messages`, `passed`, `skipped`, `tested_out`, `split_part` |
| `session_telemetry` | `session_id` PK, `day`, `target_minutes`, `kind`, `warmup_ms`, `new_ms`, `make_ms`, `coda_ms`, `total_active_ms`, `warmup_sets`, `warmup_planned_sec`, `due_sec_before`, `due_sec_after`, `deferred_cards`, `overflow_sec`, `wrapped_early`, `split` |

Dropped from architecture §4.2: `skills`, `skill_evidence`, `difficulty_state`, `freeze_tokens`, `practice_suggestions`, and the columns `headphones`, `vocal_tonic_midi`, `user_offset_ms`, `genre_pref`, `srs_cards.suspended`, `tutor_conversations.kind` and `current_effort`, `tutor_messages.content_json` and `extra_json`. Migrations are tracked by `PRAGMA user_version`; an automatic `VACUUM INTO ~/.oak/backups/oak-YYYYMMDD.db` runs on the first launch of each day (keep 14).

## 8. App (`app/`, Vite 8 + React 19, TanStack Router and Query, zustand, xstate)

**Purpose.** The single-page app. **Owner paths.** `app/**`. **May import.** Every package. **Spikes.** `spikes/s2-editors/src/App.tsx` (mounting editors), `spikes/s4-notation/web/main.ts` (abcjs click and highlight), `spikes/s5-pitch/src/main.ts`.

Rules: one `OakStrudel` (`createOakStrudel` once, in `app/src/lib/oak.ts`), one browser `GraderHost`, one `createClient()`; server state lives in TanStack Query, UI and tutor state in zustand, flows in xstate; theme is `data-theme="paper" | "bark"` on `<html>` (never the `dark` class); the app is fully usable without the tutor; Chromium-based browsers only. `app/index.html` contains `<canvas id="test-canvas" hidden>` and `<link rel="icon" href="data:,">`. Vite: `resolve.alias` `@content` → `content`, `@app` → `app/src`; `server` on `127.0.0.1:5173`, `strictPort`, proxy `/api` and `/sounds` to `http://127.0.0.1:8787`; its own `cacheDir`; `define` for `process.env.NODE_ENV`; `worker.format: "es"`.

Routes (TanStack file routes; contracts §11.9):

| Route | Screen | Mode |
|---|---|---|
| `/` | Today | shell |
| `/onboarding/$step` | U00.L01 flow | focus |
| `/learn/$lessonId?step=` | Lesson Player | focus |
| `/checkpoint/$unitId` | Checkpoint (`U07` for core, the full ID for `J.CP1`, `J.CP2`, `R.CP`, `A.CP`; `checkpointFromRouteParam`) | focus |
| `/capstone/$id` | Capstone workspace | shell |
| `/session/coda` | Coda | focus |
| `/studio`, `/studio/$sketchId` | Studio (sketchbook, free play) | shell |
| `/oak?view=tree\|course\|leaves` | Skill map ("The Oak") | shell |
| `/practice`, `/practice/$familyId`, `/practice/review` | Practice hub, one family, today's review | shell / focus |
| `/transcribe`, `/transcribe/$projectId` | Transcribe | shell |
| `/album`, `/album/$trackId?v=` | Album, track page | shell |
| `/toolbox?cat=`, `/toolbox/$toolId` | Toolbox | shell |
| `/progress` | Can-do ledger, milestones, pace | shell |
| `/settings/{audio,voice,tutor,learning,appearance,keys,data,about}`, `/settings/voice/setup` | Settings; calibration wizard | shell / focus |
| `/dev/listen`, `/dev/telemetry`, `/dev/qa` | Listen QA, telemetry, grading-problem queue (`OAK_DEV=1`) | shell |

Not routes: `/map`, `/drills`, `/sketchbook`, `/studio/$transcriptionId`.

Who the app calls for what:

| Need | Call |
|---|---|
| An editor that plays | `oak.createEditor(el, opts)` → `EditorHandle`; mute buttons → `handle.setMutes` |
| Roll and staff for the current code | `graderHost.analyze(code, { mode: 'lesson', bars, lint })` → `normalize` → `buildScore` / `toAbc`; live playhead from `onPaint` and `transport.audibleCycle()` |
| Check an answer | `graderHost.grade({ exercise, response, ctx })` → `GradeResult` → `toIssueView(result, rung, { render: renderFeedback })` for the panel → `api.call("steps.attempt", …)` |
| A hint | `api.call("steps.hint", { params, body: { reveal: false } })`; the tutor's hint route advances the same rung |
| A drill set | `api.call("drills.start")` → `planSet` and `generateTrial` (`@oak/drills`) → `oak.preload` → `oak.playEvents(trialAudio(trial).stimulus)` → `gradeTrial` → `drills.trials` → `drills.finish` |
| Singing | `micGraph.open()` → frames → `gradeSungLive` while singing, `gradeSung` at the end |
| Tapping | `tapInput.arm()` → `gradeTaps` |
| Tutor | `api.stream(TUTOR_ROUTE_OF[kind], request, { onEvent })`; render text with `parseTutorText` |
| Destructive action | native confirm dialog, then `api.destructive(name, target, input)` |

## 9. Content (`content/`)

Layout, IDs and file contents are contracts §1 and §5.8 and `content/AUTHORING.md`. Lesson files use only `@oak/content-kit`:

```ts
import { defineLesson } from "@oak/content-kit";
export default defineLesson({ id: "U01.L02", version: 1, /* … */ });
```

`content/syllabus.ts` exports a `SyllabusDef`; `content/skills.ts` → `defineSkills([...])`; `content/families.ts` → `defineFamily` per family plus `defineDeck` per deck; `content/toolbox.ts` → `defineToolbox([...])`; `content/terms.ts` → `defineTerm`; `content/candos.ts` → `defineCanDo`; `content/flavours.ts` → `defineFlavour`; `content/bands/*.ts` → `defineBand`; `content/repertoire/<song-id>/song.ts` → `defineSong`; `content/core/Uxx/CP/checkpoint.ts` → `defineCheckpoint`; `content/core/capstones/Cx/capstone.ts` → `defineCapstone`.

`bun run content:build` (`scripts/content/build.ts`) writes `content/.generated/`: `ids.ts` (exact ID unions and guards), `index.json` (with `contentVersion = sha256(content)`), `skill-graph.json`, `toolbox.json` (the `ToolEntry[]` every grader host and the adapter are initialised with), `examples.json`, `sounds-used.json`, `lesson-text/`, `tutor/` (syllabus and catalog text for `LessonContextPort.prefixSources`). `bun run content:check <id>` runs the 13 checks of AUTHORING §9.1 using `schemaIssues`, `checkLessonAuthoring`, `unimplementedInLesson`, `lintOak` (profile `content`), a `bun-worker` `GraderHost`, `buildScore` and `@oak/theory`.

## 10. Decisions this document makes

Where the sources were silent or disagreed, Foundation chose as follows. Each is in code and tested; none changes a number in contracts.

1. **ID types are template-literal types** in `@oak/content-kit` until `content:build` generates the exact unions. An exercise owner may also be a checkpoint (`U03.CP/slug`), because checkpoints carry authored items.
2. **`lintOak` is implemented in `@oak/grader`** (it needs acorn and `@strudel/mini`); its types (`LintContext`, `LintProfile`, `LintDiagnostic`, `LintResult`) are in `@oak/content-kit`. Contracts §3.3 names content-kit as its home; the import rules do not allow that.
3. **`ErrorHuntEx`** was cut off in the saved exercises document. It is `{ code, reference, matcher, locateVia: 'code' | 'staff' | 'roll' | 'bars', bugs?: CodeRange[] }`, from the kind's specification.
4. **`ComposeBriefEx.flavours`** takes `FlavourId`s (the design's free-text `flavors` list predates the flavour kits) and `review` has no `effort` (effort is fixed per thread kind).
5. **`Stimulus { src: 'tune' }`** keeps the field name `tuneId` and types it `SongId`.
6. **`IssueView.id`** is absent below rung 2 for answer-bearing findings, because the feedback code itself names the kind of problem.
7. **Drill family split:** the data (`FamilyDef`, `LevelParams`, `Trial`, `TrialResult`, `FactDeck`) is content schema; the functions (`generate`, `grade`, `exposure`) are `DrillFamilyRuntime` in `@oak/drills`, bound by `FamilyDef.generator`.
8. **`PitchFrame.t`** (not the spike's `time`), as the design documents and the trial types say; it is the context time of the window's last sample.
9. **Tutor naming:** `@oak/api` mirrors the tutor service's `ThreadKind` (six request kinds) and `Lane` (four conversations); contracts' `thread_kind` is the lane. The `review` SSE event exists in the service and is mirrored.
10. **Tables added:** `step_state` (a hint can be taken before any attempt exists), `repair_queue`, `capstone_state`, `tutor_backend_records` (required by `ConversationStore.backendRecords`); `tutor_messages` stores the app-level transcript the port describes.
11. **SRS constants** carry the contract's numbers; `DECISION_2` and `recommendedGovernor` carry the overrides of `docs/decisions.md` row 2. The SRS builder settles which is live by the simulation gate of contracts §7.4 and records it.
12. **`@oak/grader/testing`** exists so that every package can check music facts against Strudel without importing it.

## 11. Integration amendments (end of Wave 1)

What the integration pass changed or found in the real code. Where this section and §4 disagree, this section is current.

**`@oak/grader`.** Every §4.4 function is implemented; `index.ts` delegates to `grade/`, `match/`, `rubric/`, `feedback/`, `analyze/` (incl. the new `analyze/tutor-view.ts`) and injects the realm (`evaluateForGrading`, `normalize`, `toolsUsed` over the realm's toolbox) into the grade pipeline. Additional exports: `catalogSeverity`, `messagesOf`, `sortDiagnostics`; the performance helpers `tapTargets`, `singTargets`, `tapWindow`, `minIoiMs`, `performancePasses` (targets and pass rules for tap/sing; the measurement is `@oak/pitch`). `OakEvent.locations` is `OakLocation[]` (`{ start, end, fn?, text? }`). `createBunGraderHost` returns `GraderHost & HostCore` (`ping`, `request`, `lastReady`, `stats`); `BunHostOptions` adds `spare?`, `lockdown?`; `BrowserHostOptions` adds `spare?`; the `ready` message carries `lockdown: { neutered, failed }`. `runMatcher`/`runRubric` accept the wider `RubricContext` (bars, totalBars, toolsUsed, profile, resolveReference). Behaviour settled here: an `error-hunt` fix sent without clicks locates the bug by its edit (the changed token ranges are the clicks); a single (non-`parts`) `run-investigate` response answers every question it fits; a melody substitution puts the target note in `overlay.missing` (the rung-3 ghost); the `band` lint profile does not require a tempo line (Band code shares the session tempo, contracts §5.10). Feedback IDs are the catalog's: `fill.blank-empty` (not `fill.empty`), no `hunt.wrong-fix` (a wrong fix reports what the matcher found). The theory stand-in used by the grader tests during the wave is gone: they run against `@oak/theory`.

**`@oak/theory`.** As §4.3, plus: `schemaMatch(slots, lib?, key?)`; schema IDs are lower-case (`schema.rhythm-a`); `parseChordWithBass`, `classifyCadence`, `toCode(chord, dict?)`, `DICT_CODE`, `ALIAS_DICTS`, `parseKeyText`; the CLI logic is `runTheoryCli(argv)` in the isomorphic `src/cli.ts`, entry `src/cli.bun.ts`.

**`@oak/notation`.** Additive `types.ts` changes (`NoteItem.drums|hidden|locs|lyric`, `IdMapEntry.beat`); one `oak-e{n}` class per engraved element (n = idMap index); voice ids `S1v2`; browser helper entry `@oak/notation/render` → `src/render.dom.ts`; extra exports `toNoteList`, `withIds`, `estimateKey`, `straightenSwing`, the staff-input helpers (`applyEdit`, `editStaff`, `staffStepAtY`, `stepToPitch`, `pitchToStep`, `nudgePitch`, `xToOnset`, `writtenToCycles`). `parseNoteList(text, { meter?: MeterSpec })`.

**`@oak/pitch` / `@oak/audio`.** Subpath exports `@oak/pitch/detector` (the worklet's only import) and `@oak/pitch/synth` (test tones, WAV); hum-to-draft (`draftFromHum`), the tolerance ladder (`ladderProgress`, `nextSingTolerance(…, { since })`), `TapResult.tempoRatio`. `@oak/audio`: `createMicGraphWith`, `PITCH_WORKLET_URL`, `micConstraints`, `bindMicShortcut`, `createPatternSource(PatternPlayerLike)`, entry `@oak/audio/waveview`. The processor name `oak-pitch` is reserved.

**`@oak/drills`.** The family catalog lives in `@oak/drills` (`FAMILIES`, `DECKS`); `content/families.ts` re-exports the drill families and keeps the §7.3 table (`FAMILY_TABLE`, checked against contracts) for the composites and for families whose generator is still `pending:*` (those keep the content-authored categories). Fact decks stay content's (their card IDs are in `ids.lock.json`); `DECKS` in drills is the generators' own test catalog. New: `isCompositeGenerator`; `createRegistry` skips `pending:*` and composite (`mix.*`) families, and `family(id)` explains which. Extra exports `generateSet`, `setPreload`, `setOutcome`, `factOutcome`; `DrillTrialResult` adds `centsError`, `skipped`. `@oak/pitch` is reached through `src/pitch-seam.ts`; the tests run both the mapping (stand-in) and the real `gradeTaps`/`gradeSung`.

**`@oak/srs`.** `intakeForecast(items, today, cfg, extraSec, cls)`, `micRoom`, `classShare`, `forecastCost`, `WARMUP_GYM_SEC`, `items.ts` helpers. The §7.4 gate criteria "deferred queue p95 ≤ 4" and "oldest undelivered due card p95 ≤ 7 days" are not met (recorded as `test.failing` with the measured values).

**`@oak/strudel`.** As §4.9 plus the additions of `types.ts` (coordinator, ui, scope, packFiles, `EditorHandle.flashRanges|queryHaps`, `Transport.haps`, `PlayEventsOptions.exclusive`, `EditorOptions.onEvicted`); subpaths `@oak/strudel/audibility`, `…/audibility/cases`, `…/audibility/render-frame`, `…/audibility.json`. A locked AudioContext resolves `evaluate` with `eval.audio-locked` (warn), never rejects. Register the Service Worker as `/sw.js?pack=<packVersion>` (production only).

**`@oak/content-kit`.** `TRACK_LABELS` includes `fx` (STYLE §2). `TestResponse` is unchanged (contracts §5.1): a test cannot combine an answer and a click, so click questions are tested in their own `run-investigate` part.

**Server.** Real grader hosts (`server/src/grader/host.ts`, lazily through `seams.ts`), real content (`content/` sources plus `content/.generated/`). Tutor turn routes are validated in `routes/tutor.ts` and forwarded to the tutor app; `/api/tutor/status` is the tutor app's own route. Dev mode (`OAK_DEV=1`) is required behind the Vite proxy (its Host and Origin are allowed only then).

**App.** `/dev/workbench` compares with the grader's own `compare` (the dev fake is gone). In a dev build the adapter is on `globalThis.__oakStrudel` for the platform e2e (never in production).

**Content CI.** `content/validate/harness.ts` uses only the real packages (no fallback grader): `lintOak`, `gradeExercise` (realm initialised with the course toolbox), `evaluateForGrading` + `normalize` + `notate` for notation, `@oak/pitch` `gradeTaps` for tap tests. A test no package can decide (a sung response without a recorded fixture) is reported as pending.

## 12. Final-gate amendments (review pass)

Three reviews (music correctness, robustness, browser runtime) and the final gate changed these public
behaviours. Where this section and §4 or §11 disagree, this section is current.

**`@oak/theory`.** `parseRN` accepts slash figures (`V6/5` → `V65`, `V4/3`, `V4/2`, `I6/4`); `V7/V` still
reads as applied. `normalizeText(…, "interval")` maps tritone/TT → `TT`, octave → `P8`, unison → `P1`; the
note and key forms accept spelled-out sharp/flat (`E-flat`, `c sharp minor`). `romanOf`: in a minor key a
°7 chord is diatonic only on the leading tone; other °7 roots read as applied `vii°7/x`.

**`@oak/grader` (analysis).** `scaleMembership(events, key, o?: { strict?: boolean })`: in minor it accepts
the raised 6th and 7th unless `strict` (only the `in-key` rubric rule calls it; strict Aeolian belongs to the
`mode` rule). `cadenceAt` matches `@oak/theory` `classifyCadence`: a Picardy I closes a minor key, the blues
tonic is I(7) or i, vii°(7)→I is IAC, and with no melody the soprano is the top note of a hand-voiced final
chord (otherwise harmony alone decides PAC). `classifyNct` may report `suspension` for a chord tone tied into
a chord it does not belong to that then resolves down by step. `inferMeter` correlates on the music's own
grid, ranks meters whose metric level matches that grid first and weights snare/clap ×1.25 (the
`MeterGuess` shape is unchanged; an all-half-note bar now prefers 2/4). Key-relative melody matching takes
the answer's key from `keyFromContext(answer)` or the reference key moved by `bestTransposition`;
`keyEstimate` only when there is no reference key. `contains-rn` with an applied numeral (`x/y`) matches
only when `romanOf` reads the slot chord as applied.

**`@oak/grader` (lint and feedback).** `eval.mini-parse`'s `{detail}` is one calm clause, never the Peggy
dump: `a "[" is never closed: add a "]"`, `there is a "]" with no "[" before it`, `the "<" is closed with
"]"; it needs ">"`, else `there is a typo near "x"; check its brackets and symbols` or `it ends before a
bracket or group is closed`. New exports in `lint/mini.ts`: `miniErrorDetail(raw, body?)`,
`miniBracketProblem(body)`; `evalFailureDiagnostics` uses the same wording. Strict profile:
`samples()`/`aliasBank()` take only literals, arrays and plain objects (`lint.strict.construct`
otherwise); `registerMultiControl`, `createParam`, `createParams` are banned identifiers. Base profile:
`lint.base.remote-samples` looks inside nested map/array values and refuses `\\host`, a leading control
character and any URL scheme.

**`@oak/grader` (hosts and limits).** `BunHostOptions` gains `maxRssMb` (default 1024, subprocess only) and
`maxLineBytes` (default 64 MB); `HostCoreOptions` gains `bootFailureLimit` (3) and `bootCooldownMs` (2000,
doubling to 60 s). While boots fail, requests resolve to error kind `crashed` with "the grader failed to
start N times in a row; retrying in S s". `EvalResult.logs` is capped at `MAX_LOG_LINES` (200) plus one
"(N more log lines not shown)" line, each at most 2000 chars plus "…". `OakEvent` string fields (`s`,
`bank`, `chord`, `scale`, `track`, `note`, `n`) are capped at `MAX_EVENT_TEXT` (1024); `capText` is
exported from `normalize/hap.ts`.

**`@oak/srs`.** `createSrs().rate/review/preview` clamp a review instant earlier than the card's
`lastReviewAt` (clock stepped back) to `lastReviewAt`: the revlog's `reviewedAt` is that instant and
`elapsedDays` is 0, instead of throwing `SRSSchemaError`.

**`@oak/api`.** `settings.anthropicKey.set`: the body is trimmed and must match `/^[\x21-\x7e]+$/`, 20–400
chars (400 otherwise). `buildPath` throws for a path parameter that is `.`, `..` or a `%2E` form of them.
`BackupImportResultSchema` gains `orphanedFiles: number`. The sketch/album version `flags` object gains
`reviewBeforeRun?: true` (see Server).

**`@oak/strudel`.** New `friendlyEvalError(raw, code, offset?)` and `FriendlyError`; `errorToDiagnostic`
(`eval.syntax`/`eval.runtime`) returns a friendly message and a range when it finds one, the raw text in
`params.detail`. New `ADAPTER_FEEDBACK.silent = "eval.silent"`: an `info` diagnostic in
`EvalOutcome.diagnostics` when a successful run has no onsets in the first `min(loopBars, 16)` cycles and
no mutes are set (the grader's catalogue uses the same ID as an error when grading). New optional
`OakStrudelOptions.calmHighlight?: () => boolean`, read every frame. `OAK_CM_SETTINGS.fontFamily` is the Oak
code font; a `Prec.highest` editor theme coloured by `--oak-code-*` variables (Paper fallbacks) is installed
on every mirror. The editor binds `Mod-Enter` (run) and `Mod-.` (stop) on top of Strudel's Ctrl keys.
Disposing a playing editor calls `coordinator.panic()`; disposing a stopped one touches nothing.

**App.** `model.ts`: `staffSource`, `staffPage(src, page)`, `staffPageCount`, `STAFF_PAGE_BARS = 8`
(`score`/`abc` are page 0); `HighlightBus.staffNsOf`/`eventsOfStaffNs` take an optional page ABC.
`views.ts`: `layoutFor(width, availableHeight?)` returns tabs when width < 760 **or** available height <
760; `ViewTab` includes `"both"`. The shell store's `AudioStatus` gains `{ kind: "suspended" }`.
`app/src/lib/mic.ts` (`getMicGraph`, `openMic`, `closeMic`, `bindMicState`) is the only place a sing step or
calibration opens the mic; a route change closes it. The Service Worker accepts a `warm-shell` message and
falls back to the cached `/` for offline navigations; `vite build` also writes `dist/asset-manifest.json`.
`e2e/attached.config.ts` runs the `e2e/` specs against an already-running stack (`OAK_PROD_URL` for the
production URL).

**Server.** New exports: `readBounded`, `MAX_JSON_BYTES` (`routes/define.ts`); `MAX_OUTSTANDING_NONCES =
256` (`confirm.ts`; the oldest is evicted); `safeSegment` (`static.ts`); `redactSecrets` (`secrets.ts`);
`tightenMode` (`db/index.ts`). The CSP is also sent on `image/svg+xml`. The data dir is 0700, the database,
backups and audio files 0600. Backup import: inflation is bounded by the declared sizes; stored audio paths
that escape the data dir are skipped; **every imported `sketch_versions` and `album_track_versions` row gets
`flags.reviewBeforeRun = true`** (contracts §11.3); **audio of the replaced data that the imported tables
no longer reference is moved to `<safety copy>-audio/{audio,album}/…`** (never deleted, so the safety copy
stays restorable) and counted in `orphanedFiles`. `srs-wiring.ts` runs each review, drill start/trials/
finish, lesson seed, after-step and due call in one transaction.

**Content CI.** `contracts-sync.test.ts` also checks capstone `sessionDefs[].goal` against the Objective
column of §2.4 and §2.6. `content/capstones.ts`: C4's `major-v` rule is `contains-rn ["V"]` with
`mustResolve` (contracts §6.6).
