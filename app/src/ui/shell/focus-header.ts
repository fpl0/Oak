// What a focus-mode page shows in the 56 px header (ux §2.1): its title and step rail. Pages set it while mounted.
import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { RailStep } from "../kit/basics.tsx";

interface FocusHeader {
  title: string | null;
  steps: RailStep[] | null;
  /** Session start for the subtle elapsed timer (ms since epoch). */
  startedAt: number | null;
  /** Show "Step N of M · name" beside the rail (onboarding, docs/design/retry.md §6.1). */
  position: boolean;
  /** Done and skipped dots open their step. */
  onVisit: ((id: string) => void) | null;
  set(patch: Partial<Omit<FocusHeader, "set">>): void;
}

export const useFocusHeader = create<FocusHeader>((set) => ({
  title: null,
  steps: null,
  startedAt: null,
  position: false,
  onVisit: null,
  set: (patch) => set(patch),
}));

export function useFocusHeaderContent(
  title: string,
  steps: RailStep[] | null = null,
  opts: { position?: boolean; onVisit?: ((id: string) => void) | null } = {},
): void {
  const set = useFocusHeader((s) => s.set);
  const signature = JSON.stringify(steps);
  const visit = useRef(opts.onVisit ?? null);
  visit.current = opts.onVisit ?? null;
  const visitable = opts.onVisit != null;
  const position = opts.position === true;
  useEffect(() => {
    set({
      title,
      steps,
      startedAt: Date.now(),
      position,
      onVisit: visitable ? (id: string) => visit.current?.(id) : null,
    });
    return () => set({ title: null, steps: null, startedAt: null, position: false, onVisit: null });
  }, [title, signature, set, position, visitable]);
}
