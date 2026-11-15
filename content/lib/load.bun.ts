// Discovers and loads authored lesson, checkpoint and capstone files from disk (contracts §5.8 layout):
//   content/core/Uxx/Lyy/lesson.ts      content/advanced/<unit>/Lyy/lesson.ts
//   content/core/Uxx/CP/checkpoint.ts   content/core/capstones/<id>/capstone.ts (and advanced/capstones)
//   content/core/_sample/L00/           the Wave 1 gate fixture (not in the syllabus)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { CheckpointDef, LessonDef } from "@oak/content-kit";

export const CONTENT_ROOT = resolve(import.meta.dir, "..");

export interface LessonFile {
  /** The lesson ID the folder says (`U03.L02`), or the definition's for the sample. */
  folderId: string | null;
  dir: string;
  file: string;
  mdx: string | null;
  sample: boolean;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** `core/U03/L02` → `U03.L02`; `advanced/J1/L03` → `J1.L03`; anything else → null. */
export function folderLessonId(dir: string, root = CONTENT_ROOT): string | null {
  const parts = relative(root, dir).split(/[\\/]/);
  const [area, unit, lesson] = parts;
  if (
    (area === "core" || area === "advanced") &&
    unit &&
    lesson &&
    /^L\d{2}$/.test(lesson) &&
    parts.length === 3
  )
    return `${unit}.${lesson}`;
  return null;
}

export function findLessonFiles(root = CONTENT_ROOT): LessonFile[] {
  return walk(join(root, "core"))
    .concat(walk(join(root, "advanced")))
    .filter((f) => f.endsWith("/lesson.ts"))
    .sort()
    .map((file) => {
      const dir = file.slice(0, -"/lesson.ts".length);
      const mdx = join(dir, "lesson.mdx");
      return {
        folderId: folderLessonId(dir, root),
        dir,
        file,
        mdx: existsSync(mdx) ? mdx : null,
        sample: dir.includes("/_sample/"),
      };
    });
}

export interface LoadedLesson extends LessonFile {
  def: LessonDef;
  mdxSource: string | null;
}
export interface LoadError {
  file: string;
  error: string;
  /** The lesson ID the folder says (`U01.L03`), when the file is a lesson. */
  folderId?: string | null;
}

/** Imports every lesson; a file that throws (a `ContentDefinitionError`) becomes a load error. */
export async function loadLessons(
  root = CONTENT_ROOT,
): Promise<{ lessons: LoadedLesson[]; errors: LoadError[] }> {
  const lessons: LoadedLesson[] = [];
  const errors: LoadError[] = [];
  for (const f of findLessonFiles(root)) {
    try {
      const mod = (await import(f.file)) as { default?: LessonDef };
      if (!mod.default) throw new Error("lesson.ts has no default export (export default defineLesson({…}))");
      lessons.push({ ...f, def: mod.default, mdxSource: f.mdx ? readFileSync(f.mdx, "utf8") : null });
    } catch (e) {
      errors.push({
        file: relative(root, f.file),
        error: e instanceof Error ? e.message : String(e),
        folderId: f.folderId,
      });
    }
  }
  return { lessons, errors };
}

export async function loadCheckpointFiles(
  root = CONTENT_ROOT,
): Promise<{ defs: CheckpointDef[]; errors: LoadError[]; files: Map<string, string> }> {
  const defs: CheckpointDef[] = [];
  const errors: LoadError[] = [];
  /** Each checkpoint's file (a track checkpoint sits in the folder of the last unit it covers: J2/CP, A2/CP). */
  const files = new Map<string, string>();
  for (const file of walk(root).filter((f) => f.endsWith("/CP/checkpoint.ts"))) {
    try {
      const mod = (await import(file)) as { default?: CheckpointDef };
      if (mod.default) {
        defs.push(mod.default);
        files.set(mod.default.id, file);
      }
    } catch (e) {
      errors.push({ file: relative(root, file), error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { defs, errors, files };
}

/** Every content source file, for the watch mode and the content hash. */
export function contentSourceFiles(root = CONTENT_ROOT): string[] {
  return walk(root)
    .filter((f) => !f.includes("/.generated/") && !f.includes("/validate/") && /\.(ts|mdx|json)$/.test(f))
    .filter((f) => !f.endsWith(".test.ts"))
    .sort();
}
