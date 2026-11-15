// J4 in the real app (Wave 7, wave7.md §7.3; how each kind of test walks: w7walk.ts). J4.L01 is walked in full from its seed; J4.L02–L04 are smoke-walked.
import { smokeSuiteW7, walkSuiteW7 } from "./w7walk.ts";

walkSuiteW7(["J4.L01"]);
smokeSuiteW7("J4", ["J4.L02", "J4.L03", "J4.L04"]);
