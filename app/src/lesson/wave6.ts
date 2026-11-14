// Wave 6 rules of the lesson and checkpoint players (docs/design/wave6.md §4.3, §4.4, §11): what the host passes
// the answer widgets and the Workbench for sevenths, chromatic harmony, key changes, modes and compound meter.
// Everything musical comes from @oak/theory and the content's own fields; nothing is looked up in a table here.
// Pure: `bun test`.
import { type Degree, type Exercise, type KeySpec, type MeterId, MODE_DEGREES } from "@oak/api";
import { MODAL_SIGNATURE_DEFAULT, type ModalSignatureStyle } from "@oak/notation";
import { degreeLabelIn, guideTones, METERS, parseChordSymbol, scalePcs } from "@oak/theory";

/** The colour modes of U14 (a mode that is a major or minor scale with one note moved). */
const COLOUR_MODES = new Set(["mixolydian", "dorian", "lydian", "phrygian", "locrian"]);
const PARENT_MODES = new Set(["major", "minor"]);

/**
 * Whether seventh chords have been taught where this exercise lives (U12.L01 on; the advanced jazz and rhythm
 * tracks open after U13.CP). The chord-name picker then shows its seventh row from the start; before it, never
 * (wave6.md §10 item 15: nothing is shown before it is taught).
 */
export function seventhsTaught(ownerId: string): boolean {
  const core = /^U(\d\d)\.(?:L\d\d|CP)$/.exec(ownerId);
  if (core) return Number(core[1]) >= 12;
  return /^(?:J|R)C?\d*\./.test(ownerId);
}

type WithPlan = { key?: KeySpec; keyPlan?: readonly { bar: number; key: KeySpec }[] };

/**
 * The key change a "where does the key change" answer is about (U17; the answer widgets' `KeyChangeEnv`): the key
 * the piece starts in and the key it moves to, from the exercise's own key plan. `null` for a piece in one key.
 * The widget prints `to` only once the answer is checked right or revealed.
 */
export function keyChangeOf(ex: Exercise | undefined): { from: KeySpec; to: KeySpec; atBar: number } | null {
  const plan = (ex as WithPlan | undefined)?.keyPlan;
  const first = plan?.[0];
  const second = plan?.[1];
  if (!first || !second) return null;
  if (first.key.tonic === second.key.tonic && first.key.mode === second.key.mode) return null;
  return { from: first.key, to: second.key, atBar: second.bar };
}

