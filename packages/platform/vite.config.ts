import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import dts from "vite-plugin-dts";
import { peerDependencies, dependencies } from "./package.json";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    dts({
      rollupTypes: true,
      exclude: ["src/App.tsx", "src/main.tsx"],
      aliasesExclude: ["@eten-tech-foundation/scripture-utilities"],
    }),
  ],
  build: {
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [...Object.keys(peerDependencies ?? {}), ...Object.keys(dependencies ?? {})],
    },
  },
});
