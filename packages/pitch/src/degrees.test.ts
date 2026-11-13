// Wave 5: sung steps and sung drill answers in minor (do-based syllables) and blue notes judged against the
// nearer of their two neighbouring semitones, within the normal tolerance (contracts §8.1; U10, U11.L03).
import { describe, expect, test } from "bun:test";
import type { SingTolerance } from "@oak/content-kit";
import {
  BLUE_DEGREES,
  blueNoteName,
  degreeSemitones,
  degreeTargets,
  degreeText,
  labelSungResult,
  markBlueNotes,
  sungDegree,
} from "./degrees.ts";
import { analyze, frames, PROFILE, SING_TOL, SR } from "./fixtures.test-data.ts";
import { blueBend, gradeSung } from "./sung.ts";
import { concat, silence, tone } from "./synth.ts";
import type { PitchFrame, SungTarget } from "./types.ts";

const tol = (over: Partial<SingTolerance> = {}): SingTolerance => ({
  ...SING_TOL,
  driftCompCents: 0,
  ...over,
});
const Am = { tonic: "A", mode: "minor" as const };
const C = { tonic: "C", mode: "major" as const };

/** Frames that sing each target at its pitch plus `cents(i)` (null: silent) inside its window. */
function singing(targets: readonly SungTarget[], cents: (i: number) => number | null): PitchFrame[] {
  const end = Math.max(...targets.map((t) => t.off)) + 0.4;
  return frames(
    targets.map((t, i) => {
      const c = cents(i);
      return { midi: c === null ? null : t.midi + c / 100, from: t.on, to: t.off };
    }),
    end,
  );
}

describe("degree targets in minor", () => {
  test("1 2 ♭3 4 5 ♭6 ♭7 in A minor, with do-based syllables; the raised 6 and 7 are la and ti", () => {
    const degrees = ["1", "2", "b3", "4", "5", "b6", "b7", "6", "7"] as const;
    const t = degreeTargets({
      key: Am,
      tonicMidi: 57,
      notes: degrees.map((degree, k) => ({ degree, at: k * 0.5, dur: 0.45 })),
      startAt: 10,
    });
    expect(t.map((x) => x.midi)).toEqual([57, 59, 60, 62, 64, 65, 67, 66, 68]);
    expect(t.map((x) => x.syllable)).toEqual(["do", "re", "me", "fa", "sol", "le", "te", "la", "ti"]);
    expect(t[2]).toMatchObject({ on: 11, off: 11.45, degree: "b3" });
    expect(t.every((x) => x.blue === undefined)).toBe(true);
    expect(degreeSemitones("b6")).toBe(8);
    expect(degreeSemitones("#4")).toBe(6);
    expect(degreeText("b3")).toBe("♭3");
    expect(() => degreeSemitones("9" as never)).toThrow(RangeError);
  });

  test("a sung minor phrase passes on ♭3 ♭6 ♭7, and a major 3 for ♭3 is a wrong note named in the key", () => {
    // 1 ♭3 5 ♭6 5 ♭7 1′ in A minor (a U10-style answer phrase), sight mode with onsets.
    const notes = (["1", "b3", "5", "b6", "5", "b7"] as const).map((degree, k) => ({
      degree,
      at: 0.2 + k * 0.6,
      dur: 0.5,
    }));
    const targets = degreeTargets({
      key: Am,
      tonicMidi: 57,
      notes: [...notes, { degree: "1", octave: 1, at: 0.2 + 6 * 0.6, dur: 0.5 }],
    });
    const good = gradeSung(
      singing(targets, (i) => (i % 2 ? 12 : -9)),
      targets,
      tol(),
      "pitch",
      PROFILE,
    );
    expect(good.pass).toBe(true);
    expect(good.notes.every((n) => n.credit === 1)).toBe(true);
    // The learner sings the major 3 (C♯) where the minor tune has ♭3 (C): a wrong note, said in the key's words.
    const wrong = gradeSung(
      singing(targets, (i) => (i === 1 ? 100 : 0)),
      targets,
      tol({ cents: 35 }),
      "pitch",
      PROFILE,
    );
    expect(wrong.notes[1]?.credit).toBe(0);
    const named = labelSungResult(wrong, Am);
    const d = named.diagnostics.find((x) => x.id === "sing.wrong-note");
    expect(d?.params).toMatchObject({ i: 2, expDeg: "♭3", expSyl: "me", gotDeg: "3", gotSyl: "mi" });
    expect(named.score).toBe(wrong.score);
  });

  test("sungDegree is do-based in minor and names blue notes in a blues key", () => {
    expect(sungDegree(60, Am)).toEqual({ degree: "b3", syllable: "me", text: "♭3" });
    expect(sungDegree(65.2, Am)).toEqual({ degree: "b6", syllable: "le", text: "♭6" });
    expect(sungDegree(67, Am).syllable).toBe("te");
    expect(sungDegree(68, Am).syllable).toBe("ti");
    expect(sungDegree(66, { tonic: "C", mode: "blues" }).text).toBe("♭5");
    expect(blueNoteName(63, C)).toEqual({ name: "flat three", syllable: "me" });
    expect(blueNoteName(64, C)).toBeNull();
    expect(BLUE_DEGREES).toEqual(["b3", "b5", "b7"]);
  });
});

