// What a focus-mode page shows in the 56 px header (ux §2.1): its title and step rail. Pages set it while mounted.
import { useEffect } from "react";
import { create } from "zustand";
import type { RailStep } from "../kit/basics.tsx";

interface FocusHeader {
  title: string | null;
  steps: RailStep[] | null;
  /** Session start for the subtle elapsed timer (ms since epoch). */
  startedAt: number | null;
  set(patch: Partial<Omit<FocusHeader, "set">>): void;
}

export const useFocusHeader = create<FocusHeader>((set) => ({
  title: null,
  steps: null,
  startedAt: null,
  set: (patch) => set(patch),
}));

export function useFocusHeaderContent(title: string, steps: RailStep[] | null = null): void {
  const set = useFocusHeader((s) => s.set);
  const signature = JSON.stringify(steps);
  useEffect(() => {
    set({ title, steps, startedAt: Date.now() });
    return () => set({ title: null, steps: null, startedAt: null });
  }, [title, signature, set]);
}
