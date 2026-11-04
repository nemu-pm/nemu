import { bootMobileDesignExplore } from "./mobileDesignExploreSwitch";

// Web and other non-native targets: never the prototype, nothing stored.
export const mobileDesignExploreBooted = bootMobileDesignExplore(false);

export function readMobileDesignExploreStored(): boolean | null {
  return null;
}

export function writeMobileDesignExploreStored(value: boolean): void {
  void value;
}
