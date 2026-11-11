// LessonContextPort over the content index and the learner's library. Step sources are UNREDACTED
// (solutions, wrong variants from `tests` with `expect: 'fail'`, the four hint texts); the tutor redacts.
// Checkpoint items and the current drill trial are never given to the tutor (contracts §10.4).
import type { AnalysisSummary, Answer, Exercise, KeySpec, StepDef } from "@oak/content-kit";
import { stripMarkers } from "@oak/content-kit";
import type { ContentIndex } from "../content/index.ts";
import type { Repos } from "../db/repos/index.ts";
import type { LessonSource, ReviewSource, StepSource, SubjectFacts } from "../tutor/domain.ts";
import type { LessonContextPort } from "../tutor/ports.ts";
import { revisionCountFor } from "../tutor/reviews.ts";
import type { SubjectRef } from "../tutor/types.ts";

/**
 * A step ID as the tool schema documents it (`U03.L02/S5`) or as the app sends it (`S5`): the local ID.
 * The model is told to pass the qualified form; the content index keys steps by the local one.
 */
export function localStepId(lessonId: string, stepId: string): string {
  return stepId.startsWith(`${lessonId}/`) ? stepId.slice(lessonId.length + 1) : stepId;
}

export function keyText(key: KeySpec | null | undefined): string | null {
  return key === null || key === undefined ? null : `${key.tonic} ${key.mode}`;
}

/** The deterministic `AnalysisSummary` as plain text for a review. */
export function analysisText(a: AnalysisSummary | null | undefined): string {
  if (a === null || a === undefined) return "No analysis yet.";
  const lines = [
    `Tempo: ${Math.round(a.bpm)} BPM; ${a.bars} bars; about ${Math.round(a.durationSec)} s.`,
    `Key estimate: ${a.key.map((k) => `${k.key.tonic} ${k.key.mode} (r=${k.r.toFixed(2)})`).join(", ") || "none"}.`,
    `Roles: ${
      Object.entries(a.roles)
        .map(([role, track]) => `${role}=${track}`)
        .join(", ") || "none"
    }.`,
  ];
  const rest = Object.entries(a).filter(([k]) => !["key", "bpm", "bars", "durationSec", "roles"].includes(k));
  for (const [k, v] of rest) lines.push(`${k}: ${JSON.stringify(v)}`);
  return lines.join("\n");
}

function starterOf(ex: Exercise): string | null {
  if (!("code" in ex) || typeof ex.code !== "object" || ex.code === null || !("starter" in ex.code))
    return null;
  try {
    return stripMarkers(ex.code.starter).code;
  } catch {
    return ex.code.starter;
  }
}

function hintsOf(ex: Exercise, solutions: readonly string[]): StepSource["hints"] {
  if (ex.hints === null) return null;
  const [a, b, c, d] = ex.hints;
  const reveal = d === "auto" ? (solutions[0] ?? "Show the solution.") : (d.patch ?? d.text);
  return [a.text, b.text, c.text, reveal];
}

type ChoiceLike = { id: string; label: string };

/** A static answer as the learner would say it: choice labels (not IDs), texts, numbers, numerals. */
function answerTexts(answer: Partial<Answer> | undefined, choices: readonly ChoiceLike[] = []): string[] {
  if (answer === undefined || answer === null) return [];
  const label = (id: string) => choices.find((c) => c.id === id)?.label ?? id;
  const out: string[] = [];
  if (answer.choice !== undefined && answer.choice.length > 0) out.push(answer.choice.map(label).join(", "));
  if (answer.text !== undefined) out.push(...answer.text.slice(0, 1));
  if (answer.number !== undefined) out.push(String(answer.number));
  if (answer.rn !== undefined && answer.rn.length > 0) out.push(answer.rn.join(" "));
  if (answer.degrees !== undefined && answer.degrees.length > 0) out.push(answer.degrees.join(" "));
  if (answer.qualities !== undefined && answer.qualities.length > 0) out.push(answer.qualities.join(" "));
  return out;
}

/**
 * Reference answers of a step for the tutor's answer policy and redaction (contracts §10.5): the code
 * solutions, and for answer-type exercises with a fixed answer (predict, identify, fact, staff-read, the
 * questions of an investigate step) the answer itself. Without these an ear or predict step looked like
 * an open step ("nothing to withhold") and the tutor was free to say the answer at rung 1. Answers drawn
 * by a generator (`correct: {}`) are not known before the trial and are not here.
 */
