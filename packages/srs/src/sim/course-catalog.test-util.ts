// The course's real catalog (content/families.ts: the drill families of @oak/drills and the fact decks of
// content/decks) in the simulation's shape, so the CI gate of contracts §7.4 runs on what the learner
// will really get: every family's kind, unlock lesson, composite, mastery and top level, set size and
// seconds per trial, microphone use and later level gates, and each deck's cards per gate and daily pace.
// Test support (it imports the course content, which the package itself never does).
import type { FactDeck, FamilyDef } from "@oak/content-kit";
import { decks, families } from "../../../../content/families.ts";
import type { SimFamily, SimFamilyKind } from "./catalog.ts";
import type { SimCatalog } from "./simulate.ts";

const simKind = (f: FamilyDef): SimFamilyKind =>
  f.kind === "concept" ? "C" : f.kind === "production" ? "Pr" : "P";

export function simCatalogOf(fams: readonly FamilyDef[], dks: readonly FactDeck[]): SimCatalog {
  const playable = fams.filter((f) => !f.generator.startsWith("mix."));
  const simFamilies: SimFamily[] = playable.map((f) => ({
    id: f.id,
    kind: simKind(f),
    domain: f.domain,
    unlock: f.unlock.lesson,
    mix: f.mix,
    masteryLevel: f.masteryLevel,
    topLevel: f.levels.length,
    trialsPerSet: f.trialsPerSet,
    estTrialSec: f.estTrialSec,
    mic: f.mic === true,
    fastRtMs: f.fastRtMs,
  }));
  const levelGates = Object.fromEntries(
    playable.map((f) => [
      f.id,
      Object.fromEntries(
        Object.entries(f.unlock.levelGates ?? {}).map(([level, g]) => [
          level,
          Array.isArray(g) ? [...g] : [g],
        ]),
      ),
    ]),
  );
  const batches = new Map<string, [string, string, number, number]>();
  for (const d of dks)
    for (const c of d.cards) {
      const lesson = c.gate ?? d.unlock.lesson;
      const k = `${d.id}|${lesson}`;
      const b = batches.get(k) ?? [d.id, lesson, 0, d.newPerDay];
      b[2]++;
      batches.set(k, b);
    }
  return { families: simFamilies, levelGates, deckBatches: [...batches.values()] };
}

/** The course catalog as the 300-day simulation introduces it. */
export const COURSE_CATALOG: SimCatalog = simCatalogOf(families, decks);
