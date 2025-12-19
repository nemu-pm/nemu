// Retry utilities with exponential backoff

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Whether to add jitter to delays (default: true) */
  jitter?: boolean;
  /** Function to determine if error is retryable (default: always retry) */
  isRetryable?: (error: unknown) => boolean;
  /** Callback for retry attempts */
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: () => true,
  onRetry: () => {},
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number,
  jitter: boolean
): number {
  let delay = initialDelay * Math.pow(backoffMultiplier, attempt);
  delay = Math.min(delay, maxDelay);

  if (jitter) {
    // Add random jitter between 0 and 50% of delay
    delay = delay * (1 + Math.random() * 0.5);
  }

  return Math.floor(delay);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt >= opts.maxRetries || !opts.isRetryable(error)) {
        throw error;
      }

      // Calculate delay
      const delay = calculateDelay(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffMultiplier,
        opts.jitter
      );

      // Call retry callback
      opts.onRetry(attempt + 1, error, delay);

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Retry with timeout
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  options: RetryOptions = {}
): Promise<T> {
  return Promise.race([
    retry(fn, options),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Operation timed out")), timeoutMs)
    ),
  ]);
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("failed to fetch") ||
      message.includes("net::") ||
      message.includes("connection")
    );
  }
  return false;
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("timeout") || message.includes("timed out");
  }
  return false;
}

/**
 * Check if an HTTP status code is retryable
 */
export function isRetryableStatus(status: number): boolean {
  // Retry on 5xx errors and rate limits
  return status >= 500 || status === 429 || status === 408;
}

/**
 * Create a retryable fetch function
 */
export function createRetryableFetch(options: RetryOptions = {}) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return retry(
      async () => {
        const response = await fetch(input, init);

        // Throw if status is retryable
        if (isRetryableStatus(response.status)) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      },
      {
        ...options,
        isRetryable: (error) => {
          if (isNetworkError(error) || isTimeoutError(error)) {
            return true;
          }
          if (error instanceof Error && error.message.startsWith("HTTP")) {
            return true;
          }
          return options.isRetryable?.(error) ?? true;
        },
      }
    );
  };
}
