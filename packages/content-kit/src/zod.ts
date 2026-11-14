// zod schemas matching the types in ./schema (contracts §5). Every exported schema is annotated with its
// hand-written type, so `tsc` proves the two stay in step. Authoring objects are strict: an unknown key
// is an error, which is what catches a typo in a lesson file.
import { z } from "zod";
import type { SessionId, StepLocalId } from "./ids.ts";
import {
  FEEDBACK_AREAS,
  FLAVOUR_IDS,
  ID_PATTERNS,
  type IdKind,
  type IdTypes,
  isSessionId,
  isSkillRef,
  SLUG_PATTERN,
  STEP_LOCAL_PATTERN,
} from "./ids.ts";
import type * as S from "./schema/index.ts";
import {
  BASS_MEMBERS,
  CADENCE_TYPES,
  CANDO_AREAS,
  CHORD_QUALITIES,
  DEGREES,
  DEVICE_NAMES,
  DIMENSIONS,
  DRUM_ROLES,
  FAMILY_DOMAINS,
  FAMILY_KINDS,
  FORM_SECTION_NAMES,
  LAYERS,
  METER_IDS,
  NON_CHORD_TONE_ROLES,
  OUTSIDE_CHORD_KINDS,
  PROBE_KINDS,
  SCALE_MODES,
  SKILL_KINDS,
  SKILL_REGIONS,
  STEP_KINDS,
  TOOL_KINDS,
  WORKBENCH_PANELS,
} from "./schema/index.ts";

// --- IDs ----------------------------------------------------------------------------------------

/** A schema for one ID kind: checks the grammar of contracts §1.2 (not that the ID is registered). */
export function idSchema<K extends IdKind>(kind: K): z.ZodType<IdTypes[K]> {
  const schema = z.string().regex(ID_PATTERNS[kind], `expected a ${kind} ID (contracts §1.2)`);
  return schema as unknown as z.ZodType<IdTypes[K]>;
}
const lessonId = idSchema("lesson");
const unitId = idSchema("unit");
const checkpointId = idSchema("checkpoint");
const capstoneId = idSchema("capstone");
const capstoneSessionId = idSchema("capstoneSession");
const skillId = idSchema("skill");
const familyId = idSchema("family");
const deckId = idSchema("deck");
const factId = idSchema("fact");
const toolId = idSchema("tool");
const soundId = idSchema("sound");
const canDoId = idSchema("canDo");
const termId = idSchema("term");
const songId = idSchema("song");
const bandId = idSchema("band");
const feedbackId = idSchema("feedback");
const exerciseId = idSchema("exercise");
const flavourId = z.enum(FLAVOUR_IDS);
export const SessionIdSchema = z
  .string()
  .refine(
    isSessionId,
    "expected a session ID (lesson, checkpoint, capstone session or GYM.nn)",
  ) as unknown as z.ZodType<SessionId>;
const skillRef = z
  .string()
  .refine(
    isSkillRef,
    "expected a skill node or category ID (E05, E05/deg.6)",
  ) as unknown as z.ZodType<S.SkillRef>;
const stepLocalId = z
  .string()
  .regex(STEP_LOCAL_PATTERN, "expected a step ID like S5") as unknown as z.ZodType<StepLocalId>;
const unlockableId = z.union([toolId, soundId, idSchema("scale"), idSchema("chordFamily")]);
const slug = z.string().regex(SLUG_PATTERN, "expected a slug: lower-case letters, digits and hyphens");
const trackId = z.enum(["J", "R", "A"]);

// --- common -------------------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  let [x, y] = [Math.abs(a), Math.abs(b)];
  while (y) [x, y] = [y, x % y];
  return x;
}
export const RatSchema: z.ZodType<S.Rat> = z
  .tuple([z.number().int(), z.number().int().positive()])
  .refine(([n, d]) => gcd(n, d) === 1, "a Rat must be reduced ([1, 2], not [2, 4]; zero is [0, 1])");
const md = z.string();
const bars2 = z.tuple([z.number(), z.number()]);
export const CodeRangeSchema: z.ZodType<S.CodeRange> = z
  .strictObject({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative() })
  .refine((r) => r.to >= r.from, "`to` must not be before `from`");
