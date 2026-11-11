// The v1 tool list (contracts §10.3): seven tools, name-sorted, strict, deep-frozen, so the list
// is byte-identical in every request and the cached prefix never moves.
//
// Strict means: every object closed (`additionalProperties: false`), every property required,
// nullable where noted, and no numeric or length bounds (the schema language has none). Ranges
// are clamped by the executors, and every input is zod-validated again (schemas.ts): a truncated
// eager-streamed input can lose a required field without any error from the API.
//
// The shape is structurally a `BetaTool` of @anthropic-ai/sdk 1.8.0, and its `input_schema` is
// what the MCP endpoint of the CLI backend lists as `inputSchema`.
import { CAPSTONE_REVIEW_JSON_SCHEMA, TRANSCRIPTION_REVIEW_JSON_SCHEMA } from "../reviews.ts";

export const TOOL_NAMES = [
  "compare_haps",
  "evaluate_strudel",
  "get_learner_progress",
  "get_lesson_context",
  "propose_code",
  "submit_capstone_review",
  "submit_transcription_review",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolDef {
  readonly name: ToolName;
  readonly description: string;
  readonly strict: true;
  /** Only on propose_code: its `code` is the one large input, and the panel can show it as it streams. */
  readonly eager_input_streaming?: true;
  // Typed mutable so that `[...TOOLS]` is an SDK `BetaTool[]` without a cast; frozen at run time.
  readonly input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

function schema(properties: Record<string, unknown>): ToolDef["input_schema"] {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

const fromBar = { type: "integer", description: "First bar of the window, 1-based." };
const bars = { type: "integer", description: "Number of bars, 1 to 16." };

const DEFS: ToolDef[] = [
  {
    name: "evaluate_strudel",
    description:
      "Run Strudel code headlessly (no audio). Returns tempo, and per track the events as bar, beat, length in beats, pitch, scale degree (when a key is given), sound and chord, plus lint warnings and any locked tools the code uses. Call this before you say what a piece of code sounds like, and to check any pitch or chord claim.",
    strict: true,
    input_schema: schema({
      code: { type: "string", description: "Complete Strudel code in Oak's dialect." },
      from_bar: fromBar,
      bars,
      key: { type: ["string", "null"], description: "'C major', 'A minor', 'D dorian', or null." },
    }),
  },
  {
    name: "compare_haps",
    description:
      "Compare the learner's code with a target over a window of bars, the way Oak's checker does. Returns status, score, per-dimension scores, counts of missing, extra and wrong events, and the issues. What each issue says depends on the learner's hint rung: Oak withholds the rest. You explain the result; Oak's checker alone decides pass or fail.",
    strict: true,
    input_schema: schema({
      learner_code: {
        type: ["string", "null"],
        description: "Code to check, or null for the code now in the learner's editor.",
      },
      target: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["exercise", "code"] },
          ref: {
            type: "string",
            description: "An exercise ID for kind 'exercise'; Strudel code for kind 'code'.",
          },
        },
        required: ["kind", "ref"],
        additionalProperties: false,
      },
      from_bar: fromBar,
      bars,
      mode: {
        type: "string",
        enum: ["auto", "events", "rhythm", "melody", "harmony", "pcset"],
        description: "'auto' uses the exercise's own matcher.",
      },
    }),
  },
  {
    name: "get_learner_progress",
    description:
      "Where the learner is in the course, what they have unlocked recently, their weakest skills, skill debts, recurring feedback codes, drill families with their confusions, streak, singing tolerance and Quiet mode.",
    strict: true,
    input_schema: schema({}),
  },
  {
    name: "get_lesson_context",
    description:
      "A lesson and optionally one of its steps: objective, key, meter, tempo, the step's prompt, starter code, constraints, rubric with what is met, the learner's hint rung and attempts, and what that rung allows you to see: authored hints, known mistakes and, only after hint 4 or a pass, the solution.",
    strict: true,
    input_schema: schema({
      lesson_id: { type: "string", description: "Lesson ID, e.g. 'U03.L02'." },
      step_id: {
        type: ["string", "null"],
        description: "Step ID, e.g. 'U03.L02/S5', or null for the lesson alone.",
      },
    }),
  },
  {
    name: "propose_code",
    description:
      "Show the learner a code card. Use it for any code of two or more lines; never paste such code as text. Oak lints and runs the card before showing it: if it is rejected you get the errors and may try again. Oak alone decides whether the card can be applied or is preview-only.",
    strict: true,
    eager_input_streaming: true,
    input_schema: schema({
      kind: { type: "string", enum: ["hint", "fix", "variation", "example", "next_step"] },
      title: { type: "string", description: "Short card title." },
      code: { type: "string", description: "Complete, runnable Strudel code in Oak's dialect." },
      explanation: { type: "string", description: "One short paragraph: what to listen for." },
      bars: { type: "integer", description: "How many bars the card plays, 1 to 16." },
    }),
  },
  {
    name: "submit_capstone_review",
    description:
      "Deliver a capstone review. Only in a review conversation, exactly once, at the end. If Oak answers accepted: false, fix the listed problems and submit once more.",
    strict: true,
    input_schema: CAPSTONE_REVIEW_JSON_SCHEMA as ToolDef["input_schema"],
  },
  {
    name: "submit_transcription_review",
    description:
      "Deliver a transcription review. Only in a review conversation, exactly once, at the end. If Oak answers accepted: false, fix the listed problems and submit once more.",
    strict: true,
    input_schema: TRANSCRIPTION_REVIEW_JSON_SCHEMA as ToolDef["input_schema"],
  },
];

function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

/** Sorted by code unit, not by locale, so the order is the same on every machine. */
export const TOOLS: readonly ToolDef[] = deepFreeze(
  [...DEFS].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
);

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/** The five tools the learner-facing threads use; the two `submit_*` tools answer only in a review. */
export const LEARNER_TOOL_NAMES = TOOL_NAMES.filter((n) => !n.startsWith("submit_"));
