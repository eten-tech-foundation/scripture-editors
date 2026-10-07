/// <reference types='vitest' />
import packageData from "./package.json" with { type: "json" };
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import react from "@vitejs/plugin-react-swc";
import * as path from "path";
// import { visualizer } from "rollup-plugin-visualizer";
// import type { PluginOption } from "vite";
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
      bundledPackages: ["shared", "shared-react"],
      // Roll up dependency declarations rather than their development source exports.
      tsconfigPath: path.join(__dirname, "tsconfig.dts.json"),
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
    // Emit one stylesheet per entry. Vite defaults this to false whenever
    // build.lib is set, which would concatenate every entry's CSS into a single
    // asset; keeping it per-entry is what leaves dist/index.css (the comment
    // styles reachable through ".") byte-for-byte unchanged while the bundled
    // editor stylesheet lands in dist/styles.css. Safe here because this package
    // has no dynamic imports, so each entry is a single chunk, and formats:["es"]
    // means Vite never emits style-injection code into the JS.
    cssCodeSplit: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      // vite-plugin-dts derives its declaration entries from lib.entry, so list only the
      // JavaScript entries here. Adding the export-less CSS entries makes api-extractor fail:
      // "Unable to determine module for styles.d.ts". Rollup takes every entry, JavaScript and
      // CSS, from rollupOptions.input below, so keep the JavaScript entries in both lists.
      entry: {
        index: "src/index.ts",
        "editorial-entry": "src/editorial-entry.ts",
        "view-options": "src/view-options.ts",
      },
      name: "@eten-tech-foundation/platform-editor",
      // Several inputs, so the name must be derived per entry: a fixed "index" makes Rollup
      // dedup into index.js + index2.js. npm excludes directories named node_modules, including
      // bundled vendor modules.
      fileName: (_format: string, entryName: string) =>
        `${entryName.replaceAll("node_modules", "vendor")}.js`,
      cssFileName: "index",
      // Change this to the formats you want to support.
      // Don't forget to update your package.json as well.
      formats: ["es" as const],
    },
    rollupOptions: {
      // Absolute paths are required: Vite passes rollupOptions.input to Rollup
      // verbatim (only the lib.entry fallback is resolved against `root`), so
      // relative ids would resolve against the current working directory.
      input: {
        index: path.resolve(__dirname, "src/index.ts"),
        "editorial-entry": path.resolve(__dirname, "src/editorial-entry.ts"),
        "view-options": path.resolve(__dirname, "src/view-options.ts"),
        styles: path.resolve(__dirname, "src/styles.ts"),
        // Optional UI stylesheets, kept out of styles.css so a consumer that supplies its own
        // toolbar/marker menu/context menu doesn't ship them (#516).
        toolbar: path.resolve(__dirname, "src/toolbar.ts"),
        "nodes-menu": path.resolve(__dirname, "src/nodes-menu.ts"),
        "context-menu": path.resolve(__dirname, "src/context-menu.ts"),
      },
      output: {
        // Keep stylesheet export filenames stable while JavaScript retains its directories.
        assetFileNames: (asset) => path.basename(asset.names[0] ?? "[name][extname]"),
        preserveModules: true,
        preserveModulesRoot: path.resolve(__dirname, "../.."),
      },
      external: [
        "react/jsx-runtime",
        // Also externalize the dev JSX runtime so a dev-mode build can never bundle a
        // second React copy (its React-18 variant reads internals removed in React 19).
        "react/jsx-dev-runtime",
        ...Object.keys(packageData.peerDependencies ?? {}),
        ...Object.keys(packageData.dependencies ?? {}),
        // Exclude all Lexical packages and their sub-modules
        /^@lexical\/.*/,
        /^lexical.*/,
      ],
      // open the HTML file manually or  set `open` to true
      // plugins: [visualizer({ filename: "dist/bundle-analysis.html", open: false }) as PluginOption],
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test-setup.ts"],
    include: ["{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "./test-output/vitest/coverage",
      provider: "v8" as const,
    },
  },
});
