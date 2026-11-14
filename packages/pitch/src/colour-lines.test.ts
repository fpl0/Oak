// Wave 6: sung chromatic degrees (U15.L01), a mode's colour tone (U14) and a guide-tone line over a progression
// (U12.L05), each with its Quiet path. The grade is `gradeSung`'s; these tests pin the neighbour error.
import { describe, expect, test } from "bun:test";
import type { SingTolerance } from "@oak/content-kit";
import {
  COLOUR_FEEDBACK,
  chromaticTargets,
  colourFeedbackText,
  colourQuietPicks,
  explainColourResult,
  gradeGuideTones,
  gradeQuietPicks,
  guideToneQuietPicks,
  guideToneTargets,
  modalTargets,
} from "./colour-lines.ts";
import { analyze, frames, PROFILE, SING_TOL, SR } from "./fixtures.test-data.ts";
import { midiToHz } from "./math.ts";
import { gradeSung, neighbourSung } from "./sung.ts";
import { concat, silence, tone } from "./synth.ts";
import type { PitchFrame, SungTarget } from "./types.ts";

const tol = (over: Partial<SingTolerance> = {}): SingTolerance => ({
  ...SING_TOL,
  driftCompCents: 0,
  ...over,
});
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
const line = (degrees: readonly string[], dur = 0.6) =>
  degrees.map((degree, k) => ({ degree: degree as never, at: k * dur, dur: dur - 0.06 }));

