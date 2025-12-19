// json namespace - JSON parsing
import { GlobalStore } from "../global-store";

export function createJsonImports(store: GlobalStore) {
  return {
    parse: (dataPtr: number, dataLen: number): number => {
      if (dataLen <= 0) return -1;
      const data = store.readBytes(dataPtr, dataLen);
      if (!data) return -1;

      try {
        const text = new TextDecoder().decode(data);
        const json = JSON.parse(text);
        return store.storeStdValue(json);
      } catch {
        return -1;
      }
    },
  };
}

