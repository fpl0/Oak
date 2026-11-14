// The Wave 6 harness of the workbench's e2e page (`/?w6=<piece>`): a Workbench with the lenses as the app has them
// (a lens source with the music lenses and the completed lessons), so a spec can open a piece at any depth of the
// course. Query: `unlocked=all|<ids>` (toolbox rows), `done=<lesson ids>` (completed lessons; `all` opens every
// depth), `off=<music lens ids>` (preferences switched off), `panels=key,circle`, `step=1` (a lesson step: the
// content names the roll's labels), `lesson=<id>` (the lesson being taken), `views=roll,staff`, `show=<music lens
// ids>` / `hide=<ids>` (a host's `musicLenses`), `reset=1` (a "Start from Oak's copy" button: d15's `codeKey`).
// Needs a services provider. Every piece is checked with headless Strudel in wave6.test.ts.
import type { ChordLensId, LensId, LensPrefs, LineLensId, MusicLensId } from "@oak/api";
import type { LintContext, MeterId, UnlockableId } from "@oak/content-kit";
import { useMemo, useState } from "react";
import { toolbox } from "../../../../content/toolbox.ts";
import { type LensSource, WorkbenchLensProvider } from "../lens-source.tsx";
import type { PanelId } from "../panels.ts";
import type { MusicView } from "../views.ts";
import { Workbench } from "../Workbench.tsx";

const ALL: readonly string[] = toolbox.map((t) => t.id as string);

const SECTION = (name: string, tune: string) =>
  `const mel${name} = n("${tune}").scale("C4:major").s("piano")\nconst drums${name} = s("bd ~ sd ~")`;

export const W6_PIECES: Record<string, { code: string; bars: number; meter: MeterId; key: string | null }> = {
  // ii–V–I: the guide tones F F E and C B B.
  sevenths: {
    code: `setcpm(90/4)

chords: chord("<Dm7 G7 C^7 C^7>").voicing().s("piano")
bass: chord("<Dm7 G7 C^7 C^7>").rootNotes(2).s("sawtooth").lpf(600)`,
    bars: 4,
    meter: "4/4",
    key: "C:major",
  },
  // V7/V resolving to V, then the borrowed iv and ♭VI–♭VII–I.
  chromatic: {
    code: `setcpm(90/4)

chords: chord("<C D7 G7 C Fm C Ab Bb>").voicing().s("piano")
mel: n("<[4 2 0 2] [3# 4 5 4] [3 1 6 4] [2 ~ 0 ~] [5b 4 3 ~] [2 ~ 0 ~] [2b 0 2b 4] [3 1 6b ~]>").scale("C4:major").s("piano")`,
    bars: 8,
    meter: "4/4",
    key: "C:major",
  },
  // The same four bars, lifted a whole step at bar 5.
  lift: {
    code: `setcpm(100/4)

mel: n("<[0 2 4 2] [3 2 1 0] [4 2 0 2] [1 ~ 0 ~]>").scale("<C4:major!4 D4:major!4>").s("piano")
chords: chord("<C F G C D G A D>").voicing().s("piano").gain(.6)`,
    bars: 8,
    meter: "4/4",
    key: "C:major",
  },
  // G Mixolydian: I–♭VII–IV, the ♭7 in the tune.
  mixolydian: {
    code: `setcpm(100/4)

mel: n("<[0 2 4 6] [6 5 4 2] [3 5 6 5] [4 ~ 0 ~]>").scale("G4:mixolydian").s("piano")
chords: chord("<G F C G>").voicing().s("piano").gain(.6)`,
    bars: 4,
    meter: "4/4",
    key: "G:mixolydian",
  },
  // A tune and a bass in C with plain .scale() calls: the key panel can lift it by a step.
  plain: {
    code: `setcpm(100/4)

mel: n("<[0 2 4 2] [3 2 1 0] [4 2 0 2] [1 ~ 0 ~]>").scale("C4:major").s("piano")
bass: n("<0 3 4 0>").scale("C2:major").s("sawtooth").lpf(600)`,
    bars: 4,
    meter: "4/4",
    key: "C:major",
  },
  // 6/8 at 60 to the dotted quarter.
  compound: {
    code: `setcpm(60/2)

drums: s("bd ~ ~ sd ~ ~")
hats: s("hh*6").gain(.5)
mel: n("<[0 ~ 2 4 ~ 2] [3 ~ 1 0 ~ ~]>").scale("C4:major").s("piano")`,
    bars: 2,
    meter: "6/8",
    key: "C:major",
  },
  // A triplet on beat 2, a pushed chord, ghost notes on the hats.
  rhythm: {
    code: `setcpm(96/4)

drums: s("bd ~ sd ~")
hats: s("hh*16").velocity("[1 .35 .6 .35]*4")
chords: chord("<C F>").voicing().s("piano").early(1/8)
mel: n("0 [2 3 4] 2 ~").scale("C5:major").s("piano")`,
    bars: 2,
    meter: "4/4",
    key: "C:major",
  },
  // Five sections of eight bars (40 bars: three pages of the roll, five of the staff) for the ribbon's keyboard reach.
  sections: {
    code: `setcpm(160/4)

${SECTION("Intro", "<0 2 4 2>")}
${SECTION("Verse", "<[0 2] [4 2] [3 1] 0>")}
${SECTION("Chorus", "<[7 9] [9 7] [11 9] 7>")}
${SECTION("Bridge", "<~ ~ ~ 4>")}
${SECTION("Outro", "<4 2 0 ~>")}

mel: arrange([8, melIntro], [8, melVerse], [8, melChorus], [8, melBridge], [8, melOutro])
drums: arrange([8, drumsIntro], [8, drumsVerse], [8, drumsChorus], [8, drumsBridge], [8, drumsOutro])`,
    bars: 4,
    meter: "4/4",
    key: "C:major",
  },
  // d3: a line of well over 110 characters wraps inside the editor.
  longline: {
    code: `setcpm(90/4)

bass: note("<[c2 c2 ~ g1] [bb1 bb1 ~ f1] [ab1 ab1 ~ eb2] [g1 g1 ~ d2]>").s("sawtooth").lpf(400).lpenv(4).lpd(.2).lpq(8).attack(.01).release(.2).gain(.7)
drums: s("bd ~ sd ~")`,
    bars: 4,
    meter: "4/4",
    key: "C:major",
  },
};

