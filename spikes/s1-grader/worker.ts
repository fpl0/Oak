// SPIKE S1 — Bun Worker entry (also valid as a browser module Worker: only self/postMessage are used).
// Spawned by host.ts with { env: {}, smol: true }.
import { boot, handle } from "./serve.ts";
import type { GraderRequest, WorkerInit } from "./protocol.ts";

declare const self: {
  postMessage(msg: unknown): void;
  addEventListener(type: "message", fn: (ev: { data: WorkerInit | GraderRequest }) => void): void;
};

// Capture the channel before any learner code can run in this realm.
const post = self.postMessage.bind(self);
let chain: Promise<void> = Promise.resolve();

self.addEventListener("message", (ev) => {
  const msg = ev.data;
  chain = chain.then(async () => {
    if (msg.kind === "init") post(await boot(msg));
    else post(await handle(msg));
  });
});
