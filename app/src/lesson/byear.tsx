// A by-ear transcription step (wave3.md §10, `DictationEx.byEar`): the source plays with its code, roll and staff
// hidden; the learner writes code in the Workbench and switches between the source and their own code at the
// bar (the Workbench's A/B, `A`/`B` and Shift+A), at full speed or slower here, the whole source or one bar on a
// loop. The rule of what counts (exact, any octave, any key) is shown before they start. Wave 4: a step in parts
// (`byEar.parts`, the bass first) plays one part's track alone on request and checks each part on its own before
// the step's Check opens. Once solved or revealed, the source's roll and staff appear.
import { useState } from "react";
import { Button } from "../ui/kit/Button.tsx";
import { useStepHost } from "./frame.tsx";
import { CodeMusic } from "./music.tsx";
import { acceptsText, type ByEarEx, byEarSource } from "./rules.ts";
import { SourcePlayer } from "./source-player.tsx";
import { hasParts, trackOnly } from "./stages.ts";

/** The rule and the source's own player (rates, the whole loop or one bar); the A/B is on the Workbench. */
export function ByEarPanel({ ex, track = null }: { ex: ByEarEx; track?: string | null }) {
  const h = useStepHost();
  const rule = acceptsText(ex.byEar.accepts);
  const src = byEarSource(ex);
  // In parts: the part on now can be heard alone (its own track of the source), or everything together.
  const parts = hasParts(ex) ? ex.byEar.parts : [];
  const open = parts.find((p) => p.track === track) ?? null;
  const [alone, setAlone] = useState(false);
  const aloneCode = open ? trackOnly(src.code, open.track) : null;
  const code = alone && aloneCode ? aloneCode : src.code;
  return (
    <section
      aria-label="The tune to write down"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3"
      data-testid="by-ear"
      data-accepts={ex.byEar.accepts}
    >
      <div>
        <p className="text-sm font-medium" data-testid="by-ear-rule">
          What counts: {rule.title.toLowerCase()}
        </p>
        <p className="text-sm text-text-2">{rule.body}</p>
      </div>
      {open && aloneCode ? (
        <div role="radiogroup" aria-label="What the source plays" className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            role="radio"
            aria-checked={!alone}
            variant={alone ? "secondary" : "primary"}
            onClick={() => setAlone(false)}
            data-testid="hear-all"
          >
            Everything
          </Button>
          <Button
            size="sm"
            role="radio"
            aria-checked={alone}
            variant={alone ? "primary" : "secondary"}
            onClick={() => setAlone(true)}
            data-testid="hear-part"
          >
            Only the {open.track}
          </Button>
        </div>
      ) : null}
      <SourcePlayer
        key={code}
        code={code}
        bars={src.bars}
        rates={ex.byEar.rates}
        noun="tune"
        testId="by-ear-source"
      />
      {ex.byEar.ab && (
        <p className="text-sm text-text-3">
          On the Workbench, A plays your code and B the tune, switching at the next bar line.
        </p>
      )}
      {h.passed || h.rung >= 4 ? <SourceRevealed ex={ex} /> : null}
    </section>
  );
}

/** After a pass or the reveal: the source on the roll and the staff, to compare with what you wrote. */
function SourceRevealed({ ex }: { ex: ByEarEx }) {
  const src = byEarSource(ex);
  return (
    <div className="flex flex-col gap-2" data-testid="source-revealed">
      <p className="text-sm font-medium">The tune, as it was written</p>
      <CodeMusic code={src.code} bars={src.bars} view="roll" label="The tune on the roll" />
      <CodeMusic code={src.code} bars={src.bars} view="staff" label="The tune on the staff" />
    </div>
  );
}
