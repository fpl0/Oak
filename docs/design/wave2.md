# Oak Wave 2 seams — the first playable

## Wave 2 state (read this first)

Written at the Wave 2 final gate (2026-11-11), after the build, the integration (§9) and four reviews (teaching,
journey, surfaces, robustness). §1–§9 below are the seams as built; `docs/design/interfaces.md` §13–§15 record the
cross-package API changes. The code beats both.

**What Wave 3 can rely on** (implemented and proven by execution: `bun run check` and `bun run e2e` green)

- **The first playable, end to end.** A fresh learner opens Oak, goes through onboarding (U00.L01 as the onboarding
  screens, with Chrome's fake microphone or in Quiet mode), and does daily sessions (warm-up drills → new lesson →
  Make → Coda) through U00–U02, the checkpoints U01.CP and U02.CP and the capstones C0 and C1, with the tutor docked
  beside them. `e2e/journey/journey.pw.ts` walks it on the real stack (real server, real content, the scripted fake
  tutor, `PUT /api/dev/clock` between days); `prod.pw.ts` does onboarding on the production build and reloads
  offline. `e2e/review/` (13 specs) and `app/src/ui/review/e2e/` (19 specs) are the reviews' regression suites.
- **Content.** 19 course lessons (U00: 2, U01: 9, U02: 8), the two checkpoints and C0/C1, every one passing all
  content-CI checks with the real grader (`bun run content:check all`); the unit specs are in sync
  (`bun scripts/content/spec.ts --check`). Every graded step is answered in the journey from its own authored
  passing test. Musical claims were checked with headless Strudel (including a clash scan of every Band-step
  starter, example and passing test in U00–U02).
- **Session budgets as authored** (contracts §9, `lessonBudget`, warm-up and Coda from §9.1): median session
  11.65 / 17.55 / 18.55 minutes at the 15 / 20 / 25-minute targets (max 12.7 / 18.95 / 19.95); at 15 minutes 18 of
  the 19 lessons split at `wrapAt` over two days (§9.4). These are authored estimates, not measured use.
- **Every app surface of the wave is real**: Today, `/session` (focus route), the lesson and checkpoint players with
  every answer widget except staff writing, the drill runner and Practice, Studio and the Toolbox (with the unlock
  moment), the Oak (tree, course, leaves), the tutor panel (hint ladder, explain, chat, listening notes, reviews,
  cards with Apply), onboarding and Settings → Voice/Audio/Tutor, the capstone screen, release and the album.
- **Tutor.** Through the fake backend in every suite; live through the `claude-cli` backend (the gate's three
  turns: a rung-1 hint on U01.L02 S5 that did not leak the solution, a chat turn that called
  `get_learner_progress` and `propose_code`, a listening note), see `docs/decisions.md`, Gate results.
- **Server**: every endpoint of §4 is built (no 501 is left); the robustness review's 120–200-day randomised
  simulation over HTTP (`server/src/property.test.ts`), adversarial endpoint walk and data-integrity tests pass.
- **SRS** (contracts §7.4): warm-up within budget, at most 12 active families, review day p95 ≤ 12 min and oldest
  undelivered due card p95 ≤ 7 days all hold on every seed and target of the 300-day simulation.

**Known gaps** (none is hidden behind a passing test)

1. **SRS "deferred queue p95 ≤ 4 cards"** is still not met (3–14 by target and seed); it stays a `test.failing` with
   the measured values in `packages/srs/src/simulation.test.ts`. The proposed amendment (bound how long a deferred
   family waits, not how many wait) is a contracts change.
2. **Staff writing** (`staff-input`) has no staff widget: the lesson host offers a typed note list (`C4:4 E4:4`) so
   U02.L04's notation step is not a dead end. The real widget is Wave 3.
3. **Today's "done for today"** lives in the browser's localStorage (the session store), not on the server; another
   browser shows a fresh day.
4. **No idempotency keys** on `steps.attempt` and `srs.review` (a double submit from two tabs counts twice; one tab
   is guarded in the UI), and no single-open-session rule (two tabs can each start a session).
5. **The learner day is not monotonic** across a time-zone change or a clock stepped back; streak and mastery
   tolerate it, nothing reconciles it.
6. **`.bank("jazzkit")`** is an alias of the default acoustic kit (uzu-drumkit), not a brushes-and-ride kit;
   `packages/strudel/audibility.json` still lists `snd.jazzkit: false` (not regenerated).
7. **Grader**: `rhythm: "exact"` in the events matcher also compares durations (content uses `"onsets"` for drums).
   The catalog's `id.wrong` says "Listen to both", which content overrides on fact and staff-reading steps.
8. **The app's `playSettled` / clock-settled `done` workarounds** for single-note plans are redundant now that
   `@oak/strudel` resolves `done` itself; they were left in place.
9. **Content follow-ups**: U01.L03 S5's third authored hint quotes part of the solution (the tutor's leak guard
   rates solution literals at rung 4); a learner who hums during the quiet check gets a high noise floor and later
   "Oak didn't hear a voice" with no suggestion to re-run the check; the Make's sketch title defaults to the lesson
   title while U00.L02's heading says "Sketch 002"; onboarding's content column changes width between screens; the
   kit's ghost buttons ("Ask Claude", "Wrap up") read like plain text.
10. **Later course**: lessons from U03, 15 capstone briefs without tests (C2–C7, CF-A, JC1–4, RC1–2, AC1–2) and the
    Transcription Gym (`/transcribe/$projectId` is still a `WavePlaceholder`; Today offers it only after U07.L01).
11. **Only the learner can close**: the ten-day trial (median real session within budget) and the listening pass on
    instruments (`/dev/listen`).

