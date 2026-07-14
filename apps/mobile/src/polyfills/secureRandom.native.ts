import { getRandomValues as getExpoRandomValues } from "expo-crypto";

export function fillSecureRandomBytes(bytes: Uint8Array): void {
  getExpoRandomValues(bytes);
}
