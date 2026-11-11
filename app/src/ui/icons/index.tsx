// Oak's custom icons (ux §7.8), drawn on Lucide's 24-unit grid with a 1.5 px stroke so they sit next to it.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** The Oak: a small oak tree with a lobed crown. */
export function OakIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 21v-7" />
      <path d="M12 16l-2.5-2M12 15l2.5-2" />
      <path d="M8.2 13.5a3 3 0 0 1-1.7-5.2 3.2 3.2 0 0 1 3.4-4 3.4 3.4 0 0 1 4.2 0 3.2 3.2 0 0 1 3.4 4 3 3 0 0 1-1.7 5.2" />
      <path d="M8 21h8" />
    </Base>
  );
}

/** Oak leaf: a growth or skill. */
export function LeafIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 21V9" />
      <path d="M12 4c2 1 2.6 2.4 2 3.6 1.8-.4 3 .6 2.6 2-.2.8-1 1.2-1.6 1.4 1.2.5 1.6 1.6 1 2.6-.6 1-2 1-3 .6.2 1.2-.4 2.2-1 2.8-.6-.6-1.2-1.6-1-2.8-1 .4-2.4.4-3-.6-.6-1-.2-2.1 1-2.6-.6-.2-1.4-.6-1.6-1.4-.4-1.4.8-2.4 2.6-2C10 6.4 10 5 12 4Z" />
    </Base>
  );
}

/** Acorn: a milestone or a badge. */
export function AcornIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3v2" />
      <path d="M5 9a7 4 0 0 1 14 0H5Z" />
      <path d="M6 9c0 5 2.7 9 6 11 3.3-2 6-6 6-11" />
    </Base>
  );
}

/** Vinyl ring: the Album. */
export function RingIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="6" strokeOpacity={0.55} />
      <circle cx="12" cy="12" r="2" />
    </Base>
  );
}

/** Tuning fork: Practice (ear training). */
export function TuningForkIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 3v7a3 3 0 0 0 6 0V3" />
      <path d="M12 13v8" />
      <path d="M10 21h4" />
    </Base>
  );
}

/** A rest (banked rest days). */
export function RestIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 4l4 4-3 3 3 4" />
      <path d="M14 15c-3-1-4 1-2 4" />
    </Base>
  );
}

/** A tie (repair). */
export function TieIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 13c3 4 13 4 16 0" />
      <circle cx="4" cy="11" r="1.5" />
      <circle cx="20" cy="11" r="1.5" />
    </Base>
  );
}