**Status: binding for Wave 2 Build; the "Wave 2 state" section above is the summary at the final gate.** Written in the Foundation phase (2026-11-11). Ranks below `contracts.md` and `interfaces.md`, above everything else. It records who owns what, the app-internal contracts between builders (copied from the code; when this file and the code disagree, the code is right and this file has a bug), the API additions, the dev ports, the fake tutor and the definition of done.

Goal of the wave: the learner opens the app, goes through onboarding, and does real daily sessions (warm-up drills → new lesson → make → coda) through units U00–U02 with capstones C0 and C1, the Claude tutor docked beside them.

## 1. Ownership (Build phase)

Each engineer owns exactly these paths (verbatim from the wave plan):

- lesson      : app/src/lesson/**, app/src/routes/learn/**, app/src/routes/checkpoint/**            (ports vite 5201 / api 8801)
- answers     : app/src/answers/**                                                                    (5202 / 8802)
- drills-ui   : app/src/drills/**, app/src/routes/practice/**                                         (5203 / 8803)
- drills-engine: packages/drills/**, packages/srs/**, content/families.ts, content/decks/** (fact decks) (no browser)
- session     : app/src/session/**, app/src/routes/index.tsx, app/src/routes/session/**, app/src/routes/progress.tsx (5205 / 8805)
- studio      : app/src/studio/**, app/src/toolbox/**, app/src/routes/studio/**, app/src/routes/toolbox/**, app/src/workbench/** (additive only) (5206 / 8806)
- map         : app/src/map/**, app/src/routes/oak.tsx, app/src/routes/dev/**                         (5207 / 8807)
- tutor-ui    : app/src/tutor/**, app/src/ui/shell/TutorPanel.tsx, app/src/lib/tutor-stream.ts, app/src/routes/settings/tutor.tsx (5208 / 8808)
- onboarding  : app/src/onboarding/**, app/src/voice/**, app/src/routes/onboarding/**, app/src/routes/settings_.voice.setup.tsx, app/src/routes/settings/voice.tsx, app/src/routes/settings/audio.tsx (5209 / 8809)
- capstone    : app/src/capstone/**, app/src/album/**, app/src/routes/capstone/**, app/src/routes/album/**, app/src/ui/AlbumCover.tsx (5210 / 8810)
- server      : server/** except server/src/tutor/**; packages/api/** (additive); scripts/** except scripts/content/** (api 8811)
- author:U00  : content/core/U00/**, the C0 and C1 entries/briefs (content/capstones.ts and any capstone folder AUTHORING.md names), the U01.CP and U02.CP items (content/checkpoints.ts and any checkpoint folder AUTHORING.md names), content/bands/** — the only author allowed to edit those two registry files
- author:U01a : content/core/U01/L02 … L05      - author:U01b : content/core/U01/L06 … L09
- author:U02a : content/core/U02/L02 … L05      - author:U02b : content/core/U02/L06 … L08
- (U01.L01 and U02.L01 are the exemplar lessons written in Foundation by the content lead; content registries — syllabus/skills/toolbox/terms/glossary/candos/flavours/repertoire — and scripts/content/** are frozen during Build: authors request changes via apiNotes.)

Foundation (this document's author) used **5200 / 8800** for the kit gallery suite (`app/src/ui/kit/e2e`). Nobody else uses those ports.

Files Foundation created inside an owner's folder are that owner's from now on; keep their exported signatures (others code against them) and extend freely:

| Owner | Seam files already there |
|---|---|
| answers | `app/src/answers/types.ts`, `response.ts` (+ test) |
| lesson | `app/src/lesson/types.ts`, `public.ts` (+ test) |
| session | `app/src/session/types.ts`, `store.ts` (+ test) |
| tutor-ui | `app/src/tutor/context.ts` (+ test), `use-tutor-bridge.ts` |
| map | `app/src/routes/dev/kit.tsx`, `dev/-components/KitGallery.tsx` (the kit gallery; keep it working) |

## 2. Ports, environment, one stack per area

| Variable | Read by | Default | Meaning |
|---|---|---|---|
| `OAK_PORT` | server (`config.ts`) | 8787 | The Oak server's port (127.0.0.1 only). |
| `OAK_DEV` | server | unset | `1`: `/api/dev/*`, response validation, and (new) **any loopback port** is an allowed Host/Origin. |
| `OAK_VITE_PORT` | Vite (`app/vite.config.ts`) and server | 5173 | Vite's port. The server adds it to the tutor routes' own allow-list (`config.devPorts = [5173, OAK_VITE_PORT]`). |
| `OAK_API_PORT` | Vite | 8787 | The server Vite proxies `/api` and `/sounds` to. |
| `OAK_DATA_DIR` | server | `~/.oak` | Data dir. Tests and e2e always use a throwaway one. |
| `OAK_TUTOR_FAKE` | server | unset | `1` **with** `OAK_DEV=1`: the scripted fake tutor backend (§5). Ignored without `OAK_DEV=1`. |

- Security (`server/src/security.ts`): in dev, `isAllowedHost` / `isAllowedOrigin` accept `127.0.0.1:<port>` and `localhost:<port>` for any port 1–65535 (`http://` origins only; never another loopback address, a suffix, a path or https). Production (`OAK_DEV` unset) keeps the exact list: the server's own port. Tested in `security.test.ts` ("in dev any loopback port is allowed …").
- Vite gives a non-default port its own dependency cache, `app/.vite-cache-<port>/` (gitignored). The first start on a new port pre-bundles the dependencies (allow ~30 s); later starts are fast.
- **One stack per area**: `e2e/support/stack.ts`.

```ts
export interface StackOptions {
  vitePort: number;
  apiPort: number;
  /** A folder name under `test-results/stacks/`: the server's `OAK_DATA_DIR`, wiped at every start. */
  dataDirName: string;
  /** Extra environment for the Oak server, e.g. `{ OAK_TUTOR_FAKE: "1" }`. */
  extraEnv?: Record<string, string>;
  /** Run `bun scripts/content/build.ts` before Vite starts. Default false. */
  buildContent?: boolean;
}
export interface OakStack { baseURL: string; apiURL: string; dataDir: string; outputDir: string; webServer: WebServer[] }
export function oakStack(o: StackOptions): OakStack;
export function stackUse(stack: OakStack, extra?: Use): Use;   // baseURL, chromium, 1440×900, autoplay, traces
export const SCREENSHOT_MATRIX: readonly { theme: "paper" | "bark"; width: number; height: number }[]; // 4 entries
export const REPO_ROOT: string;
```

`e2e/support/ui.ts`:

```ts
export const PREFS_KEY = "oak.ui.v1";
/** Theme (and motion) before first paint, for every load of `page`. Call before `goto`. */
export async function useUiPrefs(page: Page, prefs: { theme: "paper" | "bark"; motion?: "on" | "off" | "system" }): Promise<void>;
/** Screenshots `#main` one screen at a time (the shell scrolls inside <main>, so `fullPage` would show one screen). */
export async function shoot(page: Page, dir: string, name: string, theme: string): Promise<string[]>;
```

**Your config is five lines** (`app/src/<area>/e2e/playwright.config.ts`; the worked example is `app/src/ui/kit/e2e/playwright.config.ts`):

```ts
import { defineConfig } from "@playwright/test";
import { oakStack, stackUse } from "../../../../e2e/support/stack.ts";
const stack = oakStack({ vitePort: 5203, apiPort: 8803, dataDirName: "drills", extraEnv: { OAK_TUTOR_FAKE: "1" } });
export default defineConfig({ testDir: ".", testMatch: /.*\.pw\.ts$/, workers: 1, timeout: 90_000,
  outputDir: stack.outputDir, webServer: stack.webServer, use: stackUse(stack) });
