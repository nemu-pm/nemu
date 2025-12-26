#!/usr/bin/env bun
/**
 * Deploy OCR service to vast.ai
 * 
 * Services:
 * 1. Text detection server (FastAPI on port 8080)
 * 2. vLLM OCR server (on port 8000)
 * 
 * Usage: 
 *   bun deploy.ts <ssh-host> <ssh-port>           # Full deploy
 *   bun deploy.ts <ssh-host> <ssh-port> --vllm    # Restart vLLM only
 *   bun deploy.ts <ssh-host> <ssh-port> --server  # Restart detection server only
 */

import { $ } from "bun";
import { join, dirname } from "path";
import { mkdirSync, existsSync, readdirSync } from "fs";

const SCRIPT_DIR = dirname(import.meta.path);

// Parse args
const args = process.argv.slice(2);
const positionalArgs = args.filter(a => !a.startsWith("--"));
const host = positionalArgs[0];
const port = positionalArgs[1];
const vllmOnly = args.includes("--vllm");
const serverOnly = args.includes("--server");

if (!host || !port) {
  console.error("Usage:");
  console.error("  bun deploy.ts <ssh-host> <ssh-port>           # Full deploy");
  console.error("  bun deploy.ts <ssh-host> <ssh-port> --vllm    # Restart vLLM only");
  console.error("  bun deploy.ts <ssh-host> <ssh-port> --server  # Restart server only");
  console.error("");
  console.error("Example: bun deploy.ts root@<ip> <port>");
  process.exit(1);
}

// SSH multiplexing for connection reuse
const controlDir = "/tmp/ssh-mux-deploy";
const controlPath = `${controlDir}/%r@%h:%p`;

if (!existsSync(controlDir)) {
  mkdirSync(controlDir, { recursive: true });
}

const sshBase = [
  "-p", port,
  "-o", "ControlMaster=auto",
  "-o", `ControlPath=${controlPath}`,
  "-o", "ControlPersist=60",
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=3",
  "-o", "StrictHostKeyChecking=no",
  "-o", "BatchMode=yes",
];

async function establishMasterConnection() {
  // Explicitly establish the SSH master connection
  const result = await $`ssh -nNf ${sshBase} ${host}`.nothrow().quiet();
  if (result.exitCode !== 0) {
    throw new Error(`Failed to establish SSH master: ${result.stderr}`);
  }
}

async function ssh(cmd: string, throwOnError = true) {
  const result = await $`ssh -n ${sshBase} ${host} ${cmd}`.nothrow().quiet();
  if (throwOnError && result.exitCode !== 0) {
    console.error(`SSH command failed: ${cmd}`);
    console.error(`stderr: ${result.stderr}`);
    throw new Error(`SSH failed with code ${result.exitCode}`);
  }
  return result;
}

async function scp(local: string, remote: string) {
  const scpOpts = [
    "-P", port,
    "-o", "ControlMaster=auto",
    "-o", `ControlPath=${controlPath}`,
    "-o", "ControlPersist=60",
  ];
  const result = await $`scp -r ${scpOpts} ${local} ${host}:${remote}`.nothrow().quiet();
  if (result.exitCode !== 0) {
    console.error(`SCP failed: ${local} -> ${remote}`);
    console.error(`stderr: ${result.stderr}`);
    throw new Error(`SCP failed with code ${result.exitCode}`);
  }
  return result;
}

async function getLocalMd5(path: string): Promise<string> {
  const result = await $`md5sum ${path}`.nothrow().quiet();
  return result.stdout.toString().split(" ")[0].trim();
}

async function getRemoteMd5(path: string): Promise<string | null> {
  const result = await ssh(`md5sum ${path} 2>/dev/null || echo ''`, false);
  const output = result.stdout.toString().trim();
  if (!output) return null;
  return output.split(" ")[0].trim();
}

async function syncFile(local: string, remote: string, label: string): Promise<boolean> {
  const localMd5 = await getLocalMd5(local);
  const remoteMd5 = await getRemoteMd5(remote);
  
  if (localMd5 === remoteMd5) {
    console.log(`      ${label} - unchanged`);
    return false;
  }
  
  console.log(`      ${label} - copying...`);
  await scp(local, remote);
  return true;
}

