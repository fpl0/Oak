// The advanced tracks as daily sessions (contracts §2.6, §4.3, §7.6; wave7.md §5.1–§5.3). Pure: Today, the Coda,
// Progress and the Oak render what these return, and every rule is unit-tested (tracks-day.test.ts).
//
// What the learner meets:
// - Today: ONE primary action, always the plan's New block (the server's planner decides it: the core's next item
//   while the core is unfinished and the focus is `core`, else the focused track's next session). The open tracks are
//   offered beside it, one quiet row each ("Start this instead"), at most one per track; never a menu of nine things.
//   A small switch says where the New block comes from (`tracks.focus`); after the core, picking an offer records it.
// - A track session reads as what it is: "Jazz Harmony · session 3 of 34".
// - A gate that holds something back is named in one line, never as a count of what is missing and never as a
//   failure ("AC2 Neo-Soul Ballad opens after the sound checkpoint, Walking Bass and Displacement & Laid-Back Feel.").
//   A track checkpoint holds back only its track's capstones (§7.6 rule 5): no lesson is ever shown waiting for one.
import {
  type CourseProgress,
  type NextSession,
  type SessionPlan,
  TRACK_CAPSTONE_GATES,
  TRACK_CHECKPOINTS,
  TRACK_IDS,
  TRACK_TITLES,
  type TrackFocusId,
  type TrackOffer,
  type TrackState,
} from "@oak/api";
import { trackComplete, trackNote } from "./tracks-model.ts";

export type TrackId = (typeof TRACK_IDS)[number];

/** How a sentence names a track checkpoint (the registry's titles are labels, not prose). */
const TRACK_CP_NAME: Readonly<Record<string, string>> = {
  "J.CP1": "the first jazz checkpoint",
  "J.CP2": "the second jazz checkpoint",
  "R.CP": "the rhythm checkpoint",
  "A.CP": "the sound checkpoint",
};

/** The short name a sentence uses for a track ("your Jazz lessons"); cards keep the full title. */
export const TRACK_NAME: Readonly<Record<TrackId, string>> = {
  J: "Jazz",
  R: "Rhythm",
  A: "Sound",
};

const listOf = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/**
 * One requirement as a sentence names it: a track checkpoint by what it is ("the sound checkpoint"), a core
 * checkpoint by its unit ("the U14 checkpoint"), a lesson by its title ("Walking Bass"; the id when untitled).
 */
export function requirementName(ref: string, titleOf: (id: string) => string): string {
  const track = TRACK_CP_NAME[ref];
  if (track) return track;
  const cp = /^([A-Z]+\d+)\.CP$/.exec(ref);
  if (cp) return `the ${cp[1]} checkpoint`;
  const title = titleOf(ref);
  return title && title !== ref ? title : ref;
}

/** "{subject} opens after {a}, {b} and {c}." over the requirements not met yet; null when none is left. */
export function opensAfter(
  subject: string,
  requires: readonly string[],
  met: (ref: string) => boolean,
  titleOf: (id: string) => string,
): string | null {
  const left = requires.filter((r) => !met(r));
  if (left.length === 0) return null;
  return `${subject} opens after ${listOf(left.map((r) => requirementName(r, titleOf)))}.`;
}

/** A track capstone's gate, as a line ("JC1 ii–V Ballad opens after the first jazz checkpoint."), or null if open. */
export function capstoneGateLine(
  capstoneId: string,
  met: (ref: string) => boolean,
  titleOf: (id: string) => string,
): string | null {
  const gate = TRACK_CAPSTONE_GATES.find((g) => g.capstoneId === capstoneId);
  if (!gate) return null;
  const title = titleOf(capstoneId);
  return opensAfter(title && title !== capstoneId ? title : capstoneId, gate.requires, met, titleOf);
}

/** What the track's gates say is met, keyed by requirement (`U13.CP`, `U15.L06`). */
/** The least a gate needs here: its id, what it opens, whether it is open, and its requirements. */
export interface GateLike {
  gateId: string;
  opens: string;
  open: boolean;
  requires: readonly { ref: string; met: boolean }[];
}

