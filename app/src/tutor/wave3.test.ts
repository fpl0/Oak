// Wave 3 in the tutor: chips that know the key and the lenses, the Wave 3 vocabulary inside the closed token
// grammar (degrees with alterations and syllables, intervals, keys, signatures), answers on staff / sung / by-ear
// steps in a form the tutor reads (never the expected answer), references that light the staff, and the
// "On screen" line. Musical facts are checked against @oak/theory and tonal-independent arithmetic.
import { beforeEach, describe, expect, test } from "bun:test";
import { type GradeResult, TutorTurnRequestSchema } from "@oak/api";
import type { TermEntry } from "@oak/content-kit";
import { midiToPc, noteToMidi } from "@oak/theory";
import {
  answerText,
  askExplain,
  askHint,
  barsToCycles,
  buildTurnRequest,
  chipsOf,
  keyFromCode,
  ON_SCREEN,
  onScreenLine,
  setLensState,
  setSubject,
  showBars,
  splitUserText,
  subjectKey,
  type TutorAnswer,
  type TutorSubject,
  takeAsk,
  useTutorContext,
  useTutorHighlight,
} from "./context.ts";
import { parseMarkdown, tokensIn } from "./markdown.ts";
import {
  cadenceIn,
  canonicalTokenRaw,
  describeToken,
  fifthsFromSlug,
  intervalFromSlug,
  keyFromSlug,
  type TokenContext,
  tonicMidi,
} from "./music-tokens.ts";

const PCS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const names = (midis: readonly number[]) => midis.map((m) => PCS[midiToPc(m)]);
const G = { tonic: "G", mode: "major" } as const;
const Am = { tonic: "A", mode: "minor" } as const;

const TRITONE = {
  id: "term.tritone",
  term: "tritone",
  definition: "Three whole steps: the interval that splits the octave in half.",
  example: "",
  introducedBy: "U04.L04",
} as unknown as TermEntry;
const base: TokenContext = { terms: [TRITONE], introduced: null, tools: [], unlocked: null };

describe("chips in a key", () => {
  test("a degree sounds after the key's own cadence, and names its syllable", () => {
    const ctx = { ...base, key: G, labels: { degrees: true, solfege: true } };
    const five = describeToken({ kind: "deg", value: "5" }, ctx);
    expect(names(five?.play?.at(-1) ?? [])).toEqual(["D"]);
    expect(five?.title).toContain("G major");
    expect(five?.sub).toBe("sol");
    // The cadence is I IV V I of G: G B D, C E G, D F# A, G B D.
    expect(cadenceIn(G).map(names)).toEqual([
      ["G", "B", "D"],
      ["C", "E", "G"],
      ["D", "F#", "A"],
      ["G", "B", "D"],
    ]);
    // In A minor: i iv V i (V = E G♯ B, pitch classes 4 8 11), and ♭3 is C (me).
    expect(cadenceIn(Am).map((c) => c.map(midiToPc))).toEqual([
      [9, 0, 4],
      [2, 5, 9],
      [4, 8, 11],
      [9, 0, 4],
    ]);
    const me = describeToken(
      { kind: "deg", value: "b3" },
      { ...base, key: Am, labels: { degrees: true, solfege: true } },
    );
    expect(names(me?.play?.at(-1) ?? [])).toEqual(["C"]);
    expect(me?.label).toBe("♭3");
    expect(me?.sub).toBe("me");
    // Solfège lens off: no syllable on the chip (still in the hover).
    const plain = describeToken(
      { kind: "deg", value: "#4" },
      { ...base, key: G, labels: { degrees: true, solfege: false } },
    );
    expect(plain?.sub).toBeUndefined();
    expect(plain?.title).not.toContain("(fi)");
    // Lenses unknown (no labels in the context): the hover names the syllable, as in Wave 2.
    expect(describeToken({ kind: "deg", value: "#4" }, { ...base, key: G })?.title).toContain("(fi)");
    expect(names(plain?.play?.at(-1) ?? [])).toEqual(["C#"]);
  });

  test("the tonic sits between G3 and F#4", () => {
    expect(tonicMidi({ tonic: "C", mode: "major" })).toBe(60);
    expect(tonicMidi({ tonic: "F#", mode: "major" })).toBe(66);
    expect(tonicMidi({ tonic: "G", mode: "major" })).toBe(55);
    expect(tonicMidi({ tonic: "Bb", mode: "major" })).toBe(58);
  });

  test("a note names its degree in the key; a chord its numeral", () => {
    const fs = describeToken(
      { kind: "note", value: "F#4" },
      { ...base, key: G, labels: { degrees: true, solfege: false } },
    );
    expect(fs?.title).toContain("In G major it is degree 7.");
    expect(describeToken({ kind: "note", value: "F#4" }, { ...base, key: G })?.title).toContain(
      "degree 7 (ti)",
    );
    expect(fs?.sub).toBe("7");
    expect(fs?.midi).toBe(66);
    expect(fs?.degree).toBe("7");
    // Degrees lens off (or locked): no degree on the chip.
    expect(describeToken({ kind: "note", value: "F#4" }, { ...base, key: G })?.sub).toBeUndefined();
    const c = describeToken({ kind: "chord", value: "C" }, { ...base, key: G });
    expect(c?.title).toContain("In G major it is IV");
    const rn = describeToken({ kind: "rn", value: "V" }, { ...base, key: G });
    expect(rn?.title).toContain("In G major it is D");
    expect(names(rn?.play?.[0] ?? [])).toEqual(["D", "F#", "A"]);
  });

  test("without a key, playback stays in C major and says so", () => {
    const d = describeToken({ kind: "deg", value: "5" }, base);
    expect(d?.title).toContain("in C major");
    expect(d?.play?.at(-1)).toEqual([67]);
  });
});

