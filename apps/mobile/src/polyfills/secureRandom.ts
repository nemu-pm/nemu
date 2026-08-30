const webGetRandomValues =
  typeof globalThis.crypto?.getRandomValues === "function"
    ? globalThis.crypto.getRandomValues.bind(globalThis.crypto)
    : null;

export function fillSecureRandomBytes(bytes: Uint8Array): void {
  if (!webGetRandomValues) {
    throw new Error("A cryptographically secure random number generator is unavailable.");
  }
  webGetRandomValues(bytes);
}