```

Run it with `bunx playwright test -c app/src/<area>/e2e/playwright.config.ts`. Playwright starts both servers, wipes the data dir, and stops both when the run ends (`reuseExistingServer: false`: a server already on your port fails the run rather than testing someone else's stack). Screenshots go to `app/src/<area>/e2e/screenshots/` (gitignored by `app/.gitignore`). Verified: the kit suite and a second copy on 5298/8898 ran at the same time, both green, all four servers stopped afterwards.

Things that are shared and therefore careful:

- `content/.generated/` is written by `bun run content:build`. Do not pass `buildContent: true` in parallel runs; the content lead keeps it built. If you see stale lesson data, run `bun run content:build` once.
- `app/src/routeTree.gen.ts` is regenerated by the router plugin whenever any Vite runs. Adding a route file is fine; the next Vite run rewrites the tree with every route present. Run your Vite once after adding a route so `tsc` sees it.
- The root `playwright.config.ts` (`bun run e2e`) runs every suite as a project (integration, §9): the platform suites on 5173/8787/8790, the package suites on 5191–5193, each area on its own pair above, the gate journey on 5212/8812 (+ its production server on 8792), and the review suites `review` (5221/8821) and `ui-review` (5222/8822). `bunx playwright test --project <area>` starts only that area's servers. Each area config exports `area` (`Area`, `e2e/support/stack.ts`) and `default areaConfig(area)`.

## 3. App-internal contracts (copied from the code)

### 3.1 AnswerWidget — `app/src/answers/types.ts`, `response.ts` (answers owns)

```ts
export type AnswerSpec =
  | AnswerUi                                      // contracts §5.4: choice, degree-pad, quality-pad, rn-palette, text, number,
                                                  // keyboard, staff-input, grid, code, tap, mic, bar-buttons, click-code|staff|roll
  | { ui: "order"; blocks: ParsonsBlock[]; distractors: ParsonsBlock[]; assemble: ParsonsEx["assemble"] }
  | { ui: "blanks"; starter: string; blanks: BlankSpec[] }
  | { ui: "hum"; bars: number; track?: TrackRef };
export type AnswerKind = AnswerSpec["ui"];
export type AnswerSpecOf<K extends AnswerKind> = Extract<AnswerSpec, { ui: K }>;

export interface AnswerValueMap {
  choice: string[];  "degree-pad": Degree[];  "quality-pad": ChordQuality[];  "rn-palette": string[];
  text: string;  number: number | null;  keyboard: number[];  "staff-input": string;  grid: boolean[][];
  code: string;  tap: number[];  mic: SungSummary[];  "bar-buttons": number[];  "click-code": CodeRange | null;
  "click-staff": string | null;  "click-roll": string | null;  order: string[];  blanks: Record<string, string>;
  hum: SungSummary[];
}
export type AnswerValue<K extends AnswerKind = AnswerKind> = AnswerValueMap[K];
export interface SungSummary { midi: number | null; cents: number | null; credit: number }

export interface PartMark { part: number | string; ok: boolean; note?: string }
export type AnswerFeedback =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "correct"; marks?: PartMark[] }
  | { state: "wrong"; marks?: PartMark[]; message?: Md }
  | { state: "revealed"; correct: AnswerValue; marks?: PartMark[] };

export interface AnswerWidgetProps<K extends AnswerKind = AnswerKind> {
  spec: AnswerSpecOf<K>;
  value: AnswerValue<K>;
  onChange(next: AnswerValue<K>): void;
  onSubmit(): void;
  disabled?: boolean;
  feedback: AnswerFeedback;
  autoFocus?: boolean;
  label: string;
  rung?: HintRung;
  audition?(code: string): void;
  solfege?: "numbers" | "syllables";
  idBase: string;
}
export type AnswerWidget<K extends AnswerKind = AnswerKind> = ComponentType<AnswerWidgetProps<K>>;
export type AnswerWidgetFor = <K extends AnswerKind>(spec: AnswerSpecOf<K>) => AnswerWidget<K> | null;
export const ANSWER_KEYS: { submit: "Enter"; pick: "1"…"9"; chromatic: "A W S E D F T G Y H U J K"; clear: "Backspace"; move: arrows; tap: ["Space", "F", "J"] };
export const AUTO_SUBMIT_KINDS: readonly AnswerKind[]; // choice, degree-pad, quality-pad (drills only)

