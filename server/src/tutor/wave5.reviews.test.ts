// Recorded-response tests for the Wave 5 capstone reviews (contracts §10.6; wave5.md §5.2): C3, C4, C5 and X2,
// each replayed as an API cassette through the composed server over HTTP. They check what was sent (high effort, the
// analysed facts each review needs: sections and contrast, the energy curve, the progression per section, the
// 12-bar variant, swing, per-stage transcription accuracy), what came back (the schema, two revisions from C5 on,
// no verdict), where it was stored, and that usage and the soft warning still count it. A ladder L6 transcription
// review shows the hidden source never travels before a graded pass.
import { afterEach, describe, expect, test } from "bun:test";
import { chunkJson, response, textBlock, toolUseBlock } from "./backends/api/cassettes/builders.ts";
import type { WireRequest } from "./backends/api/cassettes/fake-fetch.ts";
import { cassette } from "./backends/api/cassettes/scenarios.ts";
import type { ReviewSource } from "./domain.ts";
import { type CapstoneReview, revisionCountFor, VERDICT, validateCapstoneReview } from "./reviews.ts";
import type { AcceptedReview } from "./service-types.ts";
import { CASSETTE_KEY, type Composed, startComposed } from "./testing/composed.ts";
import { type FakePorts, makePorts } from "./testing/fakes.ts";
import {
  C3_REVIEW,
  C3_SOURCE,
  C4_REVIEW,
  C4_SOURCE,
  C5_REVIEW,
  C5_SOURCE,
  L6_REVIEW,
  L6_SOURCE,
  X2_HIDDEN_SOURCE,
  X2_REVIEW,
  X2_SOURCE,
} from "./testing/wave5-fixtures.ts";

let c: Composed | undefined;
afterEach(() => {
  c?.stop();
  c = undefined;
});

const userText = (w: WireRequest | undefined) =>
  JSON.stringify(
    (w?.body.messages as { role: string }[] | undefined)?.filter((m) => m.role === "user") ?? [],
  );

interface Case {
  id: "C3" | "C4" | "C5" | "X2";
  source: ReviewSource;
  review: CapstoneReview;
  revisions: 1 | 2;
  /** Context lines the review must have been given. */
  lines: string[];
}

const CASES: Case[] = [
  {
    id: "C3",
    source: C3_SOURCE,
    review: C3_REVIEW,
    revisions: 1,
    lines: [
      "form: Verse Chorus Verse Chorus (ABAB); section bars count from the first full bar",
      "section Verse: bars 1-4 · letter A · tracks chords, kick, mel · energy 62% · chords C/E (I6) Am (vi) F (IV) G (V)",
      "contrast Verse vs Chorus: density, register, instrumentation, pitch, energy (5 of 7 axes)",
      "energy_curve (per bar, 0-1): 0.67 0.61 0.64 0.57 0.99 0.91 1 0.93",
      "groove_lock: 100% of bass notes on a kick · 75% of kicks carry a bass note",
      "rubric: The bass locks with the kick (required): met",
    ],
  },
  {
    id: "C4",
    source: C4_SOURCE,
    review: C4_REVIEW,
    revisions: 1,
    lines: [
      "facts: key A minor",
      "scale: minor · degrees 1 2 b3 4 5 b6 b7",
      "section Chorus: bars 5-8 · letter B · tracks chords, mel · energy 93% · chords F (VI) G (VII) Am (i)",
      "contrast Verse vs Chorus: no axis differs enough (0 of 7 axes)",
      "schema: schema.aeolian bars 1-4",
    ],
  },
  {
    id: "C5",
    source: C5_SOURCE,
    review: C5_REVIEW,
    revisions: 2,
    lines: [
      "revisions_wanted: 2",
      "facts: key C blues",
      "chords bar 2: F7 (IV7, PD)",
      "blues: quick-change with a turnaround (bar 12 on V) · 1 chorus of 12 bars · every chord a dominant seventh",
      "swing: hats ratio 2 · swung 8ths",
    ],
  },
  {
    id: "X2",
    source: X2_SOURCE,
    review: X2_REVIEW,
    revisions: 2,
    lines: [
      "revisions_wanted: 2",
      "blues_bars (1-12): G7 | C7 | G7 | G7 | C7 | C7 | G7 | G7 | D7 | C7 | G7 | D7",
      "check bass: bass stage bass · phrases 1-3 · best 94% · mark 90% · passed",
      "check changes: chords stage changes · phrases 1-3 · best 88% · mark 85% · passed",
      "check melody-1: melody stage melody · phrase 1 · best 71% · mark 85% · open",
    ],
  },
];

function capstonePorts(k: Case): FakePorts {
  const ports = makePorts();
  ports.lessons.reviews.set(`capstone:${k.id}`, k.source);
  return ports;
}

