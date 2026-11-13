// What a staff DRAWS, read back from abcjs's SVG (Wave 3 review, shared with the Wave 4 review): every notehead
// read off its line or space under its drawn clef, its accidental against the drawn key signature and the bar's
// earlier accidentals in its voice, and compared with the pitch the note says it is (its accessible name).
import type { Page } from "@playwright/test";

/** One drawn note, as read from the SVG. */
export interface DrawnNote {
  n: number;
  bar: number;
  /** Pitches the note claims (its accessible name), low to high as written there. */
  said: string[];
  /** Pitches read off the drawing. */
  drawn: string[];
  ledgers: number;
  ledgersNeeded: number;
  clef: string;
  lines: string[];
  degree: string | null;
  heads: { deg: string | null; fill: string }[];
}

/**
 * Reads the staff host's SVG: staff lines → step of every notehead → letter and octave under the drawn clef;
 * key signature glyphs (in their conventional order) and accidentals inside each note → the sounding alteration.
 */
export function readStaff(page: Page): Promise<{ notes: DrawnNote[]; bars: number; problems: string[] }> {
  return page.evaluate(() => {
    const host = document.querySelector(".oak-staff-host") as HTMLElement;
    const svg = host.querySelector("svg") as SVGSVGElement;
    const problems: string[] = [];
    const mid = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    };
    const num = (el: Element, re: RegExp) => {
      for (const c of el.classList) {
        const m = re.exec(c);
        if (m) return Number(m[1]);
      }
      return -1;
    };
    const L = (el: Element) => num(el, /^abcjs-l(\d+)$/);
    const V = (el: Element) => num(el, /^abcjs-v(\d+)$/);
    const MM = (el: Element) => num(el, /^abcjs-mm(\d+)$/);
    const staves = new Map<string, { top: number; space: number }>();
    for (const g of svg.querySelectorAll("g.abcjs-staff")) {
      const ys = [...g.querySelectorAll("path")].map(mid).sort((a, b) => a - b);
      if (ys.length < 5) continue;
      staves.set(`${L(g)}|${V(g)}`, {
        top: ys[0] as number,
        space: ((ys[4] as number) - (ys[0] as number)) / 4,
      });
    }
    const clefs = new Map<string, string>();
    for (const g of svg.querySelectorAll("g.abcjs-clef")) {
      const name = g.querySelector("path")?.getAttribute("data-name") ?? "";
      clefs.set(`${L(g)}|${V(g)}`, name === "clefs.F" ? "bass" : name === "clefs.G" ? "treble" : name);
    }
    // Signatures in force from a global measure on, per voice (a signature repeats at each new line).
    const sigs: { v: number; mm: number; sharps: number; flats: number }[] = [];
    for (const g of svg.querySelectorAll("g.abcjs-key-signature")) {
      const names = [...g.querySelectorAll("path")].map((p) => p.getAttribute("data-name"));
      sigs.push({
        v: V(g),
        mm: MM(g),
        sharps: names.filter((n) => n === "accidentals.sharp").length,
        flats: names.filter((n) => n === "accidentals.flat").length,
      });
    }
    // A line that starts in C major draws no signature at all: the line's first measure resets to none.
    const lineStart = new Map<string, number>();
    for (const g of svg.querySelectorAll("g.abcjs-note")) {
      const k = `${L(g)}|${V(g)}`;
      lineStart.set(k, Math.min(lineStart.get(k) ?? Number.POSITIVE_INFINITY, MM(g)));
    }
    for (const [k, mm] of lineStart) {
      const v = Number(k.split("|")[1]);
      if (!sigs.some((x) => x.v === v && x.mm === mm)) sigs.push({ v, mm, sharps: 0, flats: 0 });
    }
    sigs.sort((a, b) => a.mm - b.mm);
    const sigAt = (v: number, mm: number) => {
      let s = { sharps: 0, flats: 0 };
      for (const k of sigs) if (k.v === v && k.mm <= mm) s = k;
      const out: Record<string, number> = {};
      for (const l of "FCGDAEB".slice(0, s.sharps)) out[l] = 1;
      for (const l of "BEADGCF".slice(0, s.flats)) out[l] = -1;
      return out;
    };
    const LET = "CDEFGAB";
    const barState = new Map<string, number>();
    const notes: DrawnNote[] = [];
    let maxBar = 0;
    for (const g of svg.querySelectorAll("g.abcjs-note[data-oak-events]")) {
      // A second voice on a staff (a chord under a tune) has no staff group of its own: it is drawn on the staff
      // of its line its heads sit on.
      let key = `${L(g)}|${V(g)}`;
      if (!staves.has(key)) {
        const ys = [...g.querySelectorAll(".abcjs-notehead")].map(mid);
        const y = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
        let best: string | null = null;
        for (const [k, st] of staves) {
          if (Number(k.split("|")[0]) !== L(g)) continue;
          const d = Math.abs(y - (st.top + 2 * st.space));
          const bd = best
            ? Math.abs(y - ((staves.get(best)?.top ?? 0) + 2 * (staves.get(best)?.space ?? 0)))
            : 1e9;
          if (d < bd) best = k;
        }
        if (best) key = best;
      }
      const staffV = Number(key.split("|")[1]);
      const staff = staves.get(key);
      const clef = clefs.get(key) ?? clefs.get(`0|${staffV}`) ?? "?";
      if (!staff) {
        problems.push(`no staff for ${g.getAttribute("class")}`);
        continue;
      }
      const topP = clef === "bass" ? -2 : 10;
      const mm = MM(g);
      const v = V(g);
      const sig = sigAt(staffV, mm);
      const half = staff.space / 2;
      const heads = [...g.querySelectorAll(".abcjs-notehead")].map((h) => ({
        el: h,
        y: mid(h),
        step: Math.round((mid(h) - staff.top) / half),
      }));
      const accs = [...g.querySelectorAll('path[data-name^="accidentals."]')].map((a) => {
        const r = a.getBoundingClientRect();
        const name = a.getAttribute("data-name") ?? "";
        // A flat's bowl sits on its line or space, its stem rises above: aim at the bowl.
        const y = name.includes("flat") ? r.bottom - half * 0.8 : r.top + r.height / 2;
        return {
          y,
          alt: name.endsWith("dblsharp")
            ? 2
            : name.endsWith("dblflat")
              ? -2
              : name.endsWith("sharp")
                ? 1
                : name.endsWith("flat")
                  ? -1
                  : 0,
        };
      });
      // Each accidental belongs to its nearest head (a second's heads sit half a space apart).
      const accOf = new Map<number, { y: number; alt: number }>();
      for (const a of accs) {
        let best = -1;
        for (let i = 0; i < heads.length; i++)
          if (
            best < 0 ||
            Math.abs((heads[i] as { y: number }).y - a.y) < Math.abs((heads[best] as { y: number }).y - a.y)
          )
            best = i;
        if (best >= 0 && Math.abs((heads[best] as { y: number }).y - a.y) < half * 1.2) accOf.set(best, a);
      }
      const drawn: string[] = [];
      let above = 0;
      let below = 0;
      for (const [hi, h] of heads.entries()) {
        const p = topP - h.step;
        const letter = LET[((p % 7) + 7) % 7] as string;
        const oct = 4 + Math.floor(p / 7);
        const acc = accOf.get(hi);
        const k = `${v}|${mm}|${letter}${oct}`;
        let alt: number;
        if (acc) {
          alt = acc.alt;
          barState.set(k, alt);
        } else alt = barState.get(k) ?? sig[letter] ?? 0;
        drawn.push(`${letter}${alt > 0 ? "#".repeat(alt) : "b".repeat(-alt)}${oct}`);
        if (h.step <= -2) above = Math.max(above, Math.floor(-h.step / 2));
        if (h.step >= 10) below = Math.max(below, Math.floor((h.step - 8) / 2));
      }
      const label = g.getAttribute("aria-label") ?? "";
      const said = (label.split(",")[0] ?? "").trim().split(/\s+/);
      const bar = Number(/bar (\d+)/.exec(label)?.[1] ?? 0);
      maxBar = Math.max(maxBar, bar);
      const lyric = g.querySelector(".abcjs-lyric");
      const tspans = lyric
        ? [...lyric.querySelectorAll("tspan")].map((t) => (t.textContent ?? "").trim())
        : [];
      notes.push({
        n: num(g, /^oak-e(\d+)$/),
        bar,
        said,
        drawn,
        ledgers: g.querySelectorAll(".abcjs-ledger").length,
        ledgersNeeded: above + below,
        clef,
        lines: tspans.filter(Boolean),
        degree: g.getAttribute("data-oak-degree"),
        heads: heads.map((h) => ({
          deg: h.el.getAttribute("data-oak-deg"),
          fill: getComputedStyle(h.el).fill,
        })),
      });
    }
    return { notes, bars: maxBar, problems };
  });
}

