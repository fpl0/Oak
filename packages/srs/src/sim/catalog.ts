// The shape of the catalog the 300-day simulation of contracts §7.4 introduces, and the course order it
// walks: the default order of contracts §2.5 followed by the advanced tracks (§2.6). The families and decks
// themselves are the course's real ones (content/families.ts), converted by
// `course-catalog.test-util.ts`; set durations are trialsPerSet × estTrialSec. Test infrastructure.
import type { CompositeGroup, FamilyDomain, FamilyId } from "@oak/content-kit";

export type SimFamilyKind = "P" | "Pr" | "C";
export interface SimFamily {
  id: FamilyId;
  kind: SimFamilyKind;
  domain: FamilyDomain;
  unlock: string;
  mix: CompositeGroup | null;
  masteryLevel: number;
  topLevel: number;
  trialsPerSet: number;
  estTrialSec: number;
  mic: boolean;
  fastRtMs: number;
}

/** The same with explicit gates: level → every lesson that must be completed for it. */
export function maxOpenLevelOf(
  f: Pick<SimFamily, "topLevel">,
  gates: Readonly<Record<number, readonly string[]>>,
  completed: ReadonlySet<string>,
): number {
  let open = 1;
  for (let level = 2; level <= f.topLevel; level++) {
    const gate = gates[level];
    if (gate !== undefined && !gate.every((g) => completed.has(g))) break;
    open = level;
  }
  return open;
}

/** Contracts §2.5, sessions 1 to 183. */
const CORE_ORDER = `
U00.L01 U00.L02 U01.L01 U01.L02 U01.L03 U01.L04 U01.L05 U01.L06 U01.L07 U01.L08
U01.L09 U02.L01 U01.CP C0.S1 U02.L02 U02.L03 U02.L04 U02.L05 U02.L06 U02.L07
U02.L08 U03.L01 U02.CP C1.S1 U03.L02 U03.L03 U03.L04 U03.L05 U03.L06 U03.L07
U03.L08 U03.L09 U03.L10 U03.L11 U04.L01 U03.CP U04.L02 U04.L03 U04.L04 U05.L01
U04.CP U05.L02 U05.L03 U05.L04 U05.L05 U05.L06 U05.L07 U05.L08 U06.L01 U05.CP
U06.L02 U06.L03 U06.L04 U06.L05 U06.L06 U06.L07 U06.L08 U06.L09 U06.L10 U06.L11
U06.L12 U07.L01 U06.CP U07.L02 U07.L03 GYM.01 U07.L04 U07.L05 U07.L06 U07.L07
GYM.02 U07.L08 U07.L09 U07.L10 U08.L01 GYM.03 U07.CP C2.S1 C2.S2 X1.S1 X1.S2
X1.S3 U08.L02 U08.L03 U08.L04 U08.L05 GYM.04 U09.L01 U09.L02 U09.L03 U09.L04
GYM.05 U09.L05 U10.L01 U09.CP C3.S1 C3.S2 C3.S3 GYM.06 U10.L02 U10.L03
U10.L04 U10.L05 GYM.07 U10.L06 U10.L07 U10.L08 U10.L09 GYM.08 U11.L01
U10.CP C4.S1 C4.S2 GYM.09 U11.L02 U11.L03 U11.L04 U11.L05 GYM.10
U11.L06 U11.L07 U11.L08 U12.L01 GYM.11 U11.CP C5.S1 C5.S2 X2.S1 X2.S2
U12.L02 U12.L03 U12.L04 U12.L05 GYM.12 U12.L06 U13.L01 U13.L02 U13.L03
GYM.13 U13.L04 U13.L05 U13.L06 U14.L01 GYM.14 U13.CP U14.L02 U14.L03
U14.L04 GYM.15 U14.L05 U14.L06 U15.L01 U14.CP CF-T.S1 C6.S1 C6.S2
U15.L02 U15.L03 CF-T.S2 U15.L04 U15.L05 U15.L06 U16.L01 CF-T.S3 U16.L02
U16.L03 U16.L04 U16.L05 CF-T.S4 U17.L01 U17.L02 U17.L03 U17.L04 GYM.16
U17.CP C7.S1 C7.S2 C7.S3 GYM.17 CF-A.S1 CF-A.S2 CF-A.S3 CF-A.S4
`;

const range = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);
/** The advanced tracks after the core, in the order of contracts §2.6 (the learner may choose another). */
const TRACKS: string[] = [
  ...range("J1.L", 5),
  ...range("J2.L", 4),
  "J.CP1",
  "JC1.S1",
  "JC1.S2",
  ...range("R1.L", 5),
  ...range("R2.L", 5),
  ...range("R3.L", 5),
  "R.CP",
  "RC1.S1",
  "RC1.S2",
  ...range("J3.L", 4),
  ...range("J4.L", 4),
  "JC2.S1",
  "JC2.S2",
  ...range("J5.L", 5),
  "J.CP2",
  ...range("A1.L", 7),
  ...range("A2.L", 6),
  "A.CP",
];

export type SimSessionKind = "lesson" | "checkpoint" | "capstone" | "gym";
export interface SimEntry {
  id: string;
  kind: SimSessionKind;
}
export function sessionKindOf(id: string): SimSessionKind {
  if (/\.L\d+$/.test(id)) return "lesson";
  if (id.endsWith(".CP") || /^J\.CP\d$/.test(id)) return "checkpoint";
  if (id.startsWith("GYM.") || id.startsWith("CF-T.")) return "gym";
  return "capstone";
}
export function buildTimeline(): SimEntry[] {
  const ids = [...CORE_ORDER.trim().split(/\s+/), ...TRACKS];
  return ids.map((id) => ({ id, kind: sessionKindOf(id) }));
}
