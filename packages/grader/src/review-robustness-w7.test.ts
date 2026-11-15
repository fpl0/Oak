// Wave 7 review (robustness: grading): the wrong answers that used the right function and still passed, and the
// right answers that were refused, each pinned with the reference, other right answers and the message the learner
// reads (it names the fault, never the answer). Music checked by running it (headless Strudel through `strudel()`).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, RubricRule } from "@oak/content-kit";
import { voicingShapeOf } from "@oak/content-kit";
import { strudel } from "./analyze/__support__/fixtures.ts";
import { onTripletGrid, swingRatio } from "./analyze/swing.ts";
import { normalizedFromEvents } from "./analyze/tracks.ts";
import type { RubricContext } from "./rubric/context.ts";
import { evaluateRubric } from "./rubric/index.ts";

setDefaultTimeout(30_000);
const C: KeySpec = { tonic: "C", mode: "major" };
const F: KeySpec = { tonic: "F", mode: "major" };

const rule = (body: Record<string, unknown>): RubricRule =>
  ({ id: "r", label: "rule", required: true, skills: [], ...body }) as unknown as RubricRule;
/** One rule on real Strudel output, heard as `normalize` hears it (parts 24 dB under the loudest left out). */
async function check(
  r: RubricRule,
  code: string,
  bars: number,
  key: KeySpec | null = C,
  o: Partial<RubricContext> = {},
) {
  const raw = await strudel(code, bars);
  const peak = raw.all.reduce((m, e) => Math.max(m, e.gain), 0);
  const n = normalizedFromEvents(
    raw.all.filter((e) => e.gain > 0.01 && e.gain >= peak / 16),
    { cps: raw.cps },
  );
  for (const t of Object.keys(raw.byTrack)) n.byTrack[t] ??= [];
  const ctx: RubricContext = {
    meter: "4/4",
    code,
    params: {},
    bars,
    totalBars: bars,
    ...(key ? { key } : {}),
    ...o,
  };
  const row = evaluateRubric([r], n, ctx).rows[0];
  return { ok: row?.ok ?? false, detail: String(row?.diag?.params.detail ?? "") };
}

describe("walking-bass: a walk moves (JC2, J3.L04)", () => {
  const WALK = rule({
    rule: "custom",
    fn: "walking-bass",
    params: {
      bass: "@bass",
      harmony: "@chords",
      rootOnOne: 0.75,
      chordToneOnThree: 0.5,
      approachOnFour: 0.5,
      maxSemis: 2,
    },
  });
  const piece = (bass: string) =>
    `setcpm(132/4)\nconst changes = "<F7 Bb7 F7 C7>"\nchords: chord(changes).dict("guidetones").voicing().struct("~ x ~ x").s("rhodes")\nbass: note("${bass}").s("upright")`;
  test("the reference walk and three other walks pass", async () => {
    for (const walk of [
      "<[f2 a2 c3 b2] [bb2 d3 f2 gb2] [f2 a2 c3 db3] [c3 e3 g2 e2]>", // chord tones and chromatic approaches
      "<[f2 g2 a2 a2] [bb2 c3 d3 e2] [f2 g2 a2 b2] [c3 bb2 a2 e2]>", // scale steps, one repeat
      "<[f2 c3 a2 a2] [bb2 f2 d3 e2] [f2 eb2 c2 b1] [c2 e2 g2 e2]>", // arpeggio walk, a lower register
      "<[f1 a1 c2 b1] [bb1 d2 f1 gb1] [f1 a1 c2 db2] [c2 e2 g1 e1]>", // the reference an octave down
    ])
      expect((await check(WALK, piece(walk), 4, F)).ok).toBe(true);
  });
  test("the right function, the wrong result: roots repeated with an approach tacked on fail, naming the fault", async () => {
    const r = await check(WALK, piece("<[f2 f2 f2 a2] [bb2 bb2 bb2 e2] [f2 f2 f2 b1] [c2 c2 c2 e2]>"), 4, F);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("a walk keeps moving");
    // Names the fault, not the notes to play.
    expect(r.detail).not.toMatch(/[A-G][♭♯]?\d/);
  });
});

