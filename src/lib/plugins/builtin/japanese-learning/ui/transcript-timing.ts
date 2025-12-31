import type { OcrTranscriptLine } from '../types'

const IGNORE_CHAR_REGEX = /[\s\p{P}\p{S}]/u

function normalizeChar(char: string): string {
  return char.normalize('NFKC').toLowerCase()
}

function isIgnorableChar(char: string): boolean {
  return IGNORE_CHAR_REGEX.test(char)
}

function buildAlignmentEntries(alignment: { characters: string[]; startTimes: number[]; endTimes: number[] }) {
  const entries: Array<{ char: string; start: number; end: number }> = []
  let inTag = false
  for (let i = 0; i < alignment.characters.length; i++) {
    const rawChar = alignment.characters[i] ?? ''
    if (rawChar === '[') {
      inTag = true
      continue
    }
    if (rawChar === ']') {
      inTag = false
      continue
    }
    if (inTag) continue
    const normalized = normalizeChar(rawChar)
    if (!normalized || isIgnorableChar(normalized)) continue
    entries.push({
      char: normalized,
      start: alignment.startTimes[i] ?? 0,
      end: alignment.endTimes[i] ?? alignment.startTimes[i] ?? 0,
    })
  }
  return entries
}

function extractLineChars(text: string): string[] {
  const chars: string[] = []
  for (const raw of Array.from(text)) {
    const normalized = normalizeChar(raw)
    if (!normalized || isIgnorableChar(normalized)) continue
    chars.push(normalized)
  }
  return chars
}

function findNextMatch(
  entries: Array<{ char: string }>,
  startIndex: number,
  target: string,
  lookahead: number
) {
  const limit = Math.min(entries.length, startIndex + lookahead)
  for (let i = startIndex; i < limit; i++) {
    if (entries[i]?.char === target) return i
  }
  return -1
}

export function buildLineTimings(
  lines: OcrTranscriptLine[],
  alignment: { characters: string[]; startTimes: number[]; endTimes: number[]; isFinal?: boolean }
) {
  const entries = buildAlignmentEntries(alignment)
  if (entries.length === 0) return lines.map(() => null)

  const lineChars = lines.map((line) => extractLineChars(line.text))
  const totalChars = lineChars.reduce((sum, chars) => sum + chars.length, 0)
  const duration = alignment.endTimes[alignment.endTimes.length - 1] ?? 0
  const isFinal = alignment.isFinal ?? true
  let cursor = 0

  const timings = lineChars.map((chars) => {
    if (chars.length === 0) return null
    let startIndex = -1
    let endIndex = -1
    let matched = 0
    const lookahead = Math.max(40, chars.length * 3)

    for (const char of chars) {
      const found = findNextMatch(entries, cursor, char, lookahead)
      if (found === -1) continue
      if (startIndex === -1) startIndex = found
      endIndex = found
      matched += 1
      cursor = found + 1
    }

    const matchRatio = matched / chars.length
    if (startIndex === -1 || endIndex === -1 || matchRatio < 0.35) {
      return null
    }
    return { start: entries[startIndex].start, end: entries[endIndex].end }
  })

  if (isFinal && totalChars > 0 && duration > 0) {
    let running = 0
    for (let i = 0; i < lineChars.length; i++) {
      const chars = lineChars[i]
      if (timings[i] || chars.length === 0) {
        running += chars.length
        continue
      }
      const start = (running / totalChars) * duration
      const end = ((running + chars.length) / totalChars) * duration
      timings[i] = { start, end }
      running += chars.length
    }
  }

  return timings
}
