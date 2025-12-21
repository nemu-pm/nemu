// Grammar analysis utilities - converts ichiran tokens to displayable GrammarTokens

import type { GrammarToken, IchiranToken, WordInfoWithGloss, ConjugationInfo } from './ichiran-types'

// Part of Speech constants and labels
export const PartOfSpeech = {
  ADJ_I: 'adj-i',
  ADJ_IX: 'adj-ix',
  ADJ_NA: 'adj-na',
  ADJ_NO: 'adj-no',
  ADJ_PN: 'adj-pn',
  ADJ_T: 'adj-t',
  ADJ_F: 'adj-f',
  ADV: 'adv',
  ADV_TO: 'adv-to',
  AUX_V: 'aux-v',
  AUX_ADJ: 'aux-adj',
  CONJ: 'conj',
  COP: 'cop',
  COP_DA: 'cop-da',
  CTR: 'ctr',
  EXP: 'exp',
  INT: 'int',
  N: 'n',
  N_ADV: 'n-adv',
  N_SUF: 'n-suf',
  N_PREF: 'n-pref',
  N_T: 'n-t',
  NUM: 'num',
  PN: 'pn',
  PRT: 'prt',
  PREF: 'pref',
  SUF: 'suf',
  V1: 'v1',
  V1_S: 'v1-s',
  V5ARU: 'v5aru',
  V5B: 'v5b',
  V5G: 'v5g',
  V5K: 'v5k',
  V5K_S: 'v5k-s',
  V5M: 'v5m',
  V5N: 'v5n',
  V5R: 'v5r',
  V5R_I: 'v5r-i',
  V5S: 'v5s',
  V5T: 'v5t',
  V5U: 'v5u',
  V5U_S: 'v5u-s',
  VK: 'vk',
  VS: 'vs',
  VS_I: 'vs-i',
  VS_S: 'vs-s',
  VT: 'vt',
  VI: 'vi',
  VZ: 'vz',
  V5URU: 'v5uru',
  ON_MIM: 'on-mim',
  UNC: 'unc',
  PUNCTUATION: 'punctuation',
} as const

export type PartOfSpeechType = typeof PartOfSpeech[keyof typeof PartOfSpeech]

