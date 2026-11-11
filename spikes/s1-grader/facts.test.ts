// SPIKE S1 — goal 3: Strudel 1.2.6 facts the curriculum / dialect spec depends on, pinned as tests.
// Every expectation below was observed, not assumed. If a Strudel bump changes one, this file fails.
import { beforeAll, describe, expect, test } from "bun:test";
import { analyze, initRealm, __internals, type AnalyzeOptions, type OakEvent } from "./runtime.ts";

const run = (code: string, opts: AnalyzeOptions = {}) => analyze(code, { bars: 1, ...opts });
const notes = (ev: OakEvent[]) => ev.map((e) => e.note);
const midis = (ev: OakEvent[]) => ev.map((e) => e.midi);
const onsets = (ev: OakEvent[]) => ev.map((e) => e.begin);
const byBar = (ev: OakEvent[], bars: number) =>
  Array.from({ length: bars }, (_, b) => ev.filter((e) => Math.floor(e.beginF) === b).map((e) => e.note).join(" "));

beforeAll(async () => {
  await initRealm();
});

describe("(a) chord().voicing()", () => {
  test('chord("<C Am F G>").voicing() — default dict "ireal": 5-note voicings (4 for G), top note <= C5', async () => {
    const r = await run('chord("<C Am F G>").voicing()', { bars: 4 });
    expect(byBar(r.events, 4)).toEqual(["E3 C4 E4 G4 C5", "A3 C4 E4 A4 C5", "F3 C4 F4 A4 C5", "G3 D4 G4 B4"]);
    expect(r.events.every((e) => e.pitchSource === "note" && typeof e.note === "string")).toBe(true);
    expect(r.logs).toEqual([]);
    // every hap of a chord carries the location of the chord symbol
    expect(r.events[0]?.locations).toEqual([{ start: 8, end: 9 }]);
  });

  test("with n(): voicing is indexed like a scale and notes become NUMBERS", async () => {
    const r = await run('n("0 1 2 3").chord("<C Am>").voicing()', { bars: 2 });
    expect(notes(r.events)).toEqual([52, 60, 64, 67, 57, 60, 64, 69]);
  });

  test("'Cmaj7', 'Cdim', lowercase roots: silence + one '[voicing]: unknown chord' log line each", async () => {
    const r = await run('chord("<Cmaj7 Cdim c am>").voicing()', { bars: 4 });
    expect(r.events).toEqual([]);
    expect(r.logs).toEqual([
      { level: "log", tag: "voicing", message: 'unknown chord "Cmaj7"' },
      { level: "log", tag: "voicing", message: 'unknown chord "Cdim"' },
      { level: "log", tag: "voicing", message: 'unknown chord "c"' },
      { level: "log", tag: "voicing", message: 'unknown chord "am"' },
    ]);
    expect(r.diagnostics.map((d) => d.code)).toEqual(["log.voicing", "log.voicing", "log.voicing", "log.voicing", "eval.silence"]);
  });

  // The matrix. "" = silence (+ a [voicing] log line).
  const SYMBOLS = ["C", "Cm", "C-", "Co", "Caug", "C+", "C^7", "C7", "Cm7", "C-7", "Cm7b5", "Ch7", "Co7"] as const;
  const MATRIX: Record<string, Record<(typeof SYMBOLS)[number], string>> = {
    ireal: {
      C: "E3 C4 E4 G4 C5", Cm: "G3 C4 Eb4 G4 C5", "C-": "G3 C4 Eb4 G4 C5", Co: "Eb3 C4 Eb4 Gb4 C5",
      Caug: "E3 C4 E4 Ab4 C5", "C+": "E3 C4 E4 Ab4 C5", "C^7": "C3 E4 G4 B4", C7: "E3 Bb3 E4 G4 C5",
      Cm7: "Bb3 Eb4 G4 Bb4 C5", "C-7": "Bb3 Eb4 G4 Bb4 C5", Cm7b5: "Bb3 Eb4 Gb4 Bb4 C5", Ch7: "Bb3 Eb4 Gb4 Bb4 C5",
      Co7: "Eb3 C4 Gb4 A4 C5",
    },
    triads: {
      C: "E4 G4 C5", Cm: "Eb4 G4 C5", "C-": "", Co: "Eb4 Gb4 C5",
      Caug: "Eb4 Ab4 C5", // STRUDEL BUG: triads.aug is '1P 3m 5A' (minor third) -> C Eb G#, i.e. an Ab major triad
      "C+": "", "C^7": "", C7: "", Cm7: "", "C-7": "", Cm7b5: "", Ch7: "", Co7: "",
    },
    lefthand: {
      C: "", Cm: "", "C-": "", Co: "", Caug: "", "C+": "",
      "C^7": "B3 D4 E4 G4", C7: "Bb3 D4 E4 A4", Cm7: "Bb3 D4 Eb4 G4", "C-7": "", Cm7b5: "Eb4 Gb4 Bb4 C5", Ch7: "",
      Co7: "C4 Eb4 Gb4 A4",
    },
    guidetones: {
      C: "", Cm: "", "C-": "", Co: "", Caug: "", "C+": "",
      "C^7": "E4 B4", C7: "E4 Bb4", Cm7: "Eb4 Bb4", "C-7": "", Cm7b5: "Eb4 Bb4", Ch7: "", Co7: "Eb4 A4",
    },
    legacy: {
      C: "E4 G4 C5", Cm: "Eb4 G4 C5", "C-": "", Co: "Eb4 Gb4 C5", Caug: "Eb4 Ab4 C5" /* same aug bug */, "C+": "",
      "C^7": "B3 D4 E4 G4", C7: "Bb3 D4 E4 A4", Cm7: "Bb3 D4 Eb4 G4", "C-7": "", Cm7b5: "Eb4 Gb4 Bb4 C5", Ch7: "",
      Co7: "C4 Eb4 Gb4 A4",
    },
  }; // prettier-ignore

  for (const [dict, row] of Object.entries(MATRIX)) {
    test(`symbol matrix — dict '${dict}'`, async () => {
      const got: Record<string, string> = {};
      for (const sym of SYMBOLS) {
        const code = dict === "ireal" ? `chord('${sym}').voicing()` : `chord('${sym}').dict('${dict}').voicing()`;
        const r = await run(code);
        got[sym] = notes(r.events).join(" ");
        // silence always comes with exactly one log line, sound with none
        expect(r.logs).toEqual(got[sym] === "" ? [{ level: "log", tag: "voicing", message: `unknown chord "${sym}"` }] : []);
      }
      expect(got).toEqual(row);
    });
  }

  test("CONSEQUENCE for the dialect spec: no single dictionary set resolves all 9 canonical spellings except ireal / ireal-ext / legacy", async () => {
    const canon = ["C", "Cm", "Co", "Caug", "C^7", "C7", "Cm7", "Cm7b5", "Co7"];
    const resolves: Record<string, string[]> = {};
    for (const dict of ["ireal", "ireal-ext", "legacy", "triads", "lefthand", "guidetones"]) {
      resolves[dict] = [];
      for (const sym of canon) {
        const r = await run(`chord('${sym}').dict('${dict}').voicing()`);
        if (r.events.length) resolves[dict]?.push(sym);
      }
    }
    expect(resolves).toEqual({
      ireal: canon,
      "ireal-ext": canon,
      legacy: canon,
      triads: ["C", "Cm", "Co", "Caug"],
      lefthand: ["C^7", "C7", "Cm7", "Cm7b5", "Co7"],
      guidetones: ["C^7", "C7", "Cm7", "Cm7b5", "Co7"],
    });
  });

  test("other spellings: 'CM7'/'CM' resolve only in ireal(-ext); 'Csus4' resolves nowhere; C6/C9/Cm9 in ireal", async () => {
    const ireal = async (sym: string) => notes((await run(`chord('${sym}').voicing()`)).events).join(" ");
    expect(await ireal("CM7")).toBe("C3 E4 G4 B4");
    expect(await ireal("CM")).toBe("E3 C4 E4 G4 C5");
    expect(await ireal("Csus4")).toBe("");
    expect(await ireal("C6")).toBe("C3 G3 C4 E4 A4");
    expect(await ireal("C9")).toBe("Bb3 D4 E4 Bb4 C5");
    expect(await ireal("Cm9")).toBe("Eb3 Bb3 D4 G4 C5");
  });

  test("voicing() keeps module-global voice-leading state; the runtime resets it per request", async () => {
    const a = await run('chord("<C^7 A7 Dm7 G7>").voicing()', { bars: 4 });
    const b = await run('chord("<C^7 A7 Dm7 G7>").voicing()', { bars: 4 });
    expect(b.events).toEqual(a.events);
  });
});