describe("chromatic degrees", () => {
  // U15.L01's leaning notes in C: sol fi sol, la te la, mi si la.
  const targets = chromaticTargets({
    key: C,
    tonicMidi: 60,
    notes: line(["5", "#4", "5", "6", "b7", "6", "3", "#5", "6"]),
    startAt: 1,
  });

  test("targets carry chromatic syllables, the key's own neighbours and where the note leans", () => {
    expect(targets.map((t) => t.midi)).toEqual([67, 66, 67, 69, 70, 69, 64, 68, 69]);
    expect(targets.map((t) => t.syllable)).toEqual(["sol", "fi", "sol", "la", "te", "la", "mi", "si", "la"]);
    expect(targets.map((t) => t.colour)).toEqual([
      null,
      "chromatic",
      null,
      null,
      "chromatic",
      null,
      null,
      "chromatic",
      null,
    ]);
    // ♯4 in C sits between F and G; ♭7 between A and B; ♯5 between G and A.
    expect(targets[1]?.neighbours).toEqual([
      { midi: 65, kind: "diatonic" },
      { midi: 67, kind: "diatonic" },
    ]);
    expect(targets[1]?.resolvesTo).toEqual({ degree: "5", syllable: "sol", midi: 67 });
    expect(targets[4]?.resolvesTo).toEqual({ degree: "6", syllable: "la", midi: 69 });
    expect(targets[7]?.resolvesTo).toEqual({ degree: "6", syllable: "la", midi: 69 });
    expect(targets[0]?.neighbours).toBeUndefined();
  });

  test("the line sung in tune passes with every note credited", () => {
    const r = gradeSung(
      singing(targets, () => 8),
      targets,
      tol(),
      "degree",
      PROFILE,
    );
    expect(r.pass).toBe(true);
    expect(r.notes.every((n) => n.credit === 1 && n.neighbour === undefined)).toBe(true);
  });

  test("fa for fi, la for te, sol for si: each is the key's own note, earns nothing and is explained", () => {
    // The diatonic neighbour, sung cleanly: 100¢ off the target.
    const off: Record<number, number> = { 1: -100, 4: -100, 7: -100 };
    const raw = gradeSung(
      singing(targets, (i) => off[i] ?? 0),
      targets,
      tol(),
      "degree",
      PROFILE,
    );
    expect(raw.notes.map((n) => n.credit)).toEqual([1, 0, 1, 1, 0, 1, 1, 0, 1]);
    expect(raw.notes[1]?.neighbour).toEqual({ midi: 65, kind: "diatonic", cents: 0, credited: false });
    expect(raw.pass).toBe(false);
    const r = explainColourResult(raw, C, targets);
    const said = r.diagnostics.filter((d) => d.id === "sing.neighbour");
    expect(said.map((d) => [d.params.expDeg, d.params.expSyl, d.params.gotDeg, d.params.gotSyl])).toEqual([
      ["♯4", "fi", "4", "fa"],
      ["♭7", "te", "6", "la"],
      ["♯5", "si", "5", "sol"],
    ]);
    expect(said[0]?.params).toMatchObject({ dir: "above", leanDeg: "5", leanSyl: "sol", i: 2 });
    expect(colourFeedbackText(said[0] as NonNullable<(typeof said)[0]>)).toBe(
      "Note 2: you sang 4 (fa), the key's own note. ♯4 (fi) is a half step above it, leaning on to 5.",
    );
    // No "a little flat" line for a note that was another note.
    expect(r.diagnostics.some((d) => d.id === "sing.flat" || d.id === "sing.sharp")).toBe(false);
    expect(r.diagnostics.some((d) => d.id === "sing.wrong-note")).toBe(false);
  });

  test("without the neighbours the same take earns half credit as 'flat' and passes: the slip this closes", () => {
    const plain = targets.map(({ neighbours: _n, ...t }) => t);
    const off: Record<number, number> = { 1: -100 };
    // At the first rung of the ladder (±70¢) a clean fa for fi sits exactly on min(2T, 100).
    const wide = { ...PROFILE, singTolCents: 70 as const };
    const f = singing(targets, (i) => off[i] ?? 0);
    const before = gradeSung(f, plain, tol(), "degree", wide);
    expect(before.notes[1]?.credit).toBe(0.5);
    expect(before.notes[1]?.feedback).toBe("sing.flat");
    expect(before.pass).toBe(true);
    const after = gradeSung(f, targets, tol(), "degree", wide);
    expect(after.notes[1]?.credit).toBe(0);
    expect(after.notes[1]?.feedback).toBe("sing.wrong-note");
  });

  test("inside the tolerance the §8.1 credit stands, with a line when the pitch is nearer the neighbour", () => {
    const wide = { ...PROFILE, singTolCents: 70 as const };
    // fi sung 60¢ low: inside ±70, but nearer fa.
    const r = explainColourResult(
      gradeSung(
        singing(targets, (i) => (i === 1 ? -60 : 0)),
        targets,
        tol(),
        "degree",
        wide,
      ),
      C,
      targets,
    );
    expect(r.notes[1]?.credit).toBe(1);
    expect(r.notes[1]?.neighbour).toMatchObject({ midi: 65, credited: true });
    const d = r.diagnostics.find((x) => x.id === "sing.neighbour-close");
    expect(d?.severity).toBe("info");
    expect(colourFeedbackText(d as NonNullable<typeof d>)).toBe(
      "Note 2 (♯4) counted, but it was 60¢ flat: closer to 4 than to ♯4.",
    );
    expect(r.pass).toBe(true);
    // At ±50 the same pitch is outside the tolerance: it is fa.
    const tight = gradeSung(
      singing(targets, (i) => (i === 1 ? -60 : 0)),
      targets,
      tol(),
      "degree",
      PROFILE,
    );
    expect(tight.notes[1]?.credit).toBe(0);
  });

  test("a note between the target and its neighbour but nearer the target keeps the usual half credit", () => {
    const strict = { ...PROFILE, singTolCents: 35 as const };
    const r = gradeSung(
      singing(targets, (i) => (i === 1 ? -45 : 0)),
      targets,
      tol(),
      "degree",
      strict,
    );
    expect(r.notes[1]?.credit).toBe(0.5);
    expect(r.notes[1]?.feedback).toBe("sing.flat");
    expect(r.notes[1]?.neighbour).toBeUndefined();
  });

  test("a note sung as its neighbour is not read as drift", () => {
    // Three chromatic notes all sung as the note below: errors of −95¢ must not be 'compensated' away.
    const t3 = chromaticTargets({ key: C, tonicMidi: 60, notes: line(["#4", "b7", "#5"]), startAt: 0.5 });
    const r = gradeSung(
      singing(t3, () => -95),
      t3,
      tol({ driftCompCents: 100 }),
      "degree",
      PROFILE,
    );
    expect(r.notes.map((n) => n.credit)).toEqual([0, 0, 0]);
    expect(r.driftCents).toBe(0);
  });

  test("neighbourSung folds the neighbour into the target's octave", () => {
    expect(neighbourSung({ midi: 66, neighbours: [{ midi: 53, kind: "diatonic" }] }, -80)).toEqual({
      midi: 65,
      kind: "diatonic",
    });
    expect(neighbourSung({ midi: 66, neighbours: [{ midi: 65, kind: "diatonic" }] }, -40)).toBeNull();
    expect(neighbourSung({ midi: 66, neighbours: [{ midi: 65, kind: "diatonic" }] }, 80)).toBeNull();
    expect(neighbourSung({ midi: 66 }, -80)).toBeNull();
    // A third note: mi (E) for fi is not "fa", though fa lies between them.
    expect(neighbourSung({ midi: 66, neighbours: [{ midi: 65, kind: "diatonic" }] }, -180)).toBeNull();
    const t = chromaticTargets({ key: C, tonicMidi: 60, notes: line(["5", "#4", "5"]), startAt: 0.5 });
    const r = explainColourResult(
      gradeSung(
        singing(t, (i) => (i === 1 ? -200 : 0)),
        t,
        tol(),
        "degree",
        PROFILE,
      ),
      C,
      t,
    );
    expect(r.notes[1]?.neighbour).toBeUndefined();
    expect(r.diagnostics.find((d) => d.id === "sing.wrong-note")?.params).toMatchObject({
      gotDeg: "3",
      gotSyl: "mi",
      expDeg: "♯4",
    });
  });

  test("through the real detector: a voice singing sol fa sol against sol fi sol", () => {
    const t3 = chromaticTargets({ key: C, tonicMidi: 60, notes: line(["5", "#4", "5"], 0.7), startAt: 0.3 });
    const voice = (midi: number) =>
      tone({ hz: midiToHz(midi), seconds: 0.64, sampleRate: SR, amp: 0.3, wave: "voice", fade: 0.02 });
    const sig = concat([
      silence(0.3, SR, -70),
      voice(67),
      silence(0.06, SR, -70),
      voice(65),
      silence(0.06, SR, -70),
      voice(67),
      silence(0.5, SR, -70),
    ]);
    const r = explainColourResult(gradeSung(analyze(sig), t3, tol(), "degree", PROFILE), C, t3);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 0, 1]);
    expect(r.diagnostics.find((d) => d.id === "sing.neighbour")?.params).toMatchObject({
      gotDeg: "4",
      gotSyl: "fa",
      expDeg: "♯4",
      expSyl: "fi",
    });
  });
});

