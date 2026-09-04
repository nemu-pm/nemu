/**
 * Mobile dual-reader Root — mounts the orchestrator tree (SessionManager →
 * SecondaryPrefetcher → AutoAligner → ConfigSheet → DebugOverlay → Fab),
 * mirroring web's `DualReadReaderOverlay`
 * (`src/lib/plugins/builtin/dual-reader/components.tsx:3022`). Renders nothing
 * visual itself; the per-page `MobileDualReaderOverlay` is mounted separately
 * in the reader page frame (T5.2) and reads the same store singleton.
 *
 * The Skia renderer + byte fetcher are module singletons
 * (`getMobileDualReaderRenderer` / `fetchMobilePageBytes`), shared with the
 * per-page overlay — no prop-drilling needed.
 *
 * ConfigSheet / DebugOverlay / Fab (T4) and AutoAligner (T3.5) render into this
 * tree; the per-page overlay is mounted separately in the reader page frame.
 */
import { MobileDualReaderAutoAligner } from "./MobileDualReaderAutoAligner";
import type { MobileDualReaderContextValue } from "./MobileDualReaderContext";
import { MobileDualReaderContext } from "./MobileDualReaderContext";
import { MobileDualReaderConfigSheet } from "./MobileDualReaderConfigSheet";
import { MobileDualReaderDebugOverlay } from "./MobileDualReaderDebugOverlay";
import { MobileDualReaderFab } from "./MobileDualReaderFab";
import { MobileDualReaderSessionManager } from "./MobileDualReaderSessionManager";
import { MobileDualReaderSecondaryPrefetcher } from "./MobileDualReaderSecondaryPrefetcher";

export type MobileDualReaderRootProps = MobileDualReaderContextValue & {
  showFloatingControls: boolean;
};

export function MobileDualReaderRoot({
  showFloatingControls,
  ...props
}: MobileDualReaderRootProps) {
  return (
    <MobileDualReaderContext.Provider value={props}>
      <MobileDualReaderSessionManager />
      <MobileDualReaderSecondaryPrefetcher />
      <MobileDualReaderAutoAligner />
      <MobileDualReaderConfigSheet />
      {showFloatingControls ? (
        <>
          <MobileDualReaderDebugOverlay />
          <MobileDualReaderFab />
        </>
      ) : null}
    </MobileDualReaderContext.Provider>
  );
}
