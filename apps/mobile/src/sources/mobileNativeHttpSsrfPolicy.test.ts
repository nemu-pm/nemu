import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const moduleRoot = fileURLToPath(
  new URL("../../modules/nemu-aidoku/", import.meta.url),
);

function read(relativePath: string): string {
  return readFileSync(path.join(moduleRoot, relativePath), "utf8");
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
    expect(module).toContain(
      "NemuNativeHttpAddressPolicy.validatedURL(value)",
    );
    expect(module).toContain("didFinishCollecting metrics: URLSessionTaskMetrics");
    expect(module).toContain("remoteAddress: transaction.remoteAddress");
    expect(module).toContain("remotePort: transaction.remotePort");
    expect(module).toContain("afterPeerValidation(task: completedTask)");
    expect(module).toContain("completionHandler(nil, nil, Self.peerValidationError())");
    expect(
      module.match(/NemuNativeHttpLoopbackProxy\.shared\.harden\(configuration\)/g),
    ).toHaveLength(2);
    expect(module).toContain('"supportsCloudflareSolver": false');
    const solveStart = module.indexOf("private static func solveCloudflareAsync(");
    const solveEnd = module.indexOf("private static func downloadHttpFileAsync(");
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
    expect(proxy).toContain("proxy.applyCredential(username: username, password: password)");
    expect(proxy).toContain('"ProxyAutoConfigEnable": false');
    expect(proxy).toContain("nemuNativeProxyHeaderLimit = 64 * 1024");
    expect(proxy).not.toContain("allowFailover = true");
  });

  test(
    "runs the Swift native policy executables when testing on macOS",
    () => {
      if (process.platform !== "darwin") return;

      const directory = mkdtempSync(path.join(tmpdir(), "nemu-native-policy-"));
      const addressExecutable = path.join(directory, "address-policy-tests");
      const imageExecutable = path.join(directory, "image-policy-tests");
      try {
        const compileAddress = spawnSync(
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
          { encoding: "utf8" },
        );
        if (compileAddress.status !== 0) {
          throw new Error(
            compileAddress.stderr || compileAddress.stdout || "swiftc failed",
          );
        }
        const runAddress = spawnSync(addressExecutable, [], {
          encoding: "utf8",
        });
        if (runAddress.status !== 0) {
          throw new Error(
            runAddress.stderr ||
              runAddress.stdout ||
              "Swift policy test failed",
          );
        }

        const compileImage = spawnSync(
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
          { encoding: "utf8" },
        );
        if (compileImage.status !== 0) {
          throw new Error(
            compileImage.stderr || compileImage.stdout || "swiftc failed",
          );
        }
        const runImage = spawnSync(imageExecutable, [], { encoding: "utf8" });
        if (runImage.status !== 0) {
          throw new Error(
            runImage.stderr || runImage.stdout || "Swift policy test failed",
          );
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    180_000,
  );
});
