// A small toolbox scanner for content tooling: which unlock-table entries a code string uses, plus the
// dialect checks of STYLE §12 that content CI can decide from text alone. It reads the `matches` of
// content/toolbox.ts (contracts §3.3 order: call identifiers, string arguments by callee, mini-notation,
// labels and tempo, dialect). The binding lint is `lintOak` in @oak/grader; content/validate/harness.ts
// uses that one whenever it is implemented and this scanner only as the stand-in until then.
import type {
  FeedbackId,
  LintDiagnostic,
  LintResult,
  MeterId,
  ToolEntry,
  ToolId,
  UnlockableId,
} from "@oak/content-kit";

export interface ScanContext {
  meter: MeterId;
  unlocked: ReadonlySet<string>;
  allowPreview: boolean;
}

interface Hit {
  key: string;
  from: number;
  to: number;
}

const COMPOUND: MeterId[] = ["6/8", "9/8", "12/8"];
const ODD: MeterId[] = ["5/4", "5/8", "7/8", "9/8i"];
/** Callees whose string argument is not mini-notation for the purposes of the scan. */
const NOT_MINI = new Set([
  "bank",
  "scale",
  "dict",
  "mode",
  "compressor",
  "distorttype",
  "transpose",
  "anchor",
]);
const VISUAL = [
  "pianoroll",
  "punchcard",
  "spiral",
  "pitchwheel",
  "_scope",
  "_pianoroll",
  "_punchcard",
  "_spiral",
];
const SILENT = ["leslie", "lrate", "lsize", "amp", "squiz", "triode", "ring"];
/** JS and Strudel names that are not tools (values, not calls). */
const IGNORE_CALLS = new Set(["Number", "String", "Math"]);

const MINI_NAMES: Record<string, string> = {
  " ": "seq",
  "*": "repeat",
  "~": "rest",
  "[]": "sub",
  "@": "elongate",
  _: "hold",
  "!": "replicate",
  "<>": "alt",
  ",": "stack",
  "?": "maybe",
  "..": "range",
  "{}": "polymeter",
  "(k,n)": "euclid",
  "(k,n,r)": "euclid-rot",
};
/** Scanner keys that the lint detects by form, mapped to their rows (contracts §3.2 sub-kind rows). */
const FORM_KEYS: Record<string, string> = {
  "label:name": "tb.label",
  "label:_name": "tb.label.mute",
  "tempo:bpm/3": "tb.meter.3-4",
  "tempo:bpm/2": "tb.meter.2-4",
  "tempo:compound": "tb.meter.compound",
  "tempo:odd": "tb.meter.odd",
  "note:name": "tb.note.names",
  "note:accidental": "tb.note.accidentals",
  "note:number": "tb.note.midi",
  "n:#": "tb.n.chromatic",
  "n:b": "tb.n.chromatic",
  "n:negative": "tb.n.range",
  "n:octave": "tb.n.range",
  "scale:patterned": "tb.scale.patterned",
  "s:pitched": "tb.s.pitched",
  "transpose:string": "tb.transpose.interval",
  "voicing:n-first": "tb.voicing.n",
  "swingBy:patterned": "tb.swing.patterned",
  const: "tb.const",
};

/**
 * Index keys → row IDs, in the convention of the grader's lint: `fn:<name>`, `mini:<op>`, `snd:<name>`,
 * `bank:<name>`, `scale:<mode>`, `dict:<d>`, `mode:<m>`, `chord:<symbol with root C>`, plus the form keys.
 */
