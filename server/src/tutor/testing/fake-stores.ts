// In-memory conversation store, notes store and clock. Test code only.
import type { TutorNote } from "../domain.ts";
import type {
  CardRecord,
  Clock,
  ConversationRecord,
  ConversationStore,
  NewCard,
  NewConversation,
  NewTutorNote,
  TutorNotesStore,
} from "../ports.ts";
import { conversationId } from "../threads.ts";
import type {
  BackendId,
  ConversationKey,
  NewTranscriptEntry,
  SubjectRef,
  TranscriptEntry,
} from "../types.ts";

function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

export class FixedClock implements Clock {
  #now: Date;
  #zone: string;
  constructor(iso = "2026-11-11T15:00:00Z", zone = "UTC") {
    this.#now = new Date(iso);
    this.#zone = zone;
  }
  now(): Date {
    return new Date(this.#now);
  }
  timeZone(): string {
    return this.#zone;
  }
  set(iso: string): void {
    this.#now = new Date(iso);
  }
  advance(ms: number): void {
    this.#now = new Date(this.#now.getTime() + ms);
  }
}

/**
 * Append-only, like the real table with its triggers: there is no update and no delete, and every
 * stored entry is deep-frozen, so an attempt to change history throws (in strict mode, which all
 * ES modules are).
 */
export class InMemoryConversationStore implements ConversationStore {
  readonly #conversations = new Map<string, ConversationRecord>();
  readonly #entries: TranscriptEntry[] = [];
  readonly #records: { conversationId: string; backend: BackendId; record: unknown; excluded: boolean }[] =
    [];
  readonly #cards = new Map<string, CardRecord>();
  readonly #clock: Clock;
  #tick = 0;

  constructor(clock: Clock = new FixedClock()) {
    this.#clock = clock;
  }

  async find(key: ConversationKey): Promise<ConversationRecord | null> {
    return this.#conversations.get(conversationId(key)) ?? null;
  }

  async create(init: NewConversation): Promise<ConversationRecord> {
    if (this.#conversations.has(init.id)) throw new Error(`UNIQUE constraint failed: ${init.id}`);
    const record = deepFreeze({ ...init, key: { ...init.key }, createdAt: this.#clock.now().toISOString() });
    this.#conversations.set(init.id, record);
    return record;
  }

  async entries(id: string, opts: { includeExcluded?: boolean } = {}): Promise<TranscriptEntry[]> {
    return this.#entries.filter(
      (e) => e.conversationId === id && (opts.includeExcluded === true || !e.excluded),
    );
  }

  async append(id: string, entry: NewTranscriptEntry): Promise<TranscriptEntry> {
    if (!this.#conversations.has(id)) throw new Error(`no conversation ${id}`);
    const seq = this.#entries.filter((e) => e.conversationId === id).length + 1;
    // Entries of one instant keep their order: the stored time grows by a millisecond per append.
    const at = new Date(this.#clock.now().getTime() + this.#tick++).toISOString();
    const stored = deepFreeze({ ...structuredClone(entry), conversationId: id, seq, at });
    this.#entries.push(stored);
    return stored;
  }

  #ofSubject(subject: SubjectRef): TranscriptEntry[] {
    const prefix = `${subject.subjectKind}:${subject.subjectId}:`;
    return this.#entries.filter((e) => e.conversationId.startsWith(prefix));
  }

  async subjectDay(subject: SubjectRef, day: string): Promise<TranscriptEntry[]> {
    const prefix = `${subject.subjectKind}:${subject.subjectId}:${day}:`;
    return this.#entries.filter((e) => e.conversationId.startsWith(prefix) && !e.excluded);
  }

  async timeline(subject: SubjectRef): Promise<TranscriptEntry[]> {
    return this.#ofSubject(subject);
  }

  async backendRecords(id: string, backend: BackendId): Promise<unknown[]> {
    return this.#records
      .filter((r) => r.conversationId === id && r.backend === backend && !r.excluded)
      .map((r) => r.record);
  }

  async appendBackendRecords(
    id: string,
    backend: BackendId,
    records: readonly unknown[],
    opts: { excluded: boolean },
  ): Promise<void> {
    for (const record of records) {
      this.#records.push({
        conversationId: id,
        backend,
        record: deepFreeze(structuredClone(record)),
        excluded: opts.excluded,
      });
    }
  }

  async saveCard(card: NewCard): Promise<CardRecord> {
    const saved: CardRecord = {
      ...card,
      lockedTools: [...card.lockedTools],
      cardId: `card-${this.#cards.size + 1}`,
      applied: false,
    };
    this.#cards.set(saved.cardId, saved);
    return { ...saved };
  }

  async card(cardId: string): Promise<CardRecord | null> {
    const c = this.#cards.get(cardId);
    return c ? { ...c } : null;
  }

  async markCardApplied(cardId: string): Promise<void> {
    const c = this.#cards.get(cardId);
    if (c) c.applied = true;
  }

  /** Test helper: every backend record, excluded ones included. */
  allBackendRecords(): readonly {
    conversationId: string;
    backend: BackendId;
    record: unknown;
    excluded: boolean;
  }[] {
    return this.#records;
  }
}

export class InMemoryNotesStore implements TutorNotesStore {
  readonly notes: TutorNote[] = [];

  async recent(subject: SubjectRef, limit: number): Promise<TutorNote[]> {
    return this.notes
      .filter(
        (n) =>
          n.retractedAt === null &&
          n.subjectKind === subject.subjectKind &&
          n.subjectId === subject.subjectId,
      )
      .reverse()
      .slice(0, limit);
  }

  async add(note: NewTutorNote): Promise<TutorNote> {
    const stored: TutorNote = { ...note, id: `note-${this.notes.length + 1}`, retractedAt: null };
    this.notes.push(stored);
    return stored;
  }

  async retract(id: string, at: string): Promise<void> {
    const n = this.notes.find((x) => x.id === id);
    if (n) n.retractedAt = at;
  }
}
