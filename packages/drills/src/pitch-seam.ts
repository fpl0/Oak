// The one place @oak/drills reaches the tap and sung-note graders of @oak/pitch. A mutable object so the
// drill tests can check the mapping (targets, tolerances, result → TrialResult) with a stand-in.
import { gradeLaneTaps, gradeSung, gradeTaps, tapWindowMs } from "@oak/pitch";

export const pitch = { gradeLaneTaps, gradeSung, gradeTaps, tapWindowMs };
