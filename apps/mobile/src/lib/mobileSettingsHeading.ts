/**
 * A settings card heading that only says the page's own title again ("Reader"
 * as the first card's heading on the Reader page). Compared loosely: case,
 * spacing and a trailing "settings" do not make it say something new.
 */
const norm = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/\s+/g, "")
    .replace(/(settings|設定|设置)$/u, "");

export function isMobileSettingsHeadingRepeat(title: string, pageTitle: string | null | undefined): boolean {
  if (!pageTitle) return false;
  return norm(title) === norm(pageTitle);
}

/**
 * A group heading that says only "Settings" inside a settings page (a
 * source's own "SETTINGS" group under its settings sheet): it names nothing,
 * so the group goes without a heading.
 */
export function isMobileSettingsHeadingEmpty(title: string | null | undefined): boolean {
  return typeof title === "string" && title.trim().length > 0 && norm(title) === "";
}