describe("intervals, keys and signatures named in a term", () => {
  test("interval slugs", () => {
    expect(intervalFromSlug("m3")).toBe("m3");
    expect(intervalFromSlug("p5")).toBe("P5");
    expect(intervalFromSlug("a4")).toBe("A4");
    expect(intervalFromSlug("maj3")).toBe("M3");
    expect(intervalFromSlug("perfect-fifth")).toBe("P5");
    expect(intervalFromSlug("minor-3rd")).toBe("m3");
    expect(intervalFromSlug("major-sixth")).toBe("M6");
    expect(intervalFromSlug("perfect-third")).toBeNull();
    expect(intervalFromSlug("m4")).toBeNull();
    expect(intervalFromSlug("cadence")).toBeNull();
  });

  test("an interval chip plays both notes from the tonic, then together", () => {
    const m3 = describeToken({ kind: "term", value: "m3" }, { ...base, key: G });
    expect(m3).toMatchObject({ variant: "interval", label: "m3" });
    expect(m3?.title).toContain("3 half steps");
    expect(m3?.play?.map(names)).toEqual([["G"], ["Bb"], ["G", "Bb"]]);
    const p5 = describeToken({ kind: "term", value: "perfect-fifth" }, base);
    expect(p5?.play?.[2]).toEqual([60, 67]);
    // The glossary's tritone keeps its definition and plays six half steps.
    const tt = describeToken({ kind: "term", value: "tritone" }, base);
    expect(tt?.label).toBe("tritone");
    expect(tt?.title).toContain("splits the octave");
    expect(tt?.play?.[2]).toEqual([60, 66]);
  });

  test("key slugs, with their signature and relative key, and their scale", () => {
    expect(keyFromSlug("e-flat-major")).toEqual({ tonic: "Eb", mode: "major" });
    expect(keyFromSlug("f-sharp-minor")).toEqual({ tonic: "F#", mode: "minor" });
    expect(keyFromSlug("bb-major")).toEqual({ tonic: "Bb", mode: "major" });
    expect(keyFromSlug("h-major")).toBeNull();
    const eb = describeToken({ kind: "term", value: "e-flat-major" }, base);
    expect(eb).toMatchObject({ variant: "key", label: "E♭ major" });
    expect(eb?.title).toContain("3 flats (B♭ E♭ A♭)");
    expect(eb?.title).toContain("C minor");
    expect(names((eb?.play ?? []).flat())).toEqual(["Eb", "F", "G", "Ab", "Bb", "C", "D", "Eb"]);
    const play = (eb?.play ?? []).flat();
    expect(play.every((m, i) => i === 0 || m > (play[i - 1] as number))).toBe(true);
  });

  test("signature slugs", () => {
    expect(fifthsFromSlug("2-sharps")).toBe(2);
    expect(fifthsFromSlug("1-flat")).toBe(-1);
    expect(fifthsFromSlug("no-sharps-or-flats")).toBe(0);
    expect(fifthsFromSlug("8-sharps")).toBeNull();
    const two = describeToken({ kind: "term", value: "2-sharps" }, base);
    expect(two).toMatchObject({ variant: "signature", label: "2 sharps" });
    expect(two?.title).toContain("F♯ C♯");
    expect(two?.title).toContain("D major or B minor");
  });

  test("a glossary ID always wins over a slug reading", () => {
    const ctx = {
      ...base,
      terms: [
        {
          id: "term.m3",
          term: "em three",
          definition: "x",
          example: "",
          introducedBy: "U04.L01",
        } as unknown as TermEntry,
      ],
    };
    expect(describeToken({ kind: "term", value: "m3" }, ctx)?.variant).toBeUndefined();
  });
});