export function matchIndex(toolbox: readonly ToolEntry[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (key: string, id: string) => {
    const ids = index.get(key) ?? [];
    if (!ids.includes(id)) index.set(key, [...ids, id]);
  };
  for (const t of toolbox) {
    const parts = t.id.split(".");
    if (t.kind === "sound") {
      const bank = t.id.startsWith("snd.bank.") || /\bbank\(/.test(t.code);
      for (const m of t.matches ?? [parts.slice(bank && t.id.startsWith("snd.bank.") ? 2 : 1).join(".")])
        add(`${bank ? "bank" : "snd"}:${m}`, t.id);
    } else if (t.kind === "scale") for (const m of t.matches ?? []) add(`scale:${m}`, t.id);
    else if (t.kind === "chord") for (const sym of t.code.split(/\s+/)) add(`chord:${sym}`, t.id);
    else if (t.kind === "tool" || t.kind === "template") {
      if (t.id.startsWith("tb.mini.")) add(`mini:${parts.slice(2).join(".")}`, t.id);
      else if (t.id.startsWith("tb.dict.")) add(`dict:${parts.slice(2).join(".")}`, t.id);
      else if (t.id.startsWith("tb.mode.")) add(`mode:${parts.slice(2).join(".")}`, t.id);
      for (const m of t.matches ?? (parts.length === 2 ? [parts[1] as string] : [])) add(`fn:${m}`, t.id);
    }
  }
  for (const [key, id] of Object.entries(FORM_KEYS)) if (toolbox.some((t) => t.id === id)) add(key, id);
  index.set("chord:Cm^7", [...(index.get("chord:Cm^7") ?? [])]);
  for (const [k, v] of index) if (v.length === 0) index.delete(k);
  add("chord:CmM7", "chord.alt");
  return index;
}

/** String literals (double quotes and backticks) with the callee they are the first argument of. */
function stringArgs(code: string): { callee: string | null; text: string; from: number }[] {
  const out: { callee: string | null; text: string; from: number }[] = [];
  const re = /"([^"\n]*)"|`([^`]*)`/g;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const text = m[1] ?? m[2] ?? "";
    const before = code.slice(0, m.index);
    const call = /\.?([A-Za-z_$][\w$]*)\(\s*$/.exec(before);
    out.push({ callee: call ? (call[1] as string) : null, text, from: m.index + 1 });
  }
  return out;
}

function blankStrings(code: string): string {
  return code.replace(/"[^"\n]*"|`[^`]*`|'[^'\n]*'/g, (s) => " ".repeat(s.length));
}
function blankComments(code: string): string {
  return code.replace(/\/\/[^\n]*/g, (s) => " ".repeat(s.length));
}

