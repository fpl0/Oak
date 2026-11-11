// The app's one OakStrudel (interfaces §8: `createOakStrudel` once, here). Strudel and its sound pack are heavy,
// so the adapter is created on the first user gesture ("Sound asleep — press any key"), not at page load. Every
// caller goes through `getOak()`; the AudioStatus in the top bar reflects this module's progress.
import type { OakStrudel } from "@oak/strudel";
import { loadContent } from "./content.ts";
import { useShell } from "./shell-store.ts";

interface SoundManifest {
  packVersion: string;
  publicRoot: string;
}

let instance: Promise<OakStrudel> | null = null;
let resolved: OakStrudel | null = null;

async function readManifest(): Promise<SoundManifest> {
  const res = await fetch("/sounds/manifest.json", { headers: { Accept: "application/json" } });
  if (!res.ok)
    throw new Error(`the sound pack is not installed (HTTP ${res.status}); run bun run sounds:mirror`);
  const json = (await res.json()) as Partial<SoundManifest>;
  if (typeof json.packVersion !== "string" || typeof json.publicRoot !== "string")
    throw new Error("the sound manifest has no packVersion");
  return { packVersion: json.packVersion, publicRoot: json.publicRoot };
}

/** Same-origin shell files this page loaded (index, chunks, CSS, fonts), for the worker's shell cache. */
export function shellUrls(): string[] {
  const out = new Set<string>([new URL("/", location.origin).href]);
  const add = (u: string | null | undefined) => {
    if (!u) return;
    const url = new URL(u, location.href);
    if (url.origin !== location.origin) return;
    if (/^\/(api|sounds)\//.test(url.pathname) || url.pathname.startsWith("/sw.js")) return;
    out.add(url.href.split("#")[0] as string);
  };
  for (const e of performance.getEntriesByType("resource")) add(e.name);
  for (const el of document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[href]"))
    add(el instanceof HTMLScriptElement ? el.src : el.href);
  return [...out];
}

function registerServiceWorker(packVersion: string): void {
  // Production only: the dev server must never be shadowed by a cache (app/public/sw.js, strudel owner).
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register(`/sw.js?pack=${encodeURIComponent(packVersion)}`)
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      // The page was loaded before the worker existed: hand it the shell so the first offline reload works.
      reg.active?.postMessage({ type: "warm-shell", urls: shellUrls() });
    })
    .catch((e: unknown) => {
      console.warn("oak: service worker registration failed", e);
    });
}

async function create(): Promise<OakStrudel> {
  const shell = useShell.getState();
  shell.setAudio({ kind: "waking" });
  const [manifest, content, strudel, grader] = await Promise.all([
    readManifest(),
    loadContent(),
    import("@oak/strudel"),
    import("@oak/grader"),
  ]);
  registerServiceWorker(manifest.packVersion);
  const oak = strudel.createOakStrudel({
    soundsRoot: manifest.publicRoot,
    toolbox: content.toolbox,
    lint: (code, ctx) => grader.lintOak(code, ctx, content.toolbox),
    // The app's keymap owns Ctrl/Cmd/Alt+. (it also stops non-Strudel sources); this module unlocks itself.
    panicKey: false,
    autoUnlock: false,
    // ux §7.6: reduced motion (system or setting) or the "calm highlighting" preference (prefs.ts sets both).
    calmHighlight: () => {
      const d = document.documentElement.dataset;
      return d.motion === "reduced" || d.calm === "1";
    },
  });
  oak.audio.subscribe((state) => {
    // Reflect every transition: a context the OS suspends after it ran must not keep saying "Ready".
    if (state === "running") useShell.getState().setAudio({ kind: "ready" });
    else if (resolved && (state === "suspended" || state === "interrupted"))
      useShell.getState().setAudio({ kind: "suspended" });
  });
  await oak.unlock();
  await oak.ready;
  resolved = oak;
  // Dev-server test hook (e2e/platform.pw.ts reads the master-bus level); never in a production build.
  if (import.meta.env.DEV) (globalThis as { __oakStrudel?: OakStrudel }).__oakStrudel = oak;
  useShell.getState().setAudio({ kind: "ready" });
  return oak;
}

/** The adapter, created on first call. Call from a user gesture so the AudioContext may start. */
export function getOak(): Promise<OakStrudel> {
  instance ??= create().catch((e: unknown) => {
    instance = null;
    const message = e instanceof Error ? e.message : String(e);
    useShell.getState().setAudio({ kind: "error", message });
    console.warn("oak: audio did not start:", message);
    throw e;
  });
  return instance;
}

/** The adapter if it already exists (never creates one). */
export function peekOak(): OakStrudel | null {
  return resolved;
}

/** Wakes audio in the background; errors land in the AudioStatus, never as an unhandled rejection. */
export function wakeAudio(): void {
  const kind = useShell.getState().audio.kind;
  if (kind === "ready" || kind === "suspended") {
    void resolved?.unlock();
    return;
  }
  getOak().catch(() => {});
}

/**
 * Installs "press any key to wake sound": the first keydown or pointerdown anywhere creates the adapter, and
 * any later one resumes a context the browser or the OS suspended. Returns an uninstall function.
 */
export function installAudioWake(target: Document = document): () => void {
  const onGesture = (e: Event) => {
    if (e instanceof KeyboardEvent && (e.key === "Tab" || e.key === "Shift" || e.metaKey || e.ctrlKey))
      return;
    const kind = useShell.getState().audio.kind;
    if (kind === "asleep" || kind === "suspended" || kind === "error") wakeAudio();
  };
  target.addEventListener("keydown", onGesture, true);
  target.addEventListener("pointerdown", onGesture, true);
  return () => {
    target.removeEventListener("keydown", onGesture, true);
    target.removeEventListener("pointerdown", onGesture, true);
  };
}

/** Panic stop (Ctrl/Cmd/Alt+.): every editor, plan and player, plus whatever registered as now playing. */
export function stopAllAudio(): void {
  resolved?.stopAll();
  const np = useShell.getState().nowPlaying;
  np?.stop();
  useShell.getState().setNowPlaying(null);
}
