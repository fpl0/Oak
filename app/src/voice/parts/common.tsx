// What every set-up part shares: its props, the save helper (one `POST /profile/calibration` per measurement,
// contracts §8.6), the layout frame and the footer with the primary action and "Set up later".
import type { CalibrationRun, Profile } from "@oak/api";
import type { ReactNode } from "react";
import { useCalibrationRun } from "../../lib/queries.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { toast } from "../../ui/kit/Toast.tsx";

export type PartContext = "onboarding" | "settings" | "lesson";

export interface PartProps {
  profile: Profile;
  context: PartContext;
  /** The part is finished (its result saved, or a path chosen that needs none). */
  onDone(): void;
  /** "Set up later": shown only where the step may be skipped. */
  onSkip?: (() => void) | undefined;
}

/** Saves one calibration run; resolves the updated profile, or null after showing why it failed. */
export function useSaveRun() {
  const m = useCalibrationRun();
  return {
    pending: m.isPending,
    async save(run: CalibrationRun): Promise<Profile | null> {
      try {
        return await m.mutateAsync({ body: run });
      } catch (e) {
        toast.error("That result wasn't saved", e instanceof Error ? e.message : undefined);
        return null;
      }
    },
  };
}

export function PartFrame({
  title,
  lead,
  children,
  testId,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section className="flex flex-col gap-5" data-testid={testId} aria-labelledby={`${testId}-title`}>
      <header className="flex flex-col gap-1.5">
        <h2 id={`${testId}-title`} className="text-h2 outline-none" tabIndex={-1}>
          {title}
        </h2>
        {lead && <div className="max-w-[60ch] text-text-2">{lead}</div>}
      </header>
      {children}
    </section>
  );
}

export function PartFooter({
  primary,
  onSkip,
  skipLabel = "Set up later",
  children,
}: {
  primary?: ReactNode;
  onSkip?: (() => void) | undefined;
  skipLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {primary}
      {children}
      {onSkip && (
        <Button variant="ghost" onClick={onSkip} data-testid="part-skip">
          {skipLabel}
        </Button>
      )}
    </div>
  );
}

/** A labelled result row ("Noise floor · −58 dBFS"). */
export function ResultRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-text-2">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