describe("(b) chromatic scale steps: 0-based index + accidental", () => {
  test('n("3#").scale("C4:major") is midi 66 (♯4) — but Strudel SPELLS it "Gb4"', async () => {
    const r = await run('n("3#").scale("C4:major")');
    expect(r.events.map((e) => [e.midi, e.note, e.scale])).toEqual([[66, "Gb4", "C4 major"]]);
  });
  test('n("6b") = midi 70 (♭7), spelled "A#4"; n("2b") = midi 63 (♭3), spelled "D#4"', async () => {
    expect((await run('n("6b").scale("C4:major")')).events.map((e) => [e.midi, e.note])).toEqual([[70, "A#4"]]);
    expect((await run('n("2b").scale("C4:major")')).events.map((e) => [e.midi, e.note])).toEqual([[63, "D#4"]]);
  });
  test("degrees are 0-based, wrap by octave, negatives go down; scale without octave defaults to octave 3", async () => {
    expect(midis((await run('n("0 1 2 3 4 5 6 7 -1").scale("C4:major")')).events)).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 59]);
    expect(midis((await run('n("0# 3b 7# -1b").scale("C4:major")')).events)).toEqual([61, 64, 73, 58]);
    expect(notes((await run('n("0 2 4").scale("C:minor")')).events)).toEqual(["C3", "Eb3", "G3"]);
  });
  test("patterned .scale() changes key per cycle (the dialect's way to modulate)", async () => {
    const r = await run('n("0 2 4").scale("<C4:major A3:minor>")', { bars: 2 });
    expect(byBar(r.events, 2)).toEqual(["C4 E4 G4", "A3 C4 E4"]);
    expect(r.events.map((e) => e.scale)).toEqual(["C4 major", "C4 major", "C4 major", "A3 minor", "A3 minor", "A3 minor"]);
  });
  test("n() before scale() carries the raw string; an unknown scale logs '[tonal] error: …' and is silent", async () => {
    expect((await run('n("3#")')).events.map((e) => [e.n, e.midi])).toEqual([["3#", null]]);
    const bad = await run('n("0 2").scale("C:notascale")');
    expect(bad.events).toEqual([]);
    expect(bad.logs[0]).toMatchObject({ tag: "tonal" });
    expect(bad.logs[0]?.message).toContain("Scale name C notascale is incomplete");
  });
});

