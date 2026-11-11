import { expect, test } from "bun:test";
import { WIZARD, wizardNext } from "./wizard.ts";

test("the wizard walks every part, and passes over the mic-only ones in Quiet mode", () => {
  expect(wizardNext(WIZARD, "headphones", false)).toBe("mic");
  expect(wizardNext(WIZARD, "mic", false)).toBe("range");
  expect(wizardNext(WIZARD, "mic", true)).toBe("latency");
  expect(wizardNext(WIZARD, "latency", true)).toBe("done");
  expect(wizardNext(WIZARD, "first-sing", false)).toBe("done");
  expect(wizardNext(["range"], "range", false)).toBe("done");
});
