import { build } from "esbuild";
import path from "node:path";

const root = process.cwd();
const entry = path.join(
  root,
  "apps/mobile/modules/nemu-aidoku/runtime/aidokuSandboxRuntime.ts",
);
const outfile = path.join(
  root,
  "apps/mobile/modules/nemu-aidoku/runtime/assets/nemu_aidoku_sandbox.js",
);

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["chrome120"],
  minify: true,
  sourcemap: false,
  // Preserve third-party license banners in the checked-in bundle.
  legalComments: "eof",
  treeShaking: true,
  logLevel: "info",
});
