import { describe, expect, test } from "bun:test";
import { deleteQuestion, ownAudioRows, ownAudioTotal, sizeFromContentRange } from "./own-audio.ts";

const A = "a".repeat(64);
const B = "b".repeat(64);
const items = [
  {
    id: "t1",
    title: "Take on me",
    sourceKind: "own-audio" as const,
    audioId: A,
    updatedAt: "2026-11-10T10:00:00Z",
  },
  {
    id: "t2",
    title: "Ladder L1",
    sourceKind: "generated" as const,
    audioId: null,
    updatedAt: "2026-11-11T10:00:00Z",
  },
  {
    id: "t3",
    title: "Second pass",
    sourceKind: "own-audio" as const,
    audioId: A,
    updatedAt: "2026-11-12T10:00:00Z",
  },
  {
    id: "t4",
    title: "Voice memo",
    sourceKind: "own-audio" as const,
    audioId: B,
    updatedAt: "2026-11-09T10:00:00Z",
  },
  {
    id: "t5",
    title: "Gone",
    sourceKind: "own-audio" as const,
    audioId: null,
    updatedAt: "2026-11-08T10:00:00Z",
  },
];

describe("own audio in Settings › Data", () => {
  test("rows: own-audio projects with a recording, newest first, shared recordings noted", () => {
    const rows = ownAudioRows(items, { [A]: 1000, [B]: 250 });
    expect(rows.map((r) => r.projectId)).toEqual(["t3", "t1", "t4"]);
    expect(rows.map((r) => r.sharedWith)).toEqual([1, 1, 0]);
    expect(rows[2]?.bytes).toBe(250);
  });

  test("the total counts each recording once; unknown sizes are flagged", () => {
    expect(ownAudioTotal(ownAudioRows(items, { [A]: 1000, [B]: 250 }))).toEqual({
      files: 2,
      bytes: 1250,
      known: true,
    });
    expect(ownAudioTotal(ownAudioRows(items, { [A]: 1000 })).known).toBe(false);
    expect(ownAudioTotal([])).toEqual({ files: 0, bytes: 0, known: true });
  });

  test("Content-Range carries the whole size", () => {
    expect(sizeFromContentRange("bytes 0-0/48044")).toBe(48044);
    expect(sizeFromContentRange("bytes */12")).toBe(12);
    expect(sizeFromContentRange(null)).toBeNull();
    expect(sizeFromContentRange("garbage")).toBeNull();
  });

  test("the delete question names the project and what happens to the recording", () => {
    const [shared, , alone] = ownAudioRows(items, { [A]: 1000, [B]: 250 });
    if (!shared || !alone) throw new Error("rows");
    expect(deleteQuestion(alone, "250 B")).toBe(
      "Delete the transcription “Voice memo” and its recording (250 B)? Its code versions and notes go too. This cannot be undone; a backup you exported earlier still has it.",
    );
    expect(deleteQuestion(shared, "1000 B")).toContain(
      "the recording stays, because another project uses it",
    );
  });
});
