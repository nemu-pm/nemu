// Base (web / bun test) variant: no launch-time database head start. Metro
// resolves `mobileDataBoot.native.ts` on iOS/Android.
import type { SQLiteDatabase } from "expo-sqlite";
import { migrateNativeDatabase } from "./nativeDatabase";

export function startMobileDataBoot(): void {}

export function migrateMobileDatabaseOnInit(db: SQLiteDatabase): Promise<void> {
  return migrateNativeDatabase(db);
}
