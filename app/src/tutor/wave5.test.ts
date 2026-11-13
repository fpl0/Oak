// Wave 5 in the panel (pure parts): section names that select their section in the form view (bars counted from the
// first full bar after a pickup, c4), the Form chip and the sections line a turn carries, the cadence that sets up a
// minor or blues key, and the review request's pending state (c9).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { TranscriptEntry } from "@oak/api";
import { keyOf } from "@oak/theory";
import type { FormViewSection } from "../lib/form-view.ts";
import {
  askReview,
  buildTurnRequest,
  chipsOf,
  onScreenLine,
  registerTutorHost,
  reviewRequestOf,
  setAvailability,
  setReviewRequest,
  setSubject,
  showSection,
  subjectSections,
  TUTOR_BARS_EVENT,
  TUTOR_SECTION_EVENT,
  type TutorSubject,
  useReviewRequests,
  useTutorContext,
  useTutorHighlight,
} from "./context.ts";
import { cadenceIn, chordMidis } from "./music-tokens.ts";
import { REVIEW_WAIT_MS, reviewPending, unansweredReviewAt } from "./review-request.ts";
import { describeSection, displayBars, sectionsFromCode, sectionsLine, splitSections } from "./sections.ts";

/** A C3-shaped song: Verse Chorus Verse Chorus 2, four bars each (the ribbon prints the tag "chorus2" as Chorus 2). */
const SONG = [
  "setcpm(100/4)",
  'const chordsVerse = chord("<C Am F G>").voicing().s("piano")',
  'const chordsChorus = chord("<F G C C>").voicing().s("piano")',
  'const chordsChorus2 = chord("<F G C C>").voicing().s("piano")',
  "chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsVerse], [4, chordsChorus2])",
].join("\n");

const SKETCH: TutorSubject = {
  thread: { subjectKind: "sketch", subjectId: "sk_w5" },
  title: "Lights On",
  tutorOpen: true,
  sketchId: "sk_w5",
  code: SONG,
};

describe("sections from the code's arrange()", () => {
  test("names, tags, letters and bars as the ribbon has them", () => {
    const s = sectionsFromCode(SONG);
    expect(s.map((x) => [x.text, x.tag, x.letter, x.startBar, x.bars])).toEqual([
      ["Verse", "verse", "A", 0, 4],
      ["Chorus", "chorus", "B", 4, 4],
      ["Verse", "verse", "A", 8, 4],
      ["Chorus 2", "chorus2", "B", 12, 4],
    ]);
    expect(sectionsFromCode('chords: chord("<C G>")')).toEqual([]);
    expect(sectionsFromCode(null)).toEqual([]);
    // The tracks disagree: no sections, no chips (the form view shows its message instead).
    expect(sectionsFromCode(`${SONG}\nmel: arrange([4, melVerse], [8, melChorus])`)).toEqual([]);
  });

  test("display bars count from the first full bar after a pickup (c4)", () => {
    const [verse, chorus] = sectionsFromCode(SONG) as [FormViewSection, FormViewSection];
    expect(displayBars(chorus)).toEqual({ from: 5, to: 8 });
    // With a pickup cycle 0 is bar 0: the chorus (cycles 4-7) is bars 4-7.
    expect(displayBars(chorus, true)).toEqual({ from: 4, to: 7 });
    expect(sectionsLine([verse, chorus])).toBe("Verse bars 1–4, Chorus bars 5–8");
    expect(describeSection(chorus, true).aria).toBe("Section Chorus, bars 4–7: select and loop it");
  });

  test("tutor text: section names become chips; other words, plurals and code do not", () => {
    const s = sectionsFromCode(SONG);
    const parts = splitSections(
      "The chorus lifts. In Chorus 2 the bass could rest, and verse 1 is quiet.",
      s,
    );
    const chips = parts.filter((p) => typeof p !== "string") as { raw: string; section: FormViewSection }[];
    expect(chips.map((c) => [c.raw, c.section.tag, c.section.startBar])).toEqual([
      ["chorus", "chorus", 4],
      ["Chorus 2", "chorus2", 12],
      ["verse 1", "verse", 0],
    ]);
    expect(parts.filter((p) => typeof p === "string").join("|")).toBe(
      "The | lifts. In | the bass could rest, and | is quiet.",
    );
    expect(splitSections("Both verses are quiet; a bridge would help.", s)).toEqual([
      "Both verses are quiet; a bridge would help.",
    ]);
    expect(splitSections("The chorus lifts.", [])).toEqual(["The chorus lifts."]);
  });

  test("single-letter sections (A A B A): the article, a note and a key never become chips (review:surfaces)", () => {
    const AABA = [
      'const melA = n("0 2 4 2").scale("A3:minor")',
      'const melB = n("5 4 2 4").scale("A3:minor")',
      "mel: arrange([2, melA], [2, melA], [2, melB], [2, melA])",
    ].join("\n");
    const s = sectionsFromCode(AABA);
    expect(s.map((x) => x.text)).toEqual(["A", "A", "B", "A"]);
    const chips = (t: string) =>
      (splitSections(t, s).filter((p) => typeof p !== "string") as { raw: string }[]).map((c) => c.raw);
    expect(chips("This is a lovely tune: a small song. Try a V at the end.")).toEqual([]);
    expect(chips("A small song in A minor, with an A♭ and the B in bar 2.")).toEqual([]);
    expect(chips("Section B lifts it; the A section comes home. A A B A.")).toEqual([
      "B",
      "A",
      "A",
      "A",
      "B",
      "A",
    ]);
  });
});

