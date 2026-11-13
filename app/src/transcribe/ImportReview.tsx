// "Review before running" for a transcription version that arrived in an imported backup (carry-over c2, contracts
// §11.3, wave5.md §5.4): code the learner did not type here opens as text, never in the editor or a player. The
// strict lint runs in the browser; once it passes, "Run it as mine" confirms the version on the server
// (`transcriptions.confirmVersion`, which lints strictly again) and only then does the code reach the Workbench.

import { OakApiError } from "@oak/api";
import type { KeySpec, MeterId } from "@oak/content-kit";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { lintInBrowser } from "../lib/grader-client.ts";
import { useTranscriptionConfirmVersion } from "../lib/queries.ts";
import { type StrictVerdict, strictLint, strictVerdict } from "../studio/model.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Card } from "../ui/kit/basics.tsx";
import { Callout } from "../ui/kit/Controls.tsx";

/** Whether a version must be reviewed before it runs (a flag the server sets on imported versions). */
export const needsReview = (v: { reviewBeforeRun?: true | undefined } | null | undefined): boolean =>
  v?.reviewBeforeRun === true;

export function ImportReview({
  projectId,
  version,
  code,
  meter,
  keySpec,
  onConfirmed,
  onFresh,
}: {
  projectId: string;
  version: number;
  code: string;
  meter: MeterId;
  keySpec: KeySpec | null;
  /** The version may run as the learner's own: put it in the editor. */
  onConfirmed(code: string, note: string | null): void;
  /** Leave it as text and start from the item's starter. */
  onFresh(): void;
}) {
  const [verdict, setVerdict] = useState<StrictVerdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const confirm = useTranscriptionConfirmVersion();

  const check = async () => {
    setChecking(true);
    setFailed(null);
    try {
      setVerdict(strictVerdict(await lintInBrowser(code, strictLint(meter, keySpec))));
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const runAsMine = async () => {
    setFailed(null);
    try {
      await confirm.mutateAsync({
        params: { id: projectId, v: String(version) },
        body: { strictLintPassed: true },
      });
      onConfirmed(code, null);
    } catch (e) {
      if (e instanceof OakApiError && e.code === "not_implemented") {
        // The browser's strict check passed; the server can't record it yet, so Oak asks again next time.
        onConfirmed(
          code,
          "This server can't record the review yet (not built), so Oak will ask again next time.",
        );
        return;
      }
      setFailed(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="import-review">
      <Callout
        tone="attention"
        title="Review before running"
        actions={
          verdict?.safe ? (
            <Button
              variant="primary"
              icon={<ShieldCheck aria-hidden className="size-4" />}
              loading={confirm.isPending}
              onClick={() => void runAsMine()}
              data-testid="run-as-mine"
            >
              Run it as mine
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={checking}
              onClick={() => void check()}
              data-testid="review-check"
            >
              Run the safety check
            </Button>
          )
        }
      >
        Version {version} came from an imported backup, so it wasn't typed on this machine. Oak shows it as
        text and runs it only after a strict safety check: no network, no page access, nothing but music.
      </Callout>
      {failed ? (
        <Callout tone="issue" title="That didn't work">
          {failed}
        </Callout>
      ) : null}
      {verdict?.safe ? (
        <p className="text-sm text-text-2" data-testid="review-passed">
          The check passed: nothing in this code reaches outside the music. Run it as yours to open it in the
          editor.
        </p>
      ) : null}
      {verdict && !verdict.safe ? (
        <Callout tone="issue" title="It stays as text">
          <p>
            The check found{" "}
            {verdict.problems.length === 1 ? "one thing" : `${verdict.problems.length} things`} it won't run:
          </p>
          <ul className="mt-1 list-disc pl-5" data-testid="review-problems">
            {verdict.problems.map((p) => (
              <li key={`${p.line}-${p.id}`}>
                Line {p.line}: {p.message}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}
      <div className="rounded-card border border-border bg-surface">
        <p className="border-b border-border px-3 py-1.5 text-sm text-text-2">
          Code of version {version}, as text
        </p>
        <pre
          className="m-0 max-h-80 overflow-auto p-3 font-mono text-sm whitespace-pre text-text"
          data-testid="review-code"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the code can scroll; the keyboard reaches it.
          tabIndex={0}
        >
          {code}
        </pre>
      </div>
      <div>
        <Button variant="ghost" onClick={onFresh} data-testid="review-fresh">
          Keep it as text and start fresh
        </Button>
      </div>
    </Card>
  );
}
