import { useEffect, useRef, useState } from "react";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  describeMobileJapaneseLearningPackRow,
  shouldStartMobileJapaneseLearningPackInstall,
} from "@/lib/mobileJapaneseLearningAnalysisPackState";
import {
  installMobileJapaneseLearningAnalysisPackNow,
  removeMobileJapaneseLearningAnalysisPackNow,
  useMobileJapaneseLearningAnalysisPackState,
} from "@/lib/mobileJapaneseLearningAnalysisPackStore";
import { normalizeMobileJapaneseLearningEnginePreference } from "@/lib/mobileJapaneseLearningEngine";
import { useMobileJapaneseLearningSignedIn } from "@/lib/mobileJapaneseLearningAuth";

/**
 * State and actions behind the on-device dictionary line: the row copy for
 * the current pack state, the localized action label, and the action runner.
 * Choosing On Device / Automatic starts the download right away. Shared by
 * `MobileJapaneseLearningDictionaryRow` and the reader's native (SwiftUI)
 * plugin sheet.
 */
export function useMobileJapaneseLearningDictionaryRowModel({
  engine,
  strings,
}: {
  engine: unknown;
  strings: MobileStrings;
}) {
  const packState = useMobileJapaneseLearningAnalysisPackState();
  const preference = normalizeMobileJapaneseLearningEnginePreference(engine);
  const previousPreferenceRef = useRef<typeof preference | null>(null);
  const [actionPending, setActionPending] = useState(false);

  // Choosing On Device / Automatic here starts the download right away.
  useEffect(() => {
    const previous = previousPreferenceRef.current;
    previousPreferenceRef.current = preference;
    if (
      shouldStartMobileJapaneseLearningPackInstall({
        previous,
        next: preference,
        state: packState,
      })
    ) {
      void installMobileJapaneseLearningAnalysisPackNow();
    }
    // Only a preference change may start an install, never a state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preference]);

  const signedIn = useMobileJapaneseLearningSignedIn();
  const row = describeMobileJapaneseLearningPackRow(packState, strings, preference, signedIn);
  const copy = strings.japaneseLearningDictionary;

  const runAction = async () => {
    if (!row?.action || actionPending) return;
    setActionPending(true);
    try {
      const ok =
        row.action === "remove"
          ? await removeMobileJapaneseLearningAnalysisPackNow()
          : await installMobileJapaneseLearningAnalysisPackNow();
      await (ok ? hapticConfirm() : hapticError());
    } finally {
      setActionPending(false);
    }
  };

  const actionLabel =
    row?.action === "remove"
      ? copy.remove
      : row?.action === "retry"
        ? copy.retry
        : row?.action === "download"
          ? copy.downloadNow
          : null;

  return {
    row,
    copy,
    failed: packState.kind === "failed",
    actionLabel,
    actionPending,
    runAction,
  };
}
