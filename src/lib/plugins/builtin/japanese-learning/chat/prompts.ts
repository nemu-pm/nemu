export type PromptLocale = 'en' | 'ja' | 'zh'
export type NemuResponseMode = 'app' | 'jlpt'

const GREETING_PROMPTS: Record<PromptLocale, string> = {
  en: 'Generate a brief, contextual greeting that references the current manga and invites questions.',
  ja: '今読んでいる漫画に触れつつ、短く自然な挨拶を作って、質問を促してください。',
  zh: '生成简短的情境问候，提及当前漫画并邀请提问。',
}

type ExplainKind = 'sentence' | 'word' | 'words'

const EXPLAIN_PROMPTS: Record<PromptLocale, Record<ExplainKind, string>> = {
  en: {
    sentence: 'Explain this sentence: 「{{text}}」',
    word: 'Explain this word: 「{{text}}」',
    words: 'Explain these words: 「{{text}}」',
  },
  ja: {
    sentence: 'この文を説明して: 「{{text}}」',
    word: 'この単語を説明して: 「{{text}}」',
    words: 'これらの単語を説明して: 「{{text}}」',
  },
  zh: {
    sentence: '请解释这句话：「{{text}}」',
    word: '请解释这个词：「{{text}}」',
    words: '请解释这些词：「{{text}}」',
  },
}

export function resolvePromptLocale(appLanguage: string): PromptLocale {
  if (appLanguage.startsWith('ja')) return 'ja'
  if (appLanguage.startsWith('zh')) return 'zh'
  return 'en'
}

export function getGreetingPrompt(appLanguage: string, responseMode?: NemuResponseMode): string {
  const locale = responseMode === 'jlpt' ? 'ja' : resolvePromptLocale(appLanguage)
  return GREETING_PROMPTS[locale] ?? GREETING_PROMPTS.en
}

function applyTemplate(template: string, text: string): string {
  return template.replace('{{text}}', text)
}

export function getExplainPrompt(
  appLanguage: string,
  responseMode: NemuResponseMode | undefined,
  kind: ExplainKind,
  text: string
): string {
  const locale = responseMode === 'jlpt' ? 'ja' : resolvePromptLocale(appLanguage)
  return applyTemplate(EXPLAIN_PROMPTS[locale][kind], text)
}

export function getExplainDisplayPrompt(appLanguage: string, kind: ExplainKind, text: string): string {
  const locale = resolvePromptLocale(appLanguage)
  return applyTemplate(EXPLAIN_PROMPTS[locale][kind], text)
}
