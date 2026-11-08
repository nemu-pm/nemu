/** What sources call their login setting when the name only says "log in", in any case or language. */
const GENERIC_LOGIN_TITLES = new Set([
  "login",
  "logon",
  "signin",
  "ログイン",
  "サインイン",
  "登录",
  "登入",
  "登錄",
  "로그인",
]);

/**
 * The title of a source's login sheet and row. The setting's title is the
 * source's own text, often its key in capitals ("LOGIN"): one that only says
 * "log in" gives way to the app's localized `generic`, and other all-caps
 * Latin text is set in title case. Anything else (a sentence, Japanese) is
 * shown as the source wrote it.
 */
export function mobileSourceLoginTitle(title: string | null | undefined, generic: string): string {
  const trimmed = title?.trim() ?? "";
  if (!trimmed) return generic;
  if (GENERIC_LOGIN_TITLES.has(trimmed.toLowerCase().replace(/[\s_-]+/g, ""))) return generic;
  const shouting = /\p{Lu}.*\p{Lu}/u.test(trimmed) && !/\p{Ll}/u.test(trimmed);
  if (!shouting) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[\s_-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());
}
