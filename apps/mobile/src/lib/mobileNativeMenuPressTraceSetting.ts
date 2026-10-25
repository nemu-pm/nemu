import { setNativeMenuPressTraceEnabled } from "../../modules/nemu-window-layout/src/ContextMenuPressTrace";

// TEST-ONLY (remove before release). Web and tests: nothing stored, off.
export function readMobileNativeMenuPressTraceStored(): boolean {
  return false;
}

export function writeMobileNativeMenuPressTraceStored(value: boolean): void {
  setNativeMenuPressTraceEnabled(value);
}
