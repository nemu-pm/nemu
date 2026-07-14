import { formatMobileString } from "./mobileI18n";

export type MobileMangaCardAccessibilityInput = {
  openTemplate: string;
  title: string;
  subtitle?: string;
  badge?: string;
};

export function formatMobileMangaCardAccessibilityLabel({
  openTemplate,
  title,
  subtitle,
  badge,
}: MobileMangaCardAccessibilityInput): string {
  return [
    formatMobileString(openTemplate, { title }),
    subtitle?.trim(),
    badge?.trim(),
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}
