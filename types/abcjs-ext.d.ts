// Additions to abcjs 6.7.2's own typings, found by execution in spike S4 (docs/spikes.md, s4 gotchas).
// Make this file visible (tsconfig "include") wherever abcjs is imported.
import "abcjs";

declare module "abcjs" {
  interface AbcElem {
    /** The value of the `!class=...!` decoration: one or more space-separated classes (`oak-e3 oak-e4`). */
    extraClass?: string;
    /**
     * Present when the element is a rest. `selectTypes: ['note']` also reports rests, so click
     * listeners must filter `abcElem.rest`.
     */
    rest?: { type: string; text?: string };
  }

  /**
   * What abcjs really passes to `clickListener` (the shipped `ClickListener` type has 5 parameters and
   * types `analysis.clickedClasses` as string[]; at run time it is a DOMTokenList and may be empty when
   * the centre of a hollow notehead is clicked). Resolve a chord member by geometry on
   * `.abcjs-notehead` boxes of `abcElem.abselem.elemset[0]`.
   */
  type OakClickListener = (
    abcElem: AbcElem,
    tuneNumber: number,
    classes: string,
    analysis: Omit<ClickListenerAnalysis, "clickedClasses"> & { clickedClasses: DOMTokenList | string[] },
    drag: ClickListenerDrag,
    mouseEvent: MouseEvent,
  ) => void;

  interface TuneObject {
    /** `undefined` (not `[]`) when the tune parsed cleanly. */
    warnings?: string[];
  }
}
