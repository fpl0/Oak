// The album's name (ux §5.3: "set at C0 release; default 'Oak Sessions'; editable"). It is printed on every
// cover and heads /album.
//
// Where it lives: the server's settings, under the key `albumTitle` (`null` until the learner names it). A name
// kept in this browser before the server had the setting (Wave 3 build) is moved to the server once, the first
// time the settings load with no name of their own, and the browser copy is then dropped.
import { SETTING_KEYS } from "@oak/api";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { apiQuery, useApiMutation, useBootstrap } from "../lib/queries.ts";

export const DEFAULT_ALBUM_TITLE = "Oak Sessions";
export const ALBUM_TITLE_MAX = 60;
export const ALBUM_TITLE_KEY = "oak.album.title.v1";

/** Whether the server's settings carry the album title. */
export const SERVER_HAS_ALBUM_TITLE = (SETTING_KEYS as readonly string[]).includes("albumTitle");

/** A typed name made safe to keep: trimmed, inner whitespace collapsed, at most 60 characters; empty → null. */
export function cleanAlbumTitle(raw: string): string | null {
  const t = raw
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ALBUM_TITLE_MAX)
    // The server counts UTF-16 units, so the cut is by units; never leave half an emoji at the end.
    .replace(/[\uD800-\uDBFF]$/, "")
    .trim();
  return t === "" ? null : t;
}

function readLocal(): string | null {
  try {
    const v = globalThis.localStorage?.getItem(ALBUM_TITLE_KEY) ?? null;
    return v === null ? null : cleanAlbumTitle(v);
  } catch {
    return null;
  }
}

function writeLocal(title: string | null): void {
  try {
    if (title === null) globalThis.localStorage?.removeItem(ALBUM_TITLE_KEY);
    else globalThis.localStorage?.setItem(ALBUM_TITLE_KEY, title);
  } catch {
    // Storage blocked (private mode): the name lasts for this visit.
  }
}

/** The browser copy, shared by every cover on screen. */
export const useLocalAlbumTitle = create<{ title: string | null }>(() => ({ title: readLocal() }));

export interface AlbumTitle {
  /** The name to print (the default until the learner names it). */
  title: string;
  /** True once the learner gave it a name. */
  named: boolean;
  /** Saves a new name; an empty one goes back to the default. */
  set(raw: string): Promise<void>;
  saving: boolean;
}

/** The bootstrap query's key, for the optimistic write. */
const BOOTSTRAP_KEY = apiQuery("bootstrap").queryKey;

/** Puts the name in the bootstrap cache at once, so every cover shows it before the server answers. */
function writeCached(qc: QueryClient, title: string | null): void {
  qc.setQueryData(BOOTSTRAP_KEY, (b) => (b ? { ...b, settings: { ...b.settings, albumTitle: title } } : b));
}

/** One move of the browser's copy to the server per page, however many covers ask (each calls the hook). */
let moving = false;

export function useAlbumTitle(): AlbumTitle {
  const boot = useBootstrap();
  const qc = useQueryClient();
  const local = useLocalAlbumTitle((s) => s.title);
  const put = useApiMutation("settings.put", ["bootstrap"]);
  const settings = boot.data?.settings as Record<string, unknown> | undefined;
  // undefined: not known yet (no server setting, or the settings have not loaded); null: not named on the server.
  const fromServer =
    SERVER_HAS_ALBUM_TITLE && settings
      ? typeof settings.albumTitle === "string"
        ? cleanAlbumTitle(settings.albumTitle)
        : null
      : undefined;
  useEffect(() => {
    if (fromServer !== null || local === null || moving) return;
    moving = true;
    put
      .mutateAsync({ params: { key: "albumTitle" as never }, body: { value: local } })
      .then(() => {
        writeCached(qc, local);
        writeLocal(null);
        useLocalAlbumTitle.setState({ title: null });
      })
      .catch(() => {
        // Offline or refused: the browser copy stays and is printed; the move is tried on the next load.
      })
      .finally(() => {
        moving = false;
      });
  }, [fromServer, local, put, qc]);
  const stored = fromServer ?? local;
  return {
    title: stored ?? DEFAULT_ALBUM_TITLE,
    named: stored !== null,
    saving: put.isPending,
    set: async (raw) => {
      const next = cleanAlbumTitle(raw);
      if (!SERVER_HAS_ALBUM_TITLE) {
        writeLocal(next);
        useLocalAlbumTitle.setState({ title: next });
        return;
      }
      // An empty name goes back to the default: `null` on the server, so the album reads as not named.
      writeCached(qc, next);
      writeLocal(null);
      useLocalAlbumTitle.setState({ title: null });
      try {
        await put.mutateAsync({ params: { key: "albumTitle" as never }, body: { value: next } });
      } finally {
        await qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      }
    },
  };
}
