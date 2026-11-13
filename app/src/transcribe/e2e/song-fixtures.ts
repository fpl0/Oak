// Stand-in song items for the Wave 5 Transcribe specs: a made-up eight-bar folk tune with a one-beat pickup (L5)
// and a made-up 12-bar blues in G with swung hats (L6), as the server would send them — a `pd-song` project whose
// stimulus carries the reference's events (never its code), the song pool, and graded answers. Used where a
// spec drives the page against `page.route` answers (the song endpoints the server builds in this wave); the
// grading itself is tested through the real grader in song.test.ts.
import type { Page, Route } from "@playwright/test";

type Rat = [number, number];
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
/** Rats are sent reduced (`[1, 2]`, never `[2, 4]`; zero is `[0, 1]`), as the API's schema wants. */
const red = ([a, b]: Rat): Rat => (a === 0 ? [0, 1] : [a / gcd(a, b), b / gcd(a, b)]);
let n = 0;
function ev(track: string, at: Rat, len: Rat, midi: number | null, s: string, chordSymbol?: string) {
  n++;
  const onset = red(at);
  const dur = red(len);
  return {
    id: `${track}|${onset[0]}/${onset[1]}|${midi ?? s}|${n}`,
    track,
    onset,
    dur,
    midi,
    pitchSource: midi === null ? "none" : "note-num",
    s,
    gain: 0.8,
    locs: [],
    ...(chordSymbol ? { chordSymbol } : {}),
  };
}

const NOW = "2026-11-13T09:00:00.000Z";

function detail(o: {
  id: string;
  songId: string;
  title: string;
  level: 5 | 6;
  realism: number;
  bpm: number;
  key: { tonic: string; mode: "major" };
  bars: number;
  events: ReturnType<typeof ev>[];
}) {
  return {
    id: o.id,
    sourceKind: "pd-song",
    player: "pattern",
    audioId: null,
    songId: o.songId,
    title: o.title,
    artist: null,
    key: o.key,
    bpm: o.bpm,
    meter: "4/4",
    downbeatS: null,
    fineTuneCents: 0,
    ladderLevel: o.level,
    realism: o.realism,
    regions: [],
    checklist: {},
    selfScore: null,
    currentVersion: 0,
    status: "in_progress",
    review: null,
    createdAt: NOW,
    updatedAt: NOW,
    gradedPass: false,
    gymId: null,
    versions: [] as { transcriptionId: string; version: number; code: string; createdAt: string }[],
    stimulus: { events: o.events, cps: o.bpm / 60 / 4, bars: o.bars, preload: ["piano", "ebass"] },
  };
}

// --- L5: "Test Folk", C major, a one-beat pickup, two phrases of four bars --------------------------------

/** The tune in degrees − 1 per cycle (cycle 0 is the pickup bar): what a learner writes once heard. */
export const FOLK_MELODY =
  "<[~ ~ ~ -3] [0 2 4 2] [3 5 4 ~] [2 1 0 1] [2 ~ ~ -3] [0 2 4 2] [3 5 4 2] [1 2 1 -1] 0>";
const C4 = 60;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const deg = (d: number) => C4 + 12 * Math.floor(d / 7) + (MAJOR[((d % 7) + 7) % 7] as number);

function folkEvents() {
  const out: ReturnType<typeof ev>[] = [];
  const cells = FOLK_MELODY.slice(1, -1).match(/\[[^\]]*\]|\S+/g) ?? [];
  cells.forEach((cell, bar) => {
    const steps = cell.replace(/[[\]]/g, "").split(/\s+/);
    steps.forEach((x, i) => {
      if (x === "~") return;
      out.push(ev("mel", [bar * steps.length + i, steps.length], [1, steps.length], deg(Number(x)), "piano"));
    });
  });
  const roots = [0, 3, 4, 0, 0, 3, 4, 0];
  roots.forEach((r, i) => {
    out.push(ev("bass", [i + 1, 1], [1, 1], deg(r) - 24, "ebass"));
    for (const k of [0, 2, 4]) out.push(ev("chords", [i + 1, 1], [1, 1], deg(r + k) - 12, "piano"));
  });
  return out;
}

export const FOLK_ID = "tr-w5folk";
export function folkProject() {
  return detail({
    id: FOLK_ID,
    songId: "song.test-folk",
    title: "Test Folk",
    level: 5,
    realism: 0,
    bpm: 96,
    key: { tonic: "C", mode: "major" },
    bars: 9,
    events: folkEvents(),
  });
}

// --- L6: "Test Blues", G, one 12-bar strain, swung hats ---------------------------------------------------

export const BLUES_ROOTS = [0, 3, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4];
export const BLUES_CHART = ["G7", "C7", "G7", "G7", "C7", "C7", "G7", "G7", "D7", "C7", "G7", "D7"];
export const BLUES_MELODY = "<[4 4 2 0] 2 [4 4 2 0] 0 [3 3 1 0] 1 [4 4 2 0] 0 [4 4 3 1] 3 [2 1 0 ~] ~>";
const G = 55;
const DOM7: Record<string, number[]> = { G7: [0, 4, 7, 10], C7: [5, 9, 12, 15], D7: [7, 11, 14, 17] };

