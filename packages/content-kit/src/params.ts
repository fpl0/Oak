// Step params with seeded generators (contracts §5.5) and the starter-code markers (exercises §2.2).
import type { Degree, ScaleMode } from "./schema/common.ts";
import type { ExBase, KeyPool, ParamGen, ParamValues } from "./schema/exercise.ts";

/** Deterministic 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the parts joined with U+001F. Stable across runtimes. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const text = parts.join("\u001f");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Params are drawn once per attempt series from `mulberry32(hash(exerciseGlobalId, seriesNo))`. */
export function paramSeed(exerciseGlobalId: string, seriesNo: number): number {
  return hashSeed(exerciseGlobalId, seriesNo);
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11] as const;
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
/** Parent major keys by number of accidentals: sharps side, then flats side. */
const SHARP_PARENTS = ["C", "G", "D", "A", "E", "B", "F#"] as const;
const FLAT_PARENTS = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb"] as const;
/** Scale degree (0-based) of the parent major scale on which each mode starts. */
const MODE_DEGREE: Readonly<Record<ScaleMode, number>> = {
  major: 0,
  "major pentatonic": 0,
  dorian: 1,
  phrygian: 2,
  lydian: 3,
  mixolydian: 4,
  minor: 5,
  "harmonic minor": 5,
  "melodic minor": 5,
  "minor pentatonic": 5,
  blues: 5,
  locrian: 6,
};

function pcOf(name: string): number {
  const letter = LETTERS.indexOf(name[0] as (typeof LETTERS)[number]);
  let pc = NATURAL_PC[letter] as number;
  for (const ch of name.slice(1)) pc += ch === "#" ? 1 : -1;
  return ((pc % 12) + 12) % 12;
}
/** The spelled note on `degree` (0-based) of the major scale of `tonic`. */
function majorScaleNote(tonic: string, degree: number): string {
  const letterIndex = (LETTERS.indexOf(tonic[0] as (typeof LETTERS)[number]) + degree) % 7;
  const target = (pcOf(tonic) + (MAJOR_STEPS[degree] as number)) % 12;
  let diff = (target - (NATURAL_PC[letterIndex] as number) + 12) % 12;
  if (diff > 6) diff -= 12;
  return `${LETTERS[letterIndex]}${diff > 0 ? "#".repeat(diff) : "b".repeat(-diff)}`;
}

/**
 * Tonics whose key signature has at most the pool's number of accidentals, for `mode`.
 * `all` = 12 keys with at most 6 accidentals; at 6 the better-spelled tonic wins (Eb minor, not D# minor;
 * B lydian, not Cb lydian). The order is fixed: sharps side by count, then flats side.
 */
export function keyPool(keys: KeyPool, mode: ScaleMode): string[] {
  const max = keys === "C" ? 0 : keys === "≤2acc" ? 2 : keys === "≤4acc" ? 4 : 6;
  const degree = MODE_DEGREE[mode];
  const out: string[] = [];
  for (let n = 0; n <= Math.min(max, 5); n++) out.push(majorScaleNote(SHARP_PARENTS[n] as string, degree));
  for (let n = 1; n <= Math.min(max, 5); n++) out.push(majorScaleNote(FLAT_PARENTS[n] as string, degree));
  if (max === 6) {
    const sharp = majorScaleNote("F#", degree);
    const flat = majorScaleNote("Gb", degree);
    if (sharp.length === 1) out.push(sharp);
    else if (flat.length === 1) out.push(flat);
    else out.push(degree === 0 ? sharp : flat);
  }
  return out;
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))] as T;
}

/** Draws one value. `key` params yield the tonic ("Eb"); `degree` params yield the degree label ("b3"). */
export function drawParam(gen: ParamGen, rng: () => number): number | string {
  switch (gen.gen) {
    case "int": {
      const step = gen.step ?? 1;
      const count = Math.floor((gen.max - gen.min) / step) + 1;
      const values = Array.from({ length: count }, (_, i) => gen.min + i * step);
      const away = gen.awayFrom;
      const allowed = away ? values.filter((v) => Math.abs(v - away.value) >= away.by) : values;
      return pick(rng, allowed.length > 0 ? allowed : values);
    }
    case "choice":
      return pick(rng, gen.of);
    case "key":
      return pick(rng, keyPool(gen.keys, gen.mode));
    case "degree":
      return pick<Degree>(rng, gen.set);
  }
}

/** Draws every param in declaration order from one seeded stream. */
export function drawParams(params: Record<string, ParamGen> | undefined, seed: number): ParamValues {
  const rng = mulberry32(seed);
  const out: ParamValues = {};
  for (const [name, gen] of Object.entries(params ?? {})) out[name] = drawParam(gen, rng);
  return out;
}

