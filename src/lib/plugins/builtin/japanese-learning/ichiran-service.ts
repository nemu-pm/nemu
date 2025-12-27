// Ichiran service - API calls to ichiran.komi.to

import type {
  IchiranToken,
  TokenizeResponse,
  IchiranTokenTuple,
  SegmentResponse,
  Segment,
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

interface Entity {
  start: number
  end: number
  boost: number
}

function buildEntities(text: string, properNouns: string[]): Entity[] {
  const entities: Entity[] = []
  for (const noun of properNouns) {
    if (!noun) continue
    let startIndex = 0
    // Find all occurrences of this proper noun in the text
    while ((startIndex = text.indexOf(noun, startIndex)) !== -1) {
      entities.push({
        start: startIndex,
        end: startIndex + noun.length,
        boost: 1000
      })
      startIndex += noun.length
    }
  }
  return entities
}

export async function tokenize(text: string, limit = 5, signal?: AbortSignal, properNouns: string[] = []): Promise<TokenizeResponse> {
  const entities = buildEntities(text, properNouns)
  const requestBody = { text, limit, ...(entities.length > 0 && { entities }) }
  const url = `${API_BASE_URL}/api/segment`
  console.log('[ichiran] POST', url, JSON.stringify(requestBody, null, 2))
  const segmentResponse = await fetchJSON<SegmentResponse>(
    url,
    {
      method: 'POST',
      body: JSON.stringify(requestBody),
      signal,
    }
  )

  // Parse segments - strings are punctuation, arrays are alternatives (use best)
  const tokens = parseTokens(segmentResponse.segments)
  const totalScore = segmentResponse.segments.reduce((sum, seg) => {
    if (typeof seg === 'string') return sum
    return sum + (seg[0]?.[1] ?? 0)
  }, 0)

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
    totalScore,
  }
}

function parseTokens(segments: Segment[]): IchiranToken[] {
  const tokens: IchiranToken[] = []

  for (const segment of segments) {
    // String segments are punctuation/non-Japanese text
    if (typeof segment === 'string') {
      tokens.push({
        word: segment,
        romanized: segment,
        info: { text: segment, kana: segment, type: 'GAP' },
        alternatives: [],
      })
      continue
    }

    // Array segments are alternatives - use the first (best) one
    const bestAlternative = segment[0]
    if (!bestAlternative) continue
    const [tokenTuples] = bestAlternative // [tokens, score]
    
    for (const tuple of tokenTuples) {
      if (Array.isArray(tuple) && tuple.length >= 2) {
        tokens.push(convertTupleToToken(tuple as IchiranTokenTuple))
      } else if (typeof tuple === 'string') {
        // Fallback for any strings within token tuples
        tokens.push({
          word: tuple,
          romanized: tuple,
          info: { text: tuple, kana: tuple, type: 'GAP' },
          alternatives: [],
        })
      }
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
