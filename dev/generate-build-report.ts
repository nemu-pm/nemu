#!/usr/bin/env bun
/**
 * Generate build report from chunk results
 * Usage: bun dev/generate-build-report.ts
 * 
 * Reads: .cache/build-results/*.json (chunk results)
 * Writes: dist/tachiyomi/build-report.json, dist/tachiyomi/build-report.html
 */

import * as fs from 'fs';
import * as path from 'path';

interface ExtensionResult {
  id: string;
  status: 'success' | 'failed' | 'skipped';
  buildTimeMs?: number;
  test?: {
    status: 'pass' | 'fail' | 'error' | 'skipped';
    durationMs?: number;
    error?: string;
    details?: {
      sourcesLoaded?: number;
      popularMangaCount?: number;
      latestMangaCount?: number;
    };
  };
  error?: string;
}

interface ChunkResult {
  chunk: number;
  extensions: ExtensionResult[];
}

interface BuildReport {
  timestamp: string;
  commit: string;
  runId: string;
  duration: string;
  summary: {
    total: number;
    built: number;
    failed: number;
    skipped: number;
    tested: number;
    passed: number;
    testFailed: number;
  };
  extensions: ExtensionResult[];
}

const cacheDir = path.join(import.meta.dir, '../.cache/build-results');
const distDir = path.join(import.meta.dir, '../dist/tachiyomi');

// Read all chunk results
const allExtensions: ExtensionResult[] = [];
const startTime = process.env.BUILD_START_TIME ? new Date(process.env.BUILD_START_TIME) : new Date();

if (fs.existsSync(cacheDir)) {
  const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(cacheDir, file), 'utf-8');
      const chunk: ChunkResult = JSON.parse(content);
      allExtensions.push(...chunk.extensions);
    } catch (e) {
      console.error(`Error reading ${file}:`, e);
    }
  }
}

// Sort by id
allExtensions.sort((a, b) => a.id.localeCompare(b.id));

// Calculate summary
const summary = {
  total: allExtensions.length,
  built: allExtensions.filter(e => e.status === 'success').length,
  failed: allExtensions.filter(e => e.status === 'failed').length,
  skipped: allExtensions.filter(e => e.status === 'skipped').length,
  tested: allExtensions.filter(e => e.test).length,
  passed: allExtensions.filter(e => e.test?.status === 'pass').length,
  testFailed: allExtensions.filter(e => e.test && e.test.status !== 'pass' && e.test.status !== 'skipped').length,
};