export function metOf(track: { gates: readonly GateLike[] }): (ref: string) => boolean {
  const met = new Map<string, boolean>();
  for (const g of track.gates) for (const r of g.requires) met.set(r.ref, met.get(r.ref) === true || r.met);
  return (ref) => met.get(ref) === true;
}

/** What course progress says is done: a lesson completed, a checkpoint passed or soft-passed. */
export function doneOf(
  course: Pick<CourseProgress, "lessons" | "checkpoints"> | null | undefined,
): (ref: string) => boolean {
  const done = new Set<string>();
  for (const l of course?.lessons ?? []) if (l.status === "completed") done.add(l.lessonId);
  for (const c of course?.checkpoints ?? [])
    if (c.status === "passed" || c.status === "soft-passed") done.add(c.cpId);
  return (ref) => done.has(ref);
}

/**
 * The lines a track shows for what its gates hold back, one per closed gate after the first (the first gate is the
 * track itself: its note says "Opens with …"). J2.L04 is the one lesson that is passed over (§7.6): it is named as
 * waiting for its checkpoint while the track goes on, never as a failure.
 */
export function waitingLines(
  track: { status: TrackState["status"]; gates: readonly GateLike[] },
  titleOf: (id: string) => string,
): string[] {
  if (track.status !== "open") return [];
  const met = metOf(track);
  const out: string[] = [];
  for (const g of track.gates.slice(1)) {
    if (g.open) continue;
    const refs = g.requires.map((r) => r.ref);
    if (g.gateId === "J.chord-scales") {
      out.push(
        `J2.L04 ${titleOf("J2.L04") || "Chord-Scales"} waits for ${listOf(
          refs.filter((r) => !met(r)).map((r) => requirementName(r, titleOf)),
        )}. The track goes on without it, and it is offered as soon as that is passed.`,
      );
      continue;
    }
    const line = opensAfter(g.opens, refs, met, titleOf);
    if (line) out.push(line);
  }
  return out;
}

const SIDE_LESSON = /^A1\.L0[1-4]$/;

/** An offer of Arrangement & Sound whose next session is one of the four side lessons. */
export function isSideOffer(o: Pick<TrackOffer, "trackId" | "next">): boolean {
  return o.trackId === "A" && SIDE_LESSON.test(o.next.mapItemId ?? "");
}

/** "J1.L03 The Major ii–V–I": the id, then the title (said once when the title already starts with the id). */
export function sessionLabel(mapItemId: string | null, title: string): string {
  if (!mapItemId || title.startsWith(mapItemId)) return title;
  if (/^[A-Z][A-Z0-9-]*\.S\d+$/.test(mapItemId) || /^GYM\./.test(mapItemId)) return title;
  return `${mapItemId} ${title}`;
}

const minutesText = (m: number) => `about ${Math.max(1, Math.round(m))} min`;

export interface OfferRow {
  /** `core` for the core's next item when a track has the focus. */
  trackId: TrackId | "core";
  trackTitle: string;
  kind: NextSession["kind"];
  mapItemId: string | null;
  /** "J1.L03 The Major ii–V–I", "J.CP1 Jazz checkpoint 1", "JC1 ii–V Ballad · session 2 of 2". */
  label: string;
  /** What it is for, in one line (the content's objective, from the planner). */
  goal: string;
  /** "about 20 min"; null when the plan does not say (the core's row on a track day). */
  minutes: string | null;
  /** "session 3 of 34"; null for the core row. */
  place: string | null;
  estMinutes: number;
}

export interface FocusOption {
  id: TrackFocusId;
  label: string;
  current: boolean;
}

export interface TrackDay {
  focus: TrackFocusId;
  /** The New block is a track session: "Jazz Harmony · session 3 of 34". */
  trackLine: string | null;
  /** One line above the offers: whose session today is, and that the others stay beside it. */
  lead: string;
  /** The other open tracks (and, with a track in focus, the core), one row each. */
  offers: OfferRow[];
  /** Where the New block comes from, and the open tracks that could be the focus. */
  focusOptions: FocusOption[];
  /** After the core, starting an offer also records it as the focus (it is remembered, never locked in). */
  rememberPick: boolean;
  /** The planner's note when a focus fell back to the core for the day ("Nothing of the Rhythm track can start today."). */
  fallback: string | null;
}

