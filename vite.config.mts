/// <reference types='vitest' />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Prevent the root project from collecting tests; let per-project configs handle discovery.
    include: [],
    projects: ["**/vite.config.{mjs,js,ts,mts}", "**/vitest.config.{mjs,js,ts,mts}"],
  },
});
