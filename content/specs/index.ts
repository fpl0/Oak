// The unit specs written so far (AUTHORING §1 step 1). Each renders to content/specs/<unit>.md.
import type { UnitSpec } from "./types.ts";
import { U00 } from "./U00.ts";
import { U01 } from "./U01.ts";
import { U02 } from "./U02.ts";
import { U03 } from "./U03.ts";
import { U04 } from "./U04.ts";

export const unitSpecs: readonly UnitSpec[] = [U00, U01, U02, U03, U04];
export type {
  CapstoneSpec,
  CheckpointSpec,
  LessonSpec,
  RepertoireSpec,
  StepSpec,
  UnitSpec,
  Wave3Kind,
} from "./types.ts";
