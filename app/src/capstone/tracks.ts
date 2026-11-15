// The track capstones' own workspace logic (Wave 7; contracts §2.6, §6.6; docs/design/wave7.md §4.4, §5.4): which
// song a capstone works on (JC3's model head, JC4's standard, AC1's tune), the reharmonisation draft whose melody is
// locked (JC4.S2: the melody line is read-only, the chords are the learner's), the original changes a reharmonisation
// is read against and each device it adds with its bar, the two versions of AC1 (each its own draft, an A/B listen
// at matched loudness), and the sounds a session grants when it starts (horns at RC1.S2, choir at AC2.S1). Pure.
import {
  CAPSTONE_SESSION_SOUNDS,
  type CapstoneDef,
  type CapstoneSessions,
  type CapstoneVersionDef,
  type SongDef,
  type SongId,
  type ToolEntry,
} from "@oak/api";
import { type ReharmView, songFormOf } from "@oak/grader";
import type { BandSetup } from "@oak/strudel";
import { METERS, parseChordSymbol, triadCore } from "@oak/theory";
import { chordText, trackBodies } from "./wave7.ts";

// --- songs -------------------------------------------------------------------------------------------------------

/**
 * The songs a compose capstone works on when its brief does not list them (`CapstoneDef.song`): JC3's model (the
 * head whose changes a contrafact keeps and whose melody it must not repeat), JC4's two 1930 standards, AC1's two
 * tunes (contracts §2.6, §2.8; wave7.md §5.3).
 */
export const CAPSTONE_SONGS: Readonly<Record<string, readonly SongId[]>> = {
  JC3: ["song.i-got-rhythm"],
  JC4: ["song.georgia-on-my-mind", "song.body-and-soul"],
  AC1: ["song.st-louis-blues", "song.sweet-georgia-brown"],
};

/**
 * The song's chart for a brief that counts reharmonisation devices (JC4's `device-count`), else null: passed as
 * `GradeContext.songForm` so the song's own devices are not counted as the learner's (W7 gate; content CI grades the
 * same way, content/validate/owners.ts `briefContext`).
 */
export function songFormFor(
  def: Pick<CapstoneDef, "brief">,
  song: Parameters<typeof songFormOf>[0] | null,
): NonNullable<ReturnType<typeof songFormOf>> | null {
  if (!song || !(def.brief?.rubric ?? []).some((r) => r.rule === "device-count")) return null;
  return songFormOf(song);
}

/** The songs this capstone offers or reads, in the brief's order. */
export function songsOf(def: Pick<CapstoneDef, "id" | "song">): readonly SongId[] {
  return def.song && def.song.length > 0 ? def.song : (CAPSTONE_SONGS[def.id] ?? []);
}

/** Whether the learner picks the song at the start (JC4, AC1); JC3's model is fixed. */
export function picksSong(def: Pick<CapstoneDef, "id" | "song" | "kind">): boolean {
  return def.kind !== "transcribe" && songsOf(def).length > 1;
}

/** The song a draft was started on (its tag), else the capstone's only song. */
export function songOfDraft(def: Pick<CapstoneDef, "id" | "song">, tags: readonly string[]): SongId | null {
  const offered = songsOf(def);
  const tagged = tags.find((t): t is SongId => t.startsWith("song.") && offered.includes(t as SongId));
  return tagged ?? (offered.length === 1 ? (offered[0] as SongId) : null);
}

/** "setcpm(72/4)": the tempo line of a song's answer key, else one built from its BPM and meter. */
export function tempoLineOf(song: Pick<SongDef, "answerKey" | "bpm" | "meter">): string {
  const first = song.answerKey.code.split("\n").find((l) => l.trim().startsWith("setcpm("));
  return first?.trim() ?? `setcpm(${song.bpm}/${METERS[song.meter].unitsPerBar})`;
}

/** One chord a bar from the song's lead sheet (the first chord of each bar), `bars` long. */
export function originalChanges(song: Pick<SongDef, "answerKey">): string[] {
  const chords = song.answerKey.chords ?? [];
  const out: string[] = [];
  let last = chords[0]?.symbol ?? "";
  for (let b = 1; b <= song.answerKey.bars; b++) {
    last = chords.filter((c) => c.bar === b).sort((x, y) => x.beat - y.beat)[0]?.symbol ?? last;
    out.push(last);
  }
  return out;
}

/** The lead sheet's chords as one mini-notation pattern, a bar per step (beats inside a bar split it evenly). */
export function changesPattern(song: Pick<SongDef, "answerKey">): string {
  const chords = song.answerKey.chords ?? [];
  const bars: string[] = [];
  let last = chords[0]?.symbol ?? "C";
  for (let b = 1; b <= song.answerKey.bars; b++) {
    const here = chords.filter((c) => c.bar === b).sort((x, y) => x.beat - y.beat);
    if (here.length === 0) bars.push(last);
    else if (here.length === 1) bars.push((here[0] as { symbol: string }).symbol);
    else bars.push(`[${here.map((c) => c.symbol).join(" ")}]`);
    last = here.at(-1)?.symbol ?? last;
  }
  return `<${bars.join(" ")}>`;
}

