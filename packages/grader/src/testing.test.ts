// Facts executed in Wave 0 (contracts §0, docs/spikes.md s1), re-run through the shared test helper so
// every package can rely on it.
import { describe, expect, test } from "bun:test";
import { evalHeadless, midisOf } from "./testing.ts";

describe("evalHeadless", () => {
  test("degrees: n counts from 0 in the scale", async () => {
    expect(await midisOf('n("0 1 2 3 4 5 6 7 -1").scale("C4:major")')).toEqual([
      60, 62, 64, 65, 67, 69, 71, 72, 59,
    ]);
    const r = await evalHeadless('n("0 2 4").scale("D4:major")');
    expect(r.events.map((e) => e.note)).toEqual(["D4", "F#4", "A4"]);
    expect(r.events[0]?.scale).toBe("D4 major");
    expect(r.events.map((e) => e.begin)).toEqual(["0", "1/3", "2/3"]);
  });

  test("chromatic steps (contracts §0.5): 3# is ♯4, 6b is ♭7, 2b is ♭3, and 7b is the trap", async () => {
    expect(await midisOf('n("3# 6b 2b 5b 1b 4# 0#").scale("C4:major")')).toEqual([
      66, 70, 63, 68, 61, 68, 61,
    ]);
    expect(await midisOf('n("7b").scale("C4:major")')).toEqual([71]);
  });

  test("an octave-less note is octave 3; s and f are accidentals", async () => {
    expect(await midisOf('note("c cs4 ef4 f4")')).toEqual([48, 61, 63, 65]);
  });

  test("the tempo line: setcpm(120/4) is 0.5 cps; no tempo line leaves the default", async () => {
    expect(await evalHeadless('setcpm(120/4)\ns("bd*4")')).toMatchObject({ cps: 0.5, cpsSet: true });
    expect(await evalHeadless('setcpm(90)\ns("bd")')).toMatchObject({ cps: 1.5, cpsSet: true });
    expect(await evalHeadless('s("bd")')).toMatchObject({ cps: 0.5, cpsSet: false });
  });

  test("labels become tracks in source order; _muted lines are silent; $: lines are numbered", async () => {
    const r = await evalHeadless(
      'setcpm(96/4)\n\ndrums: s("bd ~ sd ~")\nbass: note("c2*2")\n_mel: note("c5")\n$: s("hh*2")',
    );
    expect(r.tracks).toEqual(["drums", "bass", "$0"]);
    expect(r.events.map((e) => `${e.track}@${e.begin}`)).toEqual([
      "drums@0",
      "bass@0",
      "$0@0",
      "drums@1/2",
      "bass@1/2",
      "$0@1/2",
    ]);
    expect((await evalHeadless('note("c4 e4")')).tracks).toEqual(["main"]);
  });

  test("events are sorted across cycle boundaries", async () => {
    const r = await evalHeadless('note("<c4 e4> g4")', 2);
    expect(r.events.map((e) => [e.begin, e.midi])).toEqual([
      ["0", 60],
      ["1/2", 67],
      ["1", 64],
      ["3/2", 67],
    ]);
  });

  test("swingBy(1/3, 4) delays the off-beats and keeps every length (contracts §0.26)", async () => {
    const r = await evalHeadless('s("hh*8").swingBy(1/3, 4)');
    expect(r.events.map((e) => e.begin)).toEqual(["0", "1/6", "1/4", "5/12", "1/2", "2/3", "3/4", "11/12"]);
    expect(r.events.map((e) => e.end)).toEqual([
      "1/8",
      "7/24",
      "3/8",
      "13/24",
      "5/8",
      "19/24",
      "7/8",
      "25/24",
    ]);
  });

  test("voicing: the default dictionary voices C as E3 C4 E4 G4 C5; Caug in triads is wrong (contracts §0.13)", async () => {
    expect(await midisOf('chord("C").voicing()')).toEqual([52, 60, 64, 67, 72]);
    const wrong = (await midisOf('chord("Caug").dict("triads").voicing()'))
      .map((m) => (m as number) % 12)
      .sort((a, b) => a - b);
    expect(wrong).toEqual([0, 3, 8]); // C E♭ A♭: the pitch classes of an A♭ major triad
    const right = (await midisOf('chord("Caug").voicing()')).map((m) => (m as number) % 12);
    expect([...new Set(right)].sort((a, b) => a - b)).toEqual([0, 4, 8]);
  });

  test("an unknown chord is silent and logs one line; a slash chord throws (contracts §0.3)", async () => {
    const r = await evalHeadless('chord("Cmaj7").voicing()');
    expect(r.events).toEqual([]);
    expect(r.logs.some((l) => l.includes("unknown chord"))).toBe(true);
    await expect(evalHeadless('chord("C/E").voicing()')).rejects.toThrow();
  });

  test("locations point into the original code, later-applied first", async () => {
    const code = 'note("c4 [e4 g4]").s("piano")';
    const r = await evalHeadless(code);
    expect(r.events[0]?.locations.map((l) => code.slice(l.start, l.end))).toEqual(["piano", "c4"]);
  });

  test("a syntax error and a query error both throw", async () => {
    await expect(evalHeadless('note("c4"')).rejects.toThrow();
    await expect(evalHeadless('n("0 2").scaleTranspose(1)')).rejects.toThrow();
  });

  test("concurrent calls do not share labels or tempo", async () => {
    const [a, b] = await Promise.all([
      evalHeadless('setcpm(60/4)\nmel: note("c4")'),
      evalHeadless('setcpm(120/4)\nbass: note("c2 g2")'),
    ]);
    expect([a.tracks, a.cps, a.events.length]).toEqual([["mel"], 0.25, 1]);
    expect([b.tracks, b.cps, b.events.length]).toEqual([["bass"], 0.5, 2]);
  });

  test("the collector is removed afterwards", async () => {
    await evalHeadless('mel: note("c4")');
    const core = await import("@strudel/core");
    expect(Object.hasOwn(core.Pattern.prototype, "p")).toBe(false);
  });
});