const degree = z.enum(DEGREES);
const scaleMode = z.enum(SCALE_MODES);
export const KeySpecSchema: z.ZodType<S.KeySpec> = z.strictObject({
  tonic: z.string().regex(/^[A-G](?:#|b)?$/, 'expected a spelled tonic like "Eb" or "F#"'),
  mode: scaleMode,
});
const keyPlan: z.ZodType<S.KeyPlanEntry[]> = z
  .array(z.strictObject({ bar: z.number().int().nonnegative(), key: KeySpecSchema }))
  .min(1);
const outsideChordKind = z.enum(OUTSIDE_CHORD_KINDS);
const meterId = z.enum(METER_IDS);
export const SwingSpecSchema: z.ZodType<S.SwingSpec> = z.strictObject({
  subdivision: z.union([z.literal(8), z.literal(16)]),
  amount: z.number().min(0).max(1),
});
export const PickupSpecSchema: z.ZodType<S.PickupSpec> = z.strictObject({ units: RatSchema });
const drumRole = z.enum(DRUM_ROLES);
const layer = z.enum(LAYERS);
const chordQuality = z.enum(CHORD_QUALITIES);
const pitchMode = z.enum(["absolute", "octave-free", "key-relative", "transposition-invariant"]);
const trackRef = z.string().min(1);
export const SkillWeightSchema: z.ZodType<S.SkillWeight> = z.strictObject({
  skill: skillRef,
  w: z.number().positive(),
});
const role = z.enum(["practice", "check", "checkpoint", "capstone"]);
const num: z.ZodType<S.Num> = z.union([z.number(), z.strictObject({ param: z.string().min(1) })]);
const cadenceType = z.enum(CADENCE_TYPES);
const severity = z.enum(["error", "warn", "info", "praise"]);

// --- hints, params, stimulus, answers -----------------------------------------------------------

export const TargetSelectorSchema: z.ZodType<S.TargetSelector> = z.strictObject({
  track: trackRef.exactOptional(),
  drum: drumRole.exactOptional(),
  bar: z.number().int().min(0).exactOptional(),
  beat: z.number().positive().exactOptional(),
  degree: degree.exactOptional(),
  nth: z.number().int().positive().exactOptional(),
});
export const HintSchema: z.ZodType<S.Hint> = z.strictObject({
  text: md,
  highlight: z
    .strictObject({
      code: z.array(CodeRangeSchema).exactOptional(),
      bars: z.array(z.number().int()).exactOptional(),
      noteSelector: TargetSelectorSchema.exactOptional(),
    })
    .exactOptional(),
  patch: z.string().exactOptional(),
  replay: z
    .strictObject({
      rate: z.number().positive().exactOptional(),
      isolate: layer.exactOptional(),
      bars: bars2.exactOptional(),
    })
    .exactOptional(),
});
export const HintLadderSchema: z.ZodType<S.HintLadder> = z.tuple([
  HintSchema,
  HintSchema,
  HintSchema,
  z.union([HintSchema, z.literal("auto")]),
]);
const tutorPolicy: z.ZodType<S.TutorPolicy> = z.strictObject({
  enabled: z.boolean(),
  reviewOnSubmit: z.enum(["none", "offer", "auto"]).exactOptional(),
});
export const SrsLinkSchema: z.ZodType<S.SrsLink> = z
  .strictObject({
    family: familyId.exactOptional(),
    deck: deckId.exactOptional(),
    cards: z.array(factId).exactOptional(),
    mode: z.enum(["seed", "review-if-due", "evidence-only"]),
  })
  .refine(
    (l) => l.family !== undefined || l.deck !== undefined || l.cards !== undefined,
    "an SrsLink names a family, a deck or cards",
  );
const keyPool = z.enum(["C", "≤2acc", "≤4acc", "all"]);
export const ParamGenSchema: z.ZodType<S.ParamGen> = z.discriminatedUnion("gen", [
  z
    .strictObject({
      gen: z.literal("int"),
      min: z.number().int(),
      max: z.number().int(),
      step: z.number().int().positive().exactOptional(),
      awayFrom: z.strictObject({ value: z.number(), by: z.number().positive() }).exactOptional(),
    })
    .refine((g) => g.max >= g.min, "`max` must not be below `min`"),
  z.strictObject({ gen: z.literal("choice"), of: z.array(z.union([z.string(), z.number()])).min(1) }),
  z.strictObject({ gen: z.literal("key"), keys: keyPool, mode: scaleMode }),
  z.strictObject({ gen: z.literal("degree"), set: z.array(degree).min(1) }),
]);
const paramValues = z.record(z.string(), z.union([z.number(), z.string()]));

export const StimulusSchema: z.ZodType<S.Stimulus> = z.discriminatedUnion("src", [
  z.strictObject({
    src: z.literal("code"),
    code: z.string().min(1),
    bars: z.number().positive(),
    loop: z.boolean().exactOptional(),
    showCode: z.boolean(),
    showStaff: z.boolean().exactOptional(),
    showRoll: z.boolean().exactOptional(),
    showLeadSheet: z.boolean().exactOptional(),
  }),
  z.strictObject({
    src: z.literal("generator"),
    family: familyId,
    level: z.number().int().positive(),
    seed: z.number().int().exactOptional(),
  }),
  z.strictObject({
    src: z.literal("tune"),
    tuneId: songId,
    bars: bars2,
    layers: z.array(layer).exactOptional(),
  }),
  z.strictObject({
    src: z.literal("capstone-song"),
    bars: bars2,
    layers: z.array(layer).exactOptional(),
  }),
  z.strictObject({ src: z.literal("learner-audio") }),
]);
export const CueSchema: z.ZodType<S.Cue> = z.strictObject({
  context: z.enum(["cadence", "short-cadence", "tonic-chord", "drone", "none"]),
  countInBars: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  click: z.boolean(),
  replays: z.number().int().min(-1),
});
const choice: z.ZodType<S.Choice> = z.strictObject({
  id: z.string().min(1),
  label: md,
  audio: z.string().exactOptional(),
  thumb: z.enum(["roll", "staff"]).exactOptional(),
});
const dictationStage = z.enum(["tonic", "bass", "quality", "rn", "rhythm", "pitch"]);
export const AnswerSchema: z.ZodType<S.Answer> = z.strictObject({
  choice: z.array(z.string()).exactOptional(),
  text: z.array(z.string()).exactOptional(),
  number: z.number().exactOptional(),
  degrees: z.array(degree).exactOptional(),
  qualities: z.array(chordQuality).exactOptional(),
  rn: z.array(z.string()).exactOptional(),
  midi: z.array(z.number()).exactOptional(),
  stages: z.partialRecord(dictationStage, z.array(z.string())).exactOptional(),
  sections: z.array(z.string().min(1)).exactOptional(),
  bars: z.array(z.number().int().positive()).exactOptional(),
});
const partialMap: z.ZodType<S.PartialMap> = z.record(
  z.string(),
  z.record(z.string(), z.number().min(0).max(1)),
);

// --- constraints, matchers, rubric (mutually recursive) -----------------------------------------

/** A toolbox ID or (Wave 6, d6) a sound ID: what `must-use`, `must-not-use` and `uses` count. */
const toolRef = z.union([toolId, soundId]);
const toolOrTools = z.union([toolRef, z.array(toolRef).min(1)]);
const constraintBase = { id: z.string().exactOptional(), feedback: feedbackId.exactOptional() };
export const AstConstraintSchema: z.ZodType<S.AstConstraint> = z.discriminatedUnion("c", [
  z.strictObject({
    ...constraintBase,
    c: z.literal("must-use"),
    tool: toolOrTools,
    min: z.number().int().positive().exactOptional(),
  }),
  z.strictObject({
    ...constraintBase,
    c: z.literal("must-not-use"),
    tool: toolOrTools,
    why: md.exactOptional(),
  }),
  z.strictObject({
    ...constraintBase,
    c: z.literal("arg-matches"),
    fn: z.string().min(1),
    argIndex: z.number().int().nonnegative(),
    pattern: z.string(),
  }),
  z.strictObject({
    ...constraintBase,
    c: z.literal("labels"),
    min: z.number().int().exactOptional(),
    max: z.number().int().exactOptional(),
    names: z.array(z.string()).exactOptional(),
  }),
  z.strictObject({
    ...constraintBase,
    c: z.literal("no-note-names"),
    within: z.array(z.string()).exactOptional(),
  }),
  z.strictObject({ ...constraintBase, c: z.literal("no-randomness") }),
  z.strictObject({ ...constraintBase, c: z.literal("max-changed-tokens"), n: z.number().int().positive() }),
  z.strictObject({ ...constraintBase, c: z.literal("edit-only-regions") }),
  z.strictObject({
    ...constraintBase,
    c: z.literal("tempo"),
    bpm: num,
    tol: z.number().nonnegative().exactOptional(),
  }),
  z.strictObject({ ...constraintBase, c: z.literal("max-chars"), n: z.number().int().positive() }),
]);

export const ReferenceSchema: z.ZodType<S.Reference> = z.strictObject({
  solutions: z.array(z.string().min(1)).min(1),
  bars: z.number().positive(),
  tracks: z.array(trackRef).exactOptional(),
  roles: z.partialRecord(layer, trackRef).exactOptional(),
});

export const MatcherSchema: z.ZodType<S.Matcher> = z.lazy(() =>
  z.discriminatedUnion("m", [
    z.strictObject({
      m: z.literal("events"),
      pitch: pitchMode,
      rhythm: z.enum(["exact", "onsets", "onsets+durations", "ignore"]),
      durations: z.boolean(),
      sound: z.enum(["ignore", "s", "drum-role"]).exactOptional(),
      tracks: z.array(trackRef).exactOptional(),
    }),
    z.strictObject({
      m: z.literal("rhythm"),
      tol: RatSchema,
      durations: z.boolean(),
      perRole: z.boolean(),
      displacementCredit: z.number().min(0).max(1),
      tracks: z.array(trackRef).exactOptional(),
      roleWeight: z.enum(["onsets", "equal"]).exactOptional(),
    }),
    z.strictObject({
      m: z.literal("melody"),
      pitch: pitchMode,
      wPitch: z.number().nonnegative(),
      wRhythm: z.number().nonnegative(),
      rhythmTol: RatSchema,
      track: trackRef.exactOptional(),
    }),
    z.strictObject({
      m: z.literal("harmony"),
      level: z.enum(["bass", "root", "quality", "rn", "full"]),
      qualityDepth: z.enum(["triad", "seventh", "extended"]),
      inversion: z.boolean(),
      harmonicRhythm: z.enum(["given", "graded"]),
      weights: z
        .partialRecord(z.enum(["bass", "root", "quality", "inversion"]), z.number().nonnegative())
        .exactOptional(),
      wrongQuality: z.enum(["partial", "none"]).exactOptional(),
    }),
    z.strictObject({
      m: z.literal("pcset"),
      perOnset: z.boolean(),
      bass: z.boolean(),
      tracks: z.array(trackRef).exactOptional(),
    }),
    z.strictObject({ m: z.literal("rubric"), rules: z.array(RubricRuleSchema).min(1) }),
    z.strictObject({
      m: z.literal("controls"),
      controls: z
        .array(
          z.strictObject({
            control: z.string().min(1),
            scale: z.enum(["linear", "log", "exact"]),
            tol: z.number().nonnegative(),
          }),
        )
        .min(1),
      track: trackRef.exactOptional(),
    }),
    z.strictObject({
      m: z.literal("all"),
      of: z.array(MatcherSchema).min(1),
      weights: z.array(z.number().nonnegative()).exactOptional(),
    }),
  ]),
);

const sectionRef: z.ZodType<S.SectionRef> = z.union([
  z.strictObject({ section: z.string().min(1), nth: z.number().int().positive().exactOptional() }),
  z.strictObject({ bars: bars2 }),
  z.literal("last"),
]);
const ruleBase = {
  id: slug,
  label: md,
  required: z.boolean(),
  skills: z.array(skillRef),
  section: z.lazy(() => sectionRef).exactOptional(),
};
const ratio2 = z.tuple([z.number(), z.number()]);
export const RubricRuleSchema: z.ZodType<S.RubricRule> = z.lazy(() =>
  z.discriminatedUnion("rule", [
    z.strictObject({
      ...ruleBase,
      rule: z.literal("bars"),
      min: z.number().exactOptional(),
      max: z.number().exactOptional(),
    }),
    z.strictObject({ ...ruleBase, rule: z.literal("duration-sec"), min: z.number() }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("tempo-bpm"),
      min: z.number().exactOptional(),
      max: z.number().exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("tracks"),
      min: z.number().int(),
      roles: z.array(layer).exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("in-key"),
      key: z.union([KeySpecSchema, z.literal("declared")]),
      minRatio: z.number().min(0).max(1),
      tracks: z.array(trackRef).exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("ends-on-degree"),
      degrees: z.array(degree).min(1),
      track: trackRef,
      over: z.string().min(1).exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("cadence"),
      types: z.array(cadenceType).min(1),
      at: z.union([z.literal("last"), z.literal("phrase-ends"), z.strictObject({ bar: z.number().int() })]),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("chord-tones-strong"),
      minRatio: z.number().min(0).max(1),
      melody: trackRef,
      harmony: trackRef,
      strength: z.enum(["downbeat", "strong", "beat"]),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("progression"),
      schema: z.string().exactOptional(),
      rn: z.array(z.string()).exactOptional(),
      allowRotation: z.boolean().exactOptional(),
      track: trackRef.exactOptional(),
      bars: z.tuple([z.number().int().positive(), z.number().int().positive()]).exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("contains-rn"),
      rn: z.array(z.string().min(1)),
      min: z.number().int(),
      mustResolve: z.boolean().exactOptional(),
      kind: z.array(outsideChordKind).min(1).exactOptional(),
      inOrder: z.boolean().exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("range"),
      track: trackRef,
      maxSpan: z.number().exactOptional(),
      within: z.union([z.tuple([z.string(), z.string()]), z.literal("learner-voice")]).exactOptional(),
    }),
    z.strictObject({ ...ruleBase, rule: z.literal("step-ratio"), track: trackRef, min: z.number() }),
    z.strictObject({ ...ruleBase, rule: z.literal("harmonic-rhythm"), changesPerBar: ratio2 }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("groove-lock"),
      kick: trackRef,
      bass: trackRef,
      min: z.number(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("swing"),
      track: z.union([trackRef, z.array(trackRef).min(1)]),
      drums: z.array(drumRole).exactOptional(),
      subdivision: z.union([z.literal(8), z.literal(16)]),
      ratio: ratio2,
    }),
    z.strictObject({ ...ruleBase, rule: z.literal("syncopation"), track: trackRef, min: z.number() }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("form"),
      pattern: z.string().min(1),
      phraseBars: z.number().exactOptional(),
      contains: z.array(z.string().min(1)).min(1).exactOptional(),
      extra: z.array(z.string().min(1)).min(1).exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("voice-leading"),
      track: trackRef,
      maxMovePerVoice: z.number(),
      maxTotal: z.number().exactOptional(),
      voices: z.number().int().positive().exactOptional(),
      commonTones: z.boolean().exactOptional(),
      noCrossing: z.boolean().exactOptional(),
      bassFree: z.boolean().exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("guide-tones"),
      track: trackRef,
      harmony: trackRef,
      minRatio: z.number(),
      at: z.enum(["change", "strong", "all"]).exactOptional(),
      maxMoveSemis: z.number().positive().exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("modulation"),
      to: z.union([z.enum(["up-step", "up-half", "relative", "dominant"]), KeySpecSchema]),
      atBar: z.number().int().exactOptional(),
      via: z.enum(["pivot", "direct"]).exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("mode"),
      tonic: z.string(),
      mode: scaleMode,
      requireCharacteristic: z.boolean(),
      anyOf: z.array(scaleMode).min(2).exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("blues-form"),
      variant: z.enum(["standard", "quick-change", "jazz"]),
      choruses: z.number().int().positive().exactOptional(),
      quickChangeOk: z.boolean().exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("euclid"),
      track: trackRef,
      k: z.number().int(),
      n: z.number().int(),
      rotationFree: z.boolean(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("clave"),
      track: trackRef,
      type: z.enum(["son", "rumba"]),
      direction: z.enum(["3-2", "2-3"]),
    }),
    z.strictObject({ ...ruleBase, rule: z.literal("polyrhythm"), a: trackRef, b: trackRef, ratio: ratio2 }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("register-separation"),
      low: trackRef,
      high: trackRef,
      minGapSemis: z.number(),
    }),
    z.strictObject({ ...ruleBase, rule: z.literal("no-muddy-low"), track: trackRef }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("uses"),
      tool: toolOrTools,
      min: z.number().int().positive().exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("custom"),
      fn: z.string().min(1),
      params: z.record(z.string(), z.unknown()).exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("motif-reuse"),
      track: trackRef,
      minRatio: z.number().min(0).max(1),
      unitBars: z.number().positive().exactOptional(),
      shape: z.enum(["semitones", "steps", "either"]).exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("contrast"),
      a: sectionRef,
      b: sectionRef,
      axes: z.array(z.enum(["pitch", "density", "harmony", "register", "energy"])).min(1),
      minAxes: z.number().int().positive(),
      thresholds: z
        .strictObject({
          pitchSemis: z.number().exactOptional(),
          densityRatio: z.number().exactOptional(),
          registerSemis: z.number().exactOptional(),
          energyDelta: z.number().exactOptional(),
        })
        .exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("key-change"),
      at: sectionRef,
      semitones: z.array(z.number().int()).min(1),
      minBarsAfter: z.number().exactOptional(),
      sameMelody: z.boolean().exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("velocity-ghosts"),
      track: trackRef,
      min: z.number().int(),
      maxGain: z.number().exactOptional(),
      on: z.enum(["16th-offbeat", "any"]).exactOptional(),
      drum: drumRole.exactOptional(),
      accents: z.number().int().positive().exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("onsets"),
      track: trackRef,
      drum: drumRole.exactOptional(),
      contains: z.array(RatSchema).exactOptional(),
      equals: z.array(RatSchema).exactOptional(),
      perBar: z.boolean(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("degree-set"),
      track: trackRef,
      subsetOf: z.array(degree).exactOptional(),
      contains: z.array(degree).exactOptional(),
      anyOf: z.array(degree).min(1).exactOptional(),
      minCount: z.number().int().exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("sounds"),
      subsetOf: z.array(soundId).exactOptional(),
      contains: z.array(soundId).exactOptional(),
      anyOf: z.array(soundId).min(1).exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("distinct-pitches"),
      track: trackRef,
      min: z.number().int(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("device-count"),
      devices: z.array(z.enum(DEVICE_NAMES)).min(1),
      min: z.number().int(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("matches"),
      reference: ReferenceSchema,
      matcher: MatcherSchema,
      min: z.number().min(0).max(1),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("pickup"),
      track: trackRef,
      units: RatSchema.exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("chord-qualities"),
      track: trackRef.exactOptional(),
      contains: z.array(chordQuality).min(1).exactOptional(),
      anyOf: z.array(chordQuality).min(1).exactOptional(),
      subsetOf: z.array(chordQuality).min(1).exactOptional(),
      min: z.number().int().positive().exactOptional(),
      depth: z.enum(["triad", "seventh"]).exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("chord-inversions"),
      track: trackRef.exactOptional(),
      min: z.number().int().positive(),
      of: z
        .array(z.union([z.literal(1), z.literal(2)]))
        .min(1)
        .exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("non-chord-tones"),
      track: trackRef,
      harmony: trackRef.exactOptional(),
      roles: z.array(z.enum(NON_CHORD_TONE_ROLES)).min(1).exactOptional(),
      min: z.number().int().positive(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("bass-line"),
      track: trackRef,
      harmony: trackRef.exactOptional(),
      roots: z
        .strictObject({ on: z.enum(["change", "downbeat"]), minRatio: z.number().min(0).max(1) })
        .exactOptional(),
      members: z
        .strictObject({
          allowed: z.array(z.enum(BASS_MEMBERS)).min(1),
          minRatio: z.number().min(0).max(1),
          each: z.boolean().exactOptional(),
        })
        .exactOptional(),
      approach: z
        .strictObject({
          min: z.number().int().positive(),
          kinds: z
            .array(z.enum(["diatonic", "chromatic"]))
            .min(1)
            .exactOptional(),
        })
        .exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("notates"),
      view: z.enum(["lead-sheet", "staff"]),
      melody: trackRef.exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("reharmonize"),
      melody: trackRef,
      reference: ReferenceSchema,
      min: z.number().int().positive(),
      kinds: z.array(outsideChordKind).min(1).exactOptional(),
      harmony: trackRef.exactOptional(),
    }),
    z.strictObject({
      ...ruleBase,
      rule: z.literal("tuplets"),
      track: trackRef,
      min: z.number().int().positive(),
      division: z.number().int().min(2).max(7).exactOptional(),
    }),
  ]),
);

// --- answer UIs ---------------------------------------------------------------------------------

const keyboardUi = z.strictObject({
  ui: z.literal("keyboard"),
  range: z.tuple([z.string(), z.string()]),
  mode: z.enum(["single", "chord", "sequence"]),
});
const staffInputUi = z.strictObject({
  ui: z.literal("staff-input"),
  clef: z.enum(["treble", "bass", "grand"]),
  bars: z.number().int().positive(),
  palette: z.strictObject({
    durations: z.array(z.string()),
    accidentals: z.boolean(),
    ties: z.boolean(),
    rests: z.boolean(),
    chords: z.boolean().exactOptional(),
  }),
  key: KeySpecSchema.exactOptional(),
  mode: z.enum(["notes", "key-signature"]).exactOptional(),
});
export const AnswerUiSchema: z.ZodType<S.AnswerUi> = z.discriminatedUnion("ui", [
  z.strictObject({
    ui: z.literal("choice"),
    options: z.array(choice).min(2),
    multi: z.boolean().exactOptional(),
    layout: z.enum(["buttons", "cards", "audio-cards", "roll-thumbs", "staff-thumbs"]).exactOptional(),
  }),
  z.strictObject({
    ui: z.literal("degree-pad"),
    set: z.array(degree).min(1),
    sequenceLen: z.number().int().positive().exactOptional(),
    syllables: z.boolean(),
    rhythmTemplate: z.string().exactOptional(),
  }),
  z.strictObject({ ui: z.literal("quality-pad"), set: z.array(chordQuality).min(1) }),
  z.strictObject({
    ui: z.literal("rn-palette"),
    slots: z.number().int().positive(),
    allow: z.array(z.enum(["triads", "sevenths", "inversions", "secondary", "borrowed"])).min(1),
    labels: z.array(z.string().min(1)).exactOptional(),
    slotKeys: z.array(KeySpecSchema).exactOptional(),
  }),
  z.strictObject({
    ui: z.literal("text"),
    normalize: z.enum(["note", "chord", "rn", "interval", "key", "free"]),
  }),
  z.strictObject({ ui: z.literal("number") }),
  keyboardUi,
  staffInputUi,
  z.strictObject({
    ui: z.literal("grid"),
    rows: z.union([z.array(drumRole).min(1), z.tuple([z.literal("hit")])]),
    stepsPerBar: z.union([z.literal(6), z.literal(8), z.literal(12), z.literal(16), z.literal(24)]),
    bars: z.number().int().positive(),
  }),
  z.strictObject({
    ui: z.literal("slot-choice"),
    slots: z.number().int().positive(),
    options: z.array(choice).min(2),
    labels: z.array(z.string().min(1)).exactOptional(),
  }),
  z.strictObject({
    ui: z.literal("form"),
    sections: z.number().int().min(2),
    vocabulary: z.union([z.literal("letters"), z.array(z.enum(FORM_SECTION_NAMES)).min(2)]),
    input: z.enum(["label", "order", "map"]),
    sectionBars: z.array(z.number().int().positive()).min(2).exactOptional(),
    bars: z.number().int().positive().exactOptional(),
  }),
  z.strictObject({
    ui: z.literal("bar-grid"),
    bars: z.number().int().positive(),
    perRow: z.number().int().positive(),
    entry: z.enum(["rn", "symbol"]),
    qualities: z.array(chordQuality).min(1),
    given: z.array(z.number().int().positive()).exactOptional(),
  }),
  z.strictObject({
    ui: z.literal("scale-builder"),
    tonic: z.string().min(1),
    input: z.enum(["keyboard", "degrees"]),
    palette: z.array(degree).min(2).exactOptional(),
    range: z.tuple([z.string(), z.string()]).exactOptional(),
    from: scaleMode.exactOptional(),
  }),
  z.strictObject({
    ui: z.literal("code"),
    starter: z.string(),
    constraints: z.array(AstConstraintSchema).exactOptional(),
  }),
  z.strictObject({ ui: z.literal("tap") }),
  z.strictObject({ ui: z.literal("mic") }),
  z.strictObject({ ui: z.literal("bar-buttons"), bars: z.number().int().positive() }),
  z.strictObject({ ui: z.enum(["click-code", "click-staff", "click-roll"]), target: TargetSelectorSchema }),
]);

// --- tolerances, learner profile ----------------------------------------------------------------

const singTolCents = z.union([z.literal(70), z.literal(50), z.literal(35), z.literal(25)]);
export const TapToleranceSchema: z.ZodType<S.TapTolerance> = z.strictObject({
  windowMs: z.union([z.number().positive(), z.literal("auto")]),
  tempo: z.enum(["locked", "free"]),
  forgiveOffset: z.boolean(),
  passF1: z.number().min(0).max(1),
  passTiming: z.number().min(0).max(1),
});
export const SingToleranceSchema: z.ZodType<S.SingTolerance> = z.strictObject({
  cents: z.union([singTolCents, z.literal("learner")]),
  octave: z.enum(["per-note", "global", "exact"]),
  driftCompCents: z.number().nonnegative(),
  onsetMs: z.number().positive().exactOptional(),
  minCoverage: z.number().min(0).max(1),
  passHitRate: z.number().min(0).max(1),
  lenient: z.boolean().exactOptional(),
});
export const LearnerProfileSchema: z.ZodType<S.LearnerProfile> = z.strictObject({
  rangeLow: z.number(),
  rangeHigh: z.number(),
  comfLow: z.number(),
  comfHigh: z.number(),
  tapLatencyMs: z.number(),
  tapJitterMs: z.number().nonnegative(),
  singLatencyMs: z.number(),
  singTolCents,
  singTolMode: z.enum(["auto", "fixed"]),
  noiseFloorDb: z.number(),
  outputKind: z.enum(["wired", "bluetooth", "speakers", "unknown"]),
  inputKind: z.enum(["builtin", "external", "bluetooth", "none"]),
  quiet: z.boolean(),
});

// --- tests --------------------------------------------------------------------------------------

export const TestResponseSchema: z.ZodType<S.TestResponse> = z.union([
  z.strictObject({ code: z.string() }),
  z.strictObject({ blanks: z.record(z.string(), z.string()) }),
  z.strictObject({ order: z.array(z.string()) }),
  z.strictObject({ answer: AnswerSchema }),
  z.strictObject({ taps: z.array(z.number()) }),
  z.strictObject({ pitchFixture: z.string().min(1) }),
  z.strictObject({ staff: z.string() }),
  z.strictObject({ click: z.union([CodeRangeSchema, z.string()]) }),
]);
export const TestCaseSchema: z.ZodType<S.TestCase> = z.strictObject({
  name: z.string().min(1),
  response: TestResponseSchema,
  params: paramValues.exactOptional(),
  expect: z.enum(["pass", "fail", "error"]),
  score: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).exactOptional(),
  feedback: z.array(feedbackId).exactOptional(),
});

// --- exercises ----------------------------------------------------------------------------------

const exBase = {
  id: slug,
  version: z.number().int().positive(),
  title: z.string().exactOptional(),
  prompt: md,
  skills: z.array(SkillWeightSchema),
  role,
  key: KeySpecSchema.exactOptional(),
  keyPlan: keyPlan.exactOptional(),
  meter: meterId.exactOptional(),
  bpm: num.exactOptional(),
  swing: SwingSpecSchema.exactOptional(),
  pickup: PickupSpecSchema.exactOptional(),
  params: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/), ParamGenSchema).exactOptional(),
  pass: z.number().min(0).max(1).exactOptional(),
  hints: z.union([HintLadderSchema, z.null()]),
  feedbackText: z.record(feedbackId as z.ZodType<S.FeedbackKey>, md).exactOptional(),
  tutor: tutorPolicy.exactOptional(),
  srs: z.array(SrsLinkSchema).exactOptional(),
  canDo: z.array(canDoId).exactOptional(),
  fallback: z.enum(["identify", "skip"]).exactOptional(),
  tests: z.array(TestCaseSchema),
};
const codeSpec: z.ZodType<S.CodeSpec> = z.strictObject({
  starter: z.string(),
  toolbox: z.union([z.literal("learner"), z.array(toolId)]).exactOptional(),
  autoCheckOnRun: z.boolean().exactOptional(),
});
const blankSpec: z.ZodType<S.BlankSpec> = z.strictObject({
  id: z.string().min(1),
  input: z.enum(["text", "select"]),
  options: z.array(z.string()).exactOptional(),
  maxLen: z.number().int().positive().exactOptional(),
  hints: z.array(HintSchema).exactOptional(),
});
const parsonsBlock: z.ZodType<S.ParsonsBlock> = z.strictObject({
  id: z.string().min(1),
  text: z.string(),
  audition: z.string().exactOptional(),
});
const investigateQ: z.ZodType<S.InvestigateQ> = z.discriminatedUnion("q", [
  z.strictObject({
    q: z.literal("choice"),
    prompt: md,
    options: z.array(choice).min(2),
    correct: z.array(z.string()).min(1),
  }),
  z.strictObject({
    q: z.literal("number"),
    prompt: md,
    correct: z.number(),
    tol: z.number().nonnegative().exactOptional(),
  }),
  z.strictObject({
    q: z.enum(["click-code", "click-staff", "click-roll"]),
    prompt: md,
    target: TargetSelectorSchema,
  }),
]);
const staffExpect: z.ZodType<S.StaffExpect> = z.discriminatedUnion("e", [
  z.strictObject({
    e: z.literal("pitches"),
    spelled: z.array(z.string()).min(1),
    order: z.enum(["sequence", "set"]),
    withOctave: z.boolean(),
  }),
  z.strictObject({ e: z.literal("rhythm"), reference: ReferenceSchema }),
  z.strictObject({
    e: z.literal("key-signature"),
    key: KeySpecSchema,
    order: z.enum(["sequence", "set"]).exactOptional(),
  }),
  z.strictObject({ e: z.literal("events"), reference: ReferenceSchema, matcher: MatcherSchema }),
  z.strictObject({
    e: z.literal("chords"),
    symbols: z.array(z.string().min(1)).min(1),
    spelling: z.enum(["strict", "enharmonic"]),
    bass: z.boolean(),
  }),
]);
const singTarget: z.ZodType<S.SingTarget> = z.discriminatedUnion("from", [
  z.strictObject({ from: z.literal("stimulus"), track: trackRef.exactOptional() }),
  z.strictObject({
    from: z.literal("degrees"),
    degrees: z.array(degree).min(1),
    rhythm: z.string().exactOptional(),
    octaves: z.array(z.number().int().min(-2).max(2)).exactOptional(),
  }),
  z.strictObject({ from: z.literal("reference"), reference: ReferenceSchema, track: trackRef }),
]);
const ladderLevel = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]);
const checklist = z.array(z.strictObject({ id: z.string().min(1), label: md }));
const transcribeGiven: z.ZodType<S.TranscribeGiven> = z.strictObject({
  meter: z.boolean().exactOptional(),
  key: z.boolean().exactOptional(),
  tonic: z.boolean().exactOptional(),
  pickup: z.boolean().exactOptional(),
  rhythmSkeleton: z.string().min(1).exactOptional(),
});
const transcribeStage: z.ZodType<S.TranscribeStage> = z.strictObject({
  stage: z.enum(["bass", "quality", "rn"]),
  matcher: MatcherSchema,
  pass: z.number().min(0).max(1),
});

