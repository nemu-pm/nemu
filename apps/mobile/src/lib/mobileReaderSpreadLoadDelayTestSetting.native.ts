import { File, Paths } from "expo-file-system";
import { setMobileReaderSpreadLoadDelayTestEnabled } from "./mobileReaderSpreadLoadDelayTestStore";

export {
  MOBILE_READER_SPREAD_LOAD_DELAY_TEST_LABEL,
  isMobileReaderSpreadLoadDelayTestEnabled,
  subscribeMobileReaderSpreadLoadDelayTest,
} from "./mobileReaderSpreadLoadDelayTestStore";

// TEST-ONLY (remove before release): the "Delay Facing Page (Test)" switch,
// device-local and off by default, read when the bundle loads.
const FILE_NAME = "nemu-spread-load-delay-test-v1.json";

function readMobileReaderSpreadLoadDelayTestStored(): boolean {
  try {
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) return false;
    return (JSON.parse(file.textSync()) as { enabled?: unknown } | null)?.enabled === true;
  } catch {
    return false;
  }
}

export function writeMobileReaderSpreadLoadDelayTestStored(value: boolean): void {
  try {
    new File(Paths.document, FILE_NAME).writeSync(JSON.stringify({ enabled: value }));
  } catch {
    // Not stored: the switch still applies to this run.
  }
  setMobileReaderSpreadLoadDelayTestEnabled(value);
}

setMobileReaderSpreadLoadDelayTestEnabled(readMobileReaderSpreadLoadDelayTestStored());
