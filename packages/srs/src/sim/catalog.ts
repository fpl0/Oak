// The catalog the 300-day simulation of contracts §7.4 introduces: every family and deck of contracts §7.3
// at its unlock lesson, in the default order of contracts §2.5 followed by the advanced tracks (§2.6).
// Ladder sizes, mastery levels and trials per set follow exercises §4.4 as spike S7 encoded them; set
// durations are trialsPerSet × estTrialSec. This file is test infrastructure: the server reads the real
// catalog from content/.
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

// id | kind | domain | unlock | mix | ★ mastery | top level | trials/set | sec/trial
const FAMILY_TABLE = `
rhy.pulse Pr rhythm U01.L01 rhythm 3 5 6 10
rhy.echo Pr rhythm U01.L04 rhythm 4 7 5 12
rhy.read Pr rhythm U01.L05 rhythm 4 7 5 12
rhy.count C rhythm U01.L04 - 3 4 8 6
rhy.meter P rhythm U01.L08 rhythm 3 5 6 11
rhy.dictation P rhythm U01.L09 rhythm 4 7 5 18
rhy.groove-lock P rhythm U08.L04 rhythm 2 3 6 11
rhy.swing P rhythm U11.L07 rhythm 2 4 8 8
rhy.syncopation P rhythm U13.L01 rhythm 3 4 6 11
rhy.subdivision P rhythm U13.L05 rhythm 2 3 8 8
rhy.odd-grouping P rhythm R2.L01 rhythm 2 4 6 11
rhy.polyrhythm P rhythm R2.L04 rhythm 2 4 6 11
rhy.clave P rhythm R3.L01 rhythm 3 4 6 11
pit.match Pr pitch U00.L02 pitch 3 4 5 12
pit.compare P pitch U02.L01 pitch 2 3 8 8
pit.keyboard C pitch U02.L02 - 2 3 8 6
pit.steps P pitch U02.L03 pitch 2 2 8 8
not.read C notation U02.L08 - 3 4 5 10
key.scale-spell C key U03.L01 - 2 5 5 9
deg.tonic P degree U03.L01 pitch 3 5 6 11
deg.fet-major P degree U03.L02 pitch 4 7 8 9
deg.sing Pr degree U03.L02 pitch 3 4 6 10
deg.index C degree U03.L02 - 2 5 8 6
deg.resolve Pr degree U03.L04 pitch 3 4 5 12
key.circle C key U03.L07 - 2 3 8 6
mel.sight Pr melody U03.L09 pitch 3 6 5 12
mel.dictation P melody U03.L10 pitch 4 8 5 18
mel.echo Pr melody U03.L10 pitch 3 6 5 12
int.in-key P interval U04.L01 pitch 3 5 8 8
int.spell C interval U04.L02 - 3 4 6 8
int.sing Pr interval U04.L04 pitch 2 3 5 12
int.isolated P interval U12.L06 pitch 4 6 8 8
chd.quality-triad P chord U05.L02 harmony 4 5 8 9
chd.spell C chord U05.L02 - 2 4 6 8
deck.chd.symbols F chord U05.L04 - 0 0 0 0
chd.inversion P chord U05.L05 harmony 2 4 8 9
har.rn C harmony U06.L02 - 2 5 8 6
har.function C harmony U06.L03 - 2 4 8 6
har.cadence P harmony U06.L04 harmony 3 4 6 11
har.bass P harmony U06.L05 harmony 3 6 5 18
har.schema P harmony U06.L06 harmony 3 6 6 11
har.progression P harmony U06.L09 harmony 3 6 5 18
mel.nct P melody U07.L04 pitch 2 4 6 11
frm.sections P form U09.L03 harmony 2 3 5 14
key.mode P key U10.L01 pitch 4 6 6 11
deg.fet-minor P degree U10.L03 pitch 3 5 8 9
frm.blues P form U11.L05 harmony 2 4 6 11
chd.quality-7th P chord U12.L02 harmony 4 6 8 9
deg.fet-chromatic P degree U15.L01 pitch 2 4 8 9
har.chromatic P harmony U15.L06 harmony 3 4 5 14
har.modulation P harmony U17.L03 harmony 2 3 5 14
jzz.ii-v P jazz J1.L03 harmony 3 4 6 11
jzz.guide Pr jazz J1.L04 harmony 2 4 5 12
jzz.voicing C jazz J1.L05 - 2 3 6 8
jzz.extension P jazz J2.L03 harmony 3 5 8 9
jzz.chord-scale C jazz J2.L04 - 2 4 8 6
jzz.subs P jazz J5.L01 harmony 2 3 6 11
snd.params P sound A1.L02 harmony 3 5 6 11
snd.roles P sound A2.L01 harmony 2 2 6 11
code.mini C code U01.L02 - 4 6 6 8
code.functions C code U03.L02 - 1 1 6 8
`;

