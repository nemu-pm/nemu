const WASM_HEADER = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const WASM_IMPORT_SECTION = 2;
const WASM_TABLE_SECTION = 4;
const WASM_MEMORY_SECTION = 5;
const WASM_START_SECTION = 8;
const WASM_PAGE_BYTES = 64 * 1024;

// Keep linear memory below the Android sandbox's 96 MiB isolate heap and leave
// room for replay data, JS objects, and image-processing buffers. iOS runs the
// source in an isolated WebContent Worker, but this still prevents repeated
// oversized allocations from killing and restarting that process.
export const MOBILE_AIDOKU_MAX_LINEAR_MEMORY_PAGES = 512;
export const MOBILE_AIDOKU_MAX_LINEAR_MEMORY_BYTES =
  MOBILE_AIDOKU_MAX_LINEAR_MEMORY_PAGES * WASM_PAGE_BYTES;
export const MOBILE_AIDOKU_MAX_TABLES = 4;
export const MOBILE_AIDOKU_MAX_TABLE_ENTRIES = 16_384;

export type MobileAidokuPreparedWasm = {
  bytes: Uint8Array;
  initialMemoryPages: number;
  maximumMemoryPages: number;
  memoryMaximumRewritten: boolean;
};

class WasmCursor {
  offset = 0;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly end = bytes.byteLength,
  ) {}

  readByte(label: string): number {
    if (this.offset >= this.end) {
      throw new Error(`Aidoku Wasm ${label} is truncated.`);
    }
    return this.bytes[this.offset++];
  }

  readVarUint32(label: string): number {
    let value = 0;
    for (let index = 0; index < 5; index += 1) {
      const byte = this.readByte(label);
      if (index === 4 && (byte & 0xf0) !== 0) {
        throw new Error(`Aidoku Wasm ${label} exceeds uint32.`);
      }
      value += (byte & 0x7f) * 2 ** (index * 7);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error(`Aidoku Wasm ${label} is invalid.`);
  }

  skipName(label: string): void {
    const byteLength = this.readVarUint32(`${label} length`);
    this.skip(byteLength, label);
  }

  skip(byteLength: number, label: string): void {
    if (
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0 ||
      this.offset + byteLength > this.end
    ) {
      throw new Error(`Aidoku Wasm ${label} is truncated.`);
    }
    this.offset += byteLength;
  }

  assertFinished(label: string): void {
    if (this.offset !== this.end) {
      throw new Error(`Aidoku Wasm ${label} has trailing data.`);
    }
  }
}

function encodeVarUint32(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("Aidoku Wasm contains an invalid uint32 value.");
  }
  const result: number[] = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    result.push(byte);
  } while (remaining > 0);
  return Uint8Array.from(result);
}

function readLimits(
  cursor: WasmCursor,
  label: string,
): { flags: number; minimum: number; maximum: number | null } {
  const flags = cursor.readVarUint32(`${label} flags`);
  // Only 32-bit, unshared MVP limits are accepted. This rejects shared memory,
  // memory64, custom page sizes, table64, and future representations until
  // they have an explicit resource policy here.
  if ((flags & ~0x01) !== 0) {
    throw new Error(`Aidoku Wasm ${label} uses unsupported limits.`);
  }
  const minimum = cursor.readVarUint32(`${label} minimum`);
  const maximum = (flags & 0x01) !== 0
    ? cursor.readVarUint32(`${label} maximum`)
    : null;
  if (maximum !== null && maximum < minimum) {
    throw new Error(`Aidoku Wasm ${label} maximum is below its minimum.`);
  }
  return { flags, minimum, maximum };
}

function inspectTable(cursor: WasmCursor, label: string): void {
  const referenceType = cursor.readByte(`${label} reference type`);
  if (referenceType !== 0x70) {
    throw new Error(`Aidoku Wasm ${label} uses an unsupported reference type.`);
  }
  const limits = readLimits(cursor, label);
  if (
    limits.maximum === null ||
    limits.minimum > MOBILE_AIDOKU_MAX_TABLE_ENTRIES ||
    limits.maximum > MOBILE_AIDOKU_MAX_TABLE_ENTRIES
  ) {
    throw new Error(
      `Aidoku Wasm ${label} exceeds the ${MOBILE_AIDOKU_MAX_TABLE_ENTRIES} entry safety limit.`,
    );
  }
}

function inspectImportSection(payload: Uint8Array): number {
  const cursor = new WasmCursor(payload);
  const count = cursor.readVarUint32("import count");
  let tableCount = 0;
  for (let index = 0; index < count; index += 1) {
    cursor.skipName("import module");
    cursor.skipName("import name");
    const kind = cursor.readByte("import kind");
    switch (kind) {
      case 0x00: // function
        cursor.readVarUint32("import function type");
        break;
      case 0x01: // table
        inspectTable(cursor, "import table");
        tableCount += 1;
        break;
      case 0x02: // memory
        readLimits(cursor, "import memory");
        throw new Error("Aidoku Wasm must define, not import, its linear memory.");
      case 0x03: // global
        cursor.readByte("import global value type");
        cursor.readByte("import global mutability");
        break;
      case 0x04: // tag
        cursor.readByte("import tag attribute");
        cursor.readVarUint32("import tag type");
        break;
      default:
        throw new Error("Aidoku Wasm contains an unsupported import kind.");
    }
  }
  cursor.assertFinished("import section");
  return tableCount;
}

