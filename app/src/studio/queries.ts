// Studio's own data hooks over the frozen shared ones (app/src/lib/queries.ts): the learner's unlocked set
// for the lint, and the details of many sketches at once for the sketchbook's covers and flags.
import type { SketchDetail } from "@oak/api";
import { useQueries } from "@tanstack/react-query";
import { apiQuery } from "../lib/queries.ts";

export { useUnlockedSet } from "../lib/unlocked.ts";

/** Details (with versions) of the listed sketches; the sketchbook needs the current version of each. */
export function useSketchDetails(ids: readonly string[]): Map<string, SketchDetail> {
  const results = useQueries({
    queries: ids.map((id) => ({ ...apiQuery("sketches.get", { params: { id } }), staleTime: 30_000 })),
  });
  const out = new Map<string, SketchDetail>();
  results.forEach((r, i) => {
    const id = ids[i];
    if (id && r.data) out.set(id, r.data);
  });
  return out;
}
