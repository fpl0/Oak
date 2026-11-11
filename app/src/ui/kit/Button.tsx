import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Tooltip } from "./Tooltip.tsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks clicks; the label stays for screen readers. */
  loading?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover border-transparent",
  secondary: "bg-surface text-text border-border hover:bg-surface-2",
  ghost: "bg-transparent text-text-2 border-transparent hover:bg-surface-2 hover:text-text",
  danger: "bg-danger text-on-danger border-transparent hover:opacity-90",
};
const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-sm gap-1.5",
  md: "h-8 px-3 text-sm gap-2",
  lg: "h-10 px-4 text-base gap-2",
};

export const buttonClass = (variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string) =>
  clsx(
    "inline-flex items-center justify-center whitespace-nowrap rounded-control border font-medium",
    "transition-colors duration-150 select-none",
    "disabled:opacity-50 disabled:pointer-events-none",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin reduced:animate-none" /> : icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible name and tooltip text. */
  label: string;
  icon: ReactNode;
  /** Shortcut shown in the tooltip, e.g. "⌘J". */
  shortcut?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  pressed?: boolean;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  ref?: Ref<HTMLButtonElement>;
}

const ICON_SIZES: Record<ButtonSize, string> = { sm: "size-7", md: "size-8", lg: "size-10" };

export function IconButton({
  label,
  icon,
  shortcut,
  variant = "ghost",
  size = "md",
  pressed,
  className,
  type = "button",
  tooltipSide = "bottom",
  ref,
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        className={clsx(
          "inline-flex items-center justify-center rounded-control border transition-colors duration-150",
          "disabled:opacity-50 disabled:pointer-events-none",
          VARIANTS[variant],
          ICON_SIZES[size],
          pressed && "bg-surface-2 text-text",
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
