// Corrections pass (before the learner starts the course): the grader findings of the outside review, each pinned on
// the SHIPPED exercise it was found in, graded exactly as content CI and the app grade it (the real realm and the
// production `normalize`). Every counterexample fails with a line the learner can act on; the right answers next to
// it still pass. Rule-level pins (the corrections custom rules and fields) are in rubric/corrections-rules.test.ts.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { CapstoneDef, Exercise, GradeResult, KeySpec, SessionId, SongDef } from "@oak/content-kit";
import { stripMarkers } from "@oak/content-kit";
import {
  CF_A_PIECES,
  CF_T_ARRANGE_RUBRIC,
  CF_T_CHECKS,
  capstoneById,
} from "../../../../content/capstones.ts";
import { courseGraph } from "../../../../content/index.ts";
import { unlockedAt } from "../../../../content/lib/course.ts";
import fiveFootTwo from "../../../../content/repertoire/five-foot-two/song.ts";
import { toolbox } from "../../../../content/toolbox.ts";
import { DEFAULT_PROFILE, generateLadderPiece, ladderItemOf } from "../../../drills/src/index.ts";
import { headlessDeps, strudel } from "../analyze/__support__/fixtures.ts";
import { modeView } from "../analyze/wave6-views.ts";
import { renderFeedback } from "../feedback/catalog.ts";
import { gradeExercise, gradePhraseCheck, initRealm } from "../index.ts";
import { isAudible } from "../normalize/nevent.ts";
import type { GradeContext, GradeRequest } from "../types.ts";
import { editsOnlyRegions } from "./constraints.ts";
import { gradeWith } from "./index.ts";
import { ladderGradeRequest } from "./ladder.ts";
import { songFormOf } from "./standard-ladder.ts";

setDefaultTimeout(180_000);
beforeAll(async () => {
  await initRealm({ toolbox: [...toolbox], lockdown: false });
});

const C: KeySpec = { tonic: "C", mode: "major" };
const lint = (session: string) => ({
  profile: "graded" as const,
  unlocked: unlockedAt(courseGraph(), toolbox, session as SessionId),
  allowPreview: false,
  meter: "4/4" as const,
  key: null,
});
const base = (session: string) => ({
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0,
  tutorHints: 0,
  extraReplays: 0,
  lint: lint(session),
});
const capReq = (id: string, code: string): GradeRequest => {
  const c = capstoneById.get(id as never) as CapstoneDef;
  return {
    exercise: c.brief as Exercise,
    response: { code },
    ctx: {
      ...base(c.sessionDefs[0]?.id as string),
      exerciseGlobalId: `${id}/brief`,
      mode: "capstone",
      key: c.key ?? C,
      meter: c.meter,
      bpm: c.bpm ? (c.bpm[0] + c.bpm[1]) / 2 : 100,
      ...(c.swing ? { swing: c.swing } : {}),
    } as GradeContext,
  };
};
const passPiece = (id: string): string => {
  const t = (capstoneById.get(id as never) as CapstoneDef).brief?.tests.find((x) => x.expect === "pass");
  return (t?.response as { code?: string } | undefined)?.code ?? "";
};
const mute = (src: string): string =>
  src
    .split("\n")
    .map((l) => (/^[a-z0-9]+:/.test(l) ? `${l}.gain(0)` : l))
    .join("\n");
const unmet = (r: GradeResult): string[] =>
  r.diagnostics.filter((d) => d.id === "rubric.unmet").map((d) => renderFeedback(d));

