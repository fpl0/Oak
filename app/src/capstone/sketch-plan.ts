// CF-A.S1 "Start from a sketch" (content/specs/CF.md): one of the learner's own sketches becomes the verse of the
// single. Each labelled part of the sketch is kept as it is, as that part's verse const; the chorus and the bridge
// start as the same notes under their own names (so the plan plays for its whole length and the form already reads
// verse, chorus and bridge), and every part gets one `arrange()` with the same sections. The sketch's tempo line,
// its key (inside its `.scale()` calls) and its other consts stay untouched. Pure text work on the STYLE shape of a
// sketch (labelled statements at column 0); a sketch with no labelled part cannot be a verse and says so.

/** The sections of the plan a sketch grows into, in order, with their bars (48 bars: 1:55 at 100 BPM). */
export const SKETCH_PLAN: readonly { section: "Verse" | "Chorus" | "Bridge"; bars: number }[] = [
  { section: "Verse", bars: 8 },
  { section: "Chorus", bars: 8 },
  { section: "Verse", bars: 8 },
  { section: "Chorus", bars: 8 },
  { section: "Bridge", bars: 8 },
  { section: "Chorus", bars: 8 },
];

export interface SketchPart {
  /** The label as written (`mel`, `drums`). */
  label: string;
  /** The expression after the label, as written (it may span lines). */
  expr: string;
}

export interface SketchRead {
  /** The tempo line (`setcpm(96/4)`), when the sketch has one. */
  tempo: string | null;
  /** Everything else at the top level that is not a labelled part (consts the parts use, comments). */
  preamble: string[];
  parts: SketchPart[];
}

// A labelled part (`mel:`), or an anonymous one (`$:`), which the plan names `part`.
const LABEL = /^([A-Za-z][\w$]*|\$)[ \t]*:[ \t]*(.*)$/;
const TOP = /^(?:const|let|var|function|setcpm|setcps|\/\/|\/\*|\$:|[A-Za-z_$][\w$]*[ \t]*:)/;

/** The labelled parts of a sketch and what stands beside them. Muted parts (`_mel:`, `mel_:`) are left out. */
export function readSketch(code: string): SketchRead {
  const lines = code.replace(/\r\n?/g, "\n").split("\n");
  const out: SketchRead = { tempo: null, preamble: [], parts: [] };
  let i = 0;
  const block = (first: string): string => {
    const buf = [first];
    while (i + 1 < lines.length) {
      const next = lines[i + 1] as string;
      if (next.trim() === "" || TOP.test(next)) break;
      buf.push(next);
      i++;
    }
    return buf.join("\n");
  };
  for (; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.trim() === "") continue;
    if (/^setcp[ms]\(/.test(line)) {
      const text = block(line);
      if (out.tempo === null) out.tempo = text;
      continue;
    }
    if (/^_/.test(line) || /^[A-Za-z$][\w$]*_[ \t]*:/.test(line)) {
      block(line);
      continue;
    }
    const m = LABEL.exec(line);
    if (m && !/^(?:const|let|var)\b/.test(line)) {
      const text = block(m[2] as string).trim();
      if (text) out.parts.push({ label: m[1] === "$" ? "part" : (m[1] as string), expr: text });
      continue;
    }
    out.preamble.push(block(line));
  }
  return out;
}

/** `leadGtr` → `leadgtr`: a part's name as the front of its section consts (the section is read from the end). */
export function partPrefix(label: string): string {
  const p = label.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return /^[a-z]/.test(p) ? p : `part${p}`;
}

export type SketchPlan = { ok: true; code: string; bars: number } | { ok: false; problem: string };

/**
 * The single's first draft grown from a sketch: the sketch's parts as verse consts in the plan of `SKETCH_PLAN`.
 * Two parts with the same name after folding (`Mel` and `mel`) keep apart by a number.
 */
export function planFromSketch(code: string): SketchPlan {
  const sk = readSketch(code);
  if (sk.parts.length === 0)
    return {
      ok: false,
      problem:
        "This sketch has no labelled part (a line that starts `mel:` or `drums:`), so it has no verse to grow from.",
    };
  if (sk.parts.some((p) => /\barrange\(/.test(p.expr)))
    return {
      ok: false,
      problem:
        "This sketch is already arranged in sections. Start from the plan and bring its sections over.",
    };
  const used = new Map<string, number>();
  const named = sk.parts.map((p) => {
    const base = partPrefix(p.label);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const prefix = n === 1 ? base : `${base}${String.fromCharCode(96 + n)}`;
    // A second part of the same name (two `$:` lines) is labelled by its own prefix: one label, one line.
    return { ...p, prefix, label: n === 1 ? p.label : prefix };
  });
  const lines: string[] = [sk.tempo ?? "setcpm(100/4)", ""];
  if (sk.preamble.length > 0) lines.push(...sk.preamble, "");
  lines.push("// The verse is your sketch. The chorus and the bridge start as the same notes: rewrite them.");
  for (const p of named) {
    lines.push(`const ${p.prefix}Verse = ${p.expr}`);
    lines.push(`const ${p.prefix}Chorus = ${p.prefix}Verse`);
    lines.push(`const ${p.prefix}Bridge = ${p.prefix}Verse`);
  }
  lines.push("");
  for (const p of named) {
    const sections = SKETCH_PLAN.map((s) => `[${s.bars}, ${p.prefix}${s.section}]`).join(", ");
    lines.push(`${p.label}: arrange(${sections})`);
  }
  return { ok: true, code: lines.join("\n"), bars: SKETCH_PLAN.reduce((n, s) => n + s.bars, 0) };
}

/** The note on the first draft of a single grown from a sketch: `Grown from “Dorian groove”`. */
export const GROWN_FROM = "Grown from";

/** The "Grown from …" line of a draft, read from its versions' notes (the first version carries it). */
export function grownFromLine(versions: readonly { note: string | null }[]): string | null {
  const note = versions.find((v) => v.note?.startsWith(`${GROWN_FROM} `))?.note ?? null;
  return note ? (/[.!?]$/.test(note) ? note : `${note}.`) : null;
}
