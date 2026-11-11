// What the server needs from the authored content. The content engineer's generator writes
// `content/.generated/`; `loader.ts` reads that and the content sources behind this one interface, and
// tests use `fixture.ts`. Nothing else in the server touches content files.
import type {
  CanDoDef,
  CapstoneDef,
  CheckpointDef,
  FactDeck,
  FamilyDef,
  LessonDef,
  MilestoneDef,
  SkillDef,
  SongDef,
  SyllabusDef,
  TermEntry,
  ToolEntry,
} from "@oak/content-kit";

export interface ContentProblem {
  id: string;
  message: string;
}

/** The raw content set: registries plus whichever lesson, checkpoint and capstone files exist. */
export interface ContentSource {
  /** `contentVersion = sha256(content)` from `content/.generated/index.json`; `null` before the first build. */
  contentVersion: string | null;
  syllabus: SyllabusDef;
  toolbox: readonly ToolEntry[];
  skills: readonly SkillDef[];
  families: readonly FamilyDef[];
  decks: readonly FactDeck[];
  terms: readonly TermEntry[];
  canDos: readonly CanDoDef[];
  milestones: readonly MilestoneDef[];
  songs: readonly SongDef[];
  /** Authored lessons. The syllabus may list lessons that are not written yet. */
  lessons: readonly LessonDef[];
  checkpoints: readonly CheckpointDef[];
  capstones: readonly CapstoneDef[];
  /** The generated syllabus and Strudel catalog text of the tutor's system prefix. */
  tutorPrefix: { syllabus: string; catalog: string };
  /** What the loader could not read. Shown by `GET /api/dev/content-report`. */
  problems: readonly ContentProblem[];
}

export const EMPTY_SYLLABUS: SyllabusDef = {
  units: [],
  tracks: [],
  checkpoints: [],
  capstones: [],
  trackGates: [],
  defaultOrder: [],
};

export function emptyContent(problems: readonly ContentProblem[] = []): ContentSource {
  return {
    contentVersion: null,
    syllabus: EMPTY_SYLLABUS,
    toolbox: [],
    skills: [],
    families: [],
    decks: [],
    terms: [],
    canDos: [],
    milestones: [],
    songs: [],
    lessons: [],
    checkpoints: [],
    capstones: [],
    tutorPrefix: { syllabus: "", catalog: "" },
    problems,
  };
}
