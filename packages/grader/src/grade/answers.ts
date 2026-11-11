// Graders for answers that are not code: choices, degrees, qualities, Roman numerals, text, numbers,
// keyboard notes, spelled staff notes and key signatures (exercises §1, §3.9). Pure and synchronous.
import type { Answer, AnswerUi, Diagnostic, KeySpec, NEvent, PartialMap, PitchMode } from "@oak/content-kit";
import { keySignature, normalizeText, parseRN, pcOf, rnToChord, spellMidi, triadCore } from "@oak/theory";
import { mod12 } from "../analyze/events.ts";
import { diag } from "../feedback/catalog.ts";
import type { MatchResult } from "../types.ts";

export interface AnswerCheck extends MatchResult {
  /** Per-slot credit, for the overlay of a slot UI. */
  slots: number[];
}

const norm = (kind: "note" | "chord" | "rn" | "interval" | "key" | "free", s: string): string => {
  if (kind === "free") return s.trim().toLowerCase().replace(/\s+/g, " ");
  try {
    return normalizeText(kind, s) ?? s.trim();
  } catch {
    return s.trim();
  }
};

/** Two Roman numerals in a key name the same chord (triad core and applied target), or the same text. */
export function sameRn(a: string, b: string, key: KeySpec | null): boolean {
  if (norm("rn", a) === norm("rn", b)) return true;
  if (!key) return false;
  const ra = parseRN(a, key);
  const rb = parseRN(b, key);
  if (!ra || !rb) return false;
  const ca = rnToChord(ra, key);
  const cb = rnToChord(rb, key);
  const ta = triadCore(ca);
  const tb = triadCore(cb);
  return ta.rootPc === tb.rootPc && ta.quality === tb.quality && ra.quality === rb.quality;
}
/** Same numeral but the case (major vs minor) differs. */
const rnCaseOnly = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase() && a !== b;

function compareSlots(
  expected: readonly string[],
  got: readonly string[],
  same: (e: string, g: string) => boolean,
  o: {
    partial?: PartialMap;
    order?: "sequence" | "set";
    label?: (s: string) => string;
    rnKey?: KeySpec | null;
  } = {},
): AnswerCheck {
  const diagnostics: Diagnostic[] = [];
  const slots: number[] = [];
  const label = o.label ?? ((s: string) => s);
  if (o.order === "set") {
    const pool = [...got];
    let hit = 0;
    for (const e of expected) {
      const i = pool.findIndex((g) => same(e, g));
      if (i >= 0) {
        pool.splice(i, 1);
        hit++;
      } else
        diagnostics.push(
          diag(
            "id.wrong",
            { exp: label(e), got: pool[0] !== undefined ? label(pool[0]) : "nothing" },
            undefined,
            "choice",
          ),
        );
    }
    const score = expected.length + pool.length === 0 ? 1 : (2 * hit) / (expected.length + got.length);
    return {
      score,
      dims: { choice: { score, weight: 1, n: expected.length } },
      diagnostics,
      slots: expected.map((e) => (got.some((g) => same(e, g)) ? 1 : 0)),
    };
  }
  const n = Math.max(expected.length, got.length);
  for (let i = 0; i < n; i++) {
    const e = expected[i];
    const g = got[i];
    if (e === undefined) {
      slots.push(0);
      diagnostics.push(
        diag("id.wrong", { exp: "nothing", got: label(g as string) }, { slot: i + 1 }, "choice"),
      );
      continue;
    }
    if (g === undefined || g === "") {
      slots.push(0);
      continue;
    }
    if (same(e, g)) {
      slots.push(1);
      continue;
    }
    const credit = o.partial?.[e]?.[g] ?? 0;
    slots.push(credit);
    if (o.rnKey !== undefined && rnCaseOnly(e, g))
      diagnostics.push(diag("harmony.rn-case", { got: g, exp: e }, { slot: i + 1 }, "rn"));
    else
      diagnostics.push(
        diag(
          credit > 0 ? "id.partial" : "id.wrong",
          { exp: label(e), got: label(g) },
          n > 1 ? { slot: i + 1 } : undefined,
          "choice",
        ),
      );
  }
  const missingN = expected.filter((_, i) => got[i] === undefined || got[i] === "").length;
  if (missingN > 0) diagnostics.push(diag("id.missing", { n: missingN }, undefined, "choice"));
  const score = n === 0 ? 1 : slots.reduce((a, b) => a + b, 0) / n;
  return { score, dims: { choice: { score, weight: 1, n } }, diagnostics, slots };
}

