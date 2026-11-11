// Percussion staff map: where each drum sound sits and which notehead it takes (common drum-kit
// notation on a 5-line percussion staff, read with treble-clef positions).
import type { DrumRole } from "@oak/content-kit";

export interface DrumPlace {
  pitch: string;
  head: "normal" | "x";
}

const BY_SOUND: Record<string, DrumPlace> = {
  bd: { pitch: "F4", head: "normal" },
  sd: { pitch: "C5", head: "normal" },
  rim: { pitch: "C5", head: "x" },
  rs: { pitch: "C5", head: "x" },
  cp: { pitch: "D5", head: "x" },
  hh: { pitch: "G5", head: "x" },
  oh: { pitch: "G5", head: "x" },
  cr: { pitch: "A5", head: "x" },
  rd: { pitch: "F5", head: "x" },
  ht: { pitch: "E5", head: "normal" },
  mt: { pitch: "D5", head: "normal" },
  lt: { pitch: "A4", head: "normal" },
  cb: { pitch: "E5", head: "x" },
  sh: { pitch: "B5", head: "x" },
  tb: { pitch: "B5", head: "x" },
  perc: { pitch: "E5", head: "x" },
  misc: { pitch: "E5", head: "x" },
};
const BY_ROLE: Record<DrumRole, string> = {
  kick: "bd",
  snare: "sd",
  clap: "cp",
  rim: "rim",
  hatClosed: "hh",
  hatOpen: "oh",
  tom: "mt",
  crash: "cr",
  ride: "rd",
  shaker: "sh",
  perc: "perc",
};

/** Where a drum sound sits on the percussion staff and which notehead it takes (bd F4, sd C5, hh G5 with x heads). */
export function drumStaffPosition(s: string): DrumPlace | null {
  const base = s.toLowerCase().replace(/[:\d].*$/, "");
  return BY_SOUND[base] ?? null;
}
/** The staff place of an event: its sound name first, then its drum role. */
export function drumPlace(
  s: string | undefined,
  role: DrumRole | undefined,
): (DrumPlace & { s: string }) | null {
  if (s) {
    const p = drumStaffPosition(s);
    if (p) return { ...p, s };
  }
  if (role) {
    const name = BY_ROLE[role];
    const p = BY_SOUND[name];
    if (p) return { ...p, s: s ?? name };
  }
  return null;
}
/** Sounds written with stems down in a second voice (the feet). */
export const isFoot = (s: string, role?: DrumRole): boolean =>
  role === "kick" || drumStaffPosition(s)?.pitch === "F4";
export const DRUM_NAMES = Object.keys(BY_SOUND);
