// Ichiran service - API calls to ichiran.komi.to

import type {
  IchiranRawResult,
  IchiranToken,
  TokenizeResponse,
  IchiranTokenTuple,
  WordInfoWithGloss,
  AnalyzeResponse,
  GrammarData,
} from './ichiran-types'

const API_BASE_URL = 'https://ichiran.komi.to'

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Ichiran API error (${response.status}): ${errorText}`)
  }

  return response.json() as Promise<T>
}

export async function tokenize(text: string, limit = 5, signal?: AbortSignal): Promise<TokenizeResponse> {
  const analyzeResponse = await fetchJSON<AnalyzeResponse>(
    `${API_BASE_URL}/api/analyze`,
    {
      method: 'POST',
      body: JSON.stringify({ text, limit }),
      signal,
    }
  )

  const tokens = parseTokens(analyzeResponse.segments)

  let romanized = ''
  try {
    const romanizedResponse = await fetchJSON<{ romanized: string }>(
      `${API_BASE_URL}/api/romanize`,
      {
        method: 'POST',
        body: JSON.stringify({ text }),
        signal,
      }
    )
    romanized = romanizedResponse.romanized
  } catch {
    // Romanization is optional, continue without it
  }

  return {
    success: true,
    original: text,
    romanized,
    tokens,
    totalScore: calculateTotalScore(analyzeResponse.segments),
    raw: analyzeResponse.segments,
    grammars: analyzeResponse.grammars,
  }
}

function parseTokens(rawResult: IchiranRawResult): IchiranToken[] {
  const tokens: IchiranToken[] = []

  for (const outerSegmentation of rawResult) {
    if (Array.isArray(outerSegmentation)) {
      for (const segmentation of outerSegmentation) {
        if (!Array.isArray(segmentation)) continue
        const tupleContainer = segmentation[0]
        if (!Array.isArray(tupleContainer)) continue

        for (const tuple of tupleContainer) {
          if (Array.isArray(tuple) && tuple.length >= 2) {
            tokens.push(convertTupleToToken(tuple as IchiranTokenTuple))
          }
        }
      }
    } else if (typeof outerSegmentation === 'string' && outerSegmentation.trim()) {
      tokens.push({
        word: outerSegmentation,
        romanized: outerSegmentation,
        info: {
          text: outerSegmentation,
          kana: outerSegmentation,
          type: 'GAP',
        } as WordInfoWithGloss,
        alternatives: [],
      })
    }
  }

  return tokens
}

function convertTupleToToken(tuple: IchiranTokenTuple): IchiranToken {
  const [romanized, info, alternatives] = tuple
  let word = info.text

  if (!word && info.alternative && info.alternative.length > 0) {
    word = info.alternative[0].text
  }

  return {
    word,
    romanized: romanized || word,
    info,
    alternatives: Array.isArray(alternatives) ? alternatives : [],
  }
}

function calculateTotalScore(rawResult: IchiranRawResult): number {
  let total = 0

  for (const outerSegmentation of rawResult) {
    if (!Array.isArray(outerSegmentation)) continue

    for (const segmentation of outerSegmentation) {
      if (!Array.isArray(segmentation)) continue
      const tokensWithScore = segmentation[0]
      if (Array.isArray(tokensWithScore) && tokensWithScore.length >= 2) {
        const score = tokensWithScore[1]
        if (typeof score === 'number') {
          total += score
        }
      }
    }
  }

  return total
}

