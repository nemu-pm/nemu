#!/usr/bin/env bun
/**
 * Analyze Tachiyomi extension dependencies and usage patterns
 */

import { readdir, readFile, stat } from "fs/promises";
import { join, relative } from "path";

const EXTENSIONS_ROOT = "vendor/keiyoushi/extensions-source";

interface ImportStats {
  count: number;
  files: Set<string>;
  methods: Map<string, number>; // method/class -> count
}

interface AnalysisResult {
  totalFiles: number;
  totalExtensions: number;
  imports: Map<string, ImportStats>;
  thirdPartyDeps: Map<string, Set<string>>; // extension -> deps from build.gradle
  libUsage: Map<string, Set<string>>; // lib name -> extensions using it
  jsoupMethods: Map<string, number>;
  okhttpMethods: Map<string, number>;
  rxjavaMethods: Map<string, number>;
  quickjsUsage: Set<string>;
}

async function* walkKotlinFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip build directories
      if (entry.name === "build" || entry.name === ".gradle") continue;
      yield* walkKotlinFiles(fullPath);
    } else if (entry.name.endsWith(".kt")) {
      yield fullPath;
    }
  }
}

async function* walkExtensions(
  srcDir: string
): AsyncGenerator<{ name: string; path: string }> {
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const langDir of entries) {
    if (!langDir.isDirectory()) continue;
    const langPath = join(srcDir, langDir.name);
    const extDirs = await readdir(langPath, { withFileTypes: true });
    for (const extDir of extDirs) {
      if (!extDir.isDirectory()) continue;
      yield {
        name: `${langDir.name}/${extDir.name}`,
        path: join(langPath, extDir.name),
      };
    }
  }
}

