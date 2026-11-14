import { describe, expect, test } from "bun:test";
import { learnerDetail } from "./MasterCard.tsx";

describe("MasterCard error text (gate W6)", () => {
  test("a package's internal message never reaches the learner", () => {
    expect(learnerDetail(new Error("@oak/audio: the meter was disposed"))).toBe(
      "Play the piece once, then try again.",
    );
  });
  test("a plain message is kept; nothing else gives no detail", () => {
    expect(learnerDetail(new Error("Its recording could not be read."))).toBe(
      "Its recording could not be read.",
    );
    expect(learnerDetail("x")).toBeUndefined();
    expect(learnerDetail(new Error(""))).toBeUndefined();
  });
});
