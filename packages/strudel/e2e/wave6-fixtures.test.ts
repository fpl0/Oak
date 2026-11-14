// The music the Wave 6 sound specs play (wave6-fixtures.ts), checked in headless Strudel and against @oak/theory
// before any browser measures it: the CF-A single is the song its spec says it is (length, sections, the four
// devices, the lift on every pitched track), U13.L02's ghost-note groove has its ghosts where the spec measures
// them, and the three CF-T standards' changes are 32 bars of chords theory can read.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { evalHeadless, type HeadlessEvent } from "@oak/grader/testing";
import { appliedReading, borrowedReading, parseChordSymbol, seventhFromPcs } from "@oak/theory";
import {
  BACKBEAT_AT,
  CFA_BARS,
  CFA_BPM,
  CFA_FIRST_IN,
  CFA_SECTIONS,
  CFT_CHANGES,
  cfaArrangement,
  cfaStart,
  GHOST_AT,
  ghostGroove,
} from "./wave6-fixtures.ts";

setDefaultTimeout(60_000);

const mod12 = (x: number): number => ((Math.round(x) % 12) + 12) % 12;
const inBar = (ev: HeadlessEvent[], track: string, bar: number) =>
  ev.filter((e) => e.track === track && Math.floor(e.onset + 1e-9) === bar && e.midi !== null);

describe("the CF-A single", () => {
  let ev: HeadlessEvent[] = [];
  test("evaluates clean: 56 bars, more than two minutes at 100 BPM, every section where CFA_SECTIONS puts it", async () => {
    const r = await evalHeadless(cfaArrangement(), CFA_BARS);
    expect(r.logs.filter((l) => /error|unknown|not found|\[(mini|tonal|eval)\]/i.test(l))).toEqual([]);
    ev = r.events;
    expect(CFA_BARS).toBe(56);
    expect((CFA_BARS * 240) / CFA_BPM).toBeGreaterThanOrEqual(120);
    expect(cfaStart("bridge")).toBe(36);
    expect(cfaStart("chorus2")).toBe(44);
    // Something sounds in every bar, and the bass and chords play through the whole song.
    for (let bar = 0; bar < CFA_BARS; bar++) {
      expect(ev.some((e) => Math.floor(e.onset + 1e-9) === bar)).toBe(true);
      for (const t of ["bass", "chords"])
        expect([t, bar, inBar(ev, t, bar).length > 0]).toEqual([t, bar, true]);
      expect(ev.some((e) => e.track === "kick" && Math.floor(e.onset + 1e-9) === bar)).toBe(true);
    }
    expect(CFA_SECTIONS.map(([n]) => n)).toContain("bridge");
  });

  test("the lift: from bar 45 every pitched track plays the chorus a whole step up", () => {
    const chorus = cfaStart("chorus");
    const lift = cfaStart("chorus2");
    for (const t of ["bass", "chords", "mel"])
      for (let k = 0; k < 8; k++) {
        const a = inBar(ev, t, chorus + k).map((e) => e.midi as number);
        const b = inBar(ev, t, lift + k).map((e) => e.midi as number);
        // The chorus's pushed chords reach back into the bar before: compare the notes that sound in the bar.
        expect([t, k, b.map((m) => m - 2).sort()]).toEqual([t, k, a.sort()]);
      }
    expect([...new Set(inBar(ev, "chords", lift - 1).map((e) => e.scale))]).toEqual(["C3 major"]);
    expect([...new Set(inBar(ev, "chords", lift + 1).map((e) => e.scale))]).toEqual(["D3 major"]);
  });

  test("the devices: a push, ghost notes, an applied dominant that resolves and a borrowed iv in the bridge", () => {
    // Pushed: the chorus's chords start an eighth before the bar.
    const chorus = cfaStart("chorus");
    const pushed = ev.filter((e) => e.track === "chords" && e.onset > chorus && e.onset < chorus + 8);
    expect(pushed.some((e) => Math.abs((e.onset % 1) - 7 / 8) < 1e-6)).toBe(true);
    // Ghosts: the verse snare has hits at .3.
    const verse = cfaStart("verse");
    const snare = ev.filter((e) => e.track === "snare" && e.onset >= verse && e.onset < verse + 1);
    expect(snare.filter((e) => e.value.velocity === 0.3).length).toBe(3);
    // The bridge's chords, bar by bar, read in C major.
    const key = { tonic: "C", mode: "major" } as const;
    const bridge = cfaStart("bridge");
    const chords = Array.from({ length: 8 }, (_, k) => {
      const notes = inBar(ev, "chords", bridge + k);
      const pcs = notes.map((e) => mod12(e.midi as number));
      const bass = inBar(ev, "bass", bridge + k)[0];
      return { pcs, bassPc: mod12(bass?.midi as number) };
    });
    const e7 = seventhFromPcs(chords[1]?.pcs ?? [], chords[1]?.bassPc ?? 0);
    expect(e7?.symbol).toBe("E7");
    const am = parseChordSymbol("Am");
    const applied = appliedReading(e7?.chord as never, key, am as never);
    expect(applied?.rn).toBe("V7/vi");
    expect(applied?.resolves).toBe(true);
    expect([...new Set(chords[2]?.pcs)].sort((a, b) => a - b)).toEqual([0, 4, 9]);
    expect([...new Set(chords[3]?.pcs)].sort((a, b) => a - b)).toEqual([0, 5, 9]);
    expect([...new Set(chords[4]?.pcs)].sort((a, b) => a - b)).toEqual([0, 5, 8]);
    expect(borrowedReading(parseChordSymbol("Fm") as never, key)).not.toBeNull();
  });

  test("the sounds the bridge and the last chorus bring play there first", () => {
    for (const [section, sounds] of Object.entries(CFA_FIRST_IN))
      for (const s of sounds) {
        const first = Math.min(...ev.filter((e) => e.s === s).map((e) => e.onset));
        expect([s, Math.floor(first + 1e-9)]).toEqual([s, cfaStart(section)]);
      }
  });

  test("starting from a bar plays the song from there, key plan included", async () => {
    const lift = cfaStart("chorus2");
    const r = await evalHeadless(cfaArrangement(CFA_BPM, lift), 2);
    const shifted = r.events.filter((e) => e.track === "mel" && e.midi !== null).map((e) => e.midi);
    const original = ev
      .filter((e) => e.track === "mel" && e.midi !== null && e.onset >= lift && e.onset < lift + 2)
      .map((e) => e.midi);
    expect(shifted).toEqual(original);
    expect(r.events.some((e) => e.s === "horns")).toBe(true);
  });
});

