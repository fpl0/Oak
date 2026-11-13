// Every Wave 5 tool example plays in headless Strudel: every track sounds, the tool is in the code, and the
// musical claims of its hint hold (the scale's notes, the swing, the sections).
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import { toolbox } from "../../../content/toolbox.ts";
import { swingBadges } from "../workbench/lines.ts";
import { buildModel } from "../workbench/model.ts";
import { TOOL_DEMOS } from "./demos.ts";

setDefaultTimeout(60_000);

beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

const WAVE5_SITE = /^(U0[89]|U1[01])\.|^A1\.L0[1-4]$/;
const siteOf = (id: string) => {
  const t = toolbox.find((x) => x.id === id);
  if (!t) return [];
  return Array.isArray(t.unlock.at) ? [...t.unlock.at] : [t.unlock.at];
};

describe("the Wave 5 tool examples", () => {
  test("every tool U08–U11 and A1.L01–L04 unlock that has a code demo has a richer example", () => {
    const missing = toolbox
      .filter((t) => siteOf(t.id).some((s) => WAVE5_SITE.test(s)) && t.catalog.demo.trim() !== "")
      .filter((t) => !TOOL_DEMOS[t.id])
      .map((t) => t.id);
    expect(missing).toEqual([]);
  });

  for (const [id, demo] of Object.entries(TOOL_DEMOS)) {
    test(`${id}: plays, every track sounds`, async () => {
      const r = await evalHeadless(demo.code, 4);
      const tracks = new Set(r.events.map((e) => e.track));
      const labels = [...demo.code.matchAll(/^([a-z]+):/gm)].map((m) => m[1] as string);
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) expect(tracks.has(l)).toBe(true);
      expect(demo.hint.length).toBeGreaterThan(20);
    });
  }

  test("minor examples play the minor forms they name", async () => {
    const mel = async (id: string, bars: number) =>
      (await evalHeadless(TOOL_DEMOS[id]?.code ?? "", bars)).events
        .filter((e) => e.track === "mel")
        .map((e) => e.midi);
    // C minor: E♭ (63) not E (64).
    expect(await mel("scale.minor", 1)).toEqual([60, 63, 67, 63]);
    // Harmonic minor bar 2: G♯3 (68) then A4 (69).
    expect((await mel("scale.harmonic-minor", 2)).slice(-2)).toEqual([68, 69]);
    // Melodic minor going up: F♯ and G♯ (66, 68) before A.
    expect((await mel("scale.melodic-minor", 2)).slice(-3)).toEqual([66, 68, 69]);
  });

  test("the swing examples swing and the form examples have sections", async () => {
    for (const id of ["tb.swing", "tb.swingBy"]) {
      const code = TOOL_DEMOS[id]?.code ?? "";
      const out = buildModel(code, await evaluateForGrading(code, { mode: "lesson", bars: 2, lint: null }), {
        meter: "4/4",
        key: null,
        staff: false,
      });
      if (!out.ok) throw new Error(out.error.message);
      expect(swingBadges(out.model.lines?.swing ?? []).get("hats")).toBe("Swing 8ths");
    }
    const code = TOOL_DEMOS["tb.lens.form"]?.code ?? "";
    const out = buildModel(code, await evaluateForGrading(code, { mode: "lesson", bars: 4, lint: null }), {
      meter: "4/4",
      key: null,
      staff: false,
    });
    if (!out.ok) throw new Error(out.error.message);
    expect(out.model.lines?.sections.map((s) => s.text)).toEqual(["Verse", "Chorus"]);
    expect(out.model.lines?.sections[1]?.energy ?? 0).toBeGreaterThan(
      out.model.lines?.sections[0]?.energy ?? 1,
    );
  });
});
