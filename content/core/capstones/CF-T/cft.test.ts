// CF-T Standard Transcription (contracts §6.6 CF-T, content/specs/CF.md): the sessions of content/capstones.ts graded
// through the real grader in capstone mode, the way the capstone workspace grades them.
//   - The order: the form map (S1), the bass section by section once the map is settled, the changes once every
//     bass section is, the tune once the changes are (S2, S3), the arrangement's own rubric (S4). Marks and matchers
//     are the ladder's L8 (`STANDARD_LADDER_PASS`, `STANDARD_LADDER_MATCHERS`), so a CF-T pass and an L8 pass agree.
//   - Each stage on a STAND-IN standard shaped as the spec describes the pool's answer keys (32 bars in C, AABA in
//     four eight-bar sections, swing 8ths, one or two chords a bar with sevenths and a diminished seventh). Its tune
//     and changes are Oak's own, written for this test; it is not any of the three standards and is never served.
//   - Each song of the pool by ID once author:repertoire's answer key exists (content/repertoire/<slug>/song.ts):
//     its own layers pass every check and its sections the form map. Until then each is a todo.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExerciseOf, GradeResult, PhraseCheck, SessionId, SongDef, SongId } from "@oak/content-kit";
import * as grader from "@oak/grader";
import {
  CAPSTONE_LINER_PROMPTS,
  CAPSTONE_LINER_SEEDS,
  CF_T_ARRANGE_RUBRIC,
  CF_T_CHECKS,
  CF_T_FORM_MAP,
  capstoneById,
  TRANSCRIBE_PASS,
} from "../../../capstones.ts";
import { STANDARD_SONG_IDS } from "../../../gym/standards.ts";
import { toolbox } from "../../../toolbox.ts";
import { lint, unlockedFor } from "../../../validate/harness.ts";

setDefaultTimeout(120_000);

const cft = capstoneById.get("CF-T");
const all = CF_T_CHECKS.flat();
const check = (id: string) => all.find((c) => c.id === id) as PhraseCheck;
const lintCtx = (session: string) => ({
  profile: "graded" as const,
  unlocked: unlockedFor(session as SessionId),
  allowPreview: false,
  meter: "4/4" as const,
  key: null,
});
const ctx = {
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: lintCtx("CF-T.S1"),
};
const grade = (song: SongDef, c: PhraseCheck, code: string) =>
  grader.gradePhraseCheck({ capstoneId: "CF-T", check: c, song, code, ctx });
const passed = (r: GradeResult) => grader.phraseCheckPassed(r);
const ids = (r: GradeResult) => r.diagnostics.map((d) => d.id);

// --- the stand-in standard -----------------------------------------------------------------------------------

/** A: I, a diminished seventh up to ii, V, then V7/vi, V7/ii and ii–V home (two chords in bar 7). */
const A = ["C", "C#o7", "Dm7", "G7", "E7", "A7", "[Dm7 G7]", "C"];
/** B: the dominant chain, two bars each: E7 A7 D7 G7. */
const B = ["E7", "E7", "A7", "A7", "D7", "D7", "G7", "G7"];
const AABA = [...A, ...A, ...B, ...A];
/** The two-feel bass in degrees of C (`n`, degree − 1; `0#` is C♯): root, then the fifth or the next root. */
const BASS_A = ["[0 4]", "[0# 4]", "[1 5]", "[4 1]", "[2 6]", "[5 2]", "[1 4]", "[0 4]"];
const BASS_B = ["[2 6]", "[2 6]", "[5 2]", "[5 2]", "[1 5]", "[1 5]", "[4 1]", "[4 1]"];
const BASS = [...BASS_A, ...BASS_A, ...BASS_B, ...BASS_A];
/** The tune in degrees of C, chord notes on beats 1 and 3; `4#` is G♯ over E7, `0#` C♯ over A7. */
const TUNE_A = [
  "[4 ~ 2 4]",
  "[2 ~ ~ ~]",
  "[3 ~ 1 3]",
  "[3 ~ ~ ~]",
  "[6 ~ 4# ~]",
  "[5 ~ ~ ~]",
  "[3 2 1 ~]",
  "[0 ~ ~ ~]",
];
const TUNE_B = [
  "[6 ~ 4# 2]",
  "[6 ~ ~ ~]",
  "[5 ~ 2 0#]",
  "[4 ~ ~ ~]",
  "[5 ~ 3# 1]",
  "[7 ~ ~ ~]",
  "[6 ~ 4 3]",
  "[1 ~ ~ ~]",
];
const TUNE = [...TUNE_A, ...TUNE_A, ...TUNE_B, ...TUNE_A];
const bassOf = (bars: readonly string[], scale = "C2:major") =>
  `n("<${bars.join(" ")}>").scale("${scale}").s("upright").lpf(800)`;
