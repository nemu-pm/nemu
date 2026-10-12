import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { MobileExploreZoomRoute } from "@/components/explore/MobileExploreZoomRoute";
import { useMobileExploreZoomLanded } from "@/components/explore/mobileExploreZoomLanded";
import { ReaderScreen } from "@/screens/ReaderScreen";

export default function ReaderRoute() {
  const { zoom } = useLocalSearchParams<{ zoom?: string }>();
  // Design-explore: the reader grows out of the cover that opened it. No
  // swipe-to-dismiss: page turns own the reader's gestures.
  return (
    <MobileExploreZoomRoute zoomId={zoom} interactiveDismiss={false}>
      <ReaderAfterZoom />
    </MobileExploreZoomRoute>
  );
}

/**
 * The reader is far too heavy to mount in the commit a zoom pushes, so the
 * zoom opens onto the reader's own backdrop and the reader mounts when it has
 * landed. Outside a zoom this is the reader and nothing else.
 */
function ReaderAfterZoom() {
  const landed = useMobileExploreZoomLanded();
  return landed ? <ReaderScreen /> : <View style={styles.backdrop} />;
}

const styles = StyleSheet.create({
  // The reader's page background.
  backdrop: {
    flex: 1,
    backgroundColor: "#000000",
  },
});
