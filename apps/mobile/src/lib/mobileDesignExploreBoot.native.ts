import { Platform } from "react-native";
import { bootMobileDesignExplore } from "./mobileDesignExploreSwitch";

// The design is the only one on iOS (the old "New design (preview)" switch and
// its stored file are gone; a stored choice from an older build is ignored).
// Android keeps its own layout.
export const mobileDesignExploreBooted = bootMobileDesignExplore(Platform.OS === "ios");
