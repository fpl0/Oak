import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEGREE_COLOURS,
  degreeBackgroundCss,
  degreeStyle,
  degreeText,
  functionStyle,
  NEUTRAL,
  parseDegree,
  type ThemeName,
} from "./palette.ts";
import { DEFAULT_PREFS, resolveReducedMotion, resolveTheme, sanitizePrefs } from "./prefs.ts";

// --- WCAG contrast --------------------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

function tokens(theme: ThemeName): Record<string, string> {
  const css = readFileSync(join(import.meta.dir, "tokens.css"), "utf8");
  const block =
    theme === "paper"
      ? /:root,\s*:root\[data-theme="paper"\]\s*\{([^}]*)\}/.exec(css)?.[1]
      : /:root\[data-theme="bark"\]\s*\{([^}]*)\}/.exec(css)?.[1];
  const out: Record<string, string> = {};
  for (const m of (block ?? "").matchAll(/--oak-([\w-]+):\s*(#[0-9a-fA-F]{6})/g))
    out[m[1] as string] = m[2] as string;
  return out;
}

describe("tokens.css (ux §7.2, §7.9: WCAG 2.2 AA in both themes)", () => {
  for (const theme of ["paper", "bark"] as const) {
    const t = tokens(theme);
    test(`${theme}: every neutral token is defined`, () => {
      for (const k of [
        "bg",
        "surface",
        "surface-2",
        "border",
        "text",
        "text-2",
        "text-3",
        "accent",
        "issue",
        "danger",
      ])
        expect(t[k]).toMatch(/^#/);
    });
    test(`${theme}: body text passes 4.5:1 on every surface`, () => {
      for (const fg of ["text", "text-2", "text-3"])
        for (const bg of ["bg", "surface", "surface-2"])
          expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(4.5);
    });
    test(`${theme}: accent, issue and danger pass 3:1 as UI colours, and the accent button label 4.5:1`, () => {
      for (const c of ["accent", "issue", "danger"])
        expect(contrast(t[c] as string, t.bg as string)).toBeGreaterThanOrEqual(3);
      expect(contrast(t["on-accent"] as string, t.accent as string)).toBeGreaterThanOrEqual(4.5);
    });
  }
  test("the spec colours of ux §7.2 are kept where they pass", () => {
    expect(tokens("paper").bg).toBe("#f6f2ea");
    expect(tokens("bark").bg).toBe("#14110e");
    expect(tokens("paper").accent).toBe("#2f6b45");
    expect(tokens("bark").accent).toBe("#6fbf8a");
  });
});

describe("music palette (ux §7.3)", () => {
  test("the seven degrees use the Okabe–Ito set on Paper", () => {
    expect(Object.values(DEGREE_COLOURS.paper).map((s) => s.fill)).toEqual([
      "#D55E00",
      "#E69F00",
      "#E8D93A",
      "#009E73",
      "#56B4E9",
      "#0072B2",
      "#CC79A7",
    ]);
  });

  test("degree labels stay legible on their fill (3:1, bold note labels)", () => {
    for (const theme of ["paper", "bark"] as const) {
      for (const s of Object.values(DEGREE_COLOURS[theme]))
        expect(contrast(s.label, s.fill)).toBeGreaterThanOrEqual(3);
      expect(contrast(NEUTRAL[theme].label, NEUTRAL[theme].fill)).toBeGreaterThanOrEqual(3);
    }
  });

  test("all seven fills are distinct in each theme", () => {
    for (const theme of ["paper", "bark"] as const)
      expect(new Set(Object.values(DEGREE_COLOURS[theme]).map((s) => s.fill)).size).toBe(7);
  });

  test("altered degrees keep the base colour, add a hatch and print the accidental", () => {
    expect(parseDegree("b7")).toEqual({ base: 7, alteration: "flat" });
    expect(parseDegree("#4")).toEqual({ base: 4, alteration: "sharp" });
    expect(parseDegree("8")).toBeNull();
    const flat7 = degreeStyle("b7", "paper");
    expect(flat7.fill).toBe(DEGREE_COLOURS.paper[7].fill);
    expect(flat7.hatchAngle).toBe(45);
    expect(flat7.text).toBe("♭7");
    const sharp4 = degreeStyle("#4", "bark");
    expect(sharp4.hatchAngle).toBe(-45);
    expect(sharp4.text).toBe("♯4");
    expect(degreeStyle("5", "paper").hatchAngle).toBeNull();
    expect(degreeBackgroundCss(flat7)).toContain("repeating-linear-gradient(45deg");
    expect(degreeBackgroundCss(degreeStyle("5", "paper"))).toBe("#56B4E9");
    expect(degreeText("b3")).toBe("♭3");
  });

  test("unknown pitches are neutral and still labelled", () => {
    const s = degreeStyle(null, "paper");
    expect(s.fill).toBe(NEUTRAL.paper.fill);
    expect(s.text).toBe("?");
  });

  test("T / PD / D take the colours of degrees 1, 4 and 5; secondary functions are dashed", () => {
    expect(functionStyle("T", "paper").fill).toBe(DEGREE_COLOURS.paper[1].fill);
    expect(functionStyle("PD", "paper").fill).toBe(DEGREE_COLOURS.paper[4].fill);
    expect(functionStyle("D", "bark").fill).toBe(DEGREE_COLOURS.bark[5].fill);
    expect(functionStyle("D", "paper", true).dashed).toBe(true);
    expect(functionStyle("D", "paper").text).toBe("D");
  });
});

describe("UI preferences", () => {
  test("sanitize keeps valid values and drops junk", () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs({ theme: "bark", uiScale: 200, tutorWidth: 400, motion: "sideways" })).toEqual({
      ...DEFAULT_PREFS,
      theme: "bark",
      tutorWidth: 400,
    });
  });
  test("system theme and motion follow the OS", () => {
    expect(resolveTheme("system", true)).toBe("bark");
    expect(resolveTheme("system", false)).toBe("paper");
    expect(resolveTheme("paper", true)).toBe("paper");
    expect(resolveReducedMotion("system", true)).toBe(true);
    expect(resolveReducedMotion("off", true)).toBe(false);
    expect(resolveReducedMotion("on", false)).toBe(true);
  });
});