/** The marker that opens the locked melody line of a reharmonisation draft. */
export const LOCKED_MELODY_NOTE = "// The melody stays exactly as the song has it: this line is locked.";

/**
 * JC4's draft: the song's tempo, its melody (locked) and its original changes on piano, for the learner to
 * reharmonise. The chords line is theirs; the melody line is read-only in the editor.
 */
export function reharmStarter(song: Pick<SongDef, "answerKey" | "bpm" | "meter">): string {
  const melody = song.answerKey.layers.melody ?? 'note("~")';
  return [
    tempoLineOf(song),
    "",
    `const changes = "${changesPattern(song)}"`,
    "",
    LOCKED_MELODY_NOTE,
    `mel: ${melody.replace(/^[A-Za-z_$][\w$]*\s*:\s*/, "")}`,
    'chords: chord(changes).voicing().s("piano").gain(.6)',
    `bass: chord(changes).rootNotes(2).s("upright")`,
  ].join("\n");
}

/**
 * AC1's draft for one version: the tune's tempo and melody over its changes as plain triads (AC1 can open before
 * the sevenths are unlocked, U12), for the learner to arrange in a genre.
 */
export function arrangeStarter(song: Pick<SongDef, "answerKey" | "bpm" | "meter">): string {
  const melody = song.answerKey.layers.melody ?? 'note("~")';
  const triads = changesPattern(song).replace(/[A-G][#b]?[^\s[\]<>]*/g, (sym) => {
    const c = parseChordSymbol(sym);
    const root = /^[A-G][#b]?/.exec(sym)?.[0] ?? sym;
    const q = c ? triadCore(c).quality : null;
    return q === "maj" ? root : q === "min" ? `${root}m` : sym;
  });
  return [
    tempoLineOf(song),
    "",
    `const changes = "${triads}"`,
    "",
    `mel: ${melody.replace(/^[A-Za-z_$][\w$]*\s*:\s*/, "")}`,
    'chords: chord(changes).voicing().s("piano").gain(.5)',
  ].join("\n");
}

/** Where the melody line sits in the code (the `mel:` or `melody:` line and the lines indented under it), or `null`. */
export function melodySpan(code: string): { from: number; to: number; text: string } | null {
  const lines = code.split("\n");
  let at = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (/^mel(?:ody)?\s*:/.test(line)) {
      let end = at + line.length;
      for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j] as string); j++)
        end += 1 + (lines[j] as string).length;
      return { from: at, to: end, text: code.slice(at, end) };
    }
    at += line.length + 1;
  }
  return null;
}

/**
 * The editor's editable ranges with the melody locked (JC4.S2): everything before and after the `melody:` line.
 * `undefined` (all editable) when the code has no melody line.
 */
export function lockedMelodyEditable(code: string): { editable: { from: number; to: number }[] } | undefined {
  const m = melodySpan(code);
  if (!m) return undefined;
  return {
    editable: [
      { from: 0, to: m.from },
      { from: m.to, to: code.length },
    ],
  };
}

/** The melody line a draft has now differs from the song's: what the workspace says (it never rewrites it). */
export function melodyTouched(code: string, song: Pick<SongDef, "answerKey">): boolean {
  const want = (song.answerKey.layers.melody ?? "").replace(/^[A-Za-z_$][\w$]*\s*:\s*/, "").trim();
  const have =
    melodySpan(code)
      ?.text.replace(/^mel(?:ody)?\s*:\s*/, "")
      .trim() ?? null;
  return want !== "" && have !== null && have.replace(/\s+/g, " ") !== want.replace(/\s+/g, " ");
}

/**
 * "Bar 31: G♭7, a tritone sub (the song has G7 in this bar)." One line per device a reharmonisation adds, in bar
 * order, each device once per bar.
 */