// response.ts (pure, tested)
export function emptyValue<K extends AnswerKind>(spec: AnswerSpecOf<K>): AnswerValue<K>;
export function isComplete(spec: AnswerSpec, value: AnswerValue): boolean;
export function responseOf(spec: AnswerSpec, value: AnswerValue): AttemptResponse;
export function slotCount(spec: AnswerSpec): number;
export function gridSteps(spec: AnswerSpecOf<"grid">): number;
```

Rules: controlled; a widget never grades and never calls the API; `onSubmit` is the learner's Check (Enter); `feedback` is shown, not computed, and never reveals more than the host's rung allows; keys only while focus is inside the widget and never `Space` except a tap pad (`data-keyscope="tap"`). The registry lives in `app/src/answers/registry.tsx` as `export const answerWidgetFor: AnswerWidgetFor`. Text answers are sent as typed (`responseOf` trims); the grader normalises (`@oak/theory` `normalizeText`), a widget may show a "reads as" preview with the same function. Grid cells go out as choice IDs (`"0"`, `"6"` for one row, as `@oak/drills` rhythm dictation expects; `"kick:0"` with several rows). Staff input goes out as the staff text; the lesson host converts it to `NEvent[]` for the grader.

### 3.2 Lesson player — `app/src/lesson/types.ts`, `public.ts` (lesson owns)

```ts
export interface StepHostProps {
  lesson: LessonDef; step: StepDef; index: number; total: number;
  state: StepState | null; params: Record<string, number | string>;
  target: TargetMinutes; sessionId: string | null; review: boolean;
}
export interface StepCallbacks {
  onCheck(input: { response: AttemptResponse; result: GradeResult; extraReplays: number }): void;
  onHint(reveal: boolean): void;
  onNewSeries(): void;
  onContinue(): void;
  onCode(code: string): void;
}
export interface ExerciseRendererProps<K extends ExerciseKind = ExerciseKind> extends StepHostProps, StepCallbacks {
  exercise: ExerciseOf<K>; lastResult: GradeResult | null; checking: boolean; answerWidgetFor: AnswerWidgetFor;
}
export type ExerciseRenderer<K extends ExerciseKind = ExerciseKind> = ComponentType<ExerciseRendererProps<K>>;
export interface ProseStepProps extends StepHostProps { onContinue(): void }
export type RendererFor = <K extends ExerciseKind>(kind: K) => ExerciseRenderer<K> | null;  // app/src/lesson/renderers.tsx

export type LessonStatus = "loading" | "step" | "checking" | "make" | "wrapping" | "complete" | "error";
export interface LessonSnapshot {
  lessonId: string; lessonVersion: number; title: string; status: LessonStatus;
  stepId: string; stepIndex: number; stepKind: StepKind; graded: boolean; passed: boolean;
  code: string | null; lastResult: GradeResult | null; rung: HintRung; attempts: number; splitPart: "A" | "B" | null;
}
export type LessonEvent =
  | { type: "LOADED"; lesson: LessonDef; resumeStep: string | null; splitPart: "A" | "B" | null }
  | { type: "GOTO"; stepId: string } | { type: "CODE"; code: string } | { type: "CHECK" }
  | { type: "GRADED"; result: GradeResult; attempt: StepAttemptResult } | { type: "HINT"; reveal: boolean }
  | { type: "STATE"; state: StepState } | { type: "CONTINUE" }
  | { type: "WRAP_UP" }                                   // external: the session's Wrap up
  | { type: "APPLY_CARD"; code: string; cardId: string }  // external: the tutor applied a card
  | { type: "COMPLETED"; sketchId: string } | { type: "FAILED"; message: string };

// public.ts
export const useLessonPublic: UseBoundStore<{ lesson: LessonSnapshot | null }>;
export function publishLesson(lesson: LessonSnapshot): void;
export function clearLesson(lessonId?: string): void;
export function lessonSubject(l: LessonSnapshot): TutorSubject;
```

The player publishes a snapshot on every change and calls `setSubject(lessonSubject(snapshot))` / `patchSubject` (§3.4); it reports its block with `reportBlockDone` (§3.3). The hint rung lives on the server only (`steps.hint`); a renderer never computes it.

### 3.3 Session — `app/src/session/types.ts`, `store.ts` (session owns)

```ts
export const SESSION_BLOCKS = ["warmup", "new", "make", "coda"] as const;
export type SessionBlock = (typeof SESSION_BLOCKS)[number];
export type SessionPhaseKey = "warmup" | "main" | "make" | "coda";
export interface BlockBudget { warmup: number; new: number; make: number; coda: number }

export type BlockReport =
  | { block: "warmup"; source: "drills"; warmupItemId: string; drillSessionId: string | null; meanCredit: number | null; skipped?: boolean }
  | { block: "new"; source: "lesson" | "checkpoint" | "capstone" | "gym" | "light"; itemId: string; completed: boolean; resumeStep?: string | null }
  | { block: "make"; source: "lesson" | "quick-sketch" | "checkpoint" | "capstone"; sketchId: string }
  | { block: "coda"; source: "coda" };
export type WrapState = "none" | "offered" | "kept-going" | "wrapping";

export interface SessionState {
  plan: SessionPlan | null; session: Session | null; block: SessionBlock | null; warmupIndex: number;
  reports: BlockReport[]; activeMs: number; phaseMs: Record<SessionPhaseKey, number>;
  wrap: WrapState; wrappedEarly: boolean; paused: boolean;
}
export interface SessionApi extends SessionState {
  begin(plan: SessionPlan, session: Session): void; tick(ms: number): void; enter(block: SessionBlock): void;
  reportBlockDone(report: BlockReport): void; wrapUp(): void; keepGoing(): void; pause(): void; resume(): void; reset(): void;
}