describe("a mode's colour tone", () => {
  test("Dorian: the raised 6 against the minor ♭6 (Drunken Sailor's colour)", () => {
    const D = { tonic: "D", mode: "dorian" as const };
    const t = modalTargets({ key: D, tonicMidi: 62, notes: line(["1", "5", "6", "5"]), startAt: 1 });
    expect(t.map((x) => x.midi)).toEqual([62, 69, 71, 69]);
    expect(t[2]).toMatchObject({ colour: "mode", syllable: "la", degree: "6" });
    expect(t[2]?.neighbours).toEqual([{ midi: 70, kind: "parallel" }]);
    expect(t[2]?.plain).toEqual({ scale: "D minor", degree: "b6", syllable: "le", midi: 70 });
    expect(t[0]?.neighbours).toBeUndefined();
    // B♭ for B: the plain minor scale's note.
    const r = explainColourResult(
      gradeSung(
        singing(t, (i) => (i === 2 ? -100 : 5)),
        t,
        tol(),
        "degree",
        PROFILE,
      ),
      D,
      t,
    );
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 0, 1]);
    const d = r.diagnostics.find((x) => x.id === "sing.plain-scale");
    expect(d?.params).toMatchObject({
      expDeg: "6",
      expSyl: "la",
      gotDeg: "♭6",
      gotSyl: "le",
      plain: "D minor",
      mode: "D Dorian",
      dir: "above",
    });
    expect(colourFeedbackText(d as NonNullable<typeof d>)).toBe(
      "Note 3: you sang ♭6 (le), the note of plain D minor. The colour of D Dorian is 6 (la), a half step above.",
    );
  });

  test("Mixolydian ♭7, Lydian ♯4 and Phrygian ♭2 each name the plain scale's note", () => {
    const cases = [
      {
        key: { tonic: "G", mode: "mixolydian" as const },
        tonic: 55,
        degree: "b7",
        plain: [66, "7", "G major"],
      },
      { key: { tonic: "F", mode: "lydian" as const }, tonic: 53, degree: "#4", plain: [58, "4", "F major"] },
      {
        key: { tonic: "E", mode: "phrygian" as const },
        tonic: 52,
        degree: "b2",
        plain: [54, "2", "E minor"],
      },
    ] as const;
    for (const c of cases) {
      const [t] = modalTargets({ key: c.key, tonicMidi: c.tonic, notes: line([c.degree]) });
      expect(t?.colour).toBe("mode");
      expect([t?.plain?.midi, t?.plain?.degree, t?.plain?.scale]).toEqual([...c.plain]);
      expect(t?.neighbours?.[0]?.kind).toBe("parallel");
    }
    // The leading tone for Mixolydian's ♭7 is a half step ABOVE the target: the colour is below what was sung.
    const G = cases[0].key;
    const t = modalTargets({ key: G, tonicMidi: 55, notes: line(["1", "b7", "1"]), startAt: 0.5 });
    const r = explainColourResult(
      gradeSung(
        singing(t, (i) => (i === 1 ? 100 : 0)),
        t,
        tol(),
        "degree",
        PROFILE,
      ),
      G,
      t,
    );
    expect(r.diagnostics.find((d) => d.id === "sing.plain-scale")?.params).toMatchObject({
      gotDeg: "7",
      gotSyl: "ti",
      expDeg: "♭7",
      expSyl: "te",
      dir: "below",
    });
  });

  test("a scale that is not a mode has no colour tone", () => {
    const t = modalTargets({ key: C, tonicMidi: 60, notes: line(["1", "4", "7"]) });
    expect(t.every((x) => x.colour === null && x.neighbours === undefined)).toBe(true);
  });
});

