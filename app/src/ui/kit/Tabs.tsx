import { clsx } from "clsx";
import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";

export interface TabItem<V extends string> {
  value: V;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * WAI-ARIA tabs with roving tabindex and automatic activation: ←/→ (and Home/End) move and select.
 * Controlled; render the panel yourself with `tabPanelProps(value)`.
 */
export function Tabs<V extends string>({
  items,
  value,
  onChange,
  label,
  className,
  idBase,
}: {
  items: readonly TabItem<V>[];
  value: V;
  onChange(value: V): void;
  label: string;
  className?: string;
  idBase?: string;
}) {
  const auto = useId();
  const base = idBase ?? auto;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = items.filter((i) => !i.disabled);
  const move = (e: KeyboardEvent, dir: 1 | -1 | "first" | "last") => {
    e.preventDefault();
    const idx = enabled.findIndex((i) => i.value === value);
    const next =
      dir === "first"
        ? enabled[0]
        : dir === "last"
          ? enabled[enabled.length - 1]
          : enabled[(idx + dir + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    refs.current[next.value]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={clsx("inline-flex items-center gap-1 rounded-control bg-surface-2 p-0.5", className)}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[item.value] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`${base}-panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(e, 1);
              else if (e.key === "ArrowLeft") move(e, -1);
              else if (e.key === "Home") move(e, "first");
              else if (e.key === "End") move(e, "last");
            }}
            className={clsx(
              "h-7 rounded-[5px] px-3 text-sm font-medium transition-colors",
              selected ? "bg-surface text-text shadow-card" : "text-text-2 hover:text-text",
              "disabled:opacity-40",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function tabPanelProps(idBase: string, value: string) {
  return {
    role: "tabpanel" as const,
    id: `${idBase}-panel-${value}`,
    "aria-labelledby": `${idBase}-tab-${value}`,
    tabIndex: 0,
  };
}
