// Playing the learner's own saved code back (the capstone resume card, the recap card): it is the learner's work,
// heard as written, never graded. It is linted as Studio lints it (dialect and locked tools are notes, not errors),
// not with the pattern player's default, the content profile, which refused a draft for a part named `melody:`
// and told the learner "the draft doesn't run" when it did (review:journey).

import type { KeySpec, MeterId } from "@oak/api";
import type { LintContext } from "@oak/content-kit";

export function playbackLint(v: { meter?: MeterId | null; key?: KeySpec | null }): LintContext {
  return {
    profile: "studio",
    unlocked: new Set(),
    allowPreview: true,
    meter: v.meter ?? "4/4",
    key: v.key ?? null,
  };
}