async function startVllm() {
  console.log("Starting vLLM server (port 8000)...");
  
  // Check if vLLM is installed
  const vllmCheck = await ssh("which vllm || echo 'NOT_FOUND'", false);
  if (vllmCheck.stdout.toString().includes("NOT_FOUND")) {
    console.log("      Installing vLLM (this may take a few minutes)...");
    await ssh("pip install -q vllm");
  }
  
  // Kill existing vLLM (try graceful shutdown first, then hard kill).
  // vLLM can spawn worker procs; ensure the port is free before restarting.
  await ssh(
    `
      # Best-effort graceful stop
      pkill -15 -f 'vllm serve' 2>/dev/null || true
      pkill -15 -f 'vllm\\.entrypoints\\.openai\\.api_server' 2>/dev/null || true
      fuser -k -TERM 8000/tcp 2>/dev/null || true
      sleep 6

      # Hard stop anything left
      pkill -9 -f 'vllm serve' 2>/dev/null || true
      pkill -9 -f 'vllm\\.entrypoints\\.openai\\.api_server' 2>/dev/null || true
      fuser -k 8000/tcp 2>/dev/null || true
      sleep 2

      # Confirm port is free (no output if free)
      (lsof -iTCP:8000 -sTCP:LISTEN -nP || true)
    `,
    false
  );
  
  // Clear old log
  await ssh("rm -f /app/vllm.log", false);

  // Preflight: if the GPU is already mostly occupied by something else (often another container),
  // vLLM will fail with "Free memory on device ... is less than desired GPU memory utilization".
  // Fail fast with actionable diagnostics instead of waiting 120s.
  const memLine = (await ssh("nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo ''", false))
    .stdout.toString().trim();
  if (memLine) {
    const parts = memLine.split(",").map((s) => s.trim());
    const used = Number.parseInt(parts[0] ?? "", 10);
    const total = Number.parseInt(parts[1] ?? "", 10);
    if (Number.isFinite(used) && Number.isFinite(total) && total > 0) {
      const free = total - used;
      if (free < 8192) {
        const diag = await ssh(
          `
            echo '--- nvidia-smi ---' && (nvidia-smi || true) && echo '' &&
            echo '--- free -h ---' && (free -h || true) && echo '' &&
            echo '--- note ---' &&
            echo 'GPU has <8GiB free at deploy time; vLLM will not start. This usually means another workload/container is using the GPU.' && echo '' &&
            echo 'Try: stop other GPU processes on the instance OR pick a fresh vast.ai instance.'
          `,
          false
        );
        console.log(diag.stdout.toString());
        throw new Error(`vLLM preflight failed: low GPU free memory (${free}MiB free of ${total}MiB)`);
      }
    }
  }
  
  // Start vLLM
  await ssh(`
    cd /app
    nohup vllm serve jzhang533/PaddleOCR-VL-For-Manga \\
      --trust-remote-code \\
      --max-model-len 4096 \\
      --max-num-batched-tokens 16384 \\
      --gpu-memory-utilization 0.90 \\
      --port 8000 \\
      > /app/vllm.log 2>&1 &
    disown
  `, false);
  
  console.log("      vLLM starting, waiting for ready...");
  
  // Poll for startup (check for "Uvicorn running" or errors)
  const maxWaitSec = 120;
  const pollIntervalMs = 5000;
  let elapsed = 0;
  let ready = false;
  let lastLogLines = "";
  
  while (elapsed < maxWaitSec * 1000) {
    await Bun.sleep(pollIntervalMs);
    elapsed += pollIntervalMs;
    
    const logResult = await ssh("tail -60 /app/vllm.log 2>/dev/null || echo ''", false);
    const log = logResult.stdout.toString();
    
    // Show new log lines
    if (log !== lastLogLines) {
      const newLines = log.split("\n").filter(l => l.trim() && !lastLogLines.includes(l));
      for (const line of newLines.slice(-3)) {
        console.log(`      ${line.substring(0, 100)}`);
      }
      lastLogLines = log;
    }
    
    // Check for success
    if (log.includes("Uvicorn running") || log.includes("Application startup complete")) {
      ready = true;
      break;
    }
    
    // Check for fatal errors (vLLM sometimes truncates the traceback in tail output)
    if (
      log.includes("Engine core initialization failed") ||
      log.includes("CUDA out of memory") ||
      (log.includes("Traceback") && (log.includes("Error") || log.includes("Exception"))) ||
      log.includes("RuntimeError:")
    ) {
      console.log("\n      ❌ vLLM failed to start. Full log:");
      const diag = await ssh(
        `
          echo '--- nvidia-smi ---' && (nvidia-smi || true) && echo '' &&
          echo '--- free -h ---' && (free -h || true) && echo '' &&
          echo '--- vLLM log (tail -200) ---' && (tail -200 /app/vllm.log 2>/dev/null || true)
        `,
        false
      );
      console.log(diag.stdout.toString());
      throw new Error("vLLM startup failed");
    }
    
    // Check if process died
    const procCheck = await ssh("pgrep -f 'vllm serve' || echo 'DEAD'", false);
    if (procCheck.stdout.toString().includes("DEAD")) {
      console.log("\n      ❌ vLLM process died. Log:");
      const fullLog = await ssh("cat /app/vllm.log", false);
      console.log(fullLog.stdout.toString());
      throw new Error("vLLM process died");
    }
    
    process.stdout.write(`      Waiting... ${Math.round(elapsed/1000)}s\r`);
  }
  
  if (ready) {
    console.log("\n      ✅ vLLM is ready!");
  } else {
    console.log(`\n      ❌ vLLM did not become ready (waited ${maxWaitSec}s). Diagnostics:`);
    const diag = await ssh(
      `
        echo '--- nvidia-smi ---' && (nvidia-smi || true) && echo '' &&
        echo '--- free -h ---' && (free -h || true) && echo '' &&
        echo '--- vLLM log (tail -200) ---' && (tail -200 /app/vllm.log 2>/dev/null || true)
      `,
      false
    );
    console.log(diag.stdout.toString());
    throw new Error("vLLM startup timed out");
  }
}

