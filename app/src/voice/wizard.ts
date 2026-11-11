// The order of `/settings/voice/setup` (contracts §8.6: output, mic with noise and bleed, range, timing, a first
// note) and what comes next, passing over the mic-only parts in Quiet mode.
export const WIZARD = ["headphones", "mic", "range", "latency", "first-sing"] as const;
export type WizardPart = (typeof WIZARD)[number];

const NEEDS_MIC: ReadonlySet<WizardPart> = new Set(["range", "first-sing"]);

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