// store.ts (pure reducer + zustand; tested)
export const useSession: UseBoundStore<SessionApi>;
export function reportBlockDone(report: BlockReport): void;    // no-op outside a session
export function currentSessionId(): string | null;             // send with attempts, drill sessions, sketches
export function sessionReducer(state: SessionState, ev: SessionEvent): SessionState;
export function blockBudget(kind: SessionPlan["kind"], target: TargetMinutes): BlockBudget;  // contracts §9.1
export function firstBlock(plan: SessionPlan): SessionBlock;
export function nextBlock(block: SessionBlock, plan: SessionPlan): SessionBlock | null;
export function wrapAtMs(plan: Pick<SessionPlan, "kind" | "targetMinutes">): number;
export function sessionEndBody(state: SessionState): SessionEndBody;   // body of POST /session/:id/end
export function blockMinutesLeft(state: SessionState): number | null;
export function phaseOf(block: SessionBlock): SessionPhaseKey;
export const IDLE_CUTOFF_MS = 60_000;
```

How surfaces report back: a block surface calls `reportBlockDone(...)` when its block ends (the drill runner after each warm-up set; the lesson player when it reaches the Make and when the Make's sketch is saved; the Quick sketch; the Coda's "Done for today"). The store advances (warm-up item by item → new → make → coda; capstone and gym days skip the separate Make; a New block reported `completed: false` goes to the Make, i.e. the Quick sketch) and the session engineer's runner navigates. A surface never navigates to the next block itself and never starts the next lesson (contracts §9.3). Outside a session (free practice, replays) `reportBlockDone` is a no-op, so no branch is needed. At the target the store sets `wrap: "offered"` once; the runner shows the non-modal line (kit `Callout`), `wrapUp()` jumps to the Quick sketch before the Make (`wrappedEarly`), `keepGoing()` is always allowed.

### 3.4 Tutor subject and imperative API — `app/src/tutor/context.ts` (tutor-ui owns)

```ts
export interface ContextChip { id: "step" | "code" | "result" | "hints" | "selection" | "sketch" | "capstone" | "track" | "transcription"; label: string }
export interface TutorSubject {
  thread: SubjectRef; title: string; tutorOpen: boolean;
  lessonId?: string; stepId?: string; graded?: boolean; passed?: boolean;
  code?: string | null; lastResult?: GradeResult | null; rung?: HintRung; selection?: string | null;
  sketchId?: string; capstoneId?: string;
}
export interface TutorAsk { id: number; kind: ThreadKind; request: TutorTurnRequest; label: string; at: number }
export type TutorAvailability = "unknown" | "ready" | "off";
export interface TutorNotice { kind: "off" | "closed" | "no-subject"; message: string }
export type AskResult = { ok: true; ask: TutorAsk } | { ok: false; notice: TutorNotice };

