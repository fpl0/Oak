// The learner's unlocked set (tools, sounds, scales, features …) as a stable `Set`, for lint contexts and "is it
// open yet" checks. Stable while the unlock list is unchanged, so it can sit in effect dependencies.
import type { UnlockableId } from "@oak/content-kit";
import { useUnlocks } from "./queries.ts";

const EMPTY: ReadonlySet<UnlockableId> = new Set();

/** Every unlocked ID, stable while the unlock list is unchanged. */
export function useUnlockedSet(): { unlocked: ReadonlySet<UnlockableId>; ready: boolean; error: unknown } {
  const q = useUnlocks();
  const items = q.data?.items;
  const key = items?.map((u) => u.itemId).join(",") ?? "";
  const unlocked = cached(key, () => new Set((items ?? []).map((u) => u.itemId as UnlockableId)));
  return { unlocked: items ? unlocked : EMPTY, ready: q.isSuccess, error: q.error };
}

let memo: { key: string; value: ReadonlySet<UnlockableId> } | null = null;
function cached(key: string, make: () => ReadonlySet<UnlockableId>): ReadonlySet<UnlockableId> {
  if (memo?.key !== key) memo = { key, value: make() };
  return memo.value;
}
