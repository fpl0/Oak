// /dev/listen (architecture §3.8): every code example of the course with OK / flag verdicts. The manifest
// is `content/.generated/examples.json` (`{ref, code, hash, bars, key, meter}`) when the content build has
// run, otherwise it is collected from the lesson files' step examples. Verdicts persist through a
// `ListenStore`: the API has no listen-log endpoint yet, so the store is localStorage (reported). Pure
// except for the storage object it is given.
import type { KeySpec, LessonDef, MeterId } from "@oak/content-kit";

export interface ListenExample {
  /** `U01.L02@slug` (or the generated ref). */
  ref: string;
  code: string;
  /** Content hash of `code`: a verdict is stale once the code changes. */
  hash: string;
  bars: number;
  key: KeySpec | null;
  meter: MeterId;
  /** Unit of the lesson ("U01"), for the filter. */
  unit: string;
  preview?: boolean;
}

export const VERDICTS = ["ok", "wrong-sound", "wrong-notation", "weak", "wrong-theory"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VERDICT_LABEL: Record<Verdict, string> = {
  ok: "OK",
  "wrong-sound": "Wrong sound",
  "wrong-notation": "Wrong notation",
  weak: "Musically weak",
  "wrong-theory": "Wrong theory",
};

export interface ListenMark {
  ref: string;
  /** Hash of the code the verdict was given on. */
  hash: string;
  verdict: Verdict;
  note: string;
  at: string;
}

/** FNV-1a 32-bit of the code, hex: deterministic, synchronous, isomorphic. */
export function codeHash(code: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function unitOf(ref: string): string {
  return ref.split(".")[0] ?? ref;
}

/** Normalises `examples.json` entries (unknown shape on disk) into examples. */
export function fromGenerated(json: unknown): ListenExample[] {
  if (!Array.isArray(json)) return [];
  const out: ListenExample[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.ref !== "string" || typeof e.code !== "string") continue;
    const key = e.key && typeof e.key === "object" ? (e.key as KeySpec) : null;
    out.push({
      ref: e.ref,
      code: e.code,
      hash: typeof e.hash === "string" ? e.hash : codeHash(e.code),
      bars: typeof e.bars === "number" ? e.bars : 4,
      key,
      meter: (typeof e.meter === "string" ? e.meter : "4/4") as MeterId,
      unit: unitOf(e.ref),
    });
  }
  return out;
}

/** The step examples of lesson definitions (fallback when the content build has not run). */
export function fromLessons(lessons: readonly LessonDef[]): ListenExample[] {
  const out: ListenExample[] = [];
  for (const l of lessons) {
    for (const step of l.steps) {
      const ex = step.example;
      if (!ex) continue;
      const item: ListenExample = {
        ref: `${l.id}@${ex.id}`,
        code: ex.code,
        hash: codeHash(ex.code),
        bars: ex.bars,
        key: l.key,
        meter: l.meter,
        unit: unitOf(l.id),
      };
      if (ex.preview) item.preview = true;
      out.push(item);
    }
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}

export type ListenStatus = "unmarked" | "ok" | "flagged" | "changed";

/** "changed": the code moved on since its verdict, so the verdict no longer counts. */
export function statusOf(ex: ListenExample, mark: ListenMark | undefined): ListenStatus {
  if (!mark) return "unmarked";
  if (mark.hash !== ex.hash) return "changed";
  return mark.verdict === "ok" ? "ok" : "flagged";
}

export interface ListenFilter {
  unit: string | null;
  /** Only what still needs a listen: unmarked or changed since its verdict. */
  needsListen: boolean;
}

export function filterExamples(
  examples: readonly ListenExample[],
  marks: Readonly<Record<string, ListenMark>>,
  f: ListenFilter,
): ListenExample[] {
  return examples.filter((e) => {
    if (f.unit && e.unit !== f.unit) return false;
    if (f.needsListen) {
      const s = statusOf(e, marks[e.ref]);
      return s === "unmarked" || s === "changed";
    }
    return true;
  });
}

/** Where verdicts live. */
export interface ListenStore {
  readonly kind: "api" | "local";
  load(): Promise<Record<string, ListenMark>>;
  save(mark: ListenMark): Promise<void>;
}

export const LISTEN_STORAGE_KEY = "oak.dev.listen-marks.v1";

/** localStorage (or any Storage-like object). */
export function localListenStore(storage: Pick<Storage, "getItem" | "setItem">): ListenStore {
  const read = (): Record<string, ListenMark> => {
    try {
      const raw = storage.getItem(LISTEN_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? (parsed as Record<string, ListenMark>) : {};
    } catch {
      return {};
    }
  };
  return {
    kind: "local",
    load: async () => read(),
    save: async (mark) => {
      const all = read();
      all[mark.ref] = mark;
      storage.setItem(LISTEN_STORAGE_KEY, JSON.stringify(all));
    },
  };
}

/** The marks as the JSON file content/.qa/listen-log.json would hold (for the export button). */
export function exportMarks(marks: Readonly<Record<string, ListenMark>>): string {
  const sorted = Object.keys(marks)
    .sort()
    .map((k) => marks[k]);
  return `${JSON.stringify(sorted, null, 2)}\n`;
}
