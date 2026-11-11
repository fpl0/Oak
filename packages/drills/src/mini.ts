// A parser for the mini-notation subset the drills ask learners to write (rhythm dictation in code,
// "Read it"): atoms, `~`, `[ ]`, `< >`, `,`, `@n`, `_`, `*n`, `!n`. It builds the same pattern model the
// generators print, so a learner's string and the trial's events are compared on one semantics.
import type { KeySpec, ScaleMode } from "@oak/content-kit";
import { SCALE_MODES } from "@oak/content-kit";
import { noteMidi, stepToMidi } from "./kernel.ts";
import { alt, atom, type Node, query, rest, seq, stack } from "./pat.ts";

export class MiniParseError extends Error {}

/** Parses a mini-notation string of the supported subset. Throws `MiniParseError`. */
export function parseMini(text: string): Node {
  let i = 0;
  const peek = (): string => text[i] ?? "";
  const skip = (): void => {
    while (/\s/.test(peek())) i++;
  };
  const number = (): number => {
    const m = /^\d+(?:\.\d+)?/.exec(text.slice(i));
    if (!m) throw new MiniParseError(`a number is expected at ${i}`);
    i += m[0].length;
    return Number(m[0]);
  };
  // sequence := step (ws step)* ; a step may be followed by @n, *n, !n, or "_" steps that lengthen it.
  const sequence = (closers: string): Node => {
    const layers: { items: Node[]; w: number[] }[] = [{ items: [], w: [] }];
    let cur = layers[0] as { items: Node[]; w: number[] };
    for (;;) {
      skip();
      const c = peek();
      if (c === "" || closers.includes(c)) break;
      if (c === ",") {
        i++;
        cur = { items: [], w: [] };
        layers.push(cur);
        continue;
      }
      if (c === "_") {
        i++;
        if (cur.items.length === 0) throw new MiniParseError("`_` needs a step before it");
        cur.w[cur.w.length - 1] = (cur.w[cur.w.length - 1] as number) + 1;
        continue;
      }
      let node = term();
      let weight = 1;
      let copies = 1;
      for (;;) {
        const m = peek();
        if (m === "@") {
          i++;
          weight = number();
        } else if (m === "*") {
          i++;
          const n = number();
          if (!Number.isInteger(n) || n < 1) throw new MiniParseError("`*` takes a whole number here");
          node =
            node.t === "atom" && !node.rep ? atom(node.v, n) : seq(Array.from({ length: n }, () => node));
        } else if (m === "!") {
          i++;
          copies += /\d/.test(peek()) ? number() - 1 : 1;
        } else break;
      }
      for (let k = 0; k < copies; k++) {
        cur.items.push(node);
        cur.w.push(weight);
      }
    }
    const toSeq = (l: { items: Node[]; w: number[] }): Node => {
      if (l.items.length === 0) throw new MiniParseError("an empty sequence");
      return l.w.every((w) => w === 1) ? seq(l.items) : seq(l.items, l.w);
    };
    return layers.length === 1
      ? toSeq(layers[0] as { items: Node[]; w: number[] })
      : stack(layers.map(toSeq));
  };
  const term = (): Node => {
    const c = peek();
    if (c === "[") {
      i++;
      const inner = sequence("]");
      if (peek() !== "]") throw new MiniParseError("a `[` is not closed");
      i++;
      return inner;
    }
    if (c === "<") {
      i++;
      const inner = sequence(">");
      if (peek() !== ">") throw new MiniParseError("a `<` is not closed");
      i++;
      if (inner.t === "seq" && !inner.w) return alt(inner.items);
      if (inner.t === "seq") throw new MiniParseError("`@` inside `< >` is not supported here");
      return alt([inner]);
    }
    if (c === "~") {
      i++;
      return rest;
    }
    const m = /^-?[A-Za-z0-9#.:]+/.exec(text.slice(i));
    if (!m) throw new MiniParseError(`unexpected "${c}" at ${i}`);
    i += m[0].length;
    return atom(m[0]);
  };
  const node = sequence("");
  if (i < text.length) throw new MiniParseError(`unexpected "${peek()}" at ${i}`);
  return node;
}

/** A `.scale()` argument to a key and octave: "A3:harmonic:minor" → A harmonic minor, 3. */
export function parseScaleArg(arg: string): { key: KeySpec; octave: number } | null {
  const m = /^([A-Ga-g][#b]*)(-?\d+)?:([a-z:]+)$/.exec(arg.trim());
  if (!m) return null;
  const mode = (m[3] as string).replace(/:/g, " ") as ScaleMode;
  if (!(SCALE_MODES as readonly string[]).includes(mode)) return null;
  const tonic = (m[1] as string)[0]?.toUpperCase() + (m[1] as string).slice(1);
  return { key: { tonic, mode }, octave: m[2] === undefined ? 3 : Number(m[2]) };
}

export type ParsedCode =
  | { ok: true; events: { t: number; midi: number | null; v: string }[] }
  | { ok: false; error: string };

/**
 * Reads a learner answer: either a bare mini-notation string ("x ~ x x"), or code lines with
 * `note("…")`, `n("…").scale("…")` or `s("…")`. Returns the onsets of `bars` cycles (in cycles) and
 * their MIDI (`null` for drums and bare strings). `fallbackScale` resolves `n` without `.scale()`.
 */
export function parseMiniCode(
  text: string,
  bars: number,
  fallbackScale?: { key: KeySpec; octave: number },
): ParsedCode {
  try {
    const calls = [...text.matchAll(/\b(note|n|s|sound)\(\s*"([^"]*)"\s*\)((?:\.\w+\([^)]*\))*)/g)];
    const out: { t: number; midi: number | null; v: string }[] = [];
    if (calls.length === 0) {
      const bare = text.trim().replace(/^"|"$/g, "");
      for (const e of query(parseMini(bare), bars))
        out.push({ t: e.onset[0] / e.onset[1], midi: null, v: e.v });
      return { ok: true, events: out };
    }
    for (const c of calls) {
      const fn = c[1] as string;
      const node = parseMini(c[2] as string);
      const chain = c[3] ?? "";
      const scaleArg = /\.scale\(\s*"([^"]+)"\s*\)/.exec(chain)?.[1];
      const scale = scaleArg ? parseScaleArg(scaleArg) : (fallbackScale ?? null);
      for (const e of query(node, bars)) {
        let midi: number | null = null;
        if (fn === "note") {
          midi = /^-?\d+$/.test(e.v)
            ? Number(e.v)
            : noteMidi(e.v.includes("-") || /\d/.test(e.v) ? e.v : `${e.v}3`);
          if (midi === null) return { ok: false, error: `"${e.v}" is not a note` };
        } else if (fn === "n") {
          if (!scale) return { ok: false, error: "`n` needs `.scale()`" };
          midi = stepToMidi(e.v, scale.key, scale.octave);
        }
        out.push({ t: e.onset[0] / e.onset[1], midi, v: e.v });
      }
    }
    out.sort((a, b) => a.t - b.t || (a.midi ?? -1) - (b.midi ?? -1));
    return { ok: true, events: out };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
