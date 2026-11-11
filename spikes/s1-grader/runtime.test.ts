// SPIKE S1 — goals 1 + 2: grader realm, .p collector, evaluate -> query -> normalized events.
// In-process (no lockdown: neutering Function in the bun:test process would break the runner).
import { beforeAll, describe, expect, test } from "bun:test";
import { analyze, GraderError, initRealm, pitchOf, restoreRealm, shadowedGlobals, __internals, type AnalyzeOptions, type OakEvent } from "./runtime.ts";

const brief = (e: OakEvent) => `${e.track}@${e.begin}-${e.end}:${e.s ?? e.note ?? e.n}`;
/** analyze with a 1-cycle default (most assertions below list one bar) */
const run = (code: string, opts: AnalyzeOptions = {}) => analyze(code, { bars: 1, ...opts });
const fails = async (code: string, opts: AnalyzeOptions = {}) => {
  try {
    await run(code, opts);
  } catch (e) {
    if (e instanceof GraderError) return e;
    throw e;
  }
  throw new Error(`expected a GraderError for: ${code}`);
};

let init: Awaited<ReturnType<typeof initRealm>>;
beforeAll(async () => {
  init = await initRealm();
});

describe("realm", () => {
  test("only core+mini+tonal are in scope; repl-only functions are stubs", () => {
    const g = globalThis as Record<string, unknown>;
    for (const name of ["setcps", "setcpm", "setCps", "setCpm", "samples", "hush", "all", "each", "sliderWithID", "aliasBank"]) {
      expect(typeof g[name]).toBe("function");
    }
    expect(init.scopeSize).toBeGreaterThan(900);
    // nothing from webaudio/superdough/draw leaked in
    for (const name of ["initAudioOnFirstClick", "getAudioContext", "webaudioOutput", "superdough"]) {
      if (name === "initAudioOnFirstClick") continue; // our inert stub
      expect(g[name]).toBeUndefined();
    }
  });

  test("visual methods missing from core are identity stubs", async () => {
    expect(init.stubbedMethods).toEqual(
      expect.arrayContaining(["pianoroll", "_pianoroll", "punchcard", "_punchcard", "scope", "_scope", "tscope", "fscope", "spectrum", "_spectrum", "spiral", "pitchwheel", "wordfall", "markcss", "_color"]),
    );
    expect(init.stubbedMethods).not.toContain("color"); // core ships the `color` control
    const plain = await run('note("c4 e4")');
    const dressed = await run('note("c4 e4").pianoroll({ labels: 1 })._punchcard().scope()._scope().fscope().spectrum().color("red").markcss("x")');
    expect(dressed.events.map((e) => [e.begin, e.midi])).toEqual(plain.events.map((e) => [e.begin, e.midi]));
  });

  test("slider() is rewritten by the transpiler to sliderWithID and resolves to its initial value", async () => {
    const r = await run('note("c4").gain(slider(0.25, 0, 1))');
    expect(r.events).toHaveLength(1);
    expect(r.widgets).toEqual([]); // emitWidgets:false
  });

  test("samples()/hush/aliasBank do not throw", async () => {
    const r = await run("samples('github:tidalcycles/dirt-samples')\naliasBank('x', 'y')\ns(\"bd sd\")");
    expect(r.events.map(brief)).toEqual(["main@0-1/2:bd", "main@1/2-1:sd"]);
  });
});

