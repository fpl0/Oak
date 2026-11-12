// Sung degree patterns (Wave 3: `SingEx` with `target.from: "degrees"`, sing-echo, sight-singing). @oak/pitch
// judged every note against its target (`gradeSung`, the one rule of contracts §8.1); the grader judges
// the PATTERN from that per-note result: which degree was sung instead (`sing.wrong-degree`, in numbers or
// syllables as the step labels them), a right contour with wrong sizes (`sing.contour-right`), an octave
// leap sung folded back (`sing.octave-folded`, still credited, as the octave policy says), and a pattern
// that stops early (`sing.too-short`). It never changes a note's credit. Pure.
import type { Degree, Diagnostic, KeySpec, SingEx } from "@oak/content-kit";
import { labelPitch, syllableOf } from "@oak/theory";
import { diag } from "../feedback/catalog.ts";
import type { SungNoteLike } from "../perf/index.ts";

/** The midi the learner actually sang for a note (unfolded), or null when missed or unknown. */
export function rawSungMidi(n: SungNoteLike): number | null {
  if (n.sungMidi === null || n.sungMidi === undefined) return null;
  return n.sungMidi + 12 * (n.octaveShift ?? 0);
}

const sign = (x: number): -1 | 0 | 1 => (x > 0.5 ? 1 : x < -0.5 ? -1 : 0);

export interface SungPatternInput {
  degrees: readonly Degree[];
  key: KeySpec;
  labels: NonNullable<SingEx["labels"]>;
  notes: readonly SungNoteLike[];
  diagnostics: readonly Diagnostic[];
  /**
   * The sing mode. In the free modes (echo, resolution, bassline) @oak/pitch aligns the sung notes to the
   * targets by order, so a take with fewer notes than the pattern is read as a sequence from its start.
   */
  mode?: SingEx["mode"];
}

const FREE_MODES: ReadonlySet<string> = new Set(["echo", "resolution", "bassline"]);

/**
 * Re-reads @oak/pitch's per-note findings as findings about the pattern. Returns the diagnostics to show
 * (pitch's own, with `sing.wrong-note` named as a degree and the trailing `sing.missed` notes folded into
 * one `sing.too-short`), plus the pattern findings.
 */