const offerRow = (o: TrackOffer): OfferRow => ({
  trackId: o.trackId,
  trackTitle: o.title || TRACK_TITLES[o.trackId],
  kind: o.next.kind,
  mapItemId: o.next.mapItemId,
  label: sessionLabel(o.next.mapItemId, o.next.title),
  goal: o.next.goal,
  minutes: minutesText(o.next.estMinutes),
  place:
    o.sessionsTotal > 0
      ? `session ${Math.min(o.sessionsDone + 1, o.sessionsTotal)} of ${o.sessionsTotal}`
      : null,
  estMinutes: o.next.estMinutes,
});

/**
 * Today's tracks, from the plan the server made (`trackOffers`, `track`, `focus`, `course`). Null on a server
 * without them, before a track is open, and while no track has anything to start (the Wave 6 line says so then).
 */
export function trackDay(
  plan: Pick<SessionPlan, "mapItemId" | "kind" | "title" | "note" | "alternatives" | "core" | "main"> &
    Partial<Pick<SessionPlan, "trackOffers" | "track" | "focus" | "course">>,
  titleOf: (id: string) => string,
): TrackDay | null {
  const coreDone = plan.core === "complete" || plan.course === "complete";
  // While the core is unfinished, Arrangement & Sound's side lessons (A1.L01–L04) keep their own calm line beside
  // the core (wave5.md §5.1, `sideOffer`); the track row is for its track lessons (A1.L05 on), as Jazz and Rhythm's.
  const offers = (plan.trackOffers ?? []).filter((o) => coreDone || !isSideOffer(o));
  if (offers.length === 0 && !plan.track) return null;
  const focus: TrackFocusId = plan.focus ?? "core";
  const rows = offers
    .filter((o) => !(o.next.mapItemId && o.next.mapItemId === plan.mapItemId))
    // One per track, in the server's order (J, R, A with the focused track first).
    .filter((o, i, all) => all.findIndex((x) => x.trackId === o.trackId) === i)
    .map(offerRow);
  // With a track in focus while the core is unfinished, the core's next item is the first alternative (§5.2): it is
  // offered here too, so the way back is one click, never hidden under "Other ways".
  if (plan.track && !coreDone) {
    const core = plan.alternatives.find(
      (a) =>
        (a.kind === "lesson" || a.kind === "checkpoint" || a.kind === "capstone") &&
        a.mapItemId !== null &&
        !/^[JRA]/.test(a.mapItemId) &&
        !/^GYM\./.test(a.mapItemId),
    );
    if (core?.mapItemId)
      rows.unshift({
        trackId: "core",
        trackTitle: "The core",
        kind: core.kind,
        mapItemId: core.mapItemId,
        label: sessionLabel(core.mapItemId, titleOf(core.mapItemId) || core.title),
        goal: "",
        // The plan's minutes are the track session's; the core item's own estimate is not in the plan.
        minutes: null,
        place: null,
        estMinutes: plan.main?.estMinutes ?? 20,
      });
  }
  const t = plan.track ?? null;
  const trackLine = t ? `${TRACK_TITLES[t.trackId]} · session ${t.sessionIndex} of ${t.sessionsTotal}` : null;
  const named = rows.filter((r) => r.trackId !== "core").map((r) => TRACK_NAME[r.trackId as TrackId]);
  const lead = t
    ? coreDone
      ? `Today is your ${TRACK_NAME[t.trackId]} track.${named.length > 0 ? ` ${listOf(named)} ${named.length === 1 ? "is" : "are"} here too, if you would rather.` : ""}`
      : `Today is your ${TRACK_NAME[t.trackId]} track; the core waits where you left it.`
    : coreDone
      ? "Open to you beside today's session. Pick one and Today remembers it; you can change it any day."
      : "The core is today's session. The open tracks are beside it, never in its place.";
  // Where the New block comes from: the core (while it is unfinished; after it, "no track"), then every track
  // that has something to start or already has the focus.
  const options: FocusOption[] = [
    { id: "core", label: coreDone ? "No track" : "The core", current: focus === "core" },
  ];
  for (const id of TRACK_IDS) {
    const has = offers.some((o) => o.trackId === id) || t?.trackId === id || focus === id;
    if (has) options.push({ id, label: TRACK_TITLES[id], current: focus === id });
  }
  const fallback =
    focus !== "core" && !t && plan.course !== "complete" && plan.note && /track|focus/i.test(plan.note)
      ? plan.note
      : null;
  return {
    focus,
    trackLine,
    lead,
    offers: rows.slice(0, 4),
    focusOptions: options.length > 1 ? options : [],
    rememberPick: coreDone,
    fallback,
  };
}