describe("blue notes", () => {
  // C major, a blues line: 1 ♭3 4 ♭5 5 ♭7 (♭3 and ♭7 bend up, ♭5 either way).
  const line = (["1", "b3", "4", "b5", "5", "b7"] as const).map((degree, k) => ({
    degree,
    at: 0.2 + k * 0.6,
    dur: 0.5,
  }));
  const targets = degreeTargets({ key: C, tonicMidi: 60, notes: line, blues: true });

  test("markBlueNotes marks ♭3, ♭5 and ♭7 only, with their bend", () => {
    expect(targets.map((t) => t.blue ?? null)).toEqual([
      null,
      { toward: 1 },
      null,
      { toward: 0 },
      null,
      { toward: 1 },
    ]);
    const plain = markBlueNotes<SungTarget>([{ midi: 64, on: 0, off: 1 }], C);
    expect(plain[0]?.blue).toBeUndefined();
    expect(blueBend({ blue: { toward: 1 } }, 60)).toBe(1);
    expect(blueBend({ blue: { toward: 1 } }, -60)).toBeNull();
    expect(blueBend({ blue: { toward: 1 } }, 40)).toBeNull();
    expect(blueBend({ blue: { toward: 0 } }, -70)).toBe(-1);
    expect(blueBend({}, 70)).toBeNull();
  });

  test("a blue third between ♭3 and 3 is accepted for ♭3, and the feedback says so", () => {
    // ♭3 sung 60¢ sharp (nearer to 3 than to ♭3); everything else in tune.
    const r = gradeSung(
      singing(targets, (i) => (i === 1 ? 60 : 0)),
      targets,
      tol(),
      "pitch",
      PROFILE,
    );
    expect(r.notes[1]).toMatchObject({ credit: 1, feedback: null });
    expect(r.notes[1]?.cents).toBeCloseTo(60, 0);
    expect(r.notes[1]?.blue?.neighbourMidi).toBe(64);
    expect(r.notes[1]?.blue?.judgedCents).toBeCloseTo(-40, 0);
    const info = r.diagnostics.find((d) => d.id === "sing.blue-note");
    expect(info).toMatchObject({ severity: "info", dim: "pitch" });
    expect(info?.params).toMatchObject({ i: 2, exp: "D#4", toward: "E4", cents: 60, dir: "above" });
    expect(labelSungResult(r, C).diagnostics.find((d) => d.id === "sing.blue-note")?.params).toMatchObject({
      expDeg: "♭3",
      expSyl: "me",
      towardDeg: "3",
    });
    expect(r.pass).toBe(true);
    // A blue ♭5 named from its target, not re-spelled as ♯4 by the key.
    const b5 = gradeSung(
      singing(targets, (i) => (i === 3 ? -60 : 0)),
      targets,
      tol(),
      "pitch",
      PROFILE,
    );
    const named5 = labelSungResult(b5, C, targets).diagnostics.find((d) => d.id === "sing.blue-note");
    expect(named5?.params).toMatchObject({ expDeg: "♭5", expSyl: "se", towardDeg: "4", dir: "below" });
    // The ladder reads the judged error, so a bend does not count as singing out of tune.
    expect(r.medianAbsCents).toBeLessThan(10);
  });

  test("within the normal tolerance only: past the neighbour the usual credit bands apply to it", () => {
    // T = 50: 3 + 70¢ is 170¢ above ♭3 and 70¢ from 3: the half-credit band (sharp), not a blue credit.
    const half = gradeSung(
      singing(targets, (i) => (i === 1 ? 170 : 0)),
      targets,
      tol(),
      "pitch",
      PROFILE,
    );
    expect(half.notes[1]?.credit).toBe(0.5);
    expect(half.notes[1]?.feedback).toBe("sing.sharp");
    expect(half.diagnostics.some((d) => d.id === "sing.blue-note")).toBe(false);
    // 3 + 110¢ (a fourth, nearly): nothing.
    const r = gradeSung(
      singing(targets, (i) => (i === 1 ? 210 : 0)),
      targets,
      tol(),
      "pitch",
      PROFILE,
    );
    expect(r.notes[1]?.credit).toBe(0);
    expect(r.notes[1]?.feedback).toBe("sing.wrong-note");
  });

  test("♭3 bent DOWN toward 2 is not a blue third: judged against ♭3 alone", () => {
    const r = gradeSung(
      singing(targets, (i) => (i === 1 ? -70 : 0)),
      targets,
      tol(),
      "pitch",
      PROFILE,
    );
    expect(r.notes[1]?.blue).toBeUndefined();
    expect(r.notes[1]?.credit).toBe(0.5);
    expect(r.notes[1]?.feedback).toBe("sing.flat");
  });

  test("♭5 bends either way; ♭7 bends up; the same take without blue marks fails those notes", () => {
    const bent = (i: number) => (i === 3 ? -65 : i === 5 ? 55 : i === 1 ? 50 : 0);
    const r = gradeSung(singing(targets, bent), targets, tol(), "pitch", PROFILE);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(r.diagnostics.filter((d) => d.id === "sing.blue-note").length).toBe(2);
    const plain = targets.map(({ blue: _blue, ...t }) => t);
    const strict = gradeSung(singing(plain, bent), plain, tol({ cents: 25 }), "pitch", PROFILE);
    expect(strict.notes[3]?.credit).toBe(0);
    expect(strict.notes[5]?.credit).toBe(0);
  });

  test("a blue note does not pull drift compensation", () => {
    const withDrift = gradeSung(
      singing(targets, (i) => (i === 1 || i === 5 ? 60 : 12)),
      targets,
      tol({ driftCompCents: 30 }),
      "pitch",
      PROFILE,
    );
    expect(withDrift.driftCents).toBeCloseTo(12, 0);
  });

  test("end to end on audio: a sung blue third through the detector and tracker", () => {
    // ♭3 (E♭4) sung 65¢ sharp on a voice timbre (35¢ under E4), between two in-tune notes.
    const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
    const audio = concat([
      silence(0.2, SR, -70),
      tone({ hz: hz(60), seconds: 0.5, sampleRate: SR, wave: "voice", amp: 0.4, fade: 0.02 }),
      silence(0.1, SR, -70),
      tone({
        hz: hz(63.65),
        seconds: 0.5,
        sampleRate: SR,
        wave: "voice",
        amp: 0.4,
        vibratoCents: 10,
        fade: 0.02,
      }),
      silence(0.1, SR, -70),
      tone({ hz: hz(60), seconds: 0.5, sampleRate: SR, wave: "voice", amp: 0.4, fade: 0.02 }),
      silence(0.4, SR, -70),
    ]);
    const t = degreeTargets({
      key: C,
      tonicMidi: 60,
      blues: true,
      notes: [
        { degree: "1", at: 0.2, dur: 0.5 },
        { degree: "b3", at: 0.8, dur: 0.5 },
        { degree: "1", at: 1.4, dur: 0.5 },
      ],
    });
    const r = gradeSung(analyze(audio), t, tol(), "pitch", PROFILE);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1]);
    expect(r.diagnostics.some((d) => d.id === "sing.blue-note")).toBe(true);
  });
});
