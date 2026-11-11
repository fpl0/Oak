# `anthropic-api` backend

The Messages API through `@anthropic-ai/sdk` 1.8.0, behind the `TutorBackend` contract of the tutor
core (`../../backend.ts`). It knows nothing about rungs or redaction: it sends what it is handed
(the prefix, the user turn, its own records, tool results) and translates the stream into the
app-level events.

```ts
import { createAnthropicApiBackend } from "./backends/api/index.ts";

const api = createAnthropicApiBackend({ apiKey, onWarmUsage: (usage) => log(usage) });
// then: selectBackend(setting, { "anthropic-api": api, "claude-cli": cli })
```

```sh
bun test server/src/tutor/backends/api      # hermetic: the real SDK on a fake fetch, no network
```

**No request has been sent to api.anthropic.com.** Everything below is proven against the SDK's
types and its real serialisation, parser and abort path, with authored cassettes. What only a live
call can show is listed under "Not verified live".

## Files

| File            | What it holds                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `index.ts`      | `createAnthropicApiBackend(options)`: the `TutorBackend`. `available()` is "a key is present".                         |
| `request.ts`    | The only place request params are assembled: `buildRequest`, `buildSystem`, `userMessages`, `appNote`, `seedMessages`. |
| `loop.ts`       | `runLoop`: the manual streaming tool loop, shared by chat turns and reviews.                                           |
| `relay.ts`      | Stream events to `status`, `text`, `thinking`, `tool_start`, `tool_input`.                                             |
| `content.ts`    | Fallback boundary, tool-use extraction, served-by models, the plain JSON copy that is stored.                          |
| `structured.ts` | Reviews: the loop with a delivery rule; `StructuredTurnError` carries usage.                                           |
| `warm.ts`       | `max_tokens: 0` warm-up with the identical prefix.                                                                     |
| `cassettes/`    | Test code: typed cassette builders, the fake `fetch`, the scripted conversations, the harness.                         |

## The request (contracts §10.1)

`client.beta.messages.stream` with, in this key order: `model` (`claude-opus-5-5`), `max_tokens`
and `output_config.effort` from the turn, `betas: ["server-side-fallback-2026-07-01"]` (sent as the
`anthropic-beta` header), `fallbacks: "default"`, `thinking: { type: "adaptive", display:
"summarized" }`, `tool_choice: { type: "auto" }`, the seven strict tools as handed over, `system`
as three text blocks with one 1-hour breakpoint on the catalog, a top-level `cache_control` for the
conversation tail, and `messages`. No `temperature`, `top_p`, `top_k`, forced tool choice, output
format or other beta.

`messages` is the conversation's stored records unchanged, then what this turn adds. Each user
turn is one user message of three text blocks: `<oak_context>`, `<learner_code>`,
`<learner_message>`.

## The loop

- One model call per iteration, up to `limits.maxIterations`; then `iteration_limit`.
- `stop_reason` is read before anything else. `refusal` and a `max_tokens` that cut a tool call
  (or cut the reply before any visible text) end the turn in an error; the tool is not run.
  `max_tokens` in plain text is a finished, shortened reply. `pause_turn` re-sends as is.
- Tools run in order through `executeTool`, which validates the input with zod and redacts the
  result; all results of one assistant message go back in one user message.
- The turn is committed once, at its end: as history when it completed, as `excluded` when it
  failed, was refused, truncated or stopped. A retry is therefore a clean re-send.
- Stored blocks are plain JSON copies of the response blocks, thinking and signatures included.
- Usage is summed per call (`?? 0` for the nullable cache fields); `servedBy` lists every model
  that produced part of a response.

## Deviations from the task text and the blueprint, with reasons

- **`<oak_context>` goes in the user turn, not in a trailing `{ role: "system" }` message.**
  Contracts §10.1 forbid mid-conversation system messages until a live call proves them.
  `contextPlacement: "system"` switches to the blueprint's placement; it is tested (including that
  a failed turn never leaves `[user, system]` dangling), but it is off by default.