describe("control-set: a filter envelope needs a filter (AC1, A1)", () => {
  const SOUND = rule({
    rule: "custom",
    fn: "control-set",
    params: {
      anyOf: [
        { control: "lpenv", above: 0 },
        { control: "distort", above: 0.5 },
      ],
    },
  });
  const line = (tail: string) => `setcpm(104/4)\nbass: note("<c2 eb2 f2 g2>*2").s("sawtooth")${tail}`;
  test("lpenv with a cutoff passes, and so does distortion", async () => {
    expect((await check(SOUND, line(".lpf(300).lpenv(4)"), 4)).ok).toBe(true);
    expect((await check(SOUND, line(".cutoff(500).lpenv(2).lpd(.2)"), 4)).ok).toBe(true);
    expect((await check(SOUND, line(".distort(2)"), 4)).ok).toBe(true);
  });
  test("lpenv on an unfiltered sound changes nothing: it fails and says why", async () => {
    const r = await check(SOUND, line(".lpenv(4).lpd(.15)"), 4);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("there is no filter for the envelope to open");
  });
});

describe("swing is long–short pairs, never triplets (AC2, JC2)", () => {
  const SW16 = rule({ rule: "swing", track: ["hats", "@drums"], subdivision: 16, ratio: [1.2, 2.4] });
  const SW8 = rule({ rule: "swing", track: ["hats", "@drums"], subdivision: 8, ratio: [1.6, 2.4] });
  const kit = (hats: string) =>
    `setcpm(76/4)\nkick: s("bd ~ ~ [~ bd] ~ ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("${hats}").gain(.4)`;
  test("swung 16ths pass, written with swingBy or as long–short pairs", async () => {
    expect((await check(SW16, `${kit("hh*16")}.swingBy(.2, 8)`, 4)).ok).toBe(true);
    expect((await check(SW16, kit("[hh@2 hh]*8"), 4)).ok).toBe(true);
    expect((await check(SW16, `${kit("hh*16")}.swingBy(1/3, 8)`, 4)).ok).toBe(true);
  });
  test("hats in triplets fail on 16ths and on 8ths, saying they are triplets", async () => {
    const r = await check(SW16, kit("hh*12"), 4);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("`hats` plays triplets");
    const r8 = await check(SW8, kit("[hh hh hh]*4"), 4);
    expect(r8.ok).toBe(false);
    expect(r8.detail).toContain("plays triplets");
  });
  test("hats swung in 8ths where 16ths are asked are named as such, not as the kit's straight 16ths", async () => {
    const r = await check(SW16, `${kit("hh*8")}.swingBy(1/3, 4)`, 4);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("`hats` swings 8ths");
  });
  test("a jazz ride with a triplet fill now and then is still swing", async () => {
    const ride =
      'setcpm(132/4)\ndrums: s("<[rd [rd rd] rd [rd rd]]!3 [rd [rd rd] rd [rd rd rd]]>").swingBy(1/3, 4)';
    expect((await check(SW8, ride.replace("drums:", "hats:"), 8)).ok).toBe(true);
  });
  test("the triplet grid reading itself", async () => {
    const trip = await strudel('hats: s("hh*12")', 2);
    expect(onTripletGrid(trip.all, "4/4")).toBe(true);
    expect(swingRatio(trip.all, "4/4", 16).n).toBe(0);
    const swung = await strudel('hats: s("[hh@2 hh]*4")', 2);
    expect(onTripletGrid(swung.all, "4/4")).toBe(false);
    expect(swingRatio(swung.all, "4/4", 8).ratio).toBeCloseTo(2, 5);
  });
});

