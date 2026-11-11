// Mounts one endpoint of the `@oak/api` contract: validates params, query and body with the contract's
// zod schemas, enforces the confirm nonce of destructive endpoints, and (in dev and tests) validates the
// response too, so the server can never drift from the table the client is typed against.
import {
  API_PREFIX,
  contract,
  type EndpointName,
  type EndpointOutput,
  type HandlerInput,
  HEADERS,
} from "@oak/api";
import type { Context, Hono } from "hono";
import type { z } from "zod";
import type { ConfirmStore } from "../confirm.ts";
import { ApiError, type ApiIssue, badRequest, errorResponse } from "../errors.ts";
import { MAX_AUDIO_BYTES, MAX_PEAKS_BYTES } from "../services/audio-store.ts";

type Def<N extends EndpointName> = (typeof contract)[N];

/** A raw upload: `body: "binary"` endpoints get the bytes and the declared type. */
type BinaryOf<N extends EndpointName> =
  Def<N> extends { body: "binary" } ? { bytes: Uint8Array; contentType: string } : unknown;

export type RouteInput<N extends EndpointName> = HandlerInput<N> & BinaryOf<N>;
export type RouteResult<N extends EndpointName> = EndpointOutput<N> | Response;
export type RouteHandler<N extends EndpointName> = (
  input: RouteInput<N>,
  c: Context,
) => RouteResult<N> | Promise<RouteResult<N>>;

export interface MountOptions<N extends EndpointName> {
  /** The confirm target of a destructive endpoint (default: the `id` param, else `*`). */
  target?: (input: RouteInput<N>) => string;
}

export type Mounter = <N extends EndpointName>(
  name: N,
  handler: RouteHandler<N>,
  opts?: MountOptions<N>,
) => void;

/** Largest JSON body accepted (a full code string plus a grade result fits many times over). */
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
/** Largest raw upload: a backup archive with all its audio. */
export const MAX_BINARY_BYTES = 1024 * 1024 * 1024;
/**
 * Tighter limits per binary endpoint, enforced while the body streams in (a declared Content-Length over
 * the limit is refused before any byte is read), so a peaks upload cannot make the server buffer a
 * gigabyte before the service's own check refuses it.
 */
export const BINARY_LIMITS: Partial<Record<EndpointName, number>> = {
  "audio.upload": MAX_AUDIO_BYTES,
  "album.putAudio": MAX_AUDIO_BYTES,
  "audio.putPeaks": MAX_PEAKS_BYTES,
};

/**
 * The request body, read chunk by chunk and abandoned as soon as it passes `max` bytes (`null`). A
 * declared `Content-Length` over the limit is refused before anything is read; a chunked body without
 * one is cut off at the limit instead of being buffered to its end.
 */
export async function readBounded(req: Request, max: number): Promise<Uint8Array | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && declared.trim() !== "") {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0 || n > max) return null;
  }
  if (req.body === null) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (chunks.length === 1) return chunks[0] as Uint8Array;
  const out = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.byteLength;
  }
  return out;
}

function issuesOf(error: z.ZodError, prefix: string): ApiIssue[] {
  return error.issues
    .slice(0, 30)
    .map((i) => ({ path: [prefix, ...i.path.map(String)].join("."), message: i.message }));
}

export function createMounter(
  app: Hono,
  deps: { confirm: ConfirmStore; validateResponses: boolean; log?: (msg: string) => void },
): Mounter {
  return <N extends EndpointName>(name: N, handler: RouteHandler<N>, opts: MountOptions<N> = {}) => {
    const def = contract[name] as Def<N> & {
      method: string;
      path: string;
      params?: z.ZodType;
      query?: z.ZodType;
      body?: z.ZodType | "binary";
      res: z.ZodType | "binary" | "sse";
      confirm?: Parameters<ConfirmStore["consume"]>[1];
    };
    const path = `${API_PREFIX}${def.path}`;
    app.on(def.method, path, async (c) => {
      const input: Record<string, unknown> = {};
      if (def.params !== undefined) {
        const r = def.params.safeParse(c.req.param());
        if (!r.success)
          return errorResponse(badRequest("invalid path parameters", issuesOf(r.error, "params")));
        input.params = r.data;
      }
      if (def.query !== undefined) {
        const r = def.query.safeParse(c.req.query());
        if (!r.success) return errorResponse(badRequest("invalid query", issuesOf(r.error, "query")));
        input.query = r.data;
      }
      if (def.body === "binary") {
        const bytes = await readBounded(c.req.raw, BINARY_LIMITS[name] ?? MAX_BINARY_BYTES);
        if (bytes === null) return errorResponse(new ApiError("payload_too_large", "upload too large"));
        input.bytes = bytes;
        input.contentType = c.req.header("content-type") ?? "application/octet-stream";
      } else if (def.body !== undefined) {
        const raw = await readBounded(c.req.raw, MAX_JSON_BYTES);
        if (raw === null) return errorResponse(new ApiError("payload_too_large", "request body too large"));
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
        } catch {
          return errorResponse(badRequest("the body is not valid UTF-8"));
        }
        let json: unknown;
        try {
          json = text === "" ? undefined : JSON.parse(text);
        } catch {
          return errorResponse(badRequest("the body is not valid JSON"));
        }
        const r = def.body.safeParse(json);
        if (!r.success) return errorResponse(badRequest("invalid body", issuesOf(r.error, "body")));
        input.body = r.data;
      }
      if (def.confirm !== undefined) {
        const typed = input as RouteInput<N>;
        const params = input.params as { id?: string } | undefined;
        const target = opts.target?.(typed) ?? params?.id ?? "*";
        if (!deps.confirm.consume(c.req.header(HEADERS.confirm), def.confirm, target))
          return errorResponse(
            new ApiError("confirm_required", `confirm this action first (${def.confirm})`),
          );
      }
      const out = await handler(input as RouteInput<N>, c);
      if (out instanceof Response) return out;
      if (deps.validateResponses && typeof def.res === "object") {
        const r = def.res.safeParse(out);
        if (!r.success) {
          deps.log?.(
            `${name}: response does not match the contract: ${JSON.stringify(issuesOf(r.error, "res"))}`,
          );
          return errorResponse(
            new ApiError(
              "internal",
              `${name}: response does not match the contract`,
              issuesOf(r.error, "res"),
            ),
          );
        }
      }
      return c.json(out as object, 200, { "cache-control": "no-store" });
    });
  };
}
