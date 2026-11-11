// The tutor endpoints of the `@oak/api` contract whose wire shape the tutor's own app does not serve:
// the merged timeline, the usage report, notes, card applied and note retract. The turn routes (chat,
// hint, note, reviews) and warm-up are the tutor app's, mounted after these (tutor-wiring.ts).
import {
  API_PREFIX,
  contract,
  TUTOR_ROUTE_OF,
  type TutorTurnRequest,
  TutorTurnRequestSchema,
  type TutorUsageReport,
} from "@oak/api";
import type { Hono } from "hono";
import type { AppDeps } from "../deps.ts";
import { ApiError, badRequest, conflict, errorResponse, notFound } from "../errors.ts";
import { LANES } from "../tutor/types.ts";
import { MAX_JSON_BYTES, type Mounter, readBounded } from "./define.ts";

export function tutorRoutes(mount: Mounter, d: AppDeps): void {
  const tutor = () => {
    if (d.tutor === null) throw new ApiError("unavailable", "the tutor is not available");
    return d.tutor;
  };
  const card = (id: string) => {
    const c = d.repos.tutor.card(id);
    if (c === null) throw notFound(`card ${id}`);
    const { appliedAt: _a, savedSketchId: _s, createdAt: _c, ...out } = c;
    return out;
  };

  mount("tutor.warm", async () => {
    // Fire-and-forget from the browser: it never fails the page, it says whether a cache write happened.
    if (d.tutor === null) return { ok: true, warmed: false };
    const r = await d.tutor.service.warm();
    return { ok: true, warmed: r.warmed };
  });

  mount("tutor.timeline", async ({ query }) => {
    const subject = { subjectKind: query.subjectKind, subjectId: query.subjectId };
    const facts = await tutor().lessons.subject(subject);
    const ids = d.repos.tutor.conversationIdsOf(subject.subjectKind, subject.subjectId);
    return {
      subject,
      entries: d.repos.tutor.subjectEntries(subject.subjectKind, subject.subjectId, {
        includeExcluded: false,
      }),
      cards: d.repos.tutor.cardsOf(ids).map((c) => card(c.cardId)),
      notes: d.repos.tutor.notes({ subjectKind: subject.subjectKind, subjectId: subject.subjectId }),
      tutorOpen: facts.tutorOpen,
      closedReason: facts.closedReason,
    };
  });

  mount("tutor.usage", async ({ query }) => {
    const month = query.month ?? d.services.streak.time.day().slice(0, 7);
    const m = d.repos.tutor.month(month);
    const settings = d.repos.settings.get("tutor");
    const status = d.tutor === null ? { backend: null } : await d.tutor.status();
    const byLane = new Map(d.repos.tutor.byLane(month).map((l) => [l.lane, l]));
    const totalIn = m.inputTokens + m.cacheReadInputTokens + m.cacheCreationInputTokens;
    const report: TutorUsageReport = {
      month,
      activeBackend: status.backend,
      costUsd: m.costUsd,
      includedInPlan: m.includedInPlan,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheReadInputTokens: m.cacheReadInputTokens,
      cacheCreationInputTokens: m.cacheCreationInputTokens,
      cacheHitRatio: totalIn === 0 ? 0 : m.cacheReadInputTokens / totalIn,
      byLane: LANES.map(
        (lane) => byLane.get(lane) ?? { lane, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
      ),
      softMonthlyUsd: settings.softMonthlyUsd,
      softPassed: m.costUsd >= settings.softMonthlyUsd,
    };
    return report;
  });

  mount("tutor.notes", ({ query }) => ({
    items: d.repos.tutor.notes({
      ...(query.subjectKind === undefined ? {} : { subjectKind: query.subjectKind }),
      ...(query.subjectId === undefined ? {} : { subjectId: query.subjectId }),
    }),
  }));

  mount("tutor.cardApplied", async ({ params, body }) => {
    const before = d.repos.tutor.card(params.id);
    if (before === null) throw notFound(`card ${params.id}`);
    // Preview-only cards are refused here too, not only by a missing button (contracts §10.7).
    const outcome = await tutor().service.applyCard(params.id);
    if (outcome === "unknown") throw notFound(`card ${params.id}`);
    if (outcome === "refused") throw conflict("this card is a preview: it cannot be applied");
    if (body.sketchId !== null && d.repos.sketches.get(body.sketchId) === null)
      throw notFound(`sketch ${body.sketchId}`);
    d.repos.tutor.markApplied(params.id, d.clock.now().toISOString(), body.sketchId);
    return card(params.id);
  });

  mount("tutor.retractNote", async ({ params }) => {
    if (d.repos.tutor.note(params.id) === null) throw notFound(`note ${params.id}`);
    await tutor().service.retractNote(params.id);
    const note = d.repos.tutor.note(params.id);
    if (note === null) throw notFound(`note ${params.id}`);
    return note;
  });
}

/** Where the tutor's own app serves each request kind (server/src/tutor/http/routes.ts `TURN_ROUTES`). */
const TUTOR_PATH_OF: Readonly<Record<TutorTurnRequest["kind"], string>> = {
  chat: "/tutor/chat",
  hint: "/tutor/hint",
  explain: "/tutor/explain-mistake",
  listening: "/tutor/note",
  "review-capstone": "/tutor/reviews/capstone",
  "review-transcription": "/tutor/reviews/transcription",
};
const REVIEW_KINDS = new Set<TutorTurnRequest["kind"]>(["review-capstone", "review-transcription"]);

/**
 * The SSE turn endpoints of the contract. The browser sends `TutorTurnRequest` (with `kind`, and
 * `explain` arrives on `tutor.hint`); the tutor's routes fix the kind by path and refuse a `kind`
 * key, and a review body carries only the subject and a note (the server holds the piece). This
 * validates the contract body, checks the kind belongs to the endpoint, and forwards the tutor's
 * body to the tutor's path, keeping the request's headers, signal and Bun server.
 */
export function tutorTurnRoutes(app: Hono, d: AppDeps): void {
  const endpoints = [
    "tutor.chat",
    "tutor.hint",
    "tutor.note",
    "tutor.reviewCapstone",
    "tutor.reviewTranscription",
  ] as const;
  for (const name of endpoints) {
    app.post(`${API_PREFIX}${contract[name].path}`, async (c) => {
      if (d.tutor === null) return errorResponse(new ApiError("unavailable", "the tutor is not available"));
      const raw = await readBounded(c.req.raw, MAX_JSON_BYTES);
      if (raw === null) return errorResponse(new ApiError("payload_too_large", "request body too large"));
      let json: unknown;
      try {
        json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
      } catch {
        return errorResponse(badRequest("the body is not valid JSON"));
      }
      const parsed = TutorTurnRequestSchema.safeParse(json);
      if (!parsed.success)
        return errorResponse(
          badRequest(
            "invalid tutor request",
            parsed.error.issues
              .slice(0, 20)
              .map((i) => ({ path: ["body", ...i.path.map(String)].join("."), message: i.message })),
          ),
        );
      const { kind, ...rest } = parsed.data;
      if (TUTOR_ROUTE_OF[kind] !== name)
        return errorResponse(badRequest(`a ${kind} request does not belong on ${contract[name].path}`));
      const body = REVIEW_KINDS.has(kind) ? { thread: rest.thread, userText: rest.userText } : rest;
      const headers = new Headers(c.req.raw.headers);
      headers.delete("content-length");
      headers.set("content-type", "application/json");
      const url = new URL(c.req.url);
      url.pathname = `${API_PREFIX}${TUTOR_PATH_OF[kind]}`;
      const forwarded = new Request(url.href, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: c.req.raw.signal,
      });
      return d.tutor.app.fetch(forwarded, c.env);
    });
  }
}
