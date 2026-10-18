import { Platform } from "react-native";
import { resolveNemuSheetMetrics } from "./sheetMetrics";

/** Sheet metrics for the running platform (see `sheetMetrics.ts`). */
export const nemuSheetMetrics = resolveNemuSheetMetrics(Platform.OS);
