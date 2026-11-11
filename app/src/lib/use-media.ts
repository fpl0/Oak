import { useSyncExternalStore } from "react";

/** Live `matchMedia` result. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/** Layout size classes (ux §2.1): L docks the tutor panel, M overlays it as a drawer. */
export const LARGE = "(min-width: 1280px)";
export function useIsLarge(): boolean {
  return useMediaQuery(LARGE);
}
