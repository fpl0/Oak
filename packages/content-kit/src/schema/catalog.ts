// Registry entry types: toolbox, skills, drill families, fact decks, glossary, can-dos, milestones,
// repertoire, Band layers and flavour kits (contracts §2.8, §3.1, §4, §5.10, §7.3; exercises §4.1).
import type {
  BandId,
  CanDoId,
  CapstoneId,
  CheckpointId,
  ChordFamilyId,
  DeckId,
  ExerciseId,
  FactId,
  FamilyId,
  FlavourId,
  LessonId,
  MilestoneId,
  ScaleId,
  SchemaId,
  SessionId,
  SkillId,
  SongId,
  SoundId,
  TermId,
  ToolId,
} from "../ids.ts";
import type { KeySpec, Md, MeterId, PickupSpec, SkillRef, SkillWeight, SwingSpec } from "./common.ts";
import type { Answer, AnswerUiKind, Cue, KeyPool, Stimulus } from "./exercise.ts";
import type { Diagnostic, NEvent } from "./results.ts";

// --- toolbox (the single unlock table, §3.1) ----------------------------------------------------

/** `unlocks.kind` in the database. */
export const TOOL_KINDS = ["tool", "sound", "scale", "chord", "feature", "template", "lens"] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export interface UnlockSpec {
  /** One session, or alternative sites: granted at whichever is completed (or started) first (rule 11). */
  at: SessionId | SessionId[];
  /** `complete`: when the Make is saved. `start`: START rows, granted when the session starts. */
  when: "complete" | "start";
  /** The voicing gate (rule 6): a graded attempt of this exercise with `score ≥ minScore`, unrevealed. */
  condition?: { exercise: ExerciseId; minScore: number; unrevealed: true };
  /** Rule 12: granted silently when this session is completed if the START site has not happened yet. */
  fallbackAt?: SessionId;
}
export interface ToolEntry {
  id: ToolId | SoundId | ScaleId | ChordFamilyId;
  kind: ToolKind;
  /** Table group A to H of contracts §3.2. */
  group?: string;
  /** The code form: `.scale("C4:major")`, `~`, `s("rhodes")`. */
  code: string;
  unlock: UnlockSpec;
  /** The concept that justifies the tool. */
  concept: string;
  /** Planned previews before unlock (lesson IDs or contexts). */
  preview?: string[];
  /** Group H and every sound alias: set by the audibility harness (rule 7). */
  audible?: boolean;
  /** How the harness proves audibility: a base expression and a non-default value (spike S3). */
  audibility?: { base: string; value: string | number };
  catalog: { signature: string; meaning: Md; demo: string; strudelCc?: string };
  /** Names the lint maps to this entry: callee or method names, mini operators, scale names, chord symbols. */
  matches?: string[];
}

// --- skill graph (§4) ---------------------------------------------------------------------------

export const SKILL_KINDS = ["fact", "concept", "perceptual", "production", "creative"] as const;
/** Drives the mastery model (contracts §7.5). */
export type SkillKind = (typeof SKILL_KINDS)[number];
export const SKILL_REGIONS = [
  "groove",
  "pitch-staff",
  "keys-scales",
  "chords-harmony",
  "melody-form",
  "ears-voice",
  "jazz",
  "sound",
] as const;
export type SkillRegion = (typeof SKILL_REGIONS)[number];
export interface SkillDef {
  id: SkillId;
  name: string;
  region: SkillRegion;
  /** The curriculum's category: rhythm, pitch, notation, scales, intervals, chords, harmony, ... */
  category: string;
  kind: SkillKind;
  prerequisites: SkillId[];
  /** The lesson that introduces it. Lesson gating is the only gate; prerequisites never lock (§4.2). */
  introducedBy: LessonId;
  /** Its first listing in the checkpoint map (§7.6). */
  checkpoint?: CheckpointId;
  /** Fine-grained categories (`deg.6`): `E05/deg.6`. */
  categories?: string[];
  retired?: { supersededBy: SkillId[] };
}

// --- drill families (§7.3; exercises §4.1) ------------------------------------------------------

