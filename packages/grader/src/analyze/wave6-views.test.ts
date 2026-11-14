// The Wave 6 views (docs/design/wave6.md §3.2) on real Strudel output. Facts checked by hand.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { strudel } from "./__support__/fixtures.ts";
import {
  chromaticHarmonyView,
  keyAtBarOf,
  keyPlanView,
  modeView,
  pushesOf,
  rhythmView,
  tupletsOf,
} from "./wave6-views.ts";

setDefaultTimeout(20_000);
const C = { tonic: "C", mode: "major" } as const;

describe("keyPlanView", () => {
  test("a patterned .scale() after arrange() gives the key bar by bar and the lift with its bar", async () => {
    const code = `setcpm(100/4)
const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")
const melChorus = n("<[7 6 4 2] [4 ~ 2 ~]>")
mel: arrange([4, melVerse], [4, melChorus], [4, melChorus]).scale("<C4:major!8 D4:major!4>").s("piano")`;
    const n = await strudel(code, 12);
    const v = keyPlanView(n, { meter: "4/4", code });
    expect(v.track).toBe("mel");
    expect(v.spans.map((s) => [s.fromBar, s.toBar, s.key.tonic, s.source])).toEqual([
      [1, 8, "C", "scale"],
      [9, 12, "D", "scale"],
    ]);
    expect(v.changes).toHaveLength(1);
    expect(v.changes[0]).toMatchObject({
      bar: 9,
      barsAfter: 4,
      distance: { semitones: 2, relation: "up-step" },
    });
    expect(keyAtBarOf(v, 8)?.tonic).toBe("C");
    expect(keyAtBarOf(v, 9)?.tonic).toBe("D");
    // The last chorus is the same degrees a whole step up: bar 5 starts on C5 (72), bar 9 on D5 (74).
    const first = (bar: number) => n.all.find((e) => e.onset[0] / e.onset[1] === bar)?.midi;
    expect([first(4), first(8)]).toEqual([72, 74]);
  });
  test("one key: one span, no change", async () => {
    const code = `mel: n("0 2 4 2").scale("G4:mixolydian").s("piano")`;
    const v = keyPlanView(await strudel(code, 4), { meter: "4/4", code });
    expect(v.spans).toHaveLength(1);
    expect(v.spans[0]?.key).toEqual({ tonic: "G", mode: "mixolydian" });
    expect(v.changes).toEqual([]);
  });
});

describe("chromaticHarmonyView", () => {
  test("sevenths from symbols, an applied dominant that resolves, borrowed chords", async () => {
    const code = `chords: chord("<C^7 A7 Dm7 D7 G7 Ab Bb C>").voicing()`;
    const v = chromaticHarmonyView(await strudel(code, 8), { meter: "4/4", key: C });
    expect(v.chords.map((c) => c.rn)).toEqual(["Imaj7", "V7/ii", "ii7", "V7/V", "V7", "bVI", "bVII", "I"]);
    expect(v.chords.map((c) => c.seventh)).toEqual(["maj7", "7", "m7", "7", "7", null, null, null]);
    expect(v.chords.map((c) => c.kind)).toEqual([
      "diatonic",
      "applied",
      "diatonic",
      "applied",
      "diatonic",
      "borrowed",
      "borrowed",
      "diatonic",
    ]);
    expect(v.chords[1]).toMatchObject({
      target: "ii",
      resolves: true,
      source: "symbol",
      symbol: "A7",
      bar: 2,
    });
    expect(v.chords[3]).toMatchObject({ target: "V", resolves: true, guide: { third: "F#", seventh: "C" } });
    expect([v.applied, v.appliedResolved, v.borrowed]).toEqual([2, 2, 2]);
    // Guide tones through Dm7 D7 G7: F F♯ F from the 3rd.
    // The line from the 3rd of Cmaj7 moves by the smallest step at each change: E C♯ C C B.
    expect(v.guideLines.fromThird.slice(0, 5).map((s) => s?.name)).toEqual(["E", "C#", "C", "C", "B"]);
    expect(v.guideLines.fromSeventh.slice(0, 5).map((s) => s?.name)).toEqual(["B", "C#", "C", "C", "B"]);
    // A default voicing() puts another chord tone lowest: reported as the inversion, never in the numeral.
    expect(v.chords.some((c) => c.inversion !== 0)).toBe(true);
  });
  test("an applied dominant that does not resolve says so", async () => {
    const code = `chords: chord("<C D7 F C>").voicing()`;
    const v = chromaticHarmonyView(await strudel(code, 4), { meter: "4/4", key: C });
    expect(v.chords[1]).toMatchObject({ rn: "V7/V", kind: "applied", resolves: false, next: "IV" });
    expect(v.appliedResolved).toBe(0);
  });
  test("a hand-voiced chord reads its seventh from the notes", async () => {
    const code = `chords: note("<[d3,f3,a3,c4] [g2,b2,d3,f3] [c3,e3,g3]>").s("piano")`;
    const v = chromaticHarmonyView(await strudel(code, 3), { meter: "4/4", key: C });
    expect(v.chords.map((c) => [c.rn, c.seventh, c.source])).toEqual([
      ["ii7", "m7", "notes"],
      ["V7", "7", "notes"],
      ["I", null, "notes"],
    ]);
  });
  test("numerals follow the key plan after a key change", async () => {
    const code = `const chVerse = n("<[0,2,4] [3,5,7] [4,6,8] [0,2,4]>")
chords: arrange([4, chVerse], [4, chVerse]).scale("<C3:major!4 D3:major!4>").s("piano")`;
    const v = chromaticHarmonyView(await strudel(code, 8), { meter: "4/4", code });
    expect(v.chords.map((c) => c.rn)).toEqual(["I", "IV", "V", "I", "I", "IV", "V", "I"]);
    expect(v.chords.map((c) => c.symbol)).toEqual(["C", "F", "G", "C", "D", "G", "A", "D"]);
    expect(v.chords[4]?.key.tonic).toBe("D");
  });
});

