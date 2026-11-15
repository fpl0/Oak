// Wave 7: the jazz track's sung lines — the ii–V–I guide tones in every key, tensions over a chord, the roots under
// a walking bass — each graded by `gradeSung`, each wrong note named against its chord, each with a Quiet path.
import { describe, expect, test } from "bun:test";
import type { SingTolerance } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { FOURTHS_MAJOR, FOURTHS_MINOR, jazzBlues, twoFiveOne } from "@oak/theory";
import { gradeQuietPicks, guideToneQuietPicks } from "./colour-lines.ts";
import { frames, PROFILE, SING_TOL } from "./fixtures.test-data.ts";
import {
  gradeSungRoots,
  gradeSungTensions,
  JAZZ_SING_FEEDBACK,
  jazzSingText,
  roleOver,
  rootQuietPicks,
  tensionName,
  tensionQuietPicks,
  tensionTargets,
  twoFiveOneGuideTones,
  walkingRootTargets,
} from "./jazz-lines.ts";
import type { PitchFrame, SungTarget } from "./types.ts";

const tol = (over: Partial<SingTolerance> = {}): SingTolerance => ({
  ...SING_TOL,
  driftCompCents: 0,
  ...over,
});
const mod12 = (n: number) => ((n % 12) + 12) % 12;
/** Frames singing each target at `semis(i)` semitones (plus cents) from it; null: silent. */
function singing(targets: readonly SungTarget[], semis: (i: number) => number | null): PitchFrame[] {
  const end = Math.max(...targets.map((t) => t.off)) + 0.4;
  return frames(
    targets.map((t, i) => {
      const s = semis(i);
      return { midi: s === null ? null : t.midi + s, from: t.on, to: t.off };
    }),
    end,
  );
}
const pcsOfEach = async (code: string, n: number): Promise<number[][]> => {
  const r = await evalHeadless(code, n);
  return Array.from({ length: n }, (_, k) =>
    r.events
      .filter((e) => Math.floor(e.onset + 1e-9) === k && e.midi !== null)
      .map((e) => mod12(e.midi as number)),
  );
};

describe("the ii–V–I guide-tone line in every key", () => {
  test("major, all twelve keys: 3rd, 7th, 3rd, moving by a step or staying; every note a guide tone Strudel plays", async () => {
    for (const tonic of FOURTHS_MAJOR) {
      const line = twoFiveOneGuideTones({ tonic, chordSec: 1, profile: PROFILE });
      expect(line.map((t) => t.role)).toEqual(["third", "seventh", "third"]);
      expect(line.map((t) => t.move)).toEqual([0, 0, -1]);
      for (const t of line) {
        expect(t.midi).toBeGreaterThanOrEqual(PROFILE.comfLow - 1);
        expect(t.midi).toBeLessThanOrEqual(PROFILE.comfHigh + 6);
      }
      const { symbols } = twoFiveOne(tonic);
      const strudel = await pcsOfEach(`chord("<${symbols.join(" ")}>").dict("guidetones").voicing()`, 3);
      for (const [k, t] of line.entries()) expect(strudel[k]).toContain(mod12(t.midi));
    }
  });

  test("minor, all twelve keys: Dm7♭5 G7alt Cm7 — F, F, E♭ in C; the minor 3rd lands a whole step down", () => {
    for (const tonic of FOURTHS_MINOR) {
      const line = twoFiveOneGuideTones({ tonic, mode: "minor", chordSec: 1 });
      expect(line.map((t) => t.role)).toEqual(["third", "seventh", "third"]);
      expect(line.map((t) => t.move)).toEqual([0, 0, -2]);
    }
    const c = twoFiveOneGuideTones({ tonic: "C", mode: "minor", chordSec: 1 });
    expect(c.map((t) => t.name)).toEqual(["F", "F", "Eb"]);
    const b9 = twoFiveOneGuideTones({ tonic: "D", mode: "minor", dominant: "7b9", chordSec: 1 });
    expect(b9.map((t) => t.chord)).toEqual(["Em7♭5", "A7♭9", "Dm7"]);
    expect(b9.map((t) => t.name)).toEqual(["G", "G", "F"]);
  });

  test("from the 7th: C, B, B in C; repeated twice it keeps the thread; its Quiet path picks the tones", () => {
    const line = twoFiveOneGuideTones({ tonic: "C", start: "seventh", chordSec: 1.5, repeat: 2, startAt: 2 });
    expect(line.map((t) => t.name)).toEqual(["C", "B", "B", "C", "B", "B"]);
    expect(line[3]?.move).toBe(1);
    expect(line[1]?.on).toBe(3.5);
    const picks = guideToneQuietPicks(line);
    expect(
      gradeQuietPicks(
        picks,
        picks.map((p) => p.correct),
      ),
    ).toMatchObject({ pass: true, modality: "fallback" });
    expect(
      gradeQuietPicks(
        picks,
        picks.map((p) => (p.correct + 1) % p.options.length),
      ).pass,
    ).toBe(false);
  });
});