describe("(c) drum banks", () => {
  test('s("bd sd").bank("RolandTR909"): bank stays a separate control (superdough joins `${bank}_${s}` at trigger time)', async () => {
    const r = await run('s("bd sd").bank("RolandTR909")');
    expect(r.events.map((e) => ({ s: e.s, bank: e.bank, n: e.n, midi: e.midi }))).toEqual([
      { s: "bd", bank: "RolandTR909", n: null, midi: null },
      { s: "sd", bank: "RolandTR909", n: null, midi: null },
    ]);
    const raw = (await __internals.core.evaluate('s("bd").bank("RolandTR909")', (await import("@strudel/transpiler")).transpiler)).pattern.queryArc(0, 1);
    expect(raw[0].value).toEqual({ s: "bd", bank: "RolandTR909" });
  });
  test('s("bd:3") splits into { s: "bd", n: 3 }', async () => {
    expect((await run('s("bd:3 hh:1")')).events.map((e) => [e.s, e.n])).toEqual([["bd", 3], ["hh", 1]]);
  });
});

describe("(d) swing", () => {
  test('s("hh*8").swingBy(1/3, 4): off-beat eighths move from x/8 to the triplet position; durations stay 1/8', async () => {
    const r = await run('s("hh*8").swingBy(1/3, 4)');
    expect(onsets(r.events)).toEqual(["0", "1/6", "1/4", "5/12", "1/2", "2/3", "3/4", "11/12"]);
    expect(r.events.map((e) => e.end)).toEqual(["1/8", "7/24", "3/8", "13/24", "5/8", "19/24", "7/8", "25/24"]); // last one overhangs the bar
    const straight = await run('s("hh*8")');
    expect(onsets(straight.events)).toEqual(["0", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"]);
  });
  test("swing(4) === swingBy(1/3, 4)", async () => {
    expect(onsets((await run('s("hh*8").swing(4)')).events)).toEqual(onsets((await run('s("hh*8").swingBy(1/3, 4)')).events));
  });
});

describe("(e) tempo capture", () => {
  test("setcpm / setcps / camelCase aliases; default 0.5 cps", async () => {
    expect(await run('s("bd")')).toMatchObject({ cps: 0.5, cpsSet: false });
    expect(await run('setcpm(120/4)\ns("bd")')).toMatchObject({ cps: 0.5, cpsSet: true });
    expect(await run('setcpm(90)\ns("bd")')).toMatchObject({ cps: 1.5, cpsSet: true });
    expect(await run('setcps(1)\ns("bd")')).toMatchObject({ cps: 1, cpsSet: true });
    expect((await run('setCpm(140/4)\ns("bd")')).cps).toBeCloseTo(140 / 4 / 60, 12);
    expect(await run('setcpm(60)\nsetcpm(120)\ns("bd")')).toMatchObject({ cps: 2 }); // last call wins
  });
  test('setcps("0.75") — a double-quoted argument is transpiled to a mini pattern: tempo is NOT set (real repl gets undefined)', async () => {
    const r = await run('setcps("0.75")\ns("bd")');
    expect(r).toMatchObject({ cps: 0.5, cpsSet: false });
    expect(r.diagnostics).toEqual([{ code: "tempo.invalid", message: "setcps() needs a plain number (no quotes)" }]);
  });
  test(".cpm(n) is relative to the scheduler cps in the repl (core's own version divides by 1): matched here", async () => {
    expect((await run('s("bd*4").cpm(60)')).events).toHaveLength(8); // 60 cpm at 0.5 cps = fast(2)
    expect((await run('setcps(1)\ns("bd*4").cpm(60)')).events).toHaveLength(4);
  });
});

describe("(f) transpose / scaleTranspose", () => {
  test('note("c4 e4").transpose(2): note NAMES stay names (sharp spelling), numbers stay numbers', async () => {
    expect(notes((await run('note("c4 e4").transpose(2)')).events)).toEqual(["D4", "F#4"]);
    expect(notes((await run('note("60 64").transpose(2)')).events)).toEqual([62, 66]);
    expect(notes((await run('note("c4 e4").transpose("3M")')).events)).toEqual(["E4", "G#4"]); // interval strings work
    expect(byBar((await run('note("c4 e4").transpose("<0 12>")', { bars: 2 })).events, 2)).toEqual(["C4 E4", "C5 E5"]);
  });
  test('transpose("x") silently yields note:"" (no log line!) — surfaced as pitch.unresolved', async () => {
    const r = await run('note("c4 e4").transpose("x")');
    expect(r.events.map((e) => [e.note, e.midi])).toEqual([["", null], ["", null]]);
    expect(r.logs).toEqual([]);
    expect(r.diagnostics).toEqual([{ code: "pitch.unresolved", message: "2 event(s) carry a note that is not a note name" }]);
  });
  test("transposing non-notes logs '[tonal] transpose: not a note' and passes the value through", async () => {
    const r = await run('"x y".transpose(2)');
    expect(r.logs).toEqual([
      { level: "log", tag: "tonal", message: 'transpose: not a note "x"' },
      { level: "log", tag: "tonal", message: 'transpose: not a note "y"' },
    ]);
  });
  test("scaleTranspose moves by scale steps and needs .scale() first (throws at QUERY time otherwise)", async () => {
    expect(notes((await run('n("0 2 4").scale("C4:major").scaleTranspose(1)')).events)).toEqual(["D4", "F4", "A4"]);
    expect(byBar((await run('n("0 2 4").scale("C4:major").scaleTranspose("<0 -2>")', { bars: 2 })).events, 2)).toEqual(["C4 E4 G4", "A3 C4 E4"]);
    expect(notes((await run('note("c4 e4").scale("C:major").scaleTranspose(1)')).events)).toEqual(["D4", "F4"]);
    await expect(run('note("c4 e4").scaleTranspose(1)')).rejects.toMatchObject({ kind: "query", message: "cycle 0: can only use scaleTranspose after .scale" });
  });
});

describe("(g) arrange", () => {
  test("arrange([2, a], [2, b]): a for cycles 0-1, b for 2-3, loops at 4", async () => {
    const r = await run('arrange([2, note("c4")], [2, note("e4 g4")])', { bars: 5 });
    expect(r.events.map((e) => `${e.begin}-${e.end}:${e.note}`)).toEqual(["0-1:c4", "1-2:c4", "2-5/2:e4", "5/2-3:g4", "3-7/2:e4", "7/2-4:g4", "4-5:c4"]);
  });
  test("each section restarts at ITS OWN cycle 0 (a `<…>` inside section b starts from its first element)", async () => {
    const r = await run('arrange([2, note("<c d>")], [2, note("<e f g a>")])', { bars: 4 });
    expect(notes(r.events)).toEqual(["c", "d", "e", "f"]);
  });
});

describe("(h) locations", () => {
  test("hap.context.locations: {start,end} offsets into the ORIGINAL code, one per contributing mini-notation leaf, later-applied first", async () => {
    const code = 'note("c4 [e4 g4]").s("piano")';
    const r = await run(code);
    expect(r.events.map((e) => e.locations)).toEqual([
      [{ start: 22, end: 27 }, { start: 6, end: 8 }],
      [{ start: 22, end: 27 }, { start: 10, end: 12 }],
      [{ start: 22, end: 27 }, { start: 13, end: 15 }],
    ]);
    expect(r.events.map((e) => e.locations.map((l) => code.slice(l.start, l.end)))).toEqual([["piano", "c4"], ["piano", "e4"], ["piano", "g4"]]);
  });
  test("meta.miniLocations IS returned by the transpiler: [start,end] pairs for every leaf, in source order", async () => {
    const r = await run('note("c4 [e4 g4]").s("piano")');
    expect(r.miniLocations).toEqual([[6, 8], [10, 12], [13, 15], [22, 27]]);
  });
  test("backtick strings are mini-notation too; single quotes and numbers carry no location", async () => {
    expect((await run("note(`c4 e4`)")).events.map((e) => e.locations)).toEqual([[{ start: 6, end: 8 }], [{ start: 9, end: 11 }]]);
    expect((await run("note('c4')")).events.map((e) => e.locations)).toEqual([[]]);
    expect((await run("note(60)")).events.map((e) => e.locations)).toEqual([[]]);
    expect((await run("note('c4')")).miniLocations).toEqual([]);
  });
  test("labels do not shift locations (offsets stay relative to the whole document)", async () => {
    const code = 'drums: s("bd")\nmel: note("c4")';
    const r = await run(code);
    expect(r.events.map((e) => e.locations.map((l) => code.slice(l.start, l.end)))).toEqual([["bd"], ["c4"]]);
  });
  test("hap.context also carries `scale` for scale-derived notes; a raw Hap is not JSON-serialisable (BigInt fractions)", async () => {
    const { core } = __internals;
    const hap = (await core.evaluate('n("0").scale("C4:major")', (await import("@strudel/transpiler")).transpiler)).pattern.queryArc(0, 1)[0];
    expect(Object.keys(hap.context)).toEqual(["locations", "scale"]);
    expect(typeof hap.whole.begin.n).toBe("bigint");
    expect(() => JSON.stringify(hap)).toThrow();
  });
});

describe("(i) logger capture in a non-browser realm", () => {
  test("logger() only does console.log('%c'+msg, css) here (no document -> no 'strudel.log' CustomEvent)", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    const seen: unknown[][] = [];
    const R = __internals.R;
    const saved = console.log;
    console.log = (...a: unknown[]) => void seen.push(a);
    try {
      __internals.core.logger('[voicing]: unknown chord "X"');
    } finally {
      console.log = saved;
    }
    expect(seen).toEqual([['%c[voicing]: unknown chord "X"', "background-color: black;color:white;border-radius:15px"]]);
    expect(R.logs).toBeNull();
  });
  test("logger() drops a message identical to the previous one for 1000 ms (so 2 identical bad chords = 1 line)", async () => {
    const seen: string[] = [];
    const saved = console.log;
    console.log = (...a: unknown[]) => void seen.push(String(a[0]));
    try {
      const { logger } = __internals.core;
      logger("[voicing]: same");
      logger("[voicing]: same");
      logger("[x] other");
      logger("[voicing]: same");
    } finally {
      console.log = saved;
    }
    expect(seen).toEqual(["%c[voicing]: same", "%c[x] other", "%c[voicing]: same"]);
    const r = await run('chord("<Cmaj7 Cmaj7>").voicing()', { bars: 2 });
    expect(r.logs).toHaveLength(1);
  });
  test("…and the dedupe is cross-request: the runtime resets it, so an identical failing request still gets its log", async () => {
    const a = await run('chord("Cmaj7").voicing()');
    const b = await run('chord("Cmaj7").voicing()');
    expect(a.logs).toEqual([{ level: "log", tag: "voicing", message: 'unknown chord "Cmaj7"' }]);
    expect(b.logs).toEqual(a.logs);
  });
  test("console.* from learner code is captured too (untagged); double-quoted args arrive as Patterns", async () => {
    const r = await run("console.log('hi', 3)\nconsole.warn(\"x\")\nnote('c4')");
    expect(r.logs).toEqual([
      { level: "log", tag: null, message: "hi 3" },
      { level: "warn", tag: null, message: "<Pattern>" },
    ]);
    expect(r.diagnostics).toEqual([]);
  });
});
