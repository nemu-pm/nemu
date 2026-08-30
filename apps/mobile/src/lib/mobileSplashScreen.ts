export type MobileSplashScreenState = {
  rootLaidOut: boolean;
  splashHidden: boolean;
};

export function shouldHideMobileSplashScreen({
  rootLaidOut,
  splashHidden,
}: MobileSplashScreenState): boolean {
  return rootLaidOut && !splashHidden;
}
