import { Stack } from "expo-router";
import {
  MOBILE_READER_ROUTE_NAME,
  MOBILE_READER_STACK_GESTURE_OPTIONS,
  MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS,
} from "@/lib/mobileReaderRouteOptions";

export default function SourcesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Full-screen back swipe on manga detail like everywhere else; the
        // reader route below is the only screen without a pop gesture.
        ...MOBILE_STACK_FULL_SCREEN_GESTURE_OPTIONS,
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
