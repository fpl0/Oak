// Loads course content for the app: `content/.generated/*.json` when `bun run content:build` has written it,
// otherwise the isomorphic registries (`content/index.ts`). Both are lazy chunks, loaded once.
import type { GymTemplate } from "@oak/api";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { buildBundle, type ContentBundle, type ContentParts } from "./content-model.ts";

// Vite resolves these at build time; a missing file simply has no entry (no build error, no 404).
const generated = import.meta.glob<unknown>(
  [
    "../../../content/.generated/index.json",
    "../../../content/.generated/toolbox.json",
    "../../../content/.generated/skill-graph.json",
    "../../../content/.generated/lessons.json",
  ],
  { import: "default" },
);

function pick(name: string): (() => Promise<unknown>) | undefined {
  const key = Object.keys(generated).find((k) => k.endsWith(`/.generated/${name}`));
  return key ? generated[key] : undefined;
}

let pending: Promise<ContentBundle> | null = null;

export function loadContent(): Promise<ContentBundle> {
  pending ??= (async () => {
    const parts: ContentParts = {};
    const index = pick("index.json");
    const toolbox = pick("toolbox.json");
    const graph = pick("skill-graph.json");
    if (index) parts.index = await index();
    if (toolbox) parts.toolbox = await toolbox();
    if (graph) parts.skillGraph = await graph();
    const lessons = pick("lessons.json");
    if (lessons) parts.lessons = await lessons();
    // The registries carry what the generated files do not (syllabus titles, families, can-dos, terms).
    try {
      const { registries } = await import("@content/index.ts");
      parts.registries = {
        syllabus: registries.syllabus,
        skills: registries.skills,
        toolbox: registries.toolbox,
        families: registries.families,
        decks: registries.decks,
        terms: registries.terms,
        candos: registries.candos,
        capstones: registries.syllabus.capstones,
        checkpoints: registries.checkpoints,
        templates: registries.templates as unknown as readonly GymTemplate[],
      };
    } catch (e) {
      // Content mid-edit with a syntax error: show what the generated files hold and say so.
      console.warn("oak: content registries failed to load", e);
    }
    return buildBundle(parts);
  })();
  return pending;
}

export const contentQuery = queryOptions({
  queryKey: ["content"] as const,
  queryFn: loadContent,
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
});

export function useContent() {
  return useQuery(contentQuery);
}
