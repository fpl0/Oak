// Test support for the ladder suites (songs.test.ts, standards.test.ts): the top-level items of one layer's `<…>`
// in an answer key, each with the bar it starts on. From U13 on a note tied over a bar line is written as a
// two-bar group (`[2@7 ~]@2`, the U13 spec's form), so items and bars are not one to one: an item's weight (`@n`)
// is the number of bars it spans.

export interface CycleItem {
  /** Offset of the item's text in the whole code. */
  at: number;
  text: string;
  /** 0-based index of the first cycle (bar of the `<…>`) the item plays in. */
  start: number;
  /** Cycles (bars) the item spans: its `@n` weight, 1 without one. */
  span: number;
}

/** The top-level items of the `<…>` on the line that starts with `label:`, with the bar each starts on. */
export function cycles(code: string, label: string): CycleItem[] {
  const line = code.split("\n").find((l) => l.startsWith(`${label}:`));
  if (line === undefined) throw new Error(`no ${label}: line in the answer key`);
  const lineAt = code.indexOf(line);
  const open = line.indexOf("<");
  const raw: { at: number; text: string }[] = [];
  let depth = 0;
  let start = -1;
  for (let i = open + 1; i < line.length; i++) {
    const ch = line[i] as string;
    if (ch === ">" && depth === 0) {
      if (start >= 0) raw.push({ at: lineAt + start, text: line.slice(start, i) });
      break;
    }
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === " " && depth === 0) {
      if (start >= 0) raw.push({ at: lineAt + start, text: line.slice(start, i) });
      start = -1;
    } else if (start < 0) start = i;
  }
  let bar = 0;
  return raw.map((r) => {
    const w = /@(\d+)$/.exec(r.text);
    const span = w ? Number(w[1]) : 1;
    const item = { ...r, start: bar, span };
    bar += span;
    return item;
  });
}

/** The item that STARTS on cycle `index` (0-based), or undefined when that cycle is inside a longer item. */
export function itemStartingAt(items: readonly CycleItem[], index: number): CycleItem | undefined {
  return items.find((x) => x.start === index);
}

/** The item that sounds in cycle `index` (0-based), wherever it starts. */
export function itemAt(items: readonly CycleItem[], index: number): CycleItem | undefined {
  return items.find((x) => index >= x.start && index < x.start + x.span);
}
