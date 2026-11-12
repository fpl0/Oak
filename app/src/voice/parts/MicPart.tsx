// `mic.permission`, `mic.noise`, `mic.bleed` (ux §4.7, contracts §8.5–§8.6). Why Oak wants the mic and what it
// does with it, then permission, a live level and note readout ("Hum anything"), a three-second quiet check and
// the bleed test. Continuing without a mic (Quiet mode) is a first-class choice at the start and whenever the
// browser refuses. The mic is open only while a phase needs it; the shell's "Mic live" dot follows the stream.
import type { InputKind, MicSession } from "@oak/audio";
import { MicError } from "@oak/audio";
import type { PitchFrame } from "@oak/pitch";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useUpdateProfile } from "../../lib/settings.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Progress } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { Select } from "../../ui/kit/Field.tsx";
import { dbToLevel, MicLevelMeter } from "../../ui/kit/Meters.tsx";
import { bleedVerdict, liveMidi, noiseVerdict, noteReadout } from "../logic.ts";
import {
  closeInput,
  inputDevice,
  listInputs,
  micPermission,
  openInput,
  setInputDevice,
  voiceAudio,
} from "../services.ts";
import { PartFooter, PartFrame, type PartProps, ResultRow, useSaveRun } from "./common.tsx";

export const PRIVACY_LINE = "Your voice is analysed live on this computer. Nothing is recorded or sent.";

type Phase =
  | "ask"
  | "opening"
  | "denied"
  | "no-device"
  | "hear"
  | "noise"
  | "noise-measuring"
  | "noise-done"
  | "bleed"
  | "bleed-measuring"
  | "bleed-done";

export interface MicPartProps extends PartProps {
  /** Quiet mode chosen (no mic, or the browser refused): the caller records it and moves on. */
  onQuiet?: () => void;
  /**
   * Run one measurement only (Settings, a lesson's `<Setup part="noise" />`). `"mic"`: open the mic and hear the
   * learner, then stop; a lesson's `<Setup part="mic" />` is followed by its own noise and bleed parts.
   */
  only?: "mic" | "noise" | "bleed";
}

const SIGNAL_DB = -50;