/** Words of a mini-notation string (sound names, symbols, numbers), without operators. */
function miniWords(text: string): { word: string; at: number }[] {
  const out: { word: string; at: number }[] = [];
  const re = /[A-Za-z0-9#^.+-]+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ word: m[0], at: m.index });
  return out;
}

export function scanHits(code: string, meter: MeterId): Hit[] {
  const hits: Hit[] = [];
  const clean = blankComments(code);
  const bare = blankStrings(clean);
  const hit = (key: string, from: number, to = from + 1) => hits.push({ key, from, to });

  // 2. Call identifiers and bare identifiers that name catalogued values (rev, sine).
  for (const m of bare.matchAll(/(\.?)([A-Za-z_$][\w$]*)/g)) {
    const name = m[2] as string;
    const at = m.index ?? 0;
    const after = bare.slice(at + m[0].length);
    if (/^\s*:/.test(after) && m[1] === "" && /(^|\n)\s*$/.test(bare.slice(0, at))) continue; // a label
    if (["const", "let", "var"].includes(name)) {
      if (name === "const") hit("const", at, at + 5);
      continue;
    }
    hit(`fn:${name}`, at + (m[1] ?? "").length, at + m[0].length);
  }

  // 5. Labels and tempo.
  for (const m of clean.matchAll(/^(\s*)(_?)([A-Za-z$][\w$]*):/gm)) {
    const at = (m.index ?? 0) + (m[1] as string).length;
    hit(m[2] ? "label:_name" : "label:name", at, at + m[0].trim().length);
  }
  for (const m of bare.matchAll(/setcpm\(\s*[\d.]+\s*\/\s*(\d+)\s*\)/g)) {
    const at = m.index ?? 0;
    const unit = m[1];
    const key = COMPOUND.includes(meter)
      ? "tempo:compound"
      : ODD.includes(meter)
        ? "tempo:odd"
        : `tempo:bpm/${unit}`;
    hit(key, at, at + m[0].length);
  }

  // 3–4. String arguments by callee, and mini-notation operators.
  for (const s of stringArgs(clean)) {
    const { callee, text, from } = s;
    const words = miniWords(text);
    if (callee === "s" || callee === "sound") {
      for (const w of words)
        if (/^[a-z]/i.test(w.word))
          hit(`snd:${w.word.replace(/:.*$/, "")}`, from + w.at, from + w.at + w.word.length);
      if (callee === "s" && /(?:note|n|chord)\([^)]*\)[^\n]*\.s\(\s*$/.test(clean.slice(0, from - 1)))
        hit("s:pitched", from, from + text.length);
    } else if (callee === "bank") hit(`bank:${text}`, from, from + text.length);
    else if (callee === "scale") {
      if (text.includes("<")) hit("scale:patterned", from, from + text.length);
      for (const w of text.split(/[\s<>[\]]+/).filter(Boolean)) {
        const mode = w.replace(/!\d+$/, "").split(":").slice(1).join(":");
        if (mode) hit(`scale:${mode}`, from, from + text.length);
      }
    } else if (callee === "chord") {
      for (const w of words) {
        const m = /^([A-G][#b]?)(.*)$/.exec(w.word);
        if (m) hit(`chord:C${m[2]}`, from + w.at, from + w.at + w.word.length);
      }
    } else if (callee === "dict") hit(`dict:${text}`, from, from + text.length);
    else if (callee === "mode") hit(`mode:${text.split(":")[0]}`, from, from + text.length);
    else if (callee === "transpose") hit("transpose:string", from, from + text.length);
    else if (callee === "swingBy") hit("swingBy:patterned", from, from + text.length);
    else if (callee === "n") {
      for (const w of words) {
        if (/^-?\d+[#b]$/.test(w.word)) hit(`n:${w.word.slice(-1)}`, from + w.at);
        else if (/^-\d/.test(w.word)) hit("n:negative", from + w.at);
        else if (/^\d+$/.test(w.word) && Number(w.word) >= 7) hit("n:octave", from + w.at);
      }
    } else if (callee === "note") {
      for (const w of words) {
        if (/^[a-g][#b]-?\d$/i.test(w.word)) hit("note:accidental", from + w.at);
        if (/^[a-g][#b]?-?\d$/i.test(w.word)) hit("note:name", from + w.at);
        else if (/^\d+(\.\d+)?$/.test(w.word)) hit("note:number", from + w.at);
      }
    }
    if (callee && NOT_MINI.has(callee)) continue;
    const op = (key: string, re: RegExp) => {
      for (const m of text.matchAll(re)) hit(`mini:${MINI_NAMES[key]}`, from + (m.index ?? 0));
    };
    if (/\S\s+\S/.test(text)) hit("mini:seq", from);
    op("*", /\*/g);
    op("~", /~/g);
    op("[]", /\[/g);
    op("@", /@/g);
    op("_", /(^|\s)_(?=\s|$|\])/g);
    op("!", /!/g);
    op("<>", /</g);
    op(",", /,(?![^(]*\))/g);
    op("?", /\?/g);
    op("..", /\s\.\.\s/g);
    op("{}", /\{[^}]*\}%/g);
    op("(k,n,r)", /\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/g);
    op("(k,n)", /\(\s*\d+\s*,\s*\d+\s*\)/g);
  }
  for (const m of bare.matchAll(/\bnote\(\s*\d/g)) hit("note:number", m.index ?? 0);
  for (const m of bare.matchAll(/\bn\([^)]*\)\s*\.chord\(/g)) hit("voicing:n-first", m.index ?? 0);
  return hits;
}

function diag(
  id: string,
  severity: LintDiagnostic["severity"],
  from: number,
  to: number,
  code: string,
  message: string,
): LintDiagnostic {
  return {
    id: id as FeedbackId,
    severity,
    range: { from, to },
    line: code.slice(0, from).split("\n").length,
    params: {},
    message,
  };
}

/** Dialect rules of STYLE §12 that can be decided from the text (content profile: all errors). */
export function dialectDiagnostics(code: string): LintDiagnostic[] {
  const out: LintDiagnostic[] = [];
  const clean = blankComments(code);
  const bare = blankStrings(clean);
  const find = (re: RegExp, id: string, message: string, src = bare) => {
    for (const m of src.matchAll(re))
      out.push(diag(id, "error", m.index ?? 0, (m.index ?? 0) + m[0].length, code, message));
  };
  if (!/setcpm\(/.test(bare))
    out.push(diag("code.setcpm-missing", "error", 0, 0, code, "no tempo line: start with setcpm(bpm/4)"));
  find(/^\s*\$:/gm, "code.dollar-label", "use a named lowercase label, not $:");
  find(/^\s*[A-Z][\w$]*:/gm, "code.label-solo-prefix", "labels are lowercase (a capital S solos the line)");
  find(/[A-Za-z_$]\(\s*'[^'\n]*'/g, "code.single-quoted-pattern", "pattern strings use double quotes", clean);
  find(/\.nudge\(/g, "code.nudge-studio-only", ".nudge() is Studio-only; use .late()");
  find(
    new RegExp(`\\.(${VISUAL.join("|")})\\(`, "g"),
    "code.uncatalogued",
    "visual methods are not used in authored code",
  );
  find(
    new RegExp(`\\.(${SILENT.join("|")})\\(`, "g"),
    "code.uncatalogued",
    "a silent control (no audible effect in this Strudel)",
  );
  find(
    /\.(late|early|off)\(\s*"[^"]*\d\/\d[^"]*"/g,
    "code.time-fraction-string",
    "a fraction in a string does not shift: write .late(1/16)",
    clean,
  );
  find(
    /\.swingBy\(\s*"[^"]*\d\/\d[^"]*"/g,
    "code.swing-fraction-string",
    "a fraction in a patterned swing amount gives no swing",
    clean,
  );
  find(/"[^"\n]*\d\.\.\d[^"\n]*"/g, "code.range-spacing", "write ranges with spaces: 0 .. 7", clean);
  find(
    /\.scale\(\s*"[^"<]*[A-G][#b]?\d?\s+[a-z][^"]*"/g,
    "code.scale-spaces",
    'write the scale as "C4:major"',
    clean,
  );
  find(
    /\.scale\(\s*"[A-G][#b]?:[^"]*"/g,
    "code.scale-no-octave",
    'give the scale an octave: "C4:major"',
    clean,
  );
  find(/\.add\(\s*("|\d)/g, "code.add-on-control", "wrap the argument of .add in n(…)", clean);
  find(
    /mode\(\s*"above"|\.voicings\(/g,
    "code.mode-above",
    'mode("above") and .voicings() are not used',
    clean,
  );
  find(
    /chord\(\s*"[^"]*\/[^"]*"/g,
    "code.slash-chord",
    "slash chords are never written inside chord(); use a bass track",
    clean,
  );
  return out;
}

const LOCKED_CODE: Record<string, string> = {
  snd: "code.locked-sound",
  scale: "code.locked-scale",
  chord: "code.locked-chord",
};

/**
 * A `LintResult` from the scanner: every catalogued thing the code uses, what of it is locked in `ctx`,
 * the dialect diagnostics, and `code.uncatalogued` for a call no toolbox row knows.
 */
export function scanLint(code: string, ctx: ScanContext, toolbox: readonly ToolEntry[]): LintResult {
  const index = matchIndex(toolbox);
  const diagnostics = dialectDiagnostics(code);
  const used = new Set<string>();
  const usedAt = new Map<string, Hit>();
  const bareCode = blankStrings(blankComments(code));
  for (const h of scanHits(code, ctx.meter)) {
    const ids = index.get(h.key);
    if (ids) {
      for (const id of ids) {
        used.add(id);
        if (!usedAt.has(id)) usedAt.set(id, h);
      }
      continue;
    }
    const name = h.key.slice(3);
    const isCall = h.key.startsWith("fn:") && /^\s*\(/.test(bareCode.slice(h.to));
    if (
      isCall &&
      !IGNORE_CALLS.has(name) &&
      !VISUAL.includes(name) &&
      !SILENT.includes(name) &&
      name !== "nudge"
    )
      diagnostics.push(
        diag("code.uncatalogued", "error", h.from, h.to, code, `"${name}" is not in Oak's catalog`),
      );
    else if (/^(snd|bank|scale|chord|dict|mode):/.test(h.key))
      diagnostics.push(
        diag(
          h.key.startsWith("chord:") ? "code.unknown-chord" : "code.uncatalogued",
          "error",
          h.from,
          h.to,
          code,
          `"${h.key.split(":").slice(1).join(":")}" is not in Oak's catalog`,
        ),
      );
  }
  const locked = [...used].filter((id) => !ctx.unlocked.has(id));
  if (!ctx.allowPreview)
    for (const id of locked) {
      const h = usedAt.get(id) as Hit;
      const prefix = id.split(".")[0] as string;
      const code_ = id.startsWith("tb.mini.")
        ? "code.locked-mini"
        : (LOCKED_CODE[prefix] ?? "code.locked-tool");
      diagnostics.push(diag(code_, "error", h.from, h.to, code, `${id} is not unlocked here`));
    }
  return {
    ok: !diagnostics.some((d) => d.severity === "error"),
    diagnostics,
    used: [...used] as UnlockableId[],
    locked: locked as UnlockableId[],
    lockedTools: locked.filter((id) => id.startsWith("tb.")) as ToolId[],
  };
}