describe("euclid: the message counts every hit heard (RC2, R3.L03)", () => {
  const BELL = rule({ rule: "euclid", track: "perc3", k: 5, n: 16, rotationFree: true });
  test("five hits in quintuplets: five hits, four of them off the sixteen steps", async () => {
    const r = await check(BELL, 'setcpm(110/4)\nperc3: s("cb*5")', 2);
    expect(r.ok).toBe(false);
    expect(r.detail).toBe(
      "bar 1: 5 hits there, 4 of them between the 16 steps of the bar; E(5,16) puts every hit on a step",
    );
  });
  test("a rotation passes; bunched hits are named as not spread", async () => {
    expect((await check(BELL, 'perc3: s("cb(5,16,10)")', 2)).ok).toBe(true);
    const r = await check(BELL, 'perc3: s("cb cb cb cb cb ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~")', 2);
    expect(r.detail).toBe("bar 1: 5 hits there, not spread as evenly as they can go over 16 steps (E(5,16))");
  });
});

describe("microtiming: a lean is against the band, not the clock (AC2, R1.L05)", () => {
  const LEAN = rule({
    rule: "custom",
    fn: "microtiming",
    params: { track: "snare", direction: "late", minMs: 8, maxMs: 45 },
  });
  const band = (snare: string, rest = "") =>
    `setcpm(76/4)\nkick: s("bd ~ ~ [~ bd] ~ ~ bd ~")${rest}\nsnare: s("~ sd ~ sd")${snare}\nhats: s("hh*16").swingBy(.2, 8).gain(.4)${rest}`;
  test("the snare behind the band passes, at three amounts", async () => {
    for (const late of [".006", ".01", ".004"])
      expect((await check(LEAN, band(`.late(${late})`), 4)).ok).toBe(true);
  });
  test("the whole band late together is no lean; a slower tempo is no lean", async () => {
    const r = await check(LEAN, band(".late(.006)", ".late(.006)"), 4);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("with the rest of the band");
    expect((await check(LEAN, band("").replace("setcpm(76/4)", "setcpm(60/4)"), 4)).ok).toBe(false);
  });
});

describe("voicing-shape: a shell with its root in octaves is a shell (J1.L05)", () => {
  const DM7 = { root: 2, third: 5, fifth: 9, seventh: 0, ninth: 4 };
  test("root–3–7 and root–7–3 and the root doubled are shells", () => {
    expect(voicingShapeOf([50, 53, 60], DM7)).toBe("shell");
    expect(voicingShapeOf([50, 60, 65], DM7)).toBe("shell");
    expect(voicingShapeOf([38, 50, 53, 60], DM7)).toBe("shell");
    expect(voicingShapeOf([38, 50, 53, 60, 65], DM7)).toBe("shell");
  });
  test("the 3rd at the bottom, a triad, or a 5th in place of the 7th is no shell", () => {
    expect(voicingShapeOf([53, 60, 62], DM7)).toBeNull();
    expect(voicingShapeOf([50, 53, 57], DM7)).toBeNull();
    expect(voicingShapeOf([38, 50, 53, 57], DM7)).toBeNull();
  });
});

