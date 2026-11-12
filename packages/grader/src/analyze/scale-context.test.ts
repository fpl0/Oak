// The per-track key context views label degrees with (docs/design/wave3.md §3.3), on real Strudel output.
import { describe, expect, test } from "bun:test";
import { analyzePiece, eventLabels, keyAt, trackKeyContexts, transposeAfterScaleTracks } from "../index.ts";
import { ev, norm, strudel } from "./__support__/fixtures.ts";

const CODE = `setcpm(90/4)
mel: n("0 2 4 7").scale("<C4:major D4:major>").s("piano")
bass: n("0 4").scale("A2:minor").s("piano")
keys: note("c4 e4 g4 c5").s("piano")
drums: s("bd sd")`;

describe("trackKeyContexts", () => {
  test("a patterned .scale() gives one span per key; note() tracks are estimated; drums have none", async () => {
    const n = await strudel(CODE, 2);
    const ctx = trackKeyContexts(n, { prefer: "code" });
    const mel = ctx.find((c) => c.track === "mel");
    expect(mel?.spans.map((s) => [s.from, s.to, s.key.tonic, s.source, s.scaleCtx])).toEqual([
      [[0, 1], [1, 1], "C", "scale", "C4 major"],
      [[1, 1], [2, 1], "D", "scale", "D4 major"],
    ]);
    expect(ctx.find((c) => c.track === "bass")?.spans[0]?.key).toEqual({ tonic: "A", mode: "minor" });
    expect(ctx.find((c) => c.track === "keys")?.spans[0]?.source).toBe("estimate");
    expect(ctx.find((c) => c.track === "drums")?.spans).toEqual([]);
    expect(keyAt(ctx, "mel", [3, 2])).toEqual({ tonic: "D", mode: "major" });
    expect(keyAt(ctx, "mel", [1, 4])).toEqual({ tonic: "C", mode: "major" });
    expect(keyAt(ctx, "drums", [0, 1])).toBeNull();
  });
  test("grading order (contracts §6.8): the declared key wins unless the view prefers the code", async () => {
    const n = await strudel(CODE, 2);
    const G = { tonic: "G", mode: "major" } as const;
    const graded = trackKeyContexts(n, { declared: G });
    expect(graded.find((c) => c.track === "mel")?.spans).toEqual([
      { from: [0, 1], to: [2, 1], key: G, scaleCtx: null, source: "declared" },
    ]);
    const view = trackKeyContexts(n, { declared: G, prefer: "code" });
    expect(view.find((c) => c.track === "keys")?.spans[0]?.source).toBe("declared");
    expect(view.find((c) => c.track === "mel")?.spans[1]?.key.tonic).toBe("D");
  });
  test("a track whose scaleCtx is distrusted (transpose after scale) falls back", () => {
    const n = norm([
      ev({ track: "mel", onset: [0, 1], midi: 62, scaleCtx: "C4 major" }),
      ev({ track: "mel", onset: [1, 4], midi: 66, scaleCtx: "C4 major" }),
    ]);
    const ctx = trackKeyContexts(n, {
      prefer: "code",
      ignoreScaleCtx: ["mel"],
      declared: { tonic: "D", mode: "major" },
    });
    expect(ctx[0]?.spans[0]).toMatchObject({ key: { tonic: "D" }, source: "declared" });
  });
});

describe("degree labels in every bar (eventLabels, analyzePiece.keyContexts)", () => {
  test('a patterned .scale("<C4:major G4:major>") labels bar 2 in G: G4 is 1 there, not 5', async () => {
    const code = 'setcpm(90/4)\nmel: n("0 2 4 7").scale("<C4:major G4:major>").s("piano")';
    const n = await strudel(code, 2);
    const labels = eventLabels(n, { code });
    expect(labels.map((l) => [l.bar, l.label.name, l.label.degree, l.label.syllable])).toEqual([
      [1, "C4", "1", "do"],
      [1, "E4", "3", "mi"],
      [1, "G4", "5", "sol"],
      [1, "C5", "1", "do"],
      [2, "G4", "1", "do"],
      [2, "B4", "3", "mi"],
      [2, "D5", "5", "sol"],
      [2, "G5", "1", "do"],
    ]);
    // Grading reads the declared key first (contracts §6.8): the same notes in C.
    const graded = eventLabels(n, { code, declared: { tonic: "C", mode: "major" }, prefer: "declared" });
    expect(graded[4]?.label.degree).toBe("5");
  });
  test("a key plan of four keys, one per bar, F# major included", async () => {
    const code = 'mel: n("0 4").scale("<C4:major F4:major F#4:major Eb4:major>").s("piano")';
    const n = await strudel(code, 4);
    const labels = eventLabels(n, { code });
    expect(labels.map((l) => `${l.bar}:${l.label.name}=${l.label.degree}`)).toEqual([
      "1:C4=1",
      "1:G4=5",
      "2:F4=1",
      "2:C5=5",
      "3:F#4=1",
      "3:C#5=5",
      "4:Eb4=1",
      "4:Bb4=5",
    ]);
  });
  test("a .transpose() after .scale() is not trusted (contracts §6.8 item 3); by octaves it is", async () => {
    expect(
      transposeAfterScaleTracks(
        'mel: n("0 2").scale("C4:major").transpose(2)\nbass: n("0").scale("C2:major")',
      ),
    ).toEqual(["mel"]);
    expect(transposeAfterScaleTracks('mel: n("0 2").scale("C4:major").transpose(12)')).toEqual([]);
    expect(transposeAfterScaleTracks('mel: n("0 2").scale("C4:major").transpose("8P")')).toEqual([]);
    expect(transposeAfterScaleTracks('mel: n("0 2").scale("C4:major").transpose("3M")')).toEqual(["mel"]);
    expect(transposeAfterScaleTracks('const a = n("0 2").scale("C4:major")\nmel: a.transpose(2)')).toEqual([
      "mel",
    ]);
    expect(transposeAfterScaleTracks('mel: n("0 2").transpose(2).scale("C4:major")')).toEqual([]);
    expect(transposeAfterScaleTracks("mel: n(")).toEqual([]);
    const code = 'mel: n("0 2").scale("C4:major").transpose(2)';
    const n = await strudel(code, 1);
    // The scale context still says C, but the notes are in D: the view falls back to the estimate.
    const labels = eventLabels(n, { code });
    expect(labels[0]?.key.tonic).not.toBe("C");
  });
  test("analyzePiece reports each track's keys bar by bar", async () => {
    const code =
      'setcpm(90/4)\nmel: n("0 2 4 7").scale("<C4:major!2 D4:major!2>").s("piano")\ndrums: s("bd sd")';
    const n = await strudel(code, 4);
    const a = analyzePiece(n, { meter: "4/4", code });
    expect(a.keyContexts).toEqual([
      {
        track: "mel",
        band: false,
        spans: [
          { fromBar: 1, toBar: 2, key: { tonic: "C", mode: "major" }, source: "scale" },
          { fromBar: 3, toBar: 4, key: { tonic: "D", mode: "major" }, source: "scale" },
        ],
      },
    ]);
  });
});
