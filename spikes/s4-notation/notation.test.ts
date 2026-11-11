import { describe, expect, test } from "bun:test";
import { describeScore, toAbc } from "./abc.ts";
import { EXTRA, REQUIRED } from "./corpus.ts";
import { activeEventIds, buildScore } from "./quantize.ts";
import { evalToEvents } from "./strudel-eval.ts";

// biome-ignore lint/suspicious/noExplicitAny: abcjs is CJS; under Bun the namespace has named keys AND default
const abcjsMod: any = await import("abcjs");
const abcjs = abcjsMod.default ?? abcjsMod;

/** Parse with abcjs (headless) and return warnings, per-bar sounding totals and the classes abcjs kept. */
function abcjsCheck(abc: string) {
  const tune = abcjs.parseOnly(abc)[0];
  const barTotals: number[] = [];
  const classes: string[] = [];
  let total = 0;
  let mult = 1;
  let left = 0;
  for (const line of tune.lines) {
    for (const el of line.staff?.[0]?.voices?.[0] ?? []) {
      if (el.el_type === "bar") {
        barTotals.push(Math.round(total * 1e9) / 1e9);
        total = 0;
      } else if (el.el_type === "note") {
        if (el.startTriplet) {
          mult = el.tripletMultiplier;
          left = el.tripletR;
        }
        total += el.duration * (left > 0 ? mult : 1);
        if (left > 0) left--;
        if (el.extraClass) classes.push(el.extraClass);
      }
    }
  }
  return { warnings: tune.warnings ?? [], barTotals, classes };
}

async function run(code: string, bars: number) {
  const { events, skipped } = await evalToEvents(code, bars);
  const score = buildScore({ events, bars });
  const { abc, notes, idMap } = toAbc(score);
  const check = abcjsCheck(abc);
  return { events, skipped, score, abc, notes, idMap, check };
}

function snapshotOf(code: string, r: Awaited<ReturnType<typeof run>>) {
  return {
    code,
    abc: r.abc.trimEnd().split("\n"),
    model: describeScore(r.score),
    spelled: r.score.slots.map((s) => s.pitches.map((p) => p.name).join("+")),
    key: r.score.key,
    approximate: r.score.approximate,
    warnings: r.score.warnings,
  };
}

