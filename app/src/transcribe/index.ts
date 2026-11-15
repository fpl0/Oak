// Transcribe's public exports for hosts outside the Studio (Wave 7): R3.L05's rhythm master lab and J4.L04's
// reading of a standard (lesson), JC4.S1's analysis stage (capstone) and the gym's items (session's gym block).
// A host imports from here, not from the files behind it; everything here keeps its signature.

export { type AnalysisResult, AnalysisStage } from "./AnalysisStage.tsx";
// The analysis stage (JC4.S1, J4.L04): the chart, numerals, ii–V brackets and the form map, checked per bar.
export {
  ANALYSIS_PASS,
  type AnalysisAnswer,
  type AnalysisBarResult,
  type AnalysisCheck,
  type AnalysisSource,
  chartSlots,
  checkAnalysis,
  judgeNumeral,
  keyAtBar,
  revealedAnalysis,
  twoFiveStarts,
} from "./analysis.ts";
export { analysable, analysisSourceOf } from "./analysis-source.ts";
// Timeline grids: swung 16ths, odd meters by their groups, the two-bar clave grid.
export {
  CLAVE_CYCLE,
  type ClaveSpec,
  claveSideOfBar,
  claveStrokesInBar,
  claveText,
  feelText,
  type GridFeel,
  gridTicks,
  groupingText,
  nextClave,
} from "./grid.ts";
export {
  type GymSource,
  gymChoices,
  gymSources,
  NO_REPEAT_DAYS,
  nextGymSource,
} from "./gym-after-core.ts";
export {
  type GymItem,
  gymItemOf,
  type JazzGymItem,
  jazzChart,
  jazzItem,
  type RhythmGymItem,
  type RhythmTask,
  rhythmItem,
} from "./gym-items.ts";
// A jazz chart by ear: symbols with extensions, checked per bar (a wrong extension named in the learner's symbol).
export { JazzChart } from "./JazzChart.tsx";
export {
  chartSymbolText,
  checkJazzChart,
  JAZZ_CHART_PASS,
  type JazzBarResult,
  type JazzChartBar,
  type JazzChartCheck,
  parseChartCell,
  readJazzChord,
} from "./jazz-chart.ts";
// A short piece as a pattern source with Transcribe's transport, timeline and keys.
export { PatternSource } from "./PatternSource.tsx";
// The rhythm lab: identify and step-grid dictation, checked with counts, never places.
export { RhythmLab } from "./RhythmLab.tsx";
export { checkRhythmLab, checkRhythmTask, type RhythmAnswer, type RhythmLabCheck } from "./rhythm-lab.ts";
export { REF_PREFIX, type StimulusCode } from "./stimulus-code.ts";
