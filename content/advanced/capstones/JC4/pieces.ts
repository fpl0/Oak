// JC4 Reharmonize a Standard on Georgia on My Mind (content/repertoire/georgia-on-my-mind/song.ts): the pieces the
// brief of content/capstones.ts is graded on in content CI, beside the song's melody (the capstone host passes it
// as `GradeContext.songMelody`; content/validate/owners.ts `briefContext` reads the same answer key).
//   - The host's plain setting: the song's tempo line, its chart as one `changes` string (a bar a step, two chords in
//     a bracket), a bass on the roots and the Rhodes on the default dictionary, the melody layer untouched.
//   - Devices, each placed where the tune agrees (evaluated): a tritone sub for the C7 of bar 14 (G♭7 resolving down a half
//     step to the F∆7 of bar 15; the tune's A there is G♭7's ♯9), a backdoor into bar 31 (B♭m7 E♭7 for the Gm7 C7 of bar 30), a passing F♯°7 on
//     beat 4 of bar 31 under the held F, climbing F, F♯, G into the Gm7 of bar 32.
//   The chart's own Em7 A7 → Dm7 is a secondary ii–V: the host passes the song's chart (`GradeContext.songForm`), so
//   `device-count` counts only bars whose roots the learner changed (W7 gate). Two devices of the learner's fail.
import type { SongDef } from "@oak/content-kit";
import georgia from "../../../repertoire/georgia-on-my-mind/song.ts";

export const GEORGIA: SongDef = georgia;

/** The song's chart as one changes string, a bar a step (two chords: a bracket), as the host's starter builds it. */
export function chartChanges(song: SongDef = GEORGIA): string[] {
  const chart = song.answerKey.chords ?? [];
  return Array.from({ length: song.answerKey.bars }, (_, i) => {
    const here = chart.filter((c) => c.bar === i + 1).sort((a, b) => a.beat - b.beat);
    return here.length === 1
      ? (here[0] as { symbol: string }).symbol
      : `[${here.map((c) => c.symbol).join(" ")}]`;
  });
}

const melodyLayer = (song: SongDef) =>
  (song.answerKey.layers.melody ?? "").replace(/^[A-Za-z_$][\w$]*\s*:\s*/, "");

export interface GeorgiaSetting {
  changes?: readonly string[];
  /** The chords line after `chord(changes)`. */
  chords?: string;
  bass?: string;
  /** Replaces the song's tempo line. */
  tempo?: string;
  /** Lines added after the melody (drums). */
  extra?: string[];
  /** A changed melody line (a wrong answer). */
  mel?: string;
}
/** The host's plain setting of the song, the changes and sounds as given. */
export function georgiaSetting(o: GeorgiaSetting = {}): string {
  const song = GEORGIA;
  return [
    o.tempo ?? (song.answerKey.code.split("\n")[0] as string),
    "",
    `const changes = "<${(o.changes ?? chartChanges(song)).join(" ")}>"`,
    "",
    o.bass ?? `bass: chord(changes).rootNotes(2).s("upright").lpf(900)`,
    `chords: chord(changes)${o.chords ?? '.voicing().s("rhodes").gain(.6)'}`,
    o.mel ?? `mel: ${melodyLayer(song)}`,
    ...(o.extra ?? []),
  ].join("\n");
}

/** Bar → [the chart's chords there, the device that replaces them]. */
export const GEORGIA_DEVICES: Readonly<Record<number, readonly [string, string]>> = {
  14: ["[Gm7 C7]", "[Gm7 Gb7]"],
  30: ["[Gm7 C7]", "[Bbm7 Eb7]"],
  31: ["F^7", "[F^7@3 F#o7]"],
};
/** The chart with the devices of the bars given put in (all three by default). */
export function reharmonized(bars: readonly number[] = [14, 30, 31]): string[] {
  const changes = chartChanges();
  for (const bar of bars) {
    const d = GEORGIA_DEVICES[bar];
    if (!d) throw new Error(`no device for bar ${bar}`);
    if (changes[bar - 1] !== d[0])
      throw new Error(`Georgia's chart changed under bar ${bar}: re-place the device`);
    changes[bar - 1] = d[1];
  }
  return changes;
}

/** The pieces the brief's tests grade (content/capstones.ts JC4). */
export const JC4_PIECES = {
  /** Three devices of the learner's own, the plain Rhodes. */
  three: georgiaSetting({ changes: reharmonized() }),
  /** The same devices on the piano, struck on every beat (the passing chord on beat 4 of bar 31 is struck too). */
  piano: georgiaSetting({
    changes: reharmonized(),
    chords: '.voicing().struct("x x x x").s("piano").gain(.5)',
  }),
  /** The same devices a little slower, with the ride and the hi-hat of the jazz kit. */
  ride: georgiaSetting({
    changes: reharmonized(),
    tempo: "setcpm(64/4)",
    extra: [
      'drums: s("rd [rd rd] rd [rd rd]").swingBy(1/3, 4).bank("jazzkit").gain(.4)',
      'hats: s("~ hh ~ hh").bank("jazzkit").gain(.5)',
    ],
  }),
  /** The same devices over a bass in two (each chord's root on 1 and 3). */
  twoFeel: georgiaSetting({
    changes: reharmonized(),
    bass: 'bass: chord(changes).rootNotes(2).struct("x x").s("upright").lpf(900)',
  }),
  /** WRONG: two devices of the learner's own (backdoor, passing °7); the chart's own ii–V is the song's, not a third. */
  twoOwn: georgiaSetting({ changes: reharmonized([30, 31]) }),
  /** WRONG: the song as the host sets it, no device of the learner's. */
  plain: georgiaSetting(),
  /** WRONG, the right devices written, not heard: the chords line at gain 0. */
  muted: georgiaSetting({ changes: reharmonized(), chords: '.voicing().s("rhodes").gain(0)' }),
  /** WRONG: the devices in, the tune's first note moved a step (degree 3 to 4: A to B♭). */
  tuneMoved: georgiaSetting({
    changes: reharmonized(),
    mel: `mel: ${melodyLayer(GEORGIA).replace('n("<[2 4@3]', 'n("<[3 4@3]')}`,
  }),
};
