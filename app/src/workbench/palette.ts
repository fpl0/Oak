// The workbench's view of the music-semantic palette (ux §7.3). The colours themselves live in the app's
// theme (`app/src/ui/theme/palette.ts`); this module adds what the roll, the staff and the keyboard need on
// top: part colours by track index, degree swatches by number, and the label glyphs. Pure.
import {
  DEGREE_COLOURS,
  type DegreeStyle,
  degreeStyle,
  functionStyle,
  type HarmonicFn,
  NEUTRAL,
  PARTS_PALETTE,
  type Swatch,
  type ThemeName,
} from "../ui/theme/palette.ts";

export type { DegreeStyle, Swatch, ThemeName };
export { degreeStyle };

/** Layers and drums, never pitches. */
export const PART_COLORS = PARTS_PALETTE;

/** Colour of degree `num` (1–7) in a theme; anything else is the neutral swatch. */
export function degreeSwatch(num: number | null, theme: ThemeName = "paper"): Swatch {
  if (num === null || !Number.isInteger(num) || num < 1 || num > 7) return NEUTRAL[theme];
  return DEGREE_COLOURS[theme][num as 1 | 2 | 3 | 4 | 5 | 6 | 7];
}

export function neutralSwatch(theme: ThemeName = "paper"): Swatch {
  return NEUTRAL[theme];
}

/** Part colour by track position (stable for a track's index in source order). */
export function partColor(index: number): string {
  const n = PARTS_PALETTE.length;
  return PARTS_PALETTE[((index % n) + n) % n] as string;
}

/** T = degree-1 colour, PD = degree-4, D = degree-5. */
export function functionColor(fn: HarmonicFn, theme: ThemeName = "paper"): string {
  return functionStyle(fn, theme).fill;
}

/** Hatch direction for an alteration: ♭ = 45°, ♯ = −45° (ux §7.3). */
export function hatchOf(alt: number): "flat" | "sharp" | null {
  if (alt < 0) return "flat";
  if (alt > 0) return "sharp";
  return null;
}

/** "b3" → "♭3", "#4" → "♯4": labels always print the glyphs. */
export function prettyDegree(degree: string): string {
  return degree.replace(/b/g, "♭").replace(/#/g, "♯");
}

/** The active theme from `<html data-theme>`, defaulting to paper. */
export function themeOf(root: { getAttribute(name: string): string | null } | null | undefined): ThemeName {
  return root?.getAttribute("data-theme") === "bark" ? "bark" : "paper";
}
