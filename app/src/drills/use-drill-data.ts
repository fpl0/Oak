// Everything a drill surface reads before it can run: the family catalog and fact decks (content), the bound
// generator registry, the learner's profile (comfort range, latencies, Quiet mode, solfège), the family states
// and cards, and which lessons are completed (what is unlocked).
import {
  type FamilyDef,
  type FamilyState,
  type LearnerProfile,
  type SrsCard,
  toLearnerProfile,
  type VoiceState,
} from "@oak/api";
import { createRegistry, type DrillRegistry } from "@oak/drills";
import { useQueryClient } from "@tanstack/react-query";
import { useContent } from "../lib/content.ts";
import type { ContentBundle } from "../lib/content-model.ts";
import { useCourseProgress, useFamilies, useProfile, useVoiceState } from "../lib/queries.ts";

export interface DrillData {
  content: ContentBundle;
  registry: DrillRegistry;
  defs: ReadonlyMap<string, FamilyDef>;
  states: ReadonlyMap<string, FamilyState>;
  cards: ReadonlyMap<string, SrsCard>;
  /**
   * The learner profile for generating and grading, with `quiet` and `singTolCents` taken from `voice.get`
   * (Quiet mode and the tolerance ladder are server state, wave3.md §5.3) when the server provides it.
   */
  profile: LearnerProfile;
  /** What the learner sings on and sees under a sung target (contracts §8.3): numbers until U03.L08. */
  solfege: "numbers" | "syllables";
  /** `voice.get`, or null while the server does not provide it (the profile's values stand in). */
  voice: VoiceState | null;
  completed: ReadonlySet<string>;
}

const registries = new WeakMap<ContentBundle, DrillRegistry>();
function registryOf(content: ContentBundle): DrillRegistry {
  let r = registries.get(content);
  if (!r) {
    r = createRegistry(content.families, content.decks);
    registries.set(content, r);
  }
  return r;
}

export type DrillDataState =
  | { status: "loading" }
  | { status: "error"; error: unknown; retry(): void }
  | { status: "ready"; data: DrillData };

export function useDrillData(): DrillDataState {
  const content = useContent();
  const profile = useProfile();
  const families = useFamilies();
  const progress = useCourseProgress();
  const voice = useVoiceState();
  if (content.isError) return { status: "error", error: content.error, retry: () => void content.refetch() };
  if (profile.isError) return { status: "error", error: profile.error, retry: () => void profile.refetch() };
  if (families.isError)
    return { status: "error", error: families.error, retry: () => void families.refetch() };
  if (progress.isError)
    return { status: "error", error: progress.error, retry: () => void progress.refetch() };
  if (!content.data || !profile.data || !families.data || !progress.data) return { status: "loading" };
  // Voice state is waited for briefly; an error (501 until the server builds it, or offline) falls back to the
  // profile, so a missing voice endpoint never blocks practice.
  // Only the first fetch is waited for: a later refetch (after a set) never unmounts a running surface.
  if (!voice.isFetched && voice.fetchStatus === "fetching") return { status: "loading" };
  const c = content.data;
  const v = voice.data ?? null;
  const base = toLearnerProfile(profile.data);
  return {
    status: "ready",
    data: {
      content: c,
      registry: registryOf(c),
      defs: new Map(c.families.map((f) => [f.id, f])),
      states: new Map(families.data.families.map((f) => [f.familyId, f])),
      cards: new Map(families.data.cards.map((card) => [card.cardId, card])),
      profile: v ? { ...base, quiet: v.quiet, singTolCents: v.ladder.cents } : base,
      solfege: v?.labels ?? profile.data.solfege,
      voice: v,
      completed: new Set(
        progress.data.lessons.filter((l) => l.status === "completed").map((l) => l.lessonId),
      ),
    },
  };
}

/** Invalidates what a finished set changes. */
export function useAfterSet(): () => void {
  const qc = useQueryClient();
  return () => {
    for (const name of [
      "families.list",
      "families.state",
      "srs.due",
      "skills.map",
      "streak.get",
      "session.today",
      "voice.get",
    ])
      void qc.invalidateQueries({ queryKey: ["api", name] });
  };
}
