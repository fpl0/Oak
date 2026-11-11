// Offline probe: what does SDK 1.8.0 actually put on the wire for our request, and how does its
// stream accumulator treat truncated eager tool input? Run: bun spikes/s6-tutor/probe-wire.ts
import { maxTokensMidToolCassette, messageEnd, messageStart, plainCassette, toolUseBlock } from './cassette.ts';
import { sdkCassetteClient } from './fake-client.ts';
import { PREFIX } from './harness.ts';
import { buildRequest, CHAT_ROUTE } from './request.ts';

const a = sdkCassetteClient(plainCassette('hi'));
const s = a.anthropic.beta.messages.stream(buildRequest(PREFIX, [{ role: 'user', content: 'hello' }], CHAT_ROUTE));
const m = await s.finalMessage();
const w = a.wire[0]!;
console.log('URL      ', w.method, w.url);
console.log('HEADERS  ', JSON.stringify(Object.fromEntries(Object.entries(w.headers).map(([k, v]) => [k, k === 'authorization' ? v.replace(/ .*/, ' <redacted>') : v])), null, 1));
console.log('BODY KEYS', Object.keys(w.body).join(', '));
console.log('fallbacks', JSON.stringify(w.body.fallbacks), '| betas in body:', 'betas' in w.body, '| stream:', w.body.stream);
console.log('thinking ', JSON.stringify(w.body.thinking), '| output_config', JSON.stringify(w.body.output_config), '| tool_choice', JSON.stringify(w.body.tool_choice));
console.log('tools    ', (w.body.tools as { name: string; strict?: boolean; eager_input_streaming?: boolean }[]).map((t) => `${t.name}(strict=${t.strict},eager=${t.eager_input_streaming ?? '-'})`).join(' '));
console.log('system cc', JSON.stringify((w.body.system as { cache_control?: unknown }[]).map((b) => b.cache_control ?? null)), '| top-level cache_control', JSON.stringify(w.body.cache_control));
console.log('final    ', m.stop_reason, JSON.stringify(m.content), 'request_id=', s.request_id);

// Truncated tool input, as with eager_input_streaming + max_tokens.
const b = sdkCassetteClient(maxTokensMidToolCassette());
const s2 = b.anthropic.beta.messages.stream(buildRequest(PREFIX, [{ role: 'user', content: 'hello' }], CHAT_ROUTE));
try {
  const m2 = await s2.finalMessage();
  console.log('TRUNCATED (max_tokens) -> finalMessage resolved; tool_use.input =', JSON.stringify(m2.content.find((c) => c.type === 'tool_use')));
} catch (e) {
  console.log('TRUNCATED (max_tokens) -> finalMessage REJECTED:', (e as Error).constructor.name, (e as Error).message.slice(0, 160));
}

// Same truncated JSON but stop_reason tool_use (what a buggy/eager stream could hand us).
const c = sdkCassetteClient({ name: 't', responses: [{ steps: [messageStart('m'), ...toolUseBlock(0, 'toolu_x', 'propose_code', ['{"title":"Half a ca', 'rd","code":"n(\\"0 1']), ...messageEnd('tool_use', 5)] }] });
const s3 = c.anthropic.beta.messages.stream(buildRequest(PREFIX, [{ role: 'user', content: 'hello' }], CHAT_ROUTE));
try {
  const m3 = await s3.finalMessage();
  console.log('TRUNCATED (tool_use)   -> finalMessage resolved; tool_use.input =', JSON.stringify(m3.content.find((c) => c.type === 'tool_use')));
} catch (e) {
  console.log('TRUNCATED (tool_use)   -> finalMessage REJECTED:', (e as Error).constructor.name, (e as Error).message.slice(0, 160));
}

// Garbage (not even a JSON prefix).
const d = sdkCassetteClient({ name: 'g', responses: [{ steps: [messageStart('m'), ...toolUseBlock(0, 'toolu_y', 'propose_code', ['{"title": nope nope']), ...messageEnd('tool_use', 5)] }] });
const s4 = d.anthropic.beta.messages.stream(buildRequest(PREFIX, [{ role: 'user', content: 'hello' }], CHAT_ROUTE));
try {
  const m4 = await s4.finalMessage();
  console.log('GARBAGE JSON           -> finalMessage resolved; tool_use.input =', JSON.stringify(m4.content.find((c) => c.type === 'tool_use')));
} catch (e) {
  console.log('GARBAGE JSON           -> finalMessage REJECTED:', (e as Error).constructor.name, (e as Error).message.slice(0, 160));
}

// How tolerant is the SDK's partial parser? (decides whether the loop can ever see a parse exception)
for (const garbage of ['{"title": nope nope', 'not json at all', '{"a":1}}}', '{"code":"n(\\"0 1\\")","cycles":2', '[1,2', '"just a string"']) {
  const g = sdkCassetteClient({ name: 'g', responses: [{ steps: [messageStart('m'), ...toolUseBlock(0, 'toolu_g', 'evaluate_strudel', [garbage]), ...messageEnd('tool_use', 5)] }] });
  const gs = g.anthropic.beta.messages.stream(buildRequest(PREFIX, [{ role: 'user', content: 'hello' }], CHAT_ROUTE));
  let iterErr = 'none';
  try {
    for await (const _ of gs) {
      /* drain */
    }
  } catch (e) {
    iterErr = `${(e as Error).constructor.name}: ${(e as Error).message.slice(0, 70)}`;
  }
  let fin: string;
  try {
    fin = 'resolved input=' + JSON.stringify((await gs.finalMessage()).content.find((c) => c.type === 'tool_use')?.input);
  } catch (e) {
    fin = `REJECTED ${(e as Error).constructor.name}: ${(e as Error).message.slice(0, 70)}`;
  }
  console.log(`PARSE ${JSON.stringify(garbage).padEnd(44)} iterate: ${iterErr} | finalMessage: ${fin}`);
}
