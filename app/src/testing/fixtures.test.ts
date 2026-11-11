// The e2e stub API must answer exactly what the contract says, or the smoke suite would test a fantasy.
import { describe, expect, test } from "bun:test";
import { contract, type JsonEndpointName } from "@oak/api";
import { FIXTURES } from "../../e2e/fixtures.ts";

describe("stub API fixtures match the contract", () => {
  for (const [name, value] of Object.entries(FIXTURES)) {
    test(name, () => {
      const def = contract[name as JsonEndpointName];
      expect(def.method).toBe("GET");
      if (typeof def.res === "string") throw new Error(`${name} is not a JSON endpoint`);
      const parsed = def.res.safeParse(value);
      if (!parsed.success) console.error(name, parsed.error.issues);
      expect(parsed.success).toBe(true);
    });
  }
});
