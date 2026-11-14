// Wave 5 `controls` matcher ("Match this sound", A1.L01–L04; content-kit `ControlTolerance`): the sound controls
// of the learner's code against the hidden reference's, event by event on one track. Notes and rhythm are given
// and not compared. A control the answer leaves out takes Strudel's (superdough's) default, so a missing
// `.lpf()` is a fully open filter and a miss, never an error. Messages say which way the sound is off ("brighter
// than the target: bring .lpf() down") and never print the hidden value.
import type { ControlTolerance, Diagnostic, Matcher, NEvent } from "@oak/content-kit";
import { sortEvents } from "../analyze/events.ts";
import { selectTrack } from "../analyze/tracks.ts";
import { diag } from "../feedback/catalog.ts";
import type { MatchResult, NormalizeContext, Normalized } from "../types.ts";

/** The method as the learner writes it → the value key the hap carries (`.lpf(400)` sets `cutoff`). */
export const CONTROL_KEYS: Readonly<Record<string, string>> = {
  lpf: "cutoff",
  cutoff: "cutoff",
  ctf: "cutoff",
  lpq: "resonance",
  resonance: "resonance",
  hpf: "hcutoff",
  hcutoff: "hcutoff",
  hpq: "hresonance",
  hresonance: "hresonance",
  bpf: "bandf",
  bandf: "bandf",
  bpq: "bandq",
  bandq: "bandq",
  lpenv: "lpenv",
  lpa: "lpattack",
  lpattack: "lpattack",
  lpd: "lpdecay",
  lpdecay: "lpdecay",
  lps: "lpsustain",
  lpsustain: "lpsustain",
  lpr: "lprelease",
  lprelease: "lprelease",
  attack: "attack",
  att: "attack",
  decay: "decay",
  dec: "decay",
  sustain: "sustain",
  sus: "sustain",
  release: "release",
  rel: "release",
  room: "room",
  roomsize: "roomsize",
  size: "roomsize",
  sz: "roomsize",
  delay: "delay",
  delaytime: "delaytime",
  delayt: "delaytime",
  delayfeedback: "delayfeedback",
  delayfb: "delayfeedback",
  dfb: "delayfeedback",
  distort: "distort",
  shape: "shape",
  crush: "crush",
  coarse: "coarse",
  pan: "pan",
  orbit: "orbit",
  vowel: "vowel",
  partials: "partials",
  s: "s",
  sound: "s",
  gain: "gain",
};

const ENVELOPE = new Set(["attack", "decay", "sustain", "release"]);

// superdough's defaults as installed, the same numbers as `@oak/strudel/probes` (SYNTH_ENVELOPE_DEFAULTS,
// DELAY_DEFAULTS, FILTER_Q_DEFAULT, `adsrValues`). Copied, not imported: that module re-exports DOM types the
// grader's isomorphic build cannot see. The sound engineer pins both against the audibility harness.
const SYNTH_ENVELOPE_DEFAULTS = { attack: 0.001, decay: 0.05, sustain: 0.6, release: 0.01 } as const;
const DELAY_DEFAULTS = { feedback: 0.5, syncCycles: 3 / 16 } as const;
const FILTER_Q_DEFAULT = 1;
/**
 * The four envelope values superdough plays for what the code set (`getADSRValues`): with none set, the synth
 * defaults; with some set, the missing ones fall to the minimum (sustain to full when only an attack is set, or
 * when neither attack nor decay is set), so `.decay(.2)` alone is a decay-only envelope.
 */
export function adsrValues(set: { attack?: number; decay?: number; sustain?: number; release?: number }): {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
} {
  const { attack: a, decay: d, sustain: s, release: r } = set;
  if (a === undefined && d === undefined && s === undefined && r === undefined)
    return { ...SYNTH_ENVELOPE_DEFAULTS };
  const sustain =
    s !== undefined
      ? s
      : (a !== undefined && d === undefined) || (a === undefined && d === undefined)
        ? 1
        : 0.001;
  return {
    attack: Math.max(a ?? 0, 0.001),
    decay: Math.max(d ?? 0, 0.001),
    sustain: Math.min(sustain, 1),
    release: Math.max(r ?? 0, 0.01),
  };
}
const FILTER_ENVELOPE = ["lpattack", "lpdecay", "lpsustain", "lprelease"] as const;
/** superdough's filter-envelope defaults (`createFilter`: `getADSRValues(…, "exponential", [0.005, 0.14, 0, 0.1])`). */
const FILTER_ENVELOPE_DEFAULTS = { lpattack: 0.005, lpdecay: 0.14, lpsustain: 0, lprelease: 0.1 } as const;
/**
 * The filter envelope superdough plays for what the code set (d6; A1.L02 S6): with `.lpenv()` alone the defaults
 * above (so `.lpenv(4)` sweeps for 0.14 s); with some of `.lpa() .lpd() .lps() .lpr()` set, the missing ones fall
 * to the minimum exactly as the amplitude envelope's do; with neither, there is no envelope (`null`).
 */
