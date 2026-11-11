// The scripted conversations the backend tests replay. The scripted "model" never writes a
// solution itself, so solution text seen in a later request can only have come from Oak's own
// tool results or context. Test code only.
import { EXERCISE_REF, LEARNER_CODE, LESSON_ID, STEP_ID } from "../../../testing/fixtures.ts";
import {
  type Cassette,
  type CassetteResponse,
  chunkJson,
  fallbackBlock,
  response,
  textBlock,
  thinkingBlock,
  toolUseBlock,
} from "./builders.ts";

export const LESSON_CONTEXT_INPUT = { lesson_id: LESSON_ID, step_id: STEP_ID };
export const COMPARE_INPUT = {
  learner_code: null,
  target: { kind: "exercise", ref: EXERCISE_REF },
  from_bar: 1,
  bars: 1,
  mode: "auto",
};
export const CARD_INPUT = {
  kind: "example",
  title: "Same shape in C",
  code: 'mel: n("0 2 4").scale("C4:major")',
  explanation: "Listen to where the top note sits.",
  bars: 4,
};

export const cassette = (name: string, ...responses: CassetteResponse[]): Cassette => ({ name, responses });

/** Several cassettes played back to back, for tests that run more than one turn. */
export function sequence(name: string, ...parts: Cassette[]): Cassette {
  return { name, responses: parts.flatMap((p) => p.responses) };
}

export function textOnly(text = ["Look at beat 3 of bar 1. ", "Which number is the octave?"]): Cassette {
  return cassette(
    "text-only",
    response(
      "msg_t1",
      [thinkingBlock(0, ["The learner wants the answer. ", "Ask first."]), textBlock(1, text)],
      "end_turn",
      {
        usage: { input: 42, cacheWrite1h: 6000 },
        output: 30,
      },
    ),
  );
}

/** get_lesson_context, then compare_haps, then text: three requests. */
export function toolTurn(): Cassette {
  return cassette(
    "tool-turn",
    response(
      "msg_u1",
      [
        thinkingBlock(0, ["Check the lesson first."], "sig-one=="),
        textBlock(1, ["Let me look at the step."]),
        toolUseBlock(2, "toolu_01", "get_lesson_context", chunkJson(LESSON_CONTEXT_INPUT)),
      ],
      "tool_use",
      { usage: { input: 42, cacheWrite1h: 6000 }, output: 90 },
    ),
    response("msg_u2", [toolUseBlock(0, "toolu_02", "compare_haps", chunkJson(COMPARE_INPUT))], "tool_use", {
      usage: { input: 30, cacheRead: 6000, cacheWrite5m: 400 },
      output: 70,
    }),
    response(
      "msg_u3",
      [textBlock(0, ["Where does your last note land ", "compared with the first?"])],
      "end_turn",
      {
        usage: { input: 20, cacheRead: 6400, cacheWrite5m: 150 },
        output: 25,
      },
    ),
  );
}

/** A model that asks every tool for everything, two calls per response. Used by the leak tests. */
export function greedy(tag = "g"): Cassette {
  return cassette(
    "greedy",
    response(
      `msg_${tag}1`,
      [
        toolUseBlock(0, `toolu_${tag}1`, "get_lesson_context", chunkJson(LESSON_CONTEXT_INPUT)),
        toolUseBlock(1, `toolu_${tag}2`, "compare_haps", chunkJson(COMPARE_INPUT)),
      ],
      "tool_use",
    ),
    response(
      `msg_${tag}2`,
      [
        toolUseBlock(0, `toolu_${tag}3`, "get_learner_progress", ["{}"]),
        toolUseBlock(
          1,
          `toolu_${tag}4`,
          "evaluate_strudel",
          chunkJson({ code: LEARNER_CODE, from_bar: 1, bars: 1, key: "D dorian" }),
        ),
      ],
      "tool_use",
    ),
    response(`msg_${tag}3`, [textBlock(0, ["Which number is the octave?"])], "end_turn"),
  );
}