describe("token values in other notations", () => {
  test("Unicode accidentals and syllables become the grammar's spelling", () => {
    expect(canonicalTokenRaw("[[deg:♭3]]")).toBe("[[deg:b3]]");
    expect(canonicalTokenRaw("[[deg:me]]")).toBe("[[deg:b3]]");
    expect(canonicalTokenRaw("[[deg:sol]]")).toBe("[[deg:5]]");
    expect(canonicalTokenRaw("[[note:F♯4]]")).toBe("[[note:F#4]]");
    expect(canonicalTokenRaw("[[chord:B♭]]")).toBe("[[chord:Bb]]");
    expect(canonicalTokenRaw("[[bars:3-4]]")).toBe("[[bars:3-4]]");
    expect(canonicalTokenRaw("[[deg:xx]]")).toBe("[[deg:xx]]");
  });

  test("the markdown parser reads them as tokens, and keeps the raw text", () => {
    const doc = parseMarkdown("Sing [[deg:me]] then [[deg:♯4]], not [[deg:mo]].");
    expect(tokensIn(doc)).toEqual([
      { kind: "deg", value: "b3" },
      { kind: "deg", value: "#4" },
    ]);
    expect(JSON.stringify(doc)).toContain("[[deg:mo]]");
  });
});

// --- the subject ---------------------------------------------------------------------------------------

const failed = {
  exerciseId: "U03.L04/S5",
  exerciseVersion: 1,
  attemptNo: 1,
  firstAttempt: true,
  mode: "lesson",
  status: "fail",
  score: 0.5,
  adjustedScore: 0.5,
  dims: { pitch: { score: 0.5, weight: 1 } },
  constraints: [],
  diagnostics: [
    {
      id: "staff.wrong-pitch",
      severity: "error",
      params: { got: "F4", expected: "F#4" },
      where: { bar: 1, beat: 3 },
    },
  ],
  messages: [],
  assist: { rung: 0, revealed: false, tutorHints: 0 },
} as unknown as GradeResult;

const staffStep: TutorSubject = {
  thread: { subjectKind: "lesson", subjectId: "U03.L04" },
  title: "U03.L04 · Writing in G",
  tutorOpen: true,
  lessonId: "U03.L04",
  stepId: "S5",
  graded: true,
  passed: false,
  code: null,
  key: G,
  answer: { kind: "staff", notes: "G4:4 A4:4 B4:4 C5:4 | D5:2 E5:4 F4:4", clef: "treble", key: G },
  lastResult: failed,
  rung: 0,
};

beforeEach(() => {
  useTutorContext.setState({
    subject: null,
    availability: "ready",
    offReason: null,
    queue: [],
    notice: null,
    excluded: [],
    lenses: null,
  });
});

