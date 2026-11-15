// Every generated gym item is played headless and checked against its own answer: a chart's chords sound with
// their colours (the ♭9, the 13, the 6/9 are in the notes), the bass plays each bar's root, and each rhythm task's
// answer is what the named part plays (the clave read back by `claveOf`, the bell by `euclidIdentity`, the feel by
// the grid's own reading).
import { describe, expect, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { chordPcs, claveOf, euclidIdentity, parseChordWithBass } from "@oak/theory";
import { feelOfOnsets } from "./grid.ts";
import { JAZZ_FORMS, type JazzForm, RHYTHM_ITEMS, type RhythmItem } from "./gym-after-core.ts";
import { gymItemOf, itemCps, jazzChart, jazzItem, jazzTonics, rhythmItem } from "./gym-items.ts";
import { REF_PREFIX } from "./stimulus-code.ts";

describe("jazz items: the chart is what sounds", () => {
  for (const form of Object.keys(JAZZ_FORMS) as JazzForm[])
    for (const tonic of jazzTonics(form).slice(0, 3))
      test(`${form} in ${tonic}`, async () => {
        const item = jazzItem(form, tonic);
        expect(item.bars).toBe(JAZZ_FORMS[form].bars);
        const r = await evalHeadless(item.stimulus.code, item.bars);
        expect(r.logs.filter((l) => l.includes("unknown"))).toEqual([]);
        for (let bar = 0; bar < item.bars; bar++) {
          const symbols = item.chart[bar] as string[];
          symbols.forEach((sym, k) => {
            const chord = parseChordWithBass(sym);
            if (!chord) throw new Error(sym);
            // The comping hit of this chord: beat 2 (first chord) or beat 4 (second, or the bar's only chord).
            const at = bar + (symbols.length === 2 ? (k === 0 ? 0.25 : 0.75) : 0.25);
            const notes = r.events.filter(
              (e) => e.track === `${REF_PREFIX}chords` && Math.abs(e.onset - at) < 1e-9,
            );
            const pcs = new Set(notes.map((e) => (((e.midi as number) % 12) + 12) % 12));
            // Every note of the voicing belongs to the chord, and the colour it is named for sounds.
            const want = new Set(chordPcs(chord));
            for (const pc of pcs) expect(want.has(pc)).toBe(true);
            expect(pcs.size).toBeGreaterThanOrEqual(3);
            const ext: Record<string, number> = { "7b9": 1, "13": 9, "69": 2, "7alt": 1, m6: 9 };
            const colour = ext[chord.quality];
            if (colour !== undefined) expect(pcs.has((chord.rootPc + colour) % 12)).toBe(true);
            // The bass plays the chord's root where the chord starts.
            const bassAt = bar + (symbols.length === 2 ? k * 0.5 : 0);
            const bass = r.events.find(
              (e) => e.track === `${REF_PREFIX}bass` && Math.abs(e.onset - bassAt) < 1e-9,
            );
            expect((((bass?.midi as number) % 12) + 12) % 12).toBe(chord.bassPc);
          });
        }
      });

  test("the colours move round the keys: a 13, a ♭9 and a 6/9 appear among the ii–V–Is", () => {
    const all = jazzTonics("ii-V-I").flatMap((t) => jazzChart("ii-V-I", t).flat());
    expect(all.some((s) => s.endsWith("13"))).toBe(true);
    expect(all.some((s) => s.endsWith("7b9"))).toBe(true);
    expect(all.some((s) => s.endsWith("69"))).toBe(true);
    expect(jazzChart("blues", "F")).toEqual([
      ["F7"],
      ["Bb7"],
      ["F7"],
      ["Cm7", "F7"],
      ["Bb7"],
      ["Bo7"],
      ["F7"],
      ["D7"],
      ["Gm7"],
      ["C7"],
      ["F7", "D7"],
      ["Gm7", "C7"],
    ]);
  });
});

describe("rhythm items: each task's answer is what plays", () => {
  for (const id of Object.keys(RHYTHM_ITEMS) as RhythmItem[])
    test(id, async () => {
      const item = rhythmItem(id);
      const r = await evalHeadless(item.stimulus.code, item.bars);
      expect(r.events.length).toBeGreaterThan(0);
      for (const t of item.tasks) {
        if (t.kind === "identify") {
          expect(t.options.map((o) => o.id)).toContain(t.answer);
          continue;
        }
        // The dictated part: the item's first labelled line after the identify prompt's subject.
        const track = `${REF_PREFIX}${{ kick: "kick", high: "high", bass: "bass", "clave-grid": "clave", bell: "bell" }[t.id]}`;
        const onsets = r.events
          .filter((e) => e.track === track && e.onset < t.bars)
          .map((e) => Math.round(e.onset * t.steps));
        const written = [...new Set(onsets)].sort((a, b) => a - b);
        const want = [...t.answer].sort((a, b) => a - b);
        expect(written.filter((s) => s < t.steps * t.bars)).toEqual(want);
      }
    });

  test("the identify answers agree with theory's readings of what plays", async () => {
    const son = rhythmItem("clave-son");
    const r = await evalHeadless(son.stimulus.code, 2);
    const steps = r.events
      .filter((e) => e.track === `${REF_PREFIX}clave`)
      .map((e) => Math.round(e.onset * 8));
    expect(claveOf(steps)).toEqual({ type: "son", direction: "2-3" });
    expect(son.tasks[0]?.kind === "identify" && son.tasks[0].answer).toBe("son 2-3");
    const rumba = rhythmItem("clave-rumba");
    const r2 = await evalHeadless(rumba.stimulus.code, 2);
    expect(
      claveOf(r2.events.filter((e) => e.track === `${REF_PREFIX}clave`).map((e) => Math.round(e.onset * 8))),
    ).toEqual({
      type: "rumba",
      direction: "3-2",
    });
    const bell = rhythmItem("bell-5-8");
    const r3 = await evalHeadless(bell.stimulus.code, 1);
    expect(
      euclidIdentity(
        r3.events.filter((e) => e.track === `${REF_PREFIX}bell`).map((e) => Math.round(e.onset * 8)),
        8,
      ),
    ).toEqual({
      pulses: 5,
      steps: 8,
      rotation: 1,
    });
    const swing = rhythmItem("swing-16");
    const r4 = await evalHeadless(swing.stimulus.code, 2);
    expect(
      feelOfOnsets(
        r4.events.filter((e) => e.track === `${REF_PREFIX}hats`).map((e) => e.onset),
        "4/4",
      ),
    ).toBe("swing16");
  });

  test("items are found by id; an unknown id is null; the tempo is one bar a cycle", () => {
    expect(gymItemOf("jazz:blues:F")?.kind).toBe("jazz");
    expect(gymItemOf("jazz:blues:H")).toBeNull();
    expect(gymItemOf("rhythm:odd-7")?.meter).toBe("7/8");
    expect(gymItemOf("rhythm:nope")).toBeNull();
    expect(itemCps(rhythmItem("odd-7"))).toBeCloseTo(168 / 7 / 60, 9);
    expect(itemCps(jazzItem("blues", "F"))).toBeCloseTo(120 / 4 / 60, 9);
  });
});