/** The values for one attempt series of an exercise. A retry inside the series keeps them. */
export function drawExerciseParams(
  ex: Pick<ExBase<string>, "params">,
  exerciseGlobalId: string,
  seriesNo: number,
): ParamValues {
  return drawParams(ex.params, paramSeed(exerciseGlobalId, seriesNo));
}

const PARAM_TOKEN = /\{\{param:([A-Za-z][A-Za-z0-9_]*)\}\}/g;

function isParamRef(v: unknown): v is { param: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v).length === 1 &&
    typeof (v as { param?: unknown }).param === "string"
  );
}

export class MissingParamError extends Error {
  readonly param: string;
  constructor(param: string) {
    super(`param "${param}" is used but has no value`);
    this.name = "MissingParamError";
    this.param = param;
  }
}

/**
 * Deep copy of `value` with every `{{param:name}}` inside a string replaced and every `{ param: name }`
 * in a numeric field resolved. Throws `MissingParamError` for an unknown name, or when a `{ param }`
 * field resolves to a non-number.
 */
export function substituteParams<T>(value: T, params: ParamValues): T {
  const lookup = (name: string): number | string => {
    const v = params[name];
    if (v === undefined) throw new MissingParamError(name);
    return v;
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.replace(PARAM_TOKEN, (_m, name: string) => String(lookup(name)));
    if (Array.isArray(v)) return v.map(walk);
    if (isParamRef(v)) {
      const resolved = lookup(v.param);
      if (typeof resolved !== "number") throw new MissingParamError(v.param);
      return resolved;
    }
    if (typeof v === "object" && v !== null)
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** Every param name referenced anywhere inside `value` (string tokens and `{ param }` fields). */
export function collectParamRefs(
  value: unknown,
  skipKeys: readonly string[] = ["params", "tests"],
): Set<string> {
  const found = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") for (const m of v.matchAll(PARAM_TOKEN)) found.add(m[1] as string);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (isParamRef(v)) found.add(v.param);
    else if (typeof v === "object" && v !== null)
      for (const [k, x] of Object.entries(v)) if (!skipKeys.includes(k)) walk(x);
  };
  walk(value);
  return found;
}

// --- starter markers ----------------------------------------------------------------------------

export const MARK = { open: "⟪", close: "⟫", blankOpen: "⟦", blankClose: "⟧" } as const;

export interface CleanStarter {
  /** The code with every marker removed. All `CodeRange`s in content refer to this text. */
  code: string;
  /** Editable regions; `null` when the starter has no ⟪⟫ markers (the whole text is editable). */
  editable: { from: number; to: number }[] | null;
  /** Blanks: a zero-width position in the clean code per ⟦id⟧ marker. */
  blanks: { id: string; at: number }[];
}

export class StarterMarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StarterMarkerError";
  }
}

/** Strips ⟪…⟫ editable-region markers and ⟦blankId⟧ blank markers from a starter. */
export function stripMarkers(starter: string): CleanStarter {
  let code = "";
  const editable: { from: number; to: number }[] = [];
  const blanks: { id: string; at: number }[] = [];
  let open: number | null = null;
  for (let i = 0; i < starter.length; i++) {
    const ch = starter[i] as string;
    if (ch === MARK.open) {
      if (open !== null) throw new StarterMarkerError("nested ⟪ editable region");
      open = code.length;
    } else if (ch === MARK.close) {
      if (open === null) throw new StarterMarkerError("⟫ without ⟪");
      editable.push({ from: open, to: code.length });
      open = null;
    } else if (ch === MARK.blankOpen) {
      const end = starter.indexOf(MARK.blankClose, i);
      if (end < 0) throw new StarterMarkerError("⟦ without ⟧");
      const id = starter.slice(i + 1, end);
      if (id === "" || blanks.some((b) => b.id === id))
        throw new StarterMarkerError(`blank id "${id}" is empty or repeated`);
      blanks.push({ id, at: code.length });
      i = end;
    } else if (ch === MARK.blankClose) {
      throw new StarterMarkerError("⟧ without ⟦");
    } else code += ch;
  }
  if (open !== null) throw new StarterMarkerError("⟪ without ⟫");
  return { code, editable: editable.length > 0 ? editable : null, blanks };
}

/** Fills the blanks of a starter and returns clean code. Unknown or missing blank IDs throw. */
export function fillBlanks(starter: string, values: Record<string, string>): string {
  const { code, blanks } = stripMarkers(starter);
  let out = "";
  let last = 0;
  for (const blank of blanks) {
    const v = values[blank.id];
    if (v === undefined) throw new StarterMarkerError(`no value for blank "${blank.id}"`);
    out += code.slice(last, blank.at) + v;
    last = blank.at;
  }
  for (const id of Object.keys(values))
    if (!blanks.some((b) => b.id === id)) throw new StarterMarkerError(`unknown blank "${id}"`);
  return out + code.slice(last);
}
