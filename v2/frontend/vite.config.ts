import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The v2 frontend runs on port 3001 and sends /api calls to the v2 backend on port 3000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    strictPort: true,
    proxy: {
      "/api": { target: process.env.V2_API_URL ?? "http://localhost:3000", changeOrigin: true },
    },
  },
});
