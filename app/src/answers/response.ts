// Pure helpers of the AnswerWidget contract (docs/design/wave2.md §3.1): the empty value of each kind, whether a
// value is complete enough to check, and the wire response an attempt stores. No DOM: tested with `bun test`.
import type { AttemptResponse } from "@oak/api";
import { MODE_DEGREES } from "@oak/content-kit";
import { blockSpan, formBlocks } from "./form.ts";
import { EMPTY_FORM_MAP, formMapAnswer, formMapComplete, mapMissing } from "./form-map.ts";
import { slotLabels } from "./harmony.ts";
import { parseSignatureValue } from "./keys/circle.ts";
import { chordTyped } from "./normalize.ts";
import { groupingComplete, groupingUnits, sumOf } from "./rhythm7.ts";
import { degreeSemis, tonicMidi } from "./scale.ts";
import { normalizeStaffValue } from "./staff/model.ts";
import type { AnswerKind, AnswerSpec, AnswerSpecOf, AnswerValue, AnswerValueMap } from "./types.ts";

/** Steps in a grid row: `stepsPerBar × bars`. */
export function gridSteps(spec: AnswerSpecOf<"grid">): number {
  return spec.stepsPerBar * spec.bars;
}

/** Number of slots of a slotted kind (degree pad, quality pad, RN palette). */
export function slotCount(spec: AnswerSpec): number {
  if (spec.ui === "degree-pad") return spec.sequenceLen ?? 1;
  if (spec.ui === "rn-palette" || spec.ui === "slot-choice") return spec.slots;
  return 1;
}

/** The value a widget starts from. */
export function emptyValue<K extends AnswerKind>(spec: AnswerSpecOf<K>): AnswerValue<K> {
  const s = spec as AnswerSpec;
  const v = ((): AnswerValueMap[AnswerKind] => {
    switch (s.ui) {
      case "text":
      case "staff-input":
        return "";
      case "code":
        return s.starter;
      case "blanks":
        return Object.fromEntries(s.blanks.map((b) => [b.id, ""]));
      case "number":
      case "slider":
      case "click-code":
      case "click-staff":
      case "click-roll":
        return null;
      case "rn-palette":
      case "slot-choice":
        return Array.from({ length: s.slots }, () => "");
      case "form":
        // A map starts as one unnamed section from bar 1; the number of sections is the learner's to find.
        return s.input === "map" ? [...EMPTY_FORM_MAP] : Array.from({ length: s.sections }, () => "");
      case "bar-grid":
        return Array.from({ length: s.bars }, () => "");
      case "scale-builder":
        return scaleStart(s);
      case "grid":
        return s.rows.map(() => Array.from({ length: gridSteps(s) }, () => false));
      default:
        return [];
    }
  })();
  return v as AnswerValue<K>;
}

/**
 * What a scale builder opens with: nothing, or with `from` (Wave 6, `scale-builder.from`) that scale's notes: its
 * degrees on the pad, or its keys from the tonic in octave 4 (inside the spec's range).
 */
export function scaleStart(spec: AnswerSpecOf<"scale-builder">): (number | string)[] {
  const degrees = spec.from ? MODE_DEGREES[spec.from] : null;
  if (!degrees) return [];
  if (spec.input === "degrees") return [...degrees];
  const lo = tonicMidi(spec.tonic);
  return degrees.map((d) => lo + degreeSemis(d));
}

