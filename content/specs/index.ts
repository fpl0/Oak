// The unit specs written so far (AUTHORING §1 step 1). Each renders to content/specs/<unit>.md.
import { A1 } from "./A1.ts";
import { A2 } from "./A2.ts";
import { CF } from "./CF.ts";
import { END } from "./END.ts";
import { J1 } from "./J1.ts";
import { J2 } from "./J2.ts";
import { J3 } from "./J3.ts";
import { J4 } from "./J4.ts";
import { J5 } from "./J5.ts";
import { JC2 } from "./JC2.ts";
import { R1 } from "./R1.ts";
import { R2 } from "./R2.ts";
import { R3 } from "./R3.ts";
import type { UnitSpec } from "./types.ts";
import { U00 } from "./U00.ts";
import { U01 } from "./U01.ts";
import { U02 } from "./U02.ts";
import { U03 } from "./U03.ts";
import { U04 } from "./U04.ts";
import { U05 } from "./U05.ts";
import { U06 } from "./U06.ts";
import { U07 } from "./U07.ts";
import { U08 } from "./U08.ts";
import { U09 } from "./U09.ts";
import { U10 } from "./U10.ts";
import { U11 } from "./U11.ts";
import { U12 } from "./U12.ts";
import { U13 } from "./U13.ts";
import { U14 } from "./U14.ts";
import { U15 } from "./U15.ts";
import { U16 } from "./U16.ts";
import { U17 } from "./U17.ts";

export const unitSpecs: readonly UnitSpec[] = [
  U00,
  U01,
  U02,
  U03,
  U04,
  U05,
  U06,
  U07,
  U08,
  U09,
  U10,
  U11,
  U12,
  U13,
  U14,
  U15,
  U16,
  U17,
  A1,
  A2,
  CF,
  END,
  J1,
  J2,
  J3,
  J4,
  JC2,
  J5,
  R1,
  R2,
  R3,
];
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
