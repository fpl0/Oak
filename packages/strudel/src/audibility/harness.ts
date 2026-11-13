// The audibility harness (contracts §3.1 rule 7), a browser test utility promoted from
// spikes/s3-sounds/src/audibility.ts. Each render runs in a throw-away iframe (one OfflineAudioContext per
// realm); `audible()` compares `base` with `base.control(value)`, `soundAudible()` a sound against silence.
import {
  AUDIBLE_DB,
  balance,
  centroid,
  db,
  diffRms,
  isAudible,
  isAudibleSpectral,
  isAudibleWidth,
  rms,
  round,
  SOUND_AUDIBLE_DBFS,
  type Stereo,
  sideRatio,
  spectralDiffDb,
  tailShare,
} from "./metrics.ts";
import type { RenderRequest } from "./render-frame.ts";

export { AUDIBLE_DB };

export interface Rendered extends Stereo {
  haps: number;
  logs: string[];
  /** Wall time to queue the voices and to render the graph (pattern renders only). */
  timings?: { scheduleMs: number; renderMs: number };
}

export interface AudibleRow {
  /** Toolbox ID when known (`tb.room`, `snd.rhodes`). */
  id?: string;
  control: string;
  value: unknown;
  base: string;
  code: string;
  audible: boolean;
  /** 20·log10(rms(with − without) / rms(without)); −Infinity = bit-identical. For a sound: its level in dBFS. */
  diffDb: number;
  /** Two renders of the WITH version against each other, same scale. */
  repeatDb: number;
  /** Phase-insensitive (average magnitude spectrum) difference and its run-to-run noise, dB. */
  spectralDb: number;
  spectralRepeatDb: number;
  /** Stereo width rms(L − R)/rms(L + R), without → with. */
  width: [number, number];
  levelDb: number;
  centroidHz: [number, number];
  balance: [number, number];
  tail: [number, number];
  error?: string;
}

export interface HarnessOptions {
  /** URL of the frame page that calls `installRenderFrame`. Default `/render.html`. */
  frameUrl?: string;
  sampleRate?: number;
  seconds?: number;
  /** A render that takes longer fails (default 30 s; a 90-second piece needs more). */
  timeoutMs?: number;
}

export const DEFAULT_BASE = 'note("c3 e3 g3 c4").s("sawtooth")';

let nextId = 1;

