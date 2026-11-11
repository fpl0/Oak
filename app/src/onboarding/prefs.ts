// The pure side of the preferences screen: the flavour previews (the four-chord Band in C at the loop's tempo).
import type { FlavourId } from "@oak/content-kit";
import { bands } from "../../../content/bands/index.ts";

export type PrefFlavour = Extract<FlavourId, "flavour.pop" | "flavour.jazz-soul">;
export const PREVIEW_BAND = "band.axis-4bar";
export const PREVIEW_BPM = 92;

/** The preview's code: the four-chord Band in C major, in the flavour (Band code carries no tempo line). */
export function previewCode(flavour: PrefFlavour): string | null {
  const band = bands.find((b) => b.id === PREVIEW_BAND);
  const code = band?.code[flavour];
  return code ? `setcpm(${PREVIEW_BPM}/4)\n${code.replaceAll("{{key}}", "C4:major")}` : null;
}

/**
 * Drops a `.bank("…")` the installed pack does not have (the jazz-soul Band names `jazzkit`, which the v1 pack
 * lacks), so the preview plays the default kit instead of failing with "sound not found".
 */
export function withInstalledBanks(code: string, sounds: readonly string[]): string {
  return code.replace(/\.bank\("([^"]+)"\)/g, (all, bank: string) =>
    sounds.some((s) => s.startsWith(`${bank.toLowerCase()}_`)) ? all : "",
  );
}
