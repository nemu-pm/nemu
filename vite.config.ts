import path from "path"
import fs from "fs"
import { execSync } from "child_process"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type Plugin } from "vite"
import { normalizeVaulCss } from "./scripts/normalize-vaul-css"

const vendoredVaulCssPath = path.resolve(__dirname, "./vendor/vaul/src/style.css")

function normalizeVendoredVaulCssPlugin(): Plugin {
  return {
    name: "normalize-vendored-vaul-css",
    enforce: "pre",
    transform(source, id) {
      if (path.resolve(id.split("?", 1)[0]) !== vendoredVaulCssPath) return
      const normalized = normalizeVaulCss(source)
      return normalized === source ? undefined : { code: normalized, map: null }
    },
  }
}

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

/** The commit being built: Vercel's, else the checkout's, else none. */
function buildCommitSha(env: Record<string, string>): string | undefined {
  const fromEnv = env.VERCEL_GIT_COMMIT_SHA?.trim()
  if (fromEnv) return fromEnv
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined
  } catch {
    return undefined
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load env file to get VITE_TACHIYOMI_LOCAL_PATH
  const env = loadEnv(mode, process.cwd(), '')

  // Crash reporting (src/lib/crash-reporting.ts): the release names the
  // commit. Source maps are built (hidden: no sourceMappingURL comment) and
  // uploaded only when SENTRY_AUTH_TOKEN is set, then deleted from dist so
  // they are never served. Without the token the build has no maps and the
  // plugin does nothing, so CI and forks build as before.
  const commitSha = command === "build" ? buildCommitSha(env) : undefined
  const sentryRelease = commitSha ? `nemu-web@${commitSha}` : undefined
  const sentryAuthToken = env.SENTRY_AUTH_TOKEN?.trim() || undefined
  const uploadSourceMaps = command === "build" && Boolean(sentryAuthToken && sentryRelease)
  
  return {
  define: {
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(sentryRelease ?? ""),
    "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(env.VERCEL_ENV || "production"),
  },
  build: {
    sourcemap: uploadSourceMaps ? "hidden" : false,
  },
  plugins: [
    normalizeVendoredVaulCssPlugin(),
    react(),
    tailwindcss(),
    localExtensionsPlugin(env.VITE_TACHIYOMI_LOCAL_PATH),
    sentryVitePlugin({
      disable: !uploadSourceMaps,
      org: env.SENTRY_ORG || "nemu-pm",
      project: env.SENTRY_PROJECT || "nemu-web",
      authToken: sentryAuthToken,
      telemetry: false,
      release: {
        name: sentryRelease,
        inject: false,
        setCommits: false,
        deploy: false,
      },
      sourcemaps: {
        filesToDeleteAfterUpload: ["./dist/**/*.map"],
        deleteSourcemapsAfterUpload: true,
      },
    }),
  ],
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