export const useTutorContext: UseBoundStore<{ subject; availability; offReason; queue: TutorAsk[]; notice; openRequests }>;
export function setSubject(subject: TutorSubject): void;
export function patchSubject(thread: SubjectRef, patch: Partial<Omit<TutorSubject, "thread">>): void;
export function clearSubject(thread?: SubjectRef): void;
export const GENERAL_SUBJECT: TutorSubject;
export function chipsOf(s: TutorSubject): ContextChip[];
export function setAvailability(health: Pick<Health, "tutor" | "tutorBackend"> | null): void;
export function openTutor(): void;
export function takeAsk(): TutorAsk | null;          // the panel consumes queued asks
export function dismissNotice(): void;
export function buildTurnRequest(subject: TutorSubject, kind: ThreadKind, userText: string): TutorTurnRequest;
export function askHint(text?: string): AskResult;    // graded, unpassed step only
export function askExplain(text?: string): AskResult;
export function askChat(text: string): AskResult;
export function askListeningNote(sketch: { sketchId: string; title: string; code: string }): AskResult;
export function askReview(capstone: { capstoneId: string; title: string; code: string; note?: string }): AskResult;
export function gradeSnapshotOf(result: GradeResult, render?: (d: Diagnostic) => string): GradeSnapshot;
```

`useTutorBridge()` (`app/src/tutor/use-tutor-bridge.ts`, mounted once in `AppShell`) feeds `/api/health` into `setAvailability` and turns `openTutor()` into the docked panel (L) or the drawer (M). Every surface sets its subject on mount and clears it on unmount (`clearSubject(thread)`): Studio `sketch`, capstone `capstone`, album track `track`, Practice `drill` with `tutorOpen: false` during trials, checkpoint `checkpoint` with `tutorOpen: false` until the debrief. When the tutor is off, or the subject has it closed, every `ask*` returns `{ ok: false }`, queues nothing and sets `notice` (the panel shows it; the panel also opens so the learner sees why). Nothing in `context.ts` streams: the panel takes asks with `takeAsk()` and runs them with `runTutorTurn` (`app/src/lib/tutor-stream.ts`).

### 3.5 Telemetry — `app/src/lib/telemetry.ts` (frozen shared)

```ts
export class ActivityClock { constructor(now?: () => number, idleMs?: number); activity(): void; setVisible(v: boolean): void; peek(): number; take(): number }
export interface Telemetry { logStep(row: StepTelemetry): void; logBlock(beat: { sessionId: string } & Heartbeat): void; flush(): Promise<void>; pending(): number }
export function createTelemetry(deps: TelemetryDeps): Telemetry;
export const telemetry: Telemetry;
export const logStep: (row: StepTelemetry) => void;      // one step_telemetry row per step left (batched, ≤ 200 per POST)
export const logBlock: (beat: { sessionId: string; phase; activeMs; stepId }) => void;  // session.heartbeat, ≤ 1 per 30 s, at once on a phase/step change
export const IDLE_MS = 60_000, HEARTBEAT_MS = 30_000, FLUSH_MS = 15_000, MAX_BATCH = 200;
```

Use one `ActivityClock` per measured thing (a step, the session); feed it `activity()` on key/pointer input and while audio plays; `take()` for deltas into `useSession.tick(ms)`.

### 3.6 Query hooks — `app/src/lib/queries.ts` (frozen shared)

Existing hooks cover every Wave 1 endpoint (interfaces §6). Added: `useSessionSummary(id)`, `useLessonSteps(id)`, `useLessonPosition()`, `useCapstoneRelease()`, `useNextUnlocks()`, `useRevive(skillId?, more?)`, `useOnboarding()`, `useOnboardingUpdate()`, `useCalibrations(kind?)`, `useTutorStatus(refresh?)`, `useDevListen()`, `useDevListenMark()`. A hook you need and that does not exist: write it in your own folder with `apiQuery`/`useApiMutation` (both exported) and report it for promotion.

### 3.7 UI kit additions — `app/src/ui/kit` (frozen shared)

Already there: `Button`, `IconButton`, `Card`, `CardHeader`, `Chip`, `Kbd`, `EmptyState`, `Skeleton`, `Progress`, `StepRail`, `PageHeader`, `Page`, `Tabs`, `Dialog`, `Drawer`, `Toast`/`toast`, `Tooltip`, `QueryView`/`ErrorState`/`LoadingState`, `Section`/`Field`/`Switch`/`Select`/`Slider` (now exported from `index.ts` too). Added:

```ts
export function ProgressRing(p: { value: number; max?: number; size?: number; stroke?: number; label: string; tone?: "accent" | "amber"; children?: ReactNode; className?: string }): JSX.Element;
export function Meter(p: { value: number; min?: number; max?: number; label: string; valueText: string; tone?: "accent" | "amber" | "neutral"; ticks?: { at: number; label: string }[]; className?: string }): JSX.Element;
export function MicLevelMeter(p: { level: number; floor?: number | null; clipping?: boolean; live: boolean; label?: string; segments?: number; className?: string }): JSX.Element;
export function dbToLevel(db: number, floorDb?: number): number;
export function SegmentedControl<V extends string>(p: { label: string; value: V; options: readonly SegmentOption<V>[]; onChange(v: V): void; size?: "sm" | "md"; className?: string }): JSX.Element;
export function Stepper(p: { id: string; label: string; value: number; min: number; max: number; step?: number; onChange(v: number): void; format?: (v: number) => string; describedBy?: string; disabled?: boolean }): JSX.Element;
export function Callout(p: { tone?: "info" | "success" | "attention" | "issue"; title: ReactNode; children?: ReactNode; actions?: ReactNode; onDismiss?: () => void; className?: string }): JSX.Element;
```

`ErrorState` now says "Not built yet" for a 501. See them all at **`/dev/kit`** (both themes; `app/src/ui/kit/e2e/kit.pw.ts` screenshots 1440×900 and 1280×800 in Paper and Bark).

## 4. API additions (packages/api, additive)

Each is a contract entry with a zod DTO in `packages/api/src/{contract,dto,tutor}.ts`. Until the server engineer implements it, the server answers a **typed 501** (`{ error: { code: "not_implemented" } }`, `OakApiError.code === "not_implemented"`, never retried by Query); the stubs are registered in the route file named below, and `WAVE2_ENDPOINTS` lists them (`routes.test.ts` checks every one answers 501 until built — the server engineer removes a name from the test's expectation as each handler lands).

| Name | Method · path (under `/api`) | Body / query | Response | Route file | Needed by |
|---|---|---|---|---|---|
| `session.summary` | GET `/session/:id/summary` | | `SessionSummarySchema` | course.ts | Coda after a reload |
| `lessons.steps` | GET `/lessons/:id/steps` | | `LessonStepsSchema` `{ lessonId, progress: LessonProgress \| null, steps: StepState[] }` | course.ts | step rail, resume |
| `lessons.position` | PUT `/lessons/:id/position` | `LessonPositionSchema` `{ sessionId, stepId, splitPart, wrapped }` | `LessonProgressSchema` | course.ts | pause/resume at a step, "Wrap up" (§9.3, §9.4) |
| `capstones.release` | POST `/capstones/:id/release` | `CapstoneReleaseSchema` `{ sessionId, sketchId, sketchVersion, title, flavour, linerNotesMd, theoryTags, includeReviewNote }` | `CapstoneReleaseResultSchema` `{ state, track, unlocks, canDo, streak }` | course.ts | capstone release to the album |
| `unlocks.next` | GET `/unlocks/next` | | `{ items: NextUnlock[] }`, `NextUnlock = { itemId, kind, grantedBy, remaining, remainingKind }` | practice.ts | Today's NextUnlockCard, Coda goal gradient |
| `skills.revive` | GET `/skills/revive` | `?skillId=&more=1` | `DueBatchSchema` | practice.ts | the map's Revive / Revive more (§7.10) |
| `onboarding.get` | GET `/onboarding` | | `OnboardingStateSchema` `{ step, completed, skipped, firstEdit, sketchId, startedAt, finishedAt }` | meta.ts | onboarding resume |
| `onboarding.put` | PUT `/onboarding` | `OnboardingPatchSchema` (partial `{ step, completed, skipped, firstEdit, sketchId, finished }`) | `OnboardingStateSchema` | meta.ts | onboarding; `finished: true` also sets `profile.onboardedAt` |
| `profile.calibrations` | GET `/profile/calibrations` | `?kind=` | `{ items: CalibrationRecord[] }` newest first | meta.ts | Settings → Voice/Audio last results |
| `tutor.status` | GET `/tutor/status` | `?refresh=1` | `TutorStatusSchema` | served by the tutor service (no stub) | Settings → Tutor |
| `dev.listen` | GET `/dev/listen` (dev) | | `{ items: ListenMark[] }` | ops.ts | /dev/listen verdicts (replaces localStorage) |
| `dev.listenMark` | PUT `/dev/listen/:ref` (dev) | `ListenMarkCreateSchema` `{ hash, verdict, note }` | `ListenMarkSchema` | ops.ts | /dev/listen |

Also: `ApiErrorBody.error.code` gains `not_implemented` (501); `ONBOARDING_STEPS` = `welcome loop edit react tutor headphones mic latency range first-sing prefs sketch coda` (ux §8); `LISTEN_VERDICTS` = the five verdicts of /dev/listen.

Walked and found already covered (no addition): Today plan, session start/heartbeat/end, warm (`tutor.warm`), step state/attempt/hint/reveal (`steps.hint` with `reveal: true`)/new series/complete (with `splitPart` for the 15-minute split), checkpoint start (the server returns the pending attempt or composes a new one) and submit, drill start/trials/finish, due queue, SRS review, capstone get/check/completeSession, album track/versions/audio, sketches/versions/listening note (`sketches.patch` `listeningNote` + `tutor.note`), toolbox and unlock events (`unlocks.list`/`seen`; the catalog is content), skill map shading, progress, streak with rest days (`settings.pausedWeeks`) and repair (`StreakSummary.repair`), can-do ledger, calibration results (`profile.calibration`), vocal range (profile), settings, step telemetry, QA reports.

## 5. The fake tutor (`OAK_DEV=1 OAK_TUTOR_FAKE=1`)

`server/src/tutor-adapters/fake-backend.ts` implements the tutor's `TutorBackend` (read-only use of `server/src/tutor`); `tutor-wiring.ts` builds the real tutor service and routes over it instead of the API and CLI backends. Only the model is replaced: threads, the rung advance, redaction, card lint and 4-bar validation, review validation, the SSE framing and `meta`/`done`/`error` are the production code. Health reports `tutor: "ready"`, `tutorBackend: "claude-cli"` (usage reads "included in your Claude plan"; no dollar figures). Setting Settings → Tutor to `off` turns it off, which is how to test the "tutor is off" states.

By request kind (default, no marker): `chat` streams thinking, then a short answer with music tokens; `hint` reads the rung from the context (`hint_rung: N of 4`) and answers differently at rungs 1, 2 and 3, never revealing; `explain` explains a bracket error; `listening` is a 3-sentence note citing bars and degrees and ending in a question; `review-capstone` / `review-transcription` deliver a review that passes Oak's validator (it resubmits like a model when told the revision count or the piece length). Every turn emits `status` lines and ~40 ms between chunks.

Markers in the learner's text (any case; combinable):

| Marker | Effect |
|---|---|
| `#card` | adds a `propose_code` card (4 bars in C major: bass 1-4-5-1 under a melody that outlines each chord; verified with headless Strudel). Oak validates it; it shows as a preview where the subject forbids Apply. |
| `#tool` | calls `get_learner_progress` first (`tool_start` + `tool_result`) |
| `#think` | streams thinking deltas (chat does anyway) |
| `#slow` | one word every 250 ms for ~20 s: test Stop / cancel (`Esc`) |
| `#error` | ends with an `error` event of kind `rate_limit` (`retryAfterSec: 20`); `#error:<kind>` picks any `TutorErrorKind` (`overloaded`, `auth`, `network`, …) |
| `#reveal` | one sentence and the `[[reveal]]` token |
| `#long` | a long markdown answer using every music token kind (`deg rn note chord bars tool term`) |
| `#empty` | no text at all, only `done` |

