# S6 (offline part): tutor SSE relay through Hono on Bun.serve

Status: **yellow**. Everything that can be proven without the API is proven by execution
(`bun test spikes/s6-tutor`: 79 pass / 0 fail; `tsc --noEmit`: clean). Nothing was sent to
api.anthropic.com. What only a live call can prove is listed under "Open items" and is covered by the
ready-to-run `live-smoke.ts`.

Environment: Bun 1.4.4, TypeScript 7.0.2, @anthropic-ai/sdk 1.8.0, hono 4.13.17, zod 4.6.7,
Chromium 158.0.8127.18 (Playwright 1.65.0), macOS arm64. No dependency was missing.

## How to re-run

```sh
bunx tsc --noEmit -p spikes/s6-tutor/tsconfig.json      # typecheck incl. compile-time SDK assertions
bun test spikes/s6-tutor                                # 79 tests, ~26 s (25 s is the idle-timeout proof)
bun spikes/s6-tutor/probe-wire.ts                       # what SDK 1.8.0 puts on the wire (fake fetch)
bun spikes/s6-tutor/probe-env.ts                        # how a Hono handler reaches the Bun server
bun spikes/s6-tutor/browser-xorigin.ts                  # real-Chromium cross-origin proof
bun spikes/s6-tutor/live-smoke.ts --dry-run             # smoke script logic against a cassette (free)
ANTHROPIC_API_KEY=... bun spikes/s6-tutor/live-smoke.ts --yes   # LIVE, costs money, NOT run here
```

## Files

| File | Role |
|---|---|
| `request.ts` | typed request builder: tools, system blocks, `buildRequest`, `buildTurnMessages`, `prefixBytes` |
| `client.ts` | `TutorClient` / `TutorStream` seam + `sdkClient()` production adapter |
| `loop.ts` | manual streaming tool loop `runTurn()` + `classifyError()` |
| `tools.ts` | executors with zod validation; `redaction.ts` the hint-rung gate; `lesson-fixture.ts` fake lesson |
| `events.ts`, `pricing.ts` | app-level SSE protocol + encoder/parser; usage and cost |
| `server.ts`, `security.ts` | Hono app, `startServer()` on `127.0.0.1`, security middleware |
| `cassette.ts`, `fake-client.ts`, `harness.ts` | cassettes and the two fake clients |
| `types.check.ts` | compile-time facts about the SDK (positive and `@ts-expect-error` negative) |
| `*.test.ts` | loop, wire, request/prefix, redaction, server/security, idle |
| `live-smoke.ts` | guarded live smoke (not executed) |

---

## 1. Exact SDK 1.8.0 shapes

Paths are under `node_modules/@anthropic-ai/sdk/`. `M` = `resources/beta/messages/messages.d.ts`.
Every row marked "tc" is asserted in `types.check.ts` (and I confirmed the assertions are live by
breaking three of them: tsc failed, then passed again once restored).