export function judgeSungPattern(p: SungPatternInput): Diagnostic[] {
  const { degrees, key, notes } = p;
  const n = degrees.length;
  if (notes.length === 0 || n === 0) return [...p.diagnostics];
  // Numbers before U03.L08; syllables after, with the number still shown (contracts §8.3).
  const name = (d: Degree): string => (p.labels === "syllables" ? `${syllableOf(d)} (${d})` : d);
  const out: Diagnostic[] = [];
  const indexOf = (d: Diagnostic): number | null => {
    const i = Number(d.params.i);
    return Number.isFinite(i) && i >= 1 ? i - 1 : null;
  };

  // Free modes: fewer notes than the pattern. The aligner put the sung notes where they fit best (a held 1
  // under 1-3-5-3-1 lands on the last 1, the first four "missed"), so read them in order from the start
  // instead: the first one that is not the pattern's, then how many notes are still to come.
  // Only when the aligner's own reading does not hold up: a sung note it could not credit, or a take that is
  // the start of the pattern placed further on. A skipped note in the middle (1 5 3 1) stays "missed".
  const sungAt = notes.flatMap((x, i) => (rawSungMidi(x) !== null && i < n ? [i] : []));
  const got = sungAt.map(
    (i) => labelPitch(Math.round(rawSungMidi(notes[i] as SungNoteLike) as number), key).degree,
  );
  const at = got.findIndex((g, k) => g !== degrees[k]);
  const misplacedStart = at < 0 && sungAt.some((i, k) => i !== k);
  const uncredited = sungAt.some((i) => (notes[i]?.credit ?? 0) === 0);
  if (
    p.mode &&
    FREE_MODES.has(p.mode) &&
    sungAt.length > 0 &&
    sungAt.length < n &&
    (misplacedStart || uncredited)
  ) {
    const kept = p.diagnostics.filter((d) => d.id !== "sing.missed" && d.id !== "sing.wrong-note");
    if (at >= 0)
      kept.push(
        diag(
          "sing.wrong-degree",
          { i: at + 1, got: name(got[at] as Degree), exp: name(degrees[at] as Degree) },
          { slot: at },
          "pitch",
        ),
      );
    kept.push(
      diag(
        "sing.too-short",
        {
          got: got.length,
          n,
          rest: degrees
            .slice(got.length)
            .map((d) => name(d))
            .join(", "),
        },
        undefined,
        "coverage",
      ),
    );
    return kept;
  }

  // Too short: the last notes were never sung, after at least one that was.
  let lastSung = -1;
  notes.forEach((x, i) => {
    if (rawSungMidi(x) !== null) lastSung = i;
  });
  const trailing = lastSung >= 0 ? n - 1 - lastSung : 0;
  const cut = trailing > 0 && notes.slice(lastSung + 1).every((x) => x.feedback === "sing.missed");

  const wrongDegree = (i: number, where: Diagnostic["where"]): Diagnostic | null => {
    const raw = rawSungMidi(notes[i] ?? { credit: 0, feedback: null });
    const exp = degrees[i];
    if (raw === null || exp === undefined) return null;
    const got = labelPitch(Math.round(raw), key).degree;
    return diag("sing.wrong-degree", { i: i + 1, got: name(got), exp: name(exp) }, where, "pitch");
  };
  // Notes pitch already reported on (by index): the per-note pass below fills in the rest.
  const told = new Set<number>();
  for (const d of p.diagnostics) {
    const i = indexOf(d);
    if (i !== null && (d.id === "sing.wrong-note" || d.id === "sing.missed")) told.add(i);
    if (cut && d.id === "sing.missed" && i !== null && i > lastSung) continue;
    if (d.id === "sing.wrong-note" && i !== null) {
      const w = wrongDegree(i, d.where);
      if (w) {
        out.push(w);
        continue;
      }
    }
    out.push(d);
  }
  // A failed note always says what was sung instead, even when the caller passed pitch's per-note result
  // without its diagnostics (or pitch summarised them): a held 1 under 1-3-5-3-1 names note 2 as a 1.
  notes.forEach((x, i) => {
    if (told.has(i) || i >= n || x.credit > 0) return;
    if (cut && i > lastSung) return;
    const where = { slot: x.index ?? i };
    const w = wrongDegree(i, where);
    if (w) out.push(w);
    else if (x.feedback === "sing.missed" || (x.feedback === null && rawSungMidi(x) === null && lastSung > i))
      out.push(diag("sing.missed", { i: i + 1, exp: name(degrees[i] as Degree) }, where, "coverage"));
  });
  if (cut)
    out.push(
      diag(
        "sing.too-short",
        {
          got: lastSung + 1,
          n,
          rest: degrees
            .slice(lastSung + 1)
            .map((d) => name(d))
            .join(", "),
        },
        undefined,
        "coverage",
      ),
    );

  // Contour: with every note sung, the ups and downs match the pattern's, but some degrees are wrong.
  const raws = notes.map(rawSungMidi);
  const targets = degrees.map((_, i) => notes[i]?.targetMidi ?? null);
  const wrong = notes.filter((x) => x.feedback === "sing.wrong-note").length;
  if (wrong > 0 && n >= 3 && raws.every((r) => r !== null) && targets.every((t) => t !== null)) {
    let same = true;
    for (let i = 1; i < n; i++) {
      const want = sign((targets[i] as number) - (targets[i - 1] as number));
      const got = sign((raws[i] as number) - (raws[i - 1] as number));
      if (want !== got) same = false;
    }
    if (same) out.push(diag("sing.contour-right", {}, undefined, "contour"));
  }

  // Octave folded: a credited note sung an octave away from where the pattern puts it, relative to the
  // other notes (1-3-5-1' sung as 1-3-5-1). Folding keeps its credit; the finding says what the pattern meant.
  const shifts = notes.map((x) => (rawSungMidi(x) !== null ? (x.octaveShift ?? 0) : null));
  const known = shifts.filter((s): s is number => s !== null);
  if (known.length >= 2) {
    const counts = new Map<number, number>();
    for (const s of known) counts.set(s, (counts.get(s) ?? 0) + 1);
    const usual =
      [...counts.entries()].sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))[0]?.[0] ?? 0;
    shifts.forEach((s, i) => {
      if (s === null || s === usual || (notes[i]?.credit ?? 0) === 0) return;
      const exp = degrees[i];
      if (exp === undefined || i === 0) return;
      const prevTarget = targets[i - 1];
      const target = targets[i];
      const prevRaw = raws[i - 1];
      const raw = raws[i];
      if (prevTarget === null || target === null || prevRaw === null || raw === null) return;
      out.push(
        diag(
          "sing.octave-folded",
          {
            i: i + 1,
            exp: name(exp),
            targetDir: (target ?? 0) >= (prevTarget ?? 0) ? "up" : "down",
            gotDir: s > usual ? "an octave higher" : "an octave lower",
          },
          notes[i]?.index !== undefined ? { slot: notes[i]?.index as number } : undefined,
          "pitch",
        ),
      );
    });
  }
  return out;
}
