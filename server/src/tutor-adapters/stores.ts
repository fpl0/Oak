// SQLite adapters for the tutor's storage ports: ConversationStore, TutorNotesStore, UsageSink,
// SettingsPort and Clock. Messages and backend records are append-only (triggers); entries come back
// exactly as appended.
import type { Repos } from "../db/repos/index.ts";
import { newId } from "../services/context.ts";
import type { TutorNote } from "../tutor/domain.ts";
import type {
  CardRecord,
  Clock,
  ConversationRecord,
  ConversationStore,
  MonthUsage,
  NewCard,
  NewConversation,
  NewTutorNote,
  SettingsPort,
  TutorNotesStore,
  TutorSettings,
  UsageRow,
  UsageSink,
} from "../tutor/ports.ts";
import type {
  BackendId,
  ConversationKey,
  NewTranscriptEntry,
  SubjectRef,
  TranscriptEntry,
} from "../tutor/types.ts";
import { MODEL } from "../tutor/types.ts";

export class SqliteConversationStore implements ConversationStore {
  constructor(
    private readonly repos: Repos,
    private readonly clock: Clock,
  ) {}

  async find(key: ConversationKey): Promise<ConversationRecord | null> {
    return this.repos.tutor.findConversation(key);
  }
  async create(init: NewConversation): Promise<ConversationRecord> {
    return this.repos.tutor.createConversation({ ...init, model: MODEL, at: this.clock.now().toISOString() });
  }
  async entries(
    conversationId: string,
    opts: { includeExcluded?: boolean } = {},
  ): Promise<TranscriptEntry[]> {
    return this.repos.tutor.entries(conversationId, opts.includeExcluded === true);
  }
  async append(conversationId: string, entry: NewTranscriptEntry): Promise<TranscriptEntry> {
    return this.repos.tutor.append(conversationId, entry, this.clock.now());
  }
  async subjectDay(subject: SubjectRef, day: string): Promise<TranscriptEntry[]> {
    return this.repos.tutor.subjectEntries(subject.subjectKind, subject.subjectId, {
      day,
      includeExcluded: false,
    });
  }
  async timeline(subject: SubjectRef): Promise<TranscriptEntry[]> {
    return this.repos.tutor.subjectEntries(subject.subjectKind, subject.subjectId, { includeExcluded: true });
  }
  async backendRecords(conversationId: string, backend: BackendId): Promise<unknown[]> {
    return this.repos.tutor.backendRecords(conversationId, backend);
  }
  async appendBackendRecords(
    conversationId: string,
    backend: BackendId,
    records: readonly unknown[],
    opts: { excluded: boolean },
  ): Promise<void> {
    this.repos.tutor.appendBackendRecords(
      conversationId,
      backend,
      records,
      opts.excluded,
      this.clock.now().toISOString(),
    );
  }
  async saveCard(card: NewCard): Promise<CardRecord> {
    const stored = this.repos.tutor.saveCard({
      ...card,
      cardId: newId("card"),
      lockedTools: [...card.lockedTools],
      createdAt: this.clock.now().toISOString(),
    });
    return strip(stored);
  }
  async card(cardId: string): Promise<CardRecord | null> {
    const c = this.repos.tutor.card(cardId);
    return c === null ? null : strip(c);
  }
  async markCardApplied(cardId: string): Promise<void> {
    this.repos.tutor.markApplied(cardId, this.clock.now().toISOString(), null);
  }
}

function strip(
  c: CardRecord & { appliedAt?: unknown; savedSketchId?: unknown; createdAt?: unknown },
): CardRecord {
  const { appliedAt: _a, savedSketchId: _s, createdAt: _c, ...card } = c;
  return card;
}

export class SqliteNotesStore implements TutorNotesStore {
  constructor(
    private readonly repos: Repos,
    private readonly clock: Clock,
  ) {}
  async recent(subject: SubjectRef, limit: number): Promise<TutorNote[]> {
    return this.repos.tutor.notes({ subjectKind: subject.subjectKind, subjectId: subject.subjectId, limit });
  }
  async add(note: NewTutorNote): Promise<TutorNote> {
    return this.repos.tutor.addNote({
      ...note,
      id: newId("note"),
      conversationId: null,
      at: this.clock.now().toISOString(),
    });
  }
  async retract(id: string, at: string): Promise<void> {
    this.repos.tutor.retractNote(id, at);
  }
}

export class SqliteUsageSink implements UsageSink {
  constructor(private readonly repos: Repos) {}
  async record(row: UsageRow): Promise<void> {
    this.repos.tutor.recordUsage(row);
  }
  async month(month: string): Promise<MonthUsage> {
    const { includedInPlan: _p, requests: _r, ...m } = this.repos.tutor.month(month);
    return m;
  }
}

export class SettingsAdapter implements SettingsPort {
  constructor(
    private readonly repos: Repos,
    private readonly clock: Clock,
  ) {}
  async tutor(): Promise<TutorSettings> {
    return this.repos.settings.get("tutor");
  }
  async markSoftWarned(month: string): Promise<void> {
    const current = this.repos.settings.get("tutor");
    this.repos.settings.put("tutor", { ...current, softWarnedMonth: month }, this.clock.now().toISOString());
  }
}

/** The system clock in the learner's zone (the day rolls over at 04:00 there). */
export function learnerClock(repos: Repos, now: () => Date): Clock {
  return { now, timeZone: () => repos.profile.get().timezone };
}