const predictEx = z.strictObject({
  ...exBase,
  kind: z.literal("predict"),
  code: z.string().min(1),
  bars: z.number().positive(),
  mode: z.enum(["hum", "choose", "count"]),
  choices: z.array(choice).exactOptional(),
  correct: z.union([z.array(z.string()), z.number()]).exactOptional(),
  humTrack: trackRef.exactOptional(),
});
const runInvestigateEx = z.strictObject({
  ...exBase,
  kind: z.literal("run-investigate"),
  code: codeSpec,
  mustPlayLoops: z.number().int().nonnegative(),
  questions: z.array(investigateQ),
});
const codeModifyEx = z.strictObject({
  ...exBase,
  kind: z.literal("code-modify"),
  code: codeSpec,
  reference: ReferenceSchema,
  matcher: MatcherSchema,
  constraints: z.array(AstConstraintSchema).exactOptional(),
  target: z.strictObject({
    audible: z.boolean(),
    showRoll: z.boolean().exactOptional(),
    revealRollAfter: z.number().int().positive().exactOptional(),
  }),
});
const codeFillEx = z.strictObject({
  ...exBase,
  kind: z.literal("code-fill"),
  code: codeSpec,
  blanks: z.array(blankSpec).min(1),
  reference: ReferenceSchema,
  matcher: MatcherSchema,
});
const parsonsEx = z.strictObject({
  ...exBase,
  kind: z.literal("parsons"),
  blocks: z.array(parsonsBlock).min(2),
  distractors: z.array(parsonsBlock).exactOptional(),
  assemble: z.enum(["lines", "chord-seq", "bar-seq"]),
  accept: z
    .strictObject({
      orders: z.array(z.array(z.string())).exactOptional(),
      reference: ReferenceSchema.exactOptional(),
      matcher: MatcherSchema.exactOptional(),
      rubric: z.array(RubricRuleSchema).exactOptional(),
    })
    .refine(
      (a) => a.orders !== undefined || a.reference !== undefined || a.rubric !== undefined,
      "accept needs orders, a reference or a rubric",
    ),
});
const errorHuntEx = z.strictObject({
  ...exBase,
  kind: z.literal("error-hunt"),
  code: codeSpec,
  reference: ReferenceSchema,
  matcher: MatcherSchema,
  locateVia: z.enum(["code", "staff", "roll", "bars"]),
  bugs: z.array(CodeRangeSchema).exactOptional(),
});
const codeMakeEx = z.strictObject({
  ...exBase,
  kind: z.literal("code-make"),
  code: codeSpec,
  bars: bars2,
  rubric: z.array(RubricRuleSchema).min(1),
  saveAs: z.literal("sketch"),
  fromSketch: lessonId.exactOptional(),
});
const identifyEx = z.strictObject({
  ...exBase,
  kind: z.literal("identify"),
  stimulus: StimulusSchema,
  cue: CueSchema,
  answer: AnswerUiSchema,
  correct: AnswerSchema,
  partial: partialMap.exactOptional(),
});
const factEx = z.strictObject({
  ...exBase,
  kind: z.literal("fact"),
  stimulus: StimulusSchema.exactOptional(),
  answer: AnswerUiSchema,
  correct: AnswerSchema,
  spelling: z.enum(["strict", "enharmonic"]),
  order: z.enum(["sequence", "set"]),
});
const keyboardEx = z.strictObject({
  ...exBase,
  kind: z.literal("keyboard"),
  answer: keyboardUi,
  expect: z.strictObject({
    midi: z.array(z.number()).exactOptional(),
    pcs: z.array(z.number().int().min(0).max(11)).exactOptional(),
    bassPc: z.number().int().min(0).max(11).exactOptional(),
    sequence: z.array(z.number()).exactOptional(),
  }),
  pitchMode,
});
const staffReadEx = z.strictObject({
  ...exBase,
  kind: z.literal("staff-read"),
  source: z.string().min(1),
  bars: z.number().positive(),
  answer: AnswerUiSchema,
  correct: AnswerSchema.exactOptional(),
  reference: ReferenceSchema.exactOptional(),
  matcher: MatcherSchema.exactOptional(),
});
const staffWriteEx = z.strictObject({
  ...exBase,
  kind: z.literal("staff-write"),
  answer: staffInputUi,
  expect: staffExpect,
});
const tapEx = z.strictObject({
  ...exBase,
  kind: z.literal("tap"),
  mode: z.enum(["along", "echo", "read"]),
  stimulus: StimulusSchema,
  cue: CueSchema,
  bars: z.number().positive(),
  target: z.union([
    z.literal("beat"),
    z.strictObject({ track: trackRef.exactOptional(), drum: z.array(drumRole).exactOptional() }),
  ]),
  tol: TapToleranceSchema,
});
const singEx = z.strictObject({
  ...exBase,
  kind: z.literal("sing"),
  mode: z.enum(["pitch", "degree", "resolution", "echo", "sight", "bassline", "guide-tones"]),
  stimulus: StimulusSchema,
  cue: CueSchema,
  target: singTarget,
  tol: SingToleranceSchema,
  showTrace: z.enum(["live", "after", "never"]),
  labels: z.enum(["numbers", "syllables"]).exactOptional(),
});
const dictationEx = z.strictObject({
  ...exBase,
  kind: z.literal("dictation"),
  domain: z.enum(["rhythm", "melody", "bass", "harmony"]),
  stimulus: StimulusSchema,
  cue: CueSchema,
  answer: AnswerUiSchema,
  stages: z.array(dictationStage).exactOptional(),
  stageWeights: z.array(z.number().nonnegative()).exactOptional(),
  reference: ReferenceSchema,
  matcher: MatcherSchema,
  given: z
    .strictObject({
      rhythm: z.boolean().exactOptional(),
      firstNote: z.boolean().exactOptional(),
      harmonicRhythm: z.boolean().exactOptional(),
    })
    .exactOptional(),
  byEar: z
    .strictObject({
      ab: z.boolean(),
      rates: z.array(z.number().min(0.25).max(1)).min(1),
      accepts: z.enum(["exact", "any-octave", "any-key"]),
      parts: z
        .array(
          z.strictObject({
            track: trackRef,
            label: md,
            matcher: MatcherSchema,
            pass: z.number().min(0).max(1).exactOptional(),
          }),
        )
        .min(1)
        .exactOptional(),
    })
    .exactOptional(),
  stageAnswers: z.partialRecord(dictationStage, AnswerUiSchema).exactOptional(),
  stageFlow: z.enum(["sequential", "together"]).exactOptional(),
  stagePass: z.number().min(0).max(1).exactOptional(),
});
const transcribeStepEx = z.strictObject({
  ...exBase,
  kind: z.literal("transcribe-step"),
  projectId: z.string().min(1),
  ladder: ladderLevel,
  stimulus: StimulusSchema,
  layer: z.union([layer, z.literal("form")]),
  bars: bars2,
  grading: z.discriminatedUnion("mode", [
    z.strictObject({
      mode: z.literal("auto"),
      reference: ReferenceSchema,
      matcher: MatcherSchema,
      stages: z.array(transcribeStage).min(1).exactOptional(),
    }),
    z.strictObject({ mode: z.literal("self"), checklist }),
  ]),
  studio: z.strictObject({
    minRate: z.number().min(0.25).max(1),
    transposeSemis: z.boolean().exactOptional(),
    overlay: z.boolean(),
  }),
  given: transcribeGiven.exactOptional(),
});
const composeBriefEx = z.strictObject({
  ...exBase,
  kind: z.literal("compose-brief"),
  brief: md,
  flavours: z.array(flavourId).exactOptional(),
  code: codeSpec,
  rubric: z.array(RubricRuleSchema).min(1),
  minDurationSec: z.number().positive().exactOptional(),
  album: z.strictObject({ slot: z.string().min(1) }).exactOptional(),
  review: z.strictObject({ tutor: z.enum(["auto", "offer"]) }),
});
const listenEx = z
  .strictObject({
    ...exBase,
    kind: z.literal("listen"),
    items: z.array(z.strictObject({ code: z.string().min(1), caption: md, bars: z.number().positive() })),
    passive: z
      .strictObject({
        family: familyId,
        level: z.number().int().positive(),
        items: z.number().int().min(2).max(40),
        reveal: z.enum(["with", "after"]),
        gapBeats: z.number().nonnegative(),
      })
      .exactOptional(),
  })
  .refine((x) => x.items.length > 0 || x.passive !== undefined, {
    message: "a listen exercise has at least one item, or a passive block",
    path: ["items"],
  });

