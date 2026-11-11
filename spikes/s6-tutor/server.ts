// Hono app on Bun.serve: POST /api/tutor/chat -> text/event-stream relay of the agent loop.
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { TutorClient } from './client.ts';
import { encodeSse } from './events.ts';
import { LESSON } from './lesson-fixture.ts';
import { runTurn } from './loop.ts';
import { oakContext, type Rung } from './redaction.ts';
import { buildTurnMessages, CHAT_ROUTE, type Prefix, type RouteCfg } from './request.ts';
import { localOrigins, security, type SecurityOpts } from './security.ts';
import { defaultToolCtx } from './tools.ts';

/** Bun passes its Server as the 2nd argument of fetch(); Hono exposes that argument as c.env. */
type Env = { Bindings: Bun.Server<undefined> };

export interface SessionCfg {
  client: TutorClient;
  /** The learner's current hint rung for this step, from server state. */
  rung: Rung;
  route?: RouteCfg;
  /** 0 disables heartbeats (tests only). */
  heartbeatMs?: number;
  /** false leaves Bun's default idleTimeout in force (tests only). */
  disableIdleTimeout?: boolean;
}

export interface TurnEndInfo {
  conversationId: string;
  /** How the handler learned the client was gone (ms since request start, or null if it never fired). */
  streamOnAbortAtMs: number | null;
  reqSignalAbortAtMs: number | null;
  /** 'done', an error kind such as 'aborted', or 'none' if the loop never produced a terminal event. */
  outcome: string;
  events: number;
  ms: number;
}

export interface AppDeps {
  prefix: Prefix;
  security: SecurityOpts;
  /** Per-conversation config. Production: constant client + rung read from SQLite. */
  session(conversationId: string): SessionCfg;
  onRequest?(info: { envIsBunServer: boolean; hasTimeoutFn: boolean }): void;
  onTurnEnd?(info: TurnEndInfo): void;
}

const ChatReq = z.strictObject({
  conversationId: z.string().min(1).max(64),
  text: z.string().min(1).max(8000),
  learnerCode: z.string().max(8000).optional(),
});

export const HEARTBEAT_MS = 5000;

export function createApp(deps: AppDeps): Hono<Env> {
  const app = new Hono<Env>();
  const conversations = new Map<string, BetaMessageParam[]>();

  app.use('/api/*', security(deps.security));

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post('/api/tutor/chat', async (c) => {
    const parsed = ChatReq.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'bad_request' }, 400);
    const { conversationId, text, learnerCode } = parsed.data;
    const cfg = deps.session(conversationId);

    // c.env is the Bun Server (undefined under app.request() in unit tests).
    const server = c.env as Bun.Server<undefined> | undefined;
    const hasTimeoutFn = typeof server?.timeout === 'function';
    deps.onRequest?.({ envIsBunServer: server !== undefined && typeof server.requestIP === 'function', hasTimeoutFn });
    if (cfg.disableIdleTimeout !== false) {
      if (!hasTimeoutFn) return c.json({ error: 'server_misconfigured', detail: 'Bun server not reachable via c.env' }, 500);
      // Per-request: lifts Bun.serve's idleTimeout (default 10 s) for THIS stream only.
      server!.timeout(c.req.raw, 0);
    }

    const conversation = conversations.get(conversationId) ?? [];
    conversations.set(conversationId, conversation);
    const baseLen = conversation.length;
    const turn: Parameters<typeof buildTurnMessages>[0] = {
      userText: text,
      oakContext: oakContext(LESSON, cfg.rung, { attempt: 1, streak: 0, now: new Date().toISOString() }),
    };
    if (learnerCode !== undefined) turn.learnerCode = learnerCode;
    conversation.push(...buildTurnMessages(turn));

    const heartbeatMs = cfg.heartbeatMs ?? HEARTBEAT_MS;
    const t0 = performance.now();

    return streamSSE(c, async (s) => {
      const ac = new AbortController();
      let streamOnAbortAtMs: number | null = null;
      let reqSignalAbortAtMs: number | null = null;
      let outcome = 'none';
      let events = 0;
      // Fires when the client goes away: Bun cancels the response body, Hono turns that into onAbort.
      s.onAbort(() => {
        streamOnAbortAtMs = performance.now() - t0;
        ac.abort();
      });
      // Belt and braces: also listen to the request signal (see FINDINGS for what Bun 1.4.4 does).
      c.req.raw.signal.addEventListener(
        'abort',
        () => {
          reqSignalAbortAtMs = performance.now() - t0;
          ac.abort();
        },
        { once: true },
      );

      const hb = heartbeatMs > 0 ? setInterval(() => void s.write(': ping\n\n'), heartbeatMs) : undefined;
      try {
        for await (const ev of runTurn({
          client: cfg.client,
          prefix: deps.prefix,
          route: cfg.route ?? CHAT_ROUTE,
          conversation,
          toolCtx: defaultToolCtx(cfg.rung),
          signal: ac.signal,
        })) {
          events++;
          if (ev.type === 'done') outcome = 'done';
          else if (ev.type === 'error') outcome = ev.data.kind;
          if (ev.type === 'error' && conversation.length > baseLen && ev.data.kind !== 'iteration_limit') {
            // Failed turn: drop the user+context we optimistically appended IF the loop appended nothing
            // after them, so a retry does not duplicate the question. (Tail-only; history is untouched.)
            if (conversation.length === baseLen + 2) conversation.length = baseLen;
          }
          await s.write(encodeSse(ev));
        }
      } finally {
        if (hb) clearInterval(hb);
        ac.abort(); // make sure nothing upstream outlives the response
        deps.onTurnEnd?.({ conversationId, streamOnAbortAtMs, reqSignalAbortAtMs, outcome, events, ms: performance.now() - t0 });
      }
    });
  });

  return app;
}

export interface StartOpts extends Omit<AppDeps, 'security'> {
  port: number;
  security?: SecurityOpts;
  /** Leave undefined in production (Bun default = 10 s). Tests may pin it to prove a point. */
  idleTimeout?: number;
}

export function startServer(opts: StartOpts): Bun.Server<undefined> {
  const app = createApp({ ...opts, security: opts.security ?? localOrigins(opts.port) });
  const serveOpts: Bun.Serve.Options<undefined> = {
    hostname: '127.0.0.1', // never 0.0.0.0
    port: opts.port,
    fetch: app.fetch, // Bun calls fetch(req, server); Hono receives `server` as Env -> c.env
  };
  if (opts.idleTimeout !== undefined) serveOpts.idleTimeout = opts.idleTimeout;
  return Bun.serve(serveOpts);
}
