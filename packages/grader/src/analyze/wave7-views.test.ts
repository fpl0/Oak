// Wave 7 views (docs/design/wave7.md §3.2) on real Strudel output, the not-built guard of the Wave 7 rule fields and
// custom rules, and agreement between @oak/theory's computed facts and content-kit's tables.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  AVAILABLE_TENSIONS,
  CLAVE_GRIDS,
  lateMs as kitLateMs,
  swingRatio as kitSwingRatio,
  polymeterPeriodBars,
  type RubricRule,
  TRACK_CUSTOM_RULES,
  voicingShapeOf,
} from "@oak/content-kit";
import {
  availableTensions,
  CHORD_SCALES,
  chordScales,
  claveSteps,
  drop2,
  lateMs,
  parseChordSymbol,
  polymeterPeriod,
  rootlessVoicing,
  shellVoicing,
  swingRatio,
  tensionsOf,
  voicingType,
} from "@oak/theory";
import { CUSTOM_RULES, evalRule } from "../rubric/rules.ts";
import { WAVE7_REBUILD, WAVE7_UNBUILT, wave7UnbuiltCustom } from "../rubric/wave7-rules.ts";
import { strudel } from "./__support__/fixtures.ts";
import {
  claveView,
  densityView,
  euclidView,
  feelView,
  isNotBuilt,
  levelsView,
  registerClashView,
  tensionView,
  twoFiveView,
  voicingView,
  walkingBassView,
} from "./wave7-views.ts";

setDefaultTimeout(30_000);

describe("jazz views", () => {
  test("ii–V pairs and the keys they aim at (JC1: three keys)", async () => {
    const code = `chords: chord("<Dm7 G7 C^7 C^7 Fm7 Bb7 Eb^7 Eb^7 Bm7b5 E7alt Am7 Am7>").voicing()`;
    const v = twoFiveView(await strudel(code, 12), { meter: "4/4" });
    expect(v.map((p) => [p.bar, p.ii, p.v, p.target, p.resolved])).toEqual([
      [1, "Dm7", "G7", "C major", true],
      [5, "Fm7", "Bb7", "E♭ major", true],
      [9, "Bm7b5", "E7alt", "A minor", true],
    ]);
  });
  test("voicing types of hand-written chords; a voicing() line is marked as the dictionary's", async () => {
    const code = `chords: note("<[d3,f3,c4] [g2,f3,b3] [c4,e4,g4,b4] [g3,c4,e4,b4]>").s("piano")`;
    const v = voicingView(await strudel(code, 4), {
      meter: "4/4",
      track: "chords",
      changes: ["Dm7", "G7", "C^7", "C^7"],
    });
    expect(v.map((x) => x.reading.type)).toEqual(["shell", "shell", "close", "drop-2"]);
    const dict = voicingView(await strudel(`chords: chord("<C^7>").voicing()`, 1), {
      meter: "4/4",
      track: "chords",
    });
    expect(dict[0]?.dictionary).toBe(true);
  });
  test("the melody against the chords: a held C♯ over Cmaj7 is outside, an E is a chord tone, a D is the 9", async () => {
    const code = `chords: chord("<C^7 C^7 C^7>").voicing()\nmel: note("<c#5 e5 d5>").s("piano")`;
    const v = tensionView(await strudel(code, 3), { meter: "4/4", melody: "mel" });
    expect(v.map((x) => [x.role, x.structural])).toEqual([
      ["outside", true],
      ["chord-tone", true],
      ["9", true],
    ]);
    const g = tensionView(await strudel(`chords: chord("<G7>").voicing()\nmel: note("c5").s("piano")`, 1), {
      meter: "4/4",
      melody: "mel",
    });
    expect(g[0]).toMatchObject({ role: "11", avoid: true });
  });
});

