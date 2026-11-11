// Rubric rules (contracts §5.6): exercises §2.4 kept rules plus the amended and added ones.
// `motif-repetition` and `section-contrast` are replaced by `motif-reuse` and `contrast`.
import type { SoundId, ToolId } from "../ids.ts";
import type {
  CadenceType,
  Degree,
  DrumRole,
  KeySpec,
  Layer,
  Md,
  Rat,
  ScaleMode,
  SkillRef,
  TrackRef,
} from "./common.ts";
import type { Matcher, Reference } from "./exercise.ts";

export type SectionRef = { section: string; nth?: number } | { bars: [number, number] } | "last";

export interface RubricRuleBase {
  /** Slug, unique in its rubric. Also the `ruleId` of `GradeResult.rubric`. */
  id: string;
  label: Md;
  /** All-or-nothing for pass. A lesson Make has exactly one required rule (contracts §6.5). */
  required: boolean;
  /** Evidence at weight 1.5 goes to these skills, only for code the learner typed. */
  skills: SkillRef[];
}

export type RubricRuleBody =
  | { rule: "bars"; min?: number; max?: number }
  | { rule: "duration-sec"; min: number }
  | { rule: "tempo-bpm"; min?: number; max?: number }
  | { rule: "tracks"; min: number; roles?: Layer[] }
  | { rule: "in-key"; key: KeySpec | "declared"; minRatio: number; tracks?: TrackRef[] }
  | { rule: "ends-on-degree"; degrees: Degree[]; track: TrackRef }
  | { rule: "cadence"; types: CadenceType[]; at: "last" | "phrase-ends" | { bar: number } }
  | {
      rule: "chord-tones-strong";
      minRatio: number;
      melody: TrackRef;
      harmony: TrackRef;
      strength: "downbeat" | "strong" | "beat";
    }
  | { rule: "progression"; schema?: string; rn?: string[]; allowRotation?: boolean; track?: TrackRef }
  | { rule: "contains-rn"; rn: string[]; min: number; mustResolve?: boolean }
  | { rule: "range"; track: TrackRef; maxSpan?: number; within?: [string, string] | "learner-voice" }
  | { rule: "step-ratio"; track: TrackRef; min: number }
  | { rule: "harmonic-rhythm"; changesPerBar: [number, number] }
  | { rule: "groove-lock"; kick: TrackRef; bass: TrackRef; min: number }
  /** Amended: a priority list of tracks, an optional drum-sound filter, and the subdivision that swings (§6.6). */
  | {
      rule: "swing";
      track: TrackRef | TrackRef[];
      drums?: DrumRole[];
      subdivision: 8 | 16;
      ratio: [number, number];
    }
  | { rule: "syncopation"; track: TrackRef; min: number }
  /** Section names ('verse chorus verse chorus') or letters by first appearance ('ABAB'); `?` matches any section. */
  | { rule: "form"; pattern: string; phraseBars?: number }
  | { rule: "voice-leading"; track: TrackRef; maxMovePerVoice: number; maxTotal?: number }
  | { rule: "guide-tones"; track: TrackRef; harmony: TrackRef; minRatio: number }
  /** Kept, for pivot modulations. Lifts use `key-change`. */
  | { rule: "modulation"; to: "up-step" | "up-half" | "relative" | "dominant" | KeySpec; atBar?: number }
  | { rule: "mode"; tonic: string; mode: ScaleMode; requireCharacteristic: boolean }
  | { rule: "blues-form"; variant: "standard" | "quick-change" | "jazz" }
  | { rule: "euclid"; track: TrackRef; k: number; n: number; rotationFree: boolean }
  | { rule: "clave"; track: TrackRef; type: "son" | "rumba"; direction: "3-2" | "2-3" }
  | { rule: "polyrhythm"; a: TrackRef; b: TrackRef; ratio: [number, number] }
  | { rule: "register-separation"; low: TrackRef; high: TrackRef; minGapSemis: number }
  | { rule: "no-muddy-low"; track: TrackRef }
  /** Amended: toolbox IDs, like the `must-use` constraint. */
  | { rule: "uses"; tool: ToolId | ToolId[]; min?: number }
  /** One-off checks registered by name with a unit test (`walking-bass`, `allowed-tensions`, `ii-v-chain`). */
  | { rule: "custom"; fn: string; params?: Record<string, unknown> }
  /**
   * Share of melody units (default 1 bar) whose interval sequence matches an earlier unit, exactly or
   * transposed, by edit similarity ≥ 0.75.
   */
  | { rule: "motif-reuse"; track: TrackRef; minRatio: number; unitBars?: number }
  /**
   * pitch: mean melody pitch differs ≥ 3 st; density: onsets per bar differ ≥ 25%; harmony: RN sequences
   * differ; register: lowest/highest sounding note moves ≥ 5 st; energy: |ΔE| ≥ 0.15.
   */
  | {
      rule: "contrast";
      a: SectionRef;
      b: SectionRef;
      axes: ("pitch" | "density" | "harmony" | "register" | "energy")[];
      minAxes: number;
      thresholds?: {
        pitchSemis?: number;
        densityRatio?: number;
        registerSemis?: number;
        energyDelta?: number;
      };
    }
  /**
   * New key = old key + one of `semitones`; the section at `at` must last ≥ `minBarsAfter` (default 8)
   * bars; `sameMelody`: key-relative degree sequences of the two sections are equal.
   */
  | { rule: "key-change"; at: SectionRef; semitones: number[]; minBarsAfter?: number; sameMelody?: boolean }
  /** ≥ `min` hits with effective gain ≤ `maxGain` (default 0.4) at the given positions. */
  | { rule: "velocity-ghosts"; track: TrackRef; min: number; maxGain?: number; on?: "16th-offbeat" | "any" }
  | { rule: "onsets"; track: TrackRef; drum?: DrumRole; contains?: Rat[]; equals?: Rat[]; perBar: boolean }
  | { rule: "degree-set"; track: TrackRef; subsetOf?: Degree[]; contains?: Degree[]; minCount?: number }
  | { rule: "sounds"; subsetOf?: SoundId[]; contains?: SoundId[] }
  | { rule: "distinct-pitches"; track: TrackRef; min: number }
  /** Device names come from `AnalysisSummary.devices`. */
  | { rule: "device-count"; devices: string[]; min: number }
  /** For example "melody identical to the reference" (JC4, AC1). */
  | { rule: "matches"; reference: Reference; matcher: Matcher; min: number };

export type RubricRule = RubricRuleBase & RubricRuleBody;
export type RubricRuleName = RubricRuleBody["rule"];

export const RUBRIC_RULE_NAMES = [
  "bars",
  "duration-sec",
  "tempo-bpm",
  "tracks",
  "in-key",
  "ends-on-degree",
  "cadence",
  "chord-tones-strong",
  "progression",
  "contains-rn",
  "range",
  "step-ratio",
  "harmonic-rhythm",
  "groove-lock",
  "swing",
  "syncopation",
  "form",
  "voice-leading",
  "guide-tones",
  "modulation",
  "mode",
  "blues-form",
  "euclid",
  "clave",
  "polyrhythm",
  "register-separation",
  "no-muddy-low",
  "uses",
  "custom",
  "motif-reuse",
  "contrast",
  "key-change",
  "velocity-ghosts",
  "onsets",
  "degree-set",
  "sounds",
  "distinct-pitches",
  "device-count",
  "matches",
] as const satisfies readonly RubricRuleName[];

/** What a rule evaluation returns. Numeric rules give partial credit `min(1, value / target)`. */
export interface RuleOutcome {
  ok: boolean;
  value?: number;
  target?: number;
}
