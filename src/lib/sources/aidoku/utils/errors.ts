// Error handling utilities for Aidoku runtime

/**
 * Base error class for Aidoku errors
 */
export class AidokuError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = "AidokuError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends AidokuError {
  statusCode?: number;
  url?: string;

  constructor(message: string, statusCode?: number, url?: string) {
    super(message, "NETWORK_ERROR", { statusCode, url });
    this.name = "NetworkError";
    this.statusCode = statusCode;
    this.url = url;
  }
}

/**
 * WASM runtime errors
 */
export class WasmError extends AidokuError {
  wasmError?: string;

  constructor(message: string, wasmError?: string) {
    super(message, "WASM_ERROR", { wasmError });
    this.name = "WasmError";
    this.wasmError = wasmError;
  }
}

/**
 * Parsing errors (HTML, JSON, postcard)
 */
export class ParseError extends AidokuError {
  input?: string;

  constructor(message: string, input?: string) {
    super(message, "PARSE_ERROR", { input: input?.slice(0, 100) });
    this.name = "ParseError";
    this.input = input;
  }
}

/**
 * Source-related errors
 */
export class SourceError extends AidokuError {
  sourceId?: string;

  constructor(message: string, sourceId?: string) {
    super(message, "SOURCE_ERROR", { sourceId });
    this.name = "SourceError";
    this.sourceId = sourceId;
  }
}

/**
 * Error codes for WASM host functions
 */
export const ErrorCodes = {
  SUCCESS: 0,
  UNKNOWN_ERROR: -1,
  INVALID_DESCRIPTOR: -2,
  MISSING_DATA: -3,
  INVALID_URL: -4,
  PARSE_ERROR: -5,
  INVALID_BUFFER_SIZE: -6,
  MISSING_DATA_RESPONSE: -7,
  MISSING_RESPONSE: -8,
  MISSING_URL: -9,
  REQUEST_ERROR: -10,
  INVALID_METHOD: -11,
  NOT_AN_IMAGE: -12,
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Get error message for an error code
 */
export function getErrorMessage(code: ErrorCode): string {
  switch (code) {
    case ErrorCodes.SUCCESS:
      return "Success";
    case ErrorCodes.UNKNOWN_ERROR:
      return "Unknown error";
    case ErrorCodes.INVALID_DESCRIPTOR:
      return "Invalid descriptor";
    case ErrorCodes.MISSING_DATA:
      return "Missing data";
    case ErrorCodes.INVALID_URL:
      return "Invalid URL";
    case ErrorCodes.PARSE_ERROR:
      return "Parse error";
    case ErrorCodes.INVALID_BUFFER_SIZE:
      return "Invalid buffer size";
    case ErrorCodes.MISSING_DATA_RESPONSE:
      return "Missing data in response";
    case ErrorCodes.MISSING_RESPONSE:
      return "Missing response";
    case ErrorCodes.MISSING_URL:
      return "Missing URL";
    case ErrorCodes.REQUEST_ERROR:
      return "Request error";
    case ErrorCodes.INVALID_METHOD:
      return "Invalid method";
    case ErrorCodes.NOT_AN_IMAGE:
      return "Not an image";
    default:
      return `Error code: ${code}`;
  }
}

/**
 * Safely execute a function and return a Result
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function tryCatch<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Format error for display
 */
export function formatError(error: unknown): string {
  if (error instanceof AidokuError) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Check if an error is of a specific type
 */
export function isAidokuError(error: unknown): error is AidokuError {
  return error instanceof AidokuError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isWasmError(error: unknown): error is WasmError {
  return error instanceof WasmError;
}

export function isParseError(error: unknown): error is ParseError {
  return error instanceof ParseError;
}

export function isSourceError(error: unknown): error is SourceError {
  return error instanceof SourceError;
}

/**
 * Extract useful information from an error
 */
export function extractErrorInfo(error: unknown): {
  message: string;
  code?: string;
  stack?: string;
  details?: unknown;
} {
  if (error instanceof AidokuError) {
    return {
      message: error.message,
      code: error.code,
      stack: error.stack,
      details: error.details,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
}