describe("rhythm views", () => {
  test("swing ratio and microtiming at the piece's tempo", async () => {
    const swung = await strudel(`setcpm(120/4)\nhats: s("hh*8").swingBy(1/3, 4)`, 1);
    expect(feelView(swung, { meter: "4/4" })[0]?.swingRatio).toBeCloseTo(2, 6);
    const late = await strudel(`setcpm(76/4)\nsnare: s("~ sd ~ sd").late(1/64)`, 1);
    // 1/64 of a bar at 76 BPM ≈ 49 ms behind the grid.
    expect(feelView(late, { meter: "4/4" })[0]?.medianOffsetMs).toBeCloseTo(49.3, 0);
  });
  test("Euclid per bar and the clave window by window (coverage: two bars in eight is not eight)", async () => {
    const e = euclidView(await strudel(`perc: s("<cb(3,8) cb(5,8,1)>")`, 2), { meter: "4/4", track: "perc" });
    expect(e.map((b) => b.euclid)).toEqual([
      { pulses: 3, steps: 8, rotation: 0 },
      { pulses: 5, steps: 8, rotation: 1 },
    ]);
    const full = claveView(await strudel(`perc: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")`, 8), {
      meter: "4/4",
      track: "perc",
      bars: 8,
    });
    expect(full.first).toEqual({ type: "son", direction: "3-2" });
    expect(full.coveredBars).toBe(8);
    const two = claveView(
      await strudel(
        `perc: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~] ~ ~ ~ ~ ~ ~>")\nhats: s("hh*8")`,
        8,
      ),
      { meter: "4/4", track: "perc", bars: 8 },
    );
    expect(two.coveredBars).toBe(2);
  });
});

describe("sound views", () => {
  test("register clashes, density and levels", async () => {
    const mud = await strudel(`chords: note("[e2,g#2]").s("piano")\nhigh: note("[c4,e4]").s("piano")`, 1);
    expect(registerClashView(mud, { meter: "4/4" }).map((c) => [c.low, c.high])).toEqual([[40, 44]]);
    const d = densityView(await strudel(`a: note("<c4 [c4 e4 g4 c5]>").s("piano")`, 2), { meter: "4/4" });
    expect(d.map((b) => b.onsetsPerBar)).toEqual([1, 4]);
    const l = levelsView(await strudel(`a: note("c4").gain(.8)\nb: note("e4").gain(.04)`, 1), {
      meter: "4/4",
    });
    expect(l.find((x) => x.track === "b")?.heard).toBe(false);
  });
  test("every view of wave7.md §3.2 is built (none answers not built yet)", async () => {
    expect(isNotBuilt(walkingBassView(await strudel(`bass: note("c2 e2 g2 b2")`, 1), { meter: "4/4" }))).toBe(
      false,
    );
  });
});

describe("Wave 7 rule fields and custom rules are built", () => {
  const n0 = () => strudel(`perc: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")`, 2);
  test("the new rule fields are evaluated (no field is guarded any more)", async () => {
    const n = await n0();
    const base = { id: "r", label: "r", required: true, skills: [] };
    expect(WAVE7_UNBUILT).toHaveLength(0);
    const r = {
      ...base,
      rule: "clave",
      track: "perc",
      type: "son",
      direction: "3-2",
      minBars: 2,
    } as RubricRule;
    const e = evalRule(r, n, { meter: "4/4", code: "", params: {}, bars: 2 });
    expect(e.ok).toBe(true);
    expect(e.detail.startsWith("not built yet")).toBe(false);
  });
  test("every planned custom rule is built and none answers not built yet", async () => {
    const n = await n0();
    expect(wave7UnbuiltCustom(Object.keys(CUSTOM_RULES))).toEqual([]);
    for (const fn of Object.keys(TRACK_CUSTOM_RULES)) {
      const e = evalRule(
        { id: "r", label: "r", required: true, skills: [], rule: "custom", fn, params: {} } as RubricRule,
        n,
        { meter: "4/4", code: "", params: {} },
      );
      expect({ fn, notBuilt: e.detail.startsWith("not built yet") }).toEqual({ fn, notBuilt: false });
    }
    for (const fn of WAVE7_REBUILD) expect(Object.keys(TRACK_CUSTOM_RULES)).toContain(fn);
  });
});

