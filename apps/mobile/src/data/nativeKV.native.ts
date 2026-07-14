import * as SecureStore from "expo-secure-store";
import type { NativeKVStore } from "./contracts";

export class SecureNativeKVStore implements NativeKVStore {
  async getString(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  }

  async setString(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  }

  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  }
}