export function reharmRows(view: ReharmView): { bar: number; device: string; text: string }[] {
  const seen = new Set<string>();
  return [...view.devices]
    .sort((a, b) => a.bar - b.bar)
    .filter((d) => {
      const k = `${d.bar}:${d.device}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((d) => ({
      bar: d.bar,
      device: d.device,
      text: `Bar ${d.bar}: ${chordText(d.now)}, ${/^[aeiou]/i.test(d.device) ? "an" : "a"} ${d.device}${d.was ? ` (the song has ${chordText(d.was)} in this bar)` : ""}.`,
    }));
}

/** "3 different devices: tritone sub, backdoor, secondary ii–V." */
export function deviceTally(view: ReharmView, min: number): { text: string; ok: boolean } {
  const kinds = [...new Set(view.devices.map((d) => d.device))];
  return {
    text:
      kinds.length === 0
        ? `No device yet; the brief asks for ${min} different ones.`
        : `${kinds.length} different ${kinds.length === 1 ? "device" : "devices"} of ${min}: ${kinds.join(", ")}.`,
    ok: kinds.length >= min,
  };
}

// --- sounds a session grants when it starts (contracts §3.2 rule 11) -----------------------------------------

/**
 * The toolbox rows granted when this capstone session starts (`horns` at RC1.S2, `choir` at AC2.S1): the toolbox's
 * START rows and the API's `CAPSTONE_SESSION_SOUNDS` (the horns row lists RC1.S2 without `when: "start"`).
 */
export function sessionStartUnlocks(toolbox: readonly ToolEntry[], sessionId: string): ToolEntry[] {
  const sounds = new Set<string>(
    CAPSTONE_SESSION_SOUNDS.filter((x) => x.capstoneSessionId === sessionId).map((x) => x.sound),
  );
  return toolbox.filter((t) => {
    const at = Array.isArray(t.unlock.at) ? t.unlock.at : [t.unlock.at];
    return (t.unlock.when === "start" && at.includes(sessionId as never)) || sounds.has(t.id);
  });
}

// --- AC1: two versions --------------------------------------------------------------------------------------

/** AC1's versions: the brief's (`CapstoneDef.versions`), else version one in S1 and version two in S2. */
export function versionsOf(def: Pick<CapstoneDef, "id" | "versions" | "sessionDefs">): CapstoneVersionDef[] {
  if (def.versions && def.versions.length === 2) return def.versions;
  if (def.id !== "AC1") return [];
  const [s1, s2] = def.sessionDefs;
  if (!s1 || !s2) return [];
  return [
    { id: "a", label: "Version one", startsIn: s1.id },
    { id: "b", label: "Version two", startsIn: s2.id },
  ];
}

export const versionTag = (id: "a" | "b"): string => `version:${id}`;

/** The version a session works on: the one it starts, else (the last session) the one the learner picked. */
export function versionOfSession(
  versions: readonly CapstoneVersionDef[],
  sessionId: string | null,
  picked: "a" | "b" | null,
): "a" | "b" {
  const starts = versions.find((v) => v.startsIn === sessionId);
  return starts?.id ?? picked ?? "a";
}

/** A version is open to edit once its starting session is reached (version two waits for session 2). */
export function versionOpen(
  versions: readonly CapstoneVersionDef[],
  id: "a" | "b",
  sessionIndex: (sessionId: string) => number,
  currentIndex: number,
): boolean {
  const v = versions.find((x) => x.id === id);
  return !!v && sessionIndex(v.startsIn) <= currentIndex;
}

/** Where a version's draft is: its sketch, and the sketch version that holds it (`null`: the sketch's newest). */
export interface VersionDraft {
  sketchId: string;
  sketchVersion: number | null;
}

/**
 * Each version's draft: the server's (`CapstoneSessions.versions`, a brief that declares its versions), else a
 * capstone sketch tagged with the version, else the draft each version's starting session saved
 * (`CapstoneSessions.sessions[].draft`: a seeded AC1 keeps both in one sketch, version one in S1's sketch version and
 * version two in S2's), else the linked draft as version one.
 */
export function versionDrafts(
  server: CapstoneSessions | null | undefined,
  sketches: readonly {
    id: string;
    originId: string | null;
    tags: readonly string[];
    archived: boolean;
    updatedAt: string;
  }[],
  capstoneId: string,
  linked: string | null,
  versions: readonly Pick<CapstoneVersionDef, "id" | "startsIn">[] = [],
): Record<"a" | "b", VersionDraft | null> {
  const fromServer = (id: "a" | "b"): VersionDraft | null => {
    const d = server?.versions?.find((v) => v.id === id)?.draft;
    return d ? { sketchId: d.sketchId, sketchVersion: d.sketchVersion } : null;
  };
  const tagged = (id: "a" | "b"): VersionDraft | null => {
    const s = sketches
      .filter((x) => x.originId === capstoneId && !x.archived && x.tags.includes(versionTag(id)))
      .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0];
    return s ? { sketchId: s.id, sketchVersion: null } : null;
  };
  const ofSession = (id: "a" | "b"): VersionDraft | null => {
    const startsIn = versions.find((v) => v.id === id)?.startsIn;
    const d = server?.sessions.find((x) => x.capstoneSessionId === startsIn)?.draft;
    return d ? { sketchId: d.sketchId, sketchVersion: d.sketchVersion } : null;
  };
  const a = fromServer("a") ?? tagged("a") ?? ofSession("a");
  const b = fromServer("b") ?? tagged("b") ?? ofSession("b");
  // A draft saved before the versions were told apart is version one.
  return { a: a ?? (linked && linked !== b?.sketchId ? { sketchId: linked, sketchVersion: null } : null), b };
}

/** The ids only (the sketches to load). */
export function versionDraftIds(...args: Parameters<typeof versionDrafts>): Record<"a" | "b", string | null> {
  const d = versionDrafts(...args);
  return { a: d.a?.sketchId ?? null, b: d.b?.sketchId ?? null };
}

/**
 * The gains that play two renders at the same loudness (AC1's A/B): the louder is turned down to the quieter's RMS,
 * never the quieter up (no clipping). `db` is how far the louder was turned down.
 */
export function matchedGains(
  rmsA: number,
  rmsB: number,
): { a: number; b: number; db: number; louder: "a" | "b" | null } {
  if (!(rmsA > 0) || !(rmsB > 0)) return { a: 1, b: 1, db: 0, louder: null };
  const db = 20 * Math.log10(rmsA / rmsB);
  if (Math.abs(db) < 0.1) return { a: 1, b: 1, db: 0, louder: null };
  return db > 0 ? { a: rmsB / rmsA, b: 1, db, louder: "a" } : { a: 1, b: rmsA / rmsB, db: -db, louder: "b" };
}

/** The bar a playing render is at, and where the other render starts to play the same bar (tempi differ). */
export function samePlaceIn(elapsedS: number, cpsFrom: number, cpsTo: number, durationToS: number): number {
  const bar = elapsedS * cpsFrom;
  const at = bar / (cpsTo > 0 ? cpsTo : 0.5);
  return durationToS > 0 ? Math.min(Math.max(0, at), Math.max(0, durationToS - 0.05)) : 0;
}

/** "Matched: version two turned down 3.1 dB." */
export function matchedText(m: ReturnType<typeof matchedGains>, labels: Record<"a" | "b", string>): string {
  if (m.louder === null) return "Both versions already play at the same loudness.";
  return `Matched in loudness: ${labels[m.louder].toLowerCase()} is turned down ${m.db.toFixed(1)} dB while you compare.`;
}

// --- AC2: the mix, part by part --------------------------------------------------------------------------------

/** A part's name on the meter: `band.bass` is "Band bass". */
export const partLabel = (part: string) => (part.startsWith("band.") ? `Band ${part.slice(5)}` : part);

/**
 * The parts a mix is measured by: every labelled track the code writes (a part the grader drops as masked or silent
 * is exactly the one the mix step must show), then the Band's parts. A muted label (`_bass:`) and `$:` are not
 * parts.
 */
export function mixParts(code: string, band: Pick<BandSetup, "tracks"> | null): string[] {
  const own = [...new Set(trackBodies(code).map((t) => t.track))].filter((t) => !/^[_$]/.test(t));
  return [...own, ...(band?.tracks ?? []).map((t) => `band.${t}`)];
}

// --- the lines a session opens with (the briefs' "session 2 adds …") ---------------------------------------------

/**
 * The empty lines a track capstone's session offers when the draft has no such track yet (content/specs J2, J4, R3:
 * JC1.S2 and JC2.S2 add the head on its own line, RC1.S2 the horns it grants, RC2.S2 the 3:2 layer's two parts and
 * the Euclidean part). Each plays nothing until the learner writes it; the learner adds them, never the workspace.
 */
export const SESSION_LINES: Readonly<Record<string, readonly { track: string; line: string }[]>> = {
  "JC1.S2": [{ track: "mel", line: 'mel: note("~").s("vibes")' }],
  "JC2.S2": [{ track: "mel", line: 'mel: note("~").s("mutetpt")' }],
  "RC1.S2": [{ track: "horns", line: 'horns: note("~").s("horns")' }],
  "RC2.S2": [
    { track: "perc2", line: 'perc2: s("~")' },
    { track: "kick", line: 'kick: s("~")' },
    { track: "perc3", line: 'perc3: s("~")' },
  ],
};

/** The session's lines whose track the code does not have yet (a melody line under any of its usual names counts). */
export function missingSessionLines(sessionId: string | null, code: string): string[] {
  const offer = sessionId ? (SESSION_LINES[sessionId] ?? []) : [];
  if (offer.length === 0) return [];
  const have = new Set(trackBodies(code).map((t) => t.track.replace(/^_/, "")));
  const melody = ["mel", "melody", "head", "tune", "lead"];
  return offer
    .filter((o) => !(have.has(o.track) || (o.track === "mel" && melody.some((m) => have.has(m)))))
    .map((o) => o.line);
}

/** The code with the session's lines added at its end. */
export function withSessionLines(code: string, lines: readonly string[]): string {
  return lines.length === 0 ? code : `${code.trimEnd()}\n${lines.join("\n")}\n`;
}
