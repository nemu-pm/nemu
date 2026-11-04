import { useEffect, useState } from "react";
import { MobileSheetScaffold, useNemuTheme } from "@/design-system";
import { MobileCloudSyncCard } from "@/components/MobileCloudSyncCard";
import { useMobileJapaneseLearningSignedIn } from "@/lib/mobileJapaneseLearningAuth";
import type { MobileStrings } from "@/lib/mobileI18n";

interface JapaneseLearningSignInSheetProps {
  visible: boolean;
  strings: MobileStrings;
  onClose: () => void;
}

/**
 * Web `AuthGateDialog` (`requireAuthOrPrompt` → `SignInDialog`) for Nemu
 * Chat: the app's own sign-in UI (the Settings Cloud Sync card) in a sheet
 * over the reader, presented instead of the chat while signed out. It closes
 * itself once a session exists; the chat is not opened afterwards, as on web.
 */
export function JapaneseLearningSignInSheet({
  visible,
  strings,
  onClose,
}: JapaneseLearningSignInSheetProps) {
  const { tokens } = useNemuTheme();
  const signedIn = useMobileJapaneseLearningSignedIn();
  // The card (and its session and sync queries) lives only while the sheet is
  // up or leaving, not for every surface that can host this sheet.
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (visible && signedIn) onClose();
  }, [onClose, signedIn, visible]);

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={onClose}
      backgroundColor={tokens.card}
      backdropOnPress={onClose}
      onDismiss={() => setMounted(false)}
      dismissLabel={strings.common.cancel}
      frameMaxHeight="auto"
    >
      {mounted ? <MobileCloudSyncCard /> : null}
    </MobileSheetScaffold>
  );
}
