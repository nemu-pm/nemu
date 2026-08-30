// Base (non-native) haptics implementation.
//
// Metro resolves `haptics.native.ts` on native (iOS/Android), which holds the
// real `expo-haptics` implementation. This base file is what bun's test runner
// and Expo web resolve instead — it has no `expo-haptics`/`react-native`
// import, so it loads under bun (the RN `.js.flow` `typeof` imports otherwise
// crash the runner). Haptics are enhancement-only, so no-op stubs here are
// safe: nothing asserts a vibration occurred, and the native path is
// byte-for-byte unchanged. See `CONTRIBUTING.md` for the convention.

async function runHaptic(_action: () => Promise<void>) {
  void _action;
}

export async function hapticSelection() {
  await runHaptic(async () => {});
}

export async function hapticPress() {
  await runHaptic(async () => {});
}

export async function hapticConfirm() {
  await runHaptic(async () => {});
}

export async function hapticError() {
  await runHaptic(async () => {});
}

export async function hapticWarning() {
  await runHaptic(async () => {});
}
