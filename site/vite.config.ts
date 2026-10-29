import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.AXOLOTL_PAGES_BASE ?? "/",
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
  },
  optimizeDeps: {
    include: ["typescript", "three"],
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 5000,
  },
});
