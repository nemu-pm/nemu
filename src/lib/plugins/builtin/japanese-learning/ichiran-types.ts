// Ichiran Japanese tokenization types - from komi

export interface WordInfo {
  type?: 'KANJI' | 'KANA' | 'GAP'
  text: string
  'true-text'?: string
  kana: string | string[]
  seq?: number
  conjugations?: string | 'ROOT'
  score?: number
  components?: WordInfo[]
  primary?: boolean
  start?: number
  end?: number
  counter?: {
    value: string
    ordinal: boolean
  }
  skipped?: number
}

export interface GlossInfo {
  pos: string
  gloss: string
  field?: string
  info?: string
}

export interface ConjugationInfo {
  prop?: Array<{
    type: string
    pos: string
    form?: string
    neg?: boolean
  }>
  reading?: string
  gloss?: GlossInfo[]
  readok?: boolean
  via?: ConjugationInfo[]
}

export interface WordInfoWithGloss extends WordInfo {
  reading?: string
  gloss?: GlossInfo[]
  suffix?: string
  conj?: ConjugationInfo[]
  compound?: string[]
  alternative?: WordInfoWithGloss[]
  components?: WordInfoWithGloss[]
}

export type IchiranTokenTuple = [string, WordInfoWithGloss, any[]]

export interface IchiranSegmentation {
  0: Array<{
    0: IchiranTokenTuple[]
    1: number
  }>
  1?: string
}

export type IchiranRawResult = (IchiranSegmentation | string)[]

export interface IchiranToken {
  word: string
  romanized: string
  info: WordInfoWithGloss
  alternatives: any[]
}

export interface TokenizeResponse {
  success: boolean
  original: string
  romanized: string
  tokens: IchiranToken[]
  totalScore: number
  raw?: IchiranRawResult
  grammars?: Record<string, GrammarData>
}

// Grammar analysis types
export interface GrammarCapture {
  label: string
  start: number
  end: number
  tokens: any[]
}

export interface GrammarSegment {
  type: 'capture' | 'raw'
  text: string
  label?: string
}

export interface GrammarMatchedSentence {
  level: string
  description: string
  captures: GrammarCapture[]
  segments: GrammarSegment[]
}

export interface GrammarExample {
  jp: string
  en: string
}

export interface GrammarDetail {
  label: string
  formation: string
  description: string
  explanation: string
  examples: GrammarExample[]
}

export interface GrammarData {
  matchedSentences: GrammarMatchedSentence[]
  grammarDetail: GrammarDetail
}

export interface AnalyzeResponse {
  segments: IchiranRawResult
  grammars: Record<string, GrammarData>
}

// Grammar token - flattened representation for display
export interface GrammarToken {
  isConjugation: boolean
  conjugationTypes?: string[]
  hasConjugationVia: boolean
  isConjugationVia: boolean
  isAlternative: boolean
  isComponent: boolean
  isSuffix: boolean
  suffix?: string
  word: string
  reading: string
  partOfSpeech: string
  meanings: Array<{ text: string; partOfSpeech: string[]; info: string }>
  conjugations: GrammarToken[]
  alternatives: GrammarToken[]
  components: GrammarToken[]
}