describe(".p collector (repl.mjs semantics)", () => {
  test("named labels become tracks in source order", async () => {
    const r = await run('drums: s("bd sd")\nbass: note("c2 e2")\nchords: chord("<C>").voicing()\nmel: n("0").scale("C4:major")', { bars: 1 });
    expect(r.tracks).toEqual(["drums", "bass", "chords", "mel"]);
    expect(new Set(r.events.map((e) => e.track))).toEqual(new Set(["drums", "bass", "chords", "mel"]));
  });

  test("`$:` is anonymous with a running index; `_x`, `x_` and `_$` are muted (index NOT consumed)", async () => {
    const r = await run('$: s("bd")\n_$: s("cp")\n$: s("hh*2")\n_x: s("rim")\ny_: s("rim")\n$: s("oh")');
    expect(r.tracks).toEqual(["$0", "$1", "$2"]);
    expect(r.events.map(brief)).toEqual(["$0@0-1:bd", "$1@0-1/2:hh", "$2@0-1:oh", "$1@1/2-1:hh"]);
  });

  test("S-prefix solo: any key longer than 1 char starting with 'S' solos (so a label named `Solo` or `Strings` solos too!)", async () => {
    const r = await run('$: s("bd")\nS$: s("hh")\nStrings: s("cp")\nS: s("rim")\nbass: note("c2")');
    expect(r.tracks).toEqual(["S$1", "Strings"]); // `S` alone (length 1) is NOT solo; $ index was still consumed by `$:`
  });

  test("the same label twice: the later pattern wins, position of the first", async () => {
    const r = await run('a: s("bd")\nb: s("hh")\na: s("sd")');
    expect(r.tracks).toEqual(["a", "b"]);
    expect(r.events.map(brief)).toEqual(["a@0-1:sd", "b@0-1:hh"]);
  });

  test("no labels: the returned pattern is track `main`", async () => {
    const r = await run('stack(s("bd"), note("c4"))');
    expect(r.tracks).toEqual(["main"]);
    expect(r.events).toHaveLength(2);
  });

  test("with labels, a trailing unlabelled expression is NOT played (repl stacks only .p patterns)", async () => {
    const r = await run('drums: s("bd")\nnote("c4")');
    expect(r.tracks).toEqual(["drums"]);
    expect(r.events.map(brief)).toEqual(["drums@0-1:bd"]);
  });

  test("all() applies to the stack of every track, each() keeps only the last transform; track attribution survives", async () => {
    const r = await run('all(x => x.fast(2))\ndrums: s("bd")\nmel: note("c4")');
    expect(r.events.map(brief)).toEqual(["drums@0-1/2:bd", "mel@0-1/2:c4", "drums@1/2-1:bd", "mel@1/2-1:c4"]);
    const e = await run('each(x => x.fast(4))\neach(x => x.fast(2))\ndrums: s("bd")');
    expect(e.events).toHaveLength(2);
  });

  test(".d1 / .p1 / .p(1) throw exactly like the 1.2.6 repl (numeric id has no .includes)", async () => {
    for (const code of ['s("bd").d1', 's("bd").p1', 's("bd").p(1)']) {
      const e = await fails(code);
      expect(e.kind).toBe("eval");
      expect(e.message).toContain("id.includes is not a function");
    }
    // …and so does .p("x") with DOUBLE quotes: the transpiler turns "x" into a mini-notation pattern
    expect((await fails('s("bd").p("x")')).message).toContain("id.includes is not a function");
    expect((await run("s('bd').p('x')")).tracks).toEqual(["x"]);
    expect((await run("s('bd').q('x')\ns('hh')")).events.map(brief)).toEqual(["main@0-1:hh"]);
  });

  test("hush() drops what was collected before it", async () => {
    const r = await run('a: s("bd")\nhush()\nb: s("hh")');
    expect(r.tracks).toEqual(["b"]);
  });

  test("state is reset between requests ($ index, cps, tracks)", async () => {
    await run('setcps(2)\n$: s("bd")\n$: s("hh")');
    const r = await run('$: s("cp")');
    expect(r.tracks).toEqual(["$0"]);
    expect(r.cps).toBe(0.5);
    expect(r.cpsSet).toBe(false);
  });
});