describe("tensions over a chord", () => {
  const targets = tensionTargets({
    items: [
      { chord: "Dm7", tension: "9" },
      { chord: "G7", tension: "13" },
      { chord: "C^7", tension: "9" },
    ],
    chordSec: 2,
    startAt: 1,
    profile: PROFILE,
  });

  test("the 9 of Dm7 is E, the 13 of G7 is E, the 9 of Cmaj7 is D — the notes Strudel's ninth and thirteenth chords hold", async () => {
    expect(targets.map((t) => [t.chord, t.role, t.name])).toEqual([
      ["Dm7", "the 9", "E"],
      ["G7", "the 13", "E"],
      ["Cmaj7", "the 9", "D"],
    ]);
    const strudel = await pcsOfEach(`chord("<Dm9 G13 C^9>").voicing()`, 3);
    for (const [k, t] of targets.entries()) expect(strudel[k]).toContain(mod12(t.midi));
    expect(targets.every((t) => t.neighbours?.length === 2)).toBe(true);
  });

  test("spelled from the root: the ♭9 of A is B♭, the ♯11 of F♯ is B♯, the ♭13 of B♭ is G♭", () => {
    expect(tensionName("A", "b9")).toBe("Bb");
    expect(tensionName("F#", "#11")).toBe("B#");
    expect(tensionName("Bb", "b13")).toBe("Gb");
    expect(tensionName("Eb", "9")).toBe("F");
    expect(() => tensionName("H", "9")).toThrow(RangeError);
  });

  test("sung on the tensions: passes; three other right takes pass (in tune, a little flat, a little sharp)", () => {
    for (const cents of [0, -0.2, 0.25, 0.1]) {
      const r = gradeSungTensions(
        singing(targets, () => cents),
        targets,
        tol(),
        PROFILE,
      );
      expect(r.pass).toBe(true);
      expect(r.line.every((n) => n.right)).toBe(true);
    }
  });

  test("the root sung for the 9 fails and is named a whole step below", () => {
    const r = gradeSungTensions(
      singing(targets, (i) => (i === 0 ? -2 : 0)),
      targets,
      tol(),
      PROFILE,
    );
    const d = r.diagnostics.find((x) => x.id === "sing.tension");
    expect(d).toBeDefined();
    expect(jazzSingText(d as never)).toBe(
      "Note 1, over Dm7: you sang the root (D), a whole step below the 9 (E).",
    );
    expect(r.line[0]).toMatchObject({ sang: "the root", right: false });
  });

  test("the right idea, the wrong note: the ♭7 sung for the 13 of G7 (a half step above) earns nothing, and is named", () => {
    const r = gradeSungTensions(
      singing(targets, (i) => (i === 1 ? 1 : 0)),
      targets,
      tol(),
      PROFILE,
    );
    expect(r.notes[1]?.credit).toBe(0);
    expect(r.pass).toBe(false);
    expect(jazzSingText(r.diagnostics.find((x) => x.id === "sing.tension") as never)).toBe(
      "Note 2, over G7: you sang the 7th (F), a half step above the 13 (E).",
    );
  });

  test("a chord tone held instead of every tension fails the line", () => {
    const r = gradeSungTensions(
      singing(targets, (i) => [3 - 2, -2, 2][i] ?? 0),
      targets,
      tol(),
      PROFILE,
    );
    expect(r.pass).toBe(false);
    expect(r.line.map((n) => n.sang)).toEqual(["the 3rd", "the 5th", "the 3rd"]);
  });

  test("Quiet mode: pick the tension among the chord's tones", () => {
    const picks = tensionQuietPicks(targets);
    expect(picks[0]?.prompt).toBe("Over Dm7: the 9");
    expect(picks[0]?.options.map((o) => o.label)).toEqual(["7th", "root", "9", "3rd", "5th"]);
    expect(picks[0]?.options[picks[0].correct]?.sub).toBe("E");
    expect(
      gradeQuietPicks(
        picks,
        picks.map((p) => p.correct),
      ).pass,
    ).toBe(true);
  });

  test("what a note is over a chord", () => {
    expect(roleOver("Dm7", 5)).toBe("the 3rd");
    expect(roleOver("C7", 3)).toBe("the ♯9");
    expect(roleOver("Bm7b5", 5)).toBe("the 5th");
    expect(roleOver("C^7", 6)).toBe("the ♯11");
    expect(roleOver("C6", 9)).toBe("the 6th");
    expect(roleOver("G7", 4)).toBe("the 13");
    expect(roleOver("C^7", 11)).toBe("the 7th");
  });
});

