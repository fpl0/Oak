// Recorded-response tests for the eight track-capstone reviews (JC1–JC4, RC1–RC2, AC1–AC2), each replayed as an API
// cassette through the composed server over HTTP. They check what was sent (high effort; the analysed facts each
// review needs: the keys a ii–V visits, the voicing types, the walking bass's faults by bar, the devices with their
// bars, a contrafact against its model, the lay-back in milliseconds, the clave and each part against it, register
// clashes, levels; the try-it keys; the vocabulary of the learner's own route), what came back (two revisions each,
// no verdict) and where it was stored. AC1's review compares its two versions: each comment names the version it is
// about, and a review that does not is refused and repaired once. The prose lint knows the track terms: a review
// that names one the learner has not met is refused.
import { afterEach, describe, expect, test } from "bun:test";
import { terms as COURSE_TERMS } from "../../../content/terms.ts";
import { chunkJson, response, textBlock, toolUseBlock } from "./backends/api/cassettes/builders.ts";
import type { WireRequest } from "./backends/api/cassettes/fake-fetch.ts";
import { cassette } from "./backends/api/cassettes/scenarios.ts";
import type { IntroducedTerms, ReviewSource } from "./domain.ts";
import {
  type CapstoneReview,
  namesVersion,
  reviewKeys,
  reviewRulesOf,
  revisionCountFor,
  VERDICT,
  validateCapstoneReview,
} from "./reviews.ts";
import type { AcceptedReview } from "./service-types.ts";
import { CASSETTE_KEY, type Composed, startComposed } from "./testing/composed.ts";
import { type FakePorts, makePorts } from "./testing/fakes.ts";
import {
  AC1_REVIEW,
  AC1_SOURCE,
  AC2_REVIEW,
  AC2_SOURCE,
  JC1_REVIEW,
  JC1_SOURCE,
  JC2_REVIEW,
  JC2_SOURCE,
  JC3_REVIEW,
  JC3_SOURCE,
  JC4_REVIEW,
  JC4_SOURCE,
  RC1_REVIEW,
  RC1_SOURCE,
  RC2_REVIEW,
  RC2_SOURCE,
} from "./testing/wave7-fixtures.ts";

let c: Composed | undefined;
afterEach(() => {
  c?.stop();
  c = undefined;
});

const userText = (w: WireRequest | undefined) =>
  JSON.stringify(
    (w?.body.messages as { role: string }[] | undefined)?.filter((m) => m.role === "user") ?? [],
  );

/** The terms of the lessons a learner has done before a capstone opens (the earliest legal route, contracts §4.3). */
function termsUpTo(...lessons: RegExp[]): string[] {
  const core = (id: string) => /^U\d\d\./.test(id) || /^A1\.L0[1-4]$/.test(id);
  return COURSE_TERMS.filter(
    (t) => core(t.introducedBy) || lessons.some((re) => re.test(t.introducedBy)),
  ).map((t) => t.id as string);
}
const JC1_TERMS = termsUpTo(/^J1\./, /^J2\.L0[1-3]$/);
const JC2_TERMS = termsUpTo(/^J[1-4]\./);
const JC34_TERMS = termsUpTo(/^J[1-5]\./);
const R_TERMS = termsUpTo(/^R[1-3]\./);
const AC1_TERMS = termsUpTo(/^A[12]\./);
const AC2_TERMS = termsUpTo(/^A[12]\./, /^J[1-3]\./, /^R1\./);

interface Case {
  id: string;
  source: ReviewSource;
  review: CapstoneReview;
  terms: string[];
  /** Context lines the review must have been given. */
  lines: string[];
}

