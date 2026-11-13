// Two tabs on one capstone draft (Wave 4 gate): a save numbered past the one this tab expected means another tab
// saved in between; the learner is told, and both versions stay in the history.
import { describe, expect, test } from "bun:test";
import { SAVED_ELSEWHERE, savedElsewhere } from "./draft.ts";

describe("savedElsewhere", () => {
  test("the next version is this tab's own save; a gap means another tab saved", () => {
    expect(savedElsewhere(3, 4)).toBe(false);
    expect(savedElsewhere(3, 5)).toBe(true);
    expect(savedElsewhere(null, 7)).toBe(false);
  });
  test("the notice names this tab's version and says nothing was lost", () => {
    const [title, body] = SAVED_ELSEWHERE(5);
    expect(title).toBe("This draft was also saved in another tab");
    expect(body).toContain("version 5");
    expect(body).toContain("Both are kept");
  });
});
