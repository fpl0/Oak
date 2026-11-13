// A Band in sections follows the learner's song form (band-form.ts): read statically, rewritten per track, and
// checked in headless Strudel so a Band chorus really sounds under the learner's chorus bars.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { bandCodeFor } from "./band.ts";
import { followLearnerForm, formBarsOf, learnerSectionsOf, sectionTypeOf } from "./band-form.ts";
import type { BandSetup } from "./types.ts";

setDefaultTimeout(30_000);

/** A sectioned Band: the verse on closed hats and roots, the chorus on open hats, a tambourine and pushes. */
const BAND = [
  'const drumsVerse = s("bd ~ sd ~, hh*8")',
  'const drumsChorus = s("bd ~ sd ~, oh*4, ~ tb ~ tb")',
  'const bassVerse = n("<-14 -9 -11 -10>").scale("{{key}}").s("ebass")',
  'const bassChorus = n("<[-11 -11] [-10 -10] [-14 -14] [-9 -9]>").scale("{{key}}").s("ebass")',
  "drums: arrange([4, drumsVerse], [4, drumsChorus])",
  "bass: arrange([4, bassVerse], [4, bassChorus]).lpf(800)",
].join("\n");

const LEARNER = [
  'const melVerse = n("0 2 4 2").scale("C4:major")',
  'const melChorus = n("4 5 4 2").scale("C4:major")',
  'const melChorus2 = n("4 5 7 4").scale("C4:major")',
  'mel: arrange([8, melVerse], [4, melChorus], [8, melVerse], [8, melChorus2]).s("piano")',
].join("\n");

describe("reading the learner's sections", () => {
  test("section types follow contracts §6.3 item 2", () => {
    expect(sectionTypeOf("melVerse")).toBe("verse");
    expect(sectionTypeOf("melChorus2")).toBe("chorus");
    expect(sectionTypeOf("bassPreChorus")).toBe("prechorus");
    expect(sectionTypeOf("verse")).toBe("verse");
    expect(sectionTypeOf("silence")).toBeNull();
  });

  test("one arranged track", () => {
    expect(learnerSectionsOf(LEARNER)).toEqual([
      { ident: "melVerse", type: "verse", bars: 8 },
      { ident: "melChorus", type: "chorus", bars: 4 },
      { ident: "melVerse", type: "verse", bars: 8 },
      { ident: "melChorus2", type: "chorus", bars: 8 },
    ]);
    expect(formBarsOf(LEARNER)).toBe(28);
  });

  test("a track that rests in a section takes the type from another track", () => {
    const code = [
      "drums: arrange([4, silence], [4, drumsChorus])",
      "mel: arrange([4, melVerse], [4, melChorus])",
    ].join("\n");
    expect(learnerSectionsOf(code)?.map((s) => s.type)).toEqual(["verse", "chorus"]);
  });

  test("no sections, an unreadable section, or two tracks that disagree: none", () => {
    expect(learnerSectionsOf('mel: n("0 2 4").s("piano")')).toBeNull();
    expect(learnerSectionsOf("mel: arrange([4, melVerse.fast(2)])")).toBeNull();
    expect(
      learnerSectionsOf(
        "mel: arrange([4, melVerse], [4, melChorus])\nbass: arrange([4, bassVerse], [8, bassChorus])",
      ),
    ).toBeNull();
    // A commented-out arrange is not code.
    expect(learnerSectionsOf('// mel: arrange([4, melVerse])\nmel: n("0")')).toBeNull();
  });
});

describe("rewriting the Band", () => {
  test("every Band arrange() takes the learner's order and lengths, section by type", () => {
    const out = followLearnerForm(BAND, LEARNER);
    expect(out).toContain(
      "drums: arrange([8, drumsVerse], [4, drumsChorus], [8, drumsVerse], [8, drumsChorus])",
    );
    expect(out).toContain(
      "bass: arrange([8, bassVerse], [4, bassChorus], [8, bassVerse], [8, bassChorus]).lpf(800)",
    );
    // The section consts are untouched.
    expect(out.split("\n").slice(0, 4)).toEqual(BAND.split("\n").slice(0, 4));
  });

  test("unknown section types fall back to a kin section, then to the Band's first", () => {
    const learner = "mel: arrange([2, melIntro], [4, melHook], [4, melBridge], [2, melOutro])";
    const out = followLearnerForm(BAND, learner);
    expect(out).toContain(
      "drums: arrange([2, drumsVerse], [4, drumsChorus], [4, drumsVerse], [2, drumsVerse])",
    );
  });

  test("the Band keeps its own form without learner sections, and a Band without sections is untouched", () => {
    expect(followLearnerForm(BAND, 'mel: n("0 2 4").s("piano")')).toBe(BAND);
    const loop = 'drums: s("bd sd")\nbass: n("-14").scale("{{key}}")';
    expect(followLearnerForm(loop, LEARNER)).toBe(loop);
  });

  test("bandCodeFor applies the form after the key and before the register fold", () => {
    const setup: BandSetup = {
      band: "band.sections" as never,
      flavour: "flavour.pop" as never,
      code: BAND.replaceAll("{{key}}", "A4:minor"),
      followsLearnerKey: false,
      tracks: ["drums", "bass"],
    };
    const code = bandCodeFor(setup, {
      key: { tonic: "A", mode: "minor" } as never,
      defaultBpm: 96,
      learnerCode: LEARNER,
    });
    expect(code).toContain(
      "drums: arrange([8, drumsVerse], [4, drumsChorus], [8, drumsVerse], [8, drumsChorus])",
    );
    expect(code).toContain('.scale("A3:minor")'); // folded: A sits below C
  });

  test("played: the Band's chorus sounds exactly under the learner's chorus bars", async () => {
    const band = followLearnerForm(BAND, LEARNER).replaceAll("{{key}}", "C4:major");
    const r = await evalHeadless(`setcpm(100/4)\n${band}\n${LEARNER}`, 28);
    const barsWith = (track: string, pred: (v: Record<string, unknown>) => boolean) =>
      [
        ...new Set(
          r.events.filter((e) => e.track === track && pred(e.value)).map((e) => Math.floor(e.onset)),
        ),
      ].sort((a, b) => a - b);
    const chorusBars = [
      ...Array.from({ length: 4 }, (_, i) => 8 + i),
      ...Array.from({ length: 8 }, (_, i) => 20 + i),
    ];
    expect(barsWith("drums", (v) => v.s === "oh")).toEqual(chorusBars);
    expect(barsWith("drums", (v) => v.s === "hh")).toEqual(
      Array.from({ length: 28 }, (_, i) => i).filter((b) => !chorusBars.includes(b)),
    );
    // Sections restart (contracts §6.3 item 7): the second verse's bass starts on its first root again.
    const bassAt = (bar: number) =>
      r.events.filter((e) => e.track === "bass" && Math.floor(e.onset) === bar).map((e) => e.midi);
    expect(bassAt(12)).toEqual(bassAt(0));
    expect(bassAt(20)).toEqual(bassAt(8));
  });
});