/** Every `.scale("…")` key the code names, patterned or not: `C4:major`, `<G4:major G4:mixolydian>`, `D:dorian!4`. */
export function scalesInCode(code: string): KeySpec[] {
  const out: KeySpec[] = [];
  for (const call of code.matchAll(/\.scale\(\s*(["'`])([^"'`]*)\1/g)) {
    for (const m of (call[2] as string).matchAll(/([A-G](?:#|b)?)\d?:([a-z]+(?: [a-z]+)?)/g)) {
      out.push({ tonic: m[1] as KeySpec["tonic"], mode: m[2] as KeySpec["mode"] });
    }
  }
  return out;
}

/**
 * How the staff of a step signs a modal piece (wave6.md §3.3, §4.4): the mode's own signature by default, as the
 * folk repertoire is printed; `parallel` where the step compares a mode with its parent scale on the same home
 * note (U14.L01 "Modes as Colours": bar 1 on G major, bar 2 on G Mixolydian) — then the staff keeps the parent's
 * signature and writes the colour tone as an accidental, which is the point of the comparison. A step is such a
 * comparison when its key is the parent (major or minor) and its code also plays a colour mode on that tonic.
 */
export function modalSignatureStyleOf(code: string, key: KeySpec | null): ModalSignatureStyle {
  if (!key || !PARENT_MODES.has(key.mode)) return MODAL_SIGNATURE_DEFAULT;
  const scales = scalesInCode(code);
  const sameHome = scales.filter((s) => s.tonic === key.tonic);
  const hasParent = sameHome.some((s) => s.mode === key.mode);
  const hasColour = sameHome.some((s) => COLOUR_MODES.has(s.mode));
  return hasParent && hasColour ? "parallel" : MODAL_SIGNATURE_DEFAULT;
}

/** A music lens a step shows whatever the learner's switch says (the Workbench's `musicLenses`). */
export type StepMusicLenses = Partial<Record<"guideTones" | "keyPlan" | "beatGrid", boolean>>;

/** The U12 lesson that teaches guide tones (contracts §2.3: U12.L05 "Guide Tones & Voice Leading"). */
const GUIDE_TONES_TAUGHT = 5;

/** Whether the beat of this meter is the dotted quarter (6/8, 9/8, 12/8; contracts §6.9). */
export function isCompound(meter: MeterId): boolean {
  return METERS[meter].tempoUnit === "dottedQuarter";
}

/**
 * The music lenses a lesson step shows because they are what the step is about (wave6.md §4.3 "inside a lesson
 * step the content decides"): the beat grid on every step in a compound meter (the two or four dotted-quarter
 * beats are how 6/8 is read, U13.L04 on), and the key ribbon through U17 (a key change is the unit's subject; the
 * ribbon draws nothing for a piece in one key). Everywhere else the learner's own switches decide. The guide-tone
 * lens is never forced on (on a step that asks for the 3rds and 7ths it would be the answer), and it is held off
 * in the U12 lessons before the one that teaches guide tones.
 */
export function stepMusicLenses(o: { lessonId: string; meter: MeterId }): StepMusicLenses {
  const out: StepMusicLenses = {};
  if (isCompound(o.meter)) out.beatGrid = true;
  const core = /^U(\d\d)\.L(\d\d)$/.exec(o.lessonId);
  if (core && Number(core[1]) === 17) out.keyPlan = true;
  // The guide-tone lens is switchable from U12.L01 (its toolbox gate is `chord.seventh` until the row
  // `tb.lens.guide-tones` exists), but guide tones are taught in U12.L05: the four lessons before it do not draw
  // the 3rds, the 7ths and their line (wave6.md §10 item 15: nothing is shown before it is taught).
  if (core && Number(core[1]) === 12 && Number(core[2]) < GUIDE_TONES_TAUGHT) out.guideTones = false;
  return out;
}

const degreeRank = (d: string): number => {
  const m = /^([#b]?)(\d)$/.exec(d);
  if (!m) return 99;
  return Number(m[2]) * 10 + (m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0);
};

/**
 * The Quiet-mode equivalent of a guide-tone line read from music (`sing.guide-tones` with a `reference` or
 * `stimulus` target; contracts §8.5 "Quiet mode picks the notes instead"): the line's notes as degrees of the
 * step's key, in order, and the pad to pick them on — the key's own seven degrees plus any chromatic one the line
 * uses, so the pad never shows only the answer. `null` while the notes are not read yet.
 */
export function guideToneFallback(
  notes: readonly { midi: number }[],
  key: KeySpec,
  tonicPc: number,
): { degrees: Degree[]; set: Degree[] } | null {
  if (notes.length === 0) return null;
  const degrees = notes.map((n) => degreeLabelIn(Math.round(n.midi) - tonicPc, key));
  const own = (MODE_DEGREES as Record<string, readonly string[]>)[key.mode] ?? [];
  const set = [...new Set<string>([...own, ...degrees])].sort((a, b) => degreeRank(a) - degreeRank(b));
  return { degrees, set: set as Degree[] };
}

/** What pressing Sing does, in one line, for each way a sung step runs (shown above the mic). */
export function singHowText(o: { mode: string; countIn: boolean; labels: "numbers" | "syllables" }): string {
  const on = o.labels === "syllables" ? "the syllables (the numbers work too)" : "the numbers or any vowel";
  if (o.mode === "echo") return "Press Sing: Oak plays it once, then you sing it back.";
  const lead = `Press Sing: the chords set home${o.countIn ? ", a bar of clicks counts you in" : ""}`;
  if (o.mode === "guide-tones")
    return `${lead}, then you sing one long note for each chord, on ${on}. Move as little as you can from one to the next.`;
  return `${lead}, then you sing, on ${on}.`;
}

/**
 * The chord a guide-tone pick is about (U12.L05; the keyboard widget's `guideChord`): a `keyboard` answer in chord
 * mode whose expected notes are exactly the 3rd and the 7th of a chord the prompt itself names ("the guide tones
 * of `G7`"). The chord is read from the prompt and checked against the expected answer with @oak/theory, so a
 * chord is named only when the answer really is its guide tones; `null` for every other keyboard step. The widget
 * names the picked keys by their place in the chord once the answer is checked, never before.
 */
export function guideChordOf(ex: Exercise | undefined): string | null {
  if (ex?.kind !== "keyboard" || ex.answer.mode !== "chord") return null;
  const pcs = ex.expect.pcs;
  if (pcs?.length !== 2) return null;
  const want = [...pcs].map((p) => ((p % 12) + 12) % 12).sort((a, b) => a - b);
  const text = ex.prompt.replace(/♭/g, "b").replace(/♯/g, "#");
  for (const m of text.matchAll(/[A-G][#b]?[A-Za-z0-9^+°ø#]*/g)) {
    const chord = parseChordSymbol(m[0]);
    if (!chord) continue;
    const g = guideTones(chord);
    if (!g.third || !g.seventh) continue;
    const have = [g.third.pc, g.seventh.pc].map(Number).sort((a, b) => a - b);
    if (have[0] === want[0] && have[1] === want[1]) return m[0];
  }
  return null;
}

/**
 * The likely slips beside a sung target that is not in the key (U15's fi, te; U16's le): the key's own notes a half
 * step either side, as @oak/pitch's `chromaticTargets` names them. A note of the key has none (`undefined`).
 */
export function chromaticNeighbours(
  midi: number,
  key: KeySpec,
): { midi: number; kind: "diatonic" }[] | undefined {
  const own = new Set(scalePcs(key) as number[]);
  const pc = (m: number) => ((m % 12) + 12) % 12;
  if (own.has(pc(midi))) return undefined;
  const out = [-1, 1]
    .filter((d) => own.has(pc(midi + d)))
    .map((d) => ({ midi: midi + d, kind: "diatonic" as const }));
  return out.length > 0 ? out : undefined;
}
