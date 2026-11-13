// A gym day (contracts §2.5, §2.9, §6.12; wave4.md §5.4–§5.5): from U07.L01 on, every fifth session is a
// transcription slot. Odd gym sessions are graded ladder sessions at the learner's level and realism; even ones
// are the learner's own audio, self-assessed (or, with no audio project yet, a ladder session one realism level
// up). Today says that plainly, and while X1 waits only on melodic dictation it says "Two more gym sets open X1".
// The Coda announces a realism change once, and offers a ladder level-up when the server offers one. Pure.
import type { CapstoneGate, GymPlan, LadderState, SessionPlan } from "@oak/api";

export type LadderLevel = 1 | 2 | 3 | 4;
export type Realism = 0 | 1 | 2 | 3 | 4;

/** The four generated rungs (contracts §2.9), in the learner's words. */
export const LADDER_LEVELS: Readonly<Record<LadderLevel, { name: string; what: string }>> = {
  1: { name: "drum loops", what: "a generated drum loop: copy each drum line by ear" },
  2: { name: "bass lines", what: "a generated bass line: write its notes and rhythm by ear" },
  3: {
    name: "four-chord loops",
    what: "a generated four-chord loop, bass first: the bass notes, then each chord's quality, then its numeral",
  },
  4: { name: "short melodies", what: "a generated short melody: write it down phrase by phrase" },
};

/** What each realism level adds (contracts §6.12). Grading never changes with it. */
export const REALISM_LINES: Readonly<Record<Realism, string>> = {
  0: "clean and exactly on the grid",
  1: "timing and loudness a little human, as a player would",
  2: "a swung or shuffled feel where the style has one, and a room",
  3: "a fuller mix, with the part you write down 6 dB quieter",
  4: "a voice-like lead, slightly out of tune",
};

export const levelName = (level: number): string =>
  LADDER_LEVELS[Math.min(4, Math.max(1, Math.round(level))) as LadderLevel].name;

export interface GymDay {
  gymId: string | null;
  kind: "ladder" | "own-audio";
  /** An even slot with no audio project: a ladder session one realism level up. */
  fallback: boolean;
  level: number | null;
  realism: number | null;
  /** The setlist row: "GYM.03 · Ladder, level 1: drum loops · R0". */
  detail: string;
  /** Today's lead. */
  lead: string;
  /** The plain explanation of the slot (one or two short lines under the setlist). */
  explain: string[];
}

const gymNo = (id: string | null): number | null => {
  const m = id ? /^GYM\.(\d+)$/.exec(id) : null;
  return m ? Number(m[1]) : null;
};

/**
 * The gym day of a plan. `gym` (`GET /gym`) and `ladder` (`GET /ladder`) may be null (loading, or a server that
 * has not built them): the plan's own ID and title still decide odd or even.
 */
export function gymDay(
  plan: Pick<SessionPlan, "kind" | "mapItemId" | "title" | "note">,
  gym: Pick<GymPlan, "next"> | null,
  ladder: Pick<LadderState, "level" | "realism"> | null,
  ownAudioTitle?: string | null,
): GymDay | null {
  if (plan.kind !== "gym") return null;
  const id = plan.mapItemId?.startsWith("GYM.") ? plan.mapItemId : null;
  const n = gymNo(id);
  const next = gym?.next && (id === null || gym.next.gymId === id) ? gym.next : null;
  const even = n !== null && n % 2 === 0;
  // Without `GET /gym` the planner's own words decide: an even slot titled as a ladder session is the fallback.
  const fallback = next
    ? next.ownAudioFallback
    : even && (/ladder/i.test(plan.title) || /no audio project/i.test(plan.note ?? ""));
  let kind: GymDay["kind"] = even && !fallback ? "own-audio" : "ladder";
  if (next) kind = next.ownAudioFallback ? "ladder" : next.kind;
  const level = kind === "ladder" ? (next?.ladderLevel ?? ladder?.level ?? null) : null;
  const realism =
    kind === "ladder"
      ? (next?.realism ?? (ladder ? Math.min(4, ladder.realism + (fallback ? 1 : 0)) : null))
      : null;
  const tag = id ?? "Transcription";
  if (kind === "own-audio") {
    const what = ownAudioTitle ? `your own audio: ${ownAudioTitle}` : "your own audio";
    return {
      gymId: id,
      kind,
      fallback: false,
      level: null,
      realism: null,
      detail: `${tag} · ${what}`,
      lead: "Every fifth session is a transcription slot. Today's is yours: a recording you chose, slowed down and looped until you can write it in code.",
      explain: [
        "Slow it down, loop a bar, hum a line and let Oak draft it, then correct the draft by ear.",
        "Nothing is graded: you score yourself on a short checklist, and that is what counts.",
      ],
    };
  }
  const levelText = level ? `level ${level}: ${levelName(level)}` : "the ladder";
  const realismText = realism !== null ? ` · R${realism}` : "";
  const what = level ? LADDER_LEVELS[level as LadderLevel]?.what : null;
  const explain: string[] = [];
  if (what) explain.push(`You hear ${what}. Tempo, meter and key are given.`);
  if (realism !== null)
    explain.push(
      `Realism R${realism}: ${REALISM_LINES[realism as Realism]}. The grading is the same at every realism level.`,
    );
  explain.push("It is graded exactly: 85% or better is a pass. A revealed answer earns no pass.");
  return {
    gymId: id,
    kind: "ladder",
    fallback,
    level,
    realism,
    detail: `${tag} · Ladder, ${levelText}${realismText}`,
    lead: fallback
      ? "Every fifth session is a transcription slot. Even slots are for your own audio; you have none yet, so today is a ladder session one realism level up. Add a recording in Transcribe whenever you like."
      : "Every fifth session is a transcription slot: you listen to a short generated piece and write it down in code.",
    explain,
  };
}

