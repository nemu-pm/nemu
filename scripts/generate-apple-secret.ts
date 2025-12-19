/**
 * Generate Apple Sign In client secret JWT and set it in Convex
 * 
 * Reads from env vars (or .env.local):
 *   APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID
 *   APPLE_PRIVATE_KEY (key content) OR APPLE_PRIVATE_KEY_PATH (path to .p8 file)
 * 
 * Usage: npx tsx scripts/generate-apple-secret.ts
 */

import { SignJWT, importPKCS8 } from "jose";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { config } from "dotenv";

// Load .env.local
config({ path: ".env.local" });

const teamId = process.env.APPLE_TEAM_ID;
const keyId = process.env.APPLE_KEY_ID;
const clientId = process.env.APPLE_CLIENT_ID;
const keyPath = process.env.APPLE_PRIVATE_KEY_PATH;
const keyContent = process.env.APPLE_PRIVATE_KEY;

// Skip silently if not configured
if (!teamId || !keyId || !clientId) {
  console.log("⏭️  Apple Sign In not configured, skipping secret generation");
  process.exit(0);
}

// Get private key from env var or file
let privateKey: string;
if (keyContent) {
  // Key content directly in env var (for CI/Vercel)
  privateKey = keyContent.replace(/\\n/g, "\n");
} else if (keyPath && existsSync(keyPath)) {
  // Key file path (for local dev)
  privateKey = readFileSync(keyPath, "utf-8");
} else {
  console.error("❌ Apple private key not found. Set APPLE_PRIVATE_KEY or APPLE_PRIVATE_KEY_PATH");
  process.exit(1);
}

async function generate() {
  const key = await importPKCS8(privateKey, "ES256");

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId!)
    .setIssuedAt()
    .setExpirationTime("180d")
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId!)
    .sign(key);

  console.log("✓ Generated Apple client secret (valid for 180 days)");

  // Set in Convex
  try {
    execSync(`npx convex env set APPLE_CLIENT_SECRET "${jwt}"`, {
      stdio: "inherit",
    });
    console.log("✓ Set APPLE_CLIENT_SECRET in Convex");
  } catch {
    console.error("❌ Failed to set env var in Convex");
    process.exit(1);
  }
}

generate().catch((err) => {
  console.error("❌ Failed to generate Apple secret:", err.message);
  process.exit(1);
});
