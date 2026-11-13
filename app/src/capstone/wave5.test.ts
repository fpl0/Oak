// Wave 5 capstone reading, checked against the real headless grader and Strudel: the form strip and section anchors
// of C3's verse–chorus demo, which contrast axes the chorus differs on, the length read from the code, the lead
// sheet's pages and section marks, release honesty (c1), X2's bass → changes → melody order across sessions, its
// starter, and the version a review was asked about (c11).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { CapstoneCheckState, GradeResult, PhraseCheck, RubricRule, SongDef } from "@oak/content-kit";
import { formView, SONG_LADDER_MATCHERS } from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import { anchorsOf, anchorText, sectionOfRule, sectionRefAnchor } from "./anchors.ts";
import {
  C3_FAST,
  C3_FLAT_CHORUS,
  C3_FULL,
  C3_GROOVE,
  C4_FULL,
  C4_VERSE,
  C5_FULL,
  C5_NO_TURNAROUND,
  C5_STRAIGHT,
} from "./e2e/w5-pieces.ts";
import { chordLabelsOf, leadSheetOf } from "./LeadSheetCard.tsx";
import { reviewRequestText, versionOfRequest } from "./queries.ts";
import { analysePiece, capstone, gradePiece } from "./test-support.ts";
import {
  contrastFinding,
  contrastText,
  durationFinding,
  durationText,
  pieceForm,
  releaseGate,
  rowExtras,
  rubricUsesSections,
  sectionRefText,
} from "./wave5.ts";
import {
  bassFirst,
  capstoneRows,
  checkName,
  lockedText,
  revealedItems,
  rowLabel,
  songGivenFromDef,
  transcribeStarter,
} from "./x1/phrases.ts";
import { songOfDraft } from "./x1/song-of-draft.ts";

setDefaultTimeout(120_000);

const ruleOf = (id: string, kind: RubricRule["rule"]): RubricRule | undefined =>
  capstone(id).brief?.rubric.find((r) => r.rule === kind);
const ok = (r: GradeResult, rule: RubricRule | undefined) =>
  rule ? (r.rubric ?? []).find((x) => x.ruleId === rule.id)?.ok : undefined;

async function viewOf(code: string) {
  const a = await analysePiece("C3", code);
  return { ...a, view: formView(a.n, { code, bars: a.bars }) };
}

