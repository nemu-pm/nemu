// TEST-ONLY (remove before release): the "Delay Facing Page (Test)" switch
// under Settings › Experimental Design, off by default. While on, the reader
// treats every page of a spread as not loaded until two seconds after that
// spread first becomes the current one, so a tester can watch a flat spread
// show its first page centred and then settle into the pair (slide + fade)
// without throttling the network. Presentation only: images load as usual.
let enabled = false;
const listeners = new Set<() => void>();

export const MOBILE_READER_SPREAD_LOAD_DELAY_TEST_LABEL = "Delay Facing Page (Test)";

export function isMobileReaderSpreadLoadDelayTestEnabled(): boolean {
  return enabled;
}

export function setMobileReaderSpreadLoadDelayTestEnabled(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  listeners.forEach((listener) => listener());
}

export function subscribeMobileReaderSpreadLoadDelayTest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
