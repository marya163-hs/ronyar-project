import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/v2": { target: "http://localhost:3010", changeOrigin: false },
    },
  },
});