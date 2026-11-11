// UI preferences that live in the browser only (contracts §11.10: SQLite is the source of truth; the browser
// keeps only UI preferences). boot.js reads the same key before first paint.
import { create } from "zustand";

export const PREFS_KEY = "oak.ui.v1";

export type ThemePref = "system" | "paper" | "bark";
export type MotionPref = "system" | "on" | "off";

export interface UiPrefs {
  theme: ThemePref;
  /** Reduced motion: follow the system, force on, or force off. */
  motion: MotionPref;
  contrast: boolean;
  /** UI scale in percent, 90–125. */
  uiScale: number;
  /** Calm highlighting: steady outlines instead of per-hap flashes (ux §7.6). */
  calmHighlight: boolean;
  /** Docked tutor panel width, 320–520 (ux §2.1). */
  tutorWidth: number;
  tutorOpen: boolean;
  /** "Strudel-compatible Ctrl on macOS": both Ctrl and Cmd act as the modifier. */
  macCtrl: boolean;
}

export const DEFAULT_PREFS: UiPrefs = {
  theme: "system",
  motion: "system",
  contrast: false,
  uiScale: 100,
  calmHighlight: false,
  tutorWidth: 360,
  tutorOpen: false,
  macCtrl: true,
};

export const TUTOR_WIDTH = { min: 320, max: 520 } as const;

/** Coerces stored JSON into valid prefs (unknown or out-of-range values fall back to defaults). */
export function sanitizePrefs(raw: unknown): UiPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T>(v: unknown, ok: (x: unknown) => x is T, d: T): T => (ok(v) ? v : d);
  const isOneOf =
    <T extends string>(...xs: T[]) =>
    (v: unknown): v is T =>
      typeof v === "string" && (xs as string[]).includes(v);
  const isBool = (v: unknown): v is boolean => typeof v === "boolean";
  const inRange =
    (lo: number, hi: number) =>
    (v: unknown): v is number =>
      typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  return {
    theme: pick(r.theme, isOneOf<ThemePref>("system", "paper", "bark"), DEFAULT_PREFS.theme),
    motion: pick(r.motion, isOneOf<MotionPref>("system", "on", "off"), DEFAULT_PREFS.motion),
    contrast: pick(r.contrast, isBool, DEFAULT_PREFS.contrast),
    uiScale: pick(r.uiScale, inRange(90, 125), DEFAULT_PREFS.uiScale),
    calmHighlight: pick(r.calmHighlight, isBool, DEFAULT_PREFS.calmHighlight),
    tutorWidth: pick(r.tutorWidth, inRange(TUTOR_WIDTH.min, TUTOR_WIDTH.max), DEFAULT_PREFS.tutorWidth),
    tutorOpen: pick(r.tutorOpen, isBool, DEFAULT_PREFS.tutorOpen),
    macCtrl: pick(r.macCtrl, isBool, DEFAULT_PREFS.macCtrl),
  };
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): "paper" | "bark" {
  if (pref === "paper" || pref === "bark") return pref;
  return systemDark ? "bark" : "paper";
}

export function resolveReducedMotion(pref: MotionPref, systemReduced: boolean): boolean {
  if (pref === "on") return true;
  if (pref === "off") return false;
  return systemReduced;
}

function loadPrefs(): UiPrefs {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_PREFS;
    return sanitizePrefs(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}"));
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: UiPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or storage disabled: preferences last for this tab only.
  }
}

interface PrefsStore extends UiPrefs {
  set(patch: Partial<UiPrefs>): void;
}

export const usePrefs = create<PrefsStore>((set, get) => ({
  ...loadPrefs(),
  set(patch) {
    set(sanitizePrefs({ ...pick(get()), ...patch }));
    savePrefs(pick(get()));
  },
}));

function pick(s: UiPrefs): UiPrefs {
  return {
    theme: s.theme,
    motion: s.motion,
    contrast: s.contrast,
    uiScale: s.uiScale,
    calmHighlight: s.calmHighlight,
    tutorWidth: s.tutorWidth,
    tutorOpen: s.tutorOpen,
    macCtrl: s.macCtrl,
  };
}

/** Applies prefs to `<html>` and keeps "System" in step with the OS. Call once at start-up. */
export function installPrefsSync(): () => void {
  const root = document.documentElement;
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const apply = () => {
    const p = usePrefs.getState();
    root.dataset.theme = resolveTheme(p.theme, dark.matches);
    root.dataset.motion = resolveReducedMotion(p.motion, reduced.matches) ? "reduced" : "full";
    if (p.contrast) root.dataset.contrast = "high";
    else delete root.dataset.contrast;
    root.style.fontSize = p.uiScale === 100 ? "" : `${p.uiScale}%`;
    if (p.calmHighlight) root.dataset.calm = "1";
    else delete root.dataset.calm;
  };
  apply();
  const unsub = usePrefs.subscribe(apply);
  dark.addEventListener("change", apply);
  reduced.addEventListener("change", apply);
  return () => {
    unsub();
    dark.removeEventListener("change", apply);
    reduced.removeEventListener("change", apply);
  };
}
