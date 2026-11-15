// R3 in the real app (Wave 7, wave7.md §7.3; how each kind of test walks: w7walk.ts). The exemplar R3.L01 and R3.L02 (the clave) chained after it are walked in full; R3.L03–L05 are smoke-walked
// (R3.L03 S6 through the Euclid widget"s steppers).
import { smokeSuiteW7, walkSuiteW7 } from "./w7walk.ts";

walkSuiteW7(["R3.L01", "R3.L02"]);
smokeSuiteW7("R3", ["R3.L03", "R3.L04", "R3.L05"]);