export function filterEnvelopeValues(
  c: Readonly<Record<string, unknown>>,
): Record<(typeof FILTER_ENVELOPE)[number], number> | null {
  const num = (k: string): number | undefined => (typeof c[k] === "number" ? (c[k] as number) : undefined);
  const [a, d, s, r] = FILTER_ENVELOPE.map(num);
  if (a === undefined && d === undefined && s === undefined && r === undefined)
    return c.lpenv === undefined ? null : { ...FILTER_ENVELOPE_DEFAULTS };
  const v = adsrValues({
    ...(a !== undefined ? { attack: a } : {}),
    ...(d !== undefined ? { decay: d } : {}),
    ...(s !== undefined ? { sustain: s } : {}),
    ...(r !== undefined ? { release: r } : {}),
  });
  return { lpattack: v.attack, lpdecay: v.decay, lpsustain: v.sustain, lprelease: v.release };
}
/** The wave a pitched note plays with no `.s()` (superdough's default synth). */
const DEFAULT_WAVE = "triangle";

/**
 * The value an event plays for a control key: what the code set, else superdough's default (`null` when the
 * control has no sound without the method, such as a band-pass filter or a reverb size).
 */
export function controlValue(e: NEvent, key: string, cps: number): number | string | null {
  const c = e.controls ?? {};
  if (key === "gain") return e.gain;
  if (key === "s") return e.s ?? (e.midi !== null ? DEFAULT_WAVE : null);
  if (ENVELOPE.has(key)) {
    const set: { attack?: number; decay?: number; sustain?: number; release?: number } = {};
    for (const k of ENVELOPE) if (typeof c[k] === "number") set[k as keyof typeof set] = c[k] as number;
    return adsrValues(set)[key as "attack" | "decay" | "sustain" | "release"];
  }
  if ((FILTER_ENVELOPE as readonly string[]).includes(key))
    return filterEnvelopeValues(c)?.[key as (typeof FILTER_ENVELOPE)[number]] ?? null;
  const v = c[key];
  if (v !== undefined) return v;
  switch (key) {
    case "cutoff":
      return 20_000; // no low-pass: fully open
    case "hcutoff":
      return 20; // no high-pass: fully open
    case "resonance":
    case "hresonance":
    case "bandq":
      return FILTER_Q_DEFAULT;
    case "delaytime":
      return cps > 0 ? DELAY_DEFAULTS.syncCycles / cps : null;
    case "delayfeedback":
      return DELAY_DEFAULTS.feedback;
    case "room":
    case "delay":
    case "distort":
    case "shape":
    case "lpenv":
      return 0;
    case "pan":
      return 0.5;
    case "orbit":
      return 1;
    default:
      return null;
  }
}

/** Whether an answer value is within a tolerance of the target value. */
export function withinTolerance(
  got: number | string | null,
  want: number | string | null,
  t: Pick<ControlTolerance, "scale" | "tol">,
): boolean {
  if (want === null || got === null) return want === got;
  if (t.scale === "exact" || typeof want === "string" || typeof got === "string")
    return String(got) === String(want);
  if (t.scale === "log") {
    if (want <= 0 || got <= 0) return want === got;
    return Math.abs(Math.log2(got / want)) <= t.tol + 1e-9;
  }
  return Math.abs(got - want) <= t.tol + 1e-9;
}