Never call the real `claude` CLI or any API. A review needs a real review source (a capstone with a saved draft), as in production.

## 6. What is frozen

After Foundation, import from these and never edit them; put what you need in your own folder and report under `apiNotes` anything that should be promoted:

- `app/src/lib/**` (except `tutor-stream.ts`, tutor-ui's), `app/src/ui/kit/**`, `app/src/ui/shell/**` (except `TutorPanel.tsx`, tutor-ui's), `app/src/main.tsx`, `app/src/router.tsx`, `app/src/routes/__root.tsx`, `app/vite.config.ts`, `app/index.html`, `app/public/**`.
- `e2e/support/**`, root `playwright.config.ts`, root `package.json`, `bun.lock`, `bunfig.toml`, `biome.json`, root `tsconfig*.json`, `node_modules`.
- `docs/design/contracts.md`; `server/src/tutor/**` (the tutor core, finished).
- Content registries and `scripts/content/**` (content lead), as §1 says.
- `packages/api/**` is additive-only and belongs to the server engineer during Build; other areas request additions under `apiNotes`.

## 7. Workflow rules

- Never `bun install`/`bun add`, `git commit`/`stash`/`reset`/`checkout`. Stop every server you start; never kill a process you did not start (no `pkill` by name — other stacks are running).
- Vite on Node: `node node_modules/vite/bin/vite.js`, never `bunx --bun vite`.
- Logic tests `*.test.ts` next to the code: `bun test --isolate <your folder>`. Browser tests `*.pw.ts` in `<your folder>/e2e/` with your own config (§2).
- Typecheck: `bunx tsc --noEmit -p app/tsconfig.json` (app, excluding `routes/dev` and tests), `tsconfig.app.json` (app with every package and content), `tsconfig.server.json`; before finishing `bun run typecheck` and `bunx biome check --write <your paths>`. Failures in another engineer's unfinished paths are reported, not fixed.
- Music claims and examples are verified with headless Strudel (`import { evalHeadless, midisOf } from "@oak/grader/testing"`; `evalHeadless(code, bars)` returns sorted events with MIDI) or `bun run theory …`.

## 8. Definition of done for a surface

