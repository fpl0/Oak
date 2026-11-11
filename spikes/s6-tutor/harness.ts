// Shared test harness: run one learner turn through the loop with either fake client.
import type { BetaMessageParam, BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Cassette } from './cassette.ts';
import type { TutorClient } from './client.ts';
import type { TutorEvent } from './events.ts';
import { FakeTutorClient, sdkCassetteClient, type WireRequest } from './fake-client.ts';
import { LEARNER_CODE, LESSON } from './lesson-fixture.ts';
import { runTurn } from './loop.ts';
import { oakContext, type Rung } from './redaction.ts';
import { buildTurnMessages, CHAT_ROUTE, type Prefix, type RouteCfg } from './request.ts';
import { defaultToolCtx } from './tools.ts';

export type FakeKind = 'pure-fake' | 'sdk+fake-fetch';
export const FAKE_KINDS: FakeKind[] = ['pure-fake', 'sdk+fake-fetch'];

export const PREFIX: Prefix = {
  persona: 'You are Oak\'s tutor. You are Socratic and never decide pass/fail.',
  syllabus: 'Syllabus v1\nu03.04 Scale degrees in code — objectives: arpeggios, zero-based n().',
  catalog: 'Catalog v1\nn(pattern) — scale steps, zero-based.\nscale(name) — e.g. "D:dorian".',
};

export interface Harness {
  client: TutorClient;
  /** Request params as the loop passed them (pure fake) or as the SDK put them on the wire (sdk fake). */
  sent(): { params: BetaMessageStreamParams; json: string }[];
  wire: WireRequest[];
  aborted(): boolean[];
}

export function makeClient(kind: FakeKind, cassette: Cassette): Harness {
  if (kind === 'pure-fake') {
    const c = new FakeTutorClient(cassette);
    return { client: c, sent: () => c.requests, wire: [], aborted: () => c.requests.map((r) => r.aborted) };
  }
  const s = sdkCassetteClient(cassette);
  return {
    client: s.client,
    sent: () => s.wire.map((w) => ({ params: w.body as unknown as BetaMessageStreamParams, json: w.bodyText })),
    wire: s.wire,
    aborted: () => s.wire.map((w) => w.aborted),
  };
}

export interface TurnResult {
  events: TutorEvent[];
  conversation: BetaMessageParam[];
  h: Harness;
}

export async function runCassette(
  kind: FakeKind,
  cassette: Cassette,
  opts: { rung?: Rung; route?: RouteCfg; signal?: AbortSignal; conversation?: BetaMessageParam[]; userText?: string } = {},
): Promise<TurnResult> {
  const rung = opts.rung ?? 0;
  const h = makeClient(kind, cassette);
  const conversation = opts.conversation ?? [];
  conversation.push(
    ...buildTurnMessages({
      userText: opts.userText ?? 'Why does my arpeggio sound unfinished?',
      learnerCode: LEARNER_CODE,
      oakContext: oakContext(LESSON, rung, { attempt: 3, streak: 6, now: '2026-11-11T09:00' }),
    }),
  );
  const events: TutorEvent[] = [];
  for await (const ev of runTurn({
    client: h.client,
    prefix: PREFIX,
    route: opts.route ?? CHAT_ROUTE,
    conversation,
    toolCtx: defaultToolCtx(rung),
    signal: opts.signal ?? new AbortController().signal,
  })) {
    events.push(ev);
  }
  return { events, conversation, h };
}

export function textOf(events: TutorEvent[]): string {
  return events.flatMap((e) => (e.type === 'text' ? [e.data.delta] : [])).join('');
}