/**
 * Grades an `Answer` against the correct one, field by field, with the slot UI's normalization.
 * Several fields average their scores.
 */
export function gradeAnswer(
  ui: AnswerUi,
  correct: Answer,
  got: Answer,
  o: {
    partial?: PartialMap;
    key?: KeySpec | null;
    spelling?: "strict" | "enharmonic";
    order?: "sequence" | "set";
    tol?: number;
  } = {},
): AnswerCheck {
  const parts: AnswerCheck[] = [];
  const order = o.order ?? (ui.ui === "choice" && ui.multi ? "set" : "sequence");
  if (correct.choice)
    parts.push(
      compareSlots(correct.choice, got.choice ?? [], (e, g) => e === g, {
        ...(o.partial ? { partial: o.partial } : {}),
        order,
      }),
    );
  if (correct.degrees)
    parts.push(
      compareSlots(correct.degrees, got.degrees ?? [], (e, g) => e === g, {
        ...(o.partial ? { partial: o.partial } : {}),
        order,
      }),
    );
  if (correct.qualities)
    parts.push(
      compareSlots(correct.qualities, got.qualities ?? [], (e, g) => e === g, {
        ...(o.partial ? { partial: o.partial } : {}),
        order,
      }),
    );
  if (correct.rn)
    parts.push(
      compareSlots(correct.rn, got.rn ?? [], (e, g) => sameRn(e, g, o.key ?? null), {
        ...(o.partial ? { partial: o.partial } : {}),
        order,
        rnKey: o.key ?? null,
      }),
    );
  if (correct.text) {
    const kind = ui.ui === "text" ? ui.normalize : "free";
    if (kind === "note")
      parts.push(
        spelledNotes(correct.text, got.text ?? [], {
          strict: (o.spelling ?? "strict") === "strict",
          order,
          key: o.key ?? null,
          withOctave: false,
        }),
      );
    else
      parts.push(
        compareSlots(correct.text, got.text ?? [], (e, g) => norm(kind, e) === norm(kind, g), {
          ...(o.partial ? { partial: o.partial } : {}),
          order,
        }),
      );
  }
  if (correct.number !== undefined) {
    const ok = got.number !== undefined && Math.abs(got.number - correct.number) <= (o.tol ?? 0) + 1e-9;
    parts.push({
      score: ok ? 1 : 0,
      dims: { choice: { score: ok ? 1 : 0, weight: 1 } },
      diagnostics: ok
        ? []
        : [diag("id.wrong", { exp: correct.number, got: got.number ?? "nothing" }, undefined, "choice")],
      slots: [ok ? 1 : 0],
    });
  }
  if (correct.midi)
    parts.push(
      keyboardCheck(
        { midi: correct.midi },
        got.midi ?? [],
        "absolute",
        order === "set" ? "chord" : "sequence",
      ),
    );
  if (parts.length === 0)
    return { score: 0, dims: {}, diagnostics: [diag("id.missing", { n: 1 })], slots: [] };
  const score = parts.reduce((a, p) => a + p.score, 0) / parts.length;
  return {
    score,
    dims: { choice: { score, weight: 1 } },
    diagnostics: parts.flatMap((p) => p.diagnostics),
    slots: parts.flatMap((p) => p.slots),
  };
}

