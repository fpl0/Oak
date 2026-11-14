// A gym day (contracts §2.5, §2.9, §6.12; wave4.md §5.4–§5.5): from U07.L01 on, every fifth session is a
// transcription slot. Odd gym sessions are graded ladder sessions at the learner's level and realism; even ones
// are the learner's own audio, self-assessed (or, with no audio project yet, a ladder session one realism level
// up). Today says that plainly, and while X1 waits only on melodic dictation it says "Two more gym sets open X1".
// The Coda announces a realism change once, and offers a ladder level-up when the server offers one. Pure.
import {
  type CapstoneGate,
  type GymPlan,
  type LadderSong,
  type LadderState,
  OWN_AUDIO_CHECKLIST,
  type SessionPlan,
  type SessionSummary,
} from "@oak/api";

/** The rungs a learner can stand on. L7 is the learner's own audio (even slots): reported, never a level to move to. */
export type LadderLevel = 1 | 2 | 3 | 4 | 5 | 6 | 8;
export type Realism = 0 | 1 | 2 | 3 | 4;

/** The rungs a learner sets (contracts §2.9): four generated, then public-domain songs (L5) and blues (L6). */
export const LADDER_LEVELS: Readonly<Record<LadderLevel, { name: string; what: string }>> = {
  1: { name: "drum loops", what: "a generated drum loop: copy each drum line by ear" },
  2: { name: "bass lines", what: "a generated bass line: write its notes and rhythm by ear" },
  3: {
    name: "four-chord loops",
    what: "a generated four-chord loop, bass first: the bass notes, then each chord's quality, then its numeral",
  },
  4: { name: "short melodies", what: "a generated short melody: write it down phrase by phrase" },
  5: {
    name: "folk songs",
    what: "a public-domain folk song: write its melody down one phrase at a time, each phrase checked on its own",
  },
  6: {
    name: "blues",
    what: "a blues from before 1930, in three stages: the bass, then the changes, then the melody",
  },
  8: {
    name: "standards",
    what: "a standard from the 1920s, in four stages: the form map, then the bass, the changes and the melody",
  },
};

/** The rung a level number names: 1–6 and 8 as they are, 7 (own audio) and anything else clamped to a real rung. */
function rungOf(level: number): LadderLevel {
  const l = Math.round(level);
  if (l >= 8) return 8;
  return Math.min(6, Math.max(1, l)) as LadderLevel;
}

/** What each realism level adds (contracts §6.12). Grading never changes with it. */
export const REALISM_LINES: Readonly<Record<Realism, string>> = {
  0: "clean and exactly on the grid",
  1: "timing and loudness a little human, as a player would",
  2: "a swung or shuffled feel where the style has one, and a room",
  3: "a fuller mix, with the part you write down 6 dB quieter",
  4: "a voice-like lead, slightly out of tune",
};

export const levelName = (level: number): string =>
  Math.round(level) === 7 ? "your own audio" : LADDER_LEVELS[rungOf(level)].name;

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

const STAGE_NAME: Record<"form" | "bass" | "changes" | "melody", string> = {
  form: "the form map",
  bass: "the bass",
  changes: "the changes",
  melody: "the melody",
};

/** The song a level-5 or level-6 gym day works on: the one under way at that level, else the first open one. */
export function currentSong(
  songs: readonly LadderSong[] | null | undefined,
  level: number | null,
): LadderSong | null {
  if (!songs || (level !== 5 && level !== 6 && level !== 8)) return null;
  const at = songs.filter((s) => s.level === level && s.status === "open");
  return at.find((s) => s.passedPhrases.length > 0 || s.passedStages.length > 0) ?? at[0] ?? null;
}

