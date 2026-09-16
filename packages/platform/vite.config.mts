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
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      entry: {
        index: "src/index.ts",
        "editorial-entry": "src/editorial-entry.ts",
        "view-options": "src/view-options.ts",
      },
      name: "@eten-tech-foundation/platform-editor",
      // npm excludes directories named node_modules, including bundled vendor modules.
      fileName: (_format, entryName) => `${entryName.replaceAll("node_modules", "vendor")}.js`,
      cssFileName: "index",
      // Change this to the formats you want to support.
      // Don't forget to update your package.json as well.
      formats: ["es" as const],
    },
    rollupOptions: {
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