const chordsOf = (bars: readonly string[]) => `chord("<${bars.join(" ")}>").voicing().s("piano")`;
const melodyOf = (bars: readonly string[], scale = "C4:major") =>
  `n("<${bars.join(" ")}>").scale("${scale}").swingBy(1/3, 4).s("piano")`;
const SECTIONS = ["A", "A", "B", "A"].map((label, i) => ({
  label,
  bars: [i * 8 + 1, i * 8 + 8] as [number, number],
}));
const STAND_IN = {
  id: "song.cf-t-stand-in",
  title: "Stand-in standard (test only)",
  year: "trad",
  status: "trad",
  provenance: { source: "Oak test fixture", year: 1930 },
  verifiedBy: "test fixture",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: 132,
  swing: { subdivision: 8, amount: 1 / 3 },
  form: "AABA",
  answerKey: {
    bars: 32,
    code: "",
    layers: { bass: bassOf(BASS), chords: chordsOf(AABA), melody: melodyOf(TUNE) },
    phrases: SECTIONS.map((s) => s.bars),
    sections: SECTIONS,
  },
} as unknown as SongDef;
const HEAD = "setcpm(132/4)\n\n";
const draft = (...lines: string[]) => `${HEAD}${lines.join("\n")}`;
const L = STAND_IN.answerKey.layers as Record<"bass" | "chords" | "melody", string>;

beforeAll(async () => {
  await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
});

describe("CF-T's sessions (contracts §6.6 CF-T, CF.md)", () => {
  test("S1 the form map and the bass, S2 the changes, S3 the melody, S4 the arrangement; only S4 releases", () => {
    expect(
      cft?.sessionDefs.map((s) => [
        s.id,
        s.formMap?.id ?? null,
        (s.checks ?? []).map((c) => c.id),
        (s.rubric ?? []).map((r) => r.id),
        !!s.release,
      ]),
    ).toEqual([
      ["CF-T.S1", "form-map", ["bass-1", "bass-2", "bass-3", "bass-4"], [], false],
      ["CF-T.S2", null, ["changes-1", "changes-2", "changes-3", "changes-4"], [], false],
      ["CF-T.S3", null, ["melody-1", "melody-2", "melody-3", "melody-4"], [], false],
      ["CF-T.S4", null, [], ["roles", "form"], true],
    ]);
    expect(cft?.inGymSlots).toBe(true);
    expect(cft?.opensAfter).toEqual({ lessonsCompleted: ["U15.L01"] });
    expect(cft?.reviewRevisions).toBe(2);
    expect(cft?.song).toEqual([...STANDARD_SONG_IDS]);
  });
  test("one eight-bar section a check; every `after` names the map or a check defined before it", () => {
    const seen = new Set<string>([CF_T_FORM_MAP.id]);
    for (const c of all) {
      expect([c.id, typeof c.phrase]).toEqual([c.id, "number"]);
      for (const a of c.after ?? []) expect([c.id, a, seen.has(a)]).toEqual([c.id, a, true]);
      seen.add(c.id);
    }
    expect(check("bass-1").after).toEqual(["form-map"]);
    expect(check("changes-1").after).toEqual(["bass-1", "bass-2", "bass-3", "bass-4"]);
    expect(check("melody-4").after).toEqual(["changes-1", "changes-2", "changes-3", "changes-4"]);
    expect(CF_T_FORM_MAP).toMatchObject({ vocabulary: "letters", boundaries: "asked", pass: 1 });
    expect(CF_T_FORM_MAP.given).toEqual({ meter: true, key: true, tonic: true, pickup: true });
  });
  test("the marks and matchers are ladder L8's, so a CF-T pass and an L8 pass are the same thing", () => {
    const t = TRANSCRIBE_PASS["CF-T"];
    const shipped: Record<string, number> = {
      form: t.formMap,
      bass: t.bass,
      changes: t.changesPerBar,
      melody: t.melody,
    };
    expect(shipped).toEqual({ ...grader.STANDARD_LADDER_PASS });
    for (const stage of ["bass", "changes", "melody"] as const)
      for (const n of [1, 2, 3, 4]) {
        const c = check(`${stage}-${n}`);
        expect([c.id, c.matcher, c.pass]).toEqual([
          c.id,
          grader.STANDARD_LADDER_MATCHERS[stage],
          grader.STANDARD_LADDER_PASS[stage],
        ]);
      }
  });
  test("the release asks what the form told the learner; the S4 rubric is the arrangement's two lines", () => {
    expect(CAPSTONE_LINER_PROMPTS["CF-T"]).toBe("What did the form tell you before you wrote a note?");
    expect(CAPSTONE_LINER_SEEDS["CF-T"]?.length).toBe(3);
    expect(CF_T_ARRANGE_RUBRIC.map((r) => [r.id, r.rule, r.required])).toEqual([
      ["roles", "tracks", true],
      ["form", "form", true],
    ]);
  });
});

