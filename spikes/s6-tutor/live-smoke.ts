#!/usr/bin/env bun
// LIVE smoke for the tutor request shape. SPENDS MONEY (a few cents). NOT run by the spike.
//
//   ANTHROPIC_API_KEY=sk-ant-... bun spikes/s6-tutor/live-smoke.ts --yes
//   bun spikes/s6-tutor/live-smoke.ts --dry-run        # same script against a cassette; no key, no network
//
// What it proves against the real API:
//   1. The exact production request (claude-opus-5-5, beta server-side-fallback-2026-07-01 +
//      fallbacks:"default", adaptive thinking display:"summarized", output_config.effort, strict
//      tools, eager_input_streaming on propose_code, 1h cache_control on the last system block,
//      top-level 5m cache_control, a mid-conversation {role:"system"} message) is ACCEPTED (no 400).
//   2. A streamed chat turn makes a tool call and completes through the manual loop.
//   3. A second conversation with the identical tools+system prefix reads the cache:
//      usage.cache_read_input_tokens > 0.
//   4. Prints per-request usage, served-by model / fallback iterations, and a cost estimate.

export {}; // make this a module (top-level await)

const DRY = process.argv.includes('--dry-run');
const YES = process.argv.includes('--yes');
const KEY = process.env.ANTHROPIC_API_KEY;

if (!DRY && (!KEY || !YES)) {
  console.error(
    [
      'live-smoke: refusing to run.',
      `  ANTHROPIC_API_KEY ${KEY ? 'is set' : 'is NOT set'}; --yes ${YES ? 'was passed' : 'was NOT passed'}.`,
      '  This script calls api.anthropic.com and costs money (estimate: $0.04-$0.10, hard ceiling about $0.40).',
      '  Run:  ANTHROPIC_API_KEY=... bun spikes/s6-tutor/live-smoke.ts --yes',
      '  Or:   bun spikes/s6-tutor/live-smoke.ts --dry-run   (cassette, free)',
    ].join('\n'),
  );
  process.exit(2);
}

// Everything below is imported only after the guard, so an unguarded run cannot even construct a client.
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const { runTurn } = await import('./loop.ts');
const { buildTurnMessages, prefixBytes, buildRequest, BETAS, MODEL } = await import('./request.ts');
const { defaultToolCtx } = await import('./tools.ts');
const { oakContext } = await import('./redaction.ts');
const { LESSON } = await import('./lesson-fixture.ts');
const { addUsage, emptyUsage, costUsd } = await import('./pricing.ts');
type TutorClient = import('./client.ts').TutorClient;
type TutorStream = import('./client.ts').TutorStream;
type Prefix = import('./request.ts').Prefix;
type RouteCfg = import('./request.ts').RouteCfg;
type BetaMessage = import('@anthropic-ai/sdk/resources/beta/messages/messages').BetaMessage;
type BetaMessageParam = import('@anthropic-ai/sdk/resources/beta/messages/messages').BetaMessageParam;
type TutorEvent = import('./events.ts').TutorEvent;

// A deterministic static prefix comfortably above the minimum cacheable size (worst case 4096 tokens).
function smokePrefix(): Prefix {
  const fns = Array.from({ length: 160 }, (_, i) => {
    const id = String(i).padStart(3, '0');
    return `fn_${id}(pattern) — catalog entry ${id}: applies transformation ${id} to the pattern; example: n("0 ${i % 7} ${(i * 3) % 7}").fn_${id}("${i % 5}"); unlocked by lesson u${String(1 + (i % 20)).padStart(2, '0')}.${String(1 + (i % 9)).padStart(2, '0')}.`;
  });
  return {
    persona:
      "You are Oak's music-theory tutor. Be brief and Socratic. Oak's checker decides pass/fail, not you. When asked what code plays, call evaluate_strudel before answering. Use propose_code for any code you show.",
    syllabus: 'Syllabus v-smoke\n' + Array.from({ length: 40 }, (_, i) => `u${String(i).padStart(2, '0')}: unit ${i} — objectives, concepts and unlocks for unit ${i}.`).join('\n'),
    catalog: 'Strudel function catalog v-smoke\n' + fns.join('\n'),
  };
}

