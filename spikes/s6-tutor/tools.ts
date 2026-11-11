// Tool executors. Inputs are validated with zod even though the tools are `strict`: strict schemas
// cannot express ranges, and propose_code uses eager_input_streaming, where the API does not
// validate the streamed input at all (the client owns validation).
import type { BetaToolResultBlockParam, BetaToolUseBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import type { ToolName, TutorEvent } from './events.ts';
import { LESSON, type LessonFixture } from './lesson-fixture.ts';
import { type CompareView, lessonContextView, redactIssue, type Rung, MIN_RUNG } from './redaction.ts';

export interface Hap {
  onset: number;
  duration: number;
  midi: number;
  s: string;
}

/** Port to the headless grader (spike S1). The spike uses a tiny fake; production injects the Bun GraderHost. */
export interface GraderPort {
  evaluate(code: string, cycles: number, signal: AbortSignal): Promise<{ haps: Hap[]; error: string | null }>;
}

export interface ToolCtx {
  /** Read by the SERVER from its own state for this learner+step. Never taken from model input. */
  rung: Rung;
  lesson: LessonFixture;
  grader: GraderPort;
  progress: { unlocked: string[]; mastery: Record<string, number>; recentErrors: string[] };
}

const Schemas = {
  evaluate_strudel: z.strictObject({ code: z.string().min(1).max(8000), cycles: z.number().int() }),
  compare_haps: z.strictObject({ learner_code: z.string().min(1).max(8000), target_id: z.string().min(1) }),
  get_learner_progress: z.strictObject({}),
  get_lesson_context: z.strictObject({ lesson_id: z.string().min(1) }),
  propose_code: z.strictObject({ title: z.string().min(1).max(120), code: z.string().min(1).max(8000), explanation: z.string().max(2000) }),
} satisfies Record<ToolName, z.ZodType>;

export interface ToolOutcome {
  block: BetaToolResultBlockParam;
  events: TutorEvent[];
}

function result(use: BetaToolUseBlock, payload: unknown, ok: boolean, summary: string, extra: TutorEvent[] = []): ToolOutcome {
  const block: BetaToolResultBlockParam = { type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(payload) };
  if (!ok) block.is_error = true;
  return { block, events: [...extra, { type: 'tool_result', data: { toolUseId: use.id, name: use.name, ok, summary } }] };
}

/** D-dorian toy evaluator: understands n("a b c").scale("D:dorian") only. Stands in for the real grader. */
export const fakeGrader: GraderPort = {
  async evaluate(code, cycles) {
    const m = /n\("([^"]*)"\)/.exec(code);
    if (!m) return { haps: [], error: 'fake grader: expected n("...")' };
    const scale = [62, 64, 65, 67, 69, 71, 72];
    const steps = m[1]!.trim().split(/\s+/).map(Number);
    if (steps.some((n) => !Number.isInteger(n))) return { haps: [], error: 'fake grader: non-integer step' };
    const haps: Hap[] = [];
    for (let c = 0; c < cycles; c++) {
      steps.forEach((n, i) => {
        const oct = Math.floor(n / 7);
        const deg = ((n % 7) + 7) % 7;
        haps.push({ onset: c + i / steps.length, duration: 1 / steps.length, midi: scale[deg]! + 12 * oct, s: 'triangle' });
      });
    }
    return { haps, error: null };
  },
};

export async function executeTool(use: BetaToolUseBlock, ctx: ToolCtx, signal: AbortSignal): Promise<ToolOutcome> {
  if (!(use.name in Schemas)) {
    return result(use, { error: 'UNKNOWN_TOOL', name: use.name }, false, `unknown tool ${use.name}`);
  }
  const name = use.name as ToolName;
  const parsed = Schemas[name].safeParse(use.input);
  if (!parsed.success) {
    // Same shape for truncated/invalid eager-streamed JSON and for schema violations.
    return result(use, { error: 'INVALID_JSON', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, false, 'invalid input');
  }
  try {
    switch (name) {
      case 'evaluate_strudel': {
        const input = parsed.data as z.infer<typeof Schemas.evaluate_strudel>;
        const cycles = Math.min(16, Math.max(1, input.cycles));
        const r = await ctx.grader.evaluate(input.code, cycles, signal);
        if (r.error) return result(use, { error: r.error }, false, r.error);
        return result(use, { cycles, event_count: r.haps.length, haps: r.haps.slice(0, 64) }, true, `${r.haps.length} events`);
      }
      case 'compare_haps': {
        const input = parsed.data as z.infer<typeof Schemas.compare_haps>;
        if (input.target_id !== ctx.lesson.targetId) return result(use, { error: 'UNKNOWN_TARGET' }, false, 'unknown target');
        const r = await ctx.grader.evaluate(input.learner_code, 1, signal);
        if (r.error) return result(use, { error: r.error }, false, r.error);
        const target = ctx.lesson.targetHaps;
        const hits = target.filter((t) => r.haps.some((h) => h.onset === t.onset && h.midi === t.midi)).length;
        const view: CompareView = {
          target_id: ctx.lesson.targetId,
          score: target.length ? hits / target.length : 0,
          event_count: { learner: r.haps.length, target: target.length },
          // The diff is expressed through the SAME redacted issue view as get_lesson_context.
          issues: ctx.lesson.issues.map((i, idx) => redactIssue(i, ctx.rung, idx)),
        };
        if (ctx.rung >= MIN_RUNG.targetHaps) view.target_haps = target;
        return result(use, view, true, `score ${view.score.toFixed(2)}`);
      }
      case 'get_learner_progress':
        return result(use, ctx.progress, true, 'progress');
      case 'get_lesson_context': {
        const input = parsed.data as z.infer<typeof Schemas.get_lesson_context>;
        if (input.lesson_id !== ctx.lesson.lessonId) return result(use, { error: 'UNKNOWN_LESSON' }, false, 'unknown lesson');
        return result(use, lessonContextView(ctx.lesson, ctx.rung), true, `lesson ${input.lesson_id} @ rung ${ctx.rung}`);
      }
      case 'propose_code': {
        const input = parsed.data as z.infer<typeof Schemas.propose_code>;
        const r = await ctx.grader.evaluate(input.code, 1, signal);
        const valid = r.error === null;
        const card: TutorEvent = {
          type: 'code_card',
          data: {
            toolUseId: use.id,
            title: input.title,
            code: input.code,
            explanation: input.explanation,
            // "You type your own code": cards on graded steps are preview-only below the reveal rung.
            applyAllowed: ctx.rung >= MIN_RUNG.solution,
          },
        };
        return result(use, { shown: valid, errors: r.error ? [r.error] : [] }, valid, valid ? 'card shown' : 'card invalid', valid ? [card] : []);
      }
    }
  } catch (e) {
    return result(use, { error: 'TOOL_FAILED', message: e instanceof Error ? e.message : String(e) }, false, 'tool failed');
  }
}

export function defaultToolCtx(rung: Rung): ToolCtx {
  return {
    rung,
    lesson: LESSON,
    grader: fakeGrader,
    progress: { unlocked: ['n', 'note', 's', 'scale', 'setcpm'], mastery: { 'scale-degrees': 0.4 }, recentErrors: ['pitch.degree-off-by-one'] },
  };
}
