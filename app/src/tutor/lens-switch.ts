// Wave 6: the lens a tutor chip switches on (music-tokens.ts `TokenLens`): an applied or borrowed numeral the Roman
// numerals lens, a key in a piece that changes key the Key lens, a mode the Degrees lens. Only ever on, and only a
// lens the learner has unlocked. Pure (the chip passes `useLenses()`), so it is tested without a page.
import type { Lenses } from "../lib/lenses.ts";
import type { TokenLens } from "./music-tokens.ts";

/**
 * Wave 6: switch on the lens a chip names (never off), when the learner has it. Returns whether it was switched on
 * now, so the chip can say so.
 */
export function switchLensOn(
  lenses: Pick<Lenses, "shown" | "available" | "set" | "chords" | "music">,
  lens: TokenLens,
): boolean {
  if (lens.group === "chords") {
    if (!lenses.chords.available[lens.id] || lenses.chords.shown[lens.id]) return false;
    lenses.chords.set(lens.id, true);
    return true;
  }
  if (lens.group === "music") {
    if (!lenses.music.available[lens.id] || lenses.music.shown[lens.id]) return false;
    lenses.music.set(lens.id, true);
    return true;
  }
  if (!lenses.available[lens.id] || lenses.shown[lens.id]) return false;
  lenses.set(lens.id, true);
  return true;
}