describe("a section chip selects the section", () => {
  const seen: { type: string; detail: unknown }[] = [];
  const target = new EventTarget();
  const g = globalThis as unknown as { window?: unknown };
  beforeEach(() => {
    seen.length = 0;
    g.window = target;
    for (const type of [TUTOR_BARS_EVENT, TUTOR_SECTION_EVENT])
      target.addEventListener(type, (e) => seen.push({ type, detail: (e as CustomEvent).detail }));
  });
  afterEach(() => {
    g.window = undefined;
  });

  test("through the host's selectSection when there is one; the highlight takes display bars", () => {
    const chorus2 = sectionsFromCode(SONG)[3] as FormViewSection;
    const loops: unknown[] = [];
    const off = registerTutorHost({ thread: SKETCH.thread, selectSection: (l) => loops.push(l) });
    showSection(SKETCH.thread, chorus2, true);
    off();
    expect(loops).toEqual([{ from: 12, bars: 4, tag: "chorus2" }]);
    expect(useTutorHighlight.getState().current).toMatchObject({ kind: "bars", from: 12, to: 15 });
  });

  test("without a host: the section event alone, with exactly its cycles", () => {
    const chorus = sectionsFromCode(SONG)[1] as FormViewSection;
    showSection({ subjectKind: "sketch", subjectId: "no-host" }, chorus, false);
    expect(seen).toContainEqual({ type: TUTOR_SECTION_EVENT, detail: { from: 4, bars: 4, tag: "chorus" } });
    // The Workbench selects the section from this event; the bars event (display bars) is not sent for a section.
    expect(seen.some((e) => e.type === TUTOR_BARS_EVENT)).toBe(false);
  });

  test("a host with its own transport loops the section's display bars (c4: past a pickup)", () => {
    const chorus2 = sectionsFromCode(SONG)[3] as FormViewSection;
    const bars: [number, number][] = [];
    const off = registerTutorHost({ thread: SKETCH.thread, showBars: (a, b) => bars.push([a, b]) });
    showSection(SKETCH.thread, chorus2, true);
    off();
    expect(bars).toEqual([[12, 15]]);
    expect(seen).toContainEqual({ type: TUTOR_SECTION_EVENT, detail: { from: 12, bars: 4, tag: "chorus2" } });
  });
});

describe("the Form chip and the sections a turn carries", () => {
  test("a subject in sections gets a Form chip; its message names each section with its bars", () => {
    const chips = chipsOf(SKETCH);
    expect(chips.find((c) => c.id === "form")?.label).toBe("Form · ABAB · Verse, Chorus");
    expect(onScreenLine(SKETCH, null)).toBe(
      "On screen: sections Verse bars 1–4, Chorus bars 5–8, Verse bars 9–12, Chorus 2 bars 13–16.",
    );
    const req = buildTurnRequest(SKETCH, "chat", "Does the chorus lift?");
    expect(req.userText).toContain("sections Verse bars 1–4, Chorus bars 5–8");
  });

  test("the surface's own sections and pickup win over the code", () => {
    const own = sectionsFromCode(SONG).slice(0, 2);
    const s: TutorSubject = { ...SKETCH, sections: own, pickup: true };
    expect(subjectSections(s)).toBe(own);
    expect(onScreenLine(s, null)).toBe("On screen: sections Verse bars 0–3, Chorus bars 4–7.");
    expect(chipsOf({ ...SKETCH, sections: [] }).some((c) => c.id === "form")).toBe(false);
  });
});

