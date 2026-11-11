// The grader realm in-process (no lockdown: neutering Function in the bun:test process would break the
// runner; the hosts' tests cover the locked-down realm). Ported from spike S1 runtime.test.ts, plus the
// production additions: modes and caps, the Band layer, the chord shim, location roles.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import * as core from "@strudel/core";
import { transpiler } from "@strudel/transpiler";
import { pitchOf } from "../normalize/hap.ts";
import { fails, run } from "../testkit/run.ts";
import type { GraderReady, OakEvent } from "../types.ts";
import { evaluateForGrading } from "./analyze.ts";
import { initRealm, restoreRealm, shadowedGlobals } from "./realm.ts";

setDefaultTimeout(30_000);

const brief = (e: OakEvent) => `${e.track}@${e.begin}-${e.end}:${e.s ?? e.note ?? e.n}`;

let init: GraderReady;
beforeAll(async () => {
  init = await initRealm({ toolbox: [], lockdown: false });
});

describe("realm", () => {
  test("only core, mini and tonal are in scope; repl-only functions are stubs", () => {
    const g = globalThis as Record<string, unknown>;
    for (const name of [
      "setcps",
      "setcpm",
      "setCps",
      "setCpm",
      "samples",
      "hush",
      "all",
      "each",
      "sliderWithID",
      "aliasBank",
    ]) {
      expect(typeof g[name]).toBe("function");
    }
    expect(init.scopeSize).toBeGreaterThan(900);
    for (const name of ["getAudioContext", "webaudioOutput", "superdough"]) expect(g[name]).toBeUndefined();
    // evalScope(mini) must not replace the realm's SyntaxError with the parser's class
    expect(SyntaxError.name).toBe("SyntaxError");
    expect(new SyntaxError("x")).toBeInstanceOf(Error);
  });

  test("visual methods missing from core are identity stubs", async () => {
    expect(init.stubbedMethods).toEqual(
      expect.arrayContaining([
        "pianoroll",
        "_pianoroll",
        "punchcard",
        "_punchcard",
        "scope",
        "_scope",
        "tscope",
        "fscope",
        "spectrum",
        "spiral",
        "pitchwheel",
        "wordfall",
        "markcss",
        "_color",
      ]),
    );
    expect(init.stubbedMethods).not.toContain("color"); // core ships the `color` control
    const plain = await run('note("c4 e4")');
    const dressed = await run(
      'note("c4 e4").pianoroll({ labels: 1 })._punchcard().scope()._scope().fscope().spectrum().color("red").markcss("x")',
    );
    expect(dressed.events.map((e) => [e.begin, e.midi])).toEqual(plain.events.map((e) => [e.begin, e.midi]));
  });

  test(".piano() gives the editor's events: s piano, clip 1, release .1, pan from pitch", async () => {
    const r = await run('note("c4 c8")._pianoroll().piano()');
    expect(r.events.map((e) => [e.s, e.clip, e.midi])).toEqual([
      ["piano", 1, 60],
      ["piano", 1, 108],
    ]);
    const same = await run('note("c4").s("piano")');
    expect(same.events[0]?.midi).toBe(r.events[0]?.midi as number);
  });

  test("slider() is rewritten to sliderWithID and resolves to its value; samples()/aliasBank are inert", async () => {
    expect((await run('note("c4").gain(slider(0.25, 0, 1))')).events.map((e) => e.gain)).toEqual([0.25]);
    const r = await run("samples('github:tidalcycles/dirt-samples')\naliasBank('x', 'y')\ns(\"bd sd\")");
    expect(r.events.map(brief)).toEqual(["main@0-1/2:bd", "main@1/2-1:sd"]);
  });
});

