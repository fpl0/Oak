import { lintBase, lintStrict } from "@oak/grader";
import { PieceRenderError } from "./errors.ts";

/** The same mandatory profiles as the editor: learner code is base; authored Band code is strict. */
export function validateSource(code: string, authored = false): void {
  const diagnostics = (authored ? lintStrict : lintBase)(code).filter((d) => d.severity === "error");
  if (diagnostics.length)
    throw new PieceRenderError(
      "evaluation",
      `${authored ? "Band" : "Piece"}: ${diagnostics.map((d) => d.message).join(" ")}`,
    );
}
