// Wave 7 context (wave7.md §11; contracts §10.8): the advanced tracks' vocabulary as the learner meets it — jazz
// symbols and extensions, ii–V–I, guide tones, voicing types, walking bass, substitutions, swing ratios, the pocket,
// odd meters, hemiola, polyrhythm, clave, Euclidean rhythm, sound controls, registers, density — always inside the
// introduced-terms list for the learner's actual route, anything beyond it marked as a preview; a core learner's
// context unchanged; a track subject's context says which track it is in.
import { describe, expect, test } from "bun:test";
import { terms as COURSE_TERMS } from "../../../content/terms.ts";
import { prepareTurn } from "./prepare.ts";
import { PERSONA } from "./prompt/persona.ts";
import { makePorts } from "./testing/fakes.ts";
import {
  GROUPING_STEP,
  JAZZ_CHORD_STEP,
  W7_LEARNER,
  W7_LESSON,
  w7GradeFor,
} from "./testing/wave7-fixtures.ts";
import type { TurnRequest } from "./types.ts";
import {
  trackOfSubject,
  type Vocabulary,
  vocabularyOf,
  W7_TERMS,
  w7VocabularyLines,
  w7VocabularyOf,
} from "./vocabulary.ts";

const CORE = COURSE_TERMS.filter((t) => /^U\d\d\./.test(t.introducedBy)).map((t) => t.id as string);
const terms = (ids: string[]) => ({ count: ids.length, recent: [...ids].reverse().slice(0, 30), all: ids });
const vocab = (ids: string[]): Vocabulary => vocabularyOf(terms(ids));
const lines = (ids: string[], track: Parameters<typeof w7VocabularyLines>[2] = {}) =>
  w7VocabularyLines(w7VocabularyOf(terms(ids)), vocab(ids), track);
/** The terms of the lessons whose IDs match, on top of the core. */
const upTo = (...re: RegExp[]) => [
  ...CORE,
  ...COURSE_TERMS.filter((t) => re.some((r) => r.test(t.introducedBy))).map((t) => t.id as string),
];

describe("the tracks' vocabulary, as it is met", () => {
  test("a core learner outside a track: no line at all (earlier contexts are unchanged)", () => {
    expect(lines(CORE)).toEqual([]);
    expect(lines(CORE, { track: null })).toEqual([]);
  });

  test("a core learner on a jazz subject: every jazz word only as a preview, the other tracks one line each", () => {
    const [met, forms] = lines(CORE, { track: "jazz" }) as [string, string];
    expect(met).toMatch(/^vocabulary_tracks: jazz: ride pattern no · sixth chords no/);
    expect(met).not.toContain("rhythm:");
    for (const preview of [
      "sixth and sus chords only as a preview",
      "the ii–V–I only as a preview: say 'the chords on 2 and 5 going home to 1'",
      "extensions and avoid notes only as a preview",
      "voicing types only as a preview: say which chord notes are played and which is lowest",
      "walking bass only as a preview: say 'a note on every beat'",
      "reharmonization devices only as a preview",
      "advanced rhythm words (swing ratio, clave, odd meters, polyrhythm) only as a preview",
      "arrangement and sound words (saturation, LFO, register, density, the mix) only as a preview",
    ])
      expect(forms).toContain(preview);
  });

  test("each jazz lesson switches its own forms on, and only its own", () => {
    const at = (...re: RegExp[]) => lines(upTo(...re))[1] as string;
    expect(at(/^J1\.L0[1-3]$/)).toContain(
      "the ii–V–I as [[rn:ii7]] [[rn:V7]] [[rn:Imaj7]], named by the key it lands in; the minor ii–V–i only as a preview",
    );
    expect(at(/^J1\.L0[1-3]$/)).toContain("voicing types only as a preview");
    expect(at(/^J1\./)).toContain(
      "voicings by type, read from the written notes octave by octave: shell (root, 3rd, 7th); rootless A and B only as a preview; drop-2 only as a preview",
    );
    expect(at(/^J[12]\./)).toContain("[[chord:Dm7b5]] [[chord:G7b9]] [[chord:Cm7]] in C minor");
    expect(at(/^J[12]\./)).toContain("an avoid note is a HELD note a half step above a chord tone");
    expect(at(/^J[12]\./)).toContain(
      "Locrian over a iiø7, altered over a V7alt), always as 'a common choice'",
    );
    expect(at(/^J[1-3]\./)).toContain("rootless A (3 5 7 9 from the bottom) and B (7 9 3 5)");
    expect(at(/^J[1-3]\./)).toContain(
      "a .voicing() line is a dictionary voicing: never call it shell, A, B or drop-2",
    );
    expect(at(/^J[1-3]\./)).toContain("a walking bass judged on the quarters");
    expect(at(/^J[1-4]\./)).toContain("rhythm changes (32 bars, AABA, the bridge's dominants two bars each)");
    expect(at(/^J[1-4]\./)).toContain("reharmonization devices only as a preview");
    expect(at(/^J[1-5]\.L01$/, /^J[1-4]\./)).toContain(
      "reharmonization devices by name and bar: tritone substitution (the dominant a tritone away: [[chord:Db7]] for [[chord:G7]] before C); the others only as a preview",
    );
  });

  test("each rhythm lesson switches its own forms on; the pocket is never a defined term", () => {
    const at = (...re: RegExp[]) => lines(upTo(...re))[1] as string;
    expect(at(/^R1\.L0[1-2]$/)).toContain(
      "swing as a long:short ratio with its amount in code: 3:2 light (.swingBy(0.2, 8)), 2:1 triplet (.swingBy(1/3, 8)), 3:1 hard (.swingBy(0.5, 8))",
    );
    expect(at(/^R1\./)).toContain("the pocket and 'the one' in plain words");
    expect(at(/^R1\./)).toContain(
      "8–45 ms is a feel, more is a displacement; a .late() amount is cycles, so always give its ms",
    );
    expect(at(/^R1\./)).toContain("odd meters and groupings only as a preview");
    expect(at(/^R[12]\./)).toContain("odd meters by their groups: 7/8 as 2+2+3 counted 1 2 | 1 2 | 1 2 3");
    expect(at(/^R[12]\./)).toContain("({bd ~ ~}%4: 3 bars)");
    expect(at(/^R[12]\./)).toContain("the tresillo and the clave only as a preview");
    expect(at(/^R[1-3]\./)).toContain(
      "son or rumba, 3-2 or 2-3 by which bar holds three strokes (son 3-2 on eighths: 0 3 6 | 2 4)",
    );
    expect(at(/^R[1-3]\./)).toContain("x(3,8) is the tresillo, (k,n,r) rotated by r steps");
  });

  test("the sound track: grit, movement, FM, registers, density, the mix", () => {
    const [, forms] = lines(upTo(/^A1\.L0[5-7]$/, /^A2\./)) as [string, string];
    for (const f of [
      "grit: saturation (.distort)",
      "vibrato wobbles the pitch (.vib with a depth that is not 0)",
      "a clash is two low notes closer than their limit",
      "a part more than 24 dB under it is not heard",
    ])
      expect(forms).toContain(f);
    expect(forms).toContain(
      "jazz harmony words (ii–V–I, shells, extensions, walking bass) only as a preview",
    );
  });

  test("the subjects of each track", () => {
    for (const id of ["J1.L02", "JC3", "J.CP1"]) expect(trackOfSubject(id)).toBe("jazz");
    for (const id of ["R2.L04", "RC1", "R.CP"]) expect(trackOfSubject(id)).toBe("rhythm");
    for (const id of ["A1.L05", "A2.L01", "AC2", "A.CP"]) expect(trackOfSubject(id)).toBe("sound");
    for (const id of ["A1.L01", "A1.L04", "U14.L02", "C7", "CF-A", null])
      expect(trackOfSubject(id)).toBeNull();
  });

  test("every name the lines wait for is a glossary term of the right track (content/terms.ts)", () => {
    const byId = new Map(COURSE_TERMS.map((t) => [t.id as string, t.introducedBy]));
    for (const id of Object.values(W7_TERMS))
      expect(byId.get(id)).toMatch(/^(?:J\d\.|R\d\.|A1\.L0[5-7]$|A2\.)/);
  });
});