describe("modeView", () => {
  test("a Mixolydian vamp: the ♭7 on strong beats, the tonic chord in most bars", async () => {
    const code = `chords: chord("<G F C G>").voicing()
mel: n("<[6 4 2 4] [6 ~ 4 2] [0 2 4 2] [6 4 2 0]>").scale("G4:mixolydian").s("piano")`;
    const v = modeView(await strudel(code, 4), { meter: "4/4", bars: 4 });
    expect(v.stated).toEqual({ tonic: "G", mode: "mixolydian" });
    expect(v.fits).toEqual(["mixolydian"]);
    // Three F5s of the melody on beat 1 and the two Fs of the F chord: the rule counts every pitched learner note.
    expect(v.characteristic).toMatchObject({ degree: "b7", name: "F", count: 5, strong: 5 });
    expect(v.outside).toEqual([]);
    expect(v.tonicChordShare).toBe(0.5);
  });
  test("a leading tone in a Mixolydian piece is named as outside the mode", async () => {
    const n = await strudel(`mel: note("g4 b4 d5 f#5 g5 f5 d5 b4").s("piano")`, 1);
    const v = modeView(n, { meter: "4/4", key: { tonic: "G", mode: "mixolydian" } });
    expect(v.outside).toHaveLength(1);
    expect(v.characteristic?.count).toBe(1);
    expect(v.fits).toEqual([]);
  });
  test("a Dorian line: ♮6 is the colour", async () => {
    const n = await strudel(`mel: n("0 2 4 5 4 2 5 0").scale("D4:dorian").s("piano")`, 1);
    const v = modeView(n, { meter: "4/4" });
    expect(v.characteristic).toMatchObject({ degree: "6", name: "B", count: 2 });
    expect(v.fits).toEqual(["dorian"]);
  });
});