describe("C3: the form strip and the sections the rules read", () => {
  test("the arranged demo reads V C V C, 8 bars each, the chorus with more energy", async () => {
    const { view, bars } = await viewOf(C3_FULL);
    expect(bars).toBe(32);
    const form = pieceForm(view);
    expect(form.letters).toBe("A B A B");
    expect(form.sections.map((s) => [s.text, s.startBar, s.bars])).toEqual([
      ["Verse", 0, 8],
      ["Chorus", 8, 8],
      ["Verse", 16, 8],
      ["Chorus", 24, 8],
    ]);
    expect(form.problem).toBeNull();
    expect((form.sections[1]?.energy ?? 0) > (form.sections[0]?.energy ?? 1)).toBe(true);
    expect(form.sections[1]?.tracks).toContain("mel");
  });

  test("two parts that disagree about the sections: the strip says so instead of drawing a form", async () => {
    const bad = C3_FULL.replace(
      "bass: arrange([8, bassVerse], [8, bassChorus]",
      "bass: arrange([8, bassVerse], [4, bassChorus]",
    );
    const { view } = await viewOf(bad);
    const form = pieceForm(view);
    expect(form.sections).toEqual([]);
    expect(form.problem).not.toBeNull();
  });

  test("a section reference lands on its bars, named", async () => {
    const { view } = await viewOf(C3_FULL);
    const sections = pieceForm(view).sections;
    expect(sectionRefAnchor({ section: "chorus" }, sections, 32)).toEqual({
      from: 9,
      to: 16,
      label: "Chorus",
    });
    expect(sectionRefAnchor({ section: "verse", nth: 2 }, sections, 32)).toEqual({
      from: 17,
      to: 24,
      label: "Verse",
    });
    expect(sectionRefAnchor("last", sections, 32)).toMatchObject({ from: 25, to: 32 });
    expect(sectionRefAnchor({ bars: [12, 12] }, [], 24)).toEqual({ from: 12, to: 12 });
    expect(sectionRefAnchor({ section: "bridge" }, sections, 32)).toBeNull();
    expect(anchorText({ from: 9, to: 16, label: "Chorus" })).toBe("Chorus · bars 9–16");
    expect(sectionRefText({ section: "chorus", nth: 2 })).toBe("the second chorus");
    expect(sectionRefText({ bars: [12, 12] })).toBe("bar 12");
  });

  test("an unmet contrast points at the chorus; an unmet bar-12 rule at bar 12", () => {
    const sections = [
      { label: "verse", tag: "verse", text: "Verse", startBar: 0, bars: 8 },
      { label: "chorus", tag: "chorus", text: "Chorus", startBar: 8, bars: 8 },
    ];
    const contrast = {
      id: "contrast",
      label: "Chorus differs",
      required: true,
      skills: [],
      rule: "contrast",
      a: { section: "chorus" },
      b: { section: "verse" },
      axes: ["pitch", "density"],
      minAxes: 2,
    } as unknown as RubricRule;
    const bar12 = {
      id: "turnaround",
      label: "Bar 12 contains V",
      required: true,
      skills: [],
      rule: "contains-rn",
      rn: ["V"],
      min: 1,
      section: { bars: [12, 12] },
    } as unknown as RubricRule;
    expect(sectionOfRule(contrast, sections, 16)).toEqual({ from: 9, to: 16, label: "Chorus" });
    const a = anchorsOf([contrast, bar12], new Set(["contrast", "turnaround"]), null, 24, {}, sections);
    expect(a.contrast).toEqual({ from: 9, to: 16, label: "Chorus" });
    expect(a.turnaround).toEqual({ from: 12, to: 12 });
    expect(rubricUsesSections([contrast])).toBe(true);
    expect(rubricUsesSections([{ ...bar12, section: undefined } as RubricRule])).toBe(false);
    // C5's "bar 12" reads a bar window, not a section: no form strip asking a blues for a verse and a chorus.
    expect(rubricUsesSections([bar12])).toBe(false);
    expect(rubricUsesSections([{ ...bar12, section: { section: "verse" } } as unknown as RubricRule])).toBe(
      true,
    );
    expect(rubricUsesSections(capstone("C5").brief?.rubric ?? [])).toBe(false);
    expect(rubricUsesSections(capstone("C3").brief?.rubric ?? [])).toBe(true);
  });
});

describe("C3: contrast axes and the length, from the real grader", () => {
  const contrast = ruleOf("C3", "contrast");
  const duration = ruleOf("C3", "duration-sec");

  test("the groove alone: the chorus differs only in its chords, and the row says what else to try", async () => {
    if (!contrast) return;
    const r = await gradePiece("C3", C3_GROOVE);
    expect(ok(r, contrast)).toBe(false);
    const f = contrastFinding(contrast, r);
    expect(f?.axes.filter((x) => x.found).map((x) => x.axis)).toEqual(["harmony"]);
    expect(f?.found).toBe(1);
    expect(contrastText(f as NonNullable<typeof f>)).toMatch(/^Differs on 1 of 2 needed: chords\. Try /);
  });

  test("the full demo: met, and the axes it differs on are lit from the form view", async () => {
    if (!contrast) return;
    const r = await gradePiece("C3", C3_FULL);
    expect(ok(r, contrast)).toBe(true);
    const { view, analysis } = await viewOf(C3_FULL);
    const f = contrastFinding(contrast, r, view, analysis);
    const lit = f?.axes.filter((x) => x.found).map((x) => x.axis) ?? [];
    expect(lit).toEqual(expect.arrayContaining(["pitch", "harmony"]));
    expect((f?.found ?? 0) >= (f?.need ?? 99)).toBe(true);
    expect(contrastText(f as NonNullable<typeof f>)).toMatch(/^Differs on \d of 2 needed: /);
  });

  test("a chorus that is the verse again: nothing lit, two to change", async () => {
    if (!contrast) return;
    const r = await gradePiece("C3", C3_FLAT_CHORUS);
    expect(ok(r, contrast)).toBe(false);
    const f = contrastFinding(contrast, r);
    expect(f?.found).toBe(0);
    expect(contrastText(f as NonNullable<typeof f>)).toMatch(
      /^No difference yet between the chorus and the verse\./,
    );
  });

  test("the length is read from the code: 96 s at 80 BPM, 64 s at 120 BPM with the bars still to add", async () => {
    if (!duration) return;
    const slow = await gradePiece("C3", C3_FULL);
    const fast = await gradePiece("C3", C3_FAST);
    expect(ok(slow, duration)).toBe(true);
    expect(ok(fast, duration)).toBe(false);
    const a = await analysePiece("C3", C3_FAST);
    const f = durationFinding(duration, {
      bars: a.bars,
      bpm: a.analysis.bpm,
      durationSec: a.analysis.durationSec,
      meter: "4/4",
    });
    expect(f).toMatchObject({ bars: 32, moreBars: 13 });
    expect(Math.round(f?.seconds ?? 0)).toBe(64);
    expect(durationText(f as NonNullable<typeof f>)).toBe(
      "1:04 of at least 1:30 (32 bars at 120 BPM). 13 more bars at this tempo, or a slower tempo.",
    );
    const extras = rowExtras([duration], fast, {
      bars: a.bars,
      bpm: a.analysis.bpm,
      durationSec: a.analysis.durationSec,
      meter: "4/4",
      form: null,
    });
    expect(extras[duration.id]?.kind).toBe("duration");
  });
});