describe("a guide-tone line", () => {
  // ii7–V7–Imaj7 in C, a bar each at 60 BPM in 4/4 (4 s a chord would be long: two beats each here).
  const targets = guideToneTargets({ chords: ["Dm7", "G7", "C^7"], around: 64, startAt: 2, chordSec: 1.2 });

  test("the line from the 3rd is F F E, one note per chord, with the chord's other tones named", () => {
    expect(targets.map((t) => [t.chord, t.role, t.name, t.midi, t.move])).toEqual([
      ["Dm7", "third", "F", 65, 0],
      ["G7", "seventh", "F", 65, 0],
      ["Cmaj7", "third", "E", 64, -1],
    ]);
    expect(targets[0]?.on).toBe(2);
    expect(targets[1]?.on).toBeCloseTo(3.2, 9);
    expect(targets[0]?.off).toBeCloseTo(2 + 1.2 * 0.9, 9);
    expect(targets[0]?.other).toEqual({ role: "seventh", name: "C", midi: 60 });
    expect(targets[0]?.tones.map((x) => `${x.role}:${x.name}`)).toEqual([
      "root:D",
      "third:F",
      "fifth:A",
      "seventh:C",
    ]);
    // From the 7th: C B B.
    const from7 = guideToneTargets({
      chords: ["Dm7", "G7", "C^7"],
      start: "seventh",
      around: 60,
      chordSec: 1,
    });
    expect(from7.map((t) => t.name)).toEqual(["C", "B", "B"]);
    // Around the learner's comfort centre when a profile is given.
    const fitted = guideToneTargets({ chords: ["Dm7", "G7"], profile: PROFILE, chordSec: 1 });
    expect(Math.abs((fitted[0]?.midi ?? 0) - (PROFILE.comfLow + PROFILE.comfHigh) / 2)).toBeLessThanOrEqual(
      6,
    );
    expect(() => guideToneTargets({ chords: ["H7"], chordSec: 1 })).toThrow(RangeError);
  });

  test("sung in tune it passes, as a timed mode: one window per chord", () => {
    const r = gradeGuideTones(
      singing(targets, () => -6),
      targets,
      tol(),
      PROFILE,
    );
    expect(r.mode).toBe("guide-tones");
    expect(r.pass).toBe(true);
    expect(r.line.map((n) => n.sang)).toEqual(["third", "seventh", "third"]);
    expect(r.diagnostics).toEqual([]);
  });

  test("the roots sung instead: each note says which chord tone it was and which one the line takes", () => {
    // D, G, C: the bass line, an octave folded.
    const roots = [62, 67, 60];
    const f = frames(
      targets.map((t, i) => ({ midi: roots[i] as number, from: t.on, to: t.off })),
      6,
    );
    const r = gradeGuideTones(f, targets, tol(), PROFILE);
    expect(r.pass).toBe(false);
    expect(r.line.map((n) => n.sang)).toEqual(["root", "root", "root"]);
    const d = r.diagnostics.filter((x) => x.id === "sing.guide-tone");
    expect(d.length).toBe(3);
    expect(d[0]?.params).toMatchObject({ chord: "Dm7", gotRole: "root", got: "D", expRole: "3rd", exp: "F" });
    expect(colourFeedbackText(d[2] as NonNullable<(typeof d)[0]>)).toBe(
      "Note 3, over Cmaj7: you sang the root (C). The guide tone here is the 3rd (E).",
    );
  });

  test("the other guide tone: a warning by default, accepted with acceptOther", () => {
    // Over G7 the learner moves to B (the 3rd) instead of holding F (the 7th).
    const sung = [65, 59, 64];
    const f = frames(
      targets.map((t, i) => ({ midi: sung[i] as number, from: t.on, to: t.off })),
      6,
    );
    const strict = gradeGuideTones(f, targets, tol(), PROFILE);
    expect(strict.notes.map((n) => n.credit)).toEqual([1, 0, 1]);
    const d = strict.diagnostics.find((x) => x.id === "sing.guide-tone-other");
    expect(d?.severity).toBe("warn");
    expect(colourFeedbackText(d as NonNullable<typeof d>)).toBe(
      "Note 2, over G7: you sang the 3rd (B), the chord's other guide tone. This line takes the 7th (F), the smaller step.",
    );
    const lenient = gradeGuideTones(f, targets, tol(), PROFILE, { acceptOther: true });
    expect(lenient.notes.map((n) => n.credit)).toEqual([1, 1, 1]);
    expect(lenient.pass).toBe(true);
    expect(lenient.line[1]).toMatchObject({ sang: "third", swapped: true, role: "third" });
    expect(lenient.targets[1]).toMatchObject({ name: "B", role: "third" });
    // A root is never accepted in a guide tone's place.
    const roots = frames(
      targets.map((t, i) => ({ midi: [62, 67, 60][i] as number, from: t.on, to: t.off })),
      6,
    );
    expect(gradeGuideTones(roots, targets, tol(), PROFILE, { acceptOther: true }).pass).toBe(false);
  });

  test("a triad in the progression: the line takes its 3rd and offers no other", () => {
    const t = guideToneTargets({ chords: ["C", "Am7", "Dm7", "G7"], around: 64, chordSec: 1 });
    expect(t.map((x) => `${x.chord}:${x.role}:${x.name}`)).toEqual([
      "C:third:E",
      "Am7:seventh:G",
      "Dm7:third:F",
      "G7:seventh:F",
    ]);
    expect(t[0]?.other).toBeNull();
    expect(t[0]?.tones.length).toBe(3);
  });
});

