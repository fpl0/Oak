import { describe, expect, test } from "bun:test";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { isToolName, LEARNER_TOOL_NAMES, TOOL_NAMES, TOOLS } from "./defs.ts";
import { ToolSchemas } from "./schemas.ts";

describe("the v1 tool list", () => {
  test("is the seven tools of contracts §10.3, sorted by name", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual([
      "compare_haps",
      "evaluate_strudel",
      "get_learner_progress",
      "get_lesson_context",
      "propose_code",
      "submit_capstone_review",
      "submit_transcription_review",
    ]);
    expect(names).toEqual([...TOOL_NAMES]);
    expect(LEARNER_TOOL_NAMES).toHaveLength(5);
    expect(isToolName("propose_code")).toBe(true);
    // Deferred to a later version: not in the list.
    for (const n of ["record_observation", "suggest_practice", "theory_query", "submit_review"])
      expect(isToolName(n)).toBe(false);
  });

  test("every tool is strict; eager input streaming is on propose_code only", () => {
    for (const t of TOOLS) {
      expect(t.strict).toBe(true);
      expect("eager_input_streaming" in t).toBe(t.name === "propose_code");
      expect(t.description.length).toBeGreaterThan(40);
    }
  });

  test("every object is closed, every property required, and there are no bounds", () => {
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((n, i) => {
          walk(n, `${path}[${i}]`);
        });
        return;
      }
      if (typeof node !== "object" || node === null) return;
      const o = node as Record<string, unknown>;
      for (const banned of [
        "minimum",
        "maximum",
        "minLength",
        "maxLength",
        "minItems",
        "maxItems",
        "pattern",
        "default",
        "format",
      ]) {
        expect(`${path} has ${banned}: ${banned in o}`).toBe(`${path} has ${banned}: false`);
      }
      if (o.type === "object") {
        expect(o.additionalProperties).toBe(false);
        expect(o.required).toEqual(Object.keys(o.properties as object));
      }
      for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    };
    for (const t of TOOLS) walk(t.input_schema, t.name);
  });

  test("the list is deep-frozen: nothing can change the cached prefix at run time", () => {
    expect(Object.isFrozen(TOOLS)).toBe(true);
    const first = TOOLS[0];
    if (!first) throw new Error("no tools");
    expect(() => {
      (first as { description: string }).description = "x";
    }).toThrow(TypeError);
    expect(() => {
      (first.input_schema.properties as Record<string, unknown>).rung = { type: "integer" };
    }).toThrow(TypeError);
    expect(() => (TOOLS as unknown[]).push({})).toThrow(TypeError);
  });

  test("serializes to the same bytes every time", () => {
    expect(JSON.stringify(TOOLS)).toBe(JSON.stringify(structuredClone(TOOLS)));
  });

  test("no tool lets the model choose the hint rung or the apply state", () => {
    const text = JSON.stringify(TOOLS.map((t) => t.input_schema));
    for (const field of ['"rung"', '"hint_rung"', '"apply"', '"level"', '"passed"', '"applyAllowed"'])
      expect(text).not.toContain(field);
  });

  test("JSON Schema and zod name the same fields", () => {
    for (const t of TOOLS) {
      const zodKeys = Object.keys(ToolSchemas[t.name].shape).sort();
      expect(Object.keys(t.input_schema.properties).sort()).toEqual(zodKeys);
    }
  });
});

// Compile-time: the list is what `client.beta.messages.stream({ tools })` of SDK 1.8.0 accepts,
// with no cast. (Type-only import: no SDK code runs in this test.)
const sdkTools: BetaTool[] = [...TOOLS];

test("structurally an SDK BetaTool", () => {
  expect(sdkTools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
});
