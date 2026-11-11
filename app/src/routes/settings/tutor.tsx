// Settings › Tutor (ux §2.3, contracts §10.A): which backend is active and why, the backend choice, the
// API key (paste or remove; it never comes back to the browser), this month's usage and the budget.
import { EFFORT_OF, LANES, type TutorSettings } from "@oak/api";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { formatMonth } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import {
  useAnthropicKeyDelete,
  useAnthropicKeySet,
  useBootstrap,
  useHealth,
  useTutorUsage,
} from "../../lib/queries.ts";
import { useUpdateSetting } from "../../lib/settings.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Chip } from "../../ui/kit/basics.tsx";
import { Field, ReadOnlyRow, Section, Select } from "../../ui/kit/Field.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { toast } from "../../ui/kit/Toast.tsx";

export const Route = createFileRoute("/settings/tutor")({ component: TutorSettingsPage });

const HEALTH_COPY: Record<string, string> = {
  ready: "Ready",
  missing_key: "Off: no API key and no Claude login found",
  invalid_key: "The API key was refused",
  unreachable: "Anthropic could not be reached",
};
const BACKEND_LABEL: Record<string, string> = {
  "anthropic-api": "Anthropic API (your key)",
  "claude-cli": "Claude CLI (your Claude login)",
};

function KeyForm() {
  const [key, setKey] = useState("");
  const set = useAnthropicKeySet();
  const del = useAnthropicKeyDelete();
  return (
    <div className="flex flex-col gap-3 py-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await set.mutateAsync({ body: { key: key.trim() } });
            setKey("");
            if (r.status === "ready") toast.success("Key saved", "The tutor is ready.");
            else toast.error("Key saved, but not usable", HEALTH_COPY[r.status]);
          } catch (err) {
            toast.error("The key was not saved", err instanceof Error ? err.message : undefined);
          }
        }}
      >
        <label htmlFor="api-key" className="sr-only">
          Anthropic API key
        </label>
        <input
          id="api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste an API key (sk-ant-…)"
          className="h-8 w-80 rounded-control border border-border bg-surface px-2 font-mono text-sm"
        />
        <Button type="submit" disabled={key.trim().length < 20} loading={set.isPending}>
          Save key
        </Button>
        <Button
          variant="ghost"
          loading={del.isPending}
          onClick={async () => {
            try {
              const r = await del.mutateAsync({
                target: "*",
                question:
                  "Remove the saved Anthropic API key from this computer? The tutor will use your Claude login if you have one.",
              });
              if (r) toast.success("Key removed");
            } catch (err) {
              toast.error("The key was not removed", err instanceof Error ? err.message : undefined);
            }
          }}
        >
          Remove saved key
        </Button>
      </form>
      <p className="text-sm text-text-2">
        Stored in <code>~/.oak/secrets</code> with owner-only permissions. It never comes back to this page,
        never goes into backups, and the grader never sees it.
      </p>
    </div>
  );
}

function Usage() {
  const usage = useTutorUsage();
  return (
    <QueryView query={usage} loading={<p className="py-3 text-text-3">Loading usage…</p>}>
      {(u) => (
        <>
          <ReadOnlyRow label="Month" value={formatMonth(u.month)} />
          <ReadOnlyRow
            label="Cost"
            value={
              u.includedInPlan && u.costUsd === 0
                ? "Included in your Claude plan"
                : `≈ $${u.costUsd.toFixed(2)} (estimate)`
            }
          />
          <ReadOnlyRow
            label="Tokens"
            value={`${u.inputTokens.toLocaleString()} in · ${u.outputTokens.toLocaleString()} out · cache hits ${Math.round(u.cacheHitRatio * 100)}%`}
          />
        </>
      )}
    </QueryView>
  );
}

function TutorSettingsPage() {
  usePageTitle("Settings · Tutor");
  const health = useHealth();
  const bootstrap = useBootstrap();
  const update = useUpdateSetting();
  return (
    <div className="flex flex-col gap-6">
      <Section title="Status" description="Oak is fully usable without the tutor.">
        <QueryView query={health} loading={<p className="py-3 text-text-3">Checking…</p>}>
          {(h) => (
            <>
              <ReadOnlyRow
                label="Tutor"
                value={
                  <Chip tone={h.tutor === "ready" ? "accent" : "issue"}>
                    {HEALTH_COPY[h.tutor] ?? h.tutor}
                  </Chip>
                }
              />
              <ReadOnlyRow
                label="Active backend"
                value={h.tutorBackend ? BACKEND_LABEL[h.tutorBackend] : "None (tutor off)"}
              />
            </>
          )}
        </QueryView>
        <QueryView query={bootstrap} loading={null}>
          {(b) => {
            const t: TutorSettings = b.settings.tutor;
            return (
              <>
                <Field
                  label="Backend"
                  help="Auto: an API key if present, then a logged-in Claude CLI, otherwise off."
                >
                  {({ id, describedBy }) => (
                    <Select<TutorSettings["backend"]>
                      id={id}
                      describedBy={describedBy}
                      value={t.backend}
                      options={[
                        { value: "auto", label: "Auto" },
                        { value: "anthropic-api", label: "Anthropic API" },
                        { value: "claude-cli", label: "Claude CLI" },
                        { value: "off", label: "Off" },
                      ]}
                      onChange={(backend) => update.set("tutor", { ...t, backend })}
                    />
                  )}
                </Field>
                <Field label="Monthly budget" help="A soft warning; it never blocks the tutor.">
                  {({ id, describedBy }) => (
                    <Select<number>
                      id={id}
                      describedBy={describedBy}
                      value={t.softMonthlyUsd}
                      options={[5, 10, 25, 50, 100].map((v) => ({ value: v, label: `$${v}` }))}
                      onChange={(softMonthlyUsd) => update.set("tutor", { ...t, softMonthlyUsd })}
                    />
                  )}
                </Field>
              </>
            );
          }}
        </QueryView>
      </Section>
      <Section title="API key">
        <KeyForm />
      </Section>
      <Section title="This month">
        <Usage />
      </Section>
      <Section title="Effort per kind of request" description="Fixed per conversation lane.">
        {LANES.map((lane) => (
          <ReadOnlyRow key={lane} label={lane} value={EFFORT_OF[lane]} />
        ))}
      </Section>
      <Section title="What Claude sees">
        <ul className="ml-5 list-disc space-y-1 py-3 text-text-2">
          <li>Your code, the grader's result, and the lesson you're in.</li>
          <li>Short notes from earlier sessions, so it can follow your progress.</li>
          <li>
            Never your audio, your voice or your files. Answers you haven't reached are held back until you
            ask for them.
          </li>
        </ul>
      </Section>
    </div>
  );
}