describe("A — silence is not music: zero-gain events are left out of grading", () => {
  test("isAudible: gain, velocity and postgain multiply; at or below 0.01 is silent", () => {
    const e = (o: Record<string, number>) => ({ gain: null, velocity: null, postgain: null, ...o }) as never;
    expect(isAudible(e({}))).toBe(true);
    expect(isAudible(e({ gain: 0 }))).toBe(false);
    expect(isAudible(e({ velocity: 0 }))).toBe(false);
    expect(isAudible(e({ gain: 0.3, velocity: 0.3 }))).toBe(true);
    expect(isAudible(e({ gain: 0.1, velocity: 0.05 }))).toBe(false);
  });

  test("C0 with every drum at .gain(0) fails as silent", async () => {
    const r = await gradeExercise(
      capReq(
        "C0",
        `setcpm(100/4)\nkick: s("<[bd ~ bd ~] [bd ~ bd [~ bd]] [bd ~ bd ~] [bd ~ ~ ~]>").gain(0)\nsnare: s("<[~ sd ~ sd]!3 [~ sd [sd sd sd sd] [ht ht lt lt]]>").gain(0)\nhats: s("<hh*8!3 [hh hh hh hh ~ ~ ~ ~]>").gain(0)`,
      ),
    );
    expect(r.status).toBe("fail");
    expect(r.diagnostics.map((d) => d.id)).toContain("make.silent");
  });

  for (const id of ["C7", "CF-A"]) {
    test(`${id}: the passing piece muted on every track fails; played, it passes`, async () => {
      const src = id === "CF-A" ? CF_A_PIECES.pop : passPiece(id);
      const silent = await gradeExercise(capReq(id, mute(src)));
      expect(silent.status).toBe("fail");
      expect(silent.diagnostics.map((d) => d.id)).toContain("make.silent");
      const played = await gradeExercise(capReq(id, src));
      expect(played.status).toBe("pass");
    });
  }
});

describe("A — C2: chord identity, plagal quality and where the cadence lands", () => {
  const c2 = (changes: string, bass: string, tail = "") =>
    `setcpm(96/4)\nbass: n("<${bass}>").scale("C2:major").s("ebass")\nchords: chord("<${changes}>").voicing()${tail}.s("piano")\nmel: n("<[0 2 4 2] [4 6 8 6] [5 7 9 7] [3 5 7 5] [0 2 4 2] [4 6 8 6] [8 6 4 ~] [7 ~ ~ ~]>").scale("C4:major").s("piano")`;

  test('`.voicing().note("c#4")` and `.transpose(1)` lose the old chord names; an octave keeps them', async () => {
    for (const tail of ['.note("c#4")', ".transpose(1)"]) {
      const r = await gradeExercise(capReq("C2", c2("C G Am F C G G C", "0 4 5 3 0 4 4 0", tail)));
      expect(r.status).toBe("fail");
      expect(r.rubric?.find((x) => x.ruleId === "cadence")?.ok).toBe(false);
    }
    for (const tail of [".transpose(12)", ".transpose(-12)", ""]) {
      const r = await gradeExercise(capReq("C2", c2("C G Am F C G G C", "0 4 5 3 0 4 4 0", tail)));
      expect(r.status).toBe("pass");
    }
  });

  test("F diminished → C is no plagal cadence; F → C and G → C are", async () => {
    const dim = await gradeExercise(capReq("C2", c2("C G Am F C G Fo C", "0 4 5 3 0 4 3 0")));
    expect(dim.status).toBe("fail");
    expect(unmet(dim).join("\n")).toContain(
      "bar 8 ends iv° → I: no cadence; the brief asks for V → I or IV → I",
    );
    for (const [ch, b] of [
      ["C G Am F C G F C", "0 4 5 3 0 4 3 0"],
      ["C G Am F C G G C", "0 4 5 3 0 4 4 0"],
    ] as const)
      expect((await gradeExercise(capReq("C2", c2(ch, b)))).status).toBe("pass");
    expect((await gradeExercise(capReq("C2", passPiece("C2")))).status).toBe("pass");
  });

  test("a V → I in bars 6–7 with an empty bar 8 does not land in bar 8", async () => {
    const r = await gradeExercise(capReq("C2", c2("C G Am F C G C ~", "0 4 5 3 0 4 0 ~")));
    expect(r.status).toBe("fail");
    expect(unmet(r).join("\n")).toContain(
      "bar 8 has no chord, so no cadence lands there: the harmony stops after bar 7; the brief asks for V → I or IV → I arriving in bar 8",
    );
  });
});

describe("A — ladder L4: written lengths and rests count", () => {
  const item = ladderItemOf(
    generateLadderPiece(4, 0, 6, DEFAULT_PROFILE, { completed: new Set(["U07.L08"]) }),
  );
  const grade = (mel: string) =>
    gradeExercise(
      ladderGradeRequest({
        item,
        code: `setcpm(73/4)\nmel: n("${mel}").scale("G3:major").s("piano")`,
        ctx: base("U11.L08") as never,
      }),
    );
  test("every note halved with a rest after it fails with `rhythm.duration`", async () => {
    expect(item.reference).toContain('n("<[4 3 3 2] [1@2 0@2]>")');
    const r = await grade("<[[4 ~] [3 ~] [3 ~] [2 ~]] [1 ~ 0 ~]>");
    expect(r.status).toBe("fail");
    expect(r.diagnostics[0]?.id).toBe("rhythm.duration");
    expect(renderFeedback(r.diagnostics[0] as never)).toMatch(/long, should be/);
  });
  test("the same rhythm written other ways passes", async () => {
    for (const mel of ["<[4 3 3 2] [1@2 0@2]>", "<[4 3 3 2] [1 _ 0 _]>", "<[4 3 3 2] [1 0]>"])
      expect((await grade(mel)).status).toBe("pass");
  });
});

