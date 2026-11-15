// The advanced tracks' lenses on real Strudel output (track-lens.ts; docs/design/wave7.md §4.2): what each lens says
// about a piece, and that it says nothing where a piece has nothing to show. Every musical claim below was read off
// the evaluated events.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { MeterId } from "@oak/content-kit";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { lateMs, METERS, swingRatio } from "@oak/theory";
import { buildModel, type WorkbenchModel } from "./model.ts";
import { namedExtension, oddMeterGrid, polymeterOf, ratioText, tensionTag } from "./track-lens.ts";

setDefaultTimeout(60_000);
beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

async function model(code: string, bars: number, meter: MeterId = "4/4"): Promise<WorkbenchModel> {
  const out = buildModel(code, await evaluateForGrading(code, { mode: "lesson", bars, lint: null, meter }), {
    meter,
    key: null,
    staff: false,
  });
  if (!out.ok) throw new Error(out.error.message);
  return out.model;
}
const tagsOf = (m: WorkbenchModel, track: string) =>
  m.events
    .filter((e) => e.track === track)
    .map((e) => {
      const t = m.track?.tensions.get(e.id);
      return t ? `${t.tag}${t.avoid ? "!" : ""}` : "-";
    });

const SHELLS = `setcpm(110/4)
chords: note("<[d3,f3,c4] [g2,f3,b3] [c3,e3,b3] [c3,e3,b3]>").s("piano").gain(.5)
mel: note("<[e4 f4 a4 c5] [a4 ~ e5 ~] [d5 ~ e5 ~] [f5 ~ ~ ~]>").s("vibes")`;

describe("the jazz lenses", () => {
  test("tensions: 9, 13 and 11 named against their chords; a held 11 over a major seventh is an avoid note", async () => {
    const m = await model(SHELLS, 4);
    // Dm7: E is the 9; F, A and C are chord tones (A is the 5th the shell leaves out: still a chord tone).
    // G7: A is the 9, E the 13. Cmaj7: D is the 9, E a chord tone. Bar 4: F held over Cmaj7, the avoid 11.
    expect(tagsOf(m, "mel")).toEqual(["9", "-", "-", "-", "9", "13", "9", "-", "11!"]);
    const avoid = [...(m.track?.tensions.values() ?? [])].find((t) => t.avoid);
    expect(avoid?.chord).toBe("C∆7");
    expect(avoid?.words).toContain("a common choice");
  });

  test("voicings, chord-scales and the ii–V bracket on the chord band", async () => {
    const m = await model(`${SHELLS}\nbass: note("<d2 g1 c2 c2>").s("fingerbass")`, 4);
    expect(m.harmony?.regions.map((r) => r.symbol)).toEqual(["Dm7", "G7", "Cmaj7"]);
    expect(m.track?.regions.map((r) => r.jazz)).toEqual(["D–7", "G7", "C∆7"]);
    expect(m.track?.regions.map((r) => r.voicing)).toEqual(["shell", "shell", "shell"]);
    expect(m.track?.regions.map((r) => r.scale)).toEqual(["Dorian", "Mixolydian", "Ionian (major)"]);
    expect(m.track?.twoFives).toEqual([{ from: 0, to: 2, text: "ii–V → C major", resolved: true }]);
  });

  test("a dictionary voicing is called one, never given a hand-voicing type", async () => {
    const m = await model(
      `setcpm(110/4)
chords: chord("<Dm7 G7 C^7 C^7>").dict("lefthand").voicing().s("piano")
bass: chord("<Dm7 G7 C^7 C^7>").rootNotes(2).s("fingerbass")`,
      4,
    );
    expect(m.track?.regions.map((r) => r.voicing)).toEqual([
      "dictionary voicing",
      "dictionary voicing",
      "dictionary voicing",
    ]);
  });

  test("rootless voicings by hand over a bass: A and B forms", async () => {
    // Dm7 A form F A C E over D; G7 B form F A B E over G; Cmaj7 A form E G B D over C.
    const m = await model(
      `setcpm(110/4)
keys: note("<[f3,a3,c4,e4] [f3,a3,b3,e4] [e3,g3,b3,d4]>").s("piano")
bass: chord("<Dm7 G7 C^7>").rootNotes(2).s("fingerbass")`,
      3,
    );
    // The harmony reads no chord band here (five notes with the bass: see the grader note); the roll's labels come
    // from the changes line's symbols.
    expect(m.track?.voicings.map((v) => `${v.chord} ${v.label} ${v.roles}`)).toEqual([
      "Dm7 rootless A b3 5 b7 9",
      "G7 rootless B b7 9 3 13",
      "C^7 rootless A 3 5 7 9",
    ]);
  });

  test("substitutions: the tritone sub, the backdoor and the passing diminished chord", async () => {
    const tri = await model(`setcpm(100/4)\nchords: chord("<Dm7 Db7 C^7 C^7>").voicing().s("piano")`, 4);
    expect(tri.track?.regions.map((r) => r.sub)).toEqual([null, "tritone sub", null]);
    expect(tri.track?.regions[1]?.subWords).toContain("G7");
    const back = await model(`setcpm(100/4)\nchords: chord("<Fm7 Bb7 C^7 C^7>").voicing().s("piano")`, 4);
    expect(back.track?.regions.map((r) => r.sub)).toEqual([null, "backdoor", null]);
    const dim = await model(`setcpm(100/4)\nchords: chord("<C^7 C#o7 Dm7 G7>").voicing().s("piano")`, 4);
    expect(dim.track?.regions.map((r) => r.sub)).toEqual([null, "passing °7", null, null]);
    // A plain ii–V–I has none.
    const plain = await model(`setcpm(100/4)\nchords: chord("<Dm7 G7 C^7 C^7>").voicing().s("piano")`, 4);
    expect(plain.track?.regions.every((r) => r.sub === null)).toBe(true);
  });

  test("a minor ii–V aims at its minor tonic", async () => {
    const m = await model(`setcpm(100/4)\nchords: chord("<Bm7b5 E7 Am7 Am7>").voicing().s("piano")`, 4);
    expect(m.track?.twoFives.map((b) => b.text)).toEqual(["ii–V → A minor"]);
    expect(m.track?.regions[0]?.scale).toBe("Locrian");
  });
});

