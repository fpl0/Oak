// React wiring of the scoped keymap: one window keydown listener, scope chains read from the focused element's
// `data-keyscope` ancestors, and hooks to register bindings for the lifetime of a component.
import { createContext, type ReactNode, use, useEffect, useRef } from "react";
import { usePrefs } from "../theme/prefs.ts";
import { type Binding, createKeymap, type KeyContext, type Keymap, SCOPES, type Scope } from "./keymap.ts";

const KeymapContext = createContext<Keymap | null>(null);

// `userAgentData.platform` can be an empty string (headless, some embeds): fall through on any falsy value.
export const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent,
  );

const SCOPE_SET = new Set<string>(SCOPES);

/** Props that make an element a keyboard scope (a focus region). */
export function keyScope(scope: Scope): { "data-keyscope": Scope } {
  return { "data-keyscope": scope };
}

export function scopeChain(el: Element | null): Scope[] {
  const chain: Scope[] = [];
  for (let n: Element | null = el; n; n = n.parentElement) {
    const s = n.getAttribute("data-keyscope");
    if (s && SCOPE_SET.has(s) && !chain.includes(s as Scope)) chain.push(s as Scope);
    else if (n.classList.contains("cm-editor") && !chain.includes("editor")) chain.push("editor");
  }
  chain.push("global");
  return chain;
}

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "submit", "reset", "color", "file"].includes(el.type);
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return (el as HTMLElement).isContentEditable === true;
}

function isControl(el: Element | null): boolean {
  if (!el) return false;
  return (
    el instanceof HTMLButtonElement ||
    el instanceof HTMLAnchorElement ||
    (el instanceof HTMLInputElement && !isEditable(el)) ||
    ["button", "tab", "menuitem", "option", "radio", "checkbox", "switch", "link"].includes(
      el.getAttribute("role") ?? "",
    )
  );
}

export function KeymapProvider({
  children,
  focusRoute,
}: {
  children: ReactNode;
  /** Whether the current route is a focus route (read at key time). */
  focusRoute: () => boolean;
}) {
  const keymapRef = useRef<Keymap | null>(null);
  keymapRef.current ??= createKeymap();
  const keymap = keymapRef.current;
  const focusRouteRef = useRef(focusRoute);
  focusRouteRef.current = focusRoute;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const active = document.activeElement;
      const target = e.target instanceof Element ? e.target : active;
      const ctx: KeyContext = {
        chain: scopeChain(target),
        inEditable: isEditable(target),
        onControl: isControl(target),
        focusRoute: focusRouteRef.current(),
        isMac: IS_MAC,
        macCtrl: usePrefs.getState().macCtrl,
      };
      const hit = keymap.handle(e, ctx);
      if (hit && hit !== "pending") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keymap]);

  return <KeymapContext value={keymap}>{children}</KeymapContext>;
}

export function useKeymap(): Keymap {
  const km = use(KeymapContext);
  if (!km) throw new Error("useKeymap outside KeymapProvider");
  return km;
}

/**
 * Registers bindings while the calling component is mounted. `bindings` may be a fresh array each render: the
 * registered handlers always call the latest `run`.
 */
export function useHotkeys(bindings: readonly Binding[], enabled = true): void {
  const km = useKeymap();
  const latest = useRef(bindings);
  latest.current = bindings;
  const signature = bindings.map((b) => `${b.id}|${b.keys}|${b.scope}|${b.allowInInput ? 1 : 0}`).join(";");
  useEffect(() => {
    if (!enabled) return;
    const proxies: Binding[] = latest.current.map((b, i) => ({
      ...b,
      when: (ctx) => {
        const cur = latest.current[i];
        return cur?.when ? cur.when(ctx) : true;
      },
      run: (ctx) => latest.current[i]?.run(ctx),
    }));
    return km.register(proxies);
  }, [km, signature, enabled]);
}
