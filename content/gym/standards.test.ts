// Ladder L8 items (content/gym/standards.ts) through the grader's standard-ladder entry points (`gradeFormMap`,
// `gradeStandardLadder`; contracts §2.9, §6.6 CF-T): the form map and every section of every stage of every item
// are graded exactly right when answered with the song's answer key (pass, score 1), and wrong with a diagnostic
// that names it when one bar of the check's own section is changed; the changes stage gives nothing for a right
// root with the wrong quality (d11) and every code stage refuses another key than the recording's (d12). Also:
// which standards can be cut (complete entries only), the order the stages open, what is given at each stage,
// status ("Being checked"), the pool after CF-T, and determinism.
//
// None of the three CF-T standards has an answer key while this is written (author:repertoire writes them in the
// same wave), so the stage-by-stage proof runs on a 32-bar AABA fixture written the way a standard's key is, and
// then on every real standard of the L8 pool whose `song.ts` is complete (the table at the end says which were).
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { defineSong, type SongDef, type UnlockableId } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { PENDING_VERIFIER } from "../repertoire/fragment.ts";
import { songById } from "../repertoire/index.ts";
import { toolbox } from "../toolbox.ts";
import { LADDER_STAGE_PASS, ladder } from "./ladder.ts";
import { loadRepertoireSongs, type SongRealism } from "./songs.ts";
import {
  buildStandardLadderItem,
  nextStandardCheck,
  openStandardStage,
  STANDARD_PASS,
  STANDARD_SONG_IDS,
  STANDARD_STAGES,
  type StandardCheck,
  type StandardLadderPlan,
  stageChecks,
  standardCheckBars,
  standardCheckKey,
  standardCheckOpen,
  standardGivenAt,
  standardLadderDone,
  standardLadderGaps,
  standardLadderPool,
  standardLadderStatus,
} from "./standards.ts";
import { cycles, itemAt, itemStartingAt } from "./test-cycles.ts";