describe("C3.S3: the lead sheet of the arranged piece", () => {
  test("the melody with its chords, a label and a double bar at each section, a page of 16 bars at a time", async () => {
    const { n, bars, analysis, view } = await viewOf(C3_FULL);
    const labels = chordLabelsOf(analysis);
    expect(labels[0]).toMatchObject({ bar: 0, beat: 1, symbol: "C" });
    expect(labels.find((l) => l.bar === 8)?.symbol).toBe("F");
    const pages = leadSheetOf(
      {
        n,
        bars,
        key: { tonic: "C", mode: "major" },
        meter: "4/4",
        bpm: 80,
        analysis,
        form: pieceForm(view),
        title: "Demo",
      },
      940,
    );
    expect(pages.length).toBe(2);
    expect(pages[0]?.bars).toBe(16);
    expect(pages[0]?.input.sections?.map((m) => [m.bar, m.text])).toEqual([
      [0, "Verse"],
      [8, "Chorus"],
    ]);
    expect(pages[1]?.input.sections?.map((m) => [m.bar, m.text])).toEqual([
      [16, "Verse"],
      [24, "Chorus"],
    ]);
    expect(pages[0]?.input.events.length).toBeGreaterThan(10);
  });

  test("no melody yet: no pages, the card explains instead", async () => {
    const { n, bars, analysis, view } = await viewOf(C3_GROOVE);
    expect(
      leadSheetOf(
        { n, bars, key: null, meter: "4/4", bpm: 80, analysis, form: pieceForm(view), title: "Demo" },
        940,
      ),
    ).toEqual([]);
  });
});

describe("C4 and C5 pieces against their briefs (the rules the grader builds)", () => {
  test("C4: the verse alone leaves the major V and the ending open; the full ballad meets every rule", async () => {
    const verse = await gradePiece("C4", C4_VERSE);
    const full = await gradePiece("C4", C4_FULL);
    const v = ruleOf("C4", "contains-rn");
    const end = ruleOf("C4", "ends-on-degree");
    expect(ok(verse, v)).toBe(false);
    expect(ok(verse, end)).toBe(false);
    expect(ok(full, v)).toBe(true);
    expect(ok(full, end)).toBe(true);
    expect(ok(full, ruleOf("C4", "progression"))).toBe(true);
  });

  test("C5: swung hats pass the swing rule, straight ones say which line to swing", async () => {
    const swing = ruleOf("C5", "swing");
    if (!swing) return;
    expect(ok(await gradePiece("C5", C5_FULL), swing)).toBe(true);
    const straight = await gradePiece("C5", C5_STRAIGHT);
    expect(ok(straight, swing)).toBe(false);
    expect(String((straight.rubric ?? []).find((x) => x.ruleId === swing.id)?.diag?.params.detail)).toContain(
      "hats",
    );
  });

  test("C5: a missing turnaround is anchored to bar 12 (the Wave 5 rule shape, when the brief has it)", async () => {
    const turn = capstone("C5").brief?.rubric.find(
      (r) => r.rule === "contains-rn" && "section" in r && r.section !== undefined,
    );
    if (!turn) return;
    const r = await gradePiece("C5", C5_NO_TURNAROUND);
    expect(ok(r, turn)).toBe(false);
    const a = anchorsOf([turn], new Set([turn.id]), null, 24, {}, []);
    expect(a[turn.id]).toEqual({ from: 12, to: 12 });
  });
});

