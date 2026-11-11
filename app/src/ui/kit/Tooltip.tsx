import { clsx } from "clsx";
import { cloneElement, isValidElement, type ReactElement, type ReactNode, useId, useState } from "react";
import { Kbd } from "./basics.tsx";

export interface TooltipProps {
  content: ReactNode;
  shortcut?: string | undefined;
  side?: "top" | "right" | "bottom" | "left";
  /** Delay before showing on hover, in ms (focus shows at once). */
  delay?: number;
  children: ReactElement<{ "aria-describedby"?: string | undefined }>;
}

const SIDE: Record<NonNullable<TooltipProps["side"]>, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
};

/** Hover and focus tooltip. Esc hides it; it never holds focus and never carries the only copy of a label. */
export function Tooltip({ content, shortcut, side = "top", delay = 350, children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const show = (now: boolean) => {
    if (timer) clearTimeout(timer);
    if (now) setOpen(true);
    else setTimer(setTimeout(() => setOpen(true), delay));
  };
  const hide = () => {
    if (timer) clearTimeout(timer);
    setTimer(null);
    setOpen(false);
  };
  const child = isValidElement(children)
    ? cloneElement(children, { "aria-describedby": open ? id : children.props["aria-describedby"] })
    : children;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only listens; the child is the control.
    <span
      className="relative inline-flex"
      onMouseEnter={() => show(false)}
      onMouseLeave={hide}
      onFocus={(e) => {
        if ((e.target as HTMLElement).matches(":focus-visible")) show(true);
      }}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          hide();
        }
      }}
    >
      {child}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={clsx(
            "pointer-events-none absolute z-50 whitespace-nowrap rounded-control px-2 py-1 text-sm",
            "bg-text text-bg shadow-overlay animate-fade-in flex items-center gap-2",
            SIDE[side],
          )}
        >
          {content}
          {shortcut && <Kbd tone="inverse">{shortcut}</Kbd>}
        </span>
      )}
    </span>
  );
}