/** "Shenandoah: phrase 2 of 4 next", "St. Louis Blues: the changes next", or the title alone at its start. */
export function songLine(
  song: Pick<LadderSong, "title" | "level" | "phrases" | "passedPhrases" | "passedStages">,
): string {
  if (song.level === 6 || song.level === 8) {
    const stages =
      song.level === 8
        ? (["form", "bass", "changes", "melody"] as const)
        : (["bass", "changes", "melody"] as const);
    const stage = stages.find((s) => !song.passedStages.includes(s));
    if (!stage) return `${song.title}: every stage passed`;
    return song.passedStages.length === 0
      ? `${song.title}, ${STAGE_NAME[stages[0]]} first`
      : `${song.title}: ${STAGE_NAME[stage]} next`;
  }
  const total = song.phrases.length;
  const next = Array.from({ length: total }, (_, i) => i + 1).find((p) => !song.passedPhrases.includes(p));
  if (total === 0) return song.title;
  if (next === undefined) return `${song.title}: every phrase passed`;
  return song.passedPhrases.length === 0
    ? `${song.title}, phrase 1 of ${total}`
    : `${song.title}: phrase ${next} of ${total} next`;
}

/**
 * The gym day of a plan. `gym` (`GET /gym`) and `ladder` (`GET /ladder`) may be null (loading, or a server that
 * has not built them): the plan's own ID and title still decide odd or even.
 */
