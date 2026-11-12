// One error type for every non-2xx JSON answer: `{ error: { code, message, issues? } }` (ApiErrorBody).
import type { ApiErrorBody } from "@oak/api";

export type ApiErrorCode = ApiErrorBody["error"]["code"];
export type ApiIssue = { path: string; message: string };

const STATUS: Readonly<Record<ApiErrorCode, 400 | 403 | 404 | 409 | 413 | 428 | 500 | 501 | 503>> = {
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  confirm_required: 428,
  unavailable: 503,
  internal: 500,
  not_implemented: 501,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly issues: ApiIssue[] | undefined;
  constructor(code: ApiErrorCode, message: string, issues?: ApiIssue[]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.issues = issues;
  }
  get status() {
    return STATUS[this.code];
  }
  body(): ApiErrorBody {
    const error: ApiErrorBody["error"] = { code: this.code, message: this.message };
    if (this.issues !== undefined) error.issues = this.issues;
    return { error };
  }
}

export const badRequest = (message: string, issues?: ApiIssue[]) =>
  new ApiError("bad_request", message, issues);
export const notFound = (what: string) => new ApiError("not_found", `${what} not found`);
export const conflict = (message: string) => new ApiError("conflict", message);
export const forbidden = (message: string) => new ApiError("forbidden", message);
export const unavailable = (message: string) => new ApiError("unavailable", message);
/** The typed stub of an endpoint whose handler is not built yet (docs/design/wave2.md §4, wave3.md §5). */
export const notImplemented = (endpoint: string) =>
  new ApiError("not_implemented", `${endpoint} is not implemented yet`);

export function errorResponse(err: ApiError): Response {
  return Response.json(err.body(), { status: err.status, headers: { "cache-control": "no-store" } });
}
