// Subprocess entry: NDJSON requests on stdin, responses on stdout. Its first act is to start the
// watchdog thread, so a child stuck in a loop never outlives a dead parent (spike S1). Spawned by the
// `bun-subprocess` host with `env: {}`.
import { maxRssBytes } from "./hosts/limits.ts";
import { decodeWire, encodeWire } from "./protocol/wire.ts";
import type { GraderInit, GraderRequest } from "./types.ts";

const watchdog = new Worker(new URL("./hosts/watchdog.bun.ts", import.meta.url).href, {
  name: "oak-grader-watchdog",
});
watchdog.postMessage({ maxRssBytes: maxRssBytes(process.argv) });

// Captured before any evaluated code can run; evaluated code sees neither Bun nor process.
const out = Bun.stdout.writer();
const send = (msg: unknown) => {
  out.write(`${encodeWire(msg)}\n`);
  out.flush();
};

const saved = { log: console.log, warn: console.warn, info: console.info };
console.log = () => {};
console.warn = () => {};
console.info = () => {};
const serve = await import("./protocol/serve.ts");
void saved;
// stdout is the protocol pipe: anything else the realm prints (outside a request's capture) goes to
// stderr, so stray output can never look like a response.
const err = Bun.stderr.writer();
const toStderr = (...args: unknown[]) => {
  err.write(`${args.map((a) => (typeof a === "string" ? a : String(a))).join(" ")}\n`);
  err.flush();
};
console.log = toStderr;
console.info = toStderr;
console.warn = toStderr;
console.error = toStderr;

const decoder = new TextDecoder();
let buffer = "";
for await (const chunk of Bun.stdin.stream()) {
  buffer += decoder.decode(chunk, { stream: true });
  let nl = buffer.indexOf("\n");
  while (nl >= 0) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (line.trim()) {
      let msg: GraderInit | GraderRequest | null = null;
      try {
        msg = decodeWire<GraderInit | GraderRequest>(line);
      } catch {
        msg = null; // not protocol: ignored
      }
      if (msg) send(msg.kind === "init" ? await serve.boot(msg) : await serve.handle(msg));
    }
    nl = buffer.indexOf("\n");
  }
}
