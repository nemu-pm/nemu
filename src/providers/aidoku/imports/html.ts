// html namespace - HTML parsing and DOM operations using Cheerio
import {
  load as cheerioLoad,
  type Cheerio,
  type CheerioAPI,
} from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";
import { GlobalStore, isCheerioNode } from "../global-store";

// Extended Cheerio type with API reference
interface CheerioWithApi extends Cheerio<AnyNode> {
  _cheerioApi?: CheerioAPI;
}

// Helper to get Cheerio element from descriptor
function getNode(store: GlobalStore, descriptor: number): CheerioWithApi | null {
  if (descriptor < 0) return null;
  const value = store.readStdValue(descriptor);
  if (isCheerioNode(value)) {
    return value as CheerioWithApi;
  }
  return null;
}

// Helper to attach API reference to a Cheerio object
function attachApi(target: Cheerio<AnyNode>, source: CheerioWithApi): CheerioWithApi {
  const result = target as CheerioWithApi;
  result._cheerioApi = source._cheerioApi;
  return result;
}

export function createHtmlImports(store: GlobalStore) {
  return {
    // Parse with optional base URL (new signature)
    parse: (
      dataPtr: number,
      dataLen: number,
      baseUrlPtr: number,
      baseUrlLen: number
    ): number => {
      if (dataLen <= 0) return -1;
      const content = store.readString(dataPtr, dataLen);
      if (!content) return -1;

      const baseUrl =
        baseUrlLen > 0 ? store.readString(baseUrlPtr, baseUrlLen) : undefined;

      try {
        const $ = cheerioLoad(content, { baseURI: baseUrl || undefined });
        const root = $.root() as CheerioWithApi;
        root._cheerioApi = $;
        return store.storeStdValue(root);
      } catch {
        return -1;
      }
    },

    parse_fragment: (
      dataPtr: number,
      dataLen: number,
      baseUrlPtr: number,
      baseUrlLen: number
    ): number => {
      if (dataLen <= 0) return -1;
      const content = store.readString(dataPtr, dataLen);
      if (!content) return -1;

      const baseUrl =
        baseUrlLen > 0 ? store.readString(baseUrlPtr, baseUrlLen) : undefined;

      try {
        const $ = cheerioLoad(`<body>${content}</body>`, {
          baseURI: baseUrl || undefined,
        });
        const body = $("body") as CheerioWithApi;
        body._cheerioApi = $;
        return store.storeStdValue(body);
      } catch {
        return -1;
      }
    },

    escape: (textPtr: number, textLen: number): number => {
      if (textLen <= 0) return -1;
      const text = store.readString(textPtr, textLen);
      if (!text) return -1;

      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
      return store.storeStdValue(escaped);
    },

    unescape: (textPtr: number, textLen: number): number => {
      if (textLen <= 0) return -1;
      const text = store.readString(textPtr, textLen);
      if (!text) return -1;

      const unescaped = text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
          String.fromCharCode(parseInt(code, 16))
        )
        .replace(/&#(\d+);/g, (_, code: string) =>
          String.fromCharCode(parseInt(code, 10))
        );
      return store.storeStdValue(unescaped);
    },

    select: (
      descriptor: number,
      selectorPtr: number,
      selectorLen: number
    ): number => {
      if (descriptor < 0 || selectorLen <= 0) return -1;
      const node = getNode(store, descriptor);
      const selector = store.readString(selectorPtr, selectorLen);
      if (!node || !selector) return -1;

      try {
        const result = attachApi(node.find(selector), node);
        return store.storeStdValue(result);
      } catch {
        return -1;
      }
    },

    select_first: (
      descriptor: number,
      selectorPtr: number,
      selectorLen: number
    ): number => {
      if (descriptor < 0 || selectorLen <= 0) return -1;
      const node = getNode(store, descriptor);
      const selector = store.readString(selectorPtr, selectorLen);
      if (!node || !selector) return -1;

      try {
        const result = node.find(selector).first();
        if (result.length === 0) return -5; // NoResult error
        return store.storeStdValue(attachApi(result, node));
      } catch {
        return -1;
      }
    },

    attr: (descriptor: number, attrPtr: number, attrLen: number): number => {
      if (descriptor < 0 || attrLen <= 0) return -1;
      const node = getNode(store, descriptor);
      const attrName = store.readString(attrPtr, attrLen);
      if (!node || !attrName) return -1;

      try {
        // Handle abs: prefix for absolute URLs
        let attr = attrName;
        let makeAbsolute = false;
        if (attrName.startsWith("abs:")) {
          attr = attrName.slice(4);
          makeAbsolute = true;
        }

        let value = node.first().attr(attr);
        if (value === undefined) return -5; // NoResult

        if (makeAbsolute && value) {
          // Try to get base URI from the cheerio API
          const $ = node._cheerioApi;
          const baseUri = $?.root().attr("baseURI") || "";

          if (
            baseUri &&
            !value.startsWith("http://") &&
            !value.startsWith("https://") &&
            !value.startsWith("//")
          ) {
            try {
              value = new URL(value, baseUri).toString();
            } catch {
              // Keep original value if URL resolution fails
            }
          } else if (value.startsWith("//")) {
            value = "https:" + value;
          }
        }

        return store.storeStdValue(value);
      } catch {
        return -1;
      }
    },

    text: (descriptor: number): number => {
      if (descriptor < 0) return -1;
      const node = getNode(store, descriptor);
      if (!node) return -1;

      const text = node.text().trim().replace(/\s+/g, " ");
      return store.storeStdValue(text);
    },

    untrimmed_text: (descriptor: number): number => {
      if (descriptor < 0) return -1;
      const node = getNode(store, descriptor);
      if (!node) return -1;

      return store.storeStdValue(node.text());
    },

    html: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      const html = node.html() || "";
      return store.storeStdValue(html);
    },

    outer_html: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      const $ = node._cheerioApi;
      const outer = $ ? $.html(node) : node.toString();
      return store.storeStdValue(outer || "");
    },

    set_text: (
      descriptor: number,
      textPtr: number,
      textLen: number
    ): number => {
      const node = getNode(store, descriptor);
      const text = store.readString(textPtr, textLen);
      if (!node || text === null) return -1;
      node.text(text);
      return 0;
    },

    set_html: (
      descriptor: number,
      htmlPtr: number,
      htmlLen: number
    ): number => {
      const node = getNode(store, descriptor);
      const html = store.readString(htmlPtr, htmlLen);
      if (!node || html === null) return -1;
      node.html(html);
      return 0;
    },

    prepend: (
      descriptor: number,
      htmlPtr: number,
      htmlLen: number
    ): number => {
      const node = getNode(store, descriptor);
      const html = store.readString(htmlPtr, htmlLen);
      if (!node || html === null) return -1;
      node.prepend(html);
      return 0;
    },

    append: (descriptor: number, htmlPtr: number, htmlLen: number): number => {
      const node = getNode(store, descriptor);
      const html = store.readString(htmlPtr, htmlLen);
      if (!node || html === null) return -1;
      node.append(html);
      return 0;
    },

    parent: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      const parent = node.parent();
      if (parent.length === 0) return -5;
      return store.storeStdValue(attachApi(parent, node));
    },

    children: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      const children = node.children();
      return store.storeStdValue(attachApi(children, node));
    },

    siblings: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      const siblings = node.siblings();
      return store.storeStdValue(attachApi(siblings, node));
    },

    next: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      const next = node.next();
      if (next.length === 0) return -5;
      return store.storeStdValue(attachApi(next, node));
    },

    previous: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      const prev = node.prev();
      if (prev.length === 0) return -5;
      return store.storeStdValue(attachApi(prev, node));
    },

    base_uri: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      const $ = node._cheerioApi;
      const baseUri = $?.root().attr("baseURI") || "";
      return store.storeStdValue(baseUri);
    },

    own_text: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;

      // Get only direct text nodes, not from children
      const el = node.first();
      let text = "";
      el.contents().each((_, child) => {
        if (child.type === "text") {
          text += (child as Text).data;
        }
      });

      return store.storeStdValue(text.trim());
    },

    data: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      // For script tags and similar
      const data = node.first().html() || "";
      return store.storeStdValue(data);
    },

    id: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      const id = node.first().attr("id");
      if (!id) return -5;
      return store.storeStdValue(id);
    },

    tag_name: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      const first = node.first();
      const el = first[0];
      let name = "";
      if (el && "tagName" in el) {
        name = (el as Element).tagName;
      }
      return store.storeStdValue((name || "").toLowerCase());
    },

    class_name: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return -1;
      const className = node.first().attr("class") || "";
      return store.storeStdValue(className);
    },

    has_class: (
      descriptor: number,
      classPtr: number,
      classLen: number
    ): number => {
      const node = getNode(store, descriptor);
      const className = store.readString(classPtr, classLen);
      if (!node || !className) return 0;
      return node.hasClass(className) ? 1 : 0;
    },

    has_attr: (
      descriptor: number,
      attrPtr: number,
      attrLen: number
    ): number => {
      const node = getNode(store, descriptor);
      const attrName = store.readString(attrPtr, attrLen);
      if (!node || !attrName) return 0;
      return node.first().attr(attrName) !== undefined ? 1 : 0;
    },

    // ElementList methods
    first: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node || node.length === 0) return -5;
      const first = node.first();
      return store.storeStdValue(attachApi(first, node));
    },

    last: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node || node.length === 0) return -5;
      const last = node.last();
      return store.storeStdValue(attachApi(last, node));
    },

    get: (descriptor: number, index: number): number => {
      const node = getNode(store, descriptor);
      if (!node || index < 0 || index >= node.length) return -5;
      const el = node.eq(index);
      if (el.length === 0) return -5;
      return store.storeStdValue(attachApi(el, node));
    },

    size: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return 0;
      return node.length;
    },
  };
}
