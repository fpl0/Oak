// review:security (Wave 7): the offline renderer's frame (/offline-render.html) is the one document Oak lets be
// framed (contracts §11.2). It must do nothing the app cannot: it renders only what its own parent, on Oak's origin,
// asks for, once. A page that opens it in a window, another frame, or a message from another origin gets nothing.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
// Imported before `window` exists: Strudel's modules look for a document when they see one.
import { installPieceRenderFrame } from "./frame.ts";

interface Posted {
  data: unknown;
  origin: string;
}
const ORIGIN = "http://127.0.0.1:8787";
const posted: Posted[] = [];
const parent = { postMessage: (data: unknown, origin: string) => posted.push({ data, origin }) };
const target = new EventTarget();
const g = globalThis as unknown as Record<string, unknown>;
const saved = { window: g.window, location: g.location };

beforeAll(() => {
  g.window = Object.assign(target, { parent });
  g.location = { origin: ORIGIN };
});
afterAll(() => {
  g.window = saved.window;
  g.location = saved.location;
});

const send = (data: unknown, origin: string, source: unknown) =>
  target.dispatchEvent(Object.assign(new Event("message"), { data, origin, source }));
const types = () => posted.map((p) => (p.data as { type: string }).type);
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe("the render frame answers only its parent on Oak's origin", () => {
  test("foreign origin, foreign source or a foreign message type: nothing runs; the parent's first request does", async () => {
    installPieceRenderFrame();
    expect(types()).toEqual(["oak-piece-ready"]);
    expect(posted.every((p) => p.origin === ORIGIN)).toBe(true);
    // A loop is refused before anything is evaluated: the request's reply is "failed", which is how a run is seen.
    const request = { code: "for (;;) {}", band: null, key: null, muted: [], solo: null, sampleRate: 48000 };
    const msg = { type: "oak-piece-render", request };
    send(msg, "http://evil.example", parent);
    send(msg, ORIGIN, { postMessage: () => undefined });
    send(msg, "null", parent);
    send({ ...msg, type: "something-else" }, ORIGIN, parent);
    await settle();
    expect(types()).toEqual(["oak-piece-ready"]);
    send(msg, ORIGIN, parent);
    await settle();
    expect(types()).toEqual(["oak-piece-ready", "oak-piece-failed"]);
    // One take per frame: a second request is ignored.
    send(msg, ORIGIN, parent);
    await settle();
    expect(types()).toEqual(["oak-piece-ready", "oak-piece-failed"]);
    expect(posted.every((p) => p.origin === ORIGIN)).toBe(true);
  });
});
