import { MDXProvider } from "@mdx-js/react";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "../router.tsx";
import { KeymapProvider } from "../ui/keys/KeymapProvider.tsx";
import { isFocusRoute } from "../ui/keys/keymap.ts";
import { mdxComponents } from "../ui/mdx.tsx";
import { AppShell } from "../ui/shell/AppShell.tsx";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
});

const focusRouteNow = () => isFocusRoute(window.location.pathname);

function Root() {
  return (
    <KeymapProvider focusRoute={focusRouteNow}>
      <MDXProvider components={mdxComponents}>
        <AppShell>
          <Outlet />
        </AppShell>
      </MDXProvider>
    </KeymapProvider>
  );
}