describe("release honesty (c1)", () => {
  const base = {
    liveReady: true,
    checkedPassingCode: null,
    code: "x",
    checkedHere: false,
    serverChanged: undefined,
    serverPassed: false,
    editedSinceLoad: false,
    released: false,
  };
  test("released only for the code a passing check graded", () => {
    expect(releaseGate({ ...base, checkedPassingCode: "x", checkedHere: true }).kind).toBe("ready");
    expect(releaseGate({ ...base, checkedPassingCode: "old", checkedHere: true }).kind).toBe("check-again");
    expect(releaseGate({ ...base, checkedHere: true }).kind).toBe("check-again");
    expect(releaseGate({ ...base, liveReady: false }).kind).toBe("not-ready");
  });
  test("opened again: the server's checked version counts until the draft is edited", () => {
    expect(releaseGate({ ...base, serverChanged: false, serverPassed: true }).kind).toBe("ready");
    expect(releaseGate({ ...base, serverChanged: true, serverPassed: true }).kind).toBe("check-again");
    expect(
      releaseGate({ ...base, serverChanged: false, serverPassed: true, editedSinceLoad: true }).kind,
    ).toBe("check-again");
    expect(releaseGate({ ...base, serverChanged: false, serverPassed: false }).kind).toBe("check-again");
  });
  test("a revision of a released track is not re-checked", () => {
    expect(releaseGate({ ...base, released: true }).kind).toBe("ready");
  });
});

// --- X2 ------------------------------------------------------------------------------------------

/** A 12-bar strain in G with swing given (made up for the test; the real answer keys are author:repertoire's). */
const STRAIN = {
  id: "song.test-strain",
  title: "Test Strain",
  year: 1914,
  status: "US-PD",
  provenance: { source: "test", year: 1914 },
  verifiedBy: "test",
  key: { tonic: "G", mode: "major" },
  meter: "4/4",
  bpm: 96,
  swing: { subdivision: 8, amount: 1 / 3 },
  form: "12-bar blues",
  answerKey: {
    bars: 12,
    code: "",
    layers: {
      bass: 'note("<g1 c2 g1 g1 c2 c2 g1 g1 d2 c2 g1 d2>")',
      chords: 'chord("<G7 C7 G7 G7 C7 C7 G7 G7 D7 C7 G7 D7>").voicing()',
      melody:
        'note("<[b4 bb4 g4 ~] g4 [b4 bb4 g4 d5] d5 [e5 eb5 c5 ~] c5 [b4 bb4 g4 ~] g4 [a4 a4 a4 g4] e4 g4 ~>")',
    },
    chords: [],
    phrases: [
      [1, 4],
      [5, 8],
      [9, 12],
    ],
  },
} as unknown as SongDef;

const X2_S1: PhraseCheck[] = [
  { id: "bass", phrase: [1, 3], layer: "bass", matcher: SONG_LADDER_MATCHERS.bass, pass: 0.9 },
  {
    id: "changes",
    phrase: [1, 3],
    layer: "chords",
    matcher: SONG_LADDER_MATCHERS.changes,
    pass: 0.85,
    after: ["bass"],
  },
];
const X2_S2: PhraseCheck[] = [1, 2, 3].map((p) => ({
  id: `melody-${p}`,
  phrase: p,
  layer: "melody" as const,
  matcher: SONG_LADDER_MATCHERS.melody,
  pass: 0.85,
  after: ["changes"],
}));