describe("device-count: the song's own devices are not the learner's (JC4)", () => {
  const DEVICES = rule({
    rule: "device-count",
    devices: ["tritone sub", "secondary ii–V", "backdoor", "diminished passing"],
    min: 3,
  });
  const chart = [["C^7"], ["Em7", "A7"], ["Dm7"], ["G7"], ["C^7"], ["Am7"], ["Dm7", "G7"], ["C^7"]];
  const songForm = [{ label: "A", bars: 8, chords: chart }];
  const piece = (changes: string) =>
    `setcpm(72/4)\nconst changes = "<${changes}>"\nchords: chord(changes).voicing().s("piano")\nbass: chord(changes).rootNotes(2).s("upright")`;
  const TWO = piece("C^7 [Em7 A7] Dm7 Db7 C^7 Am7 [Fm7 Bb7] C^7");
  const THREE = piece("C^7 [Em7 A7] Dm7 Db7 [C^7 C#o7] Dm7 [Fm7 Bb7] C^7");
  test("without the chart (as before) the chart's ii–V counts toward three", async () => {
    expect((await check(DEVICES, TWO, 8)).ok).toBe(true);
  });
  test("with the chart, two devices of the learner's own beside the chart's ii–V fail", async () => {
    const r = await check(DEVICES, TWO, 8, C, { songForm });
    expect(r.ok).toBe(false);
    expect(r.detail).toBe(
      "2 of the 3 asked for: tritone sub (bar 4), backdoor (bar 7); still open: secondary ii–V, diminished passing",
    );
  });
  test("with the chart, three devices of the learner's own pass", async () => {
    expect((await check(DEVICES, THREE, 8, C, { songForm })).ok).toBe(true);
  });
  test("the song as written shows no device of the learner's", async () => {
    const plain = piece("C^7 [Em7 A7] Dm7 G7 C^7 Am7 [Dm7 G7] C^7");
    expect((await check(DEVICES, plain, 8, C, { songForm })).detail).toContain("0 of the 3 asked for");
  });
});

describe("reharmonize with devices: the new chords arrive with the bar (J5.L01–L04)", () => {
  const head = 'setcpm(72/4)\n\nconst changes = "CH"\n\n';
  const MEL =
    '\nmel: n("<[-3 0 -1 0] [1 -2 1@2] [0 -1 -2 -1] 0 [-3 0 -1 0] [1 1 1@2] [0 -1 -2 -1] 0>").scale("C5:major").s("tenor")';
  const BASS = '\nbass: chord(changes).rootNotes(2).s("upright")';
  const piece = (changes: string, chords: string, bass = BASS, mel = MEL) =>
    `${head.replace("CH", changes)}chords: chord(changes).dict("lefthand").anchor("g4").voicing()${chords}${bass}${mel}`;
  const REF = piece("<C^7 D7 G7 C^7 C^7 D7 G7 C^7>", '.s("rhodes").gain(.6)');
  const GOOD = "<[C^7@3 C#o7] D7 [G7 Db7] C^7 C^7 [Am7 D7] [G7 Db7] C^7>";
  const RULE = rule({
    rule: "reharmonize",
    melody: "mel",
    reference: { solutions: [REF], bars: 8 },
    devices: ["tritone sub", "secondary ii–V", "backdoor", "diminished passing"],
    min: 2,
  });
  async function grade(code: string) {
    const raw = await strudel(REF, 8);
    const ref = normalizedFromEvents(raw.all, { cps: raw.cps });
    return check(RULE, code, 8, C, { resolveReference: () => ref });
  }
  test("the devices on the bar, pushed an eighth early, or held as written pass", async () => {
    for (const tail of ['.s("rhodes").gain(.6)', '.s("rhodes").gain(.6).early(1/8)', '.s("piano").gain(.5)'])
      expect((await grade(piece(GOOD, tail))).ok).toBe(true);
  });
  test("comping on 2 and 4 over a bass on the downbeats is not late (the bass brings the chord on 1)", async () => {
    const r = await grade(piece(GOOD, '.struct("~ x ~ x").s("rhodes").gain(.6)'));
    expect(r.detail).not.toContain("after the bar line");
    // The comping alone a beat late over a bass on time is the same: the bar's harmony arrives on 1.
    const late = await grade(piece(GOOD, '.s("rhodes").gain(.6).late(1/4)'));
    expect(late.detail).not.toContain("after the bar line");
  });
  test("the right devices with the whole harmony a beat late fail, naming the fault", async () => {
    const r = await grade(
      piece(
        GOOD,
        '.s("rhodes").gain(.6).late(1/4)',
        '\nbass: chord(changes).rootNotes(2).s("upright").late(1/4)',
      ),
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("your harmony changes after the bar line, not on it");
    expect(r.detail).not.toMatch(/[A-G][♭♯b#]?(7|m7|°|o7|\^7)/);
  });
});
