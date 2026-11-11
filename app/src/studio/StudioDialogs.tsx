// The Studio's two small dialogs: "Name this version" (Mod+S) and "Export" (the code as a .js file or to the
// clipboard, with the liner notes as a comment header).
import type { Sketch, SketchVersion } from "@oak/api";
import { Copy, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/kit/Button.tsx";
import { Dialog } from "../ui/kit/Dialog.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { focusOnOpen } from "./focus.ts";
import { exportFileName, exportText } from "./model.ts";

export function NameVersionDialog({
  open,
  next,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  /** The number the new version will get. */
  next: number;
  saving: boolean;
  onClose(): void;
  onSave(name: string): void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Name this version"
      description={`Saves what is in the editor now as v${next}, with a name you can find again.`}
    >
      {open ? <NameForm next={next} saving={saving} onClose={onClose} onSave={onSave} /> : null}
    </Dialog>
  );
}

function NameForm({
  next,
  saving,
  onClose,
  onSave,
}: {
  next: number;
  saving: boolean;
  onClose(): void;
  onSave(name: string): void;
}) {
  const [name, setName] = useState("");
  const ok = name.trim().length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave(name.trim());
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-text-2">Name</span>
        <input
          ref={focusOnOpen}
          value={name}
          maxLength={80}
          placeholder={`For example: chorus idea (v${next})`}
          onChange={(e) => setName(e.target.value)}
          className="h-9 rounded-control border border-border bg-surface px-2 text-base text-text"
          data-testid="version-name"
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={!ok} loading={saving}>
          Save v{next}
        </Button>
      </div>
    </form>
  );
}

export function ExportDialog({
  open,
  onClose,
  sketch,
  version,
  liner,
}: {
  open: boolean;
  onClose(): void;
  sketch: Pick<Sketch, "title">;
  version: SketchVersion | null;
  liner: readonly string[];
}) {
  const text = version ? exportText(sketch, version, liner) : "";
  const file = version ? exportFileName(sketch.title, version.version) : "";
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Code copied");
    } catch {
      toast.error("The clipboard is not available here", "Select the code and copy it instead.");
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export code"
      description={
        version
          ? `v${version.version}, the newest saved version. It runs as it is in Strudel (strudel.cc).`
          : "Save a version first: every Run saves one."
      }
      className="w-[min(94vw,40rem)]"
    >
      {version ? (
        <div className="flex flex-col gap-3">
          <pre
            className="max-h-72 overflow-auto rounded-control border border-border bg-surface-2 p-3 font-mono text-sm"
            data-testid="export-preview"
          >
            {text}
          </pre>
          <div className="flex flex-wrap justify-end gap-2">
            <Button icon={<Copy aria-hidden className="size-4" />} onClick={() => void copy()}>
              Copy
            </Button>
            <Button
              variant="primary"
              icon={<Download aria-hidden className="size-4" />}
              onClick={download}
              data-testid="export-download"
            >
              Download {file}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
