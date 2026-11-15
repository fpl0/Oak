// The answer guard for the Wave 7 step kinds (wave7.md §11; contracts §10.4, §10.5): on a graded step below the
// reveal rung, nothing the model is given or writes back may name the expected answer in any spelling the course
// teaches. answer-guard.ts calls these; each returns the forms of one answer, never judging the step itself.
//
//  - a jazz chord name (`text.jazz-chord`): the symbol in every spelling the learner can choose (D–7 = Dm7 = Dmin7,
//    Cø7 = Cm7♭5, C∆7 = C^7 = Cmaj7, G7alt = Galt);
//  - a voicing shape (`keyboard.voicing`, a staff voicing, a choice of shapes): its name and how it is built
//    ("rootless A", "3rd at the bottom", "drop-2", "second from the top dropped");
//  - a grouping (`grouping` widget: 2+2+3), a Euclidean rhythm (`euclid` widget: (3,8), (5,16,10)) and the tresillo
//    or cinquillo they are;
//  - the standard choices of stage G and H: a swing feel and its ratio, a microtiming side, a clave type and
//    direction, a tension over its chord, a sound comparison;
//  - in code: a `.swingBy()` amount and the ratio it makes, a decimal `.late()` / `.early()`, a Euclidean rhythm in
//    mini-notation or `.euclid()`, a voicing's `.anchor()`, `.offset()` and `.mode()`.
// Pure.

/** One withheld form: a label, its source, the words it is made of, and the AnswerForm extras. */
export interface W7Form {
  label: string;
  source: string;
  tokens: string[];
  sentence?: boolean;
  accept?: (m: RegExpExecArray) => boolean;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const flat = (s: string) => s.replace(/♭/g, "b").replace(/♯/g, "#").replace(/°/g, "o");
/** Not glued to a letter, digit or chord sign on either side. */
const WORD_L = "(?<![A-Za-z0-9#♯♭°ø∆Δ+/^–-])";
const WORD_R = "(?![A-Za-z0-9#♯°ø∆Δ+/^])";
const ci = (w: string) => w.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);

// --- jazz chord symbols -----------------------------------------------------------------------------------------

/**
 * Each jazz quality in the spellings a lead sheet, Oak's code and the learner's chosen style write (@oak/notation
 * `chordSymbolText`: lead-sheet and jazz glyphs). Keys are canonical suffixes after the root.
 */
const QUALITY_SPELLINGS: readonly (readonly string[])[] = [
  ["maj7", "^7", "M7", "∆7", "∆", "Δ7", "Δ", "ma7", "Maj7", "maj"],
  ["m7", "-7", "–7", "min7", "mi7"],
  ["m7b5", "ø7", "ø", "-7b5", "–7b5", "min7b5", "m7(b5)"],
  ["o7", "dim7", "°7"],
  ["7alt", "alt", "7(alt)"],
  ["maj9", "^9", "∆9", "Δ9", "M9"],
  ["m9", "-9", "–9", "min9"],
  ["m11", "-11", "–11", "min11"],
  ["m6", "-6", "–6", "min6"],
  ["69", "6/9", "6add9"],
  ["mMaj7", "m^7", "m(maj7)", "-∆7", "–∆7", "-Δ7", "mM7", "minMaj7", "m∆7"],
  ["7sus4", "7sus", "9sus4"],
  ["sus4", "sus"],
  ["7b9", "7(b9)"],
  ["7#9", "7(#9)"],
  ["7#11", "7(#11)"],
  ["7b13", "7(b13)"],
  ["maj7#11", "^7#11", "∆7#11", "∆#11"],
  ["13"],
  ["9"],
  ["11"],
  ["7"],
  ["6"],
  ["m"],
];

