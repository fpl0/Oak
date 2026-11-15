// `voice.match` (ux §4.7, contracts §8.6): three pitch-match trials inside the comfort zone. Oak plays a note, the
// learner sings it back; each trial is judged by the one rule for a sung note (`gradeSung`, ±50¢, any octave) and
// shown in words and arrows, never red or green. The result is stored as a `pitch-match` calibration run; it
// informs, it never gates (every learner starts the ladder at ±70¢, contracts §8.2). The three notes can be sung
// again after any result (docs/design/retry.md §5 row 23); Stop ends a run without keeping it.
import { toLearnerProfile } from "@oak/api";
import type { MicSession } from "@oak/audio";
import { MicError } from "@oak/audio";
import type { SingTolerance } from "@oak/content-kit";
import { gradeSung, type PitchFrame } from "@oak/pitch";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatNoteMidi } from "../../lib/notes.ts";
import { MEASURE_LINE } from "../../lib/retry.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import {
  MATCH_CENTS,
  MATCH_SING_SEC,
  type MatchTrial,
  matchTargets,
  matchVerdict,
  matchWords,
} from "../logic.ts";
import { PitchTrace } from "../PitchTrace.tsx";
import { RecheckHint } from "../panels.tsx";
import { reportTake } from "../recheck.ts";
import { closeInput, openInput, playAt, voiceAudio } from "../services.ts";
import { PartActions, PartFrame, type PartProps, StatusSlot, useSaveRun } from "./common.tsx";

const NOTE_SEC = 1.3;
const MATCH_TOL: SingTolerance = {
  cents: MATCH_CENTS,
  octave: "per-note",
  driftCompCents: 0,
  minCoverage: 0.4,
  passHitRate: 1,
};

type Phase = "intro" | "playing" | "listening" | "between" | "done" | "bleed" | "error";

class Stopped extends Error {}