export const SIM_FAMILIES: readonly SimFamily[] = FAMILY_TABLE.trim()
  .split("\n")
  .filter((line) => !line.includes(" F "))
  .map((line) => {
    const [id, kind, domain, unlock, mix, mastery, top, trials, sec] = line.split(" ") as [
      string,
      SimFamilyKind,
      FamilyDomain,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    return {
      id: `fam.${id}` as FamilyId,
      kind,
      domain,
      unlock,
      mix: mix === "-" ? null : (mix as CompositeGroup),
      masteryLevel: Number(mastery),
      topLevel: Number(top),
      trialsPerSet: Number(trials),
      estTrialSec: Number(sec),
      mic: kind === "Pr",
      fastRtMs: kind === "C" ? 4000 : 2500,
    };
  });

/**
 * Later level gates of contracts §7.3 ("Unlocks at (later level gates)"): level → the lesson that opens it.
 * A level opens only when its own gate and every lower gate are completed. Only gates at or below a
 * family's top level matter.
 */
export const SIM_LEVEL_GATES: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  "fam.rhy.echo": { 5: "U13.L01", 6: "U13.L05", 7: "U13.L04" },
  "fam.rhy.read": { 5: "U13.L03" },
  "fam.rhy.count": { 2: "U01.L06", 3: "U13.L05", 4: "U13.L04" },
  "fam.rhy.meter": { 3: "U13.L04", 5: "R2.L01" },
  "fam.rhy.dictation": { 5: "U13.L06" },
  "fam.rhy.swing": { 4: "R1.L02" },
  "fam.rhy.clave": { 2: "R3.L02" },
  "fam.pit.keyboard": { 2: "U02.L03" },
  "fam.key.scale-spell": { 3: "U10.L01", 4: "U11.L01", 5: "U14.L01" },
  "fam.deg.tonic": { 4: "U10.L01", 5: "U14.L01" },
  "fam.deg.fet-major": { 2: "U03.L03", 3: "U03.L04" },
  "fam.deg.index": { 3: "U10.L01", 4: "U14.L01", 5: "U15.L01" },
  "fam.deg.resolve": { 4: "U10.L03" },
  "fam.key.circle": { 2: "U10.L02", 3: "U10.L02" },
  "fam.chd.quality-triad": { 3: "U05.L03" },
  "fam.chd.spell": { 2: "U05.L03", 3: "U12.L01", 4: "J2.L03" },
  "fam.chd.inversion": { 3: "U12.L04" },
  "fam.har.rn": { 3: "U10.L04", 4: "U12.L04", 5: "U15.L02" },
  "fam.har.function": { 3: "U10.L04", 4: "U12.L04" },
  "fam.har.cadence": { 3: "U06.L07", 4: "U14.L02" },
  "fam.har.bass": { 5: "U10.L04", 6: "U15.L06" },
  "fam.har.schema": { 2: "U06.L07", 3: "U10.L07", 4: "U11.L05", 5: "U14.L06", 6: "J1.L03" },
  "fam.har.progression": { 4: "U10.L04", 5: "U12.L04", 6: "U16.L05" },
  "fam.mel.nct": { 2: "U07.L05" },
  "fam.key.mode": { 3: "U14.L03", 4: "U14.L03", 5: "U14.L05" },
  "fam.frm.blues": { 4: "J4.L02" },
  "fam.chd.quality-7th": { 3: "U12.L03", 5: "J1.L02" },
  "fam.har.chromatic": { 3: "U16.L05" },
  "fam.jzz.ii-v": { 2: "J2.L02" },
  "fam.jzz.voicing": { 2: "J3.L01", 3: "J3.L02" },
  "fam.code.mini": { 5: "U04.L03", 6: "R3.L03" },
};
/** The highest level of a family whose gates are all completed. */
export function maxOpenLevel(f: Pick<SimFamily, "id" | "topLevel">, completed: ReadonlySet<string>): number {
  const gates = SIM_LEVEL_GATES[f.id] ?? {};
  let open = 1;
  for (let level = 2; level <= f.topLevel; level++) {
    const gate = gates[level];
    if (gate !== undefined && !completed.has(gate)) break;
    open = level;
  }
  return open;
}

/** Fact decks of contracts §7.3, one batch per gate: [deck, unlock lesson, cards, newPerDay]. */
export const SIM_DECK_BATCHES: readonly (readonly [string, string, number, number])[] = [
  ["deck.pit.staff-names", "U02.L04", 14, 6], // treble
  ["deck.pit.staff-names", "U05.L06", 14, 6], // bass
  ["deck.key.signature", "U03.L06", 16, 4], // sharps, both directions
  ["deck.key.signature", "U03.L07", 14, 4], // flats
  ["deck.key.signature", "U10.L02", 30, 4], // minor
  ["deck.chd.symbols", "U05.L04", 4, 4],
  ["deck.chd.symbols", "U11.L04", 3, 4],
  ["deck.chd.symbols", "U12.L01", 3, 4],
  ["deck.chd.symbols", "U12.L03", 2, 4],
  ["deck.chd.symbols", "J1.L02", 3, 4],
];

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