export const FAMILY_KINDS = ["concept", "perceptual", "production"] as const;
export type FamilyKind = (typeof FAMILY_KINDS)[number];
export const FAMILY_DOMAINS = [
  "rhythm",
  "pitch",
  "degree",
  "interval",
  "chord",
  "harmony",
  "melody",
  "key",
  "form",
  "jazz",
  "sound",
  "code",
  "notation",
] as const;
export type FamilyDomain = (typeof FAMILY_DOMAINS)[number];
export type CompositeGroup = "pitch" | "harmony" | "rhythm";
export const COMPOSITE_FAMILIES: Readonly<Record<CompositeGroup, FamilyId>> = {
  pitch: "fam.mix.pitch",
  harmony: "fam.mix.harmony",
  rhythm: "fam.mix.rhythm",
};

export interface LevelParams {
  /** Category IDs sampled at this level. A level opens only when every category's lesson is completed. */
  categories: string[];
  /** Replays allowed per trial; extras count as assist and cap the rating at Hard. */
  replays: number;
  instruments: SoundId[] | "drums";
  keys: KeyPool;
  tempo: [number, number];
  context?: Cue["context"];
  /** Family-specific (length, leapMax, voicings, windowMs, ...). */
  [k: string]: unknown;
}
export interface FamilyCategory {
  id: string;
  /** The lesson that teaches it; the generator samples only categories whose lesson is completed. */
  unlockAt: LessonId;
  /** Evidence target; default: the family's skills. */
  skill?: SkillRef;
  /** Blocked-intro neighbours (new 6 against 5 and 7). */
  contrastOf?: string[];
}
export interface FamilyDef<L extends LevelParams = LevelParams> {
  id: FamilyId;
  title: string;
  /** The primary kind: drives the card kind (concept → `concept`; perceptual/production → `family`). */
  kind: FamilyKind;
  /** Second kind for the mixed rows of §7.3 (P/Pr, C/P, Pr/P). */
  alsoKind?: FamilyKind;
  domain: FamilyDomain;
  skills: SkillWeight[];
  unlock: { lesson: LessonId; levelGates?: Record<number, LessonId | LessonId[]> };
  categories: FamilyCategory[];
  /** Index 0 = level 1. */
  levels: L[];
  masteryLevel: number;
  /** 5 to 8. */
  trialsPerSet: number;
  fastRtMs: number;
  estTrialSec: number;
  /** Desired retention of its card (contracts §7.1). */
  retention: 0.85 | 0.9;
  /** The composite a graduated family joins; `null` for concept families. */
  mix: CompositeGroup | null;
  /** 'b6|5': 'b6 leans down to 5…'. */
  confusionTips?: Record<string, Md>;
  answer: AnswerUiKind;
  /** Needs the microphone: paused in Quiet mode. */
  mic?: boolean;
  /** The generator in @oak/drills that implements it. */
  generator: string;
}

/** One generated trial. `events` are authoritative; `code` is what "Show me the code" reveals. */
export interface Trial<E = Answer> {
  /** `mulberry32(hash(familyId, setId, trialIndex))`. Stored, so a trial is reproducible. */
  seed: number;
  family: FamilyId;
  level: number;
  category: string;
  params: Record<string, unknown>;
  code: string;
  events: NEvent[];
  cps: number;
  /** Sounds to preload before trial 1 of the set. */
  preload: string[];
  cue: Cue;
  expected: E;
  /** FET resolution or contrast replay. */
  resolution?: { code: string; events: NEvent[] };
}
export interface TrialResult {
  credit: number;
  correct: boolean;
  rtMs: number;
  replays: number;
  diagnostics: Diagnostic[];
  /** [expected, got]. */
  confusion?: [string, string];
}

// --- fact decks ---------------------------------------------------------------------------------