async function startServer() {
  console.log("Starting detection server (port 8080)...");
  
  // Kill existing server
  await ssh(`
    pkill -9 -f 'python.*server.py' 2>/dev/null || true
    fuser -k 8080/tcp 2>/dev/null || true
    sleep 2
  `, false);
  
  // Start server
  await ssh(`
    cd /app
    export VLLM_URL=http://localhost:8000/v1
    nohup python3 server.py > /app/server.log 2>&1 &
    disown
  `, false);
  
  await Bun.sleep(8000);
  
  // Check health
  const healthCheck = await ssh("curl -s http://localhost:8080/health || echo 'FAILED'", false);
  const healthOutput = healthCheck.stdout.toString().trim();
  
  if (healthOutput.includes("FAILED")) {
    console.log("      ⚠️  Server not responding yet");
    const serverLog = await ssh("tail -20 /app/server.log 2>/dev/null || echo 'No log'", false);
    console.log(serverLog.stdout.toString());
  } else {
    console.log("      ✅ Server healthy");
    console.log(`      ${healthOutput}`);
  }
}

// Main
const mode = vllmOnly ? "vllm" : serverOnly ? "server" : "full";
console.log(`\n🚀 Deploying OCR service to ${host}:${port} (mode: ${mode})\n`);

try {
  // Test connection
  console.log("[0] Testing SSH connection...");
  try {
    await establishMasterConnection();
  } catch (e) {
    console.error("Failed to connect. Check your SSH key and host.");
    console.error(e);
    process.exit(1);
  }
  console.log("    Connected!\n");

  // vLLM only mode
  if (vllmOnly) {
    await startVllm();
    console.log("\n✅ vLLM restart complete!");
    process.exit(0);
  }

  // Server only mode
  if (serverOnly) {
    await startServer();
    console.log("\n✅ Server restart complete!");
    process.exit(0);
  }

  // Full deploy
  console.log("[1/7] Creating directories...");
  await ssh("mkdir -p /app/model /app/detector/utils /app/detector/models/yolov5");

  console.log("[2/7] Syncing server files...");
  await syncFile(join(SCRIPT_DIR, "server.py"), "/app/server.py", "server.py");
  await syncFile(join(SCRIPT_DIR, "text_order.py"), "/app/text_order.py", "text_order.py");
  await syncFile(join(SCRIPT_DIR, "requirements.txt"), "/app/requirements.txt", "requirements.txt");

  console.log("[3/7] Syncing detector package...");
  const detectorDir = join(SCRIPT_DIR, "detector");
  
  for (const f of ["__init__.py", "inference.py", "basemodel.py"]) {
    await syncFile(join(detectorDir, f), `/app/detector/${f}`, `detector/${f}`);
  }
  
  const utilsDir = join(detectorDir, "utils");
  for (const f of readdirSync(utilsDir).filter(f => f.endsWith(".py"))) {
    await syncFile(join(utilsDir, f), `/app/detector/utils/${f}`, `utils/${f}`);
  }
  
  const yoloDir = join(detectorDir, "models/yolov5");
  await syncFile(join(detectorDir, "models/__init__.py"), "/app/detector/models/__init__.py", "models/__init__.py");
  for (const f of readdirSync(yoloDir).filter(f => f.endsWith(".py"))) {
    await syncFile(join(yoloDir, f), `/app/detector/models/yolov5/${f}`, `yolov5/${f}`);
  }

  console.log("[4/7] Syncing detection model (~77MB)...");
  const modelPath = join(SCRIPT_DIR, "model/comictextdetector.pt");
  if (existsSync(modelPath)) {
    await syncFile(modelPath, "/app/model/comictextdetector.pt", "comictextdetector.pt");
  } else {
    console.log("      ⚠️  Model not found locally, skipping");
  }

  console.log("[5/7] Installing dependencies...");
  const pipCheck = await ssh("pip show fastapi torch vllm pyclipper 2>/dev/null | grep -c 'Name:' || echo 0", false);
  const installedCount = parseInt(pipCheck.stdout.toString().trim());
  if (installedCount < 4) {
    console.log("      Installing Python packages (this may take a few minutes)...");
    await ssh(`pip install -q -r /app/requirements.txt`);
  } else {
    console.log("      All dependencies installed");
  }

  // Stop services
  console.log("[6/7] Stopping existing services...");
  await ssh(`
    supervisorctl stop jupyter 2>/dev/null || true
    pkill -9 -f 'jupyter-notebook' 2>/dev/null || true
    pkill -9 -f 'python.*server.py' 2>/dev/null || true
    pkill -9 -f 'vllm serve' 2>/dev/null || true
    fuser -k 8080/tcp 2>/dev/null || true
    fuser -k 8000/tcp 2>/dev/null || true
    sleep 2
  `, false);

  // Start services
  console.log("[7/7] Starting services...");
  
  // Start vLLM first
  await startVllm();
  
  // Start detection server
  await ssh(`
    cd /app
    export VLLM_URL=http://localhost:8000/v1
    nohup python3 server.py > /app/server.log 2>&1 &
    disown
  `, false);
  console.log("      Detection server starting (port 8080)...");
  
  await Bun.sleep(10000);
  
  // Check health
  const healthCheck = await ssh("curl -s http://localhost:8080/health || echo 'FAILED'", false);
  const healthOutput = healthCheck.stdout.toString().trim();
  
  if (healthOutput.includes("FAILED") || healthOutput.includes("error")) {
    const serverLog = await ssh("tail -30 /app/server.log 2>/dev/null || echo 'No log'", false);
    const vllmLog = await ssh("tail -30 /app/vllm.log 2>/dev/null || echo 'No log'", false);
    
    console.log(`
⚠️  Server may not be ready yet.

Server log:
${serverLog.stdout.toString()}

vLLM log:
${vllmLog.stdout.toString()}

Debug:
  ssh -p ${port} ${host}
  tail -f /app/server.log
  tail -f /app/vllm.log
`);
  } else {
    console.log(`
✅ Deployed!

Health: ${healthOutput}

Endpoints:
  /health  - Health check
  /detect  - Text detection only
  /ocr     - Detection + OCR (SSE stream)

Logs:
  ssh -p ${port} ${host} "tail -f /app/server.log"
  ssh -p ${port} ${host} "tail -f /app/vllm.log"

Restart commands:
  bun deploy.ts ${host} ${port} --vllm    # Restart vLLM only
  bun deploy.ts ${host} ${port} --server  # Restart detection server only
`);
  }
} catch (e) {
  console.error("\n❌ Deployment failed:", e);
  process.exit(1);
} finally {
  await $`ssh -O exit -o ControlPath=${controlPath} ${host} 2>/dev/null`.nothrow().quiet();
}
