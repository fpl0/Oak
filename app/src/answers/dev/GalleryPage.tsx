// The answer widget gallery: every widget live (with a stand-in host that checks against the fixture's answer)
// and in every state: idle, pending, correct, wrong, revealed. `?only=<fixture id>` shows one widget (the
// Playwright specs screenshot each that way); `?state=` limits the state strip.
import type { LintContext, UnlockableId } from "@oak/content-kit";
import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { auditionCode } from "../../lib/audition.ts";
import { loadContent } from "../../lib/content.ts";
import { graderHost } from "../../lib/grader-client.ts";
import { Button, Card, Chip, SegmentedControl } from "../../ui/kit/index.ts";
import { usePrefs } from "../../ui/theme/prefs.ts";
import { buildModel, type WorkbenchModel } from "../../workbench/model.ts";
import { type AnswerEnv, AnswerEnvProvider, appAudio, NEUTRAL_PROFILE, type QuietEvidence } from "../env.tsx";
import { AnswerView } from "../registry.tsx";
import { singFeedback, targetLabel } from "../sing.ts";
import { tapReport } from "../tap.ts";
import type { AnswerFeedback, AnswerValue } from "../types.ts";
import { useThemeName } from "../ui.tsx";
import {
  demoCheck,
  FIXTURES,
  type Fixture,
  type GalleryState,
  MELODY_CODE,
  STATES,
  stateOf,
  tapDemo,
} from "./fixtures.ts";
import { StagedSection } from "./StagedGallery.tsx";

const STATE_LABEL: Record<GalleryState, string> = {
  idle: "Idle",
  pending: "Checking",
  correct: "Correct",
  wrong: "Wrong",
  revealed: "Revealed",
};

