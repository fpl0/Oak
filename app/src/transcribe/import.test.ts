import { describe, expect, test } from "bun:test";
import { checklistProgress, fileProblem, selfScoreOf, titleOf } from "./import.ts";

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
