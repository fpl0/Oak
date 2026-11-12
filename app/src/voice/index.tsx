// The voice and audio set-up screens, shared by onboarding, `/settings/voice/setup`, Settings › Voice and
// Settings › Audio, and the lesson player's `<Setup part="…" />` (content/lib/mdx.ts; U00.L02's concept steps).
import type { Profile } from "@oak/api";
import { useProfile } from "../lib/queries.ts";
import { QueryView } from "../ui/kit/QueryState.tsx";
import type { PartContext } from "./parts/common.tsx";
import { FirstSingPart } from "./parts/FirstSingPart.tsx";
import { HeadphonesPart } from "./parts/HeadphonesPart.tsx";
import { LatencyPart } from "./parts/LatencyPart.tsx";
import { MicPart } from "./parts/MicPart.tsx";
import { PitchMatchPart } from "./parts/PitchMatchPart.tsx";
import { RangePart } from "./parts/RangePart.tsx";
import type { RenderablePart } from "./setup-parts.ts";

export { LadderCard, OutputMeter, QuietControl, RecheckHint } from "./panels.tsx";
export type { PartContext, PartProps } from "./parts/common.tsx";
export { FirstSingPart } from "./parts/FirstSingPart.tsx";
export { HeadphonesPart } from "./parts/HeadphonesPart.tsx";
export { LatencyPart } from "./parts/LatencyPart.tsx";
export { MicPart, PRIVACY_LINE } from "./parts/MicPart.tsx";
export { PitchMatchPart } from "./parts/PitchMatchPart.tsx";
export { RangePart } from "./parts/RangePart.tsx";
export { clearRecheck, type RecheckAdvice, reportTake, takeAdvice, useRecheck } from "./recheck.ts";
export { RENDERABLE_PARTS, type RenderablePart, SETUP_PARTS, type SetupPartId } from "./setup-parts.ts";
export { isNotBuilt, type LadderView, ladderViewOf, type QuietView, quietViewOf } from "./state.ts";
export { useVoice, type Voice } from "./use-voice.ts";

export interface SetupPartProps {
  part: RenderablePart;
  onDone(): void;
  onSkip?: () => void;
  /** The learner chose Quiet mode (no mic): the host records it and moves on. */
  onQuiet?: () => void;
  context?: PartContext;
}

export function renderPart(profile: Profile, p: SetupPartProps) {
  const common = {
    profile,
    context: p.context ?? "lesson",
    onDone: p.onDone,
    ...(p.onSkip ? { onSkip: p.onSkip } : {}),
  };
  switch (p.part) {
    case "headphones":
      return <HeadphonesPart {...common} />;
    case "mic":
      // In a lesson the noise and bleed checks are parts of their own (U00.L02 S2): the mic part stops once Oak
      // hears the learner, instead of running both checks a second time above them.
      return (
        <MicPart
          {...common}
          {...(common.context === "lesson" ? { only: "mic" as const } : {})}
          {...(p.onQuiet ? { onQuiet: p.onQuiet } : {})}
        />
      );
    case "noise":
      return <MicPart {...common} only="noise" />;
    case "bleed":
      return <MicPart {...common} only="bleed" />;
    case "latency":
      return <LatencyPart {...common} />;
    case "tap-latency":
      return <LatencyPart {...common} only="tap" />;
    case "sing-latency":
      return <LatencyPart {...common} only="sing" />;
    case "range":
      return <RangePart {...common} />;
    case "first-sing":
      return <FirstSingPart {...common} />;
    case "match":
      return <PitchMatchPart {...common} />;
  }
}

/** One set-up screen with the learner's profile loaded: what a lesson's `<Setup part="…" />` mounts. */
export function SetupPart(props: SetupPartProps) {
  const profile = useProfile();
  return <QueryView query={profile}>{(p) => renderPart(p, props)}</QueryView>;
}