export function referenceAnswers(ex: Exercise | undefined): string[] {
  if (ex === undefined) return [];
  const out: string[] = [];
  if ("reference" in ex && ex.reference !== undefined && ex.reference !== null && "solutions" in ex.reference)
    out.push(...(ex.reference as { solutions: string[] }).solutions);
  const optionsOf = (ui: unknown): ChoiceLike[] =>
    typeof ui === "object" && ui !== null && Array.isArray((ui as { options?: unknown }).options)
      ? ((ui as { options: ChoiceLike[] }).options ?? [])
      : [];
  switch (ex.kind) {
    case "predict":
      if (Array.isArray(ex.correct))
        out.push(ex.correct.map((id) => ex.choices?.find((c) => c.id === id)?.label ?? id).join(", "));
      else if (typeof ex.correct === "number") out.push(String(ex.correct));
      break;
    case "identify":
    case "fact":
      out.push(...answerTexts(ex.correct, optionsOf(ex.answer)));
      break;
    case "staff-read":
      out.push(...answerTexts(ex.correct, optionsOf(ex.answer)));
      break;
    case "run-investigate":
      for (const q of ex.questions)
        if (q.q === "choice")
          out.push(q.correct.map((id) => q.options.find((o) => o.id === id)?.label ?? id).join(", "));
        else if (q.q === "number") out.push(String(q.correct));
      break;
    default:
      break;
  }
  return [...new Set(out.map((t) => t.trim()).filter((t) => t.length > 0))];
}

export function stepSource(lessonId: string, step: StepDef): StepSource {
  const ex = step.exercise;
  const solutions = referenceAnswers(ex);
  const rubric =
    ex !== undefined && "rubric" in ex && Array.isArray(ex.rubric)
      ? (ex.rubric as { label: string; required: boolean }[]).map((r) => ({
          label: r.label,
          required: r.required,
        }))
      : null;
  const constraints =
    ex !== undefined && "constraints" in ex && Array.isArray(ex.constraints)
      ? (ex.constraints as unknown[]).map((c) =>
          typeof c === "object" && c !== null && "id" in c
            ? String((c as { id: unknown }).id)
            : JSON.stringify(c),
        )
      : [];
  return {
    lessonId,
    id: step.id,
    kind: step.kind,
    grading: step.kind === "make" ? "make" : step.graded === true ? "graded" : "ungraded",
    exerciseRef: ex === undefined ? null : `${lessonId}/${ex.id}`,
    prompt: ex?.prompt ?? step.title,
    starterCode: ex === undefined ? null : starterOf(ex),
    constraints,
    rubric,
    hints: ex === undefined ? null : hintsOf(ex, solutions),
    knownMistakes:
      ex?.tests
        .filter((t) => t.expect === "fail")
        .map((t) => ({
          feedback: t.feedback?.[0] ?? "",
          description: t.name,
          variantCode: "code" in t.response ? t.response.code : null,
        })) ?? [],
    solutions: step.kind === "make" ? [] : solutions,
  };
}

export class LessonContextAdapter implements LessonContextPort {
  constructor(
    private readonly content: ContentIndex,
    private readonly repos: Repos,
  ) {}

  async lesson(lessonId: string): Promise<LessonSource | null> {
    const def = this.content.lessonDef(lessonId);
    if (def !== null)
      return {
        id: def.id,
        title: def.title,
        objective: def.objective,
        key: keyText(def.key),
        meter: def.meter,
        bpm: def.bpm,
      };
    const site = this.content.lessonSite(lessonId);
    if (site === null) return null;
    return {
      id: site.meta.id,
      title: site.meta.title,
      objective: site.meta.objective,
      key: null,
      meter: site.unit.meter ?? null,
      bpm: null,
    };
  }

  async step(lessonId: string, stepId: string): Promise<StepSource | null> {
    // Checkpoint items (owner is a checkpoint) and drill trials are not lesson steps: never sent.
    if (this.content.checkpointMeta(lessonId) !== null) return null;
    const step = this.content.stepDef(lessonId, localStepId(lessonId, stepId));
    if (step === null) return null;
    return stepSource(lessonId, step);
  }

  async resolveExercise(ref: string): Promise<{ lessonId: string; stepId: string } | null> {
    const site = this.content.exercise(ref);
    if (site === null || site.ownerKind !== "lesson" || site.stepId === null) return null;
    return { lessonId: site.owner, stepId: site.stepId };
  }

