// Drill families and fact decks of the course (contracts §7.3). One source of truth each (decision 11 of
// docs/decisions.md):
//   - families: the catalog of @oak/drills (`FAMILIES`), whose generators, ladders and categories are
//     property-tested against headless Strudel; this file adds the three composite reviews and the §7.3
//     table view the contracts-sync test reads (`FAMILY_TABLE`);
//   - fact decks: content/decks (their card IDs are locked in content/ids.lock.json).
// Rule of §7.3: a category opens only when its lesson is completed, and a level is filled from its open
// categories, so no trial asks for something untaught.
import {
  type CompositeGroup,
  defineFamily,
  type FactDeck,
  type FamilyDef,
  type FamilyId,
  type LessonId,
  type SkillId,
} from "@oak/content-kit";
import { FAMILIES as DRILL_FAMILIES } from "@oak/drills";

import { decks as CORE_DECKS } from "./decks/index.ts";
import { WAVE7_DECKS } from "./decks/wave7.ts";

export { CHORD_SYMBOLS, KEY_SIGNATURES, STAFF_NAMES } from "./decks/index.ts";
export { WAVE7_DECKS } from "./decks/wave7.ts";

/**
 * Every fact deck of the course: the core's (content/decks/index.ts `decks`, in the order of their unlock lessons
 * in the default order) and the advanced tracks' ten (contracts 1.8 §7.3, content/decks/wave7.ts), all switched
 * on. The server, the app and the simulation read this list.
 */
export const decks: readonly FactDeck[] = [...CORE_DECKS, ...WAVE7_DECKS];
export const deckById: ReadonlyMap<string, FactDeck> = new Map(decks.map((d) => [d.id, d] as const));

const GROUPS: readonly CompositeGroup[] = ["pitch", "harmony", "rhythm"];
/** The lesson that opens each composite: the first lesson that seeds one of its members. */
const FIRST: Readonly<Record<CompositeGroup, LessonId>> = {
  pitch: "U00.L02",
  harmony: "U05.L02",
  rhythm: "U01.L01",
};

/** Members of a composite: the perceptual and production families that name it as their mix. */
export const compositeMembers = (group: CompositeGroup): FamilyDef[] =>
  DRILL_FAMILIES.filter((f) => f.mix === group && f.kind !== "concept");

const COMPOSITES: FamilyDef[] = GROUPS.map((group) => {
  const members = compositeMembers(group);
  const nodes = [...new Set(members.flatMap((m) => m.skills.map((s) => s.skill.split("/")[0] as SkillId)))];
  return defineFamily({
    id: `fam.mix.${group}` as FamilyId,
    title: `Mixed ${group}`,
    kind: "perceptual",
    domain: group,
    skills: nodes.map((skill) => ({ skill, w: 1 / nodes.length })),
    unlock: { lesson: FIRST[group] },
    categories: members.map((m) => ({ id: m.id, unlockAt: m.unlock.lesson })),
    levels: [
      {
        categories: members.map((m) => m.id),
        replays: 2,
        instruments: group === "rhythm" ? "drums" : ["snd.piano"],
        keys: "≤4acc",
        tempo: [72, 120],
      },
    ],
    masteryLevel: 1,
    trialsPerSet: 8,
    fastRtMs: 2500,
    estTrialSec: 8,
    retention: 0.85,
    mix: group,
    answer: "choice",
    generator: `mix.${group}`,
  });
});

/** The playable catalog: every drill family, then the three composite reviews. */
export const families: readonly FamilyDef[] = [...DRILL_FAMILIES, ...COMPOSITES];

/** Ear-training stages A–H of the plan (contracts §7.3). */
export const EAR_STAGES: Readonly<Record<"A" | "B" | "C" | "D" | "E" | "F" | "G" | "H", FamilyId[]>> = {
  A: ["fam.rhy.pulse", "fam.rhy.echo", "fam.pit.match", "fam.pit.compare", "fam.deg.tonic"],
  B: ["fam.deg.fet-major", "fam.deg.sing", "fam.deg.resolve"],
  C: ["fam.int.in-key", "fam.mel.dictation", "fam.mel.echo"],
  D: ["fam.chd.quality-triad", "fam.har.bass", "fam.har.schema", "fam.har.cadence", "fam.chd.inversion"],
  E: ["fam.deg.fet-minor", "fam.chd.quality-7th", "fam.frm.blues", "fam.key.mode"],
  F: ["fam.deg.fet-chromatic", "fam.har.chromatic", "fam.har.modulation"],
  G: [
    "fam.jzz.ii-v",
    "fam.jzz.guide",
    "fam.jzz.voicing",
    "fam.jzz.extension",
    "fam.jzz.chord-scale",
    "fam.jzz.subs",
  ],
  H: ["fam.rhy.syncopation", "fam.rhy.swing", "fam.rhy.clave", "fam.rhy.odd-grouping"],
};

export const familyById: ReadonlyMap<string, FamilyDef> = new Map(families.map((f) => [f.id, f] as const));

// --- the §7.3 table view ------------------------------------------------------------------------

type KindCode = "C" | "P" | "Pr" | "P/Pr" | "C/P" | "P/C" | "Pr/P";
/**
 * The kind code of contracts §7.3. A family that is both perceptual and concept is written "P/C", except
 * `fam.har.function`, which the table writes "C/P": a concept family joins no composite, so the catalog
 * leads with P for a family that has a mix (the table's order is the pedagogy's, not the scheduler's).
 */
const KIND_CODE_OVERRIDE: Readonly<Record<string, KindCode>> = { "fam.har.function": "C/P" };
function kindCode(f: FamilyDef): KindCode {
  const o = KIND_CODE_OVERRIDE[f.id];
  if (o) return o;
  if (f.kind === "concept") return f.alsoKind === "perceptual" ? "C/P" : "C";
  if (f.kind === "production") return f.alsoKind === "perceptual" ? "Pr/P" : "Pr";
  if (f.alsoKind === "production") return "P/Pr";
  if (f.alsoKind === "concept") return "P/C";
  return "P";
}

/** The §7.3 table as the catalog states it, for the contracts-sync test: id → [kind code, unlock lesson, nodes, mix]. */
export const FAMILY_TABLE: ReadonlyMap<
  string,
  { kind: KindCode; unlock: LessonId; nodes: SkillId[]; mix: CompositeGroup | null }
> = new Map(
  DRILL_FAMILIES.map(
    (f) =>
      [
        f.id,
        {
          kind: kindCode(f),
          unlock: f.unlock.lesson,
          nodes: [...new Set(f.skills.map((s) => s.skill.split("/")[0] as SkillId))],
          mix: f.mix,
        },
      ] as const,
  ),
);
