import { Stack } from "expo-router";
import {
  MOBILE_READER_ROUTE_NAME,
  MOBILE_READER_STACK_GESTURE_OPTIONS,
  MOBILE_STACK_EDGE_ONLY_GESTURE_OPTIONS,
} from "@/lib/mobileReaderRouteOptions";

export default function SourcesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Keep edge-swipe back, but don't let full-width pans (e.g. the reader
        // scrubber) compete with the interactive-pop gesture.
        ...MOBILE_STACK_EDGE_ONLY_GESTURE_OPTIONS,
      }}
    >
      {/* Declared statically: options set from inside the reader only reach
          the native screen after it has mounted, so the pop gesture would be
          live for the first frames of every chapter. */}
      <Stack.Screen
        name={MOBILE_READER_ROUTE_NAME}
        options={MOBILE_READER_STACK_GESTURE_OPTIONS}
      />
    </Stack>
  );
}
