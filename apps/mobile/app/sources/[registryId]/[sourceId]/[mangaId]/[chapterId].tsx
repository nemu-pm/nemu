import { Stack } from "expo-router";
import { ReaderScreen } from "@/screens/ReaderScreen";

export default function ReaderRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          // The reader owns its own back affordance (chrome panel) and its
          // page pan/scrub gestures must not compete with the iOS
          // edge-swipe interactive-pop. Disable both the full-screen pan and
          // the edge-swipe back gesture while reading.
          fullScreenGestureEnabled: false,
          gestureEnabled: false,
        }}
      />
      <ReaderScreen />
    </>
  );
}