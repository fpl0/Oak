// J2 in the real app (Wave 7, wave7.md §7.3; how each kind of test walks: w7walk.ts). The exemplar J2.L01 and J2.L02 chained after it are walked in full; J2.L03–L04 are smoke-walked.
import { smokeSuiteW7, walkSuiteW7 } from "./w7walk.ts";

walkSuiteW7(["J2.L01", "J2.L02"]);
smokeSuiteW7("J2", ["J2.L03", "J2.L04"]);
