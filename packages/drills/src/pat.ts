// A tiny pattern model for the subset of mini-notation the generators write: atoms, rests, sequences
// with `@` weights, stacks, `< >` alternation and `atom*n`. One model produces both the pattern string
// and its events, so the shown code and the played events cannot drift; a property test compares the
// two against headless Strudel.
import { R, type Rat, rat } from "@oak/content-kit";

export type Node =
  | { t: "atom"; v: string; rep?: number }
  | { t: "rest" }
  | { t: "seq"; items: Node[]; w?: number[] }
  | { t: "stack"; items: Node[] }
  | { t: "alt"; items: Node[] };

export const atom = (v: string | number, rep?: number): Node =>
  rep !== undefined && rep > 1 ? { t: "atom", v: String(v), rep } : { t: "atom", v: String(v) };
export const rest: Node = { t: "rest" };
/** `a b c`; with weights `a@3 b`. */
export const seq = (items: Node[], w?: number[]): Node => (w ? { t: "seq", items, w } : { t: "seq", items });
/** `[a,b,c]`: simultaneous. */
export const stack = (items: Node[]): Node => ({ t: "stack", items });
/** `<a b c>`: one item per cycle. */
export const alt = (items: Node[]): Node => ({ t: "alt", items });
/** A stack of note names or steps: `[c3,e3,g3]`. */
export const chordOf = (values: readonly (string | number)[]): Node => stack(values.map((v) => atom(v)));
/** A sequence of atoms where `null` is a rest. */
export const line = (values: readonly (string | number | null)[]): Node =>
  seq(values.map((v) => (v === null ? rest : atom(v))));

export interface Printed {
  text: string;
  /** Offsets of each atom's word inside `text`. */
  locs: Map<Node, [from: number, to: number]>;
}
/** The pattern string. The outermost sequence is written without brackets. */
export function print(node: Node): Printed {
  const locs = new Map<Node, [number, number]>();
  let text = "";
  const emit = (n: Node, top: boolean): void => {
    switch (n.t) {
      case "atom": {
        locs.set(n, [text.length, text.length + n.v.length]);
        text += n.rep ? `${n.v}*${n.rep}` : n.v;
        return;
      }
      case "rest":
        text += "~";
        return;
      case "seq": {
        const bare = top || (n.items.length === 1 && !n.w);
        if (!bare) text += "[";
        n.items.forEach((item, i) => {
          if (i > 0) text += " ";
          emit(item, false);
          const w = n.w?.[i];
          if (w !== undefined && w !== 1) text += `@${w}`;
        });
        if (!bare) text += "]";
        return;
      }
      case "stack":
        text += "[";
        n.items.forEach((item, i) => {
          if (i > 0) text += ",";
          emit(item, false);
        });
        text += "]";
        return;
      case "alt":
        text += "<";
        n.items.forEach((item, i) => {
          if (i > 0) text += " ";
          emit(item, false);
        });
        text += ">";
        return;
    }
  };
  emit(node, true);
  return { text, locs };
}

export interface PatEvent {
  onset: Rat;
  dur: Rat;
  v: string;
  node: Node;
}
/** Onset events of cycles [from, cycles), in time order, with Strudel's semantics for this subset. */
export function query(node: Node, cycles: number, from = 0): PatEvent[] {
  const out: PatEvent[] = [];
  const walk = (n: Node, begin: Rat, len: Rat, cycle: number): void => {
    switch (n.t) {
      case "rest":
        return;
      case "atom": {
        const reps = n.rep ?? 1;
        const dur = R.div(len, rat(reps));
        for (let i = 0; i < reps; i++)
          out.push({ onset: R.add(begin, R.mul(dur, rat(i))), dur, v: n.v, node: n });
        return;
      }
      case "seq": {
        const weights = n.items.map((_, i) => n.w?.[i] ?? 1);
        const total = weights.reduce((s, w) => s + w, 0);
        let acc = 0;
        n.items.forEach((item, i) => {
          const w = weights[i] as number;
          walk(item, R.add(begin, R.mul(len, rat(acc, total))), R.mul(len, rat(w, total)), cycle);
          acc += w;
        });
        return;
      }
      case "stack":
        for (const item of n.items) walk(item, begin, len, cycle);
        return;
      case "alt": {
        if (n.items.length === 0) return;
        // slowcat: item `cycle mod n`, which itself sees cycle `floor(cycle / n)`.
        const count = n.items.length;
        walk(n.items[cycle % count] as Node, begin, len, Math.floor(cycle / count));
        return;
      }
    }
  };
  for (let c = from; c < cycles; c++) walk(node, rat(c), rat(1), c);
  return out.sort((a, b) => R.cmp(a.onset, b.onset));
}
/** The value a control pattern has at `time` (structure comes from the left: STYLE §11). */
export function valueAt(node: Node, time: Rat): string | null {
  const cycle = R.floor(time);
  for (const e of query(node, cycle + 1, cycle))
    if (R.lte(e.onset, time) && R.lt(time, R.add(e.onset, e.dur))) return e.v;
  return null;
}