const ROUTE: RouteCfg = { maxTokens: 4000, effort: 'medium', maxIterations: 3 }; // smaller max_tokens than chat (16000) only to cap spend

interface Rec {
  n: number;
  model: string;
  stop: string | null;
  requestId: string | null | undefined;
  usage: BetaMessage['usage'];
  betaHeaderSent: string;
  fallbackIterations: number;
}
const recs: Rec[] = [];

/** Wraps a TutorClient to log each request's final usage. */
function recording(inner: TutorClient): TutorClient {
  return {
    stream(params, options) {
      const s = inner.stream(params, options);
      const wrapped: TutorStream = {
        [Symbol.asyncIterator]: () => s[Symbol.asyncIterator](),
        abort: () => s.abort(),
        async finalMessage() {
          const m = await s.finalMessage();
          recs.push({
            n: recs.length + 1,
            model: m.model,
            stop: m.stop_reason,
            requestId: s.request_id,
            usage: m.usage,
            betaHeaderSent: (params.betas ?? []).join(','),
            fallbackIterations: (m.usage.iterations ?? []).filter((i) => i.type === 'fallback_message').length,
          });
          return m;
        },
      };
      return wrapped;
    },
  };
}

async function makeClient(): Promise<TutorClient> {
  if (DRY) {
    const { sdkCassetteClient } = await import('./fake-client.ts');
    const { messageStart, messageEnd, textBlock, toolUseBlock, chunkJson } = await import('./cassette.ts');
    return sdkCassetteClient({
      name: 'smoke-dry-run',
      responses: [
        { steps: [messageStart('msg_s1', { input: 80, cacheWrite1h: 9000 }), ...toolUseBlock(0, 'toolu_s1', 'evaluate_strudel', chunkJson({ code: 'n("0 2 4 6").scale("D:dorian")', cycles: 1 })), ...messageEnd('tool_use', 60)] },
        { steps: [messageStart('msg_s2', { input: 30, cacheRead: 9000, cacheWrite5m: 300 }), ...textBlock(0, ['62, 65, 69 and 72.']), ...messageEnd('end_turn', 20)] },
        { steps: [messageStart('msg_s3', { input: 60, cacheRead: 9000 }), ...textBlock(0, ['A scale degree is a position in the scale.']), ...messageEnd('end_turn', 15)] },
      ],
    }).client;
  }
  const { sdkClient } = await import('./client.ts');
  // apiKey passed explicitly: never fall through to an OAuth profile or another ambient credential.
  return sdkClient(new Anthropic({ apiKey: KEY!, maxRetries: 2 }));
}

function check(name: string, ok: boolean, detail = ''): boolean {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  return ok;
}

async function turn(client: TutorClient, prefix: Prefix, userText: string, attempt: number): Promise<{ events: TutorEvent[]; conversation: BetaMessageParam[] }> {
  const conversation: BetaMessageParam[] = buildTurnMessages({
    userText,
    learnerCode: 'n("0 2 4 6").scale("D:dorian")',
    oakContext: oakContext(LESSON, 0, { attempt, streak: 1, now: new Date().toISOString() }), // volatile on purpose
  });
  const events: TutorEvent[] = [];
  for await (const ev of runTurn({ client, prefix, route: ROUTE, conversation, toolCtx: defaultToolCtx(0), signal: AbortSignal.timeout(180_000) })) {
    events.push(ev);
    if (ev.type === 'text') process.stdout.write(ev.data.delta);
    else if (ev.type === 'thinking') process.stdout.write(`\x1b[2m${ev.data.delta}\x1b[0m`);
    else console.log(`\n[${ev.type}] ${JSON.stringify(ev.data)}`);
  }
  return { events, conversation };
}

const prefix = smokePrefix();
const probe = buildRequest(prefix, [], ROUTE);
console.log(`live-smoke ${DRY ? '(DRY RUN, cassette)' : '(LIVE)'}: model=${MODEL} betas=${BETAS.join(',')} fallbacks=${JSON.stringify(probe.fallbacks)} prefix=${prefixBytes(probe).length} bytes`);

