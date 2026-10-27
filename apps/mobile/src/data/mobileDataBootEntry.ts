import { startMobileDataBoot } from "./mobileDataBoot";

// Imported by the JS entry (index.ts): start the profile keychain reads and
// the database open + migration before the router tree renders.
startMobileDataBoot();
