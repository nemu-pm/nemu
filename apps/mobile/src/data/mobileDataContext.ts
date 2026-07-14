import { createContext, useContext } from "react";
import type { MobileDataStore } from "./storeTypes";

export type MobileDataContextValue = {
  store: MobileDataStore;
};

export const MobileDataContext = createContext<MobileDataContextValue | null>(null);

export function useMobileDataStore(): MobileDataStore {
  const context = useContext(MobileDataContext);
  if (!context) {
    throw new Error("MobileDataProvider missing from app root");
  }
  return context.store;
}