describe("the form map (gradeFormMap at the check's mark)", () => {
  const map = (sections: string[], bars = [1, 9, 17, 25]) =>
    grader.gradeFormMap({ sections, bars }, STAND_IN, CF_T_FORM_MAP.pass);
  test("the right cuts with the right shape pass, whatever the letters or names", () => {
    for (const labels of [
      ["A", "A", "B", "A"],
      ["X", "X", "Y", "X"],
      ["verse", "verse", "bridge", "verse"],
      ["A", "A2", "B", "A3"],
    ])
      expect([labels.join(" "), map(labels).passed]).toEqual([labels.join(" "), true]);
  });
  test("anything short of every section is not a pass: ABAB, two halves, an extra cut at bar 21", () => {
    expect(map(["A", "B", "A", "B"]).score).toBeCloseTo(0.25, 6);
    expect(map(["A", "B"], [1, 17]).passed).toBe(false);
    const extra = map(["A", "A", "B", "B", "A"], [1, 9, 17, 21, 25]);
    expect([extra.passed, extra.extra]).toEqual([false, [21]]);
  });
});

describe("CF-T on the stand-in standard (32 bars, AABA, swing 8ths)", () => {
  test("the stand-in's layers play and lint clean when CF-T opens", () => {
    for (const layer of Object.values(L))
      expect(
        lint(draft(`mel: ${layer}`), { session: "CF-T.S1" as SessionId, meter: "4/4", key: null as never })
          .diagnostics.filter((d) => d.severity === "error")
          .map((d) => d.id),
      ).toEqual([]);
  });

  for (const n of [1, 2, 3, 4])
    test(`bass-${n}: the bass passes, an octave lower too; a bar late it fails`, async () => {
      const c = check(`bass-${n}`);
      expect(passed(await grade(STAND_IN, c, draft(`bass: ${L.bass}`)))).toBe(true);
      expect(passed(await grade(STAND_IN, c, draft(`bass: ${bassOf(BASS, "C1:major")}`)))).toBe(true);
      const late = draft(`bass: ${bassOf(["[~ ~]", ...BASS.slice(0, 31)])}`);
      expect(passed(await grade(STAND_IN, c, late))).toBe(false);
    });

  test("changes: the key's chords pass every section", async () => {
    const code = draft(`bass: ${L.bass}`, `chords: ${L.chords}`);
    for (const n of [1, 2, 3, 4])
      expect(passed(await grade(STAND_IN, check(`changes-${n}`), code))).toBe(true);
  });

  test("changes: a triad for a dominant seventh in one bar loses that bar and passes (7 of 8); in two bars it fails", async () => {
    const one = [...AABA];
    one[16] = "E";
    const r1 = await grade(
      STAND_IN,
      check("changes-3"),
      draft(`bass: ${L.bass}`, `chords: ${chordsOf(one)}`),
    );
    expect([passed(r1), r1.score]).toEqual([true, 0.875]);
    const two = [...one];
    two[18] = "A";
    const r2 = await grade(
      STAND_IN,
      check("changes-3"),
      draft(`bass: ${L.bass}`, `chords: ${chordsOf(two)}`),
    );
    expect([passed(r2), r2.score]).toEqual([false, 0.75]);
  });

  test("changes: the right quality on a wrong root loses its bar", async () => {
    const wrong = [...AABA];
    wrong[5] = "B7";
    wrong[6] = "[Em7 A7]";
    const r = await grade(
      STAND_IN,
      check("changes-1"),
      draft(`bass: ${L.bass}`, `chords: ${chordsOf(wrong)}`),
    );
    expect([passed(r), r.score]).toEqual([false, 0.75]);
    expect(ids(r).some((id) => id.startsWith("harmony."))).toBe(true);
  });

  for (const n of [1, 2, 3, 4])
    test(`melody-${n}: the tune passes, and in another key; a degree off throughout fails`, async () => {
      const c = check(`melody-${n}`);
      expect(passed(await grade(STAND_IN, c, draft(`mel: ${L.melody}`)))).toBe(true);
      expect(passed(await grade(STAND_IN, c, draft(`mel: ${melodyOf(TUNE, "F4:major")}`)))).toBe(true);
      const up = TUNE.map((bar) => bar.replace(/-?\d+/g, (d) => String(Number(d) + 1)));
      const off = await grade(STAND_IN, c, draft(`mel: ${melodyOf(up)}`));
      expect(passed(off)).toBe(false);
      expect(ids(off)).toContain("melody.index-shift");
    });

  test("melody: played straight where the standard swings, the tune still passes", async () => {
    const straight = await grade(
      STAND_IN,
      check("melody-1"),
      draft(`mel: ${L.melody.replace(".swingBy(1/3, 4)", "")}`),
    );
    expect(passed(straight)).toBe(true);
  });

  test("an empty draft fails every check", async () => {
    const empty = draft('mel: n("~").s("piano")');
    for (const c of all) expect([c.id, passed(await grade(STAND_IN, c, empty))]).toEqual([c.id, false]);
  });
});

