import "dotenv/config";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  esbuild: { jsx: "automatic" },
  server: { proxy: { "/api": `http://127.0.0.1:${process.env.PORT || 3001}` } },
});
