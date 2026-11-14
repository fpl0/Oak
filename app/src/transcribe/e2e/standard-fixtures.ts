// A stand-in standard for the Wave 6 Transcribe specs: a made-up 32-bar AABA tune in C ("Test Standard", swung
// eighths on the ride, a lift to D for its last eight bars so the key ribbon has something to show), as the server
// would send it — a `pd-song` project at ladder level 8 whose stimulus carries the reference's events (never its
// code), the song pool, and graded answers: the form map by its starts and its shape, a code stage one section at a
// time. Used where a spec drives the page against `page.route` answers (the L8 endpoints the server builds in this
// wave); the grading itself is tested through the real grader in standard.test.ts and form-map.test.ts, and the
// real server's answers by w6-integration.pw.ts from the "ladder L8" and "CF-T open" seeds.
import type { Page, Route } from "@playwright/test";

type Rat = [number, number];
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const red = ([a, b]: Rat): Rat => (a === 0 ? [0, 1] : [a / gcd(a, b), b / gcd(a, b)]);
let n = 0;
function ev(track: string, at: Rat, len: Rat, midi: number | null, s: string, chordSymbol?: string) {
  n++;
  const onset = red(at);
  return {
    id: `${track}|${onset[0]}/${onset[1]}|${midi ?? s}|${n}`,
    track,
    onset,
    dur: red(len),
    midi,
    pitchSource: midi === null ? "none" : "note-num",
    s,
    gain: 0.8,
    locs: [],
    ...(chordSymbol ? { chordSymbol } : {}),
  };
}

const NOW = "2026-11-13T09:00:00.000Z";
export const STANDARD_ID = "tr-w6standard";
export const STANDARD_BARS = 32;

/** Roots per bar as degrees − 1 (what the learner writes), per section. */
export const A_BASS = [0, 2, 5, 1, 4, 0, 3, 4];
export const B_BASS = [3, 3, 0, 0, 1, 1, 4, 4];
/** The changes of each section: sevenths, and applied dominants in the A section (E7 → A7 → D7 → G7). */
export const A_CHART = ["C", "E7", "A7", "A7", "D7", "D7", "G7", "G7"];
export const B_CHART = ["F", "F", "C", "C", "D7", "D7", "G7", "G7"];
export const A_MELODY = "[4 ~ 2 ~] [4 ~ 2 0] [5 ~ ~ 4] [3 2 1 ~] [1 ~ 3 ~] [2 ~ 0 ~] [3 2 1 0] [1 ~ ~ ~]";

const C2 = 36;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const deg = (d: number, base: number) => base + 12 * Math.floor(d / 7) + (MAJOR[((d % 7) + 7) % 7] as number);

function events() {
  const out: ReturnType<typeof ev>[] = [];
  const roots = [...A_BASS, ...A_BASS, ...B_BASS, ...A_BASS];
  const chart = [...A_CHART, ...A_CHART, ...B_CHART, ...A_CHART];
  for (let bar = 0; bar < STANDARD_BARS; bar++) {
    const lift = bar >= 24 ? 2 : 0;
    out.push(ev("bass", [bar, 1], [1, 2], deg(roots[bar] as number, C2) + lift, "ebass"));
    out.push(ev("bass", [bar * 2 + 1, 2], [1, 2], deg(roots[bar] as number, C2) + lift, "ebass"));
    for (const k of [0, 4, 7])
      out.push(
        ev("chords", [bar, 1], [1, 1], deg(roots[bar] as number, C2 + 12) + k + lift, "piano", chart[bar]),
      );
    out.push(ev("mel", [bar, 1], [1, 2], deg((roots[bar] as number) + 2, C2 + 24) + lift, "piano"));
    // The ride swings its eighths: the off-beat at two thirds of each beat.
    for (let beat = 0; beat < 4; beat++) {
      out.push(ev("drums", [bar * 12 + beat * 3, 12], [1, 12], null, "hh"));
      out.push(ev("drums", [bar * 12 + beat * 3 + 2, 12], [1, 12], null, "hh"));
    }
  }
  return out;
}