describe("CF-T.S4: the arrangement's rubric on the whole piece, with the song's sections", () => {
  const exercise = {
    kind: "compose-brief",
    id: "session-rubric",
    version: 1,
    prompt: "",
    skills: [],
    role: "capstone",
    hints: null,
    tests: [],
    brief: "",
    code: { starter: "" },
    rubric: CF_T_ARRANGE_RUBRIC,
  } as unknown as ExerciseOf<"compose-brief">;
  const songForm = grader.songFormOf(STAND_IN) ?? [];
  const gradeArrangement = (code: string) =>
    grader.gradeExercise({
      exercise,
      response: { code },
      ctx: {
        ...ctx,
        exerciseGlobalId: "CF-T/session-rubric",
        mode: "capstone",
        key: STAND_IN.key,
        meter: "4/4",
        bpm: 132,
        songForm,
        lint: lintCtx("CF-T.S4"),
      },
    });
  /** The learner's arrangement: one const per distinct section and track, as the skeleton writes it. */
  const arrangement = (o: { order?: string[]; drums?: boolean } = {}) => {
    const order = o.order ?? ["A", "A", "B", "A"];
    const arr = (role: string) =>
      `arrange(${order.map((s) => `[${s === "Intro" || s === "Outro" ? 4 : 8}, ${role}${s}]`).join(", ")})`;
    const has = (s: string) => order.includes(s);
    return [
      "setcpm(132/4)",
      "",
      `const chordsA = ${chordsOf(A).replace('.s("piano")', "")}`,
      `const chordsB = ${chordsOf(B).replace('.s("piano")', "")}`,
      ...(has("Intro") ? ['const chordsIntro = chord("<Dm7 G7 C G7>").voicing()'] : []),
      ...(has("Outro") ? ['const chordsOutro = chord("<C C C C>").voicing()'] : []),
      `const bassA = n("<${BASS_A.join(" ")}>")`,
      `const bassB = n("<${BASS_B.join(" ")}>")`,
      ...(has("Intro") ? ['const bassIntro = n("<[1 5] [4 1] [0 4] [4 1]>")'] : []),
      ...(has("Outro") ? ['const bassOutro = n("<0 0 0 0>")'] : []),
      `const melA = n("<${TUNE_A.join(" ")}>")`,
      `const melB = n("<${TUNE_B.join(" ")}>")`,
      ...(has("Intro") ? ['const melIntro = n("<~ ~ ~ ~>")'] : []),
      ...(has("Outro") ? ['const melOutro = n("<[0 ~ ~ ~] ~ ~ ~>")'] : []),
      "",
      ...(o.drums === false
        ? []
        : [
            'hats: s("rd*8").swingBy(1/3, 4).gain(.4)',
            'kick: s("bd ~ bd ~").gain(.7)',
            'snare: s("~ sd ~ sd").velocity("1 .4 1 .4").gain(.5)',
          ]),
      `bass: ${arr("bass")}.scale("C2:major").s("upright").lpf(800)`,
      `chords: ${arr("chords")}.s("rhodes").gain(.5).room(.3)`,
      `mel: ${arr("mel")}.scale("C4:major").swingBy(1/3, 4).s("jazzgtr").pan(.6)`,
    ].join("\n");
  };
  const failing = (r: GradeResult) => (r.rubric ?? []).filter((x) => !x.ok).map((x) => x.ruleId);

  test("drums, bass, chords and melody in the song's own sections pass", async () => {
    const r = await gradeArrangement(arrangement());
    expect([r.status, failing(r)]).toEqual(["pass", []]);
  });
  test("an intro before and an ending after are welcome", async () => {
    const r = await gradeArrangement(arrangement({ order: ["Intro", "A", "A", "B", "A", "Outro"] }));
    expect([r.status, failing(r)]).toEqual(["pass", []]);
  });
  test("no drums fails `roles`", async () => {
    expect(failing(await gradeArrangement(arrangement({ drums: false })))).toEqual(["roles"]);
  });
  test("the sections in another order fail `form`; so does a second chorus", async () => {
    expect(failing(await gradeArrangement(arrangement({ order: ["A", "B", "A", "A"] })))).toEqual(["form"]);
    expect(
      failing(await gradeArrangement(arrangement({ order: ["A", "A", "B", "A", "A", "A", "B", "A"] }))),
    ).toEqual(["form"]);
  });
});

