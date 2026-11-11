// What the onboarding workbench runs on: the app's one adapter and browser grader host (the same pair every
// page uses), plus the lint context of the onboarding loop. U00 is the one preview context where every tool
// may appear before it is unlocked (contracts §3.1 rule 5a, `ONBOARDING_PREVIEW` in content/validate/harness.ts).
import type { LintContext, UnlockableId } from "@oak/content-kit";
import { toolbox } from "../../../content/toolbox.ts";

/** Call from a user gesture (the welcome screen's Start sound, or a resumed screen's Start). */
export { appWorkbenchServices as onboardingServices } from "../lib/workbench-services.ts";

const at = (e: (typeof toolbox)[number]) => (Array.isArray(e.unlock.at) ? e.unlock.at : [e.unlock.at]);

/** What U00.L01 unlocks (transport, roll, Studio, tutor, Band, labels): its Toolbox ceremony in the coda. */
export const U00_UNLOCKS: readonly (typeof toolbox)[number][] = toolbox.filter((e) =>
  at(e).some((s) => s === "U00.L01" || s === "U00.L02"),
);

/**
 * What finishing onboarding itself unlocks (U00.L01 only): the onboarding Coda's "New in your toolbox". The Sing
 * panel arrives with U00.L02, and Today names it as the next unlock, so the Coda must not claim it already.
 */
export const ONBOARDING_UNLOCKS: readonly (typeof toolbox)[number][] = toolbox.filter((e) =>
  at(e).some((s) => s === "U00.L01"),
);

const UNLOCKED: ReadonlySet<UnlockableId> = new Set(U00_UNLOCKS.map((e) => e.id as UnlockableId));

/** U00's own unlocks: what a saved sketch's `previewTools` is measured against. */
export const U00_LINT: LintContext = {
  profile: "studio",
  unlocked: UNLOCKED,
  allowPreview: true,
  meter: "4/4",
  key: { tonic: "C", mode: "major" },
};

/**
 * The editors of onboarding: the U00 preview context, where every tool of the loop may appear (contracts §3.1
 * rule 5a), so nothing in the learner's first code is flagged as locked.
 */
export const ONBOARDING_LINT: LintContext = {
  profile: "studio",
  unlocked: new Set(toolbox.map((e) => e.id as UnlockableId)),
  allowPreview: true,
  meter: "4/4",
  key: { tonic: "C", mode: "major" },
};

export const LOOP_LESSON_CTX = {
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  defaultBpm: 92,
  loopBars: 4,
} as const;