describe("U13.L02's ghost-note groove", () => {
  test("the ghosts are on the 'a' of 2, the 'e' of 3 and the 'a' of 4; the backbeats at full velocity", async () => {
    const r = await evalHeadless(ghostGroove("", 0.3), 1);
    const snare = r.events
      .filter((e) => e.s === "sd")
      .map((e) => ({ step: Math.round(e.onset * 16), v: e.value.velocity }));
    expect(snare.filter((x) => x.v === 0.3).map((x) => x.step)).toEqual([...GHOST_AT]);
    expect(snare.filter((x) => x.v === 1).map((x) => x.step)).toEqual([...BACKBEAT_AT]);
    const plain = await evalHeadless(ghostGroove("", 0), 1);
    expect(plain.events.filter((e) => e.s === "sd").map((e) => Math.round(e.onset * 16))).toEqual([
      ...BACKBEAT_AT,
    ]);
  });
});

describe("the CF-T standards' changes", () => {
  for (const [title, bars] of Object.entries(CFT_CHANGES))
    test(`${title}: 32 bars, every chord a symbol theory reads`, () => {
      expect(bars.length).toBe(32);
      for (const bar of bars)
        for (const symbol of typeof bar === "string" ? [bar] : bar)
          expect([symbol, parseChordSymbol(symbol) !== null]).toEqual([symbol, true]);
    });
});
