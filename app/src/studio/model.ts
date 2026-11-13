// Studio's pure model (ux §2.3 "Studio / Sketchbook"; contracts §3.1 rule 4, §5.10, §11.3): starters and
// templates, the Band layer of a sketch, what the toolbox-aware lint says about locked tools (hints, never a
// block), the strict check an imported version must pass before it runs, liner flags, version labels, the
// tree-ring cover and the export file. No DOM, no network: tested in model.test.ts.

import type { Sketch, SketchVersion, SketchVersionCreate } from "@oak/api";
import type {
  BandDef,
  FlavourId,
  KeySpec,
  LintContext,
  LintResult,
  MeterId,
  ToolEntry,
} from "@oak/content-kit";
import type { BandSetup, MuteMap } from "@oak/strudel";
import { bandCodeAt } from "../../../content/bands/index.ts";

// --- starters -------------------------------------------------------------------------------------

/** Tempo line, one labelled part, only tools from the first lessons (contracts §3.2: U00.L01, U01.L01). */
export const BLANK_CODE = 'setcpm(90/4)\n\ndrums: s("bd hh sd hh")\n';
/** Over a Band: a light part of the learner's own on top of the backing. */
export const OVER_BAND_CODE = 'setcpm(90/4)\n\nhats: s("hh*8")\n';

/** The flavour kits that ship in Wave 2 (contracts §5.10 table: pop and jazz-soul). */
export const STUDIO_FLAVOURS: readonly { id: FlavourId; label: string }[] = [
  { id: "flavour.pop", label: "Pop" },
  { id: "flavour.jazz-soul", label: "Jazz-soul" },
];
export const DEFAULT_FLAVOUR: FlavourId = "flavour.pop";

export function studioFlavour(f: string | null | undefined): FlavourId {
  return STUDIO_FLAVOURS.some((x) => x.id === f) ? (f as FlavourId) : DEFAULT_FLAVOUR;
}

export const DEFAULT_KEY: KeySpec = { tonic: "C", mode: "major" };
export const STUDIO_METERS: readonly MeterId[] = ["4/4", "3/4", "2/4", "6/8"];
export const TONICS = ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
export const MODES = ["major", "minor"] as const;
// Wave 5: 12 and 24 for one and two choruses of a 12-bar blues (U11.L05, C5).
export const LENGTHS = [1, 2, 4, 8, 12, 16, 24, 32, 64] as const;

