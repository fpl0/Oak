// `latency.tap` and `latency.sing` (ux §4.7, contracts §8.4, §8.6): tap along to 16 clicks (Space, or the pad with
// a pointer), then sing "da" on 8 clicks. Stores the median offsets (and the tap jitter, which widens the tap
// window when it is large). The sing half needs the mic and is left out in Quiet mode.
//
// Two sub-steps, one card and one footer at a time (docs/design/retry.md §6.3): "1 of 2: tapping", "2 of 2:
// singing". Every result can be measured again; an implausible one ("Not enough taps", a voice that lands before
// the click) is "unclear" and never saved; a measurement saved earlier (a reload, Back) opens in its result.
import type { TapInput } from "@oak/audio";
import { clsx } from "clsx";
import { Mic, MousePointerClick } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MEASURE_LINE } from "../../lib/retry.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Kbd } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { latencyResumeAt, latencyWords, singLatencyVerdict, tapVerdict } from "../logic.ts";
import { closeInput, voiceAudio } from "../services.ts";
import { createTapStream, type TapStream } from "../tap-stream.ts";
import { useQuietChosen } from "../use-voice.ts";
import { PartActions, PartFrame, type PartProps, ResultRow, StatusSlot, useSaveRun } from "./common.tsx";

const TAP_CLICKS = 16;
const SING_CLICKS = 8;

type TapPhase = "ready" | "tapping" | "result";
type SingPhase = "ready" | "singing" | "result";
type Sub = "tap" | "sing";

export interface LatencyPartProps extends PartProps {
  only?: "tap" | "sing";
}

interface TapResult {
  latencyMs: number;
  jitterMs: number;
  taps: number;
}

function ClickDots({ total, at, label }: { total: number; at: number; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-wrap gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <li
          // Fixed positions: the index is the key.
          key={i}
          aria-current={i === at ? "step" : undefined}
          className={clsx(
            "size-3 rounded-full border",
            i <= at ? "border-accent bg-accent" : "border-border bg-surface-2",
            i % 4 === 0 && "ml-1 first:ml-0",
          )}
        />
      ))}
    </ol>
  );
}

/** The sub-step names, as the progress in the header shows them. */
export const LATENCY_SUBS: Readonly<Record<Sub, string>> = {
  tap: "1 of 2: tapping",
  sing: "2 of 2: singing",
};