function inspectTableSection(payload: Uint8Array): number {
  const cursor = new WasmCursor(payload);
  const count = cursor.readVarUint32("table count");
  if (count > MOBILE_AIDOKU_MAX_TABLES) {
    throw new Error(
      `Aidoku Wasm defines more than ${MOBILE_AIDOKU_MAX_TABLES} tables.`,
    );
  }
  for (let index = 0; index < count; index += 1) {
    inspectTable(cursor, "table");
  }
  cursor.assertFinished("table section");
  return count;
}

function inspectMemorySection(payload: Uint8Array): {
  initial: number;
  maximum: number | null;
} {
  const cursor = new WasmCursor(payload);
  const count = cursor.readVarUint32("memory count");
  if (count !== 1) {
    throw new Error("Aidoku Wasm must define exactly one linear memory.");
  }
  const limits = readLimits(cursor, "linear memory");
  cursor.assertFinished("memory section");
  if (limits.minimum > MOBILE_AIDOKU_MAX_LINEAR_MEMORY_PAGES) {
    throw new Error(
      `Aidoku Wasm initial memory exceeds the ${MOBILE_AIDOKU_MAX_LINEAR_MEMORY_BYTES} byte safety limit.`,
    );
  }
  return { initial: limits.minimum, maximum: limits.maximum };
}

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/**
 * Validates the non-preemptible parts of an untrusted Aidoku module before
 * compilation and injects a hard maximum into its single defined memory.
 * This bounds memory.grow, but deliberately does not claim to preempt CPU
 * loops; iOS still needs a process-isolated executor for that guarantee.
 */
export function prepareMobileAidokuWasm(
  bytes: Uint8Array,
): MobileAidokuPreparedWasm {
  if (bytes.byteLength < WASM_HEADER.byteLength) {
    throw new Error("Aidoku Wasm header is truncated.");
  }
  for (let index = 0; index < WASM_HEADER.byteLength; index += 1) {
    if (bytes[index] !== WASM_HEADER[index]) {
      throw new Error("Aidoku package does not contain a supported Wasm module.");
    }
  }

  const moduleCursor = new WasmCursor(bytes);
  moduleCursor.skip(WASM_HEADER.byteLength, "header");
  const chunks: Uint8Array[] = [bytes.subarray(0, WASM_HEADER.byteLength)];
  let foundMemory = false;
  let initialMemoryPages = 0;
  let declaredMaximum: number | null = null;
  let memoryMaximumRewritten = false;
  let tableCount = 0;
  let foundTableSection = false;

  while (moduleCursor.offset < bytes.byteLength) {
    const sectionId = moduleCursor.readByte("section ID");
    const sectionByteLength = moduleCursor.readVarUint32("section length");
    const payloadStart = moduleCursor.offset;
    moduleCursor.skip(sectionByteLength, "section payload");
    const payload = bytes.subarray(payloadStart, moduleCursor.offset);

    if (sectionId === WASM_START_SECTION) {
      throw new Error(
        "Aidoku Wasm automatic start sections are not allowed in the mobile runtime.",
      );
    }
    if (sectionId === WASM_IMPORT_SECTION) {
      tableCount += inspectImportSection(payload);
    }
    if (sectionId === WASM_TABLE_SECTION) {
      if (foundTableSection) {
        throw new Error("Aidoku Wasm contains duplicate table sections.");
      }
      foundTableSection = true;
      tableCount += inspectTableSection(payload);
    }
    if (tableCount > MOBILE_AIDOKU_MAX_TABLES) {
      throw new Error(
        `Aidoku Wasm contains more than ${MOBILE_AIDOKU_MAX_TABLES} tables.`,
      );
    }

    if (sectionId !== WASM_MEMORY_SECTION) {
      chunks.push(
        Uint8Array.of(sectionId),
        encodeVarUint32(payload.byteLength),
        payload,
      );
      continue;
    }

    if (foundMemory) {
      throw new Error("Aidoku Wasm contains duplicate memory sections.");
    }
    foundMemory = true;
    const memory = inspectMemorySection(payload);
    initialMemoryPages = memory.initial;
    declaredMaximum = memory.maximum;
    const safeMaximum = Math.min(
      memory.maximum ?? MOBILE_AIDOKU_MAX_LINEAR_MEMORY_PAGES,
      MOBILE_AIDOKU_MAX_LINEAR_MEMORY_PAGES,
    );
    memoryMaximumRewritten = memory.maximum !== safeMaximum;
    const safePayload = concatChunks([
      encodeVarUint32(1),
      encodeVarUint32(1),
      encodeVarUint32(memory.initial),
      encodeVarUint32(safeMaximum),
    ]);
    chunks.push(
      Uint8Array.of(sectionId),
      encodeVarUint32(safePayload.byteLength),
      safePayload,
    );
  }

  if (!foundMemory) {
    throw new Error("Aidoku Wasm does not define linear memory.");
  }

  const maximumMemoryPages = Math.min(
    declaredMaximum ?? MOBILE_AIDOKU_MAX_LINEAR_MEMORY_PAGES,
    MOBILE_AIDOKU_MAX_LINEAR_MEMORY_PAGES,
  );
  return {
    bytes: memoryMaximumRewritten ? concatChunks(chunks) : bytes,
    initialMemoryPages,
    maximumMemoryPages,
    memoryMaximumRewritten,
  };
}
