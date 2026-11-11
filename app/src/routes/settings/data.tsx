// Settings › Data (contracts §11.10): export (audio included by default, with the size shown), import (nonce,
// automatic safety copy first) and reset (type RESET OAK).
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { formatBytes, formatDate } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import {
  backupExportUrl,
  useBackupImport,
  useBackupInfo,
  useBootstrap,
  useDataReset,
} from "../../lib/queries.ts";
import { useUpdateSetting } from "../../lib/settings.ts";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Dialog } from "../../ui/kit/Dialog.tsx";
import { Field, ReadOnlyRow, Section, Switch } from "../../ui/kit/Field.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { toast } from "../../ui/kit/Toast.tsx";

export const Route = createFileRoute("/settings/data")({ component: DataSettings });

function DataSettings() {
  usePageTitle("Settings · Data");
  const info = useBackupInfo();
  const bootstrap = useBootstrap();
  const setting = useUpdateSetting();
  const imp = useBackupImport();
  const reset = useDataReset();
  const fileRef = useRef<HTMLInputElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const withAudio = bootstrap.data?.settings.backupWithAudio ?? true;

  const onImport = async (file: File) => {
    try {
      const r = await imp.mutateAsync({
        target: "*",
        question: `Replace everything in Oak with the backup “${file.name}”? A safety copy of the current state is made first.`,
        input: { body: file, contentType: "application/zip" },
      });
      if (r)
        toast.success(
          "Backup restored",
          `${r.rows} rows and ${r.audioFiles} audio files. Safety copy: ${r.safetyCopy}` +
            (r.orphanedFiles > 0
              ? ` (${r.orphanedFiles} audio files of the replaced data were moved beside it).`
              : ""),
        );
    } catch (e) {
      toast.error("The backup was not restored", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Back up"
        description="One .oakbackup file with your progress, sketches, tracks and (by default) your audio."
      >
        <QueryView query={info} loading={<p className="py-3 text-text-3">Measuring…</p>}>
          {(i) => (
            <>
              <Field
                label="Include audio"
                help={`With audio ≈ ${formatBytes(i.bytesWithAudio)}; without ≈ ${formatBytes(i.bytesWithoutAudio)}.`}
              >
                {({ id, describedBy }) => (
                  <Switch
                    id={id}
                    describedBy={describedBy}
                    checked={withAudio}
                    onChange={(v) => setting.set("backupWithAudio", v)}
                  />
                )}
              </Field>
              <ReadOnlyRow
                label="Last automatic copy"
                value={i.lastAutomatic ? formatDate(i.lastAutomatic) : "none yet"}
              />
              <div className="py-3">
                <a href={backupExportUrl(withAudio)} download className={buttonClass("primary")}>
                  Export backup
                </a>
              </div>
            </>
          )}
        </QueryView>
      </Section>
      <Section title="Restore" description="Imported code runs only after Oak's strict safety check.">
        <div className="py-3">
          <input
            ref={fileRef}
            type="file"
            accept=".oakbackup,application/zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onImport(f);
            }}
          />
          <Button loading={imp.isPending} onClick={() => fileRef.current?.click()}>
            Import a backup…
          </Button>
        </div>
        <ReadOnlyRow label="Stored in" value={<code>~/.oak</code>} />
      </Section>
      <Section title="Start over">
        <div className="py-3">
          <Button variant="danger" onClick={() => setResetOpen(true)}>
            Reset progress…
          </Button>
        </div>
      </Section>
      <Dialog
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setTyped("");
        }}
        title="Reset all progress?"
        description="Lessons, reviews, sketches, tracks and settings are erased. An automatic safety copy is kept in ~/.oak/backups."
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={typed !== "RESET OAK"}
              loading={reset.isPending}
              onClick={async () => {
                try {
                  const r = await reset.mutateAsync({
                    target: "*",
                    question: "Last check: erase all progress in Oak?",
                  });
                  if (r) {
                    setResetOpen(false);
                    toast.success("Oak was reset");
                  }
                } catch (e) {
                  toast.error("Nothing was reset", e instanceof Error ? e.message : undefined);
                }
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-sm">
          Type <code className="font-mono">RESET OAK</code> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="h-9 rounded-control border border-border bg-surface px-2 font-mono"
            autoComplete="off"
          />
        </label>
      </Dialog>
    </div>
  );
}
