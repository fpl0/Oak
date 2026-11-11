# Tutor

Oak's tutor service: a shared core (threads, redaction, tools, lint, markup, reviews), two
backends behind one `TutorBackend` interface (`backends/api`: the Anthropic Messages API;
`backends/cli`: one `claude -p` process per turn on the learner's own login), the service that
picks a backend and serialises turns, and the HTTP routes. `compose.ts` wires all of it.

Nothing here imports from another server folder or from a package: everything outside is reached
through the ports in `ports.ts`. Each backend has its own README (`backends/api/README.md`,
`backends/cli/README.md`) with its request shape, gotchas and what was not verified live.

Binding spec: `docs/design/contracts.md` §10 (tutor) and §11 (security). Where this folder and the
contracts disagree, the contracts are right and this folder has a bug.

```sh
bun test server/src/tutor                                  # hermetic: no network, no CLI, no key
bunx tsc --noEmit -p server/src/tutor/tsconfig.json
bunx biome ci server/src/tutor
```

## Integration

```ts
import { createDefaultTutor } from "./tutor/compose.ts";

const tutor = createDefaultTutor({
  ports, // the eight adapters below
  apiKey: () => secrets.anthropicKey(), // read on every use: a pasted key needs no restart
  port: 8787,
  devPorts: dev ? [5173] : [], // the Vite proxy keeps its Host
  onReview: (r) => album.saveReview(r), // review_json (contracts §10.6)
});
root.use("/api/*", oakSecurity(tutor.security)); // the same browser rules for the rest of /api
root.route("/", tutor.app); // /api/tutor/* and /mcp/tutor
Bun.serve({ hostname: "127.0.0.1", port: 8787, fetch: root.fetch }); // c.env is then the Bun server
```

- **Mount at the root.** The app carries its own prefixes: the tutor routes under `basePath`
  (`/api`), the CLI backend's tool endpoint at `mcpPath` (`/mcp/tutor`). The `claude` process sends
  no `Origin` and no `X-Oak`, so that endpoint must stay outside `/api`; `createDefaultTutor`
  throws if it is put under it. It answers only an allowlisted `Host`, refuses any `Origin`, and
  every call needs a live per-turn token.
- **`Bun.serve({ fetch: root.fetch })`**, so that `c.env` is the Bun server and
  `server.timeout(req, 0)` can be called. The default `idleTimeout: "require"` answers 500 on a
  stream when it cannot. If the server passes its own bindings, give `bunServer: (c) => ...`.
- **After the learner pastes or removes a key, signs in to Claude Code or changes the backend
  setting**, call `tutor.refresh()`. Availability is otherwise cached (30 s; 5 s when nothing is
  available; 60 s inside the CLI detector).
- **`/api/health`**: `(await tutor.service.status()).tutor` is the enum of contracts §10.1.
- **To build the pieces yourself** (another mount, one backend only), see `compose.ts`: it is plain
  wiring over `createAnthropicApiBackend`, `createMcpEndpoint`, `createClaudeCliBackend`,
  `createTutorService` and `createTutorApp`.

### Ports to implement (`ports.ts`)

| Port                | What the adapter must do                                                                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GraderPort`        | The subprocess grader host in `tutor` mode (contracts §6.4, §10.A): `evaluate`, `compare`. Applies the toolbox lint with the learner's unlocked set and reports `lockedTools`. A lint or evaluation failure is data (`ok: false`); only infrastructure failures throw. Holds `origin: "tutor"` code to the strict profile. |
| `ConversationStore` | `tutor_conversations` / `tutor_messages` / `tutor_cards`, append-only (triggers). Needs three things §11.11 does not spell out: the app-level transcript (`TranscriptEntry`), a per-backend opaque record log returned exactly as appended (parsed JSON, in order), and the card's `applied` flag.                         |
| `TutorNotesStore`   | `tutor_notes` with `retracted_at`; `recent` returns non-retracted notes of one subject, newest first.                                                                                                                                                                                                                      |
| `LessonContextPort` | Content index: `lesson`, `step` (**`null` for checkpoint items and the current drill trial**), `resolveExercise`, `subject` (`tutorOpen: false` during a checkpoint and during drill trials; `released`), `review` (reference only after a pass; `revisions` from `revisionCountFor`), the generated syllabus and catalog. |
| `ProgressPort`      | `stepState` (the rung is `step_attempts.hint_rung`, max over the attempt series), `advanceHintRung` (writes it and counts a tutor hint), `snapshot`, `termsIntroduced`.                                                                                                                                                    |
| `SettingsPort`      | `tutor.backend` (`auto`, `off`, `anthropic-api`, `claude-cli`), `tutor.softMonthlyUsd` (25), the month the soft-marker toast was shown. There is no hard cap (removed 2026-11-11).                                                                                                                                              |
| `UsageSink`         | `tutor_usage`: one row per model call; `month(YYYY-MM)` totals. Warm-ups arrive with `conversationId: "warm"`.                                                                                                                                                                                                             |
| `Clock`             | `now()` and the learner's IANA time zone (the day rolls over at 04:00 there).                                                                                                                                                                                                                                              |

### Environment and settings

- **No environment variable is read here.** The API key is passed in (`apiKey`); the server reads
  `ANTHROPIC_API_KEY` or `~/.oak/secrets/anthropic.key` itself and deletes the variable from its
  own environment before anything is spawned (contracts §11.4, §11.5). The CLI backend removes
  `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the child's environment in any case, and a
  CLI that reports an API key in use fails the turn.
- **Selection** (`tutor.backend = "auto"`): the API when a key is present, else a logged-in
  `claude` on the PATH (`claude auth status` prints JSON with `loggedIn`), else the tutor is off.
  An explicit setting is never silently replaced by the other backend.
- **CLI working directory**: `~/.oak/tutor-cwd` (created on demand); override with
  `cli: { cwd }`. `cli: { claudePath }` points at another binary.
- **Model** `claude-opus-5-5` on every route. **Effort** by thread kind: hint, explain-mistake and
  listening note low; chat medium; reviews high.

### What else the server must do

- **Store reviews** in `onReview`. **Attribution**: when a sketch version is saved from an applied
  card (`ConversationStore.card(id).applied`), set `tutor_assisted = 1` (contracts §10.7). Review
  `tryCode` has no card and no Apply route: the UI shows it preview-only before the first release.
- **Feedback catalog**: register `lint.parse` and `lint.base.*` next to the `lint.strict.*` IDs.
- **UI**: render tutor text from `parseMarkup` segments; keep its markdown renderer without raw
  HTML, images and autolinking (the server guard is the second layer and does not touch bare
  URLs). Handle `notice` frames; treat a stream that ends without `done` or `error` as a network
  error; keep the composer disabled while a turn streams (a second turn queues behind the first).
- **Coda policy** (contracts §10.10) is the caller's: when to request a listening note
  automatically, and the caption under it.

## How a turn runs

```
browser ──POST──▶ route
                   │ parseTurnRequest(body)                 request.ts   (no rung, no "passed", no apply)
                   │ selectBackend(setting, backends)       select.ts    (setting → API key → CLI → off)
                   │ prepareTurn(request, ports)            prepare.ts   (server state → TurnContext,
                   │                                                      rung coupling, <oak_context>)
                   ▼
            runTurn / runReview(prep, backend, emit, signal, ports)      run.ts, run-review.ts
                   │   emits meta ─────────────────────────────────────▶ SSE (encodeSse, events.ts)
                   │   backend.runTurn(BackendTurn, emit, signal)
                   │        │  text / thinking / status / usage ──────▶ guarded (markup-guard.ts) ─▶ SSE
                   │        └─ executeTool(call) ─▶ tools/execute.ts ─▶ ports (grader, lessons, progress)
                   │                                 └ tool_start / tool_result / card / review ───▶ SSE
                   │   appends transcript + usage rows + tutor notes (append-only)
                   └── emits done | error ─────────────────────────────▶ SSE
```

## Module map

| File                                       | What it holds                                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.ts`                               | `createDefaultTutor`: both backends, selection, service, routes and the MCP mount. Start here.                                                      |
| `index.ts`                                 | The public surface of the core, service and routes. Import from here.                                                                               |
| `types.ts`                                 | `ThreadKey`, `ThreadKind`, `Lane`, `effortFor`, `limitsFor`, `TurnRequest`, `TurnContext`, `TranscriptEntry`, `MODEL`. Re-exports `backend.ts`.     |
| `backend.ts`                               | The `TutorBackend` contract: `BackendTurn`, `StructuredTurn`, `TurnOutcome`, `BackendContinuity`, `ExecuteTool`, `Prefix`.                          |
| `domain.ts`                                | Data that crosses the ports. Anything named `*Source` or `Raw*` is unredacted.                                                                      |
| `ports.ts`                                 | `GraderPort`, `ConversationStore`, `TutorNotesStore`, `LessonContextPort`, `ProgressPort`, `SettingsPort`, `UsageSink`, `Clock`.                    |
| `events.ts`                                | The SSE protocol (`TutorEvent`), `encodeSse`, `SseParser`, `UsageSummary`. Browser-safe.                                                            |
| `errors.ts`                                | `TutorErrorKind`, `TutorError`, fixed learner-facing copy, classifiers for thrown errors, HTTP status, stop reasons and CLI exits, `redactSecrets`. |
| `usage.ts`, `pricing.ts`                   | Token accounting for both backends; list-price estimate for the API.                                                                                |
| `redaction.ts`                             | The rung matrix of §10.5 for `get_lesson_context`, `compare_haps` and `<oak_context>`.                                                              |
| `leak-markers.ts`                          | `leakMarkers`, `findLeaks`, `forbiddenKeys`: what must not appear below which rung. Leak tests; grader error messages.                              |
| `context.ts`                               | `buildOakContext`, `userTurnBlocks`, `renderUserTurn`, `escapeReserved`.                                                                            |
| `prompt/persona.ts`                        | `PERSONA`, `buildPrefix`, `systemBlocks`, `systemText`, `prefixBytes`, `prefixVersion`.                                                             |
| `lint/strict.ts`                           | Base and strict lint profiles (§11.3) on an acorn AST.                                                                                              |
| `markup-guard.ts`, `markup.ts`             | No raw HTML (streaming and whole-text), `[[...]]` tokens, typed segments, `sanitizeMarkdown`, `termUsage`. Browser-safe.                            |
| `reviews.ts`                               | Review schemas (zod + strict JSON Schema), validators, `revisionCountFor`.                                                                          |
| `tools/defs.ts`                            | The seven v1 tools, name-sorted, strict, frozen.                                                                                                    |
| `tools/schemas.ts`                         | zod for tool inputs; clamps.                                                                                                                        |
| `tools/execute.ts`                         | `createToolSession`: the executors, one session per turn.                                                                                           |
| `tools/propose.ts`                         | `propose_code` pipeline, the apply policy of §10.7, `applyCard`.                                                                                    |
| `tools/review-submit.ts`                   | `acceptReview`: the last step of both review channels.                                                                                              |
| `tools/views.ts`, `tools/labels.ts`        | Unredacted tool result shapes (evaluation, progress); the status line of a running tool.                                                            |
| `threads.ts`                               | Learner day (04:00 rollover), conversation IDs, `openConversation`, `seedNotes`, `handoffLines`, `coupleHintRung`, `checkBudget`.                   |
| `request.ts`                               | zod for the route body.                                                                                                                             |
| `prepare.ts`, `run.ts`, `run-review.ts`    | Resolve a turn; run it on a backend.                                                                                                                |
| `select.ts`                                | Backend selection, the `/api/health` enum, and `backendStatus` (every backend's answer, as codes and fixed copy) for Settings.                      |
| `service.ts`, `service-types.ts`           | `createTutorService`: the one object the routes call. Picks the backend, serialises turns per conversation, runs them, status, warm-up.             |
| `turn-queue.ts`, `thread-view.ts`          | One turn at a time per conversation; the panel's merged timeline as typed segments.                                                                 |
| `http/routes.ts`, `http/schemas.ts`        | `createTutorApp`: the Hono sub-app (`/tutor/*`) and the zod shapes of its bodies.                                                                   |
| `http/sse.ts`, `http/security.ts`          | The SSE response (heartbeat, idle timeout, abort, guaranteed terminal event); the Host / Origin / `X-Oak` middleware, reusable app-wide.            |
| `backends/api/`                            | The `anthropic-api` backend: request builder, manual streaming tool loop, cassettes on a fake `fetch`.                                              |
| `backends/cli/`                            | The `claude-cli` backend: command line, process, stream-json translation, the MCP tool endpoint, a fake `claude` executable for tests.              |
| `testing/`                                 | Fakes for every port, a fixture lesson, a scripted backend, `composed.ts` (the whole app on a socket). Test code only.                              |
| `compose.test.ts`, `adversarial.*.test.ts` | End to end over real HTTP on both backends; attempts to break the invariants.                                                                       |

## Threads

A request has one of six **kinds** (`ThreadKind`): `chat`, `hint`, `explain`, `listening`,
`review-capstone`, `review-transcription`. Each maps onto one of the contract's four
**conversations** per subject and day (`Lane`, the `thread_kind` column): `hint` and `explain` →
`hint`; `listening` → `note`; `chat` → `chat`; the reviews → `review`. Effort and limits are fixed
per lane: hint and note low, chat medium, review high.

A conversation is `(subjectKind, subjectId, day, lane)`; its ID is
`lesson:U06.L04:2026-12-02:hint`. `day` is the learner-local day with a 04:00 rollover. A new day
starts new conversations, seeded with the 10 most recent non-retracted tutor notes (this subject
first, then general). Nothing is updated or deleted.

## How a backend plugs in

Implement `TutorBackend` (`backend.ts`). You are handed a `BackendTurn`:

- `prefix` (persona, syllabus, catalog) and `tools`: frozen and byte-identical in every request.
  API: `tools: [...input.tools]`, `system` from `systemBlocks(prefix)` with the 1-hour breakpoint
  on the last block. CLI: `--system-prompt systemText(prefix)`, tools over MCP.
- `user`: `{ oakContext, learnerCode, text }`, kept apart so each transport can place them.
  `userTurnBlocks(user)` gives the contract's three text blocks (§10.1); `renderUserTurn(user)`
  joins them for the CLI's stdin. Contracts §10.1 does not allow a mid-conversation system message
  until a live S6 run proves it, so the API backend should send the blocks in the user turn.
- `executeTool(call, signal)`: runs a tool under the turn's server-side rung and returns
  `{ content, isError }`. Pass `content` to the model unchanged. It emits `tool_start`,
  `tool_result`, `card` and `review` itself. If you announce a tool call early (API:
  `content_block_start`), emit `tool_start` yourself; it will not be emitted twice.
- `continuity`: your own append-only memory of the conversation. API: commit the message params
  of the turn verbatim (thinking blocks and signatures included). CLI: commit `{ sessionId }`.
  Commit once per turn; pass `{ excluded: true }` for a refused, truncated or aborted tail.
- `transcript`: prior turns in app-level form. If `continuity.records` is empty but `transcript`
  is not (the learner switched backends, or a CLI session file is gone), seed from it.
- `effort`, `model`, `limits.maxTokens`, `limits.maxIterations`: use as given.

Emit only `status`, `text`, `thinking`, `tool_start`, `tool_input` and `usage`. The runner emits
`meta`, `done` and `error` and drops anything else. Return a `TurnOutcome`; do not throw for
upstream failures (build the error with `classifyThrown`, `classifyStopReason`, `classifyCliExit`).

`runStructured` serves the reviews. API: the model calls `input.submitTool`; run the tool loop and
return once `input.accepted()` is set; if the model ends without submitting, send `input.reminder`
once. CLI: pass `input.jsonSchema` to `--json-schema`, read `result.structured_output`, call
`input.validate(raw, signal)`; on `{ ok: false }` send the problems back, at most
`input.maxResubmits` times. Throw a `TutorError` when no valid review arrives.

`testing/scripted-backend.ts` is a complete, model-free implementation to read.

## Invariants (each one is tested)

1. **The model never supplies the hint rung.** No tool input and no request field carries it
   (`tools/defs.test.ts`, `request.test.ts`). The level is read from `ProgressPort.stepState` when
   a turn is prepared and again at every tool call (`tools/execute.test.ts`).
2. **Redaction by rung**, per the matrix of §10.5, in tool results and in `<oak_context>`. Views
   are built field by field; a withheld field is absent. `redaction.test.ts` checks every row at
   every rung. `adversarial.leaks.test.ts` runs a greedy model on BOTH real backends at rungs 0–3
   over HTTP and scans what actually left: the API's raw request bodies, the CLI's stdin prompt
   and MCP tool results, every SSE frame, the threads route and the store. It also covers a
   backend switch (reseeding), a failed tail, forged `<oak_context>` in learner text and notes, and
   a grader error that quotes the reference.
3. **Tool inputs are zod-validated** although the tools are strict (`tools/execute.test.ts`).
4. **Model-written code is strict-linted before it is evaluated or shown.** `propose_code`,
   `evaluate_strudel`, `compare_haps` and review `tryCode`; tests assert the grader was never
   called for rejected code. `lint/strict.test.ts` holds some seventy bypass attempts.
5. **Preview-only cards** (§10.7) are decided by the server, and `applyCard` refuses to apply one.
6. **No raw HTML** in tutor text: escaped in the stream, in stored transcripts, in card titles and
   explanations and in review prose (`markup.test.ts`, `run.test.ts`).
7. **Only Oak writes `<oak_context>`**: reserved tags inside learner text, notes and other values
   are neutralized (`context.test.ts`).
8. **The prefix is byte-stable** across thread kinds, rungs, learner text, days and history
   (`prompt/persona.test.ts`).
9. **History is append-only**; a failed tail is stored as excluded and never replayed
   (`threads.test.ts`, `run.test.ts`). A backend is handed frozen copies of the transcript and of
   its own records (`adversarial.misuse.test.ts`).
10. **No secret in an error**: learner-facing messages are fixed copy per kind (`errors.test.ts`);
    the API key is in no response, SSE frame or log line (`compose.test.ts`).
11. **One turn at a time per conversation**, in arrival order; a Stop before the first byte, during
    a tool call or after `done` leaves an excluded tail or nothing (`adversarial.misuse.test.ts`).
12. **At most 24 tool calls per turn** on either backend (`MAX_TOOL_CALLS_PER_TURN`).

The tests were mutation-checked: lowering a matrix threshold, skipping the card lint, making
graded cards applicable, leaving the context unredacted, or removing any one of the hardening
steps listed under "Review" below each fails at least one test.

## Deviations from the documents, with reasons

- **Event names follow the contracts**, not the spike: `card` (not `code_card`), plus `meta`,
  `status`, `tool_input` and `usage`. `review` is an addition (the contracts do not say how a
  review reaches the panel). `done` also carries `usage` and `backend`. A card carries both
  `apply` (the contract's enum) and `applyAllowed`.
- **`tool_input` (card drafts) is not forwarded unless `RunOptions.cardDrafts` is set.** A draft
  is code that has not been linted, and the rule is that unlinted code is not shown.
- **Redaction follows §10.5, not spike S6**: "what" opens at rung 2 (the spike had 1); `got` is
  gated with `expected`; issues are numbered instead of carrying grader IDs, because an NEvent ID
  spells out the expected pitch.
- **`known_mistakes[].code`** exists only at level 4. The matrix allows wrong-variant code there,
  but the tool's output shape in §10.3 has no field for it.
- **The strict lint is stricter than §11.3.** It also bans `Object`, `Reflect`, `Proxy`, `Symbol`,
  the descriptor and prototype accessors, timers and Strudel's `evaluate`; it rejects the reserved
  names as identifiers in any position (destructuring is a bypass otherwise), computed keys in
  object literals and patterns, `let`/`var`, `++`, `delete`, `debugger`; and `samples()` may only be
  given literals and only called directly (an alias or `samples.call` would skip the check). An
  HTML-style comment (`<!--`, a line-leading `-->`) is rejected in both profiles: it is a comment
  to a script parser and an operator to a module parser. The base rule IDs (`lint.base.*`,
  `lint.parse`) are new.
- **Heartbeat 5 s** (`SSE_PING_INTERVAL_MS`), not the 15 s of §10.1: spike S6 showed 15 s does not
  survive Bun's 10 s idle timeout on its own.
- **Subscription usage has no dollar figure** (`costUsd: null`, `includedInPlan: true`) and does
  not count towards the soft marker.
- **A hint that failed does not climb the ladder again on retry.** The contracts say a hint
  request advances the rung before the model is called; without this a rate-limit retry would
  cost the learner two rungs.
- **`explain` ("Explain this error") advances the rung**, because §10.2 puts it on the hint thread
  and §10.4 says a request on that thread advances.
- **Card limits** for chat (6 per turn) and reviews (2) are this folder's numbers; the contracts
  only fix the hint limit (1).
- **`event: notice`** carries the one soft-marker toast (§10.9); the contracts name no carrier.
- **`<oak_context>` is the first text block of the user turn on both backends** (§10.1). The
  blueprint's trailing system message is an option of the API backend, off until a live call.
- **Reviews on the CLI use `--json-schema`**, not the `submit_*` tools (amendment §10.A: five
  tools); on the API they use the submit tool. One validator (`acceptReview`) serves both.
- **Persona is a TypeScript constant** (`prompt/persona.ts`), not `persona.md`: the prefix must be
  byte-stable and a module constant cannot be edited on disk between two requests.
- **There is no hard cap.** It was removed on 2026-11-11 (contracts §10.9 v1.2); spend past the
  soft marker never refuses a turn or a warm-up, on either backend.
- **`compare_haps` refuses an exercise whose step the content port withholds** (checkpoint item,
  current drill trial), and withholds a grader error message that quotes the reference below
  hint 4. The contracts do not mention either case.
- **The liner note's "third person"** is checked as "contains no 'you'". "Never states pass or
  fail" is not machine-checked ("passing tone" is a musical term); the persona carries that rule.

## Service and HTTP layer

Wiring is `createDefaultTutor` (see "Integration" above).

| Route (under `basePath`)                                       | Answer                                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /tutor/chat`                                             | SSE. Body `{ thread, userText, learnerCode?, graderResult?, lessonId?, stepId? }`.        |
| `POST /tutor/hint`, `POST /tutor/explain-mistake`              | SSE. `stepId` required, `userText` optional (the button's words are used).                |
| `POST /tutor/note` (alias `/tutor/listening-note`)             | SSE. `learnerCode` required.                                                              |
| `POST /tutor/reviews/capstone`, `/tutor/reviews/transcription` | SSE ending `review`, `done`. Body `{ thread, userText? }`. Alias `/tutor/review/*`.       |
| `POST /tutor/warm` (alias `/tutor/session-warm`)               | JSON `{ warmed, backend, reason }`. Never fails the page.                                 |
| `GET /tutor/status[?refresh=1]`                                | JSON for Settings: health enum, active backend, each backend's code and guidance, budget. |
| `GET /tutor/threads/:subjectKind/:subjectId[?limit=]`          | JSON: the merged timeline, tutor text as `parseMarkup` segments, cards, note chips.       |
| `POST /tutor/cards/:cardId/applied`                            | JSON. 409 for a preview-only card, 404 for an unknown one.                                |
| `POST /tutor/notes/:noteId/retract`                            | JSON.                                                                                     |

How the browser reads an answer:

- **A turn that passed validation is always `200 text/event-stream` and always ends with exactly
  one `done` or `error`**, also when the tutor is off (`error.kind: "auth"`, the message says how
  to set it up), when the subject is closed or there is nothing to review (`bad_request`), and
  when the turn was queued and then stopped (`aborted`). A stream that ends without a terminal
  frame is a dropped connection.
- **4xx/5xx JSON** means no turn was started: `403 { error: "forbidden", reason }` from the security
  rules, `400/413/415 { error: { kind: "bad_request", message, problems } }` for a bad body, `500`
  with fixed copy for a server fault. No response ever carries upstream text or a credential.
- **`event: notice`** is one extra frame type, not a `TutorEvent` (`asTutorEvent` returns `null`
  for it): `{ kind: "budget_soft_marker", message }`, sent once, just before `done`, on the turn
  that first takes the month past the soft marker. It is the toast of contracts §10.9.

What the service adds on top of `prepareTurn` and `runTurn` / `runReview`:

- **Backend selection is cached** for 30 s (5 s when nothing is available), so a turn does not
  spawn `claude auth status`. `GET /tutor/status?refresh=1`, a change of the setting, a turn that
  ends in `auth` or `network`, and `tutor.refresh()` all drop the cache.
- **One turn at a time per conversation** (subject and lane), in arrival order. A queued turn
  that is aborted leaves without running: no rung is spent and nothing is stored.
- **The warm-up is sent at most once per 50 minutes** per backend and prefix, concurrent calls
  share one request. Spend past the soft marker never skips it.
- **A review's bounded retry is the core's**: `maxResubmits` (one resubmission) is handed to the
  backend; the service does not add a second, paid attempt on top. When it fails the stream ends in
  `error` and the caller shows the deterministic liner notes.

## Review (what the adversarial pass changed)

- `lint/strict.ts`: HTML-style comments rejected; `samples` only as a direct call.
- `tools/execute.ts`: withheld steps are not comparable; grader error messages are checked against
  the step's leak markers; 24 tool calls per turn on both backends.
- `markup.ts`: links with whitespace or a line break before the destination, single-quoted or
  parenthesised titles and angle-bracket destinations are rewritten like any other; reference
  definitions the line rule misses are defused.
- `run.ts`: a backend gets frozen copies of the transcript and of its records.
- `run-review.ts`, `errors.ts`: a review that fails after model calls still logs their usage
  (`StructuredTurnError`, now thrown by both backends).
- `service.ts`: `onReview`. `compose.ts`: the wiring, a key that can change at run time, warm-up
  usage recorded. Duplicated status labels moved to `tools/labels.ts`; dead exports removed.

## Not done

- No SQLite adapter and no grader adapter: the server wires those into the ports.
- **No live call has been made on the API backend** (no key, no spend approved): its cassettes are
  authored from the documented wire format. `backends/api/README.md` lists what is unverified.
  The CLI path was verified live in spike S8; `backends/cli/live-smoke.ts` refuses to run without
  `--yes` and was not run.
- **`POST /api/settings/anthropic-key`, `/api/health` and `GET tutor/usage?range=`** are not tutor
  routes here. `service.status()` gives the health enum and this month's totals; per-thread-kind
  and 7/30-day figures need a `UsageSink` query that does not exist yet.
- **The checker is an oracle the lint cannot close.** `compare_haps` returns status, score and
  where the issues are at every rung (§10.5), for the learner's code or for code the model wrote;
  a model that ignored its persona could search for the answer through it. The call cap bounds
  it; the contract allows it.
- **Library-level dynamic lookups.** The strict lint keeps tutor code from turning a string into
  a property key, but a catalogued Strudel function that indexes an object by a pattern value
  (`pick`) does so on its own. The toolbox lint and the grader worker's disabled `Function`
  constructor (§11.4) are the layers for that.
- **No `retry` route** (architecture §4.4 lists `tutor/retry/:conversationId`): the client re-sends
  the request, and a failed hint does not climb the ladder twice.
- **The timeline's `preview` / `locked` badges** are only decided on the server when the ports'
  "recent" lists are complete (count ≤ list length); otherwise the UI resolves them.
- **A queued turn holds its SSE stream open** (heartbeats only) until the turn ahead of it ends;
  there is no "busy" answer. The UI should keep the composer disabled while a turn streams.
- **Recorded cassettes**: none on the API (see above); the CLI fixtures are ported from spike S8.
- **Context deltas.** Every turn carries the full `<oak_context>`; the blueprint's "only changed
  lines" is not implemented.
- **Prefix pinning.** `prefixVersion` is stored per conversation, but a turn always uses the
  current build's prefix: the port serves one syllabus and one catalog.
- **Listening notes** are not checked for "cites a bar, degree, chord or rhythm".
- **Review `skills`** are capped at three but not checked against the skill registry.
- **Context chips** ("what the newest turn will carry") have no endpoint helper yet.
- **Denial of service by legal code** (a huge `.repeat()`, a giant array) is not a lint matter;
  the grader's kill timer covers the server, and nothing here covers the browser preview.
