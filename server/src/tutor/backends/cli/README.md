# `claude-cli` backend

One of the two `TutorBackend` implementations (contracts §10.A). It runs one `claude -p` process per
turn on the learner's own Claude login. The CLI gets no built-in tools; Oak's five learner tools are
served to it over a local MCP endpoint and bound to the turn by a random token. Everything else
(tool executors, rung redaction, review validation, threads, the SSE protocol) is the shared core in
`server/src/tutor/`.

Proven live in `spikes/s8-claude-cli/` (Claude Code 2.1.322). This folder ports that spike and uses
only what it verified.

```sh
bun test server/src/tutor/backends/cli        # hermetic: a fake `claude`, loopback only
bun server/src/tutor/backends/cli/live-smoke.ts --yes   # ONE real turn on your login; never run by tests
```

## Files

| File            | What it holds                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `index.ts`      | `createClaudeCliBackend(deps)`. Re-exports `createMcpEndpoint`, `TurnRegistry`, `DEFAULT_CWD`.            |
| `argv.ts`       | `buildArgv`: the command line, flag for flag as verified in S8. `expectedTools` for the init check.       |
| `process.ts`    | `runClaude`: spawn, prompt on stdin, stdout as JSON lines, stderr tail, timeout, abort, kill. `childEnv`. |
| `translate.ts`  | `StreamTranslator`: stream-json to `TutorEvent`s, the fail-closed checks, usage, how the run ended.       |
| `mcp.ts`        | The MCP streamable-HTTP endpoint (a Hono sub-app) and the per-turn token registry.                        |
| `session.ts`    | Which CLI session a conversation is on, when it may be resumed, the replay block, the stdin prompt.       |
| `turn.ts`       | One run: open token, build argv, run, close token; restart once from the transcript if resume failed.     |
| `structured.ts` | Reviews through `--json-schema`: read `structured_output`, validate, resubmit once.                       |
| `detect.ts`     | `available()`: `claude --version` and `claude auth status`, cached for a minute, never throws.            |
| `live-smoke.ts` | A guarded live check. Exits with code 2 unless `--yes` is passed.                                         |
| `testing/`      | `fake-claude.ts` (the stand-in binary), `harness.ts`, `replay.ts`, `mcp-client.ts`, `fixtures/*.jsonl`.   |

## Wiring (what the integrator does)

```ts
const mcp = createMcpEndpoint({ hosts: ["127.0.0.1:8787", "localhost:8787"] });
app.route("/mcp/tutor", mcp.app); // outside the `X-Oak: 1` rule, or pass `mcpHeaders`
const cli = createClaudeCliBackend({
  registry: mcp.registry,
  mcpUrl: "http://127.0.0.1:8787/mcp/tutor",
  // cwd: () => settings.tutorCwd,             // default ~/.oak/tutor-cwd, created on demand
  log: (line) => logger.info(line),
});
// selectBackend(setting, { "anthropic-api": api, "claude-cli": cli })
```

- The endpoint checks `Host` (loopback, or the exact list given) and refuses a non-loopback
  `Origin`. It cannot satisfy contracts §11.1 rule 4 (`X-Oak: 1`) by itself: mount it outside that
  middleware, or pass `mcpHeaders: { "X-Oak": "1" }` so the CLI sends the header.
- `cli.detector.status()` gives the version and auth method for Settings; `cli.detector.reset()`
  after the learner logs in.
- Turns of one conversation must not run concurrently (the core says the same): two processes
  resuming one CLI session would interleave its history.

## Invariants, and where each is tested

1. **The model never supplies the rung.** The token in `X-Oak-Turn` maps to the turn's executor, which
   already carries the server-side rung; no tool schema has a rung field and an extra argument is
   rejected (`mcp-turns.test.ts`, `tools.test.ts`).
2. **Nothing above the rung reaches the CLI.** Asserted on what actually left the server: the stdin
   prompt, the command line, and every tool result as the "CLI" received it over HTTP, at rungs 0–3
   across chat, resume and hint turns, with rung 4 as the positive control (`tools.test.ts`).
3. **Fail closed on the tool surface.** The init event must list exactly `mcp__oak__*` for the five
   learner tools (or exactly `StructuredOutput` on a review). Anything else kills the process before
   any model output is forwarded and revokes the token at once (`translate.test.ts`, `turn.test.ts`,
   `failures.test.ts`). The same for model output before an init event, and for a CLI that reports
   an API key in use (`apiKeySource` other than `none`): this backend is the subscription login.
