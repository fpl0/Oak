// CF-T "Standard Transcription" in the capstone workspace (contracts §6.6 CF-T; content/specs/CF.md): what the
// phrase-check workspace of X1 and X2 needs beyond them. The form map that opens session 1 (its check as a row the
// phrase checks may wait for, its grade as a result the server can keep, its feedback: which section, what to
// compare, never the answer), the draft that is written only once the map is right, and the rubric of the last
// session (the four roles, the song's own sections) graded on the whole arrangement. The strip, the skeleton and
// the stage rules are the transcribe engineer's (`../../transcribe/form-map.ts`, `standard.ts`); the grading is
// @oak/grader's `gradeFormMap`. Pure.
import type {
  CapstoneCheckState,
  CapstoneDef,
  CapstoneSessionDef,
  FormMapCheck,
  GradeResult,
  RubricRule,
  SongDef,
} from "@oak/api";
import type { ExerciseOf } from "@oak/content-kit";
import { type FormMapResult, type GradeRequest, gradeFormMap, songFormOf } from "@oak/grader";
import { type FormMap, formMapAnswer } from "../../transcribe/form-map.ts";
import { standardStarter } from "../../transcribe/standard.ts";
import { type LocalCheck, type SettledChecks, songGivenFromDef, transcribeStarter } from "./phrases.ts";

/** A form check of this sitting: the map that was checked and its grade. */
export interface FormMapFeedback {
  map: FormMap;
  result: GradeResult;
  passed: boolean;
}

/**
 * The code a transcription capstone opens with. One that starts with a form map (CF-T) has no code to fill in
 * yet: the givens, and a line saying the draft is written from the map. X1 and X2 keep their own starters.
 */
export function capstoneStarter(
  def: Pick<CapstoneDef, "sessionDefs">,
  song: Parameters<typeof transcribeStarter>[1],
): string {
  return formMapOf(def)
    ? standardStarter(songGivenFromDef(song))
    : transcribeStarter(
        def.sessionDefs.flatMap((sd) => sd.checks ?? []),
        song,
      );
}

/** The session that opens with a form map, and the check (CF-T.S1); `null` for X1 and X2. */
export function formMapOf(
  def: Pick<CapstoneDef, "sessionDefs">,
): { sessionIndex: number; check: FormMapCheck } | null {
  const sessionIndex = def.sessionDefs.findIndex((sd) => sd.formMap !== undefined);
  const check = def.sessionDefs[sessionIndex]?.formMap;
  return check ? { sessionIndex, check } : null;
}

export const FORM_MAP_NAME = "the form map";

/** The form map's state: the server's row (layer `form`) merged with what was graded here before it was stored. */
export function formMapState(
  check: Pick<FormMapCheck, "id">,
  server: readonly Pick<CapstoneCheckState, "checkId" | "score" | "passed" | "revealed" | "attempts">[],
  local: Readonly<Record<string, LocalCheck>>,
): LocalCheck {
  const s = server.find((x) => x.checkId === check.id);
  const l = local[check.id];
  return {
    score: Math.max(s?.score ?? -1, l?.score ?? -1) < 0 ? null : Math.max(s?.score ?? 0, l?.score ?? 0),
    passed: (s?.passed ?? false) || (l?.passed ?? false),
    revealed: (s?.revealed ?? false) || (l?.revealed ?? false),
    attempts: Math.max(s?.attempts ?? 0, l?.attempts ?? 0),
  };
}

/** The map as a check the phrase checks know (`PhraseCheck.after: ["form-map"]`): settled once passed or shown. */
export function formMapSettled(check: Pick<FormMapCheck, "id">, state: LocalCheck): SettledChecks {
  return new Map([[check.id, { settled: state.passed || state.revealed, name: FORM_MAP_NAME }]]);
}

const barsWord = (b: readonly [number, number]) => (b[0] === b[1] ? `bar ${b[0]}` : `bars ${b[0]}–${b[1]}`);

/**
 * What a form check says (CF.md "Feedback names the section and what to compare, never the answer"): one line per
 * section that is not right yet, and one per cut where the tune has no new section.
 */
export function formMapMessages(r: FormMapResult): { text: string; bar: number }[] {
  const out: { text: string; bar: number }[] = [];
  const first = r.sections[0]?.expected.bars ?? [1, 1];
  for (const s of r.sections) {
    if (s.ok) continue;
    const here = s.expected.bars;
    const head: [number, number] = [here[0], Math.min(here[1], here[0] + 1)];
    if (s.startOk)
      out.push({
        bar: here[0],
        text:
          s.index === 0
            ? `Section 1 starts in the right place. Its name: every later section is named against it.`
            : `Section ${s.index + 1} starts in the right place. Its name: listen to ${barsWord(head)} against ${barsWord([first[0], Math.min(first[1], first[0] + 1)])}.`,
      });
    else
      out.push({
        bar: here[0],
        text: `Something new starts between ${barsWord([Math.max(1, here[0] - 2), here[0] + 1])}: listen for where, and cut there.`,
      });
  }
  for (const bar of r.extra) {
    const inside = r.sections.find((s) => bar > s.expected.bars[0] && bar <= s.expected.bars[1]);
    out.push({
      bar,
      text: inside
        ? `There is no new section at bar ${bar}: ${barsWord(inside.expected.bars)} are one.`
        : `There is no new section at bar ${bar}.`,
    });
  }
  return out;
}

