import { useLocalSearchParams } from "expo-router";
import { LibraryScreen } from "@/screens/LibraryScreen";

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function CollectionLibraryScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  return <LibraryScreen collectionId={firstParam(params.id)} mode="collection" />;
}
