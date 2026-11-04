import { useCallback, useRef, useState } from "react";
import type { InstalledSource } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";
import { normalizeMobileSourceIconUri } from "@/lib/mobileSourceIconResolution";
import { MobileSourceQuickSettingsSheet } from "./MobileSourceQuickSettingsSheet";

/**
 * Opens the in-place source settings sheet from a screen that has no sheet
 * state of its own (the source page's options menu, the reader's error). The
 * returned `sheet` renders where the screen puts it; `onSourceChanged` runs
 * once after the sheet closes when a committed change touched the source, so
 * the screen reloads it with the new settings in force.
 */
export function useMobileSourceQuickSettings({
  strings,
  onSourceChanged,
}: {
  strings: MobileStrings;
  onSourceChanged?: () => void;
}) {
  const [source, setSource] = useState<InstalledSource | null>(null);
  const [visible, setVisible] = useState(false);
  const changedRef = useRef(false);

  const open = useCallback((next: InstalledSource) => {
    changedRef.current = false;
    setSource(next);
    setVisible(true);
  }, []);

  const sheet = source ? (
    <MobileSourceQuickSettingsSheet
      source={source}
      iconUri={normalizeMobileSourceIconUri(source.icon)}
      strings={strings}
      visible={visible}
      onClose={() => setVisible(false)}
      onDismiss={() => {
        setSource(null);
        if (!changedRef.current) return;
        changedRef.current = false;
        onSourceChanged?.();
      }}
      onSourceChanged={() => {
        changedRef.current = true;
      }}
    />
  ) : null;

  return { open, sheet };
}
