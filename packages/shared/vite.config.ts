/// <reference types='vitest' />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import * as path from "path";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/packages/shared",

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
    reportCompressedSize: true,
    lib: {
      // Multiple entry points for directory structure
      entry: {
        index: "src/index.ts",
        "adaptors/index": "src/adaptors/index.ts",
        "converters/index": "src/converters/index.ts",
        "converters/perf/index": "src/converters/perf/index.ts",
        "converters/usfm/index": "src/converters/usfm/index.ts",
        "nodes/index": "src/nodes/index.ts",
        "nodes/usj/index": "src/nodes/usj/index.ts",
        "nodes/features/index": "src/nodes/features/index.ts",
        "nodes/usfm/index": "src/nodes/usfm/index.ts",
        "nodes/collab/index": "src/nodes/collab/index.ts",
        "plugins/index": "src/plugins/index.ts",
        "plugins/CursorHandler/index": "src/plugins/CursorHandler/index.ts",
        "plugins/History/index": "src/plugins/History/index.ts",
        "plugins/PerfHandlers/index": "src/plugins/PerfHandlers/index.ts",
        "plugins/PerfOperations/index": "src/plugins/PerfOperations/index.ts",
        "plugins/Typeahead/index": "src/plugins/Typeahead/index.ts",
        "utils/index": "src/utils/index.ts",
        "utils/usfm/index": "src/utils/usfm/index.ts",
        "utils/usj/index": "src/utils/usj/index.ts",
        "localLexical/index": "src/localLexical/index.ts",
      },
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      // External packages that should not be bundled into your library.
      external: [
        "lexical",
        "@lexical/utils",
        "@lexical/mark",
        "@sillsdev/scripture",
        "epitelete",
        "open-patcher",
        "proskomma-core",
        "proskomma-json-tools",
        "json-difference",
        "@eten-tech-foundation/scripture-utilities",
      ],
    },
  },
});
