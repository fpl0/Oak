// Recorded-response tests for the three review kinds (contracts §10.6, §10.10; wave4.md §5.2, §5.6): a capstone
// review of one album version, a transcription review of the learner's own audio, and a listening note on a
// sketch. Each replays an API cassette through the composed server over HTTP and checks what was sent (high
// effort for reviews, the analysed facts so comments are anchored to real bars), what came back (the schema, no
// verdict), where it was stored, and that usage and the soft warning still count it.
import { afterEach, describe, expect, test } from "bun:test";
import {
  chunkJson,
  response,
  textBlock,
  thinkingBlock,
  toolUseBlock,
} from "./backends/api/cassettes/builders.ts";
import type { WireRequest } from "./backends/api/cassettes/fake-fetch.ts";
import { cassette } from "./backends/api/cassettes/scenarios.ts";
import { type CapstoneReview, VERDICT, validateCapstoneReview, validateListeningNote } from "./reviews.ts";
import type { AcceptedReview } from "./service-types.ts";
import { CASSETTE_KEY, type Composed, startComposed } from "./testing/composed.ts";
import { makePorts } from "./testing/fakes.ts";
import {
  OWN_AUDIO_REVIEW,
  OWN_AUDIO_SOURCE,
  SONG_REVIEW,
  SONG_REVIEW_SOURCE,
} from "./testing/wave4-fixtures.ts";

let c: Composed | undefined;
afterEach(() => {
  c?.stop();
  c = undefined;
});

const userText = (w: WireRequest | undefined) =>
  JSON.stringify(
    (w?.body.messages as { role: string }[] | undefined)?.filter((m) => m.role === "user") ?? [],
  );

