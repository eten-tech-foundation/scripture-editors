/// <reference types='vitest' />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import path from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/packages/utilities",

  plugins: [
    nxViteTsPaths(),
    dts({ entryRoot: "src", tsconfigPath: path.join(__dirname, "tsconfig.lib.json") }),
  ],

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  // Configuration for building your library.
  // See: https://vitejs.dev/guide/build.html#library-mode
  build: {
    sourcemap: true,
    lib: {
      // Could also be a dictionary or array of multiple entry points.
      entry: "src/index.ts",
      fileName: "index",
      // Change this to the formats you want to support.
      // Remember to update your package.json as well.
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      // External packages that should not be bundled into your library.
      external: ["@xmldom/xmldom"],
    },
  },
});
