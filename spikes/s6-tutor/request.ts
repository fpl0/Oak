// The ONLY place tutor request params are assembled.
// Everything here typechecks against @anthropic-ai/sdk 1.8.0 beta Messages types with no casts.
import type { AnthropicBeta } from '@anthropic-ai/sdk/resources/beta/beta';
import type {
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaSystemMessageParam,
  BetaTextBlockParam,
  BetaTool,
  BetaUserMessageParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ToolName } from './events.ts';

export const MODEL = 'claude-opus-5-5';

/** `fallbacks: "default"` needs the 2026-07-01 beta (the 2026-06-01 one only takes the array form). */
export const BETAS = ['server-side-fallback-2026-07-01'] as const satisfies readonly AnthropicBeta[];

export type Effort = 'low' | 'medium' | 'high';

export interface RouteCfg {
  /** chat 16000; hints 4000; reviews 32000. Streaming, so no SDK timeout concern. */
  maxTokens: number;
  /** Fixed per thread kind; never changes inside a conversation (it would invalidate the messages cache). */
  effort: Effort;
  maxIterations: number;
}

export const CHAT_ROUTE: RouteCfg = { maxTokens: 16000, effort: 'medium', maxIterations: 6 };

/** The three frozen system blocks. Strings are generated at content-build time and versioned. */
export interface Prefix {
  persona: string;
  syllabus: string;
  catalog: string;
}

// ---------------------------------------------------------------------------------------------
// Tools. Strict (schema-guaranteed input) => every object needs additionalProperties:false and
// every property listed in `required`. Strict schemas cannot express minimum/maximum/minLength,
// so executors still clamp/validate (see tools.ts).
// eager_input_streaming only on propose_code (binding resolution 10): its `code` argument is the
// only large input and the UI wants to show it as it streams.
// ---------------------------------------------------------------------------------------------
const TOOL_DEFS = [
  {
    name: 'propose_code',
    description:
      'Show the learner a Strudel code card (title, code, one-paragraph explanation). Use this instead of pasting code blocks in prose. The card is validated by Oak before it is shown; if it fails you get the errors back.',
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short card title, at most 60 characters.' },
        code: { type: 'string', description: 'Complete, runnable Strudel code.' },
        explanation: { type: 'string', description: 'What the code demonstrates, in one short paragraph.' },
      },
      required: ['title', 'code', 'explanation'],
      additionalProperties: false,
    },
  },
  {
    name: 'evaluate_strudel',
    description:
      'Run Strudel code headlessly and return the resulting note events (onset, duration, midi, sound) or the error. Call this before claiming what a piece of code does.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Strudel code to evaluate.' },
        cycles: { type: 'integer', description: 'Number of cycles to query, 1 to 16.' },
      },
      required: ['code', 'cycles'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_lesson_context',
    description:
      "Fetch the current lesson step: objectives, rubric, the checker's latest issues, and what you are allowed to reveal at the learner's current hint rung.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: { lesson_id: { type: 'string', description: 'Lesson id, e.g. "u03.04".' } },
      required: ['lesson_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'compare_haps',
    description:
      "Deterministically compare the learner's code against a lesson target and return a diff of pitch and onset accuracy. You only explain the diff; Oak's checker decides pass/fail.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        learner_code: { type: 'string', description: "The learner's current code, verbatim." },
        target_id: { type: 'string', description: 'Target id from get_lesson_context.' },
      },
      required: ['learner_code', 'target_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_learner_progress',
    description: "Fetch the learner's unlocked toolbox, mastery per skill, and recent recurring errors.",
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
] as const satisfies readonly (BetaTool & { name: ToolName })[];

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

/** Name-sorted, deep-frozen. Sorting uses code-unit order (not locale) so it is machine-independent. */
export const TOOLS: readonly BetaTool[] = deepFreeze(
  [...TOOL_DEFS].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
);

export const TOOL_NAMES: readonly ToolName[] = TOOL_DEFS.map((t) => t.name);

export function buildSystem(prefix: Prefix): BetaTextBlockParam[] {
  return [
    { type: 'text', text: prefix.persona },
    { type: 'text', text: prefix.syllabus },
    // One explicit breakpoint at the end of the static prefix. tools render before system, so this
    // caches tools + all three system blocks together for an hour.
    { type: 'text', text: prefix.catalog, cache_control: { type: 'ephemeral', ttl: '1h' } },
  ];
}

/**
 * Build one request. `messages` is the append-only conversation; nothing volatile may reach
 * tools/system. The returned object is a fresh literal with a fixed key order.
 */
export function buildRequest(prefix: Prefix, messages: readonly BetaMessageParam[], route: RouteCfg): BetaMessageStreamParams {
  return {
    model: MODEL,
    max_tokens: route.maxTokens,
    betas: [...BETAS],
    fallbacks: 'default',
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: route.effort },
    tool_choice: { type: 'auto' }, // forced tool_choice is a 400 on Opus 5.5
    tools: [...TOOLS],
    system: buildSystem(prefix),
    // Automatic 5-minute breakpoint on the growing conversation tail (a 1h entry before a 5m entry is valid).
    cache_control: { type: 'ephemeral' },
    messages: [...messages],
  } satisfies BetaMessageStreamParams;
}

/** The cache-relevant prefix as rendered by the API: tools, then system. */
export function prefixBytes(params: BetaMessageStreamParams): string {
  return JSON.stringify({ tools: params.tools, system: params.system });
}

/** Everything that must not vary between requests of one conversation (all params except messages). */
export function staticBytes(params: BetaMessageStreamParams): string {
  const { messages: _messages, ...rest } = params;
  return JSON.stringify(rest);
}

// ---------------------------------------------------------------------------------------------
// Volatile context: learner-authored text goes in the user turn; Oak-authored, trusted context
// goes in a mid-conversation system message directly after it (must follow a user message and be
// last or followed by an assistant turn). Neither ever touches top-level `system`.
// ---------------------------------------------------------------------------------------------
export interface TurnInput {
  userText: string;
  learnerCode?: string;
  /** Already redacted to the learner's hint rung (see redaction.ts). */
  oakContext: string;
}

export function buildTurnMessages(input: TurnInput): [BetaUserMessageParam, BetaSystemMessageParam] {
  const parts: BetaTextBlockParam[] = [];
  if (input.learnerCode !== undefined) {
    parts.push({ type: 'text', text: `<learner_code>\n${input.learnerCode}\n</learner_code>` });
  }
  parts.push({ type: 'text', text: input.userText });
  return [
    { role: 'user', content: parts },
    { role: 'system', content: `<oak_context v="1">\n${input.oakContext}\n</oak_context>` },
  ];
}
