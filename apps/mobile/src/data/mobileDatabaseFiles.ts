// Base (non-native) database file probe.
//
// Metro resolves `mobileDatabaseFiles.native.ts` on iOS/Android, which looks
// in expo-sqlite's database directory. This base file is what bun's test
// runner and Expo web resolve: no database files, with no `expo-sqlite` or
// `expo-file-system` import. See `CONTRIBUTING.md` for the convention.

/** A local database file with this name exists on the device. */
export function mobileDatabaseFileExists(_databaseName: string): boolean {
  return false;
}
