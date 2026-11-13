// The highest level a family may be played at, from the learner's completed lessons (contracts §7.3 "Level and
// category gates"). One rule for the warm-up, the checkpoint's family items and its level-setting result: the
// engine's own `maxOpenLevel` (@oak/drills), so the server never plays or records a level whose new material is
// still closed.
import type { FamilyDef } from "@oak/content-kit";
import { maxOpenLevel } from "@oak/drills";

export interface OpenFamilyLevels {
  maxOpenLevel: number;
  topLevel: number;
  openCategories: string[];
}

/** The family's open categories and its highest open level, given which lessons are completed. */
export function openFamilyLevels(def: FamilyDef, done: (lessonId: string) => boolean): OpenFamilyLevels {
  const open = def.categories.filter((c) => done(c.unlockAt)).map((c) => c.id);
  const gateLessons = Object.values(def.unlock.levelGates ?? {}).flatMap((g) => (Array.isArray(g) ? g : [g]));
  const completed = [...new Set(gateLessons)].filter((l) => done(l));
  return {
    maxOpenLevel: maxOpenLevel(def, open, completed),
    topLevel: def.levels.length,
    openCategories: open,
  };
}
