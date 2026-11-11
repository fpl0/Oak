// Which music views a workbench shows and how they are laid out (ux §3.4; contracts: in U00 to U04 at
// most two of roll, staff and keyboard). Pure.
import { parseUnitId } from "@oak/content-kit";

export type MusicView = "roll" | "staff" | "keyboard";
export const MUSIC_VIEWS: readonly MusicView[] = ["roll", "staff", "keyboard"];

/** Units U00–U04 show at most two of roll, staff and keyboard. */
export const EARLY_UNIT_MAX_VIEWS = 2;
/** Below this width the roll and the staff become tabs instead of a stack. */
export const NARROW_PX = 760;

/** True for core units U00–U04 (from a unit or lesson ID such as "U03" or "U03.L02"). */
export function isEarlyUnit(id: string | null | undefined): boolean {
  if (!id) return false;
  const unit = id.split(".")[0] as string;
  const parsed = parseUnitId(unit);
  if (!parsed) return false;
  return parsed.track === "core" && parsed.n <= 4;
}

/** Deduplicates, keeps the caller's order, and caps early units at two views. */
export function clampViews(
  views: readonly MusicView[],
  opts: { early?: boolean; max?: number } = {},
): MusicView[] {
  const unique = views.filter((v, i) => MUSIC_VIEWS.includes(v) && views.indexOf(v) === i);
  const max = opts.max ?? (opts.early ? EARLY_UNIT_MAX_VIEWS : MUSIC_VIEWS.length);
  return unique.slice(0, max);
}

export type ViewLayout = "stacked" | "tabs";
/** Below this available height the roll and the staff become tabs too (ux §2.1 "Height rule"). */
export const SHORT_PX = 760;
/**
 * Roll and staff stacked when the workbench has room, tabbed (Roll | Staff | Both) when it is narrower than
 * 760 px (ux §3.1) or has less than 760 px of height to live in (ux §2.1: 1280×800 under the 56 px header).
 */
export function layoutFor(width: number, availableHeight = Number.POSITIVE_INFINITY): ViewLayout {
  return width < NARROW_PX || availableHeight < SHORT_PX ? "tabs" : "stacked";
}

/** The tab strip: Roll and Staff, plus Both (the stack) when the tabs are there because of height. */
export type ViewTab = MusicView | "both";
