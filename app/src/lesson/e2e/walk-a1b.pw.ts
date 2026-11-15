// A1.L05–L07 in the real app (Wave 7, wave7.md §7.3; how each kind of test walks: w7walk.ts). A1.L05 is walked
// in full from "A1.L05 next"; A1.L06–L07 are smoke-walked. (The four Wave 5 side lessons are walk-a1.pw.ts's.)
import { smokeSuiteW7, walkSuiteW7 } from "./w7walk.ts";

walkSuiteW7(["A1.L05"]);
smokeSuiteW7("A1", ["A1.L06", "A1.L07"]);
