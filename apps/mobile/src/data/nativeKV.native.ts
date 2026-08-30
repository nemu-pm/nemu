import * as SecureStore from "expo-secure-store";
import type { NativeKVStore } from "./contracts";
import type { SecureNativeKVStoreOptions } from "./nativeKV";

export class SecureNativeKVStore implements NativeKVStore {
  private readonly options: SecureStore.SecureStoreOptions;

  constructor(options: SecureNativeKVStoreOptions = {}) {
    this.options = {
      ...(options.keychainService
        ? { keychainService: options.keychainService }
        : {}),
      ...(options.deviceOnly
        ? { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
        : {}),
    };
  }

  async getString(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key, this.options);
  }

  async setString(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value, this.options);
  }

  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key, this.options);
  }
}