setDefaultTimeout(240_000);
await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
const ctx = {
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: {
    profile: "graded" as const,
    unlocked: new Set(toolbox.map((t) => t.id)) as Set<UnlockableId>,
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
};
type CodeCheck = StandardCheck & { stage: "bass" | "changes" | "melody"; phrase: number };
const grade = (plan: StandardLadderPlan, check: CodeCheck, code: string) =>
  grader.gradeStandardLadder({ item: check, song: plan.song, code, ctx });

// --- the fixture: a 32-bar AABA chorus in C, swing 8ths, sevenths in the changes, two chords in bars 7, 15, 31 --

const CH: Record<string, string> = {
  C: "[c3,e3,g3]",
  Am7: "[a2,c3,e3,g3]",
  Dm7: "[d3,f3,a3,c4]",
  G7: "[g2,b2,d3,f3]",
  A7: "[a2,c#3,e3,g3]",
  C7: "[c3,e3,g3,bb3]",
  F: "[f3,a3,c4]",
  Fm: "[f3,ab3,c4]",
  D7: "[d3,f#3,a3,c4]",
};
const ROOT: Record<string, number> = { C: 0, Am7: 5, Dm7: 1, G7: 4, A7: 5, C7: 0, F: 3, Fm: 3, D7: 1 };
const A_CHORDS = [["C"], ["Am7"], ["Dm7"], ["G7"], ["C"], ["A7"], ["Dm7", "G7"], ["C"]];
const A2_CHORDS = [...A_CHORDS.slice(0, 7), ["C7"]];
const B_CHORDS = [["F"], ["Fm"], ["C"], ["A7"], ["D7"], ["D7"], ["G7"], ["G7"]];
const BARS = [...A_CHORDS, ...A2_CHORDS, ...B_CHORDS, ...A_CHORDS];
const A_TUNE = [
  "[2 2 4 2]",
  "[0@3 ~]",
  "[1 1 3 1]",
  "[-1@3 ~]",
  "[2 2 4 2]",
  "[4@2 2@2]",
  "[3 1 4 3]",
  "[0@3 ~]",
];
const B_TUNE = [
  "[5 5 3 5]",
  "[5b@3 ~]",
  "[4 4 2 4]",
  "[4@3 ~]",
  "[5 5 3# 5]",
  "[3#@3 ~]",
  "[4 3 1 -1]",
  "[1@3 ~]",
];
const TUNE = [...A_TUNE, ...A_TUNE, ...B_TUNE, ...A_TUNE];
const chordsLine = `note("<${BARS.map((b) => (b.length === 1 ? CH[b[0] as string] : `[${b.map((c) => CH[c]).join(" ")}]`)).join(" ")}>").s("piano").gain(.6)`;
const bassLine = `n("<${BARS.map((b) => (b.length === 1 ? String(ROOT[b[0] as string]) : `[${b.map((c) => ROOT[c]).join(" ")}]`)).join(" ")}>").scale("C2:major").s("upright")`;
const melLine = `n("<${TUNE.join(" ")}>").scale("C4:major").s("piano")`;
const SECTIONS: { label: string; bars: [number, number] }[] = [
  { label: "A", bars: [1, 8] },
  { label: "A", bars: [9, 16] },
  { label: "B", bars: [17, 24] },
  { label: "A", bars: [25, 32] },
];
/** A test fixture only, under the id of an L8 repertoire entry: never shipped, never a learner's item. */
const FIXTURE: SongDef = defineSong({
  id: "song.aint-she-sweet" as SongDef["id"],
  title: "A 32-bar chorus (test fixture)",
  year: 1927,
  status: "US-PD",
  provenance: { source: "test fixture, never shipped", year: 1927 },
  verifiedBy: PENDING_VERIFIER,
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: 132,
  swing: { subdivision: 8, amount: 1 / 3 },
  form: "AABA",
  answerKey: {
    bars: 32,
    code: ["setcpm(132/4)", "", `mel: ${melLine}`, `bass: ${bassLine}`, `chords: ${chordsLine}`].join("\n"),
    layers: { melody: melLine, bass: bassLine, chords: chordsLine },
    chords: BARS.flatMap((b, i) =>
      b.map((symbol, j) => ({ bar: i + 1, beat: j === 0 ? 1 : 3, symbol: symbol.replace("maj7", "^7") })),
    ),
    phrases: SECTIONS.map((s) => s.bars),
    sections: SECTIONS,
  },
});

const LABEL = { bass: "bass", changes: "chords", melody: "mel" } as const;
/** The answer key with `n` bars of the check's own section changed, starting at its second bar. */
function barsWrong(plan: StandardLadderPlan, check: CodeCheck, n = 1): string {
  let code = plan.song.answerKey.code;
  const [from] = standardCheckBars(plan, check);
  const offset = plan.song.pickup ? 0 : -1;
  for (let k = 0; k < n; k++) {
    const items = cycles(code, LABEL[check.stage]);
    // From the section's second bar, every other bar; a bar inside a tied group moves on to the next that starts.
    let i = from + 1 + 2 * k + offset;
    while (!itemStartingAt(items, i) && i < from + 8 + offset) i++;
    const item = itemStartingAt(items, i) as { at: number; text: string };
    let text: string;
    if (check.stage === "changes") {
      // Another chord of the song on another root (never the neighbour's, so the bar stays a slot of its own).
      const other = items.find(
        (x) =>
          x.text !== item.text &&
          x.text !== itemAt(items, i - 1)?.text &&
          x.text !== itemAt(items, i + 1)?.text &&
          !x.text.includes(" "),
      ) as { text: string };
      text = other.text;
    } else {
      const num = /-?\d+/.exec(item.text) as RegExpExecArray;
      text = `${item.text.slice(0, num.index)}${Number(num[0]) + 1}${item.text.slice(num.index + num[0].length)}`;
    }
    code = `${code.slice(0, item.at)}${text}${code.slice(item.at + item.text.length)}`;
  }
  return code;
}

/** The measured table (printed at the end): one row per song and stage, over all its sections. */
const measured: string[] = [];
async function checkItem(plan: StandardLadderPlan): Promise<void> {
  // The form map: the key's own answer, by letters and by any names of the same shape.
  const key = plan.formKey;
  const own = grader.gradeFormMap({ sections: key.labels, bars: key.bars }, plan.song);
  expect([plan.songId, "form", own.score, own.passed, own.expected]).toEqual([
    plan.songId,
    "form",
    1,
    true,
    key.letters,
  ]);
  const renamed = key.labels.map((l) => `part-${l}`);
  expect(grader.gradeFormMap({ sections: renamed, bars: key.bars }, plan.song).passed).toBe(true);
  // One section starting a bar late, and one section mislabelled: each fails and names the section.
  const late = key.bars.map((b, i) => (i === 1 ? b + 1 : b));
  const moved = grader.gradeFormMap({ sections: key.labels, bars: late }, plan.song);
  expect([plan.songId, moved.passed, moved.score < 1, moved.sections[1]?.startOk]).toEqual([
    plan.songId,
    false,
    true,
    false,
  ]);
  const flat = key.labels.map(() => key.labels[0] as string);
  if (new Set(key.labels).size > 1) {
    const same = grader.gradeFormMap({ sections: flat, bars: key.bars }, plan.song);
    expect([plan.songId, same.passed, same.sections.some((s) => !s.labelOk)]).toEqual([
      plan.songId,
      false,
      true,
    ]);
  }
  measured.push(
    `| ${plan.songId} | R${plan.realism} | form | 1 | ${own.score.toFixed(3)} | ${moved.score.toFixed(3)} |`,
  );

  for (const stage of ["bass", "changes", "melody"] as const) {
    let okMin = 1;
    let wrongMax = 0;
    const checks = stageChecks(plan, stage) as CodeCheck[];
    for (const c of checks) {
      const where = [plan.songId, plan.realism, standardCheckKey(c)];
      const ok = await grade(plan, c, plan.song.answerKey.code);
      expect([...where, ok.status, ok.score, grader.standardLadderPassed(stage, ok)]).toEqual([
        ...where,
        "pass",
        1,
        true,
      ]);
      const wrong = await grade(plan, c, barsWrong(plan, c));
      okMin = Math.min(okMin, ok.score);
      wrongMax = Math.max(wrongMax, wrong.score);
      expect([...where, wrong.score < 1]).toEqual([...where, true]);
      expect([...where, wrong.diagnostics.some((d) => !d.id.startsWith("pass."))]).toEqual([...where, true]);
      // The change is in this section only: every other section of the stage still scores 1.
      const other = checks.find((x) => x.phrase !== c.phrase) as CodeCheck;
      const untouched = await grade(plan, other, barsWrong(plan, c));
      expect([...where, standardCheckKey(other), untouched.score]).toEqual([
        ...where,
        standardCheckKey(other),
        1,
      ]);
    }
    measured.push(
      `| ${plan.songId} | R${plan.realism} | ${stage} | ${checks.length} | ${okMin.toFixed(3)} | ${wrongMax.toFixed(3)} |`,
    );
  }
}

const songs = await loadRepertoireSongs();

describe("L8: the fixture's item", () => {
  const plan = buildStandardLadderItem(FIXTURE, { realism: 1, seed: 4 }) as StandardLadderPlan;
  test("the item: the form map first, then bass, changes and melody section by section; the givens never show the form", () => {
    expect(standardLadderGaps(FIXTURE)).toEqual([]);
    expect(plan.stages).toEqual(["form", "bass", "changes", "melody"]);
    expect(plan.checks.map(standardCheckKey)).toEqual([
      "lad.8.aint-she-sweet.form",
      ...["bass", "changes", "melody"].flatMap((s) =>
        [1, 2, 3, 4].map((i) => `lad.8.aint-she-sweet.${s}.${i}`),
      ),
    ]);
    expect(plan.formKey).toEqual({ labels: ["A", "A", "B", "A"], bars: [1, 9, 17, 25], letters: "AABA" });
    expect(plan.formTask).toEqual({ bars: 32, vocabulary: "letters", boundaries: "asked", pass: 1 });
    expect(plan.given).toEqual({
      bpm: 132,
      meter: "4/4",
      key: { tonic: "C", mode: "major" },
      pickup: null,
      bars: 32,
      feel: "Swing 8ths",
      harmonicRhythm: { chordsPerBar: 1, twoChordBars: [7, 15, 31] },
    });
    // Nothing the learner is given names a section; the chart's slots arrive with the changes.
    expect(JSON.stringify(plan.given)).not.toContain("AABA");
    expect(JSON.stringify(plan.formTask)).not.toContain("AABA");
    expect(standardGivenAt(plan, "form").harmonicRhythm).toBeNull();
    expect(standardGivenAt(plan, "bass").harmonicRhythm).toBeNull();
    expect(standardGivenAt(plan, "changes").harmonicRhythm).toEqual({
      chordsPerBar: 1,
      twoChordBars: [7, 15, 31],
    });
    expect(plan.performance).toMatchObject({
      target: { bass: "bass", changes: "chords", melody: "mel" },
      songSwing: { subdivision: 8, amount: 1 / 3 },
      swung: false,
      vocalLead: null,
    });
    expect(standardCheckBars(plan, plan.checks[2] as StandardCheck)).toEqual([9, 16]);
  });
  test("the stages open in order; a revealed (recorded) stage opens the next; a graded pass needs every check passed", () => {
    const recorded = new Set<string>();
    expect(openStandardStage(plan, recorded)).toBe("form");
    const bass1 = stageChecks(plan, "bass")[0] as StandardCheck;
    const changes1 = stageChecks(plan, "changes")[0] as StandardCheck;
    expect(standardCheckOpen(plan, plan.checks[0] as StandardCheck, recorded)).toBe(true);
    expect(standardCheckOpen(plan, bass1, recorded)).toBe(false);
    recorded.add("lad.8.aint-she-sweet.form");
    expect(openStandardStage(plan, recorded)).toBe("bass");
    expect(standardCheckOpen(plan, bass1, recorded)).toBe(true);
    expect(standardCheckOpen(plan, changes1, recorded)).toBe(false);
    for (const c of stageChecks(plan, "bass").slice(0, 3)) recorded.add(standardCheckKey(c));
    // Three of four bass sections: the changes stay closed.
    expect(standardCheckOpen(plan, changes1, recorded)).toBe(false);
    expect(nextStandardCheck(plan, recorded)).toMatchObject({ stage: "bass", phrase: 4 });
    recorded.add("lad.8.aint-she-sweet.bass.4");
    expect(openStandardStage(plan, recorded)).toBe("changes");
    expect(standardCheckOpen(plan, changes1, recorded)).toBe(true);
    for (const c of plan.checks) recorded.add(standardCheckKey(c));
    expect(openStandardStage(plan, recorded)).toBeNull();
    expect(nextStandardCheck(plan, recorded)).toBeNull();
    expect(standardLadderDone(plan, recorded)).toBe(true);
    const oneRevealed = new Set([...recorded].filter((k) => k !== "lad.8.aint-she-sweet.melody.3"));
    expect(standardLadderDone(plan, oneRevealed)).toBe(false);
  });
  test("deterministic in (song, realism, seed); realism changes the performance only, R4 puts the tune on a vocal lead", () => {
    expect(buildStandardLadderItem(FIXTURE, { realism: 1, seed: 4 })).toEqual(plan);
    for (const realism of [0, 1, 2, 3, 4] as SongRealism[]) {
      const p = buildStandardLadderItem(FIXTURE, { realism, seed: 7 }) as StandardLadderPlan;
      expect(p.reference).toBe(plan.reference);
      expect(p.given).toEqual(plan.given);
      expect(p.checks).toEqual(plan.checks);
      expect(p.performance.songSwing).toEqual({ subdivision: 8, amount: 1 / 3 });
      expect(p.performance.vocalLead).toBe(realism === 4 ? "choir" : null);
    }
    expect(
      (buildStandardLadderItem(FIXTURE, { realism: 4, seed: 8 }) as StandardLadderPlan).performance.vocalLead,
    ).toBe("tenor");
  });
  test("every stage is graded exactly right with its key and wrong when one bar of its section is changed", async () => {
    for (const realism of [0, 2, 4] as SongRealism[])
      await checkItem(buildStandardLadderItem(FIXTURE, { realism, seed: 4 }) as StandardLadderPlan);
  });
  test("the marks: two wrong bars of eight fail the bass (0.90); one wrong bar passes the changes (0.85), two fail them", async () => {
    // The bass is scored note by note with part credit for a near miss (the L6 bass matcher): one wrong note of
    // the section's nine leaves it above 0.90, two bars wrong do not.
    const bass = stageChecks(plan, "bass")[0] as CodeCheck;
    const oneBass = await grade(plan, bass, barsWrong(plan, bass));
    expect(oneBass.score).toBeLessThan(1);
    expect(oneBass.score).toBeGreaterThan(0.9);
    const twoBass = await grade(plan, bass, barsWrong(plan, bass, 2));
    expect([twoBass.score < 0.9, grader.standardLadderPassed("bass", twoBass)]).toEqual([true, false]);
    const changes = stageChecks(plan, "changes")[0] as CodeCheck;
    const one = await grade(plan, changes, barsWrong(plan, changes));
    expect([one.score, grader.standardLadderPassed("changes", one)]).toEqual([0.875, true]);
    const two = await grade(plan, changes, barsWrong(plan, changes, 2));
    expect([two.score, grader.standardLadderPassed("changes", two)]).toEqual([0.75, false]);
  });
  test("d11: a right root with the wrong quality earns nothing for its bar (G7 as a plain G, Am7 as A7)", async () => {
    const changes = stageChecks(plan, "changes")[0] as CodeCheck;
    const code = plan.song.answerKey.code;
    const triad = code.replace(CH.G7 as string, "[g2,b2,d3]");
    const plain = await grade(plan, changes, triad);
    expect(plain.score).toBe(0.875);
    const major = code.replace(CH.Am7 as string, CH.A7 as string);
    const quality = await grade(plan, changes, major);
    expect(quality.score).toBe(0.875);
    expect(quality.diagnostics.some((d) => /harmony\./.test(d.id))).toBe(true);
  });
  test("d12: the answer in another key than the recording's fails every code stage and names both keys", async () => {
    const moved = plan.song.answerKey.code
      .replace('scale("C4:major")', 'scale("D4:major")')
      .replace('scale("C2:major")', 'scale("D2:major")');
    for (const stage of ["bass", "melody"] as const) {
      const c = stageChecks(plan, stage)[0] as CodeCheck;
      const res = await grade(plan, c, moved);
      expect([stage, res.status === "pass"]).toEqual([stage, false]);
      expect([stage, JSON.stringify(res.diagnostics)]).toEqual([stage, expect.stringContaining("D major")]);
    }
  });
});

describe("L8: which standards can be cut, and the pool", () => {
  test("the pool is the three CF-T standards of the repertoire; a standard with gaps is never an item", () => {
    const l8 = ladder.find((l) => l.level === 8);
    expect(l8?.pool).toEqual([...STANDARD_SONG_IDS]);
    expect(l8?.layers).toEqual(["form", "bass", "chords", "melody"]);
    for (const id of STANDARD_SONG_IDS) expect(songById.get(id)?.ladder).toBe(8);
    // The stage marks are the grader's.
    expect(STANDARD_PASS).toEqual(grader.STANDARD_LADDER_PASS);
    expect([...STANDARD_STAGES]).toEqual([...grader.STANDARD_LADDER_STAGES]);
    expect(LADDER_STAGE_PASS[8]).toEqual(STANDARD_PASS);
    for (const song of songs.filter((s) => songById.get(s.id)?.ladder === 8)) {
      const gaps = standardLadderGaps(song);
      expect([song.id, buildStandardLadderItem(song) === null]).toEqual([song.id, gaps.length > 0]);
    }
  });
  test("gaps are named: no sections, sections that do not cover the tune, phrases cut elsewhere, a missing layer, another level", () => {
    const k = FIXTURE.answerKey;
    const withKey = (over: Partial<SongDef["answerKey"]>): SongDef => ({
      ...FIXTURE,
      answerKey: { ...k, ...over },
    });
    const noSections = { ...FIXTURE, answerKey: { ...k, sections: undefined } } as unknown as SongDef;
    expect(standardLadderGaps(noSections)).toEqual(["no sections (the form map has no answer)"]);
    expect(standardLadderGaps(withKey({ sections: SECTIONS.slice(0, 3) }))).toEqual([
      "the sections end at bar 24, the tune at bar 32",
      "the phrases do not cut the tune at its sections",
    ]);
    expect(
      standardLadderGaps(withKey({ sections: [SECTIONS[0], SECTIONS[2], SECTIONS[3]] as typeof SECTIONS })),
    ).toContain("the sections leave a gap or overlap at bar 9");
    expect(
      standardLadderGaps(
        withKey({
          phrases: [
            [1, 16],
            [17, 32],
          ],
        }),
      ),
    ).toEqual(["the phrases do not cut the tune at its sections"]);
    const { bass: _bass, ...noBass } = k.layers;
    expect(standardLadderGaps(withKey({ layers: noBass }))).toEqual(["no bass layer"]);
    expect(standardLadderGaps(withKey({ chords: [] }))).toEqual(["no chord chart"]);
    expect(standardLadderGaps({ ...FIXTURE, id: "song.careless-love" as SongDef["id"] })).toEqual([
      "the repertoire lists it for L6",
    ]);
    expect(buildStandardLadderItem(noSections)).toBeNull();
  });
  test('status: "Being checked" until a human has verified the key; the song CF-T used is skipped', () => {
    expect(standardLadderStatus(FIXTURE, { completed: new Set() })).toEqual({
      status: "locked",
      lockedReason: "Being checked",
    });
    expect(standardLadderStatus(FIXTURE, { completed: new Set(), allowUnverified: true })).toEqual({
      status: "open",
      lockedReason: null,
    });
    const verified: SongDef = { ...FIXTURE, verifiedBy: "A. Human, 2026-11-14" };
    expect(standardLadderStatus(verified, { completed: new Set() }).status).toBe("open");
    const second: SongDef = { ...FIXTURE, id: "song.five-foot-two" as SongDef["id"] };
    expect(standardLadderPool([FIXTURE, second]).map((s) => s.id as string)).toEqual([
      "song.five-foot-two",
      "song.aint-she-sweet",
    ]);
    expect(
      standardLadderPool([FIXTURE, second], { skip: "song.five-foot-two" }).map((s) => s.id as string),
    ).toEqual(["song.aint-she-sweet"]);
  });
});

describe("L8: every real standard of the pool whose answer key is complete", () => {
  const complete = standardLadderPool(songs);
  test("each is graded right with its key and wrong with one bar changed, at R0 and R2", async () => {
    for (const song of complete)
      for (const realism of [0, 2] as SongRealism[])
        await checkItem(buildStandardLadderItem(song, { realism, seed: 1 }) as StandardLadderPlan);
    // Reported, not required: the answer keys are author:repertoire's and wait for a human verifier.
    const missing = STANDARD_SONG_IDS.filter((id) => !complete.some((s) => s.id === id));
    console.log(
      `L8 pool: ${complete.length} of ${STANDARD_SONG_IDS.length} standards have a complete answer key` +
        (missing.length > 0
          ? `; without one: ${missing
              .map((id) => {
                const s = songs.find((x) => x.id === id);
                return `${id} (${s ? standardLadderGaps(s).join("; ") : "no song.ts"})`;
              })
              .join(", ")}`
          : ""),
    );
    expect(complete.length).toBeLessThanOrEqual(STANDARD_SONG_IDS.length);
  });
});

afterAll(() => {
  console.log(
    [
      "| Song | Realism | Stage | Checks | Key's own score (min) | One bar wrong (max) |",
      "|---|---|---|---|---|---|",
      ...measured,
    ].join("\n"),
  );
});
