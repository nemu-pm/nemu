/**
 * Nemu Chat Context Helpers
 */

import type { ReaderPluginContext } from '../../../types'
import type { OcrTranscriptLine } from '../types'
import type { HiddenContext } from './types'
import { useTextDetectorStore } from '../store'
import { getOcrPageRef } from '../page-ref'

export interface BuildHiddenContextOptions {
  pageIndex?: number
  pageTranscript?: string
  ichiranAnalysis?: string
  responseMode?: 'app' | 'jlpt'
}

export interface BuildHiddenContextInput {
  mangaTitle: string
  mangaGenres?: string[]
  chapterTitle?: string
  chapterNumber?: number
  volumeNumber?: number
  currentPage: number
  pageCount?: number
  pageTranscript?: string
  ichiranAnalysis?: string
  responseMode?: 'app' | 'jlpt'
}

export function formatTranscript(lines?: OcrTranscriptLine[] | string[]): string | undefined {
  if (!lines || lines.length === 0) return undefined
  if (typeof lines[0] === 'string') {
    const cleaned = (lines as string[]).map((line) => line.trim()).filter(Boolean)
    return cleaned.length ? cleaned.join('\n') : undefined
  }

  const sorted = [...(lines as OcrTranscriptLine[])].sort((a, b) => a.order - b.order)
  const text = sorted.map((line) => line.text?.trim()).filter(Boolean)
  return text.length ? text.join('\n') : undefined
}

export function buildHiddenContext(input: BuildHiddenContextInput): HiddenContext {
  return {
    mangaTitle: input.mangaTitle,
    mangaGenres: input.mangaGenres,
    chapterTitle: input.chapterTitle,
    chapterNumber: input.chapterNumber,
    volumeNumber: input.volumeNumber,
    currentPage: input.currentPage,
    pageCount: input.pageCount,
    pageTranscript: input.pageTranscript,
    ichiranAnalysis: input.ichiranAnalysis,
    responseMode: input.responseMode,
  }
}

export function buildHiddenContextFromReader(
  ctx: ReaderPluginContext,
  options: BuildHiddenContextOptions = {}
): HiddenContext {
  const pageIndex = options.pageIndex ?? ctx.currentPageIndex
  const pageRef = getOcrPageRef(ctx, pageIndex)
  const currentPage = (pageRef?.localIndex ?? pageIndex) + 1

  const transcripts = useTextDetectorStore.getState().transcripts
  const transcriptLines = pageRef ? transcripts.get(pageRef.pageKey) : undefined
  const pageTranscript = options.pageTranscript ?? formatTranscript(transcriptLines)
  const responseMode =
    options.responseMode ?? useTextDetectorStore.getState().settings.nemuResponseMode

  return buildHiddenContext({
    mangaTitle: ctx.mangaTitle ?? ctx.mangaId,
    mangaGenres: ctx.mangaGenres,
    chapterTitle: ctx.chapterTitle,
    chapterNumber: ctx.chapterNumber,
    volumeNumber: ctx.volumeNumber,
    currentPage,
    pageCount: ctx.currentChapterPageCount,
    pageTranscript,
    ichiranAnalysis: options.ichiranAnalysis,
    responseMode,
  })
}
