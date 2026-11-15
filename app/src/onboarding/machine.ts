// The onboarding state machine (XState 5). One machine for the whole flow: it loads the saved state, moves
// through FLOW as the learner finishes or skips screens, honours Quiet mode (the mic-only screens are passed
// over and recorded as skipped), and ends in `finished` after the coda. Every transition that changes what the
// server keeps produces the patch to send (`patchOf`); the route persists it and mirrors `step` in the URL.
import type { OnboardingPatch, OnboardingState, OnboardingStep } from "@oak/api";
import { assign, setup } from "xstate";
import { canVisit, FLOW, freshState, frontier, nextAfter, STEP_META } from "./flow.ts";

export interface OnboardingContext extends OnboardingState {
  /** Quiet mode (no mic today, or no usable mic): the mic-only screens are skipped. */
  quiet: boolean;
}

export type OnboardingEvent =
  | { type: "LOADED"; state: OnboardingState; quiet: boolean }
  | { type: "DONE"; step: OnboardingStep; firstEdit?: number; sketchId?: string; at?: string }
  /** The learner ran another number on the reaction screen: it is their number now (sketch and coda follow it). */
  | { type: "EDITED"; value: number }
  | { type: "SKIP"; step: OnboardingStep }
  | { type: "VISIT"; step: OnboardingStep }
  | { type: "QUIET"; on: boolean };

const add = (xs: readonly OnboardingStep[], ...more: OnboardingStep[]) => {
  const out = [...xs];
  for (const m of more) if (!out.includes(m)) out.push(m);
  return FLOW.filter((s) => out.includes(s));
};
const without = (xs: readonly OnboardingStep[], ...drop: OnboardingStep[]) =>
  xs.filter((s) => !drop.includes(s));

/** The learner finished `step` (pure). Doing a step that was skipped earlier un-skips it. */
export function applyDone(
  c: OnboardingContext,
  e: Extract<OnboardingEvent, { type: "DONE" }>,
): OnboardingContext {
  const { next, autoSkipped } = nextAfter(e.step, c.quiet);
  const completed = add(c.completed, e.step);
  // Steps already done stay done; only untouched mic steps become "skipped" in Quiet mode.
  const newlySkipped = autoSkipped.filter((s) => !completed.includes(s));
  return {
    ...c,
    completed,
    skipped: add(without(c.skipped, e.step), ...newlySkipped),
    firstEdit: e.firstEdit ?? c.firstEdit,
    sketchId: e.sketchId ?? c.sketchId,
    startedAt: c.startedAt ?? e.at ?? null,
    // Revisiting an earlier screen and finishing it again returns to where the learner was.
    step: next === null ? "coda" : laterOf(next, frontierAfter(c, completed, newlySkipped)),
    finishedAt: e.step === "coda" ? (e.at ?? new Date().toISOString()) : c.finishedAt,
  };
}

function frontierAfter(
  c: OnboardingContext,
  completed: OnboardingStep[],
  skipped: OnboardingStep[],
): OnboardingStep {
  return frontier({ completed, skipped: add(c.skipped, ...skipped) });
}

const laterOf = (a: OnboardingStep, b: OnboardingStep) => (FLOW.indexOf(a) >= FLOW.indexOf(b) ? a : b);

/**
 * Quiet mode switched on or off. Switching it off (Back to the microphone, then Allow) offers the mic-only steps
 * again: the ones passed over in Quiet mode are no longer recorded as skipped, so the frontier returns to them.
 * Switching it on in the middle of a mic-only step passes over that step.
 */
export function applyQuiet(c: OnboardingContext, on: boolean): OnboardingContext {
  if (on) {
    if (c.quiet) return c;
    // Switched on while a mic-only step is on screen (Settings › Voice in another tab): that step is passed over
    // as it would have been, and the learner lands on the next one; a step already done stays where it is.
    if (!STEP_META[c.step].needsMic || c.completed.includes(c.step)) return { ...c, quiet: true };
    const { next, autoSkipped } = nextAfter(c.step, true);
    const skipped = add(c.skipped, c.step, ...autoSkipped.filter((s) => !c.completed.includes(s)));
    return { ...c, quiet: true, skipped, step: next ?? "coda" };
  }
  if (!c.quiet) return c;
  const reopen = FLOW.filter(
    (s) => STEP_META[s].needsMic && c.skipped.includes(s) && !c.completed.includes(s),
  );
  return { ...c, quiet: false, skipped: without(c.skipped, ...reopen) };
}

/** Another successful run on the reaction screen: the learner's number is the last one run (pure). */
export function applyEdited(c: OnboardingContext, value: number): OnboardingContext {
  if (!Number.isInteger(value) || value < 0 || value > 7) return c;
  return { ...c, firstEdit: value };
}

/** The learner skipped `step` ("Set up later"). Only skippable steps can be skipped. */
export function applySkip(c: OnboardingContext, step: OnboardingStep): OnboardingContext {
  if (!STEP_META[step].skippable || c.completed.includes(step)) return c;
  const { next, autoSkipped } = nextAfter(step, c.quiet);
  const skipped = add(c.skipped, step, ...autoSkipped.filter((s) => !c.completed.includes(s)));
  return { ...c, skipped, step: next ?? "coda" };
}

/** What to send to `PUT /onboarding` for the context `c` (the whole resumable state; idempotent). */
export function patchOf(c: OnboardingContext): OnboardingPatch {
  const p: OnboardingPatch = {
    step: c.step,
    completed: [...c.completed],
    skipped: [...c.skipped],
    firstEdit: c.firstEdit,
    sketchId: c.sketchId,
  };
  if (c.finishedAt) p.finished = true;
  return p;
}

export const onboardingMachine = setup({
  types: {
    context: {} as OnboardingContext,
    events: {} as OnboardingEvent,
  },
  guards: {
    visitable: ({ context, event }) => event.type === "VISIT" && canVisit(context, event.step),
    lastDone: ({ event }) => event.type === "DONE" && event.step === "coda",
  },
}).createMachine({
  id: "onboarding",
  context: { ...freshState(), quiet: false },
  initial: "loading",
  states: {
    loading: {
      on: {
        LOADED: [
          {
            guard: ({ event }) => event.state.finishedAt !== null,
            target: "finished",
            actions: assign(({ event }) => ({ ...event.state, quiet: event.quiet })),
          },
          {
            target: "active",
            actions: assign(({ event }) => {
              const st = event.state;
              // A saved step ahead of what was finished (an old client, a hand-typed URL) falls back.
              const step = canVisit(st, st.step) ? st.step : frontier(st);
              return { ...st, step, quiet: event.quiet };
            }),
          },
        ],
      },
    },
    active: {
      on: {
        DONE: [
          {
            guard: "lastDone",
            target: "finished",
            actions: assign(({ context, event }) => applyDone(context, event)),
          },
          { actions: assign(({ context, event }) => applyDone(context, event)) },
        ],
        SKIP: { actions: assign(({ context, event }) => applySkip(context, event.step)) },
        VISIT: { guard: "visitable", actions: assign({ step: ({ event }) => event.step }) },
        QUIET: { actions: assign(({ context, event }) => applyQuiet(context, event.on)) },
        EDITED: { actions: assign(({ context, event }) => applyEdited(context, event.value)) },
      },
    },
    finished: { type: "final" },
  },
});
