import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Standalone config (no Emergent plugins). Locally, /api is proxied to `yarn dev:api`;
// on Vercel, /api/* is served by api/index.ts on the same origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: /^lucide-react$/, replacement: path.resolve(__dirname, "./src/lib/lucide-react.tsx") },
      { find: "lucide-react-upstream", replacement: path.resolve(__dirname, "./node_modules/lucide-react") },
      { find: /^recharts$/, replacement: path.resolve(__dirname, "./src/lib/recharts.tsx") },
      { find: "recharts-upstream", replacement: path.resolve(__dirname, "./node_modules/recharts") },
    ],
  },
  server: {
    host: true,
    port: Number(process.env.PORT || 5173),
    proxy: { "/api": { target: `http://localhost:${process.env.API_PORT || 4001}`, changeOrigin: true } },
  },
  preview: {
    host: true,
    port: Number(process.env.PORT || 4173),
    proxy: { "/api": { target: `http://localhost:${process.env.API_PORT || 4001}`, changeOrigin: true } },
  },
});