  async subject(ref: SubjectRef): Promise<SubjectFacts> {
    const open = (title: string | null, extra: Partial<SubjectFacts> = {}): SubjectFacts => ({
      tutorOpen: true,
      closedReason: null,
      title,
      released: null,
      transcriptionSource: null,
      ...extra,
    });
    switch (ref.subjectKind) {
      case "checkpoint":
        return {
          ...open(this.content.checkpointMeta(ref.subjectId)?.title ?? null),
          tutorOpen: false,
          closedReason: "Checkpoints are done on your own: the tutor opens again afterwards.",
        };
      case "drill":
        return {
          ...open(this.content.family(ref.subjectId)?.title ?? null),
          tutorOpen: false,
          closedReason: "The tutor is off during drill trials.",
        };
      case "lesson":
        return open(this.content.lessonTitle(ref.subjectId));
      case "capstone":
        return open(this.content.capstoneMeta(ref.subjectId)?.title ?? null, {
          released: this.repos.capstones.get(ref.subjectId)?.status === "released",
        });
      case "track": {
        const track = this.content.source.syllabus.tracks.find((t) => t.id === ref.subjectId);
        const released = (track?.capstones ?? []).some(
          (c) => this.repos.capstones.get(c)?.status === "released",
        );
        return open(track?.title ?? null, { released });
      }
      case "transcription": {
        const t = this.repos.transcriptions.get(ref.subjectId);
        return open(t?.title ?? null, {
          transcriptionSource: t === null ? null : t.sourceKind === "own-audio" ? "own-audio" : "ladder",
        });
      }
      case "sketch":
        return open(this.repos.sketches.get(ref.subjectId)?.title ?? null);
      default:
        return open(null);
    }
  }

  async review(ref: SubjectRef): Promise<ReviewSource | null> {
    if (ref.subjectKind === "capstone") return this.#capstoneReview(ref.subjectId);
    if (ref.subjectKind === "transcription") return this.#transcriptionReview(ref.subjectId);
    return null;
  }

  #capstoneReview(id: string): ReviewSource | null {
    const meta = this.content.capstoneMeta(id);
    const row = this.repos.capstones.get(id);
    if (meta === null || row === null || row.sketchId === null) return null;
    const sketch = this.repos.sketches.get(row.sketchId);
    if (sketch === null) return null;
    const version = this.repos.sketches.version(sketch.id, sketch.currentVersion);
    if (version === null) return null;
    const def = this.content.capstoneDef(id);
    const authored = def?.brief?.rubric ?? [];
    const results = row.lastResult?.rubric ?? [];
    const rubric = authored.map((r) => ({
      label: r.label,
      required: r.required,
      met: results.find((x) => x.ruleId === r.id)?.ok ?? false,
    }));
    const analysis = version.analysis ?? row.lastResult?.analysis ?? null;
    return {
      title: sketch.title,
      code: version.code,
      brief: def?.brief?.prompt ?? meta.objective,
      analysis: analysisText(analysis),
      rubric,
      learnerNote: version.note,
      checklist: [],
      reference: null,
      totalBars: analysis?.bars ?? null,
      revisions: revisionCountFor(id),
    };
  }

  #transcriptionReview(id: string): ReviewSource | null {
    const t = this.repos.transcriptions.get(id);
    if (t === null) return null;
    const versions = this.repos.transcriptions.versions(id);
    const latest = versions.at(-1);
    if (latest === undefined) return null;
    // The reference is shown only once a graded ladder piece has passed; never for the learner's own audio.
    const passed = versions.some((v) => v.result?.status === "pass");
    const reference = t.sourceKind !== "own-audio" && passed ? t.hiddenCode : null;
    const checklist = Object.entries(t.checklist).map(([item, score]) => `${item}: ${score}/2`);
    return {
      title: t.title,
      code: latest.code,
      brief:
        t.sourceKind === "own-audio"
          ? `Transcribe “${t.title}” from your own recording.`
          : `Transcribe “${t.title}”.`,
      analysis: analysisText(latest.result?.analysis ?? null),
      rubric: (latest.result?.rubric ?? []).map((r) => ({
        label: r.ruleId,
        required: r.required,
        met: r.ok,
      })),
      learnerNote: null,
      checklist,
      reference,
      totalBars: latest.result?.analysis?.bars ?? null,
      revisions: 1,
    };
  }

  async prefixSources(): Promise<{ syllabus: string; catalog: string }> {
    return this.content.source.tutorPrefix;
  }
}
