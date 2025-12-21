import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Exclude onnxruntime-web from dep optimization - it has WASM files that need special handling
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
  // Worker format must be "es" to support dynamic imports in workers
  worker: {
    format: "es",
  },
  server: {
    port: 5662,
    // Required for SharedArrayBuffer support in onnxruntime-web
    // Using credentialless instead of require-corp to allow loading external images
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
    proxy: {
      "/proxy": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
})
