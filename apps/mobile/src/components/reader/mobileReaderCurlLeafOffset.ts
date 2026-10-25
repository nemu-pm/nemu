import { createContext } from "react";

/**
 * Where a curl leaf really sits, less where React lays it out: the native
 * page controller moves each leaf into the curl's frame (a spread's right
 * page past the spine), which React's own layout (every leaf at the pager's
 * origin) never sees. A page measured inside a leaf adds this to be where it
 * shows on screen. Null outside the curl.
 */
export const MobileReaderCurlLeafOffsetContext = createContext<{ x: number; y: number } | null>(null);