function bluesEvents() {
  const out: ReturnType<typeof ev>[] = [];
  for (let bar = 0; bar < 12; bar++) {
    const root = BLUES_ROOTS[bar] as number;
    out.push(ev("bass", [bar, 1], [1, 1], G - 12 + (root === 3 ? 5 : root === 4 ? 7 : 0), "ebass"));
    for (const k of DOM7[BLUES_CHART[bar] as string] as number[])
      out.push(ev("chords", [bar, 1], [1, 2], G + k, "piano", BLUES_CHART[bar]));
    // Swung eighths on the hats: the off-beat at two thirds of each beat.
    for (let beat = 0; beat < 4; beat++) {
      out.push(ev("drums", [bar * 12 + beat * 3, 12], [1, 12], null, "hh"));
      out.push(ev("drums", [bar * 12 + beat * 3 + 2, 12], [1, 12], null, "hh"));
    }
    out.push(ev("mel", [bar * 4, 4], [1, 4], G + 12 + (bar % 2 === 0 ? 7 : 4), "piano"));
  }
  return out;
}

export const BLUES_ID = "tr-w5blues";
export function bluesProject() {
  return detail({
    id: BLUES_ID,
    songId: "song.test-blues",
    title: "Test Blues",
    level: 6,
    realism: 1,
    bpm: 92,
    key: { tonic: "G", mode: "major" },
    bars: 12,
    events: bluesEvents(),
  });
}

// --- the stand-in server ------------------------------------------------------------------------------

function result(passed: boolean, score: number, messages: { text: string; bar?: number; beat?: string }[]) {
  return {
    exerciseId: "ladder",
    exerciseVersion: 1,
    attemptNo: 1,
    firstAttempt: true,
    mode: "lesson",
    status: passed ? "pass" : "fail",
    score,
    adjustedScore: score,
    dims: {},
    constraints: [],
    diagnostics: [],
    messages: messages.map((m, i) => ({
      id: i === 0 ? "melody.wrong-note" : `melody.wrong-note.n${i}`,
      text: m.text,
      ...(m.bar !== undefined ? { where: { bar: m.bar, ...(m.beat ? { beatLabel: m.beat } : {}) } } : {}),
    })),
    assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
  };
}

const ladderState = (level: number) => ({ level, realism: 0, history: [], gradedPasses: {}, levelUp: null });

/** A graded answer as the server sends it (exported for the schema check in the spec). */
export const resultFor = result;

export interface StandIn {
  submissions: { phrase?: number; stage?: string; code: string; rung: number }[];
}

/**
 * Routes the song endpoints of one project to a stand-in: `transcriptions.get`, `ladder.songs`, the submissions
 * (graded by what the code contains) and the settings (accepted). Everything else goes to the real server.
 */
export async function standIn(page: Page, project: ReturnType<typeof detail>): Promise<StandIn> {
  const state: StandIn = { submissions: [] };
  const level = project.ladderLevel as 5 | 6;
  const passedPhrases: number[] = [];
  const passedStages: string[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route(`**/api/transcriptions/${project.id}`, (route) => json(route, project));
  await page.route(`**/api/transcriptions/${project.id}/settings`, (route) => json(route, {}));
  await page.route("**/api/ladder/songs", (route) =>
    json(route, {
      items: [
        {
          songId: project.songId,
          title: project.title,
          year: "trad",
          level,
          phrases:
            level === 5
              ? [
                  [1, 4],
                  [5, 8],
                ]
              : [[1, 12]],
          status: "open",
          lockedReason: null,
          passedPhrases: [...passedPhrases],
          passedStages: [...passedStages],
        },
      ],
    }),
  );
  await page.route(`**/api/ladder/items/${project.id}/submissions`, (route) => {
    const body = route.request().postDataJSON() as {
      phrase?: number;
      stage?: string;
      code: string;
      rung: number;
    };
    state.submissions.push(body);
    let r: ReturnType<typeof result>;
    if (body.rung === 4)
      r = { ...result(false, 0, []), assist: { rung: 4, tutorHints: 0, extraReplays: 0, revealed: true } };
    else if (level === 5) {
      const ok = body.code.includes("[0 2 4 2] [3 5 4 ~]");
      r = ok
        ? result(true, 1, [])
        : result(false, 0.4, [
            { text: "Bar 2, 3: 1 where the song has 5.", bar: 2, beat: "3" },
            { text: "Bar 3, 1: 1 where the song has 3.", bar: 3, beat: "1" },
          ]);
      if (ok && body.phrase) passedPhrases.push(body.phrase);
    } else {
      const ok =
        body.stage === "bass"
          ? body.code.includes(`n("<${BLUES_ROOTS.join(" ")}>")`)
          : body.stage === "changes"
            ? body.code.includes(`chord("<${BLUES_CHART.join(" ")}>")`)
            : body.code.includes("[4 4 2 0] 2");
      r = ok
        ? result(true, 0.95, [])
        : result(false, 0.5, [{ text: "Bar 2, 1: C where the song has G.", bar: 2, beat: "1" }]);
      if (ok && body.stage && body.stage !== "melody") passedStages.push(body.stage);
    }
    return json(route, {
      result: r,
      passed: r.status === "pass",
      gradedPass: r.status === "pass",
      ladder: ladderState(level),
      realismChange: null,
      version: state.submissions.length,
    });
  });
  return state;
}