const CASES: Case[] = [
  {
    id: "JC1",
    source: JC1_SOURCE,
    review: JC1_REVIEW,
    terms: JC1_TERMS,
    lines: [
      "revisions_wanted: 2",
      "two_five: bar 9 Bm7b5 E7 aims at A minor · resolves there",
      "keys_visited: C major (ii–V at bars 1, 13) · E♭ major (ii–V at bar 5) · A minor (ii–V at bar 9) · 3 keys",
      "voicing: chords · shell in bars 1-8, 10-16",
      "voicing: chords · close position in bar 9",
      "avoid_note: bar 9 · C5 is the b9 over Bm7b5, held or on the beat",
      "register_clash: bar 11 · A2 and C3, 3 half steps apart, too close that low",
      "try_code_key: C major, then E♭ major, then A minor",
      "forms_tracks: chord symbols in code spelling",
      "the ii–V–I as [[rn:ii7]] [[rn:V7]] [[rn:Imaj7]]",
    ],
  },
  {
    id: "JC2",
    source: JC2_SOURCE,
    review: JC2_REVIEW,
    terms: JC2_TERMS,
    lines: [
      "walking_bass: bass · 12 bars · 10 walk without a fault · 2 with a fault",
      "walking_bass bar 6: beat 1 is not the chord's root",
      "walking_bass bar 8: beat 4 leaps 9 half steps into the next bar",
      "two_five: bar 4 Cm7 F7 aims at B♭ major · resolves there",
      "voicing: chords · dictionary voicing (the voicing() dictionary's shape, not a hand voicing) in bars 1-12",
      "blues: quick-change (jazz) · 1 chorus of 12 bars",
      "a walking bass judged on the quarters",
    ],
  },
  {
    id: "JC3",
    source: JC3_SOURCE,
    review: JC3_REVIEW,
    terms: JC34_TERMS,
    lines: [
      "form: A A B A (AABA); section bars count from the first full bar",
      "contrafact: the model's changes kept in 100% of bars · the melody repeats the model's head in 9% of its bars (bars 1, 9, 25)",
      "walking_bass: bass · 32 bars · 8 walk without a fault · 24 with a fault",
      "walking_bass bar 1: beat 4 leaps 7 half steps into the next bar",
      "avoid_note: bar 5 · Eb5 is the 11 over Bb7, held or on the beat",
      "rhythm changes (32 bars, AABA, the bridge's dominants two bars each)",
    ],
  },
  {
    id: "JC4",
    source: JC4_SOURCE,
    review: JC4_REVIEW,
    terms: JC34_TERMS,
    lines: [
      "reharm: the tune kept note for note · 3 devices, 3 different (secondary ii–V, tritone sub, diminished passing)",
      "reharm_device: secondary ii–V · bar 2 · the original's Am7 now Em7",
      "reharm_device: tritone sub · bar 4 · the original's G7 now Db7",
      "reharm_device: diminished passing · bar 6 · the original's Am7 now C#o7",
      "two_five: bar 2 Em7 A7 aims at D major · does not land on its home chord",
      "reharmonization devices by name and bar: tritone substitution",
    ],
  },
  {
    id: "RC1",
    source: RC1_SOURCE,
    review: RC1_REVIEW,
    terms: R_TERMS,
    lines: [
      "feel: snare · +15 ms from the 16th grid · behind the beat (laid back), a feel",
      "feel: hats · 0 ms from the 16th grid · on the grid",
      "rhythm: snare · 16 syncopated notes · 8 ghost notes · the beat divides in two",
      "levels (against the loudest part): bass 0 dB · clav 0 dB · kick 0 dB · snare 0 dB · hats -3.1 dB",
      "8–45 ms is a feel, more is a displacement",
      "jazz harmony words (ii–V–I, shells, extensions, walking bass) only as a preview",
    ],
  },
  {
    id: "RC2",
    source: RC2_SOURCE,
    review: RC2_REVIEW,
    terms: R_TERMS,
    lines: [
      "clave: perc · son 3-2 · held from bar 1 for 6 bars · windows not holding it start at bar 7",
      "clave_alignment: keys · of 4 two-bar windows: faces the clave as written in 4, crossed in 0, neither in 0",
      "clave_alignment: bass · of 4 two-bar windows: faces the clave as written in 0, crossed in 0, neither in 4",
      "euclid: perc3 · (5,16,2) in bars 1-8",
      "polyrhythm: perc2 against kick · 3:2 together in 8 of 8 bars (bars 1-8)",
      "the clave by type and direction",
    ],
  },
  {
    id: "AC1",
    source: AC1_SOURCE,
    review: AC1_REVIEW,
    terms: AC1_TERMS,
    lines: [
      'versions: a "Swing" · b "Bossa" · the review compares them',
      "versions_compared: the same tune in both · they differ in sounds, density, groove",
      'version a "Swing": 120 BPM (setcpm)',
      'version b "Bossa": 140 BPM (setcpm)',
      "[a] density: bars 1-4 5 onsets a bar, up to 4 parts",
      "[b] density: bars 1-4 7 onsets a bar, up to 5 parts",
      "[b] groove_lock: 100% of bass notes on a kick",
      "try_code_key: F major",
    ],
  },
  {
    id: "AC2",
    source: AC2_SOURCE,
    review: AC2_REVIEW,
    terms: AC2_TERMS,
    lines: [
      "voicing: chords · rootless A in bars 1-2",
      "voicing: chords · rootless B in bar 4",
      "feel: chords · +20 ms from the 16th grid · behind the beat (laid back), a feel",
      "feel: hats · +41.7 ms from the 16th grid · the line swings its 16ths, so this is the swing's late off-beats, not a lay-back",
      "swing: hats ratio 1.5 · swung 16ths",
      "register_clash: bar 3 · F#2 and A2, 3 half steps apart, too close that low",
      "pad -32 dB (more than 24 dB under: not heard)",
    ],
  },
];