/** True when the value can be checked: every slot filled, something typed, something picked. */
export function isComplete(spec: AnswerSpec, value: AnswerValue): boolean {
  switch (spec.ui) {
    case "text":
    case "staff-input":
      return typeof value === "string" && value.trim() !== "";
    case "code":
      return typeof value === "string";
    case "number":
    case "slider":
      return typeof value === "number" && Number.isFinite(value);
    case "click-code":
    case "click-staff":
    case "click-roll":
      return value !== null;
    case "degree-pad":
      return Array.isArray(value) && value.length === slotCount(spec);
    case "rn-palette":
    case "slot-choice":
      return Array.isArray(value) && value.length === spec.slots && value.every((x) => x !== "");
    case "blanks":
      return Object.values(value as Record<string, string>).every((x) => x.trim() !== "");
    case "grid":
      // An empty grid is a legitimate answer ("no hits") only after an explicit Check; the host decides.
      return true;
    case "form":
      if (spec.input === "map") return Array.isArray(value) && formMapComplete(value as string[], spec.bars);
      return Array.isArray(value) && value.length === spec.sections && value.every((x) => x !== "");
    case "bar-grid":
      return (
        Array.isArray(value) &&
        value.length === spec.bars &&
        value.every((x, i) => x !== "" || (spec.given ?? []).includes(i + 1))
      );
    case "scale-builder":
      return Array.isArray(value) && value.length > 0;
    // Wave 7: a grouping fills its bar with 2s and 3s; a Euclidean answer is a rhythm (1 ≤ k ≤ n, n ≥ 2).
    case "grouping":
      return Array.isArray(value) && groupingComplete(value as number[], groupingUnits(spec.meter).units);
    case "euclid": {
      const [k, n] = Array.isArray(value) ? (value as number[]) : [];
      return k !== undefined && n !== undefined && k >= 1 && n >= 2 && k <= n;
    }
    case "keyboard":
    case "choice":
    case "quality-pad":
    case "bar-buttons":
    case "order":
    case "tap":
    case "mic":
    case "hum":
    case "same-different":
      return Array.isArray(value) && value.length > 0;
  }
}

/**
 * The response an attempt stores and the grader reads (`AttemptResponse`, `@oak/api`). Grid cells are sent as
 * choice IDs: the cell index for a one-row grid (as `@oak/drills` rhythm dictation expects), `row:cell` with
 * several rows. Staff input is the staff text (bare pitches read as quarters); the lesson host converts it to
 * `NEvent[]` for the grader. A key-signature staff (`mode: "key-signature"`) sends its accidentals in the order
 * placed as `answer.text` (wave3.md §10).
 */
export function responseOf(spec: AnswerSpec, value: AnswerValue): AttemptResponse {
  switch (spec.ui) {
    case "choice":
    case "same-different":
      return { answer: { choice: value as string[] } };
    case "slot-choice":
      // Slot order is the answer: an empty slot stays "" so slot 3 is never read as slot 2.
      return {
        answer: { choice: Array.from({ length: spec.slots }, (_, i) => (value as string[])[i] ?? "") },
      };
    case "degree-pad":
      return { answer: { degrees: value as AnswerValueMap["degree-pad"] } };
    case "quality-pad":
      return { answer: { qualities: value as AnswerValueMap["quality-pad"] } };
    case "rn-palette":
      return { answer: { rn: value as string[] } };
    case "text":
      // A chord name goes out as Oak read it in the preview (`CΔ` is a major seventh: normalize.ts `chordTyped`).
      return {
        answer: {
          text: [
            spec.normalize === "chord" ? chordTyped((value as string).trim()) : (value as string).trim(),
          ],
        },
      };
    case "number":
    case "slider":
      return value === null ? { skipped: true } : { answer: { number: value as number } };
    case "keyboard":
      return { answer: { midi: value as number[] } };
    case "staff-input":
      if (spec.mode === "key-signature") return { answer: { text: parseSignatureValue(value as string) } };
      return { staff: normalizeStaffValue(value as string) };
    case "grid": {
      const rows = value as boolean[][];
      const one = rows.length === 1;
      const cells = rows.flatMap((row, r) =>
        row.flatMap((on, c) => (on ? [one ? String(c) : `${spec.rows[r] ?? r}:${c}`] : [])),
      );
      return { answer: { choice: cells } };
    }
    case "code":
      return { code: value as string };
    case "tap":
      return { taps: value as number[] };
    case "mic":
    case "hum":
      return { sung: value as AnswerValueMap["mic"] };
    case "bar-buttons": {
      const bars = value as number[];
      const last = bars.at(-1);
      return last === undefined ? { skipped: true } : { click: String(last) };
    }
    case "click-code":
      return value === null ? { skipped: true } : { click: value as AnswerValueMap["click-code"] & object };
    case "click-staff":
    case "click-roll":
      return value === null ? { skipped: true } : { click: value as string };
    case "order":
      return { order: value as string[] };
    case "blanks":
      return { blanks: value as Record<string, string> };
    case "form": {
      if (spec.input === "map") {
        const map = formMapAnswer(value as string[], spec.bars);
        return map.sections.some((x) => x === "") ? { skipped: true } : { answer: map };
      }
      // A form with an unnamed section is not an answer yet (every label is a word or a letter).
      const sections = value as string[];
      return sections.some((x) => x === "") ? { skipped: true } : { answer: { sections } };
    }
    case "bar-grid":
      return spec.entry === "rn"
        ? { answer: { rn: value as string[] } }
        : { answer: { text: value as string[] } };
    case "scale-builder":
      return spec.input === "keyboard"
        ? {
            answer: {
              midi: (value as (number | string)[]).filter((x): x is number => typeof x === "number"),
            },
          }
        : {
            answer: {
              degrees: (value as (number | string)[]).filter(
                (x): x is string => typeof x === "string",
              ) as never,
            },
          };
    // Wave 7: the numbers as the learner set them.
    // An empty grouping or Euclid answer is not an answer yet (the schema asks for a group, and for k and n).
    case "grouping":
      return (value as number[]).length === 0
        ? { skipped: true }
        : { answer: { grouping: value as number[] } };
    case "euclid":
      return (value as number[]).length < 2 ? { skipped: true } : { answer: { euclid: value as number[] } };
  }
}

