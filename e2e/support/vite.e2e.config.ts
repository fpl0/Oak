// The app's Vite config for browser tests (oakStack and the platform stack use it): app/vite.config.ts exactly, with
// no HMR and a watcher that ignores every file. Thirty engineers edit the tree while the suites run; a watched file
// would reload the page under a test (or load a module twice) mid-assertion. A test run serves the tree as it was
// when its Vite started, which is what a test should see. (Not `watch: null`: that also turns off Vite's resolver
// cache, and every request would resolve its imports from disk again.)
import { defineConfig, mergeConfig, type UserConfig } from "vite";
import app from "../../app/vite.config.ts";

export default defineConfig(async (env) => {
  const base = (typeof app === "function" ? await app(env) : await app) as UserConfig;
  return mergeConfig(base, { server: { hmr: false, watch: { ignored: () => true } } } satisfies UserConfig);
});
