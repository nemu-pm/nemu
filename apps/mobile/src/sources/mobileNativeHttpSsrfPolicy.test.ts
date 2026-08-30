import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = fileURLToPath(
  new URL("../../modules/nemu-aidoku/", import.meta.url),
);

function read(relativePath: string): string {
  return readFileSync(path.join(moduleRoot, relativePath), "utf8");
}

function swiftEnvironment(moduleCache: string): NodeJS.ProcessEnv {
  const xcodeDeveloperDir = "/Applications/Xcode.app/Contents/Developer";
  return {
    ...process.env,
    CLANG_MODULE_CACHE_PATH: moduleCache,
    ...(existsSync(xcodeDeveloperDir)
      ? { DEVELOPER_DIR: xcodeDeveloperDir }
      : {}),
  };
}

function runCommand(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
) {
  const result = Bun.spawnSync([command, ...args], {
    ...options,
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    status: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

describe("native HTTP SSRF policy", () => {
  test("Android validates DNS and the connected peer on every direct hop", () => {
    const module = read(
      "android/src/main/java/pm/nemu/mobile/aidoku/NemuAidokuModule.kt",
    );
    const policy = read("runtime/kotlin/NemuNativeHttpAddressPolicy.kt");

    expect(module).toContain(".proxy(NEMU_NATIVE_HTTP_DIRECT_PROXY)");
    expect(module).toContain(".dns(NemuPublicAddressDns)");
    expect(module).toContain(
      ".addNetworkInterceptor(NemuPublicAddressNetworkInterceptor())",
    );
    expect(policy).toContain("Dns.SYSTEM.lookup(it)");
    expect(policy).toContain("addresses.any { !isPublicAddress(it.address) }");
    expect(policy).toContain("route()?.socketAddress?.address");
    expect(policy).toContain("first == 100 && second in 64..127");
    expect(policy).toContain("2000::/3");
  });

  test("iOS pins validated IPs behind an authenticated no-failover loopback proxy", () => {
    const module = read("ios/NemuAidokuModule.swift");
    const policy = read("ios/NemuNativeHttpAddressPolicy.swift");
    const proxy = read("ios/NemuNativeHttpLoopbackProxy.swift");

    expect(module).toContain(
      "try NemuNativeHttpAddressPolicy.validate(url: redirectURL)",
    );
    expect(module).toContain("NemuNativeHttpAddressPolicy.validatedURL(value)");
    expect(module).toContain(
      "didFinishCollecting metrics: URLSessionTaskMetrics",
    );
    expect(module).toContain("remoteAddress: transaction.remoteAddress");
    expect(module).toContain("remotePort: transaction.remotePort");
    expect(module).toContain("afterPeerValidation(task: completedTask)");
    expect(module).toContain(
      "completionHandler(nil, nil, Self.peerValidationError())",
    );
    expect(
      module.match(
        /NemuNativeHttpLoopbackProxy\.shared\.harden\(configuration\)/g,
      ),
    ).toHaveLength(2);
    expect(module).toContain('"supportsCloudflareSolver": false');
    const solveStart = module.indexOf(
      "private static func solveCloudflareAsync(",
    );
    const solveEnd = module.indexOf(
      "private static func downloadHttpFileAsync(",
    );
    const solve = module.slice(solveStart, solveEnd);
    expect(solve).toContain("Secure Cloudflare verification is unavailable");
    expect(solve).toContain("promise.resolve(false)");
    expect(solve).not.toContain("WKWebView");
    expect(solve).not.toContain(".solveAsync(");
    expect(policy).toContain("addresses.allSatisfy(isPublicAddress)");
    expect(policy).toContain("validateLoopbackProxy(");
    expect(policy).toContain("isProxyConnection: Bool");
    expect(policy).toContain("getaddrinfo(pointer, nil, &hints, &head)");
    expect(policy).toContain("2000::/3");

    expect(proxy).toContain("parameters.requiredLocalEndpoint = .hostPort(");
    expect(proxy).toContain("host: .ipv4(.loopback)");
    expect(proxy).toContain("Proxy-Authorization");
    expect(proxy).toContain("Proxy-Authenticate: Basic");
    expect(proxy).toContain("NemuNativeHttpAddressPolicy.validatedAddresses");
    expect(proxy).toContain("IPv4Address(data)");
    expect(proxy).toContain("IPv6Address(data)");
    expect(proxy).toContain("proxy.allowFailover = false");
    expect(proxy).toContain(
      "proxy.applyCredential(username: username, password: password)",
    );
    expect(proxy).toContain('"ProxyAutoConfigEnable": false');
    expect(proxy).toContain("nemuNativeProxyHeaderLimit = 64 * 1024");
    expect(proxy).not.toContain("allowFailover = true");
  });

  test("credential-bearing requests opt into HTTPS-only redirect handling", () => {
    const android = read(
      "android/src/main/java/pm/nemu/mobile/aidoku/NemuAidokuModule.kt",
    );
    const androidPolicy = read(
      "runtime/kotlin/NemuNativeHttpRedirectPolicy.kt",
    );
    const ios = read("ios/NemuAidokuModule.swift");
    const iosPolicy = read("ios/NemuNativeHttpRedirectPolicy.swift");
    const types = read("src/NemuAidoku.types.ts");
    const oauth = read("../../src/lib/mobileSourceOAuth.native.ts");
    const sourcePackageCache = read(
      "../../src/sources/sourcePackageCache.native.ts",
    );
    const registry = read("../../src/sources/aidokuRegistry.ts");

    expect(types).toContain("requireHttps?: boolean | null");
    expect(oauth).toContain("requireHttps: true");
    expect(sourcePackageCache).toContain("requireHttps: true");
    expect(registry).toContain("requireHttps: true");
    expect(android).toContain("var requireHttps: Boolean = false");
    expect(android).toContain(
      ".addNetworkInterceptor(NemuHttpsOnlyRedirectInterceptor())",
    );
    expect(android).toContain("NemuHttpsOnlyRequestPolicy::class.java");
    expect(androidPolicy).toContain(
      "!NemuHttpsOnlyRequestPolicy.allows(request.url)",
    );
    expect(ios).toContain("NemuNativeHttpRedirectPolicy.allows(");
    expect(ios).toContain("requireHttps: policy?.requireHttps == true");
    expect(ios).toContain("var requireHttps: Bool = false");
    expect(ios).toContain("requireHttps: request.requireHttps");
    expect(iosPolicy).toContain('url?.scheme?.lowercased() == "https"');
  });

  test("runs the Swift native policy executables when testing on macOS", () => {
    if (process.platform !== "darwin") return;

    const directory = mkdtempSync(path.join(tmpdir(), "nemu-native-policy-"));
    const moduleCache = path.join(directory, "clang-module-cache");
    const addressExecutable = path.join(directory, "address-policy-tests");
    const imageExecutable = path.join(directory, "image-policy-tests");
    const redirectExecutable = path.join(directory, "redirect-policy-tests");
    const requestHeaderExecutable = path.join(
      directory,
      "request-header-policy-tests",
    );
    try {
      const compileAddress = runCommand(
        "xcrun",
        [
          "swiftc",
          path.join(moduleRoot, "ios/NemuNativeHttpAddressPolicy.swift"),
          path.join(moduleRoot, "ios/NemuNativeHttpLoopbackProxy.swift"),
          path.join(
            moduleRoot,
            "runtime/iosTest/NemuNativeHttpAddressPolicyTests.swift",
          ),
          "-framework",
          "Network",
          "-o",
          addressExecutable,
        ],
        { env: swiftEnvironment(moduleCache) },
      );
      if (compileAddress.status !== 0) {
        throw new Error(
          compileAddress.stderr || compileAddress.stdout || "swiftc failed",
        );
      }
      const runAddress = runCommand(addressExecutable, []);
      if (runAddress.status !== 0) {
        throw new Error(
          runAddress.stderr || runAddress.stdout || "Swift policy test failed",
        );
      }

      const compileImage = runCommand(
        "xcrun",
        [
          "swiftc",
          path.join(moduleRoot, "ios/NemuImageMetadataPolicy.swift"),
          path.join(
            moduleRoot,
            "runtime/iosTest/NemuImageMetadataPolicyTests.swift",
          ),
          "-framework",
          "ImageIO",
          "-o",
          imageExecutable,
        ],
        { env: swiftEnvironment(moduleCache) },
      );
      if (compileImage.status !== 0) {
        throw new Error(
          compileImage.stderr || compileImage.stdout || "swiftc failed",
        );
      }
      const runImage = runCommand(imageExecutable, []);
      if (runImage.status !== 0) {
        throw new Error(
          runImage.stderr || runImage.stdout || "Swift policy test failed",
        );
      }

      const compileRedirect = runCommand(
        "xcrun",
        [
          "swiftc",
          path.join(moduleRoot, "ios/NemuNativeHttpRedirectPolicy.swift"),
          path.join(
            moduleRoot,
            "runtime/iosTest/NemuNativeHttpRedirectPolicyTests.swift",
          ),
          "-o",
          redirectExecutable,
        ],
        { env: swiftEnvironment(moduleCache) },
      );
      if (compileRedirect.status !== 0) {
        throw new Error(
          compileRedirect.stderr || compileRedirect.stdout || "swiftc failed",
        );
      }
      const runRedirect = runCommand(redirectExecutable, []);
      if (runRedirect.status !== 0) {
        throw new Error(
          runRedirect.stderr ||
            runRedirect.stdout ||
            "Swift policy test failed",
        );
      }

      const compileRequestHeader = runCommand(
        "xcrun",
        [
          "swiftc",
          path.join(moduleRoot, "ios/NemuNativeHttpRequestHeaderPolicy.swift"),
          path.join(
            moduleRoot,
            "runtime/iosTest/NemuNativeHttpRequestHeaderPolicyTests.swift",
          ),
          "-o",
          requestHeaderExecutable,
        ],
        { env: swiftEnvironment(moduleCache) },
      );
      if (compileRequestHeader.status !== 0) {
        throw new Error(
          compileRequestHeader.stderr ||
            compileRequestHeader.stdout ||
            "swiftc failed",
        );
      }
      const runRequestHeader = runCommand(requestHeaderExecutable, []);
      if (runRequestHeader.status !== 0) {
        throw new Error(
          runRequestHeader.stderr ||
            runRequestHeader.stdout ||
            "Swift policy test failed",
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 180_000);
});