| Thing | Exact shape | Where |
|---|---|---|
| stream | `client.beta.messages.stream<Params extends BetaMessageStreamParams>(body: Params, options?: RequestOptions): BetaMessageStream<...>` | `M:89` (tc) |
| stream params | `type BetaMessageStreamParams = MessageCreateParamsBase` (same as `create`, no `stream` key needed) | `M:297`, `M:7042` (tc) |
| request options | `{ headers?, maxRetries?, timeout?, signal?: AbortSignal \| undefined \| null }` | `internal/request-options.d.ts:68-92` |
| final message | `finalMessage(): Promise<ParsedBetaMessage<ParsedT>>`, assignable to `BetaMessage` | `lib/BetaMessageStream.d.ts:119` (tc) |
| stream helpers | `on('text' \| 'thinking' \| 'inputJson' \| 'contentBlock' \| 'streamEvent' \| ...)`, `abort()`, `request_id`, `[Symbol.asyncIterator](): AsyncIterator<BetaRawMessageStreamEvent>` | `lib/BetaMessageStream.d.ts:8-23, 77, 38, 129` |
| stream events | `BetaRawMessageStreamEvent` = `message_start \| message_delta \| message_stop \| content_block_start \| content_block_delta \| content_block_stop` | `M:4870` (tc) |
| deltas | `BetaRawContentBlockDelta` = `text_delta \| input_json_delta \| citations_delta \| thinking_delta \| signature_delta \| compaction_delta`; `BetaInputJSONDelta { partial_json: string }` | `M:4781`, `M:4158` |
| betas | `betas?: Array<AnthropicBeta>` on the params; `AnthropicBeta` is `(string & {}) \| ...` and **names `'server-side-fallback-2026-07-01'`** (also `-2026-06-01`) | `M:7389`, `resources/beta/beta.d.ts:75` (tc) |
| fallbacks | `fallbacks?: BetaFallbacksParam \| null` where `type BetaFallbacksParam = Array<BetaFallbackParam> \| 'default'`. **`fallbacks: "default"` is a first-class typed value.** | `M:7203`, `M:4117`, `M:4011` (tc) |
| fallbacks, stable API | **does not exist** on `client.messages` (`resources/messages/messages.d.ts` has no `fallbacks` and no `betas`) | (tc) |
| fallback result | content block `BetaFallbackBlock { type:'fallback', from, to, trigger }`; `usage.iterations[]` entry `type:'fallback_message'` | `M:3811`, `M:3970` |
| thinking | `BetaThinkingConfigAdaptive { type:'adaptive'; display?: 'summarized' \| 'omitted' \| 'updates' \| null; block_binding?: ... }` (stable API: no `'updates'`) | `M:5437-5453` (tc) |
| effort | `output_config?: BetaOutputConfig`, `effort?: 'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max' \| null` | `M:7221`, `M:4745-4762` (tc) |
| tool | `BetaTool { name; input_schema: { type:'object'; properties?; required?; [k]: unknown }; description?; strict?: boolean; eager_input_streaming?: boolean \| null; cache_control?; ... }` | `M:5620-5683` (tc) |
| cache_control | `BetaCacheControlEphemeral { type:'ephemeral'; ttl?: '5m' \| '1h' }` on `BetaTextBlockParam.cache_control`; also top-level `cache_control?` on the params | `M:2121-2136`, `M:5308-5316`, `M:7141` (tc) |
| system | `system?: string \| Array<BetaTextBlockParam>` | `M:7279` (tc) |
| mid-conversation system | `BetaMessageParam = BetaUserMessageParam \| BetaAssistantMessageParam \| BetaSystemMessageParam`; `BetaSystemMessageParam { role:'system'; content?: string \| Array<...>; clear_at?: 'next_user_message' \| 'never' \| null; output_config?: { effort? } \| null }` | `M:4715`, `M:5275-5295` (tc) |
| stop_reason | `BetaStopReason = 'end_turn' \| 'max_tokens' \| 'stop_sequence' \| 'tool_use' \| 'pause_turn' \| 'compaction' \| 'refusal' \| 'model_context_window_exceeded'`; `BetaMessage.stop_reason: BetaStopReason \| null` | `M:5240`, `M:4559` (tc) |
| stop_details | `BetaMessage.stop_details: BetaRefusalStopDetails \| null`; `{ type:'refusal'; category: 'cyber' \| 'bio' \| 'frontier_llm' \| 'reasoning_extraction' \| 'general_harms' \| null; explanation: string \| null; fallback_credit_token; fallback_has_prefill_claim; recommended_model }` | `M:4540`, `M:4898-4978` (tc) |
| usage | `BetaUsage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number \| null; cache_creation_input_tokens: number \| null; cache_creation: { ephemeral_1h_input_tokens; ephemeral_5m_input_tokens } \| null; iterations: ... \| null; output_tokens_details; server_tool_use; service_tier; speed; inference_geo; fallback_credit }` | `M:6218-6296`, `M:2137-2146` (tc) |
| tool_use / tool_result | `BetaToolUseBlock { id; input: unknown; name; type:'tool_use' }`; `BetaToolResultBlockParam { tool_use_id; type:'tool_result'; content?: string \| Array<...>; is_error?: boolean }` | `M:6170`, `M:5967` |
| errors | `AnthropicError` > `APIError<status, headers, error>` (`.status .headers .requestID .type .errorCode .details .apiMessage`) > `APIUserAbortError`, `APIConnectionError` > `APIConnectionTimeoutError`, `BadRequestError`(400), `AuthenticationError`(401), `PermissionDeniedError`(403), `NotFoundError`(404), `RateLimitError`(429), `InternalServerError` > `OverloadedError`(529), `ServiceUnavailableError`(503), ... All are statics on the default export (`Anthropic.RateLimitError`). | `core/error.d.ts:2-108`, `client.d.ts:411-432` (tc) |
| sampling params | `temperature` / `top_p` / `top_k` are **absent from the types** | (tc) |

