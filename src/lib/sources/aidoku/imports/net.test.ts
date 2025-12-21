import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GlobalStore, type WasmRequest } from "../global-store";
import { createNetImports } from "./net";

describe("net imports", () => {
  let store: GlobalStore;
  let net: ReturnType<typeof createNetImports>;
  let nextId = 1;

  beforeEach(() => {
    store = new GlobalStore("test-source");
    const memory = new WebAssembly.Memory({ initial: 1 });
    store.setMemory(memory);
    net = createNetImports(store);
    nextId = 1;
  });

  afterEach(() => {
    store.destroy();
  });

  function writeString(str: string, offset = 0): [number, number] {
    const bytes = new TextEncoder().encode(str);
    store.writeBytes(bytes, offset);
    return [offset, bytes.length];
  }

  function createMockRequest(partial: Partial<WasmRequest> & { method: string; url: string; headers: Record<string, string>; response?: WasmRequest["response"] }): WasmRequest {
    return {
      id: nextId++,
      createdAt: Date.now(),
      ...partial,
    };
  }

  describe("init", () => {
    it("should create a new request with GET method", () => {
      const rid = net.init(0); // 0 = GET
      expect(rid).toBeGreaterThanOrEqual(0);
    });

    it("should create a new request with POST method", () => {
      const rid = net.init(1); // 1 = POST
      expect(rid).toBeGreaterThanOrEqual(0);
    });
  });

  describe("set_url", () => {
    it("should set a valid URL", () => {
      const rid = net.init(0);
      const [ptr, len] = writeString("https://example.com/path");
      const result = net.set_url(rid, ptr, len);
      expect(result).toBe(0);
    });

    it("should reject invalid URL", () => {
      const rid = net.init(0);
      const [ptr, len] = writeString("not a valid url");
      const result = net.set_url(rid, ptr, len);
      expect(result).toBe(-4); // InvalidUrl
    });
  });

  describe("set_header", () => {
    it("should set a request header", () => {
      const rid = net.init(0);
      const [keyPtr, keyLen] = writeString("Accept", 0);
      const [valPtr, valLen] = writeString("application/json", 100);
      const result = net.set_header(rid, keyPtr, keyLen, valPtr, valLen);
      expect(result).toBe(0);
    });
  });

  describe("UTF-8 decoding", () => {
    // Regression test: UTF-8 multi-byte characters must be correctly preserved
    // This was broken when using XHR with x-user-defined charset
    it("should correctly decode UTF-8 Chinese characters in HTML", () => {
      const rid = net.init(0);
      
      // Simulate response data with Chinese characters (UTF-8 encoded)
      // 狀態 in UTF-8 is: E7 8B 80 E6 85 8B
      const htmlWithChinese = `
        <html>
          <li>
            <span>狀態：</span>
            <span class="status">連載中</span>
          </li>
        </html>
      `;
      const utf8Bytes = new TextEncoder().encode(htmlWithChinese);
      
      // Store the response data directly (simulating what XHR responseType='arraybuffer' gives us)
      store.requests.set(rid, createMockRequest({
        method: "GET",
        url: "https://example.com",
        headers: {},
        response: {
          data: utf8Bytes,
          statusCode: 200,
          headers: {},
          bytesRead: 0,
        },
      }));

      // Call net.html to parse the response
      const htmlDescriptor = net.html(rid);
      expect(htmlDescriptor).toBeGreaterThan(0);

      // Verify the HTML was parsed correctly by checking we can select Chinese text
      const node = store.readStdValue(htmlDescriptor) as { text(): string };
      expect(node).toBeDefined();
      
      // The text should contain the Chinese characters
      const text = node.text();
      expect(text).toContain("狀態");
      expect(text).toContain("連載中");
    });

    it("should correctly decode UTF-8 Japanese characters", () => {
      const rid = net.init(0);
      
      const htmlWithJapanese = `
        <html>
          <h1>タイトル</h1>
          <p>作者：みかんばこ</p>
        </html>
      `;
      const utf8Bytes = new TextEncoder().encode(htmlWithJapanese);
      
      store.requests.set(rid, createMockRequest({
        method: "GET",
        url: "https://example.com",
        headers: {},
        response: {
          data: utf8Bytes,
          statusCode: 200,
          headers: {},
          bytesRead: 0,
        },
      }));

      const htmlDescriptor = net.html(rid);
      expect(htmlDescriptor).toBeGreaterThan(0);

      const node = store.readStdValue(htmlDescriptor) as { text(): string };
      const text = node.text();
      expect(text).toContain("タイトル");
      expect(text).toContain("みかんばこ");
    });

    it("should correctly decode mixed ASCII and UTF-8 content", () => {
      const rid = net.init(0);
      
      const mixedContent = `
        <html>
          <title>Manga Reader - 漫畫閱讀器</title>
          <meta charset="utf-8">
          <body>
            <h1>Welcome 歡迎</h1>
            <p>Status: 狀態</p>
          </body>
        </html>
      `;
      const utf8Bytes = new TextEncoder().encode(mixedContent);
      
      store.requests.set(rid, createMockRequest({
        method: "GET",
        url: "https://example.com",
        headers: {},
        response: {
          data: utf8Bytes,
          statusCode: 200,
          headers: {},
          bytesRead: 0,
        },
      }));

      const htmlDescriptor = net.html(rid);
      expect(htmlDescriptor).toBeGreaterThan(0);

      const node = store.readStdValue(htmlDescriptor) as { text(): string };
      const text = node.text();
      expect(text).toContain("Welcome");
      expect(text).toContain("歡迎");
      expect(text).toContain("Status");
      expect(text).toContain("狀態");
    });

    // Test the raw byte handling
    it("should preserve all bytes in UTF-8 sequence", () => {
      void net.init(0);
      
      // 狀 in UTF-8: E7 8B 80
      // 態 in UTF-8: E6 85 8B (wait, let me verify)
      // Actually: 狀 = U+72C0 → UTF-8: E7 8B 80
      //          態 = U+614B → UTF-8: E6 85 8B
      const text = "狀態";
      const utf8Bytes = new TextEncoder().encode(text);
      
      // Verify the expected UTF-8 byte sequence
      expect(utf8Bytes).toEqual(new Uint8Array([0xE7, 0x8B, 0x80, 0xE6, 0x85, 0x8B]));
      
      // When decoded, should give us back the original text
      const decoded = new TextDecoder().decode(utf8Bytes);
      expect(decoded).toBe(text);
    });
  });

  describe("json", () => {
    it("should parse JSON response", () => {
      const rid = net.init(0);
      
      const jsonData = JSON.stringify({ title: "Test", count: 42 });
      const utf8Bytes = new TextEncoder().encode(jsonData);
      
      store.requests.set(rid, createMockRequest({
        method: "GET",
        url: "https://example.com/api",
        headers: {},
        response: {
          data: utf8Bytes,
          statusCode: 200,
          headers: {},
          bytesRead: 0,
        },
      }));

      const jsonDescriptor = net.json(rid);
      expect(jsonDescriptor).toBeGreaterThan(0);

      const parsed = store.readStdValue(jsonDescriptor);
      expect(parsed).toEqual({ title: "Test", count: 42 });
    });

    it("should handle JSON with Unicode", () => {
      const rid = net.init(0);
      
      const jsonData = JSON.stringify({ 
        title: "搖曳怪談！",
        author: "みかんばこ",
        status: "連載中"
      });
      const utf8Bytes = new TextEncoder().encode(jsonData);
      
      store.requests.set(rid, createMockRequest({
        method: "GET",
        url: "https://example.com/api",
        headers: {},
        response: {
          data: utf8Bytes,
          statusCode: 200,
          headers: {},
          bytesRead: 0,
        },
      }));

      const jsonDescriptor = net.json(rid);
      expect(jsonDescriptor).toBeGreaterThan(0);

      const parsed = store.readStdValue(jsonDescriptor) as { title: string; author: string; status: string };
      expect(parsed.title).toBe("搖曳怪談！");
      expect(parsed.author).toBe("みかんばこ");
      expect(parsed.status).toBe("連載中");
    });
  });

  describe("get_status_code", () => {
    it("should return response status code", () => {
      const rid = net.init(0);
      
      store.requests.set(rid, createMockRequest({
        method: "GET",
        url: "https://example.com",
        headers: {},
        response: {
          data: new Uint8Array(0),
          statusCode: 404,
          headers: {},
          bytesRead: 0,
        },
      }));

      expect(net.get_status_code(rid)).toBe(404);
    });
  });

  describe("data operations", () => {
    it("should return correct data length", () => {
      const rid = net.init(0);
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      
      store.requests.set(rid, createMockRequest({
        method: "GET",
        url: "https://example.com",
        headers: {},
        response: {
          data,
          statusCode: 200,
          headers: {},
          bytesRead: 0,
        },
      }));

      expect(net.data_len(rid)).toBe(5);
    });

    it("should read response data into memory", () => {
      const rid = net.init(0);
      const data = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
      
      store.requests.set(rid, createMockRequest({
        method: "GET",
        url: "https://example.com",
        headers: {},
        response: {
          data,
          statusCode: 200,
          headers: {},
          bytesRead: 0,
        },
      }));

      const result = net.read_data(rid, 100, 4);
      expect(result).toBe(0);

      const readBack = store.readBytes(100, 4);
      expect(readBack).toEqual(data);
    });
  });
});

