import { describe, expect, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import type { PitchFrame } from "@oak/pitch";
import { draftLine, draftNotes, draftOfTake, type HumPlan, withDraft } from "./hum.ts";

const HOP = 1 / 94;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Frames of a sung line: each note `[midi, beats]`, with a short breath between notes. */
function take(notes: [number, number][], bpm: number, from: number, cents = 0): PitchFrame[] {
  const beat = 60 / bpm;
  const out: PitchFrame[] = [];
  let t = from;
  for (const [midi, beats] of notes) {
    const end = t + beats * beat;
    for (let x = t; x < end - 0.06; x += HOP)
      out.push({ t: x, hz: hz(midi + cents / 100), clarity: 0.97, rms: 0.12 });
    for (let x = Math.max(t, end - 0.06); x < end; x += HOP)
      out.push({ t: x, hz: 0, clarity: 0, rms: 0.0005 });
    t = end;
  }
  return out;
}

const profile = { rangeLow: 48, noiseFloorDb: -60, singLatencyMs: 0 };
const plan: HumPlan = {
  key: { tonic: "G", mode: "major" },
  bpm: 96,
  meter: "4/4",
  bars: 2,
  target: "melody",
};

describe("hum it, Oak drafts it", () => {
  test("a sung line becomes a draft in the project's key, on the melody track", async () => {
    const frames = take(
      [
        [67, 1],
        [69, 1],
        [71, 1],
        [67, 1],
        [74, 2],
        [67, 2],
      ],
      96,
      1,
    );
    const { draft } = draftOfTake(frames, plan, profile, 1);
    expect(draft.machineMade).toBe(true);
    expect(draft.scale).toBe("G4:major");
    expect(draft.line.startsWith("melody: n(")).toBe(true);
    const code = `setcpm(96/4)\n${draftLine(draft, "melody")}`;
    const out = await evalHeadless(code, 2);
    expect(out.events.map((e) => e.midi)).toEqual([67, 69, 71, 67, 74, 67]);
    expect(out.events.map((e) => e.s)).toEqual(Array(6).fill("piano"));
  });

  test("a bass line hummed high is drafted at octave 2 on the bass track", async () => {
    const frames = take(
      [
        [55, 2],
        [62, 2],
      ],
      96,
      0.5,
    );
    const { draft } = draftOfTake(frames, { ...plan, bars: 1, target: "bass" }, profile, 0.5);
    const out = await evalHeadless(`setcpm(96/4)\n${draftLine(draft, "bass")}`, 1);
    expect(out.tracks).toEqual(["bass"]);
    expect(out.events.map((e) => e.midi)).toEqual([43, 50]);
  });

  test("sharp singing is allowed for and said", () => {
    const frames = take(
      [
        [67, 2],
        [71, 2],
      ],
      96,
      1,
      30,
    );
    const { draft } = draftOfTake(frames, { ...plan, bars: 1 }, profile, 1);
    expect(draft.notes.map((n) => n.midi)).toEqual([67, 71]);
    expect(draftNotes(draft).join(" ")).toContain("sharp");
  });

  test("an empty take says so", () => {
    const { draft } = draftOfTake([], plan, profile, 0);
    expect(draftNotes(draft)[0]).toContain("No clear notes");
  });

  test("the draft replaces the line of its label, or joins the code", () => {
    const code = 'setcpm(96/4)\n\nmelody: n("0").scale("G4:major").s("piano")\n';
    expect(withDraft(code, 'melody: n("0 2").s("piano")', "setcpm(96/4)")).toBe(
      'setcpm(96/4)\n\nmelody: n("0 2").s("piano")\n',
    );
    expect(withDraft('bass: n("0")', 'melody: n("4")', "setcpm(80/4)")).toBe(
      'setcpm(80/4)\nbass: n("0")\nmelody: n("4")\n',
    );
    expect(withDraft("", 'melody: n("4")', "setcpm(80/4)")).toBe('setcpm(80/4)\n\nmelody: n("4")\n');
  });
});
