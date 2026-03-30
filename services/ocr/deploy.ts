#!/usr/bin/env bun
/**
 * Deploy OCR service to vast.ai
 *
 * Idempotent: skips unchanged files, skips service restart if already healthy.
 * Final step: updates ocr.nemu.pm DNS via Cloudflare API.
 *
 * Usage:
 *   bun deploy.ts <ssh-host> <ssh-port>           # Full deploy
 *   bun deploy.ts <ssh-host> <ssh-port> --vllm    # Restart vLLM only
 *   bun deploy.ts <ssh-host> <ssh-port> --server  # Restart detection server only
 *
 * Reads CLOUDFLARE_API_TOKEN from services/ocr/.env (or env var).
 */

import { $ } from "bun";
import { join, dirname } from "path";
import { mkdirSync, existsSync, readdirSync } from "fs";

const SCRIPT_DIR = dirname(import.meta.path);

// Load .env from script directory
const envPath = join(SCRIPT_DIR, ".env");
if (existsSync(envPath)) {
  const envContent = await Bun.file(envPath).text();
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ZONE_ID = "8c7c0aa5b83ef6e94a5ad3eeb6788105";
const CF_RECORD_NAME = "ocr.nemu.pm";

// Parse args
const args = process.argv.slice(2);
const positionalArgs = args.filter((a) => !a.startsWith("--"));
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

// --- SSH helpers ---

const controlDir = "/tmp/ssh-mux-deploy";
const controlPath = `${controlDir}/%r@%h:%p`;
if (!existsSync(controlDir)) mkdirSync(controlDir, { recursive: true });

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

// --- File sync ---

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

// --- Service health checks ---

async function isVllmHealthy(): Promise<boolean> {
  const proc = await ssh("pgrep -f 'vllm serve' > /dev/null 2>&1 && curl -sf http://localhost:8000/health > /dev/null 2>&1 && echo OK || echo FAIL", false);
  return proc.stdout.toString().trim() === "OK";
}

async function isServerHealthy(): Promise<boolean> {
  const proc = await ssh("curl -sf http://localhost:8080/health > /dev/null 2>&1 && echo OK || echo FAIL", false);
  return proc.stdout.toString().trim() === "OK";
}

// --- Service start ---

async function startVllm() {
  console.log("Starting vLLM server (port 8000)...");

  const vllmCheck = await ssh("which vllm || echo 'NOT_FOUND'", false);
  if (vllmCheck.stdout.toString().includes("NOT_FOUND")) {
    console.log("      Installing vLLM...");
    await ssh("pip install -q vllm");
  }

  await ssh(
    `
      pkill -15 -f 'vllm serve' 2>/dev/null || true
      pkill -15 -f 'vllm\\.entrypoints\\.openai\\.api_server' 2>/dev/null || true
      fuser -k -TERM 8000/tcp 2>/dev/null || true
      sleep 6
      pkill -9 -f 'vllm serve' 2>/dev/null || true
      pkill -9 -f 'vllm\\.entrypoints\\.openai\\.api_server' 2>/dev/null || true
      fuser -k 8000/tcp 2>/dev/null || true
      sleep 2
    `,
    false,
  );

  // GPU preflight
  const memLine = (
    await ssh(
      "nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo ''",
      false,
    )
  ).stdout.toString().trim();
  if (memLine) {
    const [usedStr, totalStr] = memLine.split(",").map((s) => s.trim());
    const used = Number.parseInt(usedStr ?? "", 10);
    const total = Number.parseInt(totalStr ?? "", 10);
    if (Number.isFinite(used) && Number.isFinite(total) && total > 0 && total - used < 8192) {
      const diag = await ssh("nvidia-smi; echo ''; echo 'GPU has <8GiB free. Stop other GPU processes or use a fresh instance.'", false);
      console.log(diag.stdout.toString());
      throw new Error(`vLLM preflight failed: ${total - used}MiB free of ${total}MiB`);
    }
  }

  await ssh("rm -f /app/vllm.log", false);
  await ssh(
    `
    cd /app
    nohup vllm serve jzhang533/PaddleOCR-VL-For-Manga \\
      --trust-remote-code \\
      --max-model-len 4096 \\
      --max-num-batched-tokens 16384 \\
      --gpu-memory-utilization 0.90 \\
      --port 8000 \\
      > /app/vllm.log 2>&1 &
    disown
  `,
    false,
  );

  console.log("      vLLM starting, waiting for ready...");

  const maxWaitSec = 180;
  const pollIntervalMs = 5000;
  let elapsed = 0;
  let lastLogLines = "";

  while (elapsed < maxWaitSec * 1000) {
    await Bun.sleep(pollIntervalMs);
    elapsed += pollIntervalMs;

    const logResult = await ssh("tail -60 /app/vllm.log 2>/dev/null || echo ''", false);
    const log = logResult.stdout.toString();

    if (log !== lastLogLines) {
      const newLines = log.split("\n").filter((l) => l.trim() && !lastLogLines.includes(l));
      for (const line of newLines.slice(-3)) {
        console.log(`      ${line.substring(0, 100)}`);
      }
      lastLogLines = log;
    }

    if (log.includes("Uvicorn running") || log.includes("Application startup complete")) {
      console.log("\n      ✅ vLLM is ready!");
      return;
    }

    if (
      log.includes("Engine core initialization failed") ||
      log.includes("CUDA out of memory") ||
      (log.includes("Traceback") && (log.includes("Error") || log.includes("Exception"))) ||
      log.includes("RuntimeError:")
    ) {
      const diag = await ssh("nvidia-smi 2>/dev/null; echo '---'; tail -200 /app/vllm.log 2>/dev/null", false);
      console.log(diag.stdout.toString());
      throw new Error("vLLM startup failed");
    }

    const procCheck = await ssh("pgrep -f 'vllm serve' || echo 'DEAD'", false);
    if (procCheck.stdout.toString().includes("DEAD")) {
      const fullLog = await ssh("cat /app/vllm.log", false);
      console.log(fullLog.stdout.toString());
      throw new Error("vLLM process died");
    }

    process.stdout.write(`      Waiting... ${Math.round(elapsed / 1000)}s\r`);
  }

  const diag = await ssh("nvidia-smi 2>/dev/null; echo '---'; tail -200 /app/vllm.log 2>/dev/null", false);
  console.log(diag.stdout.toString());
  throw new Error(`vLLM startup timed out (${maxWaitSec}s)`);
}

async function startServer() {
  console.log("Starting detection server (port 8080)...");

  await ssh(
    `
    pkill -9 -f 'python.*server.py' 2>/dev/null || true
    fuser -k 8080/tcp 2>/dev/null || true
    sleep 2
  `,
    false,
  );

  await ssh(
    `
    cd /app
    export VLLM_URL=http://localhost:8000/v1
    nohup python3 server.py > /app/server.log 2>&1 &
    disown
  `,
    false,
  );

  await Bun.sleep(8000);

  const healthCheck = await ssh("curl -s http://localhost:8080/health || echo 'FAILED'", false);
  const out = healthCheck.stdout.toString().trim();
  if (out.includes("FAILED")) {
    console.log("      ⚠️  Server not responding yet");
    const log = await ssh("tail -20 /app/server.log 2>/dev/null || echo 'No log'", false);
    console.log(log.stdout.toString());
  } else {
    console.log("      ✅ Server healthy");
    console.log(`      ${out}`);
  }
}

// --- DNS update ---

async function updateDns(ip: string) {
  if (!CF_API_TOKEN) {
    console.log("      ⚠️  CLOUDFLARE_API_TOKEN not set, skipping DNS update");
    return;
  }

  const headers = {
    Authorization: `Bearer ${CF_API_TOKEN}`,
    "Content-Type": "application/json",
  };

  // Find existing record
  const listRes = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=${CF_RECORD_NAME}&type=A`,
    { headers },
  );
  const listData = (await listRes.json()) as any;
  const record = listData.result?.[0];

  if (record && record.content === ip) {
    console.log(`      ${CF_RECORD_NAME} already points to ${ip}`);
    return;
  }

  if (record) {
    // Update existing
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${record.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ content: ip }),
      },
    );
    const data = (await res.json()) as any;
    if (!data.success) throw new Error(`DNS update failed: ${JSON.stringify(data.errors)}`);
    console.log(`      ${CF_RECORD_NAME} updated: ${record.content} → ${ip}`);
  } else {
    // Create new
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "A", name: CF_RECORD_NAME, content: ip, proxied: true }),
      },
    );
    const data = (await res.json()) as any;
    if (!data.success) throw new Error(`DNS create failed: ${JSON.stringify(data.errors)}`);
    console.log(`      ${CF_RECORD_NAME} created → ${ip} (proxied)`);
  }
}

function extractIp(sshHost: string): string {
  const atIdx = sshHost.indexOf("@");
  return atIdx >= 0 ? sshHost.slice(atIdx + 1) : sshHost;
}

// --- Main ---

const mode = vllmOnly ? "vllm" : serverOnly ? "server" : "full";
console.log(`\n🚀 Deploying OCR service to ${host}:${port} (mode: ${mode})\n`);

try {
  console.log("[0] Testing SSH connection...");
  try {
    await establishMasterConnection();
  } catch (e) {
    console.error("Failed to connect. Check your SSH key and host.");
    console.error(e);
    process.exit(1);
  }
  console.log("    Connected!\n");

  if (vllmOnly) {
    await startVllm();
    console.log("\n✅ vLLM restart complete!");
    process.exit(0);
  }

  if (serverOnly) {
    await startServer();
    console.log("\n✅ Server restart complete!");
    process.exit(0);
  }

  // Full deploy
  console.log("[1/8] Creating directories...");
  await ssh("mkdir -p /app/model /app/detector/utils /app/detector/models/yolov5");

  console.log("[2/8] Syncing server files...");
  let serverFilesChanged = false;
  serverFilesChanged = (await syncFile(join(SCRIPT_DIR, "server.py"), "/app/server.py", "server.py")) || serverFilesChanged;
  serverFilesChanged = (await syncFile(join(SCRIPT_DIR, "text_order.py"), "/app/text_order.py", "text_order.py")) || serverFilesChanged;
  serverFilesChanged = (await syncFile(join(SCRIPT_DIR, "text_order_defaults.py"), "/app/text_order_defaults.py", "text_order_defaults.py")) || serverFilesChanged;
  const requirementsChanged = await syncFile(join(SCRIPT_DIR, "requirements.txt"), "/app/requirements.txt", "requirements.txt");

  console.log("[3/8] Syncing detector package...");
  const detectorDir = join(SCRIPT_DIR, "detector");
  for (const f of ["__init__.py", "inference.py", "basemodel.py"]) {
    serverFilesChanged = (await syncFile(join(detectorDir, f), `/app/detector/${f}`, `detector/${f}`)) || serverFilesChanged;
  }
  const utilsDir = join(detectorDir, "utils");
  for (const f of readdirSync(utilsDir).filter((f) => f.endsWith(".py"))) {
    serverFilesChanged = (await syncFile(join(utilsDir, f), `/app/detector/utils/${f}`, `utils/${f}`)) || serverFilesChanged;
  }
  const yoloDir = join(detectorDir, "models/yolov5");
  await syncFile(join(detectorDir, "models/__init__.py"), "/app/detector/models/__init__.py", "models/__init__.py");
  for (const f of readdirSync(yoloDir).filter((f) => f.endsWith(".py"))) {
    serverFilesChanged = (await syncFile(join(yoloDir, f), `/app/detector/models/yolov5/${f}`, `yolov5/${f}`)) || serverFilesChanged;
  }

  console.log("[4/8] Syncing detection model (~77MB)...");
  const modelPath = join(SCRIPT_DIR, "model/comictextdetector.pt");
  if (existsSync(modelPath)) {
    await syncFile(modelPath, "/app/model/comictextdetector.pt", "comictextdetector.pt");
  } else {
    console.log("      ⚠️  Model not found locally, skipping");
  }

  console.log("[5/8] Installing dependencies...");
  if (requirementsChanged) {
    console.log("      requirements.txt changed, installing...");
    await ssh("pip install -q -r /app/requirements.txt");
  } else {
    const pipCheck = await ssh("pip show fastapi torch vllm pyclipper 2>/dev/null | grep -c 'Name:' || echo 0", false);
    const count = parseInt(pipCheck.stdout.toString().trim());
    if (count < 4) {
      console.log("      Missing packages, installing...");
      await ssh("pip install -q -r /app/requirements.txt");
    } else {
      console.log("      All dependencies installed");
    }
  }

  // Kill jupyter to free resources (first deploy only, idempotent)
  await ssh("supervisorctl stop jupyter 2>/dev/null || true; pkill -9 -f 'jupyter-notebook' 2>/dev/null || true", false);

  console.log("[6/8] Checking vLLM...");
  const vllmHealthy = await isVllmHealthy();
  if (vllmHealthy) {
    console.log("      ✅ vLLM already running and healthy");
  } else {
    await startVllm();
  }

  console.log("[7/8] Checking detection server...");
  const serverHealthy = await isServerHealthy();
  if (serverHealthy && !serverFilesChanged) {
    console.log("      ✅ Server already running and healthy (no file changes)");
  } else {
    if (serverHealthy && serverFilesChanged) {
      console.log("      Server files changed, restarting...");
    }
    await startServer();
  }

  console.log("[8/8] Updating DNS...");
  const ip = extractIp(host);
  await updateDns(ip);

  const healthOut = (await ssh("curl -s http://localhost:8080/health || echo '{}'", false)).stdout.toString().trim();
  console.log(`
✅ Deployed!

Health: ${healthOut}

Endpoints:
  https://${CF_RECORD_NAME}/health
  https://${CF_RECORD_NAME}/detect
  https://${CF_RECORD_NAME}/ocr

Logs:
  ssh -p ${port} ${host} "tail -f /app/server.log"
  ssh -p ${port} ${host} "tail -f /app/vllm.log"
`);
} catch (e) {
  console.error("\n❌ Deployment failed:", e);
  process.exit(1);
} finally {
  await $`ssh -O exit -o ControlPath=${controlPath} ${host} 2>/dev/null`.nothrow().quiet();
}
