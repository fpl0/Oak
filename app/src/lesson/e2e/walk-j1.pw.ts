// J1 in the real app (Wave 7, wave7.md §7.3; how each kind of test walks: w7walk.ts). The exemplar J1.L01 "Swing
// Feel & the Ride" and J1.L02 chained after it are walked in full; J1.L03–L05 are smoke-walked, J1.L04 in Quiet
// mode (its sung guide-tone step, S3, is the fallback: nothing waits for a voice, nothing is recorded).
import { smokeSuiteW7, walkSuiteW7 } from "./w7walk.ts";

walkSuiteW7(["J1.L01", "J1.L02"]);
smokeSuiteW7("J1", ["J1.L03", "J1.L04", "J1.L05"], { quiet: ["J1.L04"] });