export const PartOfSpeechLabels: Record<PartOfSpeechType, string> = {
  [PartOfSpeech.ADJ_I]: 'I-Adjective',
  [PartOfSpeech.ADJ_IX]: 'I-Adjective (Archaic)',
  [PartOfSpeech.ADJ_NA]: 'Na-Adjective',
  [PartOfSpeech.ADJ_NO]: 'No-Adjective',
  [PartOfSpeech.ADJ_PN]: 'Pre-noun Adjective',
  [PartOfSpeech.ADJ_T]: 'Taru-Adjective',
  [PartOfSpeech.ADJ_F]: 'Prenominal',
  [PartOfSpeech.ADV]: 'Adverb',
  [PartOfSpeech.ADV_TO]: 'To-Adverb',
  [PartOfSpeech.AUX_V]: 'Auxiliary Verb',
  [PartOfSpeech.AUX_ADJ]: 'Auxiliary Adjective',
  [PartOfSpeech.CONJ]: 'Conjunction',
  [PartOfSpeech.COP]: 'Copula',
  [PartOfSpeech.COP_DA]: 'Copula (だ)',
  [PartOfSpeech.CTR]: 'Counter',
  [PartOfSpeech.EXP]: 'Expression',
  [PartOfSpeech.INT]: 'Interjection',
  [PartOfSpeech.N]: 'Noun',
  [PartOfSpeech.N_ADV]: 'Adverbial Noun',
  [PartOfSpeech.N_SUF]: 'Noun Suffix',
  [PartOfSpeech.N_PREF]: 'Noun Prefix',
  [PartOfSpeech.N_T]: 'Temporal Noun',
  [PartOfSpeech.NUM]: 'Number',
  [PartOfSpeech.PN]: 'Pronoun',
  [PartOfSpeech.PRT]: 'Particle',
  [PartOfSpeech.PREF]: 'Prefix',
  [PartOfSpeech.SUF]: 'Suffix',
  [PartOfSpeech.V1]: 'Ichidan Verb (-ru)',
  [PartOfSpeech.V1_S]: 'Ichidan Verb (-ru Special)',
  [PartOfSpeech.V5ARU]: 'Godan Verb (-aru)',
  [PartOfSpeech.V5B]: 'Godan Verb (-bu)',
  [PartOfSpeech.V5G]: 'Godan Verb (-gu)',
  [PartOfSpeech.V5K]: 'Godan Verb (-ku)',
  [PartOfSpeech.V5K_S]: 'Godan Verb (-ku Special)',
  [PartOfSpeech.V5M]: 'Godan Verb (-mu)',
  [PartOfSpeech.V5N]: 'Godan Verb (-nu)',
  [PartOfSpeech.V5R]: 'Godan Verb (-ru)',
  [PartOfSpeech.V5R_I]: 'Godan Verb (-ru Irregular)',
  [PartOfSpeech.V5S]: 'Godan Verb (-su)',
  [PartOfSpeech.V5T]: 'Godan Verb (-tsu)',
  [PartOfSpeech.V5U]: 'Godan Verb (-u)',
  [PartOfSpeech.V5U_S]: 'Godan Verb (-u Special)',
  [PartOfSpeech.VK]: 'Kuru Verb',
  [PartOfSpeech.VS]: 'Suru Verb',
  [PartOfSpeech.VS_I]: 'Suru Verb (Included)',
  [PartOfSpeech.VS_S]: 'Suru Verb (Special)',
  [PartOfSpeech.VT]: 'Transitive Verb',
  [PartOfSpeech.VI]: 'Intransitive Verb',
  [PartOfSpeech.VZ]: 'Zuru Verb',
  [PartOfSpeech.V5URU]: 'Godan Verb (-uru)',
  [PartOfSpeech.ON_MIM]: 'Onomatopoeia',
  [PartOfSpeech.UNC]: 'Unclassified',
  [PartOfSpeech.PUNCTUATION]: 'Punctuation',
}

export const PartOfSpeechCategory = {
  ADJECTIVE: 'adjective',
  ADVERB: 'adverb',
  AUXILIARY: 'auxiliary',
  CONJUNCTION: 'conjunction',
  COPULA: 'copula',
  COUNTER: 'counter',
  EXPRESSION: 'expression',
  INTERJECTION: 'interjection',
  NOUN: 'noun',
  NUMERIC: 'numeric',
  PRONOUN: 'pronoun',
  PARTICLE: 'particle',
  PREFIX_SUFFIX: 'prefix-suffix',
  VERB: 'verb',
  UNKNOWN: 'unknown',
  OTHER: 'other',
  PUNCTUATION: 'punctuation',
} as const

export type PartOfSpeechCategoryType = typeof PartOfSpeechCategory[keyof typeof PartOfSpeechCategory]

