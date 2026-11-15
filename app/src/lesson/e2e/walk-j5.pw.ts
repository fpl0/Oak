// J5 in the real app (Wave 7, wave7.md §7.3; how each kind of test walks: w7walk.ts). The exemplar J5.L01 and J5.L02 chained after it are walked in full; J5.L03–L05 are smoke-walked.
import { smokeSuiteW7, walkSuiteW7 } from "./w7walk.ts";

walkSuiteW7(["J5.L01", "J5.L02"]);
smokeSuiteW7("J5", ["J5.L03", "J5.L04", "J5.L05"]);