describe("the rhythm lenses", () => {
  test("the clave: son 3-2 named with the bars it covers; a part that is no clave shows nothing", async () => {
    const m = await model(
      `setcpm(100/4)
clave: s("rim").struct("<[x ~ ~ x ~ ~ x ~] [~ ~ x ~ x ~ ~ ~]>")
kick: s("bd ~ bd ~")`,
      4,
    );
    expect(m.track?.clave?.text).toBe("Son clave 3-2 · bars 1–4 (clave)");
    expect(m.track?.clave?.steps).toEqual([0, 3, 6, 10, 12]);
    const two = await model(
      `setcpm(100/4)\nclave: s("rim").struct("<[~ ~ x ~ x ~ ~ ~] [x ~ ~ x ~ ~ x ~]>")`,
      4,
    );
    expect(two.track?.clave?.direction).toBe("2-3");
    // One sound of a kit can be the clave.
    const kit = await model(
      `setcpm(100/4)\ndrums: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>, bd*2")`,
      4,
    );
    expect(kit.track?.clave?.part).toBe("drums · rim");
    const none = await model(`setcpm(100/4)\ndrums: s("bd ~ sd ~")`, 4);
    expect(none.track?.clave).toBeNull();
  });

  test("pulse lanes: 3 against 2 in the same bars; a polymeter's period from the code", async () => {
    const m = await model(
      `setcpm(90/4)
three: s("rim*3")
two: s("bd*2")`,
      2,
    );
    expect(m.track?.poly?.kind).toBe("polyrhythm");
    expect(m.track?.poly?.text).toBe("3 against 2 a bar: three and two meet only on the downbeat");
    // Even pulses a multiple of each other are not a cross-rhythm.
    const not = await model(`setcpm(90/4)\nhats: s("hh*4")\nkick: s("bd*2")`, 2);
    expect(not.track?.poly).toBeNull();
    expect(polymeterOf(`perc: s("{rim rim cb}%4")`)).toEqual({ part: "perc", length: 3, perBar: 4 });
    const pm = await model(`setcpm(100/4)\nperc: s("{rim rim cb}%4")\nkick: s("bd ~ bd ~")`, 3);
    expect(pm.track?.poly?.kind).toBe("polymeter");
    expect(pm.track?.poly?.text).toBe(
      "perc: a cycle of 3 steps at 4 a bar — back in line with the bar every 3 bars",
    );
  });

  test("microtiming in milliseconds at the tempo; swung 16ths named with their ratio", async () => {
    const m = await model(
      `setcpm(100/4)
keys: note("[c4,e4,g4]").struct("~ x ~ x").late(.02).s("piano")
kick: s("bd ~ bd ~")`,
      2,
    );
    const ms = lateMs(0.02, 100, METERS["4/4"]);
    expect(Math.round(ms)).toBe(48);
    const keys = m.events.filter((e) => e.track === "keys");
    for (const e of keys) expect(Math.round(m.track?.micro.marks.get(e.id)?.ms ?? 0)).toBe(48);
    expect(m.events.filter((e) => e.track === "kick").every((e) => !m.track?.micro.marks.has(e.id))).toBe(
      true,
    );
    // Triplets are written on their grid: no microtiming on them.
    const tri = await model(
      `setcpm(100/4)\nthree: s("lt*3")\nkeys: note("c4").struct("x x").late(.02).s("piano")`,
      1,
    );
    expect(tri.events.filter((e) => e.track === "three").some((e) => tri.track?.micro.marks.has(e.id))).toBe(
      false,
    );
    expect(tri.events.filter((e) => e.track === "keys").every((e) => tri.track?.micro.marks.has(e.id))).toBe(
      true,
    );
    expect(m.track?.micro.tracks.map((t) => t.text)).toEqual(["keys: 48 ms behind the grid"]);
    const sw = await model(`setcpm(96/4)\nhats: s("hh*16").swingBy(1/3, 8)\nkick: s("bd*4")`, 2);
    expect(sw.track?.micro.tracks.map((t) => t.text)).toEqual(["hats: Swing 16ths · 2:1"]);
    const swung = sw.events.filter((e) => sw.track?.micro.marks.get(e.id)?.kind === "swing");
    expect(swung.length).toBe(16);
    expect(ratioText(swingRatio(0.2))).toBe("3:2");
  });

  test("odd meters: the groups and their counts", () => {
    expect(oddMeterGrid(METERS["7/8"])?.text).toBe("7/8 in 2+2+3 (count 1 2 | 1 2 | 1 2 3)");
    expect(
      oddMeterGrid(METERS["9/8i"])
        ?.lines.filter((l) => l.level === "group")
        .map((l) => l.at),
    ).toEqual([0, 2 / 9, 4 / 9, 6 / 9]);
    expect(oddMeterGrid(METERS["5/4"])?.count).toBe("1 2 3 | 1 2");
    expect(oddMeterGrid(METERS["4/4"])).toBeNull();
    expect(oddMeterGrid(METERS["6/8"])).toBeNull();
  });
});

