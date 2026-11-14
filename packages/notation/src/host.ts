// Wave 6 carry-over d5: ONE helper for every staff host (Workbench, Transcribe, the lesson player, answers,
// drills, the capstone lead sheet), so they all print a swung line the way the Workbench does and never name a
// note otherwise than the staff draws it.
//
//   staffHostInput(input, { code, swing })   the NotationInput a host engraves:
//       - a scale step the code alters (`n("3#")`, `n("6b")`) carries the name the code wrote (F♯ for ♯4, B♭ for
//         ♭7), so the staff draws that letter and never the enharmonic its approach-tone rule would choose;
//       - a measured swing (the grader's `swingView(n, meter)`) or a declared one becomes `NotationInput.swing`:
//         the staff prints the swung line straight under "Swing 8ths" / "Swing 16ths" (contracts §6.10 items 2–3).
//   drawnLabels(score)                        how the staff spells each engraved event, with its degree and
//       syllable read from that spelling, by `NEvent.id`: what a tooltip, the roll and the lens lines show, so a
//       text never names another note than the head (the Workbench's `relabel`).
//   drawnLabelsOf(input, pageBars)            the same for a whole piece that a host engraves page by page.
//
// Pure, isomorphic, no grader import: the swing measurement is passed in (structurally the grader's `TrackSwing`).
import type { KeySpec, NEvent, Rat, SwingSpec } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { displayName, type SpelledPitch } from "@oak/theory";
import { buildScore } from "./build.ts";
import { spelledLabel } from "./options.ts";
import type { NotationInput, Score } from "./types.ts";

// --- swing -------------------------------------------------------------------------------------------------------

/** One track's measured swing, as the grader's `swingView` reports it (`TrackSwing` fits structurally). */
export interface TrackSwingInput {
  /** The subdivision that swings on this track, `null` when it plays straight. */
  swung: 8 | 16 | null;
  /** Where the off-beat lands inside its pair, as a share of the pair (2/3 for triplet swing), per subdivision. */
  eighths: { p: Rat | null };
  sixteenths: { p: Rat | null };
}

/**
 * The swing a staff prints for a piece (contracts §6.10 items 2–3): the subdivision and exact amount every swung
 * track shares, `null` when nothing swings or the swung tracks disagree (8ths in one, 16ths or another amount in
 * another: the staff then shows what plays). Straight tracks are untouched by it (only onsets at the swung position
 * move). Moved here from the Workbench (d5) so every host measures the same way.
 */
export function staffSwingOf(tracks: readonly TrackSwingInput[]): SwingSpec | null {
  const swung = tracks.filter((t) => t.swung !== null);
  const first = swung[0];
  if (!first) return null;
  const sub = first.swung as 8 | 16;
  const pOf = (t: TrackSwingInput) => (sub === 8 ? t.eighths.p : t.sixteenths.p);
  const p = pOf(first);
  if (!p) return null;
  if (swung.some((t) => t.swung !== sub || !pOf(t) || R.toNum(pOf(t) as Rat) !== R.toNum(p))) return null;
  const amount = (2 * p[0]) / p[1] - 1;
  return amount > 0 && amount < 1 ? { subdivision: sub, amount } : null;
}

/** "Swing 8ths" / "Swing 16ths": the words the staff prints for a swing (contracts §6.10 item 3), else `null`. */
export function swingTextOf(
  swing: { subdivision: 8 | 16; amount?: number } | { swung: 8 | 16 | null } | null | undefined,
): "Swing 8ths" | "Swing 16ths" | null {
  if (!swing) return null;
  const sub = "subdivision" in swing ? swing.subdivision : swing.swung;
  return sub === 8 ? "Swing 8ths" : sub === 16 ? "Swing 16ths" : null;
}

// --- the names the code wrote ----------------------------------------------------------------------------------

const STEP_LETTERS = "CDEFGAB";
const LETTER_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Seven-note scales, where a step is a letter: `n("2b")` on them is the third letter, flattened. */
const HEPTATONIC =
  /^(?:major|minor|ionian|dorian|phrygian|lydian|mixolydian|aeolian|locrian|harmonic minor|melodic minor)$/;