/** The analysed melody for the staff and roll picks (the app's own grader host, as the workbench does). */
function useMelodyModel(): { model: WorkbenchModel | null; error: string | null } {
  const [state, setState] = useState<{ model: WorkbenchModel | null; error: string | null }>({
    model: null,
    error: null,
  });
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [content, grader] = await Promise.all([loadContent(), graderHost()]);
        const lint: LintContext = {
          profile: "studio",
          unlocked: new Set(content.toolbox.map((t) => t.id as UnlockableId)),
          allowPreview: true,
          meter: "4/4",
          key: { tonic: "C", mode: "major" },
        };
        const result = await grader.analyze(MELODY_CODE, { mode: "lesson", bars: 1, lint, meter: "4/4" });
        const out = buildModel(MELODY_CODE, result, {
          meter: "4/4",
          key: { tonic: "C", mode: "major" },
          staff: "auto",
        });
        if (live)
          setState(out.ok ? { model: out.model, error: null } : { model: null, error: out.error.message });
      } catch (e) {
        if (live) setState({ model: null, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return state;
}

const audition = (code: string) => auditionCode(code, 2);

function LiveWidget({ f, env }: { f: Fixture; env: AnswerEnv }) {
  const [value, setValue] = useState<AnswerValue>(() => stateOf(f, "idle").value);
  const [feedback, setFeedback] = useState<AnswerFeedback>({ state: "idle" });
  const [tries, setTries] = useState(0);
  const [take, setTake] = useState<AnswerFeedback | null>(null);
  const [quiet, setQuiet] = useState<QuietEvidence | null>(null);
  const passed = feedback.state === "correct";
  // Taps and sung notes are graded from the take (tapReport / gradeSung); the rest by the demo host.
  const liveEnv: AnswerEnv = { ...env };
  if (env.tap) {
    const { startAt: _stored, ...tap } = env.tap;
    liveEnv.tap = {
      ...tap,
      onTake: (t) => {
        const demo = tapDemo(tap, t.startAt);
        setTake(tapReport(t.taps, demo.targets, env.profile ?? NEUTRAL_PROFILE, demo.options).feedback);
      },
    };
  }
  if (env.sing) {
    const sing = env.sing;
    const labels = sing.notes.map((n) => targetLabel(n, sing.labels ?? "numbers"));
    liveEnv.sing = {
      ...sing,
      onTake: (t) => setTake(singFeedback(t.result, labels)),
      onQuietEvidence: setQuiet,
    };
  }
  const check = () => {
    if (passed || feedback.state === "pending") return;
    setFeedback({ state: "pending" });
    setTries((n) => n + 1);
    setTimeout(() => setFeedback(take ?? demoCheck(f, value)), 250);
  };
  const reset = () => {
    setValue(stateOf(f, "idle").value);
    setFeedback({ state: "idle" });
    setTake(null);
    setQuiet(null);
    setTries(0);
  };
  return (
    <div className="flex flex-col gap-3" data-live={f.id}>
      <AnswerEnvProvider value={liveEnv}>
        <AnswerView
          spec={f.spec}
          value={value}
          onChange={(v) => {
            setValue(v);
            if (feedback.state === "wrong") setFeedback({ state: "idle" });
          }}
          onSubmit={check}
          disabled={feedback.state === "pending" || passed}
          feedback={feedback}
          label={`${f.prompt} Your answer`}
          idBase={`live-${f.id}`}
          audition={audition}
        />
      </AnswerEnvProvider>
      <div className="flex flex-wrap items-center gap-2 text-sm text-text-2">
        <Button variant="primary" onClick={check} disabled={passed || feedback.state === "pending"}>
          Check
        </Button>
        <Button onClick={reset}>Reset</Button>
        {tries > 0 ? <span>{tries === 1 ? "1 check" : `${tries} checks`}</span> : null}
        {quiet ? (
          <span data-testid="quiet-evidence" data-modality={quiet.modality}>
            The host received {quiet.modality} evidence (
            {quiet.selfCheck === "heard-it" ? "heard it" : "not sure"}), no voice.
          </span>
        ) : null}
      </div>
    </div>
  );
}

const WIDE = new Set([
  "staff-input",
  "keyboard",
  "grid",
  "tap",
  "mic",
  "order",
  "click-staff",
  "click-roll",
  "rn-palette",
  "blanks",
  "code",
  "click-code",
  "slot-choice",
  "form",
  "bar-grid",
  "scale-builder",
  "grouping",
  "euclid",
]);

function Section({ f, env, states }: { f: Fixture; env: AnswerEnv; states: readonly GalleryState[] }) {
  const wide = WIDE.has(f.spec.ui);
  return (
    <section
      id={f.id}
      aria-labelledby={`${f.id}-h`}
      className="flex scroll-mt-4 flex-col gap-3"
      data-fixture={f.id}
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <h2 id={`${f.id}-h`} className="text-h3">
          {f.title}
        </h2>
        <Chip>
          <code className="font-mono">{f.spec.ui}</code>
        </Chip>
      </header>
      <Card className="flex flex-col gap-3 p-4">
        <p className="font-medium">{f.prompt}</p>
        <LiveWidget f={f} env={env} />
      </Card>
      <div className={clsx("grid gap-3", wide ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3")}>
        {states.map((s) => {
          const { value, feedback } = stateOf(f, s);
          return (
            <Card key={s} className="flex min-w-0 flex-col gap-2 p-3" data-state={s}>
              <span className="text-sm font-medium text-text-3">{STATE_LABEL[s]}</span>
              <AnswerEnvProvider value={env}>
                <AnswerView
                  spec={f.spec}
                  value={value}
                  onChange={() => {}}
                  onSubmit={() => {}}
                  disabled={s === "pending" || s === "correct" || s === "revealed"}
                  feedback={feedback}
                  label={`${f.prompt} (${STATE_LABEL[s]} example)`}
                  idBase={`${f.id}-${s}`}
                  audition={audition}
                />
              </AnswerEnvProvider>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export function Gallery() {
  const params = new URLSearchParams(location.search);
  const only = params.get("only");
  const stateParam = params.get("state");
  const states = STATES.filter((s) => !stateParam || stateParam.split(",").includes(s));
  const theme = useThemeName();
  const setPrefs = usePrefs((s) => s.set);
  const motion = usePrefs((s) => s.motion);
  const music = useMelodyModel();

  // The roll pick's answer is an event ID of the analysed model: the highest note (G4, degree 5).
  const fixtures = FIXTURES.map((f) => {
    if (f.kind !== "click-roll" || !music.model || music.model.events.length === 0) return f;
    const events = music.model.events;
    const top = events.reduce((a, b) => ((b.midi ?? 0) > (a.midi ?? 0) ? b : a));
    return { ...f, expected: top.id, sample: events[0]?.id ?? null } as Fixture;
    // `?only=a,b,c` shows several examples on one page (the Wave 7 overflow walk loads them once).
  }).filter((f) => !only || only.split(",").includes(f.id));

  // `?verb=save` draws every widget as a checkpoint does (Enter saves); `?lenses=off` turns every lens off.
  const save = params.get("verb") === "save";
  const lensesOff = params.get("lenses") === "off";
  const envFor = (f: Fixture): AnswerEnv => ({
    profile: NEUTRAL_PROFILE,
    audio: appAudio,
    ...(save ? { submitVerb: "save" as const } : {}),
    ...(lensesOff
      ? {
          lenses: {
            degrees: false,
            solfege: false,
            noteNames: false,
            chordSymbols: false,
            romanNumerals: false,
          },
        }
      : {}),
    ...(f.env ?? {}),
    // `?lenses=off` wins over an example that turns a lens on.
    ...(lensesOff && f.env?.lenses
      ? {
          lenses: {
            degrees: false,
            solfege: false,
            noteNames: false,
            chordSymbols: false,
            romanNumerals: false,
          },
        }
      : {}),
    ...(f.kind === "click-staff" || f.kind === "click-roll" ? { music: music.model } : {}),
  });
  const ready =
    !fixtures.some((f) => f.kind === "click-staff" || f.kind === "click-roll") || music.model !== null;

  return (
    <div className="flex h-dvh">
      <nav
        aria-label="Widgets"
        className="hidden h-dvh w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-surface p-3 lg:flex"
      >
        <a href="?" className="mb-2 px-2 font-display text-h3 text-text no-underline">
          Answers
        </a>
        {FIXTURES.map((f) => (
          <a
            key={f.id}
            href={`?only=${f.id}`}
            aria-current={only === f.id ? "page" : undefined}
            className={clsx(
              "rounded-control px-2 py-1 text-sm no-underline hover:bg-surface-2",
              only === f.id ? "bg-surface-2 text-text" : "text-text-2",
            )}
          >
            {f.title}
          </a>
        ))}
        <a
          href="?only=staged"
          aria-current={only === "staged" ? "page" : undefined}
          className={clsx(
            "rounded-control px-2 py-1 text-sm no-underline hover:bg-surface-2",
            only === "staged" ? "bg-surface-2 text-text" : "text-text-2",
          )}
        >
          Staged chord dictation
        </a>
      </nav>
      <main id="main" className="h-dvh min-w-0 flex-1 overflow-y-auto" data-ready={ready ? "1" : "0"}>
        <div className="mx-auto flex max-w-[72rem] flex-col gap-8 px-6 py-6">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1>Answer widgets</h1>
              <p className="max-w-[60ch] text-text-2">
                Every answer kind, live and in each feedback state. The live copy checks against the example's
                answer the way a lesson or drill host would.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                label="Theme"
                size="sm"
                value={theme}
                options={[
                  { value: "paper", label: "Paper" },
                  { value: "bark", label: "Bark" },
                ]}
                onChange={(v) => setPrefs({ theme: v })}
              />
              <SegmentedControl
                label="Motion"
                size="sm"
                value={motion}
                options={[
                  { value: "system", label: "System" },
                  { value: "on", label: "Reduced" },
                  { value: "off", label: "Full" },
                ]}
                onChange={(v) => setPrefs({ motion: v })}
              />
            </div>
          </header>
          {music.error && !ready ? (
            <p className="text-sm text-text-2">The melody did not analyse: {music.error}</p>
          ) : null}
          {fixtures.length === 0 && only !== "staged" ? (
            <p className="text-text-2">No widget is called “{only}”.</p>
          ) : null}
          {fixtures.map((f) => (
            <Section key={`${f.id}-${String(f.expected)}`} f={f} env={envFor(f)} states={states} />
          ))}
          {!only || only === "staged" ? (
            <AnswerEnvProvider value={save ? { submitVerb: "save" } : {}}>
              <StagedSection />
            </AnswerEnvProvider>
          ) : null}
        </div>
      </main>
    </div>
  );
}
