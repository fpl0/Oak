// `onb.tutor` (ux §8, contracts §2.3 U00.L01, §10.A): meet the tutor. Oak looks for a Claude login (or a key the
// server already has) through `/api/tutor/status`, says exactly what a question sends, and offers one first
// question about the learner's edit. Skippable; an API key is asked for only if the learner opens the advanced
// option. Nothing streams from here: the docked panel runs the ask.
import type { TutorStatus } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { MessageCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useAnthropicKeySet, useTutorStatus } from "../../lib/queries.ts";
import { askChat, clearSubject, setSubject } from "../../tutor/context.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Chip, Skeleton } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { toast } from "../../ui/kit/Toast.tsx";
import { ONBOARDING_THREAD } from "../thread.ts";

export function firstQuestion(firstEdit: number | null): string {
  return firstEdit === null
    ? "Hello. What should I listen for in this loop?"
    : `Hello. I changed the melody's last number to ${firstEdit}. What did that change in what I hear?`;
}

function via(s: TutorStatus): string {
  if (s.active === "claude-cli") return "through your Claude login";
  if (s.active === "anthropic-api") return "with the API key on this computer";
  return "";
}

function KeyOption() {
  const [key, setKey] = useState("");
  const set = useAnthropicKeySet();
  return (
    <details className="rounded-card border border-border bg-surface p-3" data-testid="tutor-advanced">
      <summary className="cursor-pointer font-medium">Use an Anthropic API key instead (advanced)</summary>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await set.mutateAsync({ body: { key: key.trim() } });
            setKey("");
            if (r.status === "ready") toast.success("Key saved", "The tutor is ready.");
            else toast.error("Key saved, but not usable", "Anthropic refused it or could not be reached.");
          } catch (err) {
            toast.error("The key was not saved", err instanceof Error ? err.message : undefined);
          }
        }}
      >
        <label htmlFor="onb-api-key" className="text-sm text-text-2">
          Paste a key from console.anthropic.com. It is stored on this computer only, with owner-only
          permissions, and never comes back to this page. Usage is billed to that key.
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="onb-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="h-8 w-80 max-w-full rounded-control border border-border bg-surface px-2 font-mono text-sm"
          />
          <Button type="submit" disabled={key.trim().length < 20} loading={set.isPending}>
            Save key
          </Button>
        </div>
      </form>
    </details>
  );
}

export function TutorScreen({
  firstEdit,
  code,
  onDone,
  onSkip,
}: {
  firstEdit: number | null;
  code: string;
  onDone(): void;
  onSkip(): void;
}) {
  const [refresh, setRefresh] = useState(false);
  const status = useTutorStatus(refresh);
  const [asked, setAsked] = useState(false);

  // The tutor sees the onboarding loop as it is now (with the learner's number).
  useEffect(() => {
    setSubject({ thread: ONBOARDING_THREAD, title: "Hello, Loop", tutorOpen: true, code });
    return () => clearSubject(ONBOARDING_THREAD);
  }, [code]);

  const s = status.data;
  const ready = s?.tutor === "ready" && s.active !== null;
  const off = s?.setting === "off";

  return (
    <section className="flex flex-col gap-5" data-testid="screen-tutor" aria-labelledby="tutor-title">
      <header className="flex flex-col gap-1.5">
        <h1 id="tutor-title" className="text-h1 outline-none" tabIndex={-1}>
          Meet your tutor
        </h1>
        <p className="max-w-measure text-text-2">
          Claude sits beside every lesson. Ask it what you're hearing, why a check failed, or for a nudge when
          you're stuck. Oak works fully without it.
        </p>
      </header>

      <div className="rounded-card border border-border bg-surface p-4" data-testid="tutor-sends">
        <h2 className="text-h3">What a question sends</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-text-2">
          <li>the step you're on, your code and Oak's check of it;</li>
          <li>your progress, so it doesn't explain what you know already.</li>
        </ul>
        <p className="mt-2 text-sm text-text-2">
          Never your voice, your microphone or your audio files. Only when you ask: nothing is sent in the
          background.
        </p>
      </div>

      {status.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Looking for your tutor">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : status.isError ? (
        <Callout
          tone="attention"
          title="Oak couldn't ask the server about the tutor"
          actions={
            <Button
              size="sm"
              onClick={() => void status.refetch()}
              icon={<RefreshCw aria-hidden className="size-4" />}
            >
              Check again
            </Button>
          }
        >
          {status.error.message}
        </Callout>
      ) : ready && s ? (
        <div className="flex flex-col gap-3" data-testid="tutor-ready">
          <Callout tone="success" title={`Your tutor is connected ${via(s)}.`}>
            {s.active === "claude-cli"
              ? "Questions are included in your Claude plan."
              : "Settings › Tutor shows this month's usage."}
          </Callout>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                const r = askChat(firstQuestion(firstEdit));
                setAsked(r.ok);
              }}
              disabled={asked}
              icon={<MessageCircle aria-hidden className="size-4" />}
              data-testid="tutor-ask"
            >
              {asked ? "Asked: the answer is in the panel" : "Ask about your change"}
            </Button>
            <Chip>"{firstQuestion(firstEdit)}"</Chip>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3" data-testid="tutor-off">
          <Callout
            tone="info"
            title={off ? "The tutor is switched off" : "Connect your tutor (optional)"}
            actions={
              <Button
                size="sm"
                onClick={() => {
                  setRefresh(true);
                  void status.refetch();
                }}
                loading={status.isFetching}
                icon={<RefreshCw aria-hidden className="size-4" />}
                data-testid="tutor-check"
              >
                Check again
              </Button>
            }
          >
            {off ? (
              <>
                It is set to Off in{" "}
                <Link to="/settings/tutor" className="text-link underline">
                  Settings › Tutor
                </Link>
                . Turn it back on there whenever you like.
              </>
            ) : (
              <>
                If you use Claude Code, sign in once with <code className="font-mono">claude</code> in a
                terminal on this computer, then check again: Oak uses that login. {s?.guidance ?? ""}
              </>
            )}
          </Callout>
          {!off && <KeyOption />}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {ready ? (
          <Button variant="primary" onClick={onDone} data-testid="tutor-continue">
            Continue
          </Button>
        ) : (
          <Button variant="primary" onClick={onSkip} data-testid="part-skip">
            Continue without the tutor
          </Button>
        )}
      </div>
    </section>
  );
}
