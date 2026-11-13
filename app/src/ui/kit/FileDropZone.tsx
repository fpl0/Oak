// FileDropZone (Wave 4): bring a file in by dropping it or choosing it ("Bring a recording": audio for Transcribe, a
// backup). The button is the keyboard way in (Enter or Space opens the file picker); the whole zone takes a drop.
// A file of the wrong type, empty or over the limit is refused with a sentence that says why; `onFile` gets only
// files that pass. `busy` shows progress while the owner uploads.
import { clsx } from "clsx";
import { FileUp } from "lucide-react";
import { type DragEvent, type ReactNode, useId, useRef, useState } from "react";
import { Button } from "./Button.tsx";
import { bytesLabel, fileProblem } from "./model.ts";

export function FileDropZone({
  title,
  hint,
  accept = [],
  kinds,
  maxBytes,
  onFile,
  busy = false,
  busyText = "Bringing it in…",
  disabled = false,
  buttonText = "Choose a file…",
  icon,
  className,
  "data-testid": testId,
}: {
  /** "Bring a recording". */
  title: ReactNode;
  /** One line under it ("It stays on this device."). The size limit is added when `maxBytes` is set. */
  hint?: ReactNode;
  /** `<input accept>` rules: ".wav", "audio/*". */
  accept?: readonly string[];
  /** The accepted files in words, for the refusal ("MP3, WAV, FLAC, OGG or M4A"). */
  kinds?: string;
  maxBytes?: number;
  onFile(file: File): void;
  busy?: boolean;
  busyText?: string;
  disabled?: boolean;
  buttonText?: string;
  icon?: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const off = disabled || busy;

  const take = (file: File | undefined) => {
    if (!file || off) return;
    const p = fileProblem(file, { accept, maxBytes, kinds });
    setProblem(p ? p.message : null);
    if (!p) onFile(file);
  };
  const onDrag = (e: DragEvent<HTMLDivElement>, entering: boolean) => {
    if (off || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setOver(entering);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the drop target; the button inside is the keyboard way in.
    <div
      data-testid={testId}
      data-over={over || undefined}
      onDragEnter={(e) => onDrag(e, true)}
      onDragOver={(e) => onDrag(e, true)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (off) return;
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files[0]);
      }}
      className={clsx(
        "flex flex-col items-center gap-2 rounded-card border-2 border-dashed px-5 py-6 text-center transition-colors duration-150",
        over ? "border-accent bg-lane-in" : "border-border bg-surface",
        off && "opacity-60",
        className,
      )}
    >
      <span aria-hidden className={clsx("[&_svg]:size-7", over ? "text-accent" : "text-text-3")}>
        {icon ?? <FileUp />}
      </span>
      <p className="font-medium">{title}</p>
      <p id={hintId} className="max-w-[46ch] text-sm text-text-2">
        {hint}
        {hint && maxBytes !== undefined ? " " : ""}
        {maxBytes !== undefined && <>Up to {bytesLabel(maxBytes)}.</>}
        {!off && <span className="text-text-3"> Drop it here, or</span>}
      </p>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept.join(",")}
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button
        variant="secondary"
        loading={busy}
        disabled={disabled}
        aria-describedby={hintId}
        onClick={() => input.current?.click()}
      >
        {busy ? busyText : buttonText}
      </Button>
      <p aria-live="polite" className="min-h-5 text-sm text-issue" data-testid="file-problem">
        {problem}
      </p>
    </div>
  );
}