/** A card whose input streams eagerly in small fragments, then closing text. */
export function proposeCode(): Cassette {
  return cassette(
    "propose-code",
    response(
      "msg_c1",
      [
        textBlock(0, ["Here is the same idea in another key."]),
        toolUseBlock(1, "toolu_c1", "propose_code", chunkJson(CARD_INPUT, 5)),
      ],
      "tool_use",
    ),
    response("msg_c2", [textBlock(0, ["Play it and listen for the top."])], "end_turn"),
  );
}

/**
 * The card's JSON stops early although the response claims a complete tool call. The SDK's
 * tolerant parser hands back a shortened object with required fields missing and no error.
 */
export function proposeTruncatedJson(): Cassette {
  return cassette(
    "propose-truncated-json",
    response(
      "msg_j1",
      [
        toolUseBlock(0, "toolu_j1", "propose_code", [
          '{"kind":"example","title":"Half a ca',
          'rd","code":"mel: n(\\"0 2',
        ]),
      ],
      "tool_use",
    ),
    response("msg_j2", [textBlock(0, ["Let me put that differently."])], "end_turn"),
  );
}

/** Tool input the SDK cannot parse at all: it throws a bare AnthropicError. */
export function unparseableToolJson(): Cassette {
  return cassette(
    "unparseable-tool-json",
    response(
      "msg_x1",
      [toolUseBlock(0, "toolu_x1", "get_learner_progress", ["not json at all"])],
      "tool_use",
    ),
  );
}

export function invalidToolInput(): Cassette {
  return cassette(
    "invalid-tool-input",
    response(
      "msg_i1",
      [
        toolUseBlock(
          0,
          "toolu_i1",
          "evaluate_strudel",
          chunkJson({ code: 'n("0 1")', bars: "two", extra: true }),
        ),
      ],
      "tool_use",
    ),
    response("msg_i2", [textBlock(0, ["Trying that another way."])], "end_turn"),
  );
}

/** A model that tries to pass a hint rung of its own with its tool calls. */
export function rungSmuggling(): Cassette {
  return cassette(
    "rung-smuggling",
    response(
      "msg_h1",
      [
        toolUseBlock(0, "toolu_h1", "get_lesson_context", chunkJson({ ...LESSON_CONTEXT_INPUT, rung: 4 })),
        toolUseBlock(
          1,
          "toolu_h2",
          "compare_haps",
          chunkJson({ ...COMPARE_INPUT, hint_rung: 4, passed: true }),
        ),
      ],
      "tool_use",
    ),
    response("msg_h2", [textBlock(0, ["Let us look at bar 1."])], "end_turn"),
  );
}

export function pauseTurn(): Cassette {
  return cassette(
    "pause-turn",
    response("msg_p1", [textBlock(0, ["Working on it"])], "pause_turn"),
    response("msg_p2", [textBlock(0, [" ... done."])], "end_turn"),
  );
}

/** Opus declines part-way, a fallback model finishes: thinking and a tool call sit before the boundary. */
export function fallbackServed(fallbackModel = "claude-sonnet-5"): Cassette {
  return cassette(
    "fallback-served",
    response(
      "msg_f1",
      [
        thinkingBlock(0, ["From the first model."], "sig-first=="),
        toolUseBlock(1, "toolu_dropped", "get_learner_progress", ["{}"]),
        fallbackBlock(2, "claude-opus-5-5", fallbackModel),
        thinkingBlock(3, ["From the fallback."], "sig-second=="),
        toolUseBlock(4, "toolu_kept", "get_learner_progress", ["{}"]),
      ],
      "tool_use",
      {
        model: fallbackModel,
        usage: {
          input: 50,
          nullCache: true,
          iterations: [
            {
              type: "fallback_message",
              model: fallbackModel,
              input_tokens: 50,
              output_tokens: 20,
              cache_creation: null,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          ],
        },
      },
    ),
    response("msg_f2", [textBlock(0, ["Here is where you are."])], "end_turn", { model: fallbackModel }),
  );
}