export function createHarness(options: HarnessOptions = {}) {
  const frameUrl = options.frameUrl ?? "/render.html";
  const sampleRate = options.sampleRate ?? 44100;
  const seconds = options.seconds ?? 2.5;
  const timeoutMs = options.timeoutMs ?? 30_000;

  function renderInFrame(
    code: string,
    cycles = 1,
    cps = 1,
    events?: RenderRequest["events"],
  ): Promise<Rendered> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const frame = document.createElement("iframe");
      frame.style.display = "none";
      frame.src = frameUrl;
      const timer = setTimeout(() => done(() => reject(new Error(`render timeout: ${code}`))), timeoutMs);
      const done = (fn: () => void): void => {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        frame.remove();
        fn();
      };
      const onMessage = (event: MessageEvent): void => {
        if (event.source !== frame.contentWindow) return;
        if (event.data?.type === "ready") {
          const req: RenderRequest = {
            type: "render",
            id,
            code,
            seconds,
            cycles,
            cps,
            sampleRate,
            ...(events ? { events } : {}),
          };
          frame.contentWindow?.postMessage(req, location.origin);
        } else if (event.data?.type === "rendered" && event.data.id === id) {
          const { error, left, right, haps, logs, timings } = event.data as Rendered & { error?: string };
          done(() =>
            error
              ? reject(new Error(error))
              : resolve({ left, right, haps, logs, ...(timings ? { timings } : {}) }),
          );
        }
      };
      window.addEventListener("message", onMessage);
      document.body.append(frame);
    });
  }

  const baseCache = new Map<string, Promise<Rendered>>();
  const renderBase = (base: string, cycles = 1, cps = 1): Promise<Rendered> => {
    const key = `${cycles}|${cps}|${base}`;
    let p = baseCache.get(key);
    if (!p) {
      p = renderInFrame(base, cycles, cps);
      baseCache.set(key, p);
    }
    return p;
  };

  const emptyRow = (
    control: string,
    value: unknown,
    base: string,
    code: string,
    id?: string,
  ): AudibleRow => ({
    ...(id ? { id } : {}),
    control,
    value,
    base,
    code,
    audible: false,
    diffDb: Number.NEGATIVE_INFINITY,
    repeatDb: Number.NEGATIVE_INFINITY,
    spectralDb: Number.NEGATIVE_INFINITY,
    spectralRepeatDb: Number.NEGATIVE_INFINITY,
    width: [0, 0],
    levelDb: Number.NEGATIVE_INFINITY,
    centroidHz: [0, 0],
    balance: [0, 0],
    tail: [0, 0],
  });

  /**
   * `audible("lpf", 400)` compares `base` with `base.lpf(400)`. `value` is a JS literal or raw code. `at` renders
   * both at a lesson's tempo (`cps`) over `cycles` cycles (default one cycle at cps 1).
   */
  async function audible(
    control: string,
    value: unknown,
    base = DEFAULT_BASE,
    id?: string,
    withCode?: string,
    at: { cycles?: number; cps?: number } = {},
  ): Promise<AudibleRow> {
    const arg = typeof value === "string" && value.startsWith("=") ? value.slice(1) : JSON.stringify(value);
    const code = withCode ?? `${base}.${control}(${arg})`;
    const row = emptyRow(control, value, base, code, id);
    const [cycles, cps] = [at.cycles ?? 1, at.cps ?? 1];
    try {
      const without = await renderBase(base, cycles, cps);
      const baseRms = rms(without);
      if (baseRms === 0) throw new Error("base render is silent");
      const withControl = await renderInFrame(code, cycles, cps);
      const again = await renderInFrame(code, cycles, cps);
      row.diffDb = round(db(diffRms(without, withControl) / baseRms));
      row.repeatDb = round(db(diffRms(withControl, again) / baseRms));
      row.levelDb = round(db(rms(withControl) / baseRms));
      row.centroidHz = [
        Math.round(centroid(without, sampleRate)),
        Math.round(centroid(withControl, sampleRate)),
      ];
      row.balance = [round(balance(without), 2), round(balance(withControl), 2)];
      row.tail = [round(tailShare(without), 4), round(tailShare(withControl), 4)];
      row.spectralDb = round(spectralDiffDb(without, withControl));
      row.spectralRepeatDb = round(spectralDiffDb(withControl, again));
      const width = [sideRatio(without), sideRatio(withControl), sideRatio(again)] as const;
      row.width = [round(width[0], 3), round(width[1], 3)];
      row.audible =
        isAudible(row.diffDb, row.repeatDb) ||
        isAudibleSpectral(row.spectralDb, row.spectralRepeatDb) ||
        isAudibleWidth(width[0], width[1], width[2]);
    } catch (err) {
      row.error = String((err as Error)?.message ?? err);
    }
    return row;
  }

  /** A sound is audible when its phrase renders above −60 dBFS RMS. */
  async function soundAudible(sound: string, code: string, id?: string): Promise<AudibleRow> {
    const row = emptyRow("s", sound, "silence", code, id);
    try {
      const r = await renderInFrame(code);
      const level = rms(r);
      row.diffDb = round(db(level));
      row.levelDb = row.diffDb;
      row.centroidHz = [0, Math.round(centroid(r, sampleRate))];
      row.audible = row.diffDb > SOUND_AUDIBLE_DBFS && r.haps > 0;
      const notFound = r.logs.find((l) => /not found/.test(l));
      if (notFound !== undefined) row.error = notFound;
    } catch (err) {
      row.error = String((err as Error)?.message ?? err);
    }
    return row;
  }

  async function noiseFloorDb(base = DEFAULT_BASE) {
    const a = await renderInFrame(base);
    const b = await renderInFrame(base);
    return { base, rms: rms(a), haps: a.haps, floorDb: db(diffRms(a, b) / rms(a)) };
  }

  /** Renders superdough values (an `AudioPlan`'s events) exactly as `playEvents` would trigger them. */
  const renderEvents = (events: NonNullable<RenderRequest["events"]>): Promise<Rendered> =>
    renderInFrame("silence", 1, 1, events);

  return { renderInFrame, renderEvents, audible, soundAudible, noiseFloorDb, sampleRate, seconds };
}
