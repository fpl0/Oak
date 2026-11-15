// Wave 7 integration (packages): the catalog rows for @oak/pitch's track taps and sung jazz lines are pitch's own
// texts, word for word, at the severities the audio builder set (build-audio apiNotes), so a host that prints
// pitch's text and one that prints the catalog's say the same sentence.
import { describe, expect, test } from "bun:test";
import { JAZZ_SING_FEEDBACK, TRACK_TAP_FEEDBACK } from "@oak/pitch";
import { FEEDBACK_CATALOG } from "./catalog.ts";

const SEVERITY: Record<string, string> = {
  "tap.lane-rushing": "warn",
  "tap.lane-dragging": "warn",
  "tap.lane-silent": "error",
  "tap.lanes-swapped": "error",
  "tap.lanes-flam": "info",
  "tap.timeline": "warn",
  "tap.clave-direction": "warn",
  "tap.clave-type": "warn",
  "tap.grouping-order": "warn",
  "tap.grouping-even": "warn",
  "tap.lay-back": "info",
  "sing.tension": "error",
  "sing.root": "error",
};

describe("Wave 7 pitch rows in the catalog", () => {
  test("every id pitch adds is in the catalog with pitch's text and the agreed severity", () => {
    const rows = { ...TRACK_TAP_FEEDBACK, ...JAZZ_SING_FEEDBACK };
    expect(Object.keys(rows).sort()).toEqual(Object.keys(SEVERITY).sort());
    for (const [id, text] of Object.entries(rows)) {
      const row = FEEDBACK_CATALOG[id as keyof typeof FEEDBACK_CATALOG];
      expect(row?.template).toBe(text);
      expect(row?.severity as string).toBe(SEVERITY[id] as string);
    }
  });
});