describe(".p collector (repl.mjs 1.2.6 semantics)", () => {
  test("named labels become tracks in source order", async () => {
    const r = await run(
      'drums: s("bd sd")\nbass: note("c2 e2")\nchords: chord("<C>").voicing()\nmel: n("0").scale("C4:major")',
    );
    expect(r.tracks).toEqual(["drums", "bass", "chords", "mel"]);
    expect(new Set(r.events.map((e) => e.track))).toEqual(new Set(["drums", "bass", "chords", "mel"]));
  });

  test("`$:` gets a running index; `_x`, `x_` and `_$` are muted and do not consume an index", async () => {
    const r = await run('$: s("bd")\n_$: s("cp")\n$: s("hh*2")\n_x: s("rim")\ny_: s("rim")\n$: s("oh")');
    expect(r.tracks).toEqual(["$0", "$1", "$2"]);
    expect(r.events.map(brief)).toEqual(["$0@0-1:bd", "$1@0-1/2:hh", "$2@0-1:oh", "$1@1/2-1:hh"]);
  });

  test("solo: any key longer than one character that starts with S (so `Strings:` solos too)", async () => {
    const r = await run('$: s("bd")\nS$: s("hh")\nStrings: s("cp")\nS: s("rim")\nbass: note("c2")');
    expect(r.tracks).toEqual(["S$1", "Strings"]);
  });

  test("the same label twice: the later pattern wins, at the first one's position", async () => {
    const r = await run('a: s("bd")\nb: s("hh")\na: s("sd")');
    expect(r.tracks).toEqual(["a", "b"]);
    expect(r.events.map(brief)).toEqual(["a@0-1:sd", "b@0-1:hh"]);
  });

  test("no labels: the returned pattern is track `main`; with labels a trailing unlabelled line is not played", async () => {
    expect((await run('stack(s("bd"), note("c4"))')).tracks).toEqual(["main"]);
    const r = await run('drums: s("bd")\nnote("c4")');
    expect(r.events.map(brief)).toEqual(["drums@0-1:bd"]);
  });

  test("all() applies to the stack in order, each() keeps only the last transform; track names survive", async () => {
    const r = await run('all(x => x.fast(2))\ndrums: s("bd")\nmel: note("c4")');
    expect(r.events.map(brief)).toEqual(["drums@0-1/2:bd", "mel@0-1/2:c4", "drums@1/2-1:bd", "mel@1/2-1:c4"]);
    expect((await run('each(x => x.fast(4))\neach(x => x.fast(2))\ndrums: s("bd")')).events).toHaveLength(2);
  });

  test(".d1 / .p1 / .p(1) / .p(\"x\") throw like the 1.2.6 repl; .p('x') and .q work", async () => {
    for (const code of ['s("bd").d1', 's("bd").p1', 's("bd").p(1)', 's("bd").p("x")']) {
      const e = await fails(code);
      expect(e.kind).toBe("eval");
      expect(e.message).toContain("id.includes is not a function");
    }
    expect((await run("s('bd').p('x')")).tracks).toEqual(["x"]);
    expect((await run("s('bd').q('x')\ns('hh')")).events.map(brief)).toEqual(["main@0-1:hh"]);
  });

  test("hush() drops what was collected before it", async () => {
    expect((await run('a: s("bd")\nhush()\nb: s("hh")')).tracks).toEqual(["b"]);
  });

  test("state is reset between requests ($ index, cps, tracks)", async () => {
    await run('setcps(2)\n$: s("bd")\n$: s("hh")');
    const r = await run('$: s("cp")');
    expect(r.tracks).toEqual(["$0"]);
    expect(r).toMatchObject({ cps: 0.5, cpsSet: false, bpm: 120 });
  });
});