export const PartOfSpeechCategoryMap: Record<PartOfSpeechType, PartOfSpeechCategoryType> = {
  [PartOfSpeech.ADJ_I]: PartOfSpeechCategory.ADJECTIVE,
  [PartOfSpeech.ADJ_IX]: PartOfSpeechCategory.ADJECTIVE,
  [PartOfSpeech.ADJ_NA]: PartOfSpeechCategory.ADJECTIVE,
  [PartOfSpeech.ADJ_NO]: PartOfSpeechCategory.ADJECTIVE,
  [PartOfSpeech.ADJ_PN]: PartOfSpeechCategory.ADJECTIVE,
  [PartOfSpeech.ADJ_T]: PartOfSpeechCategory.ADJECTIVE,
  [PartOfSpeech.ADJ_F]: PartOfSpeechCategory.ADJECTIVE,
  [PartOfSpeech.ADV]: PartOfSpeechCategory.ADVERB,
  [PartOfSpeech.ADV_TO]: PartOfSpeechCategory.ADVERB,
  [PartOfSpeech.AUX_V]: PartOfSpeechCategory.AUXILIARY,
  [PartOfSpeech.AUX_ADJ]: PartOfSpeechCategory.AUXILIARY,
  [PartOfSpeech.CONJ]: PartOfSpeechCategory.CONJUNCTION,
  [PartOfSpeech.COP]: PartOfSpeechCategory.COPULA,
  [PartOfSpeech.COP_DA]: PartOfSpeechCategory.COPULA,
  [PartOfSpeech.CTR]: PartOfSpeechCategory.COUNTER,
  [PartOfSpeech.EXP]: PartOfSpeechCategory.EXPRESSION,
  [PartOfSpeech.INT]: PartOfSpeechCategory.INTERJECTION,
  [PartOfSpeech.N]: PartOfSpeechCategory.NOUN,
  [PartOfSpeech.N_ADV]: PartOfSpeechCategory.NOUN,
  [PartOfSpeech.N_SUF]: PartOfSpeechCategory.NOUN,
  [PartOfSpeech.N_PREF]: PartOfSpeechCategory.NOUN,
  [PartOfSpeech.N_T]: PartOfSpeechCategory.NOUN,
  [PartOfSpeech.NUM]: PartOfSpeechCategory.NUMERIC,
  [PartOfSpeech.PN]: PartOfSpeechCategory.PRONOUN,
  [PartOfSpeech.PRT]: PartOfSpeechCategory.PARTICLE,
  [PartOfSpeech.PREF]: PartOfSpeechCategory.PREFIX_SUFFIX,
  [PartOfSpeech.SUF]: PartOfSpeechCategory.PREFIX_SUFFIX,
  [PartOfSpeech.V1]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V1_S]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5ARU]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5B]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5G]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5K]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5K_S]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5M]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5N]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5R]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5R_I]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5S]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5T]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5U]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5U_S]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.VK]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.VS]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.VS_I]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.VS_S]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.VT]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.VI]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.VZ]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.V5URU]: PartOfSpeechCategory.VERB,
  [PartOfSpeech.ON_MIM]: PartOfSpeechCategory.EXPRESSION,
  [PartOfSpeech.UNC]: PartOfSpeechCategory.OTHER,
  [PartOfSpeech.PUNCTUATION]: PartOfSpeechCategory.PUNCTUATION,
}

// Get POS category from a label string
export function getPOSCategory(pos: string): PartOfSpeechCategoryType {
  if (!pos) return PartOfSpeechCategory.OTHER

  for (const [posEnum, label] of Object.entries(PartOfSpeechLabels)) {
    if (label === pos) {
      return PartOfSpeechCategoryMap[posEnum as PartOfSpeechType]
    }
  }

  const posStr = pos.toLowerCase()
  if (posStr === 'unknown') return PartOfSpeechCategory.UNKNOWN
  if (posStr === 'punctuation') return PartOfSpeechCategory.PUNCTUATION
  if (posStr.includes('noun') || posStr.includes('n')) return PartOfSpeechCategory.NOUN
  if (posStr.includes('verb') || posStr.includes('v')) return PartOfSpeechCategory.VERB
  if (posStr.includes('adj')) return PartOfSpeechCategory.ADJECTIVE
  if (posStr.includes('adv')) return PartOfSpeechCategory.ADVERB
  if (posStr.includes('prt') || posStr.includes('particle')) return PartOfSpeechCategory.PARTICLE
  if (posStr.includes('pron')) return PartOfSpeechCategory.PRONOUN
  if (posStr.includes('conj')) return PartOfSpeechCategory.CONJUNCTION
  if (posStr.includes('cop')) return PartOfSpeechCategory.COPULA
  if (posStr.includes('int')) return PartOfSpeechCategory.INTERJECTION
  if (posStr.includes('aux')) return PartOfSpeechCategory.AUXILIARY

  return PartOfSpeechCategory.OTHER
}

// Convert ichiran tokens to grammar tokens for display
export function convertIchiranToGrammarTokens(ichiranTokens: IchiranToken[]): GrammarToken[] {
  return ichiranTokens.map((token) => {
    return convertIchiranWordInfoToGrammarToken(token.info)
  })
}