### What the SDK really sends (captured with a fake `fetch`, `probe-wire.ts` and `wire.test.ts`)

```
URL       POST http://127.0.0.1:9/v1/messages
HEADERS    "anthropic-beta": "server-side-fallback-2026-07-01", "anthropic-version": "2026-10-21",
           "authorization": "Bearer <redacted>", "x-stainless-helper-method": "stream",
           "x-stainless-timeout": "600", "x-stainless-runtime": "node", "user-agent": "Anthropic/JS 1.8.0"
BODY KEYS model, max_tokens, fallbacks, thinking, output_config, tool_choice, tools, system, cache_control, messages, stream
fallbacks "default" | betas in body: false | stream: true
thinking  {"type":"adaptive","display":"summarized"} | output_config {"effort":"medium"} | tool_choice {"type":"auto"}
tools     compare_haps(strict=true,eager=-) evaluate_strudel(strict=true,eager=-) get_learner_progress(strict=true,eager=-) get_lesson_context(strict=true,eager=-) propose_code(strict=true,eager=true)
system cc [null,null,{"type":"ephemeral","ttl":"1h"}] | top-level cache_control {"type":"ephemeral"}
```

So: `betas` becomes the `anthropic-beta` header and is stripped from the body; `fallbacks:"default"` is
a body field; the key goes out as `Authorization: Bearer`; API version is `2026-10-21`.

### Type mismatches against the plan

