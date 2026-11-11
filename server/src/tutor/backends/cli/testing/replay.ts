// Feed a recording straight into the translator, without a process. Test code only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TutorEvent } from "../../../events.ts";
import type { ProcessResult, StreamLine } from "../process.ts";
import { StreamTranslator, type TranslatorOptions } from "../translate.ts";

export const SESSION = "11111111-2222-4333-8444-555555555555";
export const OAK_TOOLS = [
  "mcp__oak__compare_haps",
  "mcp__oak__evaluate_strudel",
  "mcp__oak__get_learner_progress",
  "mcp__oak__get_lesson_context",
  "mcp__oak__propose_code",
];

export function fixtureLines(name: string): StreamLine[] {
  return readFileSync(join(import.meta.dir, "fixtures", name), "utf8")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l.replaceAll("SESSION_ID", SESSION)) as StreamLine);
}

export const exited = (over: Partial<ProcessResult> = {}): ProcessResult => ({
  exitCode: 0,
  stderr: "",
  aborted: false,
  timedOut: false,
  stopped: null,
  spawnError: null,
  ...over,
});

export interface Replayed {
  translator: StreamTranslator;
  events: TutorEvent[];
  text: string;
  /** Reasons passed to `stop`, in order. */
  stops: string[];
  /** Lines the translator was given before it asked for the kill. */
  delivered: number;
}

/** Like process.ts: once `stop` has been called, no further line is delivered. */
export function replay(
  lines: readonly StreamLine[],
  opts: Partial<Omit<TranslatorOptions, "emit">> = {},
): Replayed {
  const events: TutorEvent[] = [];
  const stops: string[] = [];
  const translator = new StreamTranslator({
    expectedTools: OAK_TOOLS,
    maxIterations: 6,
    model: "claude-opus-5-5",
    emit: (e) => events.push(e),
    ...opts,
  });
  let delivered = 0;
  for (const line of lines) {
    if (stops.length > 0) break;
    translator.push(line, (reason) => stops.push(reason));
    delivered++;
  }
  const text = events.map((e) => (e.type === "text" ? e.data.delta : "")).join("");
  return { translator, events, text, stops, delivered };
}
