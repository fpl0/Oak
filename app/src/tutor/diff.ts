// Token-level diff for code cards (contracts §10.7 "a token-level Diff"). Pure. Tokens are words (identifiers,
// numbers, note names like `c#4`), runs of whitespace and single punctuation marks, so a change from `c2` to `f2`
// inside `note("<c2 g2>")` shows as one word, not a whole line.

export type DiffOp = { type: "same" | "add" | "del"; text: string };

/** Above this many tokens on either side the diff falls back to whole lines (LCS is quadratic). */
export const MAX_DIFF_TOKENS = 1_500;

export function tokenize(code: string): string[] {
  return code.match(/\s+|[A-Za-z0-9_#.]+|[^\sA-Za-z0-9_#.]/g) ?? [];
}

function lcsDiff(a: readonly string[], b: readonly string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:], one flat row-major array.
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i * w + j] =
        a[i] === b[j]
          ? (dp[(i + 1) * w + j + 1] as number) + 1
          : Math.max(dp[(i + 1) * w + j] as number, dp[i * w + j + 1] as number);
  const out: DiffOp[] = [];
  const push = (type: DiffOp["type"], text: string) => {
    const last = out[out.length - 1];
    if (last?.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i] as string);
      i++;
      j++;
    } else if ((dp[(i + 1) * w + j] as number) >= (dp[i * w + j + 1] as number))
      push("del", a[i++] as string);
    else push("add", b[j++] as string);
  }
  while (i < n) push("del", a[i++] as string);
  while (j < m) push("add", b[j++] as string);
  return out;
}

/** The ops that turn `before` into `after`. Joining the `same` and `del` texts gives `before`; `same` and `add`, `after`. */
export function diffCode(before: string, after: string): DiffOp[] {
  if (before === after) return before ? [{ type: "same", text: before }] : [];
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) {
    const lines = (s: string) => s.split(/(?<=\n)/);
    return lcsDiff(lines(before), lines(after));
  }
  return lcsDiff(a, b);
}

/** How much changed, for the Diff tab's label. */
export function diffStats(ops: readonly DiffOp[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const o of ops) {
    const words = o.text.trim() ? tokenize(o.text).filter((t) => t.trim()).length : 0;
    if (o.type === "add") added += words;
    else if (o.type === "del") removed += words;
  }
  return { added, removed };
}
