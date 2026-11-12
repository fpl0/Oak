// Staff-input drill trials: the staff value the reveal writes is graded right by the engine, a wrong note or a
// wrong length is not, and the code a staff answer becomes plays the same notes in Strudel (headless).
import { describe, expect, test } from "bun:test";
import type { FamilyDef, Trial } from "@oak/api";
import { createRegistry, DEFAULT_PROFILE, generateTrial, gradeTrial } from "@oak/drills";
import { midisOf } from "@oak/grader/testing";
import { families } from "../../../content/families.ts";
import { surfaceOf } from "./model.ts";
import { answerEvents, expectedStaffValue, staffAnswer, staffSpecOf, staffToCode } from "./staff.ts";

const registry = createRegistry(families, []);
const def = (id: string) => families.find((f) => f.id === id) as FamilyDef;

function trialAt(familyId: string, level: number, seed: number): Trial {
  const d = def(familyId);
  const cats = d.levels[level - 1]?.categories ?? [];
  return generateTrial(
    registry.family(familyId as never),
    { index: 0, family: familyId as never, level, category: cats[seed % cats.length] as string, seed },
    DEFAULT_PROFILE,
    cats,
  ) as Trial;
}

const grade = (t: Trial, value: string) =>
  gradeTrial(
    registry.family(t.family as never),
    t,
    { answer: staffAnswer(t, value), rtMs: 1000, replays: 0 },
    DEFAULT_PROFILE,
  );

describe("melodic dictation on the staff (levels 7–9)", () => {
  for (const level of [7, 8, 9]) {
    test(`level ${level}: the staff widget, the key signature, and the written answer grades right`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const t = trialAt("fam.mel.dictation", level, seed);
        const surface = surfaceOf(t, def("fam.mel.dictation"));
        expect(surface.kind === "widget" && surface.spec.ui).toBe("staff-input");
        const spec = staffSpecOf(t);
        expect(spec.bars).toBe(Number(t.params.answerBars));
        expect(spec.key?.tonic).toBe((t.params.answerKey as { key: { tonic: string } }).key.tonic);
        const value = expectedStaffValue(t) as string;
        expect(value).toBeTruthy();
        const r = grade(t, value);
        expect(r.correct).toBe(true);
        expect(r.credit).toBeCloseTo(1, 6);
      }
    });
  }

  test("one wrong pitch, or every note a quarter, is not right", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const t = trialAt("fam.mel.dictation", 8, seed);
      const value = expectedStaffValue(t) as string;
      const tokens = value.split(" ");
      const i = tokens.findIndex((x) => !x.startsWith("r:"));
      const [name, dur] = (tokens[i] as string).split(":") as [string, string];
      const up = name.replace(/\d+$/, (o) => String(Number(o) + 1));
      const wrongPitch = [...tokens.slice(0, i), `${up}:${dur}`, ...tokens.slice(i + 1)].join(" ");
      expect(grade(t, wrongPitch).correct).toBe(false);
      const quarters = tokens
        .filter((x) => !x.startsWith("r:"))
        .map((x) => `${x.split(":")[0]}:4`)
        .join(" ");
      if (quarters !== value) expect(grade(t, quarters).correct).toBe(false);
    }
  });

  test("the code a staff answer becomes plays the trial's notes in Strudel", async () => {
    for (let seed = 1; seed <= 4; seed++) {
      const t = trialAt("fam.mel.dictation", 7, seed);
      const code = staffToCode(expectedStaffValue(t) as string, Number(t.params.answerBars));
      expect(code).toMatch(/^note\("/);
      const heard = await midisOf(code as string, Number(t.params.answerBars));
      const want = answerEvents(t)
        .filter((e) => e.midi !== null)
        .sort(
          (a, b) =>
            a.onset[0] / a.onset[1] - b.onset[0] / b.onset[1] || (a.midi as number) - (b.midi as number),
        )
        .map((e) => e.midi);
      expect(heard).toEqual(want as number[]);
    }
  });

  test("an empty or unreadable staff is no answer", () => {
    const t = trialAt("fam.mel.dictation", 7, 1);
    expect(staffAnswer(t, "")).toBeNull();
    expect(staffAnswer(t, "Q9:4")).toBeNull();
  });
});

describe("rhythm dictation on the staff (levels 5–7)", () => {
  test("dotted and syncopated rhythms: onsets graded, the pitch is free", () => {
    for (const level of [5, 6]) {
      for (let seed = 1; seed <= 8; seed++) {
        const t = trialAt("fam.rhy.dictation", level, seed);
        const surface = surfaceOf(t, def("fam.rhy.dictation"));
        expect(surface.kind === "widget" && surface.spec.ui).toBe("staff-input");
        const spec = staffSpecOf(t);
        expect(spec.key).toBeUndefined();
        expect(spec.palette.accidentals).toBe(false);
        const value = expectedStaffValue(t) as string;
        expect(grade(t, value).correct).toBe(true);
        // Any pitch: the same rhythm on G4 is still right.
        expect(grade(t, value.replace(/B4/g, "G4")).correct).toBe(true);
      }
    }
  });
});
