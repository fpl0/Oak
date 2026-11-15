// The advanced tracks as open branches (contracts §2.6, §4.3; wave6.md §5.3). From the U13 checkpoint the Jazz and
// Rhythm tracks are open; in this wave none of their lessons is written. Every surface says exactly that: the
// branch is open, its first lessons are still being written, the core stays the path. A track is never offered as a
// session while it has no lesson, never counted as "left", never drawn as a lock once its gate is met. The server
// records each gate (`CourseProgress.tracks`, `GET /tracks`); until it answers, the same table of gates
// (`TRACK_GATES`) is read against course progress here, so Progress and the Oak never show a hole. Pure.
import {
  type CourseProgress,
  type SessionPlan,
  TRACK_GATES,
  TRACK_IDS,
  TRACK_TITLES,
  type TrackGateState,
  type TrackState,
} from "@oak/api";

export type TrackId = (typeof TRACK_IDS)[number];

/** The name a sentence uses ("the Jazz and Rhythm tracks"); the full titles stay on cards and rows. */
export const TRACK_SHORT: Readonly<Record<TrackId, string>> = {
  J: "Jazz",
  R: "Rhythm",
  A: "Arrangement & Sound",
};

/** What each track is for, in one line (contracts §2.6), shown beside its honest note. */
export const TRACK_WHAT: Readonly<Record<TrackId, string>> = {
  J: "Swing, shell voicings, ii–V–I, the jazz blues, rhythm changes and reharmonization.",
  R: "Sixteenth-note funk, displacement, odd meters, polyrhythm and clave.",
  A: "Sound design, arrangement and the mix: how a sketch becomes a record.",
};

const UNWRITTEN = "Open. Its first lessons are still being written.";

export interface TrackRow {
  trackId: TrackId;
  title: string;
  what: string;
  open: boolean;
  /** The one honest line (the server's `note`). */
  note: string;
  /** The track's next lesson, when one can be started; null in this wave for J and R. */
  next: string | null;
  /** Its gates, in course order: what each opens and whether it is met. */
  gates: {
    gateId: string;
    opens: string;
    label: string;
    met: boolean;
    /** Wave 7: what the gate requires, each with whether it is met (tracks-day.ts names them in a sentence). */
    requires: { ref: string; met: boolean }[];
  }[];
  /** Units whose rows on the Oak belong to this track's open gates (`J1`, `J2`, …). */
  openUnits: string[];
}

const listOf = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

const gateUnits = (gateId: string): readonly string[] =>
  TRACK_GATES.find((g) => g.gateId === gateId)?.units ?? [];

/** "J1.L01 Swing Feel & the Ride" for a bare lesson id the title table knows; the id (or null) otherwise. */
const named = (id: string | null, titleOf?: (id: string) => string): string | null => {
  const title = id ? titleOf?.(id) : undefined;
  return id && title && title !== id ? `${id} ${title}` : id;
};

/**
 * Whether every session of a track is done (its lessons, checkpoints and capstones) with nothing left to start. The
 * server's note then still reads as for an unwritten lesson ("its next lessons are still being written"), which
 * would be false: `trackNote` says what is true instead.
 */
export function trackComplete(
  t: Pick<TrackState, "status" | "sessionsDone" | "sessionsTotal" | "next" | "nextSession">,
): boolean {
  return (
    t.status === "open" &&
    t.sessionsTotal > 0 &&
    t.sessionsDone >= t.sessionsTotal &&
    !t.nextSession &&
    (t.next === null || t.next === undefined)
  );
}

/** The track's honest line: the server's own, or for a complete track what it now is. */
export function trackNote(
  t: Pick<TrackState, "status" | "sessionsDone" | "sessionsTotal" | "next" | "nextSession" | "note">,
): string {
  return trackComplete(t) ? `All ${t.sessionsTotal} sessions done. Its lessons stay open to replay.` : t.note;
}

/** The rows Progress, the Oak and the finale read, from the server's track states. */
export function trackRows(
  tracks: readonly TrackState[] | null | undefined,
  /** Wave 7: names a bare next lesson id ("J1.L01" → "J1.L01 Swing Feel & the Ride"); the id alone without it. */
  titleOf?: (id: string) => string,
): TrackRow[] {
  const out: TrackRow[] = [];
  for (const id of TRACK_IDS) {
    const t = tracks?.find((x) => x.trackId === id);
    if (!t) continue;
    const openUnits = new Set<string>();
    for (const g of t.gates) if (g.open) for (const u of gateUnits(g.gateId)) openUnits.add(u);
    out.push({
      trackId: id,
      title: t.title || TRACK_TITLES[id],
      what: TRACK_WHAT[id],
      open: t.status === "open",
      note: trackNote(t),
      // Wave 7: the next thing of the track the learner may start (a lesson, its checkpoint or a capstone session).
      next: t.nextSession
        ? t.nextSession.title.startsWith(t.nextSession.mapItemId)
          ? t.nextSession.title
          : `${t.nextSession.mapItemId} ${t.nextSession.title}`
        : named(t.next, titleOf),
      gates: t.gates.map((g) => ({
        gateId: g.gateId,
        opens: g.opens,
        label: g.requires.map((r) => r.label).join(", "),
        met: g.open,
        requires: g.requires.map((r) => ({ ref: r.ref, met: r.met })),
      })),
      openUnits: [...openUnits],
    });
  }
  return out;
}

const requireLabel = (ref: string, met: boolean): string => {
  const cp = /^([A-Z]+\d+)\.CP\d*$/.exec(ref);
  if (cp) return met ? `${cp[1]} checkpoint passed` : `the ${cp[1]} checkpoint`;
  return met ? `${ref} completed` : ref;
};

