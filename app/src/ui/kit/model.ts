// Pure logic behind the Wave 4 kit pieces (FineSlider, FileDropZone, Checklist, VersionList, TransportBar), kept
// apart from React so the rules are unit-tested (model.test.ts).

// --- FineSlider ------------------------------------------------------------------------------------

export interface SliderSteps {
  /** Arrow keys and pointer snapping. */
  step: number;
  /** Alt+arrow: the fine step (defaults to `step`). */
  fine?: number | undefined;
  /** Shift+arrow, PageUp and PageDown: the coarse step (defaults to 10 × `step`). */
  coarse?: number | undefined;
}

export interface SliderKey {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

/** Decimal places of a step (0.05 → 2), so sums of steps never show 0.30000000000000004. */
export function decimalsOf(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  if (s.includes("e-")) return Number(s.split("e-")[1] ?? 0);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** `v` clamped to [min, max] and rounded to the finest step's grid (counted from `min`). */
export function snapValue(v: number, min: number, max: number, grid: number): number {
  const clamped = Math.min(max, Math.max(min, v));
  if (!(grid > 0)) return clamped;
  const snapped = min + Math.round((clamped - min) / grid) * grid;
  const places = Math.max(decimalsOf(grid), decimalsOf(min));
  return Math.min(max, Math.max(min, Number(snapped.toFixed(places))));
}

/**
 * The value a key press moves the slider to, or `null` when the key is not the slider's. Arrows move one step
 * (Alt: the fine step; Shift: the coarse step), PageUp/PageDown the coarse step, Home/End to the ends. A key
 * with Mod or Ctrl belongs to someone else (the global keymap).
 */
export function sliderKeyValue(
  e: SliderKey,
  value: number,
  min: number,
  max: number,
  steps: SliderSteps,
): number | null {
  if (e.metaKey || e.ctrlKey) return null;
  const fine = steps.fine ?? steps.step;
  const coarse = steps.coarse ?? steps.step * 10;
  const grid = Math.min(fine, steps.step);
  const delta = e.altKey ? fine : e.shiftKey ? coarse : steps.step;
  switch (e.key) {
    case "ArrowRight":
    case "ArrowUp":
      return snapValue(value + delta, min, max, grid);
    case "ArrowLeft":
    case "ArrowDown":
      return snapValue(value - delta, min, max, grid);
    case "PageUp":
      return snapValue(value + coarse, min, max, grid);
    case "PageDown":
      return snapValue(value - coarse, min, max, grid);
    case "Home":
      return min;
    case "End":
      return max;
    default:
      return null;
  }
}

/** The value under a pointer at `fraction` (0 = left end, 1 = right end) of the track. */
export function sliderPointerValue(fraction: number, min: number, max: number, step: number): number {
  const f = Math.min(1, Math.max(0, fraction));
  return snapValue(min + f * (max - min), min, max, step);
}

/** Where `v` sits along the track, 0 to 1. */
export function sliderFraction(v: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (v - min) / (max - min)));
}

// --- FileDropZone -----------------------------------------------------------------------------------

export interface FileLike {
  name: string;
  size: number;
  type: string;
}

export type FileProblem =
  | { code: "type"; message: string }
  | { code: "size"; message: string }
  | { code: "empty"; message: string };

const BYTE_UNITS = ["KB", "MB", "GB"] as const;
/** 1.5 MB, 300 MB, 820 KB: binary units with one decimal under 10. */
export function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < BYTE_UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${BYTE_UNITS[i]}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

/**
 * Whether a file matches an `accept` list in the `<input accept>` syntax: extensions (".wav"), exact types
 * ("audio/wav") and wildcards ("audio/*"). An empty list accepts everything.
 */
export function acceptsFile(file: FileLike, accept: readonly string[]): boolean {
  if (accept.length === 0) return true;
  const ext = extensionOf(file.name);
  const type = file.type.toLowerCase();
  return accept.some((a) => {
    const rule = a.trim().toLowerCase();
    if (rule.startsWith(".")) return ext === rule;
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

/**
 * Why a dropped or chosen file cannot be taken, in plain words, or `null` when it can. `kinds` names the
 * accepted files for the message ("MP3, WAV, FLAC, OGG or M4A").
 */
export function fileProblem(
  file: FileLike,
  opts: { accept?: readonly string[]; maxBytes?: number | undefined; kinds?: string | undefined },
): FileProblem | null {
  if (file.size === 0) return { code: "empty", message: `“${file.name}” is empty.` };
  if (opts.accept && !acceptsFile(file, opts.accept))
    return {
      code: "type",
      message: `“${file.name}” is not a file Oak can open here${opts.kinds ? `: use ${opts.kinds}` : ""}.`,
    };
  if (opts.maxBytes !== undefined && file.size > opts.maxBytes)
    return {
      code: "size",
      message: `“${file.name}” is ${bytesLabel(file.size)}; the limit is ${bytesLabel(opts.maxBytes)}.`,
    };
  return null;
}

// --- Checklist --------------------------------------------------------------------------------------

/**
 * One line's state. `met` and `unmet` are graded results; `partial` is part-way; `pending` waits for a check
 * that has not run; `running` is being checked; `revealed` was shown, not earned; `locked` opens after the one
 * before; `optional` never counts.
 */
export type ChecklistState =
  | "met"
  | "partial"
  | "unmet"
  | "pending"
  | "running"
  | "revealed"
  | "locked"
  | "optional";

export const CHECKLIST_STATE_LABEL: Readonly<Record<ChecklistState, string>> = {
  met: "Met",
  partial: "Part-way",
  unmet: "Not yet",
  pending: "Not checked yet",
  running: "Checking",
  revealed: "Shown",
  locked: "Opens after the one before",
  optional: "Optional",
};

/** "3 of 5 met": counts every line except optional ones. */
export function checklistSummary(states: readonly ChecklistState[]): {
  met: number;
  total: number;
  text: string;
} {
  const counted = states.filter((s) => s !== "optional");
  const met = counted.filter((s) => s === "met").length;
  return { met, total: counted.length, text: `${met} of ${counted.length} met` };
}

// --- VersionList ------------------------------------------------------------------------------------

/** "v3", "v3 · Bridge idea". */
export function versionLabel(version: number, name?: string | null): string {
  const n = name?.trim();
  return n ? `v${version} · ${n}` : `v${version}`;
}

/** The roving index after a key in a vertical list, or `null` for other keys. */
export function listKeyIndex(key: string, at: number, length: number): number | null {
  if (length === 0) return null;
  switch (key) {
    case "ArrowDown":
      return Math.min(length - 1, at + 1);
    case "ArrowUp":
      return Math.max(0, at - 1);
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return null;
  }
}

// --- TransportBar ---------------------------------------------------------------------------------

/** 0.75 → "75 %". */
export function rateLabel(rate: number): string {
  return `${Math.round(rate * 100)} %`;
}

/** +2 st, −3 st, 0 st (a real minus sign). */
export function semitoneLabel(st: number): string {
  if (st === 0) return "0 st";
  return `${st > 0 ? "+" : "−"}${Math.abs(st)} st`;
}

/** +15¢, −5¢, 0¢. */
export function centsLabel(c: number): string {
  if (c === 0) return "0¢";
  return `${c > 0 ? "+" : "−"}${Math.abs(Math.round(c))}¢`;
}

/** 83.4 s → "1:23"; 3725 s → "1:02:05". */
export function clockLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
