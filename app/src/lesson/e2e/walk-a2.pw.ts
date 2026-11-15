// A2 in the real app (Wave 7, wave7.md §7.3; how each kind of test walks: w7walk.ts). The exemplar A2.L01 and A2.L02 chained after it are walked in full; A2.L03–L06 are smoke-walked.
import { smokeSuiteW7, walkSuiteW7 } from "./w7walk.ts";

walkSuiteW7(["A2.L01", "A2.L02"]);
smokeSuiteW7("A2", ["A2.L03", "A2.L04", "A2.L05", "A2.L06"]);