- **Reviews are delivered through the `submit_*` tool on the normal loop, not through
  `output_config.format`.** Contracts §10.3 name the submit tools as the delivery channel, and
  structured output is not a verified feature. `zodOutputFormat` does exist in SDK 1.8.0
  (`helpers/zod`), should the contracts ever change. The loop stops as soon as the review is
  accepted, without a further model call; it sends the one reminder if the model ends its turn
  without submitting, and gives up after `maxResubmits + 1` submissions.
- **Tools run one after another, not concurrently** (blueprint §5.3): the executors count cards
  and review submissions per turn, and the event order stays deterministic.
- **Blocks before the last `fallback` block are trimmed** (thinking, redacted thinking, tool use),
  as the blueprint's `normalizeFallbackBoundary` and the SDK's documentation describe. "Verbatim"
  holds for everything else.
- **The review reminder is a user message wrapped as `<oak_context>`**, not a system message.
- **The warm-up has no top-level `cache_control`** (blueprint §5.6) and reports its usage through
  `onWarmUsage`, because `TutorBackend.warm` returns nothing and the write is billed.

## What the integrator must do

- Pass the key explicitly: `createAnthropicApiBackend({ apiKey })`. It is never read from the
  environment here. An absent key means `available()` is `{ ok: false, reason: "missing_key" }`.
- `ConversationStore.backendRecords` must return exactly what `appendBackendRecords` was given, in
  order, as parsed JSON: the records are sent back to the API unchanged. Anything that is not a
  message (`role` user, assistant or system) is skipped.
- `compose.ts` wires `onWarmUsage` to the usage sink (rows with `conversationId: "warm"`).
- `StructuredTurnError` (thrown by `runStructured`, defined in the core's `errors.ts`) carries
  `usage` and `calls`; the core's `runReview` logs them, so a failed review still counts.
- Keep `maxRetries` at 2 in production (the default). The SDK then retries 429 and 5xx before a
  stream starts, honouring `retry-after`; the turn's `rate_limit` error appears after those retries.

## Not verified live

Open items of spike S6 that this code depends on:

- that the API accepts this request: `strict` with `eager_input_streaming` on one tool,
  `fallbacks: "default"` on this model, the 1-hour breakpoint together with the top-level one
  (`tailCache: false` drops the latter), and `max_tokens: 0` with adaptive thinking;
- that `cache_read_input_tokens > 0` on a second request with the same prefix, and whether low-,
  medium- and high-effort conversations share that cached prefix;
- what a fallback-served stream looks like on the wire (the `fallback` content block is replayed
  from its documented shape; the SDK's stream-event union has no start type for it);
- whether top-level `usage` of a response with `usage.iterations` is the sum of the iterations;
- that consecutive user messages are merged by the API (relied on after an accepted review and
  after a response with empty content).

## Not done

- **No live smoke for this backend.** `spikes/s6-tutor/live-smoke.ts` is the guarded script for the
  spike's code; a version that drives this backend has not been written.
- **Usage of a call that failed mid-stream is not counted**: the SDK does not hand out the
  `message_start` usage of a stream that errors.
- **`input_transformations` is not logged** (`UsageSummary` has no field for it).
- **A tool call that a fallback hop discards has been announced already** (`tool_start`) and gets
  no `tool_result`. The panel must not wait for one after `done` or `error`.
- **Cost of a fallback-served call** is estimated at the Opus rate (core `pricing.ts`), not per
  `usage.iterations` entry.
- **Status labels** (`relay.ts`) are this backend's own; the CLI backend has no shared list to
  take them from.
- **Recorded cassettes.** The cassettes are authored from the documented wire format. Once a paid
  live check is approved, record real streams and replay them through `cassettes/fake-fetch.ts`.
- **The §10.8 cassette** (a rung-1 hint for a U03 learner uses no un-introduced term) needs a real
  model reply to mean anything; it is not written.