describe("A — editsOnlyRegions: white space between tokens is free, everywhere outside strings", () => {
  const starter =
    'setcpm(80/4)\nbass: note("<c2 a1 f2 g2>").s("ebass").lpf(800)\nchords: note("⟪<[c4,e4,g4]>⟫").s("piano")';
  test('U05.CP: `note( "…")` is the same code', () => {
    expect(
      editsOnlyRegions(
        starter,
        'setcpm(80/4)\nbass: note( "<c2 a1 f2 g2>").s("ebass").lpf(800)\nchords: note( "<[c4,e4,g4] [c4,e4,a4]>").s("piano")',
      ),
    ).toBe(true);
    expect(
      editsOnlyRegions(
        starter,
        'setcpm( 80 / 4 )\nbass: note("<c2 a1 f2 g2>") .s( "ebass" ).lpf(800)\nchords: note("<[c4,e4,g4]>").s("piano")',
      ),
    ).toBe(true);
  });
  test("but the fixed code itself still may not change", () => {
    expect(
      editsOnlyRegions(
        starter,
        'setcpm(80/4)\nbass: note("<c2 a1 f2 g3>").s("ebass").lpf(800)\nchords: note("<[c4,e4,g4]>").s("piano")',
      ),
    ).toBe(false);
    expect(
      editsOnlyRegions(
        starter,
        'setcpm(80/4)\nbass: no te("<c2 a1 f2 g2>").s("ebass").lpf(800)\nchords: note("<[c4,e4,g4]>").s("piano")',
      ),
    ).toBe(false);
    // Inside a fixed string, white space is the music: `<c2 a1>` is not `<c2a1>`.
    expect(
      editsOnlyRegions(
        starter,
        'setcpm(80/4)\nbass: note("<c2 a1 f2g2>").s("ebass").lpf(800)\nchords: note("<[c4,e4,g4]>").s("piano")',
      ),
    ).toBe(false);
  });
});

describe("Wave 6 — CF-T in the recording's key, and the arrangement keeps the song", () => {
  const song = fiveFootTwo as SongDef;
  const check = (CF_T_CHECKS[2] ?? [])[0];
  const phrase = (code: string) =>
    gradePhraseCheck({
      capstoneId: "CF-T",
      check: check as never,
      song,
      code,
      ctx: base("CF-T.S3") as never,
    });
  test("the melody moved to D fails with `melody.wrong-key`; an octave lower still passes", async () => {
    expect(check?.layer).toBe("melody");
    const moved = await phrase(song.answerKey.code.replace("C4:major", "D4:major"));
    expect(moved.status).toBe("fail");
    expect(moved.diagnostics.map((d) => d.id)).toContain("melody.wrong-key");
    expect((await phrase(song.answerKey.code.replace("C4:major", "C3:major"))).status).toBe("pass");
    expect((await phrase(song.answerKey.code)).status).toBe("pass");
  });

  test("song-kept: 32 bars of one chord fail; the song's changes after an intro pass (`songFormOf` carries the chart)", async () => {
    const form = songFormOf(song) ?? [];
    expect(form.map((s) => s.chords?.[1])).toEqual([["E7"], ["E7"], ["E7"], ["E7"]]);
    const rubric = [
      ...CF_T_ARRANGE_RUBRIC,
      {
        id: "song-kept",
        label: "The song's changes, bar by bar",
        required: true,
        skills: [],
        rule: "custom",
        fn: "song-kept",
      },
    ] as never;
    const req = (code: string): GradeRequest => ({
      exercise: {
        kind: "compose-brief",
        id: "session-rubric",
        version: 1,
        prompt: "",
        skills: [],
        role: "capstone",
        hints: null,
        tests: [],
        brief: "",
        rubric,
        code: { starter: "" },
        album: { slot: "CF-T" },
        review: { tutor: "offer" },
      } as never,
      response: { code },
      ctx: {
        ...base("CF-T.S4"),
        exerciseGlobalId: "CF-T.S4/session-rubric",
        mode: "capstone",
        key: song.key,
        meter: song.meter,
        bpm: song.bpm,
        songForm: form,
      } as GradeContext,
    });
    const arr = (a: string, b: string) =>
      `setcpm(192/4)\nconst chordsA = ${a}\nconst chordsB = ${b}\nconst bassA = note("c2")\nconst melA = note("c4")\ndrums: s("bd*4")\nchords: arrange([8,chordsA],[8,chordsA],[8,chordsB],[8,chordsA]).s("piano")\nbass: arrange([8,bassA],[8,bassA],[8,bassA],[8,bassA]).s("upright")\nmel: arrange([8,melA],[8,melA],[8,melA],[8,melA]).s("piano")`;
    const constant = await gradeExercise(req(arr('note("[c3,e3,g3]")', 'note("[c3,e3,g3]")')));
    expect(constant.status).toBe("fail");
    expect(unmet(constant).join("\n")).toContain(
      "The song's changes, bar by bar: 8 of the song's 32 bars keep its chords",
    );
    const kept = await gradeExercise(
      req(arr('chord("<C E7 A7 A7 D7 G7 C G7>").voicing()', 'chord("<E7 E7 A7 A7 D7 D7 G7 G7>").voicing()')),
    );
    expect(kept.rubric?.find((x) => x.ruleId === "song-kept")?.ok).toBe(true);
  });
});

