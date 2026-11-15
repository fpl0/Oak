import { renderToStaticMarkup } from "react-dom/server";
import { type DrawingProps, TreeDrawing } from "./TreeDrawing.tsx";
import { TREE_PALETTE } from "./visual.ts";

/** Standalone, deterministic SVG: identical geometry and glyphs to the interactive scene. */
export function illustratedOakSvg(props: Omit<DrawingProps, "renderLeaf" | "renderAcorn">): string {
  return renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${props.layout.width} ${props.layout.height}`}
      role="img"
      aria-label="The Oak: your music taking root"
    >
      <title>The Oak: your music taking root</title>
      <rect width={props.layout.width} height={props.layout.height} fill={TREE_PALETTE[props.theme].bg} />
      <TreeDrawing {...props} />
    </svg>,
  );
}
