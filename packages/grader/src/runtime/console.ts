// Console capture. In a realm without `document`, Strudel's logger does only
// `console.log("%c" + message, css)`: wrapping console.* is the one channel for `[tonal]`, `[voicing]`
// and `[mini]` lines. Lines are captured while a request runs and passed through otherwise.
import type { LogLine } from "../types.ts";

type ConsoleMethod = (...args: unknown[]) => void;

let sink: LogLine[] | null = null;

/**
 * Bounds on what one request may log: evaluated code can call `console.log` in a callback that runs per
 * event, and every line travels back to the host. Past the limit lines are dropped and one marker says so.
 */
export const MAX_LOG_LINES = 200;
export const MAX_LOG_CHARS = 2000;
let dropped = 0;

function push(make: () => LogLine): void {
  if (sink === null) return;
  if (sink.length < MAX_LOG_LINES) {
    const line = make();
    sink.push(
      line.message.length > MAX_LOG_CHARS
        ? { ...line, message: `${line.message.slice(0, MAX_LOG_CHARS)}…` }
        : line,
    );
    return;
  }
  dropped++;
  const marker = { level: "warn" as const, tag: null, message: `(${dropped} more log lines not shown)` };
  if (dropped === 1) sink.push(marker);
  else sink[sink.length - 1] = marker;
}
let installed = false;

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function render(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_Pattern" in value) return "<Pattern>";
  return safeJson(value);
}

/** A Strudel logger line is `%c[tag]: message` plus a css argument; anything else is plain output. */
export function toLogLine(level: LogLine["level"], args: readonly unknown[]): LogLine {
  const first = args[0];
  const fromLogger = typeof first === "string" && first.startsWith("%c");
  const parts = fromLogger ? [first.slice(2), ...args.slice(2)] : args;
  const text = parts.map(render).join(" ");
  const m = fromLogger ? /^\[(\w+)\]:?\s*(.*)$/s.exec(text) : null;
  return m ? { level, tag: m[1] as string, message: m[2] as string } : { level, tag: null, message: text };
}

export function installConsoleCapture(): void {
  if (installed) return;
  installed = true;
  const hook = (level: LogLine["level"], native: ConsoleMethod): ConsoleMethod => {
    return (...args: unknown[]) => {
      if (sink) push(() => toLogLine(level, args));
      else native.apply(console, args);
    };
  };
  console.log = hook("log", console.log);
  console.info = hook("log", console.info);
  console.warn = hook("warn", console.warn);
  console.error = hook("error", console.error);
}

export function captureInto(logs: LogLine[] | null): void {
  sink = logs;
  dropped = 0;
}

/**
 * The console evaluated code sees. Bun's own console is more than logging (`for await (const line of
 * console)` reads stdin, the protocol pipe of the subprocess host), so code gets these four methods only.
 */
export const safeConsole: Readonly<Record<"log" | "info" | "warn" | "error", ConsoleMethod>> = Object.freeze({
  log: (...args: unknown[]) => console.log(...args),
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
});
