import { expect, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { previewCode, withInstalledBanks } from "./prefs.ts";

test("each flavour's preview is the four-chord Band in C at the loop's tempo, and it evaluates", async () => {
  for (const f of ["flavour.pop", "flavour.jazz-soul"] as const) {
    const code = previewCode(f);
    expect(code).toStartWith("setcpm(92/4)\n");
    expect(code).not.toContain("{{key}}");
    const r = await evalHeadless(code as string, 4);
    expect(r.tracks).toEqual(expect.arrayContaining(["drums", "bass", "chords"]));
    // Bar 1 is the home chord (C), bass on C.
    const bass = r.events.find((e) => e.track === "bass" && e.onset === 0);
    expect((bass?.midi ?? -1) % 12).toBe(0);
  }
});

test("a bank the pack lacks is dropped from the preview, an installed one kept", () => {
  const code = 'drums: s("bd").bank("jazzkit")\nx: s("bd").bank("RolandTR808")';
  expect(withInstalledBanks(code, ["rolandtr808_bd", "piano"])).toBe(
    'drums: s("bd")\nx: s("bd").bank("RolandTR808")',
  );
});
