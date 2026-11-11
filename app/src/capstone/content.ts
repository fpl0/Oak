// The capstone content the workspace and the album need beyond the shared bundle (`useContent` carries only
// `CapstoneMeta`): the full definitions with briefs and rubrics, the flavour kits and rules, the Band layers and
// the can-do statements. One lazy chunk of the isomorphic registries, loaded once.
import type { BandDef, CanDoDef, CapstoneDef, FlavourId, FlavourKit, KeySpec } from "@oak/content-kit";
import type { BandSetup } from "@oak/strudel";
import { queryOptions, useQuery } from "@tanstack/react-query";

export interface CapstoneContent {
  capstones: readonly CapstoneDef[];
  flavours: readonly FlavourKit[];
  /** Flavours that ship in this wave (`FLAVOUR_RULES[id].ships === "W2"`). */
  shipping: readonly FlavourId[];
  bands: readonly BandDef[];
  candos: readonly CanDoDef[];
  skillNames: ReadonlyMap<string, string>;
}

async function load(): Promise<CapstoneContent> {
  const [{ registries }, { FLAVOUR_RULES }] = await Promise.all([
    import("@content/index.ts"),
    import("@content/flavours.ts"),
  ]);
  const shipping = (Object.keys(FLAVOUR_RULES) as FlavourId[]).filter(
    (id) => FLAVOUR_RULES[id].ships === "W2",
  );
  return {
    capstones: registries.capstones,
    flavours: registries.flavours,
    shipping,
    bands: registries.bands,
    candos: registries.candos,
    skillNames: new Map(registries.skills.map((s) => [String(s.id), s.name] as const)),
  };
}

export const capstoneContentQuery = queryOptions({
  queryKey: ["capstone-content"] as const,
  queryFn: load,
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
});

export function useCapstoneContent() {
  return useQuery(capstoneContentQuery);
}

export const FLAVOUR_TITLE: Record<FlavourId, string> = {
  "flavour.pop": "Pop",
  "flavour.jazz-soul": "Jazz-soul",
  "flavour.indie": "Indie",
  "flavour.funk": "Funk",
};

/** The Band roles a brief leaves to the learner's choice: the ones its rubric does not ask the learner to write. */
export function bandTracksFor(def: CapstoneDef): ("drums" | "bass" | "chords")[] {
  const asked = new Set<string>();
  for (const r of def.brief?.rubric ?? []) {
    if (r.rule === "tracks") for (const role of r.roles ?? []) asked.add(role);
    if ("track" in r && typeof r.track === "string" && r.track.startsWith("@")) asked.add(r.track.slice(1));
  }
  return (["drums", "bass", "chords"] as const).filter((t) => !asked.has(t));
}

/** "C4:major": the scale argument Band code takes for `{{key}}`. */
export function bandKeyText(key: KeySpec): string {
  return `${key.tonic}4:${key.mode}`;
}

/** The Band for a capstone in a flavour: the brief's own choice, else the 4-bar loop (4/4) or the waltz (3/4). */
export function bandSetupFor(
  def: CapstoneDef,
  flavour: FlavourId,
  bands: readonly BandDef[],
  key: KeySpec,
): BandSetup | null {
  const tracks = bandTracksFor(def);
  if (tracks.length === 0) return null;
  const wanted =
    def.flavours?.[flavour]?.band ?? (def.meter === "3/4" ? "band.waltz-vamp" : "band.axis-4bar");
  const band = bands.find((b) => b.id === wanted);
  const code = band?.code[flavour];
  if (!band || !code) return null;
  return {
    band: band.id,
    flavour,
    code: code.replaceAll("{{key}}", bandKeyText(key)),
    followsLearnerKey: true,
    tracks,
  };
}
