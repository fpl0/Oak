// The first sung note (contracts §2.3 U00.L02, §8.1 rule 8; ux §8 `onb.firstSing`): Oak plays the home note,
// the learner sings it back, and any sustained pitch within ±100¢ of it in any octave passes (the one exception to
// the tolerance ladder; `firstSingPasses` from @oak/pitch). On a pass the note is named, calmly: it is 1, home.
import { toLearnerProfile } from "@oak/api";
import type { MicSession } from "@oak/audio";
import { firstSingPasses, type PitchFrame } from "@oak/pitch";
import { Mic, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatNoteMidi } from "../../lib/notes.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { centsWords, firstSingTonic, foldedCents, liveMidi, midiOfHz, voiced } from "../logic.ts";
import { PitchTrace } from "../PitchTrace.tsx";
import { closeInput, openInput, playAt, voiceAudio } from "../services.ts";
import { PartFooter, PartFrame, type PartProps, useSaveRun } from "./common.tsx";

const LISTEN_SEC = 12;
const NOTE_SEC = 1.6;

type Phase = "intro" | "playing" | "listening" | "passed" | "missed";

export function FirstSingPart({ profile, onDone, onSkip }: PartProps) {
  const tonic = firstSingTonic(profile);
  const [phase, setPhase] = useState<Phase>("intro");
  const [now, setNow] = useState<number | null>(null);
  const [cents, setCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frames = useRef<PitchFrame[]>([]);
  const session = useRef<MicSession | null>(null);
  const alive = useRef(true);
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

  const playNote = async (oakAt?: number) => {
    const { oak } = await voiceAudio();
    await oak.unlock();
    playAt(oak, { s: "piano", note: tonic, gain: 0.7 }, oakAt ?? oak.ctx.currentTime + 0.05, NOTE_SEC);
  };

  const attempt = async () => {
    setError(null);
    setCents(null);
    frames.current = [];
    setPhase("playing");
    try {
      await playNote();
      await new Promise((r) => setTimeout(r, NOTE_SEC * 1000 + 200));
      if (!alive.current) return;
      const s = await openInput();
      session.current = s;
      setPhase("listening");
      const off = s.onFrame((f) => frames.current.push(f));
      const t0 = performance.now();
      const passed = await new Promise<boolean>((resolve) => {
        const iv = setInterval(() => {
          if (!alive.current || session.current !== s) {
            clearInterval(iv);
            resolve(false);
            return;
          }
          setNow(liveMidi(frames.current));
          if (firstSingPasses(frames.current, tonic, learner)) {
            clearInterval(iv);
            resolve(true);
          } else if (performance.now() - t0 > LISTEN_SEC * 1000) {
            clearInterval(iv);
            resolve(false);
          }
        }, 200);
      });
      off();
      close();
      if (!alive.current) return;
      if (!passed) {
        setPhase("missed");
        return;
      }
      // The error of the steady part: the voiced frames of the last 0.6 s, folded to the tonic.
      const last = frames.current.at(-1)?.t ?? 0;
      const recent = frames.current.filter((f) => f.t > last - 0.6 && voiced(f)).map((f) => midiOfHz(f.hz));
      const sorted = recent.sort((a, b) => a - b);
      const med = sorted[sorted.length >> 1] ?? tonic;
      const c = Math.round(foldedCents(med, tonic));
      setCents(c);
      setPhase("passed");
      // The resolution: the home chord under the learner's note, softly.
      const { oak } = await voiceAudio();
      const at = oak.ctx.currentTime + 0.1;
      for (const n of [tonic - 12, tonic - 5, tonic + 4, tonic])
        playAt(oak, { s: "piano", note: n, gain: n === tonic ? 0.6 : 0.4 }, at, 2.4);
      await run.save({
        kind: "pitch-match",
        result: { first: true, passed: true, tonicMidi: tonic, centsError: c },
        patch: {},
      });
    } catch (e) {
      close();
      if (!alive.current) return;
      setPhase("intro");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const listening = phase === "listening";
  return (
    <PartFrame
      testId="part-first-sing"
      title="Your first note"
      lead="Oak plays one note. Sing it back on 'ooh' or hum it, in whatever octave is comfortable, and hold it for a moment."
    >
      <PitchTrace
        frames={() => frames.current}
        live={listening}
        lowMidi={tonic - 14}
        highMidi={tonic + 14}
        target={phase === "passed" ? { midi: tonic, cents: 100, hit: true } : null}
        label="Live pitch trace of your voice"
        height={180}
      />
      <div aria-live="polite" className="min-h-6 text-text-2" data-testid="first-sing-status">
        {phase === "playing" && "Listen…"}
        {listening && (now === null ? "Now sing it back." : "Hold it steady…")}
      </div>
      {phase === "passed" && (
        <Callout tone="success" title="That note is 1: home.">
          Everything in Oak is measured from here.
          {cents !== null
            ? ` Oak played ${formatNoteMidi(tonic)}; you were ${centsWords(cents)} (${cents > 0 ? "+" : ""}${cents}¢), counting any octave.`
            : ""}
        </Callout>
      )}
      {phase === "missed" && (
        <Callout tone="attention" title="No steady note yet">
          Listen once more and sing a long "ooh". Any octave counts. If now is not a good time, set it up
          later; nothing is locked without it.
        </Callout>
      )}
      {error && (
        <Callout tone="issue" title="The microphone didn't open">
          {error}
        </Callout>
      )}
      <PartFooter
        onSkip={phase === "passed" || listening || phase === "playing" ? undefined : onSkip}
        primary={
          phase === "passed" ? (
            <Button variant="primary" onClick={onDone} data-testid="part-continue" autoFocus>
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={phase === "playing" || listening}
              onClick={() => void attempt()}
              icon={
                phase === "intro" ? (
                  <Play aria-hidden className="size-4" />
                ) : (
                  <Mic aria-hidden className="size-4" />
                )
              }
              data-testid="first-sing-start"
              autoFocus
            >
              {phase === "intro" ? "Play the note" : "Try again"}
            </Button>
          )
        }
      >
        {phase !== "playing" && !listening && phase !== "intro" && (
          <Button variant="ghost" onClick={() => void playNote()}>
            Hear the note again
          </Button>
        )}
      </PartFooter>
    </PartFrame>
  );
}