const termsOf = (ids: string[]): IntroducedTerms => ({ count: ids.length, recent: ids.slice(-30), all: ids });

function capstonePorts(k: Case): FakePorts {
  const ports = makePorts();
  ports.lessons.reviews.set(`capstone:${k.id}`, k.source);
  ports.progress.terms = termsOf(k.terms);
  return ports;
}

describe.each(CASES)("$id review", (k) => {
  test("high effort, the facts it needs in the context, two revisions, accepted and stored on the version", async () => {
    expect(revisionCountFor(k.id)).toBe(2);
    expect(validateCapstoneReview(k.review, reviewRulesOf(k.source, termsOf(k.terms), k.id))).toEqual({
      ok: true,
      value: k.review,
    });
    const stored: AcceptedReview[] = [];
    const ports = capstonePorts(k);
    const tag = k.id.toLowerCase();
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        `${tag}-review`,
        response(
          `msg_${tag}1`,
          [toolUseBlock(0, `toolu_${tag}1`, "submit_capstone_review", chunkJson(k.review, 40))],
          "tool_use",
          { usage: { input: 1_500, cacheWrite1h: 6_000 }, output: 900 },
        ),
        response(`msg_${tag}2`, [textBlock(0, ["Done."])], "end_turn"),
      ),
      over: { onReview: (r) => void stored.push(r) },
    });
    const res = await c.sse("/api/tutor/reviews/capstone", {
      thread: { subjectKind: "capstone", subjectId: k.id },
      userText: "What would make it better?",
      albumTrackId: `trk-${tag}`,
      albumVersion: 1,
    });
    expect(res.events.at(-1)).toBe("done");
    expect(c.wire[0]?.body.output_config).toEqual({ effort: "high" });
    const sent = userText(c.wire[0]);
    for (const line of k.lines) expect(sent).toContain(JSON.stringify(line).slice(1, -1));
    expect(sent).toContain("review_terms: prose uses only course terms the learner has met");
    expect(sent).toContain("vocabulary_tracks: ");
    expect(res.frames.find((f) => f.event === "review")?.data).toEqual({
      reviewKind: "capstone",
      review: k.review,
    });
    expect(k.review.revisions).toHaveLength(2);
    expect(VERDICT.test(JSON.stringify(k.review))).toBe(false);
    expect(stored[0]).toMatchObject({
      reviewKind: "capstone",
      target: { kind: "album", trackId: `trk-${tag}`, version: 1 },
    });
    expect(ports.notes.notes.map((n) => n.source)).toEqual(["review"]);
    expect(ports.usage.rows.map((r) => r.lane)).toEqual(["review"]);
  });
});

