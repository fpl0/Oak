import { describe, expect, test } from "bun:test";
import { fileProblem as kitFileProblem } from "../ui/kit/model.ts";
import { AUDIO_ACCEPT, AUDIO_KINDS, checklistProgress, fileProblem, selfScoreOf, titleOf } from "./import.ts";

describe("own audio in", () => {
  test("files are checked before anything is stored", () => {
    expect(fileProblem({ name: "take.wav", size: 1000, type: "audio/wav" })).toBeNull();
    expect(fileProblem({ name: "take.m4a", size: 1000, type: "" })).toBeNull();
    expect(fileProblem({ name: "notes.txt", size: 10, type: "text/plain" })).toContain("doesn't look like");
    expect(fileProblem({ name: "x.wav", size: 0, type: "audio/wav" })).toBe("That file is empty.");
    expect(fileProblem({ name: "x.wav", size: 400 * 1024 * 1024, type: "audio/wav" })).toContain(
      "limit is 300 MB",
    );
  });
  test("titles", () => {
    expect(titleOf("my_song  take 2.mp3")).toBe("my song take 2");
    expect(titleOf(".wav")).toBe("Untitled recording");
  });
  test("the self score is the mean of the answered rows", () => {
    expect(selfScoreOf({})).toBeNull();
    expect(selfScoreOf({ contour: 2, rhythm: 1 })).toBe(0.75);
    expect(selfScoreOf({ contour: 2, rhythm: 2, landing: 2, bass: 2, chords: 2 })).toBe(1);
    expect(checklistProgress({ contour: 0, other: 2 })).toEqual({ answered: 1, total: 5 });
  });
});

describe("the kit's drop zone with Transcribe's rules (c12)", () => {
  const kit = (name: string, type: string) =>
    kitFileProblem(
      { name, size: 1000, type },
      { accept: AUDIO_ACCEPT, maxBytes: 300 * 1024 * 1024, kinds: AUDIO_KINDS },
    );
  test("audio files pass, by type or by extension", () => {
    expect(kit("take.wav", "audio/wav")).toBeNull();
    expect(kit("take.m4a", "")).toBeNull();
    expect(kit("phone.mp4", "video/mp4")).toBeNull();
    expect(kit("demo.AIFF", "")).toBeNull();
  });
  test("anything else is refused with the kinds named", () => {
    expect(kit("notes.txt", "text/plain")?.message).toContain(AUDIO_KINDS);
  });
});
