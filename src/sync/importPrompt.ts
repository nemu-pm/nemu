export type ImportPromptInputs = {
  hasDecision: boolean;
  offeredThisSession: boolean;
  hasLocalLegacyLibrary: boolean;
  cloudProbeOk: boolean;
  cloudIsEmpty: boolean;
  localCanonicalEntryCount: number;
};

/**
 * Pure decision function for whether to offer "Import Local Library".
 *
 * NOTE: Keep this conservative:
 * - Never prompt if we can't confirm cloud emptiness (cloudProbeOk=false).
 * - Never prompt if the user already has any canonical entries locally.
 */
export function shouldOfferImportLocalLibraryPrompt(input: ImportPromptInputs): boolean {
  if (input.hasDecision) return false;
  if (input.offeredThisSession) return false;
  if (!input.hasLocalLegacyLibrary) return false;
  if (!input.cloudProbeOk) return false;
  if (!input.cloudIsEmpty) return false;
  if (input.localCanonicalEntryCount !== 0) return false;
  return true;
}


