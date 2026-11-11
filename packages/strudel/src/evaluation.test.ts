// The adapter's evaluation pieces against real headless Strudel 1.2.6: the `.p` wrapper (track tags,
// live mute and solo without re-evaluation), the Band stack, live transposition and the A–B loop.
import { beforeAll, describe, expect, test } from "bun:test";
import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import {
  type EvalSession,
  evaluateBand,
  finalizePattern,
  installTrackWrapper,
  midiOfNote,
  newSession,
  transposeValue,
} from "./evaluation.ts";
import { TRACK_KEY } from "./haps.ts";
import { scopeRequests, stubVisualMethods } from "./pack.ts";
import { queryLiveHaps } from "./transport.ts";
import type { MuteMap } from "./types.ts";

beforeAll(async () => {
  await core.evalScope(core, mini, tonal);
  stubVisualMethods(core.Pattern);
});

interface Harness {
  evaluate(
    code: string,
    band?: { code: string; roles: string[] },
  ): Promise<{ session: EvalSession; pattern: Strudel.Pattern; error: unknown }>;
  mutes: MuteMap;
  transpose: number;
}

function harness(): Harness {
  const h: Harness = {
    mutes: { muted: new Set(), solo: null },
    transpose: 0,
    async evaluate(code, band) {
      session = newSession();
      pendingBand = band ?? null;
      await repl.evaluate(code, false);
      return { session, pattern: repl.state.pattern, error: session.error };
    },
  };
  let session = newSession();
  let pendingBand: { code: string; roles: string[] } | null = null;
  const repl = core.repl({
    defaultOutput: () => {},
    getTime: () => 0,
    transpiler,
    beforeEval: async () => {
      installTrackWrapper(session, () => h.mutes);
      if (pendingBand) await evaluateBand(pendingBand.code, pendingBand.roles, session);
    },
    editPattern: (pat: Strudel.Pattern) =>
      finalizePattern(pat, { session, mutes: () => h.mutes, transpose: () => h.transpose }),
    onEvalError: (err: unknown) => {
      session.error = err;
    },
  });
  return h;
}

const sounds = (pattern: Strudel.Pattern, from = 0, to = 1): string[] =>
  queryLiveHaps(pattern, from, to).map((h) => `${h.track}:${String(h.value.s)}`);

describe("the .p wrapper", () => {
  test("tags every hap with its label and keeps source order of tracks; $ labels become $0, $1", async () => {
    const h = harness();
    const { session, pattern } = await h.evaluate(
      'drums: s("bd*2")\n$: note("c4").s("piano")\n_hats: s("hh*4")\n$: s("sd")',
    );
    expect(session.tracks).toEqual(["drums", "$0", "$1"]);
    expect(sounds(pattern)).toEqual(["drums:bd", "$0:piano", "$1:sd", "drums:bd"]);
  });
  test("mute and solo act on the playing pattern at once, with no re-evaluation", async () => {
    const h = harness();
    const { pattern } = await h.evaluate(
      'drums: note("c5*4").s("square")\nbass: note("c2 g2").s("sawtooth")',
    );
    const count = () => {
      const c: Record<string, number> = {};
      for (const hap of queryLiveHaps(pattern, 0, 1))
        c[String(hap.value.s)] = (c[String(hap.value.s)] ?? 0) + 1;
      return c;
    };
    expect(count()).toEqual({ square: 4, sawtooth: 2 }); // spike S2 GOAL 5 numbers
    h.mutes = { muted: new Set(["drums"]), solo: null };
    expect(count()).toEqual({ sawtooth: 2 });
    h.mutes = { muted: new Set(), solo: "drums" };
    expect(count()).toEqual({ square: 4 });
    h.mutes = { muted: new Set(), solo: null };
    expect(count()).toEqual({ square: 4, sawtooth: 2 });
  });
  test("unlabelled code is the track 'main' and can be muted", async () => {
    const h = harness();
    const { pattern } = await h.evaluate('note("c4 e4").s("piano")');
    expect(sounds(pattern)).toEqual(["main:piano", "main:piano"]);
    h.mutes = { muted: new Set(["main"]), solo: null };
    expect(sounds(pattern)).toEqual([]);
  });
  test("an evaluation error is reported, not thrown", async () => {
    const h = harness();
    const out = await h.evaluate('note("c4").s(');
    expect(out.error).toBeTruthy();
  });
});

