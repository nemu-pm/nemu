export type NativeKVStore = {
  getString(key: string): Promise<string | null>;
  setString(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export type NativeBinaryCache = {
  getUri(key: string): Promise<string | null>;
  getBytes(key: string): Promise<Uint8Array | null>;
  setBytes(key: string, bytes: Uint8Array, contentType?: string): Promise<string>;
  remove(key: string): Promise<void>;
  clearAll(): Promise<void>;
};

export type MobileSourceRuntimeStatus =
  | "unchecked"
  | "package-missing"
  | "package-cached"
  | "native-compatible"
  | "requires-runtime-port"
  | "unsupported";

export type MobileSourceRuntimeProbe = {
  sourceKind: "aidoku" | "tachiyomi";
  status: MobileSourceRuntimeStatus;
  detail: string;
  packageUri?: string | null;
};