describe.each(CASES)("$id review", (k) => {
  test("high effort, the facts it needs in the context, the schema accepted, stored on the version", async () => {
    expect(revisionCountFor(k.id)).toBe(k.revisions);
    expect(
      validateCapstoneReview(k.review, { revisions: k.revisions, totalBars: k.source.totalBars }).ok,
    ).toBe(true);
    const stored: AcceptedReview[] = [];
    const ports = capstonePorts(k);
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        `${k.id}-review`,
        response(
          `msg_${k.id}1`,
          [toolUseBlock(0, `toolu_${k.id}1`, "submit_capstone_review", chunkJson(k.review, 40))],
          "tool_use",
          { usage: { input: 1_200, cacheWrite1h: 6_000 }, output: 700 },
        ),
        response(`msg_${k.id}2`, [textBlock(0, ["Done."])], "end_turn"),
      ),
      over: { onReview: (r) => void stored.push(r) },
    });
    const res = await c.sse("/api/tutor/reviews/capstone", {
      thread: { subjectKind: "capstone", subjectId: k.id },
      userText: "What would make it better?",
      albumTrackId: `trk-${k.id.toLowerCase()}`,
      albumVersion: 1,
    });
    expect(res.events.at(-1)).toBe("done");
    expect(c.wire[0]?.body.output_config).toEqual({ effort: "high" });
    expect(c.wire[0]?.body.max_tokens).toBe(32_000);
    const sent = userText(c.wire[0]);
    for (const line of k.lines) expect(sent).toContain(line);

    const frame = res.frames.find((f) => f.event === "review");
    expect(frame?.data).toEqual({ reviewKind: "capstone", review: k.review });
    expect(k.review.revisions).toHaveLength(k.revisions);
    expect(VERDICT.test(JSON.stringify(k.review))).toBe(false);
    expect(stored[0]).toMatchObject({
      reviewKind: "capstone",
      target: { kind: "album", trackId: `trk-${k.id.toLowerCase()}`, version: 1 },
    });
    // The revision titles become tutor notes (contracts §10.2); usage is counted on the review lane.
    expect(ports.notes.notes.map((n) => n.source)).toEqual(["review"]);
    expect(ports.notes.notes[0]?.text).toContain(k.review.revisions[0]?.title as string);
    expect(ports.usage.rows.map((r) => r.lane)).toEqual(["review"]);
    expect(ports.usage.rows[0]?.usage.outputTokens).toBe(700);
  });
});

describe("two revisions from C5 on (contracts §10.6)", () => {
  test("a C5 review with one revision is refused with its problem; the two-revision one is accepted", async () => {
    const ports = capstonePorts(CASES[2] as Case);
    const one = { ...C5_REVIEW, revisions: C5_REVIEW.revisions.slice(0, 1) };
    expect(validateCapstoneReview(one, { revisions: 2, totalBars: 12 })).toMatchObject({ ok: false });
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "c5-one-revision",
        response(
          "msg_o1",
          [toolUseBlock(0, "toolu_o1", "submit_capstone_review", chunkJson(one, 40))],
          "tool_use",
        ),
        response(
          "msg_o2",
          [toolUseBlock(0, "toolu_o2", "submit_capstone_review", chunkJson(C5_REVIEW, 40))],
          "tool_use",
        ),
        response("msg_o3", [textBlock(0, ["Delivered."])], "end_turn"),
      ),
    });
    const res = await c.sse("/api/tutor/reviews/capstone", {
      thread: { subjectKind: "capstone", subjectId: "C5" },
    });
    expect(res.events.filter((e) => e === "review")).toHaveLength(1);
    expect(res.frames.find((f) => f.event === "review")?.data).toEqual({
      reviewKind: "capstone",
      review: C5_REVIEW,
    });
    expect(userText(c.wire[1])).toContain("revisions: need exactly 2");
    // Both model calls cost tokens and are counted.
    expect(ports.usage.rows.map((r) => r.lane)).toEqual(["review", "review"]);
  });

  test("the soft warning fires once when a C5 review takes the month past the marker; nothing is blocked", async () => {
    const ports = capstonePorts(CASES[2] as Case);
    ports.settings.value.softMonthlyUsd = 0.001;
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "c5-soft",
        response(
          "msg_s1",
          [toolUseBlock(0, "toolu_s1", "submit_capstone_review", chunkJson(C5_REVIEW, 40))],
          "tool_use",
          { usage: { input: 2_000, cacheWrite1h: 6_000 }, output: 2_000 },
        ),
        response("msg_s2", [textBlock(0, ["Done."])], "end_turn"),
        response(
          "msg_s3",
          [toolUseBlock(0, "toolu_s3", "submit_capstone_review", chunkJson(C5_REVIEW, 40))],
          "tool_use",
        ),
        response("msg_s4", [textBlock(0, ["Done."])], "end_turn"),
      ),
    });
    const first = await c.sse("/api/tutor/reviews/capstone", {
      thread: { subjectKind: "capstone", subjectId: "C5" },
    });
    expect(first.events).toContain("notice");
    expect(first.events).toContain("review");
    const month = ports.settings.value.softWarnedMonth;
    expect(month).toMatch(/^\d{4}-\d{2}$/);
    // A second review the same month: still reviewed, no second notice.
    const second = await c.sse("/api/tutor/reviews/capstone", {
      thread: { subjectKind: "capstone", subjectId: "C5" },
    });
    expect(second.events).toContain("review");
    expect(second.events).not.toContain("notice");
    expect(ports.settings.value.softWarnedMonth).toBe(month);
  });
});