export function PitchMatchPart({ profile, onDone, onSkip, context, back }: PartProps) {
  const targets = matchTargets(profile);
  const [phase, setPhase] = useState<Phase>("intro");
  const [trial, setTrial] = useState(0);
  const [trials, setTrials] = useState<MatchTrial[]>([]);
  const [error, setError] = useState<string | null>(null);
  const frames = useRef<PitchFrame[]>([]);
  const session = useRef<MicSession | null>(null);
  const alive = useRef(true);
  const stopped = useRef(false);
  const [runs, setRuns] = useState(0);
  const [savedOnce, setSavedOnce] = useState(false);
  const run = useSaveRun();
  const learner = toLearnerProfile(profile);

  const close = () => {
    session.current?.close();
    session.current = null;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      close();
      closeInput();
    };
  }, []);

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /**
   * One trial: the mic opens, the note plays (a playback-only span: the learner listens), then the learner sings
   * for MATCH_SING_SEC; graded by the one rule. A mic that heard the note itself (contracts §8.6) makes the trial
   * `bleed` instead of a pitch: speakers or leaky headphones would otherwise sing back for the learner.
   */
  const one = async (midi: number): Promise<MatchTrial> => {
    const { oak } = await voiceAudio();
    await oak.unlock();
    frames.current = [];
    const s = await openInput();
    session.current = s;
    const off = s.onFrame((f) => frames.current.push(f));
    setPhase("playing");
    const noteAt = oak.ctx.currentTime + 0.05;
    playAt(oak, { s: "piano", note: midi, gain: 0.7 }, noteAt, NOTE_SEC);
    await wait(NOTE_SEC * 1000 + 150);
    if (stopped.current) throw new Stopped();
    if (!alive.current) return { midi, cents: null };
    const from = oak.ctx.currentTime;
    const window = { midi, on: from + 0.15, off: from + MATCH_SING_SEC - 0.1 };
    s.singing?.({ on: from, off: from + MATCH_SING_SEC });
    setPhase("listening");
    await wait(MATCH_SING_SEC * 1000);
    off();
    close();
    if (stopped.current) throw new Stopped();
    const r = gradeSung(frames.current, [window], MATCH_TOL, "pitch", learner);
    reportTake({ diagnostics: r.diagnostics, frames: frames.current, floorDb: profile.noiseFloorDb });
    if (r.diagnostics.some((d) => d.id === "sing.bleed")) return { midi, cents: null, bleed: true };
    const note = r.notes[0];
    const cents = note && note.cents !== null && note.coverage >= MATCH_TOL.minCoverage ? note.cents : null;
    return { midi, cents: cents === null ? null : Math.round(cents) };
  };

  const start = async () => {
    setError(null);
    stopped.current = false;
    const before = phase;
    const kept = trials;
    setTrials([]);
    const got: MatchTrial[] = [];
    try {
      for (let i = 0; i < targets.length; i++) {
        setTrial(i);
        const t = await one(targets[i] as number);
        if (!alive.current) return;
        got.push(t);
        setTrials([...got]);
        if (t.bleed) {
          // Nothing is saved from a run the playback spoke over: the hint offers the fallback.
          setRuns((n) => n + 1);
          setPhase("bleed");
          return;
        }
        if (i < targets.length - 1) {
          setPhase("between");
          await wait(900);
        }
      }
      setRuns((n) => n + 1);
      setPhase("done");
      const verdict = matchVerdict(got);
      const ok = await run.save({
        kind: "pitch-match",
        result: { trials: got, within: verdict.within, windowCents: MATCH_CENTS },
        patch: {},
      });
      if (ok) setSavedOnce(true);
    } catch (e) {
      close();
      if (!alive.current) return;
      if (e instanceof Stopped) {
        // Stop: nothing from this run is kept; the screen goes back to where it was.
        setTrials(kept);
        setPhase(before === "done" || before === "bleed" || before === "error" ? before : "intro");
        return;
      }
      setRuns((n) => n + 1);
      setPhase("error");
      setError(
        e instanceof MicError && e.reason === "denied"
          ? "The browser refused the microphone. Allow it from the icon left of the address bar, or set this up later."
          : e instanceof Error
            ? e.message
            : String(e),
      );
    }
  };

  const busy = phase === "playing" || phase === "listening" || phase === "between";
  const shown = phase === "done" || phase === "bleed" || phase === "error";
  const verdict = phase === "done" ? matchVerdict(trials) : null;
  const current = targets[trial] as number;
  return (
    <PartFrame
      testId="part-match"
      context={context}
      title="Match three notes"
      instruction="Sing each note straight back after Oak plays it, and hold it."
      lead="Sing on 'ooh', in whatever octave is comfortable. Three notes, about twenty seconds."
    >
      <PitchTrace
        frames={() => frames.current}
        live={phase === "listening"}
        lowMidi={Math.min(...targets) - 8}
        highMidi={Math.max(...targets) + 8}
        target={busy ? { midi: current, cents: MATCH_CENTS } : null}
        label="Live pitch trace of your voice"
        height={160}
      />
      <div aria-live="polite" className="min-h-6 text-text-2" data-testid="match-status">
        {phase === "playing" && `Note ${trial + 1} of 3: listen…`}
        {phase === "listening" && `Note ${trial + 1} of 3: now sing it back.`}
        {phase === "between" && "Next note…"}
        {phase === "bleed" && `Stopped at note ${trial + 1}: the mic heard Oak's note, not you.`}
      </div>
      {trials.length > 0 && (
        <ol className="flex flex-col rounded-card border border-border px-3" data-testid="match-trials">
          {trials.map((t, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0"
            >
              <span className="text-text-2">
                Note {i + 1} · {formatNoteMidi(t.midi)}
              </span>
              <span className="font-medium tabular-nums">{matchWords(t.cents, t.bleed === true)}</span>
            </li>
          ))}
        </ol>
      )}
      <StatusSlot>
        {verdict && (
          <Callout tone={verdict.within >= 2 ? "success" : "info"} title={verdict.title}>
            <span data-testid="match-verdict">{verdict.body}</span>
          </Callout>
        )}
        {phase === "bleed" && <RecheckHint />}
        {error && (
          <Callout tone="issue" title="The microphone didn't open">
            {error}
          </Callout>
        )}
      </StatusSlot>
      <PartActions
        context={context}
        back={back}
        onSkip={phase === "done" ? null : onSkip}
        running={
          busy
            ? {
                label: "Listening…",
                onStop: () => {
                  stopped.current = true;
                },
              }
            : null
        }
        resultKey={shown ? `${phase}-${runs}` : null}
        onRetry={shown ? () => void start() : null}
        onContinue={shown ? onDone : null}
        continueDisabled={phase !== "done" && !savedOnce}
        continueNote="Sing the three notes to go on, or set it up later."
        line={phase === "done" && savedOnce ? MEASURE_LINE : null}
        action={
          phase === "intro" ? (
            <Button
              variant="primary"
              onClick={() => void start()}
              icon={<Play aria-hidden className="size-4" />}
              data-testid="match-start"
              autoFocus
            >
              Start the three notes
            </Button>
          ) : null
        }
      />
    </PartFrame>
  );
}
