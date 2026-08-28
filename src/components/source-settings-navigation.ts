import type { PageSetting, Setting } from "@/lib/settings";

const MAX_SETTINGS_PAGE_DEPTH = 32;

function findAccessiblePage(
  settings: readonly Setting[],
  key: string,
): PageSetting | null {
  const matches: PageSetting[] = [];
  const visit = (items: readonly Setting[]) => {
    for (const setting of items) {
      if (setting.type === "page") {
        if (setting.key === key) matches.push(setting);
        // Nested pages are reachable only after their parent is in the path.
        continue;
      }
      if (setting.type === "group") visit(setting.items);
    }
  };
  visit(settings);
  // Duplicate accessible keys are ambiguous untrusted schema, so fail closed.
  return matches.length === 1 ? matches[0] : null;
}

/** Resolve a stable page-key path against the latest source schema. Returning
 * only the valid prefix lets the UI immediately retire removed/replaced pages
 * instead of keeping stale schema objects and stale action handlers alive. */
export function resolveSettingsPagePath(
  schema: readonly Setting[],
  path: readonly string[],
): PageSetting[] {
  const resolved: PageSetting[] = [];
  let scope = schema;
  for (const key of path.slice(0, MAX_SETTINGS_PAGE_DEPTH)) {
    const page = findAccessiblePage(scope, key);
    if (!page) break;
    resolved.push(page);
    scope = page.items;
  }
  return resolved;
}