const parseSpelled = (s: string): { letter: string; acc: string; oct: number | null } | null => {
  const m = /^([A-Ga-g])(##|bb|#|b|x|♯|♭)?(-?\d+)?$/.exec(s.trim());
  if (!m) return null;
  return {
    letter: (m[1] as string).toUpperCase(),
    acc: (m[2] ?? "").replace("♯", "#").replace("♭", "b").replace("x", "##"),
    oct: m[3] === undefined ? null : Number(m[3]),
  };
};
const spelledMidi = (p: { letter: string; acc: string; oct: number | null }): number => {
  const pc = pcOf(`${p.letter}${p.acc}`);
  if (p.oct === null) return pc;
  // B#3 is C4: the octave belongs to the letter.
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (
    (p.oct + 1) * 12 +
    (base[p.letter] as number) +
    (p.acc === "#" ? 1 : p.acc === "##" ? 2 : p.acc === "b" ? -1 : p.acc === "bb" ? -2 : 0)
  );
};

/**
 * Spelled notes (staff writing, note-name facts): exact spelling, or enharmonic credit when the sound is
 * right (`spell.enharmonic`, which still fails under strict spelling).
 */
export function spelledNotes(
  expected: readonly string[],
  got: readonly string[],
  o: { strict: boolean; order: "sequence" | "set"; key: KeySpec | null; withOctave: boolean },
): AnswerCheck {
  const diagnostics: Diagnostic[] = [];
  const slots: number[] = [];
  const ctxName = o.key ? `${o.key.tonic} ${o.key.mode}` : "this key";
  const sameSpelling = (e: string, g: string): boolean => {
    const pe = parseSpelled(e);
    const pg = parseSpelled(g);
    if (!pe || !pg) return false;
    return pe.letter === pg.letter && pe.acc === pg.acc && (!o.withOctave || pe.oct === pg.oct);
  };
  const sameSound = (e: string, g: string): boolean => {
    const pe = parseSpelled(e);
    const pg = parseSpelled(g);
    if (!pe || !pg) return false;
    return o.withOctave && pe.oct !== null && pg.oct !== null
      ? spelledMidi(pe) === spelledMidi(pg)
      : mod12(spelledMidi(pe)) === mod12(spelledMidi(pg));
  };
  if (o.order === "set") {
    const sortKey = (s: string): number => {
      const p = parseSpelled(s);
      return p ? spelledMidi(p) : 0;
    };
    const exp = [...expected].sort((a, b) => sortKey(a) - sortKey(b));
    const gotS = [...got].sort((a, b) => sortKey(a) - sortKey(b));
    return finish(exp, gotS);
  }
  const inSet =
    expected.length === got.length &&
    [...expected].sort().join() === [...got].sort().join() &&
    expected.join() !== got.join();
  if (inSet) {
    diagnostics.push(diag("spell.order"));
    return {
      score: 0.5,
      dims: { spelling: { score: 0.5, weight: 1 }, order: { score: 0, weight: 0 } },
      diagnostics,
      slots: expected.map(() => 0.5),
    };
  }
  return finish(expected, got);

  function finish(exp: readonly string[], g: readonly string[]): AnswerCheck {
    const n = Math.max(exp.length, g.length);
    for (let i = 0; i < n; i++) {
      const e = exp[i];
      const x = g[i];
      if (e === undefined || x === undefined) {
        slots.push(0);
        diagnostics.push(
          diag("spell.wrong", { got: x ?? "nothing", exp: e ?? "nothing" }, { slot: i + 1 }, "spelling"),
        );
      } else if (sameSpelling(e, x)) slots.push(1);
      else if (sameSound(e, x)) {
        slots.push(o.strict ? 0.5 : 1);
        if (o.strict)
          diagnostics.push(
            diag("spell.enharmonic", { got: x, exp: e, context: ctxName }, { slot: i + 1 }, "spelling"),
          );
      } else {
        slots.push(0);
        diagnostics.push(diag("spell.wrong", { got: x, exp: e }, { slot: i + 1 }, "spelling"));
      }
    }
    const score = n === 0 ? 1 : slots.reduce((a, b) => a + b, 0) / n;
    return { score, dims: { spelling: { score, weight: 1, n } }, diagnostics, slots };
  }
}

/** The spelled name of a staff event: its written spelling, else re-spelled from MIDI in the key. */
export function staffName(e: NEvent, key: KeySpec | null): string {
  if (e.written && parseSpelled(e.written)) return e.written;
  return e.midi === null ? "?" : spellMidi(e.midi, { key }).name;
}

/**
 * Keyboard answers (exercises §1, `KeyboardEx`): exact notes, pitch classes, the bass, or an ordered
 * sequence, compared per `PitchMode`.
 */
export function keyboardCheck(
  expect: { midi?: number[]; pcs?: number[]; bassPc?: number; sequence?: number[] },
  got: readonly number[],
  mode: PitchMode,
  ui: "single" | "chord" | "sequence",
): AnswerCheck {
  const diagnostics: Diagnostic[] = [];
  const parts: number[] = [];
  const name = (m: number): string => spellMidi(m, { key: null }).name;
  const pcName = (pc: number): string => name(60 + mod12(pc)).replace(/-?\d+$/, "");
  const octaveFree = mode !== "absolute";
  if (expect.sequence || (ui === "sequence" && expect.midi)) {
    const want = expect.sequence ?? expect.midi ?? [];
    const n = Math.max(want.length, got.length);
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const w = want[i];
      const g = got[i];
      if (w === undefined || g === undefined) {
        diagnostics.push(
          w === undefined
            ? diag("kb.extra-note", { got: name(g as number) }, { slot: i + 1 }, "pitch")
            : diag("kb.missing-note", { exp: name(w) }, { slot: i + 1 }, "pitch"),
        );
        continue;
      }
      if (octaveFree ? mod12(w) === mod12(g) : w === g) ok++;
      else if (mod12(w) === mod12(g)) {
        ok += 0.5;
        diagnostics.push(diag("kb.octave", { got: name(g), exp: name(w) }, { slot: i + 1 }, "pitch"));
      } else
        diagnostics.push(diag("kb.wrong-note", { got: name(g), exp: name(w) }, { slot: i + 1 }, "pitch"));
    }
    const sameSet = [...want].sort().join() === [...got].sort().join();
    if (ok < n && sameSet) {
      diagnostics.length = 0;
      diagnostics.push(diag("kb.order", {}, undefined, "order"));
    }
    parts.push(n === 0 ? 1 : ok / n);
  } else if (expect.midi) {
    const want = new Set(expect.midi.map((m) => (octaveFree ? mod12(m) : m)));
    const have = new Set(got.map((m) => (octaveFree ? mod12(m) : m)));
    const missing = [...want].filter((m) => !have.has(m));
    const extra = [...have].filter((m) => !want.has(m));
    if (ui === "single" && missing.length === 1 && extra.length === 1) {
      const [w, g] = [missing[0] as number, extra[0] as number];
      diagnostics.push(
        mod12(w) === mod12(g)
          ? diag("kb.octave", { got: name(g), exp: name(w) }, undefined, "pitch")
          : diag(
              "kb.wrong-note",
              { got: octaveFree ? pcName(g) : name(g), exp: octaveFree ? pcName(w) : name(w) },
              undefined,
              "pitch",
            ),
      );
    } else {
      for (const m of missing)
        diagnostics.push(
          diag("kb.missing-note", { exp: octaveFree ? pcName(m) : name(m) }, undefined, "pitch"),
        );
      for (const m of extra)
        diagnostics.push(
          diag("kb.extra-note", { got: octaveFree ? pcName(m) : name(m) }, undefined, "pitch"),
        );
    }
    const inter = [...want].filter((m) => have.has(m)).length;
    parts.push(want.size + have.size === 0 ? 1 : (2 * inter) / (want.size + have.size));
  }
  if (expect.pcs) {
    const want = new Set(expect.pcs.map(mod12));
    const have = new Set(got.map(mod12));
    const missing = [...want].filter((p) => !have.has(p));
    const extra = [...have].filter((p) => !want.has(p));
    for (const p of missing)
      diagnostics.push(diag("kb.missing-note", { exp: pcName(p) }, undefined, "pitch"));
    for (const p of extra) diagnostics.push(diag("kb.extra-note", { got: pcName(p) }, undefined, "pitch"));
    const inter = [...want].filter((p) => have.has(p)).length;
    parts.push(want.size + have.size === 0 ? 1 : (2 * inter) / (want.size + have.size));
  }
  if (expect.bassPc !== undefined) {
    const low = got.length ? Math.min(...got) : null;
    const ok = low !== null && mod12(low) === mod12(expect.bassPc);
    if (!ok)
      diagnostics.push(
        diag(
          "kb.bass",
          { exp: pcName(expect.bassPc), got: low === null ? "nothing" : pcName(low) },
          undefined,
          "bass",
        ),
      );
    parts.push(ok ? 1 : 0);
  }
  const score = parts.length === 0 ? 0 : parts.reduce((a, b) => a + b, 0) / parts.length;
  return { score, dims: { pitch: { score, weight: 1, n: got.length } }, diagnostics, slots: parts };
}

/** Key-signature answers: the accidentals of the key, as a set of spelled notes. */
export function keySignatureCheck(key: KeySpec, got: readonly string[]): AnswerCheck {
  const want = keySignature(key).notes;
  const norm1 = (s: string): string =>
    s
      .trim()
      .replace("♯", "#")
      .replace("♭", "b")
      .replace(/^[a-g]/, (c) => c.toUpperCase());
  const g = got.map(norm1);
  const ok = want.length === g.length && want.every((n) => g.includes(n));
  const fmt = (xs: readonly string[]): string => (xs.length ? xs.join(" ") : "no sharps or flats");
  return {
    score: ok ? 1 : 0,
    dims: { spelling: { score: ok ? 1 : 0, weight: 1 } },
    diagnostics: ok
      ? []
      : [
          diag(
            "keysig.wrong",
            { key: `${key.tonic} ${key.mode}`, exp: fmt(want), got: fmt(g) },
            undefined,
            "spelling",
          ),
        ],
    slots: [ok ? 1 : 0],
  };
}
