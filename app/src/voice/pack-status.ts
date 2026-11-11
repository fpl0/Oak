// The sound pack as Settings › Audio reports it: which version is installed, and how much of it the Service
// Worker keeps for offline use. The worker exists only in production builds (app/src/lib/oak.ts), so the dev
// server reports "not cached" rather than a number.
export interface PackStatus {
  version: string | null;
  /** Sound names the adapter knows (0 before sound has started). */
  sounds: number;
  worker: "active" | "none" | "unsupported";
  /** Files in `oak-sounds-<version>`, or null when the Cache API is not there. */
  cachedFiles: number | null;
}

export interface PackStatusDeps {
  manifest(): Promise<{ packVersion?: unknown } | null>;
  sounds(): number;
  worker(): PackStatus["worker"];
  cacheCount(name: string): Promise<number | null>;
}

export async function readPackStatus(d: PackStatusDeps): Promise<PackStatus> {
  const m = await d.manifest().catch(() => null);
  const version = m && typeof m.packVersion === "string" ? m.packVersion : null;
  const cachedFiles = version ? await d.cacheCount(`oak-sounds-${version}`).catch(() => null) : null;
  return { version, sounds: d.sounds(), worker: d.worker(), cachedFiles };
}

export function packLine(s: PackStatus): { status: string; offline: string } {
  const status =
    s.version === null
      ? "Not installed: run bun run sounds:mirror in the Oak folder"
      : `Pack ${s.version}${s.sounds > 0 ? ` · ${s.sounds} sounds` : ""}`;
  const offline =
    s.worker === "unsupported"
      ? "This browser cannot keep sounds for offline use"
      : s.worker === "none"
        ? "Not cached: sounds load from this computer's Oak server (the offline cache runs in the installed app, not the development server)"
        : s.cachedFiles === null || s.cachedFiles === 0
          ? "Offline cache on; sounds are kept as they are first played"
          : `${s.cachedFiles} sound files kept for offline use`;
  return { status, offline };
}

/** The browser-backed deps. */
export function browserPackDeps(sounds: () => number): PackStatusDeps {
  return {
    manifest: async () => {
      const r = await fetch("/sounds/manifest.json", { headers: { Accept: "application/json" } });
      return r.ok ? ((await r.json()) as { packVersion?: unknown }) : null;
    },
    sounds,
    worker: () =>
      typeof navigator === "undefined" || !("serviceWorker" in navigator)
        ? "unsupported"
        : navigator.serviceWorker.controller
          ? "active"
          : "none",
    cacheCount: async (name) => {
      if (typeof caches === "undefined") return null;
      if (!(await caches.has(name))) return 0;
      return (await (await caches.open(name)).keys()).length;
    },
  };
}
