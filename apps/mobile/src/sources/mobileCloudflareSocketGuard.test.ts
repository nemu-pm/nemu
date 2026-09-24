import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Behaviour test for the socket guard the Android Cloudflare solver injects at
 * document start (`runtime/kotlin/NemuCloudflareSocketGuard.kt`). The JVM unit
 * tests cover how Kotlin builds the script; there is no JS engine there, so the
 * script's actual behaviour is exercised here, against a fake realm, using the
 * exact text Kotlin embeds and the same `(guard)(self, [hosts], exempt);`
 * assembly.
 */

const guardSource = (() => {
  const source = readFileSync(
    path.join(
      fileURLToPath(new URL("../../modules/nemu-aidoku/", import.meta.url)),
      "runtime/kotlin/NemuCloudflareSocketGuard.kt",
    ),
    "utf8",
  );
  const match = source.match(
    /NEMU_CLOUDFLARE_SOCKET_GUARD_FUNCTION = """\n([\s\S]*?)\n"""\.trimIndent\(\)/,
  );
  if (!match) throw new Error("socket guard literal not found");
  return match[1];
})();

const HOSTS = ["reader.example.com", "challenges.cloudflare.com"];
/** `NemuCloudflareSocketGuard.exemptOrigin` for a non-platform challenge host. */
const EXEMPT_ORIGIN = "https://challenges.cloudflare.com";

type Opened = { kind: string; url: string; rest: unknown[] };

type FakeRealm = Record<string, unknown> & {
  opened: Opened[];
  document: { baseURI: string };
};

