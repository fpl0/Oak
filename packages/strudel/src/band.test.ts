// The Band's register in every key (contracts §5.10): Band code is written in C, so `{{key}}` from F♯ to B
// must not lift the whole Band up to a fifth. Checked on the real Band code of every band, flavour and stage
// in all twelve major keys, evaluated in headless Strudel, the way an app hands a Band to the adapter.
import { describe, expect, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { BAND_STAGES, bandCodeAt, bands } from "../../../content/bands/index.ts";
import {
  bandCodeFor,
  bandOctave,
  foldBandRegister,
  keyPlanAt,
  learnerKeyPlanOf,
  tonicOffset,
} from "./band.ts";
import type { BandSetup } from "./types.ts";

const TONICS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

/** What every app does with a Band before the adapter sees it: `{{key}}` → `<tonic>4:<mode>`. */
function setupOf(code: string, tonic: string, followsLearnerKey = false): BandSetup {
  return {
    band: "band.two-chord-vamp" as never,
    flavour: "flavour.pop" as never,
    code: code.replaceAll("{{key}}", `${tonic}4:major`),
    followsLearnerKey,
    tracks: ["drums", "bass", "chords"],
  };
}

async function rangeOf(code: string, bars: number): Promise<Record<string, [number, number]>> {
  const r = await evalHeadless(`setcpm(90/4)\n${code}`, bars);
  const out: Record<string, [number, number]> = {};
  for (const e of r.events) {
    if (e.midi === null) continue;
    const m = Math.round(e.midi);
    const cur = out[e.track];
    out[e.track] = cur ? [Math.min(cur[0], m), Math.max(cur[1], m)] : [m, m];
  }
  return out;
}

describe("register fold", () => {
  test("tonic offsets and folded octaves", () => {
    expect(TONICS.map(tonicOffset)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(["Cb", "B#", "E#", "Fb"].map(tonicOffset)).toEqual([-1, 12, 5, 4]);
    // C to F stay, F♯/G♭ to B go down an octave; Cb4 is already B3, B#3 is C4.
    expect(TONICS.map((t) => bandOctave(t, 4))).toEqual([4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3]);
    expect([bandOctave("Cb", 4), bandOctave("B#", 4), bandOctave("Gb", 2)]).toEqual([4, 3, 1]);
  });
  test("only scale names inside .scale() strings move", () => {
    expect(foldBandRegister('n("0").scale("A4:minor").s("piano") // A4:minor')).toBe(
      'n("0").scale("A3:minor").s("piano") // A4:minor',
    );
    expect(foldBandRegister('n("0").scale("<C4:major G4:major F#2:harmonic:minor>")')).toBe(
      'n("0").scale("<C4:major G3:major F#1:harmonic:minor>")',
    );
  });
});

describe("every band, flavour and stage keeps its register in all twelve keys", () => {
  const cases: { id: string; flavour: string; staged: boolean; code: string; bars: number }[] = [];
  for (const b of bands)
    for (const flavour of Object.keys(b.code))
      for (const staged of [false, true]) {
        if (staged && !BAND_STAGES[b.id]?.[flavour as keyof (typeof BAND_STAGES)[string]]?.length) continue;
        cases.push({ id: b.id, flavour, staged, code: bandCodeAt(b, flavour, () => staged), bars: b.bars });
      }
  test("there is something to check", () => {
    expect(cases.length).toBeGreaterThan(10);
    expect(cases.some((c) => c.staged)).toBe(true);
  });
  for (const c of cases)
    test(`${c.id} × ${c.flavour}${c.staged ? " (latest stage)" : ""}`, async () => {
      const inC = await rangeOf(bandCodeFor(setupOf(c.code, "C"), ctx("C", "")), c.bars);
      expect(Object.keys(inC).length).toBeGreaterThan(0);
      const wrong: string[] = [];
      let unfoldedTooHigh = false;
      for (const tonic of TONICS) {
        const r = await rangeOf(bandCodeFor(setupOf(c.code, tonic), ctx(tonic, "")), c.bars);
        for (const [track, [lo, hi]] of Object.entries(r)) {
          const [cLo, cHi] = inC[track] as [number, number];
          // Within a tritone below to a fourth above the Band in C, every track, every key.
          if (lo < cLo - 6 || hi > cHi + 5) wrong.push(`${tonic} ${track} ${lo}..${hi} (C: ${cLo}..${cHi})`);
        }
        const raw = await rangeOf(setupOf(c.code, tonic).code, c.bars);
        if (Object.entries(raw).some(([t, [, hi]]) => hi > (inC[t]?.[1] ?? 0) + 5)) unfoldedTooHigh = true;
      }
      expect(wrong).toEqual([]);
      // The fold is what keeps it there: read literally, some key rises more than a fourth.
      expect(unfoldedTooHigh).toBe(true);
    });
});

function ctx(tonic: string, learnerCode: string) {
  return { key: { tonic, mode: "major" } as never, defaultBpm: 90, learnerCode };
}

describe("a Band that follows the learner's key", () => {
  const vamp = bands.find((b) => b.id === "band.two-chord-vamp");
  const code = vamp ? bandCodeAt(vamp, "flavour.pop", () => false) : "";
  test("a tune in B puts the Band in B below C, not a seventh above", async () => {
    const inC = await rangeOf(bandCodeFor(setupOf(code, "C", true), ctx("C", 'n("0").scale("C4:major")')), 2);
    const inB = await rangeOf(bandCodeFor(setupOf(code, "C", true), ctx("C", 'n("0").scale("B4:major")')), 2);
    for (const track of Object.keys(inC)) {
      const [cLo] = inC[track] as [number, number];
      const [bLo] = inB[track] as [number, number];
      expect([track, bLo - cLo]).toEqual([track, -1]);
    }
  });
  test("a patterned key plan moves the Band bar by bar, each key in its register", async () => {
    const learner = 'mel: n("0 2 4 2").scale("<C4:major G4:major D4:major>")';
    const band = bandCodeFor(setupOf(code, "C", true), ctx("C", learner));
    expect(band).toContain('.scale("<C4:major G3:major D4:major>")');
    const r = await evalHeadless(`setcpm(90/4)\n${learner}\n${band}`, 3);
    const keysOf = (track: string) =>
      [0, 1, 2].map((cycle) => [
        ...new Set(
          r.events.filter((e) => e.track === track && Math.floor(e.onset) === cycle).map((e) => e.scale),
        ),
      ]);
    expect(keysOf("chords")).toEqual([["C4 major"], ["G3 major"], ["D4 major"]]);
    expect(keysOf("bass")).toEqual([["C4 major"], ["G3 major"], ["D4 major"]]);
    // The learner's line is untouched.
    expect(keysOf("mel")).toEqual([["C4 major"], ["G4 major"], ["D4 major"]]);
  });
  // Wave 6 (U17, C7, CF-A): the lift. Contracts §6.8 item 4 writes a key change after arrange() or as a lifted
  // section const; the Band follows both, and a key a step up is played a step up.
  test("the lift after arrange(): the Band rises a whole step with the last chorus, on every track", async () => {
    const learner = [
      'const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")',
      'const melChorus = n("<[7 6 4 2] [4 ~ 2 ~]>")',
      'const bassVerse = n("<0 3>")',
      'kick: s("bd*4")',
      'bass: arrange([2, bassVerse], [2, bassVerse], [2, bassVerse]).scale("<F2:major!4 G2:major!2>").s("ebass")',
      'mel: arrange([2, melVerse], [2, melChorus], [2, melChorus]).scale("<F4:major!4 G4:major!2>").s("piano")',
    ].join("\n");
    expect(learnerKeyPlanOf(learner)).toBe("<F2:major!4 G2:major!2>");
    const band = bandCodeFor(setupOf(code, "F", true), ctx("F", learner));
    // F is the top of the register (octave 4); G alone would fold to octave 3, a seventh down. It is a lift: up.
    expect(band).toContain('.scale("<F4:major!4 G4:major!2>")');
    const r = await evalHeadless(`setcpm(90/4)\n${learner}\n${band}`, 6);
    const lowest = (track: string, from: number, to: number) =>
      Math.min(
        ...r.events
          .filter((e) => e.track === track && e.onset >= from && e.onset < to && e.midi !== null)
          .map((e) => e.midi as number),
      );
    for (const track of ["bass", "chords"]) {
      // The vamp is two bars: bars 3–4 (in F) and bars 5–6 (in G) play the same degrees, a whole step apart.
      expect([track, lowest(track, 4, 6) - lowest(track, 2, 4)]).toEqual([track, 2]);
      const keys = [...new Set(r.events.filter((e) => e.track === track).map((e) => e.scale))];
      expect(keys).toEqual(["F4 major", "G4 major"]);
    }
  });
  test("a half-step lift and a lift out of B: up a step, never down a seventh", () => {
    const plan = (arg: string) => keyPlanAt(arg, 4);
    expect(plan("<F4:major!16 F#4:major!8>")).toBe("<F4:major!16 F#4:major!8>");
    expect(plan("<C4:major!16 D4:major!8>")).toBe("<C4:major!16 D4:major!8>");
    expect(plan("<B4:major!16 C4:major!8>")).toBe("<B3:major!16 C4:major!8>");
    expect(plan("<A4:major!8 B4:major!8 C#4:major!8>")).toBe("<A3:major!8 B3:major!8 C#4:major!8>");
    // Two lifts in a row keep rising; the Band is then a step above its register for the last section.
    expect(plan("<E4:major!8 F4:major!8 G4:major!8>")).toBe("<E4:major!8 F4:major!8 G4:major!8>");
    // A step down is a step down.
    expect(plan("<G4:major!8 F4:major!8>")).toBe("<G3:major!8 F3:major!8>");
  });
  test("a wider move goes back to the register: to the dominant and round the fifths without drifting", () => {
    expect(keyPlanAt("<C4:major!8 G4:major!8 C4:major!8>", 4)).toBe("<C4:major!8 G3:major!8 C4:major!8>");
    expect(keyPlanAt("<C4:major G4:major D4:major A4:major E4:major B4:major>", 4)).toBe(
      "<C4:major G3:major D4:major A3:major E4:major B3:major>",
    );
    // The relative minor and back (U17.L01's neighbours): each in its own register.
    expect(keyPlanAt("<C4:major!8 A4:minor!8>", 4)).toBe("<C4:major!8 A3:minor!8>");
    // The Band line's own octave is kept (a bass line written at octave 2).
    expect(keyPlanAt("<F4:major!4 G4:major!2>", 2)).toBe("<F2:major!4 G2:major!2>");
  });
  test("the plan is found on whichever track carries it, behind a part in one key", () => {
    const learner = [
      'pad: n("[0,2,4]").scale("C3:major").s("pad")',
      'mel: arrange([8, melVerse], [8, melChorus]).scale("<C4:major!8 D4:major!8>").s("piano")',
    ].join("\n");
    expect(learnerKeyPlanOf(learner)).toBe("<C4:major!8 D4:major!8>");
    expect(bandCodeFor(setupOf(code, "C", true), ctx("C", learner))).toContain(
      '.scale("<C4:major!8 D4:major!8>")',
    );
  });
  test("a lifted section const (the other form of §6.8) is read as a plan, bar counts from arrange()", async () => {
    const learner = [
      'const melVerse = n("<[0 2 4 2] [4 2 1 ~]>").scale("C4:major")',
      'const melChorus = n("<[7 6 4 2] [4 ~ 2 ~]>").scale("C4:major")',
      'const melChorus2 = n("<[7 6 4 2] [4 ~ 2 ~]>").scale("D4:major")',
      "",
      'mel: arrange([8, melVerse], [8, melChorus], [4, silence], [8, melChorus2]).s("piano")',
    ].join("\n");
    // The rest stays in the key before it; the lift starts where the lifted section does.
    expect(learnerKeyPlanOf(learner)).toBe("<C4:major!20 D4:major!8>");
    const band = bandCodeFor(setupOf(code, "C", true), ctx("C", learner));
    expect(band).toContain('.scale("<C4:major!20 D4:major!8>")');
    const r = await evalHeadless(`setcpm(90/4)\n${learner}\n${band}`, 28);
    const keyAt = (bar: number) => [
      ...new Set(
        r.events.filter((e) => e.track === "bass" && Math.floor(e.onset) === bar).map((e) => e.scale),
      ),
    ];
    expect([keyAt(0), keyAt(19), keyAt(20), keyAt(27)]).toEqual([
      ["C4 major"],
      ["C4 major"],
      ["D4 major"],
      ["D4 major"],
    ]);
  });
  test("sections in one key, and code with chord names only, are no plan", () => {
    expect(
      learnerKeyPlanOf(
        'const melVerse = n("0").scale("C4:major")\nconst melChorus = n("4").scale("C4:major")\nmel: arrange([4, melVerse], [4, melChorus])',
      ),
    ).toBeNull();
    expect(learnerKeyPlanOf('chords: chord("<C F G C>").voicing()')).toBeNull();
    expect(learnerKeyPlanOf('// .scale("<C4:major D4:major>")\nmel: n("0").scale("C4:major")')).toBeNull();
  });
  test("a Band in sections follows the form and the key plan at once", async () => {
    const sectioned = bands.find((b) => b.id === "band.sections");
    if (!sectioned) throw new Error("band.sections is missing");
    const learner = [
      'const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")',
      'const melChorus = n("<[7 6 4 2] [4 ~ 2 ~]>")',
      'const melChorus2 = n("<[7 6 4 2] [4 ~ 2 ~]>")',
      'mel: arrange([4, melVerse], [4, melChorus], [4, melChorus2]).scale("<C4:major!8 D4:major!4>").s("piano")',
    ].join("\n");
    const band = bandCodeFor(
      setupOf(
        bandCodeAt(sectioned, "flavour.pop", () => true),
        "C",
        true,
      ),
      ctx("C", learner),
    );
    expect(band).toContain("arrange([4, bassVerse], [4, bassChorus], [4, bassChorus])");
    expect(band).toContain('.scale("<C4:major!8 D4:major!4>")');
    const r = await evalHeadless(`setcpm(90/4)\n${learner}\n${band}`, 12);
    const pcsOf = (track: string, bar: number) =>
      r.events
        .filter((e) => e.track === track && Math.floor(e.onset) === bar && e.midi !== null)
        .map((e) => (e.midi as number) % 12);
    // The second chorus plays the first chorus's bars a whole step up, bar for bar.
    for (let bar = 0; bar < 4; bar++)
      for (const track of ["bass", "chords"])
        expect([track, bar, pcsOf(track, 8 + bar)]).toEqual([
          track,
          bar,
          pcsOf(track, 4 + bar).map((pc) => (pc + 2) % 12),
        ]);
  });
  test("without a patterned key, the Band keeps one key and the step key folds", () => {
    const band = bandCodeFor(setupOf(code, "A", true), ctx("A", 's("bd")'));
    expect(band).toContain('.scale("A3:major")');
    expect(band).not.toContain("A4:major");
  });
});
