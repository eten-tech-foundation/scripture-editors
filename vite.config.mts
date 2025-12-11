/// <reference types='vitest' />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    // Prevent the root project from collecting tests; let per-project configs handle discovery.
    include: [],
    projects: ["**/vite.config.{mjs,js,ts,mts}", "**/vitest.config.{mjs,js,ts,mts}"],
  },
});