describe("events", () => {
  test("pitchOf: freq wins, note strings with default octave 3, numbers are MIDI, n alone is unpitched, octave adds 12", () => {
    expect(pitchOf({ note: 60 })).toMatchObject({ midi: 60, pitchSource: "note-num" });
    expect(pitchOf({ note: "c" })).toMatchObject({ midi: 48, pitchSource: "note-str" });
    expect(pitchOf({ note: "cs4" })).toMatchObject({ midi: 61 });
    expect(pitchOf({ note: "ef4" })).toMatchObject({ midi: 63 });
    expect(pitchOf({ note: "Bb2" })).toMatchObject({ midi: 46 });
    expect(pitchOf({ note: "c-1" })).toMatchObject({ midi: 0 });
    expect(pitchOf({ freq: 440, note: "c4" })).toMatchObject({ midi: 69, pitchSource: "freq", freq: 440 });
    expect(pitchOf({ freq: 261.63 }).midi).toBeCloseTo(60, 3);
    expect(pitchOf({ n: 3 })).toMatchObject({ midi: null, pitchSource: "n-index" });
    expect(pitchOf({ s: "bd" })).toMatchObject({ midi: null, pitchSource: "none" });
    expect(pitchOf({ note: "h4" })).toMatchObject({ midi: null, note: "h4" });
    expect(pitchOf(64)).toMatchObject({ midi: 64, pitchSource: "value" });
    expect(pitchOf("e4")).toMatchObject({ midi: 64, pitchSource: "value" });
    expect(pitchOf({ note: "c4", octave: 1 })).toMatchObject({ midi: 72 });
    expect(pitchOf({ note: 60, octave: -1 })).toMatchObject({ midi: 48 });
  });

  test("events are plain JSON with exact fractions, floats, scale context and located atoms", async () => {
    const code = 'n("0 2 4").scale("C4:major")';
    const r = await run(code);
    expect(JSON.parse(JSON.stringify(r.events))).toEqual(r.events);
    expect(r.events[1]).toMatchObject({
      track: "main",
      begin: "1/3",
      end: "2/3",
      beginF: 1 / 3,
      endF: 2 / 3,
      midi: 64,
      pitchSource: "note-str",
      note: "E4",
      scale: "C4 major",
      chord: null,
    });
    expect(r.events[1]?.locations).toEqual([
      { start: 21, end: 26, fn: "scale", text: "major" },
      { start: 18, end: 20, fn: "scale", text: "C4" },
      { start: 5, end: 6, fn: "n", text: "2" },
    ]);
  });

  test("controls: gain, velocity, postgain, clip/legato, octave, bank, sample index", async () => {
    const r = await run('note("c4 e4").gain(.5).velocity(.4).postgain(2).legato(.5).octave(1)');
    expect(r.events.map((e) => [e.midi, e.gain, e.velocity, e.postgain, e.clip, e.octave])).toEqual([
      [72, 0.5, 0.4, 2, 0.5, 1],
      [76, 0.5, 0.4, 2, 0.5, 1],
    ]);
    const d = await run('s("bd:3 sd").bank("RolandTR909")');
    expect(d.events.map((e) => [e.s, e.n, e.bank, e.midi])).toEqual([
      ["bd", 3, "RolandTR909", null],
      ["sd", null, "RolandTR909", null],
    ]);
  });

  test("the chord shim: every voiced note carries its symbol (voicing, n-first voicing, rootNotes, struct)", async () => {
    const v = await run('chord("<C Am>").voicing().s("rhodes").struct("x x")', { bars: 2 });
    expect([...new Set(v.events.map((e) => `${Math.floor(e.beginF)}:${e.chord}`))]).toEqual(["0:C", "1:Am"]);
    const n = await run('n("0 1 2 3").chord("<C Am>").voicing()', { bars: 2 });
    expect(n.events.map((e) => [e.note, e.chord])).toEqual([
      [52, "C"],
      [60, "C"],
      [64, "C"],
      [67, "C"],
      [57, "Am"],
      [60, "Am"],
      [64, "Am"],
      [69, "Am"],
    ]);
    const roots = await run('chord("<C Am>").rootNotes(2)', { bars: 2 });
    expect(roots.events.map((e) => [e.midi, e.chord])).toEqual([
      [36, "C"],
      [45, "Am"],
    ]);
    const plain = await run('chord("<C Am>")', { bars: 2 });
    expect(plain.events.map((e) => [e.midi, e.chord])).toEqual([
      [null, "C"],
      [null, "Am"],
    ]);
  });

  test("the shims act only inside a request: plain Strudel outside one is untouched", () => {
    // rootNotes() and cpm() are wrapped by the realm; outside a request they behave like core.
    const roots = core.chord("C").rootNotes(2).queryArc(0, 1)[0] as Strudel.Hap | undefined;
    expect(roots?.context.oakChord).toBeUndefined();
    expect(core.s("bd").fast(4).cpm(60).queryArc(0, 1)).toHaveLength(4);
  });

  test("only haps with a whole and an onset; per-cycle querying equals one big query", async () => {
    expect((await run('note("c4").slow(4)', { bars: 4 })).events.map(brief)).toEqual(["main@0-4:c4"]);
    expect((await run('note("c4 e4").late(0.25)', { bars: 2 })).events.map((e) => e.begin)).toEqual([
      "1/4",
      "3/4",
      "5/4",
      "7/4",
    ]);
    const cont = await run("note(sine.range(60, 72))");
    expect(cont.events).toEqual([]);
    expect(cont.diagnostics.map((d) => d.id)).toContain("eval.silent");
    const code = 's("bd*3, hh*8").swingBy(1/3, 4).every(3, x => x.fast(2)).off(1/8, x => x.speed(2))';
    const chunked = await run(code, { bars: 6 });
    const big = (await core.evaluate(code, transpiler)).pattern
      .queryArc(0, 6)
      .filter((h: Strudel.Hap) => h.whole && h.hasOnset());
    expect(chunked.events).toHaveLength(big.length);
    expect(chunked.events.map((e) => e.begin).sort()).toEqual(
      big.map((h: Strudel.Hap) => (h.whole as Strudel.TimeSpan).begin.toFraction()).sort(),
    );
  });

  test("sorted by (onset, track order, midi) across cycle boundaries", async () => {
    const r = await run('mel: note("[e4,c4] g4")\nbass: note("c2").slow(2)', { bars: 2 });
    expect(r.events.map((e) => `${e.begin}:${e.track}:${e.midi}`)).toEqual([
      "0:mel:60",
      "0:mel:64",
      "0:bass:36",
      "1/2:mel:67",
      "1:mel:60",
      "1:mel:64",
      "3/2:mel:67",
    ]);
  });
});

