// File names in the sound pack come from upstream JSON (the Strudel sample maps): never trusted as paths.
import { isAbsolute, relative, resolve, sep } from "node:path";

/** A sample file name as listed upstream: relative, forward slashes, no dot segments, no NUL. */
export function isSafeSamplePath(file: string): boolean {
  if (file === "" || file.includes("\0") || file.includes("\\") || isAbsolute(file) || /^[a-z]+:/i.test(file))
    return false;
  return file.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/** `root/rel`, or a throw when it would land outside `root`. */
export function insideRoot(root: string, rel: string): string {
  const abs = resolve(root, rel);
  const r = relative(root, abs);
  if (r === "" || r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r))
    throw new Error(`sound pack: ${rel} would be written outside ${root}`);
  return abs;
}