describe("the Band layer", () => {
  test("Band tracks are stacked as band.<label>, filtered by role, without editor locations", async () => {
    const h = harness();
    const band = {
      code: 'drums: s("bd*4")\nbass: note("c2").s("sawtooth")\nchords: note("<c3 e3>").s("piano")',
      roles: ["drums", "bass"],
    };
    const { session, pattern } = await h.evaluate('mel: note("e4 g4").s("triangle")', band);
    expect(session.band.map((b) => b.track)).toEqual(["band.drums", "band.bass"]);
    expect(session.tracks).toEqual(["mel"]); // the Band never reaches the learner's label map
    const haps = queryLiveHaps(pattern, 0, 1, ["mel", "band.drums", "band.bass"]);
    expect(haps.filter((x) => x.track === "band.drums")).toHaveLength(4);
    expect(haps.filter((x) => x.track === "band.bass")).toHaveLength(1);
    expect(haps.filter((x) => x.track.startsWith("band.")).every((x) => x.locations.length === 0)).toBe(true);
    expect(haps.filter((x) => x.track === "mel").every((x) => x.locations.length > 0)).toBe(true);
    h.mutes = { muted: new Set(["band.drums"]), solo: null };
    expect(queryLiveHaps(pattern, 0, 1).some((x) => x.track === "band.drums")).toBe(false);
    h.mutes = { muted: new Set(), solo: "mel" };
    expect(queryLiveHaps(pattern, 0, 1).map((x) => x.track)).toEqual(["mel", "mel"]);
  });
});

describe("transposition and loop (pattern player)", () => {
  test("note names and numbers are shifted by semitones; drums pass untouched", async () => {
    expect(midiOfNote("c4")).toBe(60);
    expect(midiOfNote("Eb3")).toBe(51);
    expect(transposeValue({ note: "c4", s: "piano" }, 3)).toEqual({ note: 63, s: "piano" });
    expect(transposeValue({ s: "bd" }, 3)).toEqual({ s: "bd" });
    const h = harness();
    const { pattern } = await h.evaluate('mel: n("0 2 4").scale("C4:major").s("piano")\ndrums: s("bd")');
    const notes = () =>
      queryLiveHaps(pattern, 0, 1)
        .filter((x) => x.track === "mel")
        .map((x) => midiOfNote(x.value.note));
    expect(notes()).toEqual([60, 64, 67]); // C4 E4 G4
    h.transpose = -2;
    expect(notes()).toEqual([58, 62, 65]); // Bb3 D4 F4: a whole step down, live
    expect(queryLiveHaps(pattern, 0, 1).filter((x) => x.track === "drums")[0]?.value).toEqual({ s: "bd" });
  });
  test(".ribbon(fromBar, bars) loops bars 3–4 of a four-bar line", async () => {
    const h = harness();
    const { pattern } = await h.evaluate('mel: note("<c4 d4 e4 f4>").s("piano")');
    const looped = (pattern.ribbon as (o: number, c: number) => Strudel.Pattern)(2, 2);
    const at = (c: number) => queryLiveHaps(looped, c, c + 1)[0]?.value.note;
    expect([at(0), at(1), at(2), at(3)]).toEqual(["e4", "f4", "e4", "f4"]);
  });
});

describe("visual stubs", () => {
  test(".scope() and .fscope() return the pattern unchanged and request Oak's panels", async () => {
    scopeRequests.clear();
    const h = harness();
    const { pattern } = await h.evaluate('note("c4").s("sawtooth").scope().fscope().pianoroll()');
    expect(sounds(pattern)).toEqual(["main:sawtooth"]);
    expect([...scopeRequests].sort()).toEqual(["fscope", "scope"]);
    expect(queryLiveHaps(pattern, 0, 1)[0]?.value[TRACK_KEY]).toBeUndefined();
  });
});