describe("the roots under a walking bass", () => {
  const blues = jazzBlues("F").map((bar) => bar[0] as string);
  const roots = walkingRootTargets({ chords: blues, chordSec: 2, profile: PROFILE });

  test("one root a chord, the smallest leap, inside the comfort range", () => {
    expect(roots.map((r) => r.name)).toEqual(["F", "Bb", "F", "C", "Bb", "B", "F", "D", "G", "C", "F", "G"]);
    for (const r of roots) {
      expect(r.midi).toBeGreaterThanOrEqual(PROFILE.comfLow);
      expect(r.midi).toBeLessThanOrEqual(PROFILE.comfHigh);
      expect(mod12(r.midi)).toBe(mod12(r.chordId.rootPc));
    }
    expect(roots[1]?.move).toBe(5);
  });

  test("sung roots pass; three other right takes pass (flat, sharp, and an octave up where the voice lies)", () => {
    for (const s of [0, -0.25, 0.2, 12]) {
      const r = gradeSungRoots(
        singing(roots, () => s),
        roots,
        tol(),
        PROFILE,
      );
      expect(r.pass).toBe(true);
    }
  });

  test("the 3rd sung over D7 fails the note and is named", () => {
    const r = gradeSungRoots(
      singing(roots, (i) => (i === 7 ? 4 : 0)),
      roots,
      tol(),
      PROFILE,
    );
    expect(r.notes[7]?.credit).toBe(0);
    expect(jazzSingText(r.diagnostics.find((x) => x.id === "sing.root") as never)).toBe(
      "Note 8, over D7: you sang the 3rd (F#). The bass walks from the root, D.",
    );
  });

  test("the right idea, the wrong line: the guide tones sung where the roots are asked fail", () => {
    const r = gradeSungRoots(
      singing(roots, (i) => (i % 2 === 0 ? 4 : 10)),
      roots,
      tol(),
      PROFILE,
    );
    expect(r.pass).toBe(false);
  });

  test("nothing sung: missed, no credit, no pass", () => {
    const r = gradeSungRoots(
      singing(roots, () => null),
      roots,
      tol(),
      PROFILE,
    );
    expect(r.pass).toBe(false);
    expect(r.line.every((n) => n.sang === null)).toBe(true);
  });

  test("Quiet mode: pick the root among the chord's tones", () => {
    const picks = rootQuietPicks(roots);
    expect(picks[7]?.prompt).toBe("Over D7: the root");
    expect(picks[7]?.options[picks[7].correct]?.sub).toBe("D");
    expect(
      gradeQuietPicks(
        picks,
        picks.map((p) => p.correct),
      ),
    ).toMatchObject({ pass: true, modality: "fallback" });
  });
});

test("every id this module adds has a text", () => {
  expect(Object.keys(JAZZ_SING_FEEDBACK).sort()).toEqual(["sing.root", "sing.tension"]);
  expect(jazzSingText({ id: "sing.missed", params: {} })).toBeNull();
});