/** How a control reads when it is too high or too low, in the words of A1. */
const DIRECTION: Readonly<Record<string, [string, string]>> = {
  cutoff: ["brighter than the target: bring it down", "darker than the target: open it up"],
  hcutoff: ["thinner than the target: bring it down", "fuller in the low end than the target: raise it"],
  bandf: ["higher than the target band: bring it down", "lower than the target band: raise it"],
  resonance: [
    "more resonant (it whistles more) than the target: lower it",
    "flatter than the target: raise it",
  ],
  hresonance: ["more resonant than the target: lower it", "flatter than the target: raise it"],
  bandq: ["narrower than the target: lower it", "wider than the target: raise it"],
  attack: ["slower to start than the target: shorten it", "quicker to start than the target: lengthen it"],
  decay: ["slower to fall than the target: shorten it", "quicker to fall than the target: lengthen it"],
  sustain: ["louder while held than the target: lower it", "quieter while held than the target: raise it"],
  release: ["ringing on longer than the target: shorten it", "stopping sooner than the target: lengthen it"],
  room: ["wetter than the target: less reverb", "drier than the target: more reverb"],
  roomsize: [
    "a bigger room than the target: make it smaller",
    "a smaller room than the target: make it bigger",
  ],
  delay: ["more echo than the target: lower it", "less echo than the target: raise it"],
  delaytime: [
    "echoing later than the target: shorten the time",
    "echoing sooner than the target: lengthen it",
  ],
  delayfeedback: [
    "repeating longer than the target: lower it",
    "dying away sooner than the target: raise it",
  ],
  distort: ["grittier than the target: less distortion", "cleaner than the target: more distortion"],
  lpenv: ["sweeping more than the target: less depth", "sweeping less than the target: more depth"],
  gain: ["louder than the target: turn it down", "quieter than the target: turn it up"],
};

export function controlsMatch(
  reference: Normalized,
  answer: Normalized,
  cfg: Extract<Matcher, { m: "controls" }>,
  _ctx: NormalizeContext,
): MatchResult {
  const pick = (n: Normalized): NEvent[] =>
    sortEvents(selectTrack(n, cfg.track ?? "*").filter((e) => e.midi !== null || e.s !== undefined));
  const ref = pick(reference);
  const ans = pick(answer);
  const diagnostics: Diagnostic[] = [];
  if (ref.length === 0)
    return { score: 0, dims: {}, diagnostics: [diag("rubric.unknown", { rule: "controls" })] };
  if (ans.length === 0)
    return {
      score: 0,
      dims: { coverage: { score: 0, weight: 1, n: ref.length } },
      diagnostics: [diag("eval.silent", { bars: Math.max(1, Math.ceil(ref.length / 4)) })],
    };
  const pairs = Math.min(ref.length, ans.length);
  const coverage = pairs / Math.max(ref.length, ans.length);
  const scores: number[] = [];
  for (const t of cfg.controls) {
    const key = CONTROL_KEYS[t.control] ?? t.control;
    let hits = 0;
    let high = 0;
    let low = 0;
    let missing = 0;
    for (let i = 0; i < pairs; i++) {
      const want = controlValue(ref[i] as NEvent, key, reference.cps);
      const gotEvent = ans[i] as NEvent;
      const got = controlValue(gotEvent, key, answer.cps);
      if (withinTolerance(got, want, t)) {
        hits++;
        continue;
      }
      const sets = (e: NEvent): boolean =>
        key === "gain" ||
        key === "s" ||
        (ENVELOPE.has(key)
          ? [...ENVELOPE].some((k) => e.controls?.[k] !== undefined)
          : (FILTER_ENVELOPE as readonly string[]).includes(key)
            ? // A filter envelope is there as soon as `.lpenv()` or one of its four times is: its other values
              // then play superdough's, which may be off the target but are not "left out".
              filterEnvelopeValues(e.controls ?? {}) !== null
            : e.controls?.[key] !== undefined);
      if (sets(ref[i] as NEvent) && !sets(gotEvent)) missing++;
      if (typeof got === "number" && typeof want === "number") {
        if (got > want) high++;
        else low++;
      }
    }
    const score = hits / pairs;
    scores.push(score);
    if (score >= 0.999) continue;
    const fn = `.${t.control}()`;
    if (missing > pairs / 2) diagnostics.push(diag("code.control-missing", { fn }, undefined, "constraints"));
    else if (high + low > 0 && DIRECTION[key]) {
      const [tooHigh, tooLow] = DIRECTION[key] as [string, string];
      diagnostics.push(
        diag("code.control-off", { fn, how: high >= low ? tooHigh : tooLow }, undefined, "constraints"),
      );
    } else
      diagnostics.push(
        diag(
          "code.control-off",
          {
            fn,
            how: key === "s" ? "not the sound of the target: try another one" : "not like the target yet",
          },
          undefined,
          "constraints",
        ),
      );
  }
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const score = mean * coverage;
  return {
    score,
    dims: {
      constraints: { score: mean, weight: 1, n: cfg.controls.length },
      coverage: { score: coverage, weight: 0, n: ref.length },
    },
    diagnostics,
    floor: Math.min(score, ...scores),
  };
}
