// Base (non-native) KV store.
//
// Metro resolves `nativeKV.native.ts` on native (iOS/Android), which holds the
// real `expo-secure-store` `SecureNativeKVStore`. This base file is what bun's
// test runner and Expo web resolve
// instead — an in-memory stub with no `expo-secure-store`/`react-native`
// import, so it loads under bun. It is never the persistent store on native;
// on Expo web the app uses `mobileData.web.tsx` (`WebUserDataStore`), not this
// stub. Its key validation mirrors Expo SecureStore so native-only key bugs
// fail in unit tests. See `CONTRIBUTING.md` for the convention.

import type { NativeKVStore } from "./contracts";

export type SecureNativeKVStoreOptions = {
  keychainService?: string;
  deviceOnly?: boolean;
};

export class SecureNativeKVStore implements NativeKVStore {
  private readonly values = new Map<string, string>();

  constructor(options: SecureNativeKVStoreOptions = {}) {
    void options;
  }

  private assertValidKey(key: string): void {
    if (!key || !/^[A-Za-z0-9._-]+$/.test(key)) {
      throw new Error(
        'Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".',
      );
    }
  }

  async getString(key: string): Promise<string | null> {
    this.assertValidKey(key);
    return this.values.get(key) ?? null;
  }

  async setString(key: string, value: string): Promise<void> {
    this.assertValidKey(key);
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.assertValidKey(key);
    this.values.delete(key);
  }
}