/**
 * The X1 line for Today (contracts §6.6: "Two more gym sets open X1"), shown while X1 waits only on the family
 * level — the U07 checkpoint passed and C2 released — never as a gate on anything else.
 */
export function x1Line(gate: CapstoneGate | null | undefined): { title: string; body: string } | null {
  if (!gate || gate.open || !gate.message) return null;
  const others = gate.conditions.filter((c) => c.kind !== "family-level");
  if (others.some((c) => !c.met)) return null;
  const fam = gate.conditions.find((c) => c.kind === "family-level" && !c.met);
  const level =
    fam && fam.have !== null && fam.need !== null
      ? ` ${fam.label}: level ${fam.have} now, ${fam.need} opens it.`
      : "";
  return {
    title: gate.message,
    body: `X1 Folk Transcription opens when your melodic dictation is ready for a whole song.${level} Gym sets train it; nothing else waits for X1.`,
  };
}

/** Today's chip for an extra gym session (contracts §2.5: it takes the next `GYM.nn`). */
export function extraGym(
  plan: Pick<SessionPlan, "kind" | "alternatives">,
): { mapItemId: string; title: string } | null {
  if (plan.kind === "gym") return null;
  const alt = plan.alternatives.find((a) => a.kind === "gym" && a.mapItemId?.startsWith("GYM."));
  return alt?.mapItemId ? { mapItemId: alt.mapItemId, title: "An extra gym session" } : null;
}

/** A plan that starts another way today (an extra gym session, a capstone session) with today's warm-up. */
export function alternativePlan(
  plan: SessionPlan,
  alt: { kind: SessionPlan["kind"]; mapItemId: string | null; title: string },
): SessionPlan {
  return {
    ...plan,
    kind: alt.kind,
    mapItemId: alt.mapItemId as SessionPlan["mapItemId"],
    title: alt.title,
    note: null,
    returning: null,
    main: { resumeStep: null, splitPart: null, light: null, estMinutes: plan.main?.estMinutes ?? 14 },
    alternatives: plan.alternatives.filter((a) => !(a.kind === alt.kind && a.mapItemId === alt.mapItemId)),
  };
}

export interface LadderCoda {
  /** A realism change today (two consecutive ≥ 90% up, one below 60% down), announced once here. */
  realism: { from: number; to: number; line: string } | null;
  /** The level-up the server offers (wave4.md §5.4). */
  levelUp: { from: number; to: number; title: string; body: string } | null;
  /** Today's ladder work, as graded (its best score; a pass is graded only at 85% or better, unrevealed). */
  today: { level: number; realism: number; line: string; passed: boolean } | null;
}

/** What the Coda says about the ladder after a session that held ladder work. */
export function ladderCoda(ladder: LadderState | null | undefined, day: string): LadderCoda | null {
  if (!ladder) return null;
  const todays = ladder.history.filter((h) => h.day === day);
  const last = todays.at(-1) ?? null;
  let realism: LadderCoda["realism"] = null;
  if (last && last.realism !== ladder.realism) {
    const up = ladder.realism > last.realism;
    realism = {
      from: last.realism,
      to: ladder.realism,
      line: up
        ? `Two strong sessions in a row: the ladder now plays at R${ladder.realism}, ${REALISM_LINES[ladder.realism as Realism]}. The grading stays the same.`
        : `The ladder steps back to R${ladder.realism}, ${REALISM_LINES[ladder.realism as Realism]}, until it feels easy again. The grading stays the same.`,
    };
  }
  const levelUp: LadderCoda["levelUp"] = ladder.levelUp
    ? {
        from: ladder.level,
        to: ladder.levelUp.to,
        title: `Level ${ladder.levelUp.to} is open: ${levelName(ladder.levelUp.to)}`,
        body: `${ladder.levelUp.reason} Take it when you like; it starts clean, at R0, and you can step back down any time.`,
      }
    : null;
  let today: LadderCoda["today"] = null;
  if (last) {
    const best = todays.reduce((m, h) => (h.score > m.score ? h : m), last);
    const passed = todays.some((h) => h.passed);
    const pct = `${Math.round(best.score * 100)}%`;
    today = {
      level: best.level,
      realism: best.realism,
      passed,
      line: passed
        ? `Level ${best.level}, ${levelName(best.level)}, at R${best.realism}: ${pct}, a graded pass.`
        : `Level ${best.level}, ${levelName(best.level)}, at R${best.realism}: ${pct} so far. A pass is 85% or better; the item waits in Transcribe.`,
    };
  }
  if (!realism && !levelUp && !today) return null;
  return { realism, levelUp, today };
}
