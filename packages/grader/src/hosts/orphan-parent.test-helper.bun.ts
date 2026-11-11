// Test helper (not a test): a parent process that owns a subprocess grader stuck in a loop, so the
// watchdog test can SIGKILL the parent and check the child dies with it.
import { createBunGraderHost } from "./bun.bun.ts";

const host = createBunGraderHost({
  backend: "bun-subprocess",
  toolbox: [],
  spare: false,
  timeoutMs: 600_000,
});
await host.ready();
void host.analyze("for (;;) {}\ns('bd')", { mode: "lesson", bars: 1, lint: null });
await new Promise((r) => setTimeout(r, 300));
console.log("READY");
await new Promise(() => {});