describe("normalization (valueToMidi rules)", () => {
  test("pitchOf", () => {
    expect(pitchOf({ note: 60 })).toMatchObject({ midi: 60, pitchSource: "note" });
    expect(pitchOf({ note: "c" })).toMatchObject({ midi: 48, pitchSource: "note" }); // default octave 3
    expect(pitchOf({ note: "c4" })).toMatchObject({ midi: 60 });
    expect(pitchOf({ note: "C#4" })).toMatchObject({ midi: 61 });
    expect(pitchOf({ note: "cs4" })).toMatchObject({ midi: 61 }); // s = sharp
    expect(pitchOf({ note: "ef4" })).toMatchObject({ midi: 63 }); // f = flat
    expect(pitchOf({ note: "Bb2" })).toMatchObject({ midi: 46 });
    expect(pitchOf({ note: "c-1" })).toMatchObject({ midi: 0 });
    expect(pitchOf({ freq: 440 })).toMatchObject({ midi: 69, pitchSource: "freq", freq: 440 });
    expect(pitchOf({ freq: 261.63 }).midi).toBeCloseTo(60, 3);
    expect(pitchOf({ freq: 440, note: "c4" })).toMatchObject({ midi: 69, pitchSource: "freq" }); // freq wins, as in valueToMidi
    expect(pitchOf({ n: 3 })).toMatchObject({ midi: null, pitchSource: null }); // sample index / unresolved degree
    expect(pitchOf({ s: "bd" })).toMatchObject({ midi: null });
    expect(pitchOf({ note: "" })).toMatchObject({ midi: null, note: "" });
    expect(pitchOf({ note: "h4" })).toMatchObject({ midi: null, note: "h4" });
    expect(pitchOf(64)).toMatchObject({ midi: 64, pitchSource: "value" });
    expect(pitchOf("e4")).toMatchObject({ midi: 64, pitchSource: "value" });
    expect(pitchOf("bd")).toMatchObject({ midi: null });
  });

  test("events are plain JSON with exact fraction strings + floats", async () => {
    const r = await run('n("0 2 4").scale("C4:major")');
    expect(JSON.parse(JSON.stringify(r.events))).toEqual(r.events);
    expect(r.events[1]).toEqual({
      track: "main",
      begin: "1/3",
      end: "2/3",
      beginF: 1 / 3,
      endF: 2 / 3,
      midi: 64,
      pitchSource: "note",
      note: "E4",
      freq: null,
      s: null,
      n: null,
      bank: null,
      scale: "C4 major",
      locations: [
        { start: 21, end: 26 },
        { start: 18, end: 20 },
        { start: 5, end: 6 },
      ],
    });
  });

  test("note numbers, names, default octave, freq, n-without-scale", async () => {
    const r = await run('note("c e4 60 c#5 eb2 61.5")');
    expect(r.events.map((e) => e.midi)).toEqual([48, 64, 60, 73, 39, 61.5]);
    expect(r.events.map((e) => e.note)).toEqual(["c", "e4", 60, "c#5", "eb2", 61.5]);
    const f = await run('freq("440 220")');
    expect(f.events.map((e) => [e.midi, e.freq, e.pitchSource])).toEqual([[69, 440, "freq"], [57, 220, "freq"]]);
    const n = await run('n("0 1 2")');
    expect(n.events.map((e) => [e.midi, e.n])).toEqual([[null, 0], [null, 1], [null, 2]]);
    expect(n.diagnostics.map((d) => d.code)).toContain("pitch.n-without-scale");
    const drums = await run('s("bd:3 sd").n("<1 2>")');
    expect(drums.events.map((e) => [e.s, e.n, e.midi])).toEqual([["bd", 1, null], ["sd", 1, null]]); // later n() overrides bd:3
    expect(drums.diagnostics).toEqual([]);
  });

  test("only haps with a whole and an onset are kept; one-cycle-at-a-time querying equals one big query", async () => {
    const r = await run('note("c4").slow(4)', { bars: 4 });
    expect(r.events.map(brief)).toEqual(["main@0-4:c4"]);
    const late = await run('note("c4 e4").late(0.25)', { bars: 2 }); // first hap of cycle 0 started at -1/4+… fragments dropped
    expect(late.events.map((e) => e.begin)).toEqual(["1/4", "3/4", "5/4", "7/4"]);
    const cont = await run("note(sine.range(60, 72))");
    expect(cont.events).toEqual([]); // continuous signals have no whole
    expect(cont.diagnostics.map((d) => d.code)).toContain("eval.silence");
    const { core } = __internals;
    const code = 's("bd*3, hh*8").swingBy(1/3, 4).every(3, x => x.fast(2)).off(1/8, x => x.speed(2))';
    const chunked = await run(code, { bars: 6 });
    const big = (await core.evaluate(code, (await import("@strudel/transpiler")).transpiler)).pattern
      .queryArc(0, 6)
      .filter((h: { whole: unknown; hasOnset(): boolean }) => h.whole && h.hasOnset());
    expect(chunked.events).toHaveLength(big.length);
    expect(chunked.events.map((e) => e.begin).sort()).toEqual(big.map((h: { whole: { begin: { toFraction(): string } } }) => h.whole.begin.toFraction()).sort());
  });
});

