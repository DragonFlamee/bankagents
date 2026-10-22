import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "../web-ui", emptyOutDir: true, assetsInlineLimit: 0 },
  server: {
    host: "127.0.0.1",
    port: 5173,
    fs: { allow: [process.cwd()] },
    proxy: {
      "/api": {
        target: process.env.TRACEBANK_DEV_API || "http://127.0.0.1:8765",
        changeOrigin: false,
      },
    },
  },
});
