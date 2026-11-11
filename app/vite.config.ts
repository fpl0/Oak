// Oak's single-page app. Run on Node, never `bunx --bun vite`:
//   node node_modules/vite/bin/vite.js --config app/vite.config.ts          (dev, 127.0.0.1:5173)
//   node node_modules/vite/bin/vite.js build --config app/vite.config.ts    (production build into dist/)
import { fileURLToPath } from "node:url";
import mdx from "@mdx-js/rollup";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const API = "http://127.0.0.1:8787";

/** contracts §11.2. The Oak server sends it on every HTML response; `vite preview` sends it too, so the
 *  production build is exercised under the real policy (the dev server needs inline scripts and cannot). */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' data: blob:",
  "worker-src 'self' blob: data:",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export default defineConfig(({ mode }) => ({
  root: appRoot,
  // Keep Vite's dependency cache inside app/ (never the shared node_modules/.vite).
  cacheDir: `${appRoot}.vite-cache`,
  publicDir: `${appRoot}public`,
  plugins: [
    // File routes first: the generator writes src/routeTree.gen.ts and splits route components.
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: `${appRoot}src/routes`,
      generatedRouteTree: `${appRoot}src/routeTree.gen.ts`,
      quoteStyle: "double",
      semicolons: true,
    }),
    // Lesson prose (`content/core/**/lesson.mdx`) and the app's own MDX pages.
    { enforce: "pre", ...mdx({ providerImportSource: "@mdx-js/react" }) } as PluginOption,
    react(),
    // React Compiler through Babel (React 19.3 target): memoizes components and hooks automatically. Only the
    // app's own source: never dependencies (including Vite's pre-bundled copies in cacheDir) or packages.
    babel({
      include: /[\\/]app[\\/]src[\\/].*\.[jt]sx?(?:$|\?)/,
      exclude: /[\\/]node_modules[\\/]|[\\/]\.vite-cache[\\/]|\0rolldown\/runtime\.js/,
      presets: [reactCompilerPreset()],
    }) as PluginOption,
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@content": `${repoRoot}content`,
      "@app": `${appRoot}src`,
    },
  },
  define: {
    // @strudel/core's errorLogger reads process.env.NODE_ENV (spike S1).
    "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { allow: [repoRoot] },
    proxy: {
      "/api": { target: API, changeOrigin: false },
      "/sounds": { target: API, changeOrigin: false },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    headers: { "Content-Security-Policy": CSP },
    proxy: {
      "/api": { target: API, changeOrigin: false },
      "/sounds": { target: API, changeOrigin: false },
    },
  },
  worker: { format: "es" as const },
  build: {
    outDir: `${repoRoot}dist`,
    emptyOutDir: true,
    target: "es2023",
    chunkSizeWarningLimit: 2500,
    // Every emitted file, for the Service Worker's shell cache (app/public/sw.js "warm-shell"): the routes the
    // learner has not opened yet must still load offline after the first visit.
    manifest: "asset-manifest.json",
    // CSP font-src is 'self' only: never inline a (small) font subset as a data: URI.
    assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
  optimizeDeps: {
    // Pre-bundle the heavy browser deps so the first page load never triggers a re-optimise reload.
    include: [
      "react",
      "react-dom/client",
      "react/jsx-runtime",
      "react/compiler-runtime",
      "@tanstack/react-router",
      "@tanstack/react-query",
      "zustand",
      "zod",
      "clsx",
      "@mdx-js/react",
      // Loaded on the first gesture through @oak/strudel; pre-bundled so that load never triggers a re-optimise.
      "@strudel/core",
      "@strudel/mini",
      "@strudel/tonal",
      "@strudel/transpiler",
      "@strudel/webaudio",
      "@strudel/codemirror",
      "@strudel/draw",
      "@strudel/soundfonts",
      "superdough",
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/autocomplete",
      "@codemirror/lint",
      "@codemirror/commands",
      "@codemirror/language",
      "worker-timers",
      "tonal",
      "acorn",
    ],
  },
}));