/**
 * The track states read from course progress and the gate table, for a server that does not carry
 * `CourseProgress.tracks` yet (501 on `GET /tracks`). The same rule as the server's: a checkpoint requirement is met
 * by a pass or a soft pass, a lesson requirement by completion. `authoredUnits` names the units with a written
 * lesson; a track whose open units have none says "still being written" and has no next lesson.
 */
export function deriveTracks(
  course: Pick<CourseProgress, "lessons" | "checkpoints"> | null | undefined,
  authoredUnits: ReadonlySet<string>,
): TrackState[] {
  if (!course) return [];
  const done = new Set<string>();
  for (const l of course.lessons) if (l.status === "completed") done.add(l.lessonId);
  for (const c of course.checkpoints)
    if (c.status === "passed" || c.status === "soft-passed") done.add(c.cpId);
  return TRACK_IDS.map((trackId) => {
    const gates: TrackGateState[] = TRACK_GATES.filter((g) => g.trackId === trackId).map((g) => {
      const requires = g.requires.map((ref) => ({
        ref,
        kind: /\.CP\d*$/.test(ref) ? ("checkpoint" as const) : ("lesson" as const),
        label: requireLabel(ref, done.has(ref)),
        met: done.has(ref),
      }));
      return {
        gateId: g.gateId,
        trackId,
        opens: g.opens,
        requires,
        open: requires.every((r) => r.met),
        openedAt: null,
        lessonsAuthored: g.units.filter((u) => authoredUnits.has(u)).length,
        lessonsTotal: 0,
      };
    });
    const first = gates[0];
    const open = first?.open === true;
    const written = gates.some((g) => g.open && g.lessonsAuthored > 0);
    const note = !open
      ? `Opens with ${first ? first.requires.map((r) => r.label).join(" and ") : "the core"}.`
      : trackId === "A"
        ? "Its side lessons are open. The rest is still being written."
        : written
          ? "Open."
          : UNWRITTEN;
    return {
      trackId,
      title: TRACK_TITLES[trackId],
      status: open ? ("open" as const) : ("locked" as const),
      openedAt: null,
      gates,
      sessionsDone: 0,
      sessionsTotal: 0,
      next: null,
      note,
    };
  });
}

/** The tracks' line on Today (`plan.tracks.note`, the server's own words), or null before any gate is met. */
export function tracksLine(plan: Pick<SessionPlan, "tracks"> | null | undefined): string | null {
  const t = plan?.tracks;
  if (!t || t.open.length === 0) return null;
  const note = t.note.trim();
  return note.length > 0 ? note : null;
}

export interface GatesCard {
  title: string;
  body: string;
  /** The tracks named, for the link to the Oak. */
  tracks: TrackId[];
}

/**
 * The Coda card for gates met in this session (`SessionSummary.gatesOpened`), said once: "The Jazz and Rhythm
 * tracks are open." after U13.CP; "More of the Jazz track is open: J4." after U15.L06. Honest about what can be
 * started: with no lesson written behind a gate it says so and promises nothing.
 */
export function gatesCard(gates: readonly TrackGateState[] | null | undefined): GatesCard | null {
  const opened = (gates ?? []).filter((g) => g.open);
  if (opened.length === 0) return null;
  const tracks = TRACK_IDS.filter((id) => opened.some((g) => g.trackId === id));
  // A track's first gate opens the track itself; a later one opens more of a track that is already open.
  const first = TRACK_IDS.filter((id) =>
    opened.some((g) => g.trackId === id && /\.(main|side)$/.test(g.gateId)),
  );
  const written = opened.some((g) => g.lessonsAuthored > 0);
  if (first.length > 0) {
    const many = first.length > 1;
    const stay = "The core stays your path, and nothing in it waits on them.";
    return {
      title: `The ${listOf(first.map((id) => TRACK_SHORT[id]))} ${many ? "tracks are" : "track is"} open`,
      body: `${many ? "Two branches grow" : "A branch grows"} from here: ${listOf(
        first.map((id) => TRACK_TITLES[id]),
      )}. ${
        written
          ? "Today offers their lessons beside the core, never in its place."
          : `${many ? "Their" : "Its"} first lessons are still being written. ${many ? stay : stay.replace("them", "it")}`
      }`,
      tracks,
    };
  }
  const g = opened[0] as TrackGateState;
  const what = opened.map((x) => x.opens).join(", ");
  return {
    title: `More of the ${TRACK_SHORT[g.trackId]} track is open: ${what}`,
    body: written
      ? `${what} can be started from Today, beside the core.`
      : `${what} is open on the Oak. Its lessons are still being written; the core stays your path.`,
    tracks,
  };
}

/** Units that have at least one written lesson (`J1`, `A1`), from the authored lesson ids. */
export function authoredUnits(authored: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of authored) {
    const u = /^([A-Z]+\d+)\./.exec(id)?.[1];
    if (u) out.add(u);
  }
  return out;
}

/** The track a unit row of the Oak belongs to (`J3` → J), or null for a core unit. */
export function trackOfUnit(unit: string): TrackId | null {
  const m = /^([JRA])\d+$/.exec(unit);
  return m ? (m[1] as TrackId) : null;
}

export interface Branch {
  trackId: TrackId;
  title: string;
  /** "open", or what opens it. */
  state: "open" | "ahead";
  /** One line under the branch's name on the Oak. */
  line: string;
}

/** The Oak's branch headers: one per track, in map order, with the state and the honest line. */
export function branches(rows: readonly TrackRow[]): Branch[] {
  return rows.map((r) => ({
    trackId: r.trackId,
    title: r.title,
    state: r.open ? "open" : "ahead",
    line: r.next ? `Next: ${r.next}.` : r.note,
  }));
}
