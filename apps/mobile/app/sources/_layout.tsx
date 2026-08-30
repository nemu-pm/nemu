import { Stack } from "expo-router";

export default function SourcesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Keep edge-swipe back, but don't let full-width pans (e.g. the reader
        // scrubber) compete with the interactive-pop gesture.
        fullScreenGestureEnabled: false,
        gestureEnabled: true,
      }}
    />
  );
}
