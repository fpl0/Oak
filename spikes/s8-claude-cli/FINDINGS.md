# S8: tutor through the local Claude CLI (live)

Run on 2026-11-11 with Claude Code 2.1.322, logged in through claude.ai (Max), no API key.
Model `claude-opus-5-5`. All checks below were executed; raw stream-json is in `results/*.raw.json`
and the summaries in `results/live-*.json`.

## How to re-run

```bash
bun spikes/s8-claude-cli/live.ts          # all scenarios (A–G), about 75 s, uses subscription quota
bun spikes/s8-claude-cli/live.ts A        # only the three-turn thread
```

## Files

- `mcp.ts`: hand-written MCP streamable-HTTP server (JSON-RPC over POST, plain JSON replies) on Hono.
  Exposes the five S6 tools by reusing `../s6-tutor/request.ts` (definitions) and `../s6-tutor/tools.ts`
  (executors, including hint-rung redaction). No MCP SDK dependency.
- `backend.ts`: `buildArgv` + `runCliTurn`: one `claude -p` process per turn, stream-json translated
  into the S6 `TutorEvent` shapes.
- `live.ts`: the scenarios.

## The command line that works

```
claude -p --output-format stream-json --verbose --include-partial-messages
  --model claude-opus-5-5 --effort <low|medium|high>
  --system-prompt <Oak persona>
  --tools ""                       # no built-in tools
  --strict-mcp-config --mcp-config '{"mcpServers":{"oak":{"type":"http","url":"http://127.0.0.1:<port>/mcp","headers":{"X-Oak-Turn":"<per-turn token>"}}}}'
  --allowedTools mcp__oak__compare_haps,mcp__oak__evaluate_strudel,mcp__oak__get_learner_progress,mcp__oak__get_lesson_context,mcp__oak__propose_code
  --setting-sources "" --disable-slash-commands
  --permission-mode dontAsk --permission-prompts none
  --session-id <uuid>              # first turn of a thread
  --resume <uuid>                  # every later turn
```

The prompt goes in on stdin. The process runs in an empty working directory.
`ANTHROPIC_API_KEY` is removed from the child's environment so the two backends never mix credentials.
Detection: `claude auth status` prints JSON with `loggedIn` and `authMethod`.

## Results

| Check | Result |
|---|---|
| Tool surface | The init event lists exactly the five `mcp__oak__*` tools; MCP server `oak` is `connected`; no skills or slash commands; `apiKeySource: "none"` |
| A. First turn, rung 0 | Called `get_lesson_context`, `compare_haps` ×2. Socratic reply, no leak markers in tool results or reply. 8.6 s total |
| B. Resume, rung 0, "just tell me the code" | Refused, offered a stronger hint, and recalled the first question verbatim (thread continuity through `--resume`). 6.5 s, first text at 1.6 s |
| C. Resume, rung 4 | Called `evaluate_strudel`, then `propose_code`; `code_card` event carried `n("0 2 4 7").scale("D:dorian")` with `applyAllowed: true`. 10.9 s |
| D. Code card on a side request, rung 0 | `propose_code` produced a card with `applyAllowed: false`; no leaks. 12.0 s |
| E. Structured review (`--json-schema`, no tools, effort high) | `result.structured_output` matched the schema (2 strengths with bars, 1 revision, listening question, liner note). 29 s. `stop_reason` is `tool_use` and the text is empty: read `structured_output`, not the text |
| F. Sandbox | Asked to read `/etc/hosts` and run `ls ~`: it said it has no such tools and listed the five Oak tools. `permission_denials: []` |
| G. Abort | Killing the process at 2.5 s gave exit code 143 at 3.1 s and no `result` event |

Latency: first stream event at about 250–300 ms after spawn. First text at about 1.6 s when no tool is
called, 5–11 s when tools run first. Spawning per turn is fast enough; a long-lived process is not needed.

Caching: the CLI caches by itself with a 1-hour TTL. `cache_read_input_tokens` was above zero on every
turn that had more than one model iteration, and on resumed turns (3,357 and 8,154 tokens).

## Gotchas for production

1. **No thinking deltas arrive.** Only `text_delta` events were seen. While tools run there is no text,
   so the panel must show progress from the `tool_start` / `tool_result` events, which come from the MCP
   side in real time.
2. **No mid-conversation system messages.** Volatile context goes inside the user turn in
   `<oak_context>` tags. History is append-only by construction, since the CLI owns it.
3. **The hint rung is bound per turn through the `X-Oak-Turn` header.** The server maps the token to
   the turn's context; the model never supplies the rung. Expire tokens when the process exits.
4. **`total_cost_usd` is a list-price figure and is cumulative per session** (0.031 → 0.040 → 0.061
   across turns A–C). On a subscription it is not a bill. Show "included in your Claude plan" and log
   token counts instead.
5. **The CLI stores sessions under `~/.claude/projects/<cwd>/`.** Use one dedicated working directory
   (e.g. `~/.oak/tutor-cwd`) and keep Oak's own transcript in SQLite as the source of truth. If a
   session file is missing, start a new session seeded from Oak's transcript.
6. **Not available here:** the `fallbacks: "default"` request parameter (the CLI has `--fallback-model`),
   explicit cache breakpoints, `thinking.display`, per-request betas (`--betas` is API-key only).
7. **A killed process leaves no `result` event.** Treat "stream ended without result" as aborted.
8. **`--bare` cannot be used:** it never reads the claude.ai login. `--setting-sources ""` plus
   `--strict-mcp-config`, `--tools ""` and `--disable-slash-commands` gives the same isolation.
9. Built-in agents still appear in the init event, but without the built-in tools there is no way to
   start one.

## Proposed design change

`TutorBackend` interface with two implementations behind the same SSE protocol and the same tool
executors: `anthropic-api` (S6) and `claude-cli` (this spike). Selection order: explicit setting, then an
API key if present, then a logged-in `claude` on the PATH, otherwise the tutor is off. Settings shows
which backend is active. The tool executors, redaction, review schemas and thread model are shared.

## Open items

- Not measured: a long-lived process with `--input-format stream-json` (not needed at these latencies).
- Not tested: rate-limit and "usage limit reached" errors on a subscription, and what the stream looks
  like then.
- The S6 live check against the API itself (strict + eager tools, `fallbacks`, 1 h cache breakpoint)
  still needs an API key; this spike does not cover it.
- Terms: scripting your own CLI on your own machine is the documented headless use. Anthropic's docs
  steer products for other people to API keys, so the CLI backend stays a personal-use option.