function convertIchiranWordInfoToGrammarToken(wordInfo: WordInfoWithGloss): GrammarToken {
  if (!wordInfo.score && wordInfo.alternative && wordInfo.alternative.length > 0) {
    return {
      ...convertIchiranWordInfoToGrammarToken({
        ...wordInfo.alternative[0]!,
        alternative: wordInfo.alternative.slice(1),
      })
    }
  }

  const word = wordInfo.text

  if (wordInfo.type === 'GAP') {
    return {
      word,
      reading: '',
      partOfSpeech: PartOfSpeechLabels[PartOfSpeech.PUNCTUATION],
      meanings: [],
      isConjugation: false,
      hasConjugationVia: false,
      isConjugationVia: false,
      isAlternative: false,
      isComponent: false,
      isSuffix: false,
      conjugations: [],
      alternatives: [],
      components: [],
    }
  }

  let reading = extractReading(wordInfo, wordInfo.text).replace(/\u000C/g, '')
  if (reading === word) {
    reading = ''
  }

  const meanings = extractMeanings(wordInfo)
  const components = extractComponents(wordInfo)
  const conjugations = extractConjugations(wordInfo)
  const alternatives = extractAlternatives(wordInfo)

  return {
    word,
    reading,
    meanings,
    partOfSpeech: extractPartOfSpeech(wordInfo) || '',
    isConjugation: false,
    hasConjugationVia: false,
    isConjugationVia: false,
    isAlternative: false,
    isComponent: false,
    isSuffix: wordInfo.suffix !== undefined,
    suffix: wordInfo.suffix,
    conjugations: conjugations || [],
    alternatives: alternatives || [],
    components: components || [],
  }
}

function extractReading(wordInfo: WordInfoWithGloss, originalWord: string): string {
  if (wordInfo.kana) {
    const kanaStr = Array.isArray(wordInfo.kana) ? wordInfo.kana[0] : wordInfo.kana
    if (kanaStr && kanaStr !== originalWord) {
      return kanaStr
    }
  }

  if (wordInfo.alternative && wordInfo.alternative.length > 0) {
    for (const alt of wordInfo.alternative) {
      if (alt.text === originalWord && alt.kana) {
        const altKana = Array.isArray(alt.kana) ? alt.kana[0] : alt.kana
        if (altKana && altKana !== originalWord) {
          return altKana
        }
      }
    }
  }

  if (wordInfo.type === 'KANA' || isKanaOnly(originalWord)) {
    return ''
  }

  if (wordInfo.conj && wordInfo.conj.length > 0) {
    const conjReading = wordInfo.conj[0].reading
    if (conjReading && conjReading !== originalWord) {
      return conjReading
    }
  }

  return ''
}

function isKanaOnly(text: string): boolean {
  return /^[\u3040-\u309F\u30A0-\u30FF]*$/.test(text)
}

function extractMeanings(wordInfo: WordInfoWithGloss): Array<{ text: string; partOfSpeech: string[]; info: string }> {
  const meanings: Array<{ text: string; partOfSpeech: string[]; info: string }> = []
  const seen = new Set<string>()

  if (wordInfo.gloss) {
    for (const glossItem of wordInfo.gloss) {
      if (glossItem.gloss && !seen.has(glossItem.gloss)) {
        meanings.push({
          text: glossItem.gloss,
          partOfSpeech: glossItem.pos ? parsePartOfSpeech(glossItem.pos) : [],
          info: glossItem.info || '',
        })
        seen.add(glossItem.gloss)
      }
    }
  }

  return meanings
}

function extractPartOfSpeechFromConjugation(conj: ConjugationInfo): string {
  if (conj.prop) {
    for (const propItem of conj.prop) {
      if (propItem.pos) {
        return parsePartOfSpeech(propItem.pos)[0] || ''
      }
    }
  }

  if (conj.gloss) {
    for (const glossItem of conj.gloss) {
      if (glossItem.pos) {
        return parsePartOfSpeech(glossItem.pos)[0] || ''
      }
    }
  }

  return ''
}