describe("errors surface instead of being swallowed", () => {
  test("mini-notation parse error, JS syntax error with its line, unknown method", async () => {
    expect(await fails('note("c4 [e4")')).toMatchObject({ kind: "eval" });
    const syntax = await fails('setcpm(120/4)\nnote("c4"');
    expect(syntax).toMatchObject({ kind: "eval", line: 2 });
    expect((await fails('note("c4").foo()')).message).toContain("is not a function");
  });
  test("query-time errors throw where queryArc would log and return []", async () => {
    expect(await fails('note("c4 e4").scaleTranspose(1)')).toMatchObject({
      kind: "query",
      message: "bar 1: can only use scaleTranspose after .scale",
    });
    expect(await fails("note('c4').fmap(x => { throw new Error('boom') })")).toMatchObject({
      kind: "query",
      message: "bar 1: boom",
    });
  });
  test("a non-pattern result is reported (the repl would silently play nothing)", async () => {
    expect(await fails("42")).toMatchObject({ kind: "not-a-pattern" });
    expect(await fails('drums: s("bd")\nall(x => 1)')).toMatchObject({ kind: "not-a-pattern" });
  });
  test("code must end in an expression; empty code is silence, not an error", async () => {
    expect((await fails("const x = 1")).message).toContain("unexpected ast format without body expression");
    const r = await run("// nothing yet");
    expect(r.events).toEqual([]);
    expect(r.diagnostics.map((d) => d.id)).toEqual(["eval.silent"]);
  });
  test("dynamic import is always rejected, even without the lint", async () => {
    const e = await fails("const fs = await import('node:fs')\ns('bd')");
    expect(e.kind).toBe("eval");
    expect(e.message).toContain("import()");
  });
  test("a lint error means no evaluation; the failure carries the findings", async () => {
    const r = await evaluateForGrading('mel: note("c4").mode("above")', {
      mode: "lesson",
      bars: 1,
      lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("lint");
    expect(r.error.lint?.map((d) => d.id)).toContain("code.mode-above");
    expect(r.lint?.ok).toBe(false);
  });
  test("non-blocking lint findings travel with a successful result", async () => {
    const r = await evaluateForGrading('$: note("c4")', {
      mode: "lesson",
      bars: 1,
      lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diagnostics.map((d) => d.id)).toEqual(
      expect.arrayContaining(["code.dollar-label", "code.setcpm-missing"]),
    );
  });
});

describe("work limits and modes", () => {
  test("hap cap", async () => {
    expect(await fails('s("bd*64")', { bars: 4, hapCap: 100 })).toMatchObject({
      kind: "too-many-events",
      message: "more than 100 events in 2 bar(s)",
    });
  });
  test('s("bd*1000000") and friends are stopped by the fuel budget before the haps exist', async () => {
    const t0 = performance.now();
    const e = await fails('s("bd*1000000")', { bars: 4 });
    expect(e.kind).toBe("too-much-work");
    expect(performance.now() - t0).toBeLessThan(1400);
    for (const code of [
      's("bd").fast(1e12)',
      '"~ bd*1000000"',
      's("bd").struct("x*1000000")',
      'note("c4*16").ply(1000).ply(100)',
    ]) {
      expect((await fails(code)).kind).toBe("too-much-work");
    }
  });
  test("a normal lesson spends about 40–55 fuel per event", async () => {
    const r = await run(
      'drums: s("bd*4, hh*8").bank("RolandTR909")\nchords: chord("<C Am F G>").voicing()\nmel: n("0 2 4 <6 7>").scale("C4:major")',
      { bars: 8 },
    );
    expect(r.events).toHaveLength(166);
    expect(r.fuelUsed / r.events.length).toBeLessThan(120);
  });
  test("caps per mode: lesson 64 bars, tutor 16 bars from fromBar, capstone up to 128", async () => {
    expect((await run('s("bd")', { bars: 500 })).bars).toBe(64);
    const t = await run('note("<c4 d4 e4 f4>")', { mode: "tutor", bars: 40, fromBar: 3 });
    expect(t.bars).toBe(16);
    expect(t.events[0]).toMatchObject({ begin: "2", note: "e4" });
    expect(t.events).toHaveLength(16);
    const c = await run('s("bd")', { mode: "capstone", bars: 300 });
    expect(c).toMatchObject({ bars: 128, truncated: true });
    expect(c.diagnostics.map((d) => d.id)).toContain("eval.truncated");
  });
  test("capstone: total length from the arrange() sum in the AST (never played), first 128 bars queried", async () => {
    const code = [
      "setcpm(100/4)",
      'const drumsVerse = s("bd sd")',
      'const drumsChorus = s("bd*2 sd")',
      "drums: arrange([8, drumsVerse], [8, drumsChorus], [8, drumsVerse])",
    ].join("\n");
    const r = await run(code, { mode: "capstone", bars: 4 });
    expect(r).toMatchObject({ bars: 24, totalBars: 24, truncated: false });
    const long = code.replace(/\[8,/g, "[60,");
    const l = await run(long, { mode: "capstone", bars: 4 });
    expect(l).toMatchObject({ bars: 128, totalBars: 180, truncated: true });
  });
  test("totalBars without arrange(): the period of the events, capped by the mode", async () => {
    expect((await run('note("<c4 d4 e4>")', { bars: 16 })).totalBars).toBe(3);
    expect((await run('note("c4")', { bars: 16 })).totalBars).toBe(1);
    expect((await run('note("<c4 d4 e4>")', { bars: 4 })).totalBars).toBe(4);
  });
});

describe("tempo", () => {
  test("setcpm is captured with repl semantics; bpm follows the meter", async () => {
    expect(await run('setcpm(120/4)\ns("bd")')).toMatchObject({ cps: 0.5, cpsSet: true, bpm: 120 });
    expect(await run('setcpm(90/3)\ns("bd")', { meter: "3/4" })).toMatchObject({ cps: 0.5, bpm: 90 });
    const quoted = await run('setcpm("90")\ns("bd")');
    expect(quoted).toMatchObject({ cps: 0.5, cpsSet: false });
    expect(quoted.diagnostics.map((d) => d.id)).toEqual(["code.setcpm-form"]);
  });
  test(".cpm() is re-registered against the captured cps (8 hits at 0.5 cps, as in the editor)", async () => {
    expect((await run('s("bd*4").cpm(60)')).events).toHaveLength(8);
    expect((await run('setcps(1)\ns("bd*4").cpm(60)')).events).toHaveLength(4);
  });
});

describe("the Band layer", () => {
  test("Band code is evaluated separately and collected as band.<label>; the learner's tempo wins", async () => {
    const r = await run('setcpm(100/4)\nmel: note("c4 e4")', {
      band: 'setcpm(80/4)\ndrums: s("bd sd")\nchords: chord("C").voicing()',
    });
    expect(r.tracks).toEqual(["mel", "band.drums", "band.chords"]);
    expect(r.bpm).toBe(100);
    expect(new Set(r.events.map((e) => e.track))).toEqual(new Set(["mel", "band.drums", "band.chords"]));
    expect(r.events.find((e) => e.track === "band.drums")?.locations[0]?.fn).toBe("s");
  });
  test("a learner piece that is silent apart from the Band is still silent", async () => {
    const r = await run('mel: note("~")', { band: 'drums: s("bd")' });
    expect(r.diagnostics.map((d) => d.id)).toContain("eval.silent");
  });
});

describe("realm healing and shadowing", () => {
  test("register('note', …) and `note = …` poison a realm; the snapshot undoes both", async () => {
    await run("register('note', (x, pat) => pat.s('poisoned'))\nnote = undefined\ns('bd')").catch(() => {});
    expect((await run('note("c4")')).events.map(brief)).toEqual(["main@0-1:c4"]);
    await run("register('oakTemp', (pat) => pat.fast(2))\ns('bd').oakTemp()");
    expect(await fails("s('bd').oakTemp()")).toMatchObject({ kind: "eval" });
    expect(restoreRealm()).toEqual([]);
  });
  test("the shadow list is an allowlist complement", () => {
    const list = shadowedGlobals();
    for (const name of [
      "Bun",
      "process",
      "require",
      "globalThis",
      "self",
      "fetch",
      "WebSocket",
      "Worker",
      "Function",
      "ShadowRealm",
      "WebAssembly",
      "Reflect",
      "Proxy",
      "setTimeout",
      "queueMicrotask",
      "postMessage",
      "evaluate",
      "evalScope",
      "strudelScope",
      "repl",
      "console",
      "prompt",
      "Buffer",
    ]) {
      expect(list).toContain(name);
    }
    for (const name of [
      "note",
      "s",
      "n",
      "stack",
      "Math",
      "Number",
      "JSON",
      "Array",
      "Object",
      "eval",
      "arguments",
      "silence",
      "register",
    ]) {
      expect(list).not.toContain(name);
    }
  });
  test("evaluated code sees undefined for shadowed names, a safe console, and still runs Strudel", async () => {
    const r = await run(
      "console.log('seen', typeof Bun, typeof process, typeof fetch, typeof globalThis, typeof require, typeof setTimeout)\ns('bd')",
    );
    expect(r.logs).toEqual([
      {
        level: "log",
        tag: null,
        message: "seen undefined undefined undefined undefined undefined undefined",
      },
    ]);
  });
});
