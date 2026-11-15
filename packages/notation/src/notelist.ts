// The note-list DSL of content tests and of the staff-input answer model:
//   'C4:4 D4:8 r:8 [C4,E4]:2 | F#4:4. G4:8~ G4:4 (3:2 A4:8 B4:8 C5:8) bd:4'
// A duration is 1/n of a whole note, `.` dots it, `t` makes it a triplet value, `~` ties it to the next
// token of the same pitch, `(p:q … )` scales a group, `|` is ignored on input. Times are converted to
// cycles through the meter (1 cycle = 1 bar).
import type { MeterSpec, NEvent, Rat } from "@oak/content-kit";
import { barOf, R, rat } from "@oak/content-kit";
import { drumStaffPosition } from "./drums.ts";
import { parseNoteName } from "./theory-port.ts";
import type { NoteItem, Score } from "./types.ts";

const FOUR_FOUR: MeterSpec = {
  id: "4/4",
  num: 4,
  den: 4,
  tempoUnit: "quarter",
  unitsPerBar: 4,
  grouping: [1, 1, 1, 1],
};

/** The canonical event id of contracts §5.7 (`k` is added by `withIds`). */
export function eventIdBase(e: Pick<NEvent, "track" | "onset" | "midi" | "s" | "chordSymbol">): string {
  return `${e.track}|${barOf(e.onset)}|${e.onset[0]}/${e.onset[1]}|${e.midi ?? e.s ?? e.chordSymbol ?? ""}`;
}
/** Assigns `id`s with the duplicate counter `k`, keeping the order. */
export function withIds<T extends Omit<NEvent, "id">>(events: T[]): (T & { id: string })[] {
  const seen = new Map<string, number>();
  return events.map((e) => {
    const base = eventIdBase(e);
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    return { ...e, id: `${base}|${k}` };
  });
}

function wholeOf(token: string): Rat {
  const m = /^(\d+)(\.{0,2})(t?)$/.exec(token);
  if (!m) throw new SyntaxError(`note list: bad duration "${token}"`);
  const n = Number(m[1]);
  if (![1, 2, 4, 8, 16, 32].includes(n))
    throw new SyntaxError(`note list: duration 1/${n} is not a note value`);
  const dots = (m[2] ?? "").length;
  let v = R.mul(rat(1, n), rat(2 ** (dots + 1) - 1, 2 ** dots));
  if (m[3]) v = R.mul(v, [2, 3]);
  return v;
}

/** The note-list DSL → events (durations as 1/n of a whole note, converted to cycles through `meter`). */
export function parseNoteList(
  dsl: string,
  opts: { track?: string; start?: Rat; meter?: MeterSpec } = {},
): NEvent[] {
  const track = opts.track ?? "main";
  const meter = opts.meter ?? FOUR_FOUR;
  const W = rat(meter.num, meter.den);
  let t: Rat = opts.start ?? [0, 1];
  let scale: Rat = [1, 1];
  const out: Omit<NEvent, "id">[] = [];
  const open = new Map<string, Omit<NEvent, "id">>();
  const tokens = dsl
    .replace(/\(\s*(\d):(\d)(?::\d)?\s*/g, " ($1:$2 ")
    .split(/\s+/)
    .filter((x) => x && x !== "|" && x !== "||");
  for (const raw of tokens) {
    const g = /^\((\d):(\d)$/.exec(raw);
    if (g) {
      scale = rat(Number(g[2]), Number(g[1]));
      continue;
    }
    let tok = raw;
    const closes = tok.endsWith(")");
    if (closes) tok = tok.slice(0, -1);
    const tie = tok.endsWith("~");
    if (tie) tok = tok.slice(0, -1);
    const m = /^(.+):([\d.t]+)$/.exec(tok);
    if (!m) throw new SyntaxError(`note list: bad token "${raw}"`);
    const what = m[1] as string;
    const dur = R.div(R.mul(wholeOf(m[2] as string), scale), W);
    if (closes) scale = [1, 1];
    if (what === "r" || what === "z") {
      t = R.add(t, dur);
      continue;
    }
    const names = what.startsWith("[") ? what.slice(1, -1).split(",") : [what];
    for (const name of names) {
      // Wave 7: a drum's own name is a drum hit even where it also reads as a pitch without an octave ("cb", the
      // cowbell, is not C♭): pitches in the list always carry their octave.
      const known = /^[a-z]+$/.test(name) && drumStaffPosition(name) !== null;
      const p = known ? null : parseNoteName(name);
      // Anything that is not a pitch and looks like a sound name is a drum hit ("bd", "hh", "rhythm").
      const drum = !p && /^[a-z]+\d*$/.test(name);
      if (!drum && !p) throw new SyntaxError(`note list: bad pitch "${name}"`);
      const k = drum ? `s:${name}` : `m:${p?.midi}`;
      const pending = open.get(k);
      if (pending && R.eq(R.add(pending.onset, pending.dur), t)) {
        pending.dur = R.add(pending.dur, dur);
        if (!tie) open.delete(k);
        continue;
      }
      const ev: Omit<NEvent, "id"> = drum
        ? { track, onset: t, dur, midi: null, pitchSource: "none", s: name, gain: 0.8, locs: [] }
        : {
            track,
            onset: t,
            dur,
            midi: p?.midi ?? null,
            pitchSource: "note-str",
            written: `${p?.letter}${(p?.alt ?? 0) > 0 ? "#".repeat(p?.alt ?? 0) : "b".repeat(-(p?.alt ?? 0))}${p?.oct}`,
            gain: 0.8,
            locs: [],
          };
      out.push(ev);
      if (tie) open.set(k, ev);
    }
    t = R.add(t, dur);
  }
  out.sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi ?? 0) - (b.midi ?? 0));
  return withIds(out);
}

function valueText(it: NoteItem): string {
  return `${it.written.base}${".".repeat(it.written.dots)}`;
}
function whatText(it: NoteItem): string {
  if (it.kind === "rest") return "r";
  const names = it.drums ? it.drums.map((d) => d.s) : it.drum ? [it.drum.s] : it.pitches.map((p) => p.name);
  return names.length > 1 ? `[${names.join(",")}]` : (names[0] as string);
}

/**
 * NotationModel → note-list DSL, one voice: what a test (or a person) reads to check the engraving.
 * Bars are separated by `|`; hidden rests are left out.
 */
export function toNoteList(score: Score, opts: { staff?: number; voice?: number } = {}): string {
  const voice = score.staves[opts.staff ?? 0]?.voices[opts.voice ?? 0];
  if (!voice) return "";
  return voice.bars
    .map((b) => {
      const toks: string[] = [];
      let left = 0;
      for (const it of b.items) {
        if (it.hidden) continue;
        let t = `${whatText(it)}:${valueText(it)}${it.tieToNext ? "~" : ""}`;
        if (it.tupletStart) {
          t = `(${it.tupletStart.p}:${it.tupletStart.q} ${t}`;
          left = it.tupletStart.r;
        }
        if (left > 0) {
          left--;
          if (left === 0) t += ")";
        }
        toks.push(t);
      }
      return toks.join(" ");
    })
    .join(" | ");
}
