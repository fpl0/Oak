// The onboarding flow (ux §8, contracts §2.3 U00, §8.5, §8.6): the order of the screens, what each is called,
// which ones the learner may skip, and the pure rules that decide where a resumed learner lands. Step IDs are
// `@oak/api`'s ONBOARDING_STEPS, so what the server stores and what the URL shows are the same words.
import type { OnboardingState, OnboardingStep } from "@oak/api";
import { ONBOARDING_STEPS } from "@oak/api";
import type { RailStep } from "../ui/kit/basics.tsx";

/** The order the learner meets the screens in (U00.L01's loop first, then U00.L02's set-up, then Sketch 001). */
export const FLOW: readonly OnboardingStep[] = [
  "welcome",
  "loop",
  "edit",
  "react",
  "prefs",
  "tutor",
  "headphones",
  "mic",
  "range",
  "latency",
  "first-sing",
  "sketch",
  "coda",
];

export interface StepMeta {
  /** The focus header and the step rail. */
  label: string;
  /** Skippable by the learner ("Set up later"). Everything else is completed by doing it. */
  skippable: boolean;
  /** Needs a microphone: skipped automatically in Quiet mode (contracts §8.5). */
  needsMic: boolean;
}

export const STEP_META: Readonly<Record<OnboardingStep, StepMeta>> = {
  welcome: { label: "Welcome", skippable: false, needsMic: false },
  loop: { label: "Your first loop", skippable: false, needsMic: false },
  edit: { label: "Change one number", skippable: false, needsMic: false },
  react: { label: "What you changed", skippable: false, needsMic: false },
  prefs: { label: "Your sound and your week", skippable: false, needsMic: false },
  tutor: { label: "Meet the tutor", skippable: true, needsMic: false },
  headphones: { label: "Headphones", skippable: true, needsMic: false },
  mic: { label: "Microphone", skippable: false, needsMic: false },
  range: { label: "Your voice", skippable: true, needsMic: true },
  latency: { label: "Timing", skippable: true, needsMic: false },
  "first-sing": { label: "First note", skippable: true, needsMic: true },
  sketch: { label: "Sketch 001", skippable: false, needsMic: false },
  coda: { label: "Done for today", skippable: false, needsMic: false },
};

export function isOnboardingStep(s: string): s is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(s);
}

/** `/onboarding/3` (Today's old link) or `/onboarding/edit` → the step; anything else → null. */
export function stepFromParam(param: string): OnboardingStep | null {
  if (isOnboardingStep(param)) return param;
  if (/^\d{1,2}$/.test(param)) {
    const i = Number(param) - 1;
    return FLOW[i] ?? null;
  }
  return null;
}

export const indexOf = (s: OnboardingStep): number => FLOW.indexOf(s);

const isDone = (st: Pick<OnboardingState, "completed" | "skipped">, s: OnboardingStep) =>
  st.completed.includes(s) || st.skipped.includes(s);

/** The first step neither completed nor skipped: where a fresh load resumes (the coda when all are done). */
export function frontier(st: Pick<OnboardingState, "completed" | "skipped">): OnboardingStep {
  return FLOW.find((s) => !isDone(st, s)) ?? "coda";
}

/** Whether the learner may open `s` now: any finished step, and the frontier itself. Never a step ahead of it. */
export function canVisit(st: Pick<OnboardingState, "completed" | "skipped">, s: OnboardingStep): boolean {
  return indexOf(s) <= indexOf(frontier(st));
}

/**
 * The step after `s`. In Quiet mode the mic-only steps (range, first sing) are passed over and reported as
 * `autoSkipped`, so the server records them as skipped (set up later in Settings → Voice).
 */
export function nextAfter(
  s: OnboardingStep,
  quiet: boolean,
): { next: OnboardingStep | null; autoSkipped: OnboardingStep[] } {
  const autoSkipped: OnboardingStep[] = [];
  for (let i = indexOf(s) + 1; i < FLOW.length; i++) {
    const cand = FLOW[i] as OnboardingStep;
    if (quiet && STEP_META[cand].needsMic) {
      autoSkipped.push(cand);
      continue;
    }
    return { next: cand, autoSkipped };
  }
  return { next: null, autoSkipped };
}

/** The previous visitable step (Back), passing over steps that were skipped automatically. */
export function prevBefore(st: Pick<OnboardingState, "completed" | "skipped">, s: OnboardingStep) {
  for (let i = indexOf(s) - 1; i >= 0; i--) {
    const cand = FLOW[i] as OnboardingStep;
    // "react" only exists after an edit; "welcome" re-unlocks audio and is not worth going back to.
    if (cand === "welcome") return null;
    if (st.completed.includes(cand)) return cand;
  }
  return null;
}

/** The focus header's step rail: one dot per screen, done/current/to do; skipped steps show as optional. */
export function railOf(
  st: Pick<OnboardingState, "completed" | "skipped">,
  current: OnboardingStep,
): RailStep[] {
  return FLOW.map((s) => ({
    id: s,
    label: STEP_META[s].label,
    state:
      s === current
        ? "current"
        : st.completed.includes(s)
          ? "done"
          : st.skipped.includes(s)
            ? "optional"
            : "todo",
  }));
}

/** The state of a learner who has not started. */
export function freshState(): OnboardingState {
  return {
    step: "welcome",
    completed: [],
    skipped: [],
    firstEdit: null,
    sketchId: null,
    startedAt: null,
    finishedAt: null,
  };
}
