// The voicing() unlock moment's comparison (contracts §3.1 rule 6, ux "voicing() ceremony after hand-voicing"):
// the learner's own hand voicing from U05.L07 next to Strudel's `.voicing()` of the same changes. Pure: which
// sketch is the hand voicing, which track holds the chords, and Strudel's version of the code. Tested in
// voicing-compare.test.ts.
import type { Sketch } from "@oak/api";

/** The lesson whose Make holds the learner's hand voicing (the voicing gate's lesson). */
export const HAND_VOICING_LESSON = "U05.L07";

/** The progression the gate voices (I–IV–V–I in C), for when no hand voicing is in the sketchbook. */
export const GATE_CHANGES = "<C F G C>";

/** The learner's latest U05.L07 Make sketch (lesson Makes are saved as `lesson-make` sketches). */
export function handVoicingSketch(sketches: readonly Sketch[]): Sketch | null {
  const mine = sketches.filter((s) => s.originKind === "lesson-make" && s.originId === HAND_VOICING_LESSON);
  mine.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return mine[0] ?? null;
}

interface Block {
  label: string;
  from: number;
  to: number;
}

/** The labelled blocks of the code (`name:` at the start of a line, to the next label), in order. */
export function labelledBlocks(code: string): Block[] {
  const re = /^[ \t]*([A-Za-z_$][\w$]*)[ \t]*:/gm;
  const starts: { label: string; at: number }[] = [];
  for (let m = re.exec(code); m; m = re.exec(code)) starts.push({ label: m[1] as string, at: m.index });
  return starts.map((s, i) => ({ label: s.label, from: s.at, to: starts[i + 1]?.at ?? code.length }));
}

/** The chord track a hand voicing is written on: `chords:` or `pad:`, else `keys:`/`piano:`. */
export function chordBlock(code: string): Block | null {
  const blocks = labelledBlocks(code);
  for (const want of ["chords", "pad", "keys", "piano"]) {
    const b = blocks.find((x) => x.label === want);
    if (b) return b;
  }
  return null;
}

/** The sound the learner's chord track plays (its first `.s("…")`), else piano. */
export function soundOf(block: string): string {
  const m = /\.s(?:ound)?\(\s*["']([A-Za-z0-9_:-]+)["']\s*\)/.exec(block);
  return m?.[1] ?? "piano";
}

/**
 * Strudel's version: the learner's code with the chord track replaced by `chord("…").voicing()` of the same
 * changes on the same sound; everything else (tempo, bass, drums) stays, so the two differ only in the voicing.
 * Without a chord track, the changes alone at the learner's tempo.
 */
export function strudelVersion(handCode: string, changes: string): string {
  const block = chordBlock(handCode);
  const line = (sound: string) => `chords: chord("${changes}").voicing().s("${sound}")`;
  if (!block) {
    const tempo = /^\s*setcp[ms]\([^)]*\)\s*$/m.exec(handCode)?.[0]?.trim();
    return `${tempo ? `${tempo}\n\n` : ""}${line("piano")}`;
  }
  const text = handCode.slice(block.from, block.to);
  const tail = /\n\s*$/.exec(text)?.[0] ?? "\n";
  return `${handCode.slice(0, block.from)}${line(soundOf(text))}${tail}${handCode.slice(block.to)}`.trimEnd();
}

/** The gate's progression voiced by Strudel, when no hand voicing is in the sketchbook. */
export function gateExample(): string {
  return `setcpm(88/4)\n\n${`chords: chord("${GATE_CHANGES}").voicing().s("piano")`}\nbass: note("<c2 f2 g2 c2>").s("piano")`;
}