const list = (v: string | null): string[] => (v ? v.split(",").filter(Boolean) : []);

export function Wave6Harness() {
  const q = new URLSearchParams(location.search);
  const piece = W6_PIECES[q.get("w6") ?? "sevenths"] ?? (W6_PIECES.sevenths as (typeof W6_PIECES)[string]);
  const unlockedIds =
    q.get("unlocked") === "all" || q.get("unlocked") === null ? ALL : list(q.get("unlocked"));
  const doneAll = q.get("done") === "all";
  const done = useMemo(
    () =>
      new Set(
        doneAll ? ["U15.L02", "U16.L01", "U16.L02", "U16.L03", "U16.L04", "U17.L02"] : list(q.get("done")),
      ),
    [],
  );
  const [prefs, setPrefs] = useState<LensPrefs>({ degrees: true, solfege: true, noteNames: false });
  const [chords, setChords] = useState<Record<ChordLensId, boolean>>({
    chordSymbols: true,
    romanNumerals: true,
  });
  const [lines, setLines] = useState<Record<LineLensId, boolean>>({
    sections: true,
    bassRoles: false,
    blueNotes: false,
  });
  const off = list(q.get("off"));
  const [music, setMusic] = useState<Record<MusicLensId, boolean>>({
    guideTones: !off.includes("guideTones"),
    keyPlan: !off.includes("keyPlan"),
    beatGrid: !off.includes("beatGrid"),
  });
  const unlocked = useMemo(() => new Set(unlockedIds as UnlockableId[]), []);
  const has = (id: string) => unlocked.has(id as UnlockableId);
  const source: LensSource = {
    shown: prefs,
    available: { degrees: true, solfege: true, noteNames: true },
    toggle: (id: LensId) => setPrefs((p) => ({ ...p, [id]: !p[id] })),
    rollSetting: "auto",
    chords: {
      shown: chords,
      available: { chordSymbols: true, romanNumerals: true },
      toggle: (id) => setChords((c) => ({ ...c, [id]: !c[id] })),
    },
    lines: {
      shown: lines,
      available: { sections: true, bassRoles: true, blueNotes: true },
      toggle: (id) => setLines((c) => ({ ...c, [id]: !c[id] })),
    },
    music: {
      prefs: music,
      available: {
        guideTones: has("chord.seventh"),
        keyPlan: has("tb.scale.patterned"),
        beatGrid: has("tb.meter.compound") || has("tb.ply"),
      },
      toggle: (id) => setMusic((c) => ({ ...c, [id]: !c[id] })),
    },
    completedLessons: done,
  };
  const key = piece.key
    ? ({ tonic: piece.key.split(":")[0], mode: piece.key.split(":")[1] } as LintContext["key"])
    : null;
  const lint: LintContext = useMemo(
    () => ({ profile: "studio", unlocked, allowPreview: true, meter: piece.meter, key }),
    [],
  );
  const lessonCtx = useMemo(() => ({ key, meter: piece.meter, defaultBpm: 90, loopBars: piece.bars }), []);
  const panels = Object.fromEntries(list(q.get("panels")).map((p) => [p, true])) as Partial<
    Record<PanelId, boolean>
  >;
  const views = (list(q.get("views")).length ? list(q.get("views")) : ["roll", "staff"]) as MusicView[];
  const step = q.get("step") === "1";
  const lesson = q.get("lesson");
  const forced = {
    ...Object.fromEntries(list(q.get("show")).map((id) => [id, true])),
    ...Object.fromEntries(list(q.get("hide")).map((id) => [id, false])),
  } as Partial<Record<MusicLensId, boolean>>;
  const [codeKey, setCodeKey] = useState(0);
  return (
    <WorkbenchLensProvider value={source}>
      {q.get("reset") === "1" ? (
        <p>
          <button type="button" onClick={() => setCodeKey((k) => k + 1)} data-testid="reset-code">
            Start from Oak's copy
          </button>
        </p>
      ) : null}
      <Workbench
        id={`w6${(q.get("w6") ?? "s").replace(/[^a-z0-9]/g, "")}`}
        code={piece.code}
        lessonCtx={lessonCtx}
        lint={lint}
        views={views}
        initialTab="both"
        {...(step ? { roll: { labels: "degree" as const }, staff: { labels: "degree" as const } } : {})}
        {...(Object.keys(panels).length ? { initialPanels: panels } : {})}
        {...(lesson ? { lessonId: lesson } : {})}
        {...(Object.keys(forced).length ? { musicLenses: forced } : {})}
        codeKey={codeKey}
      />
    </WorkbenchLensProvider>
  );
}
