import { createContext, useContext } from "react";
import type { MobileMangaDetailPaneRole } from "@/lib/mobileMangaDetailPaneLayout";

export type MobileMangaDetailPane = {
  /**
   * `leading`: the regular-width info pane; `trailing`: the chapter pane next
   * to it; `single`: the one-list page (compact, notebook, portrait inner).
   */
  role: MobileMangaDetailPaneRole;
  /** Regular width class (inner display, tablets), split or not. */
  regularWidth: boolean;
};

const SINGLE_COMPACT_PANE: MobileMangaDetailPane = { role: "single", regularWidth: false };
export const MobileMangaDetailPaneContext = createContext<MobileMangaDetailPane>(SINGLE_COMPACT_PANE);

/** Which pane of the detail layout a hero / chapter header renders in. */
export function useMobileMangaDetailPane(): MobileMangaDetailPane {
  return useContext(MobileMangaDetailPaneContext);
}
