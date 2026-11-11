// Toasts: a tiny zustand queue plus one polite live region. Errors use role="alert".
import { clsx } from "clsx";
import { X } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";

export type ToastTone = "info" | "success" | "error";
export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  /** Auto-dismiss after this many ms; 0 keeps it until closed. */
  timeoutMs: number;
  action?: { label: string; run(): void };
}

interface ToastStore {
  items: ToastItem[];
  push(t: Omit<ToastItem, "id" | "timeoutMs"> & { timeoutMs?: number }): number;
  dismiss(id: number): void;
}

let nextId = 1;
export const useToasts = create<ToastStore>((set) => ({
  items: [],
  push(t) {
    const id = nextId++;
    const item: ToastItem = { timeoutMs: t.tone === "error" ? 8000 : 4000, ...t, id };
    set((s) => ({ items: [...s.items.slice(-3), item] }));
    return id;
  },
  dismiss(id) {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },
}));

export const toast = {
  info: (title: string, body?: string) =>
    useToasts.getState().push({ tone: "info", title, ...(body ? { body } : {}) }),
  success: (title: string, body?: string) =>
    useToasts.getState().push({ tone: "success", title, ...(body ? { body } : {}) }),
  error: (title: string, body?: string) =>
    useToasts.getState().push({ tone: "error", title, ...(body ? { body } : {}) }),
};

function ToastView({ item }: { item: ToastItem }) {
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    if (!item.timeoutMs) return;
    const t = setTimeout(() => dismiss(item.id), item.timeoutMs);
    return () => clearTimeout(t);
  }, [item.id, item.timeoutMs, dismiss]);
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      className={clsx(
        "pointer-events-auto flex w-80 items-start gap-3 rounded-card border bg-surface p-3 shadow-overlay animate-slide-in-right",
        item.tone === "error"
          ? "border-danger/50"
          : item.tone === "success"
            ? "border-accent/50"
            : "border-border",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{item.title}</p>
        {item.body && <p className="mt-0.5 text-sm text-text-2">{item.body}</p>}
        {item.action && (
          <button
            type="button"
            className="mt-2 text-sm font-medium text-link underline-offset-2 hover:underline"
            onClick={() => {
              item.action?.run();
              dismiss(item.id);
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="inline-flex size-6 items-center justify-center rounded text-text-3 hover:text-text"
        onClick={() => dismiss(item.id)}
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2"
    >
      {items.map((i) => (
        <ToastView key={i.id} item={i} />
      ))}
    </div>
  );
}
