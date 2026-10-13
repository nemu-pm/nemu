import { makeMobileSourceExecutionKey } from "@/sources/mobileSourceProfileScope";
import type { AppLanguage } from "@/data/schema";
import { createSelfHostedBackend } from "./backends";
import { SelfHostedError, createNativeTransport, type SelfHostedTransport } from "./http";
import { SELF_HOSTED_REGISTRY_ID, type SelfHostedConfig, type SelfHostedCredentials } from "./policy";

export const CONNECTION_TEST_TIMEOUT_MS = 20_000;

export type ConnectionTestDeps = {
  /** Native local-network grant for a scope: exactly these urls, or none when empty. */
  setGrant: (scope: string, urls: string[]) => void;
  transportFor?: (scope: string) => SelfHostedTransport;
  language: AppLanguage;
  timeoutMs?: number;
  /** Unique per call; the grant must not outlive it. */
  scopeId?: string;
};

/**
 * Checks reachability and the login of a server the user is about to save. The
 * address is not stored yet, so it has no grant of its own: one is created for
 * a throwaway scope covering exactly this address, and revoked when the check
 * ends, whatever its outcome.
 */
export async function testSelfHostedConnection(
  input: { config: SelfHostedConfig; credentials: SelfHostedCredentials },
  deps: ConnectionTestDeps,
): Promise<{ version?: string }> {
  const scope = makeMobileSourceExecutionKey(
    `${SELF_HOSTED_REGISTRY_ID}:setup-${deps.scopeId ?? Math.random().toString(36).slice(2)}`,
  );
  deps.setGrant(scope, [input.config.server]);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? CONNECTION_TEST_TIMEOUT_MS);
  const backend = createSelfHostedBackend({
    config: input.config,
    credentials: input.credentials,
    transport: (deps.transportFor ?? createNativeTransport)(scope),
    language: deps.language,
  });
  try {
    return await Promise.race([
      backend.testConnection(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new SelfHostedError("unreachable", "The server did not answer in time.")),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    backend.dispose();
    deps.setGrant(scope, []);
  }
}
