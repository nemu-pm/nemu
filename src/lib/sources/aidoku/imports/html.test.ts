import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GlobalStore } from "../global-store";
import { createHtmlImports } from "./html";

describe("html imports", () => {
  let store: GlobalStore;
  let html: ReturnType<typeof createHtmlImports>;

  beforeEach(() => {
    store = new GlobalStore("test-source");
    const memory = new WebAssembly.Memory({ initial: 1 });
    store.setMemory(memory);
    html = createHtmlImports(store);
  });

  afterEach(() => {
    store.destroy();
  });

  function writeString(str: string): [number, number] {
    const bytes = new TextEncoder().encode(str);
    store.writeBytes(bytes, 0);
    return [0, bytes.length];
  }

  describe("parse", () => {
    it("should parse HTML and return descriptor", () => {
      const htmlContent = "<html><body><h1>Hello</h1></body></html>";
      const [ptr, len] = writeString(htmlContent);

      const descriptor = html.parse(ptr, len, 0, 0);
      expect(descriptor).toBeGreaterThan(0);
    });

    it("should return -1 for empty content", () => {
      const descriptor = html.parse(0, 0, 0, 0);
      expect(descriptor).toBe(-1);
    });

    it("should handle base URL", () => {
      const htmlContent = '<a href="/path">Link</a>';
      const [contentPtr, contentLen] = writeString(htmlContent);

      const baseUrl = "https://example.com";
      const baseUrlBytes = new TextEncoder().encode(baseUrl);
      store.writeBytes(baseUrlBytes, 1000);

      const descriptor = html.parse(contentPtr, contentLen, 1000, baseUrlBytes.length);
      expect(descriptor).toBeGreaterThan(0);
    });
  });

  describe("parse_fragment", () => {
    it("should parse HTML fragment", () => {
      const fragment = "<span>Text</span>";
      const [ptr, len] = writeString(fragment);

      const descriptor = html.parse_fragment(ptr, len, 0, 0);
      expect(descriptor).toBeGreaterThan(0);
    });
  });

  describe("escape", () => {
    it("should escape HTML entities", () => {
      const text = '<script>alert("xss")</script>';
      const [ptr, len] = writeString(text);

      const descriptor = html.escape(ptr, len);
      expect(descriptor).toBeGreaterThan(0);

      const escaped = store.readStdValue(descriptor);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it("should escape ampersands", () => {
      const text = "A & B";
      const [ptr, len] = writeString(text);

      const descriptor = html.escape(ptr, len);
      const escaped = store.readStdValue(descriptor);
      expect(escaped).toBe("A &amp; B");
    });
  });

  describe("unescape", () => {
    it("should unescape HTML entities", () => {
      const text = "&lt;p&gt;Hello&lt;/p&gt;";
      const [ptr, len] = writeString(text);

      const descriptor = html.unescape(ptr, len);
      const unescaped = store.readStdValue(descriptor);
      expect(unescaped).toBe("<p>Hello</p>");
    });

    it("should unescape numeric entities", () => {
      const text = "&#60;&#62;&#x3c;&#x3e;";
      const [ptr, len] = writeString(text);

      const descriptor = html.unescape(ptr, len);
      const unescaped = store.readStdValue(descriptor);
      expect(unescaped).toBe("<><>");
    });
  });

  describe("select", () => {
    it("should select elements by CSS selector", () => {
      const htmlContent = '<div class="test"><p>One</p><p>Two</p></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      const selector = "p";
      const [, selectorLen] = writeString(selector);
      store.writeBytes(new TextEncoder().encode(selector), 1000);

      const result = html.select(docDescriptor, 1000, selectorLen);
      expect(result).toBeGreaterThan(0);

      // Check that we found 2 elements
      const size = html.size(result);
      expect(size).toBe(2);
    });

    it("should return -1 for invalid descriptor", () => {
      writeString("p");
      store.writeBytes(new TextEncoder().encode("p"), 1000);

      const result = html.select(-1, 1000, 1);
      expect(result).toBe(-1);
    });
  });

  describe("select_first", () => {
    it("should select first matching element", () => {
      const htmlContent = '<div><p>First</p><p>Second</p></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);

      const result = html.select_first(docDescriptor, 1000, 1);
      expect(result).toBeGreaterThan(0);
    });

    it("should return -5 for no match", () => {
      const htmlContent = '<div><span>Text</span></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);

      const result = html.select_first(docDescriptor, 1000, 1);
      expect(result).toBe(-5); // NoResult
    });
  });

  describe("text", () => {
    it("should get text content", () => {
      const htmlContent = '<div><p>Hello  \n  World</p></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);
      const pDescriptor = html.select_first(docDescriptor, 1000, 1);

      const textDescriptor = html.text(pDescriptor);
      const text = store.readStdValue(textDescriptor);
      expect(text).toBe("Hello World"); // Whitespace normalized
    });
  });

  describe("untrimmed_text", () => {
    it("should get raw text content", () => {
      const htmlContent = '<p>  Hello  </p>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);
      const pDescriptor = html.select_first(docDescriptor, 1000, 1);

      const textDescriptor = html.untrimmed_text(pDescriptor);
      const text = store.readStdValue(textDescriptor);
      expect(text).toBe("  Hello  ");
    });
  });

  describe("attr", () => {
    it("should get attribute value", () => {
      const htmlContent = '<a href="https://example.com" class="link">Link</a>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("a"), 1000);
      const aDescriptor = html.select_first(docDescriptor, 1000, 1);

      store.writeBytes(new TextEncoder().encode("href"), 2000);
      const hrefDescriptor = html.attr(aDescriptor, 2000, 4);
      const href = store.readStdValue(hrefDescriptor);
      expect(href).toBe("https://example.com");
    });

    it("should return -5 for missing attribute", () => {
      const htmlContent = '<p>Text</p>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);
      const pDescriptor = html.select_first(docDescriptor, 1000, 1);

      store.writeBytes(new TextEncoder().encode("href"), 2000);
      const result = html.attr(pDescriptor, 2000, 4);
      expect(result).toBe(-5);
    });
  });

  describe("html and outer_html", () => {
    it("should get inner HTML", () => {
      const htmlContent = '<div><p>Hello</p></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("div"), 1000);
      const divDescriptor = html.select_first(docDescriptor, 1000, 3);

      const innerDescriptor = html.html(divDescriptor);
      const inner = store.readStdValue(innerDescriptor);
      expect(inner).toBe("<p>Hello</p>");
    });

    it("should get outer HTML", () => {
      const htmlContent = '<div><p>Hello</p></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);
      const pDescriptor = html.select_first(docDescriptor, 1000, 1);

      const outerDescriptor = html.outer_html(pDescriptor);
      const outer = store.readStdValue(outerDescriptor);
      expect(outer).toBe("<p>Hello</p>");
    });
  });

  describe("navigation", () => {
    it("should get parent element", () => {
      const htmlContent = '<div><p>Text</p></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);
      const pDescriptor = html.select_first(docDescriptor, 1000, 1);

      const parentDescriptor = html.parent(pDescriptor);
      expect(parentDescriptor).toBeGreaterThan(0);

      const tagDescriptor = html.tag_name(parentDescriptor);
      const tagName = store.readStdValue(tagDescriptor);
      expect(tagName).toBe("div");
    });

    it("should get children", () => {
      const htmlContent = '<ul><li>1</li><li>2</li><li>3</li></ul>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("ul"), 1000);
      const ulDescriptor = html.select_first(docDescriptor, 1000, 2);

      const childrenDescriptor = html.children(ulDescriptor);
      const childCount = html.size(childrenDescriptor);
      expect(childCount).toBe(3);
    });

    it("should get next sibling", () => {
      const htmlContent = '<div><p>First</p><p>Second</p></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);
      const firstP = html.select_first(docDescriptor, 1000, 1);

      const nextDescriptor = html.next(firstP);
      expect(nextDescriptor).toBeGreaterThan(0);

      const textDescriptor = html.text(nextDescriptor);
      const text = store.readStdValue(textDescriptor);
      expect(text).toBe("Second");
    });
  });

  describe("class and attribute helpers", () => {
    it("should check has_class", () => {
      const htmlContent = '<p class="foo bar baz">Text</p>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);
      const pDescriptor = html.select_first(docDescriptor, 1000, 1);

      store.writeBytes(new TextEncoder().encode("bar"), 2000);
      expect(html.has_class(pDescriptor, 2000, 3)).toBe(1);

      store.writeBytes(new TextEncoder().encode("qux"), 3000);
      expect(html.has_class(pDescriptor, 3000, 3)).toBe(0);
    });

    it("should check has_attr", () => {
      const htmlContent = '<a href="/" title="Home">Link</a>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("a"), 1000);
      const aDescriptor = html.select_first(docDescriptor, 1000, 1);

      store.writeBytes(new TextEncoder().encode("href"), 2000);
      expect(html.has_attr(aDescriptor, 2000, 4)).toBe(1);

      store.writeBytes(new TextEncoder().encode("data-x"), 3000);
      expect(html.has_attr(aDescriptor, 3000, 6)).toBe(0);
    });
  });

  describe("list operations", () => {
    it("should get first element", () => {
      const htmlContent = '<div><p>1</p><p>2</p><p>3</p></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);
      const listDescriptor = html.select(docDescriptor, 1000, 1);

      const firstDescriptor = html.first(listDescriptor);
      const textDescriptor = html.text(firstDescriptor);
      expect(store.readStdValue(textDescriptor)).toBe("1");
    });

    it("should get last element", () => {
      const htmlContent = '<div><p>1</p><p>2</p><p>3</p></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);
      const listDescriptor = html.select(docDescriptor, 1000, 1);

      const lastDescriptor = html.last(listDescriptor);
      const textDescriptor = html.text(lastDescriptor);
      expect(store.readStdValue(textDescriptor)).toBe("3");
    });

    it("should get element by index", () => {
      const htmlContent = '<div><p>1</p><p>2</p><p>3</p></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);
      const listDescriptor = html.select(docDescriptor, 1000, 1);

      const secondDescriptor = html.get(listDescriptor, 1);
      const textDescriptor = html.text(secondDescriptor);
      expect(store.readStdValue(textDescriptor)).toBe("2");
    });

    it("should return size", () => {
      const htmlContent = '<div><p>1</p><p>2</p><p>3</p></div>';
      const [contentPtr, contentLen] = writeString(htmlContent);
      const docDescriptor = html.parse(contentPtr, contentLen, 0, 0);

      store.writeBytes(new TextEncoder().encode("p"), 1000);
      const listDescriptor = html.select(docDescriptor, 1000, 1);

      expect(html.size(listDescriptor)).toBe(3);
    });
  });
});