describe("X2: bass, then changes, then melody (contracts §6.6)", () => {
  const sessions = (server: CapstoneCheckState[][] = [[], []]) => [
    { checks: X2_S1, server: server[0] ?? [] },
    { checks: X2_S2, server: server[1] ?? [] },
  ];
  test("only the bass is open at first; the changes and every melody line wait, saying for what", () => {
    const [s1, s2] = capstoneRows(sessions(), {});
    expect(s1?.map((r) => [r.key, r.open, r.waitsFor])).toEqual([
      ["bass", true, null],
      ["changes", false, "the bass"],
    ]);
    expect(s2?.every((r) => !r.open && r.waitsFor === "the changes")).toBe(true);
    expect(lockedText(s1?.[1] as NonNullable<(typeof s1)[number]>)).toBe("Opens after the bass.");
    expect(rowLabel(s1?.[1] as NonNullable<(typeof s1)[number]>)).toBe("Phrases 1–3 · changes");
  });
  test("the bass passed opens the changes; the changes passed open the melody of session 2", () => {
    const local = { bass: { score: 0.95, passed: true, revealed: false, attempts: 1 } };
    const [s1, s2] = capstoneRows(sessions(), local);
    expect(s1?.[1]?.open).toBe(true);
    expect(s2?.some((r) => r.open)).toBe(false);
    const both = { ...local, changes: { score: 0.9, passed: true, revealed: false, attempts: 2 } };
    const [, t2] = capstoneRows(sessions(), both);
    expect(t2?.every((r) => r.open)).toBe(true);
  });
  test("the server's record counts: a revealed bass opens the changes and is named in the liner notes", () => {
    const revealed: CapstoneCheckState = {
      checkId: "bass",
      stage: null,
      score: 0,
      passed: false,
      revealed: true,
      attempts: 1,
      open: true,
    } as unknown as CapstoneCheckState;
    const [s1] = capstoneRows(sessions([[revealed], []]), {});
    expect(s1?.[1]?.open).toBe(true);
    expect(revealedItems(s1 ?? [])).toEqual(["the bass line"]);
  });
  test("names and the bass-first starter", async () => {
    expect(checkName(X2_S1[0] as PhraseCheck)).toBe("the bass");
    expect(checkName(X2_S1[1] as PhraseCheck)).toBe("the changes");
    expect(bassFirst([...X2_S1, ...X2_S2])).toBe(true);
    const g = songGivenFromDef(STRAIN);
    expect(g).toMatchObject({ bars: 12, swing: true, pickupBeats: null, bpm: 96 });
    const code = transcribeStarter([...X2_S1, ...X2_S2], STRAIN);
    expect(code).toMatch(/^bass: /m);
    expect(code).toMatch(/^chords: /m);
    expect(code).toMatch(/^melody: /m);
    expect(code).toContain("Swing 8ths");
    // It runs: the tempo, a bass in its key, a placeholder a bar, and the melody (degrees, "degree − 1").
    const ev = await evalHeadless(code, 12);
    expect(ev.cps).toBeCloseTo(96 / 240, 5);
    expect(ev.tracks).toEqual(expect.arrayContaining(["bass", "melody"]));
    expect(ev.events.filter((e) => e.track === "bass" && e.midi !== null).length).toBeGreaterThan(0);
  });
});

describe("a review names the version it was asked about (c11)", () => {
  test("the request text carries the version, and reads back", () => {
    expect(reviewRequestText(3, true)).toBe("Please review version 3 of my transcription.");
    expect(reviewRequestText(null, false)).toBe("Please review my draft.");
    expect(versionOfRequest(reviewRequestText(12, false))).toBe(12);
    expect(versionOfRequest("Please review my draft.")).toBeNull();
  });
});

describe("integration: the song an X2 draft is of", () => {
  const X2 = { song: ["song.st-louis-blues", "song.careless-love"] as never };
  test("its tag first; else the first offered song whose answer key is written; else the first offered", () => {
    expect(songOfDraft(X2, ["song.st-louis-blues"], ["song.careless-love"])).toBe("song.st-louis-blues");
    // A seeded or untagged draft opens on the song the Start page would pick, never on an unwritten one.
    expect(songOfDraft(X2, [], ["song.careless-love"])).toBe("song.careless-love");
    expect(songOfDraft(X2, ["flavour.pop"], [])).toBe("song.st-louis-blues");
    expect(songOfDraft({ song: [] as never }, [], [])).toBeNull();
  });
});