// Patterns to detect specific API usage
const JSOUP_PATTERNS = [
  /\.select\s*\(/g,
  /\.selectFirst\s*\(/g,
  /\.attr\s*\(/g,
  /\.text\s*\(/g,
  /\.html\s*\(/g,
  /\.outerHtml\s*\(/g,
  /\.ownText\s*\(/g,
  /\.hasAttr\s*\(/g,
  /\.absUrl\s*\(/g,
  /\.getElementById\s*\(/g,
  /\.getElementsByTag\s*\(/g,
  /\.getElementsByClass\s*\(/g,
  /\.children\s*\(/g,
  /\.parent\s*\(/g,
  /\.parents\s*\(/g,
  /\.nextElementSibling/g,
  /\.previousElementSibling/g,
  /Jsoup\.parse\s*\(/g,
  /Jsoup\.connect\s*\(/g,
  /Parser\.unescapeEntities\s*\(/g,
];

const OKHTTP_PATTERNS = [
  /\.newCall\s*\(/g,
  /\.execute\s*\(/g,
  /Request\.Builder\s*\(/g,
  /Headers\.Builder\s*\(/g,
  /HttpUrl\.Builder\s*\(/g,
  /FormBody\.Builder\s*\(/g,
  /MultipartBody\.Builder\s*\(/g,
  /RequestBody\.create\s*\(/g,
  /\.toHttpUrl\s*\(/g,
  /\.toRequestBody\s*\(/g,
  /CacheControl/g,
  /Interceptor/g,
  /\.addHeader\s*\(/g,
  /\.header\s*\(/g,
  /\.body\s*\??\./g,
  /response\.code/g,
];

const RXJAVA_PATTERNS = [
  /Observable\./g,
  /\.map\s*\{/g,
  /\.flatMap\s*\{/g,
  /\.filter\s*\{/g,
  /\.doOnNext\s*\{/g,
  /\.subscribe\s*\(/g,
  /\.blockingFirst\s*\(/g,
  /Single\./g,
  /Completable\./g,
  /\.toObservable\s*\(/g,
  /\.fromCallable\s*\{/g,
];

function countPatterns(
  content: string,
  patterns: RegExp[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const pattern of patterns) {
    const patternStr = pattern.source.replace(/\\s\*|\\|[\(\)\{\}]/g, "");
    const matches = content.match(pattern);
    if (matches) {
      counts.set(patternStr, (counts.get(patternStr) || 0) + matches.length);
    }
  }
  return counts;
}

function mergeMaps(target: Map<string, number>, source: Map<string, number>) {
  for (const [key, value] of source) {
    target.set(key, (target.get(key) || 0) + value);
  }
}

async function analyzeExtensions(): Promise<AnalysisResult> {
  const result: AnalysisResult = {
    totalFiles: 0,
    totalExtensions: 0,
    imports: new Map(),
    thirdPartyDeps: new Map(),
    libUsage: new Map(),
    jsoupMethods: new Map(),
    okhttpMethods: new Map(),
    rxjavaMethods: new Map(),
    quickjsUsage: new Set(),
  };

  const srcDir = join(EXTENSIONS_ROOT, "src");

  // Analyze each extension
  for await (const ext of walkExtensions(srcDir)) {
    result.totalExtensions++;

    // Check build.gradle for dependencies
    const buildGradlePath = join(ext.path, "build.gradle");
    try {
      const buildGradle = await readFile(buildGradlePath, "utf-8");

      // Check for lib dependencies
      const libMatches = buildGradle.matchAll(
        /implementation\s*\(\s*project\s*\(\s*":lib:([^"]+)"\s*\)/g
      );
      for (const match of libMatches) {
        const libName = match[1];
        if (!result.libUsage.has(libName)) {
          result.libUsage.set(libName, new Set());
        }
        result.libUsage.get(libName)!.add(ext.name);
      }

      // Check for external dependencies (not project deps)
      const extDepMatches = buildGradle.matchAll(
        /implementation\s*\(\s*["']([^"':]+:[^"':]+:[^"']+)["']\s*\)/g
      );
      for (const match of extDepMatches) {
        if (!result.thirdPartyDeps.has(ext.name)) {
          result.thirdPartyDeps.set(ext.name, new Set());
        }
        result.thirdPartyDeps.get(ext.name)!.add(match[1]);
      }
    } catch {
      // No build.gradle or can't read
    }

    // Analyze Kotlin files
    for await (const file of walkKotlinFiles(ext.path)) {
      result.totalFiles++;
      const content = await readFile(file, "utf-8");
      const relPath = relative(EXTENSIONS_ROOT, file);

      // Extract imports
      const importMatches = content.matchAll(/^import\s+([\w.]+)/gm);
      for (const match of importMatches) {
        const importPath = match[1];
        if (!result.imports.has(importPath)) {
          result.imports.set(importPath, {
            count: 0,
            files: new Set(),
            methods: new Map(),
          });
        }
        const stats = result.imports.get(importPath)!;
        stats.count++;
        stats.files.add(relPath);
      }

      // Count API usage patterns
      mergeMaps(result.jsoupMethods, countPatterns(content, JSOUP_PATTERNS));
      mergeMaps(result.okhttpMethods, countPatterns(content, OKHTTP_PATTERNS));
      mergeMaps(result.rxjavaMethods, countPatterns(content, RXJAVA_PATTERNS));

      // Check for QuickJS usage
      if (
        content.includes("QuickJs") ||
        content.includes("app.cash.quickjs")
      ) {
        result.quickjsUsage.add(ext.name);
      }
    }
  }

  return result;
}

function groupImportsByPackage(
  imports: Map<string, ImportStats>
): Map<string, Map<string, ImportStats>> {
  const grouped = new Map<string, Map<string, ImportStats>>();

  for (const [fullImport, stats] of imports) {
    // Get top-level package (e.g., "org.jsoup", "okhttp3", "rx")
    const parts = fullImport.split(".");
    let pkg: string;

    if (fullImport.startsWith("eu.kanade.tachiyomi")) {
      pkg = "eu.kanade.tachiyomi";
    } else if (fullImport.startsWith("kotlinx.")) {
      pkg = parts.slice(0, 2).join(".");
    } else if (fullImport.startsWith("org.jsoup")) {
      pkg = "org.jsoup";
    } else if (fullImport.startsWith("okhttp3")) {
      pkg = "okhttp3";
    } else if (fullImport.startsWith("okio")) {
      pkg = "okio";
    } else if (
      fullImport.startsWith("rx.") ||
      fullImport.startsWith("io.reactivex")
    ) {
      pkg = "rxjava";
    } else if (fullImport.startsWith("java.") || fullImport.startsWith("javax.")) {
      pkg = "java.*";
    } else if (fullImport.startsWith("android.") || fullImport.startsWith("androidx.")) {
      pkg = "android.*";
    } else if (fullImport.startsWith("kotlin.") || fullImport.startsWith("kotlin")) {
      pkg = "kotlin.*";
    } else if (fullImport.startsWith("uy.kohesive.injekt")) {
      pkg = "injekt";
    } else if (fullImport.startsWith("app.cash.quickjs")) {
      pkg = "quickjs";
    } else {
      pkg = parts.slice(0, 2).join(".") || parts[0];
    }

    if (!grouped.has(pkg)) {
      grouped.set(pkg, new Map());
    }
    grouped.get(pkg)!.set(fullImport, stats);
  }

  return grouped;
}

async function main() {
  console.log("Analyzing Tachiyomi extensions...\n");

  const result = await analyzeExtensions();

  console.log(`Total extensions: ${result.totalExtensions}`);
  console.log(`Total Kotlin files: ${result.totalFiles}`);
  console.log("");

  // Group imports by package
  const grouped = groupImportsByPackage(result.imports);

  // Sort packages by total usage
  const sortedPackages = [...grouped.entries()].sort((a, b) => {
    const aTotal = [...a[1].values()].reduce((sum, s) => sum + s.count, 0);
    const bTotal = [...b[1].values()].reduce((sum, s) => sum + s.count, 0);
    return bTotal - aTotal;
  });

  console.log("=== IMPORT STATISTICS BY PACKAGE ===\n");

  for (const [pkg, imports] of sortedPackages) {
    const totalCount = [...imports.values()].reduce(
      (sum, s) => sum + s.count,
      0
    );
    const uniqueFiles = new Set(
      [...imports.values()].flatMap((s) => [...s.files])
    );

    console.log(`📦 ${pkg} (${totalCount} imports in ${uniqueFiles.size} files)`);

    // Show top imports in this package
    const sortedImports = [...imports.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    for (const [imp, stats] of sortedImports) {
      const shortImp = imp.replace(pkg + ".", "");
      console.log(`   ${stats.count.toString().padStart(4)} × ${shortImp}`);
    }

    if (imports.size > 10) {
      console.log(`   ... and ${imports.size - 10} more`);
    }
    console.log("");
  }

  // Jsoup method usage
  console.log("=== JSOUP METHOD USAGE ===\n");
  const sortedJsoup = [...result.jsoupMethods.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  for (const [method, count] of sortedJsoup) {
    console.log(`   ${count.toString().padStart(5)} × ${method}`);
  }
  console.log("");

  // OkHttp method usage
  console.log("=== OKHTTP METHOD USAGE ===\n");
  const sortedOkhttp = [...result.okhttpMethods.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  for (const [method, count] of sortedOkhttp) {
    console.log(`   ${count.toString().padStart(5)} × ${method}`);
  }
  console.log("");

  // RxJava method usage
  console.log("=== RXJAVA METHOD USAGE ===\n");
  const sortedRxjava = [...result.rxjavaMethods.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  for (const [method, count] of sortedRxjava) {
    console.log(`   ${count.toString().padStart(5)} × ${method}`);
  }
  console.log("");

  // Lib usage
  console.log("=== HELPER LIB USAGE ===\n");
  const sortedLibs = [...result.libUsage.entries()].sort(
    (a, b) => b[1].size - a[1].size
  );
  for (const [lib, exts] of sortedLibs) {
    console.log(`   ${lib}: ${exts.size} extensions`);
  }
  console.log("");

  // Third-party dependencies
  console.log("=== THIRD-PARTY DEPENDENCIES (external to common bundle) ===\n");
  if (result.thirdPartyDeps.size === 0) {
    console.log("   None found!");
  } else {
    // Group by dependency
    const depToExts = new Map<string, Set<string>>();
    for (const [ext, deps] of result.thirdPartyDeps) {
      for (const dep of deps) {
        if (!depToExts.has(dep)) {
          depToExts.set(dep, new Set());
        }
        depToExts.get(dep)!.add(ext);
      }
    }

    const sortedDeps = [...depToExts.entries()].sort(
      (a, b) => b[1].size - a[1].size
    );
    for (const [dep, exts] of sortedDeps) {
      console.log(`   ${dep}`);
      console.log(`      Used by: ${[...exts].slice(0, 5).join(", ")}${exts.size > 5 ? ` (+${exts.size - 5} more)` : ""}`);
    }
  }
  console.log("");

  // QuickJS usage
  console.log("=== QUICKJS (JS RUNTIME) USAGE ===\n");
  if (result.quickjsUsage.size === 0) {
    console.log("   None found!");
  } else {
    console.log(`   ${result.quickjsUsage.size} extensions use QuickJS:`);
    for (const ext of [...result.quickjsUsage].slice(0, 20)) {
      console.log(`      - ${ext}`);
    }
    if (result.quickjsUsage.size > 20) {
      console.log(`      ... and ${result.quickjsUsage.size - 20} more`);
    }
  }
  console.log("");

  // Summary of what needs shimming
  console.log("=== SUMMARY: WHAT NEEDS SHIMMING ===\n");

  const javaImports = grouped.get("java.*");
  if (javaImports) {
    console.log("Java stdlib classes used:");
    const sorted = [...javaImports.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15);
    for (const [imp, stats] of sorted) {
      console.log(`   ${stats.count.toString().padStart(4)} × ${imp}`);
    }
    console.log("");
  }

  const androidImports = grouped.get("android.*");
  if (androidImports) {
    console.log("Android classes used:");
    const sorted = [...androidImports.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15);
    for (const [imp, stats] of sorted) {
      console.log(`   ${stats.count.toString().padStart(4)} × ${imp}`);
    }
  }
}

main().catch(console.error);