describe("the track capstones' review rules", () => {
  test("JC1's try-it keys are every key its ii–Vs aim at; a try-it in another key is refused", () => {
    expect(reviewKeys(JC1_SOURCE)).toEqual(["C major", "E♭ major", "A minor"]);
    const rules = reviewRulesOf(JC1_SOURCE, termsOf(JC1_TERMS), "JC1");
    const inEb = {
      ...JC1_REVIEW.revisions[0],
      tryCode: 'chords: chord("<Fm7 Bb7 Eb^7>").voicing().s("piano")',
    };
    expect(
      validateCapstoneReview({ ...JC1_REVIEW, revisions: [inEb, JC1_REVIEW.revisions[1]] }, rules).ok,
    ).toBe(true);
    const inE = {
      ...JC1_REVIEW.revisions[0],
      tryCode: 'chords: chord("<F#m7 B7 E^7>").voicing().s("piano")',
    };
    const bad = validateCapstoneReview({ ...JC1_REVIEW, revisions: [inE, JC1_REVIEW.revisions[1]] }, rules);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problems.join("\n")).toContain("reads in E major");
  });

  test("a track term the learner has not met is refused; met on the route, it is accepted", () => {
    // RC1's learner (R1–R3) has not met the jazz track: "walking bass" and "tritone substitution" are not theirs.
    const rules = reviewRulesOf(RC1_SOURCE, termsOf(R_TERMS), "RC1");
    const jazzy = {
      ...RC1_REVIEW,
      strengths: [
        {
          text: "The bass is a walking bass under a tritone substitution in bar 2.",
          bars: [2, 2] as [number, number],
        },
        RC1_REVIEW.strengths[1] as CapstoneReview["strengths"][number],
      ],
    };
    const r = validateCapstoneReview(jazzy, rules);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.join("\n")).toContain('"walking bass" is a term the learner has not met yet');
      expect(r.problems.join("\n")).toContain('"tritone substitution" is a term the learner has not met yet');
    }
    // The same words are fine for a learner who has met J1–J5 (and R1–R3, for the review's "laid-back").
    const both = termsOf([...JC34_TERMS, ...R_TERMS]);
    expect(validateCapstoneReview(jazzy, reviewRulesOf(RC1_SOURCE, both, "RC1"))).toEqual({
      ok: true,
      value: jazzy,
    });
    // A clave named to a learner who stopped before R3.L02 is refused.
    const early = termsOf(termsUpTo(/^R1\./));
    const clave = validateCapstoneReview(RC2_REVIEW, reviewRulesOf(RC2_SOURCE, early, "RC2"));
    expect(clave.ok).toBe(false);
    if (!clave.ok)
      expect(clave.problems.join("\n")).toContain('"clave" is a term the learner has not met yet');
  });

  test("AC1: every comment names its version, and both versions are spoken of", () => {
    const rules = reviewRulesOf(AC1_SOURCE, termsOf(AC1_TERMS), "AC1");
    expect(rules.versions).toEqual([
      { id: "a", label: "Swing" },
      { id: "b", label: "Bossa" },
    ]);
    expect(namesVersion("In version b the bass locks", { id: "b", label: "Bossa" })).toBe(true);
    expect(namesVersion("the bossa groove", { id: "b", label: "Bossa" })).toBe(true);
    expect(namesVersion("a groove", { id: "a", label: "Swing" })).toBe(false);
    const unnamed = {
      ...AC1_REVIEW,
      revisions: [
        {
          ...(AC1_REVIEW.revisions[0] as CapstoneReview["revisions"][number]),
          title: "Leave room around the tune",
        },
        AC1_REVIEW.revisions[1] as CapstoneReview["revisions"][number],
      ],
      strengths: AC1_REVIEW.strengths.map((s) => ({ ...s, text: s.text.replace(/Bossa/g, "the second") })),
    };
    unnamed.revisions[0] = {
      ...(unnamed.revisions[0] as CapstoneReview["revisions"][number]),
      why: "It plays 7 onsets a bar and its guitar strikes four times in every bar; two strikes where the tune holds would let it ring.",
    };
    const r = validateCapstoneReview(unnamed, rules);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems).toContain(
        'revisions[0]: say which version it is about ("Swing" or "version a", "Bossa" or "version b"); its bars are that version\'s bars',
      );
      expect(r.problems).toContain(
        'the review compares the two versions: no strength or revision is about "Bossa"',
      );
    }
  });

  test("AC1 over HTTP: a review that does not compare is refused, repaired once, and only the repair is stored", async () => {
    const stored: AcceptedReview[] = [];
    const ports = makePorts();
    ports.lessons.reviews.set("capstone:AC1", AC1_SOURCE);
    ports.progress.terms = termsOf(AC1_TERMS);
    const swingOnly = {
      ...AC1_REVIEW,
      strengths: [
        {
          text: "Swing keeps the tune's long notes in bars 4 and 8, where the chords stop on C7.",
          bars: [4, 8] as [number, number],
        },
        {
          text: "In Swing the ride keeps the pairs long-short under every bar of the tune.",
          bars: [1, 8] as [number, number],
        },
      ],
      revisions: [
        AC1_REVIEW.revisions[1] as CapstoneReview["revisions"][number],
        {
          ...(AC1_REVIEW.revisions[1] as CapstoneReview["revisions"][number]),
          title: "Swing: hold bar 4 longer",
          why: "In Swing the tune's A in bar 4 is the 13 over C7; holding it to the end of the bar lets the colour ring.",
          tryCode: 'mel: note("<[a4@4]>").s("mutetpt")',
        },
      ],
    };
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "ac1-repair",
        response(
          "msg_r1",
          [toolUseBlock(0, "toolu_r1", "submit_capstone_review", chunkJson(swingOnly, 40))],
          "tool_use",
        ),
        response(
          "msg_r2",
          [toolUseBlock(0, "toolu_r2", "submit_capstone_review", chunkJson(AC1_REVIEW, 40))],
          "tool_use",
        ),
        response("msg_r3", [textBlock(0, ["Done."])], "end_turn"),
      ),
      over: { onReview: (r) => void stored.push(r) },
    });
    const res = await c.sse("/api/tutor/reviews/capstone", {
      thread: { subjectKind: "capstone", subjectId: "AC1" },
      albumTrackId: "trk-ac1",
      albumVersion: 1,
    });
    expect(res.events.at(-1)).toBe("done");
    expect(JSON.stringify(c.wire[1]?.body.messages)).toContain("no strength or revision is about");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.review).toEqual(AC1_REVIEW);
  });
});