describe("answers on steps that are not code", () => {
  test("staff: the notes placed go as the turn's learner code, never the expected answer", () => {
    setSubject(staffStep);
    const r = askHint();
    expect(r.ok).toBe(true);
    const req = takeAsk()?.request;
    expect(TutorTurnRequestSchema.safeParse(req).success).toBe(true);
    expect(req?.learnerCode).toContain("Notes I placed on the staff (treble clef, key signature of G major)");
    expect(req?.learnerCode).toContain("G4:4 A4:4 B4:4 C5:4 | D5:2 E5:4 F4:4");
    expect(req?.learnerCode).not.toContain("F#4");
    // The grade goes whole; the server redacts it by its own rung before any model sees it.
    expect(req?.graderResult?.issues[0]?.expected).toBe("F#4");
  });

  test("staff key signature, sung, by ear and text answers read as the learner gave them", () => {
    expect(answerText({ kind: "staff", mode: "key-signature", notes: "F# C#", clef: "treble" })).toBe(
      "Accidentals I placed on the staff, in the order I placed them (treble clef):\nF# C#",
    );
    const sung: TutorAnswer = {
      kind: "sung",
      notes: [
        { target: "1 (do)", cents: 12 },
        { target: "3 (mi)", cents: -48.4 },
        { target: "5 (sol)", cents: null },
      ],
      tolCents: 50,
    };
    const s = answerText(sung);
    expect(s).toContain("graded within ±50¢");
    expect(s).toContain("note 1 (target 1 (do)): +12¢ sharp");
    expect(s).toContain("note 2 (target 3 (mi)): −48¢ flat");
    expect(s).toContain("note 3 (target 5 (sol)): no voice heard");
    // Echo mode: the targets are the question, so the host leaves them out.
    expect(answerText({ kind: "sung", notes: [{ cents: 3 }] })).toContain("note 1: +3¢ sharp");
    expect(answerText({ kind: "sung", notes: [], quiet: true })).toContain("Quiet mode");
    expect(answerText({ kind: "by-ear", code: 'n("0 2 4").scale("G4:major")', rate: 0.75 })).toBe(
      '// written by ear, listening at 0.75× speed\nn("0 2 4").scale("G4:major")',
    );
    expect(answerText({ kind: "text", prompt: "Which key has two sharps?", value: "D major" })).toBe(
      "Which key has two sharps?\nMy answer: D major",
    );
  });

  test("explain on a sung step sends the cents, and the answer chip can be left out", () => {
    setSubject({
      ...staffStep,
      thread: { subjectKind: "lesson", subjectId: "U03.L09" },
      lessonId: "U03.L09",
      stepId: "S4",
      answer: { kind: "sung", notes: [{ target: "5 (sol)", cents: -61 }], tolCents: 50 },
    });
    expect(askExplain().ok).toBe(true);
    expect(takeAsk()?.request.learnerCode).toContain("−61¢ flat");
    useTutorContext.setState({ excluded: ["answer"] });
    expect(askExplain().ok).toBe(true);
    expect(takeAsk()?.request.learnerCode).toBeUndefined();
  });

  test("chips: answer, key and labels", () => {
    const chips = chipsOf(staffStep, { degrees: true, solfege: false, noteNames: false });
    expect(chips.map((c) => c.id)).toEqual(["step", "key", "labels", "answer", "result", "hints"]);
    expect(chips.find((c) => c.id === "answer")?.label).toBe("Your staff · 7 notes");
    expect(chips.find((c) => c.id === "key")?.label).toBe("Key · G major");
    expect(chips.find((c) => c.id === "labels")?.label).toBe("Labels · degrees");
    // A step's own labels win over the lenses.
    const own = chipsOf({ ...staffStep, labels: { degrees: true, solfege: true, noteNames: false } }, null);
    expect(own.find((c) => c.id === "labels")?.label).toBe("Labels · degrees, solfège");
    const sig = chipsOf({
      ...staffStep,
      answer: { kind: "staff", mode: "key-signature", notes: "F# C# G#" },
    });
    expect(sig.find((c) => c.id === "answer")?.label).toBe("Your signature · 3 accidentals");
  });

  test("code written by ear has one chip, not a code chip beside it; left out, nothing is sent", () => {
    const code = 'mel: n("<[2@2 0@2] [2@2 0 4]>").scale("C4:major")';
    const byEar: TutorSubject = { ...staffStep, code, answer: { kind: "by-ear", code, rate: 0.75 } };
    const ids = chipsOf(byEar).map((c) => c.id);
    expect(ids).toContain("answer");
    expect(ids).not.toContain("code");
    expect(buildTurnRequest(byEar, "hint", "Give me a nudge.").learnerCode).toContain(code);
    expect(buildTurnRequest(byEar, "hint", "Give me a nudge.", ["answer"]).learnerCode).toBeUndefined();
    // Without an answer, the code chip is there and carries the code.
    expect(chipsOf({ ...byEar, answer: null }).map((c) => c.id)).toContain("code");
  });
});

