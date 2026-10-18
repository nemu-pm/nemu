import { useLocalSearchParams } from "expo-router";
import { MobileExploreZoomRoute } from "@/components/explore/MobileExploreZoomRoute";
import { MangaDetailScreen } from "@/screens/MangaDetailScreen";

export default function LibraryMangaRoute() {
  const { zoom } = useLocalSearchParams<{ zoom?: string }>();
  // Design-explore: the page can grow out of the cover that opened it.
  return (
    <MobileExploreZoomRoute zoomId={zoom}>
      <MangaDetailScreen />
    </MobileExploreZoomRoute>
  );
}
