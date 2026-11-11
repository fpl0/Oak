// The e2e stub API must answer exactly what the contract says, or the smoke suite would test a fantasy.
import { describe, expect, test } from "bun:test";
import { contract, type JsonEndpointName } from "@oak/api";
import { FIXTURES, WRITE_FIXTURES } from "../../e2e/fixtures.ts";

describe("stub API fixtures match the contract", () => {
  const all = [
    ...Object.entries(FIXTURES).map(([n, v]) => [n, v, true] as const),
    ...Object.entries(WRITE_FIXTURES).map(([n, v]) => [n, v, false] as const),
  ];
  for (const [name, value, read] of all) {
    test(name, () => {
      const def = contract[name as JsonEndpointName];
      if (read) expect(def.method).toBe("GET");
      else expect(def.method).not.toBe("GET");
      if (typeof def.res === "string") throw new Error(`${name} is not a JSON endpoint`);
      const parsed = def.res.safeParse(value);
      if (!parsed.success) console.error(name, parsed.error.issues);
      expect(parsed.success).toBe(true);
    });
  }
});
