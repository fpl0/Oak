// Settings › Data (contracts §11.10): export (audio included by default, with the size shown), the learner's own
// recordings with their sizes and a delete that asks first (Wave 4), import (nonce, automatic safety copy first) and
// reset (type RESET OAK).
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AudioWaveform, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../lib/api.ts";
import { formatBytes, formatDate } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import {
  backupExportUrl,
  useBackupImport,
  useBackupInfo,
  useBootstrap,
  useDataReset,
  useTranscriptionDelete,
  useTranscriptions,
} from "../../lib/queries.ts";
import { useUpdateSetting } from "../../lib/settings.ts";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Chip } from "../../ui/kit/basics.tsx";
import { Dialog } from "../../ui/kit/Dialog.tsx";
import { Field, ReadOnlyRow, Section, Switch } from "../../ui/kit/Field.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { toast } from "../../ui/kit/Toast.tsx";
import {
  deleteQuestion,
  type OwnAudioRow,
  ownAudioRows,
  ownAudioTotal,
  useAudioSizes,
} from "./-data/own-audio.ts";

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
  const own = useOwnAudio();

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
                help={
                  `With audio ≈ ${formatBytes(i.bytesWithAudio)}; without ≈ ${formatBytes(i.bytesWithoutAudio)}.` +
                  (own.total.files > 0 && own.total.known
                    ? ` Your own recordings are ${formatBytes(own.total.bytes)} of that.`
                    : "")
                }
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
      <OwnAudioSection own={own} withAudio={withAudio} />
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

function useOwnAudio() {
  const list = useTranscriptions();
  const items = list.data?.items ?? [];
  const ids = items.flatMap((t) => (t.sourceKind === "own-audio" && t.audioId ? [t.audioId] : []));
  const sizes = useAudioSizes(ids);
  const rows = ownAudioRows(items, sizes.data ?? {});
  return { list, sizes, rows, total: ownAudioTotal(rows) };
}

function OwnAudioSection({ own, withAudio }: { own: ReturnType<typeof useOwnAudio>; withAudio: boolean }) {
  const del = useTranscriptionDelete();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const sizeText = (r: OwnAudioRow) => (r.bytes === null ? null : formatBytes(r.bytes));

  const remove = async (r: OwnAudioRow) => {
    setBusy(r.projectId);
    try {
      // One native confirm names the project and the recording (contracts §11.6); the recording goes too unless
      // another project uses it.
      const done = await del.mutateAsync({
        target: r.projectId,
        question: deleteQuestion(r, sizeText(r)),
        input: { params: { id: r.projectId } },
      });
      if (!done) return;
      let audioGone = false;
      if (r.sharedWith === 0) {
        try {
          await api().destructive("audio.delete", r.audioId, { params: { id: r.audioId } });
          audioGone = true;
        } catch (e) {
          toast.error(
            "The recording was kept",
            e instanceof Error ? `The project is deleted; its audio file stays: ${e.message}` : undefined,
          );
        }
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["api", "backup.info"] }),
        qc.invalidateQueries({ queryKey: ["api", "transcriptions.list"] }),
        qc.invalidateQueries({ queryKey: ["settings", "audio-sizes"] }),
      ]);
      toast.success(
        `Deleted “${r.title}”`,
        audioGone && r.bytes !== null ? `${formatBytes(r.bytes)} of audio freed.` : undefined,
      );
    } catch (e) {
      toast.error("Nothing was deleted", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const { files, bytes, known } = own.total;
  return (
    <Section
      title="Your recordings"
      description={
        <>
          Audio you brought into Transcribe. It never leaves this device.{" "}
          {withAudio ? "A backup includes it." : "Backups leave it out while “Include audio” is off."}
        </>
      }
    >
      <QueryView
        query={own.list}
        loading={<p className="py-3 text-text-3">Looking for recordings…</p>}
        isEmpty={() => own.rows.length === 0}
        empty={
          <div
            className="flex flex-wrap items-center justify-between gap-3 py-3"
            data-testid="own-audio-empty"
          >
            <p className="text-text-2">No recordings yet. Bring one into Transcribe and it is listed here.</p>
            <Link to="/transcribe" className={buttonClass("secondary", "sm")}>
              <AudioWaveform aria-hidden className="size-4" /> Open Transcribe
            </Link>
          </div>
        }
      >
        {() => (
          <>
            <ReadOnlyRow
              label="On this device"
              value={
                <span data-testid="own-audio-total">
                  {files} {files === 1 ? "recording" : "recordings"}
                  {known ? `, ${formatBytes(bytes)}` : own.sizes.isPending ? ", measuring…" : ""}
                </span>
              }
            />
            <ul
              aria-label="Recordings"
              className="flex flex-col divide-y divide-border"
              data-testid="own-audio"
            >
              {own.rows.map((r) => (
                <li key={r.projectId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/transcribe/$projectId"
                      params={{ projectId: r.projectId }}
                      className="block truncate font-medium text-link underline decoration-current/40 underline-offset-[3px] hover:decoration-current"
                    >
                      {r.title}
                    </Link>
                    <span className="text-sm text-text-2">
                      {[
                        sizeText(r) ?? (own.sizes.isPending ? "measuring…" : "size unknown"),
                        `changed ${formatDate(r.updatedAt, true)}`,
                      ].join(" · ")}
                    </span>
                  </div>
                  {r.sharedWith > 0 && (
                    <Chip>
                      also in {r.sharedWith === 1 ? "1 other project" : `${r.sharedWith} other projects`}
                    </Chip>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 aria-hidden className="size-4" />}
                    loading={busy === r.projectId}
                    disabled={busy !== null && busy !== r.projectId}
                    aria-label={`Delete “${r.title}”…`}
                    onClick={() => void remove(r)}
                  >
                    Delete…
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryView>
    </Section>
  );
}
