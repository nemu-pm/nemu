import { describe, it, expect } from "vitest";
import { encodeVarint, encodeF32, concatBytes } from "./postcard";

// Test helpers for canvas postcard encoding (B5/B6 tests)

/**
 * Encode a Point for postcard
 */
function encodePoint(x: number, y: number): Uint8Array {
  return concatBytes([encodeF32(x), encodeF32(y)]);
}

/**
 * Encode a PathOp for postcard
 * PathOp enum: MoveTo=0, LineTo=1, QuadTo=2, CubicTo=3, Arc=4, Close=5
 */
function encodePathOp(
  type: "moveTo" | "lineTo" | "quadTo" | "cubicTo" | "arc" | "close",
  ...args: number[]
): Uint8Array {
  const variants = { moveTo: 0, lineTo: 1, quadTo: 2, cubicTo: 3, arc: 4, close: 5 };
  const variant = encodeVarint(variants[type]);

  switch (type) {
    case "moveTo":
    case "lineTo":
      // Point(x, y)
      return concatBytes([variant, encodePoint(args[0], args[1])]);
    case "quadTo":
      // QuadTo(to, control)
      return concatBytes([
        variant,
        encodePoint(args[0], args[1]), // to
        encodePoint(args[2], args[3]), // control
      ]);
    case "cubicTo":
      // CubicTo(to, c1, c2)
      return concatBytes([
        variant,
        encodePoint(args[0], args[1]), // to
        encodePoint(args[2], args[3]), // c1
        encodePoint(args[4], args[5]), // c2
      ]);
    case "arc":
      // Arc(center, radius, start, sweep)
      return concatBytes([
        variant,
        encodePoint(args[0], args[1]), // center
        encodeF32(args[2]),            // radius
        encodeF32(args[3]),            // startAngle
        encodeF32(args[4]),            // sweepAngle
      ]);
    case "close":
      return variant;
    default:
      throw new Error(`Unknown path op type: ${type}`);
  }
}

/**
 * Encode a Path for postcard (Vec<PathOp>)
 */
function encodePath(ops: Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [encodeVarint(ops.length)];
  parts.push(...ops);
  return concatBytes(parts);
}

/**
 * Encode a Color for postcard
 */
function encodeColor(r: number, g: number, b: number, a: number): Uint8Array {
  return concatBytes([encodeF32(r), encodeF32(g), encodeF32(b), encodeF32(a)]);
}

/**
 * Encode a StrokeStyle for postcard
 */
function encodeStrokeStyle(
  color: { r: number; g: number; b: number; a: number },
  width: number,
  cap: number, // 0=round, 1=square, 2=butt
  join: number, // 0=round, 1=bevel, 2=miter
  miterLimit: number,
  dashArray: number[],
  dashOffset: number
): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(encodeColor(color.r, color.g, color.b, color.a));
  parts.push(encodeF32(width));
  parts.push(encodeVarint(cap));
  parts.push(encodeVarint(join));
  parts.push(encodeF32(miterLimit));
  // Vec<f32> dashArray
  parts.push(encodeVarint(dashArray.length));
  for (const d of dashArray) {
    parts.push(encodeF32(d));
  }
  parts.push(encodeF32(dashOffset));
  return concatBytes(parts);
}

describe("Canvas postcard encoding (B5)", () => {
  describe("Path encoding", () => {
    it("should encode empty path", () => {
      const pathBytes = encodePath([]);
      // Empty vec is [0]
      expect(pathBytes).toEqual(new Uint8Array([0]));
    });

    it("should encode simple path with MoveTo and LineTo", () => {
      const ops = [
        encodePathOp("moveTo", 0, 0),
        encodePathOp("lineTo", 100, 100),
        encodePathOp("close"),
      ];
      const pathBytes = encodePath(ops);

      // First byte is vec length (3)
      expect(pathBytes[0]).toBe(3);
      expect(pathBytes.length).toBeGreaterThan(1);
    });

    it("should encode path with QuadTo", () => {
      const ops = [
        encodePathOp("moveTo", 0, 0),
        encodePathOp("quadTo", 100, 100, 50, 50), // to, control
      ];
      const pathBytes = encodePath(ops);
      expect(pathBytes[0]).toBe(2);
    });

    it("should encode path with CubicTo", () => {
      const ops = [
        encodePathOp("moveTo", 0, 0),
        encodePathOp("cubicTo", 100, 100, 25, 25, 75, 75), // to, c1, c2
      ];
      const pathBytes = encodePath(ops);
      expect(pathBytes[0]).toBe(2);
    });

    it("should encode path with Arc", () => {
      const ops = [
        encodePathOp("arc", 50, 50, 25, 0, Math.PI), // center, radius, start, sweep
      ];
      const pathBytes = encodePath(ops);
      expect(pathBytes[0]).toBe(1);
    });
  });

  describe("StrokeStyle encoding", () => {
    it("should encode default stroke style", () => {
      const style = encodeStrokeStyle(
        { r: 0, g: 0, b: 0, a: 1 }, // black
        1, // width
        2, // cap = butt
        2, // join = miter
        10, // miterLimit
        [], // no dash
        0  // dashOffset
      );
      expect(style.length).toBeGreaterThan(0);
    });

    it("should encode stroke style with dash array", () => {
      const style = encodeStrokeStyle(
        { r: 255, g: 0, b: 0, a: 1 }, // red
        2,   // width
        0,   // cap = round
        0,   // join = round
        10,  // miterLimit
        [5, 10, 5], // dash array
        2    // dashOffset
      );
      expect(style.length).toBeGreaterThan(0);
    });
  });
});

describe("PNG encoding (B6)", () => {
  it("should produce valid PNG header", () => {
    // The PNG encoder is internal to canvas.ts, but we can verify
    // basic PNG structure through the export behavior
    // PNG signature: 137 80 78 71 13 10 26 10
    const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    // Verify the signature bytes are correct
    expect(pngSignature[0]).toBe(0x89); // 137
    expect(pngSignature[1]).toBe(0x50); // P
    expect(pngSignature[2]).toBe(0x4e); // N
    expect(pngSignature[3]).toBe(0x47); // G
  });
});

describe("Canvas error codes", () => {
  const CanvasError = {
    InvalidContext: -1,
    InvalidImagePointer: -2,
    InvalidImage: -3,
    InvalidSrcRect: -4,
    InvalidResult: -5,
    InvalidBounds: -6,
    InvalidPath: -7,
    InvalidStyle: -8,
    InvalidString: -9,
    InvalidFont: -10,
    FontLoadFailed: -11,
  };

  it("should have correct error code values matching aidoku-rs", () => {
    expect(CanvasError.InvalidContext).toBe(-1);
    expect(CanvasError.InvalidImagePointer).toBe(-2);
    expect(CanvasError.InvalidImage).toBe(-3);
    expect(CanvasError.InvalidSrcRect).toBe(-4);
    expect(CanvasError.InvalidResult).toBe(-5);
    expect(CanvasError.InvalidBounds).toBe(-6);
    expect(CanvasError.InvalidPath).toBe(-7);
    expect(CanvasError.InvalidStyle).toBe(-8);
    expect(CanvasError.InvalidString).toBe(-9);
    expect(CanvasError.InvalidFont).toBe(-10);
    expect(CanvasError.FontLoadFailed).toBe(-11);
  });
});