export function standardProject(over: { keyPlan?: boolean } = {}) {
  return {
    id: STANDARD_ID,
    sourceKind: "pd-song",
    player: "pattern",
    audioId: null,
    songId: "song.test-standard",
    title: "Test Standard",
    artist: null,
    key: { tonic: "C", mode: "major" },
    bpm: 132,
    meter: "4/4",
    downbeatS: null,
    fineTuneCents: 0,
    ladderLevel: 8,
    realism: 1,
    regions: [] as { id: string; label: string; startS: number; endS: number; kind: "loop" | "section" }[],
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
    stimulus: { events: events(), cps: 132 / 60 / 4, bars: STANDARD_BARS, preload: ["piano", "ebass"] },
    given: {
      pickup: null,
      swing: { subdivision: 8, amount: 1 / 3 },
      form: null,
      // Requested of the server (apiNotes): the song's key plan. The app's client strips it until the DTO has it,
      // so the spec that shows the ribbon hands it to the page through the item `ladder.next` returned.
      ...(over.keyPlan
        ? {
            keyPlan: [
              { bar: 1, key: { tonic: "C", mode: "major" } },
              { bar: 25, key: { tonic: "D", mode: "major" } },
            ],
          }
        : {}),
    },
  };
}

function result(
  passed: boolean,
  score: number,
  messages: { id?: string; text: string; bar?: number }[],
  revealed = false,
) {
  return {
    exerciseId: "ladder",
    exerciseVersion: 1,
    attemptNo: 1,
    firstAttempt: true,
    mode: "capstone",
    status: passed ? "pass" : "fail",
    score,
    adjustedScore: score,
    dims: {},
    constraints: [],
    diagnostics: [],
    messages: messages.map((m, i) => ({
      id: `${m.id ?? "harmony.rn-degree"}${i === 0 ? "" : `.n${i}`}`,
      text: m.text,
      ...(m.bar !== undefined ? { where: { bar: m.bar } } : {}),
    })),
    assist: { rung: revealed ? 4 : 0, tutorHints: 0, extraReplays: 0, revealed },
  };
}

const letters = (labels: readonly string[]) => {
  const seen = new Map<string, string>();
  return labels
    .map((raw) => {
      const type = raw.trim().toLowerCase().replace(/\d+$/, "");
      if (!seen.has(type)) seen.set(type, String.fromCharCode(65 + seen.size));
      return seen.get(type);
    })
    .join("");
};

const KEY_BARS = [1, 9, 17, 25];
const KEY_LABELS = ["A", "A", "B", "A"];

/** The form map as the server grades it: each section by its start and its letter by shape (`gradeFormMap`). */
function gradeForm(map: { sections: string[]; bars: number[] }) {
  const aligned = KEY_BARS.flatMap((bar, i) => {
    const at = map.bars.indexOf(bar);
    return at >= 0 ? [{ i, want: KEY_LABELS[i] as string, got: map.sections[at] as string }] : [];
  });
  const want = letters(aligned.map((a) => a.want));
  const got = letters(aligned.map((a) => a.got));
  const messages: { id: string; text: string; bar: number }[] = [];
  let right = 0;
  KEY_BARS.forEach((bar, i) => {
    const at = aligned.findIndex((a) => a.i === i);
    if (at < 0)
      messages.push({
        id: "form.map-start",
        text: `A new section starts at bar ${bar}; your map has no boundary there.`,
        bar,
      });
    else if (want[at] !== got[at])
      messages.push({
        id: "form.label",
        text: "This section starts in the right place. Its name: compare its first bars with bars 1–2.",
        bar,
      });
    else right++;
  });
  for (const bar of map.bars)
    if (!KEY_BARS.includes(bar))
      messages.push({
        id: "form.map-extra",
        text: `Bar ${bar} is inside a section: nothing new starts there.`,
        bar,
      });
  const score = right / Math.max(KEY_BARS.length, map.bars.length);
  return result(score === 1, score, messages);
}

const ladderState = { level: 8, realism: 1, history: [], gradedPasses: {}, levelUp: null };

export interface StandardStandIn {
  submissions: {
    stage?: string;
    phrase?: number;
    formMap?: { sections: string[]; bars: number[] };
    code: string;
    rung: number;
  }[];
  regions: unknown[];
}

/**
 * Routes one standard's endpoints to a stand-in: `transcriptions.get` (and its PATCH, which keeps the map as
 * regions), `ladder.songs`, the settings, and the submissions. `passed` starts the song with stages already passed
 * (as the "ladder L8" seed does: form and bass).
 */
