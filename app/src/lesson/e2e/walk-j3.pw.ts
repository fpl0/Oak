// J3 in the real app (Wave 7, wave7.md §7.3; how each kind of test walks: w7walk.ts). The exemplar J3.L01 and J3.L02 (drop-2 on the keyboard) chained after it are walked in full; J3.L03–L04 are smoke-walked.
import { smokeSuiteW7, walkSuiteW7 } from "./w7walk.ts";

walkSuiteW7(["J3.L01", "J3.L02"]);
smokeSuiteW7("J3", ["J3.L03", "J3.L04"]);