function makeRealm(
  baseURI = "https://reader.example.com/cdn-cgi/challenge-platform/page",
  origin: string = new URL(baseURI).origin,
): FakeRealm {
  const opened: Opened[] = [];
  function connection(kind: string) {
    return class {
      static CONNECTING = 0;
      static OPEN = 1;
      url: string;
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          throw new TypeError(`Failed to construct '${kind}': 1 argument required`);
        }
        this.url = String(args[0]);
        opened.push({ kind, url: this.url, rest: args.slice(1) });
      }
    };
  }
  const peer = connection("RTCPeerConnection");
  class FakeIFrame {
    child: unknown;
    constructor(child: unknown) {
      this.child = child;
    }
  }
  Object.defineProperty(FakeIFrame.prototype, "contentWindow", {
    get(this: FakeIFrame) {
      return this.child;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(FakeIFrame.prototype, "contentDocument", {
    get(this: FakeIFrame) {
      return (this.child as FakeRealm | null)?.document ?? null;
    },
    enumerable: true,
    configurable: true,
  });
  const realm: FakeRealm = {
    opened,
    document: { baseURI },
    location: { origin, href: baseURI },
    DOMException,
    WebSocket: connection("WebSocket"),
    WebSocketStream: connection("WebSocketStream"),
    WebTransport: connection("WebTransport"),
    RTCPeerConnection: peer,
    webkitRTCPeerConnection: peer,
    HTMLIFrameElement: FakeIFrame,
  };
  // Interface objects are writable, configurable own properties natively.
  for (const key of Object.keys(realm)) {
    Object.defineProperty(realm, key, { enumerable: false });
  }
  return realm;
}

function install(
  realm: FakeRealm,
  hosts: string[] = HOSTS,
  exemptOrigin: string | null = EXEMPT_ORIGIN,
) {
  // Mirrors `NemuCloudflareSocketGuard.script`.
  const script = `(${guardSource})(self, ${JSON.stringify(hosts)}, ${JSON.stringify(exemptOrigin)});`;
  new Function("self", script)(realm);
  return realm;
}

type Ctor = new (...args: unknown[]) => { url: string };

function ctor(realm: FakeRealm, name: string): Ctor {
  return realm[name] as Ctor;
}

function refusal(run: () => unknown): DOMException {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(DOMException);
    return error as DOMException;
  }
  throw new Error("expected the guard to refuse");
}

describe("Android Cloudflare solver socket guard", () => {
  const restore: (() => void)[] = [];
  afterEach(() => {
    while (restore.length > 0) restore.pop()?.();
  });

  test("connects wss: only to the exact allow-listed hosts", () => {
    const realm = install(makeRealm());
    const WebSocket = ctor(realm, "WebSocket");

    expect(new WebSocket("wss://reader.example.com/ws", ["v1"]).url).toBe(
      "wss://reader.example.com/ws",
    );
    new WebSocket("wss://challenges.cloudflare.com/x");
    // The platform maps https: to wss: and resolves relative urls against the
    // document base; the guard does the same before checking.
    new WebSocket("https://reader.example.com/upgrade");
    new WebSocket("/relative");
    new WebSocket("wss://Reader.Example.com./dot");
    expect(realm.opened.map((entry) => entry.url)).toEqual([
      "wss://reader.example.com/ws",
      "wss://challenges.cloudflare.com/x",
      "wss://reader.example.com/upgrade",
      "wss://reader.example.com/relative",
      "wss://reader.example.com./dot",
    ]);
    expect(realm.opened[0].rest).toEqual([["v1"]]);

    for (const url of [
      "ws://reader.example.com/ws",
      "http://reader.example.com/ws",
      "wss://static.reader.example.com/ws",
      "wss://assets.challenges.cloudflare.com/ws",
      "wss://evil-reader.example.com/ws",
      "wss://192.168.0.1/ws",
      "wss://[::1]/ws",
      "wss://localhost/ws",
      "wss://user:secret@reader.example.com/ws",
      "wss://user@reader.example.com/ws",
      "ftp://reader.example.com/",
    ]) {
      expect(refusal(() => new WebSocket(url)).name).toBe("SecurityError");
    }
    expect(refusal(() => new WebSocket("wss://")).name).toBe("SyntaxError");
    expect(realm.opened).toHaveLength(5);
  });

  test("hands the native constructor exactly the url it checked", () => {
    const realm = install(makeRealm());
    const WebSocket = ctor(realm, "WebSocket");
    let reads = 0;
    const shifty = {
      toString() {
        reads += 1;
        return reads === 1 ? "wss://reader.example.com/ok" : "wss://evil.example.net/";
      },
    };
    new WebSocket(shifty);
    expect(reads).toBe(1);
    expect(realm.opened.map((entry) => entry.url)).toEqual([
      "wss://reader.example.com/ok",
    ]);

    // A document base the page rewrote only changes what a relative url means;
    // the resolved result is still checked.
    realm.document.baseURI = "https://evil.example.net/";
    expect(refusal(() => new WebSocket("/relative")).name).toBe("SecurityError");
  });

  test("guards WebSocketStream and WebTransport, and never builds a peer connection", () => {
    const realm = install(makeRealm());
    new (ctor(realm, "WebSocketStream"))("wss://reader.example.com/s");
    new (ctor(realm, "WebTransport"))("https://challenges.cloudflare.com/t");
    expect(
      refusal(() => new (ctor(realm, "WebSocketStream"))("wss://evil.example.net/"))
        .name,
    ).toBe("SecurityError");
    expect(
      refusal(() => new (ctor(realm, "WebTransport"))("wss://reader.example.com/t"))
        .name,
    ).toBe("SecurityError");
    expect(
      refusal(() => new (ctor(realm, "WebTransport"))("https://evil.example.net/"))
        .name,
    ).toBe("SecurityError");

    expect(refusal(() => new (ctor(realm, "RTCPeerConnection"))()).name).toBe(
      "NotAllowedError",
    );
    expect(
      refusal(
        () => new (ctor(realm, "RTCPeerConnection"))({ iceServers: [] }),
      ).name,
    ).toBe("NotAllowedError");
    // The legacy alias stays the same object, as it is natively.
    expect(realm.webkitRTCPeerConnection).toBe(realm.RTCPeerConnection);
    expect(realm.opened.map((entry) => entry.kind)).toEqual([
      "WebSocketStream",
      "WebTransport",
    ]);
  });

  test("cannot be replaced, and never leaks the native constructor", () => {
    const realm = makeRealm();
    const native = realm.WebSocket as Ctor & { OPEN: number };
    install(realm);
    const WebSocket = realm.WebSocket as Ctor & { OPEN: number };

    const descriptor = Object.getOwnPropertyDescriptor(realm, "WebSocket");
    expect(descriptor?.writable).toBe(false);
    expect(descriptor?.configurable).toBe(false);
    // Test modules are strict, so a failed write or delete throws.
    expect(() => {
      realm.WebSocket = native;
    }).toThrow(TypeError);
    expect(() => Object.defineProperty(realm, "WebSocket", { value: native })).toThrow(
      TypeError,
    );
    expect(() => delete realm.WebSocket).toThrow(TypeError);
    expect(realm.WebSocket).toBe(WebSocket);

    expect(WebSocket).not.toBe(native);
    expect(WebSocket.prototype).toBe(native.prototype);
    expect(WebSocket.prototype.constructor).toBe(WebSocket);
    expect(WebSocket.OPEN).toBe(1);
    const socket = new WebSocket("wss://reader.example.com/");
    expect(socket).toBeInstanceOf(WebSocket);
    expect(socket.constructor).toBe(WebSocket);
    expect(Object.getPrototypeOf(socket).constructor).toBe(WebSocket);

    // Subclassing goes through the same check.
    class Sub extends WebSocket {}
    expect(new Sub("wss://reader.example.com/sub")).toBeInstanceOf(Sub);
    expect(refusal(() => new Sub("wss://evil.example.net/")).name).toBe(
      "SecurityError",
    );

    // No argument: the native constructor's own error, nothing opened.
    const before = realm.opened.length;
    expect(() => new WebSocket()).toThrow(TypeError);
    expect(realm.opened).toHaveLength(before);
  });

  test("ignores later tampering with the primordials it captured", () => {
    const realm = install(makeRealm());
    const WebSocket = ctor(realm, "WebSocket");

    const construct = Reflect.construct;
    Reflect.construct = (() => ({})) as typeof Reflect.construct;
    restore.push(() => {
      Reflect.construct = construct;
    });
    const hostname = Object.getOwnPropertyDescriptor(URL.prototype, "hostname")!;
    Object.defineProperty(URL.prototype, "hostname", {
      ...hostname,
      get: () => "reader.example.com",
    });
    restore.push(() => Object.defineProperty(URL.prototype, "hostname", hostname));
    let leaked: unknown;
    const proto = Object.prototype as Record<string, unknown>;
    proto.getPrototypeOf = (target: unknown) => {
      leaked = target;
      return null;
    };
    proto.construct = () => ({ url: "hijacked" });
    restore.push(() => {
      delete proto.getPrototypeOf;
      delete proto.construct;
    });

    expect(refusal(() => new WebSocket("wss://evil.example.net/")).name).toBe(
      "SecurityError",
    );
    Object.getPrototypeOf(WebSocket);
    expect(leaked).toBeUndefined();
    expect(new WebSocket("wss://reader.example.com/").url).toBe(
      "wss://reader.example.com/",
    );
  });

  test("guards a same-origin child realm on first access, once", () => {
    const realm = install(makeRealm());
    const child = makeRealm();
    const nativeChildSocket = child.WebSocket;
    const Frame = realm.HTMLIFrameElement as new (child: unknown) => {
      contentWindow: FakeRealm;
      contentDocument: unknown;
    };

    // contentDocument is the other way into the same realm.
    expect(new Frame(child).contentDocument).toBe(child.document);
    expect(child.WebSocket).not.toBe(nativeChildSocket);
    const guarded = child.WebSocket;
    expect(
      refusal(() => new (ctor(child, "WebSocket"))("wss://evil.example.net/")).name,
    ).toBe("SecurityError");

    // A second access, or the child's own document-start run, is a no-op.
    expect(new Frame(child).contentWindow.WebSocket).toBe(guarded);
    install(child);
    expect(child.WebSocket).toBe(guarded);

    // Nested frames inside the child are covered by the child's own hook.
    const grandchild = makeRealm();
    const ChildFrame = child.HTMLIFrameElement as new (child: unknown) => {
      contentWindow: FakeRealm;
    };
    expect(
      refusal(
        () =>
          new (ctor(new ChildFrame(grandchild).contentWindow, "WebSocket"))(
            "wss://evil.example.net/",
          ),
      ).name,
    ).toBe("SecurityError");

    // A frame that throws on access (cross-origin) or has no window is fine.
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new DOMException("Blocked a frame", "SecurityError");
        },
        getOwnPropertyDescriptor() {
          throw new DOMException("Blocked a frame", "SecurityError");
        },
      },
    );
    expect(() => new Frame(hostile).contentWindow).not.toThrow();
    expect(new Frame(null).contentWindow).toBeNull();
  });

  test("stands down in Cloudflare's own Turnstile frame without touching it", () => {
    // Turnstile fingerprints its realm: nothing there may be wrapped, sealed,
    // repointed or hooked.
    const turnstile = makeRealm(
      "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv/abc",
    );
    const Frame = turnstile.HTMLIFrameElement as { prototype: object };
    const before = {
      WebSocket: Object.getOwnPropertyDescriptor(turnstile, "WebSocket"),
      WebSocketStream: Object.getOwnPropertyDescriptor(turnstile, "WebSocketStream"),
      WebTransport: Object.getOwnPropertyDescriptor(turnstile, "WebTransport"),
      RTCPeerConnection: Object.getOwnPropertyDescriptor(turnstile, "RTCPeerConnection"),
      contentWindow: Object.getOwnPropertyDescriptor(Frame.prototype, "contentWindow"),
      constructor: (turnstile.WebSocket as { prototype: { constructor: unknown } }).prototype
        .constructor,
    };
    install(turnstile);
    expect(Object.getOwnPropertyDescriptor(turnstile, "WebSocket")).toEqual(before.WebSocket);
    expect(Object.getOwnPropertyDescriptor(turnstile, "WebSocketStream")).toEqual(
      before.WebSocketStream,
    );
    expect(Object.getOwnPropertyDescriptor(turnstile, "WebTransport")).toEqual(
      before.WebTransport,
    );
    expect(Object.getOwnPropertyDescriptor(turnstile, "RTCPeerConnection")).toEqual(
      before.RTCPeerConnection,
    );
    expect(Object.getOwnPropertyDescriptor(Frame.prototype, "contentWindow")).toEqual(
      before.contentWindow,
    );
    expect(
      (turnstile.WebSocket as { prototype: { constructor: unknown } }).prototype.constructor,
    ).toBe(before.constructor);
    new (ctor(turnstile, "RTCPeerConnection"))({ iceServers: [] });
    expect(turnstile.opened.map((entry) => entry.kind)).toEqual(["RTCPeerConnection"]);
  });

  test("guards every other origin, opaque ones included", () => {
    // The challenge host's own document, a subdomain of the platform host, a
    // look-alike, and an opaque-origin (data:/sandboxed srcdoc) frame.
    for (const [baseURI, origin] of [
      ["https://reader.example.com/", "https://reader.example.com"],
      ["https://assets.challenges.cloudflare.com/", "https://assets.challenges.cloudflare.com"],
      ["https://challenges.cloudflare.com.evil.test/", "https://challenges.cloudflare.com.evil.test"],
      ["http://challenges.cloudflare.com/", "http://challenges.cloudflare.com"],
      ["https://reader.example.com/", "null"],
    ] as const) {
      const realm = install(makeRealm(baseURI, origin));
      expect(
        refusal(() => new (ctor(realm, "RTCPeerConnection"))()).name,
      ).toBe("NotAllowedError");
    }

    // A realm whose location cannot be read is guarded, not exempted.
    const unreadable = makeRealm();
    Object.defineProperty(unreadable, "location", {
      get() {
        throw new DOMException("Blocked a frame", "SecurityError");
      },
    });
    install(unreadable);
    expect(refusal(() => new (ctor(unreadable, "RTCPeerConnection"))()).name).toBe(
      "NotAllowedError",
    );

    // With no exempt origin (the challenge host *is* the platform host) even
    // the platform origin is guarded.
    const platformChallenge = install(
      makeRealm("https://challenges.cloudflare.com/"),
      ["challenges.cloudflare.com"],
      null,
    );
    expect(
      refusal(() => new (ctor(platformChallenge, "RTCPeerConnection"))()).name,
    ).toBe("NotAllowedError");

    // A child realm adopted through a guarded frame is guarded even if it
    // claims the exempt origin: the exemption only applies where the script
    // was injected.
    const realm = install(makeRealm());
    const claimant = makeRealm("https://challenges.cloudflare.com/");
    const Frame = realm.HTMLIFrameElement as new (child: unknown) => {
      contentWindow: FakeRealm;
    };
    expect(
      refusal(() => new (ctor(new Frame(claimant).contentWindow, "RTCPeerConnection"))())
        .name,
    ).toBe("NotAllowedError");
  });

  test("an empty allow-list refuses every socket", () => {
    const realm = install(makeRealm(), []);
    expect(
      refusal(() => new (ctor(realm, "WebSocket"))("wss://reader.example.com/"))
        .name,
    ).toBe("SecurityError");
  });
});
