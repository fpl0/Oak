// The Toolbox's pure model (ux §5.1; contracts §3): every entry of content/toolbox.ts grouped by kind, what is
// unlocked, the condition that unlocks the rest (the session, START rows, the voicing gate, alternative
// sites), which lessons use a tool (read from the generated examples by the one lint), and the small things
// the tool page needs (the demo's meter and tempo). No DOM: tested in model.test.ts.
import type { LintResult, MeterId, ToolEntry, UnlockableId } from "@oak/content-kit";

/** Kind order on the page: code first, then what it plays, then the app's own features. */
export const KIND_ORDER: readonly ToolEntry["kind"][] = [
  "tool",
  "sound",
  "scale",
  "chord",
  "feature",
  "lens",
  "template",
];

export const KIND_LABEL: Record<ToolEntry["kind"], string> = {
  tool: "Code",
  sound: "Sounds",
  scale: "Scales",
  chord: "Chords",
  feature: "Features",
  lens: "Lenses",
  template: "Templates",
};

export interface ToolSection {
  kind: ToolEntry["kind"];
  label: string;
  tools: ToolEntry[];
  unlocked: number;
}

/** Sections in kind order; inside a section, unlocked first (in course order), then locked in course order. */
export function groupTools(
  toolbox: readonly ToolEntry[],
  unlocked: ReadonlySet<string>,
  opts: { kind?: ToolEntry["kind"] | "all"; showLocked?: boolean; query?: string } = {},
): ToolSection[] {
  const needle = (opts.query ?? "").trim().toLowerCase();
  const order = new Map(toolbox.map((t, i) => [t.id as string, i]));
  const sections: ToolSection[] = [];
  for (const kind of KIND_ORDER) {
    if (opts.kind && opts.kind !== "all" && opts.kind !== kind) continue;
    const all = toolbox.filter((t) => t.kind === kind);
    const tools = all
      .filter((t) => opts.showLocked !== false || unlocked.has(t.id))
      .filter(
        (t) =>
          !needle ||
          t.code.toLowerCase().includes(needle) ||
          t.concept.toLowerCase().includes(needle) ||
          t.catalog.meaning.toLowerCase().includes(needle) ||
          t.id.toLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          Number(unlocked.has(b.id)) - Number(unlocked.has(a.id)) ||
          (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      );
    if (tools.length === 0) continue;
    sections.push({
      kind,
      label: KIND_LABEL[kind],
      tools,
      unlocked: all.filter((t) => unlocked.has(t.id)).length,
    });
  }
  return sections;
}

/** Every session that can unlock an entry (one, or alternatives such as "U10.L09 or A1.L04"). */
export function sitesOf(t: Pick<ToolEntry, "unlock">): string[] {
  const at = t.unlock.at;
  return Array.isArray(at) ? [...at] : [at];
}

/** "U01.L02 · Rests and accents" (or the bare ID when the syllabus has no title for it). */
export function siteText(site: string, titles: ReadonlyMap<string, string>): string {
  const title = titles.get(site) ?? titles.get(site.replace(/\.S\d+$/, ""));
  return title ? `${site} · ${title}` : site;
}

/** The learner-facing unlock condition (contracts §3.1 rules 2, 6, 11, 12). */
export function unlockText(t: Pick<ToolEntry, "unlock">, titles: ReadonlyMap<string, string>): string {
  const sites = sitesOf(t).map((s) => siteText(s, titles));
  const where = sites.join(" or ");
  const start = t.unlock.when === "start";
  let text = start ? `Unlocks when you start ${where}` : `Unlocks when you complete ${where}`;
  const fallback = t.unlock.fallbackAt;
  if (fallback) text += `, or when you complete ${siteText(fallback, titles)} if that comes first`;
  if (t.unlock.condition) {
    const pct = Math.round(t.unlock.condition.minScore * 100);
    text += `, once the hand-voiced cadence check (${t.unlock.condition.exercise}) scores ${pct}% or more without the answer revealed`;
  }
  return `${text}.`;
}

/** "U01.L01" from an example ref ("U01.L01@groove", "U01.L01/find-the-beat#item:0"). */
export function lessonOfRef(ref: string): string | null {
  const m = /^((?:U\d{2}|[A-Z]{1,2}\d?)\.(?:L\d{2}|CP\d?|S\d+)|C\d+|U\d{2}\.CP)/.exec(ref);
  return m ? (m[1] as string) : null;
}

export interface ExampleRow {
  ref: string;
  code: string;
  meter?: MeterId;
}

/**
 * Which lessons use which entry: each authored code snippet is linted (any profile reports `used`), and its
 * lesson is credited for every catalogued thing it uses. Lessons come out in course order.
 */
export function usageFrom(rows: readonly { ref: string; used: readonly string[] }[]): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const lesson = lessonOfRef(r.ref);
    if (!lesson) continue;
    for (const id of r.used) {
      const set = out.get(id) ?? new Set<string>();
      set.add(lesson);
      out.set(id, set);
    }
  }
  return new Map([...out].map(([id, set]) => [id, [...set].sort()]));
}

export function usedOf(result: LintResult): string[] {
  return [...new Set(result.used as readonly UnlockableId[] as readonly string[])];
}

/** The demo's meter, read from its tempo line (`setcpm(108/3)` is 3/4; STYLE §8). */
export function demoMeter(code: string): MeterId {
  const m = /setcpm\(\s*[\d.]+\s*\/\s*(\d+)\s*\)/.exec(code);
  if (m?.[1] === "3") return "3/4";
  if (m?.[1] === "2") return /6\/8|dotted/.test(code) ? "6/8" : "2/4";
  return "4/4";
}

/** The demo's own key from its first `.scale("D4:major")`, for degree labels. */
export function demoKey(code: string): { tonic: string; mode: string } | null {
  const m = /\.scale\(\s*"([A-G][#b]?)-?\d?:([a-z:]+)/.exec(code);
  if (!m) return null;
  return { tonic: m[1] as string, mode: (m[2] as string).replace(/:/g, " ") };
}

/** A title for a sketch started from a tool page. */
export function tryTitle(t: Pick<ToolEntry, "code">): string {
  const name = t.code.length > 40 ? `${t.code.slice(0, 39)}…` : t.code;
  return `Trying ${name}`;
}

/** The I–IV–V–I arpeggio of the unlock moment (ux §7.7), in C, as MIDI notes with start offsets in seconds. */
export function unlockArpeggio(tonic = 60): { midi: number; at: number; dur: number }[] {
  const chords = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12]];
  const out: { midi: number; at: number; dur: number }[] = [];
  let at = 0;
  for (const c of chords) {
    for (const iv of c) {
      out.push({ midi: tonic + iv, at, dur: 0.18 });
      at += 0.07;
    }
    at += 0.06;
  }
  return out;
}

/** The body of `sketches.create` for "Try it in Studio": a free sketch starting from the tool's demo (or an edit of it). */
export function toolSketchBody(tool: Pick<ToolEntry, "code">, code: string) {
  return {
    title: tryTitle(tool),
    originKind: "free" as const,
    originId: null,
    sessionId: null,
    code,
    bpm: null,
    meter: demoMeter(code),
    key: demoKey(code) as { tonic: string; mode: "major" } | null,
    analysis: null,
    note: `From the toolbox: ${tool.code}`,
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: false,
  };
}