describe("the sound lenses", () => {
  test("registers: each part's range, and a close chord low down marked as a clash", async () => {
    const m = await model(
      `setcpm(90/4)
pad: note("[c2,e2,g2]").s("sawtooth").lpf(800)
mel: note("c5 e5 g5 e5").s("piano")`,
      1,
    );
    expect(m.track?.registers?.parts).toEqual([
      { track: "pad", low: 36, high: 43 },
      { track: "mel", low: 72, high: 79 },
    ]);
    expect(m.track?.registers?.clashes.map((c) => c.interval)).toEqual([4, 3]);
    const clear = await model(`setcpm(90/4)\npad: note("[c4,e4,g4]").s("piano")`, 1);
    expect(clear.track?.registers?.clashes).toEqual([]);
  });

  test("density per section: a thin verse and a thick chorus; one span shows nothing", async () => {
    const m = await model(
      `setcpm(100/4)
const drumsVerse = s("bd ~ ~ ~")
const drumsChorus = s("bd hh sd hh")
const keysVerse = note("[c4,e4,g4]").s("piano")
const keysChorus = note("[c4,e4,g4]*4").s("piano")
drums: arrange([2, drumsVerse], [2, drumsChorus])
keys: arrange([2, keysVerse], [2, keysChorus])`,
      4,
    );
    const d = m.track?.density ?? [];
    expect(d.map((s) => s.label)).toEqual(["Verse", "Chorus"]);
    // Verse: one onset a bar (the kick and the chord together, four notes); chorus: four onsets, a chord on each.
    expect(d[0]?.onsetsPerBar).toBe(1);
    expect(d[1]?.onsetsPerBar).toBe(4);
    expect(d[1]?.level).toBe(1);
    expect((d[0]?.level ?? 1) < 0.5).toBe(true);
    const one = await model(`setcpm(100/4)\ndrums: s("bd hh sd hh")`, 2);
    expect(one.track?.density).toBeNull();
  });
});

test("tension tags print accidentals as signs", () => {
  expect(tensionTag("b9")).toBe("♭9");
  expect(tensionTag("#11")).toBe("♯11");
  expect(tensionTag("13")).toBe("13");
});

describe("namedExtension: a tension the symbol names is still named by the lens", () => {
  test("E over Dm9 is its 9, E over G13 its 13, A♭ over G7♭9 its ♭9; a 3rd, a 7th and a note the symbol leaves out are not", () => {
    expect(namedExtension("Dm9", 76)).toBe("9");
    expect(namedExtension("G13", 64)).toBe("13");
    expect(namedExtension("G7b9", 68)).toBe("b9");
    expect(namedExtension("Dm9", 65)).toBeNull();
    expect(namedExtension("Dm9", 72)).toBeNull();
    expect(namedExtension("Dm7", 76)).toBeNull();
    expect(namedExtension("C6", 69)).toBeNull();
  });
});