export function gymDay(
  plan: Pick<SessionPlan, "kind" | "mapItemId" | "title" | "note">,
  gym: Pick<GymPlan, "next"> | null,
  ladder: Pick<LadderState, "level" | "realism"> | null,
  ownAudioTitle?: string | null,
  /** `GET /ladder/songs` (L5/L6), when built. */
  songs?: readonly LadderSong[] | null,
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
  const song = currentSong(songs, level);
  const songText = song ? ` · ${songLine(song)}` : "";
  const explain: string[] = [];
  if (what) explain.push(`You hear ${what}. Tempo, meter and key are given.`);
  if (realism !== null)
    explain.push(
      `Realism R${realism}: ${REALISM_LINES[realism as Realism]}. The grading is the same at every realism level.`,
    );
  if (level === 5)
    explain.push(
      "Each phrase is graded on its own: 85% or better passes it. The song counts once every phrase has passed with nothing revealed; it waits in Transcribe between days.",
    );
  else if (level === 6)
    explain.push(
      "The stages open in order: the bass passes at 90%, the changes and the melody at 85%. Nothing revealed; the song waits in Transcribe between days.",
    );
  else if (level === 8)
    explain.push(
      "The stages open in order: the form map exact, the bass at 90%, the changes at 85% of the bars, the melody at 90%. Nothing revealed; the song waits in Transcribe between days.",
    );
  else explain.push("It is graded exactly: 85% or better is a pass. A revealed answer earns no pass.");
  return {
    gymId: id,
    kind: "ladder",
    fallback,
    level,
    realism,
    detail: `${tag} · Ladder, ${levelText}${songText}${realismText}`,
    lead: fallback
      ? "Every fifth session is a transcription slot. Even slots are for your own audio; you have none yet, so today is a ladder session one realism level up. Add a recording in Transcribe whenever you like."
      : level === 5
        ? "Every fifth session is a transcription slot: today, a public-domain folk song, written down in code a phrase at a time."
        : level === 6
          ? "Every fifth session is a transcription slot: today, a blues, written down in code stage by stage: bass, changes, melody."
          : level === 8
            ? "Every fifth session is a transcription slot: today, a standard, taken down stage by stage: form, bass, changes, melody."
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
        body: `${ladder.levelUp.reason} ${levelUpWhat(ladder.levelUp.to)} Take it when you like; it starts clean, at R0, and you can step back down any time.`,
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

// --- Wave 5 (carry-over c10): the gym Coda from the session summary ---------------------------------------------

type SummaryGym = NonNullable<SessionSummary["gym"]>;

export interface OwnAudioCoda {
  title: string;
  transcriptionId: string | null;
  /** "2 versions saved · 3 bars worked on" */
  line: string;
  /** The checklist rows as saved today, in the checklist's order (unanswered rows left out). */
  rows: { id: string; label: string; value: number; word: string }[];
  /** What the self-assessment says, plainly: "3 of 5 rows answered yes". */
  verdict: string | null;
}

const CHECK_WORD = ["not yet", "partly", "yes"] as const;

/** The own-audio card of a gym Coda: today's versions, the bars worked on, the checklist as the learner scored it. */
export function ownAudioCoda(g: SummaryGym | null | undefined): OwnAudioCoda | null {
  if (g?.kind !== "own-audio" || !g.ownAudio) return null;
  const o = g.ownAudio;
  const parts: string[] = [];
  parts.push(
    o.versionsToday === 0
      ? "No version saved today"
      : `${o.versionsToday} ${o.versionsToday === 1 ? "version" : "versions"} saved`,
  );
  if (o.regions > 0) parts.push(`${o.regions} ${o.regions === 1 ? "bar" : "bars"} worked on`);
  const rows = OWN_AUDIO_CHECKLIST.filter((r) => typeof o.checklist[r.id] === "number").map((r) => {
    const value = Math.max(0, Math.min(2, Math.round(o.checklist[r.id] as number)));
    return { id: r.id, label: r.label, value, word: CHECK_WORD[value] as string };
  });
  const yes = rows.filter((r) => r.value === 2).length;
  return {
    title: g.title,
    transcriptionId: g.transcriptionId,
    line: parts.join(" · "),
    rows,
    verdict:
      rows.length === 0
        ? null
        : `${yes} of ${OWN_AUDIO_CHECKLIST.length} rows answered yes. It is your own judgement, and it counts.`,
  };
}

/**
 * The ladder card of a gym Coda from the summary (c10): today's best score and whether it was a graded pass, the
 * realism change and an offered level-up, each announced once by the server. `null` when the summary carries no
 * ladder work; the Coda then reads the ladder itself (`ladderCoda`), as in Wave 4.
 */
export function summaryLadderCoda(g: SummaryGym | null | undefined): LadderCoda | null {
  if (g?.kind !== "ladder" || !g.ladder) return null;
  const l = g.ladder;
  const name = levelName(l.level);
  const pass =
    l.level === 8
      ? "The form map passes exact, the bass and the melody at 90%, the changes at 85% of the bars"
      : l.level === 6
        ? "A stage passes at 85% or better, the bass at 90%"
        : l.level === 5
          ? "A phrase passes at 85% or better"
          : "A pass is 85% or better";
  const today: LadderCoda["today"] =
    l.bestScore === null
      ? {
          level: l.level,
          realism: l.realism,
          passed: false,
          line: `Level ${l.level}, ${name}, at R${l.realism}: ${g.title} is open in Transcribe, nothing checked yet.`,
        }
      : {
          level: l.level,
          realism: l.realism,
          passed: l.gradedPass,
          line: l.gradedPass
            ? `Level ${l.level}, ${name}, at R${l.realism}: ${Math.round(l.bestScore * 100)}% on ${g.title}, a graded pass.`
            : `Level ${l.level}, ${name}, at R${l.realism}: ${Math.round(l.bestScore * 100)}% so far on ${g.title}. ${pass}; it waits in Transcribe.`,
        };
  const rc = l.realismChange;
  const realism: LadderCoda["realism"] =
    rc && rc.from !== rc.to
      ? {
          from: rc.from,
          to: rc.to,
          line:
            rc.to > rc.from
              ? `Two strong sessions in a row: the ladder now plays at R${rc.to}, ${REALISM_LINES[rc.to as Realism]}. The grading stays the same.`
              : `The ladder steps back to R${rc.to}, ${REALISM_LINES[rc.to as Realism]}, until it feels easy again. The grading stays the same.`,
        }
      : null;
  const levelUp: LadderCoda["levelUp"] = l.levelUp
    ? {
        from: l.level,
        to: l.levelUp.to,
        title: `Level ${l.levelUp.to} is open: ${levelName(l.levelUp.to)}`,
        body: `${l.levelUp.reason} ${levelUpWhat(l.levelUp.to)} Take it when you like; it starts clean, at R0, and you can step back down any time.`,
      }
    : null;
  return { realism, levelUp, today };
}

/** What a new level holds, in one sentence (the Coda's level-up offer). */
export function levelUpWhat(to: number): string {
  const what = LADDER_LEVELS[rungOf(to)].what;
  return `On level ${Math.round(to)} you hear ${what}.`;
}
