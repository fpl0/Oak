import { describe, expect, test } from "bun:test";
import type { BetaUsage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { estimateCostUsd, OPUS_5_5, priceFor } from "./pricing.ts";
import { addUsage, cacheHitRatio, callUsage, emptyUsage, sumUsage, type WireUsage } from "./usage.ts";

// Compile-time: the SDK's usage object is accepted as it is.
const acceptsSdkUsage = (u: BetaUsage): WireUsage => u;

describe("usage for both backends", () => {
  test("API: tokens and a list-price estimate", () => {
    const u = callUsage(
      "anthropic-api",
      {
        input_tokens: 92,
        output_tokens: 185,
        cache_read_input_tokens: 12_400,
        cache_creation_input_tokens: 6_550,
        cache_creation: { ephemeral_1h_input_tokens: 6_000, ephemeral_5m_input_tokens: 550 },
      },
      "claude-opus-5-5",
    );
    expect(u).toMatchObject({
      backend: "anthropic-api",
      requests: 1,
      inputTokens: 92,
      outputTokens: 185,
      cacheReadInputTokens: 12_400,
      cacheCreationInputTokens: 6_550,
      includedInPlan: false,
      servedBy: ["claude-opus-5-5"],
    });
    // 92*4 + 12400*4*0.05 + 550*4*1.25 + 6000*4*2 + 185*20, per million.
    expect(u.costUsd).toBeCloseTo(0.057298, 9);
  });

  test("CLI: the same tokens, no dollars, 'included in plan'", () => {
    const u = callUsage(
      "claude-cli",
      { input_tokens: 92, output_tokens: 185, cache_read_input_tokens: 8_154 },
      "claude-opus-5-5",
    );
    expect(u).toMatchObject({
      backend: "claude-cli",
      inputTokens: 92,
      outputTokens: 185,
      cacheReadInputTokens: 8_154,
      costUsd: null,
      includedInPlan: true,
    });
    expect(emptyUsage("claude-cli")).toMatchObject({ costUsd: null, includedInPlan: true });
    expect(emptyUsage("anthropic-api")).toMatchObject({ costUsd: 0, includedInPlan: false });
  });

  test("nullable fields count as zero; an unsplit cache write is priced at the 1-hour rate", () => {
    const u = callUsage(
      "anthropic-api",
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: 1_000_000,
        cache_creation: null,
      },
      "claude-opus-5-5",
    );
    expect(u.cacheCreation1hInputTokens).toBe(1_000_000);
    expect(u.costUsd).toBeCloseTo(8, 9);
    expect(callUsage("anthropic-api", {}, "m")).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
  });

  test("calls add up; a fallback model shows in servedBy once", () => {
    const a = callUsage("anthropic-api", { input_tokens: 100, output_tokens: 10 }, "claude-opus-5-5");
    const b = callUsage("anthropic-api", { input_tokens: 200, output_tokens: 20 }, "claude-sonnet-5");
    const sum = sumUsage("anthropic-api", [a, b, a]);
    expect(sum).toMatchObject({
      requests: 3,
      inputTokens: 400,
      outputTokens: 40,
      servedBy: ["claude-opus-5-5", "claude-sonnet-5"],
    });
    expect(sum.costUsd).toBeCloseTo((a.costUsd ?? 0) * 2 + (b.costUsd ?? 0), 12);
    expect(
      addUsage(emptyUsage("claude-cli"), callUsage("claude-cli", { input_tokens: 1 }, "m")).costUsd,
    ).toBeNull();
  });

  test("cache-hit ratio", () => {
    expect(cacheHitRatio({ inputTokens: 100, cacheReadInputTokens: 900, cacheCreationInputTokens: 0 })).toBe(
      0.9,
    );
    expect(cacheHitRatio({ inputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 })).toBe(0);
  });
});

describe("pricing (estimates)", () => {
  test("Opus 5.5 list prices per million tokens", () => {
    const m = 1_000_000;
    const zero = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreation1hInputTokens: 0,
      cacheCreation5mInputTokens: 0,
    };
    expect(estimateCostUsd({ ...zero, inputTokens: m })).toBeCloseTo(4, 9);
    expect(estimateCostUsd({ ...zero, outputTokens: m })).toBeCloseTo(20, 9);
    expect(estimateCostUsd({ ...zero, cacheReadInputTokens: m })).toBeCloseTo(0.2, 9);
    expect(estimateCostUsd({ ...zero, cacheCreation5mInputTokens: m })).toBeCloseTo(5, 9);
    expect(estimateCostUsd({ ...zero, cacheCreation1hInputTokens: m })).toBeCloseTo(8, 9);
  });

  test("an unknown (fallback) model is priced at the Opus rate, so the estimate errs high", () => {
    expect(priceFor("some-fallback-model")).toBe(OPUS_5_5);
  });
});

test("the SDK's BetaUsage is a WireUsage", () => {
  expect(typeof acceptsSdkUsage).toBe("function");
});
