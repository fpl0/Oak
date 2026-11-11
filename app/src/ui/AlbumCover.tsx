// Album covers, "Tree Rings" (ux §5.3): one growth ring per bar, grown from the analysed piece
// (app/src/album/cover.ts, pure and snapshot-tested). Without the music (not analysed yet, or a version that must
// be reviewed before it runs) the cover grows from its seed alone, in the same wood. `draw` animates the rings
// outwards from the pith, the release ceremony; with reduced motion the cover simply appears.
import "../album/cover.css";
import {
  COVER_FONTS,
  COVER_SIZE,
  type CoverInput,
  type CoverModel,
  coverModel,
  type Prim,
  seededRandom,
  WOODS,
} from "../album/cover.ts";
import { PARTS_PALETTE } from "./theme/palette.ts";

export { seededRandom };

/** The album name printed on every cover (ux §5.3: default "Oak Sessions"). */
export const ALBUM_TITLE = "Oak Sessions";

export interface Ring {
  r: number;
  width: number;
  colour: string;
  /** Slight off-centre wobble, as in real wood. */
  dx: number;
  dy: number;
}

/** Seed-only rings in a 100-unit box (radius ≤ 47): small placeholders and icons. */
export function coverRings(seed: string, size = 100): Ring[] {
  const rnd = seededRandom(seed);
  const count = 6 + Math.floor(rnd() * 7);
  const rings: Ring[] = [];
  let r = size * 0.06;
  const step = (size * 0.44 - r) / count;
  for (let i = 0; i < count; i++) {
    r += step * (0.6 + rnd() * 0.8);
    rings.push({
      r: Math.min(r, size * 0.47),
      width: 0.8 + rnd() * 2.6,
      colour: PARTS_PALETTE[Math.floor(rnd() * PARTS_PALETTE.length)] ?? PARTS_PALETTE[0],
      dx: (rnd() - 0.5) * size * 0.02,
      dy: (rnd() - 0.5) * size * 0.02,
    });
  }
  return rings;
}

function PrimEl({ p }: { p: Prim }) {
  switch (p.t) {
    case "circle":
      return (
        <circle
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          fill={p.fill ?? "none"}
          stroke={p.stroke}
          strokeWidth={p.sw}
          opacity={p.op}
        />
      );
    case "path":
      return (
        <path
          d={p.d}
          fill={p.fill ?? "none"}
          stroke={p.stroke}
          strokeWidth={p.sw}
          strokeLinecap={p.cap}
          opacity={p.op}
        />
      );
    case "line":
      return (
        <line
          x1={p.x1}
          y1={p.y1}
          x2={p.x2}
          y2={p.y2}
          stroke={p.stroke}
          strokeWidth={p.sw}
          strokeLinecap="round"
          opacity={p.op}
        />
      );
    case "text":
      return (
        <text
          x={p.x}
          y={p.y}
          fontFamily={COVER_FONTS[p.family]}
          fontSize={p.size}
          fill={p.fill}
          textAnchor={p.anchor}
          fontWeight={p.weight}
          letterSpacing={p.spacing}
          opacity={p.op}
        >
          {p.text}
        </text>
      );
  }
}

export interface AlbumCoverProps {
  seed: string;
  title: string;
  /** Rendered size in px (square). */
  size?: number;
  /** The analysed music; `undefined`/`null` grows the cover from the seed alone. */
  music?: Omit<CoverInput, "title" | "seed" | "albumTitle"> | null;
  /** Bars of a seed-only cover (default from the seed). */
  bars?: number;
  /** Draw the rings outwards from the pith (the release ceremony). */
  draw?: boolean;
  /** Hide the title and album name (thumbnails under 120 px). */
  plain?: boolean;
  /** The music is still being analysed: the wood and the pith, no rings yet. */
  loading?: boolean;
  className?: string;
}

export function AlbumCover({
  seed,
  title,
  size = 160,
  music,
  bars,
  draw,
  plain,
  loading,
  className,
}: AlbumCoverProps) {
  if (loading) {
    const wood = WOODS[music?.flavour ?? "default"] ?? WOODS.default;
    return (
      <svg
        viewBox={`0 0 ${COVER_SIZE} ${COVER_SIZE}`}
        width={size}
        height={size}
        role="img"
        aria-label={`Cover of ${title} (growing)`}
        aria-busy="true"
        className={["oak-cover block shrink-0 rounded-card", className ?? ""].join(" ")}
      >
        <rect width={COVER_SIZE} height={COVER_SIZE} fill={wood.bg} />
        <circle cx={500} cy={500} r={432} fill={wood.early} opacity={0.5} />
        <circle cx={500} cy={500} r={439} fill="none" stroke={wood.line} strokeWidth={10} opacity={0.9} />
        <circle cx={500} cy={500} r={58} fill={wood.line} opacity={0.35} />
      </svg>
    );
  }
  const model: CoverModel = coverModel(
    music
      ? { ...music, title, seed, albumTitle: ALBUM_TITLE }
      : {
          events: null,
          bars: bars ?? 4 + Math.floor(seededRandom(seed)() * 5),
          key: null,
          bpm: null,
          flavour: null,
          title,
          seed,
          albumTitle: ALBUM_TITLE,
        },
  );
  const showText = !plain && size >= 120;
  return (
    <svg
      viewBox={`0 0 ${COVER_SIZE} ${COVER_SIZE}`}
      width={size}
      height={size}
      role="img"
      aria-label={`Cover of ${title}: ${model.summary}`}
      data-cover-rings={model.groups.filter((g) => g.kind === "ring").length}
      className={[
        "oak-cover",
        draw ? "oak-cover-draw" : "",
        "block shrink-0 rounded-card",
        className ?? "",
      ].join(" ")}
    >
      <rect width={COVER_SIZE} height={COVER_SIZE} fill={model.wood.bg} />
      {model.groups.map((g, gi) =>
        g.kind === "text" && !showText ? null : (
          <g
            key={gi}
            className={`oak-cover-${g.kind}`}
            style={g.index === undefined ? undefined : ({ "--i": g.index } as React.CSSProperties)}
          >
            {g.items.map((p, i) => (
              <PrimEl key={i} p={p} />
            ))}
          </g>
        ),
      )}
    </svg>
  );
}
