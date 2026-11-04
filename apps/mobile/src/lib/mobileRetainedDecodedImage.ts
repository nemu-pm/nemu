/**
 * Keeps a reader page's decoded bitmap for a reopen (iOS only, see
 * mobileRetainedDecodedImage.ios.ts). Elsewhere nothing is kept.
 */
export function retainMobileDecodedReaderImage(_uri: string): void {}
