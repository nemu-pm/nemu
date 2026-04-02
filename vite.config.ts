import path from "path"
import fs from "fs"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type Plugin } from "vite"

/**
 * Plugin to serve local Tachiyomi extensions in development.
 * 
 * Configure via VITE_TACHIYOMI_LOCAL_PATH env var in .env.local:
 *   VITE_TACHIYOMI_LOCAL_PATH=/path/to/tachiyomi-js/dist/extensions
 * 
 * Directory structure: lang/name/manifest.json (e.g., en/mangapill/manifest.json)
 * 
 * Special handling for /local-extensions/index.json - dynamically scans
 * the directory and returns the list of available extensions.
 */
function localExtensionsPlugin(extensionsDir?: string): Plugin {
  const localExtensionsDir = extensionsDir || ""
  
  return {
    name: "local-extensions",
    configureServer(server) {
      if (!localExtensionsDir) {
        console.log(`\n📦 Tachiyomi local extensions: disabled (set VITE_TACHIYOMI_LOCAL_PATH)\n`)
        return
      }
      
      // Log the extensions directory on startup
      console.log(`\n📦 Tachiyomi local extensions: ${localExtensionsDir}`)
      if (fs.existsSync(localExtensionsDir)) {
        // Count extensions in nested structure (lang/name/)
        let count = 0
        for (const lang of fs.readdirSync(localExtensionsDir)) {
          const langPath = path.join(localExtensionsDir, lang)
          if (fs.statSync(langPath).isDirectory()) {
            for (const name of fs.readdirSync(langPath)) {
              if (fs.existsSync(path.join(langPath, name, "manifest.json"))) {
                count++
              }
            }
          }
        }
        console.log(`   Found ${count} extension(s)\n`)
      } else {
        console.log(`   Directory not found\n`)
      }
      
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/local-extensions/")) {
          return next()
        }
        
        // Strip query string (Vite adds ?import for dynamic imports)
        const urlWithoutQuery = req.url.split("?")[0]
        const relativePath = urlWithoutQuery.slice("/local-extensions/".length)
        
        // Special case: dynamically generate index.json by scanning directory
        if (relativePath === "index.json" || relativePath === "") {
          res.setHeader("Content-Type", "application/json")
          res.setHeader("Access-Control-Allow-Origin", "*")
          res.setHeader("Cache-Control", "no-cache")
          
          if (!fs.existsSync(localExtensionsDir)) {
            res.end("[]")
            return
          }
          
          // Scan nested structure: lang/name/manifest.json
          const extensionPaths: string[] = []
          
          for (const lang of fs.readdirSync(localExtensionsDir)) {
            const langPath = path.join(localExtensionsDir, lang)
            try {
              if (!fs.statSync(langPath).isDirectory()) continue
              
              for (const name of fs.readdirSync(langPath)) {
                const extPath = path.join(langPath, name)
                if (fs.statSync(extPath).isDirectory()) {
                  const manifestPath = path.join(extPath, "manifest.json")
                  if (fs.existsSync(manifestPath)) {
                    extensionPaths.push(`${lang}/${name}`)
                  }
                }
              }
            } catch {
              // Skip entries we can't stat
            }
          }
          
          res.end(JSON.stringify(extensionPaths))
          return
        }
        
        const filePath = path.join(localExtensionsDir, relativePath)
        
        // Security: prevent directory traversal
        if (!filePath.startsWith(localExtensionsDir)) {
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
          ".png": "image/png",
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
export default defineConfig(({ mode }) => {
  // Load env file to get VITE_TACHIYOMI_LOCAL_PATH
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
  plugins: [react(), tailwindcss(), localExtensionsPlugin(env.VITE_TACHIYOMI_LOCAL_PATH)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Use vendored vaul source directly (enables HMR for vendor changes)
      "vaul": path.resolve(__dirname, "./vendor/vaul/src/index.tsx"),
      // Force single React instance (prevent duplicate React in vendored packages)
      "react": path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
  },
  // Dep optimization config
  optimizeDeps: {
    // Exclude packages with workers - they need direct file access
    exclude: ["onnxruntime-web", "@nemu.pm/aidoku-runtime", "@nemu.pm/tachiyomi-runtime"],
    // Force CJS→ESM conversion for cheerio's dependency chain
    include: ["cheerio", "cheerio > css-select", "cheerio > css-select > boolbase"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core + router + state management → vendor chunk
          if (id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/@tanstack/react-router") ||
              id.includes("node_modules/@tanstack/react-query") ||
              id.includes("node_modules/zustand/")) {
            return "vendor"
          }
          // AI elements: xyflow, shiki, lucide-react, ai-sdk
          if (id.includes("node_modules/@xyflow/") ||
              id.includes("node_modules/shiki/") ||
              id.includes("node_modules/lucide-react/") ||
              id.includes("node_modules/ai/") ||
              id.includes("node_modules/@ai-sdk/") ||
              id.includes("node_modules/@openrouter/") ||
              id.includes("src/components/ai-elements/")) {
            return "ai"
          }
          // Reader-only dependencies
          if (id.includes("node_modules/swiper/") ||
              id.includes("node_modules/react-zoom-pan-pinch/") ||
              id.includes("node_modules/react-window/")) {
            return "reader"
          }
          // Convex client
          if (id.includes("node_modules/convex/")) {
            return "convex"
          }
          // Motion (animation library, used in many pages but heavy)
          if (id.includes("node_modules/motion/")) {
            return "motion"
          }
          // OpenCC (Chinese character conversion, ~1.1MB, only used in metadata matching)
          if (id.includes("node_modules/opencc-js/")) {
            return "opencc"
          }
          // DnD Kit (drag-and-drop, only used in source management)
          if (id.includes("node_modules/@dnd-kit/")) {
            return "dnd-kit"
          }
        },
      },
    },
  },
  // Worker format must be "es" to support dynamic imports in workers
  worker: {
    format: "es",
  },
  server: {
    port: 5662,
    // Allow serving from linked packages (for bun link during dev)
    fs: {
      allow: [
        "..",
        path.resolve(__dirname, "../aidoku-js"),
        path.resolve(__dirname, "../tachiyomi-js"),
      ],
    },
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
}})