/**
 * Offers read from the tracks' own next lessons (`TrackState.next`), for a server whose plan does not carry
 * `trackOffers` yet (`undefined`; an empty list is the planner's own answer and is kept). Only an open track with a
 * next lesson the server names is offered, and never the lesson the plan already holds. Side lessons (A1.L01–L04)
 * keep their own Wave 5 line.
 */
export function offersFromTracks(
  tracks: readonly TrackState[] | null | undefined,
  opts: { titleOf: (id: string) => string; objectiveOf?: (id: string) => string | null; minutes?: number },
): TrackOffer[] {
  const out: TrackOffer[] = [];
  for (const t of tracks ?? []) {
    const id = t.nextSession?.mapItemId ?? t.next;
    if (t.status !== "open" || !id || SIDE_LESSON.test(id)) continue;
    out.push({
      trackId: t.trackId,
      title: t.title || TRACK_TITLES[t.trackId],
      next: {
        kind: t.nextSession?.kind ?? "lesson",
        mapItemId: id as NextSession["mapItemId"],
        title: t.nextSession?.title ?? opts.titleOf(id),
        goal: opts.objectiveOf?.(id) ?? "",
        estMinutes: t.nextSession?.estMinutes ?? opts.minutes ?? 20,
        trackId: t.trackId,
        slot: null,
        day: "today",
      },
      sessionsDone: t.sessionsDone,
      sessionsTotal: t.sessionsTotal,
      note: t.note,
    });
  }
  return out;
}

/**
 * The plan to start an offer with today's warm-up (as an alternative is started): a track lesson, checkpoint or
 * capstone session in place of the New block. Never changes the server's plan; the session counts in its track.
 */
export function offerPlan(
  plan: SessionPlan,
  offer: Pick<OfferRow, "kind" | "mapItemId" | "label" | "estMinutes">,
): SessionPlan {
  return {
    ...plan,
    kind: offer.kind,
    mapItemId: offer.mapItemId as SessionPlan["mapItemId"],
    title: offer.label,
    note: null,
    returning: null,
    main: { resumeStep: null, splitPart: null, light: null, estMinutes: offer.estMinutes },
    sideLesson: null,
    track: null,
    alternatives: plan.alternatives.filter(
      (a) => !(a.kind === offer.kind && a.mapItemId === offer.mapItemId),
    ),
  };
}

// --- The Coda's next line (carry f6) -------------------------------------------------------------------------

export interface NextLine {
  /** "Next time: J1.L03 The Major ii–V–I", the planner's own pick, never composed from the map here. */
  line: string;
  /** The content's objective for it, one line; null when the planner gives none. */
  goal: string | null;
  /** "Jazz Harmony", for a track session; null for the core, the gym and reviews. */
  track: string | null;
  kind: NextSession["kind"];
  mapItemId: string | null;
  /** A track checkpoint: what passing it opens ("Passing it opens JC1 ii–V Ballad."), the reason to come back. */
  opens: string | null;
}

/**
 * How the Coda names the next session. The planner's title, except: a capstone session says which session it is
 * ("C3 Verse–Chorus Demo · session 2", from its id, when the title does not say), and a gym slot reads as a session
 * ("a Transcription Gym session (ladder)", from "Transcription Gym: ladder"), as the Wave 6 line did.
 */
