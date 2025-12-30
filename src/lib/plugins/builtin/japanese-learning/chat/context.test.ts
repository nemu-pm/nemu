import { describe, it, expect } from 'bun:test'
import { buildHiddenContext, formatTranscript } from './context'

describe('nemu chat context helpers', () => {
  it('formats transcript lines by order and filters blanks', () => {
    const result = formatTranscript([
      { order: 2, text: '  third ', x1: 0, y1: 0, x2: 0, y2: 0, class: 0, label: 'ja', confidence: 0.9 },
      { order: 1, text: ' second', x1: 0, y1: 0, x2: 0, y2: 0, class: 0, label: 'ja', confidence: 0.9 },
      { order: 0, text: 'first', x1: 0, y1: 0, x2: 0, y2: 0, class: 0, label: 'ja', confidence: 0.9 },
      { order: 3, text: '   ', x1: 0, y1: 0, x2: 0, y2: 0, class: 0, label: 'ja', confidence: 0.9 },
    ])

    expect(result).toBe('first\nsecond\nthird')
  })

  it('formats transcript string lists', () => {
    const result = formatTranscript([' one ', '', 'two'])
    expect(result).toBe('one\ntwo')
  })

  it('builds hidden context from provided fields', () => {
    const ctx = buildHiddenContext({
      mangaTitle: 'Test Manga',
      mangaGenres: ['Drama'],
      chapterTitle: 'Finale',
      chapterNumber: 12,
      volumeNumber: 3,
      currentPage: 5,
      pageCount: 20,
      pageTranscript: 'Line 1',
      ichiranAnalysis: 'Analysis',
      responseMode: 'app',
    })

    expect(ctx).toEqual({
      mangaTitle: 'Test Manga',
      mangaGenres: ['Drama'],
      chapterTitle: 'Finale',
      chapterNumber: 12,
      volumeNumber: 3,
      currentPage: 5,
      pageCount: 20,
      pageTranscript: 'Line 1',
      ichiranAnalysis: 'Analysis',
      responseMode: 'app',
    })
  })
})