function extractPartOfSpeech(wordInfo: WordInfoWithGloss): string {
  if (wordInfo.gloss) {
    for (const glossItem of wordInfo.gloss) {
      if (glossItem.pos) {
        return parsePartOfSpeech(glossItem.pos)[0] || ''
      }
    }
  }

  if (wordInfo.conj) {
    for (const conj of wordInfo.conj) {
      const pos = extractPartOfSpeechFromConjugation(conj)
      if (pos) {
        return pos
      }
    }
  }

  if (wordInfo.alternative) {
    for (const alt of wordInfo.alternative) {
      if (alt.gloss) {
        for (const glossItem of alt.gloss) {
          if (glossItem.pos) {
            return parsePartOfSpeech(glossItem.pos)[0] || ''
          }
        }
      }
    }
  }

  if (wordInfo.components) {
    for (const component of wordInfo.components) {
      if (component.gloss) {
        for (const glossItem of component.gloss) {
          if (glossItem.pos) {
            return parsePartOfSpeech(glossItem.pos)[0] || ''
          }
        }
      }

      if (component.conj) {
        for (const conjItem of component.conj) {
          if (conjItem.prop) {
            for (const propItem of conjItem.prop) {
              if (propItem.pos) {
                return parsePartOfSpeech(propItem.pos)[0] || ''
              }
            }
          }
          if (conjItem.gloss) {
            for (const glossItem of conjItem.gloss) {
              if (glossItem.pos) {
                return parsePartOfSpeech(glossItem.pos)[0] || ''
              }
            }
          }
        }
      }
    }
  }

  return 'Unknown'
}

function parsePartOfSpeech(pos: string): string[] {
  const cleaned = pos.replace(/[\[\]]/g, '').trim()
  const tags = cleaned.split(',').map(tag => tag.trim()).filter(Boolean)
  const result: string[] = []

  for (const tag of tags) {
    if (Object.values(PartOfSpeech).includes(tag as PartOfSpeechType)) {
      result.push(PartOfSpeechLabels[tag as PartOfSpeechType])
    } else {
      result.push(tag)
    }
  }

  return result.length > 0 ? result : [cleaned]
}

function convertIchiranConjugationToGrammarToken(conj: ConjugationInfo): GrammarToken {
  let word = conj.reading || ''
  let reading = conj.reading || ''
  if (word.includes('【')) {
    const parts = word.split('【')
    word = parts[0].trim()
    if (parts[1]) {
      reading = parts[1].replace('】', '').trim()
      if (reading === word) {
        reading = ''
      }
    } else {
      reading = ''
    }
  }

  return {
    isConjugation: true,
    conjugationTypes: conj.prop?.map(prop => prop.type),
    hasConjugationVia: Boolean(conj.via?.length),
    isConjugationVia: false,
    isAlternative: false,
    isComponent: false,
    isSuffix: false,
    suffix: undefined,
    word,
    reading,
    partOfSpeech: extractPartOfSpeechFromConjugation(conj) || '',
    meanings: conj.gloss?.map(gloss => ({
      text: gloss.gloss,
      partOfSpeech: parsePartOfSpeech(gloss.pos),
      info: gloss.info || '',
    })) || [],
    conjugations: conj.via?.map(via => ({
      ...convertIchiranConjugationToGrammarToken(via),
      isConjugationVia: true,
    })) || [],
    alternatives: [],
    components: [],
  }
}

function extractConjugations(wordInfo: WordInfoWithGloss): GrammarToken[] | undefined {
  if (!wordInfo.conj || !wordInfo.conj.length) {
    return undefined
  }

  return wordInfo.conj.map(conj => ({
    ...convertIchiranConjugationToGrammarToken(conj),
    isConjugation: true,
  }))
}

function extractAlternatives(wordInfo: WordInfoWithGloss): GrammarToken[] | undefined {
  if (!wordInfo.alternative || !wordInfo.alternative.length) {
    return undefined
  }

  return wordInfo.alternative.map(alternative => ({
    ...convertIchiranWordInfoToGrammarToken(alternative),
    isAlternative: true,
  }))
}

function extractComponents(wordInfo: WordInfoWithGloss): GrammarToken[] | undefined {
  if (!wordInfo.compound || !wordInfo.components || wordInfo.compound.length === 0 || wordInfo.components.length === 0) {
    return undefined
  }

  return wordInfo.components.map(component => ({
    ...convertIchiranWordInfoToGrammarToken(component),
    isComponent: true,
  }))
}

