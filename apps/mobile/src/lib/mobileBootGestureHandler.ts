import {
  MOBILE_PERFORMANCE_MARKS,
  markMobilePerformance,
} from "./mobilePerformance";

// app/_layout.tsx imports this first, in place of a bare
// `import "react-native-gesture-handler"`. RNGH requires react-native-worklets
// and react-native-reanimated at module scope, whose TurboModule install was
// the launch-blocking step under Worklets Bundle Mode (it waited for a second
// runtime to evaluate the whole bundle). The marks bracket that cost.
markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootGestureHandlerStart);
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("react-native-gesture-handler");
markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootGestureHandlerReady);
