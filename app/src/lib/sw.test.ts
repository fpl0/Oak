// The service worker (app/public/sw.js) loaded in a fake worker scope: which requests it answers. W7 gate: a
// navigation to /dev/* never falls back to the cached index (contracts §11.1 rule 7: the dev screens exist only
// with OAK_DEV), in any spelling; the app's own routes still do.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

type Listener = (event: unknown) => void;

function loadWorker() {
  const listeners = new Map<string, Listener>();
  const self = {
    location: { href: "http://127.0.0.1:9871/sw.js?pack=v1", origin: "http://127.0.0.1:9871" },
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const source = readFileSync(join(import.meta.dir, "../../public/sw.js"), "utf8");
  runInNewContext(source, {
    self,
    URL,
    caches: {},
    fetch: () => Promise.reject(new Error("offline")),
    console,
  });
  const fetchListener = listeners.get("fetch");
  if (!fetchListener) throw new Error("no fetch listener");
  /** True when the worker answers the request itself (respondWith), false when it lets it go to the network. */
  return (path: string, mode = "navigate") => {
    let answered = false;
    fetchListener({
      request: { method: "GET", url: `http://127.0.0.1:9871${path}`, mode },
      respondWith: (p: Promise<unknown>) => {
        answered = true;
        p.catch(() => undefined);
      },
      waitUntil: () => undefined,
    });
    return answered;
  };
}

describe("service worker routing", () => {
  const answers = loadWorker();

  test("dev screens go to the network in every spelling (the production server answers 404)", () => {
    for (const p of ["/dev", "/dev/qa", "/DEV/qa", "/%64ev/listen", "/Dev/workbench?x=1"]) {
      expect(answers(p)).toBe(false);
    }
  });

  test("the API is never intercepted; app routes and the shell are", () => {
    expect(answers("/api/health", "cors")).toBe(false);
    expect(answers("/today")).toBe(true);
    expect(answers("/developer-notes")).toBe(true);
    expect(answers("/assets/index.js", "no-cors")).toBe(true);
  });
});