1. **Real data, every state.** Loading (kit `Skeleton`/`LoadingState`), empty (`EmptyState` with the next action), error (`ErrorState` with retry; 501 reads "Not built yet"), offline server, tutor off, Quiet mode / no mic where relevant. No placeholder copy, no lorem, no dead buttons, no `WavePlaceholder` left on your surface.
2. **The next action is obvious** and progress is visible (ux §1); copy is calm, adult, precise, never cute or shaming (ux §7.11); no banned patterns (ux §1.6: no loss framing, countdowns, red streak states).
3. **Keyboard-only**: every action reachable and operable; visible focus; the keys of ux §7.10 that your surface lists work and appear in the shortcut sheet; `Esc` closes overlays; focus lands somewhere sensible after each transition.
4. **Both themes and both sizes**: Playwright screenshots at 1440×900 and 1280×800 in Paper and Bark (`SCREENSHOT_MATRIX`, `useUiPrefs`, `shoot`), saved under `<your folder>/e2e/screenshots/`, **read and fixed** (alignment, overflow, contrast, focus rings). At 1280×800 every primary action is visible without scrolling with the tutor drawer closed (ux §10.11). No horizontal overflow.
5. **Reduced motion**: with `prefers-reduced-motion` (or Settings → Appearance) nothing transforms for longer than 120 ms; content appears at once.
6. **Tests**: logic in `*.test.ts` (pure functions, reducers, machines), behaviour in `*.pw.ts` on your own stack, including a keyboard-only path and the tutor through the fake backend where the surface talks to it. A spec that runs broken learner code allows Strudel's one `console.error`.
7. **Seams kept**: you only edited your paths; you used the contracts of §3 as written; anything you needed from shared code is in your folder and listed in `apiNotes`.
8. **Green**: `bun test --isolate <your paths>`, your Playwright suite, `bun run typecheck`, `bunx biome check <your paths>`.

## 9. Integration (end of Wave 2)

All builders finished; the integration pass joined their areas into one app. This section supersedes the
"until …" notes above where they differ.

**Seams resolved**

| Seam | Now |
|---|---|
| Session ↔ warm-up, lesson, checkpoint, capstone | Static imports in `app/src/session/host/BlockViews.tsx`: `WarmUp`, `LessonPlayer`, `CheckpointPlayer` (`unitId = checkpointRouteParam(cpId)`), `CapstoneScreen`. No glob lookup, no skip fallback. Gym hands off to `/transcribe`. |
| Checkpoint ↔ session | The Make is reported after the hand-in, from the result screen's "On to the coda" (`checkpoint-done`); before, saving the Make jumped to the Coda with the checkpoint unsubmitted. |
| Lesson ↔ answers | Already the registry; the drills' glob + fallback pad is replaced by a static `answerWidgetFor`. Drill surfaces honour `params.optionLabels`, `params.multi` and `params.rnAllow`. |
| Lesson / Studio / capstone ↔ tutor | `registerTutorHost` in all three (lesson: Apply into the step editor + `APPLY_CARD`, Reveal = `HINT {reveal:true}`; Studio: Apply into the sketch editor; capstone: after the first release). `Workbench tutorBars` loops `[[bars]]` references. Tutor notes render through `Markdown` (chips, never raw tokens). |
| Lesson `<Setup part>` | Mounts `SetupPart` from `app/src/voice` inline; a part measured in onboarding (its calibration run exists) offers "Keep it". |
| Today ↔ map thumbnail, album strip | `OakGlance` from `app/src/map` (240 px ≥ 1400 px wide, else 180) inside Today's card; the album strip draws each released track's own cover (`app/src/album/TrackCover.tsx`). |
| Coda ↔ unlock moment | `UnlockMoment` plays once for the session's unseen unlocks (judged by a fresh `unlocks.list`), then the "New in your toolbox" list. No heartbeat after the Coda opens (the session is ended). |
| Coda / Toolbox ↔ Studio | `/studio?try=<toolId>` opens a new sketch from the tool's demo (`app/src/studio/TryTool.tsx`, `toolSketchBody`). |
| Shortcut sheet | Static sections list the editor, workbench (incl. `L`, `[`, `]`, `Shift+[`, `Shift+]`, `M`) and answer keys; page keys come from the keymap. `/session` is a focus route. |
| Promoted helpers | `lib/workbench-services.ts`, `lib/editors.ts`, `lib/audition.ts`, `lib/unlocked.ts`, `ui/theme/use-theme-name.ts`. The per-area copies are gone. |
| Grader copy | Locked/preview diagnostics carry `tool` + `lesson`. |
| Fact decks | The lesson and checkpoint registries use `decks` from `@content/families.ts`. |
| Server | Today's Transcription Gym alternative appears only after U07.L01. |

**The gate journey** (`e2e/journey/`, project `journey`, Vite 5212 / API 8812 with `OAK_TUTOR_FAKE=1`, production
build on 8792): `journey.pw.ts` drives a fresh learner through onboarding with Chrome's fake microphone, then daily
sessions with `PUT /api/dev/clock {advanceDays: 1}`: U00.L02, U01.L01, U01.L02 (a wrong answer, "Nudge from Claude",
"Explain my mistake"), the Studio sketch's listening note, the Toolbox and the Oak; `POST /api/dev/seed
{point: "U01.CP due"}` skips to the checkpoint, which is passed; the next day C0 is checked and released; the album
shows track 1 with cover, audio and liner notes. A Quiet-mode variant does onboarding without a mic and one session.
`prod.pw.ts` replays onboarding's first session on the production build and reloads it offline. Walkers:
`lesson-walk.ts` (each graded step answered from the lesson's own authored passing test: code through the editor and
Check, taps/sung notes/generated trials through the player's dev hook), `warmup-walk.ts` (the real drill runner),
`checkpoint-walk.ts`, `capstone-walk.ts`. `attached.config.ts` runs them against an already-running stack.
