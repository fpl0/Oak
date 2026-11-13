// The order of `/settings/voice/setup` (contracts §8.6: output, mic with noise and bleed, timing, range, three
// pitch-match trials) and what comes next, passing over the mic-only parts in Quiet mode. `first-sing`, `noise`
// and `bleed` are re-runnable on their own (`?part=`), not steps of the full wizard: the bleed check is where the
// `sing.bleed` hint of a sing step points (contracts §8.6).
export const WIZARD = ["headphones", "mic", "latency", "range", "match"] as const;
export const SETUP_ROUTE_PARTS = [...WIZARD, "first-sing", "noise", "bleed"] as const;
export type WizardPart = (typeof SETUP_ROUTE_PARTS)[number];

const NEEDS_MIC: ReadonlySet<WizardPart> = new Set(["range", "match", "first-sing", "noise", "bleed"]);

export function wizardNext(
  parts: readonly WizardPart[],
  current: WizardPart,
  quiet: boolean,
): WizardPart | "done" {
  for (let i = parts.indexOf(current) + 1; i < parts.length; i++) {
    const p = parts[i] as WizardPart;
    if (quiet && NEEDS_MIC.has(p)) continue;
    return p;
  }
  return "done";
}
