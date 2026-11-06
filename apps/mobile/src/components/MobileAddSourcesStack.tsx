import type { MobileAddSourcesStackProps } from "./MobileAddSourcesStack.types";

/** Android / web: Add Sources swaps its pages into its body, and a server's form is its own screen. */
export const mobileAddSourcesPushesPagesNatively = false;

/** iOS only: the sheet's native stack. */
export function MobileAddSourcesStack({ children }: MobileAddSourcesStackProps) {
  return <>{children}</>;
}