describe("capstone review of one album version (C2)", () => {
  test("high effort, the facts in the context, the schema accepted, stored on that version", async () => {
    const stored: AcceptedReview[] = [];
    const ports = makePorts();
    ports.lessons.reviews.set("capstone:C2", SONG_REVIEW_SOURCE);
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "c2-review",
        response(
          "msg_r1",
          [
            thinkingBlock(0, ["Read the facts first."]),
            toolUseBlock(1, "toolu_r1", "submit_capstone_review", chunkJson(SONG_REVIEW, 40)),
          ],
          "tool_use",
          { usage: { input: 900, cacheWrite1h: 6000 }, output: 500 },
        ),
        response("msg_r2", [textBlock(0, ["Done."])], "end_turn"),
      ),
      over: { onReview: (r) => void stored.push(r) },
    });
    const res = await c.sse("/api/tutor/reviews/capstone", {
      thread: { subjectKind: "capstone", subjectId: "C2" },
      userText: "Is the ending strong enough?",
      albumTrackId: "trk-c2",
      albumVersion: 2,
    });
    expect(res.events).toContain("review");
    expect(res.events.at(-1)).toBe("done");

    // What was sent: high effort, the review budget, and the piece's facts as context lines.
    const first = c.wire[0];
    expect(first?.body.output_config).toEqual({ effort: "high" });
    expect(first?.body.max_tokens).toBe(32_000);
    const sent = userText(first);
    for (const line of [
      "review_target: album track trk-c2 version 2",
      "chords bar 3: Am (vi, T)",
      "chords bar 7: F (IV, PD) then G (V, D) on beat 3",
      "cadence: bar 8 authentic cadence (V to I, melody on 1)",
      "motif: mel bar 1 returns exact at bar 5",
      "range: mel C4-A4 (9 semitones), highest note in bar 6",
      "chord_tones_on_strong_beats: 100%",
      "rubric: Ends with a cadence (required): met",
    ])
      expect(sent).toContain(line);

    // What came back: exactly the review, every bar inside the 8-bar piece, no verdict anywhere.
    const frame = res.frames.find((f) => f.event === "review");
    expect(frame?.data).toEqual({ reviewKind: "capstone", review: SONG_REVIEW });
    const review = (frame?.data as { review: CapstoneReview } | undefined)?.review ?? SONG_REVIEW;
    for (const s of [...review.strengths, ...review.revisions]) expect(s.bars[1]).toBeLessThanOrEqual(8);
    expect(VERDICT.test(JSON.stringify(review))).toBe(false);

    // Stored on the version asked for, with the conversation that produced it.
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      reviewKind: "capstone",
      target: { kind: "album", trackId: "trk-c2", version: 2 },
      subject: { subjectKind: "capstone", subjectId: "C2" },
    });
    expect(stored[0]?.conversationId).toMatch(/^capstone:C2:\d{4}-\d{2}-\d{2}:review$/);
    expect(ports.notes.notes.map((n) => n.source)).toEqual(["review"]);
    // Usage: one row per model call, on the review lane.
    expect(ports.usage.rows.map((r) => r.lane)).toEqual(["review"]);
    expect(ports.usage.rows[0]?.usage.outputTokens).toBe(500);
  });

  test("a review that implies a verdict is refused with its problem, and the corrected one is accepted", async () => {
    const ports = makePorts();
    ports.lessons.reviews.set("capstone:C2", SONG_REVIEW_SOURCE);
    const verdict = { ...SONG_REVIEW, linerNote: "This track would pass the capstone with room to spare." };
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "c2-verdict",
        response(
          "msg_v1",
          [toolUseBlock(0, "toolu_v1", "submit_capstone_review", chunkJson(verdict, 40))],
          "tool_use",
        ),
        response(
          "msg_v2",
          [toolUseBlock(0, "toolu_v2", "submit_capstone_review", chunkJson(SONG_REVIEW, 40))],
          "tool_use",
        ),
        response("msg_v3", [textBlock(0, ["Delivered."])], "end_turn"),
      ),
    });
    const res = await c.sse("/api/tutor/reviews/capstone", {
      thread: { subjectKind: "capstone", subjectId: "C2" },
    });
    expect(res.events.filter((e) => e === "review")).toHaveLength(1);
    expect(userText(c.wire[1])).toContain("do not say or imply pass or fail");
    // Two model calls, both counted: a refused review still cost tokens.
    expect(ports.usage.rows.map((r) => r.lane)).toEqual(["review", "review"]);
  });

  test("the soft warning still fires once when a review takes the month past the marker", async () => {
    const ports = makePorts();
    ports.lessons.reviews.set("capstone:C2", SONG_REVIEW_SOURCE);
    ports.settings.value.softMonthlyUsd = 0.001;
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "c2-soft",
        response(
          "msg_s1",
          [toolUseBlock(0, "toolu_s1", "submit_capstone_review", chunkJson(SONG_REVIEW, 40))],
          "tool_use",
          {
            usage: { input: 2_000, cacheWrite1h: 6_000 },
            output: 2_000,
          },
        ),
        response("msg_s2", [textBlock(0, ["Done."])], "end_turn"),
      ),
    });
    const res = await c.sse("/api/tutor/reviews/capstone", {
      thread: { subjectKind: "capstone", subjectId: "C2" },
    });
    expect(res.events).toContain("notice");
    // The notice comes before the terminal event; the review is not blocked or changed by spending.
    expect(res.events.indexOf("notice")).toBeLessThan(res.events.indexOf("done"));
    expect(res.events).toContain("review");
    expect(ports.settings.value.softWarnedMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(ports.usage.rows.reduce((s, r) => s + (r.usage.costUsd ?? 0), 0)).toBeGreaterThan(0.001);
  });

  test("validation: bars outside the piece are refused, so every comment points at a real bar", () => {
    const off = { ...SONG_REVIEW, strengths: [SONG_REVIEW.strengths[0], { text: "A coda.", bars: [9, 10] }] };
    const check = validateCapstoneReview(off, { revisions: 1, totalBars: 8 });
    expect(check.ok).toBe(false);
    expect(check.ok ? [] : check.problems).toContain("strengths[1].bars: bar 10 is past the end (8 bars)");
    expect(validateCapstoneReview(SONG_REVIEW, { revisions: 1, totalBars: 8 }).ok).toBe(true);
  });
});