export interface FactCardDef {
  id: FactId;
  /** The lesson that opens this card; default: the deck's. */
  gate?: LessonId;
  prompt: {
    text?: Md;
    stimulus?: Stimulus;
    staff?: { clef: "treble" | "bass"; notes: string[]; key?: KeySpec };
  };
  answer: Answer;
}
export interface FactDeck {
  id: DeckId;
  title: string;
  unlock: { skill: SkillId; lesson: LessonId };
  cards: FactCardDef[];
  newPerDay: number;
  fastRtMs: number;
  answer: AnswerUiKind;
}

// --- glossary, can-dos, milestones --------------------------------------------------------------

export interface TermEntry {
  id: TermId;
  term: string;
  /** One sentence, in sound-first words. */
  definition: Md;
  /** One audio example (Strudel code). */
  example: string;
  introducedBy: LessonId;
  /** An antonym pair introduced together counts as one term. */
  pairedWith?: TermId;
}
export const CANDO_AREAS = ["hear", "read", "write", "compose", "transcribe", "sing", "code"] as const;
export type CanDoArea = (typeof CANDO_AREAS)[number];
export type CanDoStatus = "emerging" | "solid" | "strong" | "fading";
export interface CanDoDef {
  id: CanDoId;
  area: CanDoArea;
  /** "I can …". */
  statement: string;
  skills: SkillId[];
  /** First awarded by. */
  source: LessonId | CapstoneId | CheckpointId;
}
export interface MilestoneDef {
  id: MilestoneId;
  title: string;
  description: Md;
  /** Reached when all of these hold. */
  when: { sessions?: SessionId[]; capstones?: CapstoneId[]; canDos?: CanDoId[] };
}

// --- repertoire (§2.8) --------------------------------------------------------------------------

export interface SongDef {
  id: SongId;
  title: string;
  year: number | "trad";
  status: "US-PD" | "trad";
  /** A score or collection published in 1930 or earlier. */
  provenance: { source: string; year: number; pages?: string };
  /** The human who checked the answer key against the source. */
  verifiedBy: string;
  key: KeySpec;
  meter: MeterId;
  bpm: number;
  pickup?: PickupSpec;
  swing?: SwingSpec;
  /** 'AABA', 'verse chorus'. */
  form: string;
  /** Oak's own Strudel rendition: one labelled reference and its parts. Never a recording, never non-PD lyrics. */
  answerKey: {
    bars: number;
    code: string;
    layers: Partial<Record<"drums" | "bass" | "chords" | "melody", string>>;
    /** Lead-sheet chords in code spelling (STYLE §5). */
    chords?: { bar: number; beat: number; symbol: string }[];
    phrases?: [number, number][];
  };
  /** Where it may be used (ladder level, lessons), and from when (`Drunken Sailor`: from U14). */
  availableFrom?: LessonId;
  schema?: SchemaId;
}

// --- Band layer and flavour kits (§5.10) --------------------------------------------------------

export interface BandDef {
  id: BandId;
  title: string;
  bars: number;
  roles: ("drums" | "bass" | "chords")[];
  /** Labelled tracks `drums:` `bass:` `chords:` only; may use any tool (lint profile 'band'). */
  code: Record<FlavourId, string>;
  /** The code may contain `{{key}}` (e.g. "C4:major") and `{{bpm}}`. */
  params: { key: boolean; bpm: boolean };
}
export interface FlavourKit {
  id: FlavourId;
  title: string;
  drums: SoundId;
  bass: SoundId;
  chords: SoundId;
  lead: SoundId;
  chordDepth: "triad" | "seventh";
  swing?: SwingSpec;
  production: {
    room: number;
    bassLpf: number;
    humanizeVelocity: number;
    pan: Partial<Record<"drums" | "bass" | "chords" | "lead", number>>;
  };
}
/** Fallback sounds for learner-editable code while a flavour's sound is still locked (rule 8). */
export const DEFAULT_STARTER_SOUNDS = {
  lead: "snd.piano",
  chords: "snd.piano",
  bass: "snd.ebass",
  bassBeforeEbass: "snd.piano",
} as const satisfies Record<string, SoundId>;

/** What a sketch saved over a Band stores (rule 5). */
export interface BandState {
  bandId: BandId;
  flavour: FlavourId;
  mutes: ("drums" | "bass" | "chords")[];
}
