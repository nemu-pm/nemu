import "./src/polyfills/bigInt";
// The pinned non-Intl Android JSC exposes String#normalize but crashes inside
// its missing ICU data. Replace it before Expo/router or any URL code loads.
import "./src/polyfills/stringNormalize";
import "./src/polyfills/weakRef";
import "./src/polyfills/base64";
import "./src/polyfills/textEncoding";
import "./src/polyfills/crypto";
import "./src/lib/mobilePerformanceEntry";
// A cold OS-launched background task loads this entry bundle without mounting
// the Expo Router tree. Import the platform module here so TaskManager's
// module-scope defineTask call runs before the native executor looks it up.
// Web resolves the no-op base module; native resolves the real `.native` file.
import "./src/sync/mobileBackgroundSync";

import "expo-router/entry";
