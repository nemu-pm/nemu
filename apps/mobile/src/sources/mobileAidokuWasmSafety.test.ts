import { describe, expect, test } from "bun:test";
import {
  MOBILE_AIDOKU_MAX_LINEAR_MEMORY_PAGES,
  MOBILE_AIDOKU_MAX_TABLE_ENTRIES,
  MOBILE_AIDOKU_MAX_TABLES,
  prepareMobileAidokuWasm,
} from "../../modules/nemu-aidoku/runtime/aidokuWasmSafety";

const HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

function u32(value: number): number[] {
  const result: number[] = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining) byte |= 0x80;
    result.push(byte);
  } while (remaining);
  return result;
}

function section(id: number, payload: number[]): number[] {
  return [id, ...u32(payload.length), ...payload];
}

function table({
  initial = 1,
  maximum = initial,
  flags = maximum === undefined ? 0 : 1,
  referenceType = 0x70,
}: {
  initial?: number;
  maximum?: number;
  flags?: number;
  referenceType?: number;
} = {}): number[] {
  const limits = [referenceType, flags, ...u32(initial)];
  if ((flags & 1) !== 0) limits.push(...u32(maximum));
  return limits;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function memoryModule({
  initial = 1,
  maximum,
  flags = maximum === undefined ? 0 : 1,
  extraSections = [],
}: {
  initial?: number;
  maximum?: number;
  flags?: number;
  extraSections?: number[][];
} = {}): Uint8Array {
  const limits = [flags, ...u32(initial)];
  if ((flags & 1) !== 0) limits.push(...u32(maximum ?? initial));
  return Uint8Array.from([
    ...HEADER,
    ...extraSections.flat(),
    ...section(5, [1, ...limits]),
  ]);
}

describe("mobile Aidoku Wasm static safety", () => {
  test("injects a bounded maximum into current Rust-style unbounded memory", () => {
    const input = memoryModule({ initial: 18 });
    const prepared = prepareMobileAidokuWasm(input);

    expect(prepared.initialMemoryPages).toBe(18);
    expect(prepared.maximumMemoryPages).toBe(
      MOBILE_AIDOKU_MAX_LINEAR_MEMORY_PAGES,
    );
    expect(prepared.memoryMaximumRewritten).toBe(true);
    expect(prepared.bytes).not.toEqual(input);
    expect(() =>
      new WebAssembly.Module(ownedArrayBuffer(prepared.bytes)),
    ).not.toThrow();
  });

  test("preserves an already bounded memory and clamps a larger maximum", () => {
    const bounded = memoryModule({ initial: 2, maximum: 64 });
    const preparedBounded = prepareMobileAidokuWasm(bounded);
    expect(preparedBounded.maximumMemoryPages).toBe(64);
    expect(preparedBounded.memoryMaximumRewritten).toBe(false);
    expect(preparedBounded.bytes).toBe(bounded);

    const preparedLarge = prepareMobileAidokuWasm(
      memoryModule({ initial: 2, maximum: 4_096 }),
    );
    expect(preparedLarge.maximumMemoryPages).toBe(
      MOBILE_AIDOKU_MAX_LINEAR_MEMORY_PAGES,
    );
    expect(preparedLarge.memoryMaximumRewritten).toBe(true);
    expect(() =>
      new WebAssembly.Module(ownedArrayBuffer(preparedLarge.bytes)),
    ).not.toThrow();
  });

  test("rejects memory that starts above the cap or uses unsupported limits", () => {
    expect(() =>
      prepareMobileAidokuWasm(
        memoryModule({
          initial: MOBILE_AIDOKU_MAX_LINEAR_MEMORY_PAGES + 1,
        }),
      ),
    ).toThrow("initial memory exceeds");
    expect(() =>
      prepareMobileAidokuWasm(memoryModule({ flags: 2 })),
    ).toThrow("unsupported limits");
    expect(() =>
      prepareMobileAidokuWasm(memoryModule({ flags: 4 })),
    ).toThrow("unsupported limits");
  });

  test("rejects imported memory before compilation", () => {
    const name = (value: string) => [value.length, ...Buffer.from(value)];
    const importPayload = [
      1,
      ...name("env"),
      ...name("memory"),
      2,
      0,
      1,
    ];
    const module = Uint8Array.from([
      ...HEADER,
      ...section(2, importPayload),
    ]);
    expect(() => prepareMobileAidokuWasm(module)).toThrow(
      "must define, not import",
    );
  });

  test("accepts bounded function tables and rejects unbounded or oversized tables", () => {
    const safe = memoryModule({
      extraSections: [section(4, [1, ...table({ initial: 215, maximum: 215 })])],
    });
    expect(() =>
      new WebAssembly.Module(ownedArrayBuffer(prepareMobileAidokuWasm(safe).bytes)),
    ).not.toThrow();

    expect(() =>
      prepareMobileAidokuWasm(
        memoryModule({
          extraSections: [
            section(4, [1, ...table({ initial: 1, maximum: undefined, flags: 0 })]),
          ],
        }),
      ),
    ).toThrow("entry safety limit");
    expect(() =>
      prepareMobileAidokuWasm(
        memoryModule({
          extraSections: [
            section(4, [
              1,
              ...table({
                initial: MOBILE_AIDOKU_MAX_TABLE_ENTRIES + 1,
                maximum: MOBILE_AIDOKU_MAX_TABLE_ENTRIES + 1,
              }),
            ]),
          ],
        }),
      ),
    ).toThrow("entry safety limit");
    expect(() =>
      prepareMobileAidokuWasm(
        memoryModule({
          extraSections: [
            section(4, [
              1,
              ...table({
                initial: 1,
                maximum: MOBILE_AIDOKU_MAX_TABLE_ENTRIES + 1,
              }),
            ]),
          ],
        }),
      ),
    ).toThrow("entry safety limit");
    expect(() =>
      prepareMobileAidokuWasm(
        memoryModule({
          extraSections: [section(4, [1, ...table({ referenceType: 0x6f })])],
        }),
      ),
    ).toThrow("unsupported reference type");
  });

  test("bounds imported and aggregate table counts", () => {
    const name = (value: string) => [value.length, ...Buffer.from(value)];
    const importedTables = Array.from(
      { length: MOBILE_AIDOKU_MAX_TABLES },
      (_, index) => [
        ...name("env"),
        ...name(`table${index}`),
        1,
        ...table({ initial: 1, maximum: 4 }),
      ],
    ).flat();
    const atLimit = memoryModule({
      extraSections: [
        section(2, [MOBILE_AIDOKU_MAX_TABLES, ...importedTables]),
      ],
    });
    expect(() => prepareMobileAidokuWasm(atLimit)).not.toThrow();

    const overLimit = memoryModule({
      extraSections: [
        section(2, [MOBILE_AIDOKU_MAX_TABLES, ...importedTables]),
        section(4, [1, ...table({ initial: 1, maximum: 1 })]),
      ],
    });
    expect(() => prepareMobileAidokuWasm(overLimit)).toThrow(
      `more than ${MOBILE_AIDOKU_MAX_TABLES} tables`,
    );
  });

  test("rejects automatic start, missing, duplicate, and malformed memory", () => {
    expect(() =>
      prepareMobileAidokuWasm(
        memoryModule({ extraSections: [section(8, [0])] }),
      ),
    ).toThrow("automatic start sections");
    expect(() => prepareMobileAidokuWasm(Uint8Array.from(HEADER))).toThrow(
      "does not define linear memory",
    );
    const duplicate = memoryModule({
      extraSections: [section(5, [1, 0, 1])],
    });
    expect(() => prepareMobileAidokuWasm(duplicate)).toThrow(
      "duplicate memory sections",
    );
    expect(() =>
      prepareMobileAidokuWasm(
        Uint8Array.from([...HEADER, 5, 0x80]),
      ),
    ).toThrow("truncated");
  });
});
