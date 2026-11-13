// The Wave 5 views (docs/design/wave5.md §3.2) on real Strudel output. Facts checked by hand.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { strudel } from "./__support__/fixtures.ts";
import { bassView, bluesView, contrastAxes, formView, swingView } from "./wave5-views.ts";

setDefaultTimeout(20_000);
const C = { tonic: "C", mode: "major" } as const;

describe("formView", () => {
  const code = `setcpm(100/4)
const drumsVerse = s("bd ~ sd ~")
const drumsChorus = s("bd sd bd sd, hh*8")
const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")
const melChorus = n("<[7 9 11 9] [11 ~ 9 ~]>")
const bassVerse = silence
const bassChorus = n("0 ~ 4 ~")
drums: arrange([4, drumsVerse], [4, drumsChorus], [4, drumsVerse], [4, drumsChorus])
bass: arrange([4, bassVerse], [4, bassChorus], [4, bassVerse], [4, bassChorus]).scale("C2:major").s("sawtooth")
mel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus]).scale("C4:major").s("piano")`;

  test("sections of the per-track arrange(), their tracks and features, the energy curve", async () => {
    const n = await strudel(code, 16);
    const v = formView(n, { code });
    if (v.kind !== "sections") throw new Error(v.kind);
    expect(v.totalBars).toBe(16);
    expect(v.sections.map((s) => [s.label, s.startBar, s.bars])).toEqual([
      ["verse", 0, 4],
      ["chorus", 4, 4],
      ["verse", 8, 4],
      ["chorus", 12, 4],
    ]);
    expect(v.sections[0]?.tracks).toEqual(["drums", "mel"]);
    expect(v.sections[1]?.tracks).toEqual(["bass", "drums", "mel"]);
    expect(v.energy).toHaveLength(16);
    const [verse, chorus] = [v.sections[0]?.features, v.sections[1]?.features];
    if (!verse || !chorus) throw new Error("features");
    expect(chorus.density).toBeGreaterThan(verse.density);
    expect(chorus.meanPitch as number).toBeGreaterThan(verse.meanPitch as number);
    expect(chorus.energy).toBeGreaterThan(verse.energy);
    const axes = contrastAxes(verse, chorus);
    expect(axes).toContain("density");
    expect(axes).toContain("instrumentation");
    expect(axes).toContain("pitch");
    expect(contrastAxes(verse, verse)).toEqual([]);
  });
  test("inconsistent and through-composed pieces", async () => {
    const bad = code.replace("mel: arrange([4, melVerse]", "mel: arrange([2, melVerse]");
    const n = await strudel(bad, 16);
    expect(formView(n, { code: bad }).kind).toBe("inconsistent");
    const plain = 'mel: n("0 2 4 2").scale("C4:major").s("piano")';
    const p = await strudel(plain, 8);
    const v = formView(p, { code: plain, bars: 8 });
    expect(v.kind === "through" && v.letters).toBe("AA");
  });
});

describe("bassView", () => {
  test("root, fifth, octave and a chromatic approach, against the chords and the kick", async () => {
    const code = `chords: chord("<C G>").voicing()
bass: note("<[c2 g2 c3 f#2] [g2 d3 g3 g2]>").s("sawtooth")
drums: s("bd ~ bd ~")`;
    const n = await strudel(code, 2);
    const v = bassView(n, { meter: "4/4", key: C });
    expect(v.track).toBe("bass");
    expect(v.notes.map((x) => x.role)).toEqual([
      "root",
      "fifth",
      "octave",
      "approach",
      "root",
      "fifth",
      "octave",
      "root",
    ]);
    expect(v.notes[3]?.approach).toBe("chromatic-below");
    expect(v.notes[0]).toMatchObject({ bar: 1, beat: 1, downbeat: true, chord: "C", onKick: true });
    expect(v.rootOnChange).toBe(1);
    expect(v.groove?.lock).toBe(0.5);
  });
  test("minor keys: the root of Am and the raised-7 approach to E", async () => {
    const code = `chords: chord("<Am E>").voicing()
bass: note("<[a1 e2 a2 d#2] [e2 b2 e3 e2]>").s("sawtooth")`;
    const n = await strudel(code, 2);
    const v = bassView(n, { meter: "4/4", key: { tonic: "A", mode: "minor" } });
    expect(v.notes.map((x) => x.role)).toEqual([
      "root",
      "fifth",
      "octave",
      "approach",
      "root",
      "fifth",
      "octave",
      "root",
    ]);
    expect(v.groove).toBeNull();
  });
});

describe("bluesView", () => {
  test("a quick-change 12-bar in F with a turnaround, all dominant sevenths", async () => {
    const code = `chords: chord("<F7 Bb7 F7 F7 Bb7 Bb7 F7 F7 C7 Bb7 F7 C7>").voicing()`;
    const n = await strudel(code, 12);
    const v = bluesView(n, { meter: "4/4", key: { tonic: "F", mode: "major" }, bars: 12 });
    expect(v.form).toEqual({ variant: "quick-change", turnaround: true, jazz: false });
    expect(v.choruses).toBe(1);
    expect(v.allDominant).toBe(true);
    expect(v.bars[1]).toBe("Bb7");
  });
  test("not a blues: a four-chord loop", async () => {
    const code = `chords: chord("<C G Am F>").voicing()`;
    const n = await strudel(code, 12);
    const v = bluesView(n, { meter: "4/4", key: C, bars: 12 });
    expect(v.form).toBeNull();
    expect(v.allDominant).toBe(false);
  });
});

describe("swingView", () => {
  test("a swung hat line and a straight bass", async () => {
    const code = `hats: s("hh*8").swingBy(1/3, 4)
bass: note("c2*8").s("sawtooth")`;
    const n = await strudel(code, 2);
    const v = swingView(n, "4/4");
    const hats = v.find((t) => t.track === "hats");
    expect(hats?.swung).toBe(8);
    expect(hats?.eighths.ratio).toBeCloseTo(2, 5);
    expect(v.find((t) => t.track === "bass")?.swung).toBeNull();
    expect(swingView(n, "6/8")).toEqual([]);
  });
});
