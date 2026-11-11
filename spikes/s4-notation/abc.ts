/**
 * SPIKE S4 — Score -> ABC text for abcjs 6.7.2 (pure TS, isomorphic).
 *
 * - Header X:/M:/L:1/16/K:
 * - `!class=oak-e{eventId}!` before every note/chord. abcjs keeps ONE class decoration per element, but the
 *   value may contain spaces, so a chord gets `!class=oak-e0 oak-e1 oak-e2!` and every tied piece of an
 *   event repeats the event's class.
 * - Accidentals against the key signature and earlier accidentals in the same bar and octave (incl. `=`).
 * - Spaces at beam-group boundaries, `(p:q:r` tuplets, `-` ties, `z` rests.
 */
import type { CodeRange, NoteItem, Rat, Score, SpelledPitch } from "./quantize.ts";
import { keyInfo } from "./quantize.ts";

export interface AbcNoteRef {
  eventIds: number[];
  slotId: number;
  /** Offsets into the ABC string of the pitch token (after the decoration). Regenerated on every emit. */
  startChar: number;
  endChar: number;
  bar: number;
  locations: CodeRange[];
}
export interface AbcResult {
  abc: string;
  /** One entry per written note/chord (tied pieces included). */
  notes: AbcNoteRef[];
  /** eventId -> code locations (hap.context.locations) and the spelled pitch. */
  idMap: Map<number, { slotId: number; locations: CodeRange[]; pitch: string }>;
}
export interface AbcOptions {
  title?: string;
  tempoBpm?: number;
  barsPerLine?: number;
  classPrefix?: string;
}

const ACC: Record<number, string> = { [-2]: "__", [-1]: "_", 0: "=", 1: "^", 2: "^^" };

/** "C4" -> C, "C5" -> c, "C6" -> c', "C3" -> C, (same convention as tonal's AbcNotation). */
export function abcPitchLetter(letter: string, oct: number): string {
  return oct >= 5 ? letter.toLowerCase() + "'".repeat(oct - 5) : letter.toUpperCase() + ",".repeat(4 - oct);
}

/** Written length in L units -> ABC length suffix: 1 -> "", 4 -> "4", 3/2 -> "3/2", 1/2 -> "/2". */
export function abcLength(len: Rat): string {
  if (len.d === 1n) return len.n === 1n ? "" : `${len.n}`;
  return `${len.n === 1n ? "" : len.n}/${len.d}`;
}

export function toAbc(score: Score, opts: AbcOptions = {}): AbcResult {
  const info = keyInfo(score.key);
  const prefix = opts.classPrefix ?? "oak-e";
  const barsPerLine = opts.barsPerLine ?? 4;
  const header = [
    "X:1",
    ...(opts.title ? [`T:${opts.title}`] : []),
    `M:${score.meter.num}/${score.meter.den}`,
    "L:1/16",
    ...(opts.tempoBpm ? [`Q:1/4=${opts.tempoBpm}`] : []),
    `K:${info.abcKey}`,
  ];
  let abc = `${header.join("\n")}\n`;
  const notes: AbcNoteRef[] = [];
  const idMap: AbcResult["idMap"] = new Map();
  for (const s of score.slots) {
    s.eventIds.forEach((id, i) => {
      idMap.set(id, { slotId: s.id, locations: s.eventLocations[i] ?? [], pitch: (s.pitches[i] as SpelledPitch).name });
    });
  }
  const locBySlot = new Map(score.slots.map((s) => [s.id, s.eventLocations.flat()]));

  score.bars.forEach((bar, bi) => {
    // Bar-scoped accidental state, keyed by letter+octave.
    const state = new Map<string, number>();
    const pitchToken = (p: SpelledPitch, item: NoteItem, isBarStart: boolean): string => {
      const k = `${p.letter}${p.oct}`;
      const body = abcPitchLetter(p.letter, p.oct);
      // A note tied in from the previous bar keeps its accidental without restating it (and without
      // changing this bar's state, so a later untied note of the same pitch restates it).
      if (item.tieFromPrev && isBarStart) return body;
      const current = state.get(k) ?? info.sig[p.letter] ?? 0;
      if (p.alt === current) return body;
      state.set(k, p.alt);
      return `${ACC[p.alt] ?? ""}${body}`;
    };

    bar.items.forEach((item, ii) => {
      if (item.breakBefore) abc += " ";
      if (item.tupletStart) abc += `(${item.tupletStart.p}:${item.tupletStart.q}:${item.tupletStart.r}`;
      const len = abcLength(item.written);
      if (item.kind === "rest") {
        abc += `z${len}`;
        return;
      }
      abc += `!class=${item.eventIds.map((id) => `${prefix}${id}`).join(" ")}!`;
      const startChar = abc.length;
      const toks = item.pitches.map((p) => pitchToken(p, item, ii === 0));
      abc += item.kind === "chord" ? `[${toks.join("")}]${len}` : `${toks[0]}${len}`;
      if (item.tieToNext) abc += "-";
      notes.push({
        eventIds: item.eventIds,
        slotId: item.slotId as number,
        startChar,
        endChar: abc.length,
        bar: bi,
        locations: locBySlot.get(item.slotId as number) ?? [],
      });
    });
    const last = bi === score.bars.length - 1;
    abc += last ? " |]" : " |";
    abc += last || (bi + 1) % barsPerLine === 0 ? "\n" : " ";
  });
  return { abc, notes, idMap };
}

/** Compact, human-readable dump of the model for snapshots: one line per bar. */
export function describeScore(score: Score): string[] {
  return score.bars.map((bar) =>
    bar.items
      .map((it) => {
        const t = it.tupletStart ? `(${it.tupletStart.p}:${it.tupletStart.q}:${it.tupletStart.r} ` : "";
        const who = it.kind === "rest" ? "rest" : it.pitches.map((p) => p.name).join("+");
        const tie = `${it.tieFromPrev ? "~" : ""}${it.kind === "rest" ? "" : `#${it.eventIds.join(",")}`}${it.tieToNext ? "~" : ""}`;
        return `${t}${who}${tie}@${it.start.d === 1n ? it.start.n : `${it.start.n}/${it.start.d}`}:${abcLength(it.written) || "1"}`;
      })
      .join(" "),
  );
}
