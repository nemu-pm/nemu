import type { ReaderPluginContext } from '../../types'

export function isJapaneseLangCode(lang: string | null | undefined): boolean {
  if (!lang) return false
  return lang === 'ja' || lang.startsWith('ja-')
}

/**
 * Strict fallback for sources that are explicitly Japanese-only.
 * This avoids the old bug where any source that *supports* Japanese would enable JP-only features globally.
 */
export function isJapaneseOnlySource(sourceLanguages: string[] | null | undefined): boolean {
  if (!sourceLanguages || sourceLanguages.length !== 1) return false
  return isJapaneseLangCode(sourceLanguages[0])
}

/** Plugin enabled if enableForAllLanguages OR chapter language is Japanese OR source is Japanese-only. */
export function isJapaneseEnabled(ctx: ReaderPluginContext, enableForAllLanguages: boolean): boolean {
  if (enableForAllLanguages) return true
  return isJapaneseLangCode(ctx.chapterLanguage) || isJapaneseOnlySource(ctx.sourceLanguages)
}

/** True if the chapter should be treated as Japanese (ignores enableForAllLanguages, but includes JP-only source fallback). */
export function isJapaneseChapter(ctx: ReaderPluginContext): boolean {
  return isJapaneseLangCode(ctx.chapterLanguage) || isJapaneseOnlySource(ctx.sourceLanguages)
}