export function LatencyPart({ profile, onDone, onSkip, only, context, back, onSub }: LatencyPartProps) {
  // Quiet mode as chosen anywhere (Settings › Voice "just for today" included): timing keeps tapping only.
  const quiet = useQuietChosen(profile);
  const withSing = only !== "tap" && !quiet && profile.inputKind !== "none";
  const withTap = only !== "sing";
  // Onboarding opens on a measurement saved earlier (a reload, Back); Settings' re-run measures afresh.
  const resume = context === "onboarding";
  const savedTap: TapResult | null =
    !resume || profile.tapLatencyMs === null
      ? null
      : { latencyMs: profile.tapLatencyMs, jitterMs: profile.tapJitterMs ?? 0, taps: TAP_CLICKS };
  const savedSing = resume ? profile.singLatencyMs : null;
  const [sub, setSub] = useState<Sub>(() =>
    latencyResumeAt({ withTap, withSing, tapSaved: savedTap !== null, singSaved: savedSing !== null }),
  );
  const [tap, setTap] = useState<TapPhase>(savedTap ? "result" : "ready");
  const [sing, setSing] = useState<SingPhase>(savedSing !== null ? "result" : "ready");
  const [tapSaved, setTapSaved] = useState(savedTap !== null);
  const [singSaved, setSingSaved] = useState(savedSing !== null);
  const [click, setClick] = useState(-1);
  const [taps, setTaps] = useState(0);
  const [flash, setFlash] = useState(false);
  const [tapResult, setTapResult] = useState<TapResult | null>(savedTap);
  const [singMs, setSingMs] = useState<number | null>(savedSing);
  const [takes, setTakes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<(TapInput & { tapAt(v: 0 | 1, ts?: number): unknown }) | null>(null);
  const stream = useRef<TapStream | null>(null);
  const stop = useRef<AbortController | null>(null);
  const pad = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const run = useSaveRun();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop.current?.abort();
      input.current?.dispose();
      input.current = null;
      closeInput();
    };
  }, []);

  // The header's progress names the sub-step when there are two.
  useEffect(() => {
    onSub?.(withTap && withSing ? LATENCY_SUBS[sub] : null);
    return () => onSub?.(null);
  }, [sub, withTap, withSing, onSub]);

  const startTaps = async () => {
    setError(null);
    setClick(-1);
    setTaps(0);
    const ctl = new AbortController();
    stop.current = ctl;
    let got = 0;
    try {
      const [{ oak, calibration }, audio] = await Promise.all([voiceAudio(), import("@oak/audio")]);
      await oak.unlock();
      input.current?.dispose();
      const ti = audio.createTapInput(oak.ctx, { latencyMs: 0 });
      input.current = ti;
      const s = createTapStream();
      stream.current = s;
      ti.onTap((t) => {
        s.push(t);
        got++;
        setTaps((n) => n + 1);
        setFlash(true);
        setTimeout(() => setFlash(false), 90);
      });
      ti.arm();
      setTap("tapping");
      requestAnimationFrame(() => pad.current?.focus());
      let r: TapResult;
      try {
        r = await calibration.tapLatency(s, (i) => setClick(i), ctl.signal);
      } catch (e) {
        // Fewer than four taps on clicks: not a fault, a take with too few taps to measure.
        if (!(e instanceof RangeError)) throw e;
        r = { latencyMs: Number.NaN, jitterMs: 0, taps: got };
      }
      s.end();
      ti.disarm();
      if (!alive.current) return;
      // A good measurement is saved before its result shows, so Continue is open when the focus lands on it.
      const saved =
        tapVerdict(r).ok &&
        (await run.save({
          kind: "tap-latency",
          result: { latencyMs: r.latencyMs, jitterMs: r.jitterMs, taps: r.taps, high: r.latencyMs > 120 },
          patch: { tapLatencyMs: Math.round(r.latencyMs), tapJitterMs: Math.round(r.jitterMs * 10) / 10 },
        })) !== null;
      if (!alive.current) return;
      if (saved) setTapSaved(true);
      setTapResult(r);
      setTakes((n) => n + 1);
      setTap("result");
    } catch (e) {
      input.current?.disarm();
      if (!alive.current) return;
      setTap(tapResult ? "result" : "ready");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      stop.current = null;
    }
  };

  const startSing = async () => {
    setError(null);
    setClick(-1);
    const ctl = new AbortController();
    stop.current = ctl;
    setSing("singing");
    try {
      const { oak, calibration } = await voiceAudio();
      await oak.unlock();
      let ms: number;
      try {
        ms = await calibration.singLatency((i) => setClick(i), ctl.signal);
      } catch (e) {
        if (!(e instanceof RangeError)) throw e;
        ms = Number.NaN;
      }
      if (!alive.current) return;
      const saved =
        singLatencyVerdict(ms).ok &&
        (await run.save({
          kind: "sing-latency",
          result: { latencyMs: ms },
          patch: { singLatencyMs: Math.round(ms) },
        })) !== null;
      if (!alive.current) return;
      if (saved) setSingSaved(true);
      setSingMs(ms);
      setTakes((n) => n + 1);
      setSing("result");
    } catch (e) {
      if (!alive.current) return;
      setSing(singMs !== null ? "result" : "ready");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      stop.current = null;
    }
  };

  const stopTake = () => {
    stop.current?.abort();
    stream.current?.end();
  };

  const tv = tapResult ? tapVerdict(tapResult) : null;
  const sv = singMs === null ? null : singLatencyVerdict(singMs);
  const bluetooth = profile.outputKind === "bluetooth";

  // --- the footer of the sub-step on screen ---
  // Quiet mode switched on while singing was next: back to tapping (the mic is never asked for in Quiet mode).
  const onTap = sub === "tap" || (!withSing && only !== "sing");
  const phaseNow = onTap ? tap : sing;
  const shown = phaseNow === "result";
  const savedNow = onTap ? tapSaved : singSaved;
  const goOn = () => {
    setError(null);
    if (onTap && withSing) setSub("sing");
    else onDone();
  };
  // "Set up later": on tapping, the whole step; on singing, just the singing (tapping is measured).
  const skip = onTap ? onSkip : only === "sing" ? onSkip : onDone;

  return (
    <PartFrame
      testId="part-latency"
      context={context}
      title="Timing"
      instruction={
        onTap ? "Press Space on each of the 16 clicks." : "Sing a short 'da' on each of the 8 clicks."
      }
      lead={
        onTap
          ? "Every computer and pair of headphones adds a little delay. Oak measures yours once, so your taps and notes are judged by when you meant them."
          : "Short and steady, right on each click. Any note will do."
      }
    >
      {onTap && (
        <div
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          data-testid="latency-tap"
        >
          <h2 className="text-h3">Tapping</h2>
          <p className="text-sm text-text-2">
            Press <Kbd>Space</Kbd> on each click, or click the pad. Start after the first few if you need to
            find the beat.
          </p>
          <ClickDots
            total={TAP_CLICKS}
            at={tap === "tapping" ? click : tap === "result" ? TAP_CLICKS : -1}
            label="Clicks played"
          />
          {/* A tap pad, not a button: Space must not click it. */}
          <div
            ref={pad}
            role="application"
            aria-label="Tap pad: press Space or click on each click"
            tabIndex={-1}
            data-keyscope="tap"
            data-testid="tap-pad"
            onPointerDown={(e) => {
              if (tap !== "tapping") return;
              e.preventDefault();
              input.current?.tapAt(0, e.timeStamp);
            }}
            className={clsx(
              "flex h-20 select-none items-center justify-center gap-2 rounded-card border-2 border-dashed text-text-2 outline-none",
              tap === "tapping" ? "cursor-pointer border-accent" : "border-border",
              flash && "bg-lane-in",
            )}
          >
            <MousePointerClick aria-hidden className="size-5" />
            {tap === "tapping"
              ? `Tapping… ${taps} so far`
              : tap === "result" && tapResult
                ? `${tapResult.taps} taps`
                : "The pad listens once you start"}
          </div>
        </div>
      )}

      {!onTap && (
        <div
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          data-testid="latency-sing"
        >
          <h2 className="text-h3">Singing</h2>
          <ClickDots
            total={SING_CLICKS}
            at={sing === "singing" ? click : sing === "result" ? SING_CLICKS : -1}
            label="Clicks played"
          />
        </div>
      )}

      {onTap && !withSing && only !== "tap" && (quiet || profile.inputKind === "none") && (
        <p className="text-sm text-text-3">
          Singing timing is measured when the mic is on (Settings › Voice).
        </p>
      )}

      <StatusSlot>
        {onTap && tap === "result" && tv && (
          <Callout tone={tv.ok ? "success" : "attention"} title={tv.title}>
            <span data-testid="tap-result" data-ok={tv.ok ? "1" : "0"}>
              {tv.body}
              {tv.ok && bluetooth && tapResult && tapResult.latencyMs <= 120
                ? " With Bluetooth, Oak judges taps a little more loosely."
                : ""}
              {!tv.ok && tapSaved ? " Your saved timing stays until a new one works." : ""}
            </span>
          </Callout>
        )}
        {!onTap && sing === "result" && sv && (
          <Callout tone={sv.ok ? "success" : "attention"} title={sv.title}>
            <span data-testid="sing-result" data-ok={sv.ok ? "1" : "0"}>
              {sv.body}
              {!sv.ok && singSaved ? " Your saved timing stays until a new one works." : ""}
            </span>
          </Callout>
        )}
        {!onTap && tapResult && tapSaved && (
          <div className="rounded-card border border-border px-3">
            <ResultRow label="Tapping" value={latencyWords(tapResult.latencyMs)} />
            {singSaved && singMs !== null && <ResultRow label="Singing" value={latencyWords(singMs)} />}
          </div>
        )}
        {error && (
          <Callout tone="issue" title="Sound didn't start">
            {error}
          </Callout>
        )}
      </StatusSlot>

      <PartActions
        context={context}
        back={!onTap && withTap ? { label: "Tapping", onBack: () => setSub("tap") } : back}
        onSkip={savedNow ? null : skip}
        running={
          phaseNow === "tapping"
            ? { label: "Measuring…", onStop: stopTake }
            : phaseNow === "singing"
              ? { label: "Listening…", onStop: stopTake }
              : null
        }
        resultKey={shown ? `${sub}-${takes}` : null}
        onRetry={shown ? () => void (onTap ? startTaps() : startSing()) : null}
        {...(onTap ? { retryFocus: () => pad.current } : {})}
        onContinue={shown || savedNow ? goOn : null}
        continueDisabled={!savedNow || !shown}
        continueNote={
          onTap
            ? "Tap a measurement Oak can use to go on, or set it up later."
            : "Sing a measurement Oak can use to go on, or set it up later."
        }
        line={shown && savedNow ? MEASURE_LINE : null}
        action={
          phaseNow === "ready" ? (
            onTap ? (
              <Button variant="primary" onClick={() => void startTaps()} data-testid="tap-start" autoFocus>
                Start tapping
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void startSing()}
                icon={<Mic aria-hidden className="size-4" />}
                data-testid="sing-start"
                autoFocus
              >
                Start singing
              </Button>
            )
          ) : null
        }
      />
    </PartFrame>
  );
}
