// The optional side lesson on Today and in the Coda (wave5.md §5.1, side-lessons.ts): one calm line, set apart
// from the session's own action — never a primary button, never a count of what is left. `alternative` sits under
// today's Start; `after-core` reads "One more, if you like" once the planned session has ended.
import { AudioWaveform } from "lucide-react";
import { Button } from "../../ui/kit/Button.tsx";
import type { SideOffer } from "../side-lessons.ts";

export function SideOfferLine({
  offer,
  onStart,
  disabled,
}: {
  offer: SideOffer;
  onStart(): void;
  disabled?: boolean;
}) {
  const after = offer.placement === "after-core";
  return (
    <div
      className={
        after
          ? "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-border px-3 py-2"
          : "flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3"
      }
      data-testid="side-offer"
      data-placement={offer.placement}
      data-lesson={offer.lessonId}
    >
      <AudioWaveform aria-hidden className="size-4 shrink-0 text-text-3" />
      <p
        className="min-w-0 flex-1 text-sm text-text-2"
        title={after ? undefined : (offer.detail ?? undefined)}
      >
        {after && <span className="font-medium text-text">One more, if you like. </span>}
        <span data-testid="side-offer-line">{offer.line}</span>
        {/* Beside today's session it stays one line; after the session there is room to say what it gives. */}
        {after && offer.detail && <span className="block text-text-3">{offer.detail}</span>}
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onStart}
        disabled={disabled}
        data-testid="side-offer-start"
        aria-label={`${offer.resume ? "Continue" : "Start"} the optional side lesson ${offer.name}`}
      >
        {offer.resume ? "Continue it" : "Start it"}
      </Button>
    </div>
  );
}

/** A syllabus line with `code` spans (lesson objectives name tools: "`const` pattern variables"). */
export function InlineCodeText({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-surface-2 px-1 font-mono text-[0.85em]">
            {p}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
