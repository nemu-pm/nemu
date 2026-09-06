import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { MOBILE_MANGA_STATUS_OPTIONS } from "@/lib/mobileMetadataOverrides";

/**
 * The metadata editor's publication-status selector is a row of pill chips —
 * the same `MobileChip` primitive the Search tab's filter row uses — so the
 * chip copy, ordering and selection live here as plain data instead of inside
 * the sheet's JSX.
 */
export type MobileMetadataStatusChipModel = {
  value: number;
  label: string;
  accessibilityLabel: string;
  selected: boolean;
};

export function getMobileMetadataStatusLabel(
  status: number,
  strings: MobileStrings,
): string {
  switch (status) {
    case 1:
      return strings.metadataEditor.statusOngoing;
    case 2:
      return strings.metadataEditor.statusCompleted;
    case 3:
      return strings.metadataEditor.statusCancelled;
    case 4:
      return strings.metadataEditor.statusHiatus;
    default:
      return strings.metadataEditor.statusUnknown;
  }
}

/**
 * Chips stay in `MOBILE_MANGA_STATUS_OPTIONS` order — unknown first, because
 * that is the value a reset returns to — and exactly one of them is selected
 * for any status the form can hold (an unrecognised value falls back to the
 * unknown chip, which is what `getMobileMetadataStatusLabel` names it).
 */
export function getMobileMetadataStatusChipModels({
  status,
  strings,
}: {
  status: number;
  strings: MobileStrings;
}): MobileMetadataStatusChipModel[] {
  return MOBILE_MANGA_STATUS_OPTIONS.map((option) => {
    const label = getMobileMetadataStatusLabel(option.value, strings);
    return {
      value: option.value,
      label,
      accessibilityLabel: formatMobileString(
        strings.metadataEditor.selectStatus,
        { status: label },
      ),
      selected: status === option.value,
    };
  });
}
