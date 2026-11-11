// Server state the capstone workspace needs beyond the shared hooks (app/src/lib/queries.ts is frozen): the
// capstone's draft sketch, starting a capstone session outside the daily runner, and the tutor's review.
import {
  type CapstoneReview,
  CapstoneReviewSchema,
  type Sketch,
  type SketchDetail,
  type SketchVersion,
} from "@oak/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQuery, useApiMutation } from "../lib/queries.ts";

/** The capstone's draft: the sketch the server links (`CapstoneState.sketchId`), else the newest `capstone` sketch for it. */
export function useDraftSketchId(capstoneId: string, linked: string | null | undefined) {
  const list = useQuery({
    ...apiQuery("sketches.list", { query: { origin: "capstone" } }),
    enabled: linked === null,
  });
  if (linked) return { id: linked, pending: false };
  if (linked === undefined) return { id: null, pending: true };
  const mine = (list.data?.items ?? [])
    .filter((s: Sketch) => s.originId === capstoneId && !s.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { id: mine[0]?.id ?? null, pending: list.isPending };
}

export function useDraft(id: string | null) {
  return useQuery({ ...apiQuery("sketches.get", { params: { id: id ?? "none" } }), enabled: id !== null });
}

export function latestVersion(s: SketchDetail | undefined): SketchVersion | null {
  if (!s) return null;
  return s.versions.find((v) => v.version === s.currentVersion) ?? s.versions.at(-1) ?? null;
}

/** `session.start` for a capstone session the learner opens from the map or the album, outside Today's runner. */
export const useStartCapstoneSession = () =>
  useApiMutation("session.start", [
    "bootstrap",
    "session.today",
    "capstones.get",
    "unlocks.list",
    "lessons.progress",
  ]);

export const useCreateDraft = () => useApiMutation("sketches.create", ["sketches.list", "streak.get"]);
export const useAddDraftVersion = () => useApiMutation("sketches.addVersion", ["streak.get"]);
export const usePatchDraft = () => useApiMutation("sketches.patch", ["sketches.get"]);

/** Seeds the sketch cache after a save, so the editor does not wait for a refetch. */
export function usePutDraft() {
  const qc = useQueryClient();
  return (detail: SketchDetail) => {
    qc.setQueryData(apiQuery("sketches.get", { params: { id: detail.id } }).queryKey, detail);
  };
}

/**
 * The latest structured review of this capstone in its tutor timeline (contracts §10.6). The tutor panel renders
 * the review itself; the workspace shows its state and offers its liner note at release. While a review was
 * asked for and has not arrived, the timeline is polled.
 */
export function useCapstoneReview(capstoneId: string, waiting: boolean) {
  const q = useQuery({
    ...apiQuery("tutor.timeline", { query: { subjectKind: "capstone", subjectId: capstoneId } }),
    refetchInterval: waiting ? 3000 : false,
    retry: 0,
  });
  let review: CapstoneReview | null = null;
  let at: string | null = null;
  for (const e of q.data?.entries ?? []) {
    if (e.review === null || e.excluded) continue;
    const parsed = CapstoneReviewSchema.safeParse(e.review);
    if (parsed.success) {
      review = parsed.data;
      at = e.at;
    }
  }
  return { review, at, query: q };
}
