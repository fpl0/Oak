import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { createClient, OakApiError } from "@oak/api";
import { midisOf } from "@oak/grader/testing";
import { coverRings } from "../ui/AlbumCover.tsx";
import { describeError } from "../ui/kit/QueryState.tsx";
import { setApiClient } from "./api.ts";
import { type Command, matchScore, rankCommands } from "./commands.ts";
import { accidentals, formatBytes, formatDuration, formatKey } from "./format.ts";
import { formatNoteMidi } from "./notes.ts";
import { shouldRetry } from "./query-client.ts";
import { routeOfItem, routeOfPlan } from "./session-route.ts";

setDefaultTimeout(30_000);

describe("command ranking", () => {
  const cmd = (title: string, keywords: string[] = []): Command => ({
    id: title,
    title,
    group: "Actions",
    keywords,
    run() {},
  });
  const cmds = [
    cmd("New sketch"),
    cmd("Go to Studio", ["sketchbook"]),
    cmd("Recalibrate mic", ["voice"]),
    cmd("Go to Today"),
  ];

  test("prefix beats word start beats subsequence", () => {
    expect(matchScore("new", "New sketch")).toBeGreaterThan(matchScore("sk", "New sketch"));
    expect(matchScore("sk", "New sketch")).toBeGreaterThan(matchScore("nsk", "New sketch"));
    expect(matchScore("xyz", "New sketch")).toBe(0);
  });

  test("keywords match, accents and ♭ are normalised", () => {
    expect(rankCommands("voice", cmds)[0]?.title).toBe("Recalibrate mic");
    expect(rankCommands("sketchbook", cmds)[0]?.title).toBe("Go to Studio");
    expect(matchScore("bb major", "B♭ major")).toBeGreaterThan(0);
  });

  test("empty query keeps the registry order", () => {
    expect(rankCommands("", cmds).map((c) => c.title)).toEqual(cmds.map((c) => c.title));
  });
});

describe("session routes (contracts §11.9)", () => {
  test("map items", () => {
    expect(routeOfItem("U01.L02")).toEqual({ to: "/learn/$lessonId", params: { lessonId: "U01.L02" } });
    expect(routeOfItem("U01.L02", "S5")).toEqual({
      to: "/learn/$lessonId",
      params: { lessonId: "U01.L02" },
      search: { step: "S5" },
    });
    // Core checkpoints drop `.CP` in the URL; track checkpoints keep the full ID.
    expect(routeOfItem("U07.CP")).toEqual({ to: "/checkpoint/$unitId", params: { unitId: "U07" } });
    expect(routeOfItem("J.CP1")).toEqual({ to: "/checkpoint/$unitId", params: { unitId: "J.CP1" } });
    expect(routeOfItem("C2")).toEqual({ to: "/capstone/$id", params: { id: "C2" } });
    expect(routeOfItem("C2.S2")).toEqual({ to: "/capstone/$id", params: { id: "C2" } });
    expect(routeOfItem("GYM.04")).toEqual({ to: "/transcribe" });
    expect(routeOfItem(null)).toEqual({ to: "/practice/review" });
  });

  test("plans", () => {
    expect(routeOfPlan({ kind: "review", mapItemId: null, main: null })).toEqual({ to: "/practice/review" });
    expect(routeOfPlan({ kind: "studio", mapItemId: null, main: null })).toEqual({ to: "/studio" });
    expect(
      routeOfPlan({
        kind: "light",
        mapItemId: "U03.L02",
        main: {
          resumeStep: null,
          splitPart: null,
          light: { lessonId: "U03.L01", constraint: "in minor" },
          estMinutes: 8,
        },
      }),
    ).toEqual({ to: "/learn/$lessonId", params: { lessonId: "U03.L01" } });
    expect(
      routeOfPlan({
        kind: "lesson",
        mapItemId: "U06.L04",
        main: { resumeStep: "S5", splitPart: null, light: null, estMinutes: 8 },
      }),
    ).toEqual({ to: "/learn/$lessonId", params: { lessonId: "U06.L04" }, search: { step: "S5" } });
  });
});

describe("music display", () => {
  test("note names match Strudel's pitches (MIDI 60 = C4, octave-less = octave 3)", async () => {
    // Golden facts first, then confirm Strudel 1.2.6 agrees on the MIDI numbers.
    expect(formatNoteMidi(60)).toBe("C4");
    expect(formatNoteMidi(69)).toBe("A4");
    expect(formatNoteMidi(48)).toBe("C3");
    expect(formatNoteMidi(70)).toBe("B♭4");
    expect(await midisOf('note("c4 a4 c bb4")')).toEqual([60, 69, 48, 70]);
  });

  test("keys, accidentals and durations", () => {
    expect(formatKey({ tonic: "Bb", mode: "major" })).toBe("B♭ major");
    expect(formatKey({ tonic: "F#", mode: "minor" })).toBe("F♯ minor");
    expect(accidentals("Eb4 C#3")).toBe("E♭4 C♯3");
    expect(formatDuration(125)).toBe("2:05");
    expect(formatBytes(52_428_800)).toBe("50 MB");
  });
});

describe("album covers", () => {
  test("deterministic per seed, different across seeds, inside the sleeve", () => {
    expect(coverRings("tr_1")).toEqual(coverRings("tr_1"));
    expect(coverRings("tr_1")).not.toEqual(coverRings("tr_2"));
    for (const r of coverRings("abc")) expect(r.r).toBeLessThanOrEqual(47);
  });
});

describe("API errors and retries", () => {
  test("no retry when retrying cannot help", () => {
    expect(shouldRetry(0, new OakApiError("health", 0, "network", "down"))).toBe(false);
    expect(shouldRetry(0, new OakApiError("sketches.get", 404, "not_found", "gone"))).toBe(false);
    expect(shouldRetry(0, new OakApiError("health", 500, "internal", "boom"))).toBe(true);
    expect(shouldRetry(2, new OakApiError("health", 500, "internal", "boom"))).toBe(false);
  });

  test("learner-facing copy, never a raw status", () => {
    expect(describeError(new OakApiError("health", 0, "network", "x")).title).toBe(
      "Oak's server isn't answering",
    );
    expect(describeError(new OakApiError("x", 200, "contract", "x")).title).toContain("disagree");
  });

  test("callApi sends X-Oak and validates the response against the contract", async () => {
    const { callApi } = await import("./api.ts");
    const seen: Record<string, string>[] = [];
    setApiClient(
      createClient({
        fetch: async (_url, init) => {
          seen.push(init.headers as Record<string, string>);
          return new Response(JSON.stringify({ ok: true, appVersion: "1" }), { status: 200 });
        },
      }),
    );
    // A response missing required fields is a contract error, not data.
    const err = await callApi("health").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OakApiError);
    expect((err as OakApiError).code).toBe("contract");
    expect(seen[0]?.["X-Oak"]).toBe("1");
    setApiClient(createClient());
  });
});
