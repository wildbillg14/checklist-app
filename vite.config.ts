import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;
const root = import.meta.dirname;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  // Multi-page: one HTML entry per Tauri window.
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "main.html"),
        widget: resolve(root, "widget.html"),
      },
    },
  },

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
