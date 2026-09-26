// Base (non-native) device-wide welcome-completion marker.
//
// Metro resolves `mobileWelcomeDeviceCompletion.native.ts` on iOS/Android,
// which persists the marker as a file in the app's document directory. This
// base file is what bun's test runner and Expo web resolve: an in-memory flag
// with no `expo-file-system` import. See `CONTRIBUTING.md` for the convention.
//
// Why a device marker at all: `mobileWelcomeCompleted` lives in each data
// profile's settings, and signing in (or out) switches to a different profile
// database. The account profile never saw the wizard, so the wizard re-opened
// right after sign-in on a device that had long finished onboarding.

let completed = false;

export async function readMobileWelcomeDeviceCompleted(): Promise<boolean> {
  return completed;
}

export async function markMobileWelcomeDeviceCompleted(): Promise<void> {
  completed = true;
}

export async function clearMobileWelcomeDeviceCompleted(): Promise<void> {
  completed = false;
}
