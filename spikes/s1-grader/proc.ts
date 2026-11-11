// SPIKE S1 — subprocess fallback entry: newline-delimited JSON over stdin/stdout.
// Spawned by host.ts with Bun.spawn([process.execPath, 'proc.ts'], { env: {}, stdin: 'pipe', stdout: 'pipe' }).
import { boot, handle } from "./serve.ts";
import type { GraderRequest, WorkerInit } from "./protocol.ts";

// Started before anything else; lives on its own thread, so an infinite loop on this one cannot starve it.
new Worker(new URL("./watchdog.ts", import.meta.url).href, { name: "oak-grader-watchdog" });

// Capture stdout before learner code runs; console.* is muted/captured by the runtime per request.
const out = Bun.stdout.writer();
const send = (msg: unknown) => {
  out.write(`${JSON.stringify(msg)}\n`);
  out.flush();
};

const decoder = new TextDecoder();
let buffer = "";
for await (const chunk of Bun.stdin.stream()) {
  buffer += decoder.decode(chunk, { stream: true });
  let nl = buffer.indexOf("\n");
  while (nl >= 0) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (line.trim()) {
      const msg = JSON.parse(line) as WorkerInit | GraderRequest;
      send(msg.kind === "init" ? await boot(msg) : await handle(msg));
    }
    nl = buffer.indexOf("\n");
  }
}