// --- the pool, by ID ---------------------------------------------------------------------------------------

const REPERTOIRE = join(import.meta.dir, "../../../repertoire");
for (const id of cft?.song ?? []) {
  const slug = (id as SongId).replace(/^song\./, "");
  const file = join(REPERTOIRE, slug, "song.ts");
  describe(`CF-T on ${id}`, () => {
    if (!existsSync(file)) {
      test.todo(`${id}: no answer key yet (content/repertoire/${slug}/song.ts, author:repertoire)`);
      return;
    }
    test("its sections pass the form map; its own layers pass every check; an empty draft fails them", async () => {
      const song = (await import(file)).default as SongDef;
      const sections = song.answerKey.sections ?? [];
      expect(sections.length).toBe(4);
      expect((song.answerKey.phrases ?? []).map((p) => p.join("-"))).toEqual(
        sections.map((s) => s.bars.join("-")),
      );
      expect(
        grader.gradeFormMap(
          { sections: sections.map((s) => s.label), bars: sections.map((s) => s.bars[0]) },
          song,
          CF_T_FORM_MAP.pass,
        ).passed,
      ).toBe(true);
      const l = song.answerKey.layers;
      const head = `setcpm(${song.bpm}/${Number(song.meter.split("/")[0])})\n\n`;
      const full = `${head}bass: ${l.bass}\nchords: ${l.chords}\nmel: ${l.melody}`;
      const empty = `${head}mel: n("~").s("piano")`;
      for (const c of all) {
        expect([c.id, passed(await grade(song, c, full))]).toEqual([c.id, true]);
        expect([c.id, passed(await grade(song, c, empty))]).toEqual([c.id, false]);
      }
    });
  });
}