4. **The token dies with the turn.** Unknown, expired and other turns' tokens get a JSON-RPC error and
   never reach an executor; a Stop or a failed check revokes the token before the process is gone
   (`mcp-turns.test.ts`, `turn.test.ts`).
5. **No credentials cross over.** `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are removed from the
   child's environment; the fake binary refuses to run if it sees either (`process.test.ts`, every
   end-to-end test).
6. **The command line is the verified one.** `argv.test.ts` pins it exactly, and the fake binary exits
   64 on any flag it does not know, so a change to `argv.ts` fails all end-to-end tests.
7. **A stream without a result event is never a completed turn** (`translate.test.ts`,
   `failures.test.ts`).
8. **A failed tail is never replayed.** A turn that fails or is stopped retires its CLI session; the
   next turn starts a new one from Oak's transcript, which excludes the failed turn
   (`failures.test.ts`, `session.test.ts`).
9. **Model-written code is strict-linted before it is evaluated or shown**, on the tool path and in
   review `tryCode` (`tools.test.ts`, `structured.test.ts`; the lint itself is the core's).

The tests were mutation-checked: 18 single-line breaks of the rules above (init check off, key left
in the environment, token not expiring or not revoked, retired session resumed, review not
validated, a flag dropped, and so on) each fail between 1 and 38 tests.

## How it differs from the API backend

- No mid-conversation system message: `<oak_context>`, the learner's code and message go in on stdin
  as one user turn (`renderUserTurn`).
- No thinking text arrives. Progress is the `status` line (from the stream) plus `tool_start` /
  `tool_result` (from the MCP endpoint, with IDs of the form `mcp_<turn>_<n>`).
- Usage has tokens but no dollars: `costUsd: null`, `includedInPlan: true`. The CLI's
  `total_cost_usd` is never read. One usage row per process run, with `requests` = model calls.
- No `warm()`: the CLI caches its prefix by itself.

## Decisions that go beyond the documents

- **Session records.** The backend commits one record per turn, `{ v, sessionId, resumable, seeded }`.
  For a failed turn it commits `resumable: false` as a normal record, not as an excluded one: excluded
  records are invisible to the next turn, and the next turn is the one that must not resume.
- **Resume failure is detected structurally.** The spike did not capture what a missing session file
  looks like, so the rule is: a `--resume` run that ended by itself, in an unclassified error, before
  any model call and any tool call, is restarted once as a new session seeded from the transcript.
- **The replay is an `<oak_notes>` block** placed before `<oak_context>`: at most 24 entries and
  12,000 characters, newest kept, one flattened line each, reserved tags neutralized. Tool results
  are not replayed; the model asks its tools again at the current rung.
- **Review resubmission** is a turn on the same session whose whole prompt is an `<oak_context>` block
  with the validator's problems (or the core's reminder when nothing was delivered).
- **Limits.** `maxIterations` is enforced by counting `message_start` events and killing the process
  at the first call beyond the limit. The endpoint also caps tool calls per turn (24,
  the core's `MAX_TOOL_CALLS_PER_TURN`, which the tool session enforces for both backends).
- **`--allowedTools` and `tools/list` carry the five learner tools**, not the two `submit_*` tools:
  reviews use `--json-schema` here.

## Not done

- **Not verified live:** resuming a session after a `--json-schema` run (review resubmission); what a
  missing session, a usage limit or a rate limit looks like in the stream. The classification covers
  the plausible shapes (`is_error`, `api_error_status`, the result text, an in-band `error` on an
  assistant message, a `rejected` rate-limit event) and falls back to `internal`. Run `live-smoke.ts`
  and extend it when these can be provoked.
- **`maxTokens` is not enforced.** The spike verified no flag for it. A `max_tokens` stop reason from
  the CLI is passed through as the turn's stop reason.
- **No card drafts.** `tool_input` is not emitted: the stream's tool-use IDs are not the endpoint's.
- **The system prompt travels as one argument.** A prefix over 512 KiB fails with `bad_request`
  instead of an opaque spawn error; `--system-prompt-file` was not verified and is not used.
- **The turn token is visible in the process list** of the same user for the length of the turn (it is
  in `--mcp-config`). It is per-turn, random and useless once the turn ends.
- **The working directory is not a `SettingsPort` field.** `TutorSettings` has none; pass
  `cwd: () => ...` to read it from wherever the setting ends up.
- **Old CLI session files are not cleaned up.** They accumulate under `~/.claude/projects/<cwd>/`.
- **No long-lived process.** One process per turn was fast enough in the spike (first event after
  about 300 ms).
