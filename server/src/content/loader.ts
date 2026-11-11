// Loads the content set for the server. Two inputs, one result:
//  - the content SOURCES (`content/syllabus.ts`, `skills.ts`, `families.ts`, `toolbox.ts`, `terms.ts`,
//    `candos.ts`, `milestones.ts`, every `lesson.ts`, `checkpoint.ts`, `capstone.ts`, `song.ts`): typed truth,
//    imported directly (Bun runs TypeScript);
//  - `content/.generated/` (written by `bun run content:build`): `index.json` for `contentVersion`,
//    `toolbox.json` when the source table is missing, `tutor/` for the system-prefix text.
// A file that is missing or fails to import becomes a `ContentProblem`; the server still starts.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CanDoDef,
  type CapstoneDef,
  type CheckpointDef,
  type FactDeck,
  type FamilyDef,
  idKind,
  type LessonDef,
  type MilestoneDef,
  type SkillDef,
  type SongDef,
  type SyllabusDef,
  type TermEntry,
  type ToolEntry,
} from "@oak/content-kit";
import { type ContentProblem, type ContentSource, EMPTY_SYLLABUS, emptyContent } from "./types.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every object reachable from a module's exports: the exports themselves and the items of exported arrays. */
function exportedObjects(mod: unknown): Obj[] {
  const out: Obj[] = [];
  if (!isObj(mod)) return out;
  for (const value of Object.values(mod)) {
    if (Array.isArray(value)) out.push(...value.filter(isObj));
    else if (isObj(value)) out.push(value);
  }
  return out;
}

function isSyllabus(v: unknown): v is SyllabusDef {
  return isObj(v) && Array.isArray(v.units) && Array.isArray(v.defaultOrder) && Array.isArray(v.checkpoints);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readFirst(dir: string, names: readonly string[]): string {
  for (const name of names) {
    const path = join(dir, name);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return "";
}

export interface LoadOptions {
  /** The `content/` directory. */
  contentDir: string;
  /** Module importer; tests pass their own. */
  importModule?: (path: string) => Promise<unknown>;
}

export async function loadContent(options: LoadOptions): Promise<ContentSource> {
  const { contentDir } = options;
  const importModule = options.importModule ?? ((path: string) => import(path));
  const problems: ContentProblem[] = [];
  if (!existsSync(contentDir)) return emptyContent([{ id: "content", message: `${contentDir} does not exist` }]);

  const load = async (rel: string, required: boolean): Promise<unknown> => {
    const path = join(contentDir, rel);
    if (!existsSync(path)) {
      if (required) problems.push({ id: rel, message: "missing" });
      return null;
    }
    try {
      return await importModule(path);
    } catch (err) {
      problems.push({ id: rel, message: `import failed: ${err instanceof Error ? err.message : String(err)}` });
      return null;
    }
  };
  const byKind = <T>(mod: unknown, ...kinds: string[]): T[] =>
    exportedObjects(mod).filter((o) => typeof o.id === "string" && kinds.includes(idKind(o.id) ?? "")) as T[];

  // Registries.
  const syllabusMod = await load("syllabus.ts", true);
  const syllabus =
    (isObj(syllabusMod) ? Object.values(syllabusMod).find(isSyllabus) : undefined) ?? EMPTY_SYLLABUS;
  if (syllabusMod !== null && syllabus === EMPTY_SYLLABUS)
    problems.push({ id: "syllabus.ts", message: "no SyllabusDef export found" });

  let toolbox = byKind<ToolEntry>(await load("toolbox.ts", false), "tool", "sound", "scale", "chordFamily");
  const skills = byKind<SkillDef>(await load("skills.ts", true), "skill");
  const familiesMod = await load("families.ts", true);
  const families = byKind<FamilyDef>(familiesMod, "family");
  const decks = byKind<FactDeck>(familiesMod, "deck");
  const terms = byKind<TermEntry>(await load("terms.ts", false), "term");
  const canDosMod = await load("candos.ts", false);
  const canDos = byKind<CanDoDef>(canDosMod, "canDo");
  const milestones = [
    ...byKind<MilestoneDef>(canDosMod, "milestone"),
    ...byKind<MilestoneDef>(await load("milestones.ts", false), "milestone"),
  ];

  // Per-folder files.
  const lessons: LessonDef[] = [];
  const checkpoints: CheckpointDef[] = [];
  const capstones: CapstoneDef[] = [];
  const songs: SongDef[] = [];
  const glob = new Bun.Glob("**/{lesson,checkpoint,capstone,song}.ts");
  const files = [...glob.scanSync({ cwd: contentDir })].filter((f) => !f.startsWith(".generated")).sort();
  for (const rel of files) {
    const mod = await load(rel, true);
    const def = isObj(mod) ? (mod.default ?? Object.values(mod).find(isObj)) : null;
    if (!isObj(def) || typeof def.id !== "string") {
      if (mod !== null) problems.push({ id: rel, message: "no definition exported" });
      continue;
    }
    const kind = idKind(def.id);
    if (rel.endsWith("lesson.ts") && kind === "lesson") lessons.push(def as unknown as LessonDef);
    else if (rel.endsWith("checkpoint.ts") && kind === "checkpoint") checkpoints.push(def as unknown as CheckpointDef);
    else if (rel.endsWith("capstone.ts") && kind === "capstone") capstones.push(def as unknown as CapstoneDef);
    else if (rel.endsWith("song.ts") && kind === "song") songs.push(def as unknown as SongDef);
    else problems.push({ id: rel, message: `unexpected id "${def.id}"` });
  }

  // Generated files.
  const generated = join(contentDir, ".generated");
  let contentVersion: string | null = null;
  try {
    const indexPath = join(generated, "index.json");
    if (existsSync(indexPath)) {
      const index = readJson(indexPath);
      if (isObj(index) && typeof index.contentVersion === "string") contentVersion = index.contentVersion;
    } else problems.push({ id: ".generated/index.json", message: "missing: run `bun run content:build`" });
    if (toolbox.length === 0 && existsSync(join(generated, "toolbox.json"))) {
      const rows = readJson(join(generated, "toolbox.json"));
      if (Array.isArray(rows)) toolbox = rows.filter(isObj) as unknown as ToolEntry[];
    }
  } catch (err) {
    problems.push({ id: ".generated", message: err instanceof Error ? err.message : String(err) });
  }
  if (toolbox.length === 0) problems.push({ id: "toolbox", message: "no unlock table found" });
  const tutorDir = join(generated, "tutor");
  const tutorPrefix = {
    syllabus: readFirst(tutorDir, ["syllabus.md", "syllabus.txt"]),
    catalog: readFirst(tutorDir, ["catalog.md", "catalog.txt", "strudel-catalog.md"]),
  };

  for (const unit of syllabus.units)
    for (const meta of unit.lessons)
      if (!lessons.some((l) => l.id === meta.id)) problems.push({ id: meta.id, message: "lesson not authored yet" });

  return {
    contentVersion,
    syllabus,
    toolbox,
    skills,
    families,
    decks,
    terms,
    canDos,
    milestones,
    songs,
    lessons,
    checkpoints,
    capstones,
    tutorPrefix,
    problems,
  };
}
