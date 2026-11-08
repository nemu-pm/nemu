import { useState } from "react";
import {
  mobileReaderHexColor,
  mobileReaderPageBackgroundColor,
  type MobileReaderPageBackground,
} from "@/lib/mobileReaderPageBackground";

/**
 * The reader's page background. Under "Match Page" a page whose border is
 * not measured yet keeps the last known page's colour (never black, never
 * the default), until its own arrives.
 */
export function useMobileReaderMatchBackground(
  background: MobileReaderPageBackground,
  pageEdgeColor: string | null | undefined,
): string {
  const [lastKnown, setLastKnown] = useState<string | null>(null);
  const known = background === "page" ? mobileReaderHexColor(pageEdgeColor) : null;
  if (known && known !== lastKnown) setLastKnown(known);
  return mobileReaderPageBackgroundColor(background, known, lastKnown);
}
