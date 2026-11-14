// Test support (not a test file): the dev seeds of one test file share a snapshot folder per content object, so a point
// that several tests of the file seed is built once and restored for the others. A restore is the build it was taken
// from, table by table and file by file, with the same result (services/dev-seed-cache.test.ts proves it), so a test
// sees the learner a build makes. A snapshot is used only for the same request on the same content, on the same
// learner day and within the hour of the build's clock; any other seed builds, as it would without the folder.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContentSource } from "../content/types.ts";
import type { Harness } from "./harness.ts";

const folders = new Map<ContentSource, string>();

/**
 * `POST /api/dev/seed` on `h`, through the file's snapshot folder for `content` (the content `h` was made with). The
 * folder is chosen when the server makes its seed cache, at its first seed, so a server keeps the folder it began with.
 */
export async function sharedSeed<T = unknown>(
  h: Harness,
  content: ContentSource,
  body: Record<string, unknown>,
): Promise<{ status: number; body: T }> {
  let dir = folders.get(content);
  if (dir === undefined) {
    dir = mkdtempSync(join(tmpdir(), "oak-test-seeds-"));
    folders.set(content, dir);
  }
  const saved = process.env.OAK_SEED_CACHE_DIR;
  process.env.OAK_SEED_CACHE_DIR = dir;
  try {
    return await h.json<T>("POST", "/api/dev/seed", body);
  } finally {
    if (saved === undefined) delete process.env.OAK_SEED_CACHE_DIR;
    else process.env.OAK_SEED_CACHE_DIR = saved;
  }
}

/** Removes the file's snapshot folders (call from `afterAll`). */
export function dropSharedSeeds(): void {
  for (const dir of folders.values()) rmSync(dir, { recursive: true, force: true });
  folders.clear();
}