/** "Sketch 007": one more than the highest number already used (never a duplicate after a delete). */
export function nextSketchTitle(existing: readonly { title: string }[]): string {
  let max = 0;
  for (const s of existing) {
    const m = /^Sketch (\d+)$/.exec(s.title.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Sketch ${String(max + 1).padStart(3, "0")}`;
}

// --- the Band layer -------------------------------------------------------------------------------

export interface SketchBand {
  bandId: BandDef["id"];
  flavour: FlavourId;
  mutes: ("drums" | "bass" | "chords")[];
}

/** A Band's scale argument for a key: `C4:major`, `F#4:minor` (Band code is written as degrees). */
export function bandKeyArg(key: KeySpec | null): string {
  const k = key ?? DEFAULT_KEY;
  return `${k.tonic}4:${k.mode.trim().replace(/\s+/g, ":")}`;
}

/**
 * Whether the learner has reached a lesson, for the Band's stages (contracts §5.10: jazz-soul plays four-note
 * chords and swings once U03 has begun, funk adds four-note chords from U06). A lesson counts once it is
 * started or done; until the course progress loads nothing is reached, so the first stage plays.
 */
export function bandReached(
  progress: { lessons: readonly { lessonId: string; status: string }[] } | null | undefined,
): (from: string) => boolean {
  const reached = new Set(
    (progress?.lessons ?? [])
      .filter((l) => l.status === "in_progress" || l.status === "completed")
      .map((l) => l.lessonId),
  );
  return (from) => reached.has(from);
}

/** The adapter's BandSetup for a sketch's Band: code for the flavour in the sketch's key; the tempo is the sketch's. */
export function bandSetupFor(
  band: SketchBand | null,
  bands: readonly BandDef[],
  key: KeySpec | null,
  /** Whether the learner has reached a lesson (contracts §5.10 Band stages); absent: the first stage. */
  reached: (from: string) => boolean = () => false,
): BandSetup | null {
  if (!band) return null;
  const def = bands.find((b) => b.id === band.bandId);
  const code = def ? bandCodeAt(def, band.flavour, reached) || undefined : undefined;
  if (!def || !code) return null;
  return {
    band: def.id,
    flavour: band.flavour,
    code: code.replaceAll("{{key}}", bandKeyArg(key)),
    followsLearnerKey: false,
    tracks: [...def.roles],
  };
}

/** Bands that fit a meter (a 3/4 sketch takes the waltz vamp only; contracts §5.10 and BAND_METERS). */
export function bandsForMeter(
  bands: readonly BandDef[],
  meter: MeterId,
  meterOf: (id: string) => MeterId,
): BandDef[] {
  return bands.filter((b) => meterOf(b.id) === meter);
}

/** The Band tracks muted in the workbench, as a sketch stores them (`band.drums` → `drums`; solo is not kept). */
export function bandMutesOf(mutes: MuteMap): SketchBand["mutes"] {
  return (["drums", "bass", "chords"] as const).filter((role) => mutes.muted.has(`band.${role}`));
}

/** The workbench's starting mutes for a sketch's stored Band mutes. */
export function muteMapOf(band: SketchBand | null): MuteMap {
  return { muted: new Set((band?.mutes ?? []).map((m) => `band.${m}`)), solo: null };
}

// --- lint: locked tools are hints; imported code is checked strictly ---------------------------------

export function studioLint(
  unlocked: LintContext["unlocked"],
  meter: MeterId,
  key: KeySpec | null,
): LintContext {
  return { profile: "studio", unlocked, allowPreview: false, meter, key };
}

/**
 * The strict profile for code the learner did not type on this machine (contracts §11.3): the Band profile
 * is strict and allows every tool, so only safety and syntax decide. Labels outside the Band's three are
 * not a safety matter and are ignored.
 */
export function strictLint(meter: MeterId, key: KeySpec | null): LintContext {
  return { profile: "band", unlocked: new Set(), allowPreview: true, meter, key };
}

export interface StrictVerdict {
  safe: boolean;
  /** What stops it from running: safety and syntax findings only. */
  problems: { line: number; message: string; id: string }[];
}

/** Safety and syntax errors (`lint.base.*`, `lint.strict.*`, `eval.*`) block; nothing else does. */
export function strictVerdict(result: LintResult): StrictVerdict {
  const problems = result.diagnostics
    .filter((d) => d.severity === "error" && /^(lint|eval)\./.test(d.id))
    .map((d) => ({ line: d.line, message: d.message, id: d.id }));
  return { safe: problems.length === 0, problems };
}

export function needsReview(v: Pick<SketchVersion, "flags"> | null | undefined): boolean {
  return v?.flags.reviewBeforeRun === true;
}

export interface LockedHint {
  id: string;
  /** The code form from the toolbox (`.gain(x)`). */
  code: string;
  kind: ToolEntry["kind"];
  /** The session that unlocks it (`U01.L02`) and its title when known. */
  at: string;
  atTitle: string | null;
  /** 1-based lines where it is used. */
  lines: number[];
}

/** One hint per locked tool the code uses, in order of first use: "unlocks at …" (never a block). */
export function lockedHints(
  result: LintResult | null,
  toolbox: readonly ToolEntry[],
  titles: ReadonlyMap<string, string>,
): LockedHint[] {
  if (!result) return [];
  const byId = new Map(toolbox.map((t) => [t.id as string, t]));
  const hints = new Map<string, LockedHint>();
  for (const d of result.diagnostics) {
    if (!/^code\.locked-/.test(d.id)) continue;
    const id = String(d.params.id ?? "");
    const entry = byId.get(id);
    if (!entry) continue;
    const at = String(d.params.at ?? siteOf(entry));
    const prev = hints.get(id);
    if (prev) {
      if (!prev.lines.includes(d.line)) prev.lines.push(d.line);
      continue;
    }
    hints.set(id, {
      id,
      code: entry.code,
      kind: entry.kind,
      at,
      atTitle: titles.get(at) ?? null,
      lines: [d.line],
    });
  }
  return [...hints.values()];
}

function siteOf(t: Pick<ToolEntry, "unlock">): string {
  const at = t.unlock.at;
  return Array.isArray(at) ? (at[0] ?? "") : at;
}

// --- versions -----------------------------------------------------------------------------------------

export interface VersionDraft {
  code: string;
  bpm: number | null;
  meter: MeterId;
  key: KeySpec | null;
  band: SketchBand | null;
  lockedTools: string[];
  note: string | null;
  ranOk: boolean;
  sessionId: string | null;
}

export function versionBody(d: VersionDraft): SketchVersionCreate {
  return {
    sessionId: d.sessionId,
    code: d.code,
    bpm: d.bpm,
    meter: d.meter,
    key: d.key,
    analysis: null,
    note: d.note,
    tutorAssisted: false,
    band: d.band,
    flags: { lockedTools: [...d.lockedTools], previewTools: [] },
    ranOk: d.ranOk,
  };
}

const sameKey = (a: KeySpec | null, b: KeySpec | null) =>
  (a === null && b === null) || (a !== null && b !== null && a.tonic === b.tonic && a.mode === b.mode);
const sameBand = (a: SketchBand | null, b: SketchBand | null) =>
  (a === null && b === null) ||
  (a !== null &&
    b !== null &&
    a.bandId === b.bandId &&
    a.flavour === b.flavour &&
    [...a.mutes].sort().join() === [...b.mutes].sort().join());

/** Whether the workbench differs from the latest saved version (code, key, meter or Band). */
export function differsFrom(
  latest: Pick<SketchVersion, "code" | "key" | "meter" | "band"> | null,
  now: { code: string; key: KeySpec | null; meter: MeterId; band: SketchBand | null },
): boolean {
  if (!latest) return true;
  return (
    latest.code !== now.code ||
    !sameKey(latest.key, now.key) ||
    (latest.meter ?? "4/4") !== now.meter ||
    !sameBand(latest.band as SketchBand | null, now.band)
  );
}

/** "v7 · Chorus idea", "v3". */
export function versionLabel(v: Pick<SketchVersion, "version" | "note">): string {
  return v.note ? `v${v.version} · ${v.note}` : `v${v.version}`;
}

/** Named versions are the ones saved with Mod+S (they carry a note). */
export function isNamed(v: Pick<SketchVersion, "note">): boolean {
  return typeof v.note === "string" && v.note.trim() !== "";
}

/** "just now", "4 min ago", "3 h ago", then the date. */
export function sinceText(iso: string, now: number, formatDate: (iso: string) => string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return formatDate(iso);
}

// --- liner flags, export ----------------------------------------------------------------------------

/** Liner-note lines a version carries (contracts §3.1 rule 4, §5.10 rule 5, §11.3). */
export function linerFlags(
  v: Pick<SketchVersion, "flags" | "band" | "tutorAssisted"> | null,
  toolbox: readonly ToolEntry[],
  flavourLabel: (id: string) => string,
): string[] {
  if (!v) return [];
  const out: string[] = [];
  const codeOf = new Map(toolbox.map((t) => [t.id as string, t.code]));
  if (v.flags.lockedTools.length > 0)
    out.push(
      `Uses tools not yet unlocked: ${v.flags.lockedTools.map((id) => codeOf.get(id) ?? id).join(", ")}`,
    );
  if (v.band) out.push(`Band: Oak (${flavourLabel(v.band.flavour)} kit)`);
  if (v.tutorAssisted) out.push("Tutor-assisted version");
  if (v.flags.reviewBeforeRun) out.push("Imported: review before running");
  return out;
}

/** A file name for the export: `sketch-007-v4.js`. */
export function exportFileName(title: string, version: number): string {
  const slug =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "sketch";
  return `${slug}-v${version}.js`;
}

/** The exported text: a comment header (title, version, date, liner flags), then the code as it is. */
export function exportText(
  sketch: Pick<Sketch, "title">,
  v: Pick<SketchVersion, "version" | "createdAt" | "code" | "key" | "meter" | "bpm">,
  flags: readonly string[],
): string {
  const facts = [
    v.key ? `${v.key.tonic} ${v.key.mode}` : null,
    v.meter,
    v.bpm ? `${Math.round(v.bpm)} BPM` : null,
  ].filter(Boolean);
  const header = [
    `// ${sketch.title} (v${v.version}, ${v.createdAt.slice(0, 10)})`,
    ...(facts.length > 0 ? [`// ${facts.join(" · ")}`] : []),
    ...flags.map((f) => `// ${f}`),
    "// Made in Oak with Strudel (strudel.cc).",
  ];
  return `${header.join("\n")}\n\n${v.code.replace(/\s+$/, "")}\n`;
}

// --- the tree-ring cover ------------------------------------------------------------------------------

/** FNV-1a: a stable seed from a sketch ID. */
export function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Ring {
  r: number;
  width: number;
  /** 0–2: which of the cover's three tones. */
  tone: number;
  /** Small offset of the ring's centre: tree rings are never quite concentric. */
  dx: number;
  dy: number;
}

/**
 * One ring per version (a sketch grows a ring each time it is saved), at most 12, inside a cover of `size`
 * units. Widths vary with the seed; the outermost ring is the current version.
 */
export function ringsOf(seed: string, versions: number, size = 64): Ring[] {
  const n = Math.max(1, Math.min(12, Math.floor(versions)));
  let h = hashOf(seed);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    return (h % 1000) / 1000;
  };
  // Between the heartwood (r 5) and the bark (r 29 of 64).
  const maxR = size / 2 - 6;
  const minR = 7;
  const rings: Ring[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    rings.push({
      r: minR + (maxR - minR) * (n === 1 ? 0.55 : 0.15 + 0.85 * t),
      width: 1 + next() * 2.2,
      tone: Math.floor(next() * 3) % 3,
      dx: (next() - 0.5) * 2.4 * t,
      dy: (next() - 0.5) * 2.4 * t,
    });
  }
  return rings;
}

/** A harmony view the sketch could use but the learner has not unlocked yet (Wave 4: hint, never block). */
export interface HarmonyViewHint {
  id: string;
  what: string;
  at: string;
}

/**
 * The harmony views still locked for a sketch that plays chords: chord names (U05.L04), Roman
 * numerals (U06.L02), function bands, chord tones and the lead sheet. Nothing when the sketch has no chords.
 */
export function harmonyViewHints(
  hasChords: boolean,
  unlocked: ReadonlySet<string>,
  sites: (id: string) => string | null,
): HarmonyViewHint[] {
  if (!hasChords) return [];
  const rows: [string, string][] = [
    // Wave 5 (c14): the chord-symbol lens opens with its own row at U05.L04, no longer `tb.arp`.
    ["tb.feature.chord-symbols", "Chord names on the roll and the staff"],
    ["tb.feature.rn", "Roman numerals"],
    ["tb.lens.function", "Function bands"],
    ["tb.lens.chord-tones", "Chord tones in the melody"],
    ["tb.feature.leadsheet", "The lead sheet"],
  ];
  return rows.flatMap(([id, what]) => {
    if (unlocked.has(id)) return [];
    const at = sites(id);
    return at ? [{ id, what, at }] : [];
  });
}

/** What a sketch does that the Wave 5 views can show (read from its analysed model and its code). */
export interface SketchSoundFacts {
  /** It plays its tracks through `arrange()` (sections). */
  sections: boolean;
  /** Its code asks for Oak's scope (`.scope()` / `.fscope()`). */
  scope: boolean;
  /** It sets a filter, an envelope or a delay (the probes). */
  filter: boolean;
  envelope: boolean;
}

/** The facts of a code, without running it: sections from the model, the sound controls from the text. */
export function soundFactsOf(code: string, hasSections: boolean): SketchSoundFacts {
  return {
    sections: hasSections,
    scope: /\.f?scope\(\s*\)/.test(code),
    filter: /\.(lpf|hpf|bpf|cutoff|hcutoff|bandf)\(/.test(code),
    envelope: /\.(attack|decay|sustain|release)\(/.test(code),
  };
}

/**
 * Wave 5: the form and sound views a sketch could use, still locked — the section ribbon and the form map
 * (tb.lens.form), Oak's scope (tb.scope), the filter curve (tb.lpf) and the envelope's shape (tb.adsr). A hint
 * with the session that opens each, never a block (the sketch plays as it is).
 */
export function formSoundHints(
  facts: SketchSoundFacts,
  unlocked: ReadonlySet<string>,
  sites: (id: string) => string | null,
): HarmonyViewHint[] {
  const rows: [boolean, string, string][] = [
    [facts.sections, "tb.lens.form", "The section ribbon and the form map"],
    [facts.scope, "tb.scope", "Oak's scope panel"],
    [facts.filter, "tb.lpf", "The filter's curve"],
    [facts.envelope, "tb.adsr", "The envelope's shape"],
  ];
  return rows.flatMap(([wanted, id, what]) => {
    if (!wanted || unlocked.has(id)) return [];
    const at = sites(id);
    return at ? [{ id, what, at }] : [];
  });
}

/** Wave 5: one line saying how to reach a view the sketch can already use (unlocked, not obvious). */
export function formSoundTips(facts: SketchSoundFacts, unlocked: ReadonlySet<string>): string[] {
  const out: string[] = [];
  if (facts.sections && unlocked.has("tb.lens.form"))
    out.push("Click a section on the ribbon to loop it; Shift+E opens the form map and its energy curve.");
  if ((facts.filter || facts.envelope) && unlocked.has("tb.scope") && !facts.scope)
    out.push("Shift+W opens the scope: it draws the wave and the curve of your filter or envelope.");
  return out;
}
