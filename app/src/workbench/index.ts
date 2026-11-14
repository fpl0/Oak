// The Music Workbench (architecture §2.2, ux §3.4–§3.6). Pages import from here.
import "./workbench.css";

// Wave 3 additions (additive): lenses (labels per view), the staff's lens lines, the key panels and key tools.
export { type AnnotationKinds, annotateAbc, annotationText } from "./annotate.ts";
export { CircleOfFifths } from "./CircleOfFifths.tsx";
export { WorkbenchClock } from "./clock.ts";
export { callOf, primaryRanges, roleRanges } from "./code-roles.ts";
// Wave 6 additions (additive): sevenths, applied and borrowed chords, guide tones, the key plan and its ribbon,
// the mode's colour note, the beat grid, pushes and ghost notes (colour.ts), written as deep as the learner has
// been taught (depth.ts); the key panel's modes, borrowed chords and lift by a step (key-extras.ts).
export {
  type BandChord,
  bandChords,
  type GuideMark,
  type GuidePoint,
  type GuideTones,
  guideLineText,
  type KeyRibbonSpan,
  keyChangeText,
  keyOfRibbon,
  keyPlanBars,
  keyRibbonOf,
  type ModeMark,
  type PushMark,
  type RhythmMarks,
  type RollBeatGrid,
  rollBeatGrid,
  type WorkbenchColour,
} from "./colour.ts";
export { applyDepth, type DepthModel, labelAt } from "./depth.ts";
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
export { KeyPanel } from "./KeyPanel.tsx";
export { KeyRibbon } from "./KeyRibbon.tsx";
export {
  type Lending,
  type Lift,
  lending,
  liftCode,
  liftProblem,
  type ModeRow,
  modeRows,
} from "./key-extras.ts";
export {
  keyName,
  moveKey,
  neighbours,
  scaleTokens,
  signatureText,
  spelledScale,
  staffClefText,
} from "./key-tools.ts";
export {
  type LensSource,
  type MusicLensSource,
  useAppLensSource,
  WorkbenchLensProvider,
} from "./lens-source.tsx";
export { type StaffLabelMode, type ViewLabels, viewLabels } from "./lens-view.ts";
// Wave 2 additions (additive): loop region, metronome, the following roll, the shortcut-sheet rows.
export { defaultRegion, type LoopRegion, type RegionStep, regionLabel, stepRegion } from "./loop-math.ts";
export { Metronome } from "./metronome.ts";
export {
  activeAt,
  buildModel,
  keyAtCycle,
  type ModelOutcome,
  type PieceKeySpan,
  pieceKeys,
  type ViewEvent,
  type WorkbenchModel,
} from "./model.ts";
export { chordRoleOf, chordToneOf, pitchLabel, tooltipText } from "./music.ts";
export { PianoRoll, type RollColorMode, type RollLabelMode, type RollMusic } from "./PianoRoll.tsx";
export { FOLLOW_PAGE_BARS, followWindow } from "./roll-layout.ts";
export { ServicesGate } from "./ServicesGate.tsx";
export { StaffView } from "./StaffView.tsx";
export { useWorkbenchServices, type WorkbenchServices, WorkbenchServicesProvider } from "./services.tsx";
export { WORKBENCH_LOOP_SHORTCUTS, WORKBENCH_SHORTCUT_GROUP } from "./shortcuts.ts";
export { colourHeads } from "./staff-colour.ts";
export type { TransportLoop, TransportMetronome } from "./TransportBar.tsx";
export { TransportBar } from "./TransportBar.tsx";
export { clampViews, isEarlyUnit, layoutFor, type MusicView } from "./views.ts";
export { Workbench, type WorkbenchFeedback, type WorkbenchProps } from "./Workbench.tsx";