describe("@oak/theory and content-kit say the same", () => {
  test("swing, microtiming, polymeter and clave grids", () => {
    for (const a of [0, 0.1, 0.2, 1 / 3, 0.5]) expect(swingRatio(a)).toBeCloseTo(kitSwingRatio(a), 12);
    expect(lateMs(1 / 32, 76)).toBeCloseTo(kitLateMs(1 / 32, 76, 4), 9);
    for (const [s, b] of [
      [3, 4],
      [5, 8],
      [7, 8],
    ] as const)
      expect(polymeterPeriod(s, b)).toBe(polymeterPeriodBars(s, b));
    for (const type of ["son", "rumba"] as const)
      for (const dir of ["3-2", "2-3"] as const) {
        const [a, b] = CLAVE_GRIDS[type][dir];
        const steps = [...a.map(([n, d]) => (n * 8) / d), ...b.map(([n, d]) => (n * 8) / d + 8)];
        expect(claveSteps(type, dir)).toEqual(steps);
      }
  });
  test("every tension content-kit allows is available in one of theory's chord-scales; none it avoids is", () => {
    for (const [q, row] of Object.entries(AVAILABLE_TENSIONS)) {
      if (!row) continue;
      const chord = parseChordSymbol(
        `C${q === "maj7" ? "^7" : q === "dim7" ? "o7" : q === "mMaj7" ? "m^7" : q === "7sus4" ? "7sus" : q}`,
      );
      expect({ q, chord: !!chord }).toEqual({ q, chord: true });
      if (!chord) continue;
      const scales = chordScales(chord);
      const avail = new Set(scales.flatMap((s) => availableTensions(chord, s).map((t) => t.semis)));
      for (const t of row.tensions) expect({ q, t, ok: avail.has(t) }).toEqual({ q, t, ok: true });
      const avoidHeld = new Set(
        scales.flatMap((s) =>
          tensionsOf(chord, s)
            .filter((t) => t.avoid)
            .map((t) => t.semis),
        ),
      );
      for (const t of row.avoid)
        expect({ q, t, available: avail.has(t) && !avoidHeld.has(t) }).toEqual({ q, t, available: false });
    }
    expect(Object.keys(CHORD_SCALES).length).toBeGreaterThan(10);
  });
  test("voicing shapes agree where both define one", () => {
    const pcs = (s: string) => {
      const c = parseChordSymbol(s);
      if (!c) throw new Error(s);
      const r = c.rootPc;
      const m3 = ["m7", "m7b5", "dim7"].includes(c.quality);
      return {
        root: r,
        third: (r + (m3 ? 3 : 4)) % 12,
        fifth: (r + (c.quality === "m7b5" ? 6 : 7)) % 12,
        seventh: (r + (c.quality === "maj7" ? 11 : 10)) % 12,
        ninth: (r + 2) % 12,
        thirteenth: (r + 9) % 12,
      };
    };
    const cases: [number[], string][] = [
      [shellVoicing("Dm7"), "Dm7"],
      [shellVoicing("G7", "1-7-3"), "G7"],
      [[60, 64, 67, 71], "C^7"],
      [drop2([60, 64, 67, 71]), "C^7"],
      [rootlessVoicing("Dm7", "A"), "Dm7"],
      [rootlessVoicing("Dm7", "B"), "Dm7"],
      [rootlessVoicing("G7", "A"), "G7"],
      [rootlessVoicing("G7", "B"), "G7"],
    ];
    for (const [m, s] of cases) {
      const ours = voicingType(m, s).type;
      const kit = voicingShapeOf(m, pcs(s));
      expect({ s, m, ours }).toEqual({ s, m, ours: kit ?? "other" });
    }
  });
});