export async function standardStandIn(
  page: Page,
  o: { passed?: string[]; keyPlan?: boolean; regions?: ReturnType<typeof standardProject>["regions"] } = {},
): Promise<StandardStandIn> {
  const project = standardProject(o.keyPlan ? { keyPlan: true } : {});
  if (o.regions) project.regions = o.regions;
  const state: StandardStandIn = { submissions: [], regions: project.regions };
  const passedStages = [...(o.passed ?? [])];
  const passedLines: number[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route(`**/api/transcriptions/${project.id}`, (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { regions?: typeof project.regions };
      if (body.regions) {
        project.regions = body.regions;
        state.regions = body.regions;
      }
    }
    return json(route, project);
  });
  await page.route(`**/api/transcriptions/${project.id}/settings`, (route) => json(route, {}));
  await page.route("**/api/ladder/songs", (route) =>
    json(route, {
      items: [
        {
          songId: project.songId,
          title: project.title,
          year: 1925,
          level: 8,
          phrases: KEY_BARS.map((b) => [b, b + 7]),
          status: "open",
          lockedReason: null,
          passedPhrases: [],
          passedStages: [...passedStages],
          passedLines: [...passedLines],
        },
      ],
    }),
  );
  await page.route(`**/api/ladder/items/${project.id}/submissions`, (route) => {
    const body = route.request().postDataJSON() as StandardStandIn["submissions"][number];
    state.submissions.push(body);
    let r: ReturnType<typeof result>;
    if (body.rung === 4) r = result(false, 0, [], true);
    else if (body.stage === "form" && body.formMap) r = gradeForm(body.formMap);
    else {
      const section = body.phrase ?? 1;
      const first = KEY_BARS[section - 1] as number;
      const isB = section === 3;
      const suffix =
        /const (?:bass|chords|mel)A2 =/.test(body.code) && section === 4 ? "A2" : isB ? "B" : "A";
      const line = (track: string) =>
        new RegExp(`^const ${track}${suffix} = (.*)$`, "m").exec(body.code)?.[1] ?? "";
      const ok =
        body.stage === "bass"
          ? line("bass").includes(`n("<${(isB ? B_BASS : A_BASS).join(" ")}>")`)
          : body.stage === "changes"
            ? line("chords").includes(`chord("<${(isB ? B_CHART : A_CHART).join(" ")}>")`)
            : line("mel").includes(isB ? "[5 5 3 ~]" : "[4 ~ 2 ~] [4 ~ 2 0]");
      r = ok
        ? result(true, 0.96, [])
        : body.stage === "changes"
          ? result(false, 0.75, [
              {
                id: "harmony.rn-quality",
                text: `Bar ${first + 1}: a minor chord where the song has a dominant 7th on the same root.`,
                bar: first + 1,
              },
              {
                id: "harmony.rn-degree",
                text: `Bar ${first + 6}: IV, where the song has V7.`,
                bar: first + 6,
              },
            ])
          : result(false, 0.5, [
              {
                id: "melody.wrong-degree",
                text: `Bar ${first + 1}: 1 where the song has 3.`,
                bar: first + 1,
              },
            ]);
      if (ok) {
        passedLines.push(section);
        if (passedLines.length === 4 && body.stage) {
          passedStages.push(body.stage);
          passedLines.length = 0;
        }
      }
    }
    if (body.stage === "form" && (r.status === "pass" || body.rung === 4)) passedStages.push("form");
    return json(route, {
      result: r,
      passed: r.status === "pass",
      gradedPass: false,
      ladder: ladderState,
      realismChange: null,
      version: state.submissions.length,
    });
  });
  return state;
}

/**
 * The ladder at L8 with its pool of three standards, as the list page reads it: CF-T's own (done), one under way
 * (form and bass passed) and one whose answer key is still being checked.
 */
export async function standardPool(page: Page): Promise<void> {
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/ladder", (route) =>
    route.request().method() === "GET"
      ? json(route, { level: 8, realism: 1, history: [], gradedPasses: { "6": 2, "8": 1 }, levelUp: null })
      : route.continue(),
  );
  const song = (songId: string, title: string, year: number, over: Record<string, unknown>) => ({
    songId,
    title,
    year,
    level: 8,
    phrases: KEY_BARS.map((b) => [b, b + 7]),
    status: "open",
    lockedReason: null,
    passedPhrases: [],
    passedStages: [],
    ...over,
  });
  await page.route("**/api/ladder/songs", (route) =>
    json(route, {
      items: [
        song("song.five-foot-two", "Five Foot Two, Eyes of Blue", 1925, {
          status: "done",
          passedStages: ["form", "bass", "changes", "melody"],
        }),
        song("song.aint-she-sweet", "Ain't She Sweet", 1927, { passedStages: ["form", "bass"] }),
        song("song.bye-bye-blackbird", "Bye Bye Blackbird", 1926, {
          status: "locked",
          lockedReason: "Being checked",
        }),
      ],
    }),
  );
}
