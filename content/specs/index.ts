// The unit specs written so far (AUTHORING §1 step 1). Each renders to content/specs/<unit>.md.
import type { UnitSpec } from "./types.ts";
import { U00 } from "./U00.ts";
import { U01 } from "./U01.ts";
import { U02 } from "./U02.ts";

export const unitSpecs: readonly UnitSpec[] = [U00, U01, U02];
export type { CapstoneSpec, CheckpointSpec, LessonSpec, StepSpec, UnitSpec } from "./types.ts";