const ROOT = /^([A-G])([#b♯♭]?)(.*)$/;

/** The spellings of a chord's quality suffix, or null when the suffix is not a jazz quality Oak writes. */
export function qualitySpellings(suffix: string): readonly string[] | null {
  const f = flat(suffix);
  return QUALITY_SPELLINGS.find((row) => row.some((x) => flat(x) === f)) ?? null;
}

/** One spelling as a pattern: b/♭ and #/♯ are one sign after a digit; everything else literal. */
function spellSuffix(x: string): string {
  let out = "";
  for (let i = 0; i < x.length; i++) {
    const ch = x[i] as string;
    const prev = x[i - 1] ?? "";
    const next = x[i + 1] ?? "";
    if ((ch === "b" || ch === "♭") && /[\d(]/.test(prev) && /\d/.test(next)) out += "[b♭]";
    else if (ch === "#" || ch === "♯") out += "[#♯]";
    else out += esc(ch);
  }
  return out;
}

/**
 * The words a jazz chord may arrive as, for the streaming guard: every spelling, and the root alone (a jazz minor is
 * often written with an en dash, D–7, which the guard reads as a separator, so "D" before it must be held).
 */
export function jazzChordTokens(symbol: string): string[] {
  const m = ROOT.exec(flat(symbol.trim()));
  if (!m) return [];
  const spellings = (m[3] as string) === "" ? null : qualitySpellings(m[3] as string);
  if (spellings === null) return [];
  const root = `${m[1]}${m[2] ?? ""}`;
  return [root, ...spellings.map((q) => flat(`${root}${q}`))];
}

/** A jazz chord symbol in every spelling of its quality (`Dm7`: D–7, Dmin7, D-7, [[chord:Dm7]]), or null. */
export function jazzChordPattern(symbol: string, bare = true): string | null {
  const m = ROOT.exec(flat(symbol.trim()));
  if (!m) return null;
  const suffix = m[3] as string;
  if (suffix === "" || /\//.test(suffix)) return null;
  const spellings = qualitySpellings(suffix);
  if (spellings === null) return null;
  const acc = m[2] === "b" ? "[b♭]" : m[2] === "#" ? "[#♯]" : "";
  const alts = [...spellings]
    .sort((a, b) => b.length - a.length)
    .map(spellSuffix)
    .join("|");
  const body = `${m[1]}${acc}(?:${alts})`;
  const token = `\\[\\[chord:\\s*${body}\\s*\\]\\]`;
  return bare ? `(?:${token}|${WORD_L}${body}${WORD_R})` : token;
}

// --- voicing shapes ---------------------------------------------------------------------------------------------

/** How prose names and describes each voicing shape (content-kit `VOICING_SHAPES`, @oak/theory `voicingType`). */
const SHAPE_PHRASES: Readonly<Record<string, string[]>> = {
  shell: [
    "shell(?:[\\s-]+voicings?|s)?",
    "root,?\\s+(?:the\\s+)?3rd\\s+and\\s+(?:the\\s+)?7th",
    "1[\\s,-]+3[\\s,-]+7|1[\\s,-]+7[\\s,-]+3",
  ],
  "rootless-a": [
    "(?:rootless\\s+)?A[\\s-]+(?:voicing|form|shape)s?",
    "rootless\\s+A",
    "3rd\\s+(?:at|on)\\s+the\\s+bottom",
    "3[\\s,-]+5[\\s,-]+7[\\s,-]+9",
  ],
  "rootless-b": [
    "(?:rootless\\s+)?B[\\s-]+(?:voicing|form|shape)s?",
    "rootless\\s+B",
    "7th\\s+(?:at|on)\\s+the\\s+bottom",
    "7[\\s,-]+9[\\s,-]+3[\\s,-]+5",
  ],
  "drop-2": [
    "drop[\\s-]*(?:2|two)",
    "second(?:[\\s-]+note)?\\s+from\\s+the\\s+top\\s+(?:dropped|down|moved)",
    "dropp?(?:ed|ing)?\\s+(?:an|one)\\s+octave",
  ],
  close: ["close(?:[\\s-]+position|[\\s-]+voicing)", "(?:inside|within)\\s+(?:one|an|a\\s+single)\\s+octave"],
};

/** The shape an answer names ("rootless-a", "drop-2", "Shell (root, 3rd, 7th)", "voicing: rootless-b"), or null. */
export function voicingShapeAnswer(answer: string): string | null {
  const t = answer
    .trim()
    .toLowerCase()
    .replace(/^voicing:\s*/, "");
  for (const id of Object.keys(SHAPE_PHRASES))
    if (t === id || t.startsWith(`${id} `) || t.startsWith(`${id}(`) || t.startsWith(`${id},`)) return id;
  if (/^rootless a\b|^a voicing\b/.test(t)) return "rootless-a";
  if (/^rootless b\b|^b voicing\b/.test(t)) return "rootless-b";
  if (/^drop[\s-]?2\b/.test(t)) return "drop-2";
  if (/^shell\b/.test(t)) return "shell";
  if (/^close\b/.test(t)) return "close";
  return null;
}

export function voicingShapeForms(shape: string, shown: string): W7Form[] {
  // The shape's own ID ("rootless-a", "drop-2") as a checker's expected value or fix would write it.
  const phrases = [esc(shape).replace(/-/g, "[\\s-]"), ...(SHAPE_PHRASES[shape] ?? [])];
  const out: W7Form[] = [];
  phrases.forEach((p, i) => {
    // A phrase the prompt already uses is not a secret (a step that asks for "an A voicing" by name).
    if (new RegExp(p, "i").test(shown)) return;
    // The letters A and B are case-sensitive: "a voicing" in plain prose is not the A voicing.
    const caseSensitive = /\b[AB]\[/.test(p) || /\\s\+[AB]$/.test(p) || /^\(\?:rootless/.test(p);
    out.push({
      label: `voicing shape ${shape} (${i + 1})`,
      source: caseSensitive
        ? `(?<![A-Za-z])(?:${p})(?![A-Za-z])`
        : `(?<![A-Za-z])(?:${ciWords(p)})(?![A-Za-z])`,
      tokens: shape.split("-"),
      sentence: true,
    });
  });
  return out;
}
/** Lower-case letters of a pattern made case-insensitive, leaving escapes and classes alone. */
function ciWords(p: string): string {
  let out = "";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i] as string;
    if (ch === "\\") {
      out += ch + (p[i + 1] ?? "");
      i++;
    } else if (ch === "[") {
      const end = p.indexOf("]", i);
      out += p.slice(i, end + 1);
      i = end;
    } else if (/[a-z]/i.test(ch)) out += `[${ch.toLowerCase()}${ch.toUpperCase()}]`;
    else out += ch;
  }
  return out;
}

// --- groupings and Euclidean rhythms ----------------------------------------------------------------------------

const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const numPat = (n: number) => `(?:${n}|${NUM_WORDS[n] ?? n})`;

/** A grouping answer ("2+2+3", "2 2 3", "3, 2"), or null. */
export function groupingAnswer(answer: string): number[] | null {
  const t = answer.trim();
  if (!/^[23](?:\s*[+,\s]\s*[23]){1,4}$/.test(t)) return null;
  return t.split(/[+,\s]+/).map(Number);
}

export function groupingForms(groups: readonly number[], shown: string): W7Form[] {
  const sep = "\\s*(?:\\+|,|\\s|and|then|plus|\\|)\\s*";
  const src = `(?<![\\d.])${groups.map(numPat).join(sep)}(?!\\d|\\.\\d)`;
  if (new RegExp(src, "i").test(shown)) return [];
  return [
    {
      label: `grouping ${groups.join("+")}`,
      source: ciWords(src),
      tokens: groups.map(String),
      sentence: true,
    },
  ];
}

/** A Euclidean answer ("(3,8)", "3,8", "5 16 10", "E(5,8,1)"), as [k, n, r], or null. */
export function euclidAnswer(answer: string): [number, number, number] | null {
  const m = /^\s*(?:E|x)?\s*\(?\s*(\d{1,2})\s*[,\s]\s*(\d{1,2})(?:\s*[,\s]\s*(\d{1,2}))?\s*\)?\s*$/.exec(
    answer,
  );
  if (!m) return null;
  const k = Number(m[1]);
  const n = Number(m[2]);
  if (!(k >= 1 && n >= 2 && k <= n && n <= 32)) return null;
  return [k, n, Number(m[3] ?? 0)];
}

/** The forms of a Euclidean rhythm: (k,n[,r]) in any brackets, "k hits over n steps", and its name. */
export function euclidForms([k, n, r]: readonly [number, number, number], shown: string): W7Form[] {
  const out: W7Form[] = [];
  const rot = r ? `\\s*,\\s*${r}` : "(?:\\s*,\\s*0)?";
  const tuple = `\\(\\s*${k}\\s*,\\s*${n}${rot}\\s*\\)`;
  if (!new RegExp(tuple).test(shown))
    out.push({
      label: `euclid (${k},${n}${r ? `,${r}` : ""})`,
      source: tuple,
      tokens: [String(k), String(n)],
    });
  const words = `(?<![\\d.])${numPat(k)}\\s+(?:hits?|strokes?|onsets?|pulses|notes?|beats?)\\s+(?:over|in|across|on|spread\\s+over|out\\s+of)\\s+${numPat(n)}(?!\\d|\\.\\d)`;
  if (!new RegExp(words, "i").test(shown))
    out.push({
      label: `euclid words ${k} over ${n}`,
      source: ciWords(words),
      tokens: [String(k), String(n)],
      sentence: true,
    });
  // The named rhythms of R3.L01 (@oak/theory TRESILLO = E(3,8), CINQUILLO = E(5,8); checked in wave7.music.test.ts).
  const name = n === 8 && r === 0 ? (k === 3 ? "tresillo" : k === 5 ? "cinquillo" : null) : null;
  if (name && !new RegExp(name, "i").test(shown))
    out.push({
      label: `euclid name ${name}`,
      source: `(?<![A-Za-z])${ci(name)}(?![A-Za-z])`,
      tokens: [name],
    });
  return out;
}

// --- the standard choices of stage G and H ----------------------------------------------------------------------

/** A swing feel (content-kit `SWING_FEELS`): its name and its long:short ratio. */
const SWING_CHOICES: Readonly<Record<string, { name: string; ratio: string }>> = {
  straight: { name: "straight", ratio: "1\\s*:\\s*1" },
  light: { name: "light(?:[\\s-]+swing)?", ratio: "3\\s*:\\s*2|1\\.5\\s*:\\s*1|1\\.5\\b" },
  triplet: { name: "triplet(?:[\\s-]+swing)?", ratio: "2\\s*:\\s*1" },
  hard: { name: "hard(?:[\\s-]+swing)?", ratio: "3\\s*:\\s*1" },
};

/** A clave choice ("Son clave, 3-2"): its type and its direction. */
const CLAVE_RE = /^(son|rumba)\s+clave,?\s*([23])-([23])$/i;
const TENSION_WORDS: Readonly<Record<string, string>> = {
  "9": "(?:the\\s+|a\\s+)9(?:th)?\\b|\\bninth|\\bnine\\b",
  b9: "[b♭]\\s*9(?:th)?|flat[\\s-]+(?:9(?:th)?|nine|ninth)",
  "#9": "[#♯]\\s*9(?:th)?|sharp[\\s-]+(?:9(?:th)?|nine|ninth)",
  "11": "(?:the\\s+|a\\s+)11(?:th)?\\b|\\beleventh|\\beleven\\b",
  "#11": "[#♯]\\s*11(?:th)?|sharp[\\s-]+(?:11(?:th)?|eleven|eleventh)",
  "13": "(?:the\\s+|a\\s+)13(?:th)?\\b|\\bthirteenth|\\bthirteen\\b",
  b13: "[b♭]\\s*13(?:th)?|flat[\\s-]+(?:13(?:th)?|thirteen|thirteenth)",
  "chord-tone": "chord[\\s-]+tones?",
  avoid: "avoid[\\s-]+notes?|clash(?:es)?|half[\\s-]+step\\s+above",
};
const COMPARE_WORDS: Readonly<Record<string, string>> = {
  brighter: "brighter|more\\s+bright",
  darker: "darker|duller|more\\s+dark",
  dirtier: "dirtier|grittier|more\\s+(?:grit|dirt)",
  cleaner: "cleaner|less\\s+(?:grit|dirt)",
  wider: "wider|broader",
  narrower: "narrower",
  farther: "farther(?:\\s+away)?|further(?:\\s+away)?|more\\s+distant",
  closer: "closer|nearer",
  moving: "moving|moves",
  still: "still|static|steady",
};

/** The forms of a Wave 7 standard choice (a choice label), or null for any other answer. */
export function w7ChoiceForms(answer: string, shown: string): W7Form[] | null {
  const t = answer.trim();
  const lower = flat(t.toLowerCase());
  const keep = (label: string, src: string, tokens: string[]): W7Form[] =>
    new RegExp(src, "i").test(shown) ? [] : [{ label, source: ciWords(src), tokens, sentence: true }];
  const swing = /^(straight|light swing|triplet swing|hard swing)\s*\(/.exec(lower);
  if (swing) {
    const id = (swing[1] as string).split(" ")[0] as string;
    const c = SWING_CHOICES[id] as { name: string; ratio: string };
    return [
      ...keep(`swing feel ${id}`, `(?<![A-Za-z])(?:${c.name})(?![A-Za-z])`, [id]),
      ...keep(`swing ratio ${id}`, `(?<![\\d.])(?:${c.ratio})(?![\\d])`, [id]),
    ];
  }
  if (/^ahead:/.test(lower))
    return keep("microtiming ahead", "(?<![A-Za-z])(?:ahead|pushes|pushing|early|in\\s+front)(?![A-Za-z])", [
      "ahead",
    ]);
  if (/^behind:/.test(lower))
    return keep(
      "microtiming behind",
      "(?<![A-Za-z])(?:behind|laid[\\s-]+back|leans?\\s+back|late|drags?)(?![A-Za-z])",
      ["behind"],
    );
  const clave = CLAVE_RE.exec(t);
  if (clave) {
    const type = (clave[1] as string).toLowerCase();
    const [a, b] = [clave[2] as string, clave[3] as string];
    const dir = `${a}\\s*[-–:/]\\s*${b}|${NUM_WORDS[Number(a)]}[\\s-]+${NUM_WORDS[Number(b)]}|${a === "3" ? "three\\s+(?:hits|strokes)\\s+first|starts\\s+on\\s+the\\s+three(?:[\\s-]+side)?|three[\\s-]+side\\s+(?:comes\\s+|is\\s+)?first|two[\\s-]+side\\s+(?:comes\\s+|is\\s+)?(?:second|last)" : "two\\s+(?:hits|strokes)\\s+first|starts\\s+on\\s+the\\s+two(?:[\\s-]+side)?|two[\\s-]+side\\s+(?:comes\\s+|is\\s+)?first|three[\\s-]+side\\s+(?:comes\\s+|is\\s+)?(?:second|last)"}`;
    return [
      ...keep(`clave type ${type}`, `(?<![A-Za-z])${type}(?![A-Za-z])`, [type]),
      ...keep(`clave direction ${a}-${b}`, `(?<![\\d])(?:${dir})(?![\\d])`, [`${a}-${b}`]),
    ];
  }
  const tension = /^the\s+([b#]?\d{1,2})(?:th)?$/.exec(lower);
  if (tension || lower === "a chord tone" || lower.startsWith("a clash:")) {
    const id = tension ? (tension[1] as string) : lower === "a chord tone" ? "chord-tone" : "avoid";
    const src = TENSION_WORDS[id];
    return src ? keep(`tension ${id}`, `(?:${src})`, [id]) : null;
  }
  const word = COMPARE_WORDS[lower.replace(/\s+away$/, "")];
  if (word) return keep(`sound ${lower}`, `(?<![A-Za-z])(?:${word})(?![A-Za-z])`, [lower]);
  return null;
}

// --- Wave 7 code: swing amounts, decimal shifts, Euclidean rhythms, voicing controls ------------------------------

/** `.swingBy(amount, n)`: the long:short ratio it makes (content-kit `swingRatio`: (1 + a) / (1 − a)). */
export function swingRatioOf(amount: number): number {
  return (1 + amount) / (1 - amount);
}

const NAMED_RATIOS: readonly { ratio: number; text: string; name: string }[] = [
  { ratio: 1.5, text: "3\\s*:\\s*2|1\\.5\\s*:\\s*1", name: "light(?:[\\s-]+swing)" },
  { ratio: 2, text: "2\\s*:\\s*1", name: "triplet(?:[\\s-]+swing|[\\s-]+feel)" },
  { ratio: 3, text: "3\\s*:\\s*1", name: "hard(?:[\\s-]+swing)" },
];

const amountOf = (s: string): number | null => {
  const f = /^(\d+)\s*\/\s*(\d+)$/.exec(s.trim());
  if (f) return Number(f[1]) / Number(f[2]);
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
};

/** The forms of the Wave 7 calls in a code solution that the step does not already show. */
export function w7CodeForms(code: string, shown: string): W7Form[] {
  const out: W7Form[] = [];
  const shownFlat = shown.replace(/\s+/g, " ");
  const inShown = (call: string) => shownFlat.includes(call.replace(/\s+/g, " "));

  for (const m of code.matchAll(/\.swingBy\(\s*([^,)]+?)\s*,\s*["'`]?(\d+)["'`]?\s*\)/g)) {
    if (inShown(m[0])) continue;
    const raw = (m[1] as string).replace(/["'`]/g, "");
    const a = amountOf(raw);
    if (a === null) continue;
    const lit = esc(raw)
      .replace(/\\\//, "\\s*\\/\\s*")
      .replace(/^0\\\./, "0?\\.");
    out.push({
      label: `swingBy amount ${raw}`,
      source: `\\.swingBy\\(\\s*${lit}|(?<![\\d./])${lit}(?![\\d/])`,
      tokens: [raw],
      sentence: true,
      // A bare "0.2" or "1/3" counts only near the word swing or as the call's argument.
      accept: (x) =>
        /swingBy/.test(x[0]) ||
        /swing|amount|swingBy/i.test(x.input.slice(Math.max(0, x.index - 40), x.index + 40)),
    });
    const ratio = swingRatioOf(a);
    const named = NAMED_RATIOS.find((r) => Math.abs(r.ratio - ratio) < 0.02);
    if (named) {
      out.push({
        label: `swing ratio ${named.ratio}:1`,
        source: `(?<![\\d.])(?:${named.text})(?!\\d)`,
        tokens: [String(named.ratio)],
        sentence: true,
      });
      out.push({
        label: `swing feel ${named.ratio}:1`,
        source: `(?<![A-Za-z])(?:${ciWords(named.name)})(?![A-Za-z])`,
        tokens: [String(named.ratio)],
        sentence: true,
      });
    }
  }

  // A decimal shift (microtiming: `.late(0.0075)`); fractions are answer-guard.ts's own.
  for (const m of code.matchAll(/\.(late|early)\(\s*["'`]?\s*(0?\.\d+)\s*["'`]?\s*\)/g)) {
    if (inShown(m[0])) continue;
    const v = (m[2] as string).replace(/^0/, "");
    out.push({
      label: `shift .${m[1]}(${m[2]})`,
      source: `\\.${m[1]}\\(\\s*["'\`]?\\s*0?${esc(v)}|(?<![\\d.])0?${esc(v)}(?!\\d)`,
      tokens: [m[2] as string],
      sentence: true,
    });
  }

  // Euclidean rhythms: `bd(3,8)`, `x(5,16,10)` in mini-notation, `.euclid(3,8)`, `.euclidRot(5,16,10)`.
  const euclids = new Set<string>();
  for (const m of code.matchAll(/\(\s*(\d{1,2})\s*,\s*(\d{1,2})(?:\s*,\s*(\d{1,2}))?\s*\)/g)) {
    if (!/["'`][^"'`]*$/.test(code.slice(0, m.index))) continue;
    euclids.add(`${m[1]},${m[2]},${m[3] ?? 0}`);
  }
  for (const m of code.matchAll(
    /\.euclid(?:Rot|Legato|LegatoRot)?\(\s*(\d{1,2})\s*,\s*(\d{1,2})(?:\s*,\s*(\d{1,2}))?/g,
  ))
    euclids.add(`${m[1]},${m[2]},${m[3] ?? 0}`);
  for (const e of euclids) {
    const [k, n, r] = e.split(",").map(Number) as [number, number, number];
    out.push(...euclidForms([k, n, r], shown));
  }

  // A voicing's controls: `.anchor("a4")`, `.offset(1)`, `.mode("duck")`.
  for (const m of code.matchAll(/\.(anchor|offset|mode)\(\s*["'`]?([^"'`)]+?)["'`]?\s*\)/g)) {
    if (inShown(m[0])) continue;
    const fn = m[1] as string;
    const v = (m[2] as string).trim();
    out.push({
      label: `${fn} ${v}`,
      source: `\\.${fn}\\(\\s*["'\`]?${esc(v)}|\\b${fn}\\b[^.!?\\n]{0,20}?(?<![A-Za-z0-9])${esc(v)}(?![A-Za-z0-9])`,
      tokens: [fn, v],
      sentence: true,
    });
  }
  return out;
}
