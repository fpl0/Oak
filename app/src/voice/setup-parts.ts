// The parts of the voice set-up, shared by the MDX `<Setup part="…" />` component, the set-up route and tests.
/**
 * The `part` values of the MDX `<Setup part="…" />` component (plus `latency`, both halves, `first-sing`, and
 * `match`, the three pitch-match trials contracts §8.6 lists for U00.L02).
 */
export const SETUP_PARTS = [
  "headphones",
  "mic",
  "noise",
  "bleed",
  "latency",
  "tap-latency",
  "sing-latency",
  "range",
  "first-sing",
  "match",
] as const;
export type SetupPartId = (typeof SETUP_PARTS)[number];
/** Every part `renderPart` can show: the MDX parts, the pitch match among them (Settings' wizard too). */
export const RENDERABLE_PARTS = SETUP_PARTS;
export type RenderablePart = (typeof RENDERABLE_PARTS)[number];
