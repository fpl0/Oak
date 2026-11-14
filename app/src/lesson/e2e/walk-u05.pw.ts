// U05 Triads in the real app, every step of every lesson from a dev seed (see w4walk.ts and walk.ts). U05.L08 is
// walked in full by gate.pw.ts, after the voicing gate is passed in U05.L07 (the state it opens in).
import { walkSuite } from "./w4walk.ts";

// U05.L09 "Chord Names" (contracts 1.6, d17: split out of U05.L04) is walked where the course has it, after U05.L04.
walkSuite(["U05.L01", "U05.L02", "U05.L03", "U05.L04", "U05.L09", "U05.L05", "U05.L06", "U05.L07"]);
