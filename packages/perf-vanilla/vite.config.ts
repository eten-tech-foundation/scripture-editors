import { defineConfig } from "vite";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [],
  root: __dirname,
  build: {
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
});