describe("rhythmView", () => {
  test("pushes: .early(1/8) arrives an eighth before the beat and holds through it", async () => {
    const n = await strudel(`mel: note("c4 e4 g4 e4").early(1/8).s("piano")`, 2);
    const mel = n.byTrack.mel ?? [];
    const p = pushesOf(mel, "4/4");
    expect(p.length).toBeGreaterThanOrEqual(7);
    expect(p.every((x) => x.by === 8)).toBe(true);
    expect(p.some((x) => x.acrossBar)).toBe(true);
    // A straight quarter-note line has none.
    expect(
      pushesOf((await strudel(`mel: note("c4 e4 g4 e4").s("piano")`, 1)).byTrack.mel ?? [], "4/4"),
    ).toEqual([]);
    // A sixteenth push (`.early(1/16)`), and a note that stops before the beat is no push.
    const s16 = await strudel(`mel: note("c4 ~ e4 ~").early(1/16).s("piano")`, 2);
    expect(pushesOf(s16.byTrack.mel ?? [], "4/4").map((x) => x.by)).toEqual([16, 16, 16, 16]);
    const short = await strudel(`mel: note("c4 e4 g4 e4").early(1/8).clip(0.25).s("piano")`, 2);
    expect(pushesOf(short.byTrack.mel ?? [], "4/4")).toEqual([]);
  });
  test("ghost notes by velocity, on the sixteenth off-beats", async () => {
    const n = await strudel(`drums: s("sd*16").velocity("[1 .3 .3 .3]*4")`, 1);
    const v = rhythmView(n, { meter: "4/4" });
    expect(v.tracks[0]?.ghosts).toHaveLength(12);
    expect(v.tracks[0]?.ghostsOffbeat).toHaveLength(8);
  });
  test("ties and dotted values as the staff writes them", async () => {
    // Dotted quarter + eighth, then a note tied over the bar line.
    const n = await strudel(`mel: note("<[c4@3 d4 e4@4] [e4@4 g4@4]>").s("piano")`, 2);
    const v = rhythmView(n, { meter: "4/4", bars: 2 });
    expect(v.tracks[0]?.written.dotted).toBe(1);
    expect(v.tracks[0]?.written.exact).toBe(true);
    // The same line without the tie: nothing is tied, nothing dotted.
    const plain = await strudel(`mel: note("<[c4 d4 e4@2] [~@2 g4 a4]>").s("piano")`, 2);
    expect(rhythmView(plain, { meter: "4/4", bars: 2 }).tracks[0]?.written).toEqual({
      ties: 0,
      tiesAcrossBar: 0,
      dotted: 0,
      exact: true,
    });
    // A whole-bar pattern slowed to two bars holds its last note over the bar line: one tie across it.
    const tied = await strudel(`mel: note("c4 d4 e4 g4@3 a4 c5").slow(2).s("piano")`, 2);
    const w = rhythmView(tied, { meter: "4/4", bars: 2 }).tracks[0]?.written;
    expect([w?.tiesAcrossBar, w?.exact]).toEqual([1, true]);
    // A pushed line is syncopated.
    const pushed = await strudel(`mel: note("c4 e4 g4 e4").early(1/8).s("piano")`, 2);
    expect(rhythmView(pushed, { meter: "4/4", bars: 2 }).tracks[0]?.syncopation.count).toBeGreaterThan(0);
  });
  test("compound meter: the dotted-quarter beat, a ternary feel, no tuplets", async () => {
    const n = await strudel(`setcpm(60/2)\nmel: note("c4 d4 e4 f4 g4 a4").s("piano")`, 1);
    const v = rhythmView(n, { meter: "6/8" });
    expect([v.compound, v.tempoUnit, v.beats, v.bpm]).toEqual([true, "dottedQuarter", 2, 60]);
    expect(v.tracks[0]?.feel).toBe("ternary");
    expect(v.tracks[0]?.tuplets).toEqual([]);
    expect(v.tracks[0]?.written.exact).toBe(true);
  });
  test("triplets and other tuplets in a simple meter", async () => {
    const n = await strudel(`mel: note("[c4 d4 e4] g4 [a4 g4 e4 d4 c4] c4").s("piano")`, 1);
    expect(tupletsOf(n.byTrack.mel ?? [], "4/4")).toEqual([
      { bar: 1, beat: 1, division: 3, span: 1 },
      { bar: 1, beat: 3, division: 5, span: 1 },
    ]);
    const q = await strudel(`mel: note("[c4 d4 e4]@2 g4 c4").s("piano")`, 1);
    expect(tupletsOf(q.byTrack.mel ?? [], "4/4")).toEqual([{ bar: 1, beat: 1, division: 3, span: 2 }]);
    const ply = await strudel(`mel: note("c4 e4 g4 e4").ply(3).s("piano")`, 1);
    expect(tupletsOf(ply.byTrack.mel ?? [], "4/4").map((t) => t.division)).toEqual([3, 3, 3, 3]);
    const straight = await strudel(`mel: note("c4 [d4 e4] [f4 g4 a4 b4] c5").s("piano")`, 1);
    expect(tupletsOf(straight.byTrack.mel ?? [], "4/4")).toEqual([]);
    expect(rhythmView(n, { meter: "4/4" }).tracks[0]?.feel).toBe("mixed");
  });
});
