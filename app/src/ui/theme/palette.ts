// The music-semantic palette (ux §7.3), as data for canvas and SVG renderers (roll, staff, pads, tree).
// Okabe–Ito degree colours, colour-blind safe; an altered degree keeps its base colour and adds a hatch
// (♭ = 45°, ♯ = −45°, 4 px). Wherever a degree colour appears, the degree label appears too.
import type { Degree } from "@oak/api";

export type ThemeName = "paper" | "bark";
export type BaseDegree = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Alteration = "flat" | "sharp" | null;

export interface Swatch {
  fill: string;
  /** Text drawn on top of the fill. */
  label: string;
  /** Extra 1 px outline for fills too light to hold their edge (degree 3 on Paper). */
  outline?: string;
}

const PAPER_LABEL_DARK = "#1F1A14";
const BARK_LABEL_DARK = "#14110E";

export const DEGREE_COLOURS: Record<ThemeName, Record<BaseDegree, Swatch>> = {
  paper: {
    1: { fill: "#D55E00", label: "#FFFFFF" },
    2: { fill: "#E69F00", label: PAPER_LABEL_DARK },
    3: { fill: "#E8D93A", label: PAPER_LABEL_DARK, outline: "#8A7A10" },
    4: { fill: "#009E73", label: "#FFFFFF" },
    5: { fill: "#56B4E9", label: PAPER_LABEL_DARK },
    6: { fill: "#0072B2", label: "#FFFFFF" },
    7: { fill: "#CC79A7", label: PAPER_LABEL_DARK },
  },
  bark: {
    1: { fill: "#F07A2A", label: BARK_LABEL_DARK },
    2: { fill: "#F2B53A", label: BARK_LABEL_DARK },
    3: { fill: "#F3E86A", label: BARK_LABEL_DARK },
    4: { fill: "#2BC08F", label: BARK_LABEL_DARK },
    5: { fill: "#7CC8F2", label: BARK_LABEL_DARK },
    6: { fill: "#3B95D6", label: BARK_LABEL_DARK },
    7: { fill: "#DE97C0", label: BARK_LABEL_DARK },
  },
};

/** Non-diatonic with no degree reading, or an unknown pitch. */
export const NEUTRAL: Record<ThemeName, Swatch> = {
  paper: { fill: "#8A7F72", label: "#FFFFFF" },
  bark: { fill: "#8C8172", label: BARK_LABEL_DARK },
};

/** Harmonic functions take the colour of their home degree: T = 1, PD = 4, D = 5, always with the text label. */
export type HarmonicFn = "T" | "PD" | "D";
export const FUNCTION_DEGREE: Record<HarmonicFn, BaseDegree> = { T: 1, PD: 4, D: 5 };

/** Layers, drum parts and tracks — never pitches. */
export const PARTS_PALETTE = ["#8C6A4F", "#6F7D5C", "#5E6F86", "#8A6A86", "#9A7B3F", "#5F8077"] as const;

/** Hatch geometry for altered degrees: 4 px spacing; ♭ leans one way, ♯ the other. */
export const HATCH = { spacing: 4, width: 1.25, flatAngle: 45, sharpAngle: -45 } as const;

export interface DegreeStyle extends Swatch {
  base: BaseDegree | null;
  alteration: Alteration;
  /** What to print: `5`, `♭7`, `♯4`. Always shown with the colour. */
  text: string;
  /** Hatch angle in degrees, or `null` for a diatonic degree. */
  hatchAngle: number | null;
  /** Dashed border: secondary or chromatic function (V/V uses the D colour, dashed). */
  dashed: boolean;
}

