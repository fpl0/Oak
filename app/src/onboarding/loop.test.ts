import { describe, expect, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { ONBOARDING_LOOP as SPEC_LOOP } from "../../../content/specs/U00.ts";
import { toolbox } from "../../../content/toolbox.ts";
import {
  BUILD_BARS,
  editableRange,
  isChanged,
  LAYERS,
  lineRanges,
  melodyRange,
  mutedAt,
  ONBOARDING_LOOP,
  REACTIONS,
  readEdit,
  SLOT_MIDI,
  STARTER_VALUE,
  withEdit,
} from "./loop.ts";

describe("the onboarding loop", () => {
  test("is the unit spec's loop, character for character", () => {
    expect(ONBOARDING_LOOP).toBe(SPEC_LOOP);
  });

  test("the editable slot is the first number of the melody's last bar", () => {
    const r = editableRange(ONBOARDING_LOOP);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(ONBOARDING_LOOP.slice(r.from, r.to)).toBe("4");
    expect(ONBOARDING_LOOP.slice(r.from - 1, r.to + 7)).toBe("[4 ~ ~ ~]");
    expect(readEdit(ONBOARDING_LOOP)).toEqual({ text: "4", value: STARTER_VALUE });
  });

  test("reads what the learner typed and rejects anything but 0–7", () => {
    expect(readEdit(withEdit(ONBOARDING_LOOP, 6)).value).toBe(6);
    expect(readEdit(withEdit(ONBOARDING_LOOP, 0)).value).toBe(0);
    expect(readEdit(withEdit(ONBOARDING_LOOP, 9))).toEqual({ text: "9", value: null });
    expect(readEdit(withEdit(ONBOARDING_LOOP, "12"))).toEqual({ text: "12", value: null });
    expect(readEdit(withEdit(ONBOARDING_LOOP, ""))).toEqual({ text: "", value: null });
    expect(isChanged(4)).toBe(false);
    expect(isChanged(null)).toBe(false);
    expect(isChanged(6)).toBe(true);
  });

  test("lines are found by label", () => {
    const r = lineRanges(ONBOARDING_LOOP);
    expect(Object.keys(r).sort()).toEqual(["bass", "chords", "drums", "mel"]);
    expect(ONBOARDING_LOOP.slice(r.bass?.from, r.bass?.to)).toStartWith("bass: note(");
  });

  test("the build-up: drums, then bass in bar 2, chords in bar 3, the melody in bar 5", () => {
    expect(mutedAt(0)).toEqual(["bass", "chords", "mel"]);
    expect(mutedAt(1)).toEqual(["chords", "mel"]);
    expect(mutedAt(2)).toEqual(["mel"]);
    expect(mutedAt(3)).toEqual(["mel"]);
    expect(mutedAt(4)).toEqual([]);
    expect(BUILD_BARS).toBe(4);
  });

  test("each line's 'you will unlock this' lesson is the toolbox's", () => {
    const tool: Record<string, string> = { drums: "tb.s", bass: "tb.note", chords: "tb.chord", mel: "tb.n" };
    for (const l of LAYERS) {
      const entry = toolbox.find((t) => t.id === tool[l.id]);
      expect(entry?.unlock.at).toBe(l.unlockLesson as never);
    }
  });
});

describe("the reactions (verified against headless Strudel)", () => {
  test("there is one for each number from 0 to 7, calm and without exclamation marks", () => {
    for (let v = 0; v <= 7; v++) {
      const r = REACTIONS[v];
      expect(r).toBeDefined();
      expect(`${r?.title} ${r?.body} ${r?.listen}`).not.toContain("!");
      expect(r?.title.startsWith(String(v))).toBe(true);
    }
  });

  test("each number plays the note its reaction names, over the G chord of bar 4", async () => {
    const names = ["C", "D", "E", "F", "G", "A", "B", "C"];
    for (let v = 0; v <= 7; v++) {
      const res = await evalHeadless(withEdit(ONBOARDING_LOOP, v), 4);
      const last = res.events.filter((e) => e.track === "mel" && e.onset >= 3);
      expect(last.map((e) => e.midi)).toEqual([SLOT_MIDI[v] as number]);
      expect(REACTIONS[v]?.title).toContain(` ${names[v]}`);
      // Under it: the G chord (G B D) over a G in the bass.
      const chord = res.events
        .filter((e) => e.track === "chords" && e.onset === 3)
        .map((e) => (e.midi ?? 0) % 12);
      expect(new Set(chord)).toEqual(new Set([7, 11, 2]));
      const bass = res.events.find((e) => e.track === "bass" && e.onset === 3);
      expect((bass?.midi ?? 0) % 12).toBe(7);
    }
  });

  test("the claims about which notes belong to the chord under bar 4 hold", () => {
    const gChord = new Set([7, 11, 2]);
    const inChord = (v: number) => gChord.has((SLOT_MIDI[v] as number) % 12);
    expect(inChord(1)).toBe(true); // D "belongs to the sound underneath"
    expect(inChord(2)).toBe(false); // E "is not part of the sound under bar 4"
    expect(inChord(4)).toBe(true); // G "matches the bass note"
    expect(inChord(6)).toBe(true); // B sits under home (C), a semitone below
    expect((SLOT_MIDI[7] as number) - (SLOT_MIDI[6] as number)).toBe(1);
    expect((SLOT_MIDI[7] as number) - (SLOT_MIDI[0] as number)).toBe(12);
  });
});

test("Sketch 001 may change the whole melody pattern and nothing else", () => {
  const r = melodyRange(ONBOARDING_LOOP);
  expect(r && ONBOARDING_LOOP.slice(r.from, r.to)).toBe("[4 ~ 2 4] [0 ~ ~ 2] [5 ~ 3 5] [4 ~ ~ ~]");
});
