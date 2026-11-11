import { expect, test } from "bun:test";
import { createTapStream } from "./tap-stream.ts";

test("taps queued before and after a reader waits arrive in order; end finishes the reader", async () => {
  const s = createTapStream();
  s.push({ time: 1 });
  const it = s[Symbol.asyncIterator]();
  expect(await it.next()).toEqual({ value: 1, done: false });
  const pending = it.next();
  s.push({ time: 2 });
  expect(await pending).toEqual({ value: 2, done: false });
  const last = it.next();
  s.end();
  expect((await last).done).toBe(true);
  s.push({ time: 3 });
  expect(s.count).toBe(2);
});

test("return() stops the stream", async () => {
  const s = createTapStream();
  const it = s[Symbol.asyncIterator]();
  await it.return?.();
  s.push({ time: 5 });
  expect((await it.next()).done).toBe(true);
});