export const glyph = (s: string) => s.replace(/#/g, "♯").replace(/(?<=[A-G])b/g, "♭");
export const norm = (xs: readonly string[]) => [...xs].sort().join(" ");

/** Every drawn note is the pitch it says, with its ledger lines, lens lines and head colours. */
export function verify(
  notes: DrawnNote[],
  lenses: { degree: boolean; solfege: boolean; names: boolean },
): string[] {
  const out: string[] = [];
  for (const d of notes) {
    if (norm(d.drawn) !== norm(d.said)) out.push(`bar ${d.bar} n${d.n}: drawn ${d.drawn} but is ${d.said}`);
    // abcjs draws one ledger per line per head column; a chord shares them. At least the lines needed, never
    // ledger lines inside the staff.
    if (d.ledgers < d.ledgersNeeded)
      out.push(`bar ${d.bar} n${d.n}: ${d.ledgers} ledger lines, needs ${d.ledgersNeeded}`);
    if (d.ledgersNeeded === 0 && d.ledgers > 0) out.push(`bar ${d.bar} n${d.n}: stray ledger lines`);
    const want: string[] = [];
    if (lenses.degree && d.degree) want.push(d.degree);
    if (lenses.names) want.push(d.said.map(glyph).join(" "));
    const got = d.lines.map((l) => l.replace(/\s+/g, " "));
    if (lenses.degree && d.degree && got[0] !== d.degree)
      out.push(`bar ${d.bar} n${d.n}: degree line "${got[0]}" ≠ ${d.degree}`);
    if (lenses.names && !got.includes(want[want.length - 1] as string))
      out.push(`bar ${d.bar} n${d.n}: name line ${JSON.stringify(got)} lacks ${want[want.length - 1]}`);
    if (lenses.degree && d.degree) {
      const nums = d.degree.split(" ").map((x) => x.replace(/[^\d]/g, ""));
      const heads = d.heads.map((h) => h.deg);
      if (norm(heads.map(String)) !== norm(nums))
        out.push(`bar ${d.bar} n${d.n}: head colours ${heads} for ${nums}`);
    }
  }
  return out;
}
