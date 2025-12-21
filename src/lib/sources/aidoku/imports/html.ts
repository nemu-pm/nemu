// html namespace - HTML parsing and DOM operations using Cheerio
import {
  load as cheerioLoad,
  type Cheerio,
  type CheerioAPI,
} from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";
import { GlobalStore, isCheerioNode } from "../global-store";

// B12: HTML error codes matching aidoku-rs HtmlError
const HtmlError = {
  InvalidDescriptor: -1,
  InvalidString: -2,
  InvalidHtml: -3,
  InvalidQuery: -4,
  NoResult: -5,
  SwiftSoupError: -6,
} as const;

// Extended Cheerio type with API reference
interface CheerioWithApi extends Cheerio<AnyNode> {
  _cheerioApi?: CheerioAPI;
}

/**
 * Preprocess selector for SwiftSoup compatibility.
 * Handles patterns that Cheerio doesn't support natively:
 * - [*] matches elements with any attribute (SwiftSoup extension)
 * - :not([*]) matches elements with no attributes
 *
 * Returns { selector, postFilter } where postFilter is a function to apply after select.
 */
function preprocessSelector(
  selector: string
): { selector: string; postFilter: ((el: Cheerio<AnyNode>) => boolean) | null } {
  // Handle :not([*]) - elements with no attributes
  const notAnyAttrMatch = selector.match(/^(.+?):not\(\[\*\]\)$/);
  if (notAnyAttrMatch) {
    return {
      selector: notAnyAttrMatch[1],
      postFilter: (el) => {
        const first = el[0];
        if (first && "attribs" in first) {
          return Object.keys((first as Element).attribs || {}).length === 0;
        }
        return true;
      },
    };
  }

  // Handle [*] - elements with any attribute
  const anyAttrMatch = selector.match(/^(.+?)\[\*\]$/);
  if (anyAttrMatch) {
    return {
      selector: anyAttrMatch[1],
      postFilter: (el) => {
        const first = el[0];
        if (first && "attribs" in first) {
          return Object.keys((first as Element).attribs || {}).length > 0;
        }
        return false;
      },
    };
  }

  return { selector, postFilter: null };
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
      if (dataLen <= 0) return HtmlError.InvalidString;
      const content = store.readString(dataPtr, dataLen);
      if (!content) return HtmlError.InvalidString;

      const baseUrl =
        baseUrlLen > 0 ? store.readString(baseUrlPtr, baseUrlLen) : undefined;

      try {
        const $ = cheerioLoad(content, { baseURI: baseUrl || undefined });
        const root = $.root() as CheerioWithApi;
        root._cheerioApi = $;
        return store.storeStdValue(root);
      } catch {
        return HtmlError.InvalidHtml;
      }
    },

    parse_fragment: (
      dataPtr: number,
      dataLen: number,
      baseUrlPtr: number,
      baseUrlLen: number
    ): number => {
      if (dataLen <= 0) return HtmlError.InvalidString;
      const content = store.readString(dataPtr, dataLen);
      if (!content) return HtmlError.InvalidString;

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
        return HtmlError.InvalidHtml;
      }
    },

    escape: (textPtr: number, textLen: number): number => {
      if (textLen <= 0) return HtmlError.InvalidString;
      const text = store.readString(textPtr, textLen);
      if (!text) return HtmlError.InvalidString;

      // Escape special HTML characters (comprehensive list)
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
      return store.storeStdValue(escaped);
    },

    unescape: (textPtr: number, textLen: number): number => {
      if (textLen <= 0) return HtmlError.InvalidString;
      const text = store.readString(textPtr, textLen);
      if (!text) return HtmlError.InvalidString;

      // Common named HTML entities (extended from basic 5 to match SwiftSoup behavior)
      const namedEntities: Record<string, string> = {
        // Basic entities
        amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
        // Whitespace and special
        nbsp: "\u00A0", ensp: "\u2002", emsp: "\u2003", thinsp: "\u2009",
        // Common punctuation
        ndash: "\u2013", mdash: "\u2014", lsquo: "\u2018", rsquo: "\u2019",
        ldquo: "\u201C", rdquo: "\u201D", sbquo: "\u201A", bdquo: "\u201E",
        laquo: "\u00AB", raquo: "\u00BB", lsaquo: "\u2039", rsaquo: "\u203A",
        hellip: "\u2026", bull: "\u2022", middot: "\u00B7", prime: "\u2032", Prime: "\u2033",
        // Currency and symbols
        cent: "\u00A2", pound: "\u00A3", yen: "\u00A5", euro: "\u20AC", copy: "\u00A9",
        reg: "\u00AE", trade: "\u2122", deg: "\u00B0", plusmn: "\u00B1", para: "\u00B6",
        sect: "\u00A7", times: "\u00D7", divide: "\u00F7",
        // Arrows
        larr: "\u2190", uarr: "\u2191", rarr: "\u2192", darr: "\u2193",
        harr: "\u2194", crarr: "\u21B5",
        // Math
        forall: "\u2200", part: "\u2202", exist: "\u2203", empty: "\u2205",
        nabla: "\u2207", isin: "\u2208", notin: "\u2209", ni: "\u220B",
        prod: "\u220F", sum: "\u2211", minus: "\u2212", lowast: "\u2217",
        radic: "\u221A", prop: "\u221D", infin: "\u221E", ang: "\u2220",
        and: "\u2227", or: "\u2228", cap: "\u2229", cup: "\u222A",
        int: "\u222B", there4: "\u2234", sim: "\u223C", cong: "\u2245",
        asymp: "\u2248", ne: "\u2260", equiv: "\u2261", le: "\u2264",
        ge: "\u2265", sub: "\u2282", sup: "\u2283", nsub: "\u2284",
        sube: "\u2286", supe: "\u2287", oplus: "\u2295", otimes: "\u2297",
        perp: "\u22A5", sdot: "\u22C5",
        // Greek letters (lowercase)
        alpha: "\u03B1", beta: "\u03B2", gamma: "\u03B3", delta: "\u03B4",
        epsilon: "\u03B5", zeta: "\u03B6", eta: "\u03B7", theta: "\u03B8",
        iota: "\u03B9", kappa: "\u03BA", lambda: "\u03BB", mu: "\u03BC",
        nu: "\u03BD", xi: "\u03BE", omicron: "\u03BF", pi: "\u03C0",
        rho: "\u03C1", sigmaf: "\u03C2", sigma: "\u03C3", tau: "\u03C4",
        upsilon: "\u03C5", phi: "\u03C6", chi: "\u03C7", psi: "\u03C8", omega: "\u03C9",
        // Greek letters (uppercase)
        Alpha: "\u0391", Beta: "\u0392", Gamma: "\u0393", Delta: "\u0394",
        Epsilon: "\u0395", Zeta: "\u0396", Eta: "\u0397", Theta: "\u0398",
        Iota: "\u0399", Kappa: "\u039A", Lambda: "\u039B", Mu: "\u039C",
        Nu: "\u039D", Xi: "\u039E", Omicron: "\u039F", Pi: "\u03A0",
        Rho: "\u03A1", Sigma: "\u03A3", Tau: "\u03A4", Upsilon: "\u03A5",
        Phi: "\u03A6", Chi: "\u03A7", Psi: "\u03A8", Omega: "\u03A9",
      };

      const unescaped = text
        // Named entities
        .replace(/&([a-zA-Z]+);/g, (match, name: string) => {
          return namedEntities[name] ?? match; // Keep unrecognized as-is
        })
        // Numeric hex entities (&#x1F600; or &#X1F600;)
        .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, code: string) => {
          try {
            const codePoint = parseInt(code, 16);
            return String.fromCodePoint(codePoint);
          } catch {
            return _; // Keep invalid as-is
          }
        })
        // Numeric decimal entities (&#123;)
        .replace(/&#(\d+);/g, (_, code: string) => {
          try {
            const codePoint = parseInt(code, 10);
            return String.fromCodePoint(codePoint);
          } catch {
            return _; // Keep invalid as-is
          }
        });
      return store.storeStdValue(unescaped);
    },

    select: (
      descriptor: number,
      selectorPtr: number,
      selectorLen: number
    ): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      if (selectorLen <= 0) return HtmlError.InvalidString;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const rawSelector = store.readString(selectorPtr, selectorLen);
      if (!rawSelector) return HtmlError.InvalidString;

      try {
        const { selector, postFilter } = preprocessSelector(rawSelector);
        const $ = node._cheerioApi;

        // Search descendants
        let result = node.find(selector) as Cheerio<Element>;
        // Also include the element itself if it matches (SwiftSoup behavior)
        try {
          if (node.is(selector)) {
            result = node.first().add(result) as Cheerio<Element>;
          }
        } catch {
          // is() can throw for complex selectors, ignore
        }

        // Apply post-filter if present (for SwiftSoup-specific patterns)
        if (postFilter && $) {
          const filtered: AnyNode[] = [];
          result.each((_, el) => {
            const wrapped = $(el);
            if (postFilter(wrapped)) {
              filtered.push(el);
            }
          });
          result = $(filtered) as Cheerio<Element>;
        }

        return store.storeStdValue(attachApi(result, node));
      } catch {
        return HtmlError.InvalidQuery;
      }
    },

    select_first: (
      descriptor: number,
      selectorPtr: number,
      selectorLen: number
    ): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      if (selectorLen <= 0) return HtmlError.InvalidString;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const rawSelector = store.readString(selectorPtr, selectorLen);
      if (!rawSelector) return HtmlError.InvalidString;

      try {
        const { selector, postFilter } = preprocessSelector(rawSelector);
        const $ = node._cheerioApi;

        // First check if the element itself matches the selector
        // This matches SwiftSoup behavior where select on an element
        // can return the element itself if it matches
        try {
          if (node.is(selector)) {
            const first = node.first();
            if (!postFilter || postFilter(first)) {
              return store.storeStdValue(attachApi(first, node));
            }
          }
        } catch {
          // is() can throw for complex selectors, ignore
        }

        // Then search descendants
        const found = node.find(selector);

        // Apply post-filter if present (for SwiftSoup-specific patterns)
        if (postFilter && $) {
          let result: Cheerio<AnyNode> | null = null;
          found.each((_, el) => {
            if (result) return false; // Already found one
            const wrapped = $(el);
            if (postFilter(wrapped)) {
              result = wrapped as Cheerio<AnyNode>;
              return false;
            }
          });
          if (!result) return HtmlError.NoResult;
          return store.storeStdValue(attachApi(result, node));
        }

        const result = found.first();
        if (result.length === 0) return HtmlError.NoResult;
        return store.storeStdValue(attachApi(result, node));
      } catch {
        return HtmlError.InvalidQuery;
      }
    },

    attr: (descriptor: number, attrPtr: number, attrLen: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      if (attrLen <= 0) return HtmlError.InvalidString;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const attrName = store.readString(attrPtr, attrLen);
      if (!attrName) return HtmlError.InvalidString;

      try {
        // Handle abs: prefix for absolute URLs
        let attr = attrName;
        let makeAbsolute = false;
        if (attrName.startsWith("abs:")) {
          attr = attrName.slice(4);
          makeAbsolute = true;
        }

        let value = node.first().attr(attr);
        if (value === undefined) return HtmlError.NoResult;

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
        return HtmlError.SwiftSoupError;
      }
    },

    text: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;

      const text = node.text().trim().replace(/\s+/g, " ");
      return store.storeStdValue(text);
    },

    untrimmed_text: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;

      return store.storeStdValue(node.text());
    },

    html: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const html = node.html() || "";
      return store.storeStdValue(html);
    },

    outer_html: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const $ = node._cheerioApi;
      const outer = $ ? $.html(node) : node.toString();
      return store.storeStdValue(outer || "");
    },

    set_text: (
      descriptor: number,
      textPtr: number,
      textLen: number
    ): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const text = store.readString(textPtr, textLen);
      if (text === null) return HtmlError.InvalidString;
      node.text(text);
      return 0;
    },

    set_html: (
      descriptor: number,
      htmlPtr: number,
      htmlLen: number
    ): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const html = store.readString(htmlPtr, htmlLen);
      if (html === null) return HtmlError.InvalidString;
      node.html(html);
      return 0;
    },

    prepend: (
      descriptor: number,
      htmlPtr: number,
      htmlLen: number
    ): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const html = store.readString(htmlPtr, htmlLen);
      if (html === null) return HtmlError.InvalidString;
      node.prepend(html);
      return 0;
    },

    append: (descriptor: number, htmlPtr: number, htmlLen: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const html = store.readString(htmlPtr, htmlLen);
      if (html === null) return HtmlError.InvalidString;
      node.append(html);
      return 0;
    },

    parent: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const parent = node.parent();
      if (parent.length === 0) return HtmlError.NoResult;
      return store.storeStdValue(attachApi(parent, node));
    },

    children: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const children = node.children();
      return store.storeStdValue(attachApi(children, node));
    },

    siblings: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const siblings = node.siblings();
      return store.storeStdValue(attachApi(siblings, node));
    },

    next: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const next = node.next();
      if (next.length === 0) return HtmlError.NoResult;
      return store.storeStdValue(attachApi(next, node));
    },

    previous: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const prev = node.prev();
      if (prev.length === 0) return HtmlError.NoResult;
      return store.storeStdValue(attachApi(prev, node));
    },

    base_uri: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const $ = node._cheerioApi;
      const baseUri = $?.root().attr("baseURI") || "";
      return store.storeStdValue(baseUri);
    },

    own_text: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;

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
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      // For script tags and similar
      const data = node.first().html() || "";
      return store.storeStdValue(data);
    },

    id: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const id = node.first().attr("id");
      if (!id) return HtmlError.NoResult;
      return store.storeStdValue(id);
    },

    tag_name: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      const first = node.first();
      const el = first[0];
      let name = "";
      if (el && "tagName" in el) {
        name = (el as Element).tagName;
      }
      return store.storeStdValue((name || "").toLowerCase());
    },

    class_name: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
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
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      if (node.length === 0) return HtmlError.NoResult;
      const first = node.first();
      return store.storeStdValue(attachApi(first, node));
    },

    last: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      if (node.length === 0) return HtmlError.NoResult;
      const last = node.last();
      return store.storeStdValue(attachApi(last, node));
    },

    get: (descriptor: number, index: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;
      if (index < 0 || index >= node.length) return HtmlError.NoResult;
      const el = node.eq(index);
      if (el.length === 0) return HtmlError.NoResult;
      return store.storeStdValue(attachApi(el, node));
    },

    size: (descriptor: number): number => {
      const node = getNode(store, descriptor);
      if (!node) return 0;
      return node.length;
    },

    // ============ OLD ABI (legacy sources like aidoku-zh) ============
    
    // Convert a Cheerio selection to an array of elements (returns std array descriptor)
    array: (descriptor: number): number => {
      if (descriptor < 0) return HtmlError.InvalidDescriptor;
      const node = getNode(store, descriptor);
      if (!node) return HtmlError.InvalidDescriptor;

      // Convert each element in the selection to a separate descriptor
      const elements: CheerioWithApi[] = [];
      node.each((_, el) => {
        const $ = node._cheerioApi;
        if ($) {
          const wrapped = $(el) as CheerioWithApi;
          wrapped._cheerioApi = $;
          elements.push(wrapped);
        }
      });

      // Store the array and return its descriptor
      return store.storeStdValue(elements);
    },
  };
}
