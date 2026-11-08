import { File } from "expo-file-system";
import { defaultDatabaseDirectory } from "expo-sqlite";

/** A local database file with this name exists in expo-sqlite's directory. */
export function mobileDatabaseFileExists(databaseName: string): boolean {
  try {
    return new File(defaultDatabaseDirectory, databaseName).exists;
  } catch {
    return false;
  }
}
