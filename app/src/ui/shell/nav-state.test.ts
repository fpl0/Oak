import { describe, expect, test } from "bun:test";
import { NAV_ITEMS } from "../../lib/nav.ts";
import { NAV_GATES, navItemState } from "./nav-state.ts";

describe("NavRail states", () => {
  test("Transcribe says when the gym opens until tb.feature.transcribe", () => {
    expect(navItemState("transcribe", "Transcribe", new Set(), true)).toEqual({
      pending: true,
      label: "Transcribe: the Transcription Gym opens with U07 · Melody",
    });
    expect(navItemState("transcribe", "Transcribe", new Set(["tb.feature.transcribe"]), true)).toEqual({
      pending: false,
      label: "Transcribe",
    });
  });

  test("Album says when its first track arrives until tb.feature.album", () => {
    expect(navItemState("album", "Album", new Set(["tb.feature.studio"]), true).pending).toBe(true);
    expect(navItemState("album", "Album", new Set(["tb.feature.album"]), true).pending).toBe(false);
  });

  test("nothing is marked before the unlock list loads", () => {
    expect(navItemState("transcribe", "Transcribe", new Set(), false).pending).toBe(false);
  });

  test("the other destinations are never marked", () => {
    for (const item of NAV_ITEMS)
      if (!NAV_GATES[item.id]) expect(navItemState(item.id, item.label, new Set(), true).pending).toBe(false);
  });

  test("the gates name real toolbox rows at the course points the contracts give", async () => {
    const { toolboxById } = await import("../../../../content/toolbox.ts");
    expect(toolboxById.get("tb.feature.transcribe")?.unlock.at).toBe("U07.L01");
    expect(toolboxById.get("tb.feature.album")?.unlock).toMatchObject({ at: "C0.S1", when: "start" });
  });
});