for (const [group, corpus] of [
  ["required", REQUIRED],
  ["extra", EXTRA],
] as const) {
  describe(`haps -> NotationModel -> ABC (${group})`, () => {
    for (const [name, code, bars] of corpus) {
      test(name, async () => {
        const r = await run(code, bars);
        expect(snapshotOf(code, r)).toMatchSnapshot();
        // abcjs accepts the ABC with zero warnings ...
        expect(r.check.warnings).toEqual([]);
        // ... every bar adds up to exactly one 4/4 bar as abcjs understands the durations and tuplets ...
        expect(r.check.barTotals).toEqual(Array(bars).fill(1));
        // ... and every note/chord carries its event classes.
        expect(r.check.classes).toEqual(r.notes.map((n) => n.eventIds.map((id) => `oak-e${id}`).join(" ")));
        // startChar/endChar point at the pitch token.
        for (const n of r.notes) expect(r.abc.slice(n.startChar, n.endChar)).toMatch(/^(\[[=^_A-Ga-g,']+\]|[=^_]*[A-Ga-g][,']*)[\d/]*-?$/);
        expect(r.skipped).toBe(0);
      });
    }
  });
}

describe("exact expectations for the 10 required patterns", () => {
  const body = async (code: string, bars: number) => (await run(code, bars)).abc.trimEnd().split("\n");
  test("header, bar splitting, ties, rests, beams, tuplets, key spelling", async () => {
    expect(await body('note("c4 d4 e4 f4")', 1)).toEqual([
      "X:1", "M:4/4", "L:1/16", "K:C",
      "!class=oak-e0!C4 !class=oak-e1!D4 !class=oak-e2!E4 !class=oak-e3!F4 |]",
    ]);
    // beamed eighth pair: no space between D2 and E2
    expect((await body('note("c4 [d4 e4] f4 g4")', 1))[4]).toBe(
      "!class=oak-e0!C4 !class=oak-e1!D2!class=oak-e2!E2 !class=oak-e3!F4 !class=oak-e4!G4 |]",
    );
    expect((await body('note("c4@3 d4")', 1))[4]).toBe("!class=oak-e0!C12 !class=oak-e1!D4 |]");
    expect((await body('note("<c4 e4> g4")', 2))[4]).toBe(
      "!class=oak-e0!C8 !class=oak-e1!G8 | !class=oak-e2!E8 !class=oak-e3!G8 |]",
    );
    expect((await body('note("c4 ~ d4 ~")', 1))[4]).toBe("!class=oak-e0!C4 z4 !class=oak-e1!D4 z4 |]");
    expect((await body('note("c4*3 e4")', 1))[4]).toBe(
      "(3:2:3!class=oak-e0!C4 !class=oak-e1!C4 !class=oak-e2!C4 !class=oak-e3!E8 |]",
    );
    // D major: F# and C# come from the key signature, so no accidentals are written
    expect((await body('n("0 2 4 6").scale("D4:major")', 1)).slice(3)).toEqual([
      "K:D",
      "!class=oak-e0!D4 !class=oak-e1!F4 !class=oak-e2!A4 !class=oak-e3!c4 |]",
    ]);
    expect((await body('note("[c4,e4,g4] [f4,a4,c5]")', 1))[4]).toBe(
      "!class=oak-e0 oak-e1 oak-e2![CEG]8 !class=oak-e3 oak-e4 oak-e5![FAc]8 |]",
    );
    // syncopation: both notes are split at the beat/half-bar and tied
    expect((await body('note("~ c4@1.5 d4@1.5")', 1))[4]).toBe(
      "z4 !class=oak-e0!C4- !class=oak-e0!C2!class=oak-e1!D2- !class=oak-e1!D4 |]",
    );
    expect((await body('n("0 1 2 3 4 5 6 7").scale("F#4:major")', 1)).slice(3)).toEqual([
      "K:F#",
      "!class=oak-e0!F2!class=oak-e1!G2 !class=oak-e2!A2!class=oak-e3!B2 !class=oak-e4!c2!class=oak-e5!d2 !class=oak-e6!e2!class=oak-e7!f2 |]",
    ]);
  });

  test("spelled pitches come from the key (E#5, not F5)", async () => {
    const r = await run('n("0 1 2 3 4 5 6 7").scale("F#4:major")', 1);
    expect(r.score.slots.map((s) => s.pitches[0]?.name)).toEqual(["F#4", "G#4", "A#4", "B4", "C#5", "D#5", "E#5", "F#5"]);
    expect(r.score.key).toEqual({ tonic: "F#", mode: "major" });
    const d = await run('n("0 2 4 6").scale("D4:major")', 1);
    expect(d.score.slots.map((s) => s.pitches[0]?.name)).toEqual(["D4", "F#4", "A4", "C#5"]);
  });

  test("a lesson-declared key overrides: same MIDI, C major signature -> explicit accidentals, bar-scoped", async () => {
    const { events } = await evalToEvents('n("0 2 4 6 2 2").scale("D4:major")', 1);
    const abc = toAbc(buildScore({ events, bars: 1, key: { tonic: "C", mode: "major" } })).abc.trimEnd().split("\n");
    // F# is written once (^F), the later F#s in the same bar are not restated
    expect(abc.slice(3)).toEqual([
      "K:C",
      "(3:2:3!class=oak-e0!D4 !class=oak-e1!^F4 !class=oak-e2!A4 (3:2:3!class=oak-e3!^c4 !class=oak-e4!F4 !class=oak-e5!F4 |]",
    ]);
  });

  test("idMap links event ids back to code locations; clock lookup returns sounding ids", async () => {
    const r = await run('note("<c4 e4> g4")', 2);
    expect(r.idMap.get(2)).toEqual({ slotId: 2, locations: [{ start: 10, end: 12 }], pitch: "E4" });
    expect(activeEventIds(r.score, 0.1)).toEqual([0]);
    expect(activeEventIds(r.score, 0.75)).toEqual([1]);
    expect(activeEventIds(r.score, 1.25)).toEqual([2]);
    expect(activeEventIds(r.score, 2.1)).toEqual([0]); // wraps to the loop
    const ch = await run('note("[c4,e4,g4] [f4,a4,c5]")', 1);
    expect(activeEventIds(ch.score, 0.6)).toEqual([3, 4, 5]);
  });
});