describe("a track step's lesson context", () => {
  const turn = (step: typeof JAZZ_CHORD_STEP, ids: string[]): Promise<string> => {
    const ports = makePorts();
    ports.lessons.lessons.set(step.lessonId, { ...W7_LESSON, id: step.lessonId });
    ports.lessons.steps.set(step.id, step);
    ports.progress.terms = terms(ids);
    ports.progress.set(step.id, { rung: 1 });
    const req: TurnRequest = {
      thread: { subjectKind: "lesson", subjectId: step.lessonId },
      kind: "chat",
      userText: "What should I listen for?",
      learnerCode: W7_LEARNER[step.id] as string,
      graderResult: w7GradeFor(step),
      stepId: step.id,
    };
    return prepareTurn(req, ports).then((p) => p.user.oakContext);
  };

  test("a jazz step: the jazz lines; an example the step's answer would be is withheld below the reveal", async () => {
    const ctx = await turn(JAZZ_CHORD_STEP, upTo(/^J1\.L01$/));
    expect(ctx).toContain("vocabulary_tracks: jazz: ride pattern yes");
    expect(ctx).toContain("answer_kind: text");
    // The forms line's example [[chord:Dm7]] is this step's answer: it is withheld there too.
    expect(ctx).toContain(
      "chord symbols in code spelling ([[chord:C^7]], (withheld until you reveal it), [[chord:Dm7b5]]",
    );
    expect(ctx).not.toMatch(/\[\[chord:Dm7\]\]/);
  });

  test("a step in its own meter: 7/8 in the key line, the rhythm lines", async () => {
    const ctx = await turn(GROUPING_STEP, upTo(/^R1\./, /^R2\.L01$/));
    expect(ctx).toContain("meter: 7/8");
    expect(ctx).toContain("answer_kind: grouping");
    expect(ctx).toContain("odd meters by their groups");
    // The forms line's 2+2+3 is this step's answer: withheld.
    expect(ctx).not.toContain("7/8 as 2+2+3");
  });

  test("the persona names the Wave 7 fact lines and the track chips", () => {
    for (const k of [
      "two_five",
      "keys_visited",
      "walking_bass",
      "reharm_device",
      "clave_alignment",
      "register_clash",
      "levels",
    ])
      expect(PERSONA).toContain(`\`${k}\``);
    expect(PERSONA).toContain("[[term:a-voicing]]");
    expect(PERSONA).toContain("versions");
  });
});
