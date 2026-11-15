// R1 in the real app (Wave 7, wave7.md §7.3; how each kind of test walks: w7walk.ts). The exemplar R1.L01 and R1.L02 chained after it are walked in full; R1.L03–L05 are smoke-walked.
import { smokeSuiteW7, walkSuiteW7 } from "./w7walk.ts";

walkSuiteW7(["R1.L01", "R1.L02"]);
smokeSuiteW7("R1", ["R1.L03", "R1.L04", "R1.L05"]);
