// @oak/pitch: pitch detection, tracking and the ONE rule for a sung note and for a tap (contracts §8),
// the tolerance ladder, the vocal range and "hum it, Oak drafts it". Pure and isomorphic: the worklet in
// @oak/audio feeds it frames (through `@oak/pitch/detector`, which imports nothing else of this package
// but the maths); the graders run on the main thread or the server.

export { createDetector, MIN_VOLUME_DB, PitchFrameAnalyzer } from "./detector.ts";
export {
  defaultSlotsPerBar,
  draftFromHum,
  SCALE_INTERVALS,
  scaleName,
  stepMidi,
  tonicMidi,
  tonicPc,
  tuningOffsetCents,
} from "./hum.ts";
export {
  dayNumber,
  finerTolerance,
  LADDER_DAYS_NEEDED,
  LADDER_LOOSEN_GAP_DAYS,
  LADDER_MIN_NOTES,
  LADDER_THRESHOLDS,
  LADDER_WINDOW_DAYS,
  type LadderNote,
  type LadderOptions,
  type LadderSnapshot,
  type LadderSnapshotInput,
  ladderProgress,
  ladderSnapshot,
  loosenOffer,
  looserTolerance,
  nextSingTolerance,
  SING_TOL_LADDER,
  singDayStats,
} from "./ladder.ts";
export {
  centsFrom,
  clamp,
  dbToRms,
  hzToMidi,
  mad,
  mean,
  median,
  midiName,
  midiToHz,
  quantile,
  rmsDb,
  rmsOf,
} from "./math.ts";
export {
  alignSung,
  calibrateRange,
  DRIFT_MIN_NOTES,
  detectBleed,
  estimateRange,
  firstSingPasses,
  fitToRange,
  gradeSung,
  gradeSungLive,
  LENIENT_CENTS,
  LENIENT_SPAN_SEC,
  MAX_LATE_START_SEC,
  resolveSingTolerance,
  sungCredit,
} from "./sung.ts";
export {
  CLIP_LEVEL,
  CLIP_MIN_FRAMES,
  HOLD_SEC,
  type TakeHeard,
  type TakeQuality,
  takeQuality,
  VOICE_LIKE_ABOVE_FLOOR_DB,
  VOICE_LIKE_CLARITY,
} from "./take.ts";
export {
  alignTaps,
  calibrateTapLatency,
  FREE_TEMPO_RANGE,
  gradeTaps,
  minIoiMs,
  TAP_DRIFT_REPORT_MS,
  TAP_LATENCY_SEARCH_MS,
  TAP_OFFSET_REPORT_MS,
  tapFloorMs,
  tapWindowMs,
} from "./taps.ts";
export {
  hopSecOf,
  isLowVoice,
  PitchTracker,
  pitchFramesToNotes,
  TRACKER_DEFAULTS,
  trackerOptionsFor,
} from "./tracker.ts";
export * from "./types.ts";
