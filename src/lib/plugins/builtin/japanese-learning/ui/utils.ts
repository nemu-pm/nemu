import type { GrammarToken } from '../ichiran-types'
import type { ReaderPluginContext } from '../../../types'
import { useTextDetectorStore } from '../store'
import { isJapaneseEnabled } from '../language'

/**
 * Serialize GrammarToken[] to a string for AI context.
 * Format similar to dictionary entries for clarity.
 */
export function serializeGrammarTokens(tokens: GrammarToken[]): string {
  return tokens
    .filter((tok) => !tok.isConjugation && !tok.isConjugationVia && !tok.isAlternative && !tok.isComponent)
    .map((tok) => {
      const parts: string[] = []
      // Word + reading
      if (tok.reading && tok.reading !== tok.word) {
        parts.push(`${tok.word}【${tok.reading}】`)
      } else {
        parts.push(tok.word)
      }
      // Part of speech
      if (tok.partOfSpeech) {
        parts.push(`(${tok.partOfSpeech})`)
      }
      // Meanings
      if (tok.meanings.length > 0) {
        const meanings = tok.meanings.map((m) => m.text).join('; ')
        parts.push(`= ${meanings}`)
      }
      // Conjugation info
      if (tok.conjugationTypes && tok.conjugationTypes.length > 0) {
        parts.push(`[${tok.conjugationTypes.join(' → ')}]`)
      }
      return parts.join(' ')
    })
    .join('\n')
}

/**
 * Check if plugin features should be enabled for the given context.
 * Returns true if enableForAllLanguages is true OR current chapter language is Japanese.
 */
export function isJapaneseSource(ctx: ReaderPluginContext): boolean {
  const { settings } = useTextDetectorStore.getState()
  return isJapaneseEnabled(ctx, settings.enableForAllLanguages)
}

