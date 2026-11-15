// The advanced tracks' tool examples (demos-w7.ts): every tool a track unlocks has one; each lints clean at every
// site that unlocks its tool on the earliest legal route (content/lib/course.ts through the content-CI harness);
// each plays with every part sounding; and each musical claim of its hint holds on the evaluated events.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { MeterId, SessionId } from "@oak/content-kit";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { evalHeadless, type HeadlessEvent } from "@oak/grader/testing";
import { chordPcs, parseChordSymbol, swingRatio } from "@oak/theory";
import { toolbox } from "../../../content/toolbox.ts";
import { lint } from "../../../content/validate/harness.ts";
import { buildModel, type WorkbenchModel } from "../workbench/model.ts";
import { toolDemo } from "./demos.ts";
import { TRACK_TOOL_DEMOS } from "./demos-w7.ts";

setDefaultTimeout(120_000);
beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

const TRACK_SITE = /^(J\d|R\d|JC\d|RC\d|AC\d)\.|^A1\.L0[5-7]$|^A2\./;
const sitesOf = (id: string): string[] => {
  const t = toolbox.find((x) => x.id === id);
  if (!t) return [];
  return Array.isArray(t.unlock.at) ? [...t.unlock.at] : [t.unlock.at];
};
/** The test realm has no `.fscope()` (contracts §3.1 rule 9: identity in the grader realm). */
const plain = (code: string) => code.replace(/\.f?scope\(\s*\)/g, "");
const run = async (id: string, bars = 4) =>
  (await evalHeadless(plain(TRACK_TOOL_DEMOS[id]?.code ?? ""), bars)).events;
const on = (es: readonly HeadlessEvent[], track: string) => es.filter((e) => e.track === track);
const pcs = (es: readonly HeadlessEvent[]) =>
  [...new Set(es.map((e) => (((e.midi as number) % 12) + 12) % 12))].sort((a, b) => a - b);
const inBar = (es: readonly HeadlessEvent[], bar: number) =>
  es.filter((e) => Math.floor(e.onset + 1e-9) === bar);
const chordSet = (sym: string) =>
  new Set(chordPcs(parseChordSymbol(sym) as NonNullable<ReturnType<typeof parseChordSymbol>>) as number[]);
async function model(id: string, bars: number, meter: MeterId = "4/4"): Promise<WorkbenchModel> {
  const code = plain(TRACK_TOOL_DEMOS[id]?.code ?? "");
  const out = buildModel(code, await evaluateForGrading(code, { mode: "lesson", bars, lint: null, meter }), {
    meter,
    key: null,
    staff: false,
  });
  if (!out.ok) throw new Error(`${id}: ${out.error.message}`);
  return out.model;
}

describe("the advanced tracks' tool examples", () => {
  test("every tool a track unlocks that has a code example (and the jazz glyphs) has a groove of its own", () => {
    const want = toolbox
      .filter((t) => sitesOf(t.id).some((s) => TRACK_SITE.test(s)))
      .filter((t) => t.catalog.demo.trim() !== "" || t.id === "tb.feature.jazz-glyphs")
      .map((t) => t.id);
    expect(want.filter((id) => !toolDemo(id))).toEqual([]);
    // Each example of this file is a track tool's.
    for (const id of Object.keys(TRACK_TOOL_DEMOS))
      expect({ id, track: sitesOf(id).some((s) => TRACK_SITE.test(s)) }).toEqual({ id, track: true });
  });

  for (const [id, demo] of Object.entries(TRACK_TOOL_DEMOS)) {
    test(`${id}: lints clean at every site that unlocks it, plays, every part sounds`, async () => {
      const meter = demo.meter ?? "4/4";
      for (const site of sitesOf(id)) {
        const r = lint(demo.code, { session: site as SessionId, meter });
        const bad = r.diagnostics.filter((d) => d.severity === "error" || d.severity === "warn");
        expect({ id, site, bad: bad.map((d) => `${d.id} ${d.message}`), locked: r.locked }).toEqual({
          id,
          site,
          bad: [],
          locked: [],
        });
      }
      const r = await evalHeadless(plain(demo.code), demo.bars ?? 4);
      const tracks = new Set(r.events.map((e) => e.track));
      const labels = [...demo.code.matchAll(/^([a-z]+):/gm)].map((m) => m[1] as string);
      for (const l of labels) expect({ id, l, sounds: tracks.has(l) }).toEqual({ id, l, sounds: true });
      expect(
        r.logs.filter((l) => /\[(mini|tonal|voicing|query|eval)\]|error|unknown chord/i.test(l)),
      ).toEqual([]);
      expect(demo.hint.length).toBeGreaterThan(40);
    });
  }
});

