import { expect, test } from "bun:test";
import { RENDERABLE_PARTS } from "./setup-parts.ts";
import { SETUP_ROUTE_PARTS, WIZARD, wizardNext } from "./wizard.ts";

test("the wizard walks every part in the contract's order, and passes over the mic-only ones in Quiet mode", () => {
  expect([...WIZARD]).toEqual(["headphones", "mic", "latency", "range", "match"]);
  expect(wizardNext(WIZARD, "headphones", false)).toBe("mic");
  expect(wizardNext(WIZARD, "mic", false)).toBe("latency");
  expect(wizardNext(WIZARD, "latency", false)).toBe("range");
  expect(wizardNext(WIZARD, "range", false)).toBe("match");
  expect(wizardNext(WIZARD, "match", false)).toBe("done");
  // Quiet mode: the range sweep and the pitch match need a voice; nothing else does.
  expect(wizardNext(WIZARD, "mic", true)).toBe("latency");
  expect(wizardNext(WIZARD, "latency", true)).toBe("done");
  expect(wizardNext(["range"], "range", false)).toBe("done");
});

test("every part the set-up route accepts is one the set-up can render", () => {
  for (const p of SETUP_ROUTE_PARTS) expect((RENDERABLE_PARTS as readonly string[]).includes(p)).toBe(true);
});