describe("Wave 6 gate leftovers", () => {
  test("C6_FUNK_E: chords pushed with `.early(1/8)` and cut with `.struct()` still count as home in `modeView`", async () => {
    const code = `setcpm(104/4)\nchords: chord("<E D A E>").voicing().struct("x ~ ~ x ~ ~ x ~").early(1/8).s("cleangtr")\nmel: n("<[6 ~ 4 ~] [6 ~ 5 4] [3 ~ 2 ~] [0 ~ ~ ~]>").scale("E4:mixolydian").s("piano")`;
    const n = await strudel(code, 4);
    expect(modeView(n, { meter: "4/4", bars: 4 }).tonicChordShare).toBe(0.5);
  });

  test("harmony.bass for the right dim7 notes on another root names the root it is built on", async () => {
    const deps = headlessDeps();
    const exercise = {
      kind: "code-modify",
      id: "dim7",
      version: 1,
      prompt: "",
      skills: [],
      role: "check",
      hints: null,
      tests: [],
      code: { starter: 'setcpm(84/4)\nchords: chord("<C ⟪Dm7⟫ G7>").voicing().s("organ")' },
      reference: { solutions: ['setcpm(84/4)\nchords: chord("<C F#o7 G7>").voicing().s("organ")'], bars: 3 },
      matcher: { m: "pcset", perOnset: true, bass: true, tracks: ["chords"] },
    } as never;
    const r = await gradeWith(
      {
        exercise,
        response: { code: 'setcpm(84/4)\nchords: chord("<C Ao7 G7>").voicing().s("organ")' },
        ctx: {
          ...base("U15.L04"),
          exerciseGlobalId: "U15.L04/dim7",
          mode: "lesson",
          key: C,
          meter: "4/4",
          bpm: 84,
        } as GradeContext,
      },
      deps,
    );
    const bass = r.diagnostics.find((d) => d.id === "harmony.bass");
    expect(bass && renderFeedback(bass)).toMatch(
      /^Chord \(bar 2\): bass is Eb \(your chord is built on A\); you should hear F#\.$/,
    );
  });

  test("pcset `durations`: a bar of G7 cut to 1% is not the bar's chord (U15.L02 S5, theory-f)", async () => {
    const deps = headlessDeps();
    const make = (durations: boolean) =>
      ({
        kind: "code-modify",
        id: "applied",
        version: 1,
        prompt: "",
        skills: [],
        role: "check",
        hints: null,
        tests: [],
        code: {
          starter:
            'setcpm(92/4)\nconst changes = "<F Dm ⟪Gm⟫ C7>"\nchords: chord(changes).voicing().s("rhodes")',
        },
        reference: {
          solutions: [
            'setcpm(92/4)\nconst changes = "<F Dm G7 C7>"\nchords: chord(changes).voicing().s("rhodes")',
          ],
          bars: 4,
        },
        matcher: {
          m: "pcset",
          perOnset: true,
          bass: true,
          tracks: ["chords"],
          ...(durations ? { durations } : {}),
        },
      }) as never;
    const ctx = {
      ...base("U15.L02"),
      exerciseGlobalId: "U15.L02/applied",
      mode: "lesson",
      key: C,
      meter: "4/4",
      bpm: 92,
    } as GradeContext;
    const code = (g: string) =>
      `setcpm(92/4)\nconst changes = "<F Dm ${g} C7>"\nchords: chord(changes).voicing().s("rhodes")`;
    const stab = await gradeWith(
      { exercise: make(true), response: { code: code("[G7@0.01 ~@0.99]") }, ctx },
      deps,
    );
    expect(stab.status).toBe("fail");
    expect(stab.diagnostics.map((d) => d.id)).toContain("rhythm.duration");
    const off = await gradeWith(
      { exercise: make(false), response: { code: code("[G7@0.01 ~@0.99]") }, ctx },
      deps,
    );
    expect(off.status).toBe("pass");
    for (const g of ["G7", "[G7 G7]", "G7@1"])
      expect((await gradeWith({ exercise: make(true), response: { code: code(g) }, ctx }, deps)).status).toBe(
        "pass",
      );
  });
});