describe("transcription review of the learner's own audio", () => {
  test("code, checklist and facts only: no reference, no audio; stored for the version asked for", async () => {
    const stored: AcceptedReview[] = [];
    const ports = makePorts();
    ports.lessons.reviews.set("transcription:tr-1", OWN_AUDIO_SOURCE);
    ports.lessons.facts.set("transcription:tr-1", {
      tutorOpen: true,
      closedReason: null,
      title: "Kitchen radio song",
      released: null,
      transcriptionSource: "own-audio",
    });
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "own-audio-review",
        response(
          "msg_t1",
          [toolUseBlock(0, "toolu_t1", "submit_transcription_review", chunkJson(OWN_AUDIO_REVIEW, 40))],
          "tool_use",
        ),
        response("msg_t2", [textBlock(0, ["Done."])], "end_turn"),
      ),
      over: { onReview: (r) => void stored.push(r) },
    });
    const res = await c.sse("/api/tutor/reviews/transcription", {
      thread: { subjectKind: "transcription", subjectId: "tr-1" },
      transcriptionVersion: 3,
    });
    expect(res.frames.find((f) => f.event === "review")?.data).toEqual({
      reviewKind: "transcription",
      review: OWN_AUDIO_REVIEW,
    });
    const sent = userText(c.wire[0]);
    expect(c.wire[0]?.body.output_config).toEqual({ effort: "high" });
    expect(sent).toContain("review_target: transcription version 3");
    expect(sent).toContain("checklist: chords: 1/2");
    expect(sent).toContain("chords bar 3: Am (vi, T)");
    expect(sent).not.toContain("reference:");
    expect(stored[0]?.target).toEqual({ kind: "transcription", version: 3 });
  });

  test("a capstone target on a transcription review is a bad request", async () => {
    c = startComposed({ apiKey: CASSETTE_KEY });
    const res = await c.post("/api/tutor/reviews/transcription", {
      thread: { subjectKind: "transcription", subjectId: "tr-1" },
      albumTrackId: "trk",
      albumVersion: 1,
    });
    expect(res.status).toBe(400);
    const half = await c.post("/api/tutor/reviews/capstone", {
      thread: { subjectKind: "capstone", subjectId: "C2" },
      albumTrackId: "trk",
    });
    expect(half.status).toBe(400);
  });
});

describe("listening note on a sketch (the third kind)", () => {
  const NOTE =
    "Bar 2 lands on [[deg:5]] over [[chord:G]], so the loop leans forward. Bar 4 falls back to [[deg:1]]. What changes if bar 2 ends on [[deg:3]]?";

  test("low effort, two or three sentences citing bars; kept as a tutor note", async () => {
    const ports = makePorts();
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "note",
        response("msg_n1", [textBlock(0, [NOTE.slice(0, 40), NOTE.slice(40)])], "end_turn"),
      ),
    });
    const res = await c.sse("/api/tutor/note", {
      thread: { subjectKind: "sketch", subjectId: "sk-1" },
      learnerCode: 'chords: chord("<C G Am F>").s("piano")',
    });
    expect(res.events.at(-1)).toBe("done");
    expect(c.wire[0]?.body.output_config).toEqual({ effort: "low" });
    expect(res.text).toBe(NOTE);
    expect(validateListeningNote({ text: NOTE }).ok).toBe(true);
    expect(ports.notes.notes.map((n) => [n.source, n.text])).toEqual([["listening", NOTE]]);
    expect(ports.usage.rows.map((r) => r.lane)).toEqual(["note"]);
  });

  test("a note that claims to have heard audio or gives a verdict is shown but not remembered", async () => {
    const bad = "I heard the loop and it passes the check. Bar 2 is nice.";
    expect(validateListeningNote({ text: bad })).toMatchObject({ ok: false });
    const ports = makePorts();
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette("bad-note", response("msg_n2", [textBlock(0, [bad])], "end_turn")),
    });
    const res = await c.sse("/api/tutor/note", {
      thread: { subjectKind: "sketch", subjectId: "sk-1" },
      learnerCode: 'chords: chord("<C G>").s("piano")',
    });
    expect(res.text).toBe(bad);
    expect(ports.notes.notes).toEqual([]);
  });

  test("the schema: citations, sentence count, one question", () => {
    expect(validateListeningNote({ text: "Nice groove. Keep going." })).toMatchObject({
      ok: false,
      problems: ["text: cite at least one concrete bar, degree, chord or rhythm"],
    });
    expect(validateListeningNote({ text: "Bar 1 is home? Bar 2 leans? Why?" }).ok).toBe(false);
    // Musical verbs are not verdicts: a passing tone, a line that passes through 4.
    expect(VERDICT.test("The passing tone in bar 3 passes through 4 on its way to 3.")).toBe(false);
    expect(VERDICT.test("This passes Oak's check.")).toBe(true);
  });
});