const endTime = new Date();
const durationMs = endTime.getTime() - startTime.getTime();
const durationStr = `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;

const report: BuildReport = {
  timestamp: endTime.toISOString(),
  commit: process.env.GITHUB_SHA || 'local',
  runId: process.env.GITHUB_RUN_ID || 'local',
  duration: durationStr,
  summary,
  extensions: allExtensions,
};

// Ensure dist directory exists
fs.mkdirSync(distDir, { recursive: true });

// Write JSON report
fs.writeFileSync(
  path.join(distDir, 'build-report.json'),
  JSON.stringify(report, null, 2)
);

// Generate HTML report
const html = generateHtmlReport(report);
fs.writeFileSync(path.join(distDir, 'build-report.html'), html);

console.log(`Build report generated:`);
console.log(`  Total: ${summary.total}`);
console.log(`  Built: ${summary.built} ✓`);
console.log(`  Failed: ${summary.failed} ✗`);
console.log(`  Skipped: ${summary.skipped}`);
console.log(`  Tested: ${summary.tested} (${summary.passed} passed, ${summary.testFailed} failed)`);

function generateHtmlReport(report: BuildReport): string {
  const statusEmoji = (status: string) => {
    switch (status) {
      case 'success': case 'pass': return '✅';
      case 'failed': case 'fail': return '❌';
      case 'error': return '⚠️';
      case 'skipped': return '⏭️';
      default: return '❓';
    }
  };

  const statusClass = (status: string) => {
    switch (status) {
      case 'success': case 'pass': return 'success';
      case 'failed': case 'fail': return 'failed';
      case 'error': return 'error';
      case 'skipped': return 'skipped';
      default: return '';
    }
  };

  const extensionRows = report.extensions.map(ext => {
    const testCell = ext.test 
      ? `<span class="${statusClass(ext.test.status)}">${statusEmoji(ext.test.status)}</span>` 
      : '<span class="skipped">-</span>';
    
    const errorSection = ext.error 
      ? `<details class="error-details"><summary>Error</summary><pre>${escapeHtml(ext.error)}</pre></details>`
      : '';
    
    const testErrorSection = ext.test?.error
      ? `<details class="error-details"><summary>Test Error</summary><pre>${escapeHtml(ext.test.error)}</pre></details>`
      : '';

    return `
      <tr class="${statusClass(ext.status)}">
        <td><code>${ext.id}</code></td>
        <td><span class="${statusClass(ext.status)}">${statusEmoji(ext.status)} ${ext.status}</span></td>
        <td>${ext.buildTimeMs ? `${(ext.buildTimeMs / 1000).toFixed(1)}s` : '-'}</td>
        <td>${testCell}</td>
        <td>${ext.test?.durationMs ? `${(ext.test.durationMs / 1000).toFixed(1)}s` : '-'}</td>
        <td>${errorSection}${testErrorSection}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tachiyomi Build Report</title>
  <style>
    :root {
      --bg: #0d1117;
      --bg-secondary: #161b22;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --border: #30363d;
      --success: #3fb950;
      --failed: #f85149;
      --warning: #d29922;
      --skipped: #8b949e;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 2rem;
      line-height: 1.5;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { margin: 0 0 0.5rem; font-size: 1.75rem; }
    .meta { color: var(--text-muted); margin-bottom: 2rem; font-size: 0.9rem; }
    .meta code { background: var(--bg-secondary); padding: 0.2em 0.4em; border-radius: 4px; }
    
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }
    .stat-value { font-size: 2rem; font-weight: bold; }
    .stat-label { color: var(--text-muted); font-size: 0.85rem; }
    .stat.success .stat-value { color: var(--success); }
    .stat.failed .stat-value { color: var(--failed); }
    
    .filters {
      margin-bottom: 1rem;
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .filter-btn {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .filter-btn:hover { border-color: var(--text-muted); }
    .filter-btn.active { border-color: var(--success); background: rgba(63, 185, 80, 0.1); }
    
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-secondary);
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th { 
      background: var(--bg);
      font-weight: 600;
      position: sticky;
      top: 0;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: rgba(255,255,255,0.02); }
    
    .success { color: var(--success); }
    .failed { color: var(--failed); }
    .error { color: var(--warning); }
    .skipped { color: var(--skipped); }
    
    code { font-family: 'SF Mono', Consolas, monospace; font-size: 0.9em; }
    
    .error-details {
      margin-top: 0.5rem;
    }
    .error-details summary {
      cursor: pointer;
      color: var(--failed);
      font-size: 0.85rem;
    }
    .error-details pre {
      background: var(--bg);
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 0.8rem;
      margin: 0.5rem 0 0;
      max-height: 300px;
      overflow-y: auto;
    }
    
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔨 Tachiyomi Build Report</h1>
    <div class="meta">
      <span>Commit: <code>${report.commit.slice(0, 7)}</code></span> · 
      <span>Run: <code>#${report.runId}</code></span> · 
      <span>Duration: <strong>${report.duration}</strong></span> · 
      <span>${new Date(report.timestamp).toLocaleString()}</span>
    </div>
    
    <div class="summary">
      <div class="stat">
        <div class="stat-value">${report.summary.total}</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat success">
        <div class="stat-value">${report.summary.built}</div>
        <div class="stat-label">Built</div>
      </div>
      <div class="stat failed">
        <div class="stat-value">${report.summary.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${report.summary.skipped}</div>
        <div class="stat-label">Skipped</div>
      </div>
      <div class="stat success">
        <div class="stat-value">${report.summary.passed}</div>
        <div class="stat-label">Tests Passed</div>
      </div>
      <div class="stat failed">
        <div class="stat-value">${report.summary.testFailed}</div>
        <div class="stat-label">Tests Failed</div>
      </div>
    </div>
    
    <div class="filters">
      <button class="filter-btn active" data-filter="all">All (${report.summary.total})</button>
      <button class="filter-btn" data-filter="success">Built (${report.summary.built})</button>
      <button class="filter-btn" data-filter="failed">Failed (${report.summary.failed})</button>
      <button class="filter-btn" data-filter="test-failed">Test Failed (${report.summary.testFailed})</button>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Extension</th>
          <th>Build</th>
          <th>Build Time</th>
          <th>Test</th>
          <th>Test Time</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody id="extensions">
        ${extensionRows}
      </tbody>
    </table>
  </div>
  
  <script>
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const filter = btn.dataset.filter;
        document.querySelectorAll('#extensions tr').forEach(row => {
          if (filter === 'all') {
            row.classList.remove('hidden');
          } else if (filter === 'test-failed') {
            const hasTestError = row.querySelector('.error-details summary')?.textContent.includes('Test');
            row.classList.toggle('hidden', !hasTestError);
          } else {
            row.classList.toggle('hidden', !row.classList.contains(filter));
          }
        });
      });
    });
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

