import { useEffect } from "react";
import { useMobileFeedbackSettings } from "@/data/mobileHooks";
import { setHapticsFeedbackEnabled } from "@/lib/mobileHapticsGate";

/**
 * Pushes the persisted haptics master switch into the module-level gate the
 * haptics wrappers consult. Mounted once at the app root.
 */
export function MobileFeedbackSettingsBridge() {
  const { hapticsFeedbackEnabled } = useMobileFeedbackSettings();

  useEffect(() => {
    setHapticsFeedbackEnabled(hapticsFeedbackEnabled);
  }, [hapticsFeedbackEnabled]);

  return null;
}
