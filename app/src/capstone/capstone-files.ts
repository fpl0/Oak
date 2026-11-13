// A capstone's own folder file (`content/core/capstones/<ID>/capstone.ts`) wins over the registry entry of the
// same ID, as the server's content loader does. Vite only (import.meta.glob); `content.ts` loads it lazily.
import type { CapstoneDef } from "@oak/content-kit";

const CAPSTONE_FILES = import.meta.glob<Record<string, unknown>>(
  "../../../content/core/capstones/*/capstone.ts",
);

function isCapstone(x: unknown): x is CapstoneDef {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { id?: unknown }).id === "string" &&
    Array.isArray((x as { sessionDefs?: unknown }).sessionDefs)
  );
}

export async function folderCapstones(): Promise<CapstoneDef[]> {
  const out: CapstoneDef[] = [];
  for (const load of Object.values(CAPSTONE_FILES)) {
    const mod = await load();
    const def = mod.default ?? Object.values(mod).find(isCapstone);
    if (isCapstone(def)) out.push(def);
  }
  return out;
}
