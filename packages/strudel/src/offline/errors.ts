/** Stable failure codes for an export action; details are suitable for an expandable diagnostic. */
export type RenderErrorCode =
  | "invalid-request"
  | "evaluation"
  | "length"
  | "too-long"
  | "missing-sound"
  | "silent"
  | "tail-limit"
  | "timeout"
  | "aborted"
  | "engine";

export interface RenderFailure {
  code: RenderErrorCode;
  message: string;
  missingSounds: string[];
}

export class PieceRenderError extends Error {
  readonly name = "PieceRenderError";
  constructor(
    readonly code: RenderErrorCode,
    message: string,
    readonly missingSounds: string[] = [],
  ) {
    super(message);
  }

  toJSON(): RenderFailure {
    return { code: this.code, message: this.message, missingSounds: [...this.missingSounds] };
  }
}

export function renderFailure(error: unknown): RenderFailure {
  return error instanceof PieceRenderError
    ? error.toJSON()
    : new PieceRenderError("engine", `The audio render failed: ${String(error)}`).toJSON();
}
