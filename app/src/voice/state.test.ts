// Quiet mode and the tolerance ladder as Settings › Voice shows them, from the server's state or the profile.
import { describe, expect, test } from "bun:test";
import { OakApiError, type VoiceLadder, VoiceLadderSchema } from "@oak/api";
import { ladderSnapshot } from "@oak/pitch";
import { isNotBuilt, ladderViewOf, quietViewOf, tolChoiceOf } from "./state.ts";

const ladder = (over: Partial<VoiceLadder> = {}): VoiceLadder => ({
  cents: 50,
  mode: "auto",
  next: { cents: 35, medianAtMost: 25 },
  days: [
    { day: "2026-11-02", notes: 12, medianAbsCents: 22, qualifies: true },
    { day: "2026-11-05", notes: 9, medianAbsCents: 41, qualifies: false },
  ],
  qualifyingDays: 1,
  daysNeeded: 3,
  held: null,
  offerLoosen: false,
  lastChange: null,
  ...over,
});
const profile = {
  quiet: false,
  inputKind: "builtin" as const,
  singToleranceCents: 70 as const,
  singTolMode: "auto" as const,
};

describe("Quiet mode", () => {
  test("from the server: today, always, no mic", () => {
    expect(quietViewOf({ quiet: true, quietReason: "today" }, profile)).toMatchObject({
      quiet: true,
      reason: "today",
      canSwitchOff: true,
    });
    expect(quietViewOf({ quiet: true, quietReason: "today" }, profile).line).toMatch(
      /Tomorrow the mic is back/,
    );
    const noMic = quietViewOf({ quiet: true, quietReason: "no-mic" }, profile);
    expect(noMic.canSwitchOff).toBe(false);
    expect(noMic.line).toMatch(/Nothing is locked/);
    expect(quietViewOf({ quiet: false, quietReason: null }, profile).quiet).toBe(false);
    // Set "always" on a profile with no input: still the no-mic view, with the set-up as the way out.
    expect(
      quietViewOf({ quiet: true, quietReason: "always" }, { quiet: true, inputKind: "none" }).reason,
    ).toBe("no-mic");
  });
  test("from the profile when GET /voice is not built", () => {
    expect(quietViewOf(null, { ...profile, quiet: true })).toMatchObject({ quiet: true, reason: "always" });
    expect(quietViewOf(null, { quiet: false, inputKind: "none" })).toMatchObject({
      quiet: true,
      reason: "no-mic",
    });
    expect(quietViewOf(null, profile)).toMatchObject({ quiet: false, reason: null });
  });
  test("a 501 is recognised as 'not built', other errors are not", () => {
    expect(isNotBuilt(new OakApiError("voice.get", 501, "not_implemented", "Not built yet"))).toBe(true);
    expect(isNotBuilt(new OakApiError("voice.get", 500, "internal", "boom"))).toBe(false);
    expect(isNotBuilt(new Error("x"))).toBe(false);
  });
});

describe("the ladder card", () => {
  test("progress toward the next step as days, never as a score", () => {
    const v = ladderViewOf(ladder(), profile);
    expect(v.now).toBe("±50¢");
    expect(v.progress).toEqual({ have: 1, need: 3, next: 35 });
    expect(v.days).toEqual([
      { day: "2026-11-02", counted: true, notes: 12 },
      { day: "2026-11-05", counted: false, notes: 9 },
    ]);
    expect(v.why).toMatch(/earned/);
    expect(v.how.join(" ")).toMatch(/never undoes/);
    expect(JSON.stringify(v)).not.toMatch(/%|score|grade/i);
  });
  test("held for a checkpoint, a loosen offer, the last change said once", () => {
    const v = ladderViewOf(
      ladder({
        held: { reason: "checkpoint-pending", checkpointId: "U03.CP" },
        offerLoosen: true,
        lastChange: { from: 70, to: 50, at: "2026-11-02T20:00:00.000Z", reason: "evidence" },
      }),
      profile,
    );
    expect(v.held).toMatch(/U03\.CP/);
    expect(v.offerLoosen).toBe(true);
    expect(v.lastChange).toBe("Your ear-to-voice aim got finer: ±50¢ now.");
  });
  test("fixed and the finest step have no progress", () => {
    expect(ladderViewOf(ladder({ mode: "fixed", next: null }), profile).progress).toBeNull();
    expect(ladderViewOf(ladder({ cents: 25, next: null }), profile).why).toMatch(/finest/);
    expect(tolChoiceOf({ mode: "fixed", cents: 35 })).toBe(35);
    expect(tolChoiceOf({ mode: "auto", cents: 35 })).toBe("auto");
  });
  test("the profile fallback: where everyone starts, no progress until the server reports days", () => {
    const v = ladderViewOf(null, profile);
    expect(v.now).toBe("±70¢");
    expect(v.why).toMatch(/Where everyone starts/);
    expect(v.progress).toBeNull();
  });
  test("@oak/pitch's ladderSnapshot is exactly what GET /voice may answer", () => {
    const snap = ladderSnapshot({
      cents: 50,
      mode: "auto",
      days: [
        { day: "2026-11-02", gradedNotes: 12, medianAbsCents: 22 },
        { day: "2026-11-05", gradedNotes: 9, medianAbsCents: 41 },
      ],
      today: "2026-11-11",
      pendingCheckpoint: "U03.CP",
      lastSingDay: "2026-11-05",
      lastChange: { from: 70, to: 50, at: "2026-11-02T20:00:00.000Z", reason: "evidence" },
    });
    const parsed = VoiceLadderSchema.parse(snap);
    expect(parsed.qualifyingDays).toBe(1);
    expect(ladderViewOf(parsed, profile).progress).toEqual({ have: 1, need: 3, next: 35 });
  });
});