describe("the key and the On screen line", () => {
  test("the key comes from the subject, else the code's first .scale()", () => {
    expect(keyFromCode('n("0 2").scale("D4:major")')).toEqual({ tonic: "D", mode: "major" });
    expect(keyFromCode('n("0").scale("<A3:minor C4:major>")')).toEqual({ tonic: "A", mode: "minor" });
    expect(keyFromCode('s("bd sd")')).toBeNull();
    expect(subjectKey({ code: 'n("0").scale("Eb4:major")' })).toEqual({ tonic: "Eb", mode: "major" });
    expect(subjectKey({ key: G, code: 'n("0").scale("Eb4:major")' })).toEqual(G);
  });

  test("the key and labels travel under the learner's words and display without them", () => {
    setLensState({ degrees: true, solfege: true, noteNames: false });
    const s: TutorSubject = {
      thread: { subjectKind: "sketch", subjectId: "sk_1" },
      title: "Sketch 014",
      tutorOpen: true,
      sketchId: "sk_1",
      code: 'n("0 2 4").scale("Bb3:major")',
      selection: 'n("0 2 4")',
    };
    const line = onScreenLine(s, useTutorContext.getState().lenses);
    expect(line).toBe(`${ON_SCREEN}key B♭ major; labels shown: degrees, solfège.`);
    const req = buildTurnRequest(
      s,
      "chat",
      "Why does this sound bright?",
      [],
      useTutorContext.getState().lenses,
    );
    expect(req.userText).toBe(
      `Why does this sound bright?\n\n${line}\n\nSelected code:\n\`\`\`\nn("0 2 4")\n\`\`\``,
    );
    expect(splitUserText(req.userText)).toEqual({
      own: "Why does this sound bright?",
      onScreen: "key B♭ major; labels shown: degrees, solfège.",
      selection: '```\nn("0 2 4")\n```',
    });
    expect(splitUserText("plain")).toEqual({ own: "plain", onScreen: null, selection: null });
    // A drum sketch with no lenses known adds nothing.
    expect(onScreenLine({ ...s, code: 's("bd sd")' }, null)).toBeNull();
  });
});

describe("references light the staff and the roll", () => {
  test("bars and notes are published for the Workbench", () => {
    const thread = { subjectKind: "sketch", subjectId: "sk_1" } as const;
    showBars(thread, 3, 4);
    const a = useTutorHighlight.getState().current;
    expect(a).toMatchObject({ kind: "bars", from: 3, to: 4 });
    showBars(thread, 3, 4);
    expect(useTutorHighlight.getState().current?.seq).toBe((a?.seq ?? 0) + 1);
    expect(barsToCycles(3, 4)).toEqual([2, 4]);
    expect(barsToCycles(5, 2)).toEqual([1, 5]);
    expect(noteToMidi("F#4")).toBe(66);
  });
});

describe("the chips sound what Strudel plays", () => {
  test("a key chip's scale and a degree chip's note equal .scale() on headless Strudel", async () => {
    const { midisOf } = await import("@oak/grader/testing");
    const eb = describeToken({ kind: "term", value: "e-flat-major" }, base);
    expect((eb?.play ?? []).flat()).toEqual(
      (await midisOf('n("0 1 2 3 4 5 6 7").scale("Eb4:major")', 1)) as number[],
    );
    const fiveInG = describeToken({ kind: "deg", value: "5" }, { ...base, key: G });
    expect(fiveInG?.play?.at(-1)).toEqual((await midisOf('n("4").scale("G3:major")', 1)) as number[]);
    const m3 = describeToken({ kind: "term", value: "minor-third" }, { ...base, key: G });
    expect(m3?.play?.flat().slice(0, 2)).toEqual((await midisOf('note("g3 bb3")', 1)) as number[]);
  }, 30_000);
});

describe("intervals named with a capital quality (Wave 3 review)", () => {
  test("[[term:M3]] is a major third, never lower-cased into a minor one", () => {
    expect(canonicalTokenRaw("[[term:M3]]")).toBe("[[term:major-3rd]]");
    expect(canonicalTokenRaw("[[term:P5]]")).toBe("[[term:perfect-5th]]");
    expect(canonicalTokenRaw("[[term:A4]]")).toBe("[[term:augmented-4th]]");
    expect(canonicalTokenRaw("[[term:P8]]")).toBe("[[term:perfect-8th]]");
    expect(canonicalTokenRaw("[[term:M2]]")).toBe("[[term:major-2nd]]");
    // Lower case is already a term ID: the minor third and the diminished fifth are left alone.
    expect(canonicalTokenRaw("[[term:m3]]")).toBe("[[term:m3]]");
    expect(canonicalTokenRaw("[[term:d5]]")).toBe("[[term:d5]]");
    const toks = tokensIn(parseMarkdown("[[term:M3]] [[term:m3]] [[term:P4]] [[term:A4]] [[term:M7]]"));
    expect(toks.map((t) => (t.kind === "term" ? intervalFromSlug(t.value) : null))).toEqual([
      "M3",
      "m3",
      "P4",
      "A4",
      "M7",
    ]);
    const m3 = describeToken({ kind: "term", value: "major-3rd" }, { ...base, key: G });
    expect(m3.aria).toBe("interval major 3rd");
    // Low, high, then both: four semitones apart.
    const [low, high, both] = m3.play ?? [];
    expect((high?.[0] ?? 0) - (low?.[0] ?? 0)).toBe(4);
    expect(both).toEqual([low?.[0], high?.[0]]);
  });
});
