// The unit specs written so far (AUTHORING §1 step 1). Each renders to content/specs/<unit>.md.
import type { UnitSpec } from "./types.ts";
import { U00 } from "./U00.ts";
import { U01 } from "./U01.ts";
import { U02 } from "./U02.ts";
import { U03 } from "./U03.ts";
import { U04 } from "./U04.ts";
import { U05 } from "./U05.ts";
import { U06 } from "./U06.ts";
import { U07 } from "./U07.ts";

export const unitSpecs: readonly UnitSpec[] = [U00, U01, U02, U03, U04, U05, U06, U07];
export type {
  CapstoneSessionSpec,
  CapstoneSpec,
  CheckpointSpec,
  GymSpec,
  LadderLevelSpec,
  LessonSpec,
  RepertoireSpec,
  StepSpec,
  UnitSpec,
  Wave3Kind,
} from "./types.ts";
