import { File, Paths } from "expo-file-system";
import { setNativeMenuPressTraceEnabled } from "../../modules/nemu-window-layout/src/ContextMenuPressTrace";

// TEST-ONLY (remove before release): the "Long-Press Trace (Test)" switch,
// device-local and off by default. Read synchronously when the bundle loads
// so a trace can cover the first long press after launch.
const FILE_NAME = "nemu-longpress-trace-test-v1.json";

export function readMobileNativeMenuPressTraceStored(): boolean {
  try {
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) return false;
    return (JSON.parse(file.textSync()) as { enabled?: unknown } | null)?.enabled === true;
  } catch {
    return false;
  }
}

export function writeMobileNativeMenuPressTraceStored(value: boolean): void {
  try {
    new File(Paths.document, FILE_NAME).writeSync(JSON.stringify({ enabled: value }));
  } catch {
    // Not stored: the switch still applies to this run.
  }
  setNativeMenuPressTraceEnabled(value);
}

setNativeMenuPressTraceEnabled(readMobileNativeMenuPressTraceStored());
