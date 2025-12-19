import { describe, it, expect } from "vitest";
import {
  parseDateWithFormat,
  parseRelativeDate,
  convertFormat,
} from "./std";

describe("std imports - date parsing", () => {
  describe("convertFormat", () => {
    it("should convert Swift year formats", () => {
      expect(convertFormat("yyyy")).toBe("YYYY");
      expect(convertFormat("yy")).toBe("YY");
    });

    it("should convert Swift month formats", () => {
      expect(convertFormat("MMMM")).toBe("MMMM");
      expect(convertFormat("MMM")).toBe("MMM");
      expect(convertFormat("MM")).toBe("MM");
      expect(convertFormat("M")).toBe("M");
    });

    it("should convert Swift day formats", () => {
      expect(convertFormat("dd")).toBe("DD");
      expect(convertFormat("d")).toBe("D");
    });

    it("should convert Swift time formats", () => {
      expect(convertFormat("HH")).toBe("HH");
      expect(convertFormat("mm")).toBe("mm");
      expect(convertFormat("ss")).toBe("ss");
    });

    it("should convert complex formats", () => {
      expect(convertFormat("yyyy-MM-dd")).toBe("YYYY-MM-DD");
      expect(convertFormat("yyyy-MM-dd HH:mm:ss")).toBe("YYYY-MM-DD HH:mm:ss");
    });
  });

  describe("parseRelativeDate", () => {
    it("should parse English relative dates", () => {
      const now = Date.now();

      const result1 = parseRelativeDate("5 minutes ago");
      expect(result1).not.toBeNull();
      expect(now - result1!.getTime()).toBeCloseTo(5 * 60 * 1000, -3);

      const result2 = parseRelativeDate("1 hour ago");
      expect(result2).not.toBeNull();
      expect(now - result2!.getTime()).toBeCloseTo(60 * 60 * 1000, -3);

      const result3 = parseRelativeDate("2 days ago");
      expect(result3).not.toBeNull();
      expect(now - result3!.getTime()).toBeCloseTo(2 * 24 * 60 * 60 * 1000, -3);
    });

    it("should parse Chinese relative dates", () => {
      const now = Date.now();

      const result1 = parseRelativeDate("5分钟前");
      expect(result1).not.toBeNull();
      expect(now - result1!.getTime()).toBeCloseTo(5 * 60 * 1000, -3);

      const result2 = parseRelativeDate("1小时前");
      expect(result2).not.toBeNull();
      expect(now - result2!.getTime()).toBeCloseTo(60 * 60 * 1000, -3);

      const result3 = parseRelativeDate("2天前");
      expect(result3).not.toBeNull();
      expect(now - result3!.getTime()).toBeCloseTo(2 * 24 * 60 * 60 * 1000, -3);
    });

    it("should parse 'just now' variants", () => {
      const now = Date.now();

      const result1 = parseRelativeDate("just now");
      expect(result1).not.toBeNull();
      expect(now - result1!.getTime()).toBeLessThan(1000);

      const result2 = parseRelativeDate("刚刚");
      expect(result2).not.toBeNull();
      expect(now - result2!.getTime()).toBeLessThan(1000);
    });

    it("should parse 'today' and 'yesterday'", () => {
      const today = parseRelativeDate("today");
      expect(today).not.toBeNull();

      const yesterday = parseRelativeDate("yesterday");
      expect(yesterday).not.toBeNull();

      // Yesterday should be before today
      expect(yesterday!.getTime()).toBeLessThan(today!.getTime());
    });

    it("should return null for non-relative dates", () => {
      expect(parseRelativeDate("2024-01-01")).toBeNull();
      expect(parseRelativeDate("not a date")).toBeNull();
    });
  });

  describe("parseDateWithFormat", () => {
    it("should parse ISO format dates", () => {
      const result = parseDateWithFormat("2024-06-15", "yyyy-MM-dd", null, null);
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(5); // June is month 5
      expect(result!.getDate()).toBe(15);
    });

    it("should parse date with time", () => {
      const result = parseDateWithFormat(
        "2024-06-15 14:30:00",
        "yyyy-MM-dd HH:mm:ss",
        null,
        null
      );
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(30);
    });

    it("should handle relative dates", () => {
      const result = parseDateWithFormat("5 minutes ago", "yyyy-MM-dd", null, null);
      expect(result).not.toBeNull();
    });

    it("should fallback to common formats", () => {
      const result = parseDateWithFormat("June 15, 2024", "irrelevant", null, null);
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2024);
    });

    it("should return null for invalid dates", () => {
      const result = parseDateWithFormat(
        "not a date at all",
        "yyyy-MM-dd",
        null,
        null
      );
      expect(result).toBeNull();
    });

    it("should handle whitespace trimming", () => {
      const result = parseDateWithFormat("  2024-06-15  ", "yyyy-MM-dd", null, null);
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2024);
    });
  });
});
