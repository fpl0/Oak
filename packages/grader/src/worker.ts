// Worker entry, shared by the browser module Worker and the Bun Worker. It uses no Bun API and no DOM:
// only `postMessage` / `addEventListener` of the worker scope. `postMessage` is captured before any
// evaluation; the console is muted around the import of the runtime (@strudel/core prints a banner and
// "cannot use window" at import time); `init` is answered with `ready`, every request with a response.
import type { GraderInit, GraderRequest } from "./types.ts";

interface WorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (ev: { data: GraderInit | GraderRequest }) => void): void;
  addEventListener(type: "unhandledrejection", listener: (ev: { preventDefault(): void }) => void): void;
}

const scope = globalThis as unknown as WorkerScope;
const post = scope.postMessage.bind(scope);

// An un-awaited rejected promise in evaluated code must not take the worker down after the request.
try {
  scope.addEventListener("unhandledrejection", (ev) => ev.preventDefault());
} catch {
  // not supported by this host: the host respawns a dead worker on the next request
}

type Serve = typeof import("./protocol/serve.ts");
let serve: Promise<Serve> | null = null;

async function load(): Promise<Serve> {
  const saved = { log: console.log, warn: console.warn, info: console.info };
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
  try {
    return await import("./protocol/serve.ts");
  } finally {
    console.log = saved.log;
    console.warn = saved.warn;
    console.info = saved.info;
  }
}

let chain: Promise<void> = Promise.resolve();
scope.addEventListener("message", (ev) => {
  const msg = ev.data;
  chain = chain.then(async () => {
    serve ??= load();
    const s = await serve;
    if (msg.kind === "init") post(await s.boot(msg));
    else post(await s.handle(msg));
  });
});
