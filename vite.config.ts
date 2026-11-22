import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The bridge runs separately (npm run bridge) and owns the printer TCP link.
const bridge = `http://127.0.0.1:${process.env.BRIDGE_PORT || 8787}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": { target: bridge, changeOrigin: true },
    },
  },
})
