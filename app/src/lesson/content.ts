// Loads one lesson for the player: the typed `lesson.ts` (the truth: steps, exercises, code, grading) and its
// `lesson.mdx` (prose only, one <Step id> block per step). Both are lazy chunks that Vite finds by glob, so a
// lesson an author adds is picked up without touching this file. Also the checkpoint definitions
// (`content/core/Uxx/CP/checkpoint.ts`) the checkpoint player renders its authored items and Make from.
import type { CheckpointDef, LessonDef } from "@oak/api";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import type { GateRule } from "./gate.ts";

export type MdxComponents = Record<string, ComponentType<Record<string, unknown>>>;
export type LessonMdx = ComponentType<{ components?: MdxComponents }>;

const LESSON_FILES = import.meta.glob<{ default: LessonDef }>(
  "../../../content/{core,advanced}/**/lesson.ts",
);
const MDX_FILES = import.meta.glob<{ default: LessonMdx }>("../../../content/{core,advanced}/**/lesson.mdx");
const CHECKPOINT_FILES = import.meta.glob<Record<string, unknown>>(
  "../../../content/{core,advanced}/**/checkpoint.ts",
);

/** `…/core/U01/L02/lesson.ts` → `U01.L02`; the gate sample in `core/_sample/L00` is `U00.L00`. */
export function lessonIdOfPath(path: string): string | null {
  const m = /\/(?:core|advanced)\/([^/]+)\/(L\d\d)\/lesson\.(?:ts|mdx)$/.exec(path);
  if (!m) return null;
  const unit = m[1] === "_sample" ? "U00" : (m[1] as string);
  return `${unit}.${m[2]}`;
}

function filesById<T>(files: Record<string, () => Promise<T>>): Map<string, () => Promise<T>> {
  const out = new Map<string, () => Promise<T>>();
  for (const [path, load] of Object.entries(files)) {
    const id = lessonIdOfPath(path);
    if (id && !out.has(id)) out.set(id, load);
  }
  return out;
}

const lessonFiles = filesById(LESSON_FILES);
const mdxFiles = filesById(MDX_FILES);

export interface LoadedLesson {
  def: LessonDef;
  /** `null` when the lesson has no prose file (the player then shows each step's title and prompt). */
  Mdx: LessonMdx | null;
  /** True for the Wave 1 gate fixture (and the dev fixture), which is not part of the course. */
  sample: boolean;
  /** The session whose tools the lesson is played with, when it is not the lesson itself (a fixture). */
  context?: string;
  /** The preview banner's line, for a fixture. */
  note?: string;
  /** A dev fixture's own voicing gate (the content's is `VOICING_GATE`). */
  gate?: GateRule;
  /** Tools a dev fixture holds on top of its context's (the Wave 5 fixture: A1's sound tools). */
  extraUnlocks?: readonly string[];
}

/** The dev-only fixture of the Wave 3 step kinds (`app/src/lesson/dev/wave3-fixture.ts`); never in a build. */
async function devFixture(id: string): Promise<LoadedLesson | null> {
  if (!import.meta.env.DEV) return null;
  if (id === "U11.L99") {
    const w5 = await import("./dev/wave5-fixture.ts");
    return {
      def: w5.default,
      Mdx: null,
      sample: true,
      context: w5.FIXTURE5_CONTEXT,
      extraUnlocks: w5.FIXTURE5_EXTRA,
      note: "A dev fixture of the Wave 5 step kinds, played with the tools of U11.L06 and the sound side lessons. Nothing here is saved.",
    };
  }
  if (id === "U05.L99") {
    const w4 = await import("./dev/wave4-fixture.ts");
    return {
      def: w4.default,
      Mdx: null,
      sample: true,
      context: w4.FIXTURE4_CONTEXT,
      gate: w4.FIXTURE4_GATE,
      note: "A dev fixture of the Wave 4 step kinds, played with the tools of U05.L06. Nothing here is saved.",
    };
  }
  const mod = await import("./dev/wave3-fixture.ts");
  if (id !== mod.FIXTURE_ID) return null;
  return {
    def: mod.default,
    Mdx: null,
    sample: true,
    context: mod.FIXTURE_CONTEXT,
    note: "A dev fixture of the Wave 3 step kinds, played with the tools of U04. Nothing here is saved.",
  };
}

/** Whether an authored lesson file exists for `id` (cheap: no module is loaded). */
export function hasLessonFile(id: string): boolean {
  return lessonFiles.has(id);
}

export async function loadLesson(id: string): Promise<LoadedLesson | null> {
  const load = lessonFiles.get(id);
  if (!load) return devFixture(id);
  const [mod, mdx] = await Promise.all([
    load(),
    mdxFiles
      .get(id)?.()
      .catch(() => null) ?? null,
  ]);
  const def = mod.default;
  if (!def || def.id !== id) return null;
  return {
    def,
    Mdx: mdx?.default ?? null,
    sample: Object.keys(LESSON_FILES).some((p) => p.includes("/_sample/") && lessonIdOfPath(p) === id),
  };
}

export const lessonQuery = (id: string) =>
  queryOptions({
    queryKey: ["lesson-content", id] as const,
    queryFn: () => loadLesson(id),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 10 * 60_000,
  });

export function useLessonContent(id: string) {
  return useQuery(lessonQuery(id));
}

function isCheckpointDef(v: unknown): v is CheckpointDef {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as { id?: unknown }).id === "string" &&
    Array.isArray((v as { authored?: unknown }).authored) &&
    !!(v as { make?: unknown }).make
  );
}

/** The checkpoint's authored items and Make, or `null` when no `checkpoint.ts` defines it yet. */
export async function loadCheckpointDef(cpId: string): Promise<CheckpointDef | null> {
  for (const load of Object.values(CHECKPOINT_FILES)) {
    const mod = await load().catch(() => null);
    if (!mod) continue;
    for (const v of Object.values(mod)) if (isCheckpointDef(v) && v.id === cpId) return v;
  }
  return null;
}

export function useCheckpointDef(cpId: string | null) {
  return useQuery({
    queryKey: ["checkpoint-def", cpId] as const,
    queryFn: () => (cpId ? loadCheckpointDef(cpId) : Promise.resolve(null)),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: cpId !== null,
  });
}