/**
 * The written name of a scale step the code alters with an accidental (`n("2b")`, `n("3#")` on a seven-note scale):
 * the step's letter with the accidental the sound needs, so `n("0 2b 2").scale("C4:major")` is C E♭ E — the flat
 * the code wrote — and `n("4 3# 4")` is G F♯ G, ♯4 "fi", never G G♭ G. `null` for any other event (no accidental, a
 * pentatonic or blues scale, `note()`, a step altered twice over).
 */
export function alteredStepName(code: string, e: NEvent): string | null {
  if (e.pitchSource !== "n-scale" || e.midi === null || !e.scaleCtx) return null;
  const ctx = /^([A-G])([#b]*)-?\d*\s+(.+)$/.exec(e.scaleCtx.trim());
  if (!ctx || !HEPTATONIC.test((ctx[3] as string).trim().toLowerCase())) return null;
  let step: number | null = null;
  for (const l of e.locs) {
    const m = /^(-?\d+)([#b]+)$/.exec(code.slice(l.from, l.to).trim());
    if (m) {
      step = Number(m[1]);
      break;
    }
  }
  if (step === null) return null;
  const letter = STEP_LETTERS[(((STEP_LETTERS.indexOf(ctx[1] as string) + step) % 7) + 7) % 7] as string;
  const midi = Math.round(e.midi);
  for (let oct = -1; oct <= 9; oct++) {
    const alt = midi - (12 * (oct + 1) + (LETTER_PC[letter] as number));
    // A step altered twice over (`6b` on the ♭7 of a minor key) is left to the key's own spelling (C, not D𝄫).
    if (Math.abs(alt) <= 2)
      return Math.abs(alt) === 2 ? null : `${letter}${alt > 0 ? "#" : alt < 0 ? "b" : ""}${oct}`;
  }
  return null;
}

/** The events, each altered scale step carrying its written name (`alteredStepName`); the others untouched. */
export function alteredSteps(code: string, events: readonly NEvent[]): NEvent[] {
  if (!/\d[#b]/.test(code)) return [...events];
  return events.map((e) => {
    const written = alteredStepName(code, e);
    return written ? { ...e, written } : e;
  });
}

// --- what a host engraves ----------------------------------------------------------------------------------------

export interface StaffHostOptions {
  /** The code the events came from: altered scale steps are drawn as written (`alteredSteps`). */
  code?: string;
  /**
   * The swing to print: the measured swing per track (the grader's `swingView(n, meter)`; `staffSwingOf` decides),
   * or a declared `SwingSpec`. Absent or `null`: whatever `input.swing` says. A swing the input already declares
   * wins over a measured one.
   */
  swing?: SwingSpec | readonly TrackSwingInput[] | null;
}

/**
 * The input a staff host engraves (d5): `input` with altered scale steps named as the code wrote them and the swing
 * filled in, so every host prints what the Workbench prints. Pass the result to `notate` / `buildScore`, then read
 * `drawnLabels(score)` for every text that names a note.
 */
export function staffHostInput(input: NotationInput, host: StaffHostOptions = {}): NotationInput {
  const events = host.code !== undefined ? alteredSteps(host.code, input.events) : input.events;
  const swing =
    input.swing ??
    (host.swing == null ? null : isSwingSpec(host.swing) ? host.swing : staffSwingOf(host.swing));
  // Swing is only written in a quarter-note meter (contracts §6.10 item 1): a measured swing never raises the
  // staff's `swing-unsupported` warning, a declared one (`input.swing`) still does.
  const fits = input.swing !== undefined || input.meter.tempoUnit === "quarter";
  return {
    ...input,
    events,
    ...(swing && fits ? { swing } : {}),
  };
}
function isSwingSpec(s: SwingSpec | readonly TrackSwingInput[]): s is SwingSpec {
  return !Array.isArray(s);
}

// --- the drawn spelling, for every text that names a note ----------------------------------------------------------

/** How the staff draws one event: its spelled pitch, and the degree and syllable read from that spelling. */
export interface DrawnLabel {
  /** Code spelling as drawn: "F#4", "Bb3". */
  written: string;
  /** The same for display: "F♯4", "B♭3". */
  name: string;
  /** Letter and accidental without the octave: "F♯". */
  pitchClass: string;
  midi: number;
  /**
   * The key in force where the note stands on its staff, and the degree ("♯4") and movable-do syllable ("fi") the
   * spelling has in it (`labelSpelled`; the blue ♭5 in a blues). Absent without a key.
   */
  key?: KeySpec;
  degree?: string;
  syllable?: string;
}

/**
 * How the staff spells each engraved event of a Score, by `NEvent.id`, with the degree and syllable that spelling
 * has (d5): what a tooltip, the piano roll and a lens line show, so no text names another note than the head — an
 * approach tone the staff leans into its target (D♯ into E is ♯2, never ♭3 under a drawn D♯), a blue five by its
 * motion, the leading tone of an applied dominant (G♯ under E7 is ♯5 "si"). A unison doubled in one notehead maps
 * both events to that head. Drum strokes and rests are left out.
 */
export function drawnLabels(score: Score): Map<string, DrawnLabel> {
  const out = new Map<string, DrawnLabel>();
  for (const staff of score.staves) {
    if (staff.clef === "perc") continue;
    for (const v of staff.voices)
      for (const b of v.bars)
        for (const it of b.items) {
          if (it.kind === "rest" || it.tieFromPrev) continue;
          it.eventIds.forEach((id, i) => {
            const p = it.pitches[i] ?? it.pitches[it.doubled?.[i - it.pitches.length] ?? -1];
            if (!p || out.has(id)) return;
            out.set(id, drawnLabel(score, staff, it.onset, p));
          });
        }
  }
  return out;
}
function drawnLabel(score: Score, staff: Score["staves"][number], onset: Rat, p: SpelledPitch): DrawnLabel {
  const name = displayName(p);
  const base: DrawnLabel = { written: p.name, name, pitchClass: name.replace(/-?\d+$/, ""), midi: p.midi };
  const l = spelledLabel(score, staff, onset, p);
  return l ? { ...base, key: l.key, degree: l.degree, syllable: l.syllable } : base;
}

/**
 * `drawnLabels` for a whole piece a host engraves in pages of `pageBars` bars (the Workbench's staff, Transcribe):
 * each page is built as the host builds it (`startBar`, `bars`), so a note at a page edge is labelled as its own
 * page draws it. `pageBars` absent or not below the piece's bars: one page. Events are not shifted: pass the piece
 * with absolute onsets and `bars` = the whole length.
 */
export function drawnLabelsOf(input: NotationInput, pageBars?: number): Map<string, DrawnLabel> {
  const first = input.startBar ?? 0;
  const total = Math.max(0, input.bars);
  const per = pageBars && pageBars > 0 ? Math.min(pageBars, Math.max(1, total)) : Math.max(1, total);
  const out = new Map<string, DrawnLabel>();
  for (let from = first; from < first + total; from += per) {
    const bars = Math.min(per, first + total - from);
    const last = from + bars >= first + total;
    // A later page starts in the key in force at its first bar (a change at or before it is not "inside" the page).
    const keyAt = (key: KeySpec | null, changes: NotationInput["keyChanges"]): KeySpec | null => {
      let k = key;
      for (const c of [...(changes ?? [])].sort((a, b) => a.bar - b.bar || (a.beat ?? 1) - (b.beat ?? 1)))
        if (c.bar < from || (c.bar === from && (c.beat ?? 1) <= 1)) k = c.key;
      return k;
    };
    const trackKeys = input.trackKeys
      ? Object.fromEntries(
          Object.entries(input.trackKeys).flatMap(([track, plan]) => {
            const k = keyAt(plan.key, plan.keyChanges);
            return k ? [[track, { ...plan, key: k }] as const] : [];
          }),
        )
      : undefined;
    const score = buildScore({
      ...input,
      key: keyAt(input.key, input.keyChanges),
      ...(trackKeys ? { trackKeys } : {}),
      startBar: from,
      bars,
      ...(last ? {} : { endsPiece: false }),
    });
    for (const [id, l] of drawnLabels(score)) if (!out.has(id)) out.set(id, l);
  }
  return out;
}
