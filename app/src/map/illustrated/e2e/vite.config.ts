// Isolated seeded illustration harness: no router generation, content build, API or sound service.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { shifted } from "../../../../../e2e/support/stack.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
export default defineConfig({
  root: here,
  cacheDir: `${here}.vite-cache`,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: shifted(5247),
    strictPort: true,
    fs: { allow: [root] },
    hmr: false,
    watch: null,
  },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
});
