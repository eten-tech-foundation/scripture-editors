/// <reference types='vitest' />
import packageData from "./package.json" with { type: "json" };
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import react from "@vitejs/plugin-react-swc";
import * as path from "path";
// import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/packages/platform",
  plugins: [
    react(),
    nxViteTsPaths(),
    dts({
      entryRoot: "src",
      rollupTypes: true,
      tsconfigPath: path.join(__dirname, "tsconfig.lib.json"),
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      aliasesExclude: ["@eten-tech-foundation/scripture-utilities"],
    }),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  // Configuration for building your library.
  // See: https://vitejs.dev/guide/build.html#library-mode
  build: {
    outDir: "./dist",
    emptyOutDir: true,
    sourcemap: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      // Could also be a dictionary or array of multiple entry points.
      entry: "src/index.ts",
      name: "@eten-tech-foundation/platform-editor",
      fileName: "index",
      // Change this to the formats you want to support.
      // Don't forget to update your package.json as well.
      formats: ["es" as const],
    },
    rollupOptions: {
      external: [
        "react/jsx-runtime",
        ...Object.keys(packageData.peerDependencies ?? {}),
        ...Object.keys(packageData.dependencies ?? {}),
        // Exclude all Lexical packages and their sub-modules
        /^@lexical\/.*/,
        /^lexical.*/,
      ],
      // open the HTML file manually or  set `open` to true
      // plugins: [visualizer({ filename: "dist/bundle-analysis.html", open: false })],
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: "jsdom",
    include: ["{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "./test-output/vitest/coverage",
      provider: "v8" as const,
    },
  },
});
