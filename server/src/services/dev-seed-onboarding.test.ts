// The dev seed "onboarding at react (edit <N>)" (dev-seed.ts): a fresh learner who began onboarding today, with the
// welcome, the loop's build-up and the edit done — exactly what the onboarding screens save by then — and nothing the
// screens after them produce: no preferences, no mic, no sketch, no finished onboarding, no session, no lesson.
import { afterEach, describe, expect, test } from "bun:test";
import type { DevSeedResult, OnboardingState, Profile } from "@oak/api";
import { type Harness, harness } from "../testing/harness.ts";
import { planSeed } from "./dev-seed.ts";

const NOW = "2026-11-13T12:00:00.000Z";
let h: Harness | null = null;
afterEach(async () => {
  await h?.close();
  h = null;
});

async function ok<T>(x: Harness, method: string, path: string, body?: unknown): Promise<T> {
  const r = await x.json<T>(method, path, body);
  if (r.status !== 200) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

describe("seed point: onboarding at react", () => {
  test("holds the welcome, the loop and the edit (last note changed to N), and nothing after them", async () => {
    h = await harness({ dev: true, now: NOW });
    const fresh = await ok<Profile>(h, "GET", "/api/profile");
    const r = await ok<DevSeedResult>(h, "POST", "/api/dev/seed", { point: "onboarding at react (edit 5)" });
    expect(r.done).toEqual([]);
    expect(r.lastActiveDay).toBeNull();
    expect(r.sketchIds).toEqual([]);
    const st = await ok<OnboardingState>(h, "GET", "/api/onboarding");
    expect(st).toMatchObject({
      step: "react",
      completed: ["welcome", "loop", "edit"],
      skipped: [],
      firstEdit: 5,
      sketchId: null,
      finishedAt: null,
    });
    expect(st.startedAt).toBe(NOW);
    // The profile is a fresh one: no choices, no microphone, not onboarded.
    const p = await ok<Profile>(h, "GET", "/api/profile");
    expect(p.onboardedAt).toBeNull();
    expect(p.flavour).toBe(fresh.flavour);
    expect(p.targetMinutes).toBe(fresh.targetMinutes);
    expect(p.inputKind).toBe(fresh.inputKind);
    expect(p.quiet).toBe(fresh.quiet);
    expect(p.vocalLowMidi).toBeNull();
    expect(p.noiseFloorDb).toBeNull();
    expect((await ok<{ items: unknown[] }>(h, "GET", "/api/sketches")).items).toEqual([]);
    const progress = await ok<{ lessons: { status: string; startedAt: string | null }[] }>(
      h,
      "GET",
      "/api/lessons/progress",
    );
    expect(progress.lessons.filter((l) => l.status === "completed" || l.startedAt !== null)).toEqual([]);
  });

  test("N is 3 without the suffix; only 0–7 are notes", async () => {
    h = await harness({ dev: true, now: NOW });
    await ok(h, "POST", "/api/dev/seed", { point: "Onboarding at React" });
    expect((await ok<OnboardingState>(h, "GET", "/api/onboarding")).firstEdit).toBe(3);
    expect((await h.json("POST", "/api/dev/seed", { point: "onboarding at react (edit 8)" })).status).toBe(
      400,
    );
    expect(() => planSeed("onboarding at react (edit 9)", [])).toThrow();
    expect(planSeed("onboarding at react (edit 0)", []).extra).toEqual({
      kind: "onboarding-at",
      step: "react",
      firstEdit: 0,
    });
  });

  test("the point is listed", async () => {
    h = await harness({ dev: true, now: NOW });
    const list = await ok<{ items: { point: string }[] }>(h, "GET", "/api/dev/seed");
    expect(list.items.map((i) => i.point)).toContain("onboarding at react (edit <N>)");
  });
});
