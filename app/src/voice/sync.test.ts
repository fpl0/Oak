import { describe, expect, test } from "bun:test";
import { isVoiceChanged, shouldAnnounce } from "./sync.ts";

describe("Quiet mode across tabs", () => {
  test("a tab announces only a change it saw, never its first load or an echo", () => {
    expect(shouldAnnounce(undefined, true, null)).toBe(false);
    expect(shouldAnnounce(false, false, null)).toBe(false);
    expect(shouldAnnounce(false, true, null)).toBe(true);
    expect(shouldAnnounce(true, false, null)).toBe(true);
    // Told by another tab that Quiet mode is on: the refetch that follows is not announced back.
    expect(shouldAnnounce(false, true, true)).toBe(false);
  });
  test("only well-formed messages count", () => {
    expect(isVoiceChanged({ kind: "voice-changed", quiet: true })).toBe(true);
    expect(isVoiceChanged({ kind: "voice-changed" })).toBe(false);
    expect(isVoiceChanged("voice-changed")).toBe(false);
    expect(isVoiceChanged(null)).toBe(false);
  });
});