describe("the Quiet path", () => {
  test("a chromatic line: pick the note among the key's own notes beside it", () => {
    const targets = chromaticTargets({ key: C, tonicMidi: 60, notes: line(["5", "#4", "5", "b7"]) });
    const picks = colourQuietPicks(targets, C);
    expect(picks.map((p) => p.index)).toEqual([1, 3]);
    expect(picks[0]?.options.map((o) => `${o.label} ${o.sub} ${o.midi}`)).toEqual([
      "4 fa 65",
      "♯4 fi 66",
      "5 sol 67",
    ]);
    expect(picks[0]?.correct).toBe(1);
    expect(picks[1]?.options.map((o) => o.label)).toEqual(["6", "♭7", "7"]);
    const right = gradeQuietPicks(picks, [1, 1]);
    expect(right).toMatchObject({ modality: "fallback", score: 1, pass: true });
    const wrong = gradeQuietPicks(picks, [0, null]);
    expect(wrong.pass).toBe(false);
    expect(wrong.score).toBe(0);
    expect(wrong.marks[0]).toMatchObject({ ok: false, picked: { label: "4" }, correct: { label: "♯4" } });
    expect(wrong.marks[1]?.picked).toBeNull();
  });

  test("a modal line: the colour tone beside the plain scale's note", () => {
    const D = { tonic: "D", mode: "dorian" as const };
    const picks = colourQuietPicks(modalTargets({ key: D, tonicMidi: 62, notes: line(["1", "6", "5"]) }), D);
    expect(picks.length).toBe(1);
    expect(picks[0]?.options.map((o) => `${o.id}:${o.label} ${o.sub}`)).toEqual([
      "plain:♭6 le",
      "target:6 la",
    ]);
    expect(picks[0]?.correct).toBe(1);
  });

  test("a guide-tone line: over each chord, which tone the line takes", () => {
    const targets = guideToneTargets({ chords: ["Dm7", "G7", "C^7"], around: 64, chordSec: 1 });
    const picks = guideToneQuietPicks(targets);
    expect(picks.map((p) => p.prompt)).toEqual(["Over Dm7", "Over G7", "Over Cmaj7"]);
    expect(picks.map((p) => p.options[p.correct]?.label)).toEqual(["the 3rd", "the 7th", "the 3rd"]);
    expect(picks[0]?.options.every((o) => Math.abs(o.midi - 65) <= 6)).toBe(true);
    const answers = picks.map((p) => p.correct);
    expect(gradeQuietPicks(picks, answers).pass).toBe(true);
    expect(gradeQuietPicks([], []).pass).toBe(false);
  });
});

test("every Wave 6 sung id has a catalog row", () => {
  expect(Object.keys(COLOUR_FEEDBACK).sort()).toEqual([
    "sing.guide-tone",
    "sing.guide-tone-other",
    "sing.neighbour",
    "sing.neighbour-close",
    "sing.plain-scale",
  ]);
  expect(colourFeedbackText({ id: "sing.missed", params: {} })).toBeNull();
});