describe("what the jazz examples say is what plays", () => {
  test("the ride: a hit on every beat and a short one just before beats 3 and 1, swung; hi-hat on 2 and 4", async () => {
    const es = inBar(on(await run("snd.jazzkit", 1), "drums"), 0);
    expect(es.filter((e) => e.s === "rd").map((e) => e.begin)).toEqual([
      "0",
      "1/4",
      "5/12",
      "1/2",
      "3/4",
      "11/12",
    ]);
    expect(es.filter((e) => e.s === "hh").map((e) => e.begin)).toEqual(["1/4", "3/4"]);
  });

  test("the vibes: every note on a beat belongs to the chord of its bar", async () => {
    const changes = ["Dm7", "G7", "C^7", "C^7"];
    for (const e of on(await run("snd.vibes"), "mel")) {
      if (Math.abs(e.onset * 4 - Math.round(e.onset * 4)) > 1e-9) continue;
      const bar = Math.floor(e.onset + 1e-9);
      expect({ at: e.begin, in: chordSet(changes[bar] as string).has((e.midi as number) % 12) }).toEqual({
        at: e.begin,
        in: true,
      });
    }
  });

  test("6 and sus: C6 holds A; G7sus holds C where G7 has B", async () => {
    const ch = on(await run("chord.sixth-sus"), "chords");
    expect(pcs(inBar(ch, 0))).toContain(9);
    const bar3 = inBar(ch, 2);
    expect(pcs(bar3.filter((e) => e.onset < 2.5))).toContain(0);
    expect(pcs(bar3.filter((e) => e.onset < 2.5))).not.toContain(11);
    expect(pcs(bar3.filter((e) => e.onset >= 2.5))).toContain(11);
    expect(pcs(bar3.filter((e) => e.onset >= 2.5))).not.toContain(0);
  });

  test("jazz glyphs: the chord band's names", async () => {
    const m = await model("tb.feature.jazz-glyphs", 4);
    expect(m.track?.regions.map((r) => r.jazz)).toEqual(["D–7", "G7", "C∆7", "Bø7", "E7"]);
  });

  test("guide tones: F and C, F and B, E and B", async () => {
    const ch = on(await run("tb.dict.guidetones"), "chords");
    expect([0, 1, 2].map((b) => pcs(inBar(ch, b)))).toEqual([
      [0, 5],
      [5, 11],
      [4, 11],
    ]);
  });

  test("set and voicing n: the tune plays the notes of each bar's chord", async () => {
    const changes = ["Dm7", "G7", "C^7", "C^7"];
    for (const id of ["tb.set", "tb.voicing.n"])
      for (const e of on(await run(id), "mel"))
        expect({
          id,
          at: e.begin,
          in: chordSet(changes[Math.floor(e.onset + 1e-9)] as string).has((e.midi as number) % 12),
        }).toEqual({
          id,
          at: e.begin,
          in: true,
        });
  });

  test("the minor ii–V–i: A♭ in Dm7♭5 and in G7♭9", async () => {
    const ch = on(await run("chord.alt"), "chords");
    expect(pcs(inBar(ch, 0))).toContain(8);
    expect(pcs(inBar(ch, 1))).toContain(8);
    expect(pcs(inBar(ch, 1))).toContain(11);
  });

  test("extensions: the tension lens names E over Dm9 the 9, E over G13 the 13, D over C∆9 the 9", async () => {
    const m = await model("chord.ext", 4);
    const first = (bar: number) => m.events.find((e) => e.track === "mel" && e.bar === bar);
    expect([1, 2, 3].map((b) => m.track?.tensions.get(first(b)?.id ?? "")?.tag)).toEqual(["9", "13", "9"]);
  });

  test("ireal-ext: E in Dm9, E in G13, D in C∆9, inside each voicing", async () => {
    const ch = on(await run("tb.dict.ireal-ext"), "chords");
    expect([0, 1, 2].map((bar) => pcs(inBar(ch, bar)))).toEqual([
      expect.arrayContaining([4]),
      expect.arrayContaining([4]),
      expect.arrayContaining([2]),
    ]);
  });

  test("Locrian with its C over Bm7♭5, G♯ over E7; altered over G7alt; Lydian dominant's G♯ over D7", async () => {
    const loc = on(await run("scale.locrian"), "mel");
    expect(pcs(inBar(loc, 0))).toContain(0);
    expect(pcs(inBar(loc, 1))).toContain(8);
    const alt = on(await run("scale.altered"), "mel");
    const altered = new Set([7, 8, 10, 11, 1, 3, 5]);
    expect(pcs(inBar(alt, 1)).every((pc) => altered.has(pc))).toBe(true);
    expect(pcs(inBar(alt, 1))).toContain(3);
    const lyd = on(await run("scale.lydian-dominant"), "mel");
    expect(pcs(inBar(lyd, 1))).toContain(8);
  });

  test("bebop: the run down puts G, F, D and B on the beats and lands on C", async () => {
    const mel = on(await run("scale.bebop"), "mel");
    const bar2 = inBar(mel, 1);
    expect(pcs(bar2)).toContain(6);
    expect(pcs(bar2)).toContain(5);
    const beats = bar2.filter((e) => Math.abs((e.onset - 1) * 4 - Math.round((e.onset - 1) * 4)) < 1e-9);
    // Swung eighths: the beats themselves do not move.
    expect(beats.map((e) => (e.midi as number) % 12)).toEqual([7, 5, 2, 11]);
    expect(inBar(mel, 2).map((e) => (e.midi as number) % 12)).toEqual([0]);
  });

  test("duck: the chord stays at or under the tune and never plays its note", async () => {
    const es = await run("tb.mode.duck");
    const anchor = [65, 65, 64, 64];
    for (const e of on(es, "chords")) {
      const a = anchor[Math.floor(e.onset + 1e-9)] as number;
      expect({ at: e.begin, below: (e.midi as number) < a }).toEqual({ at: e.begin, below: true });
    }
  });

  test("offset: C∆7 plays E G B D, the 3rd lowest", async () => {
    const c = inBar(on(await run("tb.offset"), "chords"), 2).map((e) => e.midi as number);
    expect(c.sort((a, b) => a - b).map((m) => m % 12)).toEqual([4, 7, 11, 2]);
  });

  test("the muted trumpet's riff stays on F blues; the jazz blues runs its twelve bars", async () => {
    const blues = new Set([5, 8, 10, 11, 0, 3]);
    expect(pcs(on(await run("snd.mutetpt"), "mel")).every((pc) => blues.has(pc))).toBe(true);
    const m = await model("tb.template.jazz-blues-f", 12);
    const names = (m.harmony?.regions ?? []).map((r) => r.symbol).filter((x, i, a) => a[i - 1] !== x);
    expect(names).toEqual([
      "F7",
      "B♭7",
      "F7",
      "Cm7",
      "F7",
      "B♭7",
      "B°7",
      "F7",
      "D7",
      "Gm7",
      "C7",
      "F7",
      "D7",
      "Gm7",
      "C7",
    ]);
  });
});