function coda(next: NextSession, capstoneDetail?: (mapItemId: string) => string | null): string {
  const label = sessionLabel(next.mapItemId, next.title);
  if (next.kind === "capstone") {
    // The capstone's own content, when the host has it: "C3 Verse–Chorus Demo · session 4 of 4: Take & release".
    const detail = next.mapItemId ? capstoneDetail?.(next.mapItemId) : null;
    if (detail) return detail;
    const n = next.mapItemId ? /\.S(\d+)$/.exec(next.mapItemId)?.[1] : undefined;
    return n && !/\bsession \d/.test(label) ? `${label} · session ${n}` : label;
  }
  if (next.kind === "gym") {
    const detail = /^Transcription Gym:\s*(.+)$/.exec(next.title)?.[1]?.trim();
    return detail ? `a Transcription Gym session (${detail})` : "a Transcription Gym session";
  }
  return label;
}

/**
 * The Coda's "next" line from the planner's real next session (`SessionSummary.next`, wave7.md §5.7). Null when the
 * server gives none (`next: null`: the whole course complete and nothing due — the Coda then shows no next line) or
 * is older than Wave 7 (`undefined`: the caller keeps its Wave 6 line).
 */
export function nextLine(
  next: NextSession | null | undefined,
  titleOf?: (id: string) => string,
  /** A capstone session's place and title from its content ("C4 Minor Indie Ballad · session 2 of 2: Chorus"). */
  capstoneDetail?: (mapItemId: string) => string | null,
): NextLine | null {
  if (!next) return null;
  const cp =
    next.kind === "checkpoint" ? TRACK_CHECKPOINTS.find((c) => c.cpId === next.mapItemId) : undefined;
  const opens = cp
    ? `Passing it opens ${listOf(cp.gates.map((g) => (titleOf ? titleOf(g) || g : g)))}.`
    : null;
  const label = coda(next, capstoneDetail);
  const lead = next.day === "today" ? "Still open today" : next.day === "later" ? "Later" : "Next time";
  const track = next.trackId ? TRACK_TITLES[next.trackId] : null;
  const what =
    next.mapItemId === null && (next.kind === "review" || next.kind === "keepalive" || next.kind === "studio")
      ? label.charAt(0).toLowerCase() + label.slice(1)
      : label;
  const goal = next.goal.trim();
  return {
    line: `${lead}: ${what}${track && !what.includes(track) ? ` · ${track}` : ""}`,
    goal: goal.length > 0 && goal !== next.title ? goal : null,
    track,
    kind: next.kind,
    mapItemId: next.mapItemId,
    opens,
  };
}

// --- Progress: the three tracks ---------------------------------------------------------------------------

export interface TrackProgressItem {
  id: string;
  title: string;
  status: "locked" | "open" | "in_progress" | "released" | "passed" | "soft-passed" | "failed";
  /** "released", "open", "passed", or the gate it waits for in one line. */
  line: string;
}

export interface TrackProgress {
  trackId: TrackId;
  title: string;
  open: boolean;
  /** Every session of the track is done (its lessons, checkpoints and capstones); it stays open to replay. */
  complete: boolean;
  focus: boolean;
  done: number;
  total: number;
  /** The server's honest line ("Next: J1.L03 The Major ii–V–I.", "Opens with the U13 checkpoint."). */
  note: string;
  /** What the learner can start in it now, as Today would start it; null when nothing can be. */
  next: string | null;
  /** Gates still closed after the first, each one line. */
  waiting: string[];
  checkpoints: TrackProgressItem[];
  capstones: TrackProgressItem[];
  /** At the learner's measured pace, with every session here: "around March 2027"; null without a pace. */
  pace: string | null;
}

const CP_STATUS_LINE: Record<string, string> = {
  locked: "after its lessons",
  open: "open",
  passed: "passed",
  "soft-passed": "passed",
  failed: "open for a retake",
};
const CAP_STATUS_LINE: Record<string, string> = {
  open: "open",
  in_progress: "under way",
  released: "released",
};

