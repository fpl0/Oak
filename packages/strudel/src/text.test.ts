// Text helpers: completion (only unlocked tools), soundsIn, Band code preparation.
import { describe, expect, test } from "bun:test";
import type { ToolEntry, UnlockableId } from "@oak/content-kit";
import { bandCodeFor, firstScaleOf, scaleName, tempoOf } from "./band.ts";
import { buildVocabulary, completionSiteAt, completionsFor } from "./completion.ts";
import { soundsIn, statementsOf, stripComments } from "./sounds-in.ts";

const entry = (id: string, code: string, matches?: string[], kind: ToolEntry["kind"] = "tool"): ToolEntry =>
  ({
    id,
    kind,
    code,
    unlock: { at: "U01.L01", when: "complete" },
    concept: "c",
    catalog: { signature: code, meaning: `meaning of ${id}`, demo: code },
    ...(matches ? { matches } : {}),
  }) as unknown as ToolEntry;

const TOOLBOX: ToolEntry[] = [
  entry("tb.note", 'note("c4")', ["note"]),
  entry("tb.scale", '.scale("C4:major")', ["scale"]),
  entry("tb.voicing", ".voicing()", ["voicing"]),
  entry("snd.piano", 's("piano")', undefined, "sound"),
  entry("snd.rhodes", 's("rhodes")', undefined, "sound"),
  entry("snd.bank.RolandTR909", '.bank("RolandTR909")', ["RolandTR909"], "sound"),
  entry("scale.major", '"C4:major"', undefined, "scale"),
  entry("scale.harmonic-minor", '"A3:harmonic:minor"', undefined, "scale"),
];
const vocab = buildVocabulary(TOOLBOX);
const unlocked = (...ids: string[]) => new Set(ids) as ReadonlySet<UnlockableId>;

describe("completion", () => {
  test("a locked tool is absent; an unlocked one carries its catalog docs", () => {
    const site = completionSiteAt('note("c4").vo', 13);
    expect(site).toMatchObject({ prefix: "vo", inString: false, afterDot: true });
    expect(completionsFor(vocab, unlocked("tb.note"), site)).toEqual([]);
    const items = completionsFor(vocab, unlocked("tb.note", "tb.voicing"), site);
    expect(items.map((i) => [i.label, i.toolId, i.info])).toEqual([
      ["voicing", "tb.voicing", "meaning of tb.voicing"],
    ]);
  });
  test('inside s("…") only unlocked sounds; inside .bank("…") only banks; inside .scale("…") scale names', () => {
    const code = 's("bd pi';
    const site = completionSiteAt(code, code.length);
    expect(site).toMatchObject({ inString: true, callee: "s", prefix: "pi" });
    expect(completionsFor(vocab, unlocked("snd.piano"), site).map((i) => i.label)).toEqual(["piano"]);
    expect(completionsFor(vocab, unlocked(), site)).toEqual([]);
    const bank = '.bank("Rol';
    expect(
      completionsFor(vocab, unlocked("snd.bank.RolandTR909"), completionSiteAt(bank, bank.length)).map(
        (i) => i.label,
      ),
    ).toEqual(["RolandTR909"]);
    const sc = 'n("0").scale("A3:harm';
    expect(
      completionsFor(
        vocab,
        unlocked("scale.harmonic-minor", "scale.major"),
        completionSiteAt(sc, sc.length),
      ).map((i) => i.label),
    ).toEqual(["harmonic:minor"]);
  });
  test("comments and empty prefixes complete nothing unless asked", () => {
    expect(completionsFor(vocab, unlocked("tb.note"), completionSiteAt("// no", 5))).toEqual([]);
    expect(completionsFor(vocab, unlocked("tb.note"), completionSiteAt("", 0))).toEqual([]);
    expect(
      completionsFor(vocab, unlocked("tb.note"), completionSiteAt("", 0), true).map((i) => i.label),
    ).toEqual(["note"]);
  });
});

describe("soundsIn", () => {
  test("reads s(), sound() and .bank() per statement, with :n and note pitches", () => {
    const code = `setcpm(120/4)
drums: s("bd*2 [~ sd] hh:2").bank("RolandTR909")
// s("gm_violin")
keys: note("c4 e4 g4")
  .s("<piano rhodes>")
bass: sound("ebass")`;
    expect(soundsIn(code)).toEqual({
      sounds: [
        { s: "bd", bank: "RolandTR909" },
        { s: "sd", bank: "RolandTR909" },
        { s: "hh", bank: "RolandTR909", n: 2 },
        { s: "piano", notes: ["c4", "e4", "g4"] },
        { s: "rhodes", notes: ["c4", "e4", "g4"] },
        { s: "ebass" },
      ],
    });
  });
  test("helpers keep offsets and split statements at top-level newlines only", () => {
    expect(stripComments('a // x\nb /* y */ "//z"')).toBe('a     \nb         "//z"');
    expect(statementsOf("a(\n1)\n.b()\nc")).toEqual(["a(\n1)\n.b()", "c"]);
  });
});

describe("Band code", () => {
  const setup = {
    band: "band.pop-basic" as never,
    flavour: "flavour.pop" as never,
    code: 'chords: n("0 2 4").scale("C4:major").s("piano")\nbass: n("0").scale("C2:major").s("ebass")\nsetcpm({{bpm}}/4)',
    followsLearnerKey: true,
    tracks: ["chords", "bass"] as ("drums" | "bass" | "chords")[],
  };
  test("follows the learner's first .scale(), keeping the Band's register (A sits below C), and the learner's tempo", () => {
    const code = bandCodeFor(setup, {
      key: { tonic: "C", mode: "major" } as never,
      defaultBpm: 100,
      learnerCode: 'setcpm(90/4)\nmel: n("0 1 2").scale("A4:harmonic:minor")',
    });
    expect(code).toBe(
      'chords: n("0 2 4").scale("A3:harmonic:minor").s("piano")\nbass: n("0").scale("A1:harmonic:minor").s("ebass")\nsetcpm(90/4)',
    );
  });
  test("without a learner scale the step key stays; without a tempo line the lesson default fills {{bpm}}", () => {
    const code = bandCodeFor(setup, {
      key: { tonic: "C", mode: "major" } as never,
      defaultBpm: 100,
      learnerCode: 's("bd")',
    });
    expect(code).toContain('scale("C4:major")');
    expect(code).toContain("setcpm(100/4)");
    expect(firstScaleOf('n("0").scale("<F#3:dorian Bb3:major>")')).toEqual({
      tonic: "F#",
      octave: 3,
      mode: "dorian",
    });
    expect(tempoOf("setcpm(140/4)")).toEqual({ bpm: 140, unitsPerBar: 4 });
    expect(scaleName({ tonic: "D", mode: "harmonic minor" } as never, 3)).toBe("D3:harmonic:minor");
  });
});