describe("what the rhythm examples say is what plays", () => {
  test("patterned swing: straight, 11:9, 3:2, close to 2:1, bar by bar", async () => {
    const hh = on(await run("tb.swing.patterned"), "drums").filter((e) => e.s === "hh");
    const ratios = [0, 1, 2, 3].map((bar) => {
      const off = inBar(hh, bar).find((e) => e.onset - bar > 0.0001 && e.onset - bar < 0.25) as HeadlessEvent;
      const pos = (off.onset - bar) * 4;
      return Math.round((pos / (1 - pos)) * 100) / 100;
    });
    expect(ratios).toEqual([1, 1.22, 1.5, 1.99]);
    // The lens draws the swung hats against their straight places.
    const m = await model("tb.swing.patterned", 4);
    const swung = m.events.filter((e) => m.track?.micro.marks.get(e.id)?.kind === "swing");
    expect(swung.length).toBeGreaterThan(0);
    expect(swung.every((e) => e.s === "hh")).toBe(true);
    expect(Math.round(swingRatio(0.1) * 100) / 100).toBe(1.22);
  });

  test("the clavinet's quiet hits are quieter", async () => {
    const keys = on(await run("snd.clav", 1), "keys");
    const g = keys.map((e) => Number(e.value.velocity ?? 1));
    expect(Math.min(...g)).toBeLessThan(0.5);
    expect(Math.max(...g)).toBeGreaterThanOrEqual(0.8);
  });

  test("7/8: three groups counted 1 2 | 1 2 | 1 2 3; the hats louder on each group's first eighth", async () => {
    const m = await model("tb.meter.odd", 2, "7/8");
    expect(m.track?.odd?.text).toBe("7/8 in 2+2+3 (count 1 2 | 1 2 | 1 2 3)");
    const hats = inBar(on(await run("tb.meter.odd", 1), "hats"), 0);
    const loud = hats.filter((e) => Number(e.value.gain ?? 1) >= 1).map((e) => e.begin);
    expect(loud).toEqual(["0", "2/7", "4/7"]);
  });

  test("the polymeter lines up with the bar every three bars", async () => {
    const m = await model("tb.mini.polymeter", 3);
    expect(m.track?.poly?.kind).toBe("polymeter");
    expect(m.track?.poly?.kind === "polymeter" ? m.track.poly.periodBars : 0).toBe(3);
  });

  test("Euclid: the tresillo, the bossa rim, the cinquillo, the rotated tresillo between the kicks", async () => {
    const steps = (es: readonly HeadlessEvent[], n: number) =>
      inBar(es, 0).map((e) => Math.round(e.onset * n));
    expect(steps(on(await run("tb.mini.euclid", 1), "kick"), 8)).toEqual([0, 3, 6]);
    expect(steps(on(await run("tb.mini.euclid-rot", 1), "perc"), 16)).toEqual([0, 3, 6, 10, 13]);
    expect(steps(on(await run("tb.euclid", 1), "perc"), 8)).toEqual([0, 2, 3, 5, 6]);
    const rot = await run("tb.euclidRot", 1);
    const kick = new Set(steps(on(rot, "kick"), 8));
    const rim = steps(on(rot, "perc"), 8);
    expect(rim.length).toBe(3);
    expect(rim.some((s) => kick.has(s))).toBe(false);
  });
});

