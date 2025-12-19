import { createContext } from "react";
import type { SyncContextValue } from "./types";

export const SyncContext = createContext<SyncContextValue | null>(null);