const nonAllMembers = [
  predictEx,
  runInvestigateEx,
  codeModifyEx,
  codeFillEx,
  parsonsEx,
  errorHuntEx,
  codeMakeEx,
  identifyEx,
  factEx,
  keyboardEx,
  staffReadEx,
  staffWriteEx,
  tapEx,
  singEx,
  dictationEx,
  transcribeStepEx,
  composeBriefEx,
  listenEx,
] as const;
const nonAllExercise = z.discriminatedUnion("kind", nonAllMembers);
const allEx = z.strictObject({
  ...exBase,
  kind: z.literal("all"),
  parts: z.array(nonAllExercise).min(2),
  weights: z.array(z.number().nonnegative()).exactOptional(),
});

export const ExerciseSchema: z.ZodType<S.Exercise> = z.discriminatedUnion("kind", [...nonAllMembers, allEx]);
export const CodeMakeExSchema: z.ZodType<S.CodeMakeEx> = codeMakeEx;
export const ComposeBriefExSchema: z.ZodType<S.ComposeBriefEx> = composeBriefEx;
export const TranscribeStepExSchema: z.ZodType<S.TranscribeStepEx> = transcribeStepEx;

// --- results ------------------------------------------------------------------------------------

export const NEventSchema: z.ZodType<S.NEvent> = z.strictObject({
  id: z.string(),
  track: z.string(),
  onset: RatSchema,
  dur: RatSchema,
  clipDur: RatSchema.exactOptional(),
  midi: z.number().nullable(),
  cents: z.number().exactOptional(),
  pitchSource: z.enum(["note-str", "note-num", "freq", "n-scale", "voicing", "n-index", "none"]),
  written: z.string().exactOptional(),
  chordSymbol: z.string().exactOptional(),
  drum: drumRole.exactOptional(),
  s: z.string().exactOptional(),
  bank: z.string().exactOptional(),
  sampleN: z.number().exactOptional(),
  gain: z.number(),
  scaleCtx: z.string().exactOptional(),
  locs: z.array(CodeRangeSchema),
  controls: z.record(z.string(), z.union([z.number(), z.string()])).exactOptional(),
});
const dimension = z.enum(DIMENSIONS);
export const LocSchema: z.ZodType<S.Loc> = z.strictObject({
  code: z.array(CodeRangeSchema).exactOptional(),
  bar: z.number().exactOptional(),
  beat: z.number().exactOptional(),
  beatLabel: z.string().exactOptional(),
  track: z.string().exactOptional(),
  noteIds: z.array(z.string()).exactOptional(),
  slot: z.number().exactOptional(),
  tSec: z.number().exactOptional(),
  blank: z.string().exactOptional(),
  rule: z.string().exactOptional(),
  trial: z.number().exactOptional(),
});
export const DiagnosticSchema: z.ZodType<S.Diagnostic> = z.strictObject({
  id: feedbackId,
  severity,
  dim: dimension.exactOptional(),
  where: LocSchema.exactOptional(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});
const dimScore = z.strictObject({ score: z.number(), weight: z.number(), n: z.number().exactOptional() });
const hintRung = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export const AnalysisSummarySchema: z.ZodType<S.AnalysisSummary> = z.strictObject({
  key: z.array(z.strictObject({ key: KeySpecSchema, r: z.number() })),
  bpm: z.number(),
  bars: z.number(),
  durationSec: z.number(),
  roles: z.partialRecord(layer, z.string()),
  slots: z.array(z.strictObject({ bar: z.number(), beat: z.number(), symbol: z.string(), rn: z.string() })),
  schemas: z.array(z.strictObject({ schema: z.string(), bars: bars2 })),
  cadences: z.array(z.strictObject({ bar: z.number(), type: cadenceType })),
  form: z.string(),
  energy: z.array(z.number()),
  devices: z.array(z.string()),
  deviceList: z
    .array(
      z.strictObject({
        device: z.string(),
        bar: z.number().int(),
        bars: z.number().int().exactOptional(),
        text: z.string(),
      }),
    )
    .exactOptional(),
  keyContexts: z
    .array(
      z.strictObject({
        track: z.string(),
        band: z.boolean(),
        spans: z.array(
          z.strictObject({
            fromBar: z.number().int(),
            toBar: z.number().int(),
            key: KeySpecSchema,
            source: z.enum(["declared", "scale", "estimate"]),
          }),
        ),
      }),
    )
    .exactOptional(),
});
export const GradeResultSchema: z.ZodType<S.GradeResult> = z.strictObject({
  exerciseId: z.string(),
  exerciseVersion: z.number().int(),
  attemptNo: z.number().int(),
  firstAttempt: z.boolean(),
  mode: z.enum(["lesson", "capstone", "tutor"]),
  status: z.enum(["pass", "fail", "error", "ungraded"]),
  score: z.number().min(0).max(1),
  adjustedScore: z.number().min(0).max(1),
  dims: z.partialRecord(dimension, dimScore),
  constraints: z.array(
    z.strictObject({ id: z.string(), ok: z.boolean(), diag: DiagnosticSchema.exactOptional() }),
  ),
  rubric: z
    .array(
      z.strictObject({
        ruleId: z.string(),
        required: z.boolean(),
        ok: z.boolean(),
        value: z.number().exactOptional(),
        target: z.number().exactOptional(),
        diag: DiagnosticSchema.exactOptional(),
      }),
    )
    .exactOptional(),
  diagnostics: z.array(DiagnosticSchema),
  messages: z.array(z.strictObject({ id: feedbackId, text: z.string(), where: LocSchema.exactOptional() })),
  assist: z.strictObject({
    rung: hintRung,
    tutorHints: z.number().int(),
    extraReplays: z.number().int(),
    revealed: z.boolean(),
  }),
  params: paramValues.exactOptional(),
  modality: z.enum(["normal", "fallback"]).exactOptional(),
  disputed: z.boolean().exactOptional(),
  eval: z
    .strictObject({
      ms: z.number(),
      cps: z.number(),
      bpm: z.number(),
      bars: z.number(),
      tracks: z.array(z.string()),
      logs: z.array(z.strictObject({ level: z.enum(["error", "warn", "log"]), text: z.string() })),
      truncated: z.boolean(),
    })
    .exactOptional(),
  analysis: AnalysisSummarySchema.exactOptional(),
  overlay: z
    .strictObject({
      answer: z.array(z.strictObject({ id: z.string(), ok: z.boolean() })),
      missing: z.array(NEventSchema),
    })
    .exactOptional(),
});

// --- lessons ------------------------------------------------------------------------------------

const bandRef: z.ZodType<S.BandRef> = z.strictObject({
  band: bandId,
  followsLearnerKey: z.boolean().exactOptional(),
  tracks: z.array(z.enum(["drums", "bass", "chords"])).exactOptional(),
});
export const StepUiSchema: z.ZodType<S.StepUi> = z.strictObject({
  panels: z.strictObject({
    roll: z.boolean(),
    staff: z.union([z.literal(false), z.enum(["treble", "bass", "grand", "perc", "lead"])]),
    keyboard: z.boolean(),
  }),
  rollLabels: z.enum(["none", "note", "degree", "degree+solfege"]).exactOptional(),
  staffLabels: z.enum(["none", "note", "degree", "degree+solfege"]).exactOptional(),
  loopBars: z.number().positive().exactOptional(),
  band: z.union([bandRef, z.literal(false)]).exactOptional(),
  initialPanels: z.array(z.enum(WORKBENCH_PANELS)).min(1).exactOptional(),
  leadSheet: z
    .strictObject({
      melody: trackRef.exactOptional(),
      chords: z.union([
        trackRef,
        z.strictObject({
          chart: z
            .array(
              z.strictObject({
                bar: z.number().int().min(0),
                beat: z.number().positive(),
                symbol: z.string().min(1),
              }),
            )
            .min(1),
        }),
      ]),
      title: z.string().min(1).exactOptional(),
      degrees: z.boolean().exactOptional(),
    })
    .exactOptional(),
  probe: z.strictObject({ kind: z.enum(PROBE_KINDS), track: trackRef.exactOptional() }).exactOptional(),
});
const termDef: z.ZodType<S.TermDef> = z.strictObject({
  id: termId,
  step: stepLocalId,
  card: z.strictObject({ testedIn: lessonId }).exactOptional(),
});
export const StepDefSchema: z.ZodType<S.StepDef> = z.strictObject({
  id: stepLocalId,
  kind: z.enum(STEP_KINDS),
  title: z.string().min(1),
  minutes: z.number().positive().multipleOf(0.25),
  ui: StepUiSchema,
  exercise: ExerciseSchema.exactOptional(),
  example: z
    .strictObject({
      id: slug,
      code: z.string().min(1),
      bars: z.number().positive(),
      preview: z.boolean().exactOptional(),
    })
    .exactOptional(),
  graded: z.boolean().exactOptional(),
  optional: z.boolean().exactOptional(),
  testOut: z.strictObject({ skips: z.array(stepLocalId).min(1) }).exactOptional(),
  gateCheck: z.literal(true).exactOptional(),
});
const flavourOverrides = z.partialRecord(
  flavourId,
  z.strictObject({ band: bandId.exactOptional(), sounds: z.record(z.string(), soundId).exactOptional() }),
);
export const LessonDefSchema: z.ZodType<S.LessonDef> = z.strictObject({
  id: lessonId,
  version: z.number().int().positive(),
  title: z.string().min(1),
  objective: z.string().min(1),
  key: KeySpecSchema,
  meter: meterId,
  bpm: z.number().positive(),
  swing: SwingSpecSchema.exactOptional(),
  pickup: PickupSpecSchema.exactOptional(),
  introduces: z.array(skillId),
  practises: z.array(skillId),
  terms: z.array(termDef),
  canDo: z.array(canDoId),
  flavours: flavourOverrides.exactOptional(),
  steps: z.array(StepDefSchema).min(1),
  wrapAt: stepLocalId,
});

const lessonMeta: z.ZodType<S.LessonMeta> = z.strictObject({
  id: lessonId,
  title: z.string().min(1),
  objective: z.string().min(1),
  introduces: z.array(skillId),
  practises: z.array(skillId),
  optional: z.boolean().exactOptional(),
  side: z.boolean().exactOptional(),
  splitFrom: lessonId.exactOptional(),
});
export const UnitDefSchema: z.ZodType<S.UnitDef> = z.strictObject({
  id: unitId,
  title: z.string().min(1),
  track: z.union([z.literal("core"), trackId]),
  lessons: z.array(lessonMeta).min(1),
  checkpoint: checkpointId.exactOptional(),
  meter: meterId.exactOptional(),
});
export const GateSpecSchema: z.ZodType<S.GateSpec> = z.strictObject({
  checkpoints: z.array(checkpointId).exactOptional(),
  lessonsCompleted: z.array(lessonId).exactOptional(),
  capstones: z.array(capstoneId).exactOptional(),
  familyLevels: z
    .array(z.strictObject({ family: familyId, level: z.number().int().positive() }))
    .exactOptional(),
});
const checkpointMeta = {
  id: checkpointId,
  title: z.string().min(1),
  covers: z.array(unitId).min(1),
  gated: z.array(skillId),
  levelSetting: z.array(skillId),
};
export const CheckpointDefSchema: z.ZodType<S.CheckpointDef> = z.strictObject({
  ...checkpointMeta,
  version: z.number().int().positive(),
  authored: z.array(ExerciseSchema),
  recipe: z.strictObject({
    items: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    perSkillMin: z.number().int().positive(),
    families: z.record(skillId as z.ZodType<S.SkillKey>, z.array(familyId)),
  }),
  make: codeMakeEx,
});
const phraseCheck: z.ZodType<S.PhraseCheck> = z.strictObject({
  id: slug,
  phrase: z.union([
    z.number().int().positive(),
    z.tuple([z.number().int().positive(), z.number().int().positive()]),
  ]),
  layer: z.enum(["melody", "bass", "chords"]),
  matcher: MatcherSchema,
  pass: z.number().min(0).max(1),
  stages: z
    .array(z.enum(["bass", "quality", "rn"]))
    .min(1)
    .exactOptional(),
  given: transcribeGiven.exactOptional(),
  after: z.array(slug).min(1).exactOptional(),
});
const formMapCheck: z.ZodType<S.FormMapCheck> = z.strictObject({
  id: slug,
  vocabulary: z.union([z.literal("letters"), z.array(z.enum(FORM_SECTION_NAMES)).min(2)]),
  boundaries: z.enum(["asked", "given"]),
  pass: z.number().min(0).max(1),
  given: transcribeGiven.exactOptional(),
});
const capstoneMeta = {
  id: capstoneId,
  title: z.string().min(1),
  objective: z.string().min(1),
  sessions: z.number().int().positive(),
  opensAfter: GateSpecSchema,
  inGymSlots: z.boolean().exactOptional(),
  kind: z.enum(["compose", "transcribe"]),
};
export const CapstoneDefSchema: z.ZodType<S.CapstoneDef> = z.strictObject({
  ...capstoneMeta,
  version: z.number().int().positive(),
  key: KeySpecSchema.exactOptional(),
  meter: meterId,
  bpm: z.tuple([z.number().positive(), z.number().positive()]).exactOptional(),
  swing: SwingSpecSchema.exactOptional(),
  brief: composeBriefEx.exactOptional(),
  song: z.array(songId).exactOptional(),
  sessionDefs: z
    .array(
      z.strictObject({
        id: capstoneSessionId,
        title: z.string().min(1),
        goal: md,
        focusRules: z.array(z.string()).exactOptional(),
        stages: z.array(transcribeStepEx).exactOptional(),
        checks: z.array(phraseCheck).min(1).exactOptional(),
        starter: z.string().min(1).exactOptional(),
        review: z.boolean().exactOptional(),
        release: z.boolean().exactOptional(),
        formMap: formMapCheck.exactOptional(),
        rubric: z.array(RubricRuleSchema).min(1).exactOptional(),
      }),
    )
    .min(1),
  reviewRevisions: z.union([z.literal(1), z.literal(2)]),
  canDo: z.array(canDoId),
  flavours: flavourOverrides.exactOptional(),
});

// --- registries ---------------------------------------------------------------------------------

const sessionOrSessions = z.union([SessionIdSchema, z.array(SessionIdSchema).min(1)]);
export const ToolEntrySchema: z.ZodType<S.ToolEntry> = z.strictObject({
  id: unlockableId,
  kind: z.enum(TOOL_KINDS),
  group: z.string().exactOptional(),
  code: z.string().min(1),
  unlock: z.strictObject({
    at: sessionOrSessions,
    when: z.enum(["complete", "start"]),
    condition: z
      .strictObject({
        exercise: exerciseId,
        minScore: z.number().min(0).max(1),
        unrevealed: z.literal(true),
        variants: z.array(exerciseId).min(1).exactOptional(),
      })
      .exactOptional(),
    fallbackAt: SessionIdSchema.exactOptional(),
  }),
  concept: z.string().min(1),
  preview: z.array(z.string()).exactOptional(),
  audible: z.boolean().exactOptional(),
  audibility: z
    .strictObject({ base: z.string().min(1), value: z.union([z.string(), z.number()]) })
    .exactOptional(),
  catalog: z.strictObject({
    signature: z.string().min(1),
    meaning: md,
    demo: z.string(),
    strudelCc: z.string().exactOptional(),
  }),
  matches: z.array(z.string()).exactOptional(),
});
export const SkillDefSchema: z.ZodType<S.SkillDef> = z.strictObject({
  id: skillId,
  name: z.string().min(1),
  region: z.enum(SKILL_REGIONS),
  category: z.string().min(1),
  kind: z.enum(SKILL_KINDS),
  prerequisites: z.array(skillId),
  introducedBy: lessonId,
  checkpoint: checkpointId.exactOptional(),
  categories: z.array(z.string().regex(/^[a-z0-9.-]+$/)).exactOptional(),
  retired: z.strictObject({ supersededBy: z.array(skillId) }).exactOptional(),
});
const levelParams: z.ZodType<S.LevelParams> = z.looseObject({
  categories: z.array(z.string()).min(1),
  replays: z.number().int().min(-1),
  instruments: z.union([z.array(soundId).min(1), z.literal("drums")]),
  keys: keyPool,
  tempo: z.tuple([z.number().positive(), z.number().positive()]),
  context: z.enum(["cadence", "short-cadence", "tonic-chord", "drone", "none"]).exactOptional(),
});
const answerUiKind = z.enum([
  "choice",
  "degree-pad",
  "quality-pad",
  "rn-palette",
  "text",
  "number",
  "keyboard",
  "staff-input",
  "grid",
  "code",
  "tap",
  "mic",
  "bar-buttons",
  "click-code",
  "click-staff",
  "click-roll",
  "slot-choice",
  "form",
  "bar-grid",
  "scale-builder",
]);
const familyKind = z.enum(FAMILY_KINDS);
export const FamilyDefSchema: z.ZodType<S.FamilyDef> = z.strictObject({
  id: familyId,
  title: z.string().min(1),
  kind: familyKind,
  alsoKind: familyKind.exactOptional(),
  domain: z.enum(FAMILY_DOMAINS),
  skills: z.array(SkillWeightSchema).min(1),
  unlock: z.strictObject({
    lesson: lessonId,
    levelGates: z
      .record(
        z.string().regex(/^[1-9]\d*$/, "level numbers are positive integers"),
        z.union([lessonId, z.array(lessonId).min(1)]),
      )
      .exactOptional(),
  }),
  categories: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        unlockAt: lessonId,
        skill: skillRef.exactOptional(),
        contrastOf: z.array(z.string()).exactOptional(),
      }),
    )
    .min(1),
  levels: z.array(levelParams).min(1),
  masteryLevel: z.number().int().positive(),
  trialsPerSet: z.number().int().min(4).max(10),
  fastRtMs: z.number().positive(),
  estTrialSec: z.number().positive(),
  retention: z.union([z.literal(0.85), z.literal(0.9)]),
  mix: z.enum(["pitch", "harmony", "rhythm"]).nullable(),
  confusionTips: z.record(z.string(), md).exactOptional(),
  answer: answerUiKind,
  mic: z.boolean().exactOptional(),
  generator: z.string().min(1),
});
export const FactDeckSchema: z.ZodType<S.FactDeck> = z.strictObject({
  id: deckId,
  title: z.string().min(1),
  unlock: z.strictObject({ skill: skillId, lesson: lessonId }),
  cards: z
    .array(
      z.strictObject({
        id: factId,
        gate: lessonId.exactOptional(),
        prompt: z.strictObject({
          text: md.exactOptional(),
          stimulus: StimulusSchema.exactOptional(),
          staff: z
            .strictObject({
              clef: z.enum(["treble", "bass"]),
              notes: z.array(z.string()).min(1),
              key: KeySpecSchema.exactOptional(),
            })
            .exactOptional(),
        }),
        answer: AnswerSchema,
        accept: z.array(AnswerSchema).min(1).exactOptional(),
      }),
    )
    .min(1),
  newPerDay: z.number().int().positive(),
  fastRtMs: z.number().positive(),
  answer: answerUiKind,
});
export const TermEntrySchema: z.ZodType<S.TermEntry> = z.strictObject({
  id: termId,
  term: z.string().min(1),
  definition: md,
  example: z.string().min(1),
  introducedBy: lessonId,
  pairedWith: termId.exactOptional(),
});
export const CanDoDefSchema: z.ZodType<S.CanDoDef> = z.strictObject({
  id: canDoId,
  area: z.enum(CANDO_AREAS),
  statement: z.string().min(1),
  skills: z.array(skillId),
  source: z.union([lessonId, capstoneId, checkpointId]),
});
const milestoneCondition = {
  sessions: z.array(SessionIdSchema).min(1).exactOptional(),
  capstones: z.array(capstoneId).min(1).exactOptional(),
  canDos: z.array(canDoId).min(1).exactOptional(),
  ladder: z.strictObject({ level: ladderLevel, after: SessionIdSchema.exactOptional() }).exactOptional(),
};
export const MilestoneDefSchema: z.ZodType<S.MilestoneDef> = z.strictObject({
  id: idSchema("milestone"),
  title: z.string().min(1),
  description: md,
  when: z
    .strictObject({
      ...milestoneCondition,
      anyOf: z.array(z.strictObject(milestoneCondition)).min(2).exactOptional(),
    })
    .refine((w) => Object.keys(w).length > 0, "a milestone needs at least one condition"),
});
export const SongDefSchema: z.ZodType<S.SongDef> = z.strictObject({
  id: songId,
  title: z.string().min(1),
  year: z.union([
    z.number().int().max(1930, "Oak ships nothing first published after 1930"),
    z.literal("trad"),
  ]),
  status: z.enum(["US-PD", "trad"]),
  provenance: z.strictObject({
    source: z.string().min(1),
    year: z.number().int().max(1930, "the cited source must be published in 1930 or earlier"),
    pages: z.string().exactOptional(),
  }),
  verifiedBy: z.string().min(1),
  key: KeySpecSchema,
  meter: meterId,
  bpm: z.number().positive(),
  pickup: PickupSpecSchema.exactOptional(),
  swing: SwingSpecSchema.exactOptional(),
  form: z.string().min(1),
  answerKey: z.strictObject({
    bars: z.number().int().positive(),
    code: z.string().min(1),
    layers: z.partialRecord(z.enum(["drums", "bass", "chords", "melody"]), z.string().min(1)),
    chords: z
      .array(z.strictObject({ bar: z.number().int(), beat: z.number(), symbol: z.string().min(1) }))
      .exactOptional(),
    phrases: z.array(bars2).exactOptional(),
    sections: z
      .array(
        z.strictObject({
          label: z.string().min(1),
          bars: z.tuple([z.number().int().positive(), z.number().int().positive()]),
        }),
      )
      .min(1)
      .exactOptional(),
  }),
  keyPlan: keyPlan.exactOptional(),
  availableFrom: lessonId.exactOptional(),
  schema: idSchema("schema").exactOptional(),
});
const BAND_LABEL = /^(?:_?)(drums|bass|chords):/m;
export const BandDefSchema: z.ZodType<S.BandDef> = z
  .strictObject({
    id: bandId,
    title: z.string().min(1),
    bars: z.number().int().positive(),
    roles: z.array(z.enum(["drums", "bass", "chords"])).min(1),
    code: z.record(flavourId, z.string().min(1)),
    params: z.strictObject({ key: z.boolean(), bpm: z.boolean() }),
  })
  .refine(
    (b) => Object.values(b.code).every((code) => BAND_LABEL.test(code)),
    "Band code uses labelled tracks drums: bass: chords: only",
  );
export const FlavourKitSchema: z.ZodType<S.FlavourKit> = z.strictObject({
  id: flavourId,
  title: z.string().min(1),
  drums: soundId,
  bass: soundId,
  chords: soundId,
  lead: soundId,
  chordDepth: z.enum(["triad", "seventh"]),
  swing: SwingSpecSchema.exactOptional(),
  production: z.strictObject({
    room: z.number().min(0).max(1),
    bassLpf: z.number().positive(),
    humanizeVelocity: z.number().min(0).max(0.5),
    pan: z.partialRecord(z.enum(["drums", "bass", "chords", "lead"]), z.number().min(0).max(1)),
  }),
});

export { FEEDBACK_AREAS };