None. `request.ts` compiles against the SDK types with **no casts** (the blueprint expected "SDK beta
typings cast here"; not needed). Two type facts the production code must respect:

- `BetaThinkingDelta.estimated_tokens: number | null` is a *required* key (`M:5502`). Cassette/fixture
  builders must include it or they do not typecheck.
- `BetaUsage.cache_read_input_tokens` and `cache_creation_input_tokens` are `number | null`. Always `?? 0`.

The extra betas the blueprint lists (`thinking-display-updates-2026-08-18`,
`thinking-binding-controls-2026-08-01`, `mid-conversation-output-config-2026-07-01`) all exist in the
1.8.0 types (`display:'updates'`, `BetaThinkingBlockBinding` at `M:5412`, `BetaSystemMessageParam.output_config`).
They are **not used** here: binding resolution 10 keeps to verified features until a live S6 proves them.

---

## 2. Agent loop

`loop.ts` `runTurn()` is written against `TutorClient` (`client.ts`), and the same 10 behaviour tests
run against both fakes (`describe.each`):

1. `FakeTutorClient`: pure in-memory replay, no SDK code involved.
2. `sdkCassetteClient`: the **real** `new Anthropic({ fetch: fakeFetch, baseURL: 'http://127.0.0.1:9', maxRetries: 0 })`,
   with the cassette served as wire-format SSE. This exercises the SDK's real serialisation, SSE parser,
   snapshot accumulation and abort path, and is the recommended basis for production cassettes.

Proven (all in `loop.test.ts`, both fakes):

| Behaviour | Result |
|---|---|
| text deltas -> `text` events; `thinking_delta` -> `thinking` events | pass |
| tool loop over 3 requests; two parallel `tool_use` -> **one** user message with both `tool_result`s in order | pass |
| assistant content appended verbatim (thinking + signature, text, tool_use) and echoed on the next request | pass |
| request N+1's `messages` is an exact extension of request N's (append-only replay) | pass |
| `refusal` -> `error{kind:'refusal'}`, tail turn not appended | pass |
| `max_tokens` with a truncated `tool_use` -> tool **not executed**, nothing appended | pass |
| `pause_turn` -> assistant appended, re-sent with no extra user message | pass |
| iteration cap -> `error{kind:'iteration_limit'}` after exactly `maxIterations` requests | pass |
| invalid tool input -> `is_error` tool_result with `INVALID_JSON`, loop continues | pass |
| mid-stream `overloaded_error` after HTTP 200 -> `error{kind:'overloaded'}`, nothing appended | pass |
| HTTP 429 -> `error{kind:'rate_limit', retryAfterSec: 17}` | pass |
| abort mid-stream -> returns in < 2 s from a 30 s cassette, upstream aborted, nothing appended | pass |
| usage summed across requests; cost `92*4 + 12400*4*0.05 + 550*4*1.25 + 6000*4*2 + 185*20 = $0.057298` | pass |

### SDK tolerant JSON parser (observed, `probe-wire.ts`)

```
PARSE "{\"title\": nope nope"                      iterate: none | finalMessage: resolved input={}
PARSE "not json at all"                            iterate: AnthropicError: Unable to parse tool parameter JSON from model... | finalMessage: REJECTED AnthropicError
PARSE "{\"a\":1}}}"                                iterate: AnthropicError: ...                                               | finalMessage: REJECTED AnthropicError
PARSE "{\"code\":\"n(\\\"0 1\\\")\",\"cycles\":2"  iterate: none | finalMessage: resolved input={"code":"n(\"0 1\")"}
PARSE "[1,2"                                       iterate: none | finalMessage: resolved input=[1]
TRUNCATED (max_tokens) -> finalMessage resolved; tool_use.input = {"title":"Half a card"}
```

Truncated tool input comes back as a **silently shortened object, including a dropped required field**
(`cycles` above), with no exception. Only wholly unparseable input throws, and it throws a bare
`AnthropicError` (not an `APIError`) from both the iterator and `finalMessage()`. Hence the three rules
in the loop: check `stop_reason` before running tools; zod-validate every `tool_use.input`; wrap
iteration and `finalMessage()` in one `try`.

---

## 3. Hono on Bun.serve

### Reaching the Bun server from a handler (`probe-env.ts`)

```
{"form":"Bun.serve({ fetch: app.fetch })","envIsTheServerObject":true,"helperSameAsEnv":true,"envHasTimeout":true,"requestIP":"127.0.0.1"}
{"form":"app.request() (unit test)","envType":"undefined","envKeys":[]}
{"form":"export default","envHasTimeout":true,"envHasRequestIP":true,"helperSameAsEnv":true,"port":8796,"hostname":"127.0.0.1"}
```

`c.env` **is** the Bun `Server` (identity-equal) in both the `Bun.serve({ fetch: app.fetch })` and the
`export default { fetch: app.fetch }` forms, because Bun calls `fetch(req, server)` and Hono exposes the
second argument as `c.env`. `getBunServer(c)` from `hono/bun` returns the same object but is marked
deprecated ("will be removed in v5"), so use `c.env` directly. Under `app.request()` `c.env` is
`undefined`: the handler returns 500 `server_misconfigured` rather than silently skipping the timeout call.

### 25-second silent gap (`idle.test.ts`, four concurrent requests, one server, default `idleTimeout`)

```
warn: Bun.serve() timed out a request after 10 seconds. Pass `idleTimeout` to configure.
[idle] {"id":"A","status":200,"events":["text"],"text":"before-gap","pings":0,"end":"error","ms":12010,"upstreamAborted":true,"error":"TypeError: ECONNRESET: The socket connection was closed unexpectedly..."}
[idle] {"id":"B","status":200,"events":["text","text","done"],"text":"before-gapafter-gap","pings":0,"end":"eof","ms":25007,"upstreamAborted":false}
[idle] {"id":"C","status":200,"events":["text","text","done"],"text":"before-gapafter-gap","pings":4,"end":"eof","ms":25007,"upstreamAborted":false}
[idle] {"id":"D","status":200,"events":["text","text","done"],"text":"before-gapafter-gap","pings":4,"end":"eof","ms":25007,"upstreamAborted":false}
```

| | `server.timeout(req, 0)` | heartbeat | outcome |
|---|---|---|---|
| A | no | none | **dropped at ~12.0 s** (Bun default 10 s, coarse timer); client gets `ECONNRESET`; the drop aborts the loop |
| B | yes | none | survives 25 s of total silence |
| C | no | `: ping` every 5 s | survives (4 pings) |
| D | yes | `: ping` every 5 s | survives (4 pings). Production config. |

### Client abort (`server.test.ts`)

```
[abort] server turn-end info: {"conversationId":"c-abort","streamOnAbortAtMs":51.52,"reqSignalAbortAtMs":51.48,"outcome":"aborted","events":2,"ms":51.62} noticed after 52 ms
```

The client aborted its `fetch` 50 ms after the first event; the server noticed ~1.5 ms later and the
loop ended with `aborted` instead of running out the 30 s cassette; the upstream stream was aborted.
**Both** signals fire on Bun 1.4.4: `c.req.raw.signal` aborts (first), then Hono's `stream.onAbort`
(response body cancel). This answers the research open question "does Bun 1.4.4 abort `req.signal` on
client disconnect": yes. The handler listens to both.

### SSE response headers

```
{"cache-control":"no-cache","connection":"keep-alive","content-type":"text/event-stream","transfer-encoding":"chunked"}
```

### Security middleware (`security.ts`; 16 tests in `server.test.ts`)

Order: Host allowlist (exact `127.0.0.1:PORT` / `localhost:PORT`) -> refuse every `OPTIONS` -> Origin
(unsafe methods **must** carry an allowlisted Origin; GETs may omit it) -> `Sec-Fetch-Site`, when present,
must be `same-origin` (or `none` on GET) -> `X-Oak: 1` -> unsafe methods must be `application/json`.
No `Access-Control-*` header is ever emitted.

Rejected with 403 (in-memory matrix): evil Origin; same host other port; `Origin: null`; POST without
Origin; allowed Origin with `Sec-Fetch-Site: cross-site`; missing / wrong `X-Oak`; form-encoded and
`text/plain` bodies; spoofed `Host` (DNS rebinding); Host without port; Host with another port; CORS
preflight. Over the wire against the running server: `Origin: https://evil.example` -> 403 `origin`;
raw `node:http` request with `Host: evil.example:8796` -> 403 `host`.

Real Chromium 158 (`browser-xorigin.ts`):

```
PASS  https://evil.example: CORS fetch with JSON + X-Oak fails  {"ok":false,"error":"TypeError: Failed to fetch"}
PASS  https://evil.example: no-cors simple POST yields nothing readable (opaque or blocked)  {"ok":false,"error":"TypeError: Failed to fetch"}
PASS  https://evil.example: HTML form POST is rejected with 403  status=403
PASS  http://evil.example: CORS fetch with JSON + X-Oak fails  {"ok":false,"error":"TypeError: Failed to fetch"}
PASS  http://evil.example: no-cors simple POST yields nothing readable (opaque or blocked)  {"ok":false,"error":"TypeError: Failed to fetch"}
PASS  http://evil.example: HTML form POST is rejected with 403  status=403
PASS  own origin: POST accepted, SSE read with fetch + ReadableStream  {"status":200,"contentType":"text/event-stream","n":16,"last":"done","kinds":["thinking","text","tool_start","tool_result","code_card","done"]}
PASS  own origin without X-Oak: 403  status=403
server saw:
  POST /api/tutor/chat origin=null sec-fetch-site=cross-site content-type=application/x-www-form-urlencoded x-oak=null -> 403 reason=origin
  POST /api/tutor/chat origin=http://evil.example sec-fetch-site=cross-site content-type=application/x-www-form-urlencoded x-oak=null -> 403 reason=origin
  POST /api/tutor/chat origin=http://127.0.0.1:8796 sec-fetch-site=same-origin content-type=application/json x-oak=1 -> 200
  POST /api/tutor/chat origin=http://127.0.0.1:8796 sec-fetch-site=same-origin content-type=application/json x-oak=null -> 403 reason=x-oak
PASS  no request from any other origin was ever answered 200  []
```

Note what this does and does not show: Chromium failed both cross-origin `fetch()` calls **before any
request reached the server** (no `OPTIONS` and no POST appear in the server log; I did not investigate
why, a local-network-access restriction is the likely cause). Only the form POSTs arrived, and the
middleware rejected them. So the middleware's own behaviour is established by the header matrix and the
wire-level tests, not by the browser's fetch failures.

---

## 4. Hint-rung redaction

`redaction.ts` is the single gate. Views are **built field by field** (allow-list), never "copy then
delete", so a new solution-bearing field cannot leak by default. The rung is server state passed in
`ToolCtx.rung`; it is never read from model input. `get_lesson_context`, `compare_haps` and the injected
`<oak_context>` all go through the same functions.

| Field | First rung |
|---|---|
| `where`, `got`, objectives, rubric | 0 |
| `what` | 1 |
| `fix`, `expected` (first issue only at rung 3) | 3 |
| `solution`, full `target_haps`, `answer_policy: may_reveal`, code-card `applyAllowed` | 4 |

The cassette test (`redaction.test.ts`, both fakes) makes the scripted model call `get_lesson_context`
**and** `compare_haps`, then scans three surfaces: every request body sent to the model, the stored
conversation, and every SSE frame for the browser. Tool results are JSON inside JSON, so the scan
decodes nested JSON and string escapes before matching.

- rungs 0-3: no solution text anywhere (code, explanation, `"solution"`, `"target_haps"`, `solution:` line)
- rungs 0-2: no `fix` / `expected` values anywhere; rung 0: no `what`
- positive controls: `what` present at rung 1, `fix`/`expected` at rung 3, solution at rung 4

Mutation check (the tests do fail when the gate is broken):

```
# target_haps threshold lowered to rung 2           -> 16 pass, 8 fail
# <oak_context> emits the solution line from rung 3  -> 19 pass, 5 fail
# restored                                           -> 24 pass, 0 fail
```

## 5. Prefix byte-stability (`request.test.ts`)

- Two builds with different rung, question (incl. non-ASCII), learner code, timestamp and history length:
  `JSON.stringify({tools, system})` is identical, and so is everything except `messages`.
- Non-vacuous: no volatile string occurs in the prefix, and a one-space change to the catalog *is* detected.
- All 9 requests of three multi-request turns at rungs 0/2/4 carry one identical prefix. For the SDK
  fake this is measured on the **serialised wire body**.
- Separate processes with `TZ=UTC, LANG=en_US` and `TZ=Asia/Tokyo, LANG=tr_TR`:
  `[prefix] sha256 fcccf3b7d5837412db632cdab7ed55f4e335ec13a2bd5d7ed14dccc1d823c950 len 2668 | second process fcccf3b7...c950`
- Tools are name-sorted by code unit (not locale), deep-frozen (mutation throws), strict, closed
  (`additionalProperties:false`, every property required, no numeric/length bounds).

## 6. Live smoke (`live-smoke.ts`, not executed against the API)

Guard, as executed:

```
$ env -u ANTHROPIC_API_KEY bun live-smoke.ts            -> "refusing to run ... key is NOT set; --yes was NOT passed"  exit=2
$ env -u ANTHROPIC_API_KEY bun live-smoke.ts --yes      -> "refusing to run ... key is NOT set; --yes was passed"      exit=2
$ ANTHROPIC_API_KEY=dummy bun live-smoke.ts             -> "refusing to run ... key is set; --yes was NOT passed"      exit=2
```

The SDK is imported only after the guard, and the key is passed explicitly (`new Anthropic({ apiKey })`)
so no ambient credential can be picked up. `--dry-run` runs the identical script logic against a
cassette and ends `SMOKE OK`. Live, it runs call A (streamed turn that must use `evaluate_strudel`),
then call B (new conversation, identical prefix, different volatile context) and asserts
`usage.cache_read_input_tokens > 0` on B's first request; it prints per-request usage, `request_id`,
fallback iterations and a cost estimate. It uses `max_tokens: 4000` (not 16000) purely to cap spend:
estimate $0.04-$0.10, ceiling about $0.40.

---

## Gotchas for production

1. **A failed turn must not leave `[user, system]` dangling.** The blueprint says a failed tail turn is
   simply not appended and "the API merges consecutive user turns". With the context in a trailing
   `{role:'system'}` message that produces `[user, system, user, system]`, which breaks the documented
   placement rule (a mid-conversation system message must be last or be followed by an assistant turn).
   `server.ts` drops the un-answered pair so the retry starts clean (tested). In SQLite terms: mark the
   pair `excluded`, or re-send the same pair on retry instead of appending a new one. The 400 itself is
   from documentation, not observed.
2. **Heartbeat interval must be under Bun's 10 s default if it is ever the only protection.** The
   blueprint's 15 s heartbeat would not save a connection on its own. With `server.timeout(req, 0)` it
   does not matter; keep both, at 5 s.
3. **The browser client must treat "stream ended without `done` or `error`" as a network error.** That
   is what an idle drop looks like (`ECONNRESET`), and also what happens if the `streamSSE` callback
   throws: without an `onError` handler Hono logs and closes; with one it writes its own
   `event: error` whose data is plain text, not our JSON.
4. **Validate every tool input** (see the parser table). A truncated eager input can lose a required
   field without any error.
5. **`fallbacks` exists only on `client.beta.messages`.** Every tutor call, including the warm-up, has to
   use the beta namespace.
6. `c.env` is `undefined` under `app.request()`; do not make the timeout call optional-chained and silent.
7. Cross-origin dev setups: `Sec-Fetch-Site: same-site` (e.g. Vite on `localhost:5173` calling the API
   port directly) is rejected by design. Use the Vite proxy and add the Vite host/origin to both allowlists.
8. Spike code is formatted with single quotes; the repo's Biome config wants double quotes (Biome ignores `spikes/`).
9. The root `bun test` picks up `spikes/s6-tutor` (adds ~26 s; the idle test sets its own 60 s timeout).

## Deviations from the task text

- **Expected values at rung 3.** The task says no expected values below rung 4; `docs/design/ux.md` §3.7
  and the binding resolution ("until the matching rung") put `fix` + `expected` for one issue at rung 3.
  I implemented the per-field ladder from the docs (`MIN_RUNG` in `redaction.ts`). To get the stricter
  reading, set `fix: 4, expected: 4` and move two test rows. The solution itself and the full target
  event list are rung 4 only either way.
- **`eager_input_streaming` only on `propose_code`**, per binding resolution 10. The types allow it on
  every tool.

## Open items (need the live API)

- Does the API accept this exact request: `strict: true` together with `eager_input_streaming: true` on
  one tool, `fallbacks:"default"` with the 07-01 beta on `claude-opus-5-5`, the 1h `cache_control` plus
  the top-level 5m one, and a trailing `{role:'system'}` message? (`live-smoke.ts` check A.)
- `usage.cache_read_input_tokens > 0` on an identical-prefix second call. (check B.)
- The minimum cacheable prefix on Opus 5.5 and the real token size of syllabus + catalog.
- Whether `thinking_delta` text actually arrives with `display:'summarized'`, and what a fallback-served
  stream looks like on the wire (`fallback` block, `usage.iterations`).
- Pricing constants in `pricing.ts` come from the research digest, not from a bill.
- SSE through the Vite dev proxy (buffering, abort propagation) was not tested.