/** Splits `"b7"`, `"#4"`, `"5"` into base and alteration. Returns `null` for anything else. */
export function parseDegree(degree: Degree | string): { base: BaseDegree; alteration: Alteration } | null {
  const m = /^(b|#)?([1-7])$/.exec(degree);
  if (!m) return null;
  const base = Number(m[2]) as BaseDegree;
  const alteration: Alteration = m[1] === "b" ? "flat" : m[1] === "#" ? "sharp" : null;
  return { base, alteration };
}

/** Printed form with real accidentals: `b7` → `♭7`. */
export function degreeText(degree: Degree | string): string {
  return degree.replace(/^b/, "♭").replace(/^#/, "♯");
}

export function degreeStyle(degree: Degree | string | null, theme: ThemeName): DegreeStyle {
  const parsed = degree ? parseDegree(degree) : null;
  if (!parsed) {
    return {
      ...NEUTRAL[theme],
      base: null,
      alteration: null,
      text: degree ? degreeText(degree) : "?",
      hatchAngle: null,
      dashed: false,
    };
  }
  const swatch = DEGREE_COLOURS[theme][parsed.base];
  return {
    ...swatch,
    base: parsed.base,
    alteration: parsed.alteration,
    text: degreeText(degree as string),
    hatchAngle:
      parsed.alteration === "flat"
        ? HATCH.flatAngle
        : parsed.alteration === "sharp"
          ? HATCH.sharpAngle
          : null,
    dashed: false,
  };
}

export function functionStyle(fn: HarmonicFn, theme: ThemeName, secondary = false): DegreeStyle {
  const base = FUNCTION_DEGREE[fn];
  return {
    ...DEGREE_COLOURS[theme][base],
    base,
    alteration: null,
    text: fn,
    hatchAngle: null,
    dashed: secondary,
  };
}

/** CSS background for a degree chip: solid fill, plus a hatch overlay for an altered degree. */
export function degreeBackgroundCss(style: DegreeStyle): string {
  if (style.hatchAngle === null) return style.fill;
  const line = "rgba(0,0,0,0.28)";
  const { spacing, width } = HATCH;
  // CSS gradient angles run clockwise from "to top"; 45° in screen terms is a "/" stroke for ♭.
  const angle = style.hatchAngle === HATCH.flatAngle ? 45 : -45;
  return `repeating-linear-gradient(${angle}deg, ${line} 0 ${width}px, transparent ${width}px ${spacing}px), ${style.fill}`;
}

/** Minimal 2D context surface the canvas helpers need (keeps them testable without a DOM). */
export interface PatternHost {
  createPattern(image: CanvasImageSource, repetition: string | null): CanvasPattern | null;
}

const patternCache = new Map<string, CanvasPattern>();

/**
 * A fill for canvas renderers: a colour string for diatonic degrees, a hatched `CanvasPattern` for altered
 * ones (built once per colour and angle, on an OffscreenCanvas).
 */
export function degreeCanvasFill(style: DegreeStyle, host: PatternHost): string | CanvasPattern {
  if (style.hatchAngle === null || typeof OffscreenCanvas === "undefined") return style.fill;
  const key = `${style.fill}|${style.hatchAngle}`;
  const cached = patternCache.get(key);
  if (cached) return cached;
  const size = HATCH.spacing * 2;
  const tile = new OffscreenCanvas(size, size);
  const g = tile.getContext("2d");
  if (!g) return style.fill;
  g.fillStyle = style.fill;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = "rgba(0,0,0,0.28)";
  g.lineWidth = HATCH.width;
  g.beginPath();
  if (style.hatchAngle === HATCH.flatAngle) {
    for (let o = -size; o <= size * 2; o += HATCH.spacing) {
      g.moveTo(o, size);
      g.lineTo(o + size, 0);
    }
  } else {
    for (let o = -size; o <= size * 2; o += HATCH.spacing) {
      g.moveTo(o, 0);
      g.lineTo(o + size, size);
    }
  }
  g.stroke();
  const pattern = host.createPattern(tile, "repeat");
  if (!pattern) return style.fill;
  patternCache.set(key, pattern);
  return pattern;
}

/** Reads the active theme from `<html data-theme>` (canvas renderers call this per frame or on change). */
export function currentTheme(): ThemeName {
  if (typeof document === "undefined") return "paper";
  return document.documentElement.dataset.theme === "bark" ? "bark" : "paper";
}
