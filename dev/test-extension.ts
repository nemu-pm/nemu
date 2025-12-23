#!/usr/bin/env bun
/**
 * Test a single Tachiyomi extension and output JSON result
 * Usage: bun dev/test-extension.ts <extension-id> [--timeout=30000]
 * 
 * Output (stdout): JSON with test result
 * Exit code: 0 = pass, 1 = fail/error
 */

import { spawn } from 'bun';
import * as path from 'path';
import * as fs from 'fs';

interface TestResult {
  extensionId: string;
  status: 'pass' | 'fail' | 'error' | 'skipped';
  durationMs: number;
  error?: string;
  details?: {
    sourcesLoaded?: number;
    popularMangaCount?: number;
    latestMangaCount?: number;
  };
}

const args = process.argv.slice(2);
const extensionId = args.find(a => !a.startsWith('--'));
const timeoutArg = args.find(a => a.startsWith('--timeout='));
const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1]) : 30000;

if (!extensionId) {
  console.log(JSON.stringify({
    extensionId: 'unknown',
    status: 'error',
    durationMs: 0,
    error: 'Usage: bun dev/test-extension.ts <extension-id>'
  }));
  process.exit(1);
}

const startTime = Date.now();

async function runTest(): Promise<TestResult> {
  // Convert extension ID format: en/mangapill -> en-mangapill
  const extDirName = extensionId.replace('/', '-');
  const extDir = path.join(import.meta.dir, '../dev/tachiyomi-extensions', extDirName);
  
  // Check if extension exists
  if (!fs.existsSync(extDir)) {
    return {
      extensionId,
      status: 'skipped',
      durationMs: Date.now() - startTime,
      error: `Extension directory not found: ${extDir}`
    };
  }

  const manifestPath = path.join(extDir, 'manifest.json');
  const extensionPath = path.join(extDir, 'extension.js');
  
  if (!fs.existsSync(manifestPath) || !fs.existsSync(extensionPath)) {
    return {
      extensionId,
      status: 'skipped', 
      durationMs: Date.now() - startTime,
      error: 'Missing manifest.json or extension.js'
    };
  }

  const details: TestResult['details'] = {};

  try {
    // Test 1: Load extension and get info
    const infoProc = spawn({
      cmd: ['bun', 'scripts/test-tachiyomi-source.ts', extDirName, 'info'],
      cwd: path.join(import.meta.dir, '..'),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const infoTimeout = setTimeout(() => infoProc.kill(), timeout / 2);
    const infoOutput = await new Response(infoProc.stdout).text();
    const infoExitCode = await infoProc.exited;
    clearTimeout(infoTimeout);

    if (infoExitCode !== 0) {
      const infoStderr = await new Response(infoProc.stderr).text();
      return {
        extensionId,
        status: 'error',
        durationMs: Date.now() - startTime,
        error: `Failed to load extension:\n${infoStderr || infoOutput}`.slice(0, 2000)
      };
    }

    // Parse sources count from info output
    const sourcesMatch = infoOutput.match(/(\d+) sources? available/);
    details.sourcesLoaded = sourcesMatch ? parseInt(sourcesMatch[1]) : 0;

    if (details.sourcesLoaded === 0) {
      return {
        extensionId,
        status: 'fail',
        durationMs: Date.now() - startTime,
        error: 'No sources loaded',
        details
      };
    }

    // Test 2: Try to get popular manga
    const popularProc = spawn({
      cmd: ['bun', 'scripts/test-tachiyomi-source.ts', extDirName, 'popular', '1'],
      cwd: path.join(import.meta.dir, '..'),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const popularTimeout = setTimeout(() => popularProc.kill(), timeout / 2);
    const popularOutput = await new Response(popularProc.stdout).text();
    const popularExitCode = await popularProc.exited;
    clearTimeout(popularTimeout);

    // Parse manga count from popular output
    const popularMatch = popularOutput.match(/Found (\d+) manga/);
    details.popularMangaCount = popularMatch ? parseInt(popularMatch[1]) : 0;

    // Consider pass if we loaded sources and got popular manga
    const hasResults = details.popularMangaCount > 0;
    
    return {
      extensionId,
      status: hasResults ? 'pass' : 'fail',
      durationMs: Date.now() - startTime,
      details,
      ...(hasResults ? {} : { error: `No manga results (popular: ${details.popularMangaCount})` })
    };

  } catch (e: any) {
    return {
      extensionId,
      status: 'error',
      durationMs: Date.now() - startTime,
      error: (e.stack || e.message || String(e)).slice(0, 2000)
    };
  }
}

// Run with overall timeout
const result = await Promise.race([
  runTest(),
  new Promise<TestResult>((resolve) => 
    setTimeout(() => resolve({
      extensionId,
      status: 'error',
      durationMs: timeout,
      error: `Test timed out after ${timeout}ms`
    }), timeout + 5000)
  )
]);

console.log(JSON.stringify(result));
process.exit(result.status === 'pass' ? 0 : 1);
