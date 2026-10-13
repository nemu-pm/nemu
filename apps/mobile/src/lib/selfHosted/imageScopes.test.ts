import { afterEach, describe, expect, test } from "bun:test";
import { upgradeMobileImageUriScheme } from "@/lib/mobileImageCacheSource";
import {
  localNetworkEndpointOf,
  registerLocalNetworkImageUrl,
  registerSelfHostedImageUrl,
  resetLocalNetworkImageGrantsForTests,
  selfHostedImageCookieScope,
  setLocalNetworkImageGrant,
} from "./imageScopes";

const LRR = "local::anon::aidoku-community:multi.lanraragi";
const OTHER = "local::anon::aidoku-community:en.mangadex";
const PAGE = "http://192.168.2.109:3000/api/archives/abc/page?path=001.jpg";

afterEach(() => resetLocalNetworkImageGrantsForTests());

describe("localNetworkEndpointOf", () => {
  test("names the host:port native would compare", () => {
    expect(localNetworkEndpointOf(PAGE)).toBe("192.168.2.109:3000");
    expect(localNetworkEndpointOf("http://NAS.Local./a.jpg")).toBe("nas.local:80");
    expect(localNetworkEndpointOf("https://10.0.0.5/a.jpg")).toBe("10.0.0.5:443");
    expect(localNetworkEndpointOf("http://[fd00::1]:8080/a.jpg")).toBe("fd00::1:8080");
  });

  test("refuses non-http(s), credentials and garbage", () => {
    expect(localNetworkEndpointOf("file:///etc/hosts")).toBeNull();
    expect(localNetworkEndpointOf("http://user:pw@192.168.2.109:3000/a.jpg")).toBeNull();
    expect(localNetworkEndpointOf("not a url")).toBeNull();
  });
});

describe("registerLocalNetworkImageUrl", () => {
  test("a granted source's image on its granted endpoint gets that source's scope", () => {
    setLocalNetworkImageGrant(LRR, ["192.168.2.109:3000"]);
    expect(registerLocalNetworkImageUrl(PAGE, LRR)).toBe(true);
    expect(selfHostedImageCookieScope(PAGE)).toBe(LRR);
    // Registered home-server URLs stay plain http instead of being upgraded.
    expect(upgradeMobileImageUriScheme(PAGE)).toBe(PAGE);
  });

  test("covers and pages anywhere on the endpoint, but nowhere else", () => {
    setLocalNetworkImageGrant(LRR, ["192.168.2.109:3000"]);
    const cover = "http://192.168.2.109:3000/api/archives/abc/thumbnail";
    expect(registerLocalNetworkImageUrl(cover, LRR)).toBe(true);
    for (const url of [
      "http://192.168.2.109:3001/x.jpg", // another port on the same host
      "http://192.168.2.110:3000/x.jpg", // another host on the subnet
      "http://127.0.0.1:3000/x.jpg", // loopback
      "http://localhost:3000/x.jpg",
      "http://169.254.169.254/latest/meta-data", // cloud metadata
      "https://cdn.example.com/x.jpg", // the public internet
      "http://user:pw@192.168.2.109:3000/x.jpg",
    ]) {
      expect(registerLocalNetworkImageUrl(url, LRR)).toBe(false);
      expect(selfHostedImageCookieScope(url)).toBeUndefined();
    }
  });

  test("another source cannot use the grant, and a source without one gets nothing", () => {
    setLocalNetworkImageGrant(LRR, ["192.168.2.109:3000"]);
    expect(registerLocalNetworkImageUrl(PAGE, OTHER)).toBe(false);
    expect(selfHostedImageCookieScope(PAGE)).toBeUndefined();
    expect(upgradeMobileImageUriScheme(PAGE)).toBe(
      "https://192.168.2.109:3000/api/archives/abc/page?path=001.jpg",
    );
  });

  test("a revoked grant registers nothing new", () => {
    setLocalNetworkImageGrant(LRR, ["192.168.2.109:3000"]);
    setLocalNetworkImageGrant(LRR, []);
    expect(registerLocalNetworkImageUrl(PAGE, LRR)).toBe(false);
  });

  test("built-in server registration is unchanged", () => {
    registerSelfHostedImageUrl("http://10.0.0.5:25600/api/v1/books/1/pages/1", "local::anon::self-hosted:komga.home");
    expect(selfHostedImageCookieScope("http://10.0.0.5:25600/api/v1/books/1/pages/1")).toBe(
      "local::anon::self-hosted:komga.home",
    );
  });
});