describe("what the sound examples say is what plays", () => {
  test("each control is set on its part, at the value the hint names", async () => {
    const value = async (id: string, track: string, key: string) =>
      on(await run(id, 1), track)[0]?.value[key];
    expect(await value("tb.crush", "drums", "crush")).toBe(4);
    expect(await value("tb.coarse", "chords", "coarse")).toBe(8);
    expect(await value("tb.distorttype", "bass", "distorttype")).toBe("diode");
    expect(await value("tb.vib", "mel", "vib")).toBe(5);
    expect(await value("tb.vib", "mel", "vibmod")).toBe(0.25);
    expect(await value("tb.phaser", "chords", "phaserrate")).toBe(2);
    expect(await value("tb.tremolo", "chords", "tremolosync")).toBe(8);
    expect(await value("tb.lpmod", "bass", "lprate")).toBe(2);
    expect(await value("tb.lpmod", "bass", "cutoff")).toBe(500);
    expect(await value("tb.fm", "mel", "fmi")).toBe(3);
    expect(await value("tb.unison", "pad", "unison")).toBe(5);
    expect(await value("tb.pw", "bass", "pw")).toBe(0.2);
    expect(await value("tb.postgain", "bass", "postgain")).toBe(0.4);
    expect(await value("tb.duck", "kick", "duckorbit")).toBe(2);
  });

  test("the registers example: bass low, chords in the middle, the tune on top, no clash", async () => {
    const m = await model("tb.fscope", 4);
    expect(m.track?.registers?.parts.map((p) => p.track)).toEqual(["bass", "chords", "mel"]);
    expect(m.track?.registers?.clashes).toEqual([]);
  });

  test("the break: sliced in four, bar 2 with the middle two swapped", async () => {
    const es = inBar(on(await run("tb.chop", 2), "drums"), 1);
    expect(es.map((e) => e.value.begin)).toEqual([0, 0.5, 0.25, 0.75]);
  });
});
