import { expect, test } from "bun:test";
import { packLine, readPackStatus } from "./pack-status.ts";

test("pack status: installed and cached, dev server, missing pack", async () => {
  const cached = await readPackStatus({
    manifest: async () => ({ packVersion: "v1" }),
    sounds: () => 212,
    worker: () => "active",
    cacheCount: async (n) => (n === "oak-sounds-v1" ? 40 : 0),
  });
  expect(cached).toEqual({ version: "v1", sounds: 212, worker: "active", cachedFiles: 40 });
  expect(packLine(cached)).toEqual({
    status: "Pack v1 · 212 sounds",
    offline: "40 sound files kept for offline use",
  });

  const dev = await readPackStatus({
    manifest: async () => ({ packVersion: "v1" }),
    sounds: () => 0,
    worker: () => "none",
    cacheCount: async () => 0,
  });
  expect(packLine(dev).status).toBe("Pack v1");
  expect(packLine(dev).offline).toStartWith("Not cached");

  const missing = await readPackStatus({
    manifest: async () => {
      throw new Error("404");
    },
    sounds: () => 0,
    worker: () => "unsupported",
    cacheCount: async () => null,
  });
  expect(missing.version).toBeNull();
  expect(packLine(missing).status).toContain("sounds:mirror");
});