/**
 * Why a value cannot be checked yet, in the learner's words, for a disabled Check (d4: after a slot auto-advances,
 * the button says which slot is still empty): "Bar 3 is still empty.", "Name the section at bars 9–16.". `null`
 * when the value is complete (or the kind has no slots to name).
 */
export function incompleteReason(
  spec: AnswerSpec,
  value: AnswerValue,
  o: { slotsPerBar?: 1 | 2; beatsPerBar?: number } = {},
): string | null {
  if (isComplete(spec, value)) return null;
  const list = (empty: string[]): string | null => {
    if (empty.length === 0) return null;
    if (empty.length === 1) return `${empty[0]} is still empty.`;
    if (empty.length === 2) return `${empty[0]} and ${(empty[1] as string).toLowerCase()} are still empty.`;
    return `${empty[0]} and ${empty.length - 1} more are still empty.`;
  };
  switch (spec.ui) {
    case "rn-palette":
    case "slot-choice": {
      const labels = slotLabels(spec.slots, { ...o, ...(spec.labels ? { labels: spec.labels } : {}) });
      const v = Array.isArray(value) ? (value as string[]) : [];
      return list(labels.filter((_, i) => (v[i] ?? "") === "").map((l) => l.spoken));
    }
    case "bar-grid": {
      const v = Array.isArray(value) ? (value as string[]) : [];
      const given = spec.given ?? [];
      const empty: string[] = [];
      for (let i = 0; i < spec.bars; i++)
        if ((v[i] ?? "") === "" && !given.includes(i + 1)) empty.push(`Bar ${i + 1}`);
      return list(empty);
    }
    case "form": {
      const v = Array.isArray(value) ? (value as string[]) : [];
      if (spec.input === "map") return mapMissing(v, spec.bars ?? 1);
      if (spec.input === "order") {
        const left = spec.sections - v.filter((x) => x !== "").length;
        return left > 0 ? `${left} ${left === 1 ? "section is" : "sections are"} still to place.` : null;
      }
      const blocks = formBlocks(spec);
      return list(blocks.filter((b) => (v[b.index] ?? "") === "").map((b) => blockSpan(b)));
    }
    case "degree-pad": {
      const n = slotCount(spec);
      const have = Array.isArray(value) ? value.length : 0;
      if (n <= 1) return "Pick a degree.";
      return `${n - have} of ${n} ${n - have === 1 ? "note is" : "notes are"} still empty.`;
    }
    case "scale-builder":
      return "Pick the notes of the scale.";
    case "grouping": {
      const { units, word } = groupingUnits(spec.meter);
      const left = units - sumOf(Array.isArray(value) ? (value as number[]) : []);
      return left > 0
        ? `${left} ${left === 1 ? word : `${word}s`} still to group.`
        : "Use groups of 2 and 3.";
    }
    case "euclid":
      return "Set the hits and the steps.";
    default:
      return null;
  }
}
