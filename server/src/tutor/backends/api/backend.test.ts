import { describe, expect, test } from "bun:test";
import { TutorError } from "../../errors.ts";
import type { UsageSummary } from "../../events.ts";
import { buildPrefix } from "../../prompt/persona.ts";
import { selectBackend } from "../../select.ts";
import { CATALOG, SYLLABUS } from "../../testing/fixtures.ts";
import { TOOLS } from "../../tools/defs.ts";
import type { WarmInput } from "../../types.ts";
import { message, usageOf } from "./cassettes/builders.ts";
import { rateLimited } from "./cassettes/failure-scenarios.ts";
import { CASSETTE_BASE_URL, CASSETTE_KEY, cassetteFetch } from "./cassettes/fake-fetch.ts";
import { requestAt, rig, runOn, wirePrefix } from "./cassettes/harness.ts";
import { cassette, textOnly } from "./cassettes/scenarios.ts";
import { createAnthropicApiBackend } from "./index.ts";

const WARM: WarmInput = {
  prefix: buildPrefix({ syllabus: SYLLABUS, catalog: CATALOG }),
  tools: TOOLS,
  model: "claude-opus-5-5",
  effort: "medium",
};

const warmed = () =>
  cassette("warm", {
    json: {
      ...message("msg_warm"),
      stop_reason: "max_tokens",
      usage: usageOf({ input: 4, cacheWrite1h: 31_000 }, 0),
    },
    steps: [],
  });

describe("availability", () => {
  test("available when a key is present; missing_key otherwise; no request is made to find out", async () => {
    const { fetch, wire } = cassetteFetch(cassette("unused"));
    const withKey = createAnthropicApiBackend({ apiKey: CASSETTE_KEY, fetch, baseURL: CASSETTE_BASE_URL });
    expect(withKey.id).toBe("anthropic-api");
    expect(await withKey.available()).toEqual({ ok: true });
    for (const apiKey of [undefined, null, "", "   "]) {
      expect(await createAnthropicApiBackend({ apiKey, fetch }).available()).toEqual({
        ok: false,
        reason: "missing_key",
      });
    }
    expect(wire).toHaveLength(0);
  });

  test("selection: a present key puts this backend first when the setting is auto", async () => {
    const api = createAnthropicApiBackend({ apiKey: CASSETTE_KEY, baseURL: CASSETTE_BASE_URL });
    const picked = await selectBackend("auto", { "anthropic-api": api });
    expect(picked.backend?.id).toBe("anthropic-api");
    const none = await selectBackend("auto", { "anthropic-api": createAnthropicApiBackend({}) });
    expect(none.backend).toBeNull();
  });

  test("without a key a turn fails as `auth` and nothing is sent", async () => {
    const r = rig(textOnly(), { apiKey: "" });
    const { events } = await runOn(r);
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "auth" } });
    expect(r.wire).toHaveLength(0);
    await expect(createAnthropicApiBackend({}).warm?.(WARM)).rejects.toBeInstanceOf(TutorError);
  });

  test("the key is not reachable through the backend object", () => {
    const backend = createAnthropicApiBackend({ apiKey: CASSETTE_KEY, baseURL: CASSETTE_BASE_URL });
    const seen = [
      JSON.stringify(backend),
      ...Object.values(backend).map(String),
      Bun.inspect(backend, { depth: 8 }),
    ];
    expect(seen.join("\n")).not.toContain(CASSETTE_KEY);
  });
});

describe("warm-up", () => {
  test("max_tokens 0, non-streaming, same prefix bytes as a chat turn, no tail breakpoint", async () => {
    const chat = rig(textOnly());
    await runOn(chat);
    const usage: UsageSummary[] = [];
    const r = rig(warmed(), { onWarmUsage: (u) => usage.push(u) });
    await r.backend.warm?.(WARM);

    expect(r.wire).toHaveLength(1);
    const body = r.wire[0]?.body ?? {};
    expect(body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 0,
      fallbacks: "default",
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "medium" },
      stream: false,
      messages: [{ role: "user", content: "warmup" }],
    });
    expect(Object.keys(body)).not.toContain("cache_control");
    expect(r.wire[0]?.headers["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
    // The whole point: the bytes the cache keys on are the ones the first chat turn will send.
    expect(wirePrefix(requestAt(r, 0))).toBe(wirePrefix(requestAt(chat, 0)));
    // The cache write is billed, so it is reported for the usage log.
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ requests: 1, cacheCreation1hInputTokens: 31_000, outputTokens: 0 });
    expect(usage[0]?.costUsd).toBeCloseTo((4 * 4 + 31_000 * 8) / 1e6, 9);
  });

  test("a failed warm-up is a TutorError of the right kind", async () => {
    const r = rig(rateLimited());
    const thrown = await r.backend.warm?.(WARM).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(TutorError);
    expect(thrown).toMatchObject({ kind: "rate_limit", retryAfterSec: 17 });
  });
});