describe("the cadence that sets up a key", () => {
  const triad = (midis: number[]) => midis.map((m) => m % 12).sort((a, b) => a - b);
  test("minor modes are set up in minor (i iv V i), a blues key with dominant sevenths", () => {
    for (const mode of ["minor", "harmonic minor", "melodic minor", "minor pentatonic"]) {
      const c = cadenceIn(keyOf(`A ${mode}`));
      expect(triad(c[0] as number[]), mode).toEqual([0, 4, 9]); // A C E
      expect(triad(c[2] as number[]), mode).toEqual([4, 8, 11]); // E G# B: V with the raised 7
    }
    const blues = cadenceIn(keyOf("C blues"));
    expect(triad(blues[0] as number[])).toEqual([0, 4, 7, 10]); // C7
    expect(triad(blues[1] as number[])).toEqual([0, 3, 5, 9]); // F7
    expect(triad(cadenceIn(keyOf("C major"))[0] as number[])).toEqual(triad(chordMidis(0, [0, 4, 7])));
  });
});

describe("the review request (c9)", () => {
  const capstone = { subjectKind: "capstone", subjectId: "C5" } as const;
  const entry = (over: Partial<TranscriptEntry>): TranscriptEntry => ({
    conversationId: "capstone:C5:2026-11-13:review",
    seq: 1,
    at: "2026-11-13T10:00:00.000Z",
    role: "user",
    kind: "review-capstone",
    text: "Please review my draft.",
    learnerCode: null,
    cardIds: [],
    review: null,
    stepId: null,
    rung: null,
    summary: null,
    backend: "claude-cli",
    excluded: false,
    errorKind: null,
    ...over,
  });
  const T = Date.parse("2026-11-13T10:00:00.000Z");

  beforeEach(() => {
    useReviewRequests.setState({ byThread: {} });
    useTutorContext.setState({ queue: [], notice: null });
    setAvailability({ tutor: "ready", tutorBackend: "claude-cli" });
  });

  test("asking marks it pending at once, before the turn starts", () => {
    const r = askReview({ capstoneId: "C5", title: "Back Porch Shuffle", code: "x" });
    expect(r.ok).toBe(true);
    expect(reviewRequestOf(capstone)?.phase).toBe("pending");
    expect(reviewPending(reviewRequestOf(capstone), [], T)).toBe(true);
  });

  test("a request that failed before reaching the server is not pending, whatever the timeline lacks", () => {
    setReviewRequest(capstone, "failed-early", "The tutor could not be reached.");
    expect(reviewPending(reviewRequestOf(capstone), [], Date.now())).toBe(false);
  });

  test("the timeline: an unanswered request (from the Brief or another tab) is pending for the Brief's wait", () => {
    const asked = [entry({})];
    expect(unansweredReviewAt(asked)).toBe(T);
    expect(reviewPending(null, asked, T + 1_000)).toBe(true);
    expect(reviewPending(null, asked, T + REVIEW_WAIT_MS + 1)).toBe(false);
    const answered = [...asked, entry({ role: "assistant", seq: 2, review: { strengths: [] } })];
    expect(reviewPending(null, answered, T + 1_000)).toBe(false);
    const failed = [...asked, entry({ role: "assistant", seq: 2, errorKind: "overloaded" })];
    expect(reviewPending(null, failed, T + 1_000)).toBe(false);
    // This browser's answer is newer than the timeline's request: not pending.
    useReviewRequests.setState({ byThread: { "capstone:C5": { phase: "answered", at: T + 500 } } });
    expect(reviewPending(reviewRequestOf(capstone), asked, T + 1_000)).toBe(false);
  });

  test("a chat is not a review request", () => {
    setSubject({ thread: capstone, title: "C5", tutorOpen: true, capstoneId: "C5", code: "x" });
    useTutorContext.setState({ queue: [] });
    expect(reviewRequestOf(capstone)).toBeNull();
  });
});