/**
 * A form map's grade as a `GradeResult` (what `capstones.recordCheck` stores and the strip's marks read): the
 * score is the share of sections right, a pass needs the check's mark (1 for CF-T), a revealed map earns nothing.
 */
export function formMapGrade(o: {
  capstoneId: string;
  check: Pick<FormMapCheck, "id" | "pass">;
  song: Pick<SongDef, "answerKey">;
  map: FormMap;
  attemptNo: number;
  reveal?: boolean;
}): { result: GradeResult; passed: boolean; detail: FormMapResult } {
  const detail = gradeFormMap(formMapAnswer(o.map), o.song, o.check.pass);
  const reveal = o.reveal === true;
  const passed = detail.passed && !reveal;
  const messages = formMapMessages(detail);
  const result: GradeResult = {
    exerciseId: `${o.capstoneId}/${o.check.id}`,
    exerciseVersion: 1,
    attemptNo: o.attemptNo,
    firstAttempt: o.attemptNo === 1,
    mode: "capstone",
    status: reveal ? "fail" : detail.passed ? "pass" : "fail",
    score: reveal ? 0 : detail.score,
    adjustedScore: reveal ? 0 : detail.score,
    dims: {},
    constraints: [],
    diagnostics: [],
    messages: messages
      .slice(0, 3)
      .map((m) => ({ id: "form.map" as never, text: m.text, where: { bar: m.bar } })),
    assist: { rung: reveal ? 4 : 0, tutorHints: 0, extraReplays: 0, revealed: reveal },
  };
  return { result, passed, detail };
}

/** The song's own map (a revealed check shows it): one cut per section of the answer key, lettered by shape. */
export function songFormMap(song: Pick<SongDef, "answerKey">): FormMap | null {
  const sections = song.answerKey.sections;
  if (!sections || sections.length === 0) return null;
  const seen = new Map<string, string>();
  const labels = sections.map((s) => {
    const key = s.label.replace(/\d+$/, "").toLowerCase();
    if (!seen.has(key)) seen.set(key, String.fromCharCode(65 + seen.size));
    return seen.get(key) as string;
  });
  return { bars: song.answerKey.bars, cuts: sections.map((s) => s.bars[0]), labels };
}

/** "mapped by ear" / "revealed": the form map's line in the liner notes (contracts §6.6: a revealed check is named). */
export function formMapLinerItem(state: Pick<LocalCheck, "passed" | "revealed">): string | null {
  if (state.revealed) return "the form map";
  return null;
}

// --- the last session's rubric (CF-T.S4) --------------------------------------------------------------------

/** The rules a session's draft must meet beside its phrase checks (`CapstoneSessionDef.rubric`); `[]` when none. */
export function sessionRubric(sd: Pick<CapstoneSessionDef, "rubric"> | undefined): readonly RubricRule[] {
  return sd?.rubric ?? [];
}

/**
 * The grade request of a session rubric: the rules as a compose brief, graded in capstone mode on the whole
 * arrangement, with the song's own form for the `form` rule's `@song` pattern.
 */
export function sessionRubricRequest(o: {
  capstoneId: string;
  sessionId: string;
  rubric: readonly RubricRule[];
  song: Pick<SongDef, "answerKey" | "key" | "meter" | "bpm" | "swing" | "pickup">;
  code: string;
  lint: GradeRequest["ctx"]["lint"];
}): GradeRequest {
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
    rubric: [...o.rubric],
    code: { starter: "" },
    album: { slot: o.capstoneId },
    review: { tutor: "offer" },
  } as unknown as ExerciseOf<"compose-brief">;
  const songForm = songFormOf(o.song);
  return {
    exercise,
    response: { code: o.code },
    ctx: {
      exerciseGlobalId: `${o.sessionId}/session-rubric`,
      mode: "capstone",
      key: o.song.key,
      meter: o.song.meter,
      bpm: o.song.bpm,
      ...(o.song.swing ? { swing: o.song.swing } : {}),
      ...(o.song.pickup ? { pickup: o.song.pickup } : {}),
      ...(songForm ? { songForm } : {}),
      params: {},
      attemptNo: 1,
      firstAttempt: true,
      rung: 0,
      tutorHints: 0,
      extraReplays: 0,
      lint: o.lint,
    },
  };
}
