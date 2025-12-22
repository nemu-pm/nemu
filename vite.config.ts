import path from "path"
import fs from "fs"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

/**
 * Plugin to serve dev/tachiyomi-extensions/ as static files in development.
 * This allows TachiyomiDevRegistry to load locally built extensions.
 * 
 * Special handling for /dev/tachiyomi-extensions/index.json - dynamically scans
 * the directory and returns the list of available extensions.
 */
function devExtensionsPlugin(): Plugin {
  const devExtensionsDir = path.resolve(__dirname, "dev/tachiyomi-extensions")
  
  return {
    name: "dev-extensions",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/dev/tachiyomi-extensions/")) {
          return next()
        }
        
        // Strip query string (Vite adds ?import for dynamic imports)
        const urlWithoutQuery = req.url.split("?")[0]
        const relativePath = urlWithoutQuery.slice("/dev/tachiyomi-extensions/".length)
        
        // Special case: dynamically generate index.json by scanning directory
        if (relativePath === "index.json" || relativePath === "") {
          res.setHeader("Content-Type", "application/json")
          res.setHeader("Access-Control-Allow-Origin", "*")
          res.setHeader("Cache-Control", "no-cache")
          
          if (!fs.existsSync(devExtensionsDir)) {
            res.end("[]")
            return
          }
          
          // Scan for directories with manifest.json
          const entries = fs.readdirSync(devExtensionsDir)
          const extensionDirs: string[] = []
          
          for (const entry of entries) {
            const entryPath = path.join(devExtensionsDir, entry)
            try {
              if (fs.statSync(entryPath).isDirectory()) {
                const manifestPath = path.join(entryPath, "manifest.json")
                if (fs.existsSync(manifestPath)) {
                  extensionDirs.push(entry)
                }
              }
            } catch {
              // Skip entries we can't stat
            }
          }
          
          res.end(JSON.stringify(extensionDirs))
          return
        }
        
        const filePath = path.join(devExtensionsDir, relativePath)
        
        // Security: prevent directory traversal
        if (!filePath.startsWith(devExtensionsDir)) {
          res.statusCode = 403
          res.end("Forbidden")
          return
        }
        
        if (!fs.existsSync(filePath)) {
          res.statusCode = 404
          res.end("Not found")
          return
        }
        
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) {
          res.statusCode = 403
          res.end("Cannot list directory")
          return
        }
        
        // Set content type
        const ext = path.extname(filePath)
        const contentTypes: Record<string, string> = {
          ".json": "application/json",
          ".js": "application/javascript",
          ".mjs": "application/javascript",
        }
        res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream")
        res.setHeader("Access-Control-Allow-Origin", "*")
        res.setHeader("Cache-Control", "no-cache")
        
        const content = fs.readFileSync(filePath)
        res.end(content)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), devExtensionsPlugin()],
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
