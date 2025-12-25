#!/usr/bin/env bun
/**
 * Deploy comic text detector to vast.ai
 * Usage: bun deploy.ts <ssh-host> <ssh-port>
 * Example: bun deploy.ts root@<ip> <port>
 */

import { $ } from "bun";
import { join, dirname } from "path";
import { mkdirSync, existsSync } from "fs";

const SCRIPT_DIR = dirname(import.meta.path);
const PROJECT_ROOT = join(SCRIPT_DIR, "../..");

const host = process.argv[2];
const port = process.argv[3];

if (!host || !port) {
  console.error("Usage: bun deploy.ts <ssh-host> <ssh-port>");
  console.error("Example: bun deploy.ts root@<ip> <port>");
  process.exit(1);
}

// SSH multiplexing for connection reuse (vast.ai connections are flaky)
const controlDir = "/tmp/ssh-mux-deploy";
const controlPath = `${controlDir}/%r@%h:%p`;

// Ensure control directory exists
if (!existsSync(controlDir)) {
  mkdirSync(controlDir, { recursive: true });
}

const sshBase = [
  "-n",  // Prevent reading from stdin (avoids hangs with background processes)
  "-p", port,
  "-o", "ControlMaster=auto",
  "-o", `ControlPath=${controlPath}`,
  "-o", "ControlPersist=60",
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=3",
];

async function ssh(cmd: string, throwOnError = true) {
  const result = await $`ssh ${sshBase} ${host} ${cmd}`.nothrow().quiet();
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
  const result = await $`scp ${scpOpts} ${local} ${host}:${remote}`.nothrow().quiet();
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
    console.log(`      ${label} - unchanged, skipping`);
    return false;
  }
  
  console.log(`      ${label} - copying...`);
  await scp(local, remote);
  return true;
}

console.log(`\n🚀 Deploying to ${host}:${port}\n`);

try {
  // Test connection
  console.log("[0/5] Testing SSH connection...");
  const testResult = await ssh("echo ok", false);
  if (testResult.exitCode !== 0) {
    console.error("Failed to connect. Check your SSH key and host.");
    process.exit(1);
  }
  console.log("      Connected!\n");

  // Create directories
  console.log("[1/5] Creating directories...");
  await ssh("mkdir -p /app/model");

  // Copy files (with hash check)
  console.log("[2/5] Syncing server.py...");
  await syncFile(join(SCRIPT_DIR, "server.py"), "/app/server.py", "server.py");

  console.log("[3/5] Syncing model (~77MB)...");
  await syncFile(
    join(PROJECT_ROOT, "public/comictextdetector.pt.onnx"),
    "/app/model/comictextdetector.pt.onnx",
    "comictextdetector.pt.onnx"
  );

  // Install deps - always check if they're installed
  console.log("[4/5] Installing dependencies...");
  const pipCheck = await ssh("pip show fastapi onnxruntime-gpu 2>/dev/null | grep -c 'Name:' || echo 0", false);
  const installedCount = parseInt(pipCheck.stdout.toString().trim());
  if (installedCount < 2) {
    console.log("      Installing (missing packages)...");
    await ssh("pip install -q fastapi 'uvicorn[standard]' onnxruntime-gpu numpy pillow python-multipart");
  } else {
    console.log("      Dependencies already installed");
  }

  // Restart server
  console.log("[5/5] Restarting server...");
  // Stop Jupyter and kill any process using port 8080
  await ssh(`
    supervisorctl stop jupyter 2>/dev/null || true
    pkill -9 -f 'jupyter-notebook' 2>/dev/null || true
    pkill -9 -f 'python3.*/app/server.py' 2>/dev/null || true
    pkill -9 -f 'uvicorn.*8080' 2>/dev/null || true
    fuser -k 8080/tcp 2>/dev/null || true
    lsof -ti:8080 | xargs -r kill -9 2>/dev/null || true
    sleep 1
  `, false);
  await Bun.sleep(2000);
  
  // Start server - use timeout to prevent hanging
  console.log("      Starting server...");
  const startCmd = await $`timeout 5 ssh -p ${port} ${host} "nohup python3 /app/server.py > /app/server.log 2>&1 & disown && sleep 1 && echo started"`.nothrow().quiet();
  if (startCmd.exitCode === 124) {
    console.log("      (SSH timed out, but server may have started)");
  } else {
    console.log(`      ${startCmd.stdout.toString().trim()}`);
  }
  
  // Wait for startup
  console.log("      Waiting for startup...");
  await Bun.sleep(3000);
  
  // Show startup log
  const startResult = await ssh("cat /app/server.log 2>/dev/null || echo 'No log yet'", false);
  const startupLog = startResult.stdout.toString();
  console.log("      Startup log:");
  console.log(startupLog.split('\n').map(l => `        ${l}`).join('\n'));

  // Check if server started
  const checkResult = await ssh("curl -s http://localhost:8080/health || echo 'CURL_FAILED'", false);
  const healthOutput = checkResult.stdout.toString().trim();
  
  if (healthOutput.includes("CURL_FAILED") || healthOutput.includes("error")) {
    // Get more debug info
    const psResult = await ssh("ps aux | grep python || true", false);
    const logResult = await ssh("cat /app/server.log 2>/dev/null || echo 'No log file'", false);
    
    console.log(`
⚠️  Server failed to start!

Process list:
${psResult.stdout.toString()}

Full log:
${logResult.stdout.toString()}

Debug manually:
  ssh -p ${port} ${host}
  cd /app && python3 server.py
`);
  } else {
    console.log(`
✅ Deployed!

Internal: http://localhost:8080
External: Check vast.ai dashboard for mapped port (internal 8080 → external ???)

Logs: ssh -p ${port} ${host} "tail -f /app/server.log"
`);
  }
} catch (e) {
  console.error("\n❌ Deployment failed:", e);
  process.exit(1);
} finally {
  // Close the multiplexed SSH connection
  await $`ssh -O exit -o ControlPath=${controlPath} ${host} 2>/dev/null`.nothrow().quiet();
}