// The starter of the U05.CP exercise the whitespace finding names really is the one pinned above (kept honest).
test('U05.CP voice-the-loop starter keeps `note("` tight', async () => {
  const { loadCheckpointFiles } = await import("../../../../content/lib/load.bun.ts");
  const cp = (await loadCheckpointFiles()).defs.find((c: { id: string }) => c.id === "U05.CP") as {
    authored: { id: string; code?: { starter: string } }[];
  };
  const ex = cp.authored.find((e) => e.id === "voice-the-loop");
  expect(stripMarkers(ex?.code?.starter ?? "").code).toContain('note("');
});

describe("Wave 6 — the left-hand dictionary really voices the chords (U12.L06 S7, `voiced-with`)", () => {
  const exercise = {
    kind: "code-make",
    id: "trio",
    version: 1,
    prompt: "",
    skills: [],
    role: "make",
    hints: null,
    tests: [],
    brief: "",
    bars: [4, 8],
    code: { starter: "" },
    rubric: [
      {
        id: "voiced-for-the-left-hand",
        label: "The chords are voiced for the left hand",
        required: true,
        skills: [],
        rule: "custom",
        fn: "voiced-with",
        params: { track: "chords", dict: "lefthand" },
      },
    ],
  } as never;
  const grade = (chords: string, bass = 'chord(changes).rootNotes(2).struct("x x x x").s("upright")') =>
    gradeExercise({
      exercise,
      response: {
        code: `setcpm(112/4)\nconst changes = "<C^7 Am7 Dm7 G7>"\nchords: ${chords}\nbass: ${bass}`,
      },
      ctx: {
        ...base("U12.L06"),
        exerciseGlobalId: "U12.L06/trio",
        mode: "lesson",
        key: C,
        meter: "4/4",
        bpm: 112,
      } as GradeContext,
    });
  test('`.dict("lefthand")` after `.voicing()`, or on the bass, voices nothing', async () => {
    const after = await grade('chord(changes).voicing().dict("lefthand").s("rhodes")');
    expect(after.status).toBe("fail");
    expect(unmet(after).join("\n")).toContain(
      '`chords` is voiced with the default dictionary, not `lefthand`: `.dict("lefthand")` goes before `.voicing()`',
    );
    const onBass = await grade(
      'chord(changes).voicing().s("rhodes")',
      'chord(changes).dict("lefthand").rootNotes(2).s("upright")',
    );
    expect(onBass.status).toBe("fail");
  });
  test("before `.voicing()` it passes, with any rhythm or sound", async () => {
    for (const chords of [
      'chord(changes).dict("lefthand").voicing().s("rhodes")',
      'chord(changes).dict("lefthand").voicing().struct("~ x ~ ~ x ~ ~ ~").s("jazzgtr")',
      'chord("<Dm7 G7 C^7 C^7>").dict("lefthand").voicing().s("rhodes").gain(.6)',
    ])
      expect((await grade(chords)).status).toBe("pass");
  });
});
