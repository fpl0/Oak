// The key ribbon (Wave 6, the key lens, `tb.scale.patterned`; docs/design/wave6.md §4.3): a strip over the roll, on
// the roll's own time axis, naming the key in force along the piece, with a mark at each change saying how far the
// key moved ("+2: up a step"). Drawn only for a piece that changes key; the spans come from the grader's
// `keyPlanView` (colour.ts), the same plan the numerals and the degree labels are read in.
import type { KeyRibbonSpan } from "./colour.ts";
import type { RibbonAxis } from "./SectionRibbon.tsx";

export interface KeyRibbonProps {
  spans: readonly KeyRibbonSpan[];
  axis: RibbonAxis;
  /** The bar that plays (0-based), `null` when stopped. */
  currentBar: number | null;
  /** Bar 0 is a pickup: bar numbers count from the first full bar. */
  pickup: boolean;
}

/** Narrower than this a span's change mark shows only its number ("+2"), so the key's name stays readable. */
export const RIBBON_WORDS_MIN_PX = 190;

export function KeyRibbon({ spans, axis, currentBar, pickup }: KeyRibbonProps) {
  if (spans.length < 2) return null;
  const visible = spans.filter((s) => s.to > axis.from + 1e-9 && s.from < axis.to - 1e-9);
  const barOf = (cycle: number) => Math.floor(cycle + 1e-9) + (pickup ? 0 : 1);
  const said = spans
    .map((s, i) =>
      i === 0
        ? `${s.text} from bar ${barOf(s.from)}`
        : `${s.text} from bar ${barOf(s.from)} (${s.change?.text ?? "a new key"})`,
    )
    .join(", then ");
  return (
    <ol
      className="oak-keyribbon"
      aria-label={`Key along the piece: ${said}`}
      data-testid="key-ribbon"
      data-keys={spans.map((s) => s.text).join(" → ")}
      style={{ width: axis.width }}
    >
      {visible.map((s) => {
        const left = Math.max(axis.left, axis.xOf(Math.max(axis.from, s.from)));
        const right = Math.min(axis.width, axis.xOf(Math.min(axis.to, s.to)));
        const here = currentBar !== null && currentBar >= s.from - 1e-9 && currentBar < s.to - 1e-9;
        // The change mark belongs to the bar line the key changes on: shown only when that bar is in view.
        const change = s.change && s.from >= axis.from - 1e-9 ? s.change : null;
        // A span of a bar or two has no room for "+2: up a step" and the key's name: the mark keeps its number, a
        // major key is named by its tonic ("B♭", as a chord chart does), and the words stay in the hover and the
        // list's label (five keys in six bars cut every name to "E m…").
        const width = right - left;
        const roomy = width >= RIBBON_WORDS_MIN_PX;
        const mark = change ? (roomy ? change.text : (change.text.split(":")[0] ?? change.text)) : null;
        return (
          <li
            key={`${s.from}-${s.text}`}
            className={`oak-keyribbon-span${change ? " oak-keyribbon-span--change" : ""}`}
            style={{ left, width: Math.max(4, right - left - 1) }}
            data-key={s.text}
            data-from={s.from}
            data-current={here ? "1" : undefined}
            title={
              change
                ? `${s.text} from bar ${barOf(s.from)}: ${change.words}`
                : `${s.text} from bar ${barOf(s.from)}`
            }
          >
            {change ? (
              <span className="oak-keyribbon-change" data-testid="key-change" data-words={change.text}>
                {mark}
              </span>
            ) : null}
            <span className="oak-keyribbon-name">{roomy ? s.text : s.text.replace(/ major$/, "")}</span>
          </li>
        );
      })}
    </ol>
  );
}
