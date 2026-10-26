// TEST-ONLY (remove before release). Web and tests: nothing stored, off.
import { setMobileReaderSpreadLoadDelayTestEnabled } from "./mobileReaderSpreadLoadDelayTestStore";

export {
  MOBILE_READER_SPREAD_LOAD_DELAY_TEST_LABEL,
  isMobileReaderSpreadLoadDelayTestEnabled,
  subscribeMobileReaderSpreadLoadDelayTest,
} from "./mobileReaderSpreadLoadDelayTestStore";

export function writeMobileReaderSpreadLoadDelayTestStored(value: boolean): void {
  setMobileReaderSpreadLoadDelayTestEnabled(value);
}
