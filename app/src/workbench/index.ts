// The Music Workbench (architecture §2.2, ux §3.4–§3.6). Pages import from here.
import "./workbench.css";

export { WorkbenchClock } from "./clock.ts";
export { callOf, primaryRanges, roleRanges } from "./code-roles.ts";
export { FULL_LOOP, PLAYGROUND_EXAMPLES, type PlaygroundExample } from "./examples.ts";
export { type ABControls, FeedbackPanel, type FeedbackPanelProps, viewOf } from "./FeedbackPanel.tsx";
export {
  ghostEvents,
  type LadderAction,
  type LadderState,
  ladderReducer,
  marksOf,
  summaryText,
  unlocks,
  whereText,
} from "./feedback.ts";
export { type BusState, type Focus, HighlightBus, type HighlightSource } from "./highlight-bus.ts";
export { Keyboard } from "./Keyboard.tsx";
// Wave 2 additions (additive): loop region, metronome, the following roll, the shortcut-sheet rows.
export { defaultRegion, type LoopRegion, type RegionStep, regionLabel, stepRegion } from "./loop-math.ts";
export { Metronome } from "./metronome.ts";
export { activeAt, buildModel, type ModelOutcome, type ViewEvent, type WorkbenchModel } from "./model.ts";
export { chordRoleOf, chordToneOf, pitchLabel, tooltipText } from "./music.ts";
export { PianoRoll, type RollColorMode, type RollLabelMode } from "./PianoRoll.tsx";
export { FOLLOW_PAGE_BARS, followWindow } from "./roll-layout.ts";
export { ServicesGate } from "./ServicesGate.tsx";
export { StaffView } from "./StaffView.tsx";
export { useWorkbenchServices, type WorkbenchServices, WorkbenchServicesProvider } from "./services.tsx";
export { WORKBENCH_LOOP_SHORTCUTS, WORKBENCH_SHORTCUT_GROUP } from "./shortcuts.ts";
export type { TransportLoop, TransportMetronome } from "./TransportBar.tsx";
export { TransportBar } from "./TransportBar.tsx";
export { clampViews, isEarlyUnit, layoutFor, type MusicView } from "./views.ts";
export { Workbench, type WorkbenchFeedback, type WorkbenchProps } from "./Workbench.tsx";