const client = recording(await makeClient());
let ok = true;
try {
  console.log('\n--- call A: streamed chat turn that should use evaluate_strudel ---');
  const a = await turn(client, prefix, 'Use the evaluate_strudel tool on my code for 1 cycle, then tell me the four MIDI note numbers it plays in one short sentence.', 1);
  const aRequests = recs.length;
  ok = check('A: request accepted with beta + fallbacks:"default" + strict/eager tools + 1h cache_control + mid-conversation system message', !a.events.some((e) => e.type === 'error' && e.data.kind === 'bad_request')) && ok;
  ok = check('A: at least one evaluate_strudel tool call executed', a.events.some((e) => e.type === 'tool_result' && e.data.name === 'evaluate_strudel' && e.data.ok)) && ok;
  ok = check('A: turn finished (done)', a.events.at(-1)?.type === 'done', JSON.stringify(a.events.at(-1))) && ok;
  ok = check('A: all tool_results for one assistant message in one user message', a.conversation.filter((m) => m.role === 'user').length === 2) && ok;
  const first = recs[0];
  ok = check('A#1: static prefix was written to or read from the cache', !!first && (first.usage.cache_creation_input_tokens ?? 0) + (first.usage.cache_read_input_tokens ?? 0) > 0, first ? `write=${first.usage.cache_creation_input_tokens} read=${first.usage.cache_read_input_tokens}` : 'no request') && ok;
  if (aRequests >= 2) ok = check('A#2: follow-up request in the same turn reads the cache', (recs[1]!.usage.cache_read_input_tokens ?? 0) > 0, `read=${recs[1]!.usage.cache_read_input_tokens}`) && ok;

  console.log('\n--- call B: NEW conversation, identical tools+system prefix, different volatile context ---');
  const b = await turn(client, prefix, 'In one sentence: what is a scale degree?', 2);
  const bFirst = recs[aRequests];
  ok = check('B: turn finished (done)', b.events.at(-1)?.type === 'done', JSON.stringify(b.events.at(-1))) && ok;
  ok = check('B#1: usage.cache_read_input_tokens > 0 (identical-prefix cache hit)', !!bFirst && (bFirst.usage.cache_read_input_tokens ?? 0) > 0, bFirst ? `read=${bFirst.usage.cache_read_input_tokens} write=${bFirst.usage.cache_creation_input_tokens} input=${bFirst.usage.input_tokens}` : 'no request') && ok;
} catch (e) {
  ok = false;
  if (e instanceof Anthropic.APIError) console.error(`\nAPI error: status=${e.status} type=${e.type} errorCode=${e.errorCode} requestID=${e.requestID}\n${e.message}`);
  else console.error(e);
}

console.log('\n--- per-request usage ---');
let total = emptyUsage();
for (const r of recs) {
  total = addUsage(total, r.usage, r.model);
  const one = addUsage(emptyUsage(), r.usage, r.model);
  console.log(
    `#${r.n} model=${r.model} stop=${r.stop} request_id=${r.requestId} beta=${r.betaHeaderSent} input=${r.usage.input_tokens} output=${r.usage.output_tokens} cache_read=${r.usage.cache_read_input_tokens} cache_write=${r.usage.cache_creation_input_tokens} (1h=${r.usage.cache_creation?.ephemeral_1h_input_tokens ?? '?'} 5m=${r.usage.cache_creation?.ephemeral_5m_input_tokens ?? '?'}) fallback_iterations=${r.fallbackIterations} cost=$${costUsd(one).toFixed(5)}`,
  );
}
console.log(`TOTAL requests=${total.requests} input=${total.inputTokens} output=${total.outputTokens} cache_read=${total.cacheReadInputTokens} cache_write=${total.cacheCreationInputTokens} served_by=${total.servedBy.join(',')} estimated_cost=$${total.costUsd.toFixed(5)}`);
console.log(`fallback served any request: ${recs.some((r) => r.fallbackIterations > 0 || r.model !== MODEL)} (false is the expected result for a benign prompt; the check here is that the parameter is accepted)`);
console.log(ok ? '\nSMOKE OK' : '\nSMOKE FAILED');
process.exit(ok ? 0 : 1);
