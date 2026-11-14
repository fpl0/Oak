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

const WAVE6_SITE = /^U1[2-7]\./;

describe("the Wave 6 tool examples (U12–U17)", () => {
  const build = async (id: string, bars: number, meter: "4/4" | "6/8" = "4/4") => {
    const code = TOOL_DEMOS[id]?.code ?? "";
    const out = buildModel(
      code,
      await evaluateForGrading(code, { mode: "lesson", bars, lint: null, meter }),
      {
        meter,
        key: null,
        staff: false,
      },
    );
    if (!out.ok) throw new Error(`${id}: ${out.error.message}`);
    return out.model;
  };

  test("every tool U12–U17 unlock that has a code demo has a richer example", () => {
    const missing = toolbox
      .filter((t) => siteOf(t.id).some((s) => WAVE6_SITE.test(s)) && t.catalog.demo.trim() !== "")
      .filter((t) => !TOOL_DEMOS[t.id])
      .map((t) => t.id);
    expect(missing).toEqual([]);
  });

  test("every example names its tool in its code", () => {
    const uses: Record<string, RegExp> = {
      "chord.seventh": /\^7.*m7|m7.*\^7/,
      "chord.seventh-dim": /m7b5.*o7/,
      "tb.dict.lefthand": /\.dict\("lefthand"\)/,
      "snd.jazzgtr": /s\("jazzgtr"\)/,
      "tb.early": /\.early\(1\/8\)/,
      "tb.late": /\.late\(1\/8\)/,
      "tb.velocity": /\.velocity\(/,
      "snd.cleangtr": /s\("cleangtr"\)/,
      "tb.meter.compound": /setcpm\(60\/2\)/,
      "tb.ply": /\.ply\(3\)/,
      "scale.mixolydian": /:mixolydian/,
      "scale.dorian": /:dorian/,
      "scale.lydian": /:lydian/,
      "scale.phrygian": /:phrygian/,
      "tb.pan": /\.pan\(/,
      "tb.jux": /\.jux\(rev\)/,
      "tb.n.chromatic": /\d#.*\db/,
      "snd.horns": /s\("horns"\)/,
      "snd.trumpet": /s\("trumpet"\)/,
      "snd.tenor": /s\("tenor"\)/,
    };
    for (const [id, re] of Object.entries(uses))
      expect({ id, ok: re.test(TOOL_DEMOS[id]?.code ?? "") }).toEqual({ id, ok: true });
  });

  test("the sevenths: the four qualities, and the guide-tone lines of the two-five-one", async () => {
    const m = await build("chord.seventh", 4);
    expect(m.colour?.harmony?.chords.map((c) => c.seventh)).toEqual(["maj7", "m7", "m7", "7"]);
    expect(m.colour?.guide.lines.length).toBe(2);
    const dim = await build("chord.seventh-dim", 4);
    expect(dim.colour?.harmony?.chords.map((c) => c.seventh)).toEqual(["m7b5", "7", "m7", "dim7"]);
    const lh = await build("tb.dict.lefthand", 4);
    expect(lh.colour?.harmony?.chords.map((c) => c.symbol)).toEqual(["Dm7", "G7", "Cmaj7", "A7"]);
    // Its hats swing: that is swing, not a triplet grid.
    expect(lh.colour?.rhythm?.grid).toBeNull();
    expect((await build("snd.horns", 8)).colour?.rhythm?.grid).toBeNull();
  });

  test("the modes: each example plays its colour note, in the tune and in a chord", async () => {
    const want: Record<string, [string, number]> = {
      "scale.mixolydian": ["♭7", 5],
      "scale.dorian": ["6", 11],
      "scale.lydian": ["♯4", 11],
      "scale.phrygian": ["♭2", 5],
    };
    for (const [id, [display, pc]] of Object.entries(want)) {
      const m = await build(id, 4);
      const marks = [...(m.colour?.mode ?? new Map())];
      expect({ id, n: marks.length > 0 }).toEqual({ id, n: true });
      for (const [eventId, mk] of marks) {
        expect(mk.display).toBe(display);
        expect((m.byId.get(eventId)?.midi as number) % 12).toBe(pc);
      }
      const tune = marks.filter(
        ([eventId]) => !["chords", "bass"].includes(m.byId.get(eventId)?.track ?? ""),
      );
      expect({ id, tune: tune.length > 0 }).toEqual({ id, tune: true });
      // The colour chord is in the changes: its root or third is the colour note.
      expect(m.events.some((e) => e.track === "chords" && (e.midi as number) % 12 === pc)).toBe(true);
    }
  });

  test("rhythm II: the push, the late chords, the ghost notes, 6/8 and the triplets", async () => {
    const early = await build("tb.early", 4);
    expect(early.colour?.rhythm?.pushes.size).toBeGreaterThan(0);
    for (const p of early.colour?.rhythm?.pushes.values() ?? []) expect(p.by).toBe(8);
    const late = await build("tb.late", 2);
    const onsets = [...new Set(late.events.filter((e) => e.track === "chords").map((e) => e.onset % 1))];
    expect(onsets.sort()).toEqual([1 / 8, 5 / 8]);
    const vel = await build("tb.velocity", 2);
    const hats = vel.events.filter((e) => e.track === "hats");
    expect(hats.filter((e) => vel.colour?.rhythm?.ghosts.has(e.id)).length).toBe(hats.length / 2);
    const six = await build("tb.meter.compound", 4, "6/8");
    expect(six.colour?.rhythm?.grid?.compound).toBe(true);
    expect(six.colour?.rhythm?.view.bpm).toBe(60);
    expect(six.colour?.rhythm?.grid?.linesOf(0).map((l) => l.label)).toEqual([
      "1",
      "la",
      "li",
      "2",
      "la",
      "li",
    ]);
    // The snare is on the second beat: the fourth eighth of the bar.
    expect(six.events.filter((e) => e.s === "sd").every((e) => Math.abs((e.onset % 1) - 0.5) < 1e-9)).toBe(
      true,
    );
    const ply = await build("tb.ply", 4);
    expect(
      ply.colour?.rhythm?.grid
        ?.linesOf(0)
        .map((l) => l.label)
        .join(" "),
    ).toBe("1 trip let 2 trip let 3 trip let 4 trip let");
  });

  test("chromatic harmony: the leaning notes, the dominant chain, the borrowed chords", async () => {
    const tune = (await evalHeadless(TOOL_DEMOS["tb.n.chromatic"]?.code ?? "", 3)).events
      .filter((e) => e.track === "mel")
      .map((e) => e.midi);
    // G F♯ G · C B♭ A · A G♯ A
    expect(tune).toEqual([67, 66, 67, 72, 70, 69, 69, 68, 69]);
    const horns = await build("snd.horns", 8);
    const chain = horns.colour?.harmony?.chords ?? [];
    expect(chain.filter((c) => c.kind === "applied").map((c) => `${c.symbol} ${c.rn} ${c.resolves}`)).toEqual(
      ["E7 V7/vi true", "A7 V7/ii true", "D7 V7/V true"],
    );
    const tenor = await build("snd.tenor", 4);
    expect(tenor.colour?.harmony?.chords.filter((c) => c.kind === "borrowed").map((c) => c.rn)).toEqual([
      "iv",
      "bVI",
      "bVII",
    ]);
    // Every tune note that falls on a chord change belongs to its chord (no clash on the downbeat).
    for (const id of ["snd.tenor", "snd.trumpet", "tb.n.chromatic"]) {
      const m = await build(id, 4);
      const clash = [...(m.harmony?.melody.values() ?? [])].filter((x) => x.strongBeat && x.role === "other");
      expect({ id, clash: clash.length }).toEqual({ id, clash: 0 });
    }
  });
});

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