export function MicPart({ profile, onDone, onQuiet, only, context }: MicPartProps) {
  const [phase, setPhase] = useState<Phase>(only === "noise" || only === "bleed" ? only : "ask");
  const [level, setLevel] = useState(0);
  const [note, setNote] = useState<number | null>(null);
  const [heard, setHeard] = useState(false);
  const [inputs, setInputs] = useState<{ deviceId: string; label: string }[]>([]);
  const [device, setDevice] = useState<string | null>(inputDevice() ?? profile.inputDeviceId);
  const [inputKind, setInputKind] = useState<InputKind>(
    profile.inputKind === "none" ? "builtin" : profile.inputKind,
  );
  const [floorDb, setFloorDb] = useState<number | null>(null);
  const [bleed, setBleed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceInQuiet, setVoiceInQuiet] = useState(false);
  const [progress, setProgress] = useState(0);
  const session = useRef<MicSession | null>(null);
  const run = useSaveRun();
  const profileUpdate = useUpdateProfile();

  const stopLive = () => {
    session.current?.close();
    session.current = null;
  };
  // Leaving the screen closes the mic, whatever phase it was in.
  useEffect(
    () => () => {
      stopLive();
      closeInput();
    },
    [],
  );

  const startLive = async (id: string | null) => {
    stopLive();
    setError(null);
    setPhase("opening");
    try {
      const { calibration } = await voiceAudio();
      // AirPods mode: with Bluetooth output Oak listens on the built-in mic (contracts §8.6).
      const report = await calibration.devices().catch(() => null);
      let chosen = id;
      if (report?.bluetoothOutput && report.inputDeviceId && id === null) chosen = report.inputDeviceId;
      setInputDevice(chosen);
      const s = await openInput();
      session.current = s;
      setDevice(s.deviceId ?? chosen);
      const after = await calibration.devices().catch(() => null);
      if (after) setInputKind(after.inputKind === "none" ? "builtin" : after.inputKind);
      setInputs(await listInputs());
      setPhase("hear");
    } catch (e) {
      // Some refusals arrive as "no device": the browser's own permission state tells them apart.
      const refused =
        (e instanceof MicError && e.reason === "denied") || (await micPermission()) === "denied";
      if (refused) setPhase("denied");
      else if (e instanceof MicError && e.reason === "no-device") setPhase("no-device");
      else {
        setPhase("ask");
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  // The live meter and note while the "hear" phase has a stream.
  useEffect(() => {
    if (phase !== "hear") return;
    let raf = 0;
    let loudSince: number | null = null;
    const tick = () => {
      const s = session.current;
      if (s) {
        const db = s.levelDb();
        setLevel(dbToLevel(db));
        const frames: PitchFrame[] = s.frames();
        setNote(liveMidi(frames));
        const now = performance.now();
        if (db > SIGNAL_DB) {
          loudSince ??= now;
          if (now - loudSince > 300) setHeard(true);
        } else loudSince = null;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const measure = async (seconds: number, body: () => Promise<void>) => {
    setError(null);
    setProgress(0);
    const t0 = performance.now();
    const iv = setInterval(() => setProgress(Math.min(1, (performance.now() - t0) / (seconds * 1000))), 100);
    try {
      await body();
    } finally {
      clearInterval(iv);
      setProgress(1);
    }
  };

  const noise = async () => {
    stopLive();
    setPhase("noise-measuring");
    await measure(3.2, async () => {
      try {
        const { calibration } = await voiceAudio();
        const check = await calibration.noiseCheck();
        // Someone humming or talking through the check would set the floor at their own voice and later
        // takes would hear "no voice": say so and measure again rather than storing it.
        if (check.voiced) {
          setFloorDb(null);
          setVoiceInQuiet(true);
          setPhase("noise");
          return;
        }
        setVoiceInQuiet(false);
        const db = check.floorDb;
        setFloorDb(db);
        const saved = await run.save({
          kind: "noise",
          result: { floorDb: db, ok: noiseVerdict(db).ok, deviceId: device },
          patch: { noiseFloorDb: Math.round(db * 10) / 10, inputKind, inputDeviceId: device, quiet: false },
        });
        setPhase(saved ? "noise-done" : "noise");
      } catch (e) {
        setPhase(e instanceof MicError && e.reason === "denied" ? "denied" : "noise");
        if (!(e instanceof MicError)) setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const bleedTest = async () => {
    setPhase("bleed-measuring");
    await measure(2.8, async () => {
      try {
        const { oak, calibration } = await voiceAudio();
        await oak.unlock();
        const got = await calibration.bleedTest();
        setBleed(got);
        const saved = await run.save({
          kind: "bleed",
          result: { heard: got, outputKind: profile.outputKind },
          patch: {},
        });
        setPhase(saved ? "bleed-done" : "bleed");
      } catch (e) {
        setPhase(e instanceof MicError && e.reason === "denied" ? "denied" : "bleed");
        if (!(e instanceof MicError)) setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const goQuiet = () => {
    stopLive();
    closeInput();
    profileUpdate.set({
      quiet: true,
      ...(phase === "no-device" || phase === "denied" || phase === "ask"
        ? { inputKind: "none" as const }
        : {}),
    });
    onQuiet?.();
  };

  const quietButton = onQuiet ? (
    <Button onClick={goQuiet} icon={<MicOff aria-hidden className="size-4" />} data-testid="mic-quiet">
      Continue without a mic
    </Button>
  ) : null;

  const nv = floorDb === null ? null : noiseVerdict(floorDb);
  const bv = bleed === null ? null : bleedVerdict(bleed);

  return (
    <PartFrame
      testId="part-mic"
      title={only === "noise" ? "Quiet check" : only === "bleed" ? "Bleed check" : "Microphone"}
      lead={
        // In a lesson a single measurement (noise, bleed) sits under the mic part that already said this;
        // repeating it made U00.L02's step 2 three copies of the same two paragraphs.
        context === "lesson" && (only === "noise" || only === "bleed") ? null : (
          <>
            <p>
              Oak listens when you sing a note back or hum an idea, and only then. The mic opens for those
              steps and closes after; a red dot in the top bar shows whenever it is open.
            </p>
            <p className="mt-2 font-medium text-text" data-testid="privacy-line">
              {PRIVACY_LINE}
            </p>
          </>
        )
      }
    >
      {phase === "ask" && (
        <div className="flex flex-col gap-3">
          <Callout tone="info" title="No mic, or not today?">
            Quiet mode is a full way through Oak: singing steps become listening steps, and nothing is locked.
            You can switch the mic on later in Settings › Voice.
          </Callout>
          {error && (
            <Callout tone="issue" title="The microphone didn't open">
              {error}
            </Callout>
          )}
          <PartFooter
            primary={
              <Button
                variant="primary"
                onClick={() => void startLive(device)}
                icon={<Mic aria-hidden className="size-4" />}
                data-testid="mic-allow"
                autoFocus
              >
                Allow the microphone
              </Button>
            }
          >
            {quietButton}
          </PartFooter>
        </div>
      )}

      {phase === "opening" && (
        <p className="text-text-2" aria-live="polite">
          Asking the browser for the microphone…
        </p>
      )}

      {phase === "denied" && (
        <div className="flex flex-col gap-3" data-testid="mic-denied">
          <Callout tone="attention" title="The browser said no to the microphone">
            That's fine. To allow it later, click the icon left of the address bar, set Microphone to Allow,
            then try again. Or carry on in Quiet mode: nothing in the course needs the mic.
          </Callout>
          <PartFooter primary={quietButton}>
            <Button onClick={() => void startLive(device)} data-testid="mic-retry">
              Try again
            </Button>
          </PartFooter>
        </div>
      )}

      {phase === "no-device" && (
        <div className="flex flex-col gap-3" data-testid="mic-none">
          <Callout tone="attention" title="No microphone found">
            Plug one in and try again, or carry on in Quiet mode. Settings › Voice can set it up any time.
          </Callout>
          <PartFooter primary={quietButton}>
            <Button onClick={() => void startLive(null)}>Try again</Button>
          </PartFooter>
        </div>
      )}

      {phase === "hear" && (
        <div className="flex flex-col gap-4" data-testid="mic-live">
          {inputs.length > 1 && (
            <div className="flex flex-col gap-1.5 text-sm">
              <label htmlFor="mic-device" className="font-medium">
                Microphone
              </label>
              <Select<string>
                id="mic-device"
                value={device ?? inputs[0]?.deviceId ?? ""}
                options={inputs.map((d) => ({ value: d.deviceId, label: d.label }))}
                onChange={(id) => void startLive(id)}
              />
            </div>
          )}
          <MicLevelMeter level={level} live label="Microphone level" />
          <div className="flex items-baseline gap-3">
            <span className="text-text-2">Hum anything:</span>
            <span className="font-display text-h2 tabular-nums" aria-live="polite" data-testid="mic-note">
              {noteReadout(note)}
            </span>
          </div>
          {heard ? (
            <Callout tone="success" title="Oak can hear you." />
          ) : (
            <p className="text-sm text-text-3">Waiting for a sound. Hum, or say a few words.</p>
          )}
          <PartFooter
            primary={
              <Button
                variant="primary"
                disabled={!heard}
                onClick={() => (only === "mic" ? onDone() : setPhase("noise"))}
                data-testid="part-continue"
              >
                {only === "mic" ? "Done" : "Next: a quiet moment"}
              </Button>
            }
          >
            {quietButton}
          </PartFooter>
        </div>
      )}

      {(phase === "noise" || phase === "noise-measuring" || phase === "noise-done") && (
        <div
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          data-testid="mic-noise"
        >
          <h3 className="text-h3">Stay quiet for three seconds</h3>
          <p className="text-sm text-text-2">
            Oak measures the room so it can tell your voice from the hum around you.
          </p>
          {phase === "noise-measuring" && <Progress value={progress} label="Measuring the room" />}
          {phase === "noise" && voiceInQuiet && (
            <Callout tone="attention" title="Oak heard a voice during the quiet check">
              <span data-testid="noise-voice">
                Humming or talking would be measured as the room, and Oak would then miss your singing. Stay
                silent for three seconds and measure again.
              </span>
            </Callout>
          )}
          {nv && phase === "noise-done" && (
            <Callout tone={nv.ok ? "success" : "attention"} title={nv.title}>
              {nv.body}
            </Callout>
          )}
          {error && (
            <Callout tone="issue" title="That didn't work">
              {error}
            </Callout>
          )}
          <PartFooter
            primary={
              phase === "noise-done" ? (
                only === "noise" ? (
                  <Button variant="primary" onClick={onDone} data-testid="part-continue">
                    Done
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => setPhase("bleed")}
                    data-testid="part-continue"
                    autoFocus
                  >
                    Next: the bleed check
                  </Button>
                )
              ) : (
                <Button
                  variant="primary"
                  loading={phase === "noise-measuring"}
                  onClick={() => void noise()}
                  data-testid="noise-start"
                  autoFocus
                >
                  {voiceInQuiet ? "Measure again" : "Start the quiet check"}
                </Button>
              )
            }
          >
            {phase === "noise-done" && nv && !nv.ok && (
              <Button onClick={() => void noise()} data-testid="noise-again">
                Measure again
              </Button>
            )}
          </PartFooter>
        </div>
      )}

      {(phase === "bleed" || phase === "bleed-measuring" || phase === "bleed-done") && (
        <div
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          data-testid="mic-bleed"
        >
          <h3 className="text-h3">Can the mic hear the speakers?</h3>
          <p className="text-sm text-text-2">
            Oak plays three short high tones at practice volume and listens. Stay quiet for a moment.
          </p>
          {phase === "bleed-measuring" && <Progress value={progress} label="Playing the test tones" />}
          {bv && phase === "bleed-done" && (
            <Callout tone={bv.ok ? "success" : "attention"} title={bv.title}>
              {bv.body}
            </Callout>
          )}
          {error && (
            <Callout tone="issue" title="That didn't work">
              {error}
            </Callout>
          )}
          {phase === "bleed-done" && floorDb !== null && (
            <div className="rounded-card border border-border px-3">
              <ResultRow label="Noise floor" value={`${Math.round(floorDb)} dBFS`} />
              <ResultRow label="Bleed" value={bleed ? "Heard the speakers" : "None"} />
            </div>
          )}
          <PartFooter
            primary={
              phase === "bleed-done" ? (
                <Button variant="primary" onClick={onDone} data-testid="part-continue" autoFocus>
                  Continue
                </Button>
              ) : (
                <Button
                  variant="primary"
                  loading={phase === "bleed-measuring"}
                  onClick={() => void bleedTest()}
                  icon={<Volume2 aria-hidden className="size-4" />}
                  data-testid="bleed-start"
                  autoFocus
                >
                  Play the test tones
                </Button>
              )
            }
          />
        </div>
      )}
    </PartFrame>
  );
}