/** "2027-03": the month a number of sessions ends at a pace (sessions a week), from a day. */
export function monthAfter(day: string, sessions: number, perWeek: number): string | null {
  if (!(perWeek > 0) || sessions <= 0) return null;
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Math.ceil((sessions / perWeek) * 7));
  return d.toISOString().slice(0, 7);
}

/**
 * A track's card on /progress: done of total, its next session, what its gates hold back, its checkpoints and
 * capstones (a locked capstone says which gate it waits for, the server's `lockedReason` first), and the pace line.
 */
export function trackProgress(
  t: TrackState,
  opts: {
    titleOf: (id: string) => string;
    /** Measured sessions a week (`paceEstimate.sessionsPerWeek`), and today; the pace line needs both. */
    perWeek?: number | null;
    today?: string | null;
    formatMonth?: (yyyyMm: string) => string;
    /** What course progress says is done (`doneOf`): the capstone gates name lessons and checkpoints of the tracks. */
    done?: (ref: string) => boolean;
  },
): TrackProgress {
  const { titleOf } = opts;
  const gatesMet = metOf(t);
  const met = (ref: string) => gatesMet(ref) || opts.done?.(ref) === true;
  const cps = (t.checkpoints ??
    TRACK_CHECKPOINTS.filter((c) => c.trackId === t.trackId).map((c) => ({
      cpId: c.cpId,
      status: met(c.cpId) ? ("passed" as const) : ("locked" as const),
    }))) as { cpId: string; status: TrackProgressItem["status"] }[];
  const caps = (t.capstones ??
    TRACK_CAPSTONE_GATES.filter((c) => c.trackId === t.trackId).map((c) => ({
      capstoneId: c.capstoneId,
      status: "locked" as const,
      lockedReason: null,
    }))) as { capstoneId: string; status: TrackProgressItem["status"]; lockedReason: string | null }[];
  const remaining = Math.max(0, t.sessionsTotal - t.sessionsDone);
  const month =
    t.status === "open" && remaining > 0 && t.sessionsDone > 0 && opts.today
      ? monthAfter(opts.today, remaining, opts.perWeek ?? 0)
      : null;
  const next = t.nextSession
    ? sessionLabel(t.nextSession.mapItemId, t.nextSession.title)
    : t.next && !SIDE_LESSON.test(t.next)
      ? sessionLabel(t.next, titleOf(t.next))
      : null;
  // A locked capstone's line: the gate composed in words (checkpoints by what they are, lessons by title) when
  // course progress is known; the server's `lockedReason` (ids and registry labels: "the Jazz checkpoint 1") when it
  // is not, or when the composed gate finds nothing missing (the server knows a reason the app does not).
  const lockedLine = (c: { capstoneId: string; lockedReason: string | null }): string => {
    const composed = capstoneGateLine(c.capstoneId, met, titleOf)?.replace(
      /^.*? opens after /,
      "opens after ",
    );
    const reason = c.lockedReason?.trim() || null;
    if (opts.done && composed) return composed;
    return reason ?? composed ?? "opens with its track";
  };
  // A finished track has nothing next; the server's "next lessons are still being written" would be false here.
  const complete = next === null && trackComplete(t);
  return {
    trackId: t.trackId,
    title: t.title || TRACK_TITLES[t.trackId],
    open: t.status === "open",
    complete,
    focus: t.focus === true && !complete,
    done: t.sessionsDone,
    total: t.sessionsTotal,
    note: trackNote(t),
    next,
    waiting: waitingLines(t, titleOf),
    checkpoints: cps.map((c) => ({
      id: c.cpId,
      title: titleOf(c.cpId) || c.cpId,
      status: c.status,
      line: CP_STATUS_LINE[c.status] ?? c.status,
    })),
    capstones: caps.map((c) => ({
      id: c.capstoneId,
      title: titleOf(c.capstoneId) || c.capstoneId,
      status: c.status,
      line: c.status === "locked" ? lockedLine(c) : (CAP_STATUS_LINE[c.status] ?? c.status),
    })),
    pace:
      month && opts.perWeek
        ? `At ${opts.perWeek} sessions a week, all of them on this track, you would finish it around ${opts.formatMonth ? opts.formatMonth(month) : month}.`
        : null,
  };
}