describe("errors surface instead of being swallowed", () => {
  test("mini-notation parse error", async () => {
    const e = await fails('note("c4 [e4")');
    expect(e.kind).toBe("eval");
    expect(e.message).toContain("[mini] parse error at line 1");
  });
  test("JS syntax error (acorn) and unknown method", async () => {
    expect((await fails('note("c4"')).kind).toBe("eval");
    const e = await fails('note("c4").foo()');
    expect(e.kind).toBe("eval");
    expect(e.message).toContain("is not a function");
  });
  test("query-time error: queryArc would log '[query] error' and return [] — pat.query throws", async () => {
    const e = await fails('note("c4 e4").scaleTranspose(1)');
    expect(e.kind).toBe("query");
    expect(e.message).toBe("cycle 0: can only use scaleTranspose after .scale");
    const thrown = await fails("note('c4').fmap(x => { throw new Error('boom') })");
    expect(thrown).toMatchObject({ kind: "query", message: "cycle 0: boom" });
  });
  test("non-pattern result (repl would silently play silence)", async () => {
    expect(await fails("42")).toMatchObject({ kind: "not-a-pattern" });
    expect(await fails('drums: s("bd")\nall(x => 1)')).toMatchObject({ kind: "not-a-pattern" });
  });
  test("code must end in an expression (transpiler rule)", async () => {
    const e = await fails("const x = 1");
    expect(e.message).toContain("unexpected ast format without body expression");
  });
  test("empty code is silence + eval.silence diagnostic, not an error", async () => {
    const r = await run("// nothing yet");
    expect(r.events).toEqual([]);
    expect(r.diagnostics.map((d) => d.code)).toEqual(["eval.silence"]);
  });
  test("dynamic import is always rejected (even without the strict lint)", async () => {
    const e = await fails("const fs = await import('node:fs')\ns('bd')");
    expect(e.kind).toBe("eval");
    expect(e.message).toContain("dynamic import()");
  });
});

describe("work limits", () => {
  test("hap cap", async () => {
    const e = await fails('s("bd*64")', { bars: 4, hapCap: 100 });
    expect(e).toMatchObject({ kind: "too-many-events", message: "more than 100 events in 2 cycle(s)" });
  });
  test('s("bd*1000000") is aborted by the fuel budget before 1M haps are materialised', async () => {
    const t0 = performance.now();
    const e = await fails('s("bd*1000000")', { bars: 4 });
    const ms = performance.now() - t0;
    console.log(`[measure] s("bd*1000000") aborted in ${ms.toFixed(0)} ms: ${e.kind} — ${e.message}`);
    expect(e.kind).toBe("too-much-work");
    expect(ms).toBeLessThan(1400);
    for (const code of ['s("bd").fast(1e12)', '"~ bd*1000000"', 's("bd").struct("x*1000000")', 'note("c4*16").ply(1000).ply(100)']) {
      expect((await fails(code)).kind).toBe("too-much-work");
    }
  });
  test("a normal lesson uses ~40-55 fuel per event", async () => {
    const r = await run('drums: s("bd*4, hh*8").bank("RolandTR909")\nchords: chord("<C Am F G>").voicing()\nmel: n("0 2 4 <6 7>").scale("C4:major")', { bars: 8 });
    console.log(`[measure] lesson: ${r.events.length} events, fuel ${r.fuelUsed} (${(r.fuelUsed / r.events.length).toFixed(1)}/event)`);
    expect(r.events).toHaveLength(166);
    expect(r.fuelUsed).toBeLessThan(20_000);
  });
});

describe("realm healing between requests", () => {
  test("register('note', …) and `note = …` poison the realm in real Strudel; restoreRealm() undoes both", async () => {
    await run("register('note', (x, pat) => pat.s('poisoned'))\nnote = undefined\ns('bd')").catch(() => {});
    const r = await run('note("c4")');
    expect(r.events.map(brief)).toEqual(["main@0-1:c4"]);
    await run("register('oakTemp', (pat) => pat.fast(2))\ns('bd').oakTemp()");
    expect(await fails("s('bd').oakTemp()")).toMatchObject({ kind: "eval" });
    expect(restoreRealm()).toEqual([]); // nothing left to heal
  });
});

describe("shadow list", () => {
  test("computed as allowlist complement; covers host globals, keeps Strudel + safe builtins", () => {
    const list = shadowedGlobals();
    for (const name of ["Bun", "process", "require", "globalThis", "self", "fetch", "WebSocket", "Worker", "Function", "ShadowRealm", "WebAssembly", "Reflect", "Proxy", "setTimeout", "queueMicrotask", "postMessage", "evaluate", "evalScope", "strudelScope", "repl", "console", "prompt", "Buffer", "crypto"]) {
      expect(list).toContain(name);
    }
    for (const name of ["note", "s", "n", "stack", "Math", "Number", "JSON", "Array", "Object", "eval", "arguments", "silence", "register"]) {
      expect(list).not.toContain(name);
    }
  });
  test("evaluated code sees undefined for shadowed names, a safe console, and still runs Strudel", async () => {
    const r = await run("console.log('seen', typeof Bun, typeof process, typeof fetch, typeof globalThis, typeof require, typeof setTimeout)\ns('bd')");
    expect(r.logs).toEqual([{ level: "log", tag: null, message: "seen undefined undefined undefined undefined undefined undefined" }]);
  });
});
