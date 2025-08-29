/// <reference types='vitest' />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import react from "@vitejs/plugin-react-swc";
import * as path from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/packages/scribe-editor",
  plugins: [
    react(),
    nxViteTsPaths(),
    dts({
      entryRoot: "src",
      rollupTypes: true,
      tsconfigPath: path.join(__dirname, "tsconfig.lib.json"),
      exclude: ["src/App.tsx", "src/main.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
      aliasesExclude: ["@eten-tech-foundation/scripture-utilities"],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
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
      name: "@eten-tech-foundation/scribe-editor",
      fileName: "index",
      // Change this to the formats you want to support.
      // Don't forget to update your package.json as well.
      formats: ["es" as const],
    },
    rollupOptions: {
      external: [
        // peerDependencies
        "react",
        "react-dom",
        "react/jsx-runtime",
        // unwanted `libs/shared` dependencies
        "epitelete",
        "json-difference",
        "open-patcher",
        "proskomma-core",
        "test-data",
        "tslib",
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: "jsdom",
    include: ["{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    passWithNoTests: true,
    coverage: {
      reportsDirectory: "./test-output/vitest/coverage",
      provider: "v8" as const,
    },
  },
});
