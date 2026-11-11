// Page-side helpers for the Service Worker (S3 spike).
import { soundMap } from "./oak-audio.ts";
import type { PackManifest } from "./oak-audio.ts";

function ask<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return reject(new Error("page is not controlled by a service worker"));
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data as T);
    controller.postMessage(message, [channel.port2]);
  });
}

/** Every URL the registered sounds can request: sample files, font files, and the pack JSONs. */
export function packUrls(manifest: PackManifest): string[] {
  const urls = new Set<string>([`${manifest.publicRoot}/manifest.json`, manifest.bankAliases]);
  for (const map of manifest.sampleMaps) urls.add(map.json);
  const all = soundMap.get() as Record<string, { data: { type?: string; samples?: unknown; fonts?: string[] } }>;
  for (const { data } of Object.values(all)) {
    if (data?.type === "sample") {
      const bank = data.samples as string[] | Record<string, string[]>;
      for (const url of (Array.isArray(bank) ? bank : Object.values(bank)).flat()) urls.add(encodeURI(url));
    } else if (data?.type === "soundfont") {
      for (const font of data.fonts ?? []) urls.add(`${manifest.soundfontUrl}/${font}.js`);
    }
  }
  return [...urls];
}

export const swStats = () =>
  ask<{ soundsFromCache: number; soundsFromNetwork: number; shellFromCache: number; shellFromNetwork: number; failed: number; soundsCached: number; cache: string }>({ type: "stats" });

export const precachePack = (manifest: PackManifest) =>
  ask<{ added: number; bytes: number; errors: string[]; soundsCached: number }>({ type: "precache", urls: packUrls(manifest) });
