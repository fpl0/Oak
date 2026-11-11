// `onb.coda` (ux §8, ux §1.5 Coda-lite): what the learner did and set up, Sketch 001, the Toolbox ceremony for
// what U00 unlocked, and what comes next. "Done for today" finishes onboarding and lands on Today.
import type { OnboardingState, Profile } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { Check, Circle, Sprout } from "lucide-react";
import { formatNoteMidi } from "../../lib/notes.ts";
import { toolLabel } from "../../lib/tool-label.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Card } from "../../ui/kit/basics.tsx";
import { STEP_META } from "../flow.ts";
import { ONBOARDING_UNLOCKS } from "../services.ts";

interface Row {
  label: string;
  value: string;
  done: boolean;
}

/** The summary rows (pure; tested): what was done, what was set up, what waits in Settings. */
export function codaRows(st: OnboardingState, p: Profile, tutorReady: boolean): Row[] {
  const later = "Set up later in Settings";
  const skipped = (s: Parameters<typeof st.skipped.includes>[0]) => st.skipped.includes(s);
  const rows: Row[] = [
    {
      label: "Your loop",
      value: st.firstEdit === null ? "Heard it build up" : `You changed the last note to ${st.firstEdit}`,
      done: true,
    },
    {
      label: "Backing band",
      value: `${p.flavour === "flavour.jazz-soul" ? "Jazz-soul" : p.flavour === "flavour.pop" ? "Pop" : p.flavour.replace("flavour.", "")} · ${p.targetMinutes} minutes a day · ${p.weeklyGoal} days a week`,
      done: true,
    },
    { label: STEP_META.tutor.label, value: tutorReady ? "Connected" : later, done: tutorReady },
    {
      label: STEP_META.headphones.label,
      value: skipped("headphones")
        ? later
        : p.outputKind === "bluetooth"
          ? "Bluetooth: timing allows for the delay"
          : p.outputKind === "speakers"
            ? "Speakers"
            : "Wired headphones",
      done: !skipped("headphones"),
    },
    {
      label: STEP_META.mic.label,
      value: p.quiet
        ? "Quiet mode: singing steps become listening steps"
        : p.noiseFloorDb === null
          ? "On"
          : `On · room ${Math.round(p.noiseFloorDb)} dBFS`,
      done: !p.quiet,
    },
    {
      label: STEP_META.range.label,
      value:
        p.comfortLowMidi !== null && p.comfortHighMidi !== null && !skipped("range")
          ? `Comfortable ${formatNoteMidi(p.comfortLowMidi)}–${formatNoteMidi(p.comfortHighMidi)}`
          : later,
      done: !skipped("range") && p.comfortLowMidi !== null,
    },
    {
      label: STEP_META.latency.label,
      value: p.tapLatencyMs !== null && !skipped("latency") ? `Taps ${Math.round(p.tapLatencyMs)} ms` : later,
      done: !skipped("latency") && p.tapLatencyMs !== null,
    },
    {
      label: STEP_META["first-sing"].label,
      value: st.completed.includes("first-sing") ? "Sung: that note is home" : later,
      done: st.completed.includes("first-sing"),
    },
  ];
  return rows;
}

export function CodaScreen({
  state,
  profile,
  tutorReady,
  finishing,
  onFinish,
}: {
  state: OnboardingState;
  profile: Profile;
  tutorReady: boolean;
  finishing: boolean;
  onFinish(): void;
}) {
  const rows = codaRows(state, profile, tutorReady);
  return (
    <section className="flex flex-col gap-6" data-testid="screen-coda" aria-labelledby="coda-title">
      <header className="flex items-start gap-4">
        <Sprout aria-hidden className="mt-1 size-8 shrink-0 text-accent" />
        <div className="flex flex-col gap-1.5">
          <h1 id="coda-title" className="text-h1 outline-none" tabIndex={-1}>
            Session complete. Stopping here is good practice.
          </h1>
          <p className="max-w-[62ch] text-text-2">
            You made a loop sound different by changing one number, and Oak now knows how you listen.
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="p-4">
          <h2 className="text-h3">Today</h2>
          <ul className="mt-2 flex flex-col" data-testid="coda-rows">
            {rows.map((r) => (
              <li
                key={r.label}
                className="flex items-start gap-3 border-b border-border py-2 last:border-b-0"
              >
                {r.done ? (
                  <Check aria-label="done" className="mt-0.5 size-4 shrink-0 text-accent" />
                ) : (
                  <Circle aria-label="later" className="mt-0.5 size-4 shrink-0 text-text-3" />
                )}
                <span className="w-36 shrink-0 text-sm text-text-2">{r.label}</span>
                <span className="min-w-0 text-sm">{r.value}</span>
              </li>
            ))}
          </ul>
          {state.sketchId && (
            <p className="mt-3 text-sm">
              <Link
                to="/studio/$sketchId"
                params={{ sketchId: state.sketchId }}
                className="text-link underline"
              >
                Sketch 001
              </Link>{" "}
              is in your sketchbook.
            </p>
          )}
        </Card>

        <Card className="p-4" data-testid="coda-toolbox">
          <h2 className="text-h3">New in your toolbox</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {ONBOARDING_UNLOCKS.map((t) => (
              <li key={t.id} className="flex flex-col">
                <span className={toolLabel(t).mono ? "font-mono text-[0.95em]" : "font-medium"}>
                  {toolLabel(t).text}
                </span>
                <span className="text-text-3">{t.concept}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-border bg-lane-in p-4">
        <p>
          {/* The next lesson in the default order is U00.L02 (contracts §2.5), as Today says too. */}
          <span className="font-medium">Next time: Set Up &amp; First Sing.</span>{" "}
          <span className="text-text-2">
            What you set up today is kept. You sing the loop's home note back, then make the tune end on it.
          </span>
        </p>
        <div>
          <Button variant="primary" onClick={onFinish} loading={finishing} data-testid="coda-done" autoFocus>
            Done for today
          </Button>
        </div>
      </div>
    </section>
  );
}
