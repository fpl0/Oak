// `latency.tap` and `latency.sing` (ux §4.7, contracts §8.4, §8.6): tap along to 16 clicks (Space, or the pad
// with a pointer), then sing "da" on 8 clicks. Stores the median offsets (and the tap jitter, which widens the
// tap window when it is large). The sing half needs the mic and is left out in Quiet mode.
import type { TapInput } from "@oak/audio";
import { clsx } from "clsx";
import { Mic, MousePointerClick } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/kit/Button.tsx";
import { Kbd } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { singLatencyVerdict, tapVerdict } from "../logic.ts";
import { closeInput, voiceAudio } from "../services.ts";
import { createTapStream } from "../tap-stream.ts";
import { PartFooter, PartFrame, type PartProps, ResultRow, useSaveRun } from "./common.tsx";

const TAP_CLICKS = 16;
const SING_CLICKS = 8;

type TapPhase = "intro" | "tapping" | "done" | "retry";
type SingPhase = "intro" | "singing" | "done" | "retry";

export interface LatencyPartProps extends PartProps {
  only?: "tap" | "sing";
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

export function LatencyPart({ profile, onDone, onSkip, only }: LatencyPartProps) {
  const withSing = only !== "tap" && !profile.quiet && profile.inputKind !== "none";
  const withTap = only !== "sing";
  const [tap, setTap] = useState<TapPhase>("intro");
  const [sing, setSing] = useState<SingPhase>("intro");
  const [click, setClick] = useState(-1);
  const [taps, setTaps] = useState(0);
  const [flash, setFlash] = useState(false);
  const [tapResult, setTapResult] = useState<{ latencyMs: number; jitterMs: number; taps: number } | null>(
    null,
  );
  const [singMs, setSingMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<(TapInput & { tapAt(v: 0 | 1, ts?: number): unknown }) | null>(null);
  const pad = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const run = useSaveRun();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      input.current?.dispose();
      input.current = null;
      closeInput();
    };
  }, []);

  const startTaps = async () => {
    setError(null);
    setClick(-1);
    setTaps(0);
    try {
      const [{ oak, calibration }, audio] = await Promise.all([voiceAudio(), import("@oak/audio")]);
      await oak.unlock();
      input.current?.dispose();
      const ti = audio.createTapInput(oak.ctx, { latencyMs: 0 });
      input.current = ti;
      const stream = createTapStream();
      ti.onTap((t) => {
        stream.push(t);
        setTaps((n) => n + 1);
        setFlash(true);
        setTimeout(() => setFlash(false), 90);
      });
      ti.arm();
      setTap("tapping");
      pad.current?.focus();
      const r = await calibration.tapLatency(stream, (i) => setClick(i));
      stream.end();
      ti.disarm();
      if (!alive.current) return;
      setTapResult(r);
      const v = tapVerdict(r);
      if (!v.ok) {
        setTap("retry");
        return;
      }
      const saved = await run.save({
        kind: "tap-latency",
        result: { latencyMs: r.latencyMs, jitterMs: r.jitterMs, taps: r.taps, high: r.high },
        patch: { tapLatencyMs: Math.round(r.latencyMs), tapJitterMs: Math.round(r.jitterMs * 10) / 10 },
      });
      setTap(saved ? "done" : "retry");
    } catch (e) {
      setTap("intro");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const startSing = async () => {
    setError(null);
    setClick(-1);
    setSing("singing");
    try {
      const { oak, calibration } = await voiceAudio();
      await oak.unlock();
      const ms = await calibration.singLatency((i) => setClick(i));
      if (!alive.current) return;
      setSingMs(ms);
      if (!singLatencyVerdict(ms).ok) {
        setSing("retry");
        return;
      }
      const saved = await run.save({
        kind: "sing-latency",
        result: { latencyMs: ms },
        patch: { singLatencyMs: Math.round(ms) },
      });
      setSing(saved ? "done" : "retry");
    } catch (e) {
      setSing("intro");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const tv = tapResult ? tapVerdict(tapResult) : null;
  const sv = singMs === null ? null : singLatencyVerdict(singMs);
  const tapDone = !withTap || tap === "done";
  const singDone = !withSing || sing === "done";
  const busy = tap === "tapping" || sing === "singing";

  return (
    <PartFrame
      testId="part-latency"
      title="Timing"
      lead="Every computer and pair of headphones adds a little delay. Oak measures yours once, so your taps and notes are judged by when you meant them."
    >
      {withTap && (
        <div
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          data-testid="latency-tap"
        >
          <h3 className="text-h3">Tap along with 16 clicks</h3>
          <p className="text-sm text-text-2">
            Press <Kbd>Space</Kbd> on each click, or click the pad. Start after the first few if you need to
            find the beat.
          </p>
          <ClickDots
            total={TAP_CLICKS}
            at={tap === "tapping" ? click : tap === "done" ? TAP_CLICKS : -1}
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
              "flex h-24 select-none items-center justify-center gap-2 rounded-card border-2 border-dashed text-text-2 outline-none",
              tap === "tapping" ? "cursor-pointer border-accent" : "border-border",
              flash && "bg-lane-in",
            )}
          >
            <MousePointerClick aria-hidden className="size-5" />
            {tap === "tapping"
              ? `Tapping… ${taps} so far`
              : tap === "done"
                ? `${taps} taps`
                : "The pad listens once you start"}
          </div>
          {tv && (tap === "done" || tap === "retry") && (
            <Callout tone={tv.ok ? "success" : "attention"} title={tv.title}>
              {tv.body}
            </Callout>
          )}
          {tap !== "done" && (
            <div>
              <Button
                variant="primary"
                loading={tap === "tapping"}
                disabled={sing === "singing"}
                onClick={() => void startTaps()}
                data-testid="tap-start"
                autoFocus
              >
                {tap === "intro" ? "Start the clicks" : "Try again"}
              </Button>
            </div>
          )}
        </div>
      )}

      {withSing && tapDone && (
        <div
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          data-testid="latency-sing"
        >
          <h3 className="text-h3">Sing "da" on 8 clicks</h3>
          <p className="text-sm text-text-2">Short and steady, right on each click. Any note will do.</p>
          <ClickDots
            total={SING_CLICKS}
            at={sing === "singing" ? click : sing === "done" ? SING_CLICKS : -1}
            label="Clicks played"
          />
          {sv && (sing === "done" || sing === "retry") && (
            <Callout tone={sv.ok ? "success" : "attention"} title={sv.title}>
              {sv.body}
            </Callout>
          )}
          {sing !== "done" && (
            <div>
              <Button
                variant="primary"
                loading={sing === "singing"}
                onClick={() => void startSing()}
                icon={<Mic aria-hidden className="size-4" />}
                data-testid="sing-start"
                autoFocus
              >
                {sing === "intro" ? "Start the clicks" : "Try again"}
              </Button>
            </div>
          )}
        </div>
      )}

      {!withSing && only !== "tap" && (profile.quiet || profile.inputKind === "none") && (
        <p className="text-sm text-text-3">
          Singing timing is measured when the mic is on (Settings › Voice).
        </p>
      )}

      {error && (
        <Callout tone="issue" title="Sound didn't start">
          {error}
        </Callout>
      )}

      {tapDone && singDone && (tapResult || singMs !== null) && (
        <div className="rounded-card border border-border px-3">
          {tapResult && tap === "done" && (
            <ResultRow label="Tap latency" value={`${Math.round(tapResult.latencyMs)} ms`} />
          )}
          {singMs !== null && sing === "done" && (
            <ResultRow label="Sing latency" value={`${Math.round(singMs)} ms`} />
          )}
        </div>
      )}

      <PartFooter
        onSkip={busy ? undefined : onSkip}
        primary={
          <Button
            variant="primary"
            disabled={!(tapDone && singDone)}
            onClick={onDone}
            data-testid="part-continue"
          >
            Continue
          </Button>
        }
      >
        {withSing && tapDone && sing !== "done" && !busy && (
          <Button variant="ghost" onClick={() => setSing("done")} data-testid="sing-later">
            Measure singing later
          </Button>
        )}
      </PartFooter>
    </PartFrame>
  );
}