describe("a ladder L6 transcription: the hidden source never travels before a graded pass", () => {
  const facts = {
    tutorOpen: true,
    closedReason: null,
    title: "St. Louis Blues (L6)",
    released: null,
    transcriptionSource: "ladder" as const,
  };
  const sourceLiteral = "g4 bb4 b4 d5";

  test("a review below the pass: per-stage scores, no reference, no source; one revision", async () => {
    const ports = makePorts();
    ports.lessons.reviews.set("transcription:tr-l6", L6_SOURCE);
    ports.lessons.facts.set("transcription:tr-l6", facts);
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "l6-review",
        response(
          "msg_l1",
          [toolUseBlock(0, "toolu_l1", "submit_transcription_review", chunkJson(L6_REVIEW, 40))],
          "tool_use",
        ),
        response("msg_l2", [textBlock(0, ["Done."])], "end_turn"),
      ),
    });
    const res = await c.sse("/api/tutor/reviews/transcription", {
      thread: { subjectKind: "transcription", subjectId: "tr-l6" },
      transcriptionVersion: 2,
    });
    expect(res.frames.find((f) => f.event === "review")?.data).toEqual({
      reviewKind: "transcription",
      review: L6_REVIEW,
    });
    const sent = JSON.stringify(c.wire.map((w) => w.body.messages));
    expect(sent).toContain("check melody-1: melody stage melody · phrase 1 · best 71% · mark 85% · open");
    expect(sent).toContain("revisions_wanted: 1");
    expect(sent).not.toContain("reference:");
    expect(sent).not.toContain(sourceLiteral);
    expect(res.raw).not.toContain(sourceLiteral);
  });

  test("a chat on the transcription: the checker's expected notes are withheld at rung 0, the source never sent", async () => {
    const ports = makePorts();
    ports.lessons.facts.set("transcription:tr-l6", facts);
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "l6-chat",
        response(
          "msg_c1",
          [textBlock(0, ["Loop bar 1 at half speed and listen to the second note."])],
          "end_turn",
        ),
      ),
    });
    const res = await c.sse("/api/tutor/chat", {
      thread: { subjectKind: "transcription", subjectId: "tr-l6" },
      userText: "What is the melody of bar 1?",
      learnerCode: L6_SOURCE.code,
      graderResult: {
        status: "fail",
        score: 0.71,
        dims: { melody: 0.71 },
        counts: { missing: 0, extra: 0, wrong: 1 },
        issues: [
          {
            where: { track: "mel", bar: 1, beat: 2, code: null },
            severity: "error",
            feedback: "melody.wrong-degree",
            direction: "too-low",
            concept: "the blue third",
            what: "Bar 1, beat 2 is not the note the tune plays.",
            fix: "Use bb4 there.",
            expected: sourceLiteral,
            got: "a4",
          },
        ],
        warnings: [],
      },
    });
    expect(res.events.at(-1)).toBe("done");
    const sent = userText(c.wire[0]);
    expect(sent).toContain("checker: fail · score 0.71");
    expect(sent).toContain("issue 1: mel bar 1 beat 2");
    for (const secret of [sourceLiteral, "bb4", "too-low", X2_HIDDEN_SOURCE.slice(0, 20)])
      expect(sent).not.toContain(secret);
  });

  test("positive control: once the piece has passed, the reference is in the review", async () => {
    const ports = makePorts();
    ports.lessons.reviews.set("transcription:tr-l6", { ...L6_SOURCE, reference: X2_HIDDEN_SOURCE });
    ports.lessons.facts.set("transcription:tr-l6", facts);
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "l6-passed",
        response(
          "msg_p1",
          [toolUseBlock(0, "toolu_p1", "submit_transcription_review", chunkJson(L6_REVIEW, 40))],
          "tool_use",
        ),
        response("msg_p2", [textBlock(0, ["Done."])], "end_turn"),
      ),
    });
    await c.sse("/api/tutor/reviews/transcription", {
      thread: { subjectKind: "transcription", subjectId: "tr-l6" },
    });
    expect(userText(c.wire[0])).toContain(sourceLiteral);
  });
});
